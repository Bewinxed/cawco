#!/usr/bin/env bun
/**
 * What CawCo's first commit of a plain folder would take and leave out, read
 * the way the agent reads it before making the place a git repository
 * (packages/agent/src/place-repo.ts, a dry run): nothing is written in the
 * folder; git reads it through a scratch git dir in the system temp dir.
 *
 *   bun scripts/place-repo-plan.ts /home/bewinxed/cawco
 */
import { placeRepo } from "../packages/agent/src/place-repo";

const [path] = process.argv.slice(2);
if (!path) {
  console.error("usage: bun scripts/place-repo-plan.ts <folder>");
  process.exit(2);
}
const plan = await placeRepo(path, true);
if (plan.state === "checkout") {
  console.log(
    `${path} is in the git repository at ${plan.root}: nothing would be done.`
  );
  process.exit(0);
}
console.log(
  `${plan.root}: the first commit would take ${plan.files} files, ${(plan.bytes / 1024 / 1024).toFixed(2)} MB.\n`
);
console.log(`Staged (${plan.staged.length}):`);
for (const file of plan.staged) {
  console.log(`  ${file}`);
}
console.log(`\nLeft out (${plan.leftOut.length}):`);
for (const { path: left, why } of plan.leftOut) {
  console.log(`  ${left} — ${why}`);
}
