/**
 * `bun scripts/import-rules-check.ts` (part of `bun run check`): imports run
 * one way, read off every import of the tree (lib/import-graph.ts), value and
 * type alike.
 *
 * - **cycle**: an import from a file to another of its own import cycle. A
 *   package free of cycles stays free; elsewhere each file's count is
 *   ratcheted (lib/ratchet.ts) from the measured value.
 * - **core-reaches-out**: `@cawco/core` imports no other package: it is what
 *   every other one stands on.
 * - **kit-reaches-up**: the dashboard's kit (`lib/components/ui/`) imports
 *   nothing above it: no feature component (`lib/components/features/`), no
 *   route, and no module that itself imports the kit.
 * - **reaches-in**: a workspace member imports another's file only through
 *   that member's manifest (`@cawco/<name>/…` as its `exports` or `main`
 *   name it), never by a path into its folder. The repository's own folders
 *   (`scripts/`, `assets/`, `design/`) are no member's: its checks and probes
 *   read the members' sources by design, and a member reading a shared asset
 *   has no manifest to go through.
 *
 * Every rule counts imports against scripts/import-rules.baseline.tsv
 * (lib/ratchet.ts): a count falls or moves with its file, and never rises. Biome's noImportCycles reads no `.svelte` file, and
 * dependency-cruiser loses a component's type imports, so the graph is read
 * here with TypeScript's parser.
 *
 *   bun scripts/import-rules-check.ts                   exits 1 on a rise
 *   bun scripts/import-rules-check.ts --write-baseline  starts a rule the baseline does not hold
 */
import { join } from "node:path";
import { cycles, type Import, importGraph } from "./lib/import-graph";
import { type Found, holdRatchet } from "./lib/ratchet";
import { ROOT, repoFiles } from "./lib/repo-files";
import { packageOf, packages, throughExports } from "./lib/workspace-imports";

const RULES = {
  cycle:
    "no import cycle, value or type: move what both files need below them both",
  "core-reaches-out":
    "@cawco/core imports no other package; what it needs moves into core",
  "kit-reaches-up":
    "lib/components/ui imports no feature component (lib/components/features), no route, and no module that imports the kit; pass it in as a prop or a snippet",
  "reaches-in":
    "a member imports another member's file through that member's manifest (@cawco/<name>/…), never by a path into its folder",
};
type Rule = keyof typeof RULES;

/** Packages with no import cycle today: none may start one, and the baseline may hold none for them. */
const FREE_OF_CYCLES = [
  "@cawco/auth",
  "@cawco/cawrier",
  "@cawco/cli",
  "@cawco/core",
  "@cawco/design-tokens",
  "@cawco/icons",
  "@cawco/jsonl-parser",
  "@cawco/sessiond",
  "cawco-site",
];
/**
 * Imports these rules allow, each with why it stays: `file → specifier`.
 */
const ALLOWED: Record<string, string> = {
  // jsonl-parser is a published leaf that imports no workspace package, and
  // the transcript index's author words are its own: core's wire type is an
  // Extract of them (find.ts), so the two cannot drift.
  "packages/core/src/find.ts → @cawco/jsonl-parser": "core-reaches-out",
  // The board's empty states as their callers draw them, for their states
  // files: the setup look draws the real SetupScene with Caw's resting lead.
  // The frame leaves the kit for lib/cawco with EmptyStarts, where these
  // imports are a feature's own.
  "apps/dashboard/src/lib/components/ui/empty/EmptyOnAxis.svelte → #lib/cawco/project/caw-lead.fixture.js":
    "kit-reaches-up",
  "apps/dashboard/src/lib/components/ui/empty/EmptyOnAxis.svelte → #lib/cawco/project/SetupScene.svelte":
    "kit-reaches-up",
};

const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const SCOPE = /^(?:apps|packages|scripts|site)\//u;
const SKIPPED = /\/fixtures\//u;
const CORE = packages.get("@cawco/core")?.dir as string;
const KIT = "apps/dashboard/src/lib/components/ui/";
const ABOVE_KIT =
  /^apps\/dashboard\/src\/(?:routes\/|lib\/components\/features\/)/u;
const ROOT_PACKAGE = packages.get("cawco")?.name;

const present = repoFiles();
const files = present.filter(
  (file) => CODE.test(file) && SCOPE.test(file) && !SKIPPED.test(file)
);
const graph = importGraph(files, new Set(present));

const found: Found[] = [];
const count = (rule: Rule, file: string, edge: Import, shape = ""): void => {
  if (ALLOWED[`${file} → ${edge.specifier}`] !== rule) {
    found.push({ rule, file, line: edge.line, shape });
  }
};

/* cycle */
const cycleOf = new Map<string, number>();
for (const [at, component] of cycles(graph).entries()) {
  for (const file of component) {
    cycleOf.set(file, at);
  }
}
for (const [file, edges] of graph) {
  const at = cycleOf.get(file);
  for (const edge of edges) {
    if (
      at !== undefined &&
      edge.file !== file &&
      cycleOf.get(edge.file ?? "") === at
    ) {
      // The package's own name: a move inside it is the same cycle, and a
      // file carrying a cycle into another package is a new one there.
      count("cycle", file, edge, packageOf(file).name);
    }
  }
}

/* kit-reaches-up: the modules outside the kit that reach it, however far down. */
const reachesKit = new Map<string, boolean>();
const reaches = (file: string): boolean => {
  const known = reachesKit.get(file);
  if (known !== undefined) {
    return known;
  }
  // A cycle back to a file being read adds nothing it does not already add.
  reachesKit.set(file, false);
  const answer = (graph.get(file) ?? []).some(
    (edge) =>
      edge.file !== undefined &&
      (edge.file.startsWith(KIT) || reaches(edge.file))
  );
  reachesKit.set(file, answer);
  return answer;
};

for (const [file, edges] of graph) {
  const from = packageOf(file);
  for (const edge of edges) {
    if (edge.file === undefined) {
      continue;
    }
    const to = packageOf(edge.file);
    if (from.dir === CORE && to.dir !== CORE) {
      count("core-reaches-out", file, edge);
    }
    if (
      file.startsWith(KIT) &&
      !edge.file.startsWith(KIT) &&
      (ABOVE_KIT.test(edge.file) || reaches(edge.file))
    ) {
      count("kit-reaches-up", file, edge);
    }
    if (
      from.name !== to.name &&
      from.name !== ROOT_PACKAGE &&
      to.name !== ROOT_PACKAGE &&
      !throughExports(to, edge.specifier)
    ) {
      count("reaches-in", file, edge);
    }
  }
}

const freeDirs = FREE_OF_CYCLES.map((name) => packages.get(name)?.dir);
const startedCycle = found.filter(
  (one) => one.rule === "cycle" && freeDirs.includes(packageOf(one.file).dir)
);

holdRatchet(found, {
  name: "import-rules",
  baseline: join(ROOT, "scripts/import-rules.baseline.tsv"),
  rules: RULES,
});
if (startedCycle.length > 0) {
  process.stdout.write(
    `import-rules: a package that had no import cycle has one (${FREE_OF_CYCLES.join(", ")} stay free):\n${startedCycle
      .map((one) => `  ${one.file}:${one.line}`)
      .join("\n")}\n`
  );
  process.exitCode = 1;
}
