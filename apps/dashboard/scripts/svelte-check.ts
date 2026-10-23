/**
 * The one bridge `bun run check` keeps until the Golar fork's packages land
 * (scripts/check.ts): svelte-check over the dashboard's pages Golar 0.1.11
 * leaves out of its program, and over nothing else, so no file is checked
 * twice.
 *
 * Golar registers `.svelte` in TypeScript's first extension group, so a
 * `+page.svelte` beside a `+page.ts` loses to it and is dropped from the
 * dashboard's project (patches/typescript-go/0001-Golar-extension.patch
 * `RegisterSupportedExtension`; tsgo tsconfigparsing.go
 * `removeWildcardFilesWithLowerPriorityExtension`): every tracked `.svelte`
 * with a `.ts` of the same name is one. svelte-check reads them through a
 * tsconfig of their own under node_modules/.cache, which extends the
 * dashboard's and includes them alone. Delete this script, its check and
 * svelte-check the day the fork's overrides land.
 *
 * - Proof of a pass is svelte-check's own `COMPLETED … 0 ERRORS` line. Its exit
 *   code is not enough: an error inside svelte-check is caught, printed with
 *   `svelte-check failed`, and the process exits 0 (svelte-check 4.7.6
 *   `dist/src/index.js`, the last `catch` of `parseOptions`).
 * - It runs under Node, never Bun: under the Bun runtime this mode hangs
 *   (measured) or crashes (sveltejs/language-tools#3095).
 * - It is killed after {@link TIMEOUT_MS} and fails.
 * - It reads TypeScript 7 through svelte-check's `--tsgo-experimental-api`,
 *   TypeScript 7's `unstable/*` API, which 7.1 is to replace:
 *   `@typescript/native` stays on `~7.0.2` for it.
 */
import { mkdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

const TIMEOUT_MS = 180_000;
const DASHBOARD = join(import.meta.dir, "..");
const SVELTE = /\.svelte$/;
const CONFIG = join(
  DASHBOARD,
  "node_modules/.cache/cawco/golar-dropped.tsconfig.json"
);

const fail = (why: string): never => {
  console.error(`svelte-check: ${why}`);
  process.exit(1);
};

const node = Bun.which("node");
if (!node) {
  fail("needs Node on PATH: under the Bun runtime it hangs");
}
if (realpathSync(node as string) === realpathSync(process.execPath)) {
  fail(`\`node\` on PATH is Bun (${node}); it needs Node itself`);
}

const tracked = (
  await Bun.$`git -C ${DASHBOARD} ls-files -co --exclude-standard -- ${":(glob)src/**/*.svelte"} ${":(glob)src/**/*.ts"}`.text()
)
  .split("\n")
  .filter(Boolean);
const present = new Set(tracked);
const dropped = tracked.filter(
  (file) => file.endsWith(".svelte") && present.has(file.replace(SVELTE, ".ts"))
);
if (dropped.length === 0) {
  console.log(
    "svelte-check: no page stands beside a same-named .ts; nothing for it to check"
  );
  process.exit(0);
}
mkdirSync(join(CONFIG, ".."), { recursive: true });
await Bun.write(
  CONFIG,
  JSON.stringify({
    extends: relative(join(CONFIG, ".."), join(DASHBOARD, "tsconfig.json")),
    include: dropped.map((file) =>
      relative(join(CONFIG, ".."), join(DASHBOARD, file))
    ),
  })
);
const bin = createRequire(join(DASHBOARD, "package.json")).resolve(
  "svelte-check/bin/svelte-check"
);
const child = Bun.spawn(
  [
    node as string,
    bin,
    "--tsconfig",
    CONFIG,
    "--output",
    "machine",
    "--tsgo-experimental-api",
  ],
  { cwd: DASHBOARD, stdout: "pipe", stderr: "pipe" }
);
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill("SIGKILL");
}, TIMEOUT_MS);
const [out, err, code] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
]);
clearTimeout(timer);

// `<ms> ERROR "<file>" <line>:<col> "<message>"`, the message JSON-quoted.
const DIAGNOSTIC =
  /^\d+ (ERROR|WARNING) "(.+?)" (\d+:\d+) ("(?:[^"\\]|\\.)*")$/;
const COMPLETED =
  /^\d+ COMPLETED (\d+) FILES (\d+) ERRORS (\d+) WARNINGS (\d+) FILES_WITH_PROBLEMS$/m;
for (const line of out.split("\n")) {
  const found = DIAGNOSTIC.exec(line);
  if (found) {
    const [, level, file, at, message] = found;
    console.log(
      `${file}:${at} ${level.toLowerCase()}: ${JSON.parse(message) as string}`
    );
  }
}
if (err.trim()) {
  console.error(err.trim());
}
if (timedOut) {
  fail(`did not finish within ${TIMEOUT_MS / 1000}s`);
}
const completed = COMPLETED.exec(out);
if (!completed) {
  fail(`ended (exit ${code}) without its COMPLETED line: it did not check`);
}
const [, files, errors, warnings] = completed as RegExpExecArray;
console.log(
  `svelte-check: the ${dropped.length} pages Golar 0.1.11 leaves out (${files} files read), ${errors} errors, ${warnings} warnings; this bridge goes when the Golar fork lands`
);
if (errors !== "0" || code !== 0) {
  process.exit(1);
}
