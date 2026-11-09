/**
 * A source file's syntax as TypeScript reads it, a Svelte component's
 * `<script>` blocks included: what the checks that read code's shape parse
 * (import-graph.ts, swallow-cast-ratchet.ts, stale-references-check.ts).
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
