/**
 * bun scripts/browser-core-check.ts
 *
 * The dashboard's browser code loads no core module that reaches a Node or
 * Bun builtin: Vite externalises `node:*` for the browser and the first
 * property read on it throws, taking the whole page down. Each value import
 * of `@cawco/core/*` in the dashboard (its server files apart) is followed
 * through core's own value imports, and one that reaches a builtin is refused
 * with the path that got there. A type-only import loads nothing.
 */

import { importGraph } from "./lib/import-graph";
import { repoFiles } from "./lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/dashboard/src/", "packages/core/src/"];

const DASHBOARD = "apps/dashboard/src/";
const CORE = "packages/core/src/";
const CORE_PREFIX = "@cawco/core/";
const CODE = /\.(?:ts|svelte)$/u;
const BUILTIN = /^(?:node:|bun:|bun$)/u;
const SERVER_FILE = /(?:\.server\.ts$|\/\+server\.ts$|\/lib\/server\/)/u;

const present = repoFiles();
const graph = importGraph(
  present.filter(
    (file) =>
      CODE.test(file) && (file.startsWith(DASHBOARD) || file.startsWith(CORE))
  ),
  new Set(present)
);

const walked = new Map<string, string[] | null>();
/** The chain from `file` to a builtin, or null when it reaches none. */
const toBuiltin = (file: string): string[] | null => {
  const known = walked.get(file);
  if (known !== undefined) {
    return known;
  }
  walked.set(file, null);
  for (const { specifier, file: next, typeOnly } of graph.get(file) ?? []) {
    if (typeOnly) {
      continue;
    }
    if (BUILTIN.test(specifier)) {
      const chain = [file, specifier];
      walked.set(file, chain);
      return chain;
    }
    const rest =
      next && graph.has(next) && next.startsWith(CORE) ? toBuiltin(next) : null;
    if (rest) {
      const chain = [file, ...rest];
      walked.set(file, chain);
      return chain;
    }
  }
  return null;
};

const refused: string[] = [];
for (const [file, edges] of graph) {
  if (!file.startsWith(DASHBOARD) || SERVER_FILE.test(file)) {
    continue;
  }
  for (const { specifier, file: target, typeOnly } of edges) {
    if (
      !typeOnly &&
      specifier.startsWith(CORE_PREFIX) &&
      target &&
      graph.has(target)
    ) {
      const chain = toBuiltin(target);
      if (chain) {
        refused.push(`${file} loads ${chain.join(" -> ")}`);
      }
    }
  }
}

if (refused.length > 0) {
  throw new Error(
    `browser-core:check: ${refused.length} dashboard import(s) of core reach a Node or Bun builtin, which the browser cannot load. Import the type alone, or split the browser half out:\n${refused.join("\n")}`
  );
}
console.log(
  `browser-core:check: ${walked.size} core module(s) the dashboard loads reach no builtin`
);
