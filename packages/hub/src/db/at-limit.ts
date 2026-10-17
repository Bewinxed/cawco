import type { AccountMove } from "@cawco/core";
import { asc, eq, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { limitCompactions, limitEvents, limitHolds } from "./schema";

/** A session waiting out its account's limit. */
export interface LimitHold {
  /** The account at its limit. */
  accountId: string;
  instanceId: string;
  /** When it goes on: the earliest moment an account takes it again; null when none was named. */
  until: number | null;
}

/**
 * A session's compaction after a move at its limit, from the move until it
 * has ended (schema `limitCompactions`).
 */
export interface LimitCompaction {
  compacted: boolean;
  compactUuid: string;
  filingUuid: string;
  instanceId: string;
  lineId: string;
  move: AccountMove;
  stage: "filing" | "compacting";
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
  /** Moves a compaction on: its stage, or that it compacted. */
  readonly patchCompaction: (
    instanceId: string,
    patch: Partial<Pick<LimitCompaction, "compacted" | "stage">>
  ) => void;
  /** Starts a session's compaction, in place of any it had. */
  readonly putCompaction: (compaction: LimitCompaction) => void;
  /** Writes a line; one already written under its id is what it says now (a compaction's move line as it goes). */
  readonly putEvent: (event: LimitEvent) => void;
  readonly putHold: (hold: LimitHold) => void;
}

type HoldRow = typeof limitHolds.$inferSelect;

const toHold = (row: HoldRow): LimitHold => ({
  instanceId: row.instanceId,
  accountId: row.accountId,
  until: row.until?.getTime() ?? null,
});

const toCompaction = (
  row: typeof limitCompactions.$inferSelect
): LimitCompaction => ({
  instanceId: row.instanceId,
  stage: row.stage,
  lineId: row.lineId,
  move: row.move,
  filingUuid: row.filingUuid,
  compactUuid: row.compactUuid,
  compacted: row.compacted,
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
  putHold: ({ instanceId, accountId, until }) => {
    const values = {
      accountId,
      until: until === null ? null : new Date(until),
    };
    db.insert(limitHolds)
      .values({ instanceId, ...values })
      .onConflictDoUpdate({ target: limitHolds.instanceId, set: values })
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
