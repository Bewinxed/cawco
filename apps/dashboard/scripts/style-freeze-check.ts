/**
 * `bun run style-freeze:check` (part of `bun run lint` and `bun run
 * lint:changed`, so the hub's landing gate runs it on every change): no
 * change adds a `<style>` block under apps/dashboard/. The dashboard is
 * moving to Tailwind utilities on the cutover line (cawco/cutover-*), which
 * lands as one commit; a block added on main meanwhile is one more the
 * cutover has to convert.
 *
 * The allow-list beside this script (style-freeze.allow) names, one
 * repo-relative path per line, exactly the `.svelte` files that held a block
 * when the freeze began. The check reads every `.svelte` file git sees under
 * apps/dashboard/ (tracked, and untracked ones git does not ignore), parses
 * it with Svelte's compiler, and fails when:
 *  - a file holds a block (any attributes) and is not on the list: a new
 *    block;
 *  - a listed file holds none: its line comes off the list, so the list only
 *    shrinks and never goes stale.
 * An edit inside a listed file's block passes: main's bug fixes still touch
 * them until the cutover lands.
 *
 * The two steps of the freeze:
 *  - Step 1, now: refuse new blocks; existing ones stay editable.
 *  - Step 2, when the Tailwind cutover lands: the cutover's landing deletes
 *    this script, its list and their package.json wiring. Its own
 *    style-residual lint step then refuses every `<style>` block in the
 *    dashboard, because post-cutover styling is utilities only. If this
 *    script is still here after the cutover's squash commit, the list must be
 *    empty and every block refused.
 *
 *   bun apps/dashboard/scripts/style-freeze-check.ts           check
 *   bun apps/dashboard/scripts/style-freeze-check.ts --write   rewrite the list from the tree
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parse } from "svelte/compiler";

const DASHBOARD = join(dirname(new URL(import.meta.url).pathname), "..");
const REPO = join(DASHBOARD, "../..");
const LIST = join(DASHBOARD, "scripts/style-freeze.allow");
const SVELTE_FILE = /\.svelte$/;
const HEADER = `# style-freeze.allow: read by apps/dashboard/scripts/style-freeze-check.ts.
# The .svelte files under apps/dashboard/ that may hold a <style> block, one
# repo-relative path per line; lines starting with # are skipped.
# Step 1, now: refuse new blocks; existing ones stay editable. A file whose
#   block is gone comes off this list (the check says so).
# Step 2, when the Tailwind cutover (cawco/cutover-*) lands: its landing
#   deletes this list and the script; its style-residual lint step refuses
#   every <style> block in the dashboard. If the script is still here after
#   the cutover's squash commit, this list must be empty.
`;

const isFile = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

const listed = Bun.spawnSync(
  [
    "git",
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ".",
  ],
  { cwd: DASHBOARD }
);
if (listed.exitCode !== 0) {
  process.stderr.write(listed.stderr.toString());
  process.exit(1);
}

/** Every .svelte file git sees under apps/dashboard/ that holds a <style> block. */
const holding = new Set<string>();
let files = 0;
for (const file of new Set(listed.stdout.toString().split("\0"))) {
  const path = join(DASHBOARD, file);
  if (!(file && SVELTE_FILE.test(file) && isFile(path))) {
    continue;
  }
  files += 1;
  const ast = parse(readFileSync(path, "utf8"), { modern: true });
  if (ast.css) {
    holding.add(relative(REPO, path));
  }
}

if (process.argv.includes("--write")) {
  writeFileSync(LIST, `${HEADER}${[...holding].sort().join("\n")}\n`);
  console.log(
    `style-freeze:check: wrote ${holding.size} file(s) to ${relative(REPO, LIST)}`
  );
  process.exit(0);
}

const allowed = new Set(
  readFileSync(LIST, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
);
const added = [...holding].filter((file) => !allowed.has(file)).sort();
const emptied = [...allowed].filter((file) => !holding.has(file)).sort();

for (const file of added) {
  console.error(
    `  ${file}: new <style> block under apps/dashboard: the dashboard is styled with Tailwind utilities; build this on the cutover line (cawco/cutover-*) until it lands`
  );
}
for (const file of emptied) {
  console.error(
    `  ${file}: holds no <style> block any more: remove its line from ${relative(REPO, LIST)}`
  );
}
if (added.length > 0 || emptied.length > 0) {
  console.error(
    `style-freeze:check: ${added.length} new block(s), ${emptied.length} stale line(s) (apps/dashboard/scripts/style-freeze-check.ts)`
  );
  process.exit(1);
}
console.log(
  `style-freeze:check: ${files} file(s), ${allowed.size} allowed file(s) hold a <style> block, none new`
);
