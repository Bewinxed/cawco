import type { AccountOverage } from "../accounts";
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

/** The two windows every event carries, and the {@link LimitWindow} each is. */
const UNIFIED = [
  { key: "five_hour", kind: "session", group: "session" },
  { key: "seven_day", kind: "weekly_all", group: "weekly" },
] as const;

/** The binding windows that are one model's weekly window, and that model's scope. */
const SCOPED: Record<string, string> = {
  seven_day_opus: "Opus",
  seven_day_sonnet: "Sonnet",
};

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
 * The windows, overage and exhaustion one `rate_limit_event` reports. The
 * unified windows give the 5-hour and weekly reading; the binding window
 * (`rateLimitType`) adds a model's own weekly window when it is one; a
 * `rejected` status says the binding window is spent until its reset.
 */
export function observedReading(info: ObservedRateLimitInfo): ObservedReading {
  const binding = info.rateLimitType;
  const windows: LimitWindow[] = [];
  for (const { key, kind, group } of UNIFIED) {
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
      scopeLabel: null,
      isActive: binding === key,
    });
  }
  const scope = binding ? SCOPED[binding] : undefined;
  if (scope && info.utilization !== undefined) {
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
  const overage: AccountOverage | null =
    info.overageStatus === undefined && info.isUsingOverage === undefined
      ? null
      : {
          status: info.overageStatus ?? null,
          resetsAt: iso(info.overageResetsAt),
          inUse: info.isUsingOverage ?? false,
          disabledReason: info.overageDisabledReason ?? null,
        };
  return {
    windows,
    overage,
    exhausted:
      info.status === "rejected"
        ? { scope: scope ?? null, resetsAt: iso(info.resetsAt) }
        : null,
  };
}
