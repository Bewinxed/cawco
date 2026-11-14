/**
 * The few rules a word may call besides its own expression. Each has its
 * Swift twin written by scripts/words-swift.ts (`HELPERS` there), which
 * refuses a word that calls anything else.
 */

/** "obelisk", "obelisk and mac", "a, b and c": names as a sentence lists them. */
export const andList = (names: readonly string[]): string =>
  names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * How many need whom: "1 needs you", and with what they are, "6 tasks
 * need you". Every count of what needs someone says it through this, so
 * its verb agrees once.
 */
export const needs = (n: number, who: string, what = ""): string =>
  `${n}${what === "" ? "" : ` ${what}`} ${n === 1 ? "needs" : "need"} ${who}`;

/** A whole number in two figures: 5 → "05". */
export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** A sentence a person reads, kept to `max` characters and ending in "…" where it was cut. */
export const cutShort = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** The end of a sentence a person reads, kept to `max` characters and opening in "…" where it was cut. */
export const cutShortTail = (text: string, max: number): string =>
  text.length > max ? `…${text.slice(-max)}` : text;

/** The last `count` of `lines` joined by `between`, opening in "…" where earlier lines were left out. */
export const lastLines = (
  lines: readonly string[],
  count: number,
  between: string
): string =>
  `${lines.length > count ? `…${between}` : ""}${lines.slice(-count).join(between)}`;
