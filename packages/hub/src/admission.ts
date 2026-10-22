import { accountNameAmong, costForUsage } from "@cawco/core";
import type { LimitRow } from "./at-limit";
import type { DbShape } from "./db";
import { usdPerPercent } from "./forecast";
import { SESSION_WINDOW_MS } from "./placement";

/**
 * The ledger every move of a session onto another account (a held session
 * at a limit, a rebalance, a cold wake) is charged against, one per target
 * account, so each decision sees the moves admitted before it and a reset
 * never takes the whole herd at once. Each session is charged its projected
 * re-read (its context written into the target's cold cache, or read from it
 * when its warm cache carries) plus an allowance for its next real turn, in
 * dollars, against the target's 5-hour window measured in dollars per
 * percent from that account's own history (forecast.ts `usdPerPercent`).
 * What a target has left after a move ({@link roomAfterPct}) is the one
 * figure a decision reads of it here: at-limit.ts `decideStop` weighs it
 * with everything else it knows, and nothing here refuses a move.
 *
 * The target's measured state is its reading plus the spend `turn_usage`
 * recorded there since that reading (a Claude turn that reached the model
 * confirms the reading up to it: server.ts `recordTurnUsage`). A charge
 * stands only while its move's cost is not in that state: it goes once the
 * session's first turn on the target is recorded, once it sleeps on the
 * target with no turn there (nothing more of the move's cost is coming; a
 * wake is admitted again like any move), once it is over, or at the
 * window's reset. One that sleeps still owing its move (taken up at its
 * wake) keeps its charge: it is not on the target yet.
 *
 * Affinity ({@link admittedHere}): a session moved onto its account inside
 * that account's current 5-hour window stays there. Another account freeing
 * is never a reason to move it again; only its own limit is.
 */

/**
 * The next real turn an admitted session is charged on top of its re-read:
 * $0.42, the top of what each session's second turn cost on e8b553ef after
 * the 2026-10-20 06:10Z herd move ($0.06–0.42, `turn_usage`), the first
 * turn after a re-read being the one that does work.
 */
export const NEXT_TURN_ALLOWANCE_USD = 0.42;

/** How far back an account's dollars per percent is measured: a weekly window and a day, as the forecast reads. */
const LOOKBACK_MS = 8 * 24 * 3_600_000;
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
 * What the ledger holds of one target account now, each a percent of its
 * 5-hour window: the spend recorded since its reading (`spentPct`), the
 * moves admitted there and not landed yet (`pendingPct`, `pendingMoves` of
 * them). Null where a percent is unmeasured (`usdPerPct` null) or a spend
 * unpriced.
 */
export interface Ledger {
  pendingMoves: number;
  pendingPct: number | null;
  spentPct: number | null;
  usdPerPct: number | null;
}

/** One move's figures on its target, for a journal line and the wake path: the ledger, and what the move takes and leaves. */
export interface Figures extends Ledger {
  /** What this move takes of the target's 5-hour window, percent; null when unmeasured or unpriced. */
  movePct: number | null;
  projected: Projected;
  /** What the target's 5-hour window has left after it ({@link roomAfterPct}). */
  roomAfter: number;
  /** The target's 5-hour window read now, percent. */
  usedPct: number;
}

interface Charge {
  accountId: string;
  at: number;
  instanceId: string;
  /** The target's 5-hour reset when it was charged: a new window drops it. */
  resetsAt: string | null;
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
export const movePctOf = (
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
export const roomAfterPct = (
  usedPct: number,
  ledger: Pick<Ledger, "pendingPct" | "spentPct">,
  movePct: number | null
): number =>
  100 -
  (usedPct +
    (ledger.spentPct ?? 0) +
    (ledger.pendingPct ?? 0) +
    (movePct ?? 0));

/** The 5-hour window of `accountId`'s reading, open at `now`. */
const sessionWindow = (db: DbShape, accountId: string, now: number) => {
  const reading = db.accounts
    .readings()
    .find((one) => one.accountId === accountId);
  const window = reading?.windows.find((one) => one.kind === "session");
  const open =
    window && !(window.resetsAt && Date.parse(window.resetsAt) <= now);
  return {
    reading,
    percent: open ? window.percent : 0,
    resetsAt: open ? window.resetsAt : null,
  };
};

export const createAdmission = (db: DbShape) => {
  /** Each session's standing charge, by session. */
  const charges = new Map<string, Charge>();
  const perPctRead = new Map<string, { at: number; value: number | null }>();

  /** Dollars per percent of `accountId`'s 5-hour window, from its own history. */
  const perPctOf = (accountId: string, now: number): number | null => {
    const known = perPctRead.get(accountId);
    if (known && now - known.at < PER_PCT_FOR_MS) {
      return known.value;
    }
    const since = now - LOOKBACK_MS;
    const history = db.accounts.history({ accountId, since }).map((row) => ({
      accountId: row.accountId,
      kind: row.kind,
      scopeLabel: row.scopeLabel,
      percent: row.percent,
      resetsAt: row.resetsAt,
      fetchedAt: row.fetchedAt.getTime(),
    }));
    const value = usdPerPercent(
      { kind: "session", scopeLabel: null },
      history,
      db.turnUsage.list({ accountId, since }),
      accountId
    );
    perPctRead.set(accountId, { at: now, value });
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
      const window = sessionWindow(db, charge.accountId, now);
      if (
        !row ||
        ["stopping", "stopped", "discarded", "error"].includes(row.status)
      ) {
        release(id, "as the session is over");
        continue;
      }
      if (window.resetsAt !== charge.resetsAt) {
        release(id, "as its 5-hour window reset");
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
   * count; within the open 5-hour window, or since the last one reset.
   * Null when one of them is unpriced.
   */
  const spentSince = (
    accountId: string,
    window: ReturnType<typeof sessionWindow>,
    now: number
  ): number | null => {
    // The open window began 5 hours before its reset; a window over began
    // a new one at its reset.
    const held = window.reading?.windows.find((one) => one.kind === "session");
    let opened = now - SESSION_WINDOW_MS;
    if (window.resetsAt) {
      opened = Date.parse(window.resetsAt) - SESSION_WINDOW_MS;
    } else if (held?.resetsAt) {
      opened = Date.parse(held.resetsAt);
    }
    const since = Math.max(window.reading?.lastSeenAt ?? 0, opened);
    const turns = db.turnUsage
      .list({ accountId, since })
      .filter((turn) => turn.at.getTime() > since);
    return turns.some((turn) => turn.costUsd === null)
      ? null
      : turns.reduce((sum, turn) => sum + (turn.costUsd ?? 0), 0);
  };

  /**
   * What the ledger holds of `accountId` now for a move of `instanceId`
   * ({@link Ledger}): the charges of every other session standing there, and
   * the spend recorded since its reading, each over what a percent of its
   * 5-hour window costs. A charge unpriced, or a spend, makes its percent
   * null; so does a window not measured in dollars yet.
   */
  const ledger = (
    accountId: string,
    instanceId: string,
    now: number
  ): Ledger => {
    prune(now);
    const usdPerPct = perPctOf(accountId, now);
    const standing = [...charges.values()].filter(
      (one) => one.accountId === accountId && one.instanceId !== instanceId
    );
    const pendingUsd = standing.some((one) => one.usd === null)
      ? null
      : standing.reduce((sum, one) => sum + (one.usd ?? 0), 0);
    const spentUsd = spentSince(
      accountId,
      sessionWindow(db, accountId, now),
      now
    );
    const measured = usdPerPct !== null && usdPerPct > 0;
    return {
      usdPerPct: measured ? usdPerPct : null,
      pendingMoves: standing.length,
      pendingPct:
        measured && pendingUsd !== null ? pendingUsd / usdPerPct : null,
      spentPct: measured && spentUsd !== null ? spentUsd / usdPerPct : null,
    };
  };

  /**
   * A move of `session` onto `targetId` priced as `projected`: the ledger
   * there, what the move takes of its 5-hour window and what that window has
   * left after it ({@link roomAfterPct}). Read by the wake path (server.ts
   * `replaceAtWake`); a limit's and a rebalance's moves read the same figures
   * through their decision (at-limit.ts `decideStop`).
   */
  const check = (
    instanceId: string,
    targetId: string,
    projected: Projected,
    now: number
  ): Figures => {
    const held = ledger(targetId, instanceId, now);
    const usedPct = sessionWindow(db, targetId, now).percent;
    const movePct = movePctOf(projected, held.usdPerPct);
    return {
      ...held,
      projected,
      usedPct,
      movePct,
      roomAfter: roomAfterPct(usedPct, held, movePct),
    };
  };

  return {
    check,
    ledger,
    /** Charges `instanceId`'s move onto `accountId` at `usd` (its re-read and next turn; null when unpriced). */
    charge(instanceId: string, accountId: string, usd: number | null): void {
      const now = Date.now();
      charges.set(instanceId, {
        accountId,
        instanceId,
        at: now,
        resetsAt: sessionWindow(db, accountId, now).resetsAt,
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
     * Whether `row` was moved onto the account it is on inside that
     * account's current 5-hour window (its last `moved` line lands there):
     * it stays, and no other account freeing moves it again.
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
      const { resetsAt } = sessionWindow(db, row.accountId, now);
      const opened = resetsAt
        ? Date.parse(resetsAt) - SESSION_WINDOW_MS
        : now - SESSION_WINDOW_MS;
      return last.at >= opened;
    },
  };
};

export type Admission = ReturnType<typeof createAdmission>;
