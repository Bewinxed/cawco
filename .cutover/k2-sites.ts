/**
 * `bun .cutover/k2-sites.ts`: every K2 site in clearance.md's appendix, read
 * from the consumer's own markup.
 *
 * The appendix lists each kit part's no-restyle hits by the line ESLint
 * reported: the line of the class string, which may be a constant several
 * elements share (`const CHIP = "…"`). This finds every element of that
 * part whose `class` reads a string on that line, and evaluates the class
 * to each string it can be: constants followed, each branch of a ternary,
 * `&&` with and without its right side, `cn()`/`clsx()` arguments joined.
 * Beside it, the element's other attributes as written (`variant`, `size`…).
 *
 * Writes `.cutover/clearance/K2-sites.json`, which k2-exact.ts reads.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DASH = join(ROOT, "apps", "dashboard");
const { parse } = (await import(Bun.resolveSync("svelte/compiler", DASH))) as {
  parse: (source: string, options: { modern: true }) => Ast;
};

// biome-ignore lint/suspicious/noExplicitAny: Svelte's and ESTree's nodes, read structurally
type Node = any;
interface Ast {
  fragment: Node;
  instance: Node | null;
  module: Node | null;
}

/** A class value's possible strings, and the lines of the literals they came from. */
interface Value {
  alts: string[];
  lines: Set<number>;
  unresolved: string[];
}

export interface Instance {
  /** Each string the class can be. */
  alts: string[];
  /** The attribute the classes are passed in (`class`, or a part's `bodyClass`). */
  attr: string;
  /** The class attribute as written. */
  classSource: string;
  /** The element's own line. */
  line: number;
  /** Its other attributes as written, by name. */
  props: Record<string, string>;
  unresolved: string[];
  /** A component that forwards the class to the part (`ModelCombobox` to its `Button`). */
  wrapper?: string;
}

export interface Site {
  file: string;
  /** The classes ESLint flagged, as the appendix lists them. */
  flagged: string[];
  instances: Instance[];
  line: number;
  part: string;
  set: string;
}

const CAP = 512;
const MERGE = new Set(["cn", "clsx", "cx", "twMerge"]);
const SPACES = /\s+/g;
const PART_HEAD = /^### <([A-Za-z]+)>/;
const BULLET = /^- `([^`]+):(\d+)` \(set (\w+)\): (.*)$/;
const TICKED = /`([^`]+)`/g;

const tidy = (s: string) => s.replace(SPACES, " ").trim();
const unique = (alts: string[]) => [...new Set(alts.map(tidy))];

function product(lists: string[][]): string[] {
  let out = [""];
  for (const list of lists) {
    out = out.flatMap((a) => list.map((b) => `${a} ${b}`));
    if (out.length > CAP) {
      throw new Error("too many alternatives");
    }
  }
  return unique(out);
}

/** Each pair joined with no space of its own, as a template joins its parts. */
function joined(lists: string[][]): string[] {
  let out = [""];
  for (const list of lists) {
    out = out.flatMap((a) => list.map((b) => a + b));
  }
  return out;
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

/** Calls `visit` on every node under `root`, Svelte's and ESTree's alike. */
export function walk(root: Node, visit: (node: Node) => void): void {
  const go = (node: Node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(go);
      return;
    }
    visit(node);
    for (const key of Object.keys(node)) {
      if (key !== "parent" && key !== "metadata") {
        go(node[key]);
      }
    }
  };
  go(root);
}

/** Every `const x = …` in the scripts and every `{@const x = …}` in the markup. */
function declarations(ast: Ast): Map<string, Node> {
  const out = new Map<string, Node>();
  const take = (node: Node) => {
    const named =
      node.type === "VariableDeclarator" && node.id?.type === "Identifier";
    if (named && node.init && !out.has(node.id.name)) {
      out.set(node.id.name, node.init);
    }
  };
  walk(ast.module?.content, take);
  walk(ast.instance?.content, take);
  walk(ast.fragment, take);
  return out;
}

/** What one evaluation reads and records. */
interface Context {
  decls: Map<string, Node>;
  go: (n: Node) => string[];
  lines: Set<number>;
  seen: Set<string>;
  source: string;
  unresolved: string[];
}

const unknown = (n: Node, ctx: Context): string[] => {
  ctx.unresolved.push(ctx.source.slice(n.start, n.end));
  return [""];
};

const HANDLERS: Record<string, (n: Node, ctx: Context) => string[]> = {
  Literal: (n, ctx) => {
    if (typeof n.value !== "string") {
      return [""];
    }
    ctx.lines.add(lineAt(ctx.source, n.start));
    return [n.value];
  },
  Text: (n, ctx) => {
    ctx.lines.add(lineAt(ctx.source, n.start));
    return [n.data];
  },
  ExpressionTag: (n, ctx) => ctx.go(n.expression),
  TemplateLiteral: (n, ctx) => {
    const parts: string[][] = [];
    n.quasis.forEach((q: Node, i: number) => {
      ctx.lines.add(lineAt(ctx.source, q.start));
      parts.push([q.value.cooked ?? ""]);
      if (i < n.expressions.length) {
        parts.push(ctx.go(n.expressions[i]));
      }
    });
    return joined(parts);
  },
  ConditionalExpression: (n, ctx) => [
    ...ctx.go(n.consequent),
    ...ctx.go(n.alternate),
  ],
  LogicalExpression: (n, ctx) =>
    n.operator === "&&"
      ? [...ctx.go(n.right), ""]
      : [...ctx.go(n.left), ...ctx.go(n.right)],
  ArrayExpression: (n, ctx) => product(n.elements.map((e: Node) => ctx.go(e))),
  ObjectExpression: (n) =>
    product(
      n.properties.map((p: Node) => {
        const key = p.key?.type === "Literal" ? p.key.value : p.key?.name;
        return typeof key === "string" ? [key, ""] : [""];
      })
    ),
  CallExpression: (n, ctx) =>
    MERGE.has(n.callee?.name)
      ? product(n.arguments.map((a: Node) => ctx.go(a)))
      : unknown(n, ctx),
  Identifier: (n, ctx) => {
    if (n.name === "undefined") {
      return [""];
    }
    const init = ctx.decls.get(n.name);
    if (!init || ctx.seen.has(n.name)) {
      ctx.unresolved.push(n.name);
      return [""];
    }
    ctx.seen.add(n.name);
    const v = ctx.go(init);
    ctx.seen.delete(n.name);
    return v;
  },
  MemberExpression: (n, ctx) => {
    const object =
      n.object?.type === "Identifier" ? ctx.decls.get(n.object.name) : null;
    const key = n.computed ? null : n.property.name;
    const props =
      object?.type === "ObjectExpression"
        ? object.properties.filter(
            (p: Node) =>
              key === null ||
              p.key?.name === key ||
              (p.key?.type === "Literal" && p.key.value === key)
          )
        : [];
    return props.length > 0
      ? props.flatMap((p: Node) => ctx.go(p.value))
      : unknown(n, ctx);
  },
  TSAsExpression: (n, ctx) => ctx.go(n.expression),
  TSSatisfiesExpression: (n, ctx) => ctx.go(n.expression),
  TSNonNullExpression: (n, ctx) => ctx.go(n.expression),
};

function evaluate(node: Node, source: string, decls: Map<string, Node>): Value {
  const ctx: Context = {
    decls,
    go: (n: Node) => {
      if (!n) {
        return [""];
      }
      const handle = HANDLERS[n.type];
      return handle ? handle(n, ctx) : unknown(n, ctx);
    },
    lines: new Set<number>(),
    seen: new Set<string>(),
    source,
    unresolved: [],
  };
  const alts = unique(ctx.go(node));
  return { alts, lines: ctx.lines, unresolved: ctx.unresolved };
}

function evaluateAttribute(
  attribute: Node,
  source: string,
  decls: Map<string, Node>
): Value {
  const { value } = attribute;
  if (value === true) {
    return evaluate(null, source, decls);
  }
  if (!Array.isArray(value)) {
    return evaluate(value, source, decls);
  }
  // `class="a {b} c"`: its parts joined, Text keeping its own spaces and an
  // expression's strings whole classes.
  const lines = new Set<number>();
  const unresolved: string[] = [];
  const lists = value.map((part: Node) => {
    if (part.type === "Text") {
      lines.add(lineAt(source, part.start));
      return [part.data];
    }
    const v = evaluate(part, source, decls);
    for (const l of v.lines) {
      lines.add(l);
    }
    unresolved.push(...v.unresolved);
    return v.alts;
  });
  return { alts: unique(joined(lists)), lines, unresolved };
}

/** The appendix's K2 sites: every part not a table part. */
export function appendixSites(): Omit<Site, "instances">[] {
  const text = readFileSync(join(ROOT, ".cutover", "clearance.md"), "utf8");
  const appendix = text.slice(text.indexOf("## Appendix"));
  const out: Omit<Site, "instances">[] = [];
  let part = "";
  for (const line of appendix.split("\n")) {
    const head = line.match(PART_HEAD);
    if (head) {
      part = head[1] ?? "";
      continue;
    }
    const bullet = line.match(BULLET);
    if (bullet && part && !part.startsWith("Table")) {
      out.push({
        file: bullet[1] ?? "",
        line: Number(bullet[2]),
        set: bullet[3] ?? "",
        part,
        flagged: [...(bullet[4] ?? "").matchAll(TICKED)].map((m) => m[1] ?? ""),
      });
    }
  }
  return out;
}

/** A component element, one of its class attributes, and what that can be. */
interface Element {
  attr: string;
  node: Node;
  part: string;
  value: Value;
}

/** Every component element's class attributes (`class`, or a part's `…Class`). */
function elementsOf(ast: Ast, source: string): Element[] {
  const decls = declarations(ast);
  const out: Element[] = [];
  walk(ast.fragment, (node) => {
    if (node.type !== "Component" || !Array.isArray(node.attributes)) {
      return;
    }
    for (const a of node.attributes) {
      const classes =
        a.type === "Attribute" &&
        (a.name === "class" || a.name.endsWith("Class"));
      if (classes) {
        out.push({
          attr: a.name,
          part: String(node.name).replace(".", ""),
          node,
          value: evaluateAttribute(a, source, decls),
        });
      }
    }
  });
  return out;
}

function instanceOf(element: Element, part: string, source: string): Instance {
  const { attr, node, value } = element;
  const props: Record<string, string> = {};
  let classSource = "";
  for (const a of node.attributes) {
    const text = source.slice(a.start, a.end);
    if (a.type !== "Attribute") {
      props[`${a.type}@${a.start}`] = text;
    } else if (a.name === attr) {
      classSource = text;
    } else {
      props[a.name] = text;
    }
  }
  return {
    line: lineAt(source, node.start),
    attr,
    ...(element.part === part ? {} : { wrapper: element.part }),
    props,
    classSource,
    alts: value.alts,
    unresolved: value.unresolved,
  };
}

export function readSites(): Site[] {
  const byFile = new Map<string, Omit<Site, "instances">[]>();
  for (const site of appendixSites()) {
    byFile.set(site.file, [...(byFile.get(site.file) ?? []), site]);
  }
  const out: Site[] = [];
  for (const [file, list] of byFile) {
    const source = readFileSync(join(DASH, file), "utf8");
    const elements = elementsOf(parse(source, { modern: true }), source);
    for (const site of list) {
      const reads = elements.filter((e) => e.value.lines.has(site.line));
      const own = reads.filter((e) => e.part === site.part);
      // No element of the part itself: a component that forwards its class.
      const matched = own.length > 0 ? own : reads;
      out.push({
        ...site,
        instances: matched.map((e) => instanceOf(e, site.part, source)),
      });
    }
  }
  return out;
}

if (import.meta.main) {
  const sites = readSites();
  writeFileSync(
    join(ROOT, ".cutover", "clearance", "K2-sites.json"),
    `${JSON.stringify(sites, null, 1)}\n`
  );
  const lost = sites.filter((s) => s.instances.length === 0);
  const hits = sites.reduce((n, s) => n + s.flagged.length, 0);
  const elements = sites.reduce((n, s) => n + s.instances.length, 0);
  console.log(
    `${sites.length} sites, ${hits} flagged classes, ${elements} elements; ${lost.length} sites with no element`
  );
  for (const s of lost) {
    console.log(`  no element: ${s.file}:${s.line} <${s.part}>`);
  }
}
