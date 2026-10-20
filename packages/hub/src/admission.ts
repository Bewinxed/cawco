import { type Account, accountNameAmong, costForUsage } from "@cawco/core";
import type { LimitRow } from "./at-limit";
import type { DbShape } from "./db";
import { usdPerPercent } from "./forecast";
import { SESSION_WINDOW_MS } from "./placement";

/**
 * Admission by room: every move of a session onto another account (a held
 * session at a limit, a rebalance, a cold wake) is charged against one
 * ledger per target account, so a reset never takes the whole herd at once.
 * Each session is charged its projected re-read (its context written into
 * the target's cold cache, or read from it when the cache carries) plus an
 * allowance for its next real turn, in dollars, against the target's 5-hour
 * window measured in dollars per percent from that account's own history
 * (forecast.ts `usdPerPercent`). A move goes only while the window's reading
 * plus everything already admitted plus this one stays under
 * {@link ADMIT_CEILING_PCT}; the rest stay where they are for the next
 * account with room, or their own account's reset.
 *
 * A charge stands until the target's reading has taken it in: a reading
 * newer than the session's first turn there, or the window's reset; or once
 * the session is over.
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

/**
 * The most of a target's 5-hour window its reading and the admitted
 * sessions' re-reads and allowances may take: half, leaving the other half
 * for their work. On 2026-10-20 the fleet's work spent $136.87 in 43 turns
 * on c6b14b4e in 19 minutes (05:20–05:39Z), about 53% of a window measured
 * at $2.56 a percent (e8b553ef: $58.79 took it to 23%, 06:10–06:14Z); at
 * 50% the admitted sessions keep that much room to work before the window
 * stops them mid-turn again. The constant is this session's call from those
 * rows.
 */
export const ADMIT_CEILING_PCT = 50;

/** How far back an account's dollars per percent is measured: a weekly window and a day, as the forecast reads. */
const LOOKBACK_MS = 8 * 24 * 3_600_000;
/** How long one account's measured dollars per percent is kept between reads. */
const PER_PCT_FOR_MS = 60_000;

/** What moving `row` onto an account costs, in dollars: its re-read and its next turn. */
export interface Projected {
  allowanceUsd: number;
  /** Null when its model has no listed price. */
  reReadUsd: number | null;
  tokens: number;
}

/** One admission's answer: whether it fits, and the numbers a journal line says. */
export interface Verdict {
  ceilingPct: number;
  ok: boolean;
  /** The target's 5-hour window already admitted, percent; null when unmeasured. */
  pendingPct: number | null;
  /** Dollars per percent of the target's 5-hour window; null when unmeasured. */
  perPct: number | null;
  projected: Projected;
  /** What this session takes of the target's window, percent; null when unmeasured or unpriced. */
  thisPct: number | null;
  /** The target's 5-hour window read now, percent. */
  usedPct: number;
  /** The verdict in words, for the journal: both sides' costs. */
  words: string;
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

/** "1,003k tokens". */
const kWords = (tokens: number): string =>
  `${Math.round(tokens / 1000).toLocaleString("en")}k tokens`;

/**
 * `row`'s projected re-read on another account: its context, the last size
 * its harness reported (after a compaction, the summary's), written into a
 * cold cache at its lifetime's write price, or read from a cache that
 * carries; plus {@link NEXT_TURN_ALLOWANCE_USD}. The context comes from the
 * row, not `turn_usage`: a turn's row sums every request of the turn, so a
 * turn of 30 tool calls reads 30 contexts there.
 */
export const projectedMove = (
  row: Pick<LimitRow, "cacheTtl" | "contextTokens" | "model">,
  carries: boolean,
  now: number
): Projected => {
  const tokens = row.contextTokens ?? 0;
  const read = { input: 0, output: 0, reasoning: 0 };
  const usage = carries
    ? { ...read, cacheCreation: 0, cacheRead: tokens }
    : {
        ...read,
        cacheCreation: tokens,
        cacheCreation1h: row.cacheTtl === "1h" ? tokens : 0,
        cacheRead: 0,
      };
  let reReadUsd: number | null = 0;
  if (tokens > 0) {
    reReadUsd = row.model ? costForUsage(row.model, usage, now) : null;
  }
  return { tokens, reReadUsd, allowanceUsd: NEXT_TURN_ALLOWANCE_USD };
};

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

/** Why a session is admitted only alone, in a journal line's words. */
const aloneWords = (
  named: string,
  standing: number,
  unmeasured: boolean,
  unpriced: boolean
): string => {
  const why = [
    ...(unmeasured ? [`${named}'s window isn't measured in dollars yet`] : []),
    ...(unpriced ? ["its model has no listed price"] : []),
  ].join(" and ");
  const now =
    standing === 0
      ? "nothing else is admitted there now"
      : `${standing} admitted session${standing === 1 ? " is" : "s are"} still landing there`;
  return `${why || "its cost isn't known"}, so it is admitted only alone, and ${now}`;
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

  /** Drops the charges the target's readings have taken in, or that stand for nothing now. */
  const prune = (now: number): void => {
    for (const [id, charge] of charges) {
      const [row] = db.getInstancesByIds([id]);
      const window = sessionWindow(db, charge.accountId, now);
      if (
        !row ||
        ["stopping", "stopped", "discarded", "error"].includes(row.status) ||
        window.resetsAt !== charge.resetsAt
      ) {
        charges.delete(id);
        continue;
      }
      const first = db.turnUsage
        .list({ accountId: charge.accountId, since: charge.at })
        .find((turn) => turn.instanceId === id);
      if (first && (window.reading?.lastSeenAt ?? 0) > first.at.getTime()) {
        charges.delete(id);
      }
    }
  };

  /**
   * Whether `row` fits onto `target` now: its projected cost, with every
   * charge standing there, keeps `target`'s 5-hour window under the
   * ceiling. An account whose window is not measured yet, or a session
   * whose model is unpriced, is admitted only alone: with no other charge
   * standing there.
   */
  const check = (
    row: LimitRow,
    target: Account,
    carries: boolean,
    now: number
  ): Verdict => {
    prune(now);
    const projected = projectedMove(row, carries, now);
    const window = sessionWindow(db, target.id, now);
    const perPct = perPctOf(target.id, now);
    const standing = [...charges.values()].filter(
      (one) => one.accountId === target.id && one.instanceId !== row.id
    );
    const named = accountNameAmong(target, db.accounts.list());
    const cost =
      projected.reReadUsd === null
        ? null
        : projected.reReadUsd + projected.allowanceUsd;
    const pendingUsd = standing.some((one) => one.usd === null)
      ? null
      : standing.reduce((sum, one) => sum + (one.usd ?? 0), 0);
    const reRead = `re-reading ${kWords(projected.tokens)} ${carries ? "from its carried cache" : "into a cold cache"} costs ${usdWords(projected.reReadUsd)}, plus ${usdWords(projected.allowanceUsd)} for its next turn`;
    const base = {
      ceilingPct: ADMIT_CEILING_PCT,
      perPct,
      projected,
      usedPct: window.percent,
    };
    if (
      perPct === null ||
      perPct <= 0 ||
      cost === null ||
      pendingUsd === null
    ) {
      return {
        ...base,
        ok: standing.length === 0,
        pendingPct: null,
        thisPct: null,
        words: `${reRead}; ${aloneWords(named, standing.length, perPct === null, cost === null)}`,
      };
    }
    const thisPct = cost / perPct;
    const pendingPct = pendingUsd / perPct;
    const after = window.percent + pendingPct + thisPct;
    const ok = after <= ADMIT_CEILING_PCT;
    return {
      ...base,
      ok,
      pendingPct,
      thisPct,
      words: `${reRead}, ≈${thisPct.toFixed(1)}% of ${named}'s 5-hour window at $${perPct.toFixed(2)} a percent; ${named} reads ${Math.round(window.percent)}% with ${pendingPct.toFixed(1)}% already admitted, so this takes it to ${after.toFixed(1)}%, ${ok ? "under" : "past"} the ${ADMIT_CEILING_PCT}% admission ceiling`,
    };
  };

  return {
    check,
    /** Charges `row`'s move onto `target` as `verdict` priced it. */
    charge(row: LimitRow, target: Account, verdict: Verdict): void {
      const now = Date.now();
      const { reReadUsd, allowanceUsd } = verdict.projected;
      charges.set(row.id, {
        accountId: target.id,
        instanceId: row.id,
        at: now,
        resetsAt: sessionWindow(db, target.id, now).resetsAt,
        usd: reReadUsd === null ? null : reReadUsd + allowanceUsd,
      });
    },
    /** A move that did not go: its charge goes with it. */
    refund(instanceId: string): void {
      charges.delete(instanceId);
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
