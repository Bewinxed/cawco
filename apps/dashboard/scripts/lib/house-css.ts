/**
 * The CSS the house ships, as the build makes it, for the checks that read
 * rules (has-subject-check.ts, root-flip-check.ts):
 *  - each stylesheet that imports `tailwindcss` (an entry), compiled by the
 *    dashboard's Tailwind with every candidate its scanner finds in the
 *    entry's sources, the scan `@tailwindcss/vite` runs: so every utility
 *    under any variant (`group-has-*:`, `in-[…]:`, an arbitrary `[&…]:`, a
 *    house `@custom-variant`) is read as it compiles. A house rule is placed
 *    by the source map at its file and line; a utility at the places its
 *    class is written;
 *  - each `.css` under src/ no entry imports, compiled alone;
 *  - each `.svelte` file's `<style>`, compiled as the build compiles it;
 *  - every other `.css` the house keeps under apps/ and packages/.
 * A library's own sheet (anything from node_modules a house sheet imports,
 * Milkdown Crepe's toolbar.css among them) is the library's, used as
 * published: its rules have no place, and a check passes over them (the
 * owner's call on 2026-11-19).
 *
 * It reads apps/dashboard/ and the installed Tailwind (its scanner by path)
 * beyond its imports: a check that uses it declares both in its own
 * `checkReads`, which check.ts keys it on.
 */
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { compile, toSourceMap } from "@tailwindcss/node";
import postcss, { type AtRule, Rule } from "postcss";
import selectorParser from "postcss-selector-parser";
import { compile as compileSvelte } from "svelte/compiler";
import { repoFiles } from "../../../../scripts/lib/repo-files";

const DASHBOARD = join(import.meta.dir, "../..");
const ROOT = join(DASHBOARD, "../..");
/** A stylesheet that is a Tailwind entry: it imports Tailwind itself. */
const ENTRY = /@import\s+["']tailwindcss["']/u;
const STYLE = /<style\b/u;
const NODE_MODULES = "/node_modules/";

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

/** Where a rule was written. */
export interface Place {
  file: string;
  line: number;
}

/** One sheet as the build ships it. */
interface HouseSheet {
  /**
   * Where a rule (or at-rule) of it was written: its house file and line,
   * every place a utility's class is written (the entry, line 0, when none
   * is found), or none for a library's own rule. `selector` is the rule's
   * selector, which names a utility's classes.
   */
  places: (node: Rule | AtRule, selector: string) => Place[];
  root: postcss.Root;
}

/** A Tailwind entry, for a check that compiles more against it (has-subject's custom variants). */
interface TailwindEntry {
  base: string;
  /** The sheets it imports, itself included. */
  deps: Set<string>;
  path: string;
  text: string;
}

export interface HouseCss {
  entries: TailwindEntry[];
  sheets: HouseSheet[];
  /** How many stylesheets the dashboard keeps under src/. */
  srcSheets: number;
}

export const rel = (path: string): string => relative(ROOT, path);
export const lineAt = (text: string, index: number): number =>
  text.slice(0, index).split("\n").length;

/** A complex selector's compounds, in order, without the combinators between them. */
export function compoundsOf(
  selector: selectorParser.Selector
): selectorParser.Node[][] {
  const compounds: selectorParser.Node[][] = [[]];
  for (const node of selector.nodes) {
    if (node.type === "combinator") {
      compounds.push([]);
    } else {
      compounds.at(-1)?.push(node);
    }
  }
  return compounds;
}

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
export function fullSelector(rule: Rule): string {
  const parent = ruleAround(rule.parent);
  return parent
    ? resolveNesting(fullSelector(parent), rule.selector)
    : rule.selector;
}

/* ------------------------------------------------------------ places */

/** Where a compiled rule was written: a house file and line, or one of two marks. */
const LIBRARY = "(a library's sheet)";
const UTILITY = "(a Tailwind utility)";
const originOf = (node: Rule | AtRule): Place => {
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

/** A house rule's place, or none for a library's (a sheet compiled alone or read as written). */
const houseOnly =
  (at: (node: Rule | AtRule) => Place) =>
  (node: Rule | AtRule): Place[] => {
    const place = at(node);
    return place.file === LIBRARY || place.file === UTILITY ? [] : [place];
  };

/* ------------------------------------------------------------ the sheets */

/** Every sheet the house ships, compiled as the build compiles it. */
export async function readHouseCss(): Promise<HouseCss> {
  const files = repoFiles(["src"], DASHBOARD);
  const srcSheets = files.filter((f) => f.endsWith(".css"));
  const entryFiles = srcSheets.filter((f) =>
    ENTRY.test(readFileSync(join(DASHBOARD, f), "utf8"))
  );
  const sheets: HouseSheet[] = [];
  const entries: TailwindEntry[] = [];
  const imported = new Set<string>();

  for (const entry of entryFiles) {
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
    entries.push({ base, deps, path, text });

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
    const written = new Map<string, Place[]>();
    const placesOf = (candidate: string): Place[] => {
      const cached = written.get(candidate);
      if (cached) {
        return cached;
      }
      const places: Place[] = [];
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

    sheets.push({
      root,
      places: (node, selector) => {
        const origin = originOf(node);
        if (origin.file === LIBRARY) {
          return [];
        }
        if (origin.file !== UTILITY) {
          return [origin];
        }
        // A utility: placed where its class is written.
        const places = classesOf(selector).flatMap((c) => placesOf(c));
        return places.length > 0 ? places : [{ file: rel(path), line: 0 }];
      },
    });
  }

  // A sheet no entry imports, compiled alone: the house's rules in it (a
  // library's sheet it imports is the library's).
  for (const sheet of srcSheets) {
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
    sheets.push({
      root: postcss.parse(compiler.build([]), {
        from: path,
        map: { prev: map.raw },
      }),
      places: houseOnly(originOf),
    });
  }

  // The house's other stylesheets, across apps/ and packages/, read as written.
  for (const sheet of repoFiles(["apps", "packages"], ROOT)) {
    if (!sheet.endsWith(".css") || sheet.startsWith("apps/dashboard/src/")) {
      continue;
    }
    const path = join(ROOT, sheet);
    sheets.push({
      root: postcss.parse(readFileSync(path, "utf8"), { from: path }),
      places: (node) => [{ file: sheet, line: node.source?.start?.line ?? 0 }],
    });
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
    sheets.push({
      root: postcss.parse(css.code),
      places: (node) => [
        {
          file: rel(join(DASHBOARD, file)),
          line: lineAt(source, styleAt) + (node.source?.start?.line ?? 1) - 1,
        },
      ],
    });
  }

  return { entries, sheets, srcSheets: srcSheets.length };
}
