/**
 * The pane's reads off the fleet store (pane-fleet.ts): the session panel
 * beside a conversation, where the app's one socket already holds them all.
 * The app's layout sets it for every pane under it.
 */

import type { FsEntry } from "@cawco/core/protocol";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";
import type { FolderReader } from "#lib/components/features/DirectoryPicker.svelte";
import { didntAnswer } from "../hub/control";
import { conversationHref } from "../links";
import { asksStore } from "../stores/asks.svelte";
import { boardStore } from "../stores/board.svelte";
import { browsersStore } from "../stores/browsers.svelte";
import { catalogStore } from "../stores/catalog.svelte";
import { machineFs } from "../stores/machines";
import { closePreview, previewsStore } from "../stores/previews.svelte";
import { paneDrafts } from "../transcript/composer-draft.svelte";
import { speakerName } from "../transcript/speaker";
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
    catalogStore
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
  boardStore.machines.map((machine) => ({
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
    const shown = previewsStore.previews[instanceId];
    const key =
      shown?.artifact.kind === "browser" &&
      shown.source &&
      "page" in shown.source
        ? shown.source.page
        : null;
    const machineId = boardStore.instanceIndex.byId.get(instanceId)?.machineId;
    return (
      (key &&
        browsersStore.browsers?.find(
          (one) => one.key === key && one.machineId === machineId
        )) ||
      null
    );
  },
  preview: (instanceId) => previewsStore.previews[instanceId],
  session: (instanceId) => boardStore.instanceIndex.byId.get(instanceId),
  get machines() {
    return machines;
  },
  working: (instanceId) => asksStore.activityOf(instanceId) === "working",
  sessionHref: (instanceId) =>
    conversationHref(instanceId, boardStore.instanceIndex),
  closePreview,
  // The conversation's composer beside the pane, while it stands.
  composer: (instanceId) => {
    const draft = paneDrafts.get(instanceId);
    return draft
      ? {
          agent: speakerName(
            boardStore.instanceIndex.byId.get(instanceId)?.harness
          ),
          ask: (words) => draft.ask(words),
        }
      : undefined;
  },
  folders: fleetFolders,
};
