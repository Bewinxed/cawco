import { homedir } from "node:os";
import { join } from "node:path";
import type { LimitWindow, OpenCodeGoLimits } from "./types";

/**
 * The OpenCode Go plan's live windows. OpenCode Go meters every key by dollar
 * value over three windows (opencode.ai/docs/go: "5-hour — 20% of the monthly
 * limit; weekly — 50%; and monthly — 100%"), and its server answers what each
 * one has used:
 *
 *     GET https://opencode.ai/zen/go/v1/usage   (Authorization: Bearer <key>)
 *     {"usage":{"rolling":{"status":"ok","percent":0,"resetsAt":"…"},
 *               "weekly":{…},"monthly":{…}}}
 *
 * The key is an OpenCode Go account's, from its store on the machine, read at
 * call time for one request and never logged, persisted or returned. The
 * request goes only to that canonical host and follows no redirect, so the
 * key cannot be handed anywhere else.
 */

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const TIMEOUT_MS = 10_000;
/** The same cadence the Claude reading keeps: the daemon ticks faster and is served from cache. */
const CACHE_TTL_MS = 180_000;
const FAILURE_BACKOFF_MS = 2 * 60_000;

interface GoWindowRaw {
  percent?: number;
  resetsAt?: string | null;
  status?: string;
}

interface GoUsageResponse {
  usage?: {
    monthly?: GoWindowRaw | null;
    rolling?: GoWindowRaw | null;
    weekly?: GoWindowRaw | null;
  } | null;
}

/** The three Go windows and the {@link LimitWindow} identity each maps onto. */
const MAPPED = [
  { key: "rolling", kind: "rolling", group: "session" },
  { key: "weekly", kind: "weekly", group: "weekly" },
  { key: "monthly", kind: "monthly", group: "monthly" },
] as const;

/**
 * The machine's own OpenCode data dir, where it keeps `auth.json`:
 * `$XDG_DATA_HOME/opencode`, else `~/.local/share/opencode`. OpenCode 1.18
 * reads `path.join(Global.Path.data, "auth.json")`, its data dir from
 * xdg-basedir; it has no `OPENCODE_DATA_DIR` (anomalyco/opencode#8963 is
 * still open).
 */
export const opencodeDataDir = (): string =>
  join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "opencode"
  );

/** What one key's reads came to: the last answer, the last good one, and a failure cooling down. */
interface KeyState {
  cached: { at: number; value: OpenCodeGoLimits } | null;
  coolingUntil: number;
  failed: OpenCodeGoLimits | null;
  lastGood: OpenCodeGoLimits | null;
}

const states = new Map<string, KeyState>();

/** The answer's windows; a window not `ok` is the one doing the limiting. */
function windowsOf(body: GoUsageResponse): LimitWindow[] {
  return MAPPED.flatMap(({ key, kind, group }) => {
    const raw = body.usage?.[key];
    if (!raw) {
      return [];
    }
    const limited = raw.status !== undefined && raw.status !== "ok";
    return [
      {
        kind,
        group,
        percent: raw.percent ?? 0,
        severity: limited ? "critical" : "normal",
        resetsAt: raw.resetsAt ?? null,
        scopeLabel: null,
        isActive: limited,
      },
    ];
  });
}

/**
 * The Go windows for one OpenCode Go key (an account's, held by the agent);
 * null for no key: no plan, so nothing to meter. A failed read is served as
 * the last good windows marked stale, with the error attached, and is not
 * retried for two minutes.
 */
export async function fetchOpenCodeGoLimits(
  key: string | null
): Promise<OpenCodeGoLimits | null> {
  if (!key) {
    return null;
  }
  const state: KeyState = states.get(key) ?? {
    cached: null,
    coolingUntil: 0,
    failed: null,
    lastGood: null,
  };
  states.set(key, state);
  const now = Date.now();
  if (state.failed && now < state.coolingUntil) {
    return state.failed;
  }
  if (state.cached && now - state.cached.at < CACHE_TTL_MS) {
    return state.cached.value;
  }

  let error: string;
  try {
    const res = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const value: OpenCodeGoLimits = {
        error: null,
        fetchedAt: Date.now(),
        windows: windowsOf((await res.json()) as GoUsageResponse),
      };
      state.cached = { at: value.fetchedAt, value };
      state.lastGood = value;
      state.failed = null;
      return value;
    }
    error = `HTTP ${res.status}`;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  state.failed = state.lastGood
    ? { ...state.lastGood, stale: true, error }
    : { error, fetchedAt: Date.now(), windows: [] };
  state.coolingUntil = Date.now() + FAILURE_BACKOFF_MS;
  return state.failed;
}
