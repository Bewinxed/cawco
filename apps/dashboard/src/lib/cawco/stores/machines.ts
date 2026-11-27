/**
 * The acts on a machine and its workspaces: a control call or a file read
 * through the tunnel, a pause, a removal, a workspace archived; and the
 * fleet fetches a machine reports while this page listens.
 */

import type { Bounded } from "@cawco/core/bounded";
import {
  CONTROL_GH_REPO,
  CONTROL_GH_REPOS,
  type GhRepoList,
  type GhRepoLookup,
} from "@cawco/core/connections";
import {
  CONTROL_REPLIES,
  type ControlReply,
  FS_REPLIES,
  type FsOp,
  type FsReply,
} from "@cawco/core/control-replies";
import type { ControlArgs, ControlName } from "@cawco/core/control-table";
import type { FleetFetchFrame } from "@cawco/core/frames";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { FsPayload } from "@cawco/core/protocol";
import { knowsNotControl } from "@cawco/core/session/controls";
import { machineWords } from "@cawco/core/words/machine";
import { sidebarWords } from "@cawco/core/words/sidebar";
import { hub } from "#lib/platform/hub.js";
import { hubData, hubDone, hubRefusal } from "#lib/platform/hub-read.js";
import { newId } from "#lib/platform/id.js";
import { askMachine, askOf, readReply } from "../hub/control";
import type { FrameOf } from "../hub/frames";
import {
  rereadHub,
  send,
  standingBench,
  waitForHub,
} from "../hub/socket.svelte";

export function takeFleetFetch(frame: FrameOf<"fleet.fetch">): void {
  for (const listener of fleetFetchListeners) {
    listener.heard(frame);
  }
}

/**
 * A control call about the machine rather than a session — the SDK's module-level
 * session functions. The reply is correlated by `requestId`, which the hub routes
 * back to this socket alone.
 */
export async function machineControl<K extends ControlName>(
  machineId: string,
  method: K,
  args: ControlArgs<K>,
  harness?: HarnessKind
): Promise<Bounded<ControlReply<K>>> {
  const benchControl = standingBench()?.control;
  if (import.meta.env.DEV && benchControl) {
    // A bench's machine answers it in place of the wire (dev only), read
    // as the wire's answer is.
    return {
      kind: "answered",
      value: readReply(
        CONTROL_REPLIES[method],
        method,
        await benchControl(machineId, method, args)
      ),
    };
  }
  await waitForHub();
  return await askMachine(machineId, method, args, harness ? { harness } : {});
}

/**
 * The `fs` verb (NEW.md §6): a machine's files, for the docs rail and the light
 * markdown editing on top of it. Answered by `requestId` like a control call.
 */
export async function machineFs<O extends FsOp>(
  machineId: string,
  op: O,
  path: string,
  content?: string,
  /** `path` is relative to this root, as the machine places it (`FsPayload.root`). */
  root?: FsPayload["root"]
): Promise<Bounded<FsReply<O>>> {
  const benchFs = standingBench()?.fs;
  if (import.meta.env.DEV && benchFs && !root) {
    // A bench's machine answers it in place of the wire (dev only), read
    // as the wire's answer is.
    return {
      kind: "answered",
      value: readReply(
        FS_REPLIES[op],
        `fs ${op}`,
        await benchFs(machineId, op, path)
      ),
    };
  }
  await waitForHub();
  const requestId = newId();
  const payload: FsPayload = {
    requestId,
    op,
    path,
    content,
    ...(root ? { root } : {}),
  };
  return await askOf(
    machineId,
    requestId,
    () => send({ verb: "fs", machineId, requestId, payload }),
    (result) => readReply(FS_REPLIES[op], `fs ${op}`, result)
  );
}

/**
 * What {@link machineRepos} reads: the machine's answer, or `old-daemon`
 * when its CawCo is from before the control and said it has none of it, so
 * asking again finds nothing until it is updated.
 */
export type MachineRepos = GhRepoList | { kind: "old-daemon" };

/**
 * The GitHub repositories machine `machineId`'s gh sees, latest updated
 * first (core `CONTROL_GH_REPOS`), for the New session form's repository
 * picker.
 */
export async function machineRepos(
  machineId: string
): Promise<Bounded<MachineRepos>> {
  try {
    return await machineControl(machineId, CONTROL_GH_REPOS, []);
  } catch (error) {
    if (knowsNotControl(error, CONTROL_GH_REPOS)) {
      return { kind: "answered", value: { kind: "old-daemon" } };
    }
    throw error;
  }
}

/**
 * What {@link machineRepo} reads: the machine's answer, or `old-daemon` as
 * {@link MachineRepos} has it.
 */
export type MachineRepo = GhRepoLookup | { kind: "old-daemon" };

/**
 * The repository at git URL `url` as machine `machineId` sees it (core
 * `CONTROL_GH_REPO`), for the repository picker's row of a pasted URL.
 */
export async function machineRepo(
  machineId: string,
  url: string
): Promise<Bounded<MachineRepo>> {
  try {
    return await machineControl(machineId, CONTROL_GH_REPO, [url]);
  } catch (error) {
    if (knowsNotControl(error, CONTROL_GH_REPO)) {
      return { kind: "answered", value: { kind: "old-daemon" } };
    }
    throw error;
  }
}

/** Who hears `fleet.fetch` frames, and is told when the socket that carries them drops. */
interface FleetFetchListener {
  dropped: () => void;
  heard: (frame: FleetFetchFrame) => void;
}

const fleetFetchListeners = new Set<FleetFetchListener>();

/**
 * Hears each `fleet.fetch` frame: a skill or plugin fetch at the hub began
 * or landed, with its row whole. `dropped` runs when the socket closes, as a
 * fetch that lands meanwhile is never heard. Returns the unsubscribe.
 */
export function onFleetFetch(listener: FleetFetchListener): () => void {
  fleetFetchListeners.add(listener);
  return () => fleetFetchListeners.delete(listener);
}

/**
 * Forgets an offline machine: its row, its projects and its session rows. The
 * hub refuses a machine that is online, and says why; that answer is thrown
 * as it is, for the confirm dialog to show under its question.
 */
export async function removeMachine(machineId: string): Promise<void> {
  await hubDone(hub.api.agents({ machineId }).delete(), (refused) =>
    hubRefusal(refused, machineWords.notRemovedThen)
  );
  await rereadHub();
}

/**
 * Pauses a machine until `until` (hub machine-pause.ts): its turns stop and
 * nothing starts there until then; or, with `until` null, ends its pause
 * now. The hub's refusal is thrown in its words.
 */
export async function pauseMachine(
  machineId: string,
  until: Date | null
): Promise<void> {
  const machine = hub.api.machines({ machineId });
  await hubDone(
    until
      ? machine.pause.post({ until: until.toISOString() })
      : machine.resume.post(),
    (refused) => hubRefusal(refused, machineWords.pauseNotChangedThen)
  );
  await rereadHub();
}

/**
 * Deletes a session's transcript on its machine — the one way a transcript is
 * deleted, from a stored row or a sleeping one. The hub sees the delete go
 * past and, once the machine confirms it, drops every row that named it; the
 * machine tells the hub its transcript went, and the stored list follows
 * (hub stored-recent.ts).
 */
export async function deleteTranscript(
  machineId: string,
  sessionId: string,
  dir: string | undefined,
  harness: HarnessKind | undefined
): Promise<Bounded<void>> {
  return await machineControl(
    machineId,
    "deleteSession",
    [sessionId, { dir }],
    harness
  );
}

/**
 * Reads what a held workspace's clone holds that is nowhere else, as its
 * machine read it once its boundary was closed (hub workspaces.ts
 * `HeldWork`); the hub's refusal (one not held) is the error.
 */
export const workspaceHeld = (workspaceId: string) =>
  hubData(hub.api.workspaces({ id: workspaceId }).held.get(), (refused) =>
    hubRefusal(refused, sidebarWords.heldUnreadThen)
  );

/**
 * What a workspace serves that still waits on the person, each by its id
 * and title (`GET /api/workspaces/:id/waiting`): what its archive's confirm
 * names, as confirming archives it anyway. None when the read fails: the
 * hub refuses an archive it wasn't told was confirmed, in its own words.
 */
export async function workspaceWaiting(workspaceId: string) {
  const read = await hubData(
    hub.api.workspaces({ id: workspaceId }).waiting.get()
  ).catch(() => null);
  return read?.waiting ?? [];
}

/**
 * Archives a workspace through the hub (`POST /api/workspaces/:id/archive`):
 * its machine kills the boundary with everything in it and deletes the
 * clone and its records, a damaged one among them. The hub's refusal (a live
 * item there, or work in the clone that is nowhere else, which holds it) is
 * the error. `discard` lets that work go: its machine saves its unlanded
 * commits, changes and stashes to a carry first. Files git ignores go with
 * the clone. `anyway`: the person confirmed it knowing what still waits on
 * him there ({@link workspaceWaiting}), which the hub otherwise refuses.
 */
export async function archiveWorkspace(
  workspaceId: string,
  {
    discard = false,
    anyway = false,
  }: { discard?: boolean; anyway?: boolean } = {}
): Promise<void> {
  await hubDone(
    hub.api.workspaces({ id: workspaceId }).archive.post({ discard, anyway }),
    (refused) => hubRefusal(refused, sidebarWords.notArchivedThen)
  );
  await rereadHub();
}

export async function removeSession(instanceId: string): Promise<void> {
  await hubDone(hub.api.instances({ id: instanceId }).delete(), (refused) =>
    hubRefusal(refused, sidebarWords.sessionNotRemovedThen)
  );
  await rereadHub();
}

/** The socket closed: every fleet fetch this page listens to hears its link dropped. */
export function dropFleetFetches(): void {
  for (const listener of fleetFetchListeners) {
    listener.dropped();
  }
}
