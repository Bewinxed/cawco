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
 * Every rule counts each file's imports against scripts/import-rules.baseline.json,
 * which only goes down. Biome's noImportCycles reads no `.svelte` file, and
 * dependency-cruiser loses a component's type imports, so the graph is read
 * here with TypeScript's parser.
 *
 *   bun scripts/import-rules-check.ts                   exits 1 on a rise or a fall
 *   bun scripts/import-rules-check.ts --write-baseline  after a fix lowers a count
 */
import { join } from "node:path";
import { cycles, type Import, importGraph } from "./lib/import-graph";
import { holdRatchet } from "./lib/ratchet";
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

const counts: Record<Rule, Record<string, number>> = {
  cycle: {},
  "core-reaches-out": {},
  "kit-reaches-up": {},
  "reaches-in": {},
};
const places = new Map<string, string[]>();
const count = (rule: Rule, file: string, edge: Import): void => {
  if (ALLOWED[`${file} → ${edge.specifier}`] === rule) {
    return;
  }
  counts[rule][file] = (counts[rule][file] ?? 0) + 1;
  const key = `${rule}\0${file}`;
  places.set(key, [
    ...(places.get(key) ?? []),
    `${file}:${edge.line} ${edge.specifier}`,
  ]);
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
      count("cycle", file, edge);
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
const startedCycle = Object.keys(counts.cycle).filter((file) =>
  freeDirs.includes(packageOf(file).dir)
);

holdRatchet(counts, {
  name: "import-rules",
  baseline: join(ROOT, "scripts/import-rules.baseline.json"),
  rules: RULES,
  places: (rule, file) => places.get(`${rule}\0${file}`) ?? [],
});
if (startedCycle.length > 0) {
  process.stdout.write(
    `import-rules: a package that had no import cycle has one (${FREE_OF_CYCLES.join(", ")} stay free):\n${startedCycle
      .flatMap((file) => places.get(`cycle\0${file}`) ?? [])
      .map((place) => `  ${place}`)
      .join("\n")}\n`
  );
  process.exitCode = 1;
}
