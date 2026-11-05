/**
 * The words for a session's context filling up (core context-filing.ts): the
 * filing turn's opening fact and closing clause around its proven body (hub
 * open-items.ts `filingPrompt`), the hub's lines in the session's transcript
 * (core `CONTEXT_LINE`), where its filing stands on `delegate_list`'s
 * Context line, and what a sender is told of a send held behind the filing
 * turn. What the person reads names tokens as the move lines do ("137k
 * tokens", core accounts.ts `tokenWords`) and the harness by its name; what
 * the model and agents read, whole ("137,000").
 */
import type { ContextLine, FilingStage, FilingWrote } from "../context-filing";
import { accountsWords } from "./accounts";
import { andList } from "./helpers";

const NUMBER = new Intl.NumberFormat("en-US");

/** A count of tokens in thousands, as core accounts.ts `tokenWords` names it before " tokens": "137k". */
const kTokens = (tokens: number): string =>
  `${Math.round(tokens / 1000).toLocaleString("en")}k`;

/** A filing line's title, by its stage: what it does, at what reading, and where its harness, named, compacts it. */
const FILING_TITLE: Record<
  FilingStage,
  (at: string, harness: string, point: string) => string
> = {
  filing: (at, harness, point) =>
    `Filing its open items at ${at} · ${harness} compacts it at ${point}`,
  filed: (at, harness, point) =>
    `Open items filed at ${at} · ${harness} compacts it at ${point}`,
  stopped: (at, harness, point) =>
    `Filing stopped at ${at} · ${harness} compacts it at ${point}`,
};

/** `n` of a kind of record, as the filed line counts it: "1 task", "2 tasks". */
const counted = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/**
 * What a filing wrote, as its filed line's detail says it: each kind of
 * record it wrote, counted, or that it wrote nothing new.
 */
const wroteWords = (wrote: FilingWrote): string => {
  const parts = [
    ...(wrote.steps > 0
      ? [counted(wrote.steps, "plan step", "plan steps")]
      : []),
    ...(wrote.spec ? ["its spec"] : []),
    ...(wrote.todos > 0 ? [counted(wrote.todos, "to-do", "to-dos")] : []),
    ...(wrote.tasks > 0 ? [counted(wrote.tasks, "task", "tasks")] : []),
    ...(wrote.notes > 0 ? [counted(wrote.notes, "note", "notes")] : []),
  ];
  return parts.length > 0
    ? `Wrote ${andList(parts)}.`
    : "Wrote nothing new to its records.";
};

/**
 * A filing line's detail, by its stage: what waits while it runs; once
 * filed, what it wrote (none when that is unknown: the title alone); once
 * stopped, that it is not asked again before its harness compacts it.
 */
const filingDetail = (
  line: Extract<ContextLine, { kind: "filing" }>,
  harness: string
): string => {
  switch (line.stage) {
    case "filing":
      return "What is sent to it waits until this turn ends · stop the turn to send it now";
    case "filed":
      return line.wrote ? wroteWords(line.wrote) : "";
    case "stopped":
      return `It is not asked to file again before ${harness} compacts it.`;
  }
};

/** What a compaction line says of the filing before it. */
const COMPACTED_FILED: Record<FilingStage | "none", string> = {
  filing: "during its filing turn",
  filed: "its open items filed first",
  stopped: "its filing stopped partway",
  none: "nothing filed first",
};

export const contextWords = {
  /**
   * The filing turn's opening fact, before its proven body: how full the
   * context is, and where its harness compacts it.
   */
  filingFact: (tokens: number, compactsAt: number) =>
    `Your context is at ${NUMBER.format(tokens)} tokens; your harness compacts it at ${NUMBER.format(compactsAt)}.`,
  /**
   * The filing turn's closing clause, after its proven body: no compaction
   * follows this turn; the harness compacts the conversation on its own once
   * it reaches the opening fact's point.
   */
  filingLater:
    "Your harness compacts this conversation on its own once it reaches that point, not at the end of this turn.",
  /**
   * A line in the session's transcript (core `CONTEXT_LINE`): its title, and
   * the detail under it (empty: the title alone). A compaction a person
   * asked for (`/compact`, its trigger `manual`) says so, "as asked", as a
   * move a person asked for does (core accounts.ts `aheadWords`).
   */
  line: (line: ContextLine): { title: string; detail: string } => {
    const harness = accountsWords.harnesses[line.harness];
    if (line.kind === "filing") {
      return {
        title: FILING_TITLE[line.stage](
          `${kTokens(line.fill.tokens)} tokens`,
          harness,
          kTokens(line.fill.compactsAt)
        ),
        detail: filingDetail(line, harness),
      };
    }
    const before =
      line.tokens === null ? "" : ` at ${kTokens(line.tokens)} tokens`;
    const filed = COMPACTED_FILED[line.filed ?? "none"];
    if (line.failed) {
      return {
        title: `${harness}’s compaction failed${before} · ${filed}`,
        detail:
          line.filed === null
            ? "It goes on with its whole conversation"
            : "It goes on with its whole conversation · it is not asked to file again before its next compaction",
      };
    }
    const asked = line.trigger === "manual" ? " as asked" : "";
    return {
      title: `Compacted by ${harness}${asked}${before} · ${filed}`,
      detail: "What its records hold is listed back to it.",
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
        return `; filing its open items before its harness compacts it at ${at}`;
      case "filed":
        return `; its open items filed, its harness compacts it at ${at}`;
      case "stopped":
        return `; its filing stopped partway, its harness compacts it at ${at}`;
    }
  },
  /** What a sender is told of a send held behind a session's filing turn (hub delegation-actions.ts `HOLD_WORDS`). */
  held: "Its context is near where its harness compacts it, so it is filing its open items in one turn of its own; the message is kept at the hub and goes to the session as soon as that turn ends. Stopping its turn ends the filing and sends it now.",
};
