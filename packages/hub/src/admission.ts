import { accountNameAmong, modelScope } from "@cawco/core/accounts";
import { OVER_STATUSES } from "@cawco/core/protocol";
import { DAY_MS } from "@cawco/core/time";
import { costForUsage } from "@cawco/core/usage/pricing";
import type { LimitWindow } from "@cawco/core/usage/types";
import {
  bearing,
  headroom,
  openedAt,
  windowKey,
  windowOpen,
  windowUsed,
} from "@cawco/core/usage/windows";
import type { LimitRow } from "./at-limit";
import type { DbShape } from "./db";
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
 * account's own history of it (forecast.ts `usdPerPercent`). What the
 * target has left after a move in the window with the least left then
 * ({@link figuresOf}) is the one figure a decision reads of it here:
 * at-limit.ts `decideStop` weighs it with everything else it knows, and
 * nothing here refuses a move.
 *
 * The target's measured state is its reading plus the spend `turn_usage`
 * recorded there since that reading (a Claude turn that reached the model
 * confirms the reading up to it: server.ts `recordTurnUsage`). A charge
 * stands only while its move's cost is not in that state: it goes once the
 * session's first turn on the target is recorded, once it sleeps on the
 * target with no turn there (nothing more of the move's cost is coming; a
 * wake is admitted again like any move), once it is over, or at the reset
 * of any window it was charged against. One that sleeps still owing its
 * move (taken up at its wake) keeps its charge: it is not on the target
 * yet.
 *
 * Affinity ({@link admittedHere}): a session moved onto its account inside
 * the current window of the window that binds there stays (on a verified
 * Ultra account, its week). Another account freeing is never a reason to
 * move it again; only its own limit is.
 */

/**
 * The next real turn an admitted session is charged on top of its re-read:
 * $0.42, the top of what each session's second turn cost on e8b553ef after
 * the 2026-10-20 06:10Z herd move ($0.06–0.42, `turn_usage`), the first
 * turn after a re-read being the one that does work.
 */
export const NEXT_TURN_ALLOWANCE_USD = 0.42;

/** How far back an account's dollars per percent is measured: a weekly window and a day, as the forecast reads. */
const LOOKBACK_MS = 8 * DAY_MS;
/** How long one account's measured dollars per percent is kept between reads. */
const PER_PCT_FOR_MS = 60_000;

/** What moving a session onto an account costs, in dollars: its re-read and its next turn. */
export interface Projected {
  allowanceUsd: number;
  /** Null when its model has no listed price. */
  reReadUsd: number | null;
  tokens: number;
}

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

/**
 * One move's figures on its target: the window with the least room once it
 * has landed (`window`; null when the target has no window read), what the
 * move takes of that window and what it leaves. A window not measured in
 * dollars counts its use as read alone.
 */
export interface Figure {
  /** What it has left now, before the move, percent: the least of every window's room. */
  left: number;
  /** What this move takes of {@link window}, percent; null when unmeasured or unpriced. */
  movePct: number | null;
  /** What {@link window} has left after it ({@link roomAfterPct}). */
  roomAfter: number;
  /** No window that bears is measured in dollars, or the one measured has an unpriced spend or charge: the target takes one move at a time. */
  unmeasured: boolean;
  /** Dollars per percent of {@link window}; null when unmeasured. */
  usdPerPct: number | null;
  window: WindowLedger["window"] | null;
}

/** One move's figures on its target, for a journal line and the wake path: the ledger, and what the move takes and leaves. */
export interface Figures extends Figure {
  pendingMoves: number;
  projected: Projected;
}

interface Charge {
  accountId: string;
  at: number;
  instanceId: string;
  /** The reset of every window it was charged against, by window (null for a fresh one, which nothing opened yet): a new window of any of them drops it. */
  resets: ReadonlyMap<string, string | null>;
  usd: number | null;
}

/** "$8.03"; an unpriced cost is "an unpriced amount". */
export const usdWords = (usd: number | null): string =>
  usd === null ? "an unpriced amount" : `$${usd.toFixed(2)}`;

/**
 * The context a move re-reads: the last request's prompt (uncached input,
 * cache reads and writes of one request), capped at the model's window, as
 * no request sends more. One never reported, or reported past the window (a
 * turn's sum of requests), is priced at the window. With no window known it
 * is the context as reported, none when never reported.
 */
export const pricedTokens = (
  context: number | null,
  window: number | null
): number => {
  if (window === null) {
    return context ?? 0;
  }
  return Math.min(context ?? window, window);
};

/**
 * A session's re-read of `tokens` on another account: read from a cache
 * that carries (one organization, its cache still warm: at-limit.ts
 * `cacheCarries`), else written into a cold cache at its lifetime's write
 * price; plus {@link NEXT_TURN_ALLOWANCE_USD}. Pure: the listed rates of `now`.
 */
export const projectedMove = (
  session: { cacheTtl: string | null; model: string | null },
  tokens: number,
  carries: boolean,
  now: number
): Projected => {
  const read = { input: 0, output: 0, reasoning: 0 };
  const usage = carries
    ? { ...read, cacheCreation: 0, cacheRead: tokens }
    : {
        ...read,
        cacheCreation: tokens,
        cacheCreation1h: session.cacheTtl === "1h" ? tokens : 0,
        cacheRead: 0,
      };
  let reReadUsd: number | null = 0;
  if (tokens > 0) {
    reReadUsd = session.model ? costForUsage(session.model, usage, now) : null;
  }
  return { tokens, reReadUsd, allowanceUsd: NEXT_TURN_ALLOWANCE_USD };
};

/** What a move takes of a window measured at `usdPerPct`, percent; null when unmeasured or unpriced. */
const movePctOf = (
  projected: Projected,
  usdPerPct: number | null
): number | null =>
  projected.reReadUsd === null || usdPerPct === null || usdPerPct <= 0
    ? null
    : (projected.reReadUsd + projected.allowanceUsd) / usdPerPct;

/**
 * What a window read at `usedPct` has left once the spend recorded since its
 * reading, the moves admitted there and this one have landed, percent: what
 * goes unmeasured counts nothing.
 */
const roomAfterPct = (
  usedPct: number,
  ledger: Pick<WindowLedger, "pendingPct" | "spentPct">,
  movePct: number | null
): number =>
  100 -
  (usedPct +
    (ledger.spentPct ?? 0) +
    (ledger.pendingPct ?? 0) +
    (movePct ?? 0));

/**
 * A move's figures from a target's ledger and its projected cost
 * ({@link Figure}): every window's room after the move, the least of them
 * the one read. A move is measured when some window is measured in dollars
 * with its spend and charges priced.
 */
export const figuresOf = (
  ledger: Pick<Ledger, "windows">,
  projected: Projected
): Figure => {
  let least: Figure | null = null;
  let left = 100;
  for (const one of ledger.windows) {
    const movePct = movePctOf(projected, one.usdPerPct);
    const roomAfter = roomAfterPct(one.usedPct, one, movePct);
    left = Math.min(left, roomAfterPct(one.usedPct, one, null));
    if (!least || roomAfter < least.roomAfter) {
      least = {
        window: one.window,
        movePct,
        roomAfter,
        usdPerPct: one.usdPerPct,
        left: 0,
        unmeasured: true,
      };
    }
  }
  const measured = ledger.windows.some(
    (one) =>
      one.usdPerPct !== null && one.spentPct !== null && one.pendingPct !== null
  );
  return least
    ? { ...least, left, unmeasured: !measured }
    : {
        window: null,
        movePct: null,
        roomAfter: 100,
        usdPerPct: null,
        left,
        unmeasured: true,
      };
};

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
      .map((one) => [windowKey(one), one.resetsAt])
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
      const reset = [...charge.resets].some(
        ([key, at]) => at !== null && open.get(key)?.resetsAt !== at
      );
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

  /**
   * A move of `session` onto `targetId` priced as `projected`: the ledger
   * there, and the figures of the window with the least room after it
   * ({@link figuresOf}). Read by the wake path (server.ts `replaceAtWake`);
   * a limit's and a rebalance's moves read the same figures through their
   * decision (at-limit.ts `decideStop`).
   */
  const check = (
    session: Pick<LimitRow, "id" | "model">,
    targetId: string,
    projected: Projected,
    now: number
  ): Figures => {
    const held = ledger(targetId, session.id, session.model, now);
    return {
      ...figuresOf(held, projected),
      pendingMoves: held.pendingMoves,
      projected,
    };
  };

  return {
    check,
    ledger,
    /**
     * Charges `instanceId`'s move onto `accountId` at `usd` (its re-read and
     * next turn; null when unpriced), against every window there that bears
     * on its model.
     */
    charge(
      session: Pick<LimitRow, "id" | "model">,
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
    /**
     * Whether `row` was moved onto the account it is on inside the current
     * window of the window that binds there now (core `headroom`; its last
     * `moved` line lands there): it stays, and no other account freeing
     * moves it again. On a verified Ultra account that is its week.
     */
    admittedHere(row: LimitRow, now = Date.now()): boolean {
      if (!row.accountId) {
        return false;
      }
      if (charges.get(row.id)?.accountId === row.accountId) {
        return true;
      }
      const last = db.atLimit
        .events([row.id])
        .findLast((one) => one.move.kind === "moved");
      if (!(last?.move.kind === "moved" && last.move.to.id === row.accountId)) {
        return false;
      }
      const { windows } = bearingWindows(
        db,
        row.accountId,
        modelScope(row.model),
        now
      );
      const binds = headroom(windows, now)?.window;
      const opened = binds ? openedAt(binds) : null;
      return opened !== null && last.at >= opened;
    },
  };
};

export type Admission = ReturnType<typeof createAdmission>;
