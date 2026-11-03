import { type AccountOverage, modelScope } from "../accounts";
import type { LimitWindow } from "./types";
import { bearing, windowKey, windowResetAt } from "./windows";

/**
 * Rate-limit windows as Claude Code reports them, and the only source CawCo
 * has for them: CawCo never asks Anthropic for an account's usage itself.
 *
 * Claude Code emits a `rate_limit_event` whenever a window's rounded
 * percentage or reset time moves, carrying `rate_limit_info`: the
 * utilizations it read from the `anthropic-ratelimit-unified-*` headers on its
 * own inference responses. Every event describes the whole account the
 * session runs on, so the newest reading of an account replaces the last.
 */

/** Epoch-seconds → ISO, the shape {@link LimitWindow.resetsAt} is stored in. */
const iso = (seconds: number | undefined): string | null =>
  seconds === undefined ? null : new Date(seconds * 1000).toISOString();

/**
 * `utilization` is a FRACTION of the window (0–1). Values above 1 are
 * legitimate — a lower-priority episode can run past a window's cap — so this
 * scales without clamping and leaves presentation to the reader.
 */
const percent = (utilization: number): number => utilization * 100;

/**
 * The model scope of `seven_day_overage_included`, the weekly window of the
 * models whose use spills into usage credits: Claude Code 2.1.302 names it
 * by that model in its own limit words (`Cae.seven_day_overage_included`
 * "Fable limit", which its refusal reads as "You've hit your Fable limit"),
 * and its `/usage` lists the window under that model's `display_name`.
 */
const OVERAGE_INCLUDED_SCOPE = "Fable";

/**
 * The windows an event's `unifiedWindows` may carry, and the
 * {@link LimitWindow} each is (Claude Code's `Ct`: `five_hour` "5h",
 * `seven_day` "7d", `seven_day_overage_included` "7d_oi"). Each is
 * optional: Claude Code 0.3.316 builds `unifiedWindows` from the
 * `anthropic-ratelimit-unified-<window>-*` headers the response carried and
 * leaves out a window it got none for ("Windows absent from the account
 * state are absent here"), so a verified Ultra account's events carry no
 * `five_hour` at all, and the account has no 5-hour window.
 */
const UNIFIED = [
  { key: "five_hour", kind: "session", group: "session", scope: null },
  { key: "seven_day", kind: "weekly_all", group: "weekly", scope: null },
  {
    key: "seven_day_overage_included",
    kind: "weekly_scoped",
    group: "weekly",
    scope: OVERAGE_INCLUDED_SCOPE,
  },
] as const;

/** The binding windows that are one model's weekly window, and that model's scope. */
const SCOPED: Record<string, string> = {
  seven_day_opus: "Opus",
  seven_day_sonnet: "Sonnet",
  seven_day_overage_included: OVERAGE_INCLUDED_SCOPE,
};

/**
 * The binding claim that is the usage-credit budget, not a window
 * (`Cae.overage` "usage credit limit"): what it says is the overage state.
 */
const OVERAGE = "overage";

/**
 * The `rate_limit_info` payload, structurally. Not imported from the agent
 * SDK: `unifiedWindows` is marked `@internal` there, so it is stripped from
 * the published `.d.ts` even though the CLI emits it.
 */
export interface ObservedRateLimitInfo {
  isUsingOverage?: boolean;
  overageDisabledReason?: string;
  overageResetsAt?: number;
  overageStatus?: string;
  rateLimitType?: string;
  resetsAt?: number;
  status?: string;
  unifiedWindows?: {
    five_hour?: { utilization: number; resetsAt: number };
    seven_day?: { utilization: number; resetsAt: number };
    seven_day_overage_included?: { utilization: number; resetsAt: number };
  };
  utilization?: number;
}

const severity = (status: string | undefined): string => {
  if (status === "rejected") {
    return "critical";
  }
  if (status === "allowed_warning") {
    return "warning";
  }
  return "normal";
};

/** What one event says about its account. */
export interface ObservedReading {
  /** The window that refused the request, when one did: its model scope (null: every model) and reset. */
  exhausted: { resetsAt: string | null; scope: string | null } | null;
  overage: AccountOverage | null;
  /**
   * The account's window set (core `AccountReading.windowKinds`): the
   * windows `unifiedWindows` carried, with the model weeks only a binding
   * claim reports (Opus's, Sonnet's), which `unifiedWindows` never names, as
   * the event or the held reading has them open. Null when the event carries
   * no `unifiedWindows`: it says nothing of the set.
   */
  windowKinds: string[] | null;
  windows: LimitWindow[];
}

/**
 * The session an event came from: the model its refused request ran on, and
 * the account's windows as the hub held them before the event.
 */
export interface ObservedSession {
  held: readonly LimitWindow[];
  model: string | null;
  /** When the event arrived, epoch ms: a held window that reset before it says nothing. */
  now: number;
}

/** A window at its limit: the model scope it holds (null: every model) and its reset, epoch seconds. */
interface Spent {
  resetsAt: number;
  scope: string | null;
}

/**
 * The refusal `spent` says: every model while a window over them all is at
 * its limit, until the last of those resets; else the one model's window.
 */
const refusalOf = (
  spent: readonly Spent[]
): NonNullable<ObservedReading["exhausted"]> | null => {
  const every = spent.filter((one) => one.scope === null);
  const held = every.length > 0 ? every : spent;
  const [first] = held;
  return first
    ? {
        scope: first.scope,
        resetsAt: iso(Math.max(...held.map((one) => one.resetsAt))),
      }
    : null;
};

/**
 * The windows the account held at their limit before the event, still
 * before their reset, that bear on `scope`'s requests (core usage/windows.ts
 * `bearing`): every window over all models, and `scope`'s own.
 */
const heldSpent = (session: ObservedSession, scope: string | null): Spent[] =>
  bearing(session.held, scope, session.now, null).flatMap((one) => {
    const resets = windowResetAt(one);
    return one.percent >= 100 && resets !== null
      ? [
          {
            scope: one.scopeLabel === null ? null : scope,
            resetsAt: resets / 1000,
          },
        ]
      : [];
  });

/**
 * What a refusal of the usage-credit budget spends: the request went to
 * credits because a window was at its limit, so the models that window
 * covers are refused until it resets. Which window, from the first that
 * says:
 * - one the event carries at its limit (one over all models: every
 *   model; the overage-included week: its model);
 * - one the account held at its limit before the event, for the refused
 *   request's model (Claude Code's 429 may carry no windows);
 * - else the refused request's model, whose own week the event does not
 *   carry (Opus's, Sonnet's): its model alone, until the credits refill, or
 *   until that week resets when the account held it and held none of its
 *   windows over all models at its limit (so the week is the one spent).
 * A model with no family to scope by is refused on every model's terms.
 */
const creditsRefused = (
  info: ObservedRateLimitInfo,
  session: ObservedSession | undefined
): NonNullable<ObservedReading["exhausted"]> => {
  const carried = UNIFIED.flatMap((each) => {
    const window = info.unifiedWindows?.[each.key];
    return window && window.utilization >= 1
      ? [{ scope: each.scope, resetsAt: window.resetsAt }]
      : [];
  });
  const scope = modelScope(session?.model);
  return (
    refusalOf(carried) ??
    (session ? refusalOf(heldSpent(session, scope)) : null) ?? {
      scope,
      resetsAt: iso(ownWeekResets(session, scope, info.resetsAt)),
    }
  );
};

/**
 * When `scope`'s refused requests run again: its own week's reset, when the
 * account held that week and held none of its windows over all models at
 * its limit (a window it has none of, as a verified Ultra account has no
 * session window, is short of it), and it comes before the credits refill
 * (`credits`, epoch seconds).
 */
const ownWeekResets = (
  session: ObservedSession | undefined,
  scope: string | null,
  credits: number | undefined
): number | undefined => {
  if (!(session && scope)) {
    return credits;
  }
  const open = bearing(session.held, scope, session.now, null);
  const short = open.every(
    (one) => one.scopeLabel !== null || one.percent < 100
  );
  const week = open.find(
    (one) => one.kind === "weekly_scoped" && one.scopeLabel === scope
  );
  const at = week ? windowResetAt(week) : null;
  const resets = at === null ? null : at / 1000;
  return short && resets !== null && (credits === undefined || resets < credits)
    ? resets
    : credits;
};

/** The window set's keys `unifiedWindows` can speak for: a held window of another key is one only a binding claim reports. */
const UNIFIED_KEYS: ReadonlySet<string> = new Set(
  UNIFIED.map((one) => windowKey({ kind: one.kind, scopeLabel: one.scope }))
);

/**
 * The account's window set an event names ({@link ObservedReading.windowKinds}):
 * the windows it carries, and the held model weeks only a binding claim
 * reports, still open; null when it carries no `unifiedWindows`.
 */
const windowKindsOf = (
  info: ObservedRateLimitInfo,
  windows: readonly LimitWindow[],
  session: ObservedSession | undefined
): string[] | null => {
  if (!info.unifiedWindows || Object.keys(info.unifiedWindows).length === 0) {
    return null;
  }
  const others = session
    ? bearing(session.held, undefined, session.now, null).filter(
        (one) => !UNIFIED_KEYS.has(windowKey(one))
      )
    : [];
  return [...new Set([...windows, ...others].map(windowKey))];
};

/**
 * The windows, overage and exhaustion one `rate_limit_event` reports, and
 * the account's window set. The unified windows give whichever of the
 * session, weekly and overage-included weekly windows the account has; the
 * binding window (`rateLimitType`) adds a model's own weekly window when it
 * is one; a `rejected` status says the binding window is
 * spent until its reset, for its model when it is one model's. The
 * usage-credit claim (`overage`) is the overage state, not a window.
 */
export function observedReading(
  info: ObservedRateLimitInfo,
  session?: ObservedSession
): ObservedReading {
  const binding = info.rateLimitType;
  const windows: LimitWindow[] = [];
  for (const { key, kind, group, scope } of UNIFIED) {
    const window = info.unifiedWindows?.[key];
    if (!window) {
      continue;
    }
    windows.push({
      kind,
      group,
      percent: percent(window.utilization),
      // `status` describes only the window doing the limiting, which
      // `rateLimitType` names; every other window is unremarkable.
      severity: binding === key ? severity(info.status) : "normal",
      resetsAt: iso(window.resetsAt),
      scopeLabel: scope,
      isActive: binding === key,
    });
  }
  const scope = binding ? SCOPED[binding] : undefined;
  const carried = windows.some(
    (one) => one.kind === "weekly_scoped" && one.scopeLabel === scope
  );
  if (scope && !carried && info.utilization !== undefined) {
    windows.push({
      kind: "weekly_scoped",
      group: "weekly",
      percent: percent(info.utilization),
      severity: severity(info.status),
      resetsAt: iso(info.resetsAt),
      scopeLabel: scope,
      isActive: true,
    });
  }
  let exhausted: ObservedReading["exhausted"] = null;
  if (info.status === "rejected") {
    exhausted =
      binding === OVERAGE
        ? creditsRefused(info, session)
        : { scope: scope ?? null, resetsAt: iso(info.resetsAt) };
  }
  return {
    windows,
    windowKinds: windowKindsOf(info, windows, session),
    overage: overageOf(info),
    exhausted,
  };
}

/**
 * The usage-credit state an event carries: its overage fields, and, when
 * the credit budget is the claim that binds (`overage`), that claim's
 * status and reset where the overage fields leave them out.
 */
const overageOf = (info: ObservedRateLimitInfo): AccountOverage | null => {
  const claim = info.rateLimitType === OVERAGE ? info : undefined;
  if (
    info.overageStatus === undefined &&
    info.isUsingOverage === undefined &&
    !claim
  ) {
    return null;
  }
  return {
    status: info.overageStatus ?? claim?.status ?? null,
    resetsAt: iso(info.overageResetsAt ?? claim?.resetsAt),
    inUse: info.isUsingOverage ?? false,
    disabledReason: info.overageDisabledReason ?? null,
  };
};
