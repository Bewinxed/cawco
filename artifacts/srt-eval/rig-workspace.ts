/**
 * Rig driver for the boundary checks: creates or archives one workspace
 * exactly as the agent's workspace handlers do (packages/agent/src/workspace.ts),
 * against the sessiond `CAWCO_SESSIOND_ENDPOINT` names. Run from a checkout:
 *
 *   bun artifacts/srt-eval/rig-workspace.ts create SOURCE_REPO ID
 *   bun artifacts/srt-eval/rig-workspace.ts archive ID CLONE
 *
 * `create` prints the checkout as JSON (its clone path, its boundary's pid)
 * once the workspace is armed, then stays up as the agent does, serving the
 * doors arming opened (its git door, GitHub door and tool door, boundary/
 * `armHook`) until it is sent SIGTERM. Stop it before `archive`.
 */

import {
  archiveWorkspace,
  createWorkspace,
} from "../../packages/agent/src/workspace";

const [verb, first, second] = process.argv.slice(2);
if (!process.env.CAWCO_SESSIOND_ENDPOINT) {
  throw new Error("name the rig's sessiond in CAWCO_SESSIOND_ENDPOINT");
}
if (verb === "create" && first && second) {
  const project = `cawco-check-${second.slice(0, 8)}`;
  // The rig holds no fleet, so no project's rows are placed in the clone.
  const checkout = await createWorkspace(
    () => Promise.resolve(),
    first,
    second,
    project
  );
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => process.exit(0));
  }
  console.log(JSON.stringify(checkout));
} else if (verb === "archive" && first && second) {
  await archiveWorkspace({ id: first, path: second });
  console.log(`archived ${first}`);
  process.exit(0);
} else {
  console.error(
    "usage: rig-workspace.ts create SOURCE_REPO ID | archive ID CLONE"
  );
  process.exit(64);
}
