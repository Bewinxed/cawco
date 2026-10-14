/**
 * The pane's reads off the fleet store (pane-fleet.ts): the session panel
 * beside a conversation, where the app's one socket already holds them all.
 * The app's layout sets it for every pane under it.
 */
import type { FsEntry, NeutralSessionInfo } from "@cawco/core";
import type { FolderReader } from "#lib/components/features/DirectoryPicker.svelte";
import { cawco, closePreview, machineFs } from "../client.svelte";
import { conversationHref } from "../links";
import type { PaneFleet, PaneMachine } from "./pane-fleet";

/** A machine's folders over the app's socket, opening on where it was working last. */
export const fleetFolders: FolderReader = {
  list: (machineId, path) => machineFs<FsEntry[]>(machineId, "list", path),
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
