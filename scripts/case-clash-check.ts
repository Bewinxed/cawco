/**
 * Part of `bun run check`: no two paths in the repository differ only by
 * letter case. macOS's default filesystem is case-insensitive, so such a pair
 * is one file there: `find/finder.svelte.ts` beside `find/Finder.svelte`
 * broke typecheck and the dashboard build on the Mac. Directories count too,
 * through every prefix of each path. One git call: tracked plus added files.
 */

import { repoFiles } from "./lib/repo-files";

const seen = new Map<string, string>();
const clashes = new Set<string>();
for (const file of repoFiles()) {
  const parts = file.split("/");
  for (let i = 1; i <= parts.length; i += 1) {
    const path = parts.slice(0, i).join("/");
    const key = path.toLowerCase();
    const prior = seen.get(key);
    if (prior === undefined) {
      seen.set(key, path);
    } else if (prior !== path) {
      clashes.add(`${prior}  <->  ${path}`);
    }
  }
}

if (clashes.size > 0) {
  console.error("Paths that differ only by letter case (one file on macOS):");
  for (const c of clashes) {
    console.error(`  ${c}`);
  }
  process.exit(1);
}
