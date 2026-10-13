/**
 * The house tokens for the overlay's shadow root, read when the overlay is
 * bundled (a Bun macro: `import … with { type: "macro" }`): the generated
 * `tokens.css` every page we serve shares (the decision-page kit's), its
 * comments and spacing stripped, written on `:host` where the file writes
 * `:root`. Every previewed page carries the overlay, so it carries the
 * tokens at a third of the file's size.
 */
import { readFileSync } from "node:fs";

const COMMENTS = /\/\*[\s\S]*?\*\//g;
const SPACES = /\s+/g;
/** Spacing a stylesheet does not need: round braces, semicolons and commas. A colon can be a descendant combinator's, so it keeps its. */
const AROUND = /\s*([{};,])\s*/g;
const ROOT = /:root/g;

export function hostTokens(): string {
  const css = readFileSync(
    new URL(
      "../../../hub/skills/decision-page/kit/tokens.css",
      import.meta.url
    ),
    "utf8"
  );
  return css
    .replace(COMMENTS, "")
    .replace(SPACES, " ")
    .replace(AROUND, "$1")
    .replace(ROOT, ":host")
    .trim();
}
