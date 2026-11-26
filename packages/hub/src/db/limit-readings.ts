/** The readings of the bounds still waiting on data (core limit-readings.ts), kept and read back. */

import {
  type LimitReading,
  type LimitReadingSummary,
  quantileOf,
} from "@cawco/core/limit-readings";
import { sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { limitReadings } from "./schema";

export interface LimitReadingsDb {
  /** Folds `readings`, taken on `machine`, into the rows of their metric, day and bucket: one write each. */
  readonly keep: (machine: string, readings: readonly LimitReading[]) => void;
  /** Each metric's readings on each machine: how many, their p50, p95, p99 and largest, and the days they span. */
  readonly summary: () => LimitReadingSummary[];
}

export const limitReadingsDb = (db: BunSQLiteDatabase): LimitReadingsDb => ({
  keep: (machine, readings) => {
    if (readings.length === 0) {
      return;
    }
    db.transaction((tx) => {
      for (const reading of readings) {
        tx.insert(limitReadings)
          .values({
            metric: reading.metric,
            machine,
            day: reading.day,
            bucket: reading.bucket,
            value: reading.value,
            count: reading.count,
            at: new Date(reading.at),
          })
          .onConflictDoUpdate({
            target: [
              limitReadings.metric,
              limitReadings.machine,
              limitReadings.day,
              limitReadings.bucket,
            ],
            set: {
              value: sql`max(${limitReadings.value}, excluded.value)`,
              count: sql`${limitReadings.count} + excluded.count`,
              at: sql`max(${limitReadings.at}, excluded.at)`,
            },
          })
          .run();
      }
    });
  },
  summary: () => {
    const rows = db
      .select()
      .from(limitReadings)
      .orderBy(limitReadings.metric, limitReadings.machine, limitReadings.value)
      .all();
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.metric}\u0000${row.machine}`;
      const group = groups.get(key);
      if (group) {
        group.push(row);
      } else {
        groups.set(key, [row]);
      }
    }
    return [...groups.values()].flatMap((group) => {
      const [head] = group;
      if (!head) {
        return [];
      }
      const days = group.map((row) => row.day).sort();
      return [
        {
          metric: head.metric,
          machine: head.machine,
          count: group.reduce((sum, row) => sum + row.count, 0),
          p50: quantileOf(group, 0.5),
          p95: quantileOf(group, 0.95),
          p99: quantileOf(group, 0.99),
          max: Math.max(...group.map((row) => row.value)),
          first: days[0] ?? head.day,
          last: days.at(-1) ?? head.day,
        },
      ];
    });
  },
});
