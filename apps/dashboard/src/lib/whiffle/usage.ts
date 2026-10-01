/**
 * Usage & cost helpers for the /usage page and the sidebar meter
 * (design/usage-tracker.md). The summary and limits JSON shapes are core's
 * (`UsageSummary`, `UsageLimitsResponse`); this module reads them.
 */
import type { LimitWindow } from "@whiffle/core";

/** Real or notional dollars — two decimals, never more. */
export const usd = (n: number): string => `$${n.toFixed(2)}`;

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

/** The three limit bands the sidebar's UsageMeter colours by. */
export type Band = "calm" | "warn" | "critical";

export const band = (pct: number): Band => {
  if (pct >= 90) {
    return "critical";
  }
  return pct >= 70 ? "warn" : "calm";
};

/** A countdown to a reset, as the sidebar's UsageMeter words it. */
export const resetsIn = (resetsAt: string | null, now: number): string => {
  if (!resetsAt) {
    return "";
  }
  const diff = new Date(resetsAt).getTime() - now;
  if (diff <= 0) {
    return "resetting now";
  }
  const totalMin = Math.floor(diff / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rest = h % 24;
    return rest > 0 ? `resets in ${d}d ${rest}h` : `resets in ${d}d`;
  }
  if (h > 0) {
    return `resets in ${h}h ${m}m`;
  }
  if (m > 0) {
    return `resets in ${m}m`;
  }
  return "resets in <1m";
};

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

/** About this long: "about 2h", "about 45m" — a projection is never to the minute. */
function about(ms: number): string {
  const min = ms / MINUTE_MS;
  const fives = Math.max(5, Math.round(min / 5) * 5);
  if (fives < 60) {
    return `${fives}m`;
  }
  const h = min / 60;
  if (h < 10) {
    const half = Math.round(h * 2) / 2;
    const whole = Math.floor(half);
    return half === whole ? `${whole}h` : `${whole}h 30m`;
  }
  if (h < 48) {
    return `${Math.round(h)}h`;
  }
  return `${Math.round(h / 24)}d`;
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

  let state: MeterState = "calm";
  if (stale) {
    state = "stale";
  } else if (used >= 100) {
    state = "reached";
  } else if (used >= 90) {
    state = "over";
  } else if (used >= 70 || (runsOutIn !== null && runsOutIn < HOUR_MS)) {
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

/** The projection, as one sentence: what the Limits block leads with. */
export function projectionSentence(m: Meter, now: number): string {
  const reset = m.window.resetsAt;
  if (m.used >= 100) {
    return reset
      ? `Limit reached. It resets ${resetLabel(reset, now)}.`
      : "Limit reached.";
  }
  if (m.early) {
    return "Too early in the window to project.";
  }
  if (m.runsOutIn !== null && m.margin !== null) {
    return `At this pace it runs out in about ${about(m.runsOutIn)}, ${about(m.margin)} before the reset.`;
  }
  if (m.lasts) {
    return "At this pace it lasts to the reset.";
  }
  return "";
}

/** A bar's own line under it: its projection, short. */
export function projectionNote(m: Meter): string {
  if (m.early) {
    return "too early to project";
  }
  if (m.runsOutIn !== null) {
    return `runs out in about ${about(m.runsOutIn)}`;
  }
  return m.lasts ? "lasts to the reset" : "";
}

/** "read 2h ago": how old a stale reading is. */
export const readAgo = (fetchedAt: number, now: number): string =>
  now - fetchedAt < MINUTE_MS
    ? "read just now"
    : `read ${duration(now - fetchedAt)} ago`;

const TIER_PREFIX = /^default_claude_/;
const UNDERSCORE = /_/g;
const WORD_START = /\b\w/g;

/** "default_claude_max_20x" → "Max 20x". */
export const planName = (tier: string | null): string | null =>
  tier
    ? tier
        .replace(TIER_PREFIX, "")
        .replace(UNDERSCORE, " ")
        .replace(WORD_START, (c) => c.toUpperCase())
    : null;
