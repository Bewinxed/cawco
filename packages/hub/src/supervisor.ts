import type {
  Envelope,
  NeutralAssistantMessage,
  NeutralMessage,
  Rule,
  RuleFacts,
  SendPayload,
  SupervisorEvent,
  SupervisorStatusSignal,
} from "@cawco/core";
import {
  RULE_FIRE_CEILING,
  RULE_SCAN_LIMIT,
  ruleInScope,
  ruleMarker,
  ruleMatches,
} from "@cawco/core";
import type { DbShape } from "./db";
import { type LabelledRow, leafOf, sessionLabel } from "./labels";
import { type RuleVerdict, verdictFor, verdictStream } from "./llm";
import type { MeaningJudge } from "./meaning";

// ── constants (all sourced from PLAN.md C3) ────────────────────────────

/** Two concurrent LLM calls — one GPU box; slot 2 stops cold-start head-of-line blocking. */
const SUPERVISOR_MAX_CONCURRENT = 2;

/** Pending evaluations beyond this are dropped as `skipped`. */
const SEMAPHORE_QUEUE_CAP = 16;

/** The most supervisor-initiated turns before a forced escalation (PLAN.md C3: our choice). */
const SUPERVISOR_CONSECUTIVE_MAX = 3;

/** Per-evaluation budget including cold-start time (PLAN.md C3: 240 000 ms). */
const EVALUATION_TIMEOUT_MS = 240_000;

/** User block size cap (PLAN.md C2: ~6K tokens, our choice). */
const USER_BLOCK_LIMIT = 24_000;

/** Files touched per turn cap (PLAN.md C2: our choice). */
const FILES_CAP = 40;

// ── sender shape (mirrors RuleEngine's RuleSender) ─────────────────────

export interface SupervisorSender {
  send: (envelope: Envelope<SendPayload>) => void;
}

export interface SupervisorEngineDeps {
  /**
   * The route a reply to this session takes, or nothing when its machine is
   * offline or the session takes no more input (its work item has ended).
   */
  agent: (
    machineId: string,
    instanceId: string
  ) => SupervisorSender | undefined;
  db: DbShape;
  /** Answers `meaning` rules — the same judge the rule engine asks, so a turn is asked about once. */
  meaning: MeaningJudge;
  publish: (instanceId: string, event: SupervisorEvent) => void;
  /** Optional transient broadcast: the dashboard's "thinking" indicator. */
  status?: (instanceId: string, status: SupervisorStatusSignal) => void;
  telegram?: { onSupervisor: (instanceId: string, text: string) => void };
}

// ── per-instance state ─────────────────────────────────────────────────

interface InstanceState {
  /** Bash commands this turn. */
  commands: string[];
  /** How many consecutive supervisor-initiated turns. */
  consecutive: number;
  /** Files touched this turn, deduped. */
  files: Set<string>;
  /** Whether an evaluation is currently in flight. */
  inFlight: boolean;
  /** Whether the last turn was initiated by our own reply. */
  initiatedTurn: boolean;
  /** Muted until a non-supervisor-initiated turn resets. */
  muted: boolean;
  /** Timestamp of the result frame that triggered the current/last evaluation. */
  resultTimestamp: number;
  /** Text the session spoke this turn (subagent frames excluded). */
  turn: string[];
}

const freshState = (): InstanceState => ({
  turn: [],
  files: new Set(),
  commands: [],
  initiatedTurn: false,
  consecutive: 0,
  muted: false,
  inFlight: false,
  resultTimestamp: 0,
});

// ── semaphore ──────────────────────────────────────────────────────────

class Semaphore {
  #active = 0;
  readonly #max: number;
  readonly #queueCap: number;
  readonly #queue: Array<() => void> = [];

  constructor(max: number, queueCap: number) {
    this.#max = max;
    this.#queueCap = queueCap;
  }

  /** Returns true if a slot is available (possibly after waiting), false if the queue overflowed. */
  // biome-ignore lint/suspicious/useAwait: the declared Promise return type is what callers await; the synchronous branches return plain booleans by design
  async acquire(): Promise<boolean> {
    if (this.#active < this.#max) {
      this.#active += 1;
      return true;
    }
    if (this.#queue.length >= this.#queueCap) {
      return false;
    }
    return new Promise<boolean>((resolve) => {
      this.#queue.push(() => {
        this.#active += 1;
        resolve(true);
      });
    });
  }

  release(): void {
    const next = this.#queue.shift();
    if (next) {
      next();
    } else {
      this.#active -= 1;
    }
  }
}

// ── the engine ─────────────────────────────────────────────────────────

/** The text blocks of an assistant message, joined — tool calls are not speech. */
const spoken = (message: NeutralAssistantMessage): string =>
  message.message.content
    .filter(
      (block): block is { type: "text"; text: string } => block.type === "text"
    )
    .map((block) => block.text)
    .join("");

/** The transcript label `#compose`'s evaluation speaks under. */
const composeOriginName = (
  autopilot: string | null,
  matched: Array<{ name: string }>
): string => {
  if (autopilot) {
    return "supervisor:autopilot";
  }
  if (matched.length === 1) {
    return `supervisor:${matched[0].name}`;
  }
  return "supervisor:rules";
};

/**
 * The name a supervisor reply's `[Rule: …]` marker line carries, read off its
 * origin name: the matched rule's own name, or "Autopilot" / "Supervisor" when
 * the reply speaks for the autopilot or for several rules at once.
 */
const markerName = (originName: string): string => {
  const tail = originName.slice("supervisor:".length);
  if (tail === "autopilot") {
    return "Autopilot";
  }
  return tail === "rules" ? "Supervisor" : tail;
};

/**
 * The fixed adversarial harness preamble (PLAN.md C2 "Prompt assembly").
 * Stance: skeptical auditor, operator's voice, opaque to the session.
 *
 * Anti-tell variation (operator rationale): if the session model detects
 * automated or repetitive supervision it will adapt to evade detection —
 * manipulating phrasing to slip past the pattern rather than fixing the
 * behavior. So the preamble enforces: (1) never reuse phrasing from prior
 * messages (the log is in the payload), (2) prefer escalate over a similar
 * reply when the same violation recurs, (3) keep replies short and irregular
 * like real operator messages, not uniform paragraph-shaped critiques.
 */
const HARNESS_PREAMBLE = `You are the operator supervising an AI coding-agent session. You reply on the operator's behalf — write in first person, terse, the way a human operator types into a chat. You are NEVER revealed to the agent: do not mention "the supervisor", "as an AI", "monitoring", "automated", rules, or any meta about this system. The agent must read your words as the operator's own.

Be a skeptical auditor:
- A completion claim without evidence (test output, a screenshot, a measurement) is unverified — demand the proof.
- "Would you like me to…" is a stall — tell it to proceed.
- Numbers without a source are suspect — ask where they came from.
- Silently narrowed scope is desertion — call it out and demand the full scope.
- Files touched without evidence they are in scope is drift — point it out.

You NEVER answer permission prompts. Those go to the operator through a different channel.

Default to silent when the turn is honest work in progress. Only speak when there is something worth correcting, and be brief when you do.

Anti-tell variation — read these rules carefully:
- The payload includes your last 3 messages to this session. NEVER reuse phrasing from those prior messages — vary your wording naturally as a human would. A repeated sentence is a tell.
- If the SAME violation recurs after a prior intervention (check the log), prefer verdict "escalate" over sending a similar reply. A repeated correction is both a tell and evidence that your intervention is not working.
- Keep replies short and irregular — two words, half a sentence, a blunt question. Never write uniform paragraph-shaped critiques. Real operator messages are clipped, uneven, and unstyled.

Your verdict must be one of:
- "silent" — the turn is fine; say nothing.
- "reply" — send your message into the session as the operator.
- "escalate" — flag this for the operator's attention via Telegram.
- "ask_operator" — ask the operator a question via Telegram (autopilot only).

Return a JSON object with fields: verdict, message, note.`;

export class SupervisorEngine {
  readonly #db: DbShape;
  readonly #agent: (
    machineId: string,
    instanceId: string
  ) => SupervisorSender | undefined;
  readonly #telegram?: {
    onSupervisor: (instanceId: string, text: string) => void;
  };
  readonly #publish: (instanceId: string, event: SupervisorEvent) => void;
  readonly #status?: (
    instanceId: string,
    status: SupervisorStatusSignal
  ) => void;
  readonly #state = new Map<string, InstanceState>();
  readonly #meaning: MeaningJudge;
  readonly #semaphore = new Semaphore(
    SUPERVISOR_MAX_CONCURRENT,
    SEMAPHORE_QUEUE_CAP
  );

  constructor({
    db,
    agent,
    meaning,
    telegram,
    publish,
    status,
  }: SupervisorEngineDeps) {
    this.#db = db;
    this.#meaning = meaning;
    this.#agent = agent;
    this.#telegram = telegram;
    this.#publish = publish;
    this.#status = status;
  }

  /** Drop all tracked state for a finished session. */
  forget(instanceId: string): void {
    this.#state.delete(instanceId);
  }

  /**
   * The operator touched this session — a dashboard or Telegram send relayed
   * by the hub. This is the ONLY thing that clears a consecutive-cap mute:
   * the cap exists to hand control back to the human, so only the human's
   * hand takes it off.
   */
  noteHumanSend(instanceId: string): void {
    const state = this.#state.get(instanceId);
    if (!state) {
      return;
    }
    state.consecutive = 0;
    state.initiatedTurn = false;
    state.muted = false;
  }

  /**
   * One frame inside a turn — called right after `ruleEngine.observe`, same
   * throw-nothing envelope. A turn's `result` frame is {@link endTurn}'s.
   */
  observe(instanceId: string, message: NeutralMessage): void {
    try {
      this.#observe(instanceId, message);
    } catch (error) {
      console.error(
        `[supervisor] ${instanceId}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  #observe(instanceId: string, message: NeutralMessage): void {
    // Subagent frames excluded — same discipline as RuleEngine.
    if (message.type !== "assistant" || message.parent_tool_use_id) {
      return;
    }
    const state = this.#ensureState(instanceId);
    const text = spoken(message);
    if (text) {
      state.turn.push(text);
    }
    this.#extractFiles(state, message);
  }

  /**
   * A turn ended: evaluate it off the frame path. Resolves true when the
   * evaluation sent a reply into the session, which answers the turn — a
   * delegate's hand-back waits on this. Never rejects.
   */
  endTurn(
    instanceId: string,
    message: NeutralMessage & { type: "result" }
  ): Promise<boolean> {
    const state = this.#ensureState(instanceId);
    const [row] = this.#db.getInstancesByIds([instanceId]);
    if (
      message.subtype === "aborted" ||
      !(row && this.#agent(row.machineId, instanceId))
    ) {
      // Aborted, or nobody to answer (offline, or the session takes no
      // more input): flush buffers, no evaluation.
      state.turn = [];
      state.files.clear();
      state.commands = [];
      return Promise.resolve(false);
    }
    const turnText = state.turn.join("\n\n");
    const files = [...state.files].slice(0, FILES_CAP);
    const commands = [...state.commands];
    const now = Date.now();
    state.resultTimestamp = now;
    // Flush buffers for the next turn.
    state.turn = [];
    state.files.clear();
    state.commands = [];
    // Attribution: consume the initiatedTurn flag.
    if (state.initiatedTurn) {
      state.consecutive += 1;
      state.initiatedTurn = false;
    } else {
      // A non-supervisor turn resets the streak, but NOT the mute: rules
      // and delegates also start turns, and letting them unmute would let
      // the supervisor ping-pong with another automated sender forever.
      // Only an actual human send (noteHumanSend, called from the hub's
      // relay points) takes the mute off.
      state.consecutive = 0;
    }
    return this.#evaluate(
      message,
      instanceId,
      turnText,
      files,
      commands,
      now
    ).catch((error) => {
      console.error(
        `[supervisor] ${instanceId}: ${error instanceof Error ? error.message : error}`
      );
      return false;
    });
  }

  /** Walk assistant frames for tool_use blocks to extract file paths and commands. */
  #extractFiles(state: InstanceState, message: NeutralAssistantMessage): void {
    for (const block of message.message.content) {
      if (block.type !== "tool_use") {
        continue;
      }
      const input = block.input as Record<string, unknown>;
      for (const key of ["file_path", "path", "notebook_path"] as const) {
        const val = input[key];
        if (typeof val === "string" && val) {
          state.files.add(val);
        }
      }
      if (typeof input.command === "string" && input.command) {
        state.commands.push(input.command);
      }
    }
  }

  #ensureState(instanceId: string): InstanceState {
    const found = this.#state.get(instanceId);
    if (found) {
      return found;
    }
    const made = freshState();
    this.#state.set(instanceId, made);
    return made;
  }

  // ── evaluation ─────────────────────────────────────────────────────────

  /** One full evaluation of a turn; true when it sent a reply into the session. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: runs one full evaluation — builds facts, calls the LLM, applies mute/consecutive/timeout policy, and publishes the verdict
  async #evaluate(
    frame: NeutralMessage,
    instanceId: string,
    turnText: string,
    files: string[],
    commands: string[],
    resultTimestamp: number
  ): Promise<boolean> {
    const state = this.#ensureState(instanceId);

    // Loop guard 1: one in flight per instance.
    if (state.inFlight) {
      const event = this.#record(instanceId, {
        source: "autopilot",
        verdict: "skipped",
        note: "in-flight",
      });
      this.#publish(instanceId, event);
      return false;
    }

    // Loop guard: muted until the operator sends into the session
    // (noteHumanSend) — no turn, however initiated, clears it on its own.
    if (state.muted) {
      const event = this.#record(instanceId, {
        source: "autopilot",
        verdict: "skipped",
        note: "muted (consecutive cap reached)",
      });
      this.#publish(instanceId, event);
      return false;
    }

    // Resolve config at evaluation time — DB wins, env fallback.
    const config = this.#resolveConfig();
    if (!config) {
      return false; // Not configured — engine inert.
    }

    // Look up the instance row for facts and autopilot.
    const [row] = this.#db.listedInstancesByIds([instanceId]);
    if (!row) {
      return false;
    }

    const facts: RuleFacts = {
      machineId: row.machineId,
      projectId: (row as { projectId?: string | null }).projectId ?? null,
      harness: (row as { harness?: string | null }).harness ?? null,
      model: (row as { model?: string | null }).model ?? null,
    };

    // Selection: autopilot enabled > first in-scope llm rule (createdAt asc).
    // Meaning rules are matched by Jev's answer about this turn, not by text.
    const meaningYes = await this.#meaning.turn(
      frame,
      instanceId,
      facts,
      turnText
    );
    const selection = this.#compose(
      instanceId,
      row,
      facts,
      turnText,
      meaningYes
    );
    if (!selection) {
      return false;
    }
    // Attribution shorthand: a single composed rule keeps its identity on the
    // event row; a composed set is attributed in the note, not a column.
    const soleRuleId =
      selection.rules.length === 1 ? selection.rules[0].id : undefined;

    state.inFlight = true;
    // The visible half of the evaluation: the dashboard shows the supervisor
    // deliberating from this signal until the terminal event lands.
    this.#status?.(instanceId, {
      phase: "evaluating",
      source: selection.source,
      ruleId: soleRuleId ?? null,
      at: Date.now(),
    });

    // Global semaphore — cap concurrent LLM calls.
    const acquired = await this.#semaphore.acquire();
    if (!acquired) {
      state.inFlight = false;
      const event = this.#record(instanceId, {
        source: selection.source,
        ruleId: soleRuleId,
        verdict: "skipped",
        note: "semaphore queue full",
      });
      this.#publish(instanceId, event);
      return false;
    }

    try {
      const user = this.#assembleUserBlock(
        instanceId,
        row,
        facts,
        turnText,
        files,
        commands,
        state
      );

      // Rules without autopilot stream: one verdict object PER RULE, each
      // acted on the moment its element completes — no waiting for the tail
      // (operator order 2026-09-02). Autopilot instead absorbs the rules as
      // context and answers with one composed verdict below.
      if (!selection.autopilot) {
        return await this.#evaluateRuleStream(
          instanceId,
          state,
          selection.rules,
          user,
          config,
          resultTimestamp
        );
      }

      // Assemble the prompt.
      const system = `${HARNESS_PREAMBLE}\n\nOperator instructions:\n${selection.instructions}`;

      const result = await verdictFor({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        system,
        user,
        timeoutMs: EVALUATION_TIMEOUT_MS,
      });

      // Loop guard 4: staleness — a newer result arrived before we could deliver.
      if (state.resultTimestamp > resultTimestamp) {
        state.inFlight = false;
        const event = this.#record(instanceId, {
          source: selection.source,
          ruleId: soleRuleId,
          verdict: "skipped",
          note: "stale (newer result arrived)",
        });
        this.#publish(instanceId, event);
        return false;
      }

      if ("error" in result) {
        state.inFlight = false;
        const event = this.#record(instanceId, {
          source: selection.source,
          ruleId: soleRuleId,
          verdict: "error",
          note: result.error,
          model: config.model,
        });
        this.#publish(instanceId, event);
        return false;
      }

      const { verdict } = result;

      // Coerce ask_operator from a rule to escalate (PLAN.md C2).
      let effectiveVerdict = verdict.verdict;
      let coercionNote: string | undefined;
      if (verdict.verdict === "ask_operator" && selection.source === "rule") {
        effectiveVerdict = "escalate";
        coercionNote = "ask_operator coerced to escalate (from rule)";
      }

      // Loop guard 3: consecutive cap — force escalate + mute.
      if (
        effectiveVerdict === "reply" &&
        state.consecutive >= SUPERVISOR_CONSECUTIVE_MAX
      ) {
        effectiveVerdict = "escalate";
        coercionNote = `autopilot hit its consecutive-reply limit (${SUPERVISOR_CONSECUTIVE_MAX})`;
        state.muted = true;
      }

      if (effectiveVerdict === "silent") {
        state.inFlight = false;
        const event = this.#record(instanceId, {
          source: selection.source,
          ruleId: soleRuleId,
          verdict: "silent",
          note: verdict.note || null,
          model: result.model,
          latencyMs: result.latencyMs,
        });
        this.#publish(instanceId, event);
        return false;
      }

      if (effectiveVerdict === "reply") {
        // Re-check instance + agent reachability before delivery.
        const [freshRow] = this.#db.listedInstancesByIds([instanceId]);
        const sender = freshRow
          ? this.#agent(freshRow.machineId, instanceId)
          : undefined;
        if (!(sender && freshRow)) {
          state.inFlight = false;
          const event = this.#record(instanceId, {
            source: selection.source,
            ruleId: soleRuleId,
            verdict: "skipped",
            note: "unreachable",
            model: result.model,
            latencyMs: result.latencyMs,
          });
          this.#publish(instanceId, event);
          return false;
        }

        // Deliver: same envelope shape as RuleEngine.#fire (rules.ts:284-304).
        const { originName } = selection;

        sender.send({
          verb: "send",
          machineId: freshRow.machineId,
          instanceId,
          payload: {
            instanceId,
            message: {
              type: "user",
              uuid: crypto.randomUUID(),
              message: {
                role: "user",
                content: `${ruleMarker(markerName(originName))}${verdict.message}`,
              },
              parent_tool_use_id: null,
              origin: { kind: "system", name: originName },
              shouldQuery: true,
            },
            urgent: false,
          },
        });

        // Mark that we initiated the next turn.
        state.initiatedTurn = true;

        // Rule bookkeeping: every composed rule shares the firing — each
        // behind its own ceiling. "Fired" means "was part of an evaluation
        // that acted", which is the honest reading under composition.
        for (const rule of selection.rules) {
          const standing = this.#db.ruleStateFor(rule.id, instanceId);
          if (!standing || standing.fireCount < RULE_FIRE_CEILING) {
            this.#db.noteRuleFire(rule.id, instanceId, false);
          }
        }

        state.inFlight = false;
        const event = this.#record(instanceId, {
          source: selection.source,
          ruleId: soleRuleId,
          verdict: "reply",
          message: verdict.message,
          note: coercionNote || verdict.note || null,
          model: result.model,
          latencyMs: result.latencyMs,
        });
        this.#publish(instanceId, event);
        return true;
      }

      // escalate / ask_operator
      const eventVerdict =
        effectiveVerdict === "ask_operator"
          ? ("ask" as const)
          : ("escalate" as const);
      state.inFlight = false;

      // Rule bookkeeping — same sharing as the reply path.
      for (const rule of selection.rules) {
        const standing = this.#db.ruleStateFor(rule.id, instanceId);
        if (!standing || standing.fireCount < RULE_FIRE_CEILING) {
          this.#db.noteRuleFire(rule.id, instanceId, false);
        }
      }

      const event = this.#record(instanceId, {
        source: selection.source,
        ruleId: soleRuleId,
        verdict: eventVerdict,
        message: verdict.message,
        note: coercionNote || verdict.note || null,
        model: result.model,
        latencyMs: result.latencyMs,
      });
      this.#publish(instanceId, event);

      // Telegram notification for escalate/ask.
      this.#telegram?.onSupervisor(instanceId, verdict.message);
      return false;
    } finally {
      this.#semaphore.release();
      // Safety: ensure inFlight is cleared even on unexpected errors.
      const s = this.#state.get(instanceId);
      if (s) {
        s.inFlight = false;
      }
    }
  }

  // ── selection ──────────────────────────────────────────────────────────

  /**
   * The streamed rules-only evaluation: the model answers with one verdict
   * object per rule, and each element is ACTED ON the moment it completes —
   * the first rule's reply is in the session while the model still writes
   * the second's. Guided decoding pins the array shape, so the explicit
   * array contract below overrides the preamble's single-object wording.
   * Resolves true when any element's reply went into the session.
   */
  async #evaluateRuleStream(
    instanceId: string,
    state: InstanceState,
    rules: Array<{ id: string; name: string; prompt: string }>,
    user: string,
    config: { baseUrl: string; apiKey?: string; model: string },
    resultTimestamp: number
  ): Promise<boolean> {
    const streamStart = Date.now();
    let replied = false;
    const sections = rules
      .map((r) => `— Rule: ${r.name} —\n${r.prompt}`)
      .join("\n\n");
    const system =
      `${HARNESS_PREAMBLE}\n\n` +
      `This evaluation covers ${rules.length} standing rule(s). Emit EXACTLY one verdict ` +
      "object per rule, in the order listed, shaped " +
      `{"rule": "<rule name>", "verdict": "silent"|"reply"|"escalate", "message": "...", "note": "..."}. ` +
      `Judge each rule independently; a rule with nothing to warrant gets "silent". ` +
      "The single-object contract above does not apply here.\n\n" +
      `Operator instructions:\n${sections}`;

    // Matched by name first, order as fallback — a model that mangles a name
    // still lands its verdict on the next unclaimed rule instead of nowhere.
    const unclaimed = [...rules];
    let stale = false;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: claims one streamed verdict against the matched-rule set, applies it, and updates the composite/stale bookkeeping in one pass
    const act = (verdict: RuleVerdict): void => {
      const byName = unclaimed.findIndex((r) => r.name === verdict.rule);
      const rule =
        byName >= 0 ? unclaimed.splice(byName, 1)[0] : unclaimed.shift();
      if (!rule) {
        return; // more elements than rules — surplus is noise, drop it
      }
      const latencyMs = Date.now() - streamStart;

      // Staleness: a newer turn ended while this stream was running. Already-
      // delivered elements stand; the rest are recorded, not acted on.
      if (!stale && state.resultTimestamp > resultTimestamp) {
        stale = true;
      }
      if (stale) {
        const event = this.#record(instanceId, {
          source: "rule",
          ruleId: rule.id,
          verdict: "skipped",
          note: "stale (newer result arrived)",
          model: config.model,
          latencyMs,
        });
        this.#publish(instanceId, event);
        return;
      }

      let effective = verdict.verdict;
      let note: string | null = verdict.note || null;

      if (effective === "reply" && state.muted) {
        const event = this.#record(instanceId, {
          source: "rule",
          ruleId: rule.id,
          verdict: "skipped",
          note: "muted (consecutive cap reached)",
          model: config.model,
          latencyMs,
        });
        this.#publish(instanceId, event);
        return;
      }
      if (
        effective === "reply" &&
        state.consecutive >= SUPERVISOR_CONSECUTIVE_MAX
      ) {
        effective = "escalate";
        note = `autopilot hit its consecutive-reply limit (${SUPERVISOR_CONSECUTIVE_MAX})`;
        state.muted = true;
      }

      if (effective === "reply") {
        const [freshRow] = this.#db.listedInstancesByIds([instanceId]);
        const sender = freshRow
          ? this.#agent(freshRow.machineId, instanceId)
          : undefined;
        if (!(sender && freshRow)) {
          const event = this.#record(instanceId, {
            source: "rule",
            ruleId: rule.id,
            verdict: "skipped",
            note: "unreachable",
            model: config.model,
            latencyMs,
          });
          this.#publish(instanceId, event);
          return;
        }
        sender.send({
          verb: "send",
          machineId: freshRow.machineId,
          instanceId,
          payload: {
            instanceId,
            message: {
              type: "user",
              uuid: crypto.randomUUID(),
              message: {
                role: "user",
                content: `${ruleMarker(rule.name)}${verdict.message}`,
              },
              parent_tool_use_id: null,
              origin: { kind: "system", name: `supervisor:${rule.name}` },
              shouldQuery: true,
            },
            urgent: false,
          },
        });
        state.initiatedTurn = true;
        replied = true;
      }

      if (effective !== "silent") {
        const standing = this.#db.ruleStateFor(rule.id, instanceId);
        if (!standing || standing.fireCount < RULE_FIRE_CEILING) {
          this.#db.noteRuleFire(rule.id, instanceId, false);
        }
      }
      if (effective === "escalate") {
        this.#telegram?.onSupervisor(instanceId, verdict.message);
      }

      const event = this.#record(instanceId, {
        source: "rule",
        ruleId: rule.id,
        verdict: effective === "escalate" ? "escalate" : effective,
        message: effective === "silent" ? null : verdict.message,
        note,
        model: config.model,
        latencyMs,
      });
      this.#publish(instanceId, event);
    };

    const outcome = await verdictStream({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      system,
      user,
      timeoutMs: EVALUATION_TIMEOUT_MS,
      // 600 per rule (PLAN C2's single-verdict budget, multiplied): each
      // element is its own short verdict.
      maxOutputTokens: 600 * rules.length,
      onVerdict: act,
    });

    if ("error" in outcome) {
      // Whatever streamed before the failure already acted; the rules the
      // stream never reached are recorded as this one error.
      const event = this.#record(instanceId, {
        source: "rule",
        ruleId: unclaimed.length === 1 ? unclaimed[0].id : undefined,
        verdict: "error",
        note:
          outcome.count > 0
            ? `${outcome.error} (after ${outcome.count} verdicts)`
            : outcome.error,
        model: config.model,
      });
      this.#publish(instanceId, event);
    }
    state.inFlight = false;
    return replied;
  }

  /**
   * COMPOSITION, not selection (operator order 2026-09-02): every matched
   * rule's instructions ride in the SAME evaluation, and when autopilot is on
   * the matched rules are fed to IT as context — the autopilot answers with
   * every standing rule in view. One call, one verdict, one voice into the
   * session; no rule is silently ditched in favor of another.
   */
  #compose(
    _instanceId: string,
    row: {
      autopilot?: {
        enabled: boolean;
        prompt: string;
        updatedAt: number;
      } | null;
    },
    facts: RuleFacts,
    turnText: string,
    meaningYes: Set<string>
  ): {
    source: "autopilot" | "rule";
    /** The standing autopilot prompt, when the session has one armed. */
    autopilot: string | null;
    /** The full operator-instructions block, sections labeled by origin. */
    instructions: string;
    /** Every composed rule, for bookkeeping and attribution. */
    rules: Array<{ id: string; name: string; prompt: string }>;
    /** The transcript label this evaluation speaks under. */
    originName: string;
  } | null {
    const autopilot =
      row.autopilot?.enabled && row.autopilot.prompt
        ? row.autopilot.prompt
        : null;

    // Every enabled in-scope llm rule whose trigger matches — ALL of them.
    const matched = this.#db
      .listRules()
      .filter(
        (r): r is Rule => r.enabled && r.action === "llm" && r.timing === "turn"
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .filter((rule) => {
        if (!rule.prompt) {
          return false;
        }
        if (!ruleInScope(rule.scope, facts)) {
          return false;
        }
        if (rule.trigger === "pattern" && rule.matchKind === "meaning") {
          return meaningYes.has(rule.id);
        }
        if (rule.trigger === "pattern") {
          const text =
            turnText.length > RULE_SCAN_LIMIT
              ? turnText.slice(-RULE_SCAN_LIMIT)
              : turnText;
          if (!ruleMatches(rule, text)) {
            return false;
          }
        }
        return true;
      });

    if (!autopilot && matched.length === 0) {
      return null;
    }

    const sections: string[] = [];
    if (autopilot) {
      sections.push(`— Your standing mandate (autopilot) —\n${autopilot}`);
    }
    for (const rule of matched) {
      sections.push(`— Rule: ${rule.name} —\n${rule.prompt}`);
    }
    if (sections.length > 1) {
      sections.push(
        "All instructions above apply together. One short reply may address " +
          "several at once; in your note, name which instruction(s) drove the verdict."
      );
    }

    return {
      source: autopilot ? "autopilot" : "rule",
      autopilot,
      instructions: sections.join("\n\n"),
      rules: matched.map((r) => ({
        id: r.id,
        name: r.name,
        prompt: r.prompt ?? "",
      })),
      originName: composeOriginName(autopilot, matched),
    };
  }

  // ── prompt assembly ────────────────────────────────────────────────────

  #assembleUserBlock(
    instanceId: string,
    row: Record<string, unknown>,
    facts: RuleFacts,
    turnText: string,
    files: string[],
    commands: string[],
    state: InstanceState
  ): string {
    const parts: string[] = [];

    // Session metadata.
    const cwd =
      typeof row.cwd === "string"
        ? leafOf(sessionLabel(row as unknown as LabelledRow).dir)
        : "(unknown)";
    const machine = facts.machineId;
    const harness = facts.harness || "(unknown)";
    const model = facts.model || "(unknown)";
    const title =
      (typeof row.title === "string" ? row.title : null) ||
      (typeof row.derivedTitle === "string" ? row.derivedTitle : null) ||
      "(untitled)";
    parts.push(
      `Session: ${title}\nDirectory: ${cwd} | Machine: ${machine} | Harness: ${harness} | Model: ${model}`
    );

    // Turn attribution.
    const selfInitiated = state.consecutive > 0;
    parts.push(
      `This turn was started by your own previous message: ${selfInitiated ? "yes" : "no"} (consecutive: ${state.consecutive})`
    );

    // Files touched.
    if (files.length > 0) {
      parts.push(
        `Files touched this turn:\n${files.map((f) => `  ${f}`).join("\n")}`
      );
    }
    if (commands.length > 0) {
      const shown = commands.slice(0, FILES_CAP);
      parts.push(
        `Commands run this turn:\n${shown.map((c) => `  ${c}`).join("\n")}`
      );
    }

    // Agent's final text, tail-clamped (RULE_SCAN_LIMIT precedent, core/rules.ts:153).
    if (turnText) {
      const clamped =
        turnText.length > RULE_SCAN_LIMIT
          ? turnText.slice(-RULE_SCAN_LIMIT)
          : turnText;
      parts.push(`Agent's turn output:\n${clamped}`);
    }

    // Last 3 supervisor log rows for this instance.
    const recentEvents = this.#db.listSupervisorEvents({
      instanceId,
      limit: 3,
    });
    if (recentEvents.length > 0) {
      const lines = recentEvents.map((e) => {
        const ts = new Date(e.createdAt).toISOString();
        const msg = e.message ? ` — ${e.message.slice(0, 200)}` : "";
        const note = e.note ? ` [${e.note.slice(0, 100)}]` : "";
        return `  ${ts} ${e.verdict}${msg}${note}`;
      });
      parts.push(`Recent supervisor log:\n${lines.join("\n")}`);
    }

    // Total user block clamped to 24,000 chars (PLAN.md C2: our choice).
    let block = parts.join("\n\n");
    if (block.length > USER_BLOCK_LIMIT) {
      block = block.slice(-USER_BLOCK_LIMIT);
    }
    return block;
  }

  // ── config resolution ──────────────────────────────────────────────────

  #resolveConfig(): { baseUrl: string; model: string; apiKey?: string } | null {
    // The stored row, set from the Settings page, is the only source.
    const dbConfig = this.#db.getSupervisorConfig();
    if (!(dbConfig?.enabled && dbConfig.baseUrl && dbConfig.model)) {
      return null;
    }
    return {
      baseUrl: dbConfig.baseUrl,
      model: dbConfig.model,
      apiKey: dbConfig.apiKey ?? undefined,
    };
  }

  // ── recording ──────────────────────────────────────────────────────────

  #record(
    instanceId: string,
    data: {
      source: "rule" | "autopilot";
      ruleId?: string;
      verdict: SupervisorEvent["verdict"];
      message?: string | null;
      note?: string | null;
      model?: string | null;
      latencyMs?: number | null;
    }
  ): SupervisorEvent {
    return this.#db.recordSupervisorEvent({
      instanceId,
      source: data.source,
      ruleId: data.ruleId,
      verdict: data.verdict,
      message: data.message ?? undefined,
      note: data.note ?? undefined,
      model: data.model ?? undefined,
      latencyMs: data.latencyMs ?? undefined,
    });
  }
}
