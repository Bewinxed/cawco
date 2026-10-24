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

/** The mark of value `i` in a word's text, where `shaped` reads it back: a private-use character, never a digit or a word. */
const mark = (i: number): string => String.fromCodePoint(0xe0_00 + i);
const MARKS = /[-]/g;
/** A number as words print it: digits, maybe grouped or with a fraction ("117.7", "65536", "1,024"). */
const NUMBER = /(\d(?:[\d.,]*\d)?)/;
/** What a numeric value's place matches. */
const ANY_NUMBER = String.raw`(\d(?:[\d.,]*\d)?)`;
/** Two large numbers a numeric value is tried with, its place the numbers that differ between them. */
const SAMPLES = [7_654_321, 1_234_598] as const;
/** Values a branch on a value, or a change to it, would show itself to: the empty text, plain words, none, one and two. */
const PROBES = ["", "a value", 0, 1, 2] as const;
/** The probes a numeric value is tried with besides {@link SAMPLES}: none, one and two. */
const NUMBER_PROBES = [SAMPLES[1], 0, 1, 2] as const;
/** What a number op on a value that is no number prints. */
const NOT_A_NUMBER = /NaN|Infinity/g;

/** A word that cannot be shaped, said by its name and why. */
class Unshapeable extends Error {
  constructor(name: string, why: string) {
    super(`shaped(${name}): ${why}; it cannot be shaped`);
  }
}

/** One word, called with values of any kind: its text, or undefined where it throws or says no text. */
function caller(word: (...values: never[]) => string) {
  return (values: readonly unknown[]): string | undefined => {
    try {
      const said: unknown = (word as (...given: readonly unknown[]) => unknown)(
        ...values
      );
      return typeof said === "string" ? said : undefined;
    } catch {
      return undefined;
    }
  };
}

const nans = (text: string): number => text.match(NOT_A_NUMBER)?.length ?? 0;

/** `values` with value `i` replaced by `value`. */
const replacing = (
  values: readonly unknown[],
  i: number,
  value: unknown
): unknown[] => values.map((each, j) => (j === i ? value : each));

/**
 * The values a word prints as a number of its own making: its mark does not
 * come back, or a number in its place takes away a NaN (a mark run through
 * `toFixed` or `/`; a value printed as given in one place may be formatted
 * in another).
 */
function numericValues(
  call: (values: readonly unknown[]) => string | undefined,
  marks: readonly string[],
  asText: string
): number[] {
  return marks.flatMap((m, i) => {
    const asNumber = call(replacing(marks, i, SAMPLES[0]));
    return !asText.includes(m) ||
      (asNumber !== undefined && nans(asNumber) < nans(asText))
      ? [i]
      : [];
  });
}

/** Text split into words and numbers (numbers at odd places), and whether two such have the same words. */
const sameWords = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((token, k) => k % 2 === 1 || token === b[k]);

/**
 * A word that takes values (`updatesWords.ready`), as a pattern for every
 * text it can say, so a probe finds the sentence without copying it or
 * knowing every value. A value the word prints as given matches any words
 * there; a value it prints as a number of its own making (`tenths(bytes)`,
 * `Math.round(ms / 1000)`) matches any number there.
 *
 * Read off the word itself, the one way the kit has: a word is a plain
 * function whose parameter types are gone at run time, and the words carry
 * no declaration of their values' kinds (scripts/words-swift.ts reads them
 * from the source, a TypeScript parse no spec should pay to find a line).
 * So each value is given a mark. A mark that comes back is a value printed
 * as given; one that does not, or whose place says NaN, is tried as two
 * numbers ({@link SAMPLES}), its place the numbers that change between the
 * two texts, every word the same.
 *
 * A word that branches on a value (a plural, `said ? … : ""`), changes it
 * (`.toUpperCase()`), or leaves no trace of it, says something the pattern
 * would not match: each value is also tried as each of {@link PROBES}, and
 * any text but the pattern's own with that value in its place throws,
 * naming the word and the value. So `shaped` never returns a pattern that
 * matches nothing or only some of what the word says (2026-10-24: a `NaN`
 * from a mark run through `toFixed` made a log check pass by finding no line).
 */
export const shaped = (word: (...values: never[]) => string): RegExp => {
  const name = word.name || "an unnamed word";
  const call = caller(word);
  const marks = Array.from({ length: word.length }, (_, i) => mark(i));
  const asText = call(marks);
  if (asText === undefined) {
    throw new Unshapeable(
      name,
      "given words for its values it throws, or says no text"
    );
  }
  const numeric = numericValues(call, marks, asText);
  const given = marks.map((m, i) => (numeric.includes(i) ? SAMPLES[0] : m));
  const base = call(given);
  if (base === undefined || nans(base) > 0) {
    throw new Unshapeable(
      name,
      `with each value as its kind it says ${JSON.stringify(base?.replace(MARKS, "…"))}`
    );
  }
  const tokens = base.split(NUMBER);
  for (const [i, m] of marks.entries()) {
    if (!numeric.includes(i)) {
      checkGivenValue(call, given, base, i, m, name);
    }
  }
  const placed = new Set<number>();
  for (const i of numeric) {
    for (const k of numberPlaces(call, given, tokens, i, name)) {
      placed.add(k);
    }
  }
  return new RegExp(
    tokens
      .map((token, k) =>
        placed.has(k) ? ANY_NUMBER : literal(token).replace(MARKS, "(.+?)")
      )
      .join("")
  );
};

/** That value `i`, printed as given at mark `m`, prints as given for every probe the word takes. */
function checkGivenValue(
  call: (values: readonly unknown[]) => string | undefined,
  given: readonly unknown[],
  base: string,
  i: number,
  m: string,
  name: string
): void {
  if (!base.includes(m)) {
    throw new Unshapeable(
      name,
      `value ${i + 1} prints as given only while the others are words`
    );
  }
  for (const probe of PROBES) {
    const said = call(replacing(given, i, probe));
    if (said !== undefined && said !== base.split(m).join(String(probe))) {
      throw new Unshapeable(
        name,
        `value ${i + 1} as ${JSON.stringify(probe)} says ${JSON.stringify(said.replace(MARKS, "…"))}, not the words around it with that value in its place (a branch on it, or a change to it)`
      );
    }
  }
}

/** Where numeric value `i` prints in `tokens`: the numbers that change with it, every word the same for each probe. */
function numberPlaces(
  call: (values: readonly unknown[]) => string | undefined,
  given: readonly unknown[],
  tokens: string[],
  i: number,
  name: string
): number[] {
  const other = call(replacing(given, i, SAMPLES[1]))?.split(NUMBER) ?? [];
  for (const probe of NUMBER_PROBES) {
    const said = call(replacing(given, i, probe));
    if (said === undefined || !sameWords(tokens, said.split(NUMBER))) {
      throw new Unshapeable(
        name,
        `value ${i + 1} as ${probe} changes the word's words, not only a number in it (a plural or a branch on it)`
      );
    }
  }
  const places = tokens.flatMap((token, k) =>
    k % 2 === 1 && token !== other[k] ? [k] : []
  );
  if (places.length === 0) {
    throw new Unshapeable(
      name,
      `value ${i + 1} leaves no trace in its text, as words or as a number`
    );
  }
  return places;
}
