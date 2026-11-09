/**
 * A workspace's hook armed: its judge, hook, shims, executor and doors written
 * in this build's form for the boundary it names, and the record of them.
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  workspaceClaudeTmpDir,
  workspacePolicyFile,
} from "@cawco/core/paths/workspace";
import { listedPid } from "@cawco/core/signal";
import { workspacePolicy } from "@cawco/core/workspace-policy";
import { openGithubDoor } from "../github-door";
import { openGitDoor } from "../hub-git";
import { openToolDoor } from "../tool-door";
import { execScript } from "./exec";
import {
  bunRuntime,
  claudePrefixOf,
  claudePrefixScript,
  hookScript,
} from "./hook-judge";
import { judgeFor, whileArming } from "./judge-process";
import {
  writeChromiumShim,
  writeGitShim,
  writeGuardedGhConfig,
  writeShims,
} from "./shims";
import {
  gitSystemConfig,
  gitSystemConfigOf,
  type Held,
  roOf,
  stateDir,
  type UnaskedCalls,
  writeWhole,
} from "./state";
import { watchHost } from "./watch";

/**
 * Starts the workspace's judge in this build's form and writes its hook for
 * `held` to ask it, its executor in this build's form for the boundary `held`
 * names, and the record of them, and serves its tool door. An executor only
 * hands commands in, so it is current from the next command on, whatever form
 * the boundary is. A running CLI reads its hook at every call, so it asks
 * the new judge from the next call on. On macOS also its shims. The
 * workspace's policy is written again too, as this machine stands now
 * (`workspacePolicy`): every harness reads it at each file tool call, so a
 * store, toolchain or account added since is in it from the next call on.
 */
export const armHook = (
  id: string,
  held: Omit<Held, "claudeTmp" | "hook" | "policy" | "prefix">,
  unasked: UnaskedCalls
): Promise<Held> => whileArming(id, () => armHookNow(id, held, unasked));

/** {@link armHook}'s writes and starts, counted as {@link arming}. */
const armHookNow = async (
  id: string,
  held: Omit<Held, "claudeTmp" | "hook" | "policy" | "prefix">,
  unasked: UnaskedCalls
): Promise<Held> => {
  const hook = join(stateDir(id), "hook");
  const prefix = claudePrefixOf(id);
  const policy = workspacePolicyFile(id);
  // The CLI makes its own `claude-<uid>` in it, 0700, and refuses a root it
  // does not own; inside the boundary it is read only, as the rest of `ro`.
  const claudeTmp = workspaceClaudeTmpDir(id);
  await mkdir(claudeTmp, { recursive: true, mode: 0o700 });
  await writeWhole(
    policy,
    `${JSON.stringify(await workspacePolicy({ id, path: held.path }), null, 2)}\n`,
    0o644
  );
  const judge = await judgeFor(id, held, hook, policy, unasked);
  await writeWhole(hook, hookScript(id, hook, judge), 0o755);
  const runtime = await bunRuntime(id);
  if (process.platform === "darwin") {
    await writeShims(id, runtime);
  }
  await writeGuardedGhConfig(id);
  await writeWhole(gitSystemConfigOf(id), gitSystemConfig(id), 0o644);
  await writeGitShim(id, held.path);
  await writeChromiumShim(id);
  // The copy of gh's token an earlier build's executor kept beside the
  // workspace: nothing reads it now, and a token is kept nowhere it is not used.
  await rm(join(stateDir(id), "gh-token"), { force: true });
  // The repository rule an earlier build wrote for the workspace's doors:
  // nothing reads it now.
  await rm(join(roOf(id), "upstream.json"), { force: true });
  // Its host's pid as the keeper listed it at its start, and matched to
  // the keeper's list again before any boundary on record is armed.
  await writeWhole(
    held.exec,
    execScript(id, { ...held, pid: listedPid(held.pid) }),
    0o755
  );
  await writeWhole(prefix, claudePrefixScript(id, held.exec), 0o755);
  await openToolDoor(id);
  await openGitDoor({ id, path: held.path });
  await openGithubDoor(id);
  await watchHost(id, held, unasked);
  const armed: Held = { ...held, claudeTmp, hook, policy, prefix };
  await writeWhole(
    join(stateDir(id), "boundary.json"),
    `${JSON.stringify(armed)}\n`,
    0o644
  );
  return armed;
};
