import type { NeutralMessage, Rule, RuleFacts } from "@cawco/core";
import { ruleInScope } from "@cawco/core";
import type { JevResult } from "@cawco/core/workflow-program";
import type { DbShape } from "./db";
import { askJev } from "./jev";

/** A meaning rule answers inside the turn it judges, so it is asked briefly. */
const MEANING_TIMEOUT_MS = 10_000;

/**
 * Meaning rules: a yes/no question put to Jev about what the session said,
 * instead of a phrase to find in it.
 *
 * Both engines read meaning rules — the rule engine fires `reply` ones, the
 * supervisor composes `llm` ones — and both see the same turn end. So the
 * judge asks once per turn frame, every in-scope meaning rule in the one call,
 * and hands each engine the same answer.
 *
 * Besides what the session said, Jev reads `live_delegated_work`: the titles
 * of the session's work items still starting or running, or `none`. A rule
 * that exempts work already handed to someone doing it now judges that from
 * this fact, not from how the session describes its delegates.
 */

/** A noul at or above this fires the rule. */
export const MEANING_THRESHOLD = 0.8;

/** Jev reads 32,000 tokens; the tail of the output is what gets judged. */
const MEANING_TEXT_LIMIT = 60_000;

const tail = (text: string): string =>
  text.length > MEANING_TEXT_LIMIT ? text.slice(-MEANING_TEXT_LIMIT) : text;

/** Which `state` fields a rule's question is about, by what it watches. */
const SUBJECT = {
  text: "`agent_output`",
  thinking: "`agent_thinking`",
  both: "`agent_output` and `agent_thinking`",
} as const;

export class MeaningJudge {
  readonly #db: DbShape;
  /** One answer per turn frame, however many engines ask about it. */
  readonly #turns = new WeakMap<NeutralMessage, Promise<Set<string>>>();

  constructor(db: DbShape) {
    this.#db = db;
  }

  /**
   * The ids of every enabled, in-scope `turn` meaning rule (either action)
   * whose answer about this turn's speech is yes. Thinking-only rules sit
   * this timing out, as they do on the phrase path.
   */
  turn(
    frame: NeutralMessage,
    instanceId: string,
    facts: RuleFacts,
    text: string
  ): Promise<Set<string>> {
    const asked = this.#turns.get(frame);
    if (asked) {
      return asked;
    }
    const rules = this.#db
      .listRules()
      .filter(
        (rule) =>
          rule.enabled &&
          rule.matchKind === "meaning" &&
          rule.timing === "turn" &&
          rule.watch !== "thinking" &&
          ruleInScope(rule.scope, facts)
      );
    const answer = this.#ask(
      instanceId,
      rules.map((rule) => ({ rule, subject: SUBJECT.text })),
      {
        agent_output: tail(text),
        live_delegated_work: this.#liveDelegatedWork(instanceId),
      }
    );
    this.#turns.set(frame, answer);
    return answer;
  }

  /**
   * The ids of `rules` (the `message` meaning rules) whose answer about one
   * finished assistant message is yes. Each rule reads what its `watch`
   * allows, as the phrase path does; a rule with nothing to read is not asked.
   */
  message(
    instanceId: string,
    facts: RuleFacts,
    rules: Rule[],
    said: string,
    thinking: string
  ): Promise<Set<string>> {
    const asked = rules
      .filter((rule) => ruleInScope(rule.scope, facts))
      .filter((rule) => {
        if (rule.watch === "text") {
          return said !== "";
        }
        if (rule.watch === "thinking") {
          return thinking !== "";
        }
        return said !== "" || thinking !== "";
      })
      .map((rule) => ({ rule, subject: SUBJECT[rule.watch] }));
    // Every assistant frame comes through here; the state is built only for
    // a frame some rule is asked about.
    if (asked.length === 0) {
      return Promise.resolve(new Set());
    }
    const state: Record<string, string> = {
      live_delegated_work: this.#liveDelegatedWork(instanceId),
    };
    if (asked.some(({ rule }) => rule.watch !== "thinking")) {
      state.agent_output = tail(said);
    }
    if (asked.some(({ rule }) => rule.watch !== "text")) {
      state.agent_thinking = tail(thinking);
    }
    return this.#ask(instanceId, asked, state);
  }

  /** The titles of the session's work items still starting or running, or `none`. */
  #liveDelegatedWork(instanceId: string): string {
    const live = this.#db.liveWorkItemsOf(instanceId);
    return live.length > 0 ? live.map((item) => item.title).join("; ") : "none";
  }

  async #ask(
    instanceId: string,
    asked: { rule: Rule; subject: string }[],
    state: Record<string, string>
  ): Promise<Set<string>> {
    if (asked.length === 0) {
      return new Set();
    }
    const connection = this.#db.getOpenRouterConnection();
    if (!connection) {
      console.log(
        `[meaning] ${instanceId}: meaning rules skipped: OpenRouter not connected`
      );
      return new Set();
    }
    const questions: Record<string, { type: "noul"; instructions: string }> =
      Object.fromEntries(
        asked.map(({ rule, subject }) => [
          rule.id,
          {
            type: "noul" as const,
            instructions: `${rule.pattern} answered about ${subject}`,
          },
        ])
      );
    let result: JevResult<typeof questions>;
    try {
      result = await askJev(connection.apiKey, state, questions, {
        timeoutMs: MEANING_TIMEOUT_MS,
      });
    } catch (error) {
      console.error(
        `[meaning] ${instanceId}: Jev failed for rules ${asked
          .map(({ rule }) => rule.id)
          .join(", ")}: ${error instanceof Error ? error.message : error}`
      );
      return new Set();
    }
    const yes = new Set<string>();
    for (const { rule } of asked) {
      const { noul } = result.answers[rule.id];
      console.debug(
        `[meaning] ${instanceId}: rule ${rule.id} noul=${noul} cost=$${result.usage.costUsd}`
      );
      if (noul >= MEANING_THRESHOLD) {
        yes.add(rule.id);
      }
    }
    return yes;
  }
}
