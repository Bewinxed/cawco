/**
 * The words for a session's context filling up (core context-filing.ts): the
 * filing turn's opening fact and closing clause around its proven body (hub
 * open-items.ts `filingPrompt`), the hub's lines in the session's transcript
 * (core `CONTEXT_LINE`), where its filing stands on `delegate_list`'s
 * Context line, and what a sender is told of a send held behind the filing
 * turn.
 *
 * Every string here is a placeholder, written to be replaced by its final
 * words.
 */
import type { ContextLine, FilingStage } from "../context-filing";
import { accountsWords } from "./accounts";

const NUMBER = new Intl.NumberFormat("en-US");

/** A count of tokens as a line names it: "137K", "967K". */
const kTokens = (tokens: number): string =>
  `${NUMBER.format(Math.round(tokens / 1000))}K`;

/** A filing line's title, by its stage: how full the context was, and what it does. */
const FILING_TITLE: Record<FilingStage, (fill: string) => string> = {
  filing: (fill) => `Context at ${fill}: filing its open items`,
  filed: (fill) => `Context at ${fill}: open items filed`,
  stopped: (fill) => `Context at ${fill}: filing stopped`,
};

/** A filing line's detail, by its stage. */
const FILING_DETAIL: Record<FilingStage, string> = {
  filing:
    "It takes one turn to file its open items into its records; what it is sent meanwhile waits until that turn ends.",
  filed:
    "Its harness compacts it later, on its own, and its open items are listed back after that.",
  stopped:
    "Its filing turn ended before it finished, so it goes on as it was; it is not asked to file again until its next compaction.",
};

/** What a compaction line says of the filing before it. */
const COMPACTED_FILED: Record<FilingStage | "none", string> = {
  filing: "its filing turn still running",
  filed: "its open items filed first",
  stopped: "its filing stopped before it finished",
  none: "nothing filed first",
};

export const contextWords = {
  /**
   * The filing turn's opening fact, before its proven body: how full the
   * context is, and where its harness compacts it on its own.
   */
  filingFact: (tokens: number, compactsAt: number) =>
    `Your context is at ${NUMBER.format(tokens)} tokens; your harness compacts it on its own at ${NUMBER.format(compactsAt)}.`,
  /**
   * The filing turn's closing clause, after its proven body: no compaction
   * follows this turn; the harness compacts the conversation later, on its
   * own.
   */
  filingLater:
    "Your harness compacts this conversation later, on its own; nothing compacts it at the end of this turn.",
  /** A line in the session's transcript (core `CONTEXT_LINE`): its title, and the detail under it. */
  line: (line: ContextLine): { title: string; detail: string } => {
    if (line.kind === "filing") {
      const fill = `${kTokens(line.fill.tokens)} of ${kTokens(line.fill.compactsAt)}`;
      return {
        title: FILING_TITLE[line.stage](fill),
        detail: FILING_DETAIL[line.stage],
      };
    }
    const before =
      line.tokens === null
        ? ""
        : ` at ${NUMBER.format(Math.round(line.tokens / 1000))}K tokens`;
    const harness = accountsWords.harnesses[line.harness];
    if (line.failed) {
      return {
        title: `${harness}’s compaction failed${before} · ${COMPACTED_FILED[line.filed ?? "none"]}`,
        detail:
          "It goes on with its whole conversation; it is not asked to file again until its next compaction.",
      };
    }
    return {
      title: `Compacted by ${harness}${before} · ${COMPACTED_FILED[line.filed ?? "none"]}`,
      detail:
        line.filed === null
          ? "No filing turn came since its compaction before, so only what its records already held is listed back."
          : "Its open items are listed back from its records after the compaction.",
    };
  },
  /** The line's kind, as a note names it. */
  noteKind: "Context",
  /**
   * Where its filing stands, after `delegate_list`'s Context line's share
   * (hub presenters/sessions.ts): its filing turn runs, or how its filing
   * since its last compaction ended, and where its harness compacts it.
   */
  peek: (stage: FilingStage, compactsAt: number) => {
    const at = NUMBER.format(compactsAt);
    switch (stage) {
      case "filing":
        return `; filing its open items before its harness compacts it at ${at} tokens`;
      case "filed":
        return `; its open items filed, its harness compacts it at ${at} tokens`;
      case "stopped":
        return `; its filing stopped before it finished, its harness compacts it at ${at} tokens`;
    }
  },
  /** What a sender is told of a send held behind a session's filing turn (hub delegation-actions.ts `HOLD_WORDS`). */
  held: "Its context came within its compaction policy's room of where its harness compacts it, so it is filing its open items in one turn of its own; the message is kept at the hub and goes to the session as soon as that turn ends. Stopping its turn ends the filing and sends it now.",
};
