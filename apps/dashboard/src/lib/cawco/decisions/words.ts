/**
 * What the Decisions tab says of a page, in one place (WORDS.md; the
 * decided record's copy): its progress figure, its notes, its state pill
 * and a decided page's meta line. Nothing here names a card, an option or a
 * page by its id.
 */
import type { DecisionPageSummary } from "@cawco/core/decisions";
import { formatAgeShort } from "#lib/utils/time.js";

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** Whether a page shows its record: Make tasks wrote it. */
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
    return `${page.picked} of ${page.cards} picked`;
  }
  const decided =
    page.decided === page.cards
      ? `${page.decided} decided`
      : `${page.decided} of ${page.cards} decided`;
  return page.tasks > 0
    ? `${decided} · ${plural(page.tasks, "task", "tasks")}`
    : decided;
}

/** `· 3 notes` after a page's figure while it is picked on; nothing with none. */
export const notesWords = (notes: number): string | null =>
  notes > 0 ? `· ${plural(notes, "note", "notes")}` : null;

/** A decided page's head meta: its figure and when it was decided, `12 decided · 14 tasks · 3d ago`. */
export function decidedMeta(
  page: Parameters<typeof progressWords>[0],
  madeAt: string,
  now: number
): string {
  const age = formatAgeShort(Date.parse(madeAt), now);
  return `${progressWords(page)} · ${age === "now" ? "now" : `${age} ago`}`;
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
    return { tone: "done", word: "Decided", who: null, title: "Decided" };
  }
  const writer = page.writer;
  if (!writer || writer.ended) {
    return { tone: "live", word: "Sent", who: "Caw", title: "Sent · Caw" };
  }
  const whole = `${writer.title} working`;
  if (!working) {
    return { tone: "live", word: "Sent", who: null, title: "Sent" };
  }
  return {
    tone: "live",
    word: "Sent",
    who: short ? "working" : whole,
    title: `Sent · ${whole}`,
  };
}
