/**
 * The devices one purchase is on: a SQLite-backed Durable Object named by the
 * purchase's environment and original transaction id, holding one row per
 * live pairing. A pairing takes a seat when it enrolls under the purchase and
 * gives it back when it is wiped (its alarm, or APNs saying the device is
 * gone). Its own storage, not KV: the free plan allows KV 1,000 writes a day.
 */
import { DurableObject } from "cloudflare:workers";

/** Live pairings one purchase may hold. */
export const SEATS_PER_PURCHASE = 10;

const TABLE = "CREATE TABLE IF NOT EXISTS seat (pairing TEXT PRIMARY KEY)";

export class Seats extends DurableObject<Env> {
  /** The table, made again after the last seat goes (deleteAll drops it). */
  private get sql(): SqlStorage {
    this.ctx.storage.sql.exec(TABLE);
    return this.ctx.storage.sql;
  }

  private count(): number {
    const { n } = this.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM seat")
      .one();
    return n;
  }

  /** True when the pairing holds a seat now, already or newly; false when all are taken. */
  take(pairing: string): boolean {
    const { sql } = this;
    const [seated] = sql
      .exec("SELECT 1 FROM seat WHERE pairing = ?", pairing)
      .toArray();
    if (seated) {
      return true;
    }
    if (this.count() >= SEATS_PER_PURCHASE) {
      return false;
    }
    sql.exec("INSERT INTO seat (pairing) VALUES (?)", pairing);
    return true;
  }

  /** The pairing's seat goes back; the object empties itself with its last seat. */
  async release(pairing: string): Promise<void> {
    this.sql.exec("DELETE FROM seat WHERE pairing = ?", pairing);
    if (this.count() === 0) {
      await this.ctx.storage.deleteAll();
    }
  }
}
