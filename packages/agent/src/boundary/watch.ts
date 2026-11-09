/**
 * The watchers on a workspace's clone, its parent and its srt host, which stop
 * or restart a boundary when what it holds goes.
 */

import { type FSWatcher, lstatSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { HOST_FILES, HOST_GONE_STATUS } from "./protocol";
import {
  generationDir,
  type Held,
  isClosing,
  isStarting,
  keepers,
  READY,
  readHeld,
} from "./state";
import { settleGonePlace, stopBoundary } from "./stop";
import { ensureAgain } from "./unasked";

/** Each boundary's srt host or Seatbelt runner followed ({@link watchHost}), by its proc id, with the connection it is followed on. */
const watchedHosts = new Map<string, SessiondClient>();

/** Each boundary's watch of its clone's `info/exclude` ({@link keepListed}), by its proc id: what ends it. */
const standInWatches = new Map<string, () => void>();

/**
 * Keeps CawCo's stand-ins listed in the `info/exclude` of a workspace's own
 * clone for as long as boundary `held` runs (stand-ins.ts
 * `keepStandInsListed`), whatever else writes that file; a place, or a
 * folder a Linux view overlays, has none listed.
 */
const keepListed = (id: string, held: Pick<Held, "gen" | "path">): void => {
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

/** The proc ids of macOS boundaries stopped because their folder went: their exit is no unasked one ({@link restartUnasked}). */
const goneStops = new Set<string>();

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
const unwatchCloneOf = (procId: string): void => {
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
 * Records each restart of generation `held`'s sandbox its srt host recorded
 * (protocol.ts `HOST_FILES.restarts`) that workspace `id`'s decisions do not hold
 * yet, as a `host-restarted` decision ({@link BoundaryDecision}).
 */
const recordHostRestarts = async (
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

/** How soon after one unasked start a second is not made ({@link restartUnasked}). Ours: a minute is longer than any start, and short enough that a later crash is started again. */
const UNASKED_RESTART_MS = 60_000;

/** When each workspace's boundary was last started again unasked ({@link restartUnasked}). */
const unaskedAt = new Map<string, number>();

/**
 * The workspaces with a live work item on this machine, as the hub said on
 * its last answer to a beat (`HeartbeatAckPayload.liveWorkspaces`); none yet
 * until it has said, and nothing closes until then.
 */
let hubLive: ReadonlySet<string> | undefined;

/** What {@link hubLive} holds now. */
export const hubLiveNow = (): ReadonlySet<string> | undefined => hubLive;

/** Takes the hub's list of workspaces with a live work item ({@link hubLive}); anything but a list is ignored. */
export const liveWorkItems = (ids: unknown): void => {
  if (Array.isArray(ids)) {
    hubLive = new Set(ids.filter((id): id is string => typeof id === "string"));
  }
};

/**
 * Follows workspace `id`'s boundary `held`, its srt host on Linux and its
 * Seatbelt runner on macOS, on whichever keeper holds it. Says in the
 * agent's log each line it says after it is ready: on Linux above all a
 * sandbox the host starts again because a guarded path changed on the host,
 * which ends everything in the workspace (`boundary-host.ts`). Its stderr
 * the keeper drains unread, so these lines are the one record of it.
 * From `afterSeq` (its ready line, so nothing is missed between the start and
 * this), or from now for a boundary an earlier agent started. A watch lives
 * on its keeper connection, so a new connection watches again. A host that
 * exits unasked has its boundary started again ({@link restartUnasked}).
 */
export const watchHost = async (
  id: string,
  held: Pick<Held, "gen" | "path" | "pid">,
  afterSeq?: number
): Promise<void> => {
  const procId = boundaryProcId(id, held.gen);
  const proc = await keepers.holding(procId);
  if (!proc || watchedHosts.get(procId) === proc.client) {
    return;
  }
  const { client } = proc;
  watchedHosts.set(procId, client);
  watchCloneOf(id, held);
  keepListed(id, held);
  let stop = (): void => undefined;
  stop = client.subscribe(
    procId,
    {
      line: (event) => {
        const text = event.data.trim();
        if (text && text !== READY) {
          console.info(
            `[workspace] ${id}: its boundary ${held.pid} says: ${text}`
          );
          // Each restart the host says it records first (its `restarts`
          // file); the agent's record of it follows, from that record.
          recordHostRestarts(id, held).catch((error: unknown) => {
            console.warn(
              `[workspace] ${id}: its boundary ${held.pid}'s restarts could not be recorded: ${error instanceof Error ? error.message : String(error)}`
            );
          });
        }
      },
      exit: (exitCode, signal, pid) => {
        // Whatever ended it, the agent's own close or the host's own exit
        // (its sandbox ended, an OOM kill): the one record of the latter.
        console.info(
          `[workspace] ${id}: its boundary ${held.pid} (${procId}) exited, ${signal ? `killed by ${signal}` : `status ${exitCode ?? "unknown"}`}`
        );
        if (watchedHosts.get(procId) === client) {
          watchedHosts.delete(procId);
        }
        stop();
        unwatchCloneOf(procId);
        standInWatches.get(procId)?.();
        standInWatches.delete(procId);
        client.release(procId, pid);
        // A macOS boundary the agent stopped as its folder went exits as the
        // host's gone exit does ({@link watchCloneOf}).
        const stoppedAsGone = goneStops.delete(procId);
        if (exitCode === HOST_GONE_STATUS || stoppedAsGone) {
          // Its folder is gone: no start would hold it (lifecycle.ts `placeReady`).
          settleGonePlace({ id, path: held.path }).catch((error: unknown) => {
            console.warn(
              `[workspace] ${id}: its boundary ${held.pid} closed as its folder ${held.path} went, and the place could not be settled: ${error instanceof Error ? error.message : String(error)}`
            );
          });
          return;
        }
        restartUnasked(id, held).catch((error: unknown) => {
          console.warn(
            `[workspace] ${id}: its boundary ${held.pid} ended unasked and could not be started again: ${error instanceof Error ? error.message : String(error)}`
          );
        });
      },
    },
    afterSeq
  );
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
 * agent's start (lifecycle.ts `readWorkspaces` watches every running one then);
 * again for every folder once one is found gone ({@link lookAgainEverywhere});
 * and on each quiet sweep ({@link watchQuietBoundaries}), as macOS's
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

/**
 * A BOUNDARY THAT ENDS UNASKED IS STARTED AGAIN WHILE ITS RECORD STANDS, on
 * Linux and macOS alike. Its srt host or Seatbelt runner exited, and nothing
 * of the agent's ended it: no close or start of
 * the workspace's is under way ({@link closing}, {@link starting}), and its
 * record (`boundary.json`) still names this generation, which every close
 * takes away and every replacement names anew. Its sessions' commands would
 * otherwise each be refused until the workspace's next session
 * (exec.ts `stoppedLine`): a sandbox that ended (its runner gone, an OOM
 * kill), its host or runner signalled, its host's own close. The start
 * stops what the generation before left (on macOS, what answers to its
 * name, which outlives its runner there: lifecycle.ts `stopUnvouched`). The
 * executor waits for the new one ({@link execScript}). A clone gone is refused at the start, as
 * any start refuses it. One that ends unasked again within {@link
 * UNASKED_RESTART_MS} of its last such start is left down, said: a sandbox
 * that cannot stay up is not started in a loop, and the workspace's next
 * session starts it.
 */
const restartUnasked = async (
  id: string,
  held: Pick<Held, "gen" | "path" | "pid">
): Promise<void> => {
  if (isClosing(id) || isStarting(id)) {
    return;
  }
  const now = await readHeld(id).catch(() => undefined);
  if (now?.gen !== held.gen) {
    return;
  }
  const last = unaskedAt.get(id);
  if (last !== undefined && Date.now() - last < UNASKED_RESTART_MS) {
    console.warn(
      `[workspace] ${id}: its boundary ${held.pid} ended unasked again within ${UNASKED_RESTART_MS / 1000}s of being started again, so it is left down; the workspace's next session starts it`
    );
    await recordDecision(id, {
      ...decided({ form: now?.form, gen: held.gen, pid: held.pid }),
      decision: "left-down",
    });
    return;
  }
  unaskedAt.set(id, Date.now());
  console.info(
    `[workspace] ${id}: its boundary ${held.pid} ended unasked while its record stands, so it starts again`
  );
  const fresh = await ensureAgain({ id, path: held.path });
  console.info(
    `[workspace] ${id}: its boundary ${held.pid} is started again as ${fresh.pid}`
  );
  const record = await readHeld(id).catch(() => undefined);
  await recordDecision(id, {
    ...decided({ form: now?.form, gen: held.gen, pid: held.pid }),
    decision: "restarted-unasked",
    to: decided({
      form: record?.form,
      gen: record?.gen ?? "",
      pid: fresh.pid,
    }),
  });
};
