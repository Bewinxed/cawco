/**
 * Anonymous counts for one experiment: a SQLite-backed Durable Object named
 * by the experiment, holding one row per day, variant and event with its
 * count. Nothing names who sent an event: no id, no address, no time finer
 * than the day.
 */
import { DurableObject } from "cloudflare:workers";

export const EVENTS = ["shown", "trial", "bought"] as const;
export type ExperimentEvent = (typeof EVENTS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days the per-day counts reach back. */
const DAYS_SHOWN = 60;

const TABLE = `CREATE TABLE IF NOT EXISTS counter (
  day INTEGER NOT NULL,
  variant TEXT NOT NULL,
  event TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, variant, event)
)`;

type Counts = Record<string, Record<ExperimentEvent, number>>;

export interface Report {
  /** Per day, oldest first, for the days in the last 60 that have any count. */
  readonly days: readonly { readonly date: string; readonly counts: Counts }[];
  readonly totals: Counts;
}

/** Every variant with every event at zero. */
const zeroes = (variants: readonly string[]): Counts =>
  Object.fromEntries(
    variants.map((variant) => [
      variant,
      Object.fromEntries(EVENTS.map((event) => [event, 0])) as Record<
        ExperimentEvent,
        number
      >,
    ])
  );

export class Experiment extends DurableObject<Env> {
  private get sql(): SqlStorage {
    this.ctx.storage.sql.exec(TABLE);
    return this.ctx.storage.sql;
  }

  count(variant: string, event: ExperimentEvent): void {
    this.sql.exec(
      "INSERT INTO counter (day, variant, event, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, variant, event) DO UPDATE SET n = n + 1",
      Math.floor(Date.now() / DAY_MS),
      variant,
      event
    );
  }

  /** The counts of the variants the allow-list names. */
  report(variants: readonly string[]): Report {
    const rows = this.sql
      .exec<{
        day: number;
        event: ExperimentEvent;
        n: number;
        variant: string;
      }>("SELECT day, variant, event, n FROM counter ORDER BY day")
      .toArray()
      .filter(
        (row) =>
          variants.includes(row.variant) &&
          (EVENTS as readonly string[]).includes(row.event)
      );
    const totals = zeroes(variants);
    const days = new Map<number, Counts>();
    const since = Math.floor(Date.now() / DAY_MS) - (DAYS_SHOWN - 1);
    for (const { day, variant, event, n } of rows) {
      const total = totals[variant];
      if (total) {
        total[event] += n;
      }
      if (day >= since) {
        const counts = days.get(day) ?? zeroes(variants);
        const cell = counts[variant];
        if (cell) {
          cell[event] += n;
        }
        days.set(day, counts);
      }
    }
    return {
      totals,
      days: [...days].map(([day, counts]) => ({
        date: new Date(day * DAY_MS).toISOString().slice(0, 10),
        counts,
      })),
    };
  }
}
