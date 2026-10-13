import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { type RoutineRunState, routineRuns, routines } from "./schema";

export type RoutineRow = typeof routines.$inferSelect;
export type RoutineRunRow = typeof routineRuns.$inferSelect;

/**
 * What a run is filed as: started; queued behind a live run (an event's
 * run, which is a delivery and is never dropped); or skipped, each with the
 * sentence that says why.
 */
export type RunDecision =
  | { state: "starting" }
  | { reason: string; state: "queued" | "skipped" };

/** What a decision reads: the routine, its run still going, and whether runs wait behind it. */
export type Decide = (
  routine: RoutineRow,
  live: RoutineRunRow | undefined,
  waiting: boolean
) => RunDecision;

/** The states of a run that is still going: what overlap looks for. */
const LIVE: RoutineRunState[] = ["starting", "running"];

export interface RoutinesDb {
  /**
   * The next queued run, taken in one transaction while the routine has no
   * run going: its oldest by arrival, filed as `decide` says now (started,
   * or skipped when a gate holds it). Nothing while a run goes or none
   * waits; a run is taken once, its state still `queued` when it is.
   */
  readonly claimQueued: (claim: {
    decide: Decide;
    routineId: string;
  }) => RoutineRunRow | undefined;
  /**
   * THE fire of a scheduled slot, in one transaction: `next_slot` moves from
   * `due` to `next` (only while it still reads `due` and the routine is on),
   * and the run (routine, `slot`, attempt 1) is inserted as `decide` files it.
   * Answers the run, or nothing when another tick moved the slot first or
   * the run is there already: then nothing fires.
   */
  readonly claimSlot: (claim: {
    decide: Decide;
    due: Date;
    next: Date;
    routineId: string;
    slot: Date;
  }) => RoutineRunRow | undefined;
  readonly create: (row: RoutineRow) => RoutineRow;
  readonly delete: (id: string) => boolean;
  readonly get: (id: string) => RoutineRow | undefined;
  /**
   * Files an unscheduled run (a new routine's test, a run asked for by hand,
   * a retry) as `decide` says, in one transaction; nothing when (routine,
   * slot, attempt) is there already.
   */
  readonly insertRun: (run: {
    attempt: number;
    decide: Decide;
    routineId: string;
    slot: string;
  }) => RoutineRunRow | undefined;
  /** Routines of a project, or the fleet's (`null`), or every one (`undefined`), oldest first. */
  readonly list: (projectId?: string | null) => RoutineRow[];
  /** Runs still starting or running, every routine's. */
  readonly liveRuns: () => RoutineRunRow[];
  /** Routines that have runs waiting: what a hub start drains. */
  readonly queuedRoutines: () => string[];
  readonly run: (id: string) => RoutineRunRow | undefined;
  readonly runOfItem: (workItemId: string) => RoutineRunRow | undefined;
  /** A routine's runs, newest first. */
  readonly runs: (routineId: string, limit: number) => RoutineRunRow[];
  /** A routine's runs started at or after `since` (ms): how many, and the dollars they spent. */
  readonly runsSince: (
    routineId: string,
    since: number
  ) => { runs: number; usd: number };
  readonly setRun: (
    id: string,
    patch: Partial<Omit<RoutineRunRow, "id" | "routineId">>
  ) => RoutineRunRow | undefined;
  /** Dollars a routine's runs started at or after `since` (ms) have spent. */
  readonly spentSince: (routineId: string, since: number) => number;
  readonly update: (
    id: string,
    patch: Partial<Omit<RoutineRow, "id" | "createdAt">>
  ) => RoutineRow | undefined;
}

export const routinesDb = (db: BunSQLiteDatabase): RoutinesDb => {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  const get = (id: string, q: Tx | BunSQLiteDatabase = db) =>
    q.select().from(routines).where(eq(routines.id, id)).get();

  const liveOf = (tx: Tx, routineId: string) =>
    tx
      .select()
      .from(routineRuns)
      .where(
        and(
          eq(routineRuns.routineId, routineId),
          inArray(routineRuns.state, LIVE)
        )
      )
      .orderBy(desc(routineRuns.startedAt))
      .get();

  /** The routine's oldest queued run, by arrival (rowid). */
  const oldestQueued = (tx: Tx, routineId: string) =>
    tx
      .select()
      .from(routineRuns)
      .where(
        and(
          eq(routineRuns.routineId, routineId),
          eq(routineRuns.state, "queued")
        )
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
      .insert(routineRuns)
      .values({
        id: crypto.randomUUID(),
        routineId: routine.id,
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
          .update(routines)
          .set({ nextSlot: next, lastSlot: slot })
          .where(
            and(
              eq(routines.id, routineId),
              eq(routines.nextSlot, due),
              eq(routines.enabled, true)
            )
          )
          .returning()
          .get();
        return moved
          ? insert(tx, moved, slot.toISOString(), 1, decide)
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
          .update(routineRuns)
          .set({
            ...filed(decide(routine, undefined, false)),
            startedAt: new Date(),
          })
          .where(
            and(eq(routineRuns.id, next.id), eq(routineRuns.state, "queued"))
          )
          .returning()
          .get();
      }),
    queuedRoutines: () =>
      db
        .selectDistinct({ routineId: routineRuns.routineId })
        .from(routineRuns)
        .where(eq(routineRuns.state, "queued"))
        .all()
        .map((row) => row.routineId),
    create: (row) => db.insert(routines).values(row).returning().get(),
    get: (id) => get(id),
    list: (projectId) => {
      const query = db.select().from(routines);
      const scoped =
        projectId === undefined
          ? query
          : query.where(
              projectId === null
                ? isNull(routines.projectId)
                : eq(routines.projectId, projectId)
            );
      return scoped.orderBy(routines.createdAt).all();
    },
    update: (id, patch) =>
      db
        .update(routines)
        .set(patch)
        .where(eq(routines.id, id))
        .returning()
        .get(),
    delete: (id) =>
      db.delete(routines).where(eq(routines.id, id)).returning().all().length >
      0,
    run: (id) =>
      db.select().from(routineRuns).where(eq(routineRuns.id, id)).get(),
    runOfItem: (workItemId) =>
      db
        .select()
        .from(routineRuns)
        .where(eq(routineRuns.workItemId, workItemId))
        .get(),
    runs: (routineId, limit) =>
      db
        .select()
        .from(routineRuns)
        .where(eq(routineRuns.routineId, routineId))
        .orderBy(desc(routineRuns.startedAt), desc(routineRuns.attempt))
        .limit(limit)
        .all(),
    liveRuns: () =>
      db
        .select()
        .from(routineRuns)
        .where(inArray(routineRuns.state, LIVE))
        .all(),
    setRun: (id, patch) =>
      db
        .update(routineRuns)
        .set(patch)
        .where(eq(routineRuns.id, id))
        .returning()
        .get(),
    runsSince: (routineId, since) =>
      db
        .select({
          runs: sql<number>`count(*)`,
          usd: sql<number>`coalesce(sum(${routineRuns.usd}), 0)`,
        })
        .from(routineRuns)
        .where(
          and(
            eq(routineRuns.routineId, routineId),
            gte(routineRuns.startedAt, new Date(since))
          )
        )
        .get() ?? { runs: 0, usd: 0 },
    spentSince: (routineId, since) =>
      db
        .select({
          usd: sql<number>`coalesce(sum(${routineRuns.usd}), 0)`,
        })
        .from(routineRuns)
        .where(
          and(
            eq(routineRuns.routineId, routineId),
            gte(routineRuns.startedAt, new Date(since))
          )
        )
        .get()?.usd ?? 0,
  };
};
