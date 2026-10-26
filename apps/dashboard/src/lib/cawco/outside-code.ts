/**
 * A message's words outside its code: what the transcript rewrites before
 * the markdown draws it (a skill's `/name` as its code span, skill-chips.ts;
 * a mention as its reference, find/mention.svelte.ts), leaving fenced code
 * and code spans as written.
 */

/** A fence's opening or closing line (markdown.svelte's own). */
const FENCE = /^\s{0,3}(`{3,}|~{3,})/u;
/** A line cut at its code spans: every odd part is one. */
const CODE_SPAN = /(`+[^`]*?`+)/u;

/** `source` with `change` run over each run of words outside fenced code and code spans. */
export function outsideCode(
  source: string,
  change: (words: string) => string
): string {
  let fence: string | null = null;
  return source
    .split("\n")
    .map((line) => {
      const marker = line.match(FENCE)?.[1];
      if (marker && (fence === null || marker.startsWith(fence))) {
        fence = fence === null ? marker : null;
        return line;
      }
      if (fence !== null) {
        return line;
      }
      return line
        .split(CODE_SPAN)
        .map((part, i) => (i % 2 === 1 ? part : change(part)))
        .join("");
    })
    .join("\n");
}
