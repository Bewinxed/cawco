import { primaryPlaceOf } from "@cawco/core";
import type { ProjectPlace, ProjectRow } from "./client.svelte";

/* Which projects a row lists in is core's `projectsFor` (project-membership):
   the rail and the hub's forget read the one rule. */

/** The project's primary checkout; undefined while it has none (only its folder on the hub). */
export const checkoutOf = (project: ProjectRow): ProjectPlace | undefined =>
  primaryPlaceOf(project);

/**
 * The folder a project is known by (its hue, its rail row): its primary
 * checkout's path, else its folder on the hub's (`projects/<id>`).
 */
export const folderOf = (project: ProjectRow): string =>
  checkoutOf(project)?.path ?? `projects/${project.id}`;

/** Where a session on `machineId` starts in the project: its checkout there, the primary first. */
export function checkoutOn(
  project: ProjectRow,
  machineId: string
): ProjectPlace | undefined {
  const checkouts = project.places.filter(
    (place) => place.machineId === machineId && place.kind === "checkout"
  );
  return checkouts.find((place) => place.isPrimary) ?? checkouts[0];
}

/** Whether a session on `machineId` can be one of the project's: it has a place there. */
export const placedOn = (project: ProjectRow, machineId: string): boolean =>
  project.places.some((place) => place.machineId === machineId);
