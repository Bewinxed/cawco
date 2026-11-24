/**
 * A message's words outside its code: what the transcript rewrites before
 * the markdown draws it (a skill's `/name` as its code span, the
 * dashboard's skill-chips.ts; a mention as its reference, its
 * find/mention.svelte.ts), and where a delivery looks for the skills a
 * message names (skill-words.ts). Fenced code (markdown-code.ts) and code
 * spans are never words.
 */
import { fencedLines } from "./markdown-code";

/** A line cut at its code spans: every odd part is one. */
const CODE_SPAN = /(`+[^`]*?`+)/u;

/** `source` with its words through `words` and its code through `code`, line for line. */
const eachRun = (
  source: string,
  words: (run: string) => string,
  code: (run: string) => string
): string => {
  const fenced = fencedLines(source);
  return source
    .split("\n")
    .map((line, at) =>
      fenced[at]
        ? code(line)
        : line
            .split(CODE_SPAN)
            .map((part, i) => (i % 2 === 1 ? code(part) : words(part)))
            .join("")
    )
    .join("\n");
};

/** `source` with `change` run over each run of words outside fenced code and code spans. */
export const outsideCode = (
  source: string,
  change: (words: string) => string
): string => eachRun(source, change, (run) => run);

/**
 * `source` with its code written over by spaces, each character by one: its
 * words stand where they stood, so an offset found in it is one in `source`.
 */
export const codeBlanked = (source: string): string =>
  eachRun(
    source,
    (run) => run,
    (run) => " ".repeat(run.length)
  );
