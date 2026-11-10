/**
 * `bun scripts/page-imports-check.ts` (part of `bun run check`): a page
 * loads only what it needs. The artifact page (`/artifact/<id>`, an
 * artifact opened in a tab of its own) never reaches the conversation's
 * code: nothing under `src/lib/cawco/transcript/`, and no Composer.
 *
 * The graph is the page's static imports from source (lib/import-graph.ts),
 * from what the page loads: its own route files, the root layout and the
 * client hooks. A type-only import is erased and not followed; a dynamic
 * `import()` loads on demand and is not followed. No build: the merge checks
 * run none, and the static graph holds everything a build's chunk for the
 * page can hold (a bundler only drops from it), so a path it finds is one to
 * cut.
 *
 * Prints each forbidden file the page reaches with the chain that reaches
 * it; exits 1 on any.
 */

import { importGraph } from "./lib/import-graph";
import { repoFiles } from "./lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/dashboard/src/"];

const SRC = "apps/dashboard/src/";
const CODE = /\.(?:svelte|ts|js|mjs)$/u;

/** Each page held to the rule: what it loads first, and what it must never reach. */
const PAGES: {
  entries: string[];
  forbidden: (file: string) => boolean;
  name: string;
}[] = [
  {
    name: "the artifact page (/artifact/<id>)",
    entries: [
      "routes/artifact/[id]/+page.svelte",
      "routes/artifact/[id]/+page.ts",
      "routes/+layout.svelte",
      "routes/+layout.ts",
      "hooks.client.ts",
    ],
    forbidden: (file) =>
      file.startsWith("lib/cawco/transcript/") ||
      file.endsWith("/Composer.svelte"),
  },
];

const present = repoFiles();
const graph = importGraph(
  present.filter((file) => file.startsWith(SRC) && CODE.test(file)),
  new Set(present)
);

/** What a file loads when it loads: its static value imports inside the dashboard. */
const loaded = (file: string): string[] =>
  (graph.get(file) ?? []).flatMap((edge) =>
    edge.file && graph.has(edge.file) && !edge.typeOnly && !edge.dynamic
      ? edge.file
      : []
  );

let failing = 0;
for (const page of PAGES) {
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const entry of page.entries) {
    const file = `${SRC}${entry}`;
    if (graph.has(file)) {
      parent.set(file, null);
      queue.push(file);
    }
  }
  const reached: string[] = [];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (page.forbidden(file.slice(SRC.length))) {
      reached.push(file);
      continue;
    }
    for (const next of loaded(file)) {
      if (!parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  for (const file of reached) {
    failing += 1;
    const chain: string[] = [];
    for (let at: string | null | undefined = file; at; at = parent.get(at)) {
      chain.unshift(at.slice(SRC.length));
    }
    console.log(
      `${page.name} reaches ${file.slice(SRC.length)}:\n  ${chain.join("\n  → ")}`
    );
  }
  console.log(
    reached.length === 0
      ? `${page.name}: ${parent.size} modules, none of the conversation's`
      : `${page.name}: ${parent.size} modules, ${reached.length} of the conversation's`
  );
}
process.exit(failing === 0 ? 0 : 1);
