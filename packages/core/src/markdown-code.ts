/**
 * Where a markdown text's fenced code is, read by marked's block lexer (a
 * CommonMark reader): a fence opens on up to three spaces and three or more
 * backticks or tildes, and closes on a run of the same character at least
 * as long with nothing after it but whitespace. The product's one fence
 * reader: a line-by-line reader of markdown (a task file's sections and
 * comment entries, a heading rewrite, the transcript's words outside code,
 * its blocks and the steps it draws a message in) asks here which lines are
 * code before it reads a line as structure.
 */

import { Lexer, type Token, type Tokens } from "marked";

const CR = /\r/gu;
const NEWLINE = /\n/gu;
/** A fence's marker as it stands on its opening line: three or more backticks or tildes. */
const MARKER = /`{3,}|~{3,}/u;
/** A line after the text that ends inside a fence becomes that fence's code. */
const PROBE = "\nprobe";

/** `text` as marked reads it: every CR dropped, so its lines are the ones `split("\n")` gives. */
const normal = (text: string): string => text.replace(CR, "");

const newlines = (raw: string): number => raw.match(NEWLINE)?.length ?? 0;

/** A fenced code block, as marked's tokens hold it. */
const isFence = (token: Token): token is Tokens.Code =>
  token.type === "code" && token.codeBlockStyle !== "indented";

const isList = (token: Token): token is Tokens.List => token.type === "list";

const isQuote = (token: Token): token is Tokens.Blockquote =>
  token.type === "blockquote";

const SPACE = /\s/u;

/** One fenced code block in a text, by the lines `split("\n")` gives. */
export interface FencedBlock {
  /** Its code as written, without its fences or the indentation its opener had. */
  code: string;
  /** Its opening fence's line. */
  from: number;
  /** Its info string, trimmed: its language and what follows it. */
  info: string;
  /** Its info string's first word. */
  lang: string;
  /** What its info string holds after its first word. */
  meta: string;
  /** The line after its last one: its closing fence's, or the text's last line's when it is left open. */
  to: number;
}

/**
 * The fences under `tokens`, the first of which starts on line `line`, at
 * any depth: a list item's and a quote's tokens are read from their text
 * with the item's indentation or the quote's marks taken off, line for line,
 * so a block's lines are counted from its container's first.
 */
const fencesIn = (
  tokens: readonly Token[],
  line: number,
  found: FencedBlock[]
): void => {
  let at = line;
  for (const token of tokens) {
    const breaks = newlines(token.raw);
    if (isFence(token)) {
      const info = token.lang?.trim() ?? "";
      const space = info.search(SPACE);
      found.push({
        from: at,
        // Its lines: one per line break, and the last line when the text ends on it.
        to: at + breaks + (token.raw.endsWith("\n") ? 0 : 1),
        info,
        lang: space === -1 ? info : info.slice(0, space),
        meta: space === -1 ? "" : info.slice(space + 1).trim(),
        code: token.text,
      });
    } else if (isList(token)) {
      let item = at;
      for (const entry of token.items) {
        fencesIn(entry.tokens, item, found);
        item += newlines(entry.raw);
      }
    } else if (isQuote(token)) {
      fencesIn(token.tokens, at, found);
    }
    at += breaks;
  }
};

/**
 * Every fenced code block in `text`, in order, a fence in a list item or a
 * quote included. A fence still open at the end holds every line after it,
 * its code as far as it goes.
 */
export const fencedBlocks = (
  text: string | readonly string[]
): FencedBlock[] => {
  const found: FencedBlock[] = [];
  fencesIn(
    Lexer.lex(normal(typeof text === "string" ? text : text.join("\n"))),
    0,
    found
  );
  return found;
};

/**
 * For each of `text`'s lines (`split("\n")`), whether it belongs to a fenced
 * code block ({@link fencedBlocks}), its opening and closing fence lines
 * included.
 */
export const fencedLines = (text: string | readonly string[]): boolean[] => {
  const lines = (typeof text === "string" ? text.split("\n") : text).length;
  const fenced: boolean[] = new Array(lines).fill(false);
  for (const block of fencedBlocks(text)) {
    fenced.fill(true, block.from, block.to);
  }
  return fenced;
};

/**
 * `text` with each fence `rename` gives a new info string opened under that
 * info string; every other line as written. Its opener keeps whatever
 * stands before its marker (indentation, a list item's or a quote's marks).
 */
export const renameFences = (
  text: string,
  rename: (block: FencedBlock) => string | null
): string => {
  const lines = text.split("\n");
  for (const block of fencedBlocks(text)) {
    const info = rename(block);
    const line = lines[block.from];
    if (info === null || line === undefined) {
      continue;
    }
    const opener = line.replace(CR, "").trimEnd();
    // The marker: the first run of three or more backticks or tildes after
    // the line's container marks, the run the lexer read as this fence.
    const start = opener.search(MARKER);
    if (start === -1) {
      continue;
    }
    const char = opener[start];
    let end = start;
    while (opener[end] === char) {
      end += 1;
    }
    lines[block.from] = `${opener.slice(0, end)}${info}`;
  }
  return lines.join("\n");
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
