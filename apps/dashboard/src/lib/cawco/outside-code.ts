/**
 * A message's words outside its code: what the transcript rewrites before
 * the markdown draws it (a skill's `/name` as its code span, skill-chips.ts;
 * a mention as its reference, find/mention.svelte.ts), leaving fenced code
 * (core markdown-code.ts) and code spans as written.
 */
import { fencedLines } from "@cawco/core/markdown-code";

/** A line cut at its code spans: every odd part is one. */
const CODE_SPAN = /(`+[^`]*?`+)/u;

/** `source` with `change` run over each run of words outside fenced code and code spans. */
export function outsideCode(
  source: string,
  change: (words: string) => string
): string {
  const fenced = fencedLines(source);
  return source
    .split("\n")
    .map((line, at) =>
      fenced[at]
        ? line
        : line
            .split(CODE_SPAN)
            .map((part, i) => (i % 2 === 1 ? part : change(part)))
            .join("")
    )
    .join("\n");
}
