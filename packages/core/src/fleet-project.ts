/**
 * The Fleet project (Projects spec §5.1, D31): the built-in project that
 * holds work tied to no one project, which the hub makes (migration 0464)
 * and keeps. The fleet-wide unused-skills run is its routine, and every
 * task and routine a session makes outside any project is filed in it. It
 * has the hub folder and no checkout of its own, is set up on the code
 * template, and cannot be deleted, renamed or bound to a tracker.
 */

/** The Fleet project's id: the same on every hub. */
export const FLEET_PROJECT_ID = "00000000-0000-4000-8000-00000000f1ee";

/** Whether `projectId` is the Fleet project's. */
export const isFleetProject = (projectId: string | null | undefined): boolean =>
  projectId === FLEET_PROJECT_ID;
