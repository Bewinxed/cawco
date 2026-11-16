/**
 * What a session's account and model pickers show of an account's room: a
 * row's second line, and the force past a limit. A row's state (its glyph,
 * the live dot while it is checked) carries what is happening; these words
 * name only the fact.
 */

import { DAY_MS } from "../time";
import { clockWords } from "./account-lines";

/** A reading's age, as the usage figures say a span ("3h 10m"). */
type Age = string;

export const limitPickWords = {
  /**
   * At its limit until `until`; with `age` only when the reading is old:
   * "At its limit until 15:40 · checked 3h 10m ago".
   */
  atLimit: (until: string, age?: Age): string =>
    `At its limit until ${until}${age ? ` · checked ${age} ago` : ""}`,
  /** Room left in the window that runs out first: "62% left". */
  left: (percent: number): string => `${percent}% left`,
  /** No reading of the account's windows has come yet. */
  unread: "Not read yet",
  /**
   * When a limit resets, as its line names it: the clock within a day,
   * "15:40"; past it, the weekday and the clock, "Thu 09:00".
   */
  resets: (at: number, now: number): string =>
    at - now < DAY_MS
      ? clockWords(at)
      : `${new Date(at).toLocaleDateString("en-GB", { weekday: "short" })} ${clockWords(at)}`,
  /**
   * The limit could not be checked again (no machine read it; the row's
   * tooltip says why, in the hub's words). It leads, as it is why Move
   * anyway stands there at once: "Couldn't check · at its limit until 15:40".
   */
  unchecked: (until: string): string =>
    `Couldn't check · at its limit until ${until}`,
  /** The force past a limit, on an account's row. */
  moveAnyway: "Move anyway",
  /** The force past a limit, on a model's row. */
  pickAnyway: "Pick anyway",
  /** A model the account doesn't offer: the list's head names the account. */
  notOffered: "Not offered",
};
