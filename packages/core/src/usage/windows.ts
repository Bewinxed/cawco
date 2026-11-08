import { DAY_MS, HOUR_MS } from "../time";
import { accountsWords } from "../words/accounts";
import type { LimitWindow } from "./types";

/**
 * An account's limit windows as every reader reads them: which bear on a
 * session, which binds now, when they opened and reset, and what each is
 * called. The window set is the account's own, as its provider reported it
 * (core `AccountReading.windowKinds`): nothing here assumes any one window
 * exists, and nothing here makes one up. Placement, the forecast, admission,
 * at-limit, the rebalancer, keep-alive and the screens all read windows
 * through this module.
 */

/** The parts of a window its clock is read from. */
type Clocked = Pick<LimitWindow, "group" | "resetsAt">;
/** The parts of a window its use is read from. */
type Used = Pick<LimitWindow, "percent" | "resetsAt">;

/**
 * How long a window of each group runs, counted back from its reset. A
 * `monthly` window runs the calendar month to its reset ({@link windowSpan});
 * a group not here has no known length.
 */
const WINDOW_SPAN_MS: Readonly<Record<string, number>> = {
  session: 5 * HOUR_MS,
  weekly: 7 * DAY_MS,
};

/** A window's reset, epoch ms; null when none is known. */
export const windowResetAt = (
  window: Pick<LimitWindow, "resetsAt">
): number | null => {
  const at = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  return Number.isFinite(at) ? at : null;
};

/**
 * How long `window` runs: its group's span ({@link WINDOW_SPAN_MS}), or for a
 * monthly one the calendar month that ends at its reset. Null when its
 * length is unknown: a group no span is known for, or a month with no reset.
 */
export const windowSpan = (window: Clocked): number | null => {
  if (window.group === "monthly") {
    const end = windowResetAt(window);
    if (end === null) {
      return null;
    }
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - 1);
    return end - start.getTime();
  }
  return WINDOW_SPAN_MS[window.group] ?? null;
};

/** When `window` opened: its reset less its span; null when either is unknown. */
export const openedAt = (window: Clocked): number | null => {
  const reset = windowResetAt(window);
  const span = windowSpan(window);
  return reset === null || span === null ? null : reset - span;
};

/** Whether `window` is open at `now`: it has a reset still ahead. */
export const windowOpen = (
  window: Pick<LimitWindow, "resetsAt">,
  now: number
): boolean => {
  const reset = windowResetAt(window);
  return reset !== null && reset > now;
};

/** A window's use at `now`: one whose reset has passed with no newer reading has nothing spent in it yet. */
export const windowUsed = (window: Used, now: number): number => {
  const reset = windowResetAt(window);
  return reset !== null && reset <= now ? 0 : window.percent;
};

/** The parts of a window a fresh one is made from ({@link freshWindows}). */
type Freshable = Pick<
  LimitWindow,
  "group" | "kind" | "percent" | "resetsAt" | "scopeLabel"
>;

/**
 * An account's windows as they stand at `now`, its window set `kinds`
 * (core `AccountReading.windowKinds`) read in: a held window whose reset has
 * passed, of a kind the set names, is that kind's fresh window. The
 * provider's last report named the window, and until a turn opens the next
 * one the account has it whole: nothing used, opening now, resetting a span
 * of its own from now (no reset known for a window of no known length). A
 * lapsed window outside the set, or any with no set named (`null`), stays as
 * held, and {@link bearing} reads it as over.
 */
export const freshWindows = <W extends Freshable>(
  windows: readonly W[],
  kinds: readonly string[] | null,
  now: number
): W[] => {
  if (!kinds) {
    return [...windows];
  }
  const named = new Set(kinds);
  return windows.map((window) => {
    const reset = windowResetAt(window);
    if (reset === null || reset > now || !named.has(windowKey(window))) {
      return window;
    }
    const span = windowSpan(window);
    const fresh = {
      ...window,
      percent: 0,
      resetsAt: span === null ? null : new Date(now + span).toISOString(),
    };
    return "severity" in fresh
      ? { ...fresh, severity: "normal", isActive: false }
      : fresh;
  });
};

/**
 * The windows of an account that bear on a session of model scope `scope`
 * (core `modelScope`) at `now`: every window over all models, whatever its
 * kind (a session window, a week, a month, a provider's rolling one), and the
 * windows of that model alone. `undefined` reads the account as a whole,
 * every model's windows with it. The account's window set `kinds` makes a
 * lapsed window it names a fresh one ({@link freshWindows}); `null` reads
 * windows already freshened (a forecast's), or an account whose set no
 * report has named yet. Any other window whose reset has passed is over:
 * until the account reports the next one, it bears nothing.
 */
export function bearing<W extends Pick<LimitWindow, "resetsAt" | "scopeLabel">>(
  windows: readonly W[],
  scope: string | null | undefined,
  now: number,
  kinds: null
): W[];
export function bearing<W extends Freshable>(
  windows: readonly W[],
  scope: string | null | undefined,
  now: number,
  kinds: readonly string[] | null
): W[];
export function bearing<W extends Pick<LimitWindow, "resetsAt" | "scopeLabel">>(
  windows: readonly W[],
  scope: string | null | undefined,
  now: number,
  kinds: readonly string[] | null
): W[] {
  // Only the second signature names a set, and its windows are freshable.
  const read = kinds
    ? (freshWindows(
        windows as unknown as Freshable[],
        kinds,
        now
      ) as unknown as W[])
    : windows;
  return read.filter((window) => {
    const reset = windowResetAt(window);
    return (
      (reset === null || reset > now) &&
      (scope === undefined ||
        window.scopeLabel === null ||
        window.scopeLabel === scope)
    );
  });
}

/**
 * A week's pace line at `now`, percent: the share of it gone since it
 * opened (`100 × (now − opened) / span`), the use that spends it evenly to
 * its reset. Null for a window that is not a week, or whose opening is not
 * known.
 */
const paceLine = (window: Clocked, now: number): number | null => {
  const opened = openedAt(window);
  const span = windowSpan(window);
  if (window.group !== "weekly" || opened === null || !span) {
    return null;
  }
  return Math.min(100, Math.max(0, (100 * (now - opened)) / span));
};

/**
 * The week of `windows` (the bearing ones: the week over all models and the
 * session's model's own) used furthest past its pace line ({@link
 * paceLine}) at `now`, with its use and its line, percent; undefined when
 * none is past it. An account with no week is never ahead of one.
 */
export const aheadOfWeek = <W extends Clocked & Used>(
  windows: readonly W[],
  now: number
): { line: number; used: number; window: W } | undefined => {
  let furthest: { line: number; used: number; window: W } | undefined;
  for (const window of windows) {
    const line = paceLine(window, now);
    const used = windowUsed(window, now);
    if (
      line !== null &&
      used > line &&
      (!furthest || used - line > furthest.used - furthest.line)
    ) {
      furthest = { line, used, window };
    }
  }
  return furthest;
};

/**
 * The window that binds now: among `windows` (the bearing ones), the one
 * with the least left at `now`, and that share left, percent. Null when
 * there are none.
 */
export const headroom = <W extends Used>(
  windows: readonly W[],
  now: number
): { left: number; window: W } | null => {
  let least: { left: number; window: W } | null = null;
  for (const window of windows) {
    const left = 100 - windowUsed(window, now);
    if (!least || left < least.left) {
      least = { left, window };
    }
  }
  return least;
};

/** The soonest reset among `windows` that are open at `now`; null when none is. */
export const earliestReset = (
  windows: readonly Pick<LimitWindow, "resetsAt">[],
  now: number
): number | null => {
  let soonest: number | null = null;
  for (const window of windows) {
    const reset = windowResetAt(window);
    if (
      reset !== null &&
      reset > now &&
      (soonest === null || reset < soonest)
    ) {
      soonest = reset;
    }
  }
  return soonest;
};

/**
 * The window of `windows` at or past its limit that resets last, open at
 * `now`: the one that keeps the account refusing. Undefined when none is
 * spent.
 */
export const spentWindow = <W extends Used>(
  windows: readonly W[],
  now: number
): W | undefined => {
  let latest: { at: number; window: W } | undefined;
  for (const window of windows) {
    const reset = windowResetAt(window);
    if (
      window.percent >= 100 &&
      reset !== null &&
      reset > now &&
      (!latest || reset > latest.at)
    ) {
      latest = { at: reset, window };
    }
  }
  return latest?.window;
};

/**
 * A window's place in an account's window set
 * (`AccountReading.windowKinds`): its kind, and the model it is scoped to
 * after a slash.
 */
export const windowKey = (
  window: Pick<LimitWindow, "kind" | "scopeLabel">
): string =>
  window.scopeLabel ? `${window.kind}/${window.scopeLabel}` : window.kind;

const words = accountsWords.windows;

/** The group a window is named by: its own, or `other` for a length CawCo has no name for. */
const nameGroup = (group: string): keyof typeof words.sentence =>
  group === "session" || group === "weekly" || group === "monthly"
    ? group
    : "other";

/**
 * A window as a sentence's slot names it, by its group: "5-hour", "weekly",
 * "Fable weekly", "monthly"; empty for a window of no known length, so the
 * slot reads "its limit".
 */
export const windowWords = (
  window: Pick<LimitWindow, "group" | "scopeLabel">
): string => {
  const name = words.sentence[nameGroup(window.group)];
  return window.scopeLabel && name
    ? words.scoped(window.scopeLabel, name)
    : name;
};

/** A window as a noun: "5 hours", "week", "Fable week", "month", "window". */
export const windowNoun = (
  window: Pick<LimitWindow, "group" | "scopeLabel">
): string => {
  const name = words.noun[nameGroup(window.group)];
  return window.scopeLabel ? words.scoped(window.scopeLabel, name) : name;
};

/** A window as a limit bar labels it: "5-hour", "Week", "Week · Fable", "Month", "Window". */
export const windowLabel = (
  window: Pick<LimitWindow, "group" | "scopeLabel">
): string => {
  const label = words.label[nameGroup(window.group)];
  return window.scopeLabel
    ? words.scopedLabel(label, window.scopeLabel)
    : label;
};
