/**
 * One pairing: a phone that bought Pro and the hub it gave its secret to.
 * A SQLite-backed Durable Object named by the pairing id, holding one row;
 * nothing else stores anything. Each enroll keeps it 30 more days, then its
 * alarm wipes it, so a refunded purchase stops within 30 days and an active
 * buyer, re-enrolling on every launch, never lapses.
 */
import { DurableObject } from "cloudflare:workers";
import type { ApnsEnvironment } from "./apns";
import type { TransactionEnvironment } from "./storekit";

const LIFE_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Home Assistant's companion relay allows the same per day. */
const PUSHES_PER_DAY = 500;

/** The one row; `day` and `pushes` count today's pushes. */
const TABLE = `CREATE TABLE IF NOT EXISTS pairing (
  secret_hash TEXT NOT NULL,
  device_token TEXT NOT NULL,
  apns_environment TEXT NOT NULL,
  transaction_environment TEXT NOT NULL,
  enrolled_at INTEGER NOT NULL,
  day INTEGER NOT NULL DEFAULT 0,
  pushes INTEGER NOT NULL DEFAULT 0
)`;

interface Row extends Record<string, SqlStorageValue> {
  apns_environment: ApnsEnvironment;
  day: number;
  device_token: string;
  enrolled_at: number;
  pushes: number;
  /** sha256 of the secret, hex. */
  secret_hash: string;
  transaction_environment: TransactionEnvironment;
}

export interface Enrollment {
  readonly apnsEnvironment: ApnsEnvironment;
  readonly deviceToken: string;
  readonly secretHash: string;
  readonly transactionEnvironment: TransactionEnvironment;
}

export type Claim =
  | {
      readonly ok: true;
      readonly apnsEnvironment: ApnsEnvironment;
      readonly deviceToken: string;
    }
  | { readonly ok: false; readonly status: 401 }
  | { readonly ok: false; readonly status: 429; readonly resetsAt: number };

const same = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return (
    left.byteLength === right.byteLength &&
    crypto.subtle.timingSafeEqual(left, right)
  );
};

export class Pairing extends DurableObject<Env> {
  /** The table, made again after a wipe (deleteAll drops it). */
  private get sql(): SqlStorage {
    this.ctx.storage.sql.exec(TABLE);
    return this.ctx.storage.sql;
  }

  private held(): Row | undefined {
    return this.sql.exec<Row>("SELECT * FROM pairing LIMIT 1").toArray()[0];
  }

  /** False when the pairing is held under another secret. */
  async enroll(next: Enrollment): Promise<boolean> {
    const held = this.held();
    if (held && !same(held.secret_hash, next.secretHash)) {
      return false;
    }
    if (!held) {
      this.sql.exec(
        "INSERT INTO pairing (secret_hash, device_token, apns_environment, transaction_environment, enrolled_at) VALUES (?, ?, ?, ?, ?)",
        next.secretHash,
        next.deviceToken,
        next.apnsEnvironment,
        next.transactionEnvironment,
        Date.now()
      );
    } else if (
      held.device_token !== next.deviceToken ||
      held.apns_environment !== next.apnsEnvironment ||
      held.transaction_environment !== next.transactionEnvironment
    ) {
      this.sql.exec(
        "UPDATE pairing SET device_token = ?, apns_environment = ?, transaction_environment = ?",
        next.deviceToken,
        next.apnsEnvironment,
        next.transactionEnvironment
      );
    }
    await this.ctx.storage.setAlarm(Date.now() + LIFE_MS);
    return true;
  }

  /** The device a push goes to, once the secret is right and today's pushes are under the cap. */
  claim(secretHash: string): Claim {
    const held = this.held();
    if (!(held && same(held.secret_hash, secretHash))) {
      return { ok: false, status: 401 };
    }
    const today = Math.floor(Date.now() / DAY_MS);
    const count = held.day === today ? held.pushes : 0;
    if (count >= PUSHES_PER_DAY) {
      return { ok: false, status: 429, resetsAt: (today + 1) * DAY_MS };
    }
    this.sql.exec("UPDATE pairing SET day = ?, pushes = ?", today, count + 1);
    return {
      ok: true,
      deviceToken: held.device_token,
      apnsEnvironment: held.apns_environment,
    };
  }

  /** APNs says the token is dead: the pairing goes, unless it was enrolled again with another token meanwhile. */
  async forget(deviceToken: string): Promise<void> {
    if (this.held()?.device_token === deviceToken) {
      await this.wipe();
    }
  }

  override async alarm(): Promise<void> {
    await this.wipe();
  }

  private async wipe(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}
