/**
 * Locate folder: points a project's folder at where it is now, moving no
 * file (TOM T12), as the project details card asks for it, through the
 * hub's routes (hub project-locate.ts). The projects list follows the
 * hub's `projects.changed`.
 */
import type { FindPlan } from "@cawco/core/project-folders";
import type { HubClient } from "@cawco/hub/client";
import { hub } from "#lib/platform/hub.js";
import { hubData, hubDone } from "#lib/platform/hub-read.js";

/** What pointing the folder `placeId` at `path` would do, and what CawCo can tell of that folder. */
export const previewLocate = (
  projectId: string,
  placeId: string,
  path: string,
  client: HubClient = hub
): Promise<FindPlan> =>
  hubData(
    client.api
      .projects({ id: projectId })
      .places({ placeId })
      .locate.preview.post({ path })
  );

/**
 * Points the folder `placeId` at `path`. `joins` is the project the preview
 * named as already having the folder's codebase, sent back as the person's
 * yes to the two becoming one.
 */
export const locateFolder = (
  projectId: string,
  placeId: string,
  path: string,
  joins: string | null,
  client: HubClient = hub
): Promise<void> =>
  hubDone(
    client.api
      .projects({ id: projectId })
      .places({ placeId })
      .locate.post({ path, ...(joins ? { joins } : {}) })
  );

/** Calls off what Locate folder holds for the folder `placeId` while its computer is away: the folder stays as it was. */
export const callOffLocate = (
  projectId: string,
  placeId: string,
  client: HubClient = hub
): Promise<void> =>
  hubDone(
    client.api.projects({ id: projectId }).places({ placeId }).locate.delete()
  );
