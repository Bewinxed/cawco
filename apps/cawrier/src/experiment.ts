/**
 * One experiment's purchases, as App Store Server Notifications report them:
 * a SQLite-backed Durable Object named by the experiment. Nothing comes from
 * the device. Each paywall variant gives StoreKit one fixed `appAccountToken`
 * (`EXPERIMENT_TOKENS`), so a purchase names its variant and no person: there
 * is no per-user id anywhere.
 *
 * One row per purchase (its environment and original transaction id), with
 * its variant, what it was (`trial` or `bought`) and Apple's day for it. The
 * counts are read off the rows that are not revoked, so a refund takes its
 * purchase out of every count, and a revocation is terminal: a charge that
 * arrives after its refund (Apple does not keep order, and retries for days)
 * finds the row revoked and counts nothing. Each notification is applied once,
 * by its `notificationUUID`.
 */
import { DurableObject } from "cloudflare:workers";

export const EVENTS = ["trial", "bought"] as const;
export type ExperimentEvent = (typeof EVENTS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days the per-day counts reach back. */
const DAYS_SHOWN = 60;
/** Apple retries a notification for days; one seen is remembered longer than that. */
const SEEN_KEPT_DAYS = 30;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS purchase (
    transaction_key TEXT PRIMARY KEY,
    variant TEXT,
    event TEXT,
    day INTEGER,
    charged_at INTEGER,
    revoked_at INTEGER
  )`,
  "CREATE TABLE IF NOT EXISTS seen (uuid TEXT PRIMARY KEY, day INTEGER NOT NULL)",
  // The device-sent counts this replaced (POST /v1/experiment/event).
  "DROP TABLE IF EXISTS counter",
];

type Counts = Record<string, Record<ExperimentEvent, number>>;

export interface Report {
  /** Per day, oldest first, for the days in the last 60 that have any count. */
  readonly days: readonly { readonly date: string; readonly counts: Counts }[];
  readonly totals: Counts;
}

export interface Charge {
  readonly event: ExperimentEvent;
  /** Apple's purchase time, ms epoch: the day it is counted under. */
  readonly purchasedAt: number;
  /** Apple's signing time of the notification, ms epoch. */
  readonly signedAt: number;
  /** `<environment>:<originalTransactionId>`. */
  readonly transactionKey: string;
  readonly uuid: string;
  readonly variant: string;
}

export interface Revocation {
  readonly signedAt: number;
  readonly transactionKey: string;
  readonly uuid: string;
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
    for (const table of TABLES) {
      this.ctx.storage.sql.exec(table);
    }
    return this.ctx.storage.sql;
  }

  /** True the first time a notification is seen; old marks are dropped as it goes. */
  private firstSight(uuid: string): boolean {
    const { sql } = this;
    const today = Math.floor(Date.now() / DAY_MS);
    sql.exec("DELETE FROM seen WHERE day < ?", today - SEEN_KEPT_DAYS);
    const [already] = sql
      .exec("SELECT 1 FROM seen WHERE uuid = ?", uuid)
      .toArray();
    if (already) {
      return false;
    }
    sql.exec("INSERT INTO seen (uuid, day) VALUES (?, ?)", uuid, today);
    return true;
  }

  /** A purchase under a variant: counted once; never over a refund. */
  charge(next: Charge): "counted" | "seen" | "revoked" {
    if (!this.firstSight(next.uuid)) {
      return "seen";
    }
    const [held] = this.sql
      .exec<{ revoked_at: number | null }>(
        "SELECT revoked_at FROM purchase WHERE transaction_key = ?",
        next.transactionKey
      )
      .toArray();
    if (held && held.revoked_at !== null) {
      return "revoked";
    }
    if (held) {
      return "seen";
    }
    this.sql.exec(
      "INSERT INTO purchase (transaction_key, variant, event, day, charged_at) VALUES (?, ?, ?, ?, ?)",
      next.transactionKey,
      next.variant,
      next.event,
      Math.floor(next.purchasedAt / DAY_MS),
      next.signedAt
    );
    return "counted";
  }

  /** A refund or revocation: terminal, in whatever order it arrives beside the charge. */
  revoke(next: Revocation): void {
    if (!this.firstSight(next.uuid)) {
      return;
    }
    this.sql.exec(
      "INSERT INTO purchase (transaction_key, revoked_at) VALUES (?, ?) ON CONFLICT (transaction_key) DO UPDATE SET revoked_at = COALESCE(revoked_at, excluded.revoked_at)",
      next.transactionKey,
      next.signedAt
    );
  }

  /** The counts of the variants the allow-list names, refunds taken out. */
  report(variants: readonly string[]): Report {
    const rows = this.sql
      .exec<{
        day: number;
        event: ExperimentEvent;
        n: number;
        variant: string;
      }>(
        "SELECT day, variant, event, COUNT(*) AS n FROM purchase WHERE revoked_at IS NULL AND variant IS NOT NULL GROUP BY day, variant, event ORDER BY day"
      )
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
