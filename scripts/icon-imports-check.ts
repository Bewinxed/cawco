/**
 * `bun scripts/icon-imports-check.ts` (part of `bun run check`): an
 * unplugin-icons module (`~icons/<set>/<name>`, or its `virtual:icons/`
 * form) is imported in packages/icons alone. DESIGN.md's Solar Duotone Rule:
 * "Every product icon is Solar's bold-duotone cut, imported through
 * `$lib/icons.ts`"; the barrel there re-exports @cawco/icons, which the
 * dashboard's dev server pre-bundles into one module (vite.config.ts
 * `optimizeDeps.include`), as it does the brand marks' `@cawco/icons/marks`. An icon imported anywhere else is a module of its
 * own, compiled on request, and a request of its own on every page that
 * loads it. Searched over every tracked and untracked file of the
 * repository; a quote before the id is an import's specifier, where a
 * comment names the id in backticks. Prints `file:line: text`; exits 1 on
 * any.
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SPECIFIER = "['\"](~icons|virtual:icons)/";

const out =
  await Bun.$`git grep --untracked -nE -e ${SPECIFIER} -- . ${":!packages/icons/"}`
    .cwd(ROOT)
    .nothrow()
    .quiet();
const lines = out.stdout.toString().trim();
if (out.exitCode > 1) {
  console.error(`git grep failed: ${out.stderr.toString().trim()}`);
  process.exit(2);
}
if (out.exitCode === 0 && lines) {
  const hits = lines.split("\n");
  console.log(
    `An icon is imported from the barrel, never from unplugin-icons directly (DESIGN.md, The Solar Duotone Rule: "imported through \`$lib/icons.ts\`"). Name it in packages/icons/src/index.ts and import it from #lib/icons.js (a brand mark: packages/icons/src/marks.ts, imported from @cawco/icons/marks):\n${hits.map((hit) => `  ${hit}`).join("\n")}`
  );
  process.exit(1);
}
console.log(
  "icon imports: every ~icons/ module is imported in packages/icons alone"
);
