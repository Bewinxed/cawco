/**
 * Part of `bun run check`: a word the page writes on html, body or the
 * shell (an attribute, a class, a state such as `:hover`) restyles only the
 * boxes it styles. So a rule that styles one of the three under such a word
 * sets no custom property there, and one that styles html reads no `var()`.
 *
 * Every element in the document descends from those three. A custom
 * property that inherits, set on one of them under such a word, changes
 * for every element when the word comes or goes: `:root[data-scrim~="open"]`
 * set the screen edges' `--edge-*` on the root (app.css), and opening a
 * sheet or a scrim, closing it and its removal each restyled 3,600 elements
 * at 29 tabs, 355ms a flip in WebKit, 40ms in Firefox. Registered
 * `inherits: false`, WebKit and Firefox restyled the boxes that read them
 * alone (5ms, 4ms), but Chromium still restyled every element under the box
 * whose registered property changed, literal or not, wherever the page has
 * a `::selection` rule (2,004 of a 2,000-row body; outputs'
 * blink-registered-noninherited-subtree-restyle.html, work item 01a3cc2e),
 * and every element in the document whenever html's own style read a
 * `var()` and changed (2,010; a literal background: 4). html's and body's
 * edge colours are literals per state for that (scripts/screen-edges.ts);
 * the registered `--edge-*` stand on the two strips alone.
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
 * are not read. It reads the CSS the build ships (lib/house-css.ts).
 *
 * Prints `file:line: selector --property` per declaration; exits 1 on any.
 */
import selectorParser, { type Selector } from "postcss-selector-parser";
import {
  compoundsOf,
  fullSelector,
  placedOnce,
  readHouseCss,
  styleRules,
} from "./lib/house-css";

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
  // A pseudo-element of html (`:root::view-transition-old(root)`) is a box
  // of its own, not html.
  const pseudoElement = subject.some(
    (node) => node.type === "pseudo" && node.value.startsWith("::")
  );
  if (!namesTop(subject) || pseudoElement) {
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
const VAR = /\bvar\(/u;

/** Whether a selector's subject is html. */
const stylesHtml = (selector: string): boolean => {
  let html = false;
  selectorParser((root) => {
    const [only] = root.nodes;
    const subject = only ? (compoundsOf(only).at(-1) ?? []) : [];
    html = subject.some(
      (node) =>
        (node.type === "pseudo" && node.value.toLowerCase() === ":root") ||
        (node.type === "tag" && node.value.toLowerCase() === "html")
    );
  }).processSync(selector);
  return html;
};

interface Hit {
  file: string;
  line: number;
  text: string;
}
const hits: Hit[] = [];
for (const sheet of house.sheets) {
  for (const rule of styleRules(sheet.root)) {
    const declarations = rule.nodes.flatMap((node) =>
      node.type === "decl" ? [node] : []
    );
    if (declarations.length === 0) {
      continue;
    }
    const selector = fullSelector(rule);
    for (const flipped of flipping(selector)) {
      const html = stylesHtml(flipped);
      const wrong = declarations.filter(
        (decl) => decl.prop.startsWith("--") || (html && VAR.test(decl.value))
      );
      for (const place of wrong.length > 0
        ? sheet.places(rule, selector)
        : []) {
        for (const decl of wrong) {
          hits.push({
            ...place,
            text: decl.prop.startsWith("--")
              ? `${flipped} ${decl.prop}`
              : `${flipped} ${decl.prop}: ${decl.value}`,
          });
        }
      }
    }
  }
}

const unique = placedOnce(hits, (h) => h.text);
if (unique.length > 0) {
  console.error(
    `root-flip: ${unique.length} declaration(s) under a word written on html, body or the shell set a custom property there, or read var() on html, so in Chromium each flip restyles every element under it:`
  );
  for (const h of unique) {
    console.error(`  ${h.file}:${h.line}: ${h.text}`);
  }
  console.error(
    "Set the property on the element that reads it, under the same word (app.css's screen edges: `:root[…] [data-screen-edge]`), and give html and body literal values per state (scripts/screen-edges.ts) (apps/dashboard/scripts/root-flip-check.ts)."
  );
  process.exit(1);
}
console.log(
  `root-flip: no word written on html, body or the shell sets a custom property there or reads var() on html (${house.sheets.length} sheets)`
);
