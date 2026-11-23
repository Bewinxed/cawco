/**
 * Where a markdown text's fenced code is, read by marked's block lexer (a
 * CommonMark reader): a fence opens on up to three spaces and three or more
 * backticks or tildes, and closes on a run of the same character at least
 * as long with nothing after it but whitespace. A line-by-line reader of
 * markdown (a task file's sections and comment entries, a heading rewrite)
 * asks here which lines are code before it reads a line as structure.
 */

import { Lexer, type Token } from "marked";

const CR = /\r/gu;
const NEWLINE = /\n/gu;
/** A line after the text that ends inside a fence becomes that fence's code. */
const PROBE = "\nprobe";

/** `text` as marked reads it: every CR dropped, so its lines are the ones `split("\n")` gives. */
const normal = (text: string): string => text.replace(CR, "");

const newlines = (raw: string): number => raw.match(NEWLINE)?.length ?? 0;

/** A fenced code block, as marked's top-level tokens hold it. */
const isFence = (token: Token): token is Token & { type: "code" } =>
  token.type === "code" && token.codeBlockStyle !== "indented";

/**
 * For each of `text`'s lines (`split("\n")`), whether it belongs to a fenced
 * code block, its opening and closing fence lines included. A fence still
 * open at the end holds every line after it. Only top-level fences count: a
 * fence inside a list item or quote holds only lines indented into it or
 * marked as quoted, so a line at the margin always ends it.
 */
export const fencedLines = (text: string | readonly string[]): boolean[] => {
  const source = normal(typeof text === "string" ? text : text.join("\n"));
  const fenced = source.split("\n").map(() => false);
  let line = 0;
  for (const token of Lexer.lex(source)) {
    const breaks = newlines(token.raw);
    if (isFence(token)) {
      // Its lines: one per line break, and the last line when the text ends on it.
      fenced.fill(
        true,
        line,
        line + breaks + (token.raw.endsWith("\n") ? 0 : 1)
      );
    }
    line += breaks;
  }
  return fenced;
};

/** `text` with `change` run over each of its lines outside fenced code; fenced lines stay as written. */
export const outsideFences = (
  text: string,
  change: (line: string) => string
): string => {
  const fenced = fencedLines(text);
  return text
    .split("\n")
    .map((line, at) => (fenced[at] ? line : change(line)))
    .join("\n");
};

/** Whether a line of `text` outside fenced code matches `pattern`. */
export const someLineOutsideFences = (
  text: string,
  pattern: RegExp
): boolean => {
  const fenced = fencedLines(text);
  return text.split("\n").some((line, at) => !fenced[at] && pattern.test(line));
};

/**
 * `text` with a fence it leaves open closed on a line of its own, the same
 * character as its opener and as long: what the open fence means where
 * `text` stands alone (CommonMark closes it at the end of its container),
 * kept when `text` is set inside a longer document.
 */
export const closeFences = (text: string): string => {
  const last = Lexer.lex(normal(text) + PROBE).at(-1);
  if (!(last && isFence(last) && last.raw.endsWith(PROBE))) {
    return text;
  }
  const opener = last.raw.trimStart();
  const char = opener[0] ?? "`";
  let length = 0;
  while (opener[length] === char) {
    length += 1;
  }
  return `${text}\n${char.repeat(length)}`;
};
