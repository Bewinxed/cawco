/**
 * One pairing: a phone with Pro or the free week and the hub it gave its
 * secret to. A SQLite-backed Durable Object named by the pairing id, holding
 * one row; it takes a seat under its purchase ({@link Seats}). Each enroll
 * keeps it 30 more days, or to the free week's end when that is sooner; then
 * its alarm wipes it and gives the seat back (as does removing the device in
 * CawCo, through `/v1/unenroll`). A refunded purchase stops at once: Apple's
 * notification wipes its pairings ({@link Pairing.revoked}). A free week stops
 * when it ends, and an active buyer, re-enrolling on every launch, never lapses.
 */
import { DurableObject } from "cloudflare:workers";
import type { ApnsEnvironment } from "./apns";
import type { TransactionEnvironment } from "./storekit";

const LIFE_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Home Assistant's companion relay allows the same per day. */
const PUSHES_PER_DAY = 500;

/** The one row; `day` and `pushes` count today's pushes; `seat` names the purchase's {@link Seats}. */
const TABLE = `CREATE TABLE IF NOT EXISTS enrolment (
  secret_hash TEXT NOT NULL,
  device_token TEXT NOT NULL,
  apns_environment TEXT NOT NULL,
  transaction_environment TEXT NOT NULL,
  seat TEXT NOT NULL,
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
  seat: string;
  /** sha256 of the secret, hex. */
  secret_hash: string;
  transaction_environment: TransactionEnvironment;
}

export interface Enrollment {
  readonly apnsEnvironment: ApnsEnvironment;
  readonly deviceToken: string;
  /** When the free week ends; null for Pro. */
  readonly endsAt: number | null;
  readonly seat: string;
  readonly secretHash: string;
  readonly transactionEnvironment: TransactionEnvironment;
}

/** `held`: under another secret; `full`: the purchase has no seat left; `revoked`: it was refunded. */
export type Enrolled = "enrolled" | "held" | "full" | "revoked";

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
    return this.sql.exec<Row>("SELECT * FROM enrolment LIMIT 1").toArray()[0];
  }

  /** This pairing as a seat holder: its object id, which names it uniquely. */
  private get me(): string {
    return this.ctx.id.toString();
  }

  private seats(seat: string) {
    return this.env.SEATS.get(this.env.SEATS.idFromName(seat));
  }

  /** Serialized against the alarm and other enrolls: the seat and the row change together. */
  async enroll(next: Enrollment): Promise<Enrolled> {
    return await this.ctx.blockConcurrencyWhile(async () => {
      const held = this.held();
      if (held && !same(held.secret_hash, next.secretHash)) {
        return "held";
      }
      // Taken on every enroll, held already or not: a refunded purchase refuses its own devices too.
      const taken = await this.seats(next.seat).take(this.me);
      if (taken !== "taken") {
        return taken;
      }
      if (held && held.seat !== next.seat) {
        await this.seats(held.seat).release(this.me);
      }
      const now = Date.now();
      if (held) {
        this.sql.exec(
          "UPDATE enrolment SET device_token = ?, apns_environment = ?, transaction_environment = ?, seat = ?",
          next.deviceToken,
          next.apnsEnvironment,
          next.transactionEnvironment,
          next.seat
        );
      } else {
        this.sql.exec(
          "INSERT INTO enrolment (secret_hash, device_token, apns_environment, transaction_environment, seat, enrolled_at) VALUES (?, ?, ?, ?, ?, ?)",
          next.secretHash,
          next.deviceToken,
          next.apnsEnvironment,
          next.transactionEnvironment,
          next.seat,
          now
        );
      }
      await this.ctx.storage.setAlarm(
        Math.min(now + LIFE_MS, next.endsAt ?? Number.POSITIVE_INFINITY)
      );
      return "enrolled";
    });
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
    this.sql.exec("UPDATE enrolment SET day = ?, pushes = ?", today, count + 1);
    return {
      ok: true,
      deviceToken: held.device_token,
      apnsEnvironment: held.apns_environment,
    };
  }

  /** APNs says the token is dead: the pairing goes, unless it was enrolled again with another token meanwhile. */
  async forget(deviceToken: string): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.held()?.device_token === deviceToken) {
        await this.wipe();
      }
    });
  }

  /** The device was removed in CawCo: the pairing goes and its seat with it. False when the secret is not this pairing's. */
  async unenroll(secretHash: string): Promise<boolean> {
    return await this.ctx.blockConcurrencyWhile(async () => {
      const held = this.held();
      if (!(held && same(held.secret_hash, secretHash))) {
        return false;
      }
      await this.wipe();
      return true;
    });
  }

  /** Its purchase was refunded or revoked (Apple's notification): the pairing goes now. */
  async revoked(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(() => this.wipe());
  }

  override async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(() => this.wipe());
  }

  /** The seat goes back first: when that call fails, the pairing and its alarm stay and the alarm retries. */
  private async wipe(): Promise<void> {
    const held = this.held();
    if (held) {
      await this.seats(held.seat).release(this.me);
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}
