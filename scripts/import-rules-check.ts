/**
 * `bun scripts/import-rules-check.ts` (part of `bun run check`): imports run
 * one way, read off every import of the tree (lib/import-graph.ts), value and
 * type alike.
 *
 * - **cycle**: an import from a file to another of its own import cycle.
 * - **kit-reaches-up**: the dashboard's kit (`lib/components/ui/`) imports no
 *   module that itself imports the kit, however far down.
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
};
type Rule = keyof typeof RULES;

const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const SCOPE = /^(?:apps|packages|scripts|site)\//u;
const SKIPPED = /\/fixtures\//u;
const KIT = "apps/dashboard/src/lib/components/ui/";

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

holdRatchet(found, {
  name: "import-rules",
  baseline: join(ROOT, "scripts/import-rules.baseline.tsv"),
  rules: RULES,
});
