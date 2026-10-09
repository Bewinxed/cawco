import type { ClaudeModelUsage } from "@cawco/core";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { instances, turnUsage } from "./schema";

/** Two weeks: two weekly windows, enough to measure a rate across a reset. */
export const TURN_USAGE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export type TurnUsageRow = typeof turnUsage.$inferSelect;

export interface TurnUsageDb {
  /** One account's turns over a time range, oldest first; every turn with none named. */
  readonly list: (q: {
    accountId?: string;
    since?: number;
    until?: number;
  }) => TurnUsageRow[];
  /** Drops turns older than the retention; how many went. */
  readonly prune: (now?: number) => number;
  /**
   * A claimed turn's rows, and the Claude session's new cumulative baseline,
   * together; a second put of the same turn's rows is ignored.
   */
  readonly put: (
    instanceId: string,
    rows: TurnUsageRow[],
    seen?: Record<string, ClaudeModelUsage>
  ) => void;
}

export const turnUsageDb = (db: BunSQLiteDatabase): TurnUsageDb => ({
  put: (instanceId, rows, seen) => {
    db.transaction((tx) => {
      if (rows.length > 0) {
        tx.insert(turnUsage).values(rows).onConflictDoNothing().run();
      }
      if (seen) {
        tx.update(instances)
          .set({ modelUsageSeen: seen })
          .where(eq(instances.id, instanceId))
          .run();
      }
    });
  },
  list: ({ accountId, since, until }) =>
    db
      .select()
      .from(turnUsage)
      .where(
        and(
          ...(accountId ? [eq(turnUsage.accountId, accountId)] : []),
          ...(since === undefined ? [] : [gte(turnUsage.at, new Date(since))]),
          ...(until === undefined ? [] : [lte(turnUsage.at, new Date(until))])
        )
      )
      .orderBy(asc(turnUsage.at))
      .all(),
  prune: (now = Date.now()) =>
    db
      .delete(turnUsage)
      .where(lte(turnUsage.at, new Date(now - TURN_USAGE_RETENTION_MS)))
      .returning({ resultId: turnUsage.resultId })
      .all().length,
});
