/**
 * A session's plan, client side (shapes and rules in core plan.ts): the hub
 * sends each follower a `plan.snapshot` when it subscribes, then
 * `plan.delta`s, RFC 6902 patches applied in sequence. A delta for anything
 * but the revision held is a gap: nothing is applied, and the hub is asked
 * for the plan whole (`plan.resync`), once per gap.
 */
import {
  type PlanDelta,
  type PlanSnapshot,
  type PlanStepStatus,
  type SessionPlan,
  todoGroups,
  todoProgress,
} from "@cawco/core/plan";
import { applyPatch } from "rfc6902";
import { SessionPlanSchema } from "#lib/cawco/stored-shapes.js";

/** A session's plan as this tab holds it, and the revision it is at. */
export interface HeldPlan {
  plan: SessionPlan;
  rev: number;
}

/** Sessions whose resync is out: one ask per gap, cleared by the snapshot it brings. */
const asked = new Set<string>();

const gap = (instanceId: string, resync: (instanceId: string) => void) => {
  if (!asked.has(instanceId)) {
    asked.add(instanceId);
    resync(instanceId);
  }
};

/**
 * Takes one socket message if it is a plan frame, and says so. `plans` is
 * the store's map, by session; `resync` puts a `plan.resync` on the socket.
 */
export function handlePlanMessage(
  plans: Record<string, HeldPlan>,
  message: unknown,
  resync: (instanceId: string) => void
): boolean {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const type = "type" in message ? message.type : undefined;
  if (type === "plan.snapshot") {
    const { type: _type, instanceId, rev, ...plan } = message as PlanSnapshot;
    asked.delete(instanceId);
    plans[instanceId] = { rev, plan };
    return true;
  }
  if (type !== "plan.delta") {
    return false;
  }
  const { instanceId, rev, patch } = message as PlanDelta;
  const held = plans[instanceId];
  if (held && rev <= held.rev) {
    return true;
  }
  if (!held || rev !== held.rev + 1) {
    gap(instanceId, resync);
    return true;
  }
  // A plain copy of the held plan, which may be the store's proxy, to patch.
  const next = SessionPlanSchema.parse(JSON.parse(JSON.stringify(held.plan)));
  if (applyPatch(next, patch).some((error) => error !== null)) {
    gap(instanceId, resync);
    return true;
  }
  plans[instanceId] = { rev, plan: next };
  return true;
}

/** One row of a plan's tree: a step or a to-do, its children under it. */
export interface PlanNode {
  children: PlanNode[];
  id: string;
  status: PlanStepStatus;
  text: string;
}

/**
 * Rows written flat with a nesting depth (a plan's steps, a task file's
 * to-dos), as the tree they are: each row hangs under the nearest row
 * before it that stands one level up.
 */
function treeOf(
  rows: {
    id: string;
    depth: number;
    status: PlanNode["status"];
    text: string;
  }[]
): PlanNode[] {
  const roots: PlanNode[] = [];
  const open: { depth: number; node: PlanNode }[] = [];
  for (const row of rows) {
    const node: PlanNode = {
      id: row.id,
      status: row.status,
      text: row.text,
      children: [],
    };
    while (open.length > 0 && (open.at(-1)?.depth ?? 0) >= row.depth) {
      open.pop();
    }
    const parent = open.at(-1);
    (parent ? parent.node.children : roots).push(node);
    open.push({ depth: row.depth, node });
  }
  return roots;
}

/** A plan's steps, as their tree. */
export const stepsTree = (plan: SessionPlan | undefined): PlanNode[] =>
  treeOf(
    (plan?.steps ?? []).map((step) => ({
      id: step.id,
      depth: step.depth,
      status: step.status,
      text: step.content,
    }))
  );

/**
 * A task attempt's agreed to-dos, as their tree: ticked is completed. The
 * offered ones are left out until agreed, as the plan's ring leaves them.
 */
export const todosTree = (plan: SessionPlan | undefined): PlanNode[] =>
  treeOf(
    todoGroups(plan?.todos ?? []).agreed.map((todo) => ({
      id: todo.id ?? todo.path,
      depth: todo.depth,
      status: todo.done ? ("completed" as const) : ("pending" as const),
      text: todo.text,
    }))
  );

/** How far a plan has got: its steps, else its task's agreed to-dos. */
export function planProgress(plan: SessionPlan): {
  done: number;
  total: number;
} {
  if (plan.steps.length > 0) {
    return {
      done: plan.steps.filter((step) => step.status === "completed").length,
      total: plan.steps.length,
    };
  }
  return todoProgress(plan.todos ?? []);
}

/** The plan has something to show: steps, a spec, or a task's agreed to-dos. */
export const planShows = (plan: SessionPlan | undefined): boolean =>
  !!plan &&
  (plan.steps.length > 0 || !!plan.spec || todosTree(plan).length > 0);
