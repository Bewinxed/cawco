import type { AccountMove } from "@cawco/core";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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

/**
 * A session's summary at its account's limit, written ahead of the limit or
 * at a move, or being written (schema `limitSummaries`).
 */
export interface LimitSummary {
  /** The account the session is on. */
  accountId: string;
  /** The last transcript entry it covers; null while the summariser writes it. */
  covers: string | null;
  instanceId: string;
  /** That window's percent when a summary ahead of the limit was started; null: written at a move. */
  percent: number | null;
  /** The reset of the window it was written against (ISO). */
  resetsAt: string;
  /** Null while the summariser writes it. */
  summary: string | null;
  /** The account whose summariser wrote it. */
  writtenOn: string;
}

/** One line the hub wrote into a session's transcript at its account's limit. */
export interface LimitEvent {
  at: number;
  id: string;
  instanceId: string;
  move: AccountMove;
}

export interface AtLimitDb {
  /** Takes one line back. */
  readonly dropEvent: (id: string) => void;
  readonly dropHold: (instanceId: string) => void;
  readonly dropSummary: (instanceId: string) => void;
  /** The lines written into these sessions' transcripts, oldest first. */
  readonly events: (instanceIds: string[]) => LimitEvent[];
  readonly forget: (instanceIds: string[]) => void;
  readonly hold: (instanceId: string) => LimitHold | undefined;
  readonly holds: () => LimitHold[];
  /** Keeps a summary written at a move, in place of any kept before. */
  readonly keepSummary: (
    summary: Omit<LimitSummary, "covers" | "summary"> & {
      covers: string;
      summary: string;
    },
    at?: number
  ) => void;
  /** Writes a line; one already written under its id is what it says now (a continuation's "Summarising…" turned into what came of it). */
  readonly putEvent: (event: LimitEvent) => void;
  readonly putHold: (hold: LimitHold) => void;
  /** Starts a summary ahead of the limit; false when one is already kept or being written. */
  readonly startSummary: (
    summary: Omit<LimitSummary, "covers" | "summary" | "percent"> & {
      percent: number;
    },
    at?: number
  ) => boolean;
  readonly summaries: () => LimitSummary[];
  readonly summary: (instanceId: string) => LimitSummary | undefined;
  /** A summary started ahead of the limit, written: its words and the last entry they cover. */
  readonly writeSummary: (
    instanceId: string,
    written: { covers: string; summary: string }
  ) => void;
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
  writtenOn: row.writtenOn,
  resetsAt: row.resetsAt,
  percent: row.percent,
  covers: row.covers,
  summary: row.summary,
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
  summaries: () => db.select().from(limitSummaries).all().map(toSummary),
  summary: (instanceId) => {
    const row = db
      .select()
      .from(limitSummaries)
      .where(eq(limitSummaries.instanceId, instanceId))
      .get();
    return row ? toSummary(row) : undefined;
  },
  keepSummary: (summary, at = Date.now()) => {
    const values = { ...summary, preparedAt: new Date(at) };
    db.insert(limitSummaries)
      .values(values)
      .onConflictDoUpdate({ target: limitSummaries.instanceId, set: values })
      .run();
  },
  startSummary: (
    { instanceId, accountId, writtenOn, resetsAt, percent },
    at = Date.now()
  ) =>
    db
      .insert(limitSummaries)
      .values({
        instanceId,
        accountId,
        writtenOn,
        resetsAt,
        percent,
        covers: null,
        summary: null,
        preparedAt: new Date(at),
      })
      .onConflictDoNothing()
      .returning()
      .all().length > 0,
  // Only into the row it started: a summary kept at a move meanwhile stands.
  writeSummary: (instanceId, { covers, summary }) => {
    db.update(limitSummaries)
      .set({ covers, summary })
      .where(
        and(
          eq(limitSummaries.instanceId, instanceId),
          isNull(limitSummaries.summary)
        )
      )
      .run();
  },
  dropSummary: (instanceId) => {
    db.delete(limitSummaries)
      .where(eq(limitSummaries.instanceId, instanceId))
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
    db.delete(limitSummaries)
      .where(inArray(limitSummaries.instanceId, instanceIds))
      .run();
    db.delete(limitEvents)
      .where(inArray(limitEvents.instanceId, instanceIds))
      .run();
  },
});
