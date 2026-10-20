// The lanes' one residual gate (delta Q). Run from the repository root:
//   L=<lane> [NOCAP=1] bun .cutover/gates/lane-residual-check.ts
// Runs the repository's scripts/style-residual-check.ts over the lane's components
// under apps/dashboard/src (a residual is a component's <style>, so only .svelte
// files; the lane's sheets answer to the relic and ESLint gates), minus the files
// its lane file declares as `deferred-file:` (their <style> stays as the
// foundation had it, for the contracts phase). Opus lanes set NOCAP=1.
import { loadLane, reportList } from "./lane-list.ts";

const list = loadLane();
const listOk = reportList(list);
const deferred = new Set([...list.laneText.matchAll(/^deferred-file:\s*(\S+)/gm)].map((match) => match[1]));
const files = list.dashboardSrc.filter((path) => path.endsWith(".svelte") && !deferred.has(path));
console.log(`deferred files: ${deferred.size}${deferred.size ? ` (${[...deferred].join(", ")})` : ""}`);
if (files.length === 0) {
  console.log(listOk ? "no files left to check" : "list-failed");
  process.exit(listOk ? 0 : 1);
}
const run = Bun.spawnSync(
  ["bun", "scripts/style-residual-check.ts", ...(process.env.NOCAP ? ["--no-cap"] : []), ...files],
  { stdout: "inherit", stderr: "inherit" },
);
if (!listOk) {
  console.log("list-failed");
}
process.exit(run.exitCode === 0 && listOk ? 0 : 1);
