// The lanes' relic gate (delta T). Run from the repository root:
//   L=<lane> bun .cutover/gates/lane-relic-check.ts
// The owner: "None of these relics are allowed, conductor needs to cutover".
// The rule is the repository's own (scripts/relics-check.ts, part of `bun run
// lint`: literal markers, numeric style vars, !important, trailing-! utilities,
// <style> without a docs reason, less its SANCTIONED overrides); this gate runs
// it over the lane's files under apps/dashboard/src, so a lane is held to the
// same rule integration is. Prints `relic-free` when every kind reads 0.
import { existsSync } from "node:fs";
import { loadLane, reportList } from "./lane-list.ts";

const list = loadLane();
const listOk = reportList(list);
if (!existsSync("scripts/relics-check.ts")) {
  console.log("scripts/relics-check.ts is not in this tree: reset to the brief's start sha");
  process.exit(2);
}
if (list.dashboardSrc.length === 0) {
  console.log(listOk ? "no files under apps/dashboard/src to check\nrelic-free" : "list-failed");
  process.exit(listOk ? 0 : 1);
}
const run = Bun.spawnSync(["bun", "scripts/relics-check.ts", "--list", ...list.dashboardSrc], {
  stdout: "pipe",
  stderr: "pipe",
});
const out = `${run.stdout.toString()}${run.stderr.toString()}`.trim();
console.log(out);
const clean = run.exitCode === 0;
console.log(clean && listOk ? "relic-free" : clean ? "list-failed" : "relics-found");
process.exit(clean && listOk ? 0 : 1);
