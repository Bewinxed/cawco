/**
 * A value quoted in a message: the one place that cuts it. A sentence quotes
 * one line of a value and names where the whole of it is (the record, the
 * log, the transcript), so a reader sees what failed and is one step from the
 * rest. Every message that quotes text reads this.
 */

/** The most characters one quoted line holds. */
// @limit external: a quote stays within one line, and a line of text is at most 80 characters (WCAG 2.2 SC 1.4.8, https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)
export const QUOTE_CHARS = 80;

/** Whether `text` already fits one quoted line, so quoting it would cut nothing. */
export const fitsQuote = (text: string): boolean => text.length <= QUOTE_CHARS;

const LINE_BREAK = /\r?\n/u;

/**
 * `value`'s first line, trimmed, and cut at {@link QUOTE_CHARS} characters.
 * A value that ran past its first line or past the cut ends in "…", so the
 * reader knows there is more.
 */
export const quote = (value: string): string => {
  const [first = "", ...rest] = value.trim().split(LINE_BREAK);
  const line = first.trim();
  const more = rest.some((one) => one.trim() !== "");
  return line.length > QUOTE_CHARS
    ? `${line.slice(0, QUOTE_CHARS)}…`
    : `${line}${more ? "…" : ""}`;
};

/**
 * `value`'s one quoted line around `at`, the offset of what the message is
 * about: the line's {@link QUOTE_CHARS} characters that hold it, each end that
 * was cut marked "…".
 */
export const quoteAround = (value: string, at: number): string => {
  if (fitsQuote(value)) {
    return value;
  }
  const start = Math.max(0, Math.min(at - 20, value.length - QUOTE_CHARS));
  return `${start > 0 ? "…" : ""}${value.slice(start, start + QUOTE_CHARS)}${start + QUOTE_CHARS < value.length ? "…" : ""}`;
};
