import { type AccountOverage, modelScope } from "../accounts";
import type { LimitWindow } from "./types";

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
 * legitimate — a lower-priority episode can run past the 5-hour cap — so this
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
 * The windows an event's `unifiedWindows` carries, and the
 * {@link LimitWindow} each is (Claude Code's `Ct`: `five_hour` "5h",
 * `seven_day` "7d", `seven_day_overage_included` "7d_oi").
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
 * before their reset, that bear on `scope`'s requests: the 5-hour, the week,
 * and `scope`'s own week.
 */
const heldSpent = (session: ObservedSession, scope: string | null): Spent[] =>
  session.held.flatMap((one) => {
    const resets = one.resetsAt ? Date.parse(one.resetsAt) : Number.NaN;
    const bears =
      one.kind === "session" ||
      one.kind === "weekly_all" ||
      (one.kind === "weekly_scoped" && one.scopeLabel === scope);
    return bears && one.percent >= 100 && resets > session.now
      ? [
          {
            scope: one.kind === "weekly_scoped" ? scope : null,
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
 * - one the event carries at its limit (the 5-hour or the week: every
 *   model; the overage-included week: its model);
 * - one the account held at its limit before the event, for the refused
 *   request's model (Claude Code's 429 may carry no windows);
 * - else the refused request's model, whose own week the event does not
 *   carry (Opus's, Sonnet's): its model alone, until the credits refill, or
 *   until that week resets when the account held it and held its 5-hour
 *   and week short of their limits (so the week is the one spent).
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
 * account held that week and held its 5-hour and week short of their
 * limits, and it comes before the credits refill (`credits`, epoch seconds).
 */
const ownWeekResets = (
  session: ObservedSession | undefined,
  scope: string | null,
  credits: number | undefined
): number | undefined => {
  const held = session?.held ?? [];
  const short = (kind: string) =>
    held.some((one) => one.kind === kind && one.percent < 100);
  const week = held.find(
    (one) => one.kind === "weekly_scoped" && one.scopeLabel === scope
  );
  const resets = week?.resetsAt ? Date.parse(week.resetsAt) / 1000 : null;
  return scope &&
    short("session") &&
    short("weekly_all") &&
    resets !== null &&
    resets * 1000 > (session?.now ?? 0) &&
    (credits === undefined || resets < credits)
    ? resets
    : credits;
};

/**
 * The windows, overage and exhaustion one `rate_limit_event` reports. The
 * unified windows give the 5-hour, weekly and overage-included weekly
 * reading; the binding window (`rateLimitType`) adds a model's own weekly
 * window when it is one; a `rejected` status says the binding window is
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
  return { windows, overage: overageOf(info), exhausted };
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
