/**
 * Part of `bun run check`: Blink can set every house rule aside early for an
 * element it does not style, by the rule's key or by the element's
 * ancestors.
 *
 * Blink files each selector of a rule under one key read off its right-most
 * compound (rule_set.cc `FindBestBucketAndAdd`): an id, a class, an
 * attribute, a tag, or one of a few pseudo-classes and UA pseudo-elements
 * (`:root`, `:focus`, `:focus-visible`, `:link`, `::placeholder`,
 * `::file-selector-button`, the scrollbar parts). Restyling an element reads
 * only the buckets of its own id, classes, attributes and tag, and every rule
 * in the universal bucket: a compound that names none of those
 * (`:is(.a > *)`, Tailwind's `*:` and `divide-*`, `[data-slot=x] >
 * :first-child`, `:where(a, b)`, a bare `::before`). A universal rule is
 * still set aside without running its selector when an element has no
 * ancestor it names: Blink keeps a bloom filter of the ids, classes, tags and
 * attribute names on the element's ancestors, and checks the ones each rule
 * names left of its key against it (selector_filter.cc
 * `CollectDescendantCompoundSelectorIdentifierHashes`; a sibling's compound
 * and the key compound's own `:is()` are not read). In the 29-tab bench each
 * restyled element checked about 170 universal selectors that nothing set
 * aside, 10,826 attempts for 61 restyles of one row (work item dab9f694's
 * SelectorStats), 8 to 10 µs an element; without them, about 5.
 *
 * So a selector fails when its key names nothing and no compound left of it
 * names an ancestor most elements lack. Read as Blink reads it: a compound's
 * simple selectors in order, a pseudo-element that makes a box of its own
 * (`::before`, `::after`, `::marker`, `::backdrop`) ending the read (so
 * `.a::before` is filed under `.a`, `::before` alone under nothing), and a
 * single-argument `:is()`/`:where()`/`&` read as its argument
 * (`:is(.a > *)` names nothing; `:is(.a, .b)` names nothing either). Nested
 * rules are read as the browser resolves them (lib/house-css.ts
 * `fullSelector`). Three kinds pass: `*` alone and `::selection` alone
 * (`PASSES` says why), and Tailwind's `@layer properties` fallback, under
 * an `@supports` no browser with `@property` matches. Tailwind's `*:` and
 * `**:` variants fail whatever they name past them: they write their class
 * inside the key, where the filter never reads it.
 *
 * It reads the CSS the build ships (lib/house-css.ts): the dashboard's
 * Tailwind entries with every utility under every variant, its stylesheets,
 * its components' styles, the other apps' and packages' stylesheets. A
 * library's own sheet is the library's and is passed over.
 *
 * Prints `file:line: selector` per selector; exits 1 on any.
 */
import { AtRule, type Node, type Rule } from "postcss";
import selectorParser, { type Selector } from "postcss-selector-parser";
import {
  fullSelector,
  placedOnce,
  readHouseCss,
  styleRules,
} from "./lib/house-css";

// Read at run time beyond its imports (lib/house-css.ts); check.ts keys the
// check on them.
export const checkReads = ["apps/dashboard/", "node_modules/"];

type SelectorNode = selectorParser.Node;

/*
 * Names on most elements' ancestors, which set no rule aside: each one
 * counted on the ancestors of the 29-tab bench's 9,285 elements under body
 * (work item 01a3cc2e, 19 Nov 2026), the ones on more than half of them.
 */
const COMMON_TAGS: [string, number][] = [
  ["body", 9285],
  ["html", 9285],
  ["div", 9283],
  ["section", 7045],
  ["main", 7038],
];
const COMMON_IDS: [string, number][] = [["main-content", 7038]];
const COMMON_ATTRIBUTES: [string, number][] = [
  ["data-cawco", 9285],
  ["data-sveltekit-preload-data", 9285],
  ["lang", 9285],
  ["data-bar", 9285],
  ["data-slot", 9273],
  ["data-first-render", 9267],
  ["data-drop-target-for-element", 8508],
  ["role", 8438],
  ["data-highlight", 8130],
  ["aria-label", 8123],
  ["data-safe-bottom", 7043],
  ["data-leaf", 7030],
  ["data-find-view", 6945],
  ["data-drop-leaf", 6925],
  ["data-delta", 6896],
  ["data-pane", 6896],
  ["data-pane-group", 6792],
  ["data-direction", 6792],
  ["data-pane-group-id", 6792],
  ["data-main-pane", 6714],
  ["data-pane-id", 6714],
  ["data-expanded", 6714],
  ["data-pane-state", 6714],
  ["data-offscreen", 6530],
  ["data-pane-hidden", 6480],
  ["data-tx-columns", 6346],
  ["data-transcript-shown", 5999],
  ["data-shown", 5999],
  ["data-item", 5694],
  ["data-drawn", 5694],
  ["data-row", 5414],
];
const COMMON_CLASSES: [string, number][] = [
  ["@container/shell", 9274],
  ["relative", 9272],
  ["flex", 9272],
  ["w-full", 9270],
  ["h-dvh", 9267],
  ["bg-surface-recess", 9267],
  ["overflow-hidden", 9267],
  ["flex-col", 9258],
  ["min-w-0", 9255],
  ["isolate", 8837],
  ["absolute", 8788],
  ["flex-auto", 8738],
  ["data-peek-beside:pe-96", 8735],
  ["data-under:timeline-scope-transcript-head", 8735],
  ["py-0", 8227],
  ["h-full", 8151],
  ["min-h-0", 7482],
  ["flex-1", 7336],
  ["grid", 7277],
  ["col-start-1", 7252],
  ["row-start-1", 7252],
  ["inset-0", 7169],
  ["overflow-y-auto", 7040],
  ["overflow-x-hidden", 7038],
  ["data-under:pt-control-lg", 7038],
  ["data-under:scroll-timeline-transcript-head", 7038],
  ["pe-(--content-end)", 7038],
  ["max-desk:ps-(--content-start)", 7038],
  ["coarse:data-safe:pb-(--safe-bottom)", 7038],
  ["max-desk:data-floating:bg-linear-to-b", 7038],
  ["max-desk:data-floating:from-surface-shelf", 7038],
  ["max-desk:data-floating:to-surface-shelf", 7038],
  ["max-desk:data-floating:bg-top", 7038],
  ["max-desk:data-floating:bg-size-(--shelf-band-size)", 7038],
  ["max-desk:data-floating:bg-no-repeat", 7038],
  ["grid-rows-1", 7037],
  ["grid-cols-1", 7037],
  ["data-parked:invisible", 7035],
  ["data-hidden:pointer-events-none", 7032],
  ["data-hidden:invisible", 7032],
  ["@container/leaf", 7030],
  ["group/stack", 6925],
  [
    "group-data-swipe/stack:not-data-pane-hidden:not-data-pane-settling:will-change-transform",
    6896,
  ],
  ["group-data-swipe/stack:delta-minus-1:transform-(--park-left)", 6896],
  ["group-data-swipe/stack:delta-0:transform-(--park-here)", 6896],
  ["group-data-swipe/stack:delta-1:transform-(--park-right)", 6896],
  ["data-pane-hidden:pointer-events-none", 6896],
  ["data-pane-hidden:content-visibility-hidden", 6896],
  ["data-pane-settling:invisible", 6896],
  ["@container", 6844],
  ["group/split", 6818],
  ["data-[direction=vertical]:flex-col", 6792],
  ["motion-safe:data-sliding:data-opening:ease-drawer", 6714],
  ["motion-safe:data-sliding:transition-[flex-grow]", 6714],
  ["motion-safe:data-sliding:duration-(--duration-panel)", 6714],
  ["motion-safe:data-sliding:ease-in-out", 6714],
  ["pb-(--reserved)", 6688],
  ["timeline-scope-transcript-head", 6662],
  ["ps-space-6", 6384],
  ["pe-space-6", 6384],
  ["max-desk:ps-space-5", 6384],
  ["max-desk:pe-space-5", 6384],
  ["tx-columns", 6384],
  ["anchor-none", 6346],
  ["scroll-timeline-transcript-head", 6346],
  ["not-data-shown:invisible", 5999],
  ["*:pointer-events-auto!", 5999],
  ["flow-root", 5414],
  ["data-marked:relative", 5414],
  ["data-marked:before:pointer-events-none", 5414],
  ["data-marked:before:absolute", 5414],
  ["data-marked:before:-inset-x-space-2", 5414],
  ["data-marked:before:inset-y-0", 5414],
  ["data-marked:before:rounded-sm", 5414],
  ["data-marked:before:bg-selection", 5414],
  ["motion-safe:data-marked:before:animate-(--mark-in)", 5414],
  ["marked-off:before:opacity-0", 5414],
  ["motion-safe:data-marked:before:transition-opacity", 5414],
  ["motion-safe:data-marked:before:duration-(--duration-panel)", 5414],
  ["motion-safe:data-marked:before:ease-out", 5414],
];

const COMMON = new Set([
  ...COMMON_TAGS.map(([name]) => `tag ${name}`),
  ...COMMON_IDS.map(([name]) => `id ${name}`),
  ...COMMON_ATTRIBUTES.map(([name]) => `attribute ${name}`),
  ...COMMON_CLASSES.map(([name]) => `class ${name}`),
]);

/** Pseudo-classes Blink files under a bucket of their own. */
const BUCKETED_CLASSES = new Set([
  ":focus",
  ":focus-visible",
  ":link",
  ":visited",
  ":any-link",
  ":-webkit-any-link",
  ":host",
  ":host-context",
  ":root",
  ":active-view-transition",
]);
/** Pseudo-elements Blink files under a bucket of their own (UA shadow parts, ::slotted, ::part). */
const BUCKETED_ELEMENTS = new Set([
  "::placeholder",
  "::file-selector-button",
  "::details-content",
  "::-webkit-scrollbar-button",
  "::-webkit-scrollbar-corner",
  "::-webkit-scrollbar-thumb",
  "::-webkit-scrollbar-track",
  "::-webkit-scrollbar-track-piece",
  "::slotted",
  "::part",
]);
/** Pseudo-elements that make a box of their own: Blink reads no key past them. */
const BOX_ELEMENTS = new Set([
  "::before",
  "::after",
  "::marker",
  "::backdrop",
  "::first-letter",
  "::checkmark",
  "::picker-icon",
  "::scroll-button",
  "::scroll-marker",
  "::scroll-marker-group",
  "::column",
  "::view-transition",
  "::view-transition-group",
  "::view-transition-image-pair",
  "::view-transition-new",
  "::view-transition-old",
]);
/** Selectors Blink cannot parse, whose rules it drops. */
const BLINK_DROPS = /:-moz-/u;
/**
 * The two universal keys that pass. `*` alone Blink marks covered by its
 * bucket and matches without its selector checker. `::selection` alone is
 * the one highlight rule Blink knows reaches every element alike
 * (element_rule_collector.cc: a universal highlight rule sets no
 * `HasNonUniversalHighlightPseudoStyles`); asked of named elements
 * (`div::selection, p::selection, …`), every element that matched one
 * recomputed its highlight styles: a flip on html restyled 4,008 elements
 * of a 2,000-row page against 2,010 (work item 01a3cc2e).
 */
const PASSES = new Set(["*", "::selection", "*::selection"]);
/** Pseudo-classes read as their single argument. */
const TRANSPARENT = new Set([":is", ":where", ":-webkit-any"]);

const NAMING_TYPES = new Set(["class", "id", "attribute", "tag"]);

/** Whether Blink files a pseudo-class or pseudo-element under a key, or, for a box of its own, reads no key past it (false). */
function keyedPseudo(node: selectorParser.Pseudo): boolean | null {
  const name = node.value.toLowerCase();
  if (BOX_ELEMENTS.has(name)) {
    return false;
  }
  if (
    BUCKETED_CLASSES.has(name) ||
    BUCKETED_ELEMENTS.has(name) ||
    name.startsWith("::-webkit-") ||
    name.startsWith("::-moz-")
  ) {
    return true;
  }
  const [only] = node.nodes;
  if (
    TRANSPARENT.has(name) &&
    node.nodes.length === 1 &&
    only &&
    keyed(compoundsAndCombinators(only).at(-1)?.nodes ?? [])
  ) {
    return true;
  }
  return null;
}

/** Whether Blink files a compound under a key of its own. */
function keyed(compound: SelectorNode[]): boolean {
  for (const node of compound) {
    if (NAMING_TYPES.has(node.type)) {
      return true;
    }
    if (selectorParser.isPseudo(node)) {
      const read = keyedPseudo(node);
      if (read !== null) {
        return read;
      }
    }
  }
  return false;
}

interface Compound {
  /** The combinator to its right, toward the key; none for the key itself. */
  combinator: string | null;
  nodes: SelectorNode[];
}

/** A complex selector's compounds, each with the combinator that follows it. */
function compoundsAndCombinators(selector: Selector): Compound[] {
  const compounds: Compound[] = [{ combinator: null, nodes: [] }];
  for (const node of selector.nodes) {
    if (node.type === "combinator") {
      const last = compounds.at(-1);
      if (last) {
        last.combinator = node.value.trim() || " ";
      }
      compounds.push({ combinator: null, nodes: [] });
    } else {
      compounds.at(-1)?.nodes.push(node);
    }
  }
  return compounds;
}

/** The ids, classes, tags and attribute names of a compound Blink hashes into its ancestor filter. */
function ancestorNames(compound: SelectorNode[]): string[] {
  const names: string[] = [];
  for (const node of compound) {
    if (node.type === "id") {
      names.push(`id ${node.value}`);
    } else if (node.type === "class") {
      names.push(`class ${node.value}`);
    } else if (node.type === "tag") {
      names.push(`tag ${node.value.toLowerCase()}`);
    } else if (
      node.type === "attribute" &&
      !["class", "id", "style"].includes(node.attribute.toLowerCase())
    ) {
      names.push(`attribute ${node.attribute.toLowerCase()}`);
    } else if (
      node.type === "pseudo" &&
      TRANSPARENT.has(node.value.toLowerCase()) &&
      node.nodes.length === 1 &&
      node.nodes[0]
    ) {
      // A one-argument `:is()` left of the key is read as if written out.
      for (const inner of compoundsAndCombinators(node.nodes[0])) {
        names.push(...ancestorNames(inner.nodes));
      }
    }
  }
  return names;
}

/** Whether Blink's ancestor filter can set the selector aside: a compound left of its key names an ancestor most elements lack. */
function filtered(compounds: Compound[]): boolean {
  // A compound reached past a sibling combinator (`.a + *`) is no ancestor.
  let sibling = false;
  for (const { combinator, nodes } of compounds.slice(0, -1).reverse()) {
    sibling = combinator === "+" || combinator === "~";
    if (!sibling && ancestorNames(nodes).some((name) => !COMMON.has(name))) {
      return true;
    }
  }
  return false;
}

/** The selectors of a list that Blink tests on every element it restyles. */
const unfiltered = (list: string): string[] => {
  const out: string[] = [];
  selectorParser((root) => {
    for (const selector of root.nodes) {
      const text = selector.toString().trim().replace(/\s+/gu, " ");
      // A `:-moz-` pseudo-class is no selector to Blink, which drops the rule.
      if (BLINK_DROPS.test(text) || PASSES.has(text)) {
        continue;
      }
      const compounds = compoundsAndCombinators(selector);
      if (!(keyed(compounds.at(-1)?.nodes ?? []) || filtered(compounds))) {
        out.push(text);
      }
    }
  }).processSync(list);
  return out;
};

/** The `:`-separated variants of a class, brackets and parentheses kept whole. */
function variantsOf(name: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of name) {
    if (ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "]" || ch === ")") {
      depth -= 1;
    }
    if (ch === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  return parts;
}

/** The selectors of a list made by Tailwind's `*:` or `**:` variant. */
const starVariants = (list: string): string[] => {
  const out: string[] = [];
  selectorParser((root) => {
    for (const selector of root.nodes) {
      let star = false;
      selector.walkClasses((node) => {
        const variants = variantsOf(node.value);
        star ||= variants.includes("*") || variants.includes("**");
      });
      if (star) {
        out.push(selector.toString().trim().replace(/\s+/gu, " "));
      }
    }
  }).processSync(list);
  return out;
};

/** Whether a rule stands in Tailwind's `@layer properties` fallback. */
function inPropertiesFallback(rule: Rule): boolean {
  for (let at: Node["parent"] = rule.parent; at; at = at.parent) {
    if (
      at instanceof AtRule &&
      at.name === "layer" &&
      at.params === "properties"
    ) {
      return true;
    }
  }
  return false;
}

interface Hit {
  file: string;
  line: number;
  selector: string;
}

const house = await readHouseCss();
const hits: Hit[] = [];
/** Rules made by Tailwind's `*:`/`**:`, whatever they name past it. */
const stars: Hit[] = [];
for (const sheet of house.sheets) {
  for (const rule of styleRules(sheet.root)) {
    // A rule with no declarations of its own (only nested rules) matches nothing.
    if (!rule.nodes.some((node) => node.type === "decl")) {
      continue;
    }
    if (inPropertiesFallback(rule)) {
      continue;
    }
    const selector = fullSelector(rule);
    for (const found of unfiltered(selector)) {
      for (const place of sheet.places(rule, selector)) {
        hits.push({ ...place, selector: found });
      }
    }
    for (const found of starVariants(selector)) {
      for (const place of sheet.places(rule, selector)) {
        stars.push({ ...place, selector: found });
      }
    }
  }
}

const starred = placedOnce(stars, (h) => h.selector);
if (starred.length > 0) {
  console.error(
    `universal-key: ${starred.length} rule(s) from Tailwind's \`*:\` or \`**:\` variant, which writes its class inside the compound Blink files the rule under (\`:is(.c > *)\`), where Blink's ancestor filter never reads it:`
  );
  for (const h of starred) {
    console.error(`  ${h.file}:${h.line}: ${h.selector}`);
  }
  console.error(
    "Write the arbitrary variant, which names the children where the class says them and makes the class an ancestor the filter reads, at the same specificity: `*:x` as `[&>*]:x`, `*:[svg]:x` as `[&>svg]:x`, `*:data-[slot=a]:x` as `[&>[data-slot=a]]:x`, `**:x` as `[&_*]:x` (apps/dashboard/scripts/universal-key-check.ts)."
  );
}
const unique = placedOnce(hits, (h) => h.selector);
if (unique.length > 0) {
  console.error(
    `universal-key: ${unique.length} selector(s) name nothing in their right-most compound and no ancestor most elements lack, so Blink runs them on every element it restyles:`
  );
  for (const h of unique) {
    console.error(`  ${h.file}:${h.line}: ${h.selector}`);
  }
  console.error(
    "Name the element the rule styles: give it a class or a data-slot and select that (`[data-slot=x] > [data-slot=x-item]`), or move the style onto the element itself (apps/dashboard/scripts/universal-key-check.ts)."
  );
}
if (unique.length > 0 || starred.length > 0) {
  process.exit(1);
}
console.log(
  `universal-key: every selector the house writes (the dashboard's ${house.entries.length} Tailwind entries with their utilities, its ${house.srcSheets} stylesheets, its components' styles, the other apps' and packages' stylesheets) names its element, or an ancestor most elements lack`
);
