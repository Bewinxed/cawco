/**
 * Part of `bun run lint`: no two paths in the repository differ only by
 * letter case. macOS's default filesystem is case-insensitive, so such a pair
 * is one file there: `find/finder.svelte.ts` beside `find/Finder.svelte`
 * broke typecheck and the dashboard build on the Mac. Directories count too,
 * through every prefix of each path. One git call: tracked plus added files.
 */

const proc = Bun.spawnSync([
  "git",
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
]);
if (proc.exitCode !== 0) {
  process.stderr.write(proc.stderr.toString());
  process.exit(1);
}

const seen = new Map<string, string>();
const clashes = new Set<string>();
for (const file of proc.stdout.toString().split("\0")) {
  if (!file) continue;
  const parts = file.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join("/");
    const key = path.toLowerCase();
    const prior = seen.get(key);
    if (prior === undefined) seen.set(key, path);
    else if (prior !== path) clashes.add(`${prior}  <->  ${path}`);
  }
}

if (clashes.size > 0) {
  console.error("Paths that differ only by letter case (one file on macOS):");
  for (const c of clashes) console.error(`  ${c}`);
  process.exit(1);
}
