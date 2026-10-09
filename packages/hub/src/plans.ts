/**
 * Every session's plan (Projects spec §5.2, "Every session's plan, in a
 * panel"; shapes in core plan.ts): its steps, its spec, and on a task attempt
 * the task's to-dos, the same for a plain session, a delegate and an attempt.
 *
 * Where the steps come from is the PRD's on/off rule and nothing else: a
 * session "CawCo's to-dos" is on for (the fleet's choice, or the delegate
 * type on its row) keeps CawCo's list, written whole through `todo_write`'s session
 * scope and stored here; any other session's steps are its harness's own
 * list (harness-plans.ts), read when it changes and stored nowhere. pi has
 * no list to deny, so its sessions keep CawCo's. The spec is CawCo's on
 * every harness.
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
import { Elysia, t } from "elysia";
import { createPatch } from "rfc6902";
import type { DbShape } from "./db";
import { type HarnessPlanDeps, harnessSteps } from "./harness-plans";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { FolderRefusal, refused } from "./project-folder";
import type { TaskEvent, Tasks } from "./tasks";

/** A harness's list tool's results come in bursts; read the list once per burst. */
const SETTLE_MS = 200;

/** The harness tools whose result means the session's own list moved. */
const LIST_TOOLS = new Set(["TaskCreate", "TaskUpdate", "todowrite"]);

export interface PlansDeps extends HarnessPlanDeps {
  db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "getSupervisorConfig"
    | "putSessionSpec"
    | "putSessionSteps"
    | "sessionPlan"
    | "workItem"
  >;
  /** Runs each session's settle timer until the hub closes. */
  lifetime: HubLifetimeShape;
  /** Fans a plan frame out to the session's followers (stream.ts). */
  publish: (instanceId: string, message: PlanSnapshot | PlanDelta) => void;
  tasks: Pick<Tasks, "get">;
  /** The tools a delegate type denies, by the name a work item asked for, in its project. */
  /** Whether the delegate type by that name, in that project, turns "CawCo's to-dos" on. */
  typeTodos: (projectId: string | null, type: string) => boolean;
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
  /** Harness list tool calls not answered yet, by tool_use id → instance. */
  const listCalls = new Map<string, string>();
  const settling = new Map<string, HubTimer>();

  const inTurn = <T>(
    instanceId: string,
    work: () => Promise<T>
  ): Promise<T> => {
    const next = (queues.get(instanceId) ?? Promise.resolve()).then(work, work);
    const tail = next.catch(() => undefined);
    queues.set(instanceId, tail);
    tail.then(() => {
      if (queues.get(instanceId) === tail) {
        queues.delete(instanceId);
      }
    });
    return next;
  };

  const rowOf = (instanceId: string): InstanceRow => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      throw new FolderRefusal(404, "No session with that id on this hub.");
    }
    return row;
  };

  /**
   * Whether the session keeps CawCo's list: "CawCo's to-dos" is on for it,
   * the fleet's choice or its delegate type's — the same read the agent
   * makes at spawn. pi has no list of its own.
   */
  const keepsCawcoList = (row: InstanceRow): boolean =>
    (row.harness ?? "claude") === "pi" ||
    (db.getSupervisorConfig()?.cawcoTodos ?? false) ||
    (!!row.delegateType &&
      deps.typeTodos(row.delegateTypeProject ?? null, row.delegateType));

  /** The plan as it stands now, read from wherever each part lives. */
  const compute = async (row: InstanceRow): Promise<SessionPlan> => {
    const own = db.sessionPlan(row.id);
    const cawco = keepsCawcoList(row);
    const steps = cawco ? (own?.steps ?? []) : await harnessSteps(deps, row);
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    const attempt =
      item?.taskId && item.projectId
        ? {
            taskId: item.taskId,
            todos: (await deps.tasks.get(item.projectId, item.taskId)).todos,
          }
        : {};
    return {
      source: cawco ? "cawco" : "harness",
      steps,
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
     * each replaced whole. Steps are refused to a session whose harness
     * keeps the list.
     */
    async write(
      row: InstanceRow,
      written: { steps?: PlanStep[]; spec?: string }
    ): Promise<SessionPlan> {
      if (written.steps) {
        if (!keepsCawcoList(row)) {
          throw new Error(
            "This session keeps its steps in its harness's own list (CawCo's to-dos are off for it), so write them there: Claude Code's TaskCreate and TaskUpdate, OpenCode's todowrite. todo_write can still write its spec."
          );
        }
        db.putSessionSteps(row.id, written.steps);
      }
      if (written.spec !== undefined) {
        db.putSessionSpec(row.id, written.spec);
      }
      return (await settle(row.id)).plan;
    },

    /**
     * Reads a frame for a move in the harness's own list: a list tool's
     * result, once its call is seen. Read only for a plan someone holds; a
     * plan nobody looked at is read when someone does.
     */
    observe(instanceId: string, message: unknown): void {
      const frame = message as {
        type?: string;
        message?: { content?: unknown };
      };
      if (!Array.isArray(frame.message?.content)) {
        return;
      }
      for (const block of frame.message.content as {
        type?: string;
        id?: string;
        name?: string;
        tool_use_id?: string;
      }[]) {
        if (
          frame.type === "assistant" &&
          block.type === "tool_use" &&
          block.id &&
          block.name &&
          LIST_TOOLS.has(block.name)
        ) {
          listCalls.set(block.id, instanceId);
        } else if (
          frame.type === "user" &&
          block.type === "tool_result" &&
          block.tool_use_id &&
          listCalls.delete(block.tool_use_id) &&
          held.has(instanceId) &&
          !settling.has(instanceId)
        ) {
          settling.set(
            instanceId,
            deps.lifetime.after(SETTLE_MS, () => {
              settling.delete(instanceId);
              settleQuietly(instanceId);
            })
          );
        }
      }
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
