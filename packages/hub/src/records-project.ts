/**
 * Where a session's records live: the project its tasks, routines, to-dos
 * and plan steps are filed in and read from. Filing (`task_create`, a
 * routine) and planning (`todo_write`) both resolve through
 * {@link recordsProjectOf}, so a step names what the session filed.
 */
import { FLEET_PROJECT_ID } from "@cawco/core/fleet-project";
import type { InstanceRow } from "@cawco/core/protocol";
import type { DbShape } from "./db";

/**
 * The project a session's records live in: its own, else its work item's,
 * else the Fleet project, which holds the work of a session in no project
 * (Projects spec §5.1, D31).
 */
export const recordsProjectOf = (
  db: Pick<DbShape, "workItem">,
  row: Pick<InstanceRow, "projectId" | "workItemId">
): string =>
  row.projectId ??
  (row.workItemId ? db.workItem(row.workItemId)?.projectId : null) ??
  FLEET_PROJECT_ID;
