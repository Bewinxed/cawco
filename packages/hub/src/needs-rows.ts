/**
 * Needs you's rows (core needs-rows.ts), assembled here so every screen
 * draws one list: one row per piece of stopped work, newest first. The
 * parked asks that are the person's (not routed to a delegate's parent),
 * Needs you's artifacts (artifacts/lane.ts, those not put away) and the
 * tasks waiting on him (a stage of kind `you`, a failed routine) are
 * grouped by the task they are about, else by the session that holds them.
 */

import type { ArtifactNeed } from "@cawco/core/artifact-needs";
import { unparked } from "@cawco/core/artifact-needs";
import type { ParkedAsk } from "@cawco/core/frames";
import type {
  NeedsRow,
  NeedsRowsRead,
  NeedsRowTask,
} from "@cawco/core/needs-rows";
import type { InstanceRow } from "@cawco/core/protocol";
import { ElysiaStatus } from "elysia";
import type { DbShape } from "./db";
import { recordsProjectOf } from "./records-project";
import type { Tasks } from "./tasks";

type TaskSummary = Extract<
  Awaited<ReturnType<Tasks["list"]>>,
  { tasks: unknown }
>["tasks"][number];

export interface NeedsRowsDeps {
  readonly db: Pick<
    DbShape,
    "asks" | "getInstancesByIds" | "listProjects" | "workItem"
  >;
  /** Needs you's artifacts as they stand (artifacts/lane.ts). */
  readonly needs: () => readonly ArtifactNeed[];
  /** Every ask parked now (pending.ts). */
  readonly parked: () => readonly ParkedAsk[];
  readonly tasks: Pick<Tasks, "list">;
}

/** A row being gathered: its task or session, and its items with when each was raised. */
interface Gathering {
  artifacts: { at: number; id: string }[];
  asks: { at: number; id: string }[];
  instanceId: string | null;
  key: string;
  task: NeedsRowTask | null;
  waitingSince: number | null;
}

/** Item ids newest first. */
const newestFirst = (items: readonly { at: number; id: string }[]): string[] =>
  [...items].sort((a, b) => b.at - a.at).map((one) => one.id);

export const createNeedsRows = (deps: NeedsRowsDeps) => {
  /** The tasks waiting on the person, by `<project>:<task>`, and a sentence per project whose tasks could not be read. */
  const waitingTasks = async () => {
    const read = await Promise.all(
      deps.db.listProjects().map(async (project) => {
        const unread = (why: string) => ({
          missing: [`${project.name}'s tasks could not be read: ${why}`],
          tasks: [],
        });
        const list = await deps.tasks
          .list(project.id)
          .catch((error: unknown) =>
            error instanceof Error ? error : new Error(String(error))
          );
        if (list instanceof Error) {
          return unread(list.message);
        }
        if (list instanceof ElysiaStatus) {
          return unread(list.response.detail);
        }
        return {
          missing: [],
          tasks: list.tasks.map((task) => ({
            projectId: project.id,
            task,
          })),
        };
      })
    );
    const tasks = read.flatMap((one) => one.tasks);
    return {
      missing: read.flatMap((one) => one.missing),
      byKey: new Map(
        tasks.map((one) => [`${one.projectId}:${one.task.id}`, one] as const)
      ),
    };
  };

  /** The sessions `asks` and `needs` come from, by id. */
  const sessionsOf = (
    asks: readonly ParkedAsk[],
    needs: readonly ArtifactNeed[]
  ): Map<string, InstanceRow> =>
    new Map(
      deps.db
        .getInstancesByIds([
          ...new Set([
            ...asks.flatMap((ask) => {
              const id = askerOf(ask);
              return id ? [id] : [];
            }),
            ...needs.map((need) => need.instanceId),
          ]),
        ])
        .map((row) => [row.id, row] as const)
    );

  /** The task an ask names (`ask`'s `task`), when it is the hub's own question. */
  const namedTask = (ask: ParkedAsk): string | undefined => {
    const owned = ask.payload.askId
      ? deps.db.asks.get(ask.payload.askId)?.asked
      : undefined;
    return owned?.kind === "question" ? owned.task : undefined;
  };

  return {
    /** Needs you's rows, newest first. */
    async read(): Promise<NeedsRowsRead> {
      const { missing, byKey } = await waitingTasks();
      const asks = deps
        .parked()
        .filter((ask) => ask.payload.routedTo !== "parent");
      const needs = unparked(deps.needs());
      const sessions = sessionsOf(asks, needs);
      const rows = new Map<string, Gathering>();
      /** The task `named` (or, with none, `session`'s own attempt's) as a row's task, when the hub reads it. */
      const taskOf = (
        session: InstanceRow | undefined,
        named?: string
      ): NeedsRowTask | null => {
        const id =
          named ??
          (session?.workItemId
            ? deps.db.workItem(session.workItemId)?.taskId
            : undefined);
        const projectId = session ? recordsProjectOf(deps.db, session) : "";
        const found = id ? byKey.get(`${projectId}:${id}`) : undefined;
        return found ? rowTask(found) : null;
      };
      const rowOf = (
        task: NeedsRowTask | null,
        instanceId: string | null,
        fallback: string
      ): Gathering => {
        const key = rowKey(task, instanceId, fallback);
        const held = rows.get(key) ?? {
          key,
          task,
          instanceId: task ? null : instanceId,
          asks: [],
          artifacts: [],
          waitingSince: null,
        };
        rows.set(key, held);
        return held;
      };
      for (const found of byKey.values()) {
        const task = rowTask(found);
        if (task.waits) {
          rowOf(task, null, "").waitingSince = found.task.updatedAt;
        }
      }
      for (const ask of asks) {
        const instanceId = askerOf(ask);
        const session = instanceId ? sessions.get(instanceId) : undefined;
        rowOf(
          taskOf(session, namedTask(ask)),
          instanceId ?? null,
          `ask:${ask.requestId ?? ""}`
        ).asks.push({
          id: ask.requestId ?? "",
          at: ask.payload.raisedAt ?? Date.now(),
        });
      }
      for (const need of needs) {
        rowOf(
          taskOf(sessions.get(need.instanceId)),
          need.instanceId,
          `artifact:${need.artifactId}`
        ).artifacts.push({ id: need.artifactId, at: need.raisedAt });
      }
      return {
        missing,
        rows: [...rows.values()]
          .map(listedOf)
          .sort((a, b) => b.at - a.at || a.key.localeCompare(b.key)),
      };
    },
  };
};

/** The session an ask is from: the one it names as its origin, else the one it was parked by. */
const askerOf = (ask: ParkedAsk): string | undefined =>
  ask.payload.originInstanceId ?? ask.instanceId;

/** A row's key: its task's, else its session's, else the item's own. */
const rowKey = (
  task: NeedsRowTask | null,
  instanceId: string | null,
  fallback: string
): string => {
  if (task) {
    return `task:${task.projectId}:${task.id}`;
  }
  return instanceId ? `session:${instanceId}` : fallback;
};

/** A project's task as a row's task. */
const rowTask = ({
  projectId,
  task,
}: {
  projectId: string;
  task: TaskSummary;
}): NeedsRowTask => ({
  id: task.id,
  projectId,
  title: task.title,
  stage: task.stage,
  waits: waitsOf(task),
});

/** A gathered row as it is listed: its items newest first, when it began waiting and its newest raise. */
const listedOf = (row: Gathering): NeedsRow => {
  const raised = [
    ...row.asks.map((one) => one.at),
    ...row.artifacts.map((one) => one.at),
    ...(row.waitingSince === null ? [] : [row.waitingSince]),
  ];
  return {
    key: row.key,
    task: row.task,
    instanceId: row.instanceId,
    asks: newestFirst(row.asks),
    artifacts: newestFirst(row.artifacts),
    at: Math.max(...raised),
    since: Math.min(...raised),
  };
};

/** Why a task waits on the person by itself: in review (a stage of kind `you`), or its routine failed; null when it does not. */
const waitsOf = (task: {
  kind: string | null;
  needsYou: boolean;
}): NeedsRowTask["waits"] => {
  if (!task.needsYou) {
    return null;
  }
  return task.kind === "you" ? "review" : "failed";
};

export type NeedsRows = ReturnType<typeof createNeedsRows>;
