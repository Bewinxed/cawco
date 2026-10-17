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
// It reads the theme the way @shadcn/lint does (src/app.css, the stylesheet
// components.json names), through Tailwind's own design system
// (`__unstable__loadDesignSystem` from @tailwindcss/node, as @shadcn/lint's
// oracle loads it), and reads classes from the AST nodes @shadcn/lint reads:
// `class="…"`, strings inside `cn(…)`/`clsx(…)`/arrays/objects, `class:x`
// directives, and `tv()`/`cva()` recipes (base with each variant value).
// @shadcn/lint exports none of its readers, so they are written here.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseModule } from "@typescript-eslint/parser";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THEME = path.join(HERE, "src/app.css");
// @tailwindcss/node is @tailwindcss/vite's dependency; resolve it from there.
const fromVite = createRequire(
  fs.realpathSync(
    path.join(HERE, "node_modules/@tailwindcss/vite/package.json")
  )
);
const tailwind = await import(
  pathToFileURL(fromVite.resolve("@tailwindcss/node")).href
);
const ds = await tailwind.__unstable__loadDesignSystem(
  fs.readFileSync(THEME, "utf8"),
  { base: path.dirname(THEME) }
);

/* ---------------------------------------------------------------- selectors */

const OPEN = new Set(["(", "["]);
const CLOSE = new Set([")", "]"]);
const COMBINATORS = new Set([" ", ">", "+", "~"]);
const NAME_END = /[.#[:\s>+~,()]/;
const IS_OR_WHERE = /^:(?:is|where)\(/;

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

const ESCAPED_PROBE = /\.(?:[^\s.#[\]():>+~,\\]|\\.)*\\:hidden/g;
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

const SPACES = /\s+/g;
const AND = /\s+and\s+/;
const NOT = /^not /;
const RANGE = /^(width|height)(>=|<=|>|<)([\d.]+)([a-z%]*)$/;
const MIN_MAX = /^(min|max)-(width|height):([\d.]+)([a-z%]*)$/;
const CONTAINER_NAME = /\s+(?=\()/;

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

const COMMA_SPACE = /,\s+/g;
const DESCENDANT_OF = /^(.+)\s+&$/;

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

const ATTRIBUTE_VALUE = /\[([\w-]+)=("?)([^\]"]*)\2\]/g;

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
  [/:first-child\b/g, ":nth-child(1)"],
  [/:last-child\b/g, ":nth-last-child(1)"],
  [/:first-of-type\b/g, ":nth-of-type(1)"],
  [/:last-of-type\b/g, ":nth-last-of-type(1)"],
];
const POSITION = /:nth-((?:last-)?(?:child|of-type))\(([^()]*)\)/g;
const PLAIN_POSITION = /^\d+$/;
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
  /^(-(?:inline|block)(?:-start|-end)?|-top|-right|-bottom|-left)?(-width|-style|-color)?$/;
const CORNER = /^border-(start|end)-(start|end)-radius$/;
const BOX =
  /^(margin|padding|scroll-margin|scroll-padding|inset)((?:-(?:inline|block)(?:-start|-end)?|-top|-right|-bottom|-left)?)$/;
const SEVERAL_VALUES = /\s|,/;

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

function winnerOf(a, b) {
  const order = new Map(ds.getClassOrder([a, b]));
  const oa = order.get(a);
  const ob = order.get(b);
  if (oa === null || ob === null || oa === undefined || ob === undefined) {
    return null;
  }
  return oa > ob ? a : b;
}

/* ------------------------------------------------------------- reading */

const MERGERS = new Set([
  "cn",
  "cx",
  "clsx",
  "twMerge",
  "twJoin",
  "classNames",
]);
const RECIPES = new Set(["tv", "cva"]);
const WRAPPERS = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "SvelteMustacheTag",
]);
const WORD = /\S+/g;
const LEADING_SPACE = /^\s/;
const TRAILING_SPACE = /\s$/;
const LEADING_WORD = /^\S+/;
const TRAILING_WORD = /\S+$/;
const CLASS_ATTRIBUTE = /class/i;

function calleeName(call) {
  return call.callee?.type === "Identifier" ? call.callee.name : null;
}

function unwrap(node) {
  let n = node;
  while (n && WRAPPERS.has(n.type)) {
    n = n.expression;
  }
  return n;
}

function keyOf(property) {
  if (property.computed) {
    return property.key?.type === "Literal" ? String(property.key.value) : null;
  }
  return property.key?.type === "Identifier"
    ? property.key.name
    : String(property.key?.value ?? "");
}

function memberKey(node) {
  if (!node.computed) {
    return node.property.name;
  }
  return node.property.type === "Literal" ? String(node.property.value) : null;
}

function blank(word) {
  return " ".repeat(word.length);
}

const SRC_LIB = path.join(HERE, "src/lib");
const LIB_ALIAS = /^[#$]lib\//;
const SCRIPT_MODULE = /\.(?:ts|js)$/;
const JS_EXTENSION = /\.js$/;

/** The `.ts`/`.js` module a specifier names, in this repo, or null. */
function moduleFile(specifier, from) {
  let base = null;
  if (LIB_ALIAS.test(specifier)) {
    base = path.join(SRC_LIB, specifier.slice(5));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(from), specifier);
  }
  if (!base) {
    return null;
  }
  const stem = base.replace(JS_EXTENSION, "");
  const found = [`${stem}.ts`, `${stem}.js`, `${base}/index.ts`].find((file) =>
    fs.statSync(file, { throwIfNoEntry: false })?.isFile()
  );
  return found && SCRIPT_MODULE.test(found) ? found : null;
}

const moduleExports = new Map();
/** A module's `export const name = …` initialisers, by name. */
function exportedConsts(file) {
  if (!moduleExports.has(file)) {
    const consts = new Map();
    const ast = parseModule(fs.readFileSync(file, "utf8"), { range: true });
    for (const statement of ast.body) {
      const declaration =
        statement.type === "ExportNamedDeclaration"
          ? statement.declaration
          : null;
      if (
        declaration?.type === "VariableDeclaration" &&
        declaration.kind === "const"
      ) {
        for (const d of declaration.declarations) {
          if (d.id.type === "Identifier" && d.init) {
            consts.set(d.id.name, d.init);
          }
        }
      }
    }
    moduleExports.set(file, consts);
  }
  return moduleExports.get(file);
}

/** What a named import is bound to, when it is another module's `export const`. */
function importedConst(def, from) {
  const imported =
    def.node.type === "ImportSpecifier" ? def.node.imported : null;
  const name = imported?.name ?? imported?.value;
  const file = name ? moduleFile(def.parent.source.value, from) : null;
  return file ? (exportedConsts(file).get(name) ?? null) : null;
}

/**
 * Reads the class strings an expression can produce in one file. Each entry
 * is one class with where it stands and the branches it is on: two entries
 * whose `tags` give one axis different values never stand together (the two
 * sides of a ternary, two values of one recipe variant, two recipe slots).
 */
function reader(context) {
  const { sourceCode } = context;
  const axes = new WeakMap();
  let next = 0;
  const axis = (node) => {
    if (!axes.has(node)) {
      next += 1;
      axes.set(node, `b${next}`);
    }
    return axes.get(node);
  };

  const words = (text, start, tags, out) => {
    for (const m of text.matchAll(WORD)) {
      const from = start + m.index;
      out.push({ name: m[0], start: from, end: from + m[0].length, tags });
    }
  };

  const resolve = (identifier, seen) => {
    // A node read from another module has no parent and no scope here.
    let scope = identifier.parent ? sourceCode.getScope(identifier) : null;
    while (scope) {
      const variable = scope.set.get(identifier.name);
      if (variable) {
        return seen.has(variable) ? null : bindingOf(variable);
      }
      scope = scope.upper;
    }
    return null;
  };

  /** What a `const` or a named import of an `export const` is bound to. */
  const bindingOf = (variable) => {
    const [def] = variable.defs;
    if (def?.type === "ImportBinding") {
      const init = importedConst(def, context.physicalFilename);
      return init ? { init, variable, foreign: true } : null;
    }
    const ok =
      def?.type === "Variable" &&
      def.parent?.kind === "const" &&
      def.node.id.type === "Identifier";
    return ok ? { init: def.node.init, variable, foreign: false } : null;
  };

  const visitors = {
    Literal(node, tags, out) {
      if (typeof node.value === "string") {
        words(node.value, node.range[0] + 1, tags, out);
      }
    },
    SvelteLiteral(node, tags, out) {
      words(node.value, node.range[0], tags, out);
    },
    TemplateLiteral(node, tags, out, seen) {
      node.quasis.forEach((quasi, i) => {
        let text = quasi.value.cooked ?? "";
        // A word glued to an expression is not a whole class.
        if (i > 0 && !LEADING_SPACE.test(text)) {
          text = text.replace(LEADING_WORD, blank);
        }
        if (i < node.expressions.length && !TRAILING_SPACE.test(text)) {
          text = text.replace(TRAILING_WORD, blank);
        }
        words(text, quasi.range[0] + 1, tags, out);
      });
      for (const expression of node.expressions) {
        visit(expression, tags, out, seen);
      }
    },
    ConditionalExpression(node, tags, out, seen) {
      visit(node.consequent, { ...tags, [axis(node)]: "then" }, out, seen);
      visit(node.alternate, { ...tags, [axis(node)]: "else" }, out, seen);
    },
    LogicalExpression(node, tags, out, seen) {
      if (node.operator === "&&") {
        visit(node.right, tags, out, seen);
        return;
      }
      visit(node.left, { ...tags, [axis(node)]: "left" }, out, seen);
      visit(node.right, { ...tags, [axis(node)]: "right" }, out, seen);
    },
    ArrayExpression(node, tags, out, seen) {
      for (const element of node.elements) {
        visit(element, tags, out, seen);
      }
    },
    ObjectExpression(node, tags, out) {
      for (const property of node.properties) {
        const key = property.type === "Property" ? keyOf(property) : null;
        if (key) {
          const quoted = property.key.type === "Literal" ? 1 : 0;
          words(key, property.key.range[0] + quoted, tags, out);
        }
      }
    },
    CallExpression(node, tags, out, seen) {
      const name = calleeName(node);
      if (MERGERS.has(name)) {
        for (const argument of node.arguments) {
          visit(argument, tags, out, seen);
        }
      } else if (RECIPES.has(name)) {
        visitRecipe(node, name, tags, out, seen);
      } else if (name === "$derived") {
        visit(node.arguments[0], tags, out, seen);
      }
    },
    Identifier(node, tags, out, seen) {
      const found = resolve(node, seen);
      if (!found) {
        return;
      }
      const followed = new Set([...seen, found.variable]);
      if (!found.foreign) {
        visit(found.init, tags, out, followed);
        return;
      }
      // Another module's classes stand where this file names them.
      const imported = [];
      visit(found.init, tags, imported, followed);
      for (const entry of imported) {
        out.push({ ...entry, start: node.range[0], end: node.range[1] });
      }
    },
    MemberExpression(node, tags, out, seen) {
      const object = unwrap(node.object);
      const key = memberKey(node);
      const found =
        object?.type === "Identifier" ? resolve(object, seen) : null;
      const init = unwrap(found?.init);
      if (!(key && init?.type === "ObjectExpression")) {
        return;
      }
      const property = init.properties.findLast(
        (p) => p.type === "Property" && keyOf(p) === key
      );
      if (property) {
        visit(property.value, tags, out, new Set([...seen, found.variable]));
      }
    },
  };

  const visit = (raw, tags, out, seen) => {
    const node = unwrap(raw);
    visitors[node?.type]?.(node, tags, out, seen);
  };

  const slotted = (value, tags, out, seen, slots) => {
    const v = unwrap(value);
    if (!(slots && v?.type === "ObjectExpression")) {
      visit(value, { ...tags, slot: "base" }, out, seen);
      return;
    }
    for (const property of v.properties) {
      if (property.type === "Property") {
        visit(property.value, { ...tags, slot: keyOf(property) }, out, seen);
      }
    }
  };

  const visitVariants = (variants, tags, out, seen, slots) => {
    for (const group of variants?.properties ?? []) {
      const values = group.type === "Property" ? unwrap(group.value) : null;
      for (const value of values?.properties ?? []) {
        if (value.type === "Property") {
          const when = { ...tags, [`v:${keyOf(group)}`]: keyOf(value) };
          slotted(value.value, when, out, seen, slots);
        }
      }
    }
  };

  const compoundOf = (entry, tags) => {
    const when = { ...tags };
    let classValue = null;
    for (const property of entry.properties) {
      const key = property.type === "Property" ? keyOf(property) : null;
      const value = key ? unwrap(property.value) : null;
      if (key === "class" || key === "className") {
        classValue = property.value;
      } else if (value?.type === "Literal") {
        when[`v:${key}`] = String(value.value);
      }
    }
    return { when, classValue };
  };

  const visitCompounds = (compoundVariants, tags, out, seen, slots) => {
    for (const entry of compoundVariants?.elements ?? []) {
      if (entry?.type === "ObjectExpression") {
        const { when, classValue } = compoundOf(entry, tags);
        slotted(classValue, when, out, seen, slots);
      }
    }
  };

  const visitRecipe = (node, name, tags, out, seen) => {
    const config = unwrap(node.arguments[name === "tv" ? 0 : 1]);
    if (name === "cva") {
      visit(node.arguments[0], { ...tags, slot: "base" }, out, seen);
    }
    if (config?.type !== "ObjectExpression") {
      return;
    }
    const props = new Map(
      config.properties
        .filter((p) => p.type === "Property")
        .map((p) => [keyOf(p), unwrap(p.value)])
    );
    const slots = props.get("slots")?.type === "ObjectExpression";
    visit(props.get("base"), { ...tags, slot: "base" }, out, seen);
    if (slots) {
      slotted(props.get("slots"), tags, out, seen, true);
    }
    visitVariants(props.get("variants"), tags, out, seen, slots);
    visitCompounds(props.get("compoundVariants"), tags, out, seen, slots);
  };

  return (node) => {
    const out = [];
    visit(node, {}, out, new Set());
    return out;
  };
}

function separated(a, b) {
  return Object.keys(a.tags).some(
    (k) => k in b.tags && a.tags[k] !== b.tags[k]
  );
}

/* ------------------------------------------------------------- the rule */

function attributeName(attribute) {
  return typeof attribute.key?.name === "string" ? attribute.key.name : "";
}

function isClassCall(node) {
  const name = node.type === "CallExpression" ? calleeName(node) : null;
  return MERGERS.has(name) || RECIPES.has(name);
}

function isClassAttribute(node) {
  return (
    (node.type === "SvelteAttribute" ||
      node.type === "SvelteShorthandAttribute") &&
    CLASS_ATTRIBUTE.test(attributeName(node))
  );
}

function insideClassSite(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (isClassCall(n) || isClassAttribute(n)) {
      return true;
    }
  }
  return false;
}

/**
 * The class lists of one start tag: `class` with every `class:x` directive
 * (one element), and each other `*class*` attribute on its own.
 */
function startTagLists(tag, read) {
  const own = [];
  const lists = [own];
  for (const attribute of tag.attributes) {
    if (attribute.type === "SvelteDirective" && attribute.kind === "Class") {
      const { name, range } = attribute.key.name;
      own.push({ name, start: range[0], end: range[1], tags: {} });
    } else if (isClassAttribute(attribute)) {
      const parts =
        attribute.type === "SvelteShorthandAttribute"
          ? [attribute.value]
          : attribute.value;
      const entries = parts.flatMap((part) => read(part));
      if (attributeName(attribute) === "class") {
        own.push(...entries);
      } else {
        lists.push(entries);
      }
    }
  }
  return lists;
}

const variantOrder = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Two utilities on one element that set one property under states that can hold together must not leave the winner to Tailwind's variant sort.",
    },
    schema: [],
    messages: {
      sorted:
        '"{{a}}" and "{{b}}" both set {{property}} under states that can hold together, at equal specificity, so Tailwind\'s variant sort picks "{{winner}}". Make the states exclusive: the loser takes the winner\'s negation.',
    },
  },
  create(context) {
    const read = reader(context);
    const lists = [];
    const done = new Set();

    const reportPair = (x, y) => {
      if (x.entry.name === y.entry.name || separated(x.entry, y.entry)) {
        return;
      }
      const property = conflict(x.info, y.info);
      const winner = property ? winnerOf(x.entry.name, y.entry.name) : null;
      // Classes from an imported constant share the name's place.
      const key = [
        x.entry.start,
        x.entry.name,
        y.entry.start,
        y.entry.name,
      ].join(":");
      if (!winner || done.has(key)) {
        return;
      }
      done.add(key);
      const loser = winner === x.entry.name ? y.entry : x.entry;
      context.report({
        loc: {
          start: context.sourceCode.getLocFromIndex(loser.start),
          end: context.sourceCode.getLocFromIndex(loser.end),
        },
        messageId: "sorted",
        data: { a: x.entry.name, b: y.entry.name, property, winner },
      });
    };

    const reportList = (list) => {
      const known = list
        .map((entry) => ({ entry, info: classInfo(entry.name) }))
        .filter((x) => x.info);
      known.forEach((x, i) => {
        for (const y of known.slice(i + 1)) {
          reportPair(x, y);
        }
      });
    };

    return {
      SvelteStartTag(tag) {
        lists.push(...startTagLists(tag, read));
      },
      CallExpression(node) {
        if (isClassCall(node) && !insideClassSite(node)) {
          lists.push(read(node));
        }
      },
      "Program:exit"() {
        for (const list of lists) {
          reportList(list);
        }
      },
    };
  },
};

/* ------------------------------------- house/group-not-needs-ancestor */

// `group-not-x/name:` is `:is(:where(.group/name):not(x) *)`: it holds only
// inside a `group/name` element whose x is off, so with no such ancestor it
// never matches. `not-group-x/name:` (`:not(:is(.group/name x *))`) holds
// there too. The same for `peer-not-` against a preceding `peer/name`.
const NOT_RELATION = /^(group|peer)-not-.*?(?:\/([\w-]+))?$/;
const BRANCHES = ["children", "else", "pending", "then", "catch"];
const CONTAINERS = [...BRANCHES, "body"];

const relations = new Map();
/** A class's `group-not-`/`peer-not-` variants, with the class each needs. */
function relationsOf(name) {
  if (!relations.has(name)) {
    const [parsed] = ds.parseCandidate(name);
    const found = (parsed?.variants ?? []).flatMap((v) => {
      const variant = ds.printVariant(v);
      const match = variant.match(NOT_RELATION);
      if (!match) {
        return [];
      }
      const [, kind, modifier] = match;
      const marker = modifier ? `${kind}/${modifier}` : kind;
      return [{ variant, kind, marker }];
    });
    relations.set(name, found);
  }
  return relations.get(name);
}

/** The elements a node renders at its own level, through blocks only. */
function elementsWithin(node) {
  if (node?.type === "SvelteElement") {
    return [node];
  }
  return BRANCHES.flatMap((key) => {
    const value = node?.[key];
    if (Array.isArray(value)) {
      return value.flatMap(elementsWithin);
    }
    return value?.type ? elementsWithin(value) : [];
  });
}

/** The name a `{@render name(…)}` calls. */
function renderedName(tag) {
  const call =
    tag.expression?.type === "ChainExpression"
      ? tag.expression.expression
      : tag.expression;
  return call?.callee?.type === "Identifier" ? call.callee.name : null;
}

/**
 * Where a snippet stands when rendered: each `{@render name()}` in the file.
 * A snippet passed to a component (`{#snippet children()}` inside its tag)
 * stands where it is written, so none.
 */
function renderSites(snippet, renders) {
  if (snippet.parent?.type === "SvelteElement") {
    return [];
  }
  const name = snippet.id?.name;
  return renders.filter((tag) => renderedName(tag) === name);
}

const MAX_HOPS = 8;

/**
 * The ancestor elements of a node, one list per way it is rendered: a
 * snippet's elements stand under each of its render sites.
 */
function ancestorPaths(node, renders, hops = 0) {
  const out = [];
  for (let n = node.parent; n; n = n.parent) {
    if (n.type === "SvelteElement") {
      out.push(n);
    }
    const sites =
      n.type === "SvelteSnippetBlock" && hops < MAX_HOPS
        ? renderSites(n, renders)
        : [];
    if (sites.length) {
      return sites.flatMap((site) =>
        ancestorPaths(site, renders, hops + 1).map((way) => [...out, ...way])
      );
    }
  }
  return [out];
}

/**
 * The elements before a node under the same parent element, in DOM order,
 * one list per way it is rendered (a snippet's top level stands at each of
 * its render sites).
 */
function precedingPaths(start, renders, hops = 0) {
  const out = [];
  let node = start;
  while (node.parent && node.type !== "Program") {
    const { parent } = node;
    for (const key of CONTAINERS) {
      const list = parent[key];
      if (Array.isArray(list) && list.includes(node)) {
        out.push(...list.slice(0, list.indexOf(node)).flatMap(elementsWithin));
      }
    }
    if (parent.type === "SvelteElement") {
      break;
    }
    const sites =
      parent.type === "SvelteSnippetBlock" && hops < MAX_HOPS
        ? renderSites(parent, renders)
        : [];
    if (sites.length) {
      return sites.flatMap((site) =>
        precedingPaths(site, renders, hops + 1).map((way) => [...out, ...way])
      );
    }
    node = parent;
  }
  return [out];
}

const groupNotNeedsAncestor = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A group-not-/peer-not- variant matches only when its group/peer is there; flag it where this file renders none.",
    },
    schema: [],
    messages: {
      alone:
        '"{{name}}" uses {{variant}}, which matches only {{where}} carrying "{{marker}}"; this file renders none there, so on its own it never matches. If the condition should not require the {{kind}}, write not-{{kind}}-… instead.',
    },
  },
  create(context) {
    const read = reader(context);
    const carried = new WeakMap();
    const inMarkup = new Set();
    const scripted = [];
    const elements = [];
    const renders = [];

    const classesOf = (element) => {
      if (!carried.has(element)) {
        const [own] = startTagLists(element.startTag, read);
        carried.set(element, new Set(own.map((entry) => entry.name)));
      }
      return carried.get(element);
    };

    const report = (entry, relation) =>
      context.report({
        loc: {
          start: context.sourceCode.getLocFromIndex(entry.start),
          end: context.sourceCode.getLocFromIndex(entry.end),
        },
        messageId: "alone",
        data: {
          name: entry.name,
          variant: relation.variant,
          marker: relation.marker,
          kind: relation.kind,
          where:
            relation.kind === "group"
              ? "inside an ancestor"
              : "after a preceding sibling",
        },
      });

    /** Whether every way the element is rendered has the class it needs. */
    const backed = (element, relation) => {
      const ways =
        relation.kind === "group"
          ? ancestorPaths(element, renders)
          : precedingPaths(element, renders);
      return ways.every((way) =>
        way.some((el) => classesOf(el).has(relation.marker))
      );
    };

    const checkElement = (element) => {
      for (const entry of startTagLists(element.startTag, read).flat()) {
        inMarkup.add(entry.start);
        for (const relation of relationsOf(entry.name)) {
          if (!backed(element, relation)) {
            report(entry, relation);
          }
        }
      }
    };

    return {
      SvelteElement(element) {
        elements.push(element);
      },
      SvelteRenderTag(tag) {
        renders.push(tag);
      },
      CallExpression(node) {
        if (isClassCall(node) && !insideClassSite(node)) {
          scripted.push(...read(node));
        }
      },
      // Elements are judged once every render site is known. A class string
      // no markup in this file carries (a recipe, a helper call in a .ts
      // module) stands on no element here.
      "Program:exit"() {
        for (const element of elements) {
          checkElement(element);
        }
        for (const entry of scripted) {
          if (!inMarkup.has(entry.start)) {
            for (const relation of relationsOf(entry.name)) {
              report(entry, relation);
            }
          }
        }
      },
    };
  },
};

export const house = {
  meta: { name: "house" },
  rules: {
    "variant-order": variantOrder,
    "group-not-needs-ancestor": groupNotNeedsAncestor,
  },
};
