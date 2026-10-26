import { and, eq, lt } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { sessionTasks } from "./schema";

/** One background task a session's process runs (schema `sessionTasks`). */
interface SessionTask {
  description: string;
  since: Date;
  taskId: string;
  type: string;
}

/**
 * The background tasks each Claude session's process runs now, kept across a
 * hub restart, so that what a process restart or a kill cut is never lost
 * (server.ts `tellCutTasks`).
 */
export interface SessionTasksDb {
  /** Forgets every task kept for `instanceId`: a move told it of them its own way. */
  readonly clear: (instanceId: string) => void;
  /** The session's CLI listed its tasks again: the list replaces what was kept, each keeping when it was first heard of. */
  readonly replace: (
    instanceId: string,
    tasks: readonly Omit<SessionTask, "since">[],
    at: Date
  ) => void;
  /** Takes the tasks first heard of before `before`: those a process that started (or died) then ran; read once, then gone. */
  readonly takeBefore: (instanceId: string, before: Date) => SessionTask[];
}

export const sessionTasksDb = (db: BunSQLiteDatabase): SessionTasksDb => ({
  clear: (instanceId) => {
    db.delete(sessionTasks)
      .where(eq(sessionTasks.instanceId, instanceId))
      .run();
  },
  replace: (instanceId, tasks, at) => {
    db.transaction((tx) => {
      const kept = new Map(
        tx
          .select()
          .from(sessionTasks)
          .where(eq(sessionTasks.instanceId, instanceId))
          .all()
          .map((row) => [row.taskId, row.since])
      );
      tx.delete(sessionTasks)
        .where(eq(sessionTasks.instanceId, instanceId))
        .run();
      if (tasks.length > 0) {
        tx.insert(sessionTasks)
          .values(
            tasks.map((task) => ({
              instanceId,
              ...task,
              since: kept.get(task.taskId) ?? at,
            }))
          )
          .run();
      }
    });
  },
  takeBefore: (instanceId, before) =>
    db
      .delete(sessionTasks)
      .where(
        and(
          eq(sessionTasks.instanceId, instanceId),
          lt(sessionTasks.since, before)
        )
      )
      .returning()
      .all()
      .map(({ taskId, type, description, since }) => ({
        taskId,
        type,
        description,
        since,
      })),
});
