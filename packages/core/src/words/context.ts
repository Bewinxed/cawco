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

/** A window as a line names it: "1M", "200K", "258K". */
const windowShort = (tokens: number): string =>
  tokens >= 1_000_000 && tokens % 1_000_000 === 0
    ? `${tokens / 1_000_000}M`
    : `${Math.round(tokens / 1000)}K`;

/** A reading as a share of its window, whole percent. */
const shareOf = (tokens: number, window: number): number =>
  Math.round((tokens / window) * 100);

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
   * context is, of which window.
   */
  filingFact: (percent: number, window: number) =>
    `Your context is at ${percent}% of its ${NUMBER.format(window)}-token window.`,
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
      const fill = `${shareOf(line.fill.tokens, line.fill.window)}% of ${windowShort(line.fill.window)}`;
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
   * since its last compaction ended.
   */
  peek: (stage: FilingStage, percent: number) => {
    switch (stage) {
      case "filing":
        return `; filing its open items, at ${percent}%, before its harness compacts it`;
      case "filed":
        return `; its open items filed at ${percent}%, its harness compacts it later`;
      case "stopped":
        return `; its filing at ${percent}% stopped before it finished`;
    }
  },
  /** What a sender is told of a send held behind a session's filing turn (hub delegation-actions.ts `HOLD_WORDS`). */
  held: "Its context reached its compaction policy's threshold, so it is filing its open items in one turn of its own; the message is kept at the hub and goes to the session as soon as that turn ends. Stopping its turn ends the filing and sends it now.",
};
