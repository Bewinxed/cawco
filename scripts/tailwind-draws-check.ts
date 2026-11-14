/**
 * `bun scripts/tailwind-draws-check.ts` (part of `bun run check`): every
 * Tailwind class the dashboard writes draws something.
 *
 * The house theme (apps/dashboard/src/lib/tokens/theme.css) opens with
 * `--*: initial`: every namespace of Tailwind's default theme is replaced by
 * the house's own tokens, so a default class whose token the house never
 * declared (`rounded-4xl`, `shadow-xl`, `text-7xl`, `bg-red-500`) compiles to
 * nothing and passes silently: the box keeps its square corners.
 *
 * The verdict is Tailwind's own, nothing hand-kept:
 *  - the candidates are what Tailwind's scanner (@tailwindcss/oxide) reads
 *    from the sources of each stylesheet in the dashboard that imports
 *    `tailwindcss`, the same scan the Vite build runs;
 *  - a candidate is refused when stock Tailwind (`@import "tailwindcss"`,
 *    its default theme) writes CSS for it and the dashboard's design system,
 *    loaded from that stylesheet, writes none.
 * A word Tailwind would not draw under any theme (`text-to-speech` in
 * prose) is none of this check's. Neither is a bare root standing alone
 * (`blur`, `shadow`, `rounded`), which prose and code say as words; at a
 * class site the design lint's no-unknown-classes refuses it, as it refuses
 * a misspelled class. A word that reads as a candidate to the scanner and
 * is provably not a class in its file is an entry of {@link NOT_CLASSES},
 * by file and word: never a stylesheet's `@source not inline("…")`, which
 * would pass the same word written as a class in every other file.
 *
 * Prints `file:line: class` with the token it reads and the tokens of that
 * namespace the house has; exits 1 on any.
 */
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { repoFiles } from "./lib/repo-files";

/** The dashboard's classes and its stylesheets, read whole (lib/check-inputs.ts), and the installed Tailwind that judges them, loaded by path. */
export const checkReads = [
  "apps/dashboard/",
  "design/",
  "DESIGN.md",
  "node_modules/",
];

const ROOT = join(import.meta.dir, "..");
const DASHBOARD = join(ROOT, "apps/dashboard");
const TOKENS = "apps/dashboard/src/lib/tokens/theme.css";
/** A stylesheet that is a Tailwind entry: it imports Tailwind itself. */
const ENTRY = /@import\s+["']tailwindcss["']/u;
const STYLESHEET = /^apps\/dashboard\/src\/.*\.css$/u;
const THEME_VAR = /var\((--[\w-]+)/gu;

/**
 * A word in one file that the scanner reads as a candidate and that is
 * provably not a class there, by file and word (not line, so an edit above
 * it keeps it). The same word as a class in any other file still fails.
 */
interface NotAClass {
  file: string;
  /** What the word is in that file instead. */
  why: string;
  word: string;
}
const NOT_CLASSES: NotAClass[] = [
  {
    file: "apps/dashboard/src/lib/cawco/graph/motion.ts",
    word: "ease-in",
    why: "a key of KEYWORDS, CSS's easing keywords as their four numbers",
  },
];
const notAClass = (file: string, word: string): boolean =>
  NOT_CLASSES.some((n) => n.file === file && n.word === word);

interface Parsed {
  kind: string;
  modifier: unknown;
  value: unknown;
  variants: unknown[];
}
interface AstNode {
  kind: string;
  nodes?: AstNode[];
  property?: string;
  value?: string;
}
interface DesignSystem {
  candidatesToAst: (candidates: string[]) => AstNode[][];
  compileAstNodes: (candidate: Parsed) => unknown[];
  invalidCandidates: Set<string>;
  parseCandidate: (candidate: string) => Parsed[];
  theme: {
    namespace: (name: string) => Map<string | null, string>;
    values: Map<string, unknown>;
  };
}
interface Source {
  base: string;
  negated: boolean;
  pattern: string;
}
interface TailwindNode {
  __unstable__loadDesignSystem: (
    css: string,
    options: { base: string }
  ) => Promise<DesignSystem>;
  compile: (
    css: string,
    options: { base: string; onDependency: (path: string) => void }
  ) => Promise<{
    root: null | "none" | { base: string; pattern: string };
    sources: Source[];
  }>;
}
interface Scanner {
  files: string[];
  getCandidatesWithPositions: (input: {
    content: string;
    extension: string;
  }) => { candidate: string; position: number }[];
  scan: () => string[];
}

// @tailwindcss/node and its scanner are @tailwindcss/vite's dependencies:
// the versions the dashboard's build runs, resolved from there.
const fromVite = createRequire(
  realpathSync(join(DASHBOARD, "node_modules/@tailwindcss/vite/package.json"))
);
const load = async <T>(name: string): Promise<T> =>
  (await import(pathToFileURL(fromVite.resolve(name)).href)) as T;
const tailwind = await load<TailwindNode>("@tailwindcss/node");
const { Scanner: ScannerClass } = await load<{
  Scanner: new (options: { sources: Source[] }) => Scanner;
}>("@tailwindcss/oxide");

/** Whether a design system writes CSS for the candidate. */
const draws = (ds: DesignSystem, candidate: string): boolean =>
  !ds.invalidCandidates.has(candidate) &&
  ds.parseCandidate(candidate).some((p) => ds.compileAstNodes(p).length > 0);

/** A functional utility with no value, variant or modifier: `blur`, `shadow`. */
const bareRoot = (ds: DesignSystem, candidate: string): boolean =>
  ds
    .parseCandidate(candidate)
    .every(
      (p) =>
        p.kind === "functional" &&
        p.value === null &&
        p.modifier === null &&
        p.variants.length === 0
    );

/** The theme variables the candidate's CSS reads, under stock Tailwind. */
const themeVars = (ds: DesignSystem, candidate: string): string[] => {
  const out = new Set<string>();
  const visit = (nodes: AstNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      for (const [, name] of (node.value ?? "").matchAll(THEME_VAR)) {
        if (ds.theme.values.has(name as string)) {
          out.add(name as string);
        }
      }
      visit(node.nodes);
    }
  };
  visit(ds.candidatesToAst([candidate])[0]);
  return [...out];
};

/** Where the house keeps a variable's siblings: `--radius-4xl` in `--radius`. */
const namespaceOf = (house: DesignSystem, name: string): string | undefined => {
  const parts = name.split("-");
  for (let end = parts.length - 1; end > 2; end -= 1) {
    const prefix = parts.slice(0, end).join("-");
    if (house.theme.namespace(prefix).size > 0) {
      return prefix;
    }
  }
};

const stock = await tailwind.__unstable__loadDesignSystem(
  '@import "tailwindcss";',
  { base: DASHBOARD }
);

interface Finding {
  candidate: string;
  file: string;
  hint: string;
  line: number;
}
const refused = new Map<string, Finding[]>();
const entries = repoFiles().filter(
  (path) =>
    STYLESHEET.test(path) && ENTRY.test(readFileSync(join(ROOT, path), "utf8"))
);
for (const entry of entries) {
  const file = join(ROOT, entry);
  const css = readFileSync(file, "utf8");
  const base = dirname(file);
  const compiler = await tailwind.compile(css, {
    base,
    onDependency: () => undefined,
  });
  const house = await tailwind.__unstable__loadDesignSystem(css, { base });
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
  const blank = scanner
    .scan()
    .filter(
      (c) =>
        !refused.has(c) &&
        draws(stock, c) &&
        !draws(house, c) &&
        !house.invalidCandidates.has(c) &&
        !bareRoot(stock, c)
    );
  if (blank.length === 0) {
    continue;
  }
  const wanted = new Set(blank);
  for (const source of scanner.files) {
    const content = readFileSync(source, "utf8");
    if (!blank.some((c) => content.includes(c))) {
      continue;
    }
    for (const { candidate, position } of scanner.getCandidatesWithPositions({
      content,
      extension: extname(source).slice(1),
    })) {
      if (
        !wanted.has(candidate) ||
        notAClass(relative(ROOT, source), candidate)
      ) {
        continue;
      }
      const line = content.slice(0, position).split("\n").length;
      const vars = themeVars(stock, candidate);
      const missing = vars.filter((v) => !house.theme.values.has(v));
      const kin = missing
        .map((v) => namespaceOf(house, v))
        .filter((n): n is string => Boolean(n))
        .map(
          (n) =>
            `${n}-*: ${[...house.theme.namespace(n).keys()].filter(Boolean).join(", ")}`
        );
      const hint = [
        missing.length > 0
          ? `reads ${missing.join(", ")}, which the house theme does not declare`
          : "",
        kin.length > 0 ? `the house has ${kin.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      const list = refused.get(candidate) ?? [];
      list.push({
        candidate,
        file: relative(ROOT, source),
        hint,
        line,
      });
      refused.set(candidate, list);
    }
  }
}

const findings = [...refused.values()].flat();
if (findings.length > 0) {
  console.error(
    `tailwind-draws: ${findings.length} class(es) Tailwind's default theme draws and the house theme draws nothing for (its \`--*: initial\` drops every default token):`
  );
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  for (const f of findings) {
    console.error(
      `  ${f.file}:${f.line}: ${f.candidate}${f.hint ? ` (${f.hint})` : ""}`
    );
  }
  console.error(
    `Use a class whose token exists in ${TOKENS}, or add the token there first. A word that is not a class in its file: an entry in NOT_CLASSES (scripts/tailwind-draws-check.ts) naming the file, the word and what it is there.`
  );
  process.exit(1);
}
console.log(
  `tailwind-draws: every class the dashboard's ${entries.length} Tailwind entries scan draws CSS`
);
