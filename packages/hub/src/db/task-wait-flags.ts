import { and, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { taskWaitFlags } from "./schema";

/** One task's wait, as a row of {@link taskWaitFlags} names it. */
export interface TaskWaitKey {
  /** The wait as its task's file keeps it: the pull request's or run's URL. */
  target: string;
  taskId: string;
}

/** The task waits on GitHub the person was told can no longer settle (schema `taskWaitFlags`). */
export interface TaskWaitFlagsDb {
  /** Takes `wait` off: its next flag is told again. */
  readonly drop: (projectId: string, wait: TaskWaitKey) => void;
  /** Keeps that `wait` was told; false when it was already, and so is told no second time. */
  readonly keep: (projectId: string, wait: TaskWaitKey) => boolean;
  /** The project's waits kept as told. */
  readonly of: (projectId: string) => TaskWaitKey[];
}

export const taskWaitFlagsDb = (db: BunSQLiteDatabase): TaskWaitFlagsDb => ({
  keep: (projectId, { taskId, target }) =>
    db
      .insert(taskWaitFlags)
      .values({ projectId, taskId, target, toldAt: new Date() })
      .onConflictDoNothing()
      .returning({ target: taskWaitFlags.target })
      .all().length > 0,
  of: (projectId) =>
    db
      .select({ taskId: taskWaitFlags.taskId, target: taskWaitFlags.target })
      .from(taskWaitFlags)
      .where(eq(taskWaitFlags.projectId, projectId))
      .all(),
  drop: (projectId, { taskId, target }) => {
    db.delete(taskWaitFlags)
      .where(
        and(
          eq(taskWaitFlags.projectId, projectId),
          eq(taskWaitFlags.taskId, taskId),
          eq(taskWaitFlags.target, target)
        )
      )
      .run();
  },
});
