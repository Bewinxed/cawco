/**
 * Prints the tool trees under home a workspace's policy reads back on this
 * machine, beyond the PATH dirs themselves (`homeToolchains` in
 * packages/core/src/workspace-policy.ts), for this process's PATH: run it with
 * the PATH the agent has.
 *
 *   bun artifacts/srt-eval/home-toolchains.ts
 */
import { homedir } from "node:os";
import { delimiter } from "node:path";
import { homeToolchains } from "../../packages/core/src/workspace-policy";

const path = new Set((process.env.PATH ?? "").split(delimiter));
for (const tree of await homeToolchains(homedir())) {
  if (!path.has(tree)) {
    console.log(tree);
  }
}
