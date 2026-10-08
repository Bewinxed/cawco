import type {
  Account,
  AccountBench,
  AccountForecast,
  AccountReading,
  CarrySpan,
  LimitWindow,
  ProviderRouting,
  WindowForecast,
} from "@cawco/core";
import { place } from "./placement";

/**
 * Where a provider's accounts are heading: each window's pace and when it
 * runs out, and which account carries new sessions until the 5-hour horizon.
 * Pure: a function of the stored readings, their history and the routing, so
 * every reader (the usage screen, the at-limit logic) gets the same answer.
 */

const HOUR_MS = 3_600_000;
/** How far the carry sequence looks ahead: one 5-hour window. */
export const HORIZON_MS = 5 * HOUR_MS;

/** One point of a window's history: its use and when it was read. */
export interface HistoryPoint {
  accountId: string;
  fetchedAt: number;
  kind: string;
  percent: number;
  resetsAt: string | null;
  scopeLabel: string | null;
}

const resetMs = (window: Pick<LimitWindow, "resetsAt">): number | null =>
  window.resetsAt ? Date.parse(window.resetsAt) : null;

/**
 * Percent per hour across the window's successive readings since it opened
 * (the points that share its reset). Null with fewer than two readings.
 */
const paceOf = (
  window: LimitWindow,
  history: HistoryPoint[],
  accountId: string
): number | null => {
  const points = history
    .filter(
      (point) =>
        point.accountId === accountId &&
        point.kind === window.kind &&
        point.scopeLabel === window.scopeLabel &&
        point.resetsAt === window.resetsAt
    )
    .sort((a, b) => a.fetchedAt - b.fetchedAt);
  const [first] = points;
  const last = points.at(-1);
  if (!(first && last) || last.fetchedAt <= first.fetchedAt) {
    return null;
  }
  return Math.max(
    0,
    (last.percent - first.percent) /
      ((last.fetchedAt - first.fetchedAt) / HOUR_MS)
  );
};

/** One window now: use, pace and when it runs out. */
const windowForecast = (
  window: LimitWindow,
  history: HistoryPoint[],
  accountId: string,
  running: boolean,
  now: number
): WindowForecast => {
  const reset = resetMs(window);
  const base = {
    kind: window.kind,
    scopeLabel: window.scopeLabel,
    resetsAt: window.resetsAt,
  };
  if (reset !== null && reset <= now) {
    return { ...base, utilization: 0, pace: null };
  }
  const pace = running ? paceOf(window, history, accountId) : null;
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

/** Every account's windows as a forecast. `running`: accounts with a live session. */
export const accountForecasts = (
  accounts: Account[],
  readings: AccountReading[],
  history: HistoryPoint[],
  running: ReadonlySet<string>,
  now: number
): AccountForecast[] =>
  accounts.map((account) => {
    const reading = readings.find((one) => one.accountId === account.id);
    return {
      accountId: account.id,
      lastSeenAt: reading?.lastSeenAt ?? null,
      windows: (reading?.windows ?? []).map((window) =>
        windowForecast(
          window,
          history,
          account.id,
          running.has(account.id),
          now
        )
      ),
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

/**
 * Which account carries new sessions of `kind` from now to the horizon, as
 * placement would choose at each step. The fleet's burn — the summed 5-hour
 * pace of the accounts with sessions running — moves onto whichever account
 * carries; the others hold where they are, since nothing CawCo sees spends
 * them. An account that would run out is out until its 5-hour window resets,
 * as Claude Code would bench it; a span with nothing able to carry is null.
 */
/** The 5-hour window of an account in a forecast. */
const sessionOf = (forecasts: AccountForecast[], id: string) =>
  forecasts
    .find((one) => one.accountId === id)
    ?.windows.find((window) => window.kind === "session");

/** The walk's state: each account's 5-hour use and reset as time moves, and who is out. */
class Walk {
  readonly #input: CarryInput;
  readonly bench: AccountBench[];
  readonly reset = new Map<string, number | null>();
  readonly use = new Map<string, number>();

  constructor(input: CarryInput) {
    this.#input = input;
    this.bench = [...input.bench];
    for (const account of input.accounts) {
      const window = sessionOf(input.forecasts, account.id);
      const at = window?.resetsAt ? Date.parse(window.resetsAt) : null;
      this.use.set(account.id, window?.utilization ?? 0);
      this.reset.set(account.id, at !== null && at > input.now ? at : null);
    }
  }

  /** Windows that reset by `t` start fresh. */
  freshen(t: number): void {
    for (const [id, at] of this.reset) {
      if (at !== null && at <= t) {
        this.use.set(id, 0);
        this.reset.set(id, at + HORIZON_MS);
      }
    }
  }

  /** The readings as they stand at `t`, for placement to read. */
  #readings(): AccountReading[] {
    return this.#input.readings.map((reading) => ({
      ...reading,
      windows: reading.windows.map((window) => {
        if (window.kind !== "session") {
          return window;
        }
        const at = this.reset.get(reading.accountId);
        return {
          ...window,
          percent: this.use.get(reading.accountId) ?? window.percent,
          resetsAt: at ? new Date(at).toISOString() : window.resetsAt,
        };
      }),
    }));
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
          home: false,
          checkedAt: t,
        })),
    });
    const carrier = placed.ok ? placed.accountId : null;
    const out =
      !carrier ||
      (this.use.get(carrier) ?? 0) >= 100 ||
      this.bench.some((one) => one.accountId === carrier && one.until > t);
    return out ? null : carrier;
  }

  /** The next moment after `t` an account comes back: a bench ends or a window resets. */
  nextBack(t: number): number {
    const later = [
      ...this.bench.map((one) => one.until),
      ...[...this.reset.values()].filter((at): at is number => at !== null),
    ].filter((at) => at > t);
    return later.length > 0 ? Math.min(...later) : Number.POSITIVE_INFINITY;
  }
}

/**
 * Which account carries new sessions of `kind` from now to the horizon, as
 * placement would choose at each step. The fleet's burn — the summed 5-hour
 * pace of the accounts with sessions running — moves onto whichever account
 * carries; the others hold where they are, since nothing CawCo sees spends
 * them. An account that would run out is out until its 5-hour window resets,
 * as Claude Code would bench it; a span with nothing able to carry is null.
 */
export const carrySequence = (input: CarryInput): CarrySpan[] => {
  const horizon = input.now + HORIZON_MS;
  const burn = input.forecasts.reduce(
    (sum, one) => sum + (sessionOf([one], one.accountId)?.pace ?? 0),
    0
  );
  const walk = new Walk(input);
  const spans: CarrySpan[] = [];
  const push = (accountId: string | null, from: number, to: number) => {
    const last = spans.at(-1);
    if (last && last.accountId === accountId && last.to === from) {
      last.to = to;
    } else if (to > from) {
      spans.push({ accountId, from, to });
    }
  };

  let t = input.now;
  // A bound on steps: each one ends at a run-out or a reset, of which a
  // handful of accounts have few within five hours.
  for (let step = 0; step < 64 && t < horizon; step += 1) {
    walk.freshen(t);
    const carrier = walk.carrier(t);
    if (!carrier) {
      // Nothing can carry: until the first account comes back.
      const until = Math.min(horizon, walk.nextBack(t));
      push(null, t, until);
      t = until;
      continue;
    }
    const use = walk.use.get(carrier) ?? 0;
    const runsOut =
      burn > 0 ? t + ((100 - use) / burn) * HOUR_MS : Number.POSITIVE_INFINITY;
    const until = Math.min(horizon, runsOut, walk.nextBack(t));
    push(carrier, t, until);
    walk.use.set(carrier, use + (burn * (until - t)) / HOUR_MS);
    if (until === runsOut && runsOut < horizon) {
      walk.bench.push({
        accountId: carrier,
        scope: null,
        until: walk.reset.get(carrier) ?? until + HORIZON_MS,
      });
    }
    // A reset of the carrier itself before it ran out leaves it carrying,
    // fresh, at the top of the next step.
    t = until;
  }
  return spans;
};
