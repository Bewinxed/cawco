/**
 * How `record_pick` reads the person's words it cites (service.ts `cite`):
 * the message a ref names, and whether a quote stands in what he wrote.
 */

/** A find ref's mark before its record (find-tool.ts `refOf`). */
const REF_MARK = "#";
/** A find ref's mark before when it was said. */
const AT_MARK = "@";

/**
 * The record a message ref names: a find hit's ref
 * (`<hit id>#<record>@<when>`) read back to its record, or the id itself
 * when it is one (a send's uuid, its harness's id).
 */
export const recordOfRef = (ref: string): string => {
  const hash = ref.lastIndexOf(REF_MARK);
  const record = hash < 0 ? ref : ref.slice(hash + 1);
  const at = record.lastIndexOf(AT_MARK);
  return (at < 0 ? record : record.slice(0, at)).trim();
};

const SPACES = /\s+/gu;

/** Words as they compare: one form of each character, every run of space one space. */
const plain = (words: string): string =>
  words.normalize("NFC").replace(SPACES, " ").trim();

/**
 * Whether `quote` stands in `text` as he wrote it: the same words in the
 * same order, line breaks and runs of space read as one space. Case and
 * punctuation count, so a quote is his words, never a paraphrase.
 */
export const quoteIn = (quote: string, text: string): boolean => {
  const wanted = plain(quote);
  return wanted.length > 0 && plain(text).includes(wanted);
};
