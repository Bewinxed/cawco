/**
 * Move files: a project's folder, every file in it, to another folder or
 * computer (TOM T2), as the project details card asks for it, through the
 * hub's job (hub folder-moves.ts, routes/folder-moves.ts). The job runs on
 * the hub whatever happens to the card; the card reads where it stands.
 */
import type {
  MovePlan,
  MoveResult,
  MoveRun,
} from "@cawco/core/project-folders";
import type { HubClient } from "@cawco/hub/client";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";

/** What moving the folder `placeId` to `to` would do, before anything runs. */
export const previewMove = async (
  projectId: string,
  placeId: string,
  to: { machineId: string; path: string },
  client: HubClient = hub
): Promise<MovePlan> =>
  await hubData(
    client.api
      .projects({ id: projectId })
      .places({ placeId })
      ["move-preview"].get({ query: to })
  );

/** Moves the folder `placeId` to `to`; `summaries` are the agents asked to continue from a summary. */
export const startMove = async (
  projectId: string,
  placeId: string,
  to: { machineId: string; path: string; summaries: string[] },
  client: HubClient = hub
): Promise<MoveRun> =>
  await hubData(
    client.api.projects({ id: projectId }).places({ placeId }).move.post(to)
  );

/** Where the move `moveId` stands: running, or what it did. */
export const readMove = async (
  moveId: string,
  client: HubClient = hub
): Promise<MoveRun | MoveResult> =>
  await hubData(client.api["folder-moves"]({ moveId }).get());

/** Interrupts an agent in the middle of a reply, so the move goes on now. */
export const interruptSession = async (
  sessionId: string,
  client: HubClient = hub
): Promise<void> => {
  await hubData(
    client.api["folder-moves"].interrupt({ instanceId: sessionId }).post()
  );
};

/** Calls the move off before the project is recorded at the new folder: what that left. */
export const callOffMove = async (
  moveId: string,
  client: HubClient = hub
): Promise<MoveResult> =>
  await hubData(client.api["folder-moves"]({ moveId }).delete());

/** Runs the stage the move failed at again, or the removal of what it left. */
export const retryMoveStep = async (
  moveId: string,
  client: HubClient = hub
): Promise<MoveRun | MoveResult> =>
  await hubData(client.api["folder-moves"]({ moveId }).retry.post());
