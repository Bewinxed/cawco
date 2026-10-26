// house/variant-order: Tailwind's variant sort never decides which of two
// states wins.
//
// The invariant: on every element, when two of its utilities set the same CSS
// property to different values under state variants that can hold at the same
// time, the winner is the one the source of record made win. In a stylesheet,
// two rules of equal specificity resolve by the cascade's last step, "Order of
// Appearance: The last declaration in document order wins."
// (https://drafts.csswg.org/css-cascade-5/#cascade-order). Tailwind 4 writes
// every utility of a layer in its own variant sort, so for two utilities of
// equal specificity that order is Tailwind's, not the author's: a converted
// `[data-instant]` rule that came after `[data-joined]` lost to it once both
// were `group-data-*/tools:` utilities. The rule flags such a pair until the
// states are made exclusive (the loser takes the winner's `not-`), so no
// element ever depends on the sort.
//
// It reads the theme through Tailwind's own design system (tailwind.mjs),
// and classes from every class site (classes.mjs): `class="…"`, strings
// inside `cn(…)`/`clsx(…)`/arrays/objects, `class:x` directives, and
// `tv()`/`cva()` recipes (base with each variant value). A class passed to
// a component is weighed against the classes on the component's own root.
// Moved from ESLint (apps/dashboard/eslint-plugin-house.mjs) to Golar, on
// Svelte's own AST.
import path from "node:path";
import {
  componentFile,
  moduleFile,
  separated,
  sitesOf,
  svelteFile,
  tagName,
} from "./classes.mjs";
import { DASHBOARD, parseScript, parseSvelte, readText } from "./model.mjs";
import { ds } from "./tailwind.mjs";

/* ---------------------------------------------------------------- selectors */
/* ---------------------------------------------------------------- selectors */

const OPEN = new Set(["(", "["]);
const CLOSE = new Set([")", "]"]);
const COMBINATORS = new Set([" ", ">", "+", "~"]);
const NAME_END = /[.#[:\s>+~,()]/u;
const IS_OR_WHERE = /^:(?:is|where)\(/u;

/** Walks a selector, calling `visit(char, index, depth)` outside escapes. */
function walk(text, visit) {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
    } else if (quote) {
      quote = ch === quote ? "" : quote;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else {
      if (CLOSE.has(ch)) {
        depth -= 1;
      }
      visit(ch, i, depth);
      if (OPEN.has(ch)) {
        depth += 1;
      }
    }
  }
}

/** Splits at top-level commas. */
function splitList(text) {
  const parts = [];
  let from = 0;
  walk(text, (ch, i, depth) => {
    if (ch === "," && depth === 0) {
      parts.push(text.slice(from, i).trim());
      from = i + 1;
    }
  });
  parts.push(text.slice(from).trim());
  return parts;
}

/** The compounds of one complex selector, combinators dropped. */
function compounds(complex) {
  const out = [];
  let last = 0;
  walk(complex, (ch, i, depth) => {
    if (depth === 0 && COMBINATORS.has(ch)) {
      const part = complex.slice(last, i).trim();
      if (part) {
        out.push(part);
      }
      last = i + 1;
    }
  });
  const tail = complex.slice(last).trim();
  if (tail) {
    out.push(tail);
  }
  return out;
}

/** The text inside the parenthesis that opens at `open`. */
function parenthesised(text, open) {
  let end = text.length;
  let found = false;
  walk(text.slice(open), (ch, i, depth) => {
    if (!found && ch === ")" && depth === 0) {
      end = open + i;
      found = true;
    }
  });
  return text.slice(open + 1, end);
}

function skipName(text, from) {
  let i = from;
  while (i < text.length && !NAME_END.test(text[i])) {
    i += text[i] === "\\" ? 2 : 1;
  }
  return i;
}

/** Selectors Level 4 specificity of one compound, as [a, b, c]. */
function compoundSpecificity(compound) {
  const s = [0, 0, 0];
  let i = 0;
  while (i < compound.length) {
    const ch = compound[i];
    if (ch === "\\") {
      i += 2;
    } else if (ch === "#" || ch === ".") {
      s[ch === "#" ? 0 : 1] += 1;
      i = skipName(compound, i + 1);
    } else if (ch === "[") {
      s[1] += 1;
      i = compound.indexOf("]", i) + 1 || compound.length;
    } else if (ch === ":") {
      i = pseudoSpecificity(compound, i, s);
    } else if (ch === "*" || ch === "&") {
      i += 1;
    } else {
      s[2] += 1;
      i = skipName(compound, i);
    }
  }
  return s;
}

const MAX_OF_ARGUMENT = new Set([":is", ":not", ":has", ":matches"]);

/** Adds one pseudo-class or pseudo-element at `at` to `s`; returns the end. */
function pseudoSpecificity(compound, at, s) {
  const element = compound[at + 1] === ":";
  const nameEnd = skipName(compound, at + (element ? 2 : 1));
  const name = compound.slice(at, nameEnd);
  if (compound[nameEnd] !== "(") {
    s[element ? 2 : 1] += 1;
    return nameEnd;
  }
  const argument = parenthesised(compound, nameEnd);
  if (MAX_OF_ARGUMENT.has(name)) {
    add(s, specificity(argument));
  } else if (name !== ":where") {
    s[element ? 2 : 1] += 1;
  }
  return nameEnd + argument.length + 2;
}

function add(into, more) {
  for (let i = 0; i < 3; i += 1) {
    into[i] += more[i];
  }
}

function greater(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] > b[i];
    }
  }
  return false;
}

/** The highest specificity among a selector list's members. */
function specificity(selector) {
  let best = [0, 0, 0];
  for (const complex of splitList(selector)) {
    const s = [0, 0, 0];
    for (const compound of compounds(complex)) {
      add(s, compoundSpecificity(compound));
    }
    if (greater(s, best)) {
      best = s;
    }
  }
  return best;
}

/**
 * What a one-variant selector (the class written `&`) matches: "self" for
 * the element itself, "pseudo" for one of its pseudo-elements, "other" for
 * another element (a child, a descendant).
 */
function subjectOf(selector) {
  const kinds = new Set(splitList(selector).map(complexSubject));
  return kinds.size === 1 ? [...kinds][0] : "other";
}

function complexSubject(complex) {
  const last = compounds(complex).at(-1) ?? "";
  let top = "";
  walk(last, (ch, _i, depth) => {
    top += depth === 0 ? ch : "";
  });
  if (top.includes("&")) {
    return top.includes("::") ? "pseudo" : "self";
  }
  const wrapped = last.match(IS_OR_WHERE);
  if (!wrapped) {
    return "other";
  }
  const inner = parenthesised(last, wrapped[0].length - 1);
  return inner.length === last.length - wrapped[0].length - 1
    ? subjectOf(inner)
    : "other";
}

/* ------------------------------------------------------- one variant's state */

const ESCAPED_PROBE = /\.(?:[^\s.#[\]():>+~,\\]|\\.)*\\:hidden/gu;
const CONDITIONS = new Set(["@media", "@container", "@supports"]);

/**
 * Each variant compiled alone on a probe utility: the alternatives under
 * which it holds (Tailwind writes `not-hover:` as two rules), each an
 * at-rule chain and a selector with the element written `&`.
 */
const atoms = new Map();
function atomOf(variant) {
  if (atoms.has(variant)) {
    return atoms.get(variant);
  }
  const alternatives = [];
  const collect = (nodes, at) => {
    for (const node of nodes) {
      if (node.kind === "rule") {
        alternatives.push({
          at,
          selector: node.selector.replace(ESCAPED_PROBE, "&"),
        });
      } else if (node.kind === "at-rule" && CONDITIONS.has(node.name)) {
        collect(node.nodes, [...at, { name: node.name, params: node.params }]);
      }
    }
  };
  collect(ds.candidatesToAst([`${variant}:hidden`])[0] ?? [], []);
  const subjects = new Set(alternatives.map((a) => subjectOf(a.selector)));
  const atom = {
    variant,
    alternatives,
    key: JSON.stringify(alternatives),
    // A variant that moves the subject (`*:`, `[&>svg]:`, `before:`) says
    // which element the declaration lands on, not a state of this one.
    state: subjects.size === 1 && subjects.has("self"),
  };
  atoms.set(variant, atom);
  return atom;
}

/* ------------------------------------------------------------- exclusivity */

// The complementary pairs src/lib/tokens/variants.css names whose selectors
// are not one attribute's two values (those, and the media pairs, are read
// from the selectors and queries themselves).
const COMPLEMENTS = [
  ["data-open", "data-closed"],
  ["data-checked", "data-unchecked"],
  ["dark", "light"],
];

const DISCRETE = new Set([
  "hover",
  "pointer",
  "prefers-reduced-motion",
  "prefers-reduced-transparency",
  "prefers-color-scheme",
  "prefers-contrast",
  "orientation",
  "forced-colors",
  "display-mode",
]);

const SPACES = /\s+/gu;
const AND = /\s+and\s+/u;
const NOT = /^not /u;
const RANGE = /^(width|height)(>=|<=|>|<)([\d.]+)([a-z%]*)$/u;
const MIN_MAX = /^(min|max)-(width|height):([\d.]+)([a-z%]*)$/u;
const CONTAINER_NAME = /\s+(?=\()/u;

function bare(text) {
  let t = text.replace(SPACES, "");
  while (
    t.startsWith("(") &&
    t.endsWith(")") &&
    parenthesised(t, 0).length === t.length - 2
  ) {
    t = t.slice(1, -1);
  }
  return t;
}

/** One query feature as { name, value } or { name, min, max } bounds. */
function feature(part) {
  const f = bare(part);
  const range = f.match(RANGE);
  if (range) {
    const [, name, op, n, unit] = range;
    return op.startsWith(">")
      ? { name: name + unit, min: Number(n), minOpen: op === ">" }
      : { name: name + unit, max: Number(n), maxOpen: op === "<" };
  }
  const minMax = f.match(MIN_MAX);
  if (minMax) {
    const [, side, name, n, unit] = minMax;
    return side === "min"
      ? { name: name + unit, min: Number(n) }
      : { name: name + unit, max: Number(n) };
  }
  const [name, value] = f.split(":");
  return { name, value };
}

function rangesDisjoint(list) {
  let lo = Number.NEGATIVE_INFINITY;
  let loOpen = false;
  let hi = Number.POSITIVE_INFINITY;
  let hiOpen = false;
  for (const f of list) {
    if (f.min !== undefined && (f.min > lo || (f.min === lo && f.minOpen))) {
      lo = f.min;
      loOpen = Boolean(f.minOpen);
    }
    if (f.max !== undefined && (f.max < hi || (f.max === hi && f.maxOpen))) {
      hi = f.max;
      hiOpen = Boolean(f.maxOpen);
    }
  }
  return lo > hi || (lo === hi && (loOpen || hiOpen));
}

function negated(p, q) {
  return bare(p) === bare(`not ${q}`) || bare(p.replace(NOT, "")) === bare(q);
}

/** Two queries (one at-rule kind) that can never both match. */
function queriesExclusive(p, q) {
  if (p.startsWith("not ") || q.startsWith("not ")) {
    return negated(p, q) || negated(q, p);
  }
  const byName = new Map();
  for (const f of [...p.split(AND), ...q.split(AND)].map(feature)) {
    byName.set(f.name, [...(byName.get(f.name) ?? []), f]);
  }
  for (const [name, list] of byName) {
    if (DISCRETE.has(name) && new Set(list.map((f) => f.value)).size > 1) {
      return true;
    }
    if (list.some((f) => f.value === undefined) && rangesDisjoint(list)) {
      return true;
    }
  }
  return false;
}

function atRuleExclusive(x, y) {
  if (x.name !== y.name) {
    return false;
  }
  if (x.name === "@container") {
    const [nx, ...qx] = x.params.split(CONTAINER_NAME);
    const [ny, ...qy] = y.params.split(CONTAINER_NAME);
    return nx === ny && queriesExclusive(qx.join(" "), qy.join(" "));
  }
  return queriesExclusive(x.params, y.params);
}

function atRulesExclusive(a, b) {
  return a.some((x) => b.some((y) => atRuleExclusive(x, y)));
}

const COMMA_SPACE = /,\s+/gu;
const DESCENDANT_OF = /^(.+)\s+&$/u;

/**
 * `&X, &Y` → `&:is(X,Y)`, and `X &` (`in-`) → `&:is(X *)`, the form
 * `not-in-` negates; whitespace after commas dropped.
 */
function normalSelector(selector) {
  const parts = splitList(selector);
  const inside = parts.length === 1 ? selector.match(DESCENDANT_OF) : null;
  let s = selector;
  if (parts.length > 1 && parts.every((p) => p.startsWith("&"))) {
    s = `&:is(${parts.map((p) => p.slice(1)).join(",")})`;
  } else if (inside && !inside[1].includes("&")) {
    s = `&:is(${inside[1]} *)`;
  }
  return s.replace(COMMA_SPACE, ",");
}

/** One selector is the other with a `:not(X)` taken off. */
function negations(a, b) {
  const target = normalSelector(a);
  const s = normalSelector(b);
  let at = s.indexOf(":not(");
  while (at !== -1) {
    const inner = parenthesised(s, at + 4);
    const before = s.slice(0, at);
    const after = s.slice(at + inner.length + 6);
    for (const swap of [inner, `:is(${inner})`]) {
      if (normalSelector(before + swap + after) === target) {
        return true;
      }
    }
    at = s.indexOf(":not(", at + 1);
  }
  return false;
}

const ATTRIBUTE_VALUE = /\[([\w-]+)=("?)([^\]"]*)\2\]/gu;

/** One attribute, at one place in one selector, with two different values. */
function attributeValuesDiffer(a, b) {
  const shape = (s) => s.replace(ATTRIBUTE_VALUE, "[$1=@]");
  if (shape(a) !== shape(b)) {
    return false;
  }
  const values = (s) => [...s.matchAll(ATTRIBUTE_VALUE)].map((m) => m[3]);
  const vb = values(b);
  return values(a).some((v, i) => v !== vb[i]);
}

// `first:`/`last:` are the first and last of `nth-*` counts:
// `:first-child` is `:nth-child(1)`, `:last-child` is `:nth-last-child(1)`.
const POSITION_ALIASES = [
  [/:first-child\b/gu, ":nth-child(1)"],
  [/:last-child\b/gu, ":nth-last-child(1)"],
  [/:first-of-type\b/gu, ":nth-of-type(1)"],
  [/:last-of-type\b/gu, ":nth-last-of-type(1)"],
];
const POSITION = /:nth-((?:last-)?(?:child|of-type))\(([^()]*)\)/gu;
const PLAIN_POSITION = /^\d+$/u;
const PARITY = new Set(["odd", "even"]);

function positions(selector) {
  let s = selector;
  for (const [alias, nth] of POSITION_ALIASES) {
    s = s.replace(alias, nth);
  }
  return {
    shape: s.replace(POSITION, ":nth-$1(@)"),
    args: [...s.matchAll(POSITION)].map((m) => m[2].trim()),
  };
}

/** One position count, at one place, at two different plain values. */
function positionsDiffer(a, b) {
  const pa = positions(a);
  const pb = positions(b);
  if (pa.shape !== pb.shape) {
    return false;
  }
  return pa.args.some((x, i) => {
    const y = pb.args[i];
    const plain = PLAIN_POSITION.test(x) && PLAIN_POSITION.test(y);
    const parity = PARITY.has(x) && PARITY.has(y);
    return (plain || parity) && x !== y;
  });
}

function alternativesExclusive(x, y) {
  return (
    atRulesExclusive(x.at, y.at) ||
    negations(x.selector, y.selector) ||
    negations(y.selector, x.selector) ||
    attributeValuesDiffer(x.selector, y.selector) ||
    positionsDiffer(x.selector, y.selector)
  );
}

function complements(a, b) {
  return COMPLEMENTS.some(
    ([p, q]) => a.replace(p, q) === b || a.replace(q, p) === b
  );
}

function atomsExclusive(a, b) {
  if (complements(a.variant, b.variant)) {
    return true;
  }
  return (
    a.alternatives.length > 0 &&
    b.alternatives.length > 0 &&
    a.alternatives.every((x) =>
      b.alternatives.every((y) => alternativesExclusive(x, y))
    )
  );
}

/* ------------------------------------------------------------- longhands */

const SIDES = ["top", "right", "bottom", "left"];
const FLOW = {
  inline: ["left", "right"],
  block: ["top", "bottom"],
  "inline-start": ["left"],
  "inline-end": ["right"],
  "block-start": ["top"],
  "block-end": ["bottom"],
};
const CORNERS = {
  "start-start": "top-left",
  "start-end": "top-right",
  "end-start": "bottom-left",
  "end-end": "bottom-right",
};
const SIZES = {
  "inline-size": "width",
  "block-size": "height",
  "min-inline-size": "min-width",
  "min-block-size": "min-height",
  "max-inline-size": "max-width",
  "max-block-size": "max-height",
};
const GROUPS = {
  transition: [
    "property",
    "duration",
    "timing-function",
    "delay",
    "behavior",
  ].map((p) => `transition-${p}`),
  animation: [
    "name",
    "duration",
    "timing-function",
    "delay",
    "iteration-count",
    "direction",
    "fill-mode",
    "play-state",
  ].map((p) => `animation-${p}`),
  outline: ["outline-width", "outline-style", "outline-color"],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  "flex-flow": ["flex-direction", "flex-wrap"],
  gap: ["row-gap", "column-gap"],
  overflow: ["overflow-x", "overflow-y"],
  "overflow-inline": ["overflow-x"],
  "overflow-block": ["overflow-y"],
  "place-items": ["align-items", "justify-items"],
  "place-content": ["align-content", "justify-content"],
  "place-self": ["align-self", "justify-self"],
  "grid-row": ["grid-row-start", "grid-row-end"],
  "grid-column": ["grid-column-start", "grid-column-end"],
  "grid-area": [
    "grid-row-start",
    "grid-column-start",
    "grid-row-end",
    "grid-column-end",
  ],
  "text-decoration": [
    "text-decoration-line",
    "text-decoration-style",
    "text-decoration-color",
    "text-decoration-thickness",
  ],
  background: [
    "background-color",
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
    "background-attachment",
    "background-origin",
    "background-clip",
  ],
  "border-radius": Object.values(CORNERS).map((c) => `border-${c}-radius`),
  columns: ["column-width", "column-count"],
  "list-style": ["list-style-type", "list-style-position", "list-style-image"],
  container: ["container-name", "container-type"],
};
const BORDER =
  /^(-(?:inline|block)(?:-start|-end)?|-top|-right|-bottom|-left)?(-width|-style|-color)?$/u;
const CORNER = /^border-(start|end)-(start|end)-radius$/u;
const BOX =
  /^(margin|padding|scroll-margin|scroll-padding|inset)((?:-(?:inline|block)(?:-start|-end)?|-top|-right|-bottom|-left)?)$/u;
const SEVERAL_VALUES = /\s|,/u;

/** The physical sides a box property's suffix names (``, `-inline`, `-top`). */
function sidesOf(suffix) {
  if (suffix === "") {
    return SIDES;
  }
  const flow = suffix.slice(1);
  return FLOW[flow] ?? [flow];
}

function borderLonghands(rest) {
  const parts = rest.match(BORDER);
  if (!parts) {
    return null;
  }
  const kinds = parts[2] ? [parts[2]] : ["-width", "-style", "-color"];
  return sidesOf(parts[1] ?? "").flatMap((side) =>
    kinds.map((kind) => `border-${side}${kind}`)
  );
}

/** The physical longhands a declaration writes, logical mapped to physical. */
function longhandsOf(property) {
  if (property.startsWith("--")) {
    return [property];
  }
  if (GROUPS[property] || SIZES[property]) {
    return GROUPS[property] ?? [SIZES[property]];
  }
  const corner = property.match(CORNER);
  if (corner) {
    return [`border-${CORNERS[`${corner[1]}-${corner[2]}`]}-radius`];
  }
  if (property === "border" || property.startsWith("border-")) {
    return borderLonghands(property.slice(6)) ?? [property];
  }
  const box = property.match(BOX);
  if (box) {
    const sides = sidesOf(box[2]);
    return box[1] === "inset"
      ? sides
      : sides.map((side) => `${box[1]}-${side}`);
  }
  return [property];
}

/* ------------------------------------------------------------- one class */

/** A class's style rules, through its at-rules, without @property/@keyframes. */
function rulesOf(nodes, out = []) {
  for (const node of nodes) {
    if (node.kind === "rule") {
      out.push(node);
    } else if (
      node.kind === "at-rule" &&
      node.name !== "@property" &&
      node.name !== "@keyframes"
    ) {
      rulesOf(node.nodes ?? [], out);
    }
  }
  return out;
}

/** The value each physical longhand gets, and whether any is !important. */
function writesOf(rules) {
  const writes = new Map();
  let important = false;
  for (const decl of rules.flatMap((rule) => rule.nodes ?? [])) {
    if (decl.kind === "declaration") {
      important ||= decl.important;
      const many = longhandsOf(decl.property);
      const value =
        many.length > 1 && SEVERAL_VALUES.test(decl.value)
          ? `${decl.property}:${decl.value}`
          : decl.value;
      for (const longhand of many) {
        writes.set(longhand, [...(writes.get(longhand) ?? []), value]);
      }
    }
  }
  return {
    important,
    writes: new Map([...writes].map(([k, v]) => [k, v.join(" ; ")])),
  };
}

function highestSpecificity(rules) {
  let best = [0, 0, 0];
  for (const rule of rules) {
    const s = specificity(rule.selector);
    best = greater(s, best) ? s : best;
  }
  return best.join(",");
}

const classes = new Map();

/**
 * A class's state atoms, the element its declarations land on, its
 * specificity and the value it gives each physical longhand.
 */
function classInfo(name) {
  if (classes.has(name)) {
    return classes.get(name);
  }
  const [parsed] = ds.parseCandidate(name);
  const rules = parsed ? rulesOf(ds.candidatesToAst([name])[0] ?? []) : [];
  let info = null;
  if (rules.length) {
    const variants = parsed.variants
      .map((v) => atomOf(ds.printVariant(v)))
      .reverse();
    info = {
      name,
      states: variants.filter((a) => a.state),
      target: variants
        .filter((a) => !a.state)
        .map((a) => a.key)
        .join("|"),
      hasVariants: variants.length > 0,
      specificity: highestSpecificity(rules),
      ...writesOf(rules),
    };
  }
  classes.set(name, info);
  return info;
}

/* ------------------------------------------------------------- one pair */

function contains(outer, inner) {
  const keys = new Set(outer.map((a) => a.key));
  return inner.every((a) => keys.has(a.key));
}

/** The shared longhand the two set differently, a real property first. */
function sharedLonghand(a, b) {
  let found = null;
  for (const [property, value] of a.writes) {
    const other = b.writes.get(property);
    const better =
      found === null || (found.startsWith("--") && !property.startsWith("--"));
    if (other !== undefined && other !== value && better) {
      found = property;
    }
  }
  return found;
}

function comparable(a, b) {
  return (
    a.hasVariants &&
    b.hasVariants &&
    a.target === b.target &&
    a.important === b.important &&
    a.specificity === b.specificity
  );
}

/** The longhand two classes fight over under co-occurring states, or null. */
function conflict(a, b) {
  if (!comparable(a, b)) {
    return null;
  }
  if (contains(a.states, b.states) || contains(b.states, a.states)) {
    return null;
  }
  if (a.states.some((x) => b.states.some((y) => atomsExclusive(x, y)))) {
    return null;
  }
  return sharedLonghand(a, b);
}

/**
 * Whether a third class settles the overlap itself, so the pair's order
 * never decides it: it holds exactly when both do (its states are the two
 * chains' states together), lands on the same element, writes the same
 * longhand and does not rank below them. That is a class stacked with the
 * other's state (a consumer's `…:direction-vertical:after:left-space-1` over
 * a kit root's `data-[direction=vertical]:after:left-0`). At equal
 * specificity it holds each chain's states, so it is a contained pair with
 * each, which this rule already leaves to the sort: Tailwind 4.3.3 sorts
 * `max-phone:@max-decisions-900px:hidden` after both `max-phone:block` and
 * `@max-decisions-900px:hidden`.
 */
function covered(a, b, property, others) {
  const both = new Set([...a.states, ...b.states].map((s) => s.key));
  const rank = a.specificity.split(",").map(Number);
  return others.some((c) => {
    const keys = new Set(c.states.map((s) => s.key));
    return (
      c.target === a.target &&
      c.important === a.important &&
      c.writes.has(property) &&
      keys.size === both.size &&
      [...both].every((k) => keys.has(k)) &&
      !greater(rank, c.specificity.split(",").map(Number))
    );
  });
}

function winnerOf(a, b) {
  const order = new Map(ds.getClassOrder([a, b]));
  const oa = order.get(a);
  const ob = order.get(b);
  if (oa === null || ob === null || oa === undefined || ob === undefined) {
    return null;
  }
  return oa > ob ? a : b;
}

/* ---------------------------- a class passed to a component's root */

const SVELTE_FILE = /\.svelte$/u;
const PROPS_BINDING = /let\s*\{([\s\S]*?)\}\s*(?::[^=]*)?=\s*\$props\(\)/u;
const CLASS_PROP = /\bclass\s*:\s*(\w+)/u;
const QUOTED = /"([^"]*)"|'([^']*)'|`([^`]*)`/gu;
const CALLED = /\b([A-Za-z_$][\w$]*)\s*\(/gu;
const CLASS_EQUALS = /^class=/u;
const SPACE_RUN = /\s+/u;

function quotedClasses(text) {
  return [...text.matchAll(QUOTED)].flatMap((m) =>
    (m[1] ?? m[2] ?? m[3]).split(SPACE_RUN).filter(Boolean)
  );
}

/** Every class word in the string literals under a node. */
function literalClasses(node) {
  if (!node || typeof node !== "object") {
    return [];
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value.split(SPACE_RUN).filter(Boolean);
  }
  if (node.type === "TemplateElement") {
    return (node.value.cooked ?? "").split(SPACE_RUN).filter(Boolean);
  }
  return Object.entries(node).flatMap(([key, value]) =>
    key === "range" ? [] : literalClasses(value)
  );
}

function objectProps(node) {
  return new Map(
    (node?.type === "ObjectExpression" ? node.properties : [])
      .filter((p) => p.type === "Property")
      .map((p) => [p.key.name ?? String(p.key.value), p.value])
  );
}

/** A recipe's classes, each with the variant values it needs. */
function recipeOf(config, base) {
  const props = objectProps(config);
  const worn = literalClasses(base ?? props.get("base")).map((name) => ({
    name,
    when: {},
  }));
  for (const [axis, values] of objectProps(props.get("variants"))) {
    for (const [value, node] of objectProps(values)) {
      for (const name of literalClasses(node)) {
        worn.push({ name, when: { [axis]: value } });
      }
    }
  }
  for (const entry of props.get("compoundVariants")?.elements ?? []) {
    const when = {};
    let names = [];
    for (const [key, node] of objectProps(entry)) {
      if (key === "class" || key === "className") {
        names = literalClasses(node);
      } else if (node.type === "Literal") {
        when[key] = String(node.value);
      }
    }
    worn.push(...names.map((name) => ({ name, when })));
  }
  const defaults = Object.fromEntries(
    [...objectProps(props.get("defaultVariants"))]
      .filter(([, node]) => node.type === "Literal")
      .map(([axis, node]) => [axis, String(node.value)])
  );
  return { classes: worn, defaults };
}

const MAX_DEPTH = 4;

function recipePattern(name) {
  return new RegExp(
    `\\b(?:const|let)\\s+${name.replace("$", "\\$")}\\s*=\\s*(tv|cva)\\(`,
    "u"
  );
}

/**
 * Where a module defines the recipe it exports as `name`: in its own text,
 * or through a barrel's `export { name } from "…"`.
 */
function exportedRecipe(file, name, depth) {
  const text = readText(file);
  const match = recipePattern(name).exec(text);
  if (match || depth > MAX_DEPTH || SVELTE_FILE.test(file)) {
    return match ? { text, match } : null;
  }
  for (const statement of parseScript(text).body) {
    const source = statement.source?.value;
    for (const specifier of source ? (statement.specifiers ?? []) : []) {
      const exported = specifier.exported?.name ?? specifier.exported?.value;
      const target = svelteFile(source, file) ?? moduleFile(source, file);
      if (exported === name && target) {
        const local = specifier.local.name ?? specifier.local.value;
        return exportedRecipe(target, local, depth + 1);
      }
    }
  }
  return null;
}

/** Where the recipe a component calls as `name` is defined: here, or where it is imported from. */
function recipeDefinition(name, text, file, imports) {
  const match = recipePattern(name).exec(text);
  if (match) {
    return { text, match };
  }
  const binding = imports.get(name);
  const target =
    binding?.kind === "named"
      ? (svelteFile(binding.source, file) ?? moduleFile(binding.source, file))
      : null;
  return target ? exportedRecipe(target, binding.imported, 0) : null;
}

const QUOTES = new Set(['"', "'", "`"]);

/**
 * The last character of the string, template or comment that starts at
 * `i`, or `i` itself where none does.
 */
function tokenEnd(text, i) {
  const ch = text[i];
  if (ch === "/" && text[i + 1] === "/") {
    const end = text.indexOf("\n", i);
    return end === -1 ? text.length : end;
  }
  if (ch === "/" && text[i + 1] === "*") {
    const end = text.indexOf("*/", i + 2);
    return end === -1 ? text.length : end + 1;
  }
  if (!QUOTES.has(ch)) {
    return i;
  }
  let j = i + 1;
  while (j < text.length && text[j] !== ch) {
    j += text[j] === "\\" ? 2 : 1;
  }
  return j;
}

/**
 * The arguments of the call whose `(` opens at `open`, read as script, not
 * as a selector: a parenthesis or quote inside a string, a template or a
 * comment does not count (a recipe's doc comments hold apostrophes).
 */
function callArguments(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i = tokenEnd(text, i) + 1) {
    if (text[i] === "(") {
      depth += 1;
    } else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(open + 1, i);
      }
    }
  }
  return text.slice(open + 1);
}

const GATED = /([A-Za-z_$][\w$]*)\s*&&\s*$/u;

/**
 * The classes of the `tv`/`cva` recipes a class expression calls. A call
 * behind a prop (`badge && badgeVariants()`) is worn only when the tag
 * gives that prop.
 */
function recipeClasses(expression, text, file, imports, props = new Map()) {
  return [...expression.matchAll(CALLED)].flatMap((called) => {
    const found = recipeDefinition(called[1], text, file, imports);
    if (!found) {
      return [];
    }
    const open = found.match.index + found.match[0].length - 1;
    const call = parseScript(`f(${callArguments(found.text, open)})`).body[0]
      ?.expression;
    const [first, second] = call?.arguments ?? [];
    const recipe =
      found.match[1] === "tv" ? recipeOf(first) : recipeOf(second, first);
    const gate = props.get(expression.slice(0, called.index).match(GATED)?.[1]);
    if (gate) {
      recipe.classes = recipe.classes.map((c) => ({
        ...c,
        when: { ...c.when, [gate]: GIVEN },
      }));
    }
    return [recipe];
  });
}

function svelteNodes(node, visit) {
  if (Array.isArray(node)) {
    for (const child of node) {
      svelteNodes(child, visit);
    }
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  if (node.type) {
    visit(node);
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      key !== "parent" &&
      key !== "metadata" &&
      value &&
      typeof value === "object"
    ) {
      svelteNodes(value, visit);
    }
  }
}

/** A component's own imports, from its instance and module scripts. */
function componentImports(ast) {
  const bindings = new Map();
  for (const script of [ast.instance, ast.module]) {
    for (const statement of script?.content.body ?? []) {
      if (statement.type === "ImportDeclaration") {
        importBinding(statement, bindings);
      }
    }
  }
  return bindings;
}

/** The `{ … } = $props()` pattern of a component's instance script, if any. */
function propsPattern(ast) {
  for (const statement of ast.instance?.content.body ?? []) {
    const declarator = (statement.declarations ?? []).find(
      (d) => d.init?.callee?.name === "$props" && d.id.type === "ObjectPattern"
    );
    if (declarator) {
      return declarator.id;
    }
  }
  return null;
}

/** A component's props by local name, from its `$props()` destructuring. */
function propLocals(ast) {
  const locals = new Map();
  for (const property of propsPattern(ast)?.properties ?? []) {
    const value =
      property.value?.type === "AssignmentPattern"
        ? property.value.left
        : property.value;
    if (property.type === "Property" && value?.type === "Identifier") {
      locals.set(value.name, property.key.name ?? String(property.key.value));
    }
  }
  return locals;
}

/** One root element that wears the `class` prop: its classes, and the component it is, if one. */
function rootOf(node, attribute, text, file, imports, props) {
  const expression = text
    .slice(attribute.start, attribute.end)
    .replace(CLASS_EQUALS, "");
  const recipes = recipeClasses(expression, text, file, imports, props);
  return {
    line: text.slice(0, attribute.start).split("\n").length,
    classes: [
      ...quotedClasses(expression).map((name) => ({ name, when: {} })),
      ...recipes.flatMap((recipe) => recipe.classes),
    ],
    defaults: Object.assign({}, ...recipes.map((r) => r.defaults)),
    // A root that is a component passes the class on to its own root.
    component:
      node.type === "Component"
        ? { name: node.name, chosen: compiledChoice(node) }
        : null,
  };
}

const roots = new Map();
/**
 * The elements of a component that wear its `class` prop, each with its
 * line and the classes it carries itself (its strings and its recipes'),
 * and the component's imports.
 */
function componentRoots(file) {
  if (!roots.has(file)) {
    const text = readText(file);
    const binding = text.match(PROPS_BINDING)?.[1].match(CLASS_PROP)?.[1];
    const ast = binding ? parseSvelte(text, { modern: true }) : null;
    const imports = ast ? componentImports(ast) : new Map();
    const props = ast ? propLocals(ast) : new Map();
    const found = [];
    const uses = binding
      ? new RegExp(`\\b${binding.replace("$", "\\$")}\\b`, "u")
      : null;
    svelteNodes(ast?.fragment, (node) => {
      const attribute = node.attributes?.find(
        (a) => a.type === "Attribute" && a.name === "class"
      );
      const expression = attribute
        ? text.slice(attribute.start, attribute.end).replace(CLASS_EQUALS, "")
        : "";
      if (attribute && uses.test(expression)) {
        found.push(rootOf(node, attribute, text, file, imports, props));
      }
    });
    roots.set(file, { roots: found, imports });
  }
  return roots.get(file);
}

/**
 * The looks a class passed to a component meets: each root's classes under
 * the values the tag picks, and, where a root is itself a component, that
 * component's roots under the values it is given there.
 */
function rootLooks(file, chosen, depth = 0) {
  const { roots: found, imports } = componentRoots(file);
  return found.flatMap((root) => {
    const names = root.classes
      .filter((c) => wears(c.when, chosen, root.defaults))
      .map((c) => c.name);
    const look = {
      file,
      where: `${path.relative(DASHBOARD, file)}:${root.line}`,
      names: [...new Set(names)],
    };
    const inner =
      root.component && depth < MAX_DEPTH
        ? componentFile(root.component.name, imports, file)
        : null;
    return inner
      ? [look, ...rootLooks(inner, root.component.chosen, depth + 1)]
      : [look];
  });
}

const ANY = Symbol("any value");
/** The value of a prop a recipe call is gated behind: worn when given at all. */
const GIVEN = Symbol("given");

/** The values a component tag picks, read from Svelte's own AST. */
function compiledChoice(node) {
  const props = new Map();
  let spread = false;
  for (const attribute of node.attributes) {
    if (attribute.type === "SpreadAttribute") {
      spread = true;
    } else if (attribute.type === "Attribute") {
      const parts = Array.isArray(attribute.value) ? attribute.value : [];
      const literal = parts.length === 1 && parts[0].type === "Text";
      props.set(attribute.name, literal ? parts[0].data : ANY);
    }
  }
  return { props, spread };
}

/**
 * The recipe values a component tag picks: a literal prop is its value; a
 * prop given by expression, or any prop under a spread, may be any.
 */
function chosenVariants(tag) {
  return compiledChoice(tag);
}

/** Whether a recipe class is worn under the values a tag picks. */
function wears(when, { props, spread }, defaults) {
  return Object.entries(when).every(([axis, value]) => {
    let picked = spread ? ANY : defaults[axis];
    if (props.has(axis)) {
      picked = props.get(axis);
    }
    return (
      picked === ANY ||
      picked === value ||
      (value === GIVEN && picked !== undefined)
    );
  });
}

function importBinding(declaration, bindings) {
  const source = declaration.source.value;
  for (const specifier of declaration.specifiers) {
    const kind = {
      ImportDefaultSpecifier: "default",
      ImportNamespaceSpecifier: "namespace",
    }[specifier.type];
    const imported = specifier.imported?.name ?? specifier.imported?.value;
    bindings.set(specifier.local.name, {
      source,
      kind: kind ?? "named",
      imported,
    });
  }
}

/* ------------------------------------------------------------- the rule */

const sorted = (a, b, property, winner) =>
  `"${a}" and "${b}" both set ${property} under states that can hold together, at equal specificity, so Tailwind's variant sort picks "${winner}". Make the states exclusive: the loser takes the winner's negation.`;
const sortedAcross = (a, b, root, property, winner) =>
  `"${a}", passed here, and "${b}", on the root of ${root}, both set ${property} under states that can hold together, at equal specificity, so Tailwind's variant sort picks "${winner}". Make the states exclusive: the loser takes the winner's negation, in the file it stands in.`;

/** The findings of house/variant-order in a file: `{ start, end, message }`. */
export function variantOrder(model) {
  const findings = [];
  const done = new Set();
  const imports = componentImports(model.ast);

  const reportAcross = (entry, entries, rootClasses, where, file) => {
    const info = classInfo(entry.name);
    const others = [
      ...entries
        .filter((e) => e !== entry && !separated(e, entry))
        .map((e) => e.name),
      ...rootClasses,
    ]
      .map(classInfo)
      .filter(Boolean);
    for (const other of info ? rootClasses : []) {
      const otherInfo = other === entry.name ? null : classInfo(other);
      const property = otherInfo ? conflict(info, otherInfo) : null;
      const winner =
        property && !covered(info, otherInfo, property, others)
          ? winnerOf(entry.name, other)
          : null;
      // A component's roots (an `<a>` or a `<button>`) are one look.
      const key = [entry.start, entry.name, file, other].join(":");
      if (winner && !done.has(key)) {
        done.add(key);
        findings.push({
          start: entry.start,
          end: entry.end,
          message: sortedAcross(entry.name, other, where, property, winner),
        });
      }
    }
  };

  const reportPair = (x, y, known) => {
    if (x.entry.name === y.entry.name || separated(x.entry, y.entry)) {
      return;
    }
    const property = conflict(x.info, y.info);
    const others = known
      .filter(
        (z) =>
          z !== x &&
          z !== y &&
          !separated(z.entry, x.entry) &&
          !separated(z.entry, y.entry)
      )
      .map((z) => z.info);
    const winner =
      property && !covered(x.info, y.info, property, others)
        ? winnerOf(x.entry.name, y.entry.name)
        : null;
    // Classes from an imported constant share the name's place.
    const key = [x.entry.start, x.entry.name, y.entry.start, y.entry.name].join(
      ":"
    );
    if (!winner || done.has(key)) {
      return;
    }
    done.add(key);
    const loser = winner === x.entry.name ? y.entry : x.entry;
    findings.push({
      start: loser.start,
      end: loser.end,
      message: sorted(x.entry.name, y.entry.name, property, winner),
    });
  };

  const reportList = (list) => {
    const known = list
      .map((entry) => ({ entry, info: classInfo(entry.name) }))
      .filter((x) => x.info);
    known.forEach((x, i) => {
      for (const y of known.slice(i + 1)) {
        reportPair(x, y, known);
      }
    });
  };

  const sites = sitesOf(model);
  for (const site of sites) {
    reportList(site.entries);
  }
  // A class passed to a component against each class on its root.
  for (const site of sites) {
    if (site.tag?.type !== "Component" || site.attribute !== "class") {
      continue;
    }
    const { entries } = site;
    if (entries.length === 0) {
      continue;
    }
    const file = componentFile(tagName(site.tag), imports, model.file);
    for (const look of file ? rootLooks(file, chosenVariants(site.tag)) : []) {
      for (const entry of entries) {
        reportAcross(entry, entries, look.names, look.where, look.file);
      }
    }
  }
  return findings;
}
