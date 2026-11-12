// house/no-not-hover: Tailwind's `not-hover:` is never written; the house's
// `unhovered:` says "not under the pointer".
//
// The house redefines `hover` as `@media (hover: hover) and (pointer: fine)`
// around `&:hover` (lib/tokens/variants.css). Tailwind's `not-hover:` negates
// that whole variant, media query included, into
// `@media not (hover: hover) and (pointer: fine)`: `not` before a list joined
// by `and` is no valid media query (Media Queries 4, `<media-not>` takes one
// condition in parentheses). Lightning CSS refused it in the decision host's
// sheet (bar-item.svelte's open state, tsk-354); the dashboard's build let it
// through. `unhovered:` (variants.css, `&:not(:hover)`) is the selector alone.
import { sitesOf } from "./classes.mjs";
import { ds } from "./tailwind.mjs";

const MESSAGE =
  "Tailwind's not-hover: negates the house's hover variant, media query included, into an invalid media query (`@media not (hover: hover) and (pointer: fine)`): write unhovered: (lib/tokens/variants.css), not under the pointer whatever the pointer (scripts/lint/design/not-hover.mjs).";

const seen = new Map();
/** Whether a class carries the `not-hover` variant. */
function negatesHover(name) {
  if (!seen.has(name)) {
    let parsed = null;
    try {
      [parsed] = ds.parseCandidate(name);
    } catch {
      parsed = null;
    }
    seen.set(
      name,
      (parsed?.variants ?? []).some((v) => ds.printVariant(v) === "not-hover")
    );
  }
  return seen.get(name);
}

/** The findings of house/no-not-hover in a file. */
export function notHover(model) {
  const findings = [];
  const at = new Set();
  for (const site of sitesOf(model)) {
    for (const entry of site.entries ?? []) {
      if (at.has(entry.start) || !negatesHover(entry.name)) {
        continue;
      }
      at.add(entry.start);
      findings.push({ start: entry.start, end: entry.end, message: MESSAGE });
    }
  }
  return findings;
}
