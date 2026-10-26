/**
 * Part of `bun run check`: on one element, a utility under a state's variant
 * never loses to another utility for the same property by selector weight
 * alone.
 *
 * Tailwind v4's variants weigh differently: `in-*` is `:where(X) &` and adds
 * nothing, while `not-*`, `data-*`, `aria-*`, `group-*` and the pseudo-classes
 * each add a class's weight. So on a title carrying
 * `not-data-quiet:text-ink-strong in-aria-current:text-selected-ink`, the
 * first compiles to `.a:not([data-quiet])` (0,2,0) and the second to
 * `:where([aria-current="true"]) .b` (0,1,0): with both matching, the
 * current pin's title drew ink-strong on the selected wash. Tailwind's own
 * order decides only between rules of equal weight.
 *
 * Every `src/**\/*.svelte` element's `class` (its text and every string
 * literal in it, on elements and components alike) and every `tv()` recipe's
 * base with each one variant's classes is compiled with app.css on the
 * dashboard's Tailwind (`candidatesToCss`). Two of its rules setting one
 * property to different values on the element itself (or on one of its
 * pseudo-elements) are a trap when the winner wins on weight and:
 *  - the winner's weight is its variants', not its own utility's (press-tint
 *    and field-edge outweigh by their own selectors on purpose);
 *  - the winner is not a press under way, nor a hide (a held control takes
 *    the step past every look; a hidden element draws none);
 *  - the loser holds a state the winner's variants don't: not a media range,
 *    a theme, a passing interaction (hover, focus, a press), a pseudo-element
 *    or where the element stands (`data-[slot=…]`, `data-[variant=…]`);
 *  - the winner doesn't require every attribute the loser does (it is not
 *    the loser's own refinement);
 *  - both can hold at once: neither requires an attribute, pseudo-class or
 *    `:has()` the other excludes or gives another value
 *    (`[data-x]` / `:not([data-x])`, `[data-state="a"]` / `[data-state="b"]`,
 *    `:disabled` / `:enabled`), and their media ranges meet.
 * The fix is one value chosen in script, or variants of equal weight. A pair
 * only the script can tell apart (one attribute is only ever set with
 * another) is said in a comment directly above the element or the recipe:
 * `specificity-trap: <why they never hold at once>`.
 * Prints `file:line: winner outweighs loser (property)` per trap; exits 1 on
 * any.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import postcss, { type AtRule, type Rule } from "postcss";
import selectorParser, {
  type Selector,
  type Node as SelNode,
} from "postcss-selector-parser";
import { parse } from "svelte/compiler";

const DASHBOARD = join(dirname(new URL(import.meta.url).pathname), "..");
const SRC = join(DASHBOARD, "src");
const SPACE = /\s+/u;
const COMPARE = new Set(["===", "!==", "==", "!="]);
const TV_CALL = /\btv\(\s*\{/gu;
const EXCUSE = /specificity-trap:\s*\S/u;
const SCRIPT_COMMENT = /^(\/\/|\/\*|\*)/u;
const LEADING_COLONS = /^:+/u;
const GROUP_CLASS = /^(group|peer)/u;
const WIDTH_RANGE = /width\s*(>=|>|<=|<)\s*([\d.]+)px/gu;
const WIDTH_MIN_MAX = /(min|max)-width:\s*([\d.]+)px/gu;
const NEGATED_MEDIA = /\bnot\b/u;
const MEDIA_FEATURE =
  /\((pointer|hover|any-pointer|prefers-reduced-motion|prefers-color-scheme|orientation):\s*([a-z-]+)\)/gu;
const PREFIX = /^(group|peer|in|not|has)-/u;
const NAMED = /\/[\w-]+$/u;
const NEGATION = /(^|-)not-/u;
/** Where an element stands (a slot, a kit part's variant), not a state it takes. */
const STRUCTURE = /^data-\[(slot|variant)=/u;
const PRESSES = new Set(["active", "hit-pressed", "pressed"]);
/**
 * Interactions that pass and conditions of the page, not the element's own
 * state: a state giving way to them is the design.
 */
const PASSING = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "enabled",
  "disabled",
  "visited",
  "first",
  "last",
  "only",
  "odd",
  "even",
  "empty",
  "before",
  "after",
  "placeholder",
  "selection",
  "marker",
  "file",
  "backdrop",
  "starting",
  "unhovered",
  "no-hover",
  "hover-hover",
  "hit-pressed",
  "node-focus-visible",
  "theme-flip",
  "dark",
  "light",
]);
/** State pseudo-classes, each as the one it negates where it has a pair. */
const PSEUDO_STATE: Record<string, { key: string; negated: boolean }> = {
  ":disabled": { key: ":disabled", negated: false },
  ":enabled": { key: ":disabled", negated: true },
  ":checked": { key: ":checked", negated: false },
  ":open": { key: ":open", negated: false },
  ":read-only": { key: ":read-only", negated: false },
  ":read-write": { key: ":read-only", negated: true },
};

const design = await __unstable__loadDesignSystem(
  readFileSync(join(SRC, "app.css"), "utf8"),
  { base: SRC }
);

interface AstNode {
  start?: number;
  type?: string;
  [key: string]: unknown;
}
const isNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null;

/** Every node under `root`, each with its nearest typed ancestor, in source order. */
function* nodes(
  root: unknown,
  parent: AstNode | null = null
): Generator<[AstNode, AstNode | null]> {
  if (Array.isArray(root)) {
    for (const one of root) {
      yield* nodes(one, parent);
    }
    return;
  }
  if (!isNode(root)) {
    return;
  }
  if (typeof root.type === "string") {
    yield [root, parent];
  }
  for (const [key, value] of Object.entries(root)) {
    if (key !== "metadata" && key !== "parent") {
      yield* nodes(value, typeof root.type === "string" ? root : parent);
    }
  }
}

/** A string literal that is a class list: not a comparison's operand nor an object's key. */
const isClassLiteral = (node: AstNode, parent: AstNode | null) =>
  node.type === "Literal" &&
  typeof node.value === "string" &&
  !(
    parent?.type === "BinaryExpression" &&
    COMPARE.has(parent.operator as string)
  ) &&
  !(parent?.type === "Property" && parent.key === node);

/** The class names a `class` value writes: its text and its expressions' string literals. */
function classesIn(value: unknown): string[] {
  const out: string[] = [];
  for (const [node, parent] of nodes(value)) {
    if (node.type === "Text" && typeof node.data === "string") {
      out.push(...node.data.split(SPACE));
    } else if (isClassLiteral(node, parent)) {
      out.push(...(node.value as string).split(SPACE));
    } else if (node.type === "TemplateElement") {
      out.push(
        ...((node.value as { cooked?: string }).cooked ?? "").split(SPACE)
      );
    }
  }
  return out.filter(Boolean);
}

/** One element's class list, where it is written. */
interface Site {
  classes: string[];
  /** Said clear in a `specificity-trap:` comment directly above it. */
  excused: boolean;
  file: string;
  line: number;
}

/** Whether the comments that end right before `at` say `specificity-trap: …`. */
function excusedBefore(source: string, at: number): boolean {
  let before = source.slice(0, at).trimEnd();
  if (before.endsWith("-->")) {
    // The run of markup comments over it: the ignore comments stand last,
    // directly over what they name.
    while (before.endsWith("-->")) {
      const open = before.lastIndexOf("<!--");
      if (EXCUSE.test(before.slice(open))) {
        return true;
      }
      before = before.slice(0, open).trimEnd();
    }
    return false;
  }
  // A script comment block ending on the line above (`/** … */`, `// …`).
  const lines = before.split("\n");
  const block: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim() ?? "";
    if (!SCRIPT_COMMENT.test(line)) {
      break;
    }
    block.push(line);
  }
  return EXCUSE.test(block.join(" "));
}

function svelteSites(file: string, source: string): Site[] {
  const ast = parse(source, { modern: true });
  const lineOf = (at: number | undefined) =>
    source.slice(0, at ?? 0).split("\n").length;
  const sites: Site[] = [];
  for (const [node, element] of nodes(ast.fragment)) {
    if (node.type === "Attribute" && node.name === "class") {
      sites.push({
        file,
        line: lineOf(node.start),
        classes: classesIn(node.value),
        excused: excusedBefore(source, element?.start ?? node.start ?? 0),
      });
    }
  }
  return sites;
}

const QUOTES = new Set(['"', "'", "`"]);

/** Where the string opened at `at` closes. */
function stringEnd(source: string, at: number): number {
  const quote = source[at];
  for (let i = at + 1; i < source.length; i += 1) {
    if (source[i] === "\\") {
      i += 1;
    } else if (source[i] === quote) {
      return i;
    }
  }
  return source.length;
}

/** The object literal's text from its `{` to the matching `}`. */
function objectAt(source: string, open: number): string {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    const ch = source[at] ?? "";
    if (QUOTES.has(ch)) {
      at = stringEnd(source, at);
    } else if (ch === "{" || ch === "}") {
      depth += ch === "{" ? 1 : -1;
      if (depth === 0) {
        return source.slice(open, at + 1);
      }
    }
  }
  return "";
}

interface Recipe {
  base?: string;
  slots?: Record<string, string>;
  variants?: Record<string, Record<string, unknown>>;
}

const words = (value: unknown) =>
  typeof value === "string" ? value.split(SPACE).filter(Boolean) : [];

/** What one variant option gives a slot: a string is the base's (or a slotless recipe's), an object names each slot's. */
function optionFor(recipe: Recipe, slot: string, option: unknown): string[] {
  if (typeof option !== "string") {
    return words((option as Record<string, unknown>)[slot]);
  }
  return slot === "base" || !recipe.slots ? words(option) : [];
}

/** A recipe's elements: each slot's base, alone and with each one variant option's classes. */
function recipeLists(recipe: Recipe): string[][] {
  const bases: Record<string, string> = recipe.slots
    ? { ...recipe.slots }
    : { base: recipe.base ?? "" };
  if (recipe.slots && recipe.base) {
    bases.base = recipe.base;
  }
  const lists: string[][] = [];
  for (const [slot, base] of Object.entries(bases)) {
    lists.push(words(base));
    for (const options of Object.values(recipe.variants ?? {})) {
      for (const option of Object.values(options)) {
        const own = optionFor(recipe, slot, option);
        if (own.length > 0) {
          lists.push([...words(base), ...own]);
        }
      }
    }
  }
  return lists;
}

/** Every `tv()` recipe in a file, read off its object literal. */
function recipeSites(file: string, source: string): Site[] {
  const sites: Site[] = [];
  for (const match of source.matchAll(TV_CALL)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let recipe: Recipe;
    try {
      recipe = new Function(`return (${objectAt(source, open)});`)();
    } catch {
      continue;
    }
    const line = source.slice(0, open).split("\n").length;
    // The statement the call stands in: `export const x = tv({`.
    const statement = source.lastIndexOf("\n", match.index ?? 0) + 1;
    const excused = excusedBefore(source, statement);
    for (const classes of recipeLists(recipe)) {
      sites.push({ file, line, excused, classes });
    }
  }
  return sites;
}

/** A compiled rule's weight, `[ids, classes, types]`. */
type Weight = [number, number, number];

const compare = (a: Weight, b: Weight) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const heaviest = (list: Weight[]): Weight =>
  list.reduce<Weight>((a, b) => (compare(a, b) >= 0 ? a : b), [0, 0, 0]);
const isPseudoElement = (name: string) =>
  name.startsWith("::") || name === ":before" || name === ":after";

/** One simple selector's own weight; `:is()`, `:not()` and `:has()` weigh their heaviest argument. */
function simpleWeight(n: SelNode): Weight {
  switch (n.type) {
    case "id":
      return [1, 0, 0];
    case "class":
    case "attribute":
      return [0, 1, 0];
    case "tag":
      return [0, 0, 1];
    case "pseudo": {
      const name = n.value.toLowerCase();
      if (isPseudoElement(name)) {
        return [0, 0, 1];
      }
      if (name === ":where") {
        return [0, 0, 0];
      }
      if (name === ":is" || name === ":not" || name === ":has") {
        return heaviest((n.nodes as Selector[]).map(weightOf));
      }
      return [0, 1, 0];
    }
    default:
      return [0, 0, 0];
  }
}

function weightOf(selector: Selector): Weight {
  const w: Weight = [0, 0, 0];
  for (const n of selector.nodes) {
    const x = simpleWeight(n);
    w[0] += x[0];
    w[1] += x[1];
    w[2] += x[2];
  }
  return w;
}

/** One rule a candidate compiles to, on the element itself. */
interface Compiled {
  /** Conditions required: `who|[attr]` → value ("" for presence), `who|:pseudo`, `who|:has(…)`. */
  attrs: Map<string, string>;
  candidate: string;
  /** Conditions excluded by a `:not()`: `who|[attr]`, `who|[attr]=value`. */
  excluded: Set<string>;
  media: string[];
  /** Each property it sets, with its value. */
  props: Map<string, string>;
  /** The pseudo-element it draws on, or "" for the element. */
  target: string;
  variants: string[];
  weight: Weight;
}

/** Its variants: the candidate split on its top-level colons, the utility dropped. */
function variantsOf(candidate: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < candidate.length; at += 1) {
    const ch = candidate[at];
    if (ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "]" || ch === ")") {
      depth -= 1;
    } else if (ch === ":" && depth === 0) {
      parts.push(candidate.slice(from, at));
      from = at + 1;
    }
  }
  return parts;
}

/** The selector's subject compound, if the rule's own class stands in it: what it draws on. */
function onSelf(selector: Selector, cls: string): { target: string } | null {
  const last: SelNode[] = [];
  for (const n of selector.nodes) {
    if (n.type === "combinator") {
      last.length = 0;
    } else {
      last.push(n);
    }
  }
  if (!last.some((n) => n.type === "class" && n.value === cls)) {
    return null;
  }
  const pseudoElement = last.find(
    (n) => n.type === "pseudo" && isPseudoElement(n.value)
  );
  return {
    target: pseudoElement?.value?.replace(LEADING_COLONS, "::") ?? "",
  };
}

/** The group or peer whose own compound this is: `:where(.group/x)[data-y]`. */
function ownerIn(compound: SelNode[]): string {
  for (const one of compound) {
    if (one.type === "pseudo" && one.value === ":where") {
      const only = one.nodes[0]?.nodes;
      const first = only?.[0];
      if (
        only?.length === 1 &&
        first?.type === "class" &&
        GROUP_CLASS.test(first.value)
      ) {
        return first.value;
      }
    }
  }
  return "";
}

/**
 * Who a condition is on: the element itself, a named group or peer, or an
 * ancestor (`in-*`'s `:where(X) &`, `not-in-*`'s `:not(:where(X) *)`).
 */
function contextOf(node: SelNode, selector: Selector, cls: string): string {
  const container = node.parent;
  if (!container) {
    return "self";
  }
  const siblings = container.nodes as SelNode[];
  const at = siblings.indexOf(node);
  let start = at;
  while (start > 0 && siblings[start - 1]?.type !== "combinator") {
    start -= 1;
  }
  let end = at;
  while (
    end < siblings.length - 1 &&
    siblings[end + 1]?.type !== "combinator"
  ) {
    end += 1;
  }
  const compound = siblings.slice(start, end + 1);
  const owner = ownerIn(compound);
  if (owner) {
    return owner;
  }
  if (compound.some((one) => one.type === "class" && one.value === cls)) {
    return "self";
  }
  // A compound a combinator follows stands on an ancestor.
  if (end < siblings.length - 1 || container === selector) {
    return "ancestor";
  }
  return contextOf(container.parent as SelNode, selector, cls);
}

const inside = (n: SelNode, pseudo: string) => {
  for (let up = n.parent; up; up = up.parent) {
    if (up.type === "pseudo" && up.value === pseudo) {
      return true;
    }
  }
  return false;
};
const notDepth = (n: SelNode) => {
  let depth = 0;
  for (let up = n.parent; up; up = up.parent) {
    if (up.type === "pseudo" && up.value === ":not") {
      depth += 1;
    }
  }
  return depth;
};

/** A simple selector as a condition: its key, its value, whether it is a negation itself. */
function conditionOf(
  n: SelNode
): { key: string; negated: boolean; value: string } | null {
  if (n.type === "pseudo" && n.value === ":has") {
    // What a `:has()` asks is one condition.
    return {
      key: `:has(${n.nodes.map(String).join(",")})`,
      negated: false,
      value: "",
    };
  }
  if (n.type === "attribute") {
    return { key: `[${n.attribute}]`, negated: false, value: n.value ?? "" };
  }
  const pseudo = n.type === "pseudo" ? PSEUDO_STATE[n.value] : undefined;
  return pseudo ? { ...pseudo, value: "" } : null;
}

/** The conditions a selector requires, and the ones its `:not()`s exclude, by who they are on. */
function conditions(selector: Selector, cls: string) {
  const attrs = new Map<string, string>();
  const excluded = new Set<string>();
  selector.walk((n) => {
    const condition = inside(n, ":has") ? null : conditionOf(n);
    if (!condition) {
      return;
    }
    const who = `${contextOf(n, selector, cls)}|${condition.key}`;
    if ((notDepth(n) % 2 === 1) === condition.negated) {
      attrs.set(who, condition.value);
    } else {
      excluded.add(condition.value ? `${who}=${condition.value}` : who);
    }
  });
  return { attrs, excluded };
}

const cache = new Map<string, Compiled[]>();

/** The rules a candidate compiles to that draw on the element itself. */
function compiled(candidate: string): Compiled[] {
  const hit = cache.get(candidate);
  if (hit) {
    return hit;
  }
  const [css] = design.candidatesToCss([candidate]);
  const out: Compiled[] = [];
  postcss.parse(css ?? "").walkRules((rule: Rule) => {
    const props = new Map<string, string>();
    rule.each((child) => {
      if (child.type === "decl") {
        props.set(child.prop, child.value);
      }
    });
    const media: string[] = [];
    for (let up = rule.parent; up?.type === "atrule"; up = up.parent) {
      media.push((up as AtRule).params);
    }
    selectorParser((root) => {
      for (const selector of root.nodes) {
        // The parser's class value is the unescaped name: the candidate.
        const self = props.size > 0 ? onSelf(selector, candidate) : null;
        if (self) {
          out.push({
            candidate,
            variants: variantsOf(candidate),
            props,
            media,
            target: self.target,
            weight: weightOf(selector),
            ...conditions(selector, candidate),
          });
        }
      }
    }).processSync(rule.selector);
  });
  cache.set(candidate, out);
  return out;
}

/** `width >= 640px`, `width < 900px`, `min-width: 640px`: the range it holds. */
function widthRange(media: string[]): [number, number] {
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  for (const m of media) {
    for (const [, op, px] of m.matchAll(WIDTH_RANGE)) {
      const v = Number(px);
      if (op?.startsWith(">")) {
        lo = Math.max(lo, v);
      } else {
        hi = Math.min(hi, op === "<" ? v - 0.001 : v);
      }
    }
    for (const [, kind, px] of m.matchAll(WIDTH_MIN_MAX)) {
      if (kind === "min") {
        lo = Math.max(lo, Number(px));
      } else {
        hi = Math.min(hi, Number(px));
      }
    }
  }
  return [lo, hi];
}

/** `pointer: coarse`, `hover: hover`, `prefers-reduced-motion: reduce`, … */
function features(media: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of media.filter((one) => !NEGATED_MEDIA.test(one))) {
    for (const [, name, value] of m.matchAll(MEDIA_FEATURE)) {
      out.set(name ?? "", value ?? "");
    }
  }
  return out;
}

/** Whether one rule requires a condition the other excludes or gives another value. */
function contradicts(a: Compiled, b: Compiled): boolean {
  for (const [name, value] of a.attrs) {
    const other = b.attrs.get(name);
    if (other !== undefined && other !== value && value && other) {
      return true;
    }
    if (b.excluded.has(name) || b.excluded.has(`${name}=${value}`)) {
      return true;
    }
  }
  return false;
}

function exclusive(a: Compiled, b: Compiled): boolean {
  if (contradicts(a, b) || contradicts(b, a)) {
    return true;
  }
  const [alo, ahi] = widthRange(a.media);
  const [blo, bhi] = widthRange(b.media);
  if (alo > bhi || blo > ahi) {
    return true;
  }
  const fa = features(a.media);
  for (const [name, value] of features(b.media)) {
    const other = fa.get(name);
    if (other !== undefined && other !== value) {
      return true;
    }
  }
  return false;
}

/** The weight the candidate's utility carries by its own selector, before any variant. */
function baseWeight(candidate: string): Weight {
  const variants = variantsOf(candidate);
  const utility = candidate.slice(
    variants.length ? variants.join(":").length + 1 : 0
  );
  return heaviest([[0, 1, 0], ...compiled(utility).map((one) => one.weight)]);
}

/** The variant's own condition, its group, peer, ancestor and negation prefixes and its name dropped. */
function coreOf(variant: string): string {
  let core = variant.replace(NAMED, "");
  while (PREFIX.test(core)) {
    core = core.replace(PREFIX, "");
  }
  return core;
}

/** A press under way (not its absence: `not-active` is no press). */
const isPress = (variant: string) =>
  PRESSES.has(coreOf(variant)) && !NEGATION.test(variant);

/** A rule that takes the element out of the drawing. */
const isHide = (prop: string, value: string | undefined) =>
  (prop === "display" && value === "none") ||
  (prop === "visibility" && value === "hidden");

const mediaLike = new Map<string, boolean>();
/** A variant that only wraps the rule in an at-rule (a breakpoint, motion), adding no weight. */
function isMediaLike(variant: string): boolean {
  const known = mediaLike.get(variant);
  if (known !== undefined) {
    return known;
  }
  const [css] = design.candidatesToCss([`${variant}:hidden`]);
  let wrapped = false;
  let plain = true;
  postcss.parse(css ?? "").walkRules((rule) => {
    wrapped ||= rule.parent?.type === "atrule";
    selectorParser((root) => {
      for (const selector of root.nodes) {
        plain &&= compare(weightOf(selector), [0, 1, 0]) === 0;
      }
    }).processSync(rule.selector);
  });
  const answer = Boolean(css) && wrapped && plain;
  mediaLike.set(variant, answer);
  return answer;
}

/** A variant that names the element's (or an ancestor's) own state. */
function isState(variant: string): boolean {
  const core = coreOf(variant);
  return !(
    PASSING.has(core) ||
    STRUCTURE.test(core) ||
    core.startsWith("@") ||
    isMediaLike(variant)
  );
}

/** The attribute names a rule requires, whoever they are on. */
const attributeNames = (rule: Compiled) =>
  new Set([...rule.attrs.keys()].map((key) => key.slice(key.indexOf("|") + 1)));

/** The property `a` takes from `b` on weight alone where `b`'s state is lost, if any. */
function lostTo(a: Compiled, b: Compiled): string | null {
  if (a.candidate === b.candidate || a.target !== b.target) {
    return null;
  }
  if (compare(a.weight, b.weight) <= 0) {
    return null;
  }
  // `content` is set by every ::before and ::after rule (`var(--tw-content)`),
  // and Tailwind's own `--tw-*` are plumbing.
  const prop = [...a.props.keys()].find(
    (p) =>
      b.props.has(p) &&
      b.props.get(p) !== a.props.get(p) &&
      p !== "content" &&
      !p.startsWith("--tw-")
  );
  if (
    !prop ||
    compare(baseWeight(a.candidate), [0, 1, 0]) > 0 ||
    a.variants.some(isPress) ||
    isHide(prop, a.props.get(prop)) ||
    !b.variants.some((v) => !a.variants.includes(v) && isState(v))
  ) {
    return null;
  }
  const wants = attributeNames(a);
  const refines =
    b.attrs.size > 0 && [...attributeNames(b)].every((k) => wants.has(k));
  return refines || exclusive(a, b) ? null : prop;
}

interface Trap {
  file: string;
  line: number;
  loser: string;
  prop: string;
  winner: string;
}

function trapsIn(site: Site): Trap[] {
  if (site.excused) {
    return [];
  }
  const rules = [...new Set(site.classes)].flatMap(compiled);
  const traps: Trap[] = [];
  for (const a of rules) {
    for (const b of rules) {
      const prop = lostTo(a, b);
      if (prop) {
        traps.push({
          file: site.file,
          line: site.line,
          winner: a.candidate,
          loser: b.candidate,
          prop,
        });
      }
    }
  }
  return traps;
}

const found = new Map<string, Trap>();
let sites = 0;
for (const name of [...new Bun.Glob("**/*.{svelte,ts}").scanSync(SRC)].sort()) {
  const path = join(SRC, name);
  const source = readFileSync(path, "utf8");
  const file = relative(resolve(DASHBOARD, "..", ".."), path);
  const list = [
    ...(name.endsWith(".svelte") ? svelteSites(file, source) : []),
    ...(source.includes("tv(") ? recipeSites(file, source) : []),
  ];
  sites += list.length;
  for (const trap of list.flatMap(trapsIn)) {
    found.set(
      `${trap.file}:${trap.line} ${trap.winner} ${trap.loser} ${trap.prop}`,
      trap
    );
  }
}

if (found.size > 0) {
  console.error(
    "A state's utility loses to another utility for the same property on weight alone (one value chosen in script, or variants of equal weight):"
  );
  for (const t of found.values()) {
    console.error(
      `  ${t.file}:${t.line}: \`${t.winner}\` outweighs \`${t.loser}\` (${t.prop})`
    );
  }
  console.error(
    `specificity-trap: ${sites} class lists, ${found.size} trap(s)`
  );
  process.exit(1);
}
console.log(
  `specificity-trap: ${sites} class lists, none a state losing on weight`
);
