import type { DbShape } from "./db";
import { roleOf } from "./roles";
import { isHubParent } from "./work-items";

type ProjectRow = NonNullable<ReturnType<DbShape["project"]>>;
type Row = ReturnType<DbShape["getInstancesByIds"]>[number];

/**
 * Whether `root`, the top of a delegation chain, is `project`'s Caw: its
 * lead now, or a lead session of the project from before (a move of harness
 * or model clears `leadInstanceId`, the row keeps its role).
 */
const isLead = (root: Row, project: ProjectRow): boolean =>
  project.leadInstanceId === root.id ||
  (roleOf(root) === "lead" && root.projectId === project.id);

/**
 * Whether the delegation chain above a session whose parent is
 * `parentInstanceId` tops at `project`'s Caw: each session's
 * `parentInstanceId` walked up (a follow-up item rewrites it to its own
 * parent) to a session with none. A routine's run (`routine:<id>`) tops at
 * no session.
 */
export const topsAtCaw = (
  db: Pick<DbShape, "getInstancesByIds">,
  parentInstanceId: string,
  project: ProjectRow
): boolean => {
  if (isHubParent(parentInstanceId)) {
    return false;
  }
  const seen = new Set<string>();
  let [root] = db.getInstancesByIds([parentInstanceId]);
  while (root?.parentInstanceId && !seen.has(root.id)) {
    seen.add(root.id);
    if (isHubParent(root.parentInstanceId)) {
      return false;
    }
    const [parent] = db.getInstancesByIds([root.parentInstanceId]);
    if (!parent) {
      break;
    }
    root = parent;
  }
  return root !== undefined && isLead(root, project);
};

/**
 * The project whose Caw being off stops `row`: a work item's session that is
 * Caw's own, in a project whose Caw is off. Caw's own is the item's origin
 * (work_items.origin, stamped where it was made): `event`, work an event
 * began (the dispatcher's attempts, a routine's runs, what Caw starts in a
 * turn an event woke, and their delegates). `you`, work your words began,
 * and `kept`, Caw's work you chose to let finish as you turned him off, go
 * on past a limit like any session (the at-limit controller and rebalance
 * carry them). Undefined: nothing stops it.
 *
 * With Caw off, nothing wakes a model on Caw's behalf (Projects §5.3): this
 * is the one rule at-limit `stays` and rebalance hold to.
 */
export const stoppedByCawOff = (
  db: Pick<DbShape, "project" | "workItem">,
  row: Row
): ProjectRow | undefined => {
  const project = row.projectId ? db.project(row.projectId) : undefined;
  if (!(row.workItemId && project && !project.caw)) {
    return undefined;
  }
  return db.workItem(row.workItemId)?.origin === "event" ? project : undefined;
};
