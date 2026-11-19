import { accountNameAmong, modelScope } from "@cawco/core/accounts";
import { OVER_STATUSES } from "@cawco/core/protocol";
import { DAY_MS } from "@cawco/core/time";
import type { LimitWindow } from "@cawco/core/usage/types";
import {
  bearing,
  openedAt,
  resetMinute,
  windowKey,
  windowOpen,
  windowUsed,
} from "@cawco/core/usage/windows";
import type { DbShape } from "./db";
import type { PublicInstanceRow } from "./db/instances";
import { historyPoints, usdPerPercent } from "./forecast";

/**
 * The ledger every move of a session onto another account (a held session
 * at a limit, a rebalance, a cold wake) is charged against, one per target
 * account, so each decision sees the moves admitted before it and a reset
 * never takes the whole herd at once. Each session is charged its projected
 * re-read (its context written into the target's cold cache, or read from it
 * when its warm cache carries) plus an allowance for its next real turn, in
 * dollars, against every window of the target that bears on the session
 * (core `bearing`), each measured in dollars per percent from that
 * account's own history of it (forecast.ts `usdPerPercent`). The ledger of
 * each window is what the one decision reads of an account here (decide.ts,
 * its floor test): nothing here refuses a move.
 *
 * The target's measured state is its reading plus the spend `turn_usage`
 * recorded there since that reading (a Claude turn that reached the model
 * confirms the reading up to it: server.ts `recordTurnUsage`). A charge
 * stands only while its move's cost is not in that state: it goes once the
 * session's first turn on the target is recorded, once it sleeps on the
 * target with no turn there (nothing more of the move's cost is coming; a
 * wake is admitted again like any move), once it is over, or at the reset
 * of any window it was charged against: a real reset, its reset a new
 * minute (core `resetMinute`), never the same reset reported a second
 * apart. One that sleeps still owing its move (taken up at its wake) keeps
 * its charge: it is not on the target yet.
 */

/** How far back an account's dollars per percent is measured: a weekly window and a day, as the forecast reads. */
const LOOKBACK_MS = 8 * DAY_MS;
/** How long one account's measured dollars per percent is kept between reads. */
const PER_PCT_FOR_MS = 60_000;

/**
 * What the ledger holds of one window of a target account now, each a
 * percent of that window: its use as read (`usedPct`), the spend recorded
 * since the reading (`spentPct`), the moves admitted there and not landed
 * yet (`pendingPct`). Null where a percent is unmeasured (`usdPerPct` null)
 * or a spend unpriced.
 */
export interface WindowLedger {
  pendingPct: number | null;
  spentPct: number | null;
  usdPerPct: number | null;
  usedPct: number;
  window: Pick<LimitWindow, "group" | "kind" | "scopeLabel">;
}

/**
 * What the ledger holds of one target account now: the moves admitted
 * there and not landed yet (`pendingMoves`), and each window of it that
 * bears on the session moving ({@link WindowLedger}).
 */
export interface Ledger {
  pendingMoves: number;
  windows: WindowLedger[];
}

interface Charge {
  accountId: string;
  at: number;
  instanceId: string;
  /** The reset minute of every window it was charged against, by window (null for a fresh one, which nothing opened yet): a new window of any of them drops it. */
  resets: ReadonlyMap<string, number | null>;
  usd: number | null;
}

/** "$8.03"; an unpriced cost is "an unpriced amount". */
export const usdWords = (usd: number | null): string =>
  usd === null ? "an unpriced amount" : `$${usd.toFixed(2)}`;

/**
 * The windows of `accountId`'s reading that bear on a session of model
 * scope `scope` at `now` (core `bearing`, a lapsed one its window set names
 * read fresh), and the reset each was reported with while it is still open:
 * a fresh window's is null, as nothing has opened it yet.
 */
const bearingWindows = (
  db: DbShape,
  accountId: string,
  scope: string | null,
  now: number
) => {
  const reading = db.accounts
    .readings()
    .find((one) => one.accountId === accountId);
  const held = reading?.windows ?? [];
  const windows = bearing(held, scope, now, reading?.windowKinds ?? null);
  const reported = new Map(
    held
      .filter((one) => windowOpen(one, now))
      .map((one) => [windowKey(one), resetMinute(one)])
  );
  return { reading, reported, windows };
};

export const createAdmission = (db: DbShape) => {
  /** Each session's standing charge, by session. */
  const charges = new Map<string, Charge>();
  const perPctRead = new Map<string, { at: number; value: number | null }>();

  /**
   * Dollars per percent of one of `accountId`'s windows, from its own
   * history of it: a week measures as a session window does, its readings
   * grouped by reset.
   */
  const perPctOf = (
    accountId: string,
    window: Pick<LimitWindow, "kind" | "scopeLabel">,
    now: number
  ): number | null => {
    const key = `${accountId}\u0000${windowKey(window)}`;
    const known = perPctRead.get(key);
    if (known && now - known.at < PER_PCT_FOR_MS) {
      return known.value;
    }
    const since = now - LOOKBACK_MS;
    const history = historyPoints(db, accountId, since);
    const value = usdPerPercent(
      { kind: window.kind, scopeLabel: window.scopeLabel },
      history,
      db.turnUsage.list({ accountId, since }),
      accountId
    );
    perPctRead.set(key, { at: now, value });
    return value;
  };

  /** The target's name, as a journal line says it. */
  const nameOf = (accountId: string): string => {
    const account = db.accounts.get(accountId);
    return account ? accountNameAmong(account, db.accounts.list()) : accountId;
  };

  /** Drops `id`'s charge, its line saying why. */
  const release = (id: string, why: string): void => {
    const charge = charges.get(id);
    if (!charge) {
      return;
    }
    charges.delete(id);
    const [row] = db.getInstancesByIds([id]);
    console.info(
      `[admission] ${row?.title ? `${row.title} (${id.slice(0, 8)})` : id.slice(0, 8)}: its charge on ${nameOf(charge.accountId)} goes, ${why}.`
    );
  };

  /** Drops the charges whose cost the target's measured state holds now, or that stand for nothing. */
  const prune = (now: number): void => {
    for (const [id, charge] of charges) {
      const [row] = db.getInstancesByIds([id]);
      if (!row || OVER_STATUSES.has(row.status)) {
        release(id, "as the session is over");
        continue;
      }
      const { windows } = bearingWindows(
        db,
        charge.accountId,
        modelScope(row.model),
        now
      );
      const open = new Map(windows.map((one) => [windowKey(one), one]));
      // A window period is its reset minute (core `resetMinute`): a reset
      // reported a second apart is the same window, not a new one.
      const reset = [...charge.resets].some(([key, at]) => {
        const window = open.get(key);
        return at !== null && (!window || resetMinute(window) !== at);
      });
      if (reset) {
        release(id, "as a window it was charged against reset");
        continue;
      }
      const first = db.turnUsage
        .list({ accountId: charge.accountId, since: charge.at })
        .find((turn) => turn.instanceId === id);
      if (first) {
        release(
          id,
          `as its turn there is recorded (${usdWords(first.costUsd)}), so its cost is in the account's measured spend`
        );
      }
    }
  };

  /**
   * The spend `turn_usage` recorded on `accountId` since its reading, in
   * dollars: the turns its reading has not taken in. A Claude turn that
   * reached the model confirms the reading up to it, so only the others
   * count; within `window`, from when it opened (core `openedAt`; since the
   * reading, for a window of no known length). Null when one of them is
   * unpriced.
   */
  const spentSince = (
    accountId: string,
    lastSeenAt: number,
    window: Pick<LimitWindow, "group" | "resetsAt">
  ): number | null => {
    const since = Math.max(lastSeenAt, openedAt(window) ?? lastSeenAt);
    const turns = db.turnUsage
      .list({ accountId, since })
      .filter((turn) => turn.at.getTime() > since);
    return turns.some((turn) => turn.costUsd === null)
      ? null
      : turns.reduce((sum, turn) => sum + (turn.costUsd ?? 0), 0);
  };

  /**
   * What the ledger holds of `accountId` now for a move of `instanceId`, a
   * session of model `model` ({@link Ledger}): the charges of every other
   * session standing there, and the spend recorded since its reading, each
   * over what a percent of each bearing window costs. A charge unpriced, or
   * a spend, makes its percent null; so does a window not measured in
   * dollars yet.
   */
  const ledger = (
    accountId: string,
    instanceId: string,
    model: string | null,
    now: number
  ): Ledger => {
    prune(now);
    const standing = [...charges.values()].filter(
      (one) => one.accountId === accountId && one.instanceId !== instanceId
    );
    const pendingUsd = standing.some((one) => one.usd === null)
      ? null
      : standing.reduce((sum, one) => sum + (one.usd ?? 0), 0);
    const { reading, windows } = bearingWindows(
      db,
      accountId,
      modelScope(model),
      now
    );
    return {
      pendingMoves: standing.length,
      windows: windows.map((window) => {
        const perPct = perPctOf(accountId, window, now);
        const usdPerPct = perPct !== null && perPct > 0 ? perPct : null;
        const spentUsd = spentSince(
          accountId,
          reading?.lastSeenAt ?? 0,
          window
        );
        return {
          window: {
            kind: window.kind,
            group: window.group,
            scopeLabel: window.scopeLabel,
          },
          usedPct: windowUsed(window, now),
          usdPerPct,
          pendingPct:
            usdPerPct !== null && pendingUsd !== null
              ? pendingUsd / usdPerPct
              : null,
          spentPct:
            usdPerPct !== null && spentUsd !== null
              ? spentUsd / usdPerPct
              : null,
        };
      }),
    };
  };

  return {
    ledger,
    /**
     * Charges `instanceId`'s move onto `accountId` at `usd` (its re-read and
     * next turn; null when unpriced), against every window there that bears
     * on its model.
     */
    charge(
      session: Pick<PublicInstanceRow, "id" | "model">,
      accountId: string,
      usd: number | null
    ): void {
      const now = Date.now();
      const { windows, reported } = bearingWindows(
        db,
        accountId,
        modelScope(session.model),
        now
      );
      charges.set(session.id, {
        accountId,
        instanceId: session.id,
        at: now,
        resets: new Map(
          windows.map((one) => [
            windowKey(one),
            reported.get(windowKey(one)) ?? null,
          ])
        ),
        usd,
      });
    },
    /** A move that did not go: its charge goes with it. */
    refund(instanceId: string): void {
      charges.delete(instanceId);
    },
    /** A turn was recorded (server.ts `recordTurnUsage`): a charge whose cost it holds goes now, its line said as it happens. */
    recorded(): void {
      prune(Date.now());
    },
    /**
     * `instanceId` went to sleep. On the account it was charged onto, with
     * no turn there, nothing more of its move's cost is coming: the charge
     * goes, and a wake is admitted again like any move. One not on it yet
     * owes its move still (taken up at its wake), so its charge stands.
     */
    asleep(instanceId: string): void {
      const now = Date.now();
      prune(now);
      const charge = charges.get(instanceId);
      const [row] = db.getInstancesByIds([instanceId]);
      if (charge && row?.accountId === charge.accountId) {
        release(instanceId, "as it went to sleep there with no turn");
      }
    },
  };
};

export type Admission = ReturnType<typeof createAdmission>;
