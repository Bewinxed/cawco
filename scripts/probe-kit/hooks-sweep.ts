#!/usr/bin/env bun
/**
 * The hook sweep: every element a probe-kit spec selects by a
 * component-local class gets a hook that is not a class, so the classes can
 * go without a spec losing what it reads.
 *
 *   bun scripts/probe-kit/hooks-sweep.ts [--specs] [--dry] [--verbose] [--map <file>]
 *
 * A class is a style, a state is an attribute, a hook is `data-slot`:
 *
 * - It reads every class selector in the specs (`specs/**`, the kit's own
 *   `*.ts`; the iOS and Mac specs read the app, not the dashboard): the
 *   string literals and template pieces that parse as a selector, and the
 *   names `classList.contains` asks for.
 * - It finds each class in the dashboard's `.svelte` markup: a static
 *   `class="… x …"`, a `class:x={…}` directive, a string in a `class={…}`
 *   expression (`cn()`, `clsx`, arrays, objects, ternaries, `&&`, template
 *   literals), on an element, or passed to a component that spreads its rest
 *   props onto the element its `class` lands on.
 * - Each element that carries the class gets its hook. A class always
 *   present on the element is a slot: `data-slot="x"`. One present on a
 *   condition is a state: `data-x={cond || undefined}` beside it. A static
 *   class that loses its element's `data-slot` to another class (the one
 *   more specs read) is a flag: `data-x`.
 * - A name an existing selector, Tailwind variant, attribute read or
 *   library already uses is not taken again (`data-slot` values on other
 *   elements or in selectors; `[data-x`, `data-x:`, `data-[x`). A hook that
 *   collides is named `<component>-<class>` (the kebab-case file name; a
 *   route's folder before its `+page`).
 * - An element with a `data-slot` of its own keeps it, and a component that
 *   sets its own `data-slot` or drops its rest props is not reached: both
 *   are left to be mapped by hand.
 * - Every class stays where it is; nothing is removed.
 *
 * `sweep-leftovers.txt` beside it lists every spec selector the hooks do
 * not cover, one line each: `spec:line  selector  why` (a class library DOM
 * or a run-time template builds, an element no hook reaches, kit.ts's
 * `COMPOSER`).
 *
 * `--specs` also rewrites the specs' selectors to the hooks (`.x` →
 * `[data-slot="x"]`; a state → `[aria-…]` where every element's ARIA
 * carries it and the selector names it in a compound, `[data-x]`
 * otherwise; `classList.contains("x")` → `matches(…)`). Without it the specs
 * are left as they are. `--dry` writes nothing; `--verbose` prints each
 * class's plan; `--map <file>` writes each hooked class's hook selector as
 * JSON.
 *
 * Re-runnable: an element that already carries its hook is left as it is,
 * and a spec selector already on a hook has no class left to map.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(import.meta.dir, "../..");
const KIT = import.meta.dir;
const DASHBOARD = join(ROOT, "apps", "dashboard");
const SRC = join(DASHBOARD, "src");
const LEFTOVERS = join(KIT, "sweep-leftovers.txt");

const argv = process.argv.slice(2);
const REWRITE_SPECS = argv.includes("--specs");
const DRY = argv.includes("--dry");
const VERBOSE = argv.includes("--verbose");
/** `--only <spec,…>`: the specs `--specs` rewrites, by file name without `.ts`; every one when unset. */
const onlyAt = argv.indexOf("--only");
const ONLY =
  onlyAt === -1 ? null : new Set((argv[onlyAt + 1] ?? "").split(","));

// ---------------------------------------------------------------------------
// The Svelte compiler's modern AST, as far as this sweep reads it.

interface Pos {
  end: number;
  start: number;
}
interface EsNode extends Pos {
  type: string;
  [key: string]: unknown;
}
interface TextPart extends Pos {
  data: string;
  type: "Text";
}
interface ExpressionTag extends Pos {
  expression: EsNode;
  type: "ExpressionTag";
}
interface SvelteAttribute extends Pos {
  expression?: EsNode;
  name: string;
  type: string;
  value?: true | ExpressionTag | (TextPart | ExpressionTag)[];
}
interface SvelteNode extends Pos {
  attributes?: SvelteAttribute[];
  name?: string;
  name_loc?: { end: { character: number } };
  type: string;
  [key: string]: unknown;
}
interface SvelteRoot {
  fragment: SvelteNode;
  instance?: { content: EsNode };
}
const { parse } = (await import(
  join(DASHBOARD, "node_modules", "svelte", "src", "compiler", "index.js")
)) as { parse: (source: string, options: { modern: true }) => SvelteRoot };

// ---------------------------------------------------------------------------
// Patterns.

const WHITESPACE = /\s+/;
const LEADING_SPACE = /^\s/;
const TRAILING_SPACE = /\s$/;
const APPLE_SPEC = /^(ios-|mac-|apple-|keychain-)/;
const CLASS_NAME = /^-?[a-zA-Z_][\w-]*/;
const ID_NAME = /^-?[a-zA-Z_\uE000][\w\-\uE000]*/;
const PSEUDO_NAME = /^:?[a-z][a-z-]*/;
const WORD = /^[a-zA-Z][\w-]*/;
const LETTER = /[a-zA-Z]/;
const COMBINATOR = /[\s>+~,*\uE000]/;
const ARGUMENT = /[\w+-]/;
const COMPOUND_AFTER = /[.[:#]/;
const COMPOUND_BEFORE = /[\w\])]/;
const BACKSLASH = /\\/;
const PLACEHOLDER = /\uE000/g;
const JS_EXT = /\.js$/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/.*$/gm;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const TYPE_PREFIX = /^type\s+/;
const AS = /\s+as\s+/;
const DEFAULT_IMPORT = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g;
const EXPORT_LIST = /export\s*\{([^}]*)\}\s*(?:from\s*["']([^"']+)["'])?/g;
// `import A from`, `import * as A from`, `import { A } from`, `import A, { B } from`.
const ANY_IMPORT =
  /import\s+(?:(\w+)\s*,?\s*)?(?:\*\s+as\s+(\w+)|\{([^}]*)\})?\s*from\s+["']([^"']+)["']/g;
const CAMEL = /([a-z0-9])([A-Z])/g;
const ROUTE_PUNCTUATION = /[[\]()]/g;
const LIBRARY_ATTR = /data-([a-z][a-z0-9-]*[a-z0-9])/g;
const ATTR_SELECTOR = /\[data-([a-z][a-z0-9-]*[a-z0-9])/g;
const ATTR_VARIANT = /data-([a-z][a-z0-9-]*[a-z0-9])(?:\/[\w-]+)?:/g;
const ATTR_ARBITRARY = /data-\[([a-z][a-z0-9-]*)/g;
const ATTR_READ =
  /(?:get|has|set|toggle|remove)Attribute\(\s*["'`]data-([a-z][\w-]*)/g;
const DATASET = /\bdataset\.([a-zA-Z]\w*)/g;
const ATTR_SET = /(?:set|toggle)Attribute\(\s*["'`]data-([a-z][\w-]*)/g;
const CLASS_LIST = /classList\.(?:add|toggle)\(([^)]*)\)/g;
const QUOTED_WORD = /["'`]([\w-]+)["'`]/g;
const SLOT_SET =
  /setAttribute\(\s*["'`]data-slot["'`]\s*,\s*["'`]([\w-]+)["'`]/g;
const CLASS_SET =
  /(?:className\s*=|setAttribute\(\s*["'`]class["'`]\s*,)\s*["'`]([^"'`]+)["'`]/g;
const SLOT_SELECTOR =
  /(?:\[data-slot|data-\[slot)[~|^$*]?=\\?["']?([a-zA-Z][\w-]*)/g;
const LIBRARY_FILE = /\.(js|svelte|css|mjs)$/;
const OWN_FILE = /\.(svelte|ts|js|css)$/;
const AGENT_FILE = /\.(ts|css|svelte|html)$/;
const SPACES = /\s+/g;
const SPACES_AND_PARENS = /[\s()]+/g;
const IDENT = /^[A-Za-z_$][\w$]*/;
const MEMBER = /^[A-Za-z_$][\w$]*\??\.([A-Za-z_$][\w$]*)$/;
const STRING_LITERAL = /["'`]([^"'`\n]*)["'`]/g;
const CALLEE = /\b([A-Za-z_$][\w$]*)\s*\(/g;
const OUTER_PARENS = /^\((.*)\)$/;
const ARIA_TERNARY =
  /^(.*)\?\s*["']([\w-]+)["']\s*:\s*(undefined|false|null|"false")$/s;
const SIMPLE = /^[\w$.]+$/;
const GLUE_END = /[-_]$/;
const GLUE_START = /^[-_]/;
const DIGITS = /^\d+$/;
const QUOTE = /"/g;

// ---------------------------------------------------------------------------
// Files.

const walk = (dir: string, keep: (file: string) => boolean): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules") {
      return [];
    }
    if (statSync(path).isDirectory()) {
      return walk(path, keep);
    }
    return keep(path) ? [path] : [];
  });

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};
const isDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** The iOS and Mac specs read the app, not the dashboard. */
const SPEC_FILES = [
  ...walk(join(KIT, "specs"), (f) => f.endsWith(".ts")),
  ...readdirSync(KIT)
    .filter((f) => f.endsWith(".ts") && f !== basename(import.meta.path))
    .map((f) => join(KIT, f)),
].filter((f) => !APPLE_SPEC.test(basename(f)));
const SVELTE_FILES = walk(SRC, (f) => f.endsWith(".svelte"));
const rel = (file: string): string => relative(ROOT, file);
const kebab = (name: string): string =>
  name.replace(CAMEL, "$1-$2").toLowerCase();
/**
 * A component's name, kebab-case: its file's (`TaskCard.svelte` is
 * `task-card`), a route's folder before its file's
 * (`config/devices/+page.svelte` is `devices-page`).
 */
const componentName = (file: string): string => {
  const own = basename(file, ".svelte");
  if (!own.startsWith("+")) {
    return kebab(own);
  }
  const folder = basename(dirname(file)).replace(ROUTE_PUNCTUATION, "");
  return `${kebab(folder)}-${own.slice(1)}`;
};

// ---------------------------------------------------------------------------
// Selectors.

/** Every HTML and SVG element name a spec selector may name. */
const TAGS = new Set(
  "a abbr address article aside audio b body blockquote br button canvas caption code col colgroup dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main mark menu meta nav noscript object ol optgroup option output p picture pre progress q s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr u ul var video wbr svg path g circle rect line polyline polygon ellipse text tspan use defs symbol clippath mask lineargradient radialgradient stop foreignobject image filter marker pattern".split(
    " "
  )
);

/** The custom elements the dashboard's markup renders: the only hyphenated names a selector may name. */
const CUSTOM_TAGS = new Set<string>();

interface ClassToken {
  /** Offset of the `.` in the text read. */
  at: number;
  name: string;
}

/** The offset past an attribute selector that opens at `i`, or -1 when it never closes. */
function pastBracket(text: string, from: number): number {
  let quote: string | null = null;
  for (let i = from + 1; i < text.length; i += 1) {
    const c = text[i] as string;
    if (quote !== null) {
      if (c === "\\") {
        i += 1;
      } else if (c === quote) {
        quote = null;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "]") {
      return i + 1;
    }
  }
  return -1;
}

/** The length of what `pattern` reads at `from`, or -1. */
const lengthAt = (pattern: RegExp, text: string, from: number): number =>
  pattern.exec(text.slice(from))?.[0].length ?? -1;

/** A word outside parentheses must name an element: an HTML or SVG tag, or a custom element. */
function wordAt(text: string, i: number, depth: number): number {
  const [word] = WORD.exec(text.slice(i)) as RegExpExecArray;
  const name = word.toLowerCase();
  if (depth === 0 && !(TAGS.has(name) || CUSTOM_TAGS.has(name))) {
    return -1;
  }
  return word.length;
}

/**
 * The class tokens of a selector, or null when `text` is not one: a type
 * selector that names no element, a character no selector has outside its
 * brackets, quotes and parentheses. `\uE000` stands for a template's
 * interpolation, which may be any part of a selector.
 */
function selectorClasses(text: string): ClassToken[] | null {
  const scan: Scan = { depth: 0, tokens: [] };
  let i = 0;
  while (i < text.length) {
    i = stepAt(text, i, scan);
    if (i === -1) {
      return null;
    }
  }
  return scan.depth === 0 && scan.tokens.length > 0 ? scan.tokens : null;
}

interface Scan {
  depth: number;
  tokens: ClassToken[];
}

/** The offset past a name of `length` that starts after `i`'s one character, or -1 for none. */
const past = (i: number, length: number): number =>
  length > 0 ? i + 1 + length : -1;

/** What each selector character that opens a part reads: the offset past it, or -1. */
const PARTS: Record<string, (text: string, i: number, scan: Scan) => number> = {
  "[": (text, i) => pastBracket(text, i),
  ".": (text, i, scan) => {
    const length = lengthAt(CLASS_NAME, text, i + 1);
    if (length > 0) {
      scan.tokens.push({ at: i, name: text.slice(i + 1, i + 1 + length) });
    }
    return past(i, length);
  },
  "#": (text, i) => past(i, lengthAt(ID_NAME, text, i + 1)),
  ":": (text, i) => past(i, lengthAt(PSEUDO_NAME, text, i + 1)),
  "(": (_text, i, scan) => {
    scan.depth += 1;
    return i + 1;
  },
  ")": (_text, i, scan) => {
    scan.depth -= 1;
    return scan.depth < 0 ? -1 : i + 1;
  },
};

/** Reads the selector part at `i`: the offset past it, or -1 where no selector goes on. */
function stepAt(text: string, i: number, scan: Scan): number {
  const c = text[i] as string;
  const part = PARTS[c];
  if (part) {
    return part(text, i, scan);
  }
  if (LETTER.test(c)) {
    const length = wordAt(text, i, scan.depth);
    return length > 0 ? i + length : -1;
  }
  return COMBINATOR.test(c) || (scan.depth > 0 && ARGUMENT.test(c))
    ? i + 1
    : -1;
}

// ---------------------------------------------------------------------------
// The dashboard's markup: every class occurrence, on which element.

interface Element {
  /** Attribute name → its static value, or null when it is an expression. */
  attrs: Map<string, string | null>;
  component: string | null;
  /** `class` and every other expression attribute, by name, as source text. */
  exprs: Map<string, string>;
  file: string;
  /** Where a new attribute goes: after the tag's name. */
  insertAt: number;
  line: number;
  /**
   * The parts of its class a name or a member yields only at run time
   * (`tone` in `class="state {tone}"`), as source text.
   */
  opaque: string[];
  /**
   * Fragments a template glues to an expression: a prefix (`tone-` in
   * `tone-{tone}`, with the expression it is glued to) or a suffix
   * (`-edge` in `{side}-edge`).
   */
  partials: { expr?: string; prefix: boolean; text: string }[];
  /** The props it spreads (`{...rest}`), as source text. */
  spreads: string[];
}

interface Occurrence {
  cls: string;
  element: Element;
  /** The condition the class hangs on, as source text; null when always present. */
  guard: string | null;
}

interface Found {
  cls: string;
  guard: string | null;
}

const and = (a: string | null, b: string): string =>
  a === null ? b : `(${a}) && (${b})`;
const not = (a: string): string => `!(${a})`;
const CLASS_HELPERS = new Set(["cn", "clsx", "cx", "twMerge", "twJoin"]);

const words = (text: string): string[] =>
  text.split(WHITESPACE).filter((w) => w.length > 0);

/**
 * The words of one piece of a class value that sits between expressions:
 * a word glued to an expression is a partial, the rest are classes.
 */
function readPiece(
  text: string,
  glued: { after: boolean; before: boolean; next?: string },
  guard: string | null,
  out: Found[],
  element: Element
): void {
  const parts = words(text);
  parts.forEach((w, j) => {
    const before = glued.before && j === 0 && !LEADING_SPACE.test(text);
    const after =
      glued.after && j === parts.length - 1 && !TRAILING_SPACE.test(text);
    if (after) {
      element.partials.push({ expr: glued.next, prefix: true, text: w });
    }
    if (before) {
      element.partials.push({ prefix: false, text: w });
    }
    if (!(before || after)) {
      out.push({ cls: w, guard });
    }
  });
}

interface Walk {
  element: Element;
  guard: string | null;
  out: Found[];
  source: string;
}

const textOf = (w: Walk, n: EsNode): string => w.source.slice(n.start, n.end);

const CLASS_VALUE: Record<string, (node: EsNode, w: Walk) => void> = {
  Literal: (node, w) => {
    if (typeof node.value === "string") {
      for (const word of words(node.value)) {
        w.out.push({ cls: word, guard: w.guard });
      }
    }
  },
  TemplateLiteral: (node, w) => {
    const quasis = node.quasis as (EsNode & { value: { cooked: string } })[];
    const expressions = node.expressions as EsNode[];
    quasis.forEach((quasi, i) => {
      const next = expressions[i];
      const glued = {
        after: next !== undefined,
        before: i > 0,
        next: next ? textOf(w, next) : undefined,
      };
      readPiece(quasi.value.cooked, glued, w.guard, w.out, w.element);
    });
    // An expression glued to a word (`grab-${handle}`) is part of that
    // word, not a class of its own: the prefix hook reads it.
    expressions.forEach((e, i) => {
      const before = quasis[i]?.value.cooked ?? "";
      const after = quasis[i + 1]?.value.cooked ?? "";
      const glued =
        (before !== "" && !TRAILING_SPACE.test(before)) ||
        (after !== "" && !LEADING_SPACE.test(after));
      if (!glued) {
        classesOf(e, w);
      }
    });
  },
  LogicalExpression: (node, w) => {
    const left = node.left as EsNode;
    const right = node.right as EsNode;
    const test = textOf(w, left);
    if (node.operator === "&&") {
      classesOf(right, { ...w, guard: and(w.guard, test) });
      return;
    }
    classesOf(left, w);
    const otherwise = node.operator === "||" ? not(test) : `${test} == null`;
    classesOf(right, { ...w, guard: and(w.guard, otherwise) });
  },
  ConditionalExpression: (node, w) => {
    const test = textOf(w, node.test as EsNode);
    classesOf(node.consequent as EsNode, { ...w, guard: and(w.guard, test) });
    classesOf(node.alternate as EsNode, {
      ...w,
      guard: and(w.guard, not(test)),
    });
  },
  CallExpression: (node, w) => {
    const callee = node.callee as EsNode;
    if (
      callee.type === "Identifier" &&
      CLASS_HELPERS.has(callee.name as string)
    ) {
      for (const arg of node.arguments as EsNode[]) {
        classesOf(arg, w);
      }
    }
  },
  ArrayExpression: (node, w) => {
    for (const item of node.elements as (EsNode | null)[]) {
      if (item) {
        classesOf(item, w);
      }
    }
  },
  ObjectExpression: (node, w) => {
    for (const prop of node.properties as EsNode[]) {
      const key = prop.key as EsNode | undefined;
      const name =
        prop.type === "Property" && !prop.computed && key ? keyName(key) : null;
      if (name === null) {
        continue;
      }
      for (const word of words(name)) {
        w.out.push({
          cls: word,
          guard: and(w.guard, textOf(w, prop.value as EsNode)),
        });
      }
    }
  },
};

function keyName(key: EsNode): string | null {
  if (key.type === "Identifier") {
    return key.name as string;
  }
  return typeof key.value === "string" ? key.value : null;
}

/** A name or a member (`tone`, `status.tone`, `row?.kind`, `TEXT[band]`): a value only the run knows. */
const OPAQUE_TYPES = new Set([
  "Identifier",
  "MemberExpression",
  "ChainExpression",
]);

/**
 * Adds the classes a `class={…}` expression yields, each with its
 * condition. A name or a member yields what only the run knows: it is
 * recorded as such, and a value hook beside it (`data-x={tone}`) is what
 * covers it. A call this sweep cannot read adds nothing.
 */
function classesOf(node: EsNode, w: Walk): void {
  if (OPAQUE_TYPES.has(node.type)) {
    w.element.opaque.push(textOf(w, node));
    return;
  }
  CLASS_VALUE[node.type]?.(node, w);
}

const ELEMENT_TYPES = new Set(["RegularElement", "SvelteElement", "Component"]);
const occurrences: Occurrence[] = [];
const elements: Element[] = [];
/** Every static `data-slot` value an element in the markup carries, and the elements. */
const markupSlots = new Map<string, Element[]>();
const parsed = new Map<string, { root: SvelteRoot; source: string }>();

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

/** Records one attribute's value on `element`, and the classes a `class` attribute yields. */
function readAttribute(
  attr: SvelteAttribute,
  element: Element,
  source: string,
  found: Found[]
): void {
  const { value } = attr;
  if (value === true) {
    element.attrs.set(attr.name, "");
    return;
  }
  if (value === undefined) {
    return;
  }
  const parts = Array.isArray(value) ? value : [value];
  const statik = parts.every((part) => part.type === "Text");
  element.attrs.set(
    attr.name,
    statik ? parts.map((part) => (part as TextPart).data).join("") : null
  );
  if (!statik) {
    const first = parts[0] as Pos;
    const last = parts.at(-1) as Pos;
    const span = Array.isArray(value)
      ? { end: last.end, start: first.start }
      : (value as ExpressionTag).expression;
    element.exprs.set(attr.name, source.slice(span.start, span.end));
  }
  if (attr.name !== "class") {
    return;
  }
  const walkState: Walk = { element, guard: null, out: found, source };
  parts.forEach((part, i) => {
    if (part.type === "Text") {
      const next = parts[i + 1] as ExpressionTag | undefined;
      const glued = {
        after: next !== undefined,
        before: i > 0,
        next: next
          ? source.slice(next.expression.start, next.expression.end)
          : undefined,
      };
      readPiece(part.data, glued, null, found, element);
    } else if (!gluedTag(parts, i)) {
      classesOf(part.expression, walkState);
    }
  });
}

/** Whether the expression at `i` is glued to the text beside it (`grab-{handle}`): part of a word, not a class of its own. */
function gluedTag(parts: (TextPart | ExpressionTag)[], i: number): boolean {
  const prev = parts[i - 1];
  const next = parts[i + 1];
  return (
    (prev?.type === "Text" &&
      prev.data !== "" &&
      !TRAILING_SPACE.test(prev.data)) ||
    (next?.type === "Text" &&
      next.data !== "" &&
      !LEADING_SPACE.test(next.data))
  );
}

function readElement(node: SvelteNode, file: string, source: string): void {
  const element: Element = {
    attrs: new Map(),
    component: node.type === "Component" ? (node.name as string) : null,
    exprs: new Map(),
    file,
    insertAt:
      node.name_loc?.end.character ?? node.start + 1 + (node.name?.length ?? 0),
    line: lineOf(source, node.start),
    opaque: [],
    partials: [],
    spreads: [],
  };
  const found: Found[] = [];
  for (const attr of node.attributes ?? []) {
    const expr = attr.expression;
    if (attr.type === "SpreadAttribute" && expr) {
      element.spreads.push(source.slice(expr.start, expr.end));
    } else if (attr.type === "ClassDirective" && expr) {
      const guard = source.slice(expr.start, expr.end);
      found.push({ cls: attr.name, guard });
      element.exprs.set(`class:${attr.name}`, guard);
    } else if (attr.type === "Attribute") {
      readAttribute(attr, element, source, found);
    }
  }
  const slot = element.attrs.get("data-slot");
  if (typeof slot === "string") {
    markupSlots.set(slot, [...(markupSlots.get(slot) ?? []), element]);
  }
  elements.push(element);
  for (const one of found) {
    occurrences.push({ ...one, element });
  }
}

function walkMarkup(node: unknown, file: string, source: string): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkMarkup(child, file, source);
    }
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as SvelteNode;
  if (ELEMENT_TYPES.has(n.type)) {
    readElement(n, file, source);
  }
  if (n.type === "RegularElement" && n.name?.includes("-")) {
    CUSTOM_TAGS.add(n.name);
  }
  for (const [key, value] of Object.entries(n)) {
    if (
      key !== "attributes" &&
      key !== "expression" &&
      key !== "metadata" &&
      value &&
      typeof value === "object"
    ) {
      walkMarkup(value, file, source);
    }
  }
}

for (const file of SVELTE_FILES) {
  const source = readFileSync(file, "utf8");
  const root = parse(source, { modern: true });
  parsed.set(file, { root, source });
  walkMarkup(root.fragment, file, source);
}

// ---------------------------------------------------------------------------
// Components: whether a `data-*` passed to one lands on the element its
// `class` prop does.

type Target = { file: string } | { pkg: string };
/** The package name a local component value stands under. */
const LOCAL_COMPONENT = "(local)";

/** A module specifier's file: a source path, or the package it names. */
function resolveSpecifier(spec: string, from: string): Target {
  if (spec.startsWith("#lib/") || spec.startsWith("$lib/")) {
    return { file: join(SRC, "lib", spec.slice(5)) };
  }
  if (spec.startsWith(".")) {
    return { file: resolve(dirname(from), spec) };
  }
  return { pkg: spec };
}

/** An export or import list's items: `[name, alias]`, type-only ones left out. */
const listItems = (list: string): [string, string][] =>
  list
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !TYPE_PREFIX.test(item))
    .map((item) => {
      const [name, alias] = item.split(AS) as [string, string | undefined];
      return [name, alias ?? name];
    });

/** A barrel's exports that are components: export name → its `.svelte` file, or the package it re-exports. */
function barrel(file: string): Map<string, Target> {
  const exports = new Map<string, Target>();
  const path = [
    file,
    file.replace(JS_EXT, ".ts"),
    join(file, "index.ts"),
    join(file, "index.js"),
  ].find(isFile);
  if (!path) {
    return exports;
  }
  const text = readFileSync(path, "utf8")
    .replace(BLOCK_COMMENT, "")
    .replace(LINE_COMMENT, "");
  const local = new Map<string, Target>();
  for (const [, name, spec] of text.matchAll(DEFAULT_IMPORT)) {
    const target = resolveSpecifier(spec as string, path);
    if ("pkg" in target || target.file.endsWith(".svelte")) {
      local.set(name as string, target);
    }
  }
  for (const [, list, from] of text.matchAll(EXPORT_LIST)) {
    const target = from ? resolveSpecifier(from, path) : null;
    for (const [name, exported] of listItems(list as string)) {
      const svelteDefault =
        target !== null &&
        "file" in target &&
        target.file.endsWith(".svelte") &&
        name === "default";
      if (target !== null && ("pkg" in target || svelteDefault)) {
        exports.set(exported, target);
      } else if (!from && local.has(name)) {
        exports.set(exported, local.get(name) as Target);
      }
    }
  }
  return exports;
}

const scriptOf = (file: string): string => {
  const { root, source } = parsed.get(file) as {
    root: SvelteRoot;
    source: string;
  };
  return root.instance
    ? source.slice(root.instance.content.start, root.instance.content.end)
    : "";
};

/** What `Name` (or `Name.Member`) means through one import: null when that import does not name it. */
function throughImport(
  match: RegExpMatchArray,
  head: string,
  member: string | undefined,
  file: string
): Target | null | undefined {
  const [, def, ns, named, spec] = match as unknown as [
    string,
    string | undefined,
    string | undefined,
    string | undefined,
    string,
  ];
  const target = resolveSpecifier(spec, file);
  if (def === head && !member) {
    return "pkg" in target || spec.endsWith(".svelte") ? target : null;
  }
  if (ns === head && member) {
    return "pkg" in target ? target : (barrel(target.file).get(member) ?? null);
  }
  const item = named
    ? listItems(named).find(([, alias]) => alias === head)
    : undefined;
  if (!item) {
    return undefined;
  }
  if ("pkg" in target) {
    return target;
  }
  // `Name.Member` from a named import is a namespace object a barrel
  // builds: not a file this sweep reads.
  return member ? null : (barrel(target.file).get(item[0]) ?? null);
}

/** What a component's name in `file` refers to: its `.svelte` file, or the package it comes from. */
function componentFile(component: string, file: string): Target | null {
  const [head, member] = component.split(".") as [string, string | undefined];
  // A component a prop names (`as: Content = PopoverContent`) is its default.
  const fallback = propsOf(file).defaults.get(head);
  for (const name of [head, ...(fallback && !member ? [fallback] : [])]) {
    for (const match of scriptOf(file).matchAll(ANY_IMPORT)) {
      const found = throughImport(match, name, member, file);
      if (found !== undefined) {
        return found;
      }
    }
  }
  // Not imported: a local value (`{@const Glyph = GLYPHS[…]}`, `known.icon`),
  // the icon a map holds. Icons spread their props on their `<svg>`; the
  // hook check against the running dashboard confirms each lands.
  return { pkg: LOCAL_COMPONENT };
}

/**
 * What a `data-*` attribute passed to `component` (used in `file`) reaches:
 * every element down the chain of components that hand their rest props on
 * beside their `class`, and why the chain cannot be followed to its end
 * (a library component, no rest props), if it cannot.
 */
interface Passed {
  /** Whether the chain ends in a library component that spreads them on (bits-ui, vaul-svelte, paneforge, an icon). */
  library: boolean;
  /**
   * Where the chain's last component this sweep reads puts its class prop:
   * the elements a value hook of that prop (`data-<component>-class`) goes
   * on when the rest props stop short of them.
   */
  receivers: Receivers | null;
  targets: Element[];
  why: string | null;
}

interface Receivers {
  classProp: string;
  elements: Element[];
  file: string;
}

const passedNone = (why: string): Passed => ({
  library: false,
  receivers: null,
  targets: [],
  why,
});

/**
 * Libraries whose components merge their rest props onto the element they
 * render (bits-ui's `mergeProps(restProps, …)` → `{...mergedProps}`, the
 * same in paneforge's Pane and vaul-svelte's Drawer content; an icon's
 * `<svg {...props}>`), and set no `data-slot` of their own.
 */
const SPREADING_LIBRARY =
  /^(bits-ui|vaul-svelte|paneforge|svelte-sonner|~icons\/|\(local\))/;

interface Props {
  classProp?: string;
  /** Props that default to a component (`as: Content = PopoverContent`): local name → the default's name. */
  defaults: Map<string, string>;
  /** Each prop's default, as source text, by its local name. */
  initializers: Map<string, string>;
  /** Every prop's local name. */
  names: Set<string>;
  rest?: string;
}
const propsCache = new Map<string, Props>();

/**
 * A component's props, from its `let { class: className, ...rest } =
 * $props()`: the class prop's local name, the rest props', and the props
 * that default to a component.
 */
function propsOf(file: string): Props {
  const cached = propsCache.get(file);
  if (cached) {
    return cached;
  }
  const found: Props = {
    defaults: new Map(),
    initializers: new Map(),
    names: new Set(),
  };
  const sf = ts.createSourceFile(
    file,
    parsed.has(file) ? scriptOf(file) : "",
    ts.ScriptTarget.Latest,
    true
  );
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText() === "$props"
    ) {
      for (const el of node.name.elements) {
        readBinding(el, found);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  propsCache.set(file, found);
  return found;
}

/** One prop of a `$props()` destructure, into `found`. */
function readBinding(el: ts.BindingElement, found: Props): void {
  const local = el.name.getText();
  found.names.add(local);
  if (el.initializer) {
    found.initializers.set(local, el.initializer.getText());
  }
  if (el.dotDotDotToken) {
    found.rest = local;
  } else if ((el.propertyName ?? el.name).getText() === "class") {
    found.classProp = local;
  } else if (el.initializer && ts.isIdentifier(el.initializer)) {
    found.defaults.set(local, el.initializer.text);
  }
}

function passThrough(component: string, file: string, depth = 0): Passed {
  const target = componentFile(component, file);
  if (target === null) {
    return passedNone(
      `<${component}>'s file is not one this sweep can resolve`
    );
  }
  if ("pkg" in target) {
    const library = SPREADING_LIBRARY.test(target.pkg);
    return {
      ...passedNone(`<${component}> is ${target.pkg}'s, a library component`),
      library,
      why: library
        ? null
        : `<${component}> is ${target.pkg}'s, a library component`,
    };
  }
  const path = target.file;
  const { classProp, rest } = propsOf(path);
  if (!(classProp || rest)) {
    return passedNone(`${rel(path)} takes neither a class prop nor rest props`);
  }
  // A class prop lands where its name is in a class; one left in the rest
  // props lands where they are spread.
  const reaches = new RegExp(`\\b${classProp}\\b`);
  const receiving = elements.filter(
    (el) =>
      el.file === path &&
      (classProp
        ? reaches.test(el.exprs.get("class") ?? "")
        : el.spreads.includes(rest as string))
  );
  const receivers =
    classProp && receiving.length > 0
      ? { classProp, elements: receiving, file: path }
      : null;
  if (!rest) {
    return {
      ...passedNone(`${rel(path)} takes no rest props beside its class`),
      receivers,
    };
  }
  const direct = receiving.filter((el) => el.spreads.includes(rest));
  const passed: Passed = {
    library: false,
    receivers,
    targets: [...direct],
    why:
      direct.length === 0
        ? `${rel(path)} spreads ${rest} on no element its class reaches`
        : null,
  };
  for (const element of direct.filter((el) => el.component)) {
    const deeper: Passed =
      depth > 3
        ? passedNone(`${rel(path)} forwards too deep`)
        : passThrough(element.component as string, path, depth + 1);
    passed.targets.push(...deeper.targets);
    passed.why ??= deeper.why;
    passed.library ||= deeper.library;
    passed.receivers = deeper.receivers ?? passed.receivers;
  }
  return passed;
}

// ---------------------------------------------------------------------------
// Names already taken.

/** The libraries whose DOM the dashboard renders: they set and read their own attributes. */
const LIBRARY_TEXT = [
  "bits-ui",
  "vaul-svelte",
  "svelte-sonner",
  "@xyflow",
  "@event-calendar",
  "@pierre",
  "photoswipe",
  "@milkdown",
  "streamdown",
  "svelte-streamdown",
  "paneforge",
]
  .map((pkg) => join(DASHBOARD, "node_modules", pkg))
  .filter(isDir)
  .flatMap((dir) => walk(dir, (f) => LIBRARY_FILE.test(f)))
  .map((file) => readFileSync(file, "utf8"));
/** The dashboard's own code and styles: where a selector or a Tailwind variant names an attribute. */
const OWN_TEXT = walk(SRC, (f) => OWN_FILE.test(f)).map((file) =>
  readFileSync(file, "utf8")
);
const SPEC_TEXT = SPEC_FILES.map((file) => readFileSync(file, "utf8"));

const collect = (into: Set<string>, texts: string[], pattern: RegExp): void => {
  for (const text of texts) {
    for (const m of text.matchAll(pattern)) {
      into.add(m[1] as string);
    }
  }
};

/**
 * Every `data-<name>` a selector, a Tailwind variant or an attribute read
 * names (`[data-x`, `data-x:`, `data-[x`, `getAttribute("data-x")`), or a
 * library names at all: a new attribute by that name would be matched.
 */
const takenAttrs = new Set<string>();
collect(takenAttrs, LIBRARY_TEXT, LIBRARY_ATTR);
/**
 * The specs' own `[data-x` selectors: taken unless the element that
 * carries it is this sweep's hook (a spec rewritten to read `[data-you]`).
 */
const specAttrs = new Set<string>();
collect(specAttrs, SPEC_TEXT, ATTR_SELECTOR);
collect(takenAttrs, [...OWN_TEXT, ...LIBRARY_TEXT], ATTR_SELECTOR);
for (const pattern of [ATTR_VARIANT, ATTR_ARBITRARY, ATTR_READ]) {
  collect(takenAttrs, [...OWN_TEXT, ...LIBRARY_TEXT], pattern);
}
/** Every `data-slot` value a selector names, or an element carries that is not this sweep's hook. */
const takenSlots = new Set<string>();
collect(takenSlots, [...OWN_TEXT, ...LIBRARY_TEXT], SLOT_SELECTOR);
// An element's own slot names it, unless it is this sweep's hook: the
// element carries the class of the same name, or its component-named one.
for (const [slot, carriers] of markupSlots) {
  const ours = carriers.every((el) =>
    occurrences.some(
      (o) =>
        o.element === el &&
        o.guard === null &&
        (o.cls === slot || `${componentName(el.file)}-${o.cls}` === slot)
    )
  );
  if (!ours) {
    takenSlots.add(slot);
  }
}
// A `data-<name>` an element already carries, or a script sets or reads
// (`dataset.x`), is matched by a `[data-<name>]` hook wherever it is, unless
// it is this sweep's own: the element carries the class of that name.
for (const text of OWN_TEXT) {
  for (const m of text.matchAll(DATASET)) {
    takenAttrs.add(kebab(m[1] as string));
  }
}
/** Every `data-<name>` an element carries as this sweep's hook. */
const oursAttrs = new Set<string>();
for (const el of elements) {
  for (const attr of el.attrs.keys()) {
    const name = attr.slice("data-".length);
    // A value hook (`data-x={tone}` beside `{tone}` in the class) is ours too.
    const value = (el.exprs.get(attr) ?? "").replace(SPACES_AND_PARENS, "");
    // Ours only in the shape this sweep writes: a flag (no value), or
    // `{cond || undefined}` beside `class:x={cond}`. Block.svelte's
    // `data-block={id}` beside its class `block` is its own.
    const shaped = (guard: string | null): boolean =>
      el.attrs.get(attr) === "" ||
      (guard !== null &&
        value === `${guard}||undefined`.replace(SPACES_AND_PARENS, ""));
    const ours =
      occurrences.some(
        (o) =>
          o.element === el &&
          (o.cls === name || `${componentName(el.file)}-${o.cls}` === name) &&
          shaped(o.guard)
      ) ||
      (value !== "" &&
        [...el.opaque, ...el.partials.flatMap((p) => p.expr ?? [])].some(
          (p) => p.replace(SPACES_AND_PARENS, "") === value
        ));
    if (attr.startsWith("data-") && attr !== "data-slot" && !ours) {
      takenAttrs.add(name);
    }
    if (ours) {
      oursAttrs.add(name);
    }
  }
}
for (const name of specAttrs) {
  if (!oursAttrs.has(name)) {
    takenAttrs.add(name);
  }
}

/** Classes another package renders (the canvas host, the preview overlay): not the dashboard's to hook. */
const AGENT_TEXT = walk(join(ROOT, "packages", "agent", "src"), (f) =>
  AGENT_FILE.test(f)
)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
// packages/agent's DOM (the canvas host, the preview overlay) is a spec's
// too: an attribute or a slot it names (`data-docked`, `data-pick`) is
// taken, so no dashboard hook reads the same.
collect(takenAttrs, [AGENT_TEXT], LIBRARY_ATTR);
collect(takenSlots, [AGENT_TEXT], SLOT_SELECTOR);
const mentions = (cls: string, text: string): boolean =>
  new RegExp(`(^|[^\\w-])${cls.replaceAll("-", "\\-")}([^\\w-]|$)`).test(text);
const agentRenders = (cls: string): boolean => mentions(cls, AGENT_TEXT);
/** The dashboard's source without its comments, where prose names words no element carries. */
const OWN_CODE = OWN_TEXT.join("\n")
  .replace(BLOCK_COMMENT, "")
  .replace(HTML_COMMENT, "")
  .replace(LINE_COMMENT, "");
/** Whether the dashboard's code names `cls` anywhere: none that does not can render it. */
const dashboardNames = (cls: string): boolean => mentions(cls, OWN_CODE);

// ---------------------------------------------------------------------------
// The specs: every class selector, where it is.

interface SpecUse {
  /**
   * Whether it reads DOM packages/agent renders (the preview overlay's
   * shadow root, the canvas host's frame), where a dashboard hook does not
   * reach: it is left as it is.
   */
  agent: boolean;
  /** Source offset of the `.` in the spec file. */
  at: number;
  /**
   * For `classList.contains("x")`: the span from `classList` to the call's
   * end, rewritten to `matches(…)` with the receiver left as it is.
   */
  call?: { end: number; start: number };
  cls: string;
  /** Whether another class or attribute sits in its compound (`.row.sel`). */
  compound: boolean;
  file: string;
  line: number;
  /** The quote of the string literal holding it; null in a template. */
  quote: string | null;
  /** The selector it sits in, as written (for the leftovers). */
  selector: string;
}

/** Calls whose arguments are prose or paths, never a selector. */
const NOT_SELECTORS = new Set([
  "check",
  "note",
  "log",
  "error",
  "warn",
  "Error",
  "until",
  "join",
  "resolve",
  "readFile",
  "readFileSync",
  "writeFile",
  "writeFileSync",
  "write",
  "spawn",
  "spawnSync",
  "includes",
  "startsWith",
  "endsWith",
  "split",
  "replace",
  "replaceAll",
  "stringify",
  "fetch",
  "send",
  "bash",
  "cwd",
  "push",
  "exists",
  "existsSync",
  "mkdir",
  "rm",
  "file",
  "Response",
  "getByText",
  "getByRole",
  "getByLabel",
  "fill",
  "type",
  "insertText",
  "press",
]);

const uses: SpecUse[] = [];
const COMPOSER_CONSTANT = { file: join(KIT, "kit.ts"), name: "COMPOSER" };
const kitLeftovers: {
  file: string;
  line: number;
  selector: string;
  why: string;
}[] = [];

function calleeName(call: ts.CallExpression | ts.NewExpression): string {
  const e = call.expression;
  if (ts.isPropertyAccessExpression(e)) {
    return e.name.text;
  }
  return ts.isIdentifier(e) ? e.text : "";
}

const PASS_THROUGH = (node: ts.Node): boolean =>
  ts.isTemplateSpan(node) ||
  ts.isTemplateExpression(node) ||
  ts.isParenthesizedExpression(node) ||
  ts.isBinaryExpression(node) ||
  ts.isConditionalExpression(node);

/** The call whose argument `node` is, if any. */
function enclosingCall(node: ts.Node): string | null {
  let at: ts.Node = node;
  while (at.parent && PASS_THROUGH(at.parent)) {
    at = at.parent;
  }
  const { parent } = at;
  if (
    parent &&
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    parent.arguments?.includes(at as ts.Expression)
  ) {
    return calleeName(parent);
  }
  return null;
}

/** `X.classList.contains("x")`: the class it reads, and the receiver. */
function containsCall(node: ts.Node): {
  arg: ts.StringLiteralLike;
  classList: ts.Identifier | ts.PrivateIdentifier;
  receiver: ts.Expression;
} | null {
  if (!(
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
  )) {
    return null;
  }
  const { expression } = node.expression;
  const [arg] = node.arguments;
  if (
    node.expression.name.text !== "contains" ||
    !ts.isPropertyAccessExpression(expression) ||
    expression.name.text !== "classList" ||
    node.arguments.length !== 1 ||
    !(arg && ts.isStringLiteralLike(arg))
  ) {
    return null;
  }
  return { arg, classList: expression.name, receiver: expression.expression };
}

/** DOM packages/agent renders: the preview overlay's shadow root, the canvas host's frame. */
const AGENT_DOM = /shadowRoot|contentFrame|frameLocator|\.frame\(|frames\(\)/;

/**
 * Whether a selector (or a `classList` receiver) reads DOM packages/agent
 * renders: the call chain it is passed to reaches through a shadow root or a
 * frame, or starts at a local declared from one
 * (`const layer = host.shadowRoot?.querySelector(".layer")`).
 */
function readsAgentDom(node: ts.Node, sf: ts.SourceFile): boolean {
  let at: ts.Node = node;
  while (at.parent && PASS_THROUGH(at.parent)) {
    at = at.parent;
  }
  const { parent } = at;
  const chain =
    parent &&
    ts.isCallExpression(parent) &&
    parent.arguments.includes(at as ts.Expression)
      ? parent.expression
      : node;
  const text = chain.getText();
  if (AGENT_DOM.test(text)) {
    return true;
  }
  const root = IDENT.exec(text)?.[0];
  return root
    ? declaredFrom(sf, root).some((init) => AGENT_DOM.test(init))
    : false;
}

/** The initializers of every variable named `name` in a file. */
function declaredFrom(sf: ts.SourceFile, name: string): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText() === name &&
      n.initializer
    ) {
      out.push(n.initializer.getText());
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

interface Piece {
  raw: string;
  start: number;
}

/** A string literal's or template's text pieces, each with its offset in the file. */
function piecesOf(node: ts.Node, text: string): Piece[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const start = node.getStart();
    return [
      { raw: text.slice(start + 1, node.getEnd() - 1), start: start + 1 },
    ];
  }
  if (!ts.isTemplateExpression(node)) {
    return [];
  }
  // head: `…${ ; middle: }…${ ; tail: }…`
  return [node.head, ...node.templateSpans.map((s) => s.literal)].map(
    (part) => {
      const s = part.getStart();
      const close = ts.isTemplateTail(part) ? 1 : 2;
      return { raw: text.slice(s + 1, part.getEnd() - close), start: s + 1 };
    }
  );
}

/** Each offset in the pieces joined by a placeholder, back in the file. */
const offsetsOf = (pieces: Piece[]): number[] =>
  pieces.flatMap((p, i) => [
    ...Array.from({ length: p.raw.length }, (_, k) => p.start + k),
    ...(i < pieces.length - 1 ? [-1] : []),
  ]);

function readSelector(
  node: ts.Node,
  file: string,
  text: string,
  lineAt: (pos: number) => number
): void {
  const pieces = piecesOf(node, text);
  if (pieces.length === 0 || containsCall(node.parent)) {
    return;
  }
  const call = enclosingCall(node);
  const joined = pieces.map((p) => p.raw).join("\uE000");
  const tokens =
    call && NOT_SELECTORS.has(call) ? null : selectorClasses(joined);
  if (!tokens || BACKSLASH.test(joined)) {
    return;
  }
  const offsets = offsetsOf(pieces);
  const inKitComposer =
    file === COMPOSER_CONSTANT.file &&
    ts.isVariableDeclaration(node.parent) &&
    node.parent.name.getText() === COMPOSER_CONSTANT.name;
  const selector = joined.replace(PLACEHOLDER, "{…}");
  for (const token of tokens) {
    const after = joined[token.at + 1 + token.name.length];
    const before = joined[token.at - 1];
    const at = offsets[token.at] as number;
    if (inKitComposer) {
      kitLeftovers.push({
        file,
        line: lineAt(at),
        selector,
        why: "kit.ts's COMPOSER constant: mapped by hand",
      });
      continue;
    }
    uses.push({
      agent: readsAgentDom(node, node.getSourceFile()),
      at,
      cls: token.name,
      compound:
        (after !== undefined && COMPOUND_AFTER.test(after)) ||
        (before !== undefined && COMPOUND_BEFORE.test(before)),
      file,
      line: lineAt(at),
      quote: ts.isTemplateExpression(node)
        ? null
        : (text[node.getStart()] ?? null),
      selector,
    });
  }
}

for (const file of SPEC_FILES) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lineAt = (pos: number): number =>
    sf.getLineAndCharacterOfPosition(pos).line + 1;
  const visit = (node: ts.Node): void => {
    const contains = containsCall(node);
    if (contains) {
      uses.push({
        agent: readsAgentDom(contains.receiver, sf),
        at: contains.arg.getStart() + 1,
        call: {
          end: node.getEnd(),
          start: contains.classList.getStart(),
        },
        cls: contains.arg.text,
        compound: false,
        file,
        line: lineAt(node.getStart()),
        quote: null,
        selector: `classList.contains("${contains.arg.text}")`,
      });
    }
    readSelector(node, file, text, lineAt);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ---------------------------------------------------------------------------
// Each class: kept, hooked, or left over.

/** Classes whose DOM a library renders, or the kit's own recipes: they stay. */
const KEPT =
  /^(kit-|cm-|ec-|pswp|svelte-flow|xyflow|react-flow|sonner|shiki|milkdown|ProseMirror|streamdown|vaul|bits-|diffs?-|katex|hljs|mermaid|excalidraw|tippy)/;
const KEPT_EXACT = new Set(["dark", "light", "sr-only", "line", "token"]);

/**
 * One element's hook for one class. A class always present on the element
 * is a `slot` (`data-slot="name"`); one present on a condition is a
 * `state` (`data-name={cond || undefined}`); a static class that lost the
 * element's `data-slot` to another class is a `flag` (`data-name`). The
 * name is the class's own, or `<component>-<class>` where that collides.
 */
interface Mark {
  element: Element;
  guards: (string | null)[];
  kind: "slot" | "state" | "flag";
  name: string;
}
/**
 * A class's plan: kept as it is, left over whole, or hooked by `marks`.
 * `blocked` names the occurrences no hook can reach (a part that sets its
 * own data-slot, a library component, a run-time template): the specs that
 * read the class are left over until those are mapped by hand. `aria` is
 * the ARIA state every one of its conditions already carries, if one does.
 */
type Plan =
  | {
      aria: { attr: string; value: string } | null;
      blocked: string[];
      marks: Mark[];
      /** Value hooks that may carry it: `[data-x~="<class>"]`. */
      values: string[];
    }
  | { kept: string }
  | { why: string };
type Hooked = Extract<Plan, { marks: Mark[] }>;

const byClass = new Map<string, Occurrence[]>();
for (const occ of occurrences) {
  byClass.set(occ.cls, [...(byClass.get(occ.cls) ?? []), occ]);
}

const specClasses = [
  ...new Set(uses.filter((u) => !u.agent).map((u) => u.cls)),
].sort();
const plans = new Map<string, Plan>();
/** The elements each component's use hands its rest props to. */
const passedTo = new Map<Element, Passed>();
/** The class whose `data-slot` each element takes. */
const slotClaims = new Map<Element, string>();

const ARIA_STATES = [
  "aria-selected",
  "aria-expanded",
  "aria-current",
  "aria-busy",
  "aria-disabled",
  "aria-pressed",
  "aria-checked",
];
const norm = (s: string): string =>
  s.replace(SPACES, "").replace(OUTER_PARENS, "$1");
const loose = (s: string): string => s.replace(SPACES_AND_PARENS, "");

/** The ARIA attribute that carries `guard` on `element`, and the value it reads then. */
function ariaFor(
  element: Element,
  guard: string | null
): { attr: string; value: string } | null {
  if (guard === null) {
    return null;
  }
  for (const attr of ARIA_STATES) {
    const expr = element.exprs.get(attr);
    if (expr !== undefined && norm(expr) === norm(guard)) {
      return { attr, value: "true" };
    }
    const ternary = expr === undefined ? null : ARIA_TERNARY.exec(expr.trim());
    if (ternary && norm(ternary[1] as string) === norm(guard)) {
      return { attr, value: ternary[2] as string };
    }
  }
  return null;
}

/** The attribute text a mark adds to its element. */
function markText(mark: Mark): string {
  if (mark.kind === "slot") {
    return ` data-slot="${mark.name}"`;
  }
  if (mark.kind === "flag" || mark.guards.includes(null)) {
    return ` data-${mark.name}`;
  }
  const cond =
    mark.guards.length === 1
      ? (mark.guards[0] as string)
      : mark.guards.map((g) => `(${g})`).join(" || ");
  return ` data-${mark.name}={${SIMPLE.test(cond) ? cond : `(${cond})`} || undefined}`;
}

/** Whether `element` already carries the mark as this sweep writes it (an earlier run's). */
function carries(element: Element, mark: Mark): boolean {
  const attr = mark.kind === "slot" ? "data-slot" : `data-${mark.name}`;
  if (!element.attrs.has(attr)) {
    return false;
  }
  const value = element.attrs.get(attr);
  if (mark.kind === "slot") {
    return value === mark.name;
  }
  const text = markText(mark).trim();
  if (!text.includes("={")) {
    return value === "";
  }
  // `bun fmt` drops the parentheses this sweep writes (`(!(a))` is `!a`).
  return (
    loose(`{${element.exprs.get(attr) ?? ""}}`) ===
    loose(text.slice(text.indexOf("=") + 1))
  );
}

/**
 * The name a mark of `kind` for `cls` takes on `element`: the class's own,
 * or `<component>-<class>` where that is taken or the element already
 * carries an attribute by that name of its own; null when both are.
 */
function nameFor(
  cls: string,
  element: Element,
  kind: Mark["kind"],
  guards: (string | null)[]
): string | null {
  const taken = kind === "slot" ? takenSlots : takenAttrs;
  const free = (name: string): boolean => {
    const attr = kind === "slot" ? "data-slot" : `data-${name}`;
    return (
      !taken.has(name) &&
      (!element.attrs.has(attr) ||
        carries(element, { element, guards, kind, name }))
    );
  };
  if (free(cls)) {
    return cls;
  }
  const named = `${componentName(element.file)}-${cls}`;
  return free(named) ? named : null;
}

/** Whether a template's glued fragment could make `cls` at run time. */
function gluedInto(cls: string, p: { prefix: boolean; text: string }): boolean {
  if (p.text === cls || p.text === "") {
    return false;
  }
  if (p.prefix) {
    return (
      cls.startsWith(p.text) &&
      (GLUE_END.test(p.text) || DIGITS.test(cls.slice(p.text.length)))
    );
  }
  return cls.endsWith(p.text) && GLUE_START.test(p.text);
}

const at = (el: Element): string => `${rel(el.file)}:${el.line}`;

/** The rest props a component's file takes (`...restProps`), if any. */
const restOf = (file: string): string | undefined => propsOf(file).rest;

/** Whether `element` spreads props other than its own component's rest props. */
const spreadsForeign = (element: Element): boolean =>
  element.spreads.some((s) => s !== restOf(element.file));

/**
 * The kind of mark `cls` takes on `element`. An element with a data-slot of
 * its own (a shadcn part's, another class's) keeps it, and props spread
 * after the tag's name (a trigger's `{...props}`) may carry one that would
 * overwrite the hook: a static class there is a flag.
 */
function markKind(
  cls: string,
  element: Element,
  guards: (string | null)[]
): Mark["kind"] {
  if (!guards.includes(null)) {
    return "state";
  }
  const own = element.attrs.get("data-slot");
  const mine = own === cls || own === `${componentName(element.file)}-${cls}`;
  if ((element.attrs.has("data-slot") && !mine) || spreadsForeign(element)) {
    return "flag";
  }
  return "slot";
}

/** The marks `cls` takes on the elements it reaches; what it cannot reach goes to `blocked`. */
function marksFor(
  cls: string,
  reachable: Occurrence[],
  blocked: string[]
): Mark[] {
  const marks: Mark[] = [];
  for (const element of new Set(reachable.map((o) => o.element))) {
    const guards = reachable
      .filter((o) => o.element === element)
      .map((o) => o.guard);
    const kind = markKind(cls, element, guards);
    // Both slot names taken (shadcn's `label` and `field-label`): a flag.
    const named = nameFor(cls, element, kind, guards);
    const flagged =
      named === null && kind === "slot"
        ? nameFor(cls, element, "flag", guards)
        : null;
    const name = named ?? flagged;
    if (name === null) {
      blocked.push(
        `${at(element)}: ${kind === "slot" ? `data-slot="${cls}"` : `data-${cls}`} and its component-named one are both taken`
      );
      continue;
    }
    marks.push({ element, guards, kind: named ? kind : "flag", name });
  }
  return marks;
}

/** The ARIA state every mark's one condition already carries, if one does. */
function sharedAria(marks: Mark[]): { attr: string; value: string } | null {
  const arias = marks.map((m) =>
    m.kind === "state" && m.guards.length === 1
      ? ariaFor(m.element, m.guards[0] ?? null)
      : null
  );
  const [first] = arias;
  return first &&
    arias.every((a) => a?.attr === first.attr && a.value === first.value)
    ? first
    : null;
}

/**
 * Class-prop hooks: where a component's rest props stop short of the
 * element its class prop lands on (it takes none; it hands them to a
 * component this sweep cannot read), that element carries the prop's
 * value itself, `data-<component>-class={className}`: file → its receivers.
 */
const classHooks = new Map<string, Receivers & { attr: string }>();

function classHookFor(r: Receivers): string | null {
  const known = classHooks.get(r.file);
  if (known) {
    return known.attr;
  }
  const name = `${componentName(r.file)}-class`;
  if (takenAttrs.has(name)) {
    return null;
  }
  classHooks.set(r.file, { ...r, attr: `data-${name}` });
  return `data-${name}`;
}

/**
 * How a class passed to a component reaches an element: through its rest
 * props (null), through a class-prop hook where they stop short
 * (`{ attr }`), or not at all (`{ why }`).
 */
function unreachable(o: Occurrence): { attr: string } | { why: string } | null {
  const through = passThrough(o.element.component as string, o.element.file);
  if (!through.why) {
    passedTo.set(o.element, through);
    return null;
  }
  const attr = through.receivers ? classHookFor(through.receivers) : null;
  return attr ? { attr } : { why: through.why };
}

/**
 * Value hooks: an element's `data-x={P}` beside a class part `P` only the
 * run knows (`data-home-variant={variant}` for `class="home {variant}"`).
 * The attribute carries the part's words as the class does, so a class
 * the part yields reads as `[data-x~="<class>"]`.
 */
const valueHooks = elements.flatMap((el) =>
  [...el.exprs]
    .filter(
      ([attr, expr]) =>
        attr.startsWith("data-") &&
        el.opaque.some((part) => loose(part) === loose(expr))
    )
    .map(([attr]) => ({ attr, element: el }))
);

/**
 * Script hooks: a class a script adds with `classList` and the attribute it
 * sets beside it, `data-<component>-<class>` or `data-<class>`
 * (`toggleAttribute`, `setAttribute`): cls → its selectors.
 */
const scriptHooks = new Map<string, string[]>();
const addScriptHook = (cls: string, hook: string): void => {
  scriptHooks.set(cls, [...new Set([...(scriptHooks.get(cls) ?? []), hook])]);
};
for (const file of walk(SRC, (f) => OWN_FILE.test(f))) {
  const text = readFileSync(file, "utf8");
  const set = new Set([...text.matchAll(ATTR_SET)].map((m) => m[1] as string));
  const slots = new Set(
    [...text.matchAll(SLOT_SET)].map((m) => m[1] as string)
  );
  // A class a script toggles (`classList.add("away")`) with its attribute
  // beside it; one it sets whole (`el.className = "grown-halo"`) with the
  // element's `data-slot` set to it.
  for (const m of text.matchAll(CLASS_LIST)) {
    for (const [, cls] of (m[1] as string).matchAll(QUOTED_WORD)) {
      const attr = [`${componentName(file)}-${cls}`, cls].find((a) =>
        set.has(a)
      );
      if (cls && attr) {
        addScriptHook(cls, `[data-${attr}]`);
      }
    }
  }
  for (const m of text.matchAll(CLASS_SET)) {
    for (const cls of words(m[1] as string).filter((w) => slots.has(w))) {
      addScriptHook(cls, `[data-slot="${cls}"]`);
    }
  }
}

/**
 * A component's source and its users': where the words a value hook may
 * carry are written (a prop such as `mainClass="transcript-pane"`).
 */
function sourcesOf(file: string): string[] {
  const name = `/${basename(file)}"`;
  return [...parsed.values()]
    .map((p) => p.source)
    .filter(
      (s) =>
        s === (parsed.get(file) as { source: string }).source ||
        s.includes(name)
    );
}

/** The value and script hooks that may carry `cls`: value hooks in a component whose source, or a user's, names it as a string. */
function valuesFor(cls: string): string[] {
  // A word of a string literal: `"caw-pop gap-0"`, `` `${peer} approve` ``.
  const quoted = new RegExp(
    `["'\`]([^"'\`\\n]*\\s)?${cls.replaceAll("-", "\\-")}(\\s[^"'\`\\n]*)?["'\`]`
  );
  const values = valueHooks
    .filter((v) => {
      const held = valueWords(v);
      return held
        ? held.has(cls)
        : sourcesOf(v.element.file).some((s) => quoted.test(s));
    })
    .map((v) => `[${v.attr}~="${cls}"]`);
  return [...new Set([...values, ...(scriptHooks.get(cls) ?? [])])];
}

/** Every word of every string literal in `code`. */
const literalWords = (code: string): string[] =>
  [...code.matchAll(STRING_LITERAL)].flatMap((m) => words(m[1] as string));

const valueWordsCache = new Map<string, Set<string> | null>();

/**
 * The words a value hook's value can hold, from where the value comes:
 * a prop's users (`mainClass="transcript-pane"`) and its default; a
 * local's initializer and assignments (`const FRAME = { caw: "caw-pop gap-0" }`,
 * `tone = "failed"`), following a call into a function the file declares
 * (`toneOf(id)`). Null when that cannot be traced: every word the
 * component's source and its users' name then counts.
 */
function valueWords(v: { attr: string; element: Element }): Set<string> | null {
  const key = `${v.element.file}|${v.attr}`;
  if (valueWordsCache.has(key)) {
    return valueWordsCache.get(key) ?? null;
  }
  const expr = v.element.exprs.get(v.attr) ?? "";
  const root = IDENT.exec(expr)?.[0];
  // `status.tone`, `row?.kind`: only what is given to that member counts.
  const member = MEMBER.exec(expr)?.[1];
  const { file } = v.element;
  const ofProp = Boolean(member && root && propsOf(file).names.has(root));
  const traced =
    root && !ofProp
      ? (propWords(file, root) ?? localWords(file, root, member))
      : null;
  // A member nothing here gives a value to (a prop's `status.tone`): every
  // value the dashboard's code gives that member anywhere.
  const found = traced ?? (member ? memberWords(member) : null);
  valueWordsCache.set(key, found);
  return found;
}

/** What a component's users pass for prop `name` (its class, for the class prop), and its default; null when it is no prop. */
function propWords(file: string, name: string): Set<string> | null {
  const props = propsOf(file);
  if (!props.names.has(name)) {
    return null;
  }
  const out = new Set<string>(literalWords(props.initializers.get(name) ?? ""));
  const prop = name === props.classProp ? "class" : name;
  for (const el of elements) {
    if (!el.component) {
      continue;
    }
    const target = componentFile(el.component, el.file);
    if (!(target && "file" in target && target.file === file)) {
      continue;
    }
    const given = el.attrs.get(prop);
    for (const w of [
      ...(typeof given === "string" ? words(given) : []),
      ...literalWords(el.exprs.get(prop) ?? ""),
    ]) {
      out.add(w);
    }
  }
  return out;
}

/** The words of a local's initializers and assignments, following calls into the file's own functions; null when it has none. */
function localWords(
  file: string,
  name: string,
  member?: string
): Set<string> | null {
  const { source } = parsed.get(file) as { source: string };
  const script = scriptOf(file);
  const defs = [
    ...[...source.matchAll(constTag(name))].map((m) => m[1] as string),
    ...definitionsOf(script, name),
  ];
  if (defs.length === 0) {
    return null;
  }
  const bodies = defs.flatMap((def) => [
    def,
    ...[...def.matchAll(CALLEE)].flatMap(([, fn]) =>
      definitionsOf(script, fn as string)
    ),
  ]);
  // A member's value: only the literals given to it (`tone: "failed"`).
  const given = member
    ? new RegExp(`\\b${member}\\s*:\\s*["'\`]([^"'\`\\n]*)["'\`]`, "g")
    : null;
  const out = new Set(
    bodies.flatMap((body) =>
      given
        ? [...body.matchAll(given)].flatMap((m) => words(m[1] as string))
        : literalWords(body)
    )
  );
  return given && out.size === 0 ? null : out;
}

/** Every value the dashboard's code gives a member (`tone: "failed"`), as words; null when it gives none. */
function memberWords(member: string): Set<string> | null {
  const given = new RegExp(
    `\\b${member}\\s*:\\s*["'\`]([^"'\`\\n]*)["'\`]`,
    "g"
  );
  const out = new Set(
    [...OWN_CODE.matchAll(given)].flatMap((m) => words(m[1] as string))
  );
  return out.size > 0 ? out : null;
}

const constTag = (name: string): RegExp =>
  new RegExp(`\\{@const\\s+${name}\\s*=\\s*([^\\n]*)\\}`, "g");

/** The source of `name`'s declarations (its initializer, a function's body) and of every assignment to it, in a script. */
function definitionsOf(script: string, name: string): string[] {
  const sf = ts.createSourceFile("s.ts", script, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === name &&
      node.initializer
    ) {
      out.push(node.initializer.getText());
    } else if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      out.push(node.getText());
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText() === name
    ) {
      out.push(node.right.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The attribute on `el` that carries the value a glued prefix `p` is joined to, if one does. */
function prefixHook(
  el: Element,
  p: { expr?: string; prefix: boolean; text: string }
): string | undefined {
  if (!(p.prefix && p.expr)) {
    return undefined;
  }
  const want = loose(p.expr);
  return [...el.exprs].find(
    ([attr, expr]) => attr.startsWith("data-") && loose(expr) === want
  )?.[0];
}

function planFor(cls: string): Plan {
  if (KEPT.test(cls) || KEPT_EXACT.has(cls)) {
    return { kept: "kit recipe or library DOM" };
  }
  const occ = byClass.get(cls) ?? [];
  const values = valuesFor(cls);
  // A class a template glues from a prefix and a value (`col-{column.id}`)
  // is covered where the value has a value hook beside it
  // (`data-task-table-col={column.id}`: `[data-task-table-col="last"]`).
  const gluedSites = elements.flatMap((el) =>
    el.partials
      .filter((p) => gluedInto(cls, p))
      .map((p) => ({ el, hook: prefixHook(el, p), p }))
  );
  for (const { hook, p } of gluedSites) {
    if (hook) {
      values.push(`[${hook}="${cls.slice(p.text.length)}"]`);
    }
  }
  const glued = gluedSites.find((site) => !site.hook)?.el;
  if (occ.length === 0 && !glued && agentRenders(cls)) {
    return { kept: "packages/agent renders it (canvas host, preview overlay)" };
  }
  if (occ.length === 0 && values.length > 0 && !glued) {
    return { aria: null, blocked: [], marks: [], values };
  }
  if (occ.length === 0 && !glued && !dashboardNames(cls)) {
    return {
      kept: "the dashboard never names it (a spec's own DOM, a library's, or a class no longer rendered)",
    };
  }
  if (occ.length === 0) {
    return {
      why: glued
        ? `built at run time from a template (${at(glued)})`
        : "no .svelte markup carries it (library DOM or a run-time string)",
    };
  }
  const blocked: string[] = glued
    ? [`also built at run time from a template (${at(glued)})`]
    : [];
  const reachable = occ.filter((o) => {
    if (!o.element.component) {
      return true;
    }
    const way = unreachable(o);
    if (way && "attr" in way) {
      values.push(`[${way.attr}~="${cls}"]`);
    } else if (way) {
      blocked.push(`${at(o.element)} <${o.element.component}>: ${way.why}`);
    }
    return way === null;
  });
  const marks = marksFor(cls, reachable, blocked);
  if (marks.length === 0 && values.length === 0) {
    return { why: blocked[0] as string };
  }
  return {
    aria: sharedAria(marks),
    blocked,
    marks,
    values: [...new Set(values)],
  };
}

for (const cls of specClasses) {
  plans.set(cls, planFor(cls));
}

// Two slots on one element: the class more specs read keeps the
// `data-slot`; the other's mark there becomes a flag, `data-<class>`. A
// component's element comes after every plain one: a slot passed to a
// component whose element has a slot of its own (its own, or one this
// sweep gives it) would overwrite that slot, so it is a flag too.
const usesOf = (cls: string): number =>
  uses.filter((u) => u.cls === cls).length;
const byUse = [...plans.keys()].sort(
  (a, b) => usesOf(b) - usesOf(a) || a.localeCompare(b)
);

function claim(cls: string, plan: Hooked, mark: Mark): Mark[] {
  const held = slotClaims.get(mark.element);
  // A component that hands its rest props to an element with a data-slot
  // (its own, or one this sweep gives it), or into a library's element
  // whose own this sweep cannot see, takes a flag: a slot would overwrite.
  const passed = passedTo.get(mark.element);
  const slotted =
    passed !== undefined &&
    (passed.library ||
      passed.targets.some(
        (el) => el.attrs.has("data-slot") || slotClaims.has(el)
      ));
  if ((held === undefined || held === cls) && !slotted) {
    slotClaims.set(mark.element, cls);
    return [mark];
  }
  const name = nameFor(cls, mark.element, "flag", mark.guards);
  if (name === null) {
    const why = held
      ? `also carries .${held}, which takes its data-slot`
      : "hands its rest props to an element with a data-slot of its own";
    plan.blocked.push(`${at(mark.element)} ${why}, and data-${cls} is taken`);
    return [];
  }
  return [{ ...mark, kind: "flag" as const, name }];
}

for (const components of [false, true]) {
  for (const cls of byUse) {
    const plan = plans.get(cls) as Plan;
    if (!("marks" in plan)) {
      continue;
    }
    plan.marks = plan.marks.flatMap((mark) =>
      mark.kind === "slot" && Boolean(mark.element.component) === components
        ? claim(cls, plan, mark)
        : [mark]
    );
  }
}

// ---------------------------------------------------------------------------
// The markup's edits.

const edits = new Map<string, { start: number; text: string }[]>();
/** Elements hooked, by kind: this run's edits and an earlier run's. */
const hooked = { slot: 0, state: 0, flag: 0, aria: 0 };
const hookedClasses = { slot: 0, state: 0, flag: 0, aria: 0 };
let added = 0;
const renamed = new Set<string>();

for (const [cls, plan] of plans) {
  if (!("marks" in plan)) {
    continue;
  }
  for (const kind of new Set(plan.marks.map((m) => m.kind))) {
    hookedClasses[kind] += 1;
  }
  // An ARIA state needs no new attribute where every spec reads it in a
  // compound (`.tab.sel` → `[data-slot="tab"][aria-selected="true"]`).
  if (plan.aria && uses.every((u) => u.cls !== cls || u.compound)) {
    hooked.aria += plan.marks.length;
    hookedClasses.aria += 1;
    continue;
  }
  for (const mark of plan.marks) {
    if (mark.name !== cls) {
      renamed.add(
        `.${cls} in ${rel(mark.element.file)} → ${mark.kind === "slot" ? `data-slot="${mark.name}"` : `data-${mark.name}`}`
      );
    }
    hooked[mark.kind] += 1;
    if (!carries(mark.element, mark)) {
      const list = edits.get(mark.element.file) ?? [];
      list.push({ start: mark.element.insertAt, text: markText(mark) });
      edits.set(mark.element.file, list);
      added += 1;
    }
  }
}

let classHooked = 0;
for (const hook of classHooks.values()) {
  for (const element of hook.elements) {
    classHooked += 1;
    if (!element.attrs.has(hook.attr)) {
      const list = edits.get(element.file) ?? [];
      list.push({
        start: element.insertAt,
        text: ` ${hook.attr}={${hook.classProp}}`,
      });
      edits.set(element.file, list);
      added += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// The leftovers, and the specs' rewrite.

/** The selector `.cls` becomes in `use`, or null when the hooks do not cover every element it reads. */
function hookText(cls: string, use: SpecUse): string | null {
  const plan = plans.get(cls);
  if (!(plan && "marks" in plan) || plan.blocked.length > 0) {
    return null;
  }
  if (plan.aria && use.compound) {
    return `[${plan.aria.attr}="${plan.aria.value}"]`;
  }
  const each = hookSelectors(plan);
  return each.length === 1 ? (each[0] as string) : `:is(${each.join(", ")})`;
}

/** Every selector part a class's hooks answer to: its marks', then its value hooks'. */
function hookSelectors(plan: Hooked): string[] {
  return [
    ...new Set([
      ...plan.marks.map((m) =>
        m.kind === "slot" ? `[data-slot="${m.name}"]` : `[data-${m.name}]`
      ),
      ...plan.values,
    ]),
  ];
}

function leftoverWhy(plan: Plan): string | null {
  if ("why" in plan) {
    return plan.why;
  }
  if (!("marks" in plan) || plan.blocked.length === 0) {
    return null;
  }
  const more =
    plan.blocked.length > 1 ? ` (+${plan.blocked.length - 1} more)` : "";
  return `hooked on ${plan.marks.length} element(s), not on ${plan.blocked[0]}${more}`;
}

const leftovers: string[] = [];
for (const use of uses.filter((u) => !u.agent)) {
  const why = leftoverWhy(plans.get(use.cls) as Plan);
  if (why !== null) {
    leftovers.push(
      `${relative(KIT, use.file)}:${use.line}  ${use.selector}  .${use.cls}: ${why}`
    );
  }
}
for (const left of kitLeftovers) {
  leftovers.push(
    `${relative(KIT, left.file)}:${left.line}  ${left.selector}  ${left.why}`
  );
}
leftovers.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

const specEdits = new Map<
  string,
  { end: number; start: number; text: string }[]
>();
const rewritten = { slot: 0, attribute: 0, several: 0, aria: 0 };

function rewriteKind(hook: string): keyof typeof rewritten {
  if (hook.startsWith(":is(")) {
    return "several";
  }
  if (hook.startsWith("[aria-")) {
    return "aria";
  }
  return hook.startsWith('[data-slot="') ? "slot" : "attribute";
}

if (REWRITE_SPECS) {
  for (const use of uses) {
    const hook = hookText(use.cls, use);
    if (
      hook === null ||
      use.agent ||
      !(ONLY?.has(basename(use.file, ".ts")) ?? true)
    ) {
      continue;
    }
    rewritten[rewriteKind(hook)] += 1;
    const list = specEdits.get(use.file) ?? [];
    if (use.call) {
      list.push({
        end: use.call.end,
        start: use.call.start,
        text: `matches('${hook}')`,
      });
    } else {
      // A double-quoted literal escapes the hook's quotes; `bun fmt` then
      // requotes it in single quotes.
      list.push({
        end: use.at + 1 + use.cls.length,
        start: use.at,
        text: use.quote === '"' ? hook.replace(QUOTE, '\\"') : hook,
      });
    }
    specEdits.set(use.file, list);
  }
}

const apply = (
  source: string,
  list: { end: number; start: number; text: string }[]
): string => {
  let out = source;
  for (const e of [...list].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
};

if (!DRY) {
  for (const [file, list] of edits) {
    writeFileSync(
      file,
      apply(
        readFileSync(file, "utf8"),
        list.map((e) => ({ ...e, end: e.start }))
      )
    );
  }
  for (const [file, list] of specEdits) {
    writeFileSync(file, apply(readFileSync(file, "utf8"), list));
  }
  writeFileSync(
    LEFTOVERS,
    `# Spec selectors the hooks do not cover (hooks-sweep.ts): spec:line  selector  why\n${leftovers.join("\n")}\n`
  );
}

function describe(cls: string, plan: Plan): string {
  const n = usesOf(cls);
  if ("why" in plan) {
    return `LEFT .${cls} (${n}) ${plan.why}`;
  }
  if ("kept" in plan) {
    return `KEPT .${cls} (${n}) ${plan.kept}`;
  }
  const kinds = [...new Set(plan.marks.map((m) => `${m.kind}:${m.name}`))];
  const where = plan.marks.map(
    (m) => `${relative(SRC, m.element.file)}:${m.element.line}`
  );
  const aria = plan.aria ? ` ${plan.aria.attr}=${plan.aria.value}` : "";
  const blocked = plan.blocked.length ? ` BLOCKED ${plan.blocked.length}` : "";
  const more = kinds.length > 5 ? ",…" : "";
  return `HOOK .${cls} (${n}) ${kinds.slice(0, 5).join(",")}${more}${aria}${blocked} on ${where.length}: ${where.slice(0, 3).join(" ")}`;
}

if (VERBOSE) {
  for (const [cls, plan] of plans) {
    console.log(describe(cls, plan));
  }
}

// `--map <file>`: each hooked class's hook selector, and whether the hooks
// cover every element that carries it, as JSON (what a check of the hooks
// against the running dashboard reads).
const mapAt = argv.indexOf("--map");
const mapFile = mapAt === -1 ? undefined : argv[mapAt + 1];
if (mapFile) {
  const map = [...plans].flatMap(([cls, plan]) => {
    if (!("marks" in plan)) {
      return [];
    }
    return [
      {
        cls,
        complete: plan.blocked.length === 0,
        hook: hookSelectors(plan).join(", "),
      },
    ];
  });
  writeFileSync(mapFile, `${JSON.stringify(map, null, 2)}\n`);
}

const kept = [...plans.values()].filter((p) => "kept" in p).length;
const left = [...plans.values()].filter((p) => "why" in p).length;
console.log(
  [
    `spec class uses: ${uses.length} (${specClasses.length} classes)`,
    `classes hooked (by the kinds of hook they take): slot ${hookedClasses.slot}, state ${hookedClasses.state}, flag ${hookedClasses.flag}, aria ${hookedClasses.aria}; kept ${kept}; left over whole ${left}`,
    `elements hooked: slot ${hooked.slot}, state ${hooked.state}, flag ${hooked.flag}, aria ${hooked.aria}, class-prop value hooks ${classHooked} (${classHooks.size} components); ${added} attribute(s) added this run in ${edits.size} files`,
    `renamed for a collision: ${renamed.size}${renamed.size ? `\n  ${[...renamed].join("\n  ")}` : ""}`,
    `leftover selector uses: ${leftovers.length} (${rel(LEFTOVERS)})`,
    REWRITE_SPECS
      ? `spec selectors rewritten: [data-slot] ${rewritten.slot}, [data-<name>] ${rewritten.attribute}, :is(several) ${rewritten.several}, aria ${rewritten.aria} in ${specEdits.size} files${[
          ...specEdits,
        ]
          .map(([file, list]) => `\n  ${relative(KIT, file)}: ${list.length}`)
          .join("")}`
      : "specs left as they are (--specs rewrites them)",
    DRY ? "dry run: nothing written" : "",
  ]
    .filter(Boolean)
    .join("\n")
);
