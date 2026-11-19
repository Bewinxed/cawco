/**
 * Writes a design token's value where a rule reads it with `var()`, for every
 * token nothing can change after the theme sets it.
 *
 * A declaration that holds `var()` is kept as text until an element is
 * styled: then Chrome substitutes the token and parses the value again, on
 * every element it styles that way and on every restyle the matched-property
 * cache does not answer (StyleCascade's substitution, then the property's
 * parser). A literal value is parsed once, with the sheet. On a static page of
 * the dashboard at 29 tabs (4,300 elements, each restyled with the cache
 * missed), `* { border-color: var(--color-border) }` alone cost 4.4µs of an
 * element's 19µs. In the dashboard itself at 29 tabs, its visible elements
 * restyled with the cache missed took 20.2µs an element before and 14.1µs
 * with the tokens written in place (three rounds each, base and this in turn).
 * A token's value reads tokens of its own, and the minifier folds what it
 * can once they are literal: `--color-border`'s
 * `light-dark(var(--color-neutral-6), oklch(from var(--color-neutral-12) l c h
 * / 0.08))` is written `light-dark(oklch(85.4% .014 82),oklch(93.4% .01
 * 82/.08))`.
 *
 * Substitution happens where the property is used, and a custom property's own
 * `var()`s where it is declared, so a token is written in place only where
 * that reads the same value: it is declared once, by the theme on `:root`
 * (under `@layer` alone), nothing else declares or registers it, no script,
 * template or other sheet names it except to read it with `var()` (a name in a
 * string or a `style:` directive may be a write the stylesheet never sees),
 * and every token its value reads holds the same. Its `:root` declaration
 * stays, for the scripts that read it. A token the theme overrides anywhere (a
 * scheme, a pointer, a component's own) keeps its `var()`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import postcss, { type Declaration, type Root } from "postcss";

/** The theme's rule: Tailwind writes `@theme` on `:root, :host`. */
const THEME_RULE = /^:root(?:\s*,\s*:host)?$/u;
const CUSTOM = /^--/u;
const CSS_WIDE = /^(?:initial|inherit|unset|revert|revert-layer)$/iu;
const SOURCE_FILE = /\.(?:svelte|ts|js|css)$/u;
/**
 * A custom property's name, and what reads it there: a `var(`, a Tailwind
 * class's `(--name)` or function (`--spacing(4)`), `getPropertyValue`, or one
 * of the motion helpers that read the root's token
 * (lib/platform/motion/curves.svelte.ts `rootToken`).
 */
const NAME =
  /(var\(\s*|-\(|\b(?:getPropertyValue|rootToken|dur|ease|curveOf|numberOf)\(\s*["'`])?(--[\w-]+)(\()?/gu;
/** A sheet's or a script's block comment, a template's, or a script's line comment. */
const COMMENT = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|^\s*\/\/.*$/gmu;
/** A character a substituted value cannot sit against without becoming one token with it. */
const JOINS = /[\w.%-]/u;

const RELATIVE_IMPORT = /@import\s+["'](\.[^"']+)["']/gu;

/** A sheet and every sheet it imports by a relative path: what its build holds. */
function sheetsOf(entry: string, into = new Set<string>()): Set<string> {
  if (!into.has(entry)) {
    into.add(entry);
    const text = readFileSync(entry, "utf8").replace(COMMENT, "");
    for (const [, path] of text.matchAll(RELATIVE_IMPORT)) {
      sheetsOf(resolvePath(dirname(entry), path), into);
    }
  }
  return into;
}

/**
 * Every custom property the sources under `dir` name other than as
 * a read: in a script or a template (a string, a `style:` directive, a
 * class), or in a sheet `entry` does not import, whose declarations the
 * entry's build never sees. Comments are left out.
 */
export function namedInSources(dir: string, entry: string): Set<string> {
  const built = sheetsOf(entry);
  const named = new Set<string>();
  for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const path = join(dir, file);
    if (!SOURCE_FILE.test(file) || built.has(path)) {
      continue;
    }
    const code = readFileSync(path, "utf8").replace(COMMENT, "");
    for (const [, read, name, call] of code.matchAll(NAME)) {
      if (!(read || call)) {
        named.add(name);
      }
    }
  }
  return named;
}

/** Where a declaration stands: in the theme's rule under `@layer` alone, or elsewhere. */
function inTheme(decl: Declaration): boolean {
  const rule = decl.parent;
  if (rule?.type !== "rule" || !THEME_RULE.test(rule.selector.trim())) {
    return false;
  }
  for (let up = rule.parent; up && up.type !== "root"; up = up.parent) {
    if (up.type !== "atrule" || up.name !== "layer") {
      return false;
    }
  }
  return true;
}

/** Where the `var(` at `start` closes, and its first comma at its own depth (-1: none). */
function closeOf(value: string, start: number) {
  let depth = 0;
  let comma = -1;
  for (let at = start + 3; at < value.length; at += 1) {
    const c = value[at];
    if (c === "(") {
      depth += 1;
    } else if (c === ")") {
      depth -= 1;
      if (depth === 0) {
        return { end: at, comma };
      }
    } else if (c === "," && depth === 1 && comma < 0) {
      comma = at;
    }
  }
  return { end: value.length, comma };
}

/** Each `var()` in a value: its name, its fallback, and where it stands. */
function* varsOf(value: string) {
  let from = 0;
  for (;;) {
    const start = value.indexOf("var(", from);
    if (start < 0) {
      return;
    }
    const { end, comma } = closeOf(value, start);
    const name = value.slice(start + 4, comma < 0 ? end : comma).trim();
    const fallback = comma < 0 ? null : value.slice(comma + 1, end);
    yield { start, end: end + 1, name, fallback };
    from = end + 1;
  }
}

/** The tokens written in place, each with its value, every token it reads written in. */
function tokensOf(root: Root, named: Set<string>): Map<string, string> {
  const declared = new Map<string, Declaration[]>();
  const registered = new Set<string>();
  root.walkAtRules("property", (rule) => {
    registered.add(rule.params.trim());
  });
  root.walkDecls(CUSTOM, (decl) => {
    const all = declared.get(decl.prop) ?? [];
    all.push(decl);
    declared.set(decl.prop, all);
  });
  const fixed = new Map<string, string>();
  for (const [name, decls] of declared) {
    const [only] = decls;
    if (
      decls.length === 1 &&
      inTheme(only) &&
      !registered.has(name) &&
      !named.has(name) &&
      !CSS_WIDE.test(only.value.trim()) &&
      only.value.trim() !== ""
    ) {
      fixed.set(name, only.value.trim());
    }
  }
  const resolved = new Map<string, string | null>();
  const resolve = (name: string, trail: string[]): string | null => {
    if (resolved.has(name)) {
      return resolved.get(name) ?? null;
    }
    const value = fixed.get(name);
    if (value === undefined || trail.includes(name)) {
      return null;
    }
    let out = "";
    let at = 0;
    for (const read of varsOf(value)) {
      const inner = resolve(read.name, [...trail, name]);
      if (inner === null) {
        resolved.set(name, null);
        return null;
      }
      out = joined(out + value.slice(at, read.start), inner, value[read.end]);
      at = read.end;
    }
    const whole = at === 0 ? value : out + value.slice(at);
    resolved.set(name, whole);
    return whole;
  };
  const tokens = new Map<string, string>();
  for (const name of fixed.keys()) {
    const value = resolve(name, []);
    if (value !== null) {
      tokens.set(name, value);
    }
  }
  return tokens;
}

/** `before` followed by `value`, spaced where it would join the text on either side. */
function joined(before: string, value: string, after: string | undefined) {
  const lead = JOINS.test(before.at(-1) ?? " ") ? " " : "";
  const trail = after !== undefined && JOINS.test(after) ? " " : "";
  return `${before}${lead}${value}${trail}`;
}

/** A value with each `var()` of a token written as the token's value. */
function inlined(value: string, tokens: Map<string, string>): string {
  let out = "";
  let at = 0;
  for (const read of varsOf(value)) {
    const token = tokens.get(read.name);
    if (token !== undefined) {
      out = joined(out + value.slice(at, read.start), token, value[read.end]);
    } else if (read.fallback === null) {
      out += value.slice(at, read.end);
    } else {
      const fallback = inlined(read.fallback, tokens);
      out += `${value.slice(at, read.start)}var(${read.name},${fallback})`;
    }
    at = read.end;
  }
  return at === 0 ? value : out + value.slice(at);
}

/** The sheet with every token written in place; the tokens, and the declarations rewritten. */
export function tokensInlined(css: string, named: Set<string>) {
  const root = postcss.parse(css);
  const tokens = tokensOf(root, named);
  let rewritten = 0;
  root.walkDecls((decl) => {
    if (
      !decl.value.includes("var(") ||
      (inTheme(decl) && tokens.has(decl.prop))
    ) {
      return;
    }
    const value = inlined(decl.value, tokens);
    if (value !== decl.value) {
      decl.value = value;
      rewritten += 1;
    }
  });
  return { css: root.toString(), tokens: tokens.size, rewritten };
}
