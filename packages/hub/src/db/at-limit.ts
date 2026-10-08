import type { AccountMove } from "@cawco/core";
import { asc, eq, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { limitEvents, limitHolds, limitSummaries } from "./schema";

/** A session waiting out its account's limit. */
export interface LimitHold {
  /** The account at its limit. */
  accountId: string;
  instanceId: string;
  /** When it goes on: the reset; null when none was named. */
  until: number | null;
}

/** A summary written ahead of the limit, or being written. */
export interface LimitSummary {
  accountId: string;
  instanceId: string;
  /** That window's percent when it was started. */
  percent: number;
  /** The reset of the window it was written against (ISO). */
  resetsAt: string;
  /** Null while the summariser writes it. */
  summary: string | null;
}

/** One line the hub wrote into a session's transcript at its account's limit. */
export interface LimitEvent {
  at: number;
  id: string;
  instanceId: string;
  move: AccountMove;
}

export interface AtLimitDb {
  readonly dropHold: (instanceId: string) => void;
  readonly dropSummary: (instanceId: string) => void;
  /** The lines written into these sessions' transcripts, oldest first. */
  readonly events: (instanceIds: string[]) => LimitEvent[];
  readonly forget: (instanceIds: string[]) => void;
  readonly hold: (instanceId: string) => LimitHold | undefined;
  readonly holds: () => LimitHold[];
  readonly putEvent: (event: LimitEvent) => void;
  readonly putHold: (hold: LimitHold) => void;
  /** Starts a summary ahead of the limit; false when one is already kept or being written. */
  readonly startSummary: (
    summary: Omit<LimitSummary, "summary">,
    at?: number
  ) => boolean;
  readonly summaries: () => LimitSummary[];
  readonly summary: (instanceId: string) => LimitSummary | undefined;
  readonly writeSummary: (instanceId: string, summary: string) => void;
}

type HoldRow = typeof limitHolds.$inferSelect;

const toHold = (row: HoldRow): LimitHold => ({
  instanceId: row.instanceId,
  accountId: row.accountId,
  until: row.until?.getTime() ?? null,
});

const toSummary = (row: typeof limitSummaries.$inferSelect): LimitSummary => ({
  instanceId: row.instanceId,
  accountId: row.accountId,
  resetsAt: row.resetsAt,
  percent: row.percent,
  summary: row.summary,
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
  summaries: () => db.select().from(limitSummaries).all().map(toSummary),
  summary: (instanceId) => {
    const row = db
      .select()
      .from(limitSummaries)
      .where(eq(limitSummaries.instanceId, instanceId))
      .get();
    return row ? toSummary(row) : undefined;
  },
  startSummary: (
    { instanceId, accountId, resetsAt, percent },
    at = Date.now()
  ) =>
    db
      .insert(limitSummaries)
      .values({
        instanceId,
        accountId,
        resetsAt,
        percent,
        summary: null,
        preparedAt: new Date(at),
      })
      .onConflictDoNothing()
      .returning()
      .all().length > 0,
  writeSummary: (instanceId, summary) => {
    db.update(limitSummaries)
      .set({ summary })
      .where(eq(limitSummaries.instanceId, instanceId))
      .run();
  },
  dropSummary: (instanceId) => {
    db.delete(limitSummaries)
      .where(eq(limitSummaries.instanceId, instanceId))
      .run();
  },
  putEvent: ({ id, instanceId, at, move }) => {
    db.insert(limitEvents)
      .values({ id, instanceId, at: new Date(at), move })
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
          .map((row) => ({
            id: row.id,
            instanceId: row.instanceId,
            at: row.at.getTime(),
            move: row.move,
          })),
  forget: (instanceIds) => {
    if (instanceIds.length === 0) {
      return;
    }
    db.delete(limitHolds)
      .where(inArray(limitHolds.instanceId, instanceIds))
      .run();
    db.delete(limitSummaries)
      .where(inArray(limitSummaries.instanceId, instanceIds))
      .run();
    db.delete(limitEvents)
      .where(inArray(limitEvents.instanceId, instanceIds))
      .run();
  },
});
