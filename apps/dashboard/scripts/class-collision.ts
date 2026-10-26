/**
 * Part of `bun run check`: no class is both a component's own hook and a
 * Tailwind utility. A class the markup writes and the component's own
 * `<style>` selects (scoped, or through `:global`) is also a candidate
 * Tailwind compiles, so a name like `ring`, `border` or `truncate` draws the
 * utility as well as the rule: the pairing sheet's `ring` drew a 1px
 * currentColor box-shadow round its dial. The scoped meaning belongs on a
 * hook attribute (`data-*`); a utility that is meant stays, written once, as
 * the utility alone.
 *
 * Every `src/**\/*.svelte` with a `<style>` is parsed by Svelte's own parser:
 * its markup's classes (a `class` attribute's text and string literals, a
 * `class:` directive's name, on elements and components alike) against its
 * stylesheet's class selectors, `:global(…)` included. Each name both carry
 * is compiled with app.css on the dashboard's Tailwind; one that generates
 * CSS is a collision, listed with its file and lines, and any one fails the
 * check. A directory argument checks that `src` instead, with its own
 * app.css (an older checkout's).
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { compile } from "@tailwindcss/node";
import { parse } from "svelte/compiler";

const DASHBOARD = join(dirname(new URL(import.meta.url).pathname), "..");
const SRC = process.argv[2] ? resolve(process.argv[2]) : join(DASHBOARD, "src");
const APP_CSS = join(SRC, "app.css");
const STYLE_OPEN = /<style[\s>]/u;
const SPACE = /\s+/u;
/** A comparison's operands are values, not classes (`variant === "ring"`). */
const COMPARE = new Set(["===", "!==", "==", "!="]);

interface Node {
  start?: number;
  type?: string;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null;

/** Every node under `root`, each with its parent, in source order. */
function* nodes(
  root: unknown,
  parent: Node | null = null
): Generator<[Node, Node | null]> {
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
    // `metadata` holds the analysis's back references, never source.
    if (key !== "metadata" && key !== "parent") {
      yield* nodes(value, typeof root.type === "string" ? root : parent);
    }
  }
}

/** The class names a `class` value writes: its text, and its expressions' string literals. */
function classesIn(value: unknown): string[] {
  const out: string[] = [];
  for (const [node, parent] of nodes(value)) {
    if (node.type === "Text" && typeof node.data === "string") {
      out.push(...node.data.split(SPACE));
    } else if (
      node.type === "Literal" &&
      typeof node.value === "string" &&
      !(
        parent?.type === "BinaryExpression" &&
        COMPARE.has(parent.operator as string)
      ) &&
      !(parent?.type === "Property" && parent.key === node)
    ) {
      out.push(...node.value.split(SPACE));
    } else if (node.type === "TemplateElement") {
      const cooked = (node.value as { cooked?: string }).cooked ?? "";
      out.push(...cooked.split(SPACE));
    }
  }
  return out.filter(Boolean);
}

/** Each name's lines, by name. */
type Lines = Map<string, number[]>;

const add = (into: Lines, name: string, line: number) => {
  const lines = into.get(name) ?? [];
  if (!lines.includes(line)) {
    lines.push(line);
  }
  into.set(name, lines);
};

/** A component's markup classes and its stylesheet's class selectors, by name. */
function read(source: string): { markup: Lines; style: Lines } {
  const ast = parse(source, { modern: true });
  const lineOf = (at: number | undefined) =>
    source.slice(0, at ?? 0).split("\n").length;
  const markup: Lines = new Map();
  for (const [node] of nodes(ast.fragment)) {
    if (node.type === "Attribute" && node.name === "class") {
      for (const name of classesIn(node.value)) {
        add(markup, name, lineOf(node.start));
      }
    } else if (node.type === "ClassDirective") {
      add(markup, node.name as string, lineOf(node.start));
    }
  }
  const style: Lines = new Map();
  for (const [node] of nodes(ast.css)) {
    if (node.type === "ClassSelector") {
      add(style, node.name as string, lineOf(node.start));
    }
  }
  return { markup, style };
}

const shared: {
  file: string;
  markup: number[];
  name: string;
  style: number[];
}[] = [];
let files = 0;
for (const name of [...new Bun.Glob("**/*.svelte").scanSync(SRC)].sort()) {
  const path = join(SRC, name);
  const source = readFileSync(path, "utf8");
  if (!STYLE_OPEN.test(source)) {
    continue;
  }
  files += 1;
  const { markup, style } = read(source);
  for (const [cls, lines] of markup) {
    const selected = style.get(cls);
    if (selected) {
      shared.push({
        file: relative(process.cwd(), path),
        name: cls,
        markup: lines,
        style: selected,
      });
    }
  }
}

// Tailwind's compiler keeps every candidate it has built: a build that grows
// the CSS is one whose new candidate generated a rule.
const compiler = await compile(readFileSync(APP_CSS, "utf8"), {
  base: resolve(dirname(APP_CSS)),
  onDependency: () => undefined,
});
let size = compiler.build([]).length;
const generates = new Map<string, boolean>();
for (const cls of new Set(shared.map((one) => one.name))) {
  const now = compiler.build([cls]).length;
  generates.set(cls, now > size);
  size = now;
}

const collisions = shared.filter((one) => generates.get(one.name));
if (collisions.length > 0) {
  console.error(
    "Classes a component's markup writes and its own <style> selects that are also Tailwind utilities (the rule and the utility both draw; the hook goes on a data-* attribute):"
  );
  for (const one of collisions) {
    console.error(
      `  ${one.file}:${one.markup.join(",")}: \`${one.name}\` (its <style> at ${one.style.join(",")})`
    );
  }
  console.error(
    `class-collision: ${files} file(s) with a <style>, ${collisions.length} collision(s)`
  );
  process.exit(1);
}
console.log(
  `class-collision: ${files} file(s) with a <style>, ${shared.length} shared class(es), none a Tailwind utility`
);
