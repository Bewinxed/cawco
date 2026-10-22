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

/** A whole number in two figures: 5 → "05". */
export const pad2 = (n: number): string => String(n).padStart(2, "0");
