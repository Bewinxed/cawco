/**
 * Names in a sentence: the list a sentence reads, and where it stops naming
 * and counts the rest. Every sentence that names things reads this.
 */

/** "obelisk", "obelisk and mac", "a, b and c": names as a sentence lists them. */
export const andList = (names: readonly string[]): string =>
  names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** How many things a sentence names before it counts the rest. */
// @limit external: a sentence names three things and counts the rest, four chunks, what working memory holds (Cowan 2001, https://doi.org/10.1017/S0140525X01003922)
const NAMES_IN_A_SENTENCE = 3;

/**
 * The first {@link NAMES_IN_A_SENTENCE} of `items` and how many follow: where
 * a sentence names some and counts the rest. Where the reader must act on
 * every item, the whole list follows the sentence.
 */
export const firstNames = <T>(
  items: readonly T[]
): { more: number; shown: T[] } => ({
  more: Math.max(0, items.length - NAMES_IN_A_SENTENCE),
  shown: items.slice(0, NAMES_IN_A_SENTENCE),
});

/** "a, b and c", and past three "a, b, c and 4 more": names as a sentence lists them, the rest counted. */
export const namedAndMore = (names: readonly string[]): string => {
  const { more, shown } = firstNames(names);
  return more === 0 ? andList(shown) : `${shown.join(", ")} and ${more} more`;
};
