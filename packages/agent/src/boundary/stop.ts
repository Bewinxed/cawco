/**
 * How a boundary ends: its host stopped with what runs in it, its generation's files
 * cleaned, what still uses it from outside ended, and a workspace closed.
 */

import { existsSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  forgetWorkspaceTmp,
  workspaceDoorDir,
} from "@cawco/core/paths/workspace";
import { listedPid, signal as signalPid } from "@cawco/core/signal";
import { until } from "@cawco/core/until";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { isPlace } from "@cawco/core/workspace-policy";
import { membershipName } from "../boundary-policy";
import { closeWorkspaceBrowsers } from "../browser/gate";
import { closeGithubDoor } from "../github-door";
import { closeGitDoor } from "../hub-git";
import { ownFolderSync } from "../layer";
import { boundaryProcId, isBoundaryOf, isJudgeOf } from "../proc-id";
import { removeTree } from "../remove-tree";
import { endSandbox } from "../sandbox-end";
import { removeStandIns } from "../stand-ins";
import { closeToolDoor } from "../tool-door";
import { decided, recordDecision } from "./decisions";
import {
  attachedIn,
  attachedProcs,
  closedWhile,
  commandsNow,
  forgetHeld,
} from "./holding";
import { executors, killAnswering } from "./processes";
import { srtTmpOf } from "./runner";
import { endMembers, goneWithin, isBwrap } from "./sandboxes";
import { forgetRetiring, forgetStale, forgetStubbed } from "./staleness";
import {
  fifoOf,
  generationDir,
  type Held,
  keepers,
  readHeld,
  readPlace,
  readRetiring,
  retiringFileOf,
  STOP_TIMEOUT_MS,
  scratchOf,
  stateDir,
} from "./state";

/**
 * A place whose folder is gone, settled, once nothing of it runs (no
 * boundary of it alive on any keeper, no session process holding its hook,
 * {@link attachedIn}): its records go with its scratch and door dirs
 * ({@link closeBoundary}), so nothing lists, arms or starts it again. Its
 * folder was the person's; with it gone the place holds nothing of anyone's.
 * A session that asks for it again is refused, naming the folder
 * (lifecycle.ts `placeReady`). A delegate's clone is left to its archive. Answers
 * whether it was settled.
 */
export const settleGonePlace = async (ref: WorkspaceRef): Promise<boolean> => {
  if (!isPlace(ref.id)) {
    return false;
  }
  const folder = await stat(ref.path).catch(() => undefined);
  if (folder?.isDirectory()) {
    return false;
  }
  const procs = (await keepers.held()).filter((proc) => proc.alive);
  if (
    procs.some((proc) => isBoundaryOf(proc.procId, ref.id)) ||
    attachedIn(ref.id, ref.path, procs, await commandsNow())
  ) {
    return false;
  }
  await closeBoundary(ref);
  console.info(
    `[workspace] ${ref.id}: its folder ${ref.path} is gone, so the place is settled: its records, scratch and door dirs are gone, and nothing starts it again`
  );
  return true;
};

/**
 * How long a Linux boundary's srt host has, once told to stop, to end its
 * sandbox itself and exit ({@link stopBoundary}). Ours: srt's own teardown
 * is bounded at 1.5 s (its bridges killed), and the host's kill of its
 * sandbox is the one {@link endSandbox} the agent would make.
 */
const HOST_STOP_MS = 3000;

/**
 * Stops the boundary of workspace `id` that `held` names, as sessiond holds
 * it, with every process in it. Linux: its srt host is told first (SIGTERM),
 * and ends its sandbox itself, its init then its outer bwrap (sandbox-end.ts
 * `endSandbox`), as a stop it was asked for, so it says no sandbox of its
 * ended unasked and exits 0 (boundary-host.ts `stopping`); then it removes
 * srt's proxy, socat bridges and mount points and exits (killing the host
 * instead would leave those behind, REPORT.md §5e). A sandbox still running
 * {@link HOST_STOP_MS} after is ended by the agent the same way, its init
 * then its outer bwrap, and its host cleans up as that ends. Its keeper ends
 * what is left in its cgroup (sessiond server.ts `#sweep`). An anchor from
 * before srt goes with the `unshare` sessiond holds (`--kill-child`). macOS:
 * the runner, then everything that answers to its generation's name, which
 * outlives the runner there ({@link killAnswering}). On whichever keeper
 * holds it: the current one, or a retiring one.
 */
export const stopBoundary = async (
  id: string,
  held: Pick<Held, "gen">
): Promise<void> => {
  const procId = boundaryProcId(id, held.gen);
  const place = await readPlace(id, held.gen);
  if (place && (await isBwrap(place.outer))) {
    // The host alone, never its tree as the keeper signals one: the stop is
    // the host's to make, its sandbox's end then the one it asked for.
    const host = await keepers.holding(procId);
    if (host) {
      signalPid(listedPid(host.pid), "SIGTERM");
    }
    // A host gone ended its sandbox as it went (its outer bwrap dies with it
    // besides, `--die-with-parent`), and its pid is not read again.
    if (!(host && (await goneWithin(procId, HOST_STOP_MS)))) {
      endSandbox(place, () => signalPid(listedPid(place.outer), "SIGKILL"));
      await goneWithin(procId, STOP_TIMEOUT_MS);
    }
  }
  const left = await keepers.holding(procId);
  if (left) {
    await left.client.signal(procId, "SIGKILL");
  }
  await killAnswering(membershipName(id, held.gen));
};

/**
 * Stops the boundary `held` names ({@link stopBoundary}) and, once its
 * sandbox is gone, removes its files ({@link cleanGeneration}). Answers why
 * not when the sandbox is still there after {@link STOP_TIMEOUT_MS}.
 */
export const stopGeneration = async (
  id: string,
  held: Pick<Held, "gen">
): Promise<string | undefined> => {
  const place = await readPlace(id, held.gen);
  await stopBoundary(id, held);
  if (!(await sandboxesGone(place ? [place.inner] : []))) {
    return `its sandbox ${place?.inner} was still there ${STOP_TIMEOUT_MS / 1000}s after it was stopped`;
  }
  await cleanGeneration(id, held);
};

/**
 * Removes the files of the stopped boundary `held` names: its generation's
 * dir, FIFO and srt temp dir.
 */
export const cleanGeneration = async (
  id: string,
  held: Pick<Held, "gen">
): Promise<void> => {
  const srtTmp =
    process.platform === "linux" && process.env.XDG_RUNTIME_DIR
      ? [srtTmpOf(id, held.gen)]
      : [];
  const files = [generationDir(id, held.gen), fifoOf(id, held.gen), ...srtTmp];
  await Promise.all(
    files.map((path) => rm(path, { recursive: true, force: true }))
  );
};

/** SIGKILL to every live process a keeper holds that `owned` names. */
const signalHeld = async (
  owned: (procId: string) => boolean
): Promise<void> => {
  await Promise.all(
    (await keepers.held())
      .filter((proc) => proc.alive && owned(proc.procId))
      .map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
  );
};

/**
 * Ends what still uses workspace `ref` from outside its boundary, as law
 * `live-workspace-judge-answers` counts it ({@link inUse}): every session
 * process a keeper holds in its clone ({@link attachedProcs}) and every
 * executor on its way in ({@link executors}), each SIGKILLed, then waited for
 * up to {@link STOP_TIMEOUT_MS}. Two callers:
 *
 *  - whatever stops a workspace's boundary for good ({@link stopNow}: an
 *    archive, a held workspace's close, a stage clone's cut), before its
 *    judge goes. The hub closes a workspace only once its items' sessions are
 *    asleep or ended (workspaces.ts `holdsOf`, `archiveNow`), so a CLI still
 *    in the clone is one whose session the hub filed gone; left there, its
 *    judge gone, every call it made was refused, and the agent's next start
 *    revived the boundary for it. On obelisk (2026-10-18) a `from` cut of
 *    held workspace bb4af2c9 closed it so, under such a CLI, and the beat
 *    exited the agent twice;
 *  - looks.ts `repairJudge`, when a judge started again still does not answer.
 *
 * A place's sessions are the person's own, and an archive never stops a
 * place: nothing of one is ended here. Answers what it ended and what was
 * still there after the wait, each in words.
 */
export const endUsers = async (
  ref: WorkspaceRef
): Promise<{ ended: string[]; left: string[] }> => {
  if (isPlace(ref.id)) {
    return { ended: [], left: [] };
  }
  const users = async () => {
    const commands = await commandsNow();
    const procs = (await keepers.held()).filter((proc) => proc.alive);
    const clis = attachedProcs(ref.id, ref.path, procs, commands);
    const execs = executors(commands.lines, ref.id);
    return {
      clis,
      execs,
      words: [
        ...clis.map((proc) => `${proc.procId} (pid ${proc.pid})`),
        ...execs.map((pid) => `executor pid ${pid}`),
      ],
    };
  };
  const found = await users();
  if (found.words.length === 0) {
    return { ended: [], left: [] };
  }
  await Promise.all(
    found.clis.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
  );
  for (const pid of found.execs) {
    signalPid(listedPid(pid), "SIGKILL");
  }
  const left = await until(users, {
    deadline: Date.now() + STOP_TIMEOUT_MS,
    done: ({ words }) => words.length === 0,
    every: 50,
  });
  return { ended: found.words, left: left.words };
};

/** {@link stopWorkspaceBoundary}'s stop itself, inside its hold. */
export const stopNow = async (ref: WorkspaceRef): Promise<number[]> => {
  forgetStale(ref.id);
  forgetRetiring(ref.id);
  forgetStubbed(ref.id);
  await closeToolDoor(ref.id);
  await closeGitDoor(ref.id);
  await closeGithubDoor(ref.id);
  // Its sessions' connections to the project's browser cut, and its pages
  // there closed, kept to open again as a clone cut again of it comes back
  // to them (browser/gate.ts `restore`).
  await closeWorkspaceBrowsers(ref.id);
  const held = await readHeld(ref.id).catch(() => undefined);
  const boundaries = [...(held ? [held] : []), ...(await readRetiring(ref.id))];
  const inners: number[] = [];
  for (const boundary of boundaries) {
    const place = await readPlace(ref.id, boundary.gen);
    if (place) {
      inners.push(place.inner);
    }
    await stopBoundary(ref.id, boundary);
    await cleanGeneration(ref.id, boundary);
    await rm(retiringFileOf(ref.id, boundary), { force: true });
  }
  await signalHeld((procId) => isBoundaryOf(procId, ref.id));
  await endMembers(ref.id);
  // Everything in it ends before its judge goes: a judge gone under a CLI
  // still in the clone breaks live-workspace-judge-answers.
  const users = await endUsers(ref);
  if (users.ended.length > 0) {
    console.info(
      `[workspace] ${ref.id}: its boundary is closed for good, so what still ran in its clone ends with it: ${users.ended.join(", ")}${users.left.length > 0 ? `; ${users.left.join(", ")} still ran ${STOP_TIMEOUT_MS / 1000}s after SIGKILL, so its judge is left answering` : ""}`
    );
  }
  await rm(join(stateDir(ref.id), "boundary.json"), { force: true });
  await recordDecision(ref.id, {
    closed: boundaries.map(decided),
    decision: "closed-for-good",
  });
  if (users.left.length === 0) {
    await signalHeld((procId) => isJudgeOf(procId, ref.id));
  }
  forgetHeld(ref.id);
  return inners;
};

/**
 * {@link stopWorkspaceBoundary}, then the rest of the workspace on this
 * machine but its clone: on Linux, once its sandboxes are gone, the deny
 * stand-ins in its clone go (`stand-ins.ts`). Then its state and its scratch
 * dir go, and on Linux srt's temp dirs with the sockets srt leaves there
 * (REPORT.md §5o); then the dir its sockets were in. All of it in one hold
 * against starts ({@link closedWhile}): no start runs on in a state dir it
 * takes away.
 */
export const closeBoundary = (ref: WorkspaceRef): Promise<void> =>
  closedWhile(ref.id, () => closeAll(ref));

/** {@link closeBoundary}'s close itself, inside its hold. */
const closeAll = async (ref: WorkspaceRef): Promise<void> => {
  const inners = await stopNow(ref);
  // A place, a person's own folder, has no stand-ins: an empty dir there at a
  // deny path is theirs. A Linux view's go with its upper (layer.ts), which
  // an archive takes away before its boundary closes: its path is then the
  // person's folder alone, and nothing there is the workspace's.
  if (
    process.platform === "linux" &&
    !isPlace(ref.id) &&
    ownFolderSync(ref.id, ref.path)
  ) {
    if (await sandboxesGone(inners)) {
      // Only once no sandbox holds a mount on them: each goes if it is still
      // exactly as it was made (`stand-ins.ts`).
      await removeStandIns(ref).catch((error: unknown) => {
        console.warn(
          `[workspace] ${ref.id}: its clone's deny stand-ins could not be taken away: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    } else {
      console.warn(
        `[workspace] ${ref.id}: its sandbox was still there ${STOP_TIMEOUT_MS / 1000}s after it was stopped, so its clone's deny stand-ins are left`
      );
    }
  }
  await removeTree(stateDir(ref.id));
  // Its scratch dir, with whatever its commands left there, and its short
  // name on macOS when it names that dir (the link alone).
  await removeTree(scratchOf(ref.id));
  forgetWorkspaceTmp(ref.id);
  // Its sockets' dir, once nothing listens there (`workspaceDoorDir`).
  await removeTree(workspaceDoorDir(ref.id));
};

/** Waits for each sandbox init in `inners` to be gone, up to {@link STOP_TIMEOUT_MS}; answers whether all are. */
export const sandboxesGone = async (
  inners: readonly number[]
): Promise<boolean> =>
  await until(() => !inners.some((pid) => existsSync(`/proc/${pid}`)), {
    deadline: Date.now() + STOP_TIMEOUT_MS,
    every: 20,
  });
