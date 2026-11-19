/**
 * Part of `bun run check`: a word the page writes on html, body or the
 * shell (an attribute, a class, a state such as `:hover`) sets only custom
 * properties registered `inherits: false`.
 *
 * Every element in the document descends from those three. A custom
 * property that inherits, set on one of them under such a word, changes
 * for every element when the word comes or goes, and each flip restyles the
 * whole document, every mounted tab included. `:root[data-scrim~="open"]`
 * set the screen edges' `--edge-*` on the root (app.css): opening a sheet or
 * a scrim, closing it and its removal each restyled 3,600 elements at 29
 * tabs, 355ms a flip in WebKit, 40ms in Firefox, where the four boxes that
 * read them (html, body, the two ScreenEdges strips) were all that changed.
 * Registered `inherits: false` and set on each box that reads it
 * (`:root[…]`, `:root[…] body`, `:root[…] [data-screen-edge]`), a flip
 * restyles those boxes alone: 5ms in WebKit, 4ms in Firefox.
 *
 * The colour scheme's own words (`.dark`, `[data-scheme]`) are the one
 * exception: a scheme flip changes every colour token, which every element
 * reads, so it restyles the document by design.
 *
 * A rule is caught when one of its selectors styles html, body or the
 * shell (its last compound is `:root`, `html`, `body` or
 * `[data-slot="shell"]`) and a compound naming one of them carries anything
 * more than the name: `:root[data-x]`, `html.y`, `:root[data-x] body`.
 * At-rules around it (a viewport `@media`) are no word the page writes and
 * are not read. It reads the CSS the build ships (lib/house-css.ts), and
 * every `@property` in it.
 *
 * Prints `file:line: selector --property` per declaration; exits 1 on any.
 */
import { AtRule, type Rule } from "postcss";
import selectorParser, { type Selector } from "postcss-selector-parser";
import { compoundsOf, fullSelector, readHouseCss } from "./lib/house-css";

// Read at run time beyond its imports (lib/house-css.ts); check.ts keys the
// check on them.
export const checkReads = ["apps/dashboard/", "node_modules/"];

/** The words of the colour scheme, whose flip restyles every element by design. */
const SCHEME_CLASSES = new Set(["dark"]);
const SCHEME_ATTRIBUTES = new Set(["data-scheme"]);
const SHELL = "shell";

type SelectorNode = selectorParser.Node;

/** Whether a compound names html, body or the shell. */
const namesTop = (compound: SelectorNode[]): boolean =>
  compound.some(
    (node) =>
      (node.type === "pseudo" && node.value.toLowerCase() === ":root") ||
      (node.type === "tag" &&
        ["html", "body"].includes(node.value.toLowerCase())) ||
      (node.type === "attribute" &&
        node.attribute === "data-slot" &&
        node.value === SHELL)
  );

/** Whether a node of a top compound is one of the scheme's words, or a `:not()`/`:is()`/`:where()` of only those. */
const isScheme = (node: SelectorNode): boolean => {
  if (node.type === "class") {
    return SCHEME_CLASSES.has(node.value);
  }
  if (node.type === "attribute") {
    return SCHEME_ATTRIBUTES.has(node.attribute);
  }
  return (
    node.type === "pseudo" &&
    [":not", ":is", ":where"].includes(node.value.toLowerCase()) &&
    node.nodes.every((inner) => inner.nodes.every(isScheme))
  );
};

/** Whether a node of a top compound only names it (`:root`, `html`, `body`, the shell's slot). */
const onlyNames = (node: SelectorNode): boolean =>
  node.type === "universal" || namesTop([node]);

/** Whether one complex selector styles html, body or the shell under a word written on one of them. */
function flips(selector: Selector): boolean {
  const compounds = compoundsOf(selector);
  const subject = compounds.at(-1) ?? [];
  if (!namesTop(subject)) {
    return false;
  }
  return compounds
    .filter(namesTop)
    .some((compound) =>
      compound.some((node) => !(onlyNames(node) || isScheme(node)))
    );
}

/** The selectors of a list that style a top box under a word written on one. */
const flipping = (list: string): string[] => {
  const out: string[] = [];
  selectorParser((root) => {
    for (const selector of root.nodes) {
      if (flips(selector)) {
        out.push(selector.toString().trim());
      }
    }
  }).processSync(list);
  return out;
};

const house = await readHouseCss();

/** Every registered property's `inherits`, across the house's sheets. */
const inherits = new Map<string, boolean>();
for (const { root } of house.sheets) {
  root.walkAtRules("property", (rule) => {
    rule.walkDecls("inherits", (decl) => {
      inherits.set(rule.params.trim(), decl.value.trim() !== "false");
    });
  });
}

interface Hit {
  file: string;
  line: number;
  text: string;
}
const hits: Hit[] = [];
for (const sheet of house.sheets) {
  sheet.root.walkRules((rule: Rule) => {
    if (rule.parent instanceof AtRule && rule.parent.name === "keyframes") {
      return;
    }
    const inheriting = rule.nodes
      .filter((node) => node.type === "decl" && node.prop.startsWith("--"))
      .map((node) => (node.type === "decl" ? node.prop : ""))
      .filter((prop) => inherits.get(prop) !== false);
    if (inheriting.length === 0) {
      return;
    }
    const selector = fullSelector(rule);
    for (const flipped of flipping(selector)) {
      for (const place of sheet.places(rule, selector)) {
        for (const prop of inheriting) {
          hits.push({ ...place, text: `${flipped} ${prop}` });
        }
      }
    }
  });
}

const unique = [
  ...new Map(hits.map((h) => [`${h.file}:${h.line}: ${h.text}`, h])).values(),
].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
if (unique.length > 0) {
  console.error(
    `root-flip: ${unique.length} custom propert(ies) inherit from html, body or the shell under a word written there, so each flip restyles every element in the document:`
  );
  for (const h of unique) {
    console.error(`  ${h.file}:${h.line}: ${h.text}`);
  }
  console.error(
    "Register each with `@property … { syntax: …; inherits: false }` and set it on each element that reads it, under the same word (app.css's screen edges: `:root[…]`, `:root[…] body`, `:root[…] [data-screen-edge]`) (apps/dashboard/scripts/root-flip-check.ts)."
  );
  process.exit(1);
}
console.log(
  `root-flip: no word written on html, body or the shell sets an inheriting custom property (${house.sheets.length} sheets, ${inherits.size} registered properties)`
);
