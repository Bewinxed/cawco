/**
 * The dashboard's design tokens as plain CSS: the variables declared in
 * `apps/dashboard/src/lib/tokens/theme.css`'s `@theme static` block on
 * `:root`, and its scheme and pointer override blocks after them, in the
 * `theme` layer. Tailwind's `@theme` is no CSS a browser reads, so a build
 * or a check that wants the values as a stylesheet takes them from here.
 */
// A text import: the bundler embeds theme.css, so this works where the
// repository is not on disk (the compiled binary) and in a browser bundle.
import theme from "../../../apps/dashboard/src/lib/tokens/theme.css" with { type: "text" };

const STATIC = "@theme static {";
const OVERRIDES = "@layer theme {";
const RESET = /^\s*--\*:\s*initial;\s*$/gmu;

/** The text between the brace that opens at `open` and its match. */
function bodyAt(css: string, open: number): string {
  let depth = 0;
  for (let at = open; at < css.length; at += 1) {
    if (css[at] === "{") {
      depth += 1;
    } else if (css[at] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, at);
      }
    }
  }
  throw new Error("theme.css: a block is never closed");
}

export function themeVariablesCss(): string {
  const css = theme;
  const tokens = css.indexOf(STATIC);
  const overrides = css.indexOf(OVERRIDES);
  if (tokens < 0 || overrides < 0) {
    throw new Error("theme.css: no @theme static block or @layer theme block");
  }
  const variables = bodyAt(css, tokens + STATIC.length - 1).replace(RESET, "");
  const after = bodyAt(css, overrides + OVERRIDES.length - 1);
  return `@layer theme {\n  :root {${variables}  }\n${after}}\n`;
}
