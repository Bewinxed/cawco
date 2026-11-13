/**
 * A page's words as runs: its text as written, and each `cawco:` reference
 * in it (`[label](cawco:<kind>/<id>)`, core references.ts) with its
 * destination and its written label, read by marked's inline lexer, the
 * one CommonMark reader the transcript's markdown reads links by
 * (svelte-streamdown). Only a reference is taken out of the words: every
 * other token, a link to any other address among them, stays the
 * characters it was written as, so words with no reference read exactly
 * as written.
 */
import { Lexer } from "marked";
import { writtenLabel } from "../../markdown-fleet";

/** A run of a page's words: text as written, or a reference. */
export type Run = { text: string } | { href: string; label: string };

/** What every reference's destination starts with. */
const SCHEME = "](cawco:";

/** `text`'s runs, in order: one text run when it names no reference. */
export function runsOf(text: string): Run[] {
  if (!text.includes(SCHEME)) {
    return [{ text }];
  }
  const runs: Run[] = [];
  let written = "";
  for (const token of Lexer.lexInline(text)) {
    if (token.type === "link" && token.href.startsWith("cawco:")) {
      if (written) {
        runs.push({ text: written });
        written = "";
      }
      runs.push({ href: token.href, label: writtenLabel(token.text) });
    } else {
      written += token.raw;
    }
  }
  if (written) {
    runs.push({ text: written });
  }
  return runs;
}

/** `text` as words alone, each reference its written label: a name said to a reader (an aria-label). */
export const plainOf = (text: string): string =>
  runsOf(text)
    .map((run) => ("href" in run ? run.label : run.text))
    .join("");
