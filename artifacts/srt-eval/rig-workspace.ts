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
 * doors arming opened (its git door, GitHub door and tool door, boundary.ts
 * `armHook`) until it is sent SIGTERM. Stop it before `archive`.
 *
 * The rig has no hub, so before `create` it hands the agent the upstream
 * rules a hub would (through boundary.ts, as the daemon does with each
 * register ack): for this fleet, unguarded, whose own repositories are the
 * source repo's remotes. The workspace then gets its `ro/upstream.json` as a
 * real one does.
 *
 * `takeUpstreamRules` writes every armed workspace's rule on this machine,
 * the live agent's among them. So the rig's workspace is in a project of its
 * own, its rule is that project's, and every other workspace's rule goes
 * back in as it stands (its project's, or the fleet's for one in none): the
 * rig writes nothing into a workspace it did not make. The live agent writes
 * the hub's rule into the rig's workspace at its next beat (daemon.ts
 * `takeUpstream`): the hub's fleet rule, as the hub knows no rig project.
 */

import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { takeUpstreamRules } from "../../packages/agent/src/boundary";
import { upstreamRule } from "../../packages/agent/src/github-door";
import {
  archiveWorkspace,
  createWorkspace,
} from "../../packages/agent/src/workspace";
import {
  workspaceProjectFile,
  workspacesDir,
} from "../../packages/core/src/paths";
import { readRecord } from "../../packages/core/src/state-file";
import {
  normaliseRemote,
  type UpstreamRule,
  type UpstreamRules,
} from "../../packages/core/src/upstream-guard";

/** `sourceRepo`'s remotes, as the hub names a project's own repository. */
const remotesOf = (sourceRepo: string): string[] => {
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
  return [...remotes];
};

/**
 * The rules this machine's workspaces hold now, read back from each one's
 * rule (github-door.ts `upstreamRule`) and project: handed in again, they
 * leave every one as it is. The hub's answer for a fleet that never chose
 * (hub upstream.ts `upstreamRules`) when no workspace in no project holds one.
 */
const heldRules = async (): Promise<UpstreamRules> => {
  let fleet: UpstreamRule = { posts: "on", remotes: [] };
  const projects: Record<string, UpstreamRule> = {};
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  for (const id of ids) {
    const rule = upstreamRule(id);
    if (!rule) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one small record per workspace
    const project = await readRecord<unknown>(workspaceProjectFile(id)).catch(
      () => undefined
    );
    if (typeof project === "string") {
      projects[project] = rule;
    } else {
      fleet = rule;
    }
  }
  return { fleet, projects };
};

const [verb, first, second] = process.argv.slice(2);
if (!process.env.CAWCO_SESSIOND_ENDPOINT) {
  throw new Error("name the rig's sessiond in CAWCO_SESSIOND_ENDPOINT");
}
if (verb === "create" && first && second) {
  const project = `cawco-check-${second.slice(0, 8)}`;
  const rule: UpstreamRule = { posts: "on", remotes: remotesOf(first) };
  const held = await heldRules();
  await takeUpstreamRules({
    ...held,
    projects: { ...held.projects, [project]: rule },
  });
  const checkout = await createWorkspace(first, second, project);
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
