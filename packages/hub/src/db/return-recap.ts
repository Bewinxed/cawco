/**
 * The records the person's return reads (return-recap.ts): each task's move
 * as it happened (`task_moves`), the work items that landed in a stretch,
 * and the sessions that hear of a task.
 */
import { DAY_MS } from "@cawco/core/time";
import { and, eq, gte, isNotNull, like, lt, lte, or } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  instances,
  sessionPlanSteps,
  TASK_MOVES_KEPT_DAYS,
  taskMoves,
  workItems,
} from "./schema";

/** A task's move from one stage to another, as it happened. */
export type TaskMoveRow = typeof taskMoves.$inferSelect;

/** A work item whose work landed: the session that ran it, who started it, and its commit. */
export interface LandedItem {
  /** Its `finish_item`'s headline; null when it gave none. */
  headline: string | null;
  id: string;
  /** The session that ran it. */
  instanceId: string;
  /** The commit pushed; null on a landing kept as stored that did not read. */
  landedSha: string | null;
  /** The session that started it, which hears its report. */
  parentInstanceId: string;
  projectId: string | null;
  /** The task it was an attempt at, if any. */
  taskId: string | null;
  title: string;
}

export interface ReturnRecapDb {
  /**
   * The sessions that hear of task `taskId` of `projectId`: each whose plan
   * names it or one of its to-dos, and each that started work on it.
   */
  readonly hearing: (projectId: string, taskId: string) => string[];
  /** The work items whose work landed as they ended between `from` and `to`. */
  readonly landedBetween: (from: Date, to: Date) => LandedItem[];
  /** The tasks' moves between `from` and `to`, oldest first. */
  readonly movesBetween: (from: Date, to: Date) => TaskMoveRow[];
  /** Keeps a task's move, and lets go of those past {@link TASK_MOVES_KEPT_DAYS} days. */
  readonly noteMove: (row: TaskMoveRow) => void;
}

export const returnRecapDb = (db: BunSQLiteDatabase): ReturnRecapDb => ({
  noteMove: (row) => {
    db.insert(taskMoves).values(row).onConflictDoNothing().run();
    db.delete(taskMoves)
      .where(
        lt(
          taskMoves.at,
          new Date(row.at.getTime() - TASK_MOVES_KEPT_DAYS * DAY_MS)
        )
      )
      .run();
  },
  movesBetween: (from, to) =>
    db
      .select()
      .from(taskMoves)
      .where(and(gte(taskMoves.at, from), lte(taskMoves.at, to)))
      .orderBy(taskMoves.at)
      .all(),
  landedBetween: (from, to) =>
    db
      .select({
        id: workItems.id,
        instanceId: workItems.instanceId,
        parentInstanceId: workItems.parentInstanceId,
        title: workItems.title,
        headline: workItems.headline,
        landedSha: workItems.landedSha,
        projectId: workItems.projectId,
        taskId: workItems.taskId,
      })
      .from(workItems)
      .where(
        and(
          or(isNotNull(workItems.landedSha), isNotNull(workItems.landedUnread)),
          gte(workItems.endedAt, from),
          lte(workItems.endedAt, to)
        )
      )
      .orderBy(workItems.endedAt)
      .all(),
  hearing: (projectId, taskId) => [
    ...new Set([
      ...db
        .selectDistinct({ instanceId: sessionPlanSteps.instanceId })
        .from(sessionPlanSteps)
        .innerJoin(instances, eq(instances.id, sessionPlanSteps.instanceId))
        .where(
          and(
            eq(instances.projectId, projectId),
            or(
              eq(sessionPlanSteps.id, taskId),
              like(sessionPlanSteps.id, `${taskId}:%`)
            )
          )
        )
        .all()
        .map((row) => row.instanceId),
      ...db
        .selectDistinct({ instanceId: workItems.parentInstanceId })
        .from(workItems)
        .where(
          and(eq(workItems.projectId, projectId), eq(workItems.taskId, taskId))
        )
        .all()
        .map((row) => row.instanceId),
    ]),
  ],
});
