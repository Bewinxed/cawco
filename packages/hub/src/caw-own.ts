import type { DbShape } from "./db";
import { roleOf } from "./roles";
import { isRoutineParent } from "./work-items";

type ProjectRow = NonNullable<ReturnType<DbShape["project"]>>;
type Row = ReturnType<DbShape["getInstancesByIds"]>[number];

/**
 * Whether `root`, the top of a delegation chain, is `project`'s Caw: its
 * lead now, or a lead session of the project from before Caw was turned off
 * (turning him off clears `leadInstanceId`, the row keeps its role).
 */
const isLead = (root: Row, project: ProjectRow): boolean =>
  project.leadInstanceId === root.id ||
  (roleOf(root) === "lead" && root.projectId === project.id);

/**
 * The project whose Caw being off stops `row`: a work item's session that is
 * Caw's own, in a project whose Caw is off. Caw's own is decided by where
 * the item came from, read off its delegation chain (each session's
 * `parentInstanceId`, which a follow-up item rewrites to its own parent):
 * the chain's root is the project's lead (his delegates, and the attempts
 * the dispatcher starts on its own, which report to him), or a routine (its
 * runs name `routine:<id>` as their parent). Any other root is a person's or
 * a session's ask, which goes on past a limit like any session (the
 * at-limit controller and rebalance carry it). Undefined: nothing stops it.
 *
 * With Caw off, nothing wakes a model on Caw's behalf (Projects §5.3): this
 * is the one rule at-limit `stays` and rebalance hold to.
 */
export const stoppedByCawOff = (
  db: Pick<DbShape, "getInstancesByIds" | "project">,
  row: Row
): ProjectRow | undefined => {
  const project = row.projectId ? db.project(row.projectId) : undefined;
  if (!(row.workItemId && project && !project.caw)) {
    return undefined;
  }
  const seen = new Set<string>([row.id]);
  let root = row;
  while (root.parentInstanceId) {
    if (isRoutineParent(root.parentInstanceId)) {
      return project;
    }
    const [parent] = seen.has(root.parentInstanceId)
      ? []
      : db.getInstancesByIds([root.parentInstanceId]);
    if (!parent) {
      break;
    }
    seen.add(parent.id);
    root = parent;
  }
  return isLead(root, project) ? project : undefined;
};
