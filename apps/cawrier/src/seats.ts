/**
 * The devices one purchase is on: a SQLite-backed Durable Object named by the
 * purchase's environment and original transaction id, holding one row per
 * live pairing. A pairing takes a seat when it enrolls under the purchase and
 * gives it back when it is wiped (its alarm, or APNs saying the device is
 * gone). Its own storage, not KV: the free plan allows KV 1,000 writes a day.
 *
 * Apple's REFUND or REVOKE notification revokes the purchase here for good:
 * its seats go, the pairings that held them are wiped, and no pairing takes a
 * seat under it again. The device's own copy of the transaction carries no
 * revocation, so this mark is what refuses it.
 */
import { DurableObject } from "cloudflare:workers";

/** Live pairings one purchase may hold. */
export const SEATS_PER_PURCHASE = 10;

const TABLES = [
  "CREATE TABLE IF NOT EXISTS seat (pairing TEXT PRIMARY KEY)",
  "CREATE TABLE IF NOT EXISTS revoked (at INTEGER NOT NULL)",
];

/** `taken`: the pairing holds a seat now; `full`: all are taken; `revoked`: the purchase was refunded. */
export type Taken = "taken" | "full" | "revoked";

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

  private isRevoked(): boolean {
    return this.sql.exec("SELECT 1 FROM revoked LIMIT 1").toArray().length > 0;
  }

  take(pairing: string): Taken {
    const { sql } = this;
    if (this.isRevoked()) {
      return "revoked";
    }
    const [seated] = sql
      .exec("SELECT 1 FROM seat WHERE pairing = ?", pairing)
      .toArray();
    if (seated) {
      return "taken";
    }
    if (this.count() >= SEATS_PER_PURCHASE) {
      return "full";
    }
    sql.exec("INSERT INTO seat (pairing) VALUES (?)", pairing);
    return "taken";
  }

  /** The pairing's seat goes back; the object empties itself with its last seat, unless it is revoked. */
  async release(pairing: string): Promise<void> {
    this.sql.exec("DELETE FROM seat WHERE pairing = ?", pairing);
    if (this.count() === 0 && !this.isRevoked()) {
      await this.ctx.storage.deleteAll();
    }
  }

  /**
   * Revokes the purchase for good; answers the pairings that hold its seats,
   * for the caller to wipe. Each gives its seat back as it is wiped, so a
   * retry after a failed wipe still finds it.
   */
  revoke(): string[] {
    const { sql } = this;
    if (!this.isRevoked()) {
      sql.exec("INSERT INTO revoked (at) VALUES (?)", Date.now());
    }
    return sql
      .exec<{ pairing: string }>("SELECT pairing FROM seat")
      .toArray()
      .map(({ pairing }) => pairing);
  }
}
