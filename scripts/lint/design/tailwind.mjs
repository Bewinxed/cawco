// The dashboard's Tailwind as the design rules ask it: its design system
// (`__unstable__loadDesignSystem` from @tailwindcss/node, over src/app.css,
// the stylesheet components.json names), and the classes its own CSS
// declares (a plain `.name` selector in the theme or a file it imports, or
// in a component's `<style>`), as @shadcn/lint read them (its `themeOf`
// and `parseClassSelectors`).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DASHBOARD } from "./model.mjs";

const THEME = path.join(DASHBOARD, "src/app.css");

// @tailwindcss/node is @tailwindcss/vite's dependency; resolved from there.
const fromVite = createRequire(
  fs.realpathSync(
    path.join(DASHBOARD, "node_modules/@tailwindcss/vite/package.json")
  )
);
const tailwind = await import(
  pathToFileURL(fromVite.resolve("@tailwindcss/node")).href
);

/** The dashboard's Tailwind design system. */
export const ds = await tailwind.__unstable__loadDesignSystem(
  fs.readFileSync(THEME, "utf8"),
  { base: path.dirname(THEME) }
);

/* --------------------------------------------------------- class tokens */

/** A class's variants and its base, split at top-level colons. */
export function splitVariants(token) {
  if (!token.includes(":")) {
    return { variants: [], base: token };
  }
  const segments = [];
  let brackets = 0;
  let parens = 0;
  let current = "";
  for (const char of token) {
    if (char === "[") {
      brackets += 1;
    } else if (char === "]") {
      brackets -= 1;
    } else if (brackets === 0 && char === "(") {
      parens += 1;
    } else if (brackets === 0 && char === ")") {
      parens -= 1;
    }
    if (char === ":" && brackets === 0 && parens === 0) {
      segments.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  segments.push(current);
  return { variants: segments.slice(0, -1), base: segments.at(-1) };
}

const LEADING_BANG = /^!/u;
const TRAILING_BANG = /!$/u;
const LEADING_MINUS = /^-/u;
const BRACKET_VALUE = /-\[[^\]]*\]/u;
const ARBITRARY_PROPERTY = /^\[[^\]]+:[^\]]+\]$/u;

/** The base without `!` or a leading `-`. */
export function normalizeClass(token) {
  return splitVariants(token)
    .base.replace(LEADING_BANG, "")
    .replace(TRAILING_BANG, "")
    .replace(LEADING_MINUS, "");
}

const MARKERS = new Set(["group", "peer", "dark", "light"]);
/** `group`, `peer`, `dark`, `light`, alone or with a `/name`. */
export const isMarkerClass = (token) =>
  MARKERS.has(normalizeClass(token).split("/")[0]);

/** A value written in brackets (`p-[3px]`) or an arbitrary property (`[color:red]`). */
export function isArbitraryValue(token) {
  if (!token.includes("[")) {
    return false;
  }
  const { base } = splitVariants(token);
  return BRACKET_VALUE.test(base) || ARBITRARY_PROPERTY.test(base);
}

const compiledRules = new Map();
/** The style rules a class compiles to, through its at-rules (none when Tailwind does not know it). */
function compiled(token) {
  if (!compiledRules.has(token)) {
    let nodes = [];
    try {
      nodes = ds.candidatesToAst([token])[0] ?? [];
    } catch {
      nodes = [];
    }
    compiledRules.set(token, nodes);
  }
  return compiledRules.get(token);
}

/** Whether Tailwind writes CSS for the class. */
export const knows = (token) => compiled(token).length > 0;

/** Every declaration a class writes, outside @property and @keyframes. */
export function declarationsOf(token) {
  const out = [];
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      if (node.kind === "declaration") {
        out.push(node);
      } else if (
        node.kind === "rule" ||
        (node.kind === "at-rule" &&
          node.name !== "@property" &&
          node.name !== "@keyframes")
      ) {
        visit(node.nodes);
      }
    }
  };
  visit(compiled(token));
  return out;
}

/* ---------------------------------------------------- the project's CSS */

const COMMENTS = /\/\*[\s\S]*?\*\//gu;
const STRINGS = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu;
const CLASS_SELECTOR = /\.(-?[_a-zA-Z][\w-]*)/gu;
const IMPORT = /@import\s+["']([^"']+)["']/gu;

/** The plain class names a stylesheet's selectors name. */
export function classSelectors(css) {
  const out = new Set();
  const bare = css.replace(COMMENTS, " ").replace(STRINGS, '""');
  for (const match of bare.matchAll(CLASS_SELECTOR)) {
    out.add(match[1]);
  }
  return out;
}

/** The classes the theme and the files it imports declare by selector. */
export const themeClasses = (() => {
  const out = new Set();
  const seen = new Set();
  const read = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) {
      return;
    }
    seen.add(file);
    const css = fs.readFileSync(file, "utf8");
    for (const name of classSelectors(css)) {
      out.add(name);
    }
    for (const [, spec] of css.replace(COMMENTS, " ").matchAll(IMPORT)) {
      if (spec.startsWith(".")) {
        read(path.resolve(path.dirname(file), spec));
      }
    }
  };
  read(THEME);
  return out;
})();
