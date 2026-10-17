/**
 * `bun .cutover/sweep.ts`: every class another place selects must still be
 * put on an element somewhere.
 *
 * Selected: a class inside `:global(…)` in a component's `<style>`, a class
 * selector in a stylesheet under apps/dashboard/src, and a class in a
 * selector string a script hands to `closest`, `querySelector(All)`,
 * `matches`, `locator`, `waitForSelector`, `$`/`$$` or a `*_SELECTOR`/`GLYPH`
 * constant, or names to `classList.contains/toggle/add/remove` (scripts under
 * apps/dashboard/src, scripts/probe-kit and scripts/probe-*.ts).
 *
 * Put on an element: a token of a `class` attribute (its text, and every
 * string literal in its expression), a `class:x` directive, a component prop
 * named `…class` / `…Class`, `classList.add/toggle/replace(…)`, a
 * `.className` assignment, and the string arguments of `cn`, `clsx`,
 * `twMerge`, `tv`, `cva`. A name found only in some other string literal is
 * reported as "maybe" (a class built in script).
 *
 * Prints each selected class that nothing puts on an element, with its
 * selecting sites; exits 0 (the list is for a person to triage).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const HERE = resolve(import.meta.dir, "..");
/** `--root <dir>` sweeps another checkout (the foundation's, for a baseline) with this one's Svelte. */
const rootAt = process.argv.indexOf("--root");
const ROOT = rootAt >= 0 ? resolve(process.argv[rootAt + 1] ?? HERE) : HERE;
const DASHBOARD = join(ROOT, "apps", "dashboard");
const SRC = join(DASHBOARD, "src");
const { parse } = (await import(
  Bun.resolveSync("svelte/compiler", join(HERE, "apps", "dashboard"))
)) as { parse: (s: string, o: { modern: true }) => Ast };

interface Ast {
  css: { content: { start: number; styles: string } } | null;
  fragment: Node;
  instance?: Node;
  module?: Node;
}
type Node = Record<string, unknown> & { type?: string };

const SKIP = new Set(["node_modules", ".svelte-kit", "dist", "build"]);
function walkFiles(dir: string, test: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...walkFiles(path, test));
    } else if (test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const CLASS_TOKEN = /^-?[a-zA-Z_][\w-]*$/;
/** A class in a selector, `h3.ghead`'s included; a number's point (`1.5`) never starts one. */
const CLASS_IN_SELECTOR = /(?<![\\-])\.(-?[a-zA-Z_][\w-]*)/g;
const ATTRIBUTE_BRACKETS = /\[[^\]]*\]/g;
const QUOTED = /"[^"]*"|'[^']*'/g;
const URL_CALL = /url\([^)]*\)/g;
const WHITESPACE = /\s+/;
const BANG_EDGES = /^[!]|[!]$/g;
const NOT_NEWLINE = /[^\n]/g;
/** A string literal of any quote, on one line or (template) across them. */
const STRING_LITERAL = /(["'`])((?:(?!\1).)*)\1/g;
/** A string literal of any quote, kept to one line. */
const LINE_STRING = /(["'`])((?:(?!\1)[^\n])*)\1/g;
/** CSS a script injects as one rule (`".x > * { display: none }"`). */
const INJECTED_RULE = /^[^{}]+\{[^{}]*\}\s*$/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const PRELUDE = /([^{};]+)\{/g;
const GLOBAL_OPEN = /:global\(/g;
const SCRIPT_OR_STYLE = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g;

const lineAt = (text: string, offset: number) =>
  text.slice(0, offset).split("\n").length;
const blank = (s: string) => s.replace(NOT_NEWLINE, " ");

/** Every class name in a selector text, outside attribute brackets and strings. */
function classesOf(selector: string): string[] {
  const bare = selector
    .replace(ATTRIBUTE_BRACKETS, "[]")
    .replace(QUOTED, '""')
    .replace(URL_CALL, "");
  return [...bare.matchAll(CLASS_IN_SELECTOR)].map((m) => m[1] ?? "");
}

const provided = new Set<string>();
const maybe = new Set<string>();
const selected = new Map<string, Set<string>>();
const select = (name: string, site: string) => {
  if (!selected.has(name)) {
    selected.set(name, new Set());
  }
  selected.get(name)?.add(site);
};
const selectAll = (names: string[], site: string) => {
  for (const name of names) {
    select(name, site);
  }
};
const give = (text: string, into: Set<string> = provided) => {
  for (const token of text.split(WHITESPACE)) {
    const clean = token.replace(BANG_EDGES, "");
    if (CLASS_TOKEN.test(clean)) {
      into.add(clean);
    }
  }
};

/** Each child node of an AST node, its parent and metadata links left out. */
function children(node: Node): unknown[] {
  const out: unknown[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "metadata") {
      continue;
    }
    if (Array.isArray(value)) {
      out.push(...value);
    } else if (value && typeof value === "object") {
      out.push(value);
    }
  }
  return out;
}

/** Every string literal and template chunk under an estree node. */
function strings(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") {
    return out;
  }
  const n = node as Node;
  if (n.type === "Literal" && typeof n.value === "string") {
    out.push(n.value);
  } else if (n.type === "TemplateElement") {
    out.push(
      String((n.value as { cooked?: string } | undefined)?.cooked ?? "")
    );
  }
  for (const child of children(n)) {
    strings(child, out);
  }
  return out;
}

const CLASS_PROP = /(^|[a-z])class(name)?(es)?$/i;
/** A class attribute's or …Class prop's every token: its text, and every string in its expression. */
function giveAttribute(attribute: Node): void {
  const { value } = attribute;
  for (const part of Array.isArray(value) ? value : [value]) {
    const p = part as Node | true | undefined;
    if (p === true || !p) {
      continue;
    }
    if (p.type === "Text") {
      give(String(p.data ?? ""));
      continue;
    }
    for (const s of strings(p.expression ?? p)) {
      give(s);
    }
  }
}

/** Markup: class attributes, class: directives, …Class props. */
function markup(node: unknown): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as Node;
  const named = typeof n.name === "string";
  if (n.type === "Attribute" && named && CLASS_PROP.test(String(n.name))) {
    giveAttribute(n);
  }
  if (n.type === "ClassDirective" && named) {
    provided.add(String(n.name));
  }
  for (const child of children(n)) {
    markup(child);
  }
}

const QUERY =
  /\b(closest|querySelector|querySelectorAll|matches|locator|waitForSelector|\$\$?|\$eval|\$\$eval)\(\s*(["'`])((?:(?!\2).)*)\2/g;
const SELECTOR_CONST =
  /\b(?:const|let)\s+[A-Z][A-Z0-9_]*(?:SELECTOR|GLYPH|SEL|QUERY)[A-Z0-9_]*\s*=\s*(["'`])((?:(?!\1).)*)\1/g;
const CLASSLIST_READ =
  /classList\.(contains|toggle|add|remove|replace)\(\s*(["'`])([^"'`]+)\2/g;
const PROVIDE_CALL = /\b(cn|clsx|twMerge|tv|cva)\(/g;
/** A string shaped like a selector that starts with a class: `.x`, `h3.x`, `:scope > .x`. */
const SELECTORISH =
  /^\s*(?::scope\s*[>+~]?\s*)?(?:[a-z][a-z0-9-]*)?\.[a-zA-Z_][\w-]*(?:$|[\s>+~,.:[()])/;
/** …and not a file name, a path, a property path or a sentence. */
const NOT_SELECTOR =
  /\/|\.(svelte|ts|js|mjs|json|css|png|jpe?g|webp|svg|md|html|txt|woff2?|sh|log|lock|yml|yaml)\b|^[a-z]+\.[a-z]+$|\s[a-z]+\s[a-z]+\s/i;
const CLASSNAME_SET = /\.className\s*[+]?=\s*(["'`])((?:(?!\1).)*)\1/g;

/** Where a string that opens at `i` (on its quote) ends, past its closing quote. */
function stringEnd(text: string, i: number): number {
  const quote = text[i];
  let at = i + 1;
  while (at < text.length) {
    const ch = text[at];
    if (ch === "\\") {
      at += 2;
      continue;
    }
    at += 1;
    if (ch === quote || (ch === "\n" && quote !== "`")) {
      break;
    }
  }
  return at;
}

/** Where a comment that opens at `i` ends: a line comment at its line's end, a block or HTML one past its close. */
function commentEnd(text: string, i: number): number | null {
  if (text.startsWith("//", i) && text[i - 1] !== ":") {
    const end = text.indexOf("\n", i);
    return end < 0 ? text.length : end;
  }
  let close: string;
  if (text.startsWith("/*", i)) {
    close = "*/";
  } else if (text.startsWith("<!--", i)) {
    close = "-->";
  } else {
    return null;
  }
  const end = text.indexOf(close, i + 2);
  return end < 0 ? text.length : end + close.length;
}

/** A script with its comments (line, block and HTML) blanked, strings kept, line breaks kept. */
function uncommented(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = stringEnd(text, i);
      out += text.slice(i, end);
      i = end;
      continue;
    }
    const end = commentEnd(text, i);
    if (end === null) {
      out += ch;
      i += 1;
    } else {
      out += blank(text.slice(i, end));
      i = end;
    }
  }
  return out;
}

/** The index of the `)` that closes a call whose arguments start at `from`. */
function closingParen(text: string, from: number): number {
  let depth = 0;
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === "(") {
      depth += 1;
    } else if (text[at] === ")") {
      if (depth === 0) {
        return at;
      }
      depth -= 1;
    }
  }
  return text.length;
}

/** The selectors a script hands to the DOM or a probe, and the classes it reads or writes by name. */
function queries(text: string, file: string, offset: number): void {
  const site = (index: number | undefined) =>
    `${file}:${lineAt(text, index ?? 0) + offset}`;
  for (const m of text.matchAll(QUERY)) {
    selectAll(classesOf(m[3] ?? ""), site(m.index));
  }
  for (const m of text.matchAll(SELECTOR_CONST)) {
    selectAll(classesOf(m[2] ?? ""), site(m.index));
  }
  for (const m of text.matchAll(CLASSLIST_READ)) {
    if (m[1] === "contains") {
      select(m[3] ?? "", site(m.index));
    } else {
      give(m[3] ?? "");
    }
  }
  for (const m of text.matchAll(CLASSNAME_SET)) {
    give(m[2] ?? "");
  }
}

/** The string arguments of a class-building call (`cn(…)`, `tv(…)`): classes put on. */
function provideCalls(text: string): void {
  for (const m of text.matchAll(PROVIDE_CALL)) {
    const from = (m.index ?? 0) + m[0].length;
    const args = text.slice(from, closingParen(text, from));
    for (const s of args.matchAll(STRING_LITERAL)) {
      give(s[2] ?? "");
    }
  }
}

/** Every other string: a maybe-class, a selector handed to a helper, or a rule the script injects. */
function literals(text: string, file: string, offset: number): void {
  for (const s of text.matchAll(LINE_STRING)) {
    const literal = s[2] ?? "";
    give(literal, maybe);
    const at = `${file}:${lineAt(text, s.index ?? 0) + offset}`;
    // A selector handed to any helper (`nestFrom(".x")`, `linkOrRefusal(…, ".x")`).
    if (SELECTORISH.test(literal) && !NOT_SELECTOR.test(literal)) {
      selectAll(classesOf(literal), at);
    }
    if (INJECTED_RULE.test(literal)) {
      selectAll(classesOf(literal.slice(0, literal.indexOf("{"))), at);
    }
  }
}

/** A script's own selector strings and class writes. */
function script(source: string, file: string, offset: number): void {
  const text = uncommented(source);
  queries(text, file, offset);
  provideCalls(text);
  literals(text, file, offset);
}

/** What each `:global(…)` in a selector prelude holds. */
function globalArguments(prelude: string): string[] {
  return [...prelude.matchAll(GLOBAL_OPEN)].map((g) => {
    const from = (g.index ?? 0) + g[0].length;
    return prelude.slice(from, closingParen(prelude, from));
  });
}

/** A stylesheet's class selectors (all of them, or only inside :global()). */
function sheet(
  css: string,
  file: string,
  offset: number,
  globalOnly: boolean
): void {
  const noComments = css.replace(BLOCK_COMMENT, blank);
  for (const m of noComments.matchAll(PRELUDE)) {
    const prelude = m[1] ?? "";
    if (prelude.trim().startsWith("@")) {
      continue;
    }
    const at = `${file}:${lineAt(noComments, m.index ?? 0) + offset}`;
    const parts = globalOnly ? globalArguments(prelude) : [prelude];
    for (const part of parts) {
      selectAll(classesOf(part), at);
    }
  }
}

const svelteFiles = walkFiles(SRC, (n) => n.endsWith(".svelte"));
for (const path of svelteFiles) {
  const file = relative(ROOT, path);
  const text = readFileSync(path, "utf8");
  let ast: Ast;
  try {
    ast = parse(text, { modern: true });
  } catch {
    console.log(`does not parse: ${file}`);
    continue;
  }
  markup(ast.fragment);
  for (const block of [ast.instance, ast.module]) {
    if (block) {
      const start = Number(block.start ?? 0);
      const end = Number(block.end ?? 0);
      script(text.slice(start, end), file, lineAt(text, start) - 1);
    }
  }
  // Script inside markup expressions ({@attach}, handlers) reads selectors too.
  script(text.replace(SCRIPT_OR_STYLE, blank), file, 0);
  if (ast.css) {
    const { start, styles } = ast.css.content;
    sheet(styles, file, lineAt(text, start) - 1, true);
  }
}
for (const path of walkFiles(
  SRC,
  (n) => n.endsWith(".ts") || n.endsWith(".js")
)) {
  script(readFileSync(path, "utf8"), relative(ROOT, path), 0);
}
for (const path of [
  ...walkFiles(join(ROOT, "scripts", "probe-kit"), (n) => n.endsWith(".ts")),
  ...readdirSync(join(ROOT, "scripts"))
    .filter((n) => n.startsWith("probe-") && n.endsWith(".ts"))
    .map((n) => join(ROOT, "scripts", n)),
]) {
  const text = readFileSync(path, "utf8");
  script(text, relative(ROOT, path), 0);
}
for (const path of walkFiles(SRC, (n) => n.endsWith(".css"))) {
  if (path.includes("/lib/tokens/")) {
    continue;
  }
  sheet(readFileSync(path, "utf8"), relative(ROOT, path), 0, false);
}

const missing = [...selected]
  .filter(([name]) => !provided.has(name))
  .sort(([a], [b]) => a.localeCompare(b));
for (const [name, sites] of missing) {
  console.log(
    `${maybe.has(name) ? "maybe  " : "MISSING"} .${name}  ${[...sites].join(", ")}`
  );
}
console.log(
  `${selected.size} selected classes; ${missing.length} not put on any element (${missing.filter(([n]) => !maybe.has(n)).length} with no string anywhere)`
);
