/**
 * The watchers on a workspace's clone, its parent and its srt host, which stop
 * or restart a boundary when what it holds goes.
 */

import { type FSWatcher, lstatSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { isPlace } from "@cawco/core/workspace-policy";
import { isGitDirSync } from "../git-dir";
import { folderSync, ownFolderSync } from "../layer";
import { boundaryProcId, isBoundaryOf } from "../proc-id";
import { keepStandInsListed } from "../stand-ins";
import { attachedIn, commandsNow, hubLiveNow } from "./holding";
import { executors } from "./processes";
import { type Held, procsHeld } from "./state";
import { stopBoundary } from "./stop";

/** Each boundary's watch of its clone's `info/exclude` ({@link keepListed}), by its proc id: what ends it. */
const standInWatches = new Map<string, () => void>();

/**
 * Keeps CawCo's stand-ins listed in the `info/exclude` of a workspace's own
 * clone for as long as boundary `held` runs (stand-ins.ts
 * `keepStandInsListed`), whatever else writes that file; a place, or a
 * folder a Linux view overlays, has none listed.
 */
export const keepListed = (
  id: string,
  held: Pick<Held, "gen" | "path">
): void => {
  const procId = boundaryProcId(id, held.gen);
  if (
    standInWatches.has(procId) ||
    isPlace(id) ||
    !ownFolderSync(id, held.path)
  ) {
    return;
  }
  standInWatches.set(procId, () => undefined);
  keepStandInsListed({ id, path: held.path })
    .then((end) => {
      if (standInWatches.has(procId)) {
        standInWatches.set(procId, end);
      } else {
        end();
      }
    })
    .catch((error: unknown) => {
      standInWatches.delete(procId);
      console.warn(
        `[workspace] ${id}: its clone's info/exclude could not be watched for its stand-ins: ${error instanceof Error ? error.message : String(error)}`
      );
    });
};

/** Ends boundary `procId`'s watch of its clone's `info/exclude` ({@link keepListed}). */
export const endKeepingListed = (procId: string): void => {
  standInWatches.get(procId)?.();
  standInWatches.delete(procId);
};

/** Each macOS boundary's watch of the folder it holds ({@link watchCloneOf}), by its proc id: what ends it. */
const cloneWatches = new Map<string, (() => void)[]>();

/**
 * One watch of each folder that holds a watched folder (lifecycle.ts `watchCloneOf`),
 * shared by every boundary whose folder is in it, with each one's look:
 * clones are cut side by side in one folder, and one watch of it says every
 * entry that leaves.
 */
const parentWatches = new Map<
  string,
  { looks: Set<() => void>; watcher: FSWatcher }
>();

/** How long after a parent folder's last event its looks run once more ({@link watchParent}). Ours: past a burst of deletions, well inside a boundary's close. */
const PARENT_SETTLE_MS = 500;

/** `look` run on every change in `dir` ({@link parentWatches}); what stops it. */
const watchParent = (dir: string, look: () => void): (() => void) => {
  let entry = parentWatches.get(dir);
  if (!entry) {
    const looks = new Set<() => void>();
    const lookAll = (): void => {
      for (const one of [...looks]) {
        one();
      }
    };
    // macOS gathers a burst of changes into fewer events than there were
    // changes: three clones deleted one after another came as events read
    // while the last was still there, and none after it went. So each event
    // is looked at now and once more as the burst has settled.
    let settled: ReturnType<typeof setTimeout> | undefined;
    const all = (): void => {
      lookAll();
      clearTimeout(settled);
      settled = setTimeout(lookAll, PARENT_SETTLE_MS);
      settled.unref();
    };
    entry = { looks, watcher: watch(dir, all).on("error", all) };
    parentWatches.set(dir, entry);
  }
  const shared = entry;
  shared.looks.add(look);
  return () => {
    shared.looks.delete(look);
    if (shared.looks.size === 0 && parentWatches.get(dir) === shared) {
      shared.watcher.close();
      parentWatches.delete(dir);
    }
  };
};

/** The proc ids of macOS boundaries stopped because their folder went: their exit is no unasked one (ensure.ts `restartUnasked`). */
const goneStops = new Set<string>();

/** Whether boundary `procId` stopped because its folder went ({@link goneStops}): the mark goes with the asking. */
export const stoppedAsGone = (procId: string): boolean =>
  goneStops.delete(procId);

/** Whether workspace `id` holds a plain folder, not a repository's copy: a place, or a copy of a folder that is no repository (layer.ts), as the host's `plainFolder` (boundary-host.ts). */
const plainFolder = (id: string): boolean => isPlace(id) || folderSync(id);

/**
 * Why workspace `id`'s folder at `path` is no longer there to hold, when it
 * is not, as the Linux host's `goneReason` reads it (boundary-host.ts): a
 * delegate's copy of a repository whose `.git` is no repository, or a plain
 * folder ({@link plainFolder}) that is no folder.
 */
const folderGone = (id: string, path: string): string | undefined => {
  if (plainFolder(id)) {
    let folder = false;
    try {
      folder = lstatSync(path).isDirectory();
    } catch {
      // Not there: no folder.
    }
    return folder ? undefined : `${path} is not a folder`;
  }
  return isGitDirSync(join(path, ".git"))
    ? undefined
    : `${path} is not a git clone any more`;
};

/** Ends boundary `procId`'s folder watch ({@link watchCloneOf}). */
export const unwatchCloneOf = (procId: string): void => {
  for (const end of cloneWatches.get(procId) ?? []) {
    end();
  }
  cloneWatches.delete(procId);
  cloneLooks.delete(procId);
};

/** Each watched macOS boundary's look ({@link watchCloneOf}), by its proc id. */
const cloneLooks = new Map<string, () => void>();

/** Every watched macOS boundary's look run now ({@link watchCloneOf}). */
export const lookAtEveryFolder = (): void => {
  for (const look of [...cloneLooks.values()]) {
    look();
  }
};

/** The look of every watched folder pending after one was found gone ({@link lookAgainEverywhere}). */
let everywhere: ReturnType<typeof setTimeout> | undefined;

/**
 * Every watched folder looked at again once a burst has settled
 * ({@link PARENT_SETTLE_MS}), after one was found gone. macOS's watchers
 * miss deletions, whole folders' at times: of three clones deleted one
 * after another, its watcher of their parent said nothing, and of the
 * clones' own watchers only the first two's spoke. Folders deleted together
 * are found together this way, whichever one a watcher reported.
 */
const lookAgainEverywhere = (): void => {
  clearTimeout(everywhere);
  everywhere = setTimeout(() => {
    lookAtEveryFolder();
  }, PARENT_SETTLE_MS);
  everywhere.unref();
};

/**
 * What still holds workspace `ref` on this machine, in words, or nothing:
 * a live work item of the hub's (holding.ts `hubLive`; not known until the hub
 * answers a beat, and then everything holds it), a boundary of it alive on
 * any keeper, a session process in its clone ({@link attachedIn}), or a
 * command on its way in ({@link executors}). For a folder the agent would
 * take away without the hub asking.
 */
export const heldBy = async (
  ref: WorkspaceRef
): Promise<string | undefined> => {
  const hubLive = hubLiveNow();
  if (!hubLive) {
    return "the hub has not said yet which workspaces have a live work item";
  }
  if (hubLive.has(ref.id)) {
    return "its work item is live on the hub";
  }
  const procs = (await procsHeld()).filter((proc) => proc.alive);
  if (procs.some((proc) => isBoundaryOf(proc.procId, ref.id))) {
    return "a boundary of it runs";
  }
  const commands = await commandsNow();
  if (attachedIn(ref.id, ref.path, procs, commands)) {
    return "a session's process runs in it";
  }
  return executors(commands.lines, ref.id).length > 0
    ? "a command is on its way into it"
    : undefined;
};

/**
 * A FOLDER DELETED UNDER A RUNNING BOUNDARY CLOSES IT, ON MACOS TOO. On
 * Linux the srt host watches its clone and exits as it goes
 * (boundary-host.ts `watchClone`); a macOS boundary is a Seatbelt runner,
 * which watches nothing, so the agent watches its folder, the folder's
 * parent and its `.git` for it and stops it ({@link stopBoundary}) the moment {@link folderGone} says
 * so: its exit is then the host's gone exit's, never started again, and
 * nothing is made at the folder's path. Looked at once as the watch starts,
 * so a folder that went while no agent ran closes its boundary at the next
 * agent's start (ensure.ts `readWorkspaces` watches every running one then);
 * again for every folder once one is found gone ({@link lookAgainEverywhere});
 * and on each quiet sweep (looks.ts `watchQuietBoundaries`), as macOS's
 * watchers miss some deletions altogether.
 */
export const watchCloneOf = (
  id: string,
  held: Pick<Held, "gen" | "path" | "pid">
): void => {
  const procId = boundaryProcId(id, held.gen);
  if (process.platform !== "darwin" || cloneWatches.has(procId)) {
    return;
  }
  const ends: (() => void)[] = [];
  cloneWatches.set(procId, ends);
  const look = (): void => {
    const gone = folderGone(id, held.path);
    if (!gone || goneStops.has(procId)) {
      return;
    }
    goneStops.add(procId);
    unwatchCloneOf(procId);
    lookAgainEverywhere();
    console.info(
      `[workspace] ${id}: ${gone}, so its boundary ${held.pid} closes`
    );
    stopBoundary(id, held).catch((error: unknown) => {
      console.warn(
        `[workspace] ${id}: its boundary ${held.pid} could not be closed as its folder went: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  };
  // Every change in the folder, its parent or its `.git` is looked at: a look
  // is a stat or two, and the folder going is among them. Its parent above
  // all: macOS's watcher of a folder says nothing as that folder is deleted
  // (an `rm -r` of a clone: no event on the clone or its `.git`), and the
  // folder's going is an entry leaving its parent, which it says.
  const watched = (dir: string, begin: () => () => void): void => {
    try {
      ends.push(begin());
    } catch (error) {
      console.warn(
        `[workspace] ${id}: ${dir} could not be watched for its boundary ${held.pid}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  cloneLooks.set(procId, look);
  watched(dirname(held.path), () => watchParent(dirname(held.path), look));
  for (const dir of plainFolder(id)
    ? [held.path]
    : [held.path, join(held.path, ".git")]) {
    watched(dir, () => {
      const watcher = watch(dir, look).on("error", look);
      return () => watcher.close();
    });
  }
  look();
};
