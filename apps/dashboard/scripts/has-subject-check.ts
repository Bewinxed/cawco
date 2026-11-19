/**
 * Part of `bun run check`: a `:has()` stands only in its rule's subject, the
 * compound that names the element the rule styles.
 *
 * Blink keeps one invalidation set for every `:has()` that stands before a
 * combinator (`.a:has(.b) .c`, `:is(.a:has(.b) *)`, `:where(.a:has(.b)) > &`):
 * what such a rule styles to the right of its `:has()` is merged into it, and
 * every element any such `:has()` could anchor on (any ancestor that is
 * "affected by non-subject :has") invalidates by that one set whenever a node
 * is added, removed or changed under it. One rule whose right side is `*` or
 * a descendant makes the set "invalidate the whole subtree": in the 29-tab
 * bench a node added under the composer's dock restyled every element under
 * it, find's 500 places with them (work item 4438cb67's trace, "Invalidation
 * set invalidates subtree … allDescendantsMightBeInvalid"). A `:has()` in the
 * subject (`.a:has(.b)`, Tailwind's `has-*:`) invalidates only its anchor.
 * What a descendant should take from such an anchor, the anchor hands down:
 * its own `:has()` sets a custom property or the descendant reads an
 * attribute the anchor carries.
 *
 * It reads the CSS the build ships, as the build makes it (lib/house-css.ts:
 * every utility under every variant, the house's sheets and components'
 * styles, a library's own sheet left to the library), and each
 * `@custom-variant` the entries' sheets declare, compiled on a probe
 * utility, so a definition fails where it stands even while nothing uses it.
 * Nested rules are read as the browser resolves them (`&` is its parent).
 *
 * Prints `file:line: selector` per rule; exits 1 on any.
 */
import { readFileSync } from "node:fs";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import postcss, { AtRule, type Rule } from "postcss";
import selectorParser, { type Selector } from "postcss-selector-parser";
import {
  compoundsOf,
  fullSelector,
  lineAt,
  type Place,
  readHouseCss,
  rel,
} from "./lib/house-css";

// Read at run time beyond its imports (lib/house-css.ts); check.ts keys the
// check on them.
export const checkReads = ["apps/dashboard/", "node_modules/"];

const CUSTOM_VARIANT = /@custom-variant\s+([\w-]+)/gu;
/** What a probe utility under a custom variant is: one that always compiles. */
const PROBE = "block";
const NODE_MODULES = "/node_modules/";

/* ------------------------------------------------------------ the rule */

const PSEUDO_HAS = ":has";

/** Whether a `:has()` stands anywhere in the nodes, its arguments included. */
const holdsHas = (nodes: selectorParser.Node[]): boolean =>
  nodes.some(
    (node) =>
      (node.type === "pseudo" && node.value.toLowerCase() === PSEUDO_HAS) ||
      (selectorParser.isContainer(node) && holdsHas(node.nodes))
  );

/**
 * Whether one complex selector puts a `:has()` before a combinator: in any
 * compound but its last, or so inside a selector argument of its last
 * (`:is(.a:has(.b) *)`, `:not(.a:has(.b) .c)`).
 */
function outsideSubject(selector: Selector): boolean {
  const compounds = compoundsOf(selector);
  const subject = compounds.pop() ?? [];
  if (compounds.some(holdsHas)) {
    return true;
  }
  return subject.some(
    (node) =>
      selectorParser.isPseudo(node) &&
      node.value.toLowerCase() !== PSEUDO_HAS &&
      node.nodes.some(outsideSubject)
  );
}

/** The selectors of a list that put a `:has()` outside their subject. */
const offending = (list: string): string[] => {
  if (!list.includes(":has(")) {
    return [];
  }
  const out: string[] = [];
  selectorParser((root) => {
    for (const selector of root.nodes) {
      if (outsideSubject(selector)) {
        out.push(selector.toString().trim());
      }
    }
  }).processSync(list);
  return out;
};

interface Hit {
  file: string;
  line: number;
  selector: string;
}

/** Each rule in the CSS whose selector puts a `:has()` outside its subject, and each `@scope` that asks one. */
function scan(
  css: postcss.Root,
  at: (node: Rule | AtRule, selector: string) => Place[]
): Hit[] {
  const hits: Hit[] = [];
  css.walkRules((rule) => {
    if (rule.parent instanceof AtRule && rule.parent.name === "keyframes") {
      return;
    }
    for (const selector of offending(fullSelector(rule))) {
      for (const place of at(rule, selector)) {
        hits.push({ ...place, selector });
      }
    }
  });
  css.walkAtRules("scope", (scope) => {
    if (scope.params.includes(":has(")) {
      const selector = `@scope ${scope.params}`;
      for (const place of at(scope, selector)) {
        hits.push({ ...place, selector });
      }
    }
  });
  return hits;
}

/* ------------------------------------------------------------ the sheets */

const house = await readHouseCss();
const hits: Hit[] = house.sheets.flatMap((sheet) =>
  scan(sheet.root, sheet.places)
);

// Every custom variant an entry's sheets declare, on a probe utility.
for (const entry of house.entries) {
  const design = await __unstable__loadDesignSystem(entry.text, {
    base: entry.base,
  });
  for (const dep of entry.deps) {
    if (!dep.endsWith(".css") || dep.includes(NODE_MODULES)) {
      continue;
    }
    const sheet = readFileSync(dep, "utf8");
    for (const match of sheet.matchAll(CUSTOM_VARIANT)) {
      const [, name] = match;
      const [out] = name ? design.candidatesToCss([`${name}:${PROBE}`]) : [];
      if (!out) {
        continue;
      }
      const line = lineAt(sheet, match.index);
      for (const hit of scan(postcss.parse(out), () => [
        { file: rel(dep), line },
      ])) {
        hits.push({
          ...hit,
          selector: `@custom-variant ${name}: ${hit.selector}`,
        });
      }
    }
  }
}

const unique = [
  ...new Map(
    hits.map((h) => [`${h.file}:${h.line}: ${h.selector}`, h] as const)
  ).values(),
].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
if (unique.length > 0) {
  console.error(
    `has-subject: ${unique.length} rule(s) put a :has() outside their subject, where Blink's one shared :has() invalidation set restyles a whole subtree under every anchor:`
  );
  for (const h of unique) {
    console.error(`  ${h.file}:${h.line}: ${h.selector}`);
  }
  console.error(
    "Ask the :has() of the element it anchors on, and hand what its descendants need down from there: the anchor's own `:has()` sets a custom property they read, or the anchor carries an attribute they read (scripts/has-subject-check.ts)."
  );
  process.exit(1);
}
console.log(
  `has-subject: every :has() the house writes (the dashboard's ${house.entries.length} Tailwind entries with their utilities, its ${house.srcSheets} stylesheets, its components' styles, the other apps' and packages' stylesheets) stands in its rule's subject`
);
