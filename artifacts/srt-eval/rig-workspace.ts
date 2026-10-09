/**
 * Rig driver for the boundary checks: creates or archives one workspace
 * exactly as the agent's workspace handlers do (packages/agent/src/workspace.ts),
 * against the sessiond `CAWCO_SESSIOND_ENDPOINT` names. Run from a checkout:
 *
 *   bun artifacts/srt-eval/rig-workspace.ts create SOURCE_REPO ID
 *   bun artifacts/srt-eval/rig-workspace.ts archive ID CLONE
 *
 * `create` prints the checkout as JSON (its clone path, its boundary's pid).
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
  console.log(JSON.stringify(await createWorkspace(first, second)));
} else if (verb === "archive" && first && second) {
  await archiveWorkspace({ id: first, path: second });
  console.log(`archived ${first}`);
} else {
  console.error(
    "usage: rig-workspace.ts create SOURCE_REPO ID | archive ID CLONE"
  );
  process.exit(64);
}
process.exit(0);
