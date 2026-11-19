import type { ClaudeModelUsage } from "@cawco/core/session-messages";
import { DAY_MS } from "@cawco/core/time";
import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { instances, turnUsage } from "./schema";
import { noteTurns } from "./usage-periods";

/** Two weeks: two weekly windows, enough to measure a rate across a reset. */
const TURN_USAGE_RETENTION_MS = 14 * DAY_MS;

export type TurnUsageRow = typeof turnUsage.$inferSelect;

export interface TurnUsageDb {
  /**
   * The accounts a turn ran on, on `machineId`, since `since`: each one's
   * sign-in there a model's answer proved.
   */
  readonly accountsUsedOn: (machineId: string, since: number) => Set<string>;
  /** One account's turns over a time range, oldest first; every turn with none named. */
  readonly list: (q: {
    accountId?: string;
    since?: number;
    until?: number;
  }) => TurnUsageRow[];
  /** One session's turns since `since`, newest first, at most `limit`. */
  readonly listOf: (
    instanceId: string,
    since: number,
    limit: number
  ) => TurnUsageRow[];
  /** Drops turns older than the retention; how many went. */
  readonly prune: (now?: number) => number;
  /**
   * A claimed turn's rows, and the Claude session's new cumulative baseline,
   * together, each new row counted into the usage summary
   * (usage-periods.ts `noteTurns`); a second put of the same turn's rows is
   * ignored.
   */
  readonly put: (
    instanceId: string,
    rows: TurnUsageRow[],
    seen?: Record<string, ClaudeModelUsage>
  ) => void;
}

export const turnUsageDb = (db: BunSQLiteDatabase): TurnUsageDb => ({
  accountsUsedOn: (machineId, since) =>
    new Set(
      db
        .selectDistinct({ accountId: turnUsage.accountId })
        .from(turnUsage)
        .innerJoin(instances, eq(instances.id, turnUsage.instanceId))
        .where(
          and(
            eq(instances.machineId, machineId),
            gte(turnUsage.at, new Date(since)),
            isNotNull(turnUsage.accountId)
          )
        )
        .all()
        .flatMap((row) => (row.accountId ? [row.accountId] : []))
    ),
  put: (instanceId, rows, seen) => {
    db.transaction((tx) => {
      if (rows.length > 0) {
        // Only the rows written now join the usage summary: a second put of
        // the same turn's rows counts nothing twice.
        noteTurns(
          tx,
          tx
            .insert(turnUsage)
            .values(rows)
            .onConflictDoNothing()
            .returning()
            .all()
        );
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
  listOf: (instanceId, since, limit) =>
    db
      .select()
      .from(turnUsage)
      .where(
        and(
          eq(turnUsage.instanceId, instanceId),
          gte(turnUsage.at, new Date(since))
        )
      )
      .orderBy(desc(turnUsage.at))
      .limit(limit)
      .all(),
  prune: (now = Date.now()) =>
    db
      .delete(turnUsage)
      .where(lte(turnUsage.at, new Date(now - TURN_USAGE_RETENTION_MS)))
      .returning({ resultId: turnUsage.resultId })
      .all().length,
});
