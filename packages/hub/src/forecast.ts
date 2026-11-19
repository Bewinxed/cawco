import {
  type Account,
  type AccountBench,
  type AccountForecast,
  type AccountReading,
  type CarrySpan,
  type ProviderRouting,
  pushCarry,
  type WindowForecast,
  type WindowRef,
} from "@cawco/core/accounts";
import { DAY_MS, HOUR_MS } from "@cawco/core/time";
import type { LimitWindow } from "@cawco/core/usage/types";
import {
  bearing,
  freshWindows,
  resetMinute,
  windowKey,
  windowResetAt,
  windowSpan,
} from "@cawco/core/usage/windows";
import type { DbShape } from "./db";
import type { UsagePeriod } from "./db/usage-periods";
import { LOOK_AHEAD_MS } from "./decide";
import { place } from "./placement";
import type { WindowPace } from "./window-paces";

/**
 * Where a provider's accounts are heading: each window's pace and when it
 * runs out, what a percent of it costs, and which account carries new
 * sessions until the relay's horizon. Pure over the stored readings, the
 * usage summary's periods (db usage-periods.ts) and the routing, so every
 * reader (the usage screen, placement, the one decision) gets the same
 * answer.
 */

/** How far ahead the carry sequence looks: the relay's horizon, the look-ahead. */
const HORIZON_MS = LOOK_AHEAD_MS;

/**
 * How far back a decision reads the accounts' readings: a weekly window,
 * and a day over for its opening reading.
 */
const LOOKBACK_MS = 8 * DAY_MS;

/**
 * The periods of `accountIds` a forecast reads at `now`, as the readings of
 * the last `lookBackMs` draw them (db usage-periods.ts `periods`): those
 * read since, each from its first reading since.
 */
export const readPeriods = (
  db: Pick<DbShape, "usagePeriods">,
  accountIds: readonly string[],
  now: number,
  lookBackMs = LOOKBACK_MS
): UsagePeriod[] => db.usagePeriods.periods(accountIds, now - lookBackMs);

const resetMs = (window: Pick<LimitWindow, "resetsAt">): number | null =>
  window.resetsAt ? Date.parse(window.resetsAt) : null;

/** Whether `period` is of `accountId`'s window `window` (its kind and scope). */
const ofWindow = (
  period: UsagePeriod,
  accountId: string,
  window: Pick<LimitWindow, "kind" | "scopeLabel">
): boolean =>
  period.accountId === accountId &&
  period.kind === window.kind &&
  period.scopeLabel === window.scopeLabel;

/**
 * Percent per hour across the window's period that is open now (the period
 * of its reset minute, core `resetMinute`): from its first reading to its
 * latest. Null with fewer than two readings in it.
 */
const paceOf = (
  window: LimitWindow,
  periods: readonly UsagePeriod[],
  accountId: string
): number | null => {
  const minute = resetMinute(window);
  const period = periods.find(
    (one) => ofWindow(one, accountId, window) && one.resetMinute === minute
  );
  if (!period || period.lastAt <= period.firstAt) {
    return null;
  }
  return Math.max(
    0,
    (period.lastPercent - period.firstPercent) /
      ((period.lastAt - period.firstAt) / HOUR_MS)
  );
};

/** One window now: use, pace and when it runs out. */
const windowForecast = (
  window: LimitWindow,
  periods: readonly UsagePeriod[],
  accountId: string,
  running: boolean,
  now: number
): WindowForecast => {
  const reset = resetMs(window);
  const base = {
    kind: window.kind,
    group: window.group,
    scopeLabel: window.scopeLabel,
    resetsAt: window.resetsAt,
  };
  if (reset !== null && reset <= now) {
    return { ...base, utilization: 0, pace: null };
  }
  // Nothing runs there: it is heading nowhere, a pace of zero, never unknown.
  const pace = running ? paceOf(window, periods, accountId) : 0;
  const left = 100 - window.percent;
  const runsOutAt =
    pace && pace > 0 ? now + (Math.max(left, 0) / pace) * HOUR_MS : undefined;
  return {
    ...base,
    utilization: window.percent,
    pace,
    ...(runsOutAt !== undefined && (reset === null || runsOutAt < reset)
      ? { runsOutAt }
      : {}),
  };
};

/**
 * The window that limits an account at its pace: among the windows bearing
 * on it (core `bearing`, every model's with the account read as a whole),
 * whichever it has, the one that runs out soonest at its pace; when none
 * runs out before its reset, the one that resets latest. A window with no
 * known reset resets latest of all. Null when none bears.
 */
const bindingWindow = (
  all: WindowForecast[],
  now: number
): WindowRef | null => {
  const windows = bearing(all, undefined, now, null);
  const ref = (window: WindowForecast | undefined): WindowRef | null =>
    window ? { kind: window.kind, scopeLabel: window.scopeLabel } : null;
  const runningOut = windows.filter(
    (window): window is WindowForecast & { runsOutAt: number } =>
      window.runsOutAt !== undefined
  );
  if (runningOut.length > 0) {
    return ref(
      runningOut.reduce((soonest, window) =>
        window.runsOutAt < soonest.runsOutAt ? window : soonest
      )
    );
  }
  const resets = (window: WindowForecast) =>
    resetMs(window) ?? Number.POSITIVE_INFINITY;
  return ref(
    windows.reduce<WindowForecast | undefined>(
      (latest, window) =>
        !latest || resets(window) > resets(latest) ? window : latest,
      undefined
    )
  );
};

/**
 * The fewest percent a window must have moved, summed over its periods,
 * before what a percent costs is taken from it: a reading rounds to whole
 * percents, so one or two of them say little.
 */
const MIN_PCT_MEASURED = 3;

/**
 * What one percent of an account's window costs, by `measure` of the turns
 * CawCo saw on it: over its periods (a usage summary row each), the percent
 * each moved from its first reading to its latest, laid beside the turns
 * recorded between them. A period that moved nothing, or whose turns
 * measured nothing, says nothing. Null until the window has moved
 * {@link MIN_PCT_MEASURED} percent across periods that measured anything.
 */
const perPercent = (
  window: Pick<LimitWindow, "kind" | "scopeLabel">,
  periods: readonly UsagePeriod[],
  accountId: string,
  measure: "tokens" | "usd"
): number | null => {
  let pct = 0;
  let measured = 0;
  for (const period of periods) {
    const spent = period[measure];
    if (
      ofWindow(period, accountId, window) &&
      period.lastPercent > period.firstPercent &&
      spent > 0
    ) {
      pct += period.lastPercent - period.firstPercent;
      measured += spent;
    }
  }
  return pct >= MIN_PCT_MEASURED ? measured / pct : null;
};

/**
 * What one percent of an account's window costs in dollars
 * ({@link perPercent}): the `turn_usage` cost (Claude Code's own `costUSD`)
 * of the turns in its periods.
 */
export const usdPerPercent = (
  window: Pick<LimitWindow, "kind" | "scopeLabel">,
  periods: readonly UsagePeriod[],
  accountId: string
): number | null => perPercent(window, periods, accountId, "usd");

/**
 * Each account's windows as placement and the one decision read them: the
 * pace of each (null on an account nothing runs on, as
 * {@link accountForecasts} has it) and what one percent of it costs in
 * weighted tokens (turn-weight.ts `weightedTokens`). Use CawCo never saw
 * (another client on the account) makes a percent look cheaper than it is,
 * so re-reads priced from it are priced high.
 */
export const accountPaces = (
  accounts: Account[],
  readings: AccountReading[],
  periods: readonly UsagePeriod[],
  running: ReadonlySet<string>,
  now: number
): Map<string, WindowPace[]> =>
  new Map(
    accountForecasts(accounts, readings, periods, running, now).map(
      (forecast) => [
        forecast.accountId,
        forecast.windows.map((window) => ({
          kind: window.kind,
          scopeLabel: window.scopeLabel,
          pace: window.pace,
          tokensPerPct: perPercent(
            window,
            periods,
            forecast.accountId,
            "tokens"
          ),
        })),
      ]
    )
  );

/** Every account's windows as a forecast. `running`: accounts with a live session. */
export const accountForecasts = (
  accounts: Account[],
  readings: AccountReading[],
  periods: readonly UsagePeriod[],
  running: ReadonlySet<string>,
  now: number
): AccountForecast[] =>
  accounts.map((account) => {
    const reading = readings.find((one) => one.accountId === account.id);
    // A lapsed window the account's set names is its fresh one (core
    // `freshWindows`), so every reader of the forecast walks it.
    const windows = freshWindows(
      reading?.windows ?? [],
      reading?.windowKinds ?? null,
      now
    ).map((window) =>
      windowForecast(window, periods, account.id, running.has(account.id), now)
    );
    return {
      accountId: account.id,
      bindingWindow: bindingWindow(windows, now),
      lastSeenAt: reading?.lastSeenAt ?? null,
      windows,
    };
  });

export interface CarryInput {
  accounts: Account[];
  bench: AccountBench[];
  forecasts: AccountForecast[];
  kind: "yours" | "delegates";
  now: number;
  readings: AccountReading[];
  routing: ProviderRouting;
  /** Accounts signed in on at least one machine. */
  signedIn: ReadonlySet<string>;
}

/** One window of an account as the walk moves it: its use, and its reset (null: none ahead is known). */
interface WalkWindow {
  group: string;
  key: string;
  reset: number | null;
  use: number;
}

/**
 * The fleet's burn into each window, percent an hour, by window
 * ({@link windowKey}): the summed pace of that window across the accounts
 * with sessions running, so the session pace spends into session windows and
 * each week's pace into weeks. A window no account spends burns nothing.
 */
const burnsOf = (forecasts: AccountForecast[]): Map<string, number> => {
  const burns = new Map<string, number>();
  for (const forecast of forecasts) {
    for (const window of forecast.windows) {
      const key = windowKey(window);
      burns.set(key, (burns.get(key) ?? 0) + (window.pace ?? 0));
    }
  }
  return burns;
};

/** The walk's state: each account's windows' use and reset as time moves, and who is out. */
class Walk {
  readonly #input: CarryInput;
  readonly bench: AccountBench[];
  /** Each account's windows, by account id: its own, whichever it has. */
  readonly windows = new Map<string, WalkWindow[]>();

  constructor(input: CarryInput) {
    this.#input = input;
    this.bench = [...input.bench];
    for (const account of input.accounts) {
      const forecast = input.forecasts.find(
        (one) => one.accountId === account.id
      );
      this.windows.set(
        account.id,
        (forecast?.windows ?? []).map((window) => {
          const at = windowResetAt(window);
          return {
            key: windowKey(window),
            group: window.group,
            use: window.utilization,
            reset: at !== null && at > input.now ? at : null,
          };
        })
      );
    }
  }

  /** Windows that reset by `t` start fresh, each to reset again a span of its own later (none ahead for one of no known length). */
  freshen(t: number): void {
    for (const windows of this.windows.values()) {
      for (const window of windows) {
        if (window.reset !== null && window.reset <= t) {
          const span = windowSpan({
            group: window.group,
            resetsAt: new Date(window.reset).toISOString(),
          });
          window.use = 0;
          window.reset = span === null ? null : window.reset + span;
        }
      }
    }
  }

  /** The readings as they stand at `t`, for placement to read. */
  #readings(): AccountReading[] {
    return this.#input.readings.map((reading) => {
      const walked = new Map(
        (this.windows.get(reading.accountId) ?? []).map((one) => [one.key, one])
      );
      return {
        ...reading,
        windows: reading.windows.map((window) => {
          const at = walked.get(windowKey(window));
          return at
            ? {
                ...window,
                percent: at.use,
                resetsAt:
                  at.reset === null
                    ? window.resetsAt
                    : new Date(at.reset).toISOString(),
              }
            : window;
        }),
      };
    });
  }

  /** Whether an account is spent in the walk: one of its windows is at its limit. */
  spent(id: string): boolean {
    return (this.windows.get(id) ?? []).some((window) => window.use >= 100);
  }

  /** Who placement chooses at `t`, when it can carry anything at all. */
  carrier(t: number): string | null {
    const input = this.#input;
    const placed = place({
      accounts: input.accounts,
      bench: this.bench.filter((one) => one.until > t),
      kind: input.kind,
      machineId: "fleet",
      now: t,
      readings: this.#readings(),
      routing: input.routing,
      signins: input.accounts
        .filter((account) => input.signedIn.has(account.id))
        .map((account) => ({
          accountId: account.id,
          machineId: "fleet",
          state: "signed-in" as const,
          movedAt: null,
          movedFrom: null,
          reason: null,
          refusalReach: null,
          checkedAt: t,
        })),
    });
    const carrier = placed.ok ? placed.accountId : null;
    const out =
      !carrier ||
      this.spent(carrier) ||
      this.bench.some((one) => one.accountId === carrier && one.until > t);
    return out ? null : carrier;
  }

  /**
   * When `id` runs out carrying from `t` at `burns`, and on which window:
   * the window its burn fills first; null when none fills.
   */
  runsOut(
    id: string,
    burns: ReadonlyMap<string, number>,
    t: number
  ): { at: number; window: WalkWindow } | null {
    let soonest: { at: number; window: WalkWindow } | null = null;
    for (const window of this.windows.get(id) ?? []) {
      const burn = burns.get(window.key) ?? 0;
      if (burn <= 0) {
        continue;
      }
      const at = t + (Math.max(100 - window.use, 0) / burn) * HOUR_MS;
      if (!soonest || at < soonest.at) {
        soonest = { at, window };
      }
    }
    return soonest;
  }

  /** Spends `burns` into `id`'s windows from `t` to `until`. */
  spend(
    id: string,
    burns: ReadonlyMap<string, number>,
    t: number,
    until: number
  ): void {
    for (const window of this.windows.get(id) ?? []) {
      window.use += ((burns.get(window.key) ?? 0) * (until - t)) / HOUR_MS;
    }
  }

  /** The next moment after `t` an account comes back: a bench ends or a window resets. */
  nextBack(t: number): number {
    const later = [
      ...this.bench.map((one) => one.until),
      ...[...this.windows.values()]
        .flat()
        .map((window) => window.reset)
        .filter((at): at is number => at !== null),
    ].filter((at) => at > t);
    return later.length > 0 ? Math.min(...later) : Number.POSITIVE_INFINITY;
  }
}

/**
 * Which account carries new sessions of `kind` from now to the horizon, as
 * placement would choose at each step. The fleet's burn into each window
 * ({@link burnsOf}) moves onto whichever account carries, into its own
 * windows, whichever it has; the others hold where they are, since nothing
 * CawCo sees spends them. An account that would run out is out until the
 * window that ran out resets, as Claude Code would bench it; a span with
 * nothing able to carry is null.
 */
export const carrySequence = (input: CarryInput): CarrySpan[] => {
  const horizon = input.now + HORIZON_MS;
  const burns = burnsOf(input.forecasts);
  const walk = new Walk(input);
  const spans: CarrySpan[] = [];

  let t = input.now;
  // A bound on steps: each one ends at a run-out or a reset, of which a
  // handful of accounts have few within the horizon.
  for (let step = 0; step < 64 && t < horizon; step += 1) {
    walk.freshen(t);
    const carrier = walk.carrier(t);
    if (!carrier) {
      // Nothing can carry: until the first account comes back.
      const until = Math.min(horizon, walk.nextBack(t));
      pushCarry(spans, null, t, until);
      t = until;
      continue;
    }
    const out = walk.runsOut(carrier, burns, t);
    const runsOut = out?.at ?? Number.POSITIVE_INFINITY;
    const until = Math.min(horizon, runsOut, walk.nextBack(t));
    pushCarry(spans, carrier, t, until);
    walk.spend(carrier, burns, t, until);
    if (out && until === runsOut && runsOut < horizon) {
      walk.bench.push({
        accountId: carrier,
        scope: null,
        until: out.window.reset ?? horizon,
      });
    }
    // A reset of the carrier itself before it ran out leaves it carrying,
    // fresh, at the top of the next step.
    t = until;
  }
  return spans;
};
