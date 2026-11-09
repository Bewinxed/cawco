/**
 * The watchers on a workspace's clone, its parent and its srt host, which stop
 * or restart a boundary when what it holds goes.
 */

import { type FSWatcher, lstatSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { isPlace } from "@cawco/core/workspace-policy";
import { isGitDirSync } from "../git-dir";
import { folderSync, ownFolderSync } from "../layer";
import { boundaryProcId, isBoundaryOf } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { keepStandInsListed } from "../stand-ins";
import { decided, readDecisions, recordDecision } from "./decisions";
import { attachedIn, commandsNow } from "./holding";
import { executors } from "./processes";
import { HOST_FILES } from "./protocol";
import { generationDir, type Held, keepers } from "./state";

/** Each boundary's srt host or Seatbelt runner followed (lifecycle.ts `watchHost`), by its proc id, with the connection it is followed on. */
export const watchedHosts = new Map<string, SessiondClient>();

/** Each boundary's watch of its clone's `info/exclude` ({@link keepListed}), by its proc id: what ends it. */
export const standInWatches = new Map<string, () => void>();

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

/** Each macOS boundary's watch of the folder it holds (lifecycle.ts `watchCloneOf`), by its proc id: what ends it. */
export const cloneWatches = new Map<string, (() => void)[]>();

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
export const watchParent = (dir: string, look: () => void): (() => void) => {
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

/** The proc ids of macOS boundaries stopped because their folder went: their exit is no unasked one (lifecycle.ts `restartUnasked`). */
export const goneStops = new Set<string>();

/** Whether workspace `id` holds a plain folder, not a repository's copy: a place, or a copy of a folder that is no repository (layer.ts), as the host's `plainFolder` (boundary-host.ts). */
export const plainFolder = (id: string): boolean =>
  isPlace(id) || folderSync(id);

/**
 * Why workspace `id`'s folder at `path` is no longer there to hold, when it
 * is not, as the Linux host's `goneReason` reads it (boundary-host.ts): a
 * delegate's copy of a repository whose `.git` is no repository, or a plain
 * folder ({@link plainFolder}) that is no folder.
 */
export const folderGone = (id: string, path: string): string | undefined => {
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

/** Ends boundary `procId`'s folder watch (lifecycle.ts `watchCloneOf`). */
export const unwatchCloneOf = (procId: string): void => {
  for (const end of cloneWatches.get(procId) ?? []) {
    end();
  }
  cloneWatches.delete(procId);
  cloneLooks.delete(procId);
};

/** Each watched macOS boundary's look (lifecycle.ts `watchCloneOf`), by its proc id. */
export const cloneLooks = new Map<string, () => void>();

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
export const lookAgainEverywhere = (): void => {
  clearTimeout(everywhere);
  everywhere = setTimeout(() => {
    for (const look of [...cloneLooks.values()]) {
      look();
    }
  }, PARENT_SETTLE_MS);
  everywhere.unref();
};

/**
 * Records each restart of generation `held`'s sandbox its srt host recorded
 * (protocol.ts `HOST_FILES.restarts`) that workspace `id`'s decisions do not hold
 * yet, as a `host-restarted` decision ({@link BoundaryDecision}).
 */
export const recordHostRestarts = async (
  id: string,
  held: Pick<Held, "form" | "gen" | "pid">
): Promise<void> => {
  const text = await readFile(
    join(generationDir(id, held.gen), HOST_FILES.restarts),
    "utf8"
  ).catch(() => "[]");
  let restarts: unknown;
  try {
    restarts = JSON.parse(text);
  } catch {
    return;
  }
  if (!Array.isArray(restarts)) {
    return;
  }
  const known = new Set(
    (await readDecisions(id)).flatMap((one) =>
      one.decision === "host-restarted" && one.gen === held.gen
        ? [one.hostAt]
        : []
    )
  );
  for (const one of restarts as ({
    at?: unknown;
    inner?: unknown;
    path?: unknown;
  } | null)[]) {
    if (!one || typeof one.at !== "number" || known.has(one.at)) {
      continue;
    }
    known.add(one.at);
    await recordDecision(id, {
      ...decided(held),
      decision: "host-restarted",
      hostAt: one.at,
      inner: typeof one.inner === "number" ? one.inner : null,
      path: typeof one.path === "string" ? one.path : "",
    });
  }
};

/**
 * What still holds workspace `ref` on this machine, in words, or nothing:
 * a live work item of the hub's ({@link hubLive}; not known until the hub
 * answers a beat, and then everything holds it), a boundary of it alive on
 * any keeper, a session process in its clone ({@link attachedIn}), or a
 * command on its way in ({@link executors}). For a folder the agent would
 * take away without the hub asking.
 */
export const heldBy = async (
  ref: WorkspaceRef
): Promise<string | undefined> => {
  if (!hubLive) {
    return "the hub has not said yet which workspaces have a live work item";
  }
  if (hubLive.has(ref.id)) {
    return "its work item is live on the hub";
  }
  const procs = (await keepers.held()).filter((proc) => proc.alive);
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

/** How soon after one unasked start a second is not made (lifecycle.ts `restartUnasked`). Ours: a minute is longer than any start, and short enough that a later crash is started again. */
export const UNASKED_RESTART_MS = 60_000;

/** When each workspace's boundary was last started again unasked (lifecycle.ts `restartUnasked`). */
export const unaskedAt = new Map<string, number>();

/**
 * The workspaces with a live work item on this machine, as the hub said on
 * its last answer to a beat (`HeartbeatAckPayload.liveWorkspaces`); none yet
 * until it has said, and nothing closes until then.
 */
export let hubLive: ReadonlySet<string> | undefined;

/** Takes the hub's list of workspaces with a live work item ({@link hubLive}); anything but a list is ignored. */
export const liveWorkItems = (ids: unknown): void => {
  if (Array.isArray(ids)) {
    hubLive = new Set(ids.filter((id): id is string => typeof id === "string"));
  }
};
