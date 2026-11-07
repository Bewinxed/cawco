/**
 * A private mark: words between `<private>` and `</private>` in anything a
 * person or an agent writes are never stored (Memgraph's Context Graph,
 * https://memgraph.com/docs/ai-ecosystem/ai-memory/privacy: "Text between
 * `<private>` and `</private>` is removed … What it removes is never
 * stored."). The hub strips them where it keeps words: a project folder's
 * files and commit messages (a task's text, reason and comments, a memory
 * note), a work item's brief and title; and the secret filter masks them
 * where it answers (hub secret-filter.ts). The tags are read in any case; a
 * `<private>` never closed hides everything after it, since its writer
 * meant the rest to stay out.
 */

/** A private span: a closed pair, or an open tag to the end. */
const PRIVATE_SPAN = /<private>[\s\S]*?(?:<\/private>|$)/giu;

/** Where each private span stands in `text`, in order. */
export const privateRanges = (text: string): [start: number, end: number][] =>
  [...text.matchAll(PRIVATE_SPAN)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);

/** `text` without its private spans, tags and all. */
export const stripPrivate = (text: string): string =>
  text.includes("<") ? text.replace(PRIVATE_SPAN, "") : text;
