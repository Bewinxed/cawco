/**
 * The devices one subscription is on: a SQLite-backed Durable Object named by
 * the subscription's environment and original transaction id, holding one
 * row per live pairing and what Apple last said of the subscription. A
 * pairing takes a seat when it enrolls under the subscription and gives it
 * back when it is wiped (its alarm, APNs saying the device is gone, or the
 * subscription ending). Its own storage, not KV: the free plan allows KV
 * 1,000 writes a day.
 *
 * What Apple last said ({@link Entitlement}) comes from a phone's transaction
 * at enrolment and from App Store Server Notifications; the one Apple signed
 * later stands (entitlement.ts). A notification moves every pairing on the
 * seat to the subscription's new end ({@link Seats.settle}). Once the
 * subscription has ended, the word stays even with no seat left: a phone's
 * own copy of a refunded transaction carries no revocation, so this is what
 * refuses it, until Apple signs a later word (a resubscription, a reversed
 * refund).
 */
import { DurableObject } from "cloudflare:workers";
import { type Entitlement, fresher } from "./entitlement";

/** Live pairings one subscription may hold. */
export const SEATS_PER_PURCHASE = 10;

const TABLES = [
  "CREATE TABLE IF NOT EXISTS seat (pairing TEXT PRIMARY KEY)",
  "CREATE TABLE IF NOT EXISTS entitlement (signed_at INTEGER NOT NULL, until INTEGER NOT NULL)",
];

/**
 * `taken`: the pairing holds a seat now, until the subscription's end
 * (`until`; null when no subscription stands behind the seat); `full`: all
 * are taken; `ended`: the subscription has ended.
 */
export type Taken =
  | { readonly kind: "taken"; readonly until: number | null }
  | { readonly kind: "full" }
  | { readonly kind: "ended" };

/** The subscription's end as it now stands, and the pairings that hold its seats. */
export interface Settled {
  readonly pairings: string[];
  readonly until: number;
}

export class Seats extends DurableObject<Env> {
  /** The tables, made again after the last seat goes (deleteAll drops them). */
  private get sql(): SqlStorage {
    for (const table of TABLES) {
      this.ctx.storage.sql.exec(table);
    }
    return this.ctx.storage.sql;
  }

  private count(): number {
    const { n } = this.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM seat")
      .one();
    return n;
  }

  private held(): Entitlement | undefined {
    const [row] = this.sql
      .exec<{ signed_at: number; until: number }>(
        "SELECT signed_at, until FROM entitlement LIMIT 1"
      )
      .toArray();
    return row && { signedAt: row.signed_at, until: row.until };
  }

  /** Keeps the fresher of what is held and `next`; answers the one that stands. */
  private record(next: Entitlement): Entitlement {
    const held = this.held();
    const standing = fresher(held, next);
    if (standing !== held) {
      this.sql.exec("DELETE FROM entitlement");
      this.sql.exec(
        "INSERT INTO entitlement (signed_at, until) VALUES (?, ?)",
        standing.signedAt,
        standing.until
      );
    }
    return standing;
  }

  /** A seat for the pairing, given the enrolling transaction's word (null for a seat no subscription stands behind). */
  take(pairing: string, word: Entitlement | null): Taken {
    const standing = word ? this.record(word) : this.held();
    if (standing && standing.until <= Date.now()) {
      return { kind: "ended" };
    }
    const until = standing?.until ?? null;
    const { sql } = this;
    const [seated] = sql
      .exec("SELECT 1 FROM seat WHERE pairing = ?", pairing)
      .toArray();
    if (seated) {
      return { kind: "taken", until };
    }
    if (this.count() >= SEATS_PER_PURCHASE) {
      return { kind: "full" };
    }
    sql.exec("INSERT INTO seat (pairing) VALUES (?)", pairing);
    return { kind: "taken", until };
  }

  /** The pairing's seat goes back; the object empties itself with its last seat, unless the subscription has ended. */
  async release(pairing: string): Promise<void> {
    this.sql.exec("DELETE FROM seat WHERE pairing = ?", pairing);
    const held = this.held();
    if (this.count() === 0 && !(held && held.until <= Date.now())) {
      await this.ctx.storage.deleteAll();
    }
  }

  /**
   * Apple's notification about the subscription: kept when Apple signed it
   * later than what is held. Answers the end that stands and the pairings
   * that hold seats, for the caller to move to that end. Every call answers
   * every pairing, so a retry after a failed move still reaches it.
   */
  settle(word: Entitlement): Settled {
    const { until } = this.record(word);
    const pairings = this.sql
      .exec<{ pairing: string }>("SELECT pairing FROM seat")
      .toArray()
      .map(({ pairing }) => pairing);
    return { until, pairings };
  }
}
