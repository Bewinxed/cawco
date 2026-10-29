/**
 * What the Decisions tab says of a page: its progress figure, its notes, its
 * state pill and a decided page's meta line, put together from core's words
 * (`decisionsWords`, which the native app reads as `Words.Decisions`).
 * Nothing here names a card, an option or a page by its id.
 */

import type { DecisionPageSummary } from "@cawco/core/decisions";
import { decisionsWords as words } from "@cawco/core/words/decisions";
import { formatAgeShort } from "#lib/utils/time.js";

/** Whether a page shows its record: his Send of its picks wrote it. */
export const isDecided = (page: Pick<DecisionPageSummary, "state">): boolean =>
  page.state === "decided" || page.state === "making";

/**
 * The figure beside the ring: `12 of 20 picked` while picking; once decided,
 * `12 decided` (or `8 of 12 decided` when some were left open) with its
 * tasks, `· 14 tasks`, when it made any.
 */
export function progressWords(
  page: Pick<
    DecisionPageSummary,
    "cards" | "decided" | "picked" | "state" | "tasks"
  >
): string {
  if (!isDecided(page)) {
    return words.picked(page.picked, page.cards);
  }
  const decided = words.decided(page.decided, page.cards);
  return page.tasks > 0 ? words.decidedTasks(decided, page.tasks) : decided;
}

/** A decided page's head meta: its figure and when it was decided, `12 decided · 14 tasks · 3d ago`. */
export function decidedMeta(
  page: Parameters<typeof progressWords>[0],
  madeAt: string,
  now: number
): string {
  return words.decidedAt(
    progressWords(page),
    formatAgeShort(Date.parse(madeAt), now)
  );
}

/** A page's state pill: none while it is picked on (Idle Has No Fill). */
export interface Pill {
  /** The whole state, for a pointer that rests on it. */
  title: string;
  tone: "live" | "done";
  /** Who is on it, after the word. */
  who: string | null;
  word: string;
}

/**
 * Sent, and who has it: its session's name and `working` while it works
 * (the head; a tile, short of room, says `working` alone), `Caw` when its
 * session had ended and Caw took it; Decided once its record stands.
 */
export function pillOf(
  page: Pick<DecisionPageSummary, "state" | "writer">,
  working: boolean,
  short: boolean
): Pill | null {
  if (page.state === "picking") {
    return null;
  }
  if (page.state === "decided") {
    return {
      tone: "done",
      word: words.decidedPill,
      who: null,
      title: words.decidedPill,
    };
  }
  const { writer } = page;
  if (!writer || writer.ended) {
    return {
      tone: "live",
      word: words.sent,
      who: words.caw,
      title: words.pillTitle(words.sent, words.caw),
    };
  }
  const whole = words.workingWhole(writer.title);
  if (!working) {
    return { tone: "live", word: words.sent, who: null, title: words.sent };
  }
  return {
    tone: "live",
    word: words.sent,
    who: short ? words.working : whole,
    title: words.pillTitle(words.sent, whole),
  };
}
