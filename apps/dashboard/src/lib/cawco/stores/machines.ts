/**
 * The acts on a machine and its workspaces: a control call or a file read
 * through the tunnel, a pause, a removal, a workspace archived; and the
 * fleet fetches a machine reports while this page listens.
 */

import type { Bounded } from "@cawco/core/bounded";
import type { FleetFetchFrame } from "@cawco/core/frames";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { hubRequest } from "@cawco/core/hub-request";
import type { ControlPayload, FsPayload } from "@cawco/core/protocol";
import { machineWords } from "@cawco/core/words/machine";
import { sidebarWords } from "@cawco/core/words/sidebar";
import type { WorkspaceHolding } from "@cawco/core/workspace/controls";
import { CONTROL_TIMEOUT_MS } from "#lib/config.js";
import { hubFetch, hubRefusal } from "#lib/platform/hub-read.js";
import { newId } from "#lib/platform/id.js";
import { askMachine } from "../hub/control";
import type { FrameOf } from "../hub/frames";
import { rereadHub, send, waitForHub } from "../hub/socket.svelte";
import { loadCatalog } from "./catalog.svelte";

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
export async function machineControl<T>(
  machineId: string,
  method: string,
  args: unknown[] = [],
  replyTimeoutMs = CONTROL_TIMEOUT_MS,
  harness?: HarnessKind
): Promise<Bounded<T>> {
  await waitForHub();
  const requestId = newId();
  const payload: ControlPayload = {
    requestId,
    method,
    args,
    ...(harness && { harness }),
  };
  return askMachine<T>(machineId, requestId, replyTimeoutMs, () =>
    send({ verb: "control", machineId, requestId, payload })
  );
}

/**
 * The `fs` verb (NEW.md §6): a machine's files, for the docs rail and the light
 * markdown editing on top of it. Answered by `requestId` like a control call.
 */
export async function machineFs<T>(
  machineId: string,
  op: FsPayload["op"],
  path: string,
  content?: string,
  /** `path` is relative to this root, as the machine places it (`FsPayload.root`). */
  root?: FsPayload["root"]
): Promise<Bounded<T>> {
  await waitForHub();
  const requestId = newId();
  const payload: FsPayload = {
    requestId,
    op,
    path,
    content,
    ...(root ? { root } : {}),
  };
  return askMachine<T>(machineId, requestId, CONTROL_TIMEOUT_MS, () =>
    send({ verb: "fs", machineId, requestId, payload })
  );
}

/** Who hears `fleet.fetch` frames, and is told when the socket that carries them drops. */
interface FleetFetchListener {
  dropped: () => void;
  heard: (frame: FleetFetchFrame) => void;
}

export const fleetFetchListeners = new Set<FleetFetchListener>();

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
  const response = await hubFetch(
    hubRequest("DELETE /api/agents/:machineId", { path: { machineId } })
  );
  if (!response.ok) {
    throw await hubRefusal(response, machineWords.notRemovedThen);
  }
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
  const path = { machineId };
  const response = await hubFetch(
    until
      ? hubRequest("POST /api/machines/:machineId/pause", {
          path,
          body: { until: until.toISOString() },
        })
      : hubRequest("POST /api/machines/:machineId/resume", { path })
  );
  if (!response.ok) {
    throw await hubRefusal(response, machineWords.pauseNotChangedThen);
  }
  await rereadHub();
}

/**
 * Deletes a session's transcript on its machine — the one way a transcript is
 * deleted, from a stored row or a sleeping one. The hub sees the delete go
 * past and, once the machine confirms it, drops every row that named it; the
 * catalog is read again here so the stored list agrees.
 */
export async function deleteTranscript(
  machineId: string,
  sessionId: string,
  dir: string | undefined,
  harness: HarnessKind | undefined
): Promise<Bounded<void>> {
  const deleted = await machineControl<void>(
    machineId,
    "deleteSession",
    [sessionId, { dir }],
    undefined,
    harness
  );
  await loadCatalog(machineId);
  return deleted;
}

/**
 * Removes a session that never started: no transcript, no process. The hub
 * refuses any other kind and says why; that answer is thrown as it is, for
 * the confirm dialog to show under its question.
 */
/** What a held workspace's clone holds that is nowhere else, as its machine read it once its boundary was closed (hub workspaces.ts `HeldWork`). */
export interface WorkspaceHeld extends WorkspaceHolding {
  /** In words: "2 commits on no remote, 3 changed files, 1 stash". */
  holds: string;
  machine: string;
  path: string;
  /** The clone's size on disk, in words. */
  size: string;
}

/** Reads what a held workspace holds that is nowhere else (`GET /api/workspaces/:id/held`); the hub's refusal (one not held) is the error. */
export async function workspaceHeld(
  workspaceId: string
): Promise<WorkspaceHeld> {
  const response = await hubFetch(
    hubRequest("GET /api/workspaces/:id/held", { path: { id: workspaceId } })
  );
  if (!response.ok) {
    throw await hubRefusal(response, sidebarWords.heldUnreadThen);
  }
  return (await response.json()) as WorkspaceHeld;
}

/**
 * What a workspace serves that still waits on the person, each by its id
 * and title (`GET /api/workspaces/:id/waiting`): what its archive's confirm
 * names, as confirming archives it anyway. None when the read fails: the
 * hub refuses an archive it wasn't told was confirmed, in its own words.
 */
export async function workspaceWaiting(
  workspaceId: string
): Promise<{ id: string; title: string }[]> {
  const response = await hubFetch(
    hubRequest("GET /api/workspaces/:id/waiting", { path: { id: workspaceId } })
  ).catch(() => null);
  if (!response?.ok) {
    return [];
  }
  return (
    (await response.json()) as { waiting: { id: string; title: string }[] }
  ).waiting;
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
  const response = await hubFetch(
    hubRequest("POST /api/workspaces/:id/archive", {
      path: { id: workspaceId },
      body: { discard, anyway },
    })
  );
  if (!response.ok) {
    throw await hubRefusal(response, sidebarWords.notArchivedThen);
  }
  await rereadHub();
}

export async function removeSession(instanceId: string): Promise<void> {
  const response = await hubFetch(
    hubRequest("DELETE /api/instances/:id", { path: { id: instanceId } })
  );
  if (!response.ok) {
    throw await hubRefusal(response, sidebarWords.sessionNotRemovedThen);
  }
  await rereadHub();
}
