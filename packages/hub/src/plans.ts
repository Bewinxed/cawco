/**
 * Every session's plan (Projects spec §5.2, "Every session's plan, in a
 * panel"; shapes in core plan.ts): its steps, its spec, and on a task attempt
 * the task's to-dos, the same for a plain session, a delegate and an attempt.
 *
 * Every session's steps are CawCo's list, on every harness: written whole
 * through `todo_write`'s session scope and stored here. Each harness's own
 * list and plan mode are denied to every session (core `OWN_LIST_DENIED`),
 * so there is no other list to read. The spec is CawCo's too.
 *
 * Live, a session's followers (stream.ts) hear the plan as AG-UI state
 * events: a `plan.snapshot` when they subscribe or ask, or when a change
 * replaces most of it; else a `plan.delta`, the RFC 6902 patch from the last
 * revision. One queue per session orders every read and send, so a snapshot
 * and the deltas after it never cross.
 */
import type {
  InstanceRow,
  PlanDelta,
  PlanSnapshot,
  PlanStep,
  SessionPlan,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { Elysia, t } from "elysia";
import { createPatch } from "rfc6902";
import type { DbShape } from "./db";
import { FolderRefusal, refused } from "./project-folder";
import type { TaskEvent, Tasks } from "./tasks";

export interface PlansDeps {
  db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "putSessionSpec"
    | "putSessionSteps"
    | "sessionPlan"
    | "workItem"
  >;
  /** Fans a plan frame out to the session's followers (stream.ts). */
  publish: (instanceId: string, message: PlanSnapshot | PlanDelta) => void;
  tasks: Pick<Tasks, "get">;
}

interface Held {
  plan: SessionPlan;
  rev: number;
}

export const createPlans = (deps: PlansDeps) => {
  const { db } = deps;
  /** The plan each session's followers last heard, by instance. */
  const held = new Map<string, Held>();
  /** Each session's queue: every read and send for it runs in turn. */
  const queues = new Map<string, Promise<unknown>>();

  const inTurn = <T>(
    instanceId: string,
    work: () => Promise<T>
  ): Promise<T> => {
    const next = (queues.get(instanceId) ?? Promise.resolve()).then(work, work);
    const tail = next.catch(() => undefined);
    queues.set(instanceId, tail);
    detach(
      tail.then(() => {
        if (queues.get(instanceId) === tail) {
          queues.delete(instanceId);
        }
      }),
      "plan queue cleanup"
    );
    return next;
  };

  const rowOf = (instanceId: string): InstanceRow => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      throw new FolderRefusal(404, "No session with that id on this hub.");
    }
    return row;
  };

  /** The plan as it stands now: the session's own steps and spec, and an attempt's to-dos. */
  const compute = async (row: InstanceRow): Promise<SessionPlan> => {
    const own = db.sessionPlan(row.id);
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    const attempt =
      item?.taskId && item.projectId
        ? {
            taskId: item.taskId,
            todos: (await deps.tasks.get(item.projectId, item.taskId)).todos,
          }
        : {};
    return {
      source: "cawco",
      steps: own?.steps ?? [],
      ...(own?.spec && own.specAt
        ? { spec: { markdown: own.spec, at: own.specAt.toISOString() } }
        : {}),
      ...attempt,
    };
  };

  const snapshotOf = (
    instanceId: string,
    { plan, rev }: Held
  ): PlanSnapshot => ({
    type: "plan.snapshot",
    instanceId,
    rev,
    ...plan,
  });

  /**
   * Reads the plan and tells the followers what changed: nothing, a delta
   * from the last revision, or a snapshot when the change is most of it.
   */
  const settle = (instanceId: string): Promise<Held> =>
    inTurn(instanceId, async () => {
      const plan = await compute(rowOf(instanceId));
      const before = held.get(instanceId);
      if (!before) {
        const first = { plan, rev: 1 };
        held.set(instanceId, first);
        deps.publish(instanceId, snapshotOf(instanceId, first));
        return first;
      }
      const patch = createPatch(before.plan, plan);
      if (patch.length === 0) {
        return before;
      }
      const after = { plan, rev: before.rev + 1 };
      held.set(instanceId, after);
      deps.publish(
        instanceId,
        JSON.stringify(patch).length < JSON.stringify(plan).length
          ? { type: "plan.delta", instanceId, rev: after.rev, patch }
          : snapshotOf(instanceId, after)
      );
      return after;
    });

  const settleQuietly = (instanceId: string): void => {
    settle(instanceId).catch((error: unknown) =>
      console.warn(
        `[plans] ${instanceId}: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  return {
    /** What `GET /api/instances/:id/plan` answers: read now, and the followers told of any change. */
    async read(instanceId: string): Promise<SessionPlan> {
      return (await settle(instanceId)).plan;
    },

    /**
     * A follower subscribed, or found a gap: the plan whole, to it alone,
     * in turn with every delta so none lands before it.
     */
    snapshotTo(
      instanceId: string,
      send: (message: PlanSnapshot) => void
    ): void {
      inTurn(instanceId, async () => {
        const known = held.get(instanceId);
        if (known) {
          send(snapshotOf(instanceId, known));
          return;
        }
        const first = { plan: await compute(rowOf(instanceId)), rev: 1 };
        held.set(instanceId, first);
        send(snapshotOf(instanceId, first));
      }).catch((error: unknown) =>
        console.warn(
          `[plans] ${instanceId}: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    },

    /**
     * `todo_write`'s session scope: the session's steps, its spec, or both,
     * each replaced whole.
     */
    async write(
      row: InstanceRow,
      written: { steps?: PlanStep[]; spec?: string }
    ): Promise<SessionPlan> {
      if (written.steps) {
        db.putSessionSteps(row.id, written.steps);
      }
      if (written.spec !== undefined) {
        db.putSessionSpec(row.id, written.spec);
      }
      return (await settle(row.id)).plan;
    },

    /** A project's tasks changed: an attempt's to-dos may have ticked. */
    taskChanged(event: TaskEvent): void {
      for (const [instanceId, { plan }] of held) {
        if (!plan.taskId) {
          continue;
        }
        const [row] = db.getInstancesByIds([instanceId]);
        const item = row?.workItemId ? db.workItem(row.workItemId) : undefined;
        const task = event.id;
        if (
          item?.projectId === event.projectId &&
          (task === undefined || task === item.taskId)
        ) {
          settleQuietly(instanceId);
        }
      }
    },
  };
};

export type Plans = ReturnType<typeof createPlans>;

/** `GET /api/instances/:id/plan`: the session's plan, as its followers hold it. */
export const planRoutes = (plans: Plans) =>
  new Elysia().get(
    "/api/instances/:id/plan",
    { params: t.Object({ id: t.String() }) },
    async ({ params }) => {
      try {
        return await plans.read(params.id);
      } catch (error) {
        return refused(error);
      }
    }
  );
