/**
 * A source file's syntax as TypeScript reads it, a Svelte component's
 * `<script>` blocks included: what the checks that read code's shape parse
 * (import-graph.ts, escape-hatch-ratchet.ts, stale-references-check.ts).
 */
import ts from "typescript";

const SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/gu;
const SVELTE = /\.svelte$/u;

/**
 * A file's source as TypeScript reads it: a component's `<script>` blocks
 * in place, everything else blanked, so a line number is the file's own.
 */
const scriptOf = (file: string, text: string): string => {
  if (!SVELTE.test(file)) {
    return text;
  }
  let out = text.replace(/[^\n]/gu, " ");
  for (const match of text.matchAll(SCRIPT)) {
    const body = match[1] ?? "";
    const at = (match.index ?? 0) + match[0].indexOf(body);
    out = out.slice(0, at) + body + out.slice(at + body.length);
  }
  return out;
};

/** A file's syntax tree, a component's scripts in place. */
export const parsed = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(
    SVELTE.test(file) ? `${file}.ts` : file,
    scriptOf(file, text),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

/** A config's comments: block, or line where `//` follows no `:` (a URL) or `"`. */
const CONFIG_COMMENT = /\/\*[\s\S]*?\*\/|(?<![:"])\/\/[^\n]*/gu;
const MARKUP_COMMENT = /<!--[\s\S]*?-->/gu;
const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gu;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;

/** A comment: where it starts in its file, and its text. */
export interface Comment {
  at: number;
  text: string;
}

/** Every comment the syntax tree holds, each once, read as TypeScript reads trivia. */
const codeComments = (source: ts.SourceFile): Comment[] => {
  const found = new Map<number, Comment>();
  const { text } = source;
  const take = (ranges: ts.CommentRange[] | undefined): void => {
    for (const range of ranges ?? []) {
      found.set(range.pos, {
        at: range.pos,
        text: text.slice(range.pos, range.end),
      });
    }
  };
  const visit = (node: ts.Node): void => {
    take(ts.getLeadingCommentRanges(text, node.getFullStart()));
    take(ts.getTrailingCommentRanges(text, node.getEnd()));
    ts.forEachChild(node, visit);
  };
  visit(source);
  take(ts.getLeadingCommentRanges(text, source.endOfFileToken.getFullStart()));
  return [...found.values()].sort((a, b) => a.at - b.at);
};

/**
 * Every comment in a file: the code's (a component's script, markup and
 * style comments included), a config's `//` and block comments, or a Markdown
 * file whole.
 */
export const commentsOf = (file: string, text: string): Comment[] => {
  if (file.endsWith(".md")) {
    return [{ at: 0, text }];
  }
  if (!CODE.test(file)) {
    return [...text.matchAll(CONFIG_COMMENT)].map((match) => ({
      at: match.index ?? 0,
      text: match[0],
    }));
  }
  const found = codeComments(parsed(file, text));
  if (file.endsWith(".svelte")) {
    for (const match of text.matchAll(MARKUP_COMMENT)) {
      found.push({ at: match.index ?? 0, text: match[0] });
    }
    for (const style of text.matchAll(STYLE)) {
      const start = (style.index ?? 0) + style[0].indexOf(style[1] ?? "");
      for (const match of (style[1] ?? "").matchAll(BLOCK_COMMENT)) {
        found.push({ at: start + (match.index ?? 0), text: match[0] });
      }
    }
  }
  return found;
};
