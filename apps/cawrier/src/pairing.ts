/**
 * One pairing: a phone that bought Pro and the hub it gave its secret to.
 * SQLite-backed, named by the pairing id; nothing else stores anything.
 * Each enroll keeps it 30 more days, then its alarm wipes it, so a refunded
 * purchase stops within 30 days and an active buyer, re-enrolling on every
 * launch, never lapses.
 */
import { DurableObject } from "cloudflare:workers";
import type { ApnsEnvironment } from "./apns";
import type { TransactionEnvironment } from "./storekit";

const LIFE_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Home Assistant's companion relay allows the same per day. */
const PUSHES_PER_DAY = 500;

interface Held {
  readonly apnsEnvironment: ApnsEnvironment;
  readonly deviceToken: string;
  readonly enrolledAt: number;
  /** sha256 of the secret, hex. */
  readonly secretHash: string;
  readonly transactionEnvironment: TransactionEnvironment;
}

interface Day {
  readonly count: number;
  /** UTC day number. */
  readonly day: number;
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
  /** False when the pairing is held under another secret. */
  async enroll(next: Omit<Held, "enrolledAt">): Promise<boolean> {
    const { kv } = this.ctx.storage;
    const held = kv.get<Held>("pairing");
    if (held && !same(held.secretHash, next.secretHash)) {
      return false;
    }
    if (
      !held ||
      held.deviceToken !== next.deviceToken ||
      held.apnsEnvironment !== next.apnsEnvironment ||
      held.transactionEnvironment !== next.transactionEnvironment
    ) {
      kv.put("pairing", {
        ...next,
        enrolledAt: held?.enrolledAt ?? Date.now(),
      });
    }
    await this.ctx.storage.setAlarm(Date.now() + LIFE_MS);
    return true;
  }

  /** The device a push goes to, once the secret is right and today's pushes are under the cap. */
  claim(secretHash: string): Claim {
    const { kv } = this.ctx.storage;
    const held = kv.get<Held>("pairing");
    if (!(held && same(held.secretHash, secretHash))) {
      return { ok: false, status: 401 };
    }
    const today = Math.floor(Date.now() / DAY_MS);
    const counted = kv.get<Day>("day");
    const count = counted?.day === today ? counted.count : 0;
    if (count >= PUSHES_PER_DAY) {
      return { ok: false, status: 429, resetsAt: (today + 1) * DAY_MS };
    }
    kv.put("day", { day: today, count: count + 1 });
    return {
      ok: true,
      deviceToken: held.deviceToken,
      apnsEnvironment: held.apnsEnvironment,
    };
  }

  /** APNs says the token is dead: the pairing goes, unless it was enrolled again with another token meanwhile. */
  async forget(deviceToken: string): Promise<void> {
    if (this.ctx.storage.kv.get<Held>("pairing")?.deviceToken === deviceToken) {
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
