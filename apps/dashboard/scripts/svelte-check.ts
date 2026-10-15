/**
 * The dashboard's svelte-check, as `bun run typecheck` runs it: TypeScript 7
 * through svelte-check's `--tsgo-experimental-api` (about twice as fast as its
 * TypeScript 6 default; tooling-speed.md §B), and a pass only on proof.
 *
 * - Proof of a pass is svelte-check's own `COMPLETED … 0 ERRORS` line. Its exit
 *   code is not enough: an error inside svelte-check is caught, printed with
 *   `svelte-check failed`, and the process exits 0 (svelte-check 4.7.6
 *   `dist/src/index.js`, the last `catch` of `parseOptions`).
 * - It runs under Node, never Bun: under the Bun runtime this mode hangs
 *   (measured) or crashes (sveltejs/language-tools#3095).
 * - It is killed after {@link TIMEOUT_MS} and fails.
 * - The experimental mode reads TypeScript 7's `unstable/*` API, which 7.1 is
 *   to replace: `@typescript/native` stays on `~7.0.2` until svelte-check
 *   supports it.
 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const TIMEOUT_MS = 180_000;
const DASHBOARD = join(import.meta.dir, "..");

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
const bin = createRequire(join(DASHBOARD, "package.json")).resolve(
  "svelte-check/bin/svelte-check"
);
const child = Bun.spawn(
  [
    node as string,
    bin,
    "--tsconfig",
    "./tsconfig.json",
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
  `svelte-check: ${files} files, ${errors} errors, ${warnings} warnings`
);
if (errors !== "0" || code !== 0) {
  process.exit(1);
}
