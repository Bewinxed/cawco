/**
 * Part of `bun run check`: a `:has()` stands only in its rule's subject, the
 * compound that names the element the rule styles.
 *
 * Blink keeps one invalidation set for every `:has()` that stands before a
 * combinator (`.a:has(.b) .c`, `:is(.a:has(.b) *)`, `:where(.a:has(.b)) > &`):
 * what such a rule styles to the right of its `:has()` is merged into it, and
 * every element any such `:has()` could anchor on (any ancestor that is
 * "affected by non-subject :has") invalidates by that one set whenever a node
 * is added, removed or changed under it. One rule whose right side is `*` or
 * a descendant makes the set "invalidate the whole subtree": in the 29-tab
 * bench a node added under the composer's dock restyled every element under
 * it, find's 500 places with them (work item 4438cb67's trace, "Invalidation
 * set invalidates subtree … allDescendantsMightBeInvalid"). A `:has()` in the
 * subject (`.a:has(.b)`, Tailwind's `has-*:`) invalidates only its anchor.
 * What a descendant should take from such an anchor, the anchor hands down:
 * its own `:has()` sets a custom property or the descendant reads an
 * attribute the anchor carries.
 *
 * It reads the CSS the build ships, as the build makes it:
 *  - each stylesheet that imports `tailwindcss` (an entry), compiled by the
 *    dashboard's Tailwind with every candidate its scanner finds in the
 *    entry's sources, the scan `@tailwindcss/vite` runs: so every utility
 *    under any variant (`group-has-*:`, `in-[…]:`, an arbitrary `[&…]:`, a
 *    house `@custom-variant`) is read as it compiles. A house rule is named by
 *    the source map at its file and line; a utility by the places its class
 *    is written;
 *  - each `@custom-variant` the entry's sheets declare, compiled on a probe
 *    utility, so a definition fails where it stands even while nothing uses it;
 *  - each `.css` under src/ no entry imports, compiled alone;
 *  - each `.svelte` file's `<style>`, compiled as the build compiles it;
 *  - every other `.css` the house keeps under apps/ and packages/.
 * Nested rules are read as the browser resolves them (`&` is its parent).
 * A library's own sheet (anything from node_modules a house sheet imports,
 * Milkdown Crepe's toolbar.css among them) is the library's, used as
 * published, and not read: the owner's call on 2026-11-19.
 *
 * Prints `file:line: selector` per rule; exits 1 on any.
 */
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  __unstable__loadDesignSystem,
  compile,
  toSourceMap,
} from "@tailwindcss/node";
import postcss, { AtRule, Rule } from "postcss";
import selectorParser, { type Selector } from "postcss-selector-parser";
import { compile as compileSvelte } from "svelte/compiler";
import { repoFiles } from "../../../scripts/lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them. The
// Tailwind scanner is loaded by path (`node_modules/`).
export const checkReads = ["apps/dashboard/", "node_modules/"];

const DASHBOARD = join(import.meta.dir, "..");
const ROOT = join(DASHBOARD, "../..");
/** A stylesheet that is a Tailwind entry: it imports Tailwind itself. */
const ENTRY = /@import\s+["']tailwindcss["']/u;
const STYLE = /<style\b/u;
const CUSTOM_VARIANT = /@custom-variant\s+([\w-]+)/gu;
/** What a probe utility under a custom variant is: one that always compiles. */
const PROBE = "block";

interface Source {
  base: string;
  negated: boolean;
  pattern: string;
}
interface Scanner {
  files: string[];
  getCandidatesWithPositions: (input: {
    content: string;
    extension: string;
  }) => { candidate: string; position: number }[];
  scan: () => string[];
}
// The scanner is @tailwindcss/vite's dependency: the version the build runs.
const fromVite = createRequire(
  realpathSync(join(DASHBOARD, "node_modules/@tailwindcss/vite/package.json"))
);
const oxide = await import(
  pathToFileURL(fromVite.resolve("@tailwindcss/oxide")).href
);
const ScannerClass: new (options: { sources: Source[] }) => Scanner =
  oxide.Scanner;

/* ------------------------------------------------------------ the rule */

const PSEUDO_HAS = ":has";

/** Whether a `:has()` stands anywhere in the nodes, its arguments included. */
const holdsHas = (nodes: selectorParser.Node[]): boolean =>
  nodes.some(
    (node) =>
      (node.type === "pseudo" && node.value.toLowerCase() === PSEUDO_HAS) ||
      (selectorParser.isContainer(node) && holdsHas(node.nodes))
  );

/**
 * Whether one complex selector puts a `:has()` before a combinator: in any
 * compound but its last, or so inside a selector argument of its last
 * (`:is(.a:has(.b) *)`, `:not(.a:has(.b) .c)`).
 */
function outsideSubject(selector: Selector): boolean {
  const compounds: selectorParser.Node[][] = [[]];
  for (const node of selector.nodes) {
    if (node.type === "combinator") {
      compounds.push([]);
    } else {
      compounds.at(-1)?.push(node);
    }
  }
  const subject = compounds.pop() ?? [];
  if (compounds.some(holdsHas)) {
    return true;
  }
  return subject.some(
    (node) =>
      selectorParser.isPseudo(node) &&
      node.value.toLowerCase() !== PSEUDO_HAS &&
      node.nodes.some(outsideSubject)
  );
}

/** The selectors of a list that put a `:has()` outside their subject. */
const offending = (list: string): string[] => {
  if (!list.includes(":has(")) {
    return [];
  }
  const out: string[] = [];
  selectorParser((root) => {
    for (const selector of root.nodes) {
      if (outsideSubject(selector)) {
        out.push(selector.toString().trim());
      }
    }
  }).processSync(list);
  return out;
};

/* ------------------------------------------------------------ nesting */

/** A nested rule's selector as the browser reads it: `&` is `:is(parent)`, and no `&` is a descendant of it. */
const resolveNesting = (parent: string, child: string): string => {
  const wrap = `:is(${parent})`;
  return selectorParser((root) => {
    for (const selector of root.nodes) {
      let nested = false;
      selector.walkNesting((node) => {
        nested = true;
        node.replaceWith(selectorParser.string({ value: wrap }));
      });
      if (!nested) {
        selector.prepend(selectorParser.combinator({ value: " " }));
        selector.prepend(selectorParser.string({ value: wrap }));
      }
    }
  }).processSync(child);
};

/** The nearest rule a node is nested in, through any at-rules between. */
function ruleAround(node: postcss.Node["parent"]): Rule | undefined {
  if (node === undefined || node instanceof Rule) {
    return node;
  }
  return ruleAround(node.parent);
}

/** The selector a rule applies with, its nesting resolved. */
function fullSelector(rule: Rule): string {
  const parent = ruleAround(rule.parent);
  return parent
    ? resolveNesting(fullSelector(parent), rule.selector)
    : rule.selector;
}

interface Hit {
  file: string;
  line: number;
  selector: string;
}

/** Each rule in the CSS whose selector puts a `:has()` outside its subject, and each `@scope` that asks one. */
function scan(
  css: postcss.Root,
  at: (node: Rule | AtRule) => { file: string; line: number }
): Hit[] {
  const hits: Hit[] = [];
  css.walkRules((rule) => {
    if (rule.parent instanceof AtRule && rule.parent.name === "keyframes") {
      return;
    }
    for (const selector of offending(fullSelector(rule))) {
      hits.push({ ...at(rule), selector });
    }
  });
  css.walkAtRules("scope", (scope) => {
    if (scope.params.includes(":has(")) {
      hits.push({ ...at(scope), selector: `@scope ${scope.params}` });
    }
  });
  return hits;
}

/* ------------------------------------------------------------ the sheets */

const rel = (path: string): string => relative(ROOT, path);
const lineAt = (text: string, index: number): number =>
  text.slice(0, index).split("\n").length;

const NODE_MODULES = "/node_modules/";
/** Where a compiled rule was written: a house file and line, or one of two marks. */
const LIBRARY = "(a library's sheet)";
const UTILITY = "(a Tailwind utility)";
const originOf = (node: Rule | AtRule): { file: string; line: number } => {
  const start = node.source?.start;
  const origin = start
    ? node.source?.input.origin(start.line, start.column)
    : undefined;
  if (origin === false || !origin?.file) {
    return { file: UTILITY, line: 0 };
  }
  if (!origin.file.includes(NODE_MODULES)) {
    return { file: rel(origin.file), line: origin.line };
  }
  // Tailwind's own sheet stands for every utility it generates.
  return origin.file.includes(`${NODE_MODULES}tailwindcss/`)
    ? { file: UTILITY, line: 0 }
    : { file: LIBRARY, line: 0 };
};

const files = repoFiles(["src"], DASHBOARD);
const sheets = files.filter((f) => f.endsWith(".css"));
const entries = sheets.filter((f) =>
  ENTRY.test(readFileSync(join(DASHBOARD, f), "utf8"))
);

const hits: Hit[] = [];
const imported = new Set<string>();

for (const entry of entries) {
  const path = join(DASHBOARD, entry);
  const text = readFileSync(path, "utf8");
  const base = dirname(path);
  const deps = new Set<string>([path]);
  const compiler = await compile(text, {
    base,
    from: path,
    onDependency: (dep) => deps.add(dep),
  });
  const sources: Source[] = [
    ...(compiler.root === null
      ? [{ base, pattern: "**/*", negated: false }]
      : []),
    ...(compiler.root && compiler.root !== "none"
      ? [{ ...compiler.root, negated: false }]
      : []),
    ...compiler.sources,
  ];
  const scanner = new ScannerClass({ sources });
  const candidates = scanner.scan();
  const css = compiler.build(candidates);
  const map = toSourceMap(compiler.buildSourceMap());
  const root = postcss.parse(css, { from: path, map: { prev: map.raw } });
  for (const dep of deps) {
    imported.add(dep);
  }

  /** The candidates a utility's selector names: its classes outside any pseudo-class's argument (`:where(.group)` names none). */
  const known = new Set(candidates);
  const classesOf = (selector: string): string[] => {
    const out: string[] = [];
    selectorParser((r) => {
      r.walkClasses((node) => {
        if (node.parent?.parent?.type === "root" && known.has(node.value)) {
          out.push(node.value);
        }
      });
    }).processSync(selector);
    return out;
  };
  /** Where each candidate is written, read once per candidate asked. */
  const written = new Map<string, { file: string; line: number }[]>();
  const placesOf = (candidate: string): { file: string; line: number }[] => {
    const cached = written.get(candidate);
    if (cached) {
      return cached;
    }
    const places: { file: string; line: number }[] = [];
    for (const source of scanner.files) {
      const content = readFileSync(source, "utf8");
      if (!content.includes(candidate)) {
        continue;
      }
      for (const {
        candidate: c,
        position,
      } of scanner.getCandidatesWithPositions({
        content,
        extension: extname(source).slice(1),
      })) {
        if (c === candidate) {
          places.push({ file: rel(source), line: lineAt(content, position) });
        }
      }
    }
    written.set(candidate, places);
    return places;
  };

  for (const hit of scan(root, originOf)) {
    if (hit.file === LIBRARY) {
      continue;
    }
    if (hit.file !== UTILITY) {
      hits.push(hit);
      continue;
    }
    // A utility: named where its class is written.
    const places = classesOf(hit.selector).flatMap((c) => placesOf(c));
    if (places.length === 0) {
      hits.push({ ...hit, file: rel(path) });
    }
    for (const place of places) {
      hits.push({ ...place, selector: hit.selector });
    }
  }

  // Every custom variant the entry's sheets declare, on a probe utility.
  const design = await __unstable__loadDesignSystem(text, { base });
  for (const dep of deps) {
    if (!dep.endsWith(".css") || dep.includes(NODE_MODULES)) {
      continue;
    }
    const sheet = readFileSync(dep, "utf8");
    for (const match of sheet.matchAll(CUSTOM_VARIANT)) {
      const [, name] = match;
      const [out] = name ? design.candidatesToCss([`${name}:${PROBE}`]) : [];
      if (!out) {
        continue;
      }
      const line = lineAt(sheet, match.index);
      for (const hit of scan(postcss.parse(out), () => ({
        file: rel(dep),
        line,
      }))) {
        hits.push({
          ...hit,
          selector: `@custom-variant ${name}: ${hit.selector}`,
        });
      }
    }
  }
}

// A sheet no entry imports, compiled alone: the house's rules in it (a
// library's sheet it imports is the library's).
for (const sheet of sheets) {
  const path = join(DASHBOARD, sheet);
  if (imported.has(path)) {
    continue;
  }
  const compiler = await compile(readFileSync(path, "utf8"), {
    base: dirname(path),
    from: path,
    onDependency: () => undefined,
  });
  const map = toSourceMap(compiler.buildSourceMap());
  const root = postcss.parse(compiler.build([]), {
    from: path,
    map: { prev: map.raw },
  });
  hits.push(
    ...scan(root, originOf).filter(
      (hit) => hit.file !== LIBRARY && hit.file !== UTILITY
    )
  );
}

// The house's other stylesheets, across apps/ and packages/, read as written.
for (const sheet of repoFiles(["apps", "packages"], ROOT)) {
  if (!sheet.endsWith(".css") || sheet.startsWith("apps/dashboard/src/")) {
    continue;
  }
  const path = join(ROOT, sheet);
  hits.push(
    ...scan(
      postcss.parse(readFileSync(path, "utf8"), { from: path }),
      (node) => ({
        file: sheet,
        line: node.source?.start?.line ?? 0,
      })
    )
  );
}

// Each component's own `<style>`, as Svelte compiles it.
for (const file of files.filter((f) => f.endsWith(".svelte"))) {
  const source = readFileSync(join(DASHBOARD, file), "utf8");
  if (!STYLE.test(source)) {
    continue;
  }
  const { css } = compileSvelte(source, {
    filename: join(DASHBOARD, file),
    generate: "client",
    css: "external",
    dev: false,
    experimental: { async: true },
  });
  if (!css) {
    continue;
  }
  const styleAt = source.search(STYLE);
  hits.push(
    ...scan(postcss.parse(css.code), (node) => ({
      file: rel(join(DASHBOARD, file)),
      line: lineAt(source, styleAt) + (node.source?.start?.line ?? 1) - 1,
    }))
  );
}

const unique = [
  ...new Map(
    hits.map((h) => [`${h.file}:${h.line}: ${h.selector}`, h] as const)
  ).values(),
].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
if (unique.length > 0) {
  console.error(
    `has-subject: ${unique.length} rule(s) put a :has() outside their subject, where Blink's one shared :has() invalidation set restyles a whole subtree under every anchor:`
  );
  for (const h of unique) {
    console.error(`  ${h.file}:${h.line}: ${h.selector}`);
  }
  console.error(
    "Ask the :has() of the element it anchors on, and hand what its descendants need down from there: the anchor's own `:has()` sets a custom property they read, or the anchor carries an attribute they read (scripts/has-subject-check.ts)."
  );
  process.exit(1);
}
console.log(
  `has-subject: every :has() the house writes (the dashboard's ${entries.length} Tailwind entries with their utilities, its ${sheets.length} stylesheets, its components' styles, the other apps' and packages' stylesheets) stands in its rule's subject`
);
