/**
 * Finding the product by its own words: a probe that locates by what the
 * page says takes those words from where the product renders them
 * (packages/core/src/words/*), never a copy, so a word changed there is
 * the word looked for here.
 */

/** `text` as a pattern that matches it literally. */
export const literal = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);

/** A label that starts with `words`. */
export const startsWith = (words: string): RegExp =>
  new RegExp(`^${literal(words)}`);

/** A label that is exactly `words`. */
export const exactly = (words: string): RegExp =>
  new RegExp(`^${literal(words)}$`);

/** A hole a word's value goes in, where `shaped` reads it back. */
const HOLE = "\u0000";

/**
 * A word that takes values (`updatesWords.ready`), as a pattern for any
 * values: each value's place matches any words, the rest literally, so a
 * probe finds the sentence without copying it or knowing every value.
 */
export const shaped = (word: (...values: never[]) => string): RegExp =>
  new RegExp(
    literal(
      (word as (...values: string[]) => string)(
        ...Array.from({ length: word.length }, () => HOLE)
      )
    )
      .split(HOLE)
      .join("(.+?)")
  );
