/**
 * `bun scripts/states-lint.ts` (part of `bun run lint`): every state is
 * handled. typescript-eslint's switch-exhaustiveness-check over the
 * dashboard and every package (apps/dashboard/eslint.states.config.mjs): a
 * switch over a union or an enum names each member or has a default.
 *
 * The rule reads types, through TypeScript's project service, and a process
 * that reads `.ts` and `.svelte` files together slows with every file it
 * adds: the whole tree took over 35 minutes in one process and 8 with four
 * worker threads, where every `.ts` file in one process took 22 seconds and
 * the Svelte files about 15 per hundred in processes of their own. So the
 * `.ts` files run in one process and the Svelte files in fresh processes of
 * a hundred, one after another; it prints what each found and the total.
 * Exits 1 on any finding.
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ESLINT = "apps/dashboard/node_modules/.bin/eslint";
const CONFIG = "apps/dashboard/eslint.states.config.mjs";
/** Svelte files per ESLint process. */
const CHUNK = 100;
const PROBLEMS = /✖ (\d+) problems?/;

const files =
  // `:(glob)` so `**/` matches no folder too (a file directly under `src/`).
  (
    await Bun.$`git ls-files -co --exclude-standard -- ${":(glob)apps/dashboard/src/**/*.ts"} ${":(glob)apps/dashboard/src/**/*.svelte"} ${":(glob)packages/*/src/**/*.ts"} ${":(glob)packages/*/src/**/*.tsx"}`
      .cwd(ROOT)
      .text()
  )
    .split("\n")
    .filter(Boolean);
// The dashboard's tsconfig extends the one SvelteKit writes.
await Bun.$`bunx svelte-kit sync`
  .cwd(resolve(ROOT, "apps", "dashboard"))
  .quiet();

const svelte = files.filter((file) => file.endsWith(".svelte"));
/** Every `.ts` file in one process; the Svelte files a hundred at a time. */
const batches = [
  files.filter((file) => !file.endsWith(".svelte")),
  ...Array.from({ length: Math.ceil(svelte.length / CHUNK) }, (_, i) =>
    svelte.slice(i * CHUNK, (i + 1) * CHUNK)
  ),
];
let found = 0;
let failed = false;
for (const chunk of batches) {
  // biome-ignore lint/performance/noAwaitInLoops: one process at a time: each holds a type service of its own
  const run = await Bun.$`${ESLINT} -c ${CONFIG} ${chunk}`
    .cwd(ROOT)
    .nothrow()
    .quiet();
  const out = run.stdout.toString();
  if (run.exitCode > 1) {
    console.error(run.stderr.toString() || out);
    process.exit(2);
  }
  const summary = out.match(PROBLEMS);
  if (summary) {
    process.stdout.write(out.slice(0, summary.index).trimEnd());
    process.stdout.write("\n");
    found += Number(summary[1]);
  }
  failed ||= run.exitCode === 1;
}
console.log(
  found === 0
    ? `switch exhaustiveness: every switch over a union or enum is whole (${files.length} files)`
    : `switch exhaustiveness: ${found} switch(es) leave a case unhandled (${files.length} files)`
);
process.exit(failed ? 1 : 0);
