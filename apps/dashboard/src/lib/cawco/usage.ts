/**
 * Usage & cost helpers for the /usage page and the sidebar meter
 * (design/usage-tracker.md). The summary and limits JSON shapes are core's
 * (`UsageSummary`, `UsageLimitsResponse`); this module reads them.
 */
import type {
  AgentRow,
  ClaudeLimits,
  LimitWindow,
  ProjectCap,
  UsageSpend,
} from "@cawco/core";

/**
 * The midnight `days` before the hub's today, in the hub's zone: the start
 * of a range, reckoned on the same calendar as the hub's spend. A daylight
 * saving change in between moves midnight by an hour, which the zone's own
 * clock corrects.
 */
export function hubMidnight(
  spend: Pick<UsageSpend, "todayStart" | "timeZone">,
  days: number
): number {
  const guess = spend.todayStart - days * 24 * HOUR_MS;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: spend.timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(guess)
  );
  if (hour === 23) {
    return guess + HOUR_MS;
  }
  if (hour === 1) {
    return guess - HOUR_MS;
  }
  return guess;
}

/** Real or notional dollars — two decimals, never more. */
export const usd = (n: number): string => `$${n.toFixed(2)}`;

/** What a reached cap holds back, in words. */
const CAP_HOLDS = {
  pause: "attempts paused",
  quiet: "Caw paused",
  both: "attempts and Caw paused",
} as const;

/** A project's reached cap in one line: "$12.40 of $10.00 this day · Caw paused". */
export const capLine = (cap: ProjectCap): string =>
  `${usd(cap.spentUsd)} of ${usd(cap.usd)} this ${cap.period} · ${CAP_HOLDS[cap.onCap]}`;

const WHOLE_DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Dollars as a person reads them: "$12.10", and "$3,488" from a thousand up. */
export const money = (n: number): string =>
  n >= 1000 ? WHOLE_DOLLARS.format(n) : usd(n);

/** 13.1M, 581M, 1.5k — the token counts the spec quotes read this way. */
export const compactNumber = (n: number): string => {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)}M`;
  }
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)}k`;
  }
  return String(n);
};

export const totalTokensOf = (r: {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  reasoning: number;
}): number => r.input + r.output + r.cacheCreation + r.cacheRead + r.reasoning;

/* ---- Limit windows (design/usage-tracker.md §1) ------------------------- */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "5-hour", "Week", "Week · Fable", "Month". */
export function windowLabel(w: LimitWindow): string {
  const base =
    { session: "5-hour", weekly: "Week", monthly: "Month" }[w.group] ?? w.kind;
  return w.scopeLabel ? `${base} · ${w.scopeLabel}` : base;
}

/**
 * How long a window runs, from its group (core's `LimitWindow`): 5 hours, 7
 * days, or the calendar month that ends at its reset. Null for a group no
 * provider has named, or a monthly window with no reset to count back from.
 */
export function windowSpan(w: LimitWindow): number | null {
  if (w.group === "session") {
    return 5 * HOUR_MS;
  }
  if (w.group === "weekly") {
    return 7 * DAY_MS;
  }
  if (w.group === "monthly" && w.resetsAt) {
    const end = new Date(w.resetsAt);
    const start = new Date(end);
    start.setUTCMonth(end.getUTCMonth() - 1);
    return end.getTime() - start.getTime();
  }
  return null;
}

/** When the window started, from its reset and its span. */
export function windowStart(w: LimitWindow): number | null {
  const span = windowSpan(w);
  return span !== null && w.resetsAt
    ? new Date(w.resetsAt).getTime() - span
    : null;
}

/**
 * The reading that speaks for a provider. Limits are account-scoped: every
 * machine signed in to one account reads the same numbers, so the first good
 * reading speaks for all of them, else one that failed but kept its last good
 * windows (served stale). Null when no machine has a reading with windows.
 */
export function speakingReading<
  T extends { error: string | null; stale?: boolean; windows: LimitWindow[] },
>(
  readings: Readonly<Record<string, T>>
): { machineId: string; reading: T } | null {
  const entries = Object.entries(readings);
  const found =
    entries.find(([, r]) => r.error === null) ??
    entries.find(([, r]) => r.stale && r.windows.length > 0);
  return found ? { machineId: found[0], reading: found[1] } : null;
}

/** "4h 38m", "50m", "3d 4h", "<1m": a span of time, to the minute. */
export function duration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / MINUTE_MS));
  const d = Math.floor(totalMin / (24 * 60));
  const h = Math.floor((totalMin % (24 * 60)) / 60);
  const m = totalMin % 60;
  if (d > 0) {
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return m > 0 ? `${m}m` : "<1m";
}

const WEEKDAY_TIME = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A moment as the app writes one with its date: "17 Oct 08:49". */
export const dateTimeText = (at: number): string =>
  DATE_TIME.format(at).replace(",", "");

/**
 * A reset: "in 4h 38m" under a day away, "Thu 09:00" inside the next seven
 * days, and "17 Oct 08:49" past them, where a weekday alone would name the
 * wrong week.
 */
export function resetLabel(resetsAt: string, now: number): string {
  const at = new Date(resetsAt).getTime();
  const left = at - now;
  if (left <= 0) {
    return "now";
  }
  if (left < DAY_MS) {
    return `in ${duration(left)}`;
  }
  const format = left < 7 * DAY_MS ? WEEKDAY_TIME : DATE_TIME;
  return format.format(at).replace(",", "");
}

/** How a window reads: its colour step, and whether it gets a glyph. */
export type MeterState = "calm" | "near" | "over" | "reached" | "stale";

export interface Meter {
  /** Fewer than 3% of the window gone: a pace from that is noise. */
  early: boolean;
  /** The share of the window's time gone, 0–1; null without a span or reset. */
  elapsed: number | null;
  /** At this pace it does not run out before the reset. */
  lasts: boolean;
  /** How far ahead of the reset it runs out; null when it lasts or cannot be told. */
  margin: number | null;
  /** How long until it runs out at this pace; null when it lasts or cannot be told. */
  runsOutIn: number | null;
  state: MeterState;
  used: number;
  window: LimitWindow;
}

/**
 * A share's colour step by how full it is alone: spark from 70%, crimson from
 * 90%, reached at 100% (owner picks b and c). A window also turns spark on a
 * projected run-out (readMeter); a share with no clock — context, a spend cap
 * — goes by this.
 */
export function fillState(used: number): MeterState {
  if (used >= 100) {
    return "reached";
  }
  if (used >= 90) {
    return "over";
  }
  return used >= 70 ? "near" : "calm";
}

/** Below this share of the window gone, the design reads "too early to project". */
const EARLY = 0.03;

/**
 * One window against the clock. The pace is the share used over the share of
 * time gone; carried forward, it says whether the window lasts to its reset or
 * when it runs out. Spark from 70% used or a run-out under an hour away,
 * crimson from 90%, reached at 100% (owner picks b and c).
 */
export function readMeter(w: LimitWindow, now: number, stale: boolean): Meter {
  const used = w.percent;
  const span = windowSpan(w);
  const reset = w.resetsAt ? new Date(w.resetsAt).getTime() : null;
  const elapsed =
    span !== null && reset !== null
      ? Math.min(1, Math.max(0, 1 - (reset - now) / span))
      : null;
  const early = elapsed !== null && elapsed < EARLY;

  let runsOutIn: number | null = null;
  let margin: number | null = null;
  let lasts = false;
  if (
    used < 100 &&
    elapsed !== null &&
    !early &&
    span !== null &&
    reset !== null
  ) {
    const perMs = used / (elapsed * span);
    const left = perMs > 0 ? (100 - used) / perMs : Number.POSITIVE_INFINITY;
    if (now + left >= reset) {
      lasts = true;
    } else {
      runsOutIn = left;
      margin = reset - (now + left);
    }
  }

  let state = fillState(used);
  if (stale) {
    state = "stale";
  } else if (state === "calm" && runsOutIn !== null && runsOutIn < HOUR_MS) {
    state = "near";
  }
  return {
    window: w,
    used,
    elapsed,
    early,
    lasts,
    runsOutIn,
    margin,
    state,
  };
}

/**
 * Of several windows, the one that stops you first: one already reached, else
 * the soonest projected run-out, else the fullest.
 */
export function firstToStop<T extends { meter: Meter }>(
  readings: T[]
): T | null {
  const reached = readings.find((r) => r.meter.used >= 100);
  if (reached) {
    return reached;
  }
  const [running] = readings
    .filter((r) => r.meter.runsOutIn !== null)
    .sort((a, b) => (a.meter.runsOutIn ?? 0) - (b.meter.runsOutIn ?? 0));
  if (running) {
    return running;
  }
  return [...readings].sort((a, b) => b.meter.used - a.meter.used)[0] ?? null;
}

/** One provider's window, read against the clock: what every limit surface draws. */
export interface LimitRow {
  key: string;
  label: string;
  meter: Meter;
  provider: "Claude" | "opencode";
}

/** Session first, then the weeks fullest first, then the month: worst news nearest the top. */
const GROUP_ORDER: Record<string, number> = {
  session: 0,
  weekly: 1,
  monthly: 2,
};

/** A provider's windows as rows, in the order every surface lists them. */
export function limitRows(
  provider: LimitRow["provider"],
  reading: { stale?: boolean; windows: LimitWindow[] } | null | undefined,
  now: number
): LimitRow[] {
  if (!reading) {
    return [];
  }
  const stale = Boolean(reading.stale);
  return [...reading.windows]
    .sort(
      (a, b) =>
        (GROUP_ORDER[a.group] ?? 3) - (GROUP_ORDER[b.group] ?? 3) ||
        b.percent - a.percent
    )
    .map((w) => ({
      key: `${provider}:${w.kind}:${w.scopeLabel ?? ""}`,
      label: windowLabel(w),
      meter: readMeter(w, now, stale),
      provider,
    }));
}

/** "max" → "Max": the plan as Claude Code's `subscriptionType` names it. */
export const planName = (subscription: string | null): string | null =>
  subscription
    ? subscription.charAt(0).toUpperCase() + subscription.slice(1)
    : null;

/**
 * Why Claude's limits cannot be shown, and what fixes it: the one source of
 * those words for the Usage page's Limits block and the usage strip, so the
 * two say the same thing. `signIn`: signing an account in on the machine
 * fixes it, in Configure → Accounts; otherwise there is nothing to do but
 * wait for a read.
 */
export interface LimitsGap {
  machine: AgentRow | null;
  reason: string;
  signIn: boolean;
}
export function claudeGap(
  readings: Readonly<Record<string, ClaudeLimits>>,
  machines: readonly AgentRow[]
): LimitsGap {
  const [first] = Object.entries(readings);
  if (!first) {
    return {
      machine: null,
      reason: "No machine has reported a Claude reading yet.",
      signIn: false,
    };
  }
  const [machineId, reading] = first;
  const machine = machines.find((m) => m.machineId === machineId) ?? null;
  const host = machine?.hostname ?? "a removed machine";
  // A machine the hub cannot reach can neither be read nor signed in on:
  // its last word is not offered as something to act on.
  if (machine && machine.status !== "online") {
    return {
      machine,
      reason: `${host} is offline. Its Claude limits are read again once it's back.`,
      signIn: false,
    };
  }
  if (reading.error === "not signed in") {
    return {
      machine,
      reason: `No Claude account is signed in on ${host}.`,
      signIn: true,
    };
  }
  return {
    machine,
    reason: `Claude Code hasn't reported the limits of ${host}'s account yet; they appear once a session runs there.`,
    signIn: false,
  };
}
