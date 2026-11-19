/**
 * Locate folder: points a project's folder at where it is now, moving no
 * file (TOM T12), as the project details card asks for it. The hub's route
 * is built by its own item ("Build Locate folder and the delete rule on the
 * hub"), which fills these bodies in; until it lands each one says so.
 */
import type { FindPlan } from "@cawco/core/project-folders";

const notBuilt = (): Promise<never> =>
  Promise.reject(new Error("Not built yet"));

/** What pointing the folder `placeId` at `path` would do, and what CawCo can tell of that folder. */
export const previewLocate = (
  _projectId: string,
  _placeId: string,
  _path: string
): Promise<FindPlan> => notBuilt();

/** Points the folder `placeId` at `path`. */
export const locateFolder = (
  _projectId: string,
  _placeId: string,
  _path: string
): Promise<void> => notBuilt();
