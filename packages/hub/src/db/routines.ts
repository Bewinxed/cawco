import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { type RoutineRunState, routineRuns, routines } from "./schema";

export type RoutineRow = typeof routines.$inferSelect;
export type RoutineRunRow = typeof routineRuns.$inferSelect;

/** What a run is filed as: started, or skipped with the sentence that says why. */
export type RunDecision =
  | { state: "starting" }
  | { reason: string; state: "skipped" };

/** The states of a run that is still going: what overlap looks for. */
const LIVE: RoutineRunState[] = ["starting", "running"];

export interface RoutinesDb {
  /**
   * THE fire of a scheduled slot, in one transaction: `next_slot` moves from
   * `due` to `next` (only while it still reads `due` and the routine is on),
   * and the run (routine, `slot`, attempt 1) is inserted as `decide` files it.
   * Answers the run, or nothing when another tick moved the slot first or
   * the run is there already: then nothing fires.
   */
  readonly claimSlot: (claim: {
    decide: (
      routine: RoutineRow,
      live: RoutineRunRow | undefined
    ) => RunDecision;
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
    decide: (
      routine: RoutineRow,
      live: RoutineRunRow | undefined
    ) => RunDecision;
    routineId: string;
    slot: string;
  }) => RoutineRunRow | undefined;
  /** Routines of a project, or the fleet's (`null`), or every one (`undefined`), oldest first. */
  readonly list: (projectId?: string | null) => RoutineRow[];
  /** Runs still starting or running, every routine's. */
  readonly liveRuns: () => RoutineRunRow[];
  readonly run: (id: string) => RoutineRunRow | undefined;
  readonly runOfItem: (workItemId: string) => RoutineRunRow | undefined;
  /** A routine's runs, newest first. */
  readonly runs: (routineId: string, limit: number) => RoutineRunRow[];
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

  /** Inserts the run `decide` files; nothing when its key is taken. */
  const insert = (
    tx: Tx,
    routine: RoutineRow,
    slot: string,
    attempt: number,
    decide: (
      routine: RoutineRow,
      live: RoutineRunRow | undefined
    ) => RunDecision
  ): RoutineRunRow | undefined => {
    const decision = decide(routine, liveOf(tx, routine.id));
    return tx
      .insert(routineRuns)
      .values({
        id: crypto.randomUUID(),
        routineId: routine.id,
        slot,
        attempt,
        state: decision.state,
        ...(decision.state === "skipped"
          ? { reason: decision.reason, endedAt: new Date() }
          : {}),
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
