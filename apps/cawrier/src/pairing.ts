/**
 * One pairing: a phone with a Pro subscription and the hub it gave its
 * secret to. A SQLite-backed Durable Object named by the pairing id, holding
 * one row; it takes a seat under its subscription ({@link Seats}). It
 * delivers push while its subscription is entitled (entitlement.ts
 * `delivers`), and answers 402 to a push while it is not; it is kept either
 * way until 30 days after its last enroll (entitlement.ts `pairingEnd`), when
 * its alarm wipes it and gives the seat back (as do removing the device in
 * CawCo, through `/v1/unenroll`, and APNs saying the device is gone). Apple's
 * notifications move the subscription's end without the phone enrolling
 * again ({@link Pairing.entitled}): a lapse stops delivery, and a renewal, a
 * billing recovery or a resubscription resumes it. A refund or a revocation
 * wipes the pairing ({@link Pairing.revoked}).
 */
import { DurableObject } from "cloudflare:workers";
import { DAY_MS } from "@cawco/core/time";
import type { ApnsEnvironment } from "./apns";
import { delivers, type Entitlement, pairingEnd } from "./entitlement";
import type { TransactionEnvironment } from "./storekit";

/** Home Assistant's companion relay allows the same per day. */
const PUSHES_PER_DAY = 500;

/**
 * The one row; `enrolled_at` is the last enroll; `entitled_until` is the end
 * of what its subscription is entitled to (null: no subscription stands
 * behind the seat); `day` and `pushes` count today's pushes; `seat` names the
 * subscription's {@link Seats}.
 */
const TABLE = `CREATE TABLE IF NOT EXISTS enrolment (
  secret_hash TEXT NOT NULL,
  device_token TEXT NOT NULL,
  apns_environment TEXT NOT NULL,
  transaction_environment TEXT NOT NULL,
  seat TEXT NOT NULL,
  enrolled_at INTEGER NOT NULL,
  day INTEGER NOT NULL DEFAULT 0,
  pushes INTEGER NOT NULL DEFAULT 0,
  entitled_until INTEGER
)`;
/** A row made before `entitled_until` was a column takes it, null: it delivers until its next enroll says otherwise. */
const ENTITLED_UNTIL =
  "ALTER TABLE enrolment ADD COLUMN entitled_until INTEGER";

interface Row extends Record<string, SqlStorageValue> {
  apns_environment: ApnsEnvironment;
  day: number;
  device_token: string;
  /** The last enroll, ms epoch. */
  enrolled_at: number;
  /** The end of what its subscription is entitled to, ms epoch; null when no subscription stands behind the seat. */
  entitled_until: number | null;
  pushes: number;
  seat: string;
  /** sha256 of the secret, hex. */
  secret_hash: string;
  transaction_environment: TransactionEnvironment;
}

export interface Enrollment {
  readonly apnsEnvironment: ApnsEnvironment;
  readonly deviceToken: string;
  /** What the enrolling transaction says of the subscription; null for a TestFlight install's app transaction. */
  readonly entitlement: Entitlement | null;
  readonly seat: string;
  readonly secretHash: string;
  readonly transactionEnvironment: TransactionEnvironment;
}

/** `held`: under another secret; `full`: the subscription has no seat left; `ended`: the subscription has ended. */
export type Enrolled = "enrolled" | "held" | "full" | "ended";

export type Claim =
  | {
      readonly ok: true;
      readonly apnsEnvironment: ApnsEnvironment;
      readonly deviceToken: string;
    }
  | { readonly ok: false; readonly status: 401 }
  | { readonly ok: false; readonly status: 402 }
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
  /** A table made before `entitled_until` was a column takes it as the object loads. */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const { sql } = ctx.storage;
    sql.exec(TABLE);
    const names = sql
      .exec<{ name: string }>("PRAGMA table_info(enrolment)")
      .toArray()
      .map(({ name }) => name);
    if (!names.includes("entitled_until")) {
      sql.exec(ENTITLED_UNTIL);
    }
  }

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
      // Taken on every enroll, held already or not: an ended subscription refuses its own devices too.
      const taken = await this.seats(next.seat).take(this.me, next.entitlement);
      if (taken.kind !== "taken") {
        return taken.kind;
      }
      if (held && held.seat !== next.seat) {
        await this.seats(held.seat).release(this.me);
      }
      const now = Date.now();
      if (held) {
        this.sql.exec(
          "UPDATE enrolment SET device_token = ?, apns_environment = ?, transaction_environment = ?, seat = ?, enrolled_at = ?, entitled_until = ?",
          next.deviceToken,
          next.apnsEnvironment,
          next.transactionEnvironment,
          next.seat,
          now,
          taken.until
        );
      } else {
        this.sql.exec(
          "INSERT INTO enrolment (secret_hash, device_token, apns_environment, transaction_environment, seat, enrolled_at, entitled_until) VALUES (?, ?, ?, ?, ?, ?, ?)",
          next.secretHash,
          next.deviceToken,
          next.apnsEnvironment,
          next.transactionEnvironment,
          next.seat,
          now,
          taken.until
        );
      }
      await this.ctx.storage.setAlarm(pairingEnd(now));
      return "enrolled";
    });
  }

  /**
   * The device a push goes to, once the secret is right, the subscription is
   * entitled (402 while it is not: the pairing is kept) and today's pushes
   * are under the cap.
   */
  claim(secretHash: string): Claim {
    const held = this.held();
    if (!(held && same(held.secret_hash, secretHash))) {
      return { ok: false, status: 401 };
    }
    if (!delivers(held.entitled_until, Date.now())) {
      return { ok: false, status: 402 };
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

  /**
   * Apple's notification moved the end of the subscription behind `seat` to
   * `until`: the pairing delivers while that end is ahead and is kept, silent,
   * once it has passed. A pairing that has since enrolled under another seat
   * is not moved.
   */
  entitled(seat: string, until: number): void {
    if (this.held()?.seat === seat) {
      this.sql.exec("UPDATE enrolment SET entitled_until = ?", until);
    }
  }

  /** Apple refunded or revoked the subscription behind `seat`: the pairing goes now, unless it has since enrolled under another seat. */
  async revoked(seat: string): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.held()?.seat === seat) {
        await this.wipe();
      }
    });
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
