/**
 * Move files: a project's folder, every file in it, to another folder or
 * computer (TOM T2), as the project details card asks for it. The hub's
 * route is built by its own item ("Build Move files on the hub"), which
 * fills these bodies in; until it lands each one says so.
 */
import type {
  MovePlan,
  MoveResult,
  MoveRun,
} from "@cawco/core/project-folders";

const notBuilt = (): Promise<never> =>
  Promise.reject(new Error("Not built yet"));

/** What moving the folder `placeId` to `to` would do, before anything runs. */
export const previewMove = (
  _projectId: string,
  _placeId: string,
  _to: { machineId: string; path: string }
): Promise<MovePlan> => notBuilt();

/** Moves the folder `placeId` to `to`; `summaries` are the agents asked to continue from a summary. */
export const startMove = (
  _projectId: string,
  _placeId: string,
  _to: { machineId: string; path: string; summaries: string[] }
): Promise<MoveRun> => notBuilt();

/** Where the move `moveId` stands: running, or what it did. */
export const readMove = (_moveId: string): Promise<MoveRun | MoveResult> =>
  notBuilt();

/** Interrupts an agent in the middle of a reply, so the move goes on now. */
export const interruptSession = (_sessionId: string): Promise<void> =>
  notBuilt();

/** Calls the move off before the old folder starts to be removed: what that left. */
export const callOffMove = (_moveId: string): Promise<MoveResult> => notBuilt();

/** Runs the stage the move failed at again. */
export const retryMoveStep = (_moveId: string): Promise<MoveRun> => notBuilt();
