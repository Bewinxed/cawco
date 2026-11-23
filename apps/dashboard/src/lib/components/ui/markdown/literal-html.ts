/**
 * Markdown whose raw HTML reads as the text it is. Words leaves raw HTML
 * out of what it draws, so an agent writing about `<details>` or `<Row>`
 * would lose the words; here each tag's `<` is written as `&lt;`, which
 * markdown draws as the character, and the tag reads as typed and never
 * runs. A comment is a note to whoever edits the file and draws nothing, as
 * markdown has it. Fenced code and code spans are left as written, and so is
 * an autolink (`<https://…>`), whose `<` opens no tag.
 *
 * The one tag read is `<br>`, a line break, which a table's cell can hold
 * where markdown can't break a line: it is written as {@link BREAK}, which
 * the markdown draws as a `<br>`.
 *
 * `\(…\)` is an agent's parenthesis or a formula's delimiter, never an
 * escape: its backslashes are kept, so it reads as the characters typed.
 */

import { fencedLines } from "@cawco/core/markdown-code";

/** A code span: a run of backticks, what it holds, and a run as long. */
const CODE_SPAN = /(`+)[\s\S]*?(?<!`)\1(?!`)/gu;
const COMMENT = /<!--[\s\S]*?-->/gu;
/**
 * The `<` of an open or closing tag, a processing instruction, a
 * declaration or CDATA (CommonMark's raw HTML), outside a link's `](<…>)`
 * destination. A tag still streaming in (`<det`) counts.
 */
const TAG_OPEN =
  /(?<!\]\()<(?=[A-Za-z][A-Za-z0-9-]*(?:[\s/>]|$)|\/[A-Za-z]|\?|![A-Za-z[])/gu;
const PAREN_MATH = /\\\(([^\n]*?)\\\)/gu;
const BR = /<br\s*\/?>/giu;

/** Where a `<br>` breaks the line: a private-use character no one types. */
export const BREAK = "\uE000";

const literalRun = (words: string): string =>
  words
    .replace(COMMENT, "")
    .replace(BR, BREAK)
    .replace(TAG_OPEN, "&lt;")
    .replace(PAREN_MATH, "\\\\($1\\\\)");

/** Words outside code spans, each run made literal. */
function outsideSpans(text: string): string {
  let out = "";
  let from = 0;
  for (const span of text.matchAll(CODE_SPAN)) {
    out += literalRun(text.slice(from, span.index)) + span[0];
    from = span.index + span[0].length;
  }
  return out + literalRun(text.slice(from));
}

/** `source` with its raw HTML written as text, outside fenced code and code spans. */
export function literalHtml(source: string): string {
  if (!(source.includes("<") || source.includes("\\("))) {
    return source;
  }
  const out: string[] = [];
  let prose: string[] = [];
  const flush = () => {
    if (prose.length > 0) {
      out.push(outsideSpans(prose.join("\n")));
      prose = [];
    }
  };
  const fenced = fencedLines(source);
  for (const [at, line] of source.split("\n").entries()) {
    if (fenced[at]) {
      flush();
      out.push(line);
    } else {
      prose.push(line);
    }
  }
  flush();
  return out.join("\n");
}
