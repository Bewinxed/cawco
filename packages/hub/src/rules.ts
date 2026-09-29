import type {
  Envelope,
  NeutralMessage,
  Rule,
  RuleTiming,
  SendPayload,
} from "@whiffle/core";
import { RULE_FIRE_CEILING, ruleMarker, ruleMatches } from "@whiffle/core";
import type { DbShape } from "./db";
import type { MeaningJudge } from "./meaning";

/**
 * The rule engine.
 *
 * Every frame a session produces already passes through the hub on its way to
 * the dashboards, so this is the one place that can read what a session said
 * and answer it — without a hook in any harness's settings, and without the
 * model's cooperation.
 *
 * Three things happen here, in order of how hot the path is:
 *
 * 1. `stream_event` deltas, which arrive many times a second. Only `immediate`
 *    rules read them, and the engine early-outs before touching the buffer when
 *    no such rule exists — which is the normal case.
 * 2. Complete `assistant` frames, once per message. `message` rules read them.
 * 3. `result` frames, once per turn. `turn` rules read the whole turn's text,
 *    and this is the timing that matters most: the session is idle, so the
 *    reply wakes it into a new turn and it keeps working.
 *
 * The state machine lives in `rule_state`. The session gets the rule's reply
 * as the operator wrote it and acknowledges it by answering, like any other
 * message. A `repeat` rule goes `pending` when it fires and re-arms at the end
 * of the first later turn that does not match it again; every turn that does
 * match fires it again and counts toward {@link RULE_FIRE_CEILING}, past which
 * the engine goes quiet for that session rather than talking to a model that is
 * plainly not listening. A rule without `repeat` fires once per session.
 */

/** What the engine needs from the socket registry to reach a machine. */
export interface RuleSender {
  send: (envelope: Envelope<SendPayload>) => void;
}

export interface RuleEngineDeps {
  /** The live agent socket for a machine, or nothing when it is offline. */
  agent: (machineId: string) => RuleSender | undefined;
  db: DbShape;
  /** Answers meaning rules; shared with the supervisor so a turn is asked about once. */
  meaning: MeaningJudge;
}

/** What one session is in the middle of saying, kept only while it says it. */
interface Buffer {
  /** Rules already fired against the message being streamed, so a delta storm fires once. */
  firedThisMessage: Set<string>;
  /**
   * Rules that matched during the turn in flight, including one whose answer
   * (a meaning rule's) landed after the previous turn ended. A pending rule
   * missing from it when the turn ends has been answered and re-arms.
   */
  firedThisTurn: Set<string>;
  /** The current message's text so far, for `immediate` rules. */
  streaming: string;
  /** Every assistant text this turn, for `turn` rules. */
  turn: string[];
}

/** The instance facts a scope is tested against, cached off the hot path. */
interface Facts {
  harness: string | null;
  machineId: string;
  model: string | null;
  projectId: string | null;
}

/**
 * Where a streaming buffer's thinking begins. NUL-fenced so no model text can
 * forge it, and written as an escape so the source stays text to git.
 */
const THINKING_MARK = "\u0000thinking\u0000";

const empty = (): Buffer => ({
  streaming: "",
  turn: [],
  firedThisMessage: new Set(),
  firedThisTurn: new Set(),
});

/** The text blocks of an assistant message, joined. Tool calls are not speech. */
const spoken = (message: NeutralMessage & { type: "assistant" }): string =>
  message.message.content
    .filter(
      (block): block is { type: "text"; text: string } => block.type === "text"
    )
    .map((block) => block.text)
    .join("");

/** And its reasoning, which `watch: thinking` reads instead. */
const thought = (message: NeutralMessage & { type: "assistant" }): string =>
  message.message.content
    .filter(
      (block): block is { type: "thinking"; thinking: string } =>
        block.type === "thinking"
    )
    .map((block) => block.thinking)
    .join("");

export class RuleEngine {
  readonly #db: DbShape;
  readonly #agent: (machineId: string) => RuleSender | undefined;
  /** The enabled rules, reloaded whenever one is written. */
  #rules: Rule[] = [];
  #byTiming: Record<RuleTiming, Rule[]> = {
    turn: [],
    message: [],
    immediate: [],
  };
  /** Meaning rules by timing — asked of Jev, never matched as text here. */
  #meaningByTiming: Record<"turn" | "message", Rule[]> = {
    turn: [],
    message: [],
  };
  readonly #buffers = new Map<string, Buffer>();
  readonly #facts = new Map<string, Facts>();
  readonly #meaning: MeaningJudge;

  constructor({ db, agent, meaning }: RuleEngineDeps) {
    this.#db = db;
    this.#agent = agent;
    this.#meaning = meaning;
    this.reload();
  }

  /** Called after any rule is written or deleted. Cheap; the table is small. */
  reload(): void {
    // LLM rules are the supervisor engine's concern — this engine only fires replies.
    this.#rules = this.#db
      .listRules()
      .filter((rule) => rule.enabled && rule.action === "reply");
    const textual = this.#rules.filter((rule) => rule.matchKind !== "meaning");
    const meaning = this.#rules.filter((rule) => rule.matchKind === "meaning");
    this.#byTiming = {
      turn: textual.filter((rule) => rule.timing === "turn"),
      message: textual.filter((rule) => rule.timing === "message"),
      immediate: textual.filter((rule) => rule.timing === "immediate"),
    };
    this.#meaningByTiming = {
      turn: meaning.filter((rule) => rule.timing === "turn"),
      message: meaning.filter((rule) => rule.timing === "message"),
    };
  }

  /**
   * Drops the cached instance facts. The server calls this whenever it
   * republishes instances, which is every time one of those fields can have
   * moved — a session's model is changed from the dashboard mid-run.
   */
  forgetFacts(): void {
    this.#facts.clear();
  }

  /** A session is over: nothing left to buffer for it. */
  forget(instanceId: string): void {
    this.#buffers.delete(instanceId);
    this.#facts.delete(instanceId);
  }

  /**
   * One frame. Returns nothing and throws nothing — a rule that cannot fire
   * must never cost the frame its trip to the dashboards.
   */
  observe(instanceId: string, message: NeutralMessage): void {
    try {
      this.#observe(instanceId, message);
    } catch (error) {
      console.error(
        `[rules] ${instanceId}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches all three message shapes (stream_event, assistant, result) rule-observation handles; splitting it would scatter one state machine across several methods.
  #observe(instanceId: string, message: NeutralMessage): void {
    if (message.type === "result") {
      this.#endTurn(instanceId, message);
      return;
    }
    if (this.#rules.length === 0) {
      return;
    }

    if (message.type === "stream_event") {
      // The early-out that keeps this affordable: with no immediate rule
      // configured, a delta costs one property read and returns.
      if (this.#byTiming.immediate.length === 0) {
        return;
      }
      const { event } = message;
      if (event.type === "content_block_delta") {
        const buffer = this.#buffer(instanceId);
        const { delta } = event;
        buffer.streaming +=
          delta.type === "text_delta"
            ? delta.text
            : `${THINKING_MARK}${delta.thinking}`;
        this.#fireImmediate(instanceId, buffer);
      } else if (event.type === "message_stop") {
        const buffer = this.#buffer(instanceId);
        buffer.streaming = "";
        buffer.firedThisMessage.clear();
      }
      return;
    }

    if (message.type === "assistant") {
      // A subagent's own message is its parent's tool call, not the session
      // speaking. Rules watch what the session says to the user.
      if (message.parent_tool_use_id) {
        return;
      }
      const buffer = this.#buffer(instanceId);
      buffer.streaming = "";
      buffer.firedThisMessage.clear();
      const said = spoken(message);
      const thinking = thought(message);
      if (said) {
        buffer.turn.push(said);
      }
      for (const rule of this.#byTiming.message) {
        const text = this.#withoutOwnWords(
          rule,
          this.#readable(rule, said, thinking)
        );
        if (text && ruleMatches(rule, text)) {
          this.#fire(rule, instanceId);
        }
      }
      const facts = this.#factsFor(instanceId);
      if (this.#meaningByTiming.message.length > 0 && facts) {
        this.#fireMeaning(
          instanceId,
          this.#meaningByTiming.message,
          this.#meaning.message(
            instanceId,
            facts,
            this.#meaningByTiming.message,
            said,
            thinking
          )
        );
      }
    }
  }

  /**
   * A turn ended: fire the `turn` rules on what it said, then re-arm every
   * rule pending on this session that the turn did not match again — the
   * session has had its turn to answer, and answered.
   */
  #endTurn(
    instanceId: string,
    message: NeutralMessage & { type: "result" }
  ): void {
    const buffer = this.#buffer(instanceId);
    const text = buffer.turn.join("\n\n");
    buffer.turn = [];
    buffer.streaming = "";
    buffer.firedThisMessage.clear();
    // An aborted turn produced no answer to hold anyone to.
    if (message.subtype !== "aborted" && text) {
      this.#fireTurn(instanceId, message, text);
    }
    this.#db.rearmRules(instanceId, [...buffer.firedThisTurn]);
    buffer.firedThisTurn = new Set();
  }

  #fireTurn(
    instanceId: string,
    message: NeutralMessage & { type: "result" },
    text: string
  ): void {
    for (const rule of this.#byTiming.turn) {
      // `turn` rules read the turn's speech; thinking does not survive to here
      // as a separate stream, so a thinking-only rule is left to the other two
      // timings, which see it block by block.
      if (rule.watch === "thinking") {
        continue;
      }
      if (ruleMatches(rule, this.#withoutOwnWords(rule, text))) {
        this.#fire(rule, instanceId);
      }
    }
    const facts = this.#factsFor(instanceId);
    if (this.#meaningByTiming.turn.length > 0 && facts) {
      this.#fireMeaning(
        instanceId,
        this.#meaningByTiming.turn,
        this.#meaning.turn(message, instanceId, facts, text)
      );
    }
  }

  /**
   * Fires each of `rules` Jev answered yes to, through the same {@link #fire}
   * a phrase match takes. Off the frame path: the answer arrives later.
   */
  #fireMeaning(
    instanceId: string,
    rules: Rule[],
    answer: Promise<Set<string>>
  ): void {
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the frame handler has nowhere to route this promise
    void answer
      .then((yes) => {
        for (const rule of rules) {
          if (yes.has(rule.id)) {
            this.#fire(rule, instanceId);
          }
        }
      })
      .catch((error) => {
        console.error(
          `[rules] ${instanceId}: ${error instanceof Error ? error.message : error}`
        );
      });
  }

  /** Which of the two texts a rule is allowed to read, joined when it reads both. */
  #readable(rule: Rule, said: string, thinking: string): string {
    if (rule.watch === "text") {
      return said;
    }
    if (rule.watch === "thinking") {
      return thinking;
    }
    return said && thinking ? `${said}\n${thinking}` : said || thinking;
  }

  /**
   * The session quoting whiffle's own words back is not the session tripping
   * the rule.
   *
   * This closes a real loop: a rule's reply necessarily contains the phrase
   * that fired it, models routinely echo an instruction while answering it, and
   * that echo would fire the rule again — every time, all the way to the
   * ceiling, with the session being punished for reading its mail. Only this
   * rule's own header and reply are removed, so a session that genuinely trips
   * the phrase in its own sentence still fires.
   */
  #withoutOwnWords(rule: Rule, text: string): string {
    let cleaned = text;
    const header = `[whiffle rule — ${rule.name}]`;
    if (cleaned.includes(header)) {
      cleaned = cleaned.split(header).join(" ");
    }
    const reply = rule.reply.trim();
    if (reply && cleaned.includes(reply)) {
      cleaned = cleaned.split(reply).join(" ");
    }
    return cleaned;
  }

  #buffer(instanceId: string): Buffer {
    const found = this.#buffers.get(instanceId);
    if (found) {
      return found;
    }
    const made = empty();
    this.#buffers.set(instanceId, made);
    return made;
  }

  #fireImmediate(instanceId: string, buffer: Buffer): void {
    for (const rule of this.#byTiming.immediate) {
      if (buffer.firedThisMessage.has(rule.id)) {
        continue;
      }
      // The marker keeps thinking deltas out of a `watch: text` rule's reach
      // without a second buffer; a rule that reads both sees the raw stream.
      const text =
        rule.watch === "both"
          ? buffer.streaming
          : // biome-ignore lint/style/noNestedTernary: three mutually exclusive branches for watch === "both" | "text" | "thinking"; splitting them would obscure that they slice the same buffer.
            rule.watch === "text"
            ? (buffer.streaming.split(THINKING_MARK)[0] ?? "")
            : // biome-ignore lint/style/noNestedTernary: the "thinking" slice is itself picked out of the marked buffer only when present; not worth a second branch.
              buffer.streaming.includes(THINKING_MARK)
              ? buffer.streaming.slice(buffer.streaming.indexOf(THINKING_MARK))
              : "";
      if (!(text && ruleMatches(rule, this.#withoutOwnWords(rule, text)))) {
        continue;
      }
      buffer.firedThisMessage.add(rule.id);
      this.#fire(rule, instanceId);
    }
  }

  /** The instance's machine, project, harness and model — read once, then cached. */
  #factsFor(instanceId: string): Facts | undefined {
    const cached = this.#facts.get(instanceId);
    if (cached) {
      return cached;
    }
    const row = this.#db
      .listInstances()
      .find((candidate) => candidate.id === instanceId);
    if (!row) {
      return undefined;
    }
    const facts: Facts = {
      machineId: row.machineId,
      projectId: row.projectId ?? null,
      harness: row.harness ?? null,
      model: row.model ?? null,
    };
    this.#facts.set(instanceId, facts);
    return facts;
  }

  #inScope(rule: Rule, facts: Facts): boolean {
    const { scope } = rule;
    if (scope.machineId && scope.machineId !== facts.machineId) {
      return false;
    }
    if (scope.projectId && scope.projectId !== facts.projectId) {
      return false;
    }
    if (scope.harness && scope.harness !== facts.harness) {
      return false;
    }
    // Substring, so `opus` covers every dated build of it and the user does
    // not have to keep the filter in step with model releases.
    if (
      scope.model &&
      !facts.model?.toLowerCase().includes(scope.model.toLowerCase())
    ) {
      return false;
    }
    return true;
  }

  #fire(rule: Rule, instanceId: string): void {
    const facts = this.#factsFor(instanceId);
    if (!(facts && this.#inScope(rule, facts))) {
      return;
    }

    // A match keeps the rule pending through this turn's end, even when the
    // ceiling below keeps it from firing again.
    this.#buffer(instanceId).firedThisTurn.add(rule.id);
    const standing = this.#db.ruleStateFor(rule.id, instanceId);
    // Without `repeat`, the rule gets one shot per session.
    if (!rule.repeat && standing && standing.totalFires > 0) {
      return;
    }
    if (standing && standing.fireCount >= RULE_FIRE_CEILING) {
      return;
    }

    this.#db.noteRuleFire(rule.id, instanceId, rule.repeat);
    const sender = this.#agent(facts.machineId);
    if (!sender) {
      return;
    }

    sender.send({
      verb: "send",
      machineId: facts.machineId,
      instanceId,
      payload: {
        instanceId,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: {
            role: "user",
            content: `${ruleMarker(rule.name)}${rule.reply}`,
          },
          parent_tool_use_id: null,
          // `system` marks it as whiffle's own word rather than the user's, so a
          // transcript can render it as the standing instruction it is.
          origin: { kind: "system", name: `rule:${rule.name}` },
          // A `turn` rule fires into an idle session and must wake it. The other
          // two fire into a live turn, where a queued append is read at the next
          // boundary without cutting anything off.
          shouldQuery: rule.timing === "turn",
        },
        urgent: rule.timing === "immediate" && rule.interrupt,
      },
    });
  }
}
