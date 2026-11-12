// house/no-style-underscore-spaces: a `calc()`, `min()`, `max()` or `clamp()`
// in plain CSS never writes its operators with underscores.
//
// Tailwind spells a space `_` inside a class's `[…]` (`w-[calc(var(--spacing)_*_2)]`);
// in a `style` attribute, a `style:` directive or a `<style>` block the same
// text is no CSS: the browser drops the declaration (cea5d837e's codemod
// wrote it there, scripts/codemods/style-spaces.ts rewrote it). Classes are
// not read here; their spelling is Tailwind's.
import { eachNode } from "./model.mjs";

const OPENER = /\b(?:calc|min|max|clamp)\(/gu;
const JOINED = /_[-+*/]_/u;

/** The `fn(…)` that opens at `at` in `text`, to its closing parenthesis. */
function callAt(text, at) {
  let depth = 0;
  for (let i = text.indexOf("(", at); i < text.length; i += 1) {
    if (text[i] === "(") {
      depth += 1;
    } else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(at, i + 1);
      }
    }
  }
  return text.slice(at);
}

/** The outermost refused calls in `[start, end)` of the file's text. */
function refusedIn(text, start, end, findings) {
  const part = text.slice(start, end);
  let from = 0;
  for (const m of part.matchAll(OPENER)) {
    if ((m.index ?? 0) < from) {
      continue;
    }
    const call = callAt(part, m.index ?? 0);
    from = (m.index ?? 0) + call.length;
    if (JOINED.test(call)) {
      findings.push({
        start: start + (m.index ?? 0),
        end: start + from,
        message: `"${call}" writes spaces as underscores outside a class, so the browser drops it; write real spaces.`,
      });
    }
  }
}

/** The findings of house/no-style-underscore-spaces in a file. */
export function styleSpaces(model) {
  const findings = [];
  if (model.kind !== "svelte") {
    return findings;
  }
  eachNode(model, (node) => {
    if (
      node.type === "StyleDirective" ||
      (node.type === "Attribute" && node.name === "style")
    ) {
      refusedIn(model.text, node.start, node.end, findings);
    }
  });
  const { css } = model.ast;
  if (css) {
    refusedIn(model.text, css.start, css.end, findings);
  }
  return findings;
}
