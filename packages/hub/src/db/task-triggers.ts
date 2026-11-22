/**
 * Routines' triggers and runs (Projects spec §5.5, routines.ts): one
 * `task_triggers` row per task that starts on its own, and its runs in
 * `task_runs`, newest read first and capped. A routine as the scheduler
 * reads it is its trigger with its task's title ({@link RoutineRow}).
 */
import type { RoutineRunState } from "@cawco/core/routine-kinds";
import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  projectTasks,
  taskRuns,
  taskTriggerChecks,
  taskTriggers,
} from "./schema";
import type { Tx } from "./tx";

/** A routine's name: its task's title, else its task's id while the index holds no row of it. */
export const ROUTINE_NAME = sql<string>`coalesce(${projectTasks.title}, ${taskTriggers.taskId}, 'routine')`;

/** A trigger's task's index row, joined. */
export const ITS_TASK = and(
  eq(projectTasks.projectId, taskTriggers.projectId),
  eq(projectTasks.id, taskTriggers.taskId)
);

/** A trigger as its table keeps it. */
export type TriggerRow = typeof taskTriggers.$inferSelect;

/**
 * A routine as the scheduler and its readers see it: its trigger, and its
 * task's title as the index holds it (its id while the task has no index
 * row: archived, deleted, or not filed yet).
 */
export type RoutineRow = TriggerRow & { name: string };

export type RoutineRunRow = typeof taskRuns.$inferSelect;

/** A routine's check on one machine, as its last run there left it. */
export type CheckRow = typeof taskTriggerChecks.$inferSelect;

/**
 * What a run is filed as: started; queued behind a live run (an event's
 * run, which is a delivery and is never dropped); or skipped, each with the
 * sentence that says why.
 */
type RunDecision =
  { state: "starting" } | { reason: string; state: "queued" | "skipped" };

/** What a decision reads: the routine, its run still going, and whether runs wait behind it. */
export type Decide = (
  routine: RoutineRow,
  live: RoutineRunRow | undefined,
  waiting: boolean
) => RunDecision;

/** The states of a run that is still going: what overlap looks for. */
const LIVE: RoutineRunState[] = ["starting", "running"];

export interface TaskTriggersDb {
  /** Its project's trigger of task `taskId`, when the task is a routine or was one. */
  readonly byTask: (
    projectId: string,
    taskId: string
  ) => RoutineRow | undefined;
  /** Routines carried over from before routines were tasks whose task is not filed yet. */
  readonly carried: () => TriggerRow[];
  /** A routine's check on each machine, as its last run there left it. */
  readonly checks: (routineId: string) => CheckRow[];
  /**
   * The next queued run, taken in one transaction while the routine has no
   * run going: its oldest by arrival, filed as `decide` says now. Nothing
   * while a run goes or none waits.
   */
  readonly claimQueued: (claim: {
    decide: Decide;
    routineId: string;
  }) => RoutineRunRow | undefined;
  /**
   * THE fire of a scheduled slot, in one transaction: `next_slot` moves from
   * `due` to `next` (only while it still reads `due` and the routine is on),
   * and the run (routine, `slot`, attempt 1) is inserted as `decide` files
   * it. Answers the run, or nothing when another tick moved the slot first
   * or the run is there already: then nothing fires.
   */
  readonly claimSlot: (claim: {
    decide: Decide;
    due: Date;
    next: Date;
    routineId: string;
    slot: Date;
  }) => RoutineRunRow | undefined;
  /** A run that kept nothing: a quiet check's, deleted. */
  readonly deleteRun: (id: string) => void;
  /**
   * A carried routine's task filed (routine-carry.ts): the trigger the index
   * made for the new file gives way to the carried one, which takes its
   * task and keeps its state, runs, routes and id; its definition is let go.
   */
  readonly filed: (id: string, projectId: string, taskId: string) => void;
  readonly get: (id: string) => RoutineRow | undefined;
  /** Files an unscheduled run as `decide` says, in one transaction; nothing when (routine, slot, attempt) is there already. */
  readonly insertRun: (run: {
    attempt: number;
    decide: Decide;
    routineId: string;
    slot: string;
  }) => RoutineRunRow | undefined;
  /**
   * A slot's check kept, in one transaction: each machine's row written
   * whole, and the rows of machines `check_on` no longer names deleted.
   */
  readonly keepChecks: (
    routineId: string,
    rows: Omit<CheckRow, "triggerId">[]
  ) => void;
  /**
   * Routines with a filed task, of a project or every project, oldest
   * first; `all` takes in those whose file no longer makes them one.
   */
  readonly list: (projectId?: string, all?: boolean) => RoutineRow[];
  /** Runs still starting or running, every routine's. */
  readonly liveRuns: () => RoutineRunRow[];
  /** Each of a project's routines' newest run, by trigger id: what a task list carries. */
  readonly newestRuns: (projectId: string) => Map<string, RoutineRunRow>;
  /** Routines that have runs waiting: what a hub start drains. */
  readonly queuedRoutines: () => string[];
  /**
   * Waits kept outside task files that named a routine (`routine:<id>`)
   * named its task now: plan steps' waits and attempts' witnesses.
   */
  readonly repointWaits: (from: string, to: string) => void;
  readonly run: (id: string) => RoutineRunRow | undefined;
  readonly runOfItem: (workItemId: string) => RoutineRunRow | undefined;
  /** A routine's runs, newest first, `limit` of them after `skip`. */
  readonly runs: (
    routineId: string,
    limit: number,
    skip?: number
  ) => RoutineRunRow[];
  /** A routine's runs started at or after `since` (ms): how many, and the dollars they spent. */
  readonly runsSince: (
    routineId: string,
    since: number
  ) => { runs: number; usd: number };
  readonly setRun: (
    id: string,
    patch: Partial<Omit<RoutineRunRow, "id" | "triggerId">>
  ) => RoutineRunRow | undefined;
  /** The hub's state of a routine; the copy of its file's lines is the index's alone. */
  readonly update: (
    id: string,
    patch: Partial<Omit<TriggerRow, "id" | "createdAt">>
  ) => RoutineRow | undefined;
}

export const taskTriggersDb = (db: BunSQLiteDatabase): TaskTriggersDb => {
  /** Triggers with their task's title, as one select. */
  const routines = (q: Tx | BunSQLiteDatabase = db) =>
    q
      .select({ ...getTableColumns(taskTriggers), name: ROUTINE_NAME })
      .from(taskTriggers)
      .leftJoin(projectTasks, ITS_TASK);

  const get = (id: string, q: Tx | BunSQLiteDatabase = db) =>
    routines(q).where(eq(taskTriggers.id, id)).get();

  const liveOf = (tx: Tx, routineId: string) =>
    tx
      .select()
      .from(taskRuns)
      .where(
        and(eq(taskRuns.triggerId, routineId), inArray(taskRuns.state, LIVE))
      )
      .orderBy(desc(taskRuns.startedAt))
      .get();

  /** The routine's oldest queued run, by arrival (rowid). */
  const oldestQueued = (tx: Tx, routineId: string) =>
    tx
      .select()
      .from(taskRuns)
      .where(
        and(eq(taskRuns.triggerId, routineId), eq(taskRuns.state, "queued"))
      )
      .orderBy(sql`rowid`)
      .get();

  /** The columns a decision sets on a run. */
  const filed = (decision: RunDecision) => ({
    state: decision.state,
    reason: decision.state === "starting" ? null : decision.reason,
    endedAt: decision.state === "skipped" ? new Date() : null,
  });

  /** Inserts the run `decide` files; nothing when its key is taken. */
  const insert = (
    tx: Tx,
    routine: RoutineRow,
    slot: string,
    attempt: number,
    decide: Decide
  ): RoutineRunRow | undefined => {
    const decision = decide(
      routine,
      liveOf(tx, routine.id),
      oldestQueued(tx, routine.id) !== undefined
    );
    return tx
      .insert(taskRuns)
      .values({
        id: crypto.randomUUID(),
        triggerId: routine.id,
        slot,
        attempt,
        ...filed(decision),
        startedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning()
      .get();
  };

  return {
    claimSlot: ({ routineId, due, next, slot, decide }) =>
      db.transaction((tx) => {
        const moved = tx
          .update(taskTriggers)
          .set({ nextSlot: next, lastSlot: slot })
          .where(
            and(
              eq(taskTriggers.id, routineId),
              eq(taskTriggers.nextSlot, due),
              eq(taskTriggers.enabled, true)
            )
          )
          .returning()
          .get();
        const routine = moved ? get(routineId, tx) : undefined;
        return routine
          ? insert(tx, routine, slot.toISOString(), 1, decide)
          : undefined;
      }),
    insertRun: ({ routineId, slot, attempt, decide }) =>
      db.transaction((tx) => {
        const routine = get(routineId, tx);
        return routine ? insert(tx, routine, slot, attempt, decide) : undefined;
      }),
    claimQueued: ({ routineId, decide }) =>
      db.transaction((tx) => {
        const routine = get(routineId, tx);
        const next = oldestQueued(tx, routineId);
        if (!(routine && next) || liveOf(tx, routineId)) {
          return;
        }
        return tx
          .update(taskRuns)
          .set({
            ...filed(decide(routine, undefined, false)),
            startedAt: new Date(),
          })
          .where(and(eq(taskRuns.id, next.id), eq(taskRuns.state, "queued")))
          .returning()
          .get();
      }),
    queuedRoutines: () =>
      db
        .selectDistinct({ triggerId: taskRuns.triggerId })
        .from(taskRuns)
        .where(eq(taskRuns.state, "queued"))
        .all()
        .map((row) => row.triggerId),
    get: (id) => get(id),
    byTask: (projectId, taskId) =>
      routines()
        .where(
          and(
            eq(taskTriggers.projectId, projectId),
            eq(taskTriggers.taskId, taskId)
          )
        )
        .get(),
    carried: () =>
      db
        .select()
        .from(taskTriggers)
        .where(isNull(taskTriggers.taskId))
        .orderBy(taskTriggers.createdAt)
        .all(),
    filed: (id, projectId, taskId) =>
      db.transaction((tx) => {
        const made = tx
          .select()
          .from(taskTriggers)
          .where(
            and(
              eq(taskTriggers.projectId, projectId),
              eq(taskTriggers.taskId, taskId)
            )
          )
          .get();
        if (made && made.id !== id) {
          tx.delete(taskTriggers).where(eq(taskTriggers.id, made.id)).run();
        }
        tx.update(taskTriggers)
          .set({
            taskId,
            carried: null,
            ...(made
              ? {
                  cron: made.cron,
                  timeZone: made.timeZone,
                  target: made.target,
                  stop: made.stop,
                  deadline: made.deadline,
                  dailyCapUsd: made.dailyCapUsd,
                  mode: made.mode,
                  keep: made.keep,
                  command: made.command,
                  checkOn: made.checkOn,
                  problem: made.problem,
                }
              : {}),
          })
          .where(eq(taskTriggers.id, id))
          .run();
      }),
    repointWaits: (from, to) =>
      db.transaction((tx) => {
        tx.run(
          sql`UPDATE session_plan_steps SET waits_on = ${to} WHERE waits_on = ${from}`
        );
        tx.run(
          sql`UPDATE OR IGNORE work_item_waits SET target = ${to} WHERE target = ${from}`
        );
        tx.run(sql`DELETE FROM work_item_waits WHERE target = ${from}`);
      }),
    list: (projectId, all = false) =>
      routines()
        .where(
          and(
            isNotNull(taskTriggers.taskId),
            all ? undefined : isNotNull(taskTriggers.target),
            projectId === undefined
              ? undefined
              : eq(taskTriggers.projectId, projectId)
          )
        )
        .orderBy(taskTriggers.createdAt)
        .all(),
    update: (id, patch) => {
      const done = db
        .update(taskTriggers)
        .set(patch)
        .where(eq(taskTriggers.id, id))
        .returning({ id: taskTriggers.id })
        .get();
      return done ? get(done.id) : undefined;
    },
    run: (id) => db.select().from(taskRuns).where(eq(taskRuns.id, id)).get(),
    deleteRun: (id) => {
      db.delete(taskRuns).where(eq(taskRuns.id, id)).run();
    },
    checks: (routineId) =>
      db
        .select()
        .from(taskTriggerChecks)
        .where(eq(taskTriggerChecks.triggerId, routineId))
        .all(),
    keepChecks: (routineId, rows) =>
      db.transaction((tx) => {
        tx.delete(taskTriggerChecks)
          .where(
            and(
              eq(taskTriggerChecks.triggerId, routineId),
              notInArray(
                taskTriggerChecks.machine,
                rows.map((row) => row.machine)
              )
            )
          )
          .run();
        for (const row of rows) {
          const kept = { ...row, triggerId: routineId };
          tx.insert(taskTriggerChecks)
            .values(kept)
            .onConflictDoUpdate({
              target: [taskTriggerChecks.triggerId, taskTriggerChecks.machine],
              set: kept,
            })
            .run();
        }
      }),
    runOfItem: (workItemId) =>
      db
        .select()
        .from(taskRuns)
        .where(eq(taskRuns.workItemId, workItemId))
        .get(),
    runs: (routineId, limit, skip = 0) =>
      db
        .select()
        .from(taskRuns)
        .where(eq(taskRuns.triggerId, routineId))
        .orderBy(desc(taskRuns.startedAt), desc(taskRuns.attempt))
        .limit(limit)
        .offset(skip)
        .all(),
    newestRuns: (projectId) => {
      // One run per routine, the newest by start: a window over the
      // project's triggers, never a read of every run.
      const rows = db.all<{ id: string }>(
        sql`SELECT id FROM (
          SELECT ${taskRuns.id} AS id, row_number() OVER (
            PARTITION BY ${taskRuns.triggerId}
            ORDER BY ${taskRuns.startedAt} DESC, ${taskRuns.attempt} DESC
          ) AS n
          FROM ${taskRuns}
          JOIN ${taskTriggers} ON ${taskTriggers.id} = ${taskRuns.triggerId}
          WHERE ${taskTriggers.projectId} = ${projectId}
        ) WHERE n = 1`
      );
      const ids = rows.map((row) => row.id);
      const runs =
        ids.length === 0
          ? []
          : db.select().from(taskRuns).where(inArray(taskRuns.id, ids)).all();
      return new Map(runs.map((run) => [run.triggerId, run]));
    },
    liveRuns: () =>
      db.select().from(taskRuns).where(inArray(taskRuns.state, LIVE)).all(),
    setRun: (id, patch) =>
      db
        .update(taskRuns)
        .set(patch)
        .where(eq(taskRuns.id, id))
        .returning()
        .get(),
    runsSince: (routineId, since) =>
      db
        .select({
          runs: sql<number>`count(*)`,
          usd: sql<number>`coalesce(sum(${taskRuns.usd}), 0)`,
        })
        .from(taskRuns)
        .where(
          and(
            eq(taskRuns.triggerId, routineId),
            gte(taskRuns.startedAt, new Date(since))
          )
        )
        .get() ?? { runs: 0, usd: 0 },
  };
};
