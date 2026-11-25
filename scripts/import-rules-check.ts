/**
 * `bun scripts/import-rules-check.ts` (part of `bun run check`): imports run
 * one way, read off every import of the tree (lib/import-graph.ts), value and
 * type alike.
 *
 * - **cycle**: an import from a file to another of its own import cycle.
 * - **kit-reaches-up**: the dashboard's kit (`lib/components/ui/`) imports no
 *   module that itself imports the kit, however far down.
 * - **control-loop-scans**: no module of the hub's control loop (packages/hub/src
 *   outside `views/` and `preview-server/`) loads a scanning reader: the
 *   views thread's engine, index, catalogs, stored list and readers
 *   (`views/` but its door, `client.ts`, and the shapes both sides share,
 *   `wire.ts`, `changes.ts` and `pages.ts`). What scans runs on the views thread, on a
 *   connection of its own; the control loop asks it by message (tsk-397). A
 *   type import loads nothing and is not counted.
 * - **preview-reaches-hub**: the preview server (`preview-server/`, a
 *   process of its own, tsk-396) loads no module that holds the hub's state
 *   (its server, board, registry, lifetime and admission, its contexts and
 *   pending asks, its read-write database), however far down: it reads the
 *   hub's database read-only and hears the hub on its control link alone.
 *
 * A package in {@link ACYCLIC} holds no cycle at all: one there fails the
 * check whatever the baseline holds, and `--write-baseline` cannot record it.
 *
 * What a specifier alone can say (core imports no other package, the kit
 * imports no feature or route, a member reaches another through its
 * manifest) is Biome's noRestrictedImports, in biome.jsonc. These two need
 * the graph, and count against scripts/import-rules.baseline.tsv
 * (lib/ratchet.ts): a count falls or moves with its file, and never rises.
 * Biome's noImportCycles reads no `.svelte` file, and dependency-cruiser
 * loses a component's type imports, so the graph is read here with
 * TypeScript's parser.
 *
 *   bun scripts/import-rules-check.ts                   exits 1 on a rise
 *   bun scripts/import-rules-check.ts --write-baseline  starts a rule the baseline does not hold
 */
import { join } from "node:path";
import { cycles, type Import, importGraph } from "./lib/import-graph";
import { type Found, holdRatchet } from "./lib/ratchet";
import { ROOT, repoFiles } from "./lib/repo-files";
import { packageOf } from "./lib/workspace-imports";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/", "packages/", "scripts/", "site/"];

const RULES = {
  cycle:
    "no import cycle, value or type: move what both files need below them both",
  "kit-reaches-up":
    "lib/components/ui imports no module that imports the kit; pass what it needs in as a prop or a snippet",
  "control-loop-scans":
    "the hub's control loop loads no scanning reader of the views thread: ask it through views/client.ts, and share shapes through views/wire.ts",
  "preview-reaches-hub":
    "the preview server loads nothing that holds the hub's state: read the database read-only, and hear the hub on the control link",
};
type Rule = keyof typeof RULES;

/** The packages whose import cycles were all cut: a new one there fails outright, never counted against the baseline. */
const ACYCLIC: ReadonlySet<string> = new Set([
  "@cawco/agent",
  "@cawco/auth",
  "@cawco/cawrier",
  "@cawco/cli",
  "@cawco/core",
  "@cawco/dashboard",
  "@cawco/design-tokens",
  "@cawco/hub",
  "@cawco/icons",
  "@cawco/jsonl-parser",
  "@cawco/preview",
  "@cawco/providers",
  "@cawco/sessiond",
  "cawco",
  "cawco-site",
]);

const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const SCOPE = /^(?:apps|packages|scripts|site)\//u;
const SKIPPED = /\/fixtures\//u;
const KIT = "apps/dashboard/src/lib/components/ui/";
const HUB = "packages/hub/src/";
const VIEWS = `${HUB}views/`;
const PREVIEW_SERVER = `${HUB}preview-server/`;
/** The views thread's modules the control loop may load: its door and the shapes both sides share. */
const VIEWS_DOOR: ReadonlySet<string> = new Set(
  ["client.ts", "wire.ts", "changes.ts", "pages.ts"].map(
    (file) => `${VIEWS}${file}`
  )
);
/** The modules that hold the hub's own state ({@link RULES} `preview-reaches-hub`). */
const HUB_STATE: ReadonlySet<string> = new Set(
  [
    "server.ts",
    "board.ts",
    "registry.ts",
    "lifetime.ts",
    "scheduler.ts",
    "hub-context.ts",
    "closure-context.ts",
    "pending.ts",
    "db/index.ts",
  ].map((file) => `${HUB}${file}`)
);

const present = repoFiles();
const files = present.filter(
  (file) => CODE.test(file) && SCOPE.test(file) && !SKIPPED.test(file)
);
const graph = importGraph(files, new Set(present));

const found: Found[] = [];
const count = (rule: Rule, file: string, edge: Import, shape = ""): void => {
  found.push({ rule, file, line: edge.line, shape });
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
const importers = new Map<string, string[]>();
for (const [file, edges] of graph) {
  for (const { file: to } of edges) {
    if (to) {
      importers.set(to, [...(importers.get(to) ?? []), file]);
    }
  }
}
/** Every file that reaches the kit, walked back from it, so a cycle cannot change an answer. */
const reachesKit = new Set<string>();
const walking = [...graph.keys()].filter((file) => file.startsWith(KIT));
for (let file = walking.pop(); file !== undefined; file = walking.pop()) {
  for (const importer of importers.get(file) ?? []) {
    if (!reachesKit.has(importer)) {
      reachesKit.add(importer);
      walking.push(importer);
    }
  }
}

for (const [file, edges] of graph) {
  if (!file.startsWith(KIT)) {
    continue;
  }
  for (const edge of edges) {
    if (edge.file && !edge.file.startsWith(KIT) && reachesKit.has(edge.file)) {
      count("kit-reaches-up", file, edge);
    }
  }
}

/* control-loop-scans: a value import from the control loop into the views thread's own. */
for (const [file, edges] of graph) {
  if (
    !file.startsWith(HUB) ||
    file.startsWith(VIEWS) ||
    file.startsWith(PREVIEW_SERVER)
  ) {
    continue;
  }
  for (const edge of edges) {
    if (
      !edge.typeOnly &&
      edge.file?.startsWith(VIEWS) &&
      !VIEWS_DOOR.has(edge.file)
    ) {
      count("control-loop-scans", file, edge, edge.file);
    }
  }
}

/* preview-reaches-hub: what the preview server loads, however far down, reaching the hub's state. */
const loading = [...graph.keys()].filter((file) =>
  file.startsWith(PREVIEW_SERVER)
);
const loaded = new Set<string>(loading);
for (let file = loading.pop(); file !== undefined; file = loading.pop()) {
  for (const edge of graph.get(file) ?? []) {
    if (edge.typeOnly || !edge.file) {
      continue;
    }
    if (HUB_STATE.has(edge.file)) {
      count("preview-reaches-hub", file, edge, edge.file);
      continue;
    }
    if (!loaded.has(edge.file)) {
      loaded.add(edge.file);
      loading.push(edge.file);
    }
  }
}

/*
 * A cycle in an ACYCLIC package, and any import across the hub's thread
 * boundaries, fails here, and never reaches the ratchet or its baseline.
 */
const BOUNDARIES: ReadonlySet<string> = new Set([
  "control-loop-scans",
  "preview-reaches-hub",
]);
const outright = found.filter(
  (one) =>
    (one.rule === "cycle" && ACYCLIC.has(one.shape)) || BOUNDARIES.has(one.rule)
);
if (outright.length > 0) {
  process.stdout.write(
    [
      `import-rules: ${outright.length} import(s) break a rule that holds outright`,
      ...outright.map(
        (one) =>
          `  ${one.file}:${one.line} (${one.rule}: ${new Map<string, string>(Object.entries(RULES)).get(one.rule)})`
      ),
      "",
    ].join("\n")
  );
  process.exitCode = 1;
}

holdRatchet(
  found.filter((one) => !outright.includes(one)),
  {
    name: "import-rules",
    baseline: join(ROOT, "scripts/import-rules.baseline.tsv"),
    rules: RULES,
  }
);
