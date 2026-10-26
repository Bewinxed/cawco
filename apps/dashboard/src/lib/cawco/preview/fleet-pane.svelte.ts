/**
 * The pane's reads off the fleet store (pane-fleet.ts): the session panel
 * beside a conversation, where the app's one socket already holds them all.
 * The app's layout sets it for every pane under it.
 */
import type { FsEntry, NeutralSessionInfo } from "@cawco/core";
import type { FolderReader } from "#lib/components/features/DirectoryPicker.svelte";
import { cawco, closePreview, didntAnswer, machineFs } from "../client.svelte";
import { conversationHref } from "../links";
import { TRY_AGAIN } from "../unanswered";
import type { PaneFleet, PaneMachine } from "./pane-fleet";

/** A machine's folders over the app's socket, opening on where it was working last. */
const fleetFolders: FolderReader = {
  list: (machineId, path) => machineFs<FsEntry[]>(machineId, "list", path),
  unanswered: (machineId, missed) =>
    didntAnswer(machineId, missed, {
      missed: "the folder's listing didn't come back",
      again: TRY_AGAIN,
    }),
  recent: (machineId) =>
    cawco
      .catalogOf(machineId)
      .reduce<NeutralSessionInfo | null>(
        (best, info) =>
          info.cwd && (!best || info.lastModified > best.lastModified)
            ? info
            : best,
        null
      )?.cwd ?? null,
};

const machines = $derived<PaneMachine[]>(
  cawco.machines.map((machine) => ({
    machineId: machine.machineId,
    hostname: machine.hostname,
    os: machine.os,
    online: machine.status === "online",
  }))
);

export const fleetPane: PaneFleet = {
  // A browser artifact's key is its page (core `ArtifactKind`), on the
  // session's machine: the hub's artifact-session frame reads it the same way.
  browser: (instanceId) => {
    const shown = cawco.previews[instanceId];
    const key =
      shown?.artifact.kind === "browser" &&
      shown.source &&
      "page" in shown.source
        ? shown.source.page
        : null;
    const machineId = cawco.instanceIndex.byId.get(instanceId)?.machineId;
    return (
      (key &&
        cawco.browsers?.find(
          (one) => one.key === key && one.machineId === machineId
        )) ||
      null
    );
  },
  preview: (instanceId) => cawco.previews[instanceId],
  session: (instanceId) => cawco.instanceIndex.byId.get(instanceId),
  get machines() {
    return machines;
  },
  working: (instanceId) => cawco.activityOf(instanceId) === "working",
  sessionHref: (instanceId) =>
    conversationHref(instanceId, cawco.instanceIndex),
  closePreview,
  folders: fleetFolders,
};
