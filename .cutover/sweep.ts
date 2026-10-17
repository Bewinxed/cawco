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
  css: { content: { styles: string; start: number } } | null;
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
const lineAt = (text: string, offset: number) =>
  text.slice(0, offset).split("\n").length;

/** Every class name in a selector text, outside attribute brackets and strings. */
function classesOf(selector: string): string[] {
  const bare = selector
    .replace(/\[[^\]]*\]/g, "[]")
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .replace(/url\([^)]*\)/g, "");
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
const give = (text: string, into: Set<string> = provided) => {
  for (const token of text.split(/\s+/)) {
    const clean = token.replace(/^[!]|[!]$/g, "");
    if (CLASS_TOKEN.test(clean)) {
      into.add(clean);
    }
  }
};

/** Every string literal and template chunk under an estree node. */
function strings(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") {
    return out;
  }
  const n = node as Node;
  if (n.type === "Literal" && typeof n.value === "string") {
    out.push(n.value);
  } else if (n.type === "TemplateElement") {
    out.push(String((n.value as { cooked?: string })?.cooked ?? ""));
  }
  for (const [key, value] of Object.entries(n)) {
    if (key === "parent" || key === "metadata") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        strings(v, out);
      }
    } else if (value && typeof value === "object") {
      strings(value, out);
    }
  }
  return out;
}

const CLASS_PROP = /(^|[a-z])class(name)?(es)?$/i;
/** Markup: class attributes, class: directives, …Class props. */
function markup(node: unknown): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as Node;
  if (n.type === "Attribute" && typeof n.name === "string" && CLASS_PROP.test(n.name)) {
    const value = n.value;
    const parts = Array.isArray(value) ? value : [value];
    for (const part of parts) {
      const p = part as Node | true;
      if (p === true || !p) {
        continue;
      }
      if (p.type === "Text") {
        give(String(p.data ?? ""));
      } else {
        for (const s of strings(p.expression ?? p)) {
          give(s);
        }
      }
    }
  }
  if (n.type === "ClassDirective" && typeof n.name === "string") {
    provided.add(n.name);
  }
  for (const [key, value] of Object.entries(n)) {
    if (key === "parent" || key === "metadata") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        markup(v);
      }
    } else if (value && typeof value === "object") {
      markup(value);
    }
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

/** A script with its comments (line, block and HTML) blanked, strings kept, line breaks kept. */
function uncommented(text: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote || (ch === "\n" && quote !== "`")) {
        quote = null;
      }
      i += 1;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === "//" && text[i - 1] !== ":") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      out += blank(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (two === "/*" || text.startsWith("<!--", i)) {
      const close = two === "/*" ? "*/" : "-->";
      const end = text.indexOf(close, i + 2);
      const stop = end < 0 ? text.length : end + close.length;
      out += blank(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** A script's own selector strings and class writes. */
function script(source: string, file: string, offset: number): void {
  const text = uncommented(source);
  for (const m of text.matchAll(QUERY)) {
    for (const name of classesOf(m[3] ?? "")) {
      select(name, `${file}:${lineAt(text, m.index ?? 0) + offset}`);
    }
  }
  for (const m of text.matchAll(SELECTOR_CONST)) {
    for (const name of classesOf(m[2] ?? "")) {
      select(name, `${file}:${lineAt(text, m.index ?? 0) + offset}`);
    }
  }
  for (const m of text.matchAll(CLASSLIST_READ)) {
    if (m[1] === "contains") {
      select(m[3] ?? "", `${file}:${lineAt(text, m.index ?? 0) + offset}`);
    } else {
      give(m[3] ?? "");
    }
  }
  for (const m of text.matchAll(CLASSNAME_SET)) {
    give(m[2] ?? "");
  }
  for (const m of text.matchAll(PROVIDE_CALL)) {
    // The call's own arguments, to its closing parenthesis.
    let depth = 0;
    let end = (m.index ?? 0) + m[0].length;
    for (; end < text.length; end += 1) {
      const ch = text[end];
      if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        if (depth === 0) {
          break;
        }
        depth -= 1;
      }
    }
    const args = text.slice((m.index ?? 0) + m[0].length, end);
    for (const s of args.matchAll(/(["'`])((?:(?!\1).)*)\1/g)) {
      give(s[2] ?? "");
    }
  }
  for (const s of text.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)) {
    const literal = s[2] ?? "";
    give(literal, maybe);
    const at = `${file}:${lineAt(text, s.index ?? 0) + offset}`;
    // A selector handed to any helper (`nestFrom(".x")`, `linkOrRefusal(…, ".x")`).
    if (SELECTORISH.test(literal) && !NOT_SELECTOR.test(literal)) {
      for (const name of classesOf(literal)) {
        select(name, at);
      }
    }
    // CSS a script injects (`".x > * { display: none }"`).
    if (/^[^{}]+\{[^{}]*\}\s*$/.test(literal)) {
      for (const name of classesOf(literal.slice(0, literal.indexOf("{")))) {
        select(name, at);
      }
    }
  }
}

/** A stylesheet's class selectors (all of them, or only inside :global()). */
function sheet(css: string, file: string, offset: number, globalOnly: boolean): void {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.replace(/[^\n]/g, " ")
  );
  const preludes = /([^{};]+)\{/g;
  for (const m of noComments.matchAll(preludes)) {
    const prelude = m[1] ?? "";
    if (prelude.trim().startsWith("@")) {
      continue;
    }
    const at = `${file}:${lineAt(noComments, m.index ?? 0) + offset}`;
    if (globalOnly) {
      for (const g of prelude.matchAll(/:global\(/g)) {
        let depth = 0;
        let end = (g.index ?? 0) + g[0].length;
        for (; end < prelude.length; end += 1) {
          if (prelude[end] === "(") {
            depth += 1;
          } else if (prelude[end] === ")") {
            if (depth === 0) {
              break;
            }
            depth -= 1;
          }
        }
        for (const name of classesOf(
          prelude.slice((g.index ?? 0) + g[0].length, end)
        )) {
          select(name, at);
        }
      }
    } else {
      for (const name of classesOf(prelude)) {
        select(name, at);
      }
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
  script(
    text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, (b) =>
      b.replace(/[^\n]/g, " ")
    ),
    file,
    0
  );
  if (ast.css) {
    const start = ast.css.content.start;
    sheet(ast.css.content.styles, file, lineAt(text, start) - 1, true);
  }
}
for (const path of walkFiles(SRC, (n) => n.endsWith(".ts") || n.endsWith(".js"))) {
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
