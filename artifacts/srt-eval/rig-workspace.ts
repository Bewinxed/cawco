/**
 * Rig driver for the boundary checks: creates or archives one workspace
 * exactly as the agent's workspace handlers do (packages/agent/src/workspace.ts),
 * against the sessiond `CAWCO_SESSIOND_ENDPOINT` names. Run from a checkout:
 *
 *   bun artifacts/srt-eval/rig-workspace.ts create SOURCE_REPO ID
 *   bun artifacts/srt-eval/rig-workspace.ts archive ID CLONE
 *
 * `create` prints the checkout as JSON (its clone path, its boundary's pid).
 *
 * The rig has no hub, so before `create` it hands the agent the upstream
 * rules a hub would (through boundary.ts, as the daemon does with each
 * register ack): the fleet's, guarded, whose own repositories are the source
 * repo's remotes. The workspace then gets its `ro/upstream.json` as a real
 * one does, and its gh shim judges calls instead of refusing every one.
 */
import { spawnSync } from "node:child_process";
import { takeUpstreamRules } from "../../packages/agent/src/boundary";
import {
  archiveWorkspace,
  createWorkspace,
} from "../../packages/agent/src/workspace";
import {
  normaliseRemote,
  type UpstreamRules,
} from "../../packages/core/src/upstream-guard";

/** The fleet rule a hub hands for `sourceRepo`: guarded, its own remotes allowed. */
const rulesFor = (sourceRepo: string): UpstreamRules => {
  const listed = spawnSync(
    "git",
    ["-C", sourceRepo, "config", "--get-regexp", "^remote\\..*\\.url$"],
    { encoding: "utf8" }
  );
  if (listed.status !== 0 && listed.status !== 1) {
    throw new Error(`git config in ${sourceRepo}: ${listed.stderr.trim()}`);
  }
  const remotes = new Set<string>();
  for (const line of listed.stdout.split("\n")) {
    const url = line.slice(line.indexOf(" ") + 1);
    const remote = line.includes(" ") ? normaliseRemote(url) : null;
    if (remote) {
      remotes.add(remote);
    }
  }
  return { fleet: { guarded: true, remotes: [...remotes] }, projects: {} };
};

const [verb, first, second] = process.argv.slice(2);
if (!process.env.CAWCO_SESSIOND_ENDPOINT) {
  throw new Error("name the rig's sessiond in CAWCO_SESSIOND_ENDPOINT");
}
if (verb === "create" && first && second) {
  await takeUpstreamRules(rulesFor(first));
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
