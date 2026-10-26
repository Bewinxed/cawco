import type { AccountMove } from "@cawco/core";
import { asc, eq, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { limitCompactions, limitEvents, limitHolds } from "./schema";

/** A session waiting out its account's limit. */
export interface LimitHold {
  /** The account at its limit. */
  accountId: string;
  instanceId: string;
  /**
   * Since when it is held, epoch ms: a put keeps the first, unless it names
   * one (a hold put again after a move that didn't go keeps its start).
   */
  since?: number;
  /**
   * When it went stale, epoch ms: held past the cutoff (core
   * `AtLimit.staleAfterHours`), nothing carries it on until a person or its
   * parent writes. Null while it is carried on; every put clears it.
   */
  staleAt: number | null;
  /** When it goes on: the earliest moment an account takes it again; null when none was named. */
  until: number | null;
}

/**
 * A session's compaction after a move at its limit, from the move until it
 * has ended (schema `limitCompactions`).
 */
export interface LimitCompaction {
  /** Its carry-on's send (`carrying`), when its limit or sign-in stopped it; null when it carries nothing on. */
  carryUuid: string | null;
  compacted: boolean;
  compactUuid: string;
  /**
   * The step (its send's uuid) whose turn the hub heard end, its result
   * read after the step was: kept so a hub that restarts before the next
   * step goes moves on from it. Null until a step's turn ends.
   */
  endedStep: string | null;
  filingUuid: string;
  instanceId: string;
  lineId: string;
  move: AccountMove;
  stage: "carrying" | "filing" | "compacting";
}

/** One line the hub wrote into a session's transcript at its account's limit. */
export interface LimitEvent {
  at: number;
  id: string;
  instanceId: string;
  move: AccountMove;
}

export interface AtLimitDb {
  readonly compaction: (instanceId: string) => LimitCompaction | undefined;
  /** Each session's compaction under way. */
  readonly compactions: () => LimitCompaction[];
  readonly dropCompaction: (instanceId: string) => void;
  /** Takes one line back. */
  readonly dropEvent: (id: string) => void;
  readonly dropHold: (instanceId: string) => void;
  /** The lines written into these sessions' transcripts, oldest first. */
  readonly events: (instanceIds: string[]) => LimitEvent[];
  readonly forget: (instanceIds: string[]) => void;
  readonly hold: (instanceId: string) => LimitHold | undefined;
  readonly holds: () => LimitHold[];
  /** Records that `instanceId`'s hold went stale at `at`. */
  readonly markStale: (instanceId: string, at: number) => void;
  /** Moves a compaction on: its stage, the step whose turn ended, that it compacted, or its line as it now reads. */
  readonly patchCompaction: (
    instanceId: string,
    patch: Partial<
      Pick<LimitCompaction, "compacted" | "endedStep" | "move" | "stage">
    >
  ) => void;
  /** Starts a session's compaction, in place of any it had. */
  readonly putCompaction: (compaction: LimitCompaction) => void;
  /** Writes a line; one already written under its id is what it says now (a compaction's move line as it goes). */
  readonly putEvent: (event: LimitEvent) => void;
  /** Holds a session, its stale mark cleared: a put is a decision made now. */
  readonly putHold: (hold: Omit<LimitHold, "staleAt">) => void;
  /**
   * The line of `instanceId`'s move waiting for work in flight, while it
   * waits ({@link waitsLine}): one per session, said again in its place.
   */
  readonly waitingMove: (instanceId: string) => LimitEvent | undefined;
}

/**
 * Whether `move` is a move waiting for work in flight ("Can't move from A to
 * B yet"): a session's one line of it stands while it waits, each attempt
 * saying it again in place, and goes when the move lands or the wait ends.
 */
export const waitsLine = (move: AccountMove): boolean =>
  move.kind === "unmoved" && move.action === "move" && move.waits === true;

type HoldRow = typeof limitHolds.$inferSelect;

const toHold = (row: HoldRow): LimitHold => ({
  instanceId: row.instanceId,
  accountId: row.accountId,
  until: row.until?.getTime() ?? null,
  since: row.createdAt.getTime(),
  staleAt: row.staleAt?.getTime() ?? null,
});

const toCompaction = (
  row: typeof limitCompactions.$inferSelect
): LimitCompaction => ({
  instanceId: row.instanceId,
  stage: row.stage,
  lineId: row.lineId,
  move: row.move,
  carryUuid: row.carryUuid,
  filingUuid: row.filingUuid,
  compactUuid: row.compactUuid,
  compacted: row.compacted,
  endedStep: row.endedStep,
});

const toEvent = (row: typeof limitEvents.$inferSelect): LimitEvent => ({
  id: row.id,
  instanceId: row.instanceId,
  at: row.at.getTime(),
  move: row.move,
});

export const atLimitDb = (db: BunSQLiteDatabase): AtLimitDb => ({
  holds: () => db.select().from(limitHolds).all().map(toHold),
  hold: (instanceId) => {
    const row = db
      .select()
      .from(limitHolds)
      .where(eq(limitHolds.instanceId, instanceId))
      .get();
    return row ? toHold(row) : undefined;
  },
  putHold: ({ instanceId, accountId, until, since }) => {
    const values = {
      accountId,
      until: until === null ? null : new Date(until),
      staleAt: null,
      ...(since === undefined ? {} : { createdAt: new Date(since) }),
    };
    db.insert(limitHolds)
      .values({ instanceId, ...values })
      .onConflictDoUpdate({ target: limitHolds.instanceId, set: values })
      .run();
  },
  markStale: (instanceId, at) => {
    db.update(limitHolds)
      .set({ staleAt: new Date(at) })
      .where(eq(limitHolds.instanceId, instanceId))
      .run();
  },
  dropHold: (instanceId) => {
    db.delete(limitHolds).where(eq(limitHolds.instanceId, instanceId)).run();
  },
  compactions: () => db.select().from(limitCompactions).all().map(toCompaction),
  compaction: (instanceId) => {
    const row = db
      .select()
      .from(limitCompactions)
      .where(eq(limitCompactions.instanceId, instanceId))
      .get();
    return row ? toCompaction(row) : undefined;
  },
  putCompaction: (compaction) => {
    const values = { ...compaction, createdAt: new Date() };
    db.insert(limitCompactions)
      .values(values)
      .onConflictDoUpdate({ target: limitCompactions.instanceId, set: values })
      .run();
  },
  patchCompaction: (instanceId, patch) => {
    db.update(limitCompactions)
      .set(patch)
      .where(eq(limitCompactions.instanceId, instanceId))
      .run();
  },
  dropCompaction: (instanceId) => {
    db.delete(limitCompactions)
      .where(eq(limitCompactions.instanceId, instanceId))
      .run();
  },
  dropEvent: (id) => {
    db.delete(limitEvents).where(eq(limitEvents.id, id)).run();
  },
  putEvent: ({ id, instanceId, at, move }) => {
    db.insert(limitEvents)
      .values({ id, instanceId, at: new Date(at), move })
      .onConflictDoUpdate({
        target: limitEvents.id,
        set: { at: new Date(at), move },
      })
      .run();
  },
  events: (instanceIds) =>
    instanceIds.length === 0
      ? []
      : db
          .select()
          .from(limitEvents)
          .where(inArray(limitEvents.instanceId, instanceIds))
          .orderBy(asc(limitEvents.at))
          .all()
          .map(toEvent),
  waitingMove: (instanceId) =>
    db
      .select()
      .from(limitEvents)
      .where(eq(limitEvents.instanceId, instanceId))
      .orderBy(asc(limitEvents.at))
      .all()
      .map(toEvent)
      .findLast((event) => waitsLine(event.move)),
  forget: (instanceIds) => {
    if (instanceIds.length === 0) {
      return;
    }
    db.delete(limitHolds)
      .where(inArray(limitHolds.instanceId, instanceIds))
      .run();
    db.delete(limitCompactions)
      .where(inArray(limitCompactions.instanceId, instanceIds))
      .run();
    db.delete(limitEvents)
      .where(inArray(limitEvents.instanceId, instanceIds))
      .run();
  },
});
