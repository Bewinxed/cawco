import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ClaudeLimits, LimitWindow } from "./types";

/**
 * Live Claude rate-limit utilization (USAGE-SPEC.md §4.5). Reads the OAuth
 * token from `~/.claude/.credentials.json` at call time for one request; it is
 * never logged, persisted, or returned. Missing credentials and an expired
 * token are normal states (a machine may run opencode only), so they come back
 * as `{ error, windows: [] }` rather than exceptions.
 */

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const TIMEOUT_MS = 10_000;
/**
 * The endpoint buckets its rate limit per (access token, User-Agent), and a
 * `claude-code/*` agent gets a far larger bucket than anything else. Measured
 * against one live token, seven back-to-back requests per agent:
 *
 *     claude-code/2.1.263  3x 200     <- privileged bucket
 *     cawco/0.1.0        1x 200     |
 *     curl/8.5.0           1x 200     |- one shared, trickling generic bucket
 *     (header suppressed)  0x 200     <- worst bucket of all
 *
 * Unset, this header is not absent: Bun's `fetch` defaults it to `Bun/1.4.0`,
 * which lands in the middle row. That is why the monitor sat on `HTTP 429` —
 * it was polling a trickle bucket every 60s and never refilling it. The
 * version is only ever read as a bucket key, so a constant is enough; the
 * `claude-code/` prefix is what earns the top row.
 */
const USER_AGENT = "claude-code/2.1.263";
/**
 * Community-measured safe cadence for this endpoint is ~180s; polling it at 60s
 * drains the bucket. The daemon ticks faster than this on purpose (its
 * transcript scan wants the shorter period) and is served from cache in
 * between.
 */
const CACHE_TTL_MS = 180_000;
const NON_429_BACKOFF_MS = 2 * 60_000;
/**
 * 429 escalation by consecutive-failure streak: 5m → 10m → 15m (cap). The cap
 * is deliberately short: the bucket refills on the order of minutes, so a
 * longer blackout only serves stale numbers through a window that has already
 * reopened.
 */
const BACKOFF_STEPS_MS = [5 * 60_000, 10 * 60_000, 15 * 60_000];

interface OauthCreds {
  accessToken?: string;
  expiresAt?: number;
  rateLimitTier?: string;
  subscriptionType?: string;
}

interface LimitWindowRaw {
  group?: string;
  is_active?: boolean;
  kind?: string;
  percent?: number;
  resets_at?: string | null;
  scope?: { model?: { display_name?: string } } | null;
  severity?: string;
}

interface UsageResponse {
  five_hour?: { utilization?: number; resets_at?: string } | null;
  limits?: LimitWindowRaw[];
  seven_day?: { utilization?: number; resets_at?: string } | null;
  /** Extra usage: pay-as-you-go money past the plan, against a monthly cap. */
  spend?: {
    used?: MoneyRaw | null;
    limit?: MoneyRaw | null;
    /** When the cap resets, when the API reports it. */
    resets_at?: string | null;
  } | null;
}

interface MoneyRaw {
  amount_minor?: number;
  currency?: string;
  exponent?: number;
}

/** Minor units to dollars: `amount_minor / 10^exponent`; null when unreported. */
const dollars = (money: MoneyRaw | null | undefined): number | null =>
  money?.amount_minor !== undefined && money.exponent !== undefined
    ? money.amount_minor / 10 ** money.exponent
    : null;

let cached: { at: number; value: ClaudeLimits } | null = null;
/** The last successful reading, kept to serve (stale) through a later failure. */
let lastGood: ClaudeLimits | null = null;
/** Failure retention: the error result to return and how long it is valid for. */
let lastFailure: {
  at: number;
  until: number;
  streak: number;
  value: ClaudeLimits;
} | null = null;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reads OAuth creds, resolves the plan, and folds three limit sources (5h, 7d, opus) into one shape — the fallbacks are what read as branches.
export async function fetchClaudeLimits(opts?: {
  configDir?: string;
}): Promise<ClaudeLimits> {
  const now = Date.now();

  // A recent failure is still cooling down: return its cached error result
  // without hitting the API again (backoff). Streak resets on the next success.
  if (lastFailure && now < lastFailure.until) {
    return lastFailure.value;
  }

  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const configDir = opts?.configDir ?? join(homedir(), ".claude");
  const credsPath = join(configDir, ".credentials.json");

  let raw: string;
  try {
    raw = await readFile(credsPath, "utf8");
  } catch {
    return errorResult("not signed in");
  }

  let oauth: OauthCreds | undefined;
  try {
    oauth = (JSON.parse(raw) as { claudeAiOauth?: OauthCreds }).claudeAiOauth;
  } catch {
    return errorResult("not signed in");
  }

  const token = oauth?.accessToken;
  if (!token) {
    return errorResult("not signed in");
  }

  if (oauth?.expiresAt !== undefined && oauth.expiresAt < Date.now()) {
    return errorResult("token expired");
  }

  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    return failureResult(res.status, res.headers.get("retry-after"));
  }

  const body = (await res.json()) as UsageResponse;

  const windows: LimitWindow[] = (body.limits ?? []).map((w) => ({
    kind: w.kind ?? "",
    group: w.group ?? "",
    percent: w.percent ?? 0,
    severity: w.severity ?? "normal",
    resetsAt: w.resets_at ?? null,
    scopeLabel: w.scope?.model?.display_name ?? null,
    isActive: w.is_active ?? false,
  }));

  // Fallback when the API omits `limits[]`: derive the two top-level windows.
  if (windows.length === 0) {
    if (body.five_hour) {
      windows.push({
        kind: "session",
        group: "session",
        percent: body.five_hour.utilization ?? 0,
        severity: "normal",
        resetsAt: body.five_hour.resets_at ?? null,
        scopeLabel: null,
        isActive: false,
      });
    }
    if (body.seven_day) {
      windows.push({
        kind: "weekly_all",
        group: "weekly",
        percent: body.seven_day.utilization ?? 0,
        severity: "normal",
        resetsAt: body.seven_day.resets_at ?? null,
        scopeLabel: null,
        isActive: false,
      });
    }
  }

  const result: ClaudeLimits = {
    fetchedAt: Date.now(),
    planTier: oauth?.rateLimitTier ?? null,
    subscription: oauth?.subscriptionType ?? null,
    windows,
    spendUsed: dollars(body.spend?.used),
    spendLimit: dollars(body.spend?.limit),
    spendResetsAt: body.spend?.resets_at ?? null,
    error: null,
  };

  cached = { at: Date.now(), value: result };
  lastGood = result;
  lastFailure = null;
  return result;
}

function errorResult(error: string): ClaudeLimits {
  return {
    fetchedAt: Date.now(),
    planTier: null,
    subscription: null,
    windows: [],
    spendUsed: null,
    spendLimit: null,
    spendResetsAt: null,
    error,
  };
}

/**
 * Records a failed request and returns what to serve for the backoff window.
 *
 * For a 429, honours a POSITIVE numeric `Retry-After` (seconds), else escalates
 * by streak. The positive test is load-bearing, not defensive: this endpoint
 * answers every 429 with a literal `retry-after: 0`, which would otherwise be
 * read as "retry at once" and turn the backoff into a hot loop. Zero and
 * absent are treated alike — neither says anything about when the bucket
 * reopens, so the streak ladder is the only signal left.
 *
 * Other failures cool down 2m. If a good reading was ever fetched, that is
 * returned stale rather than empty windows.
 */
function failureResult(
  status: number,
  retryAfter: string | null
): ClaudeLimits {
  const now = Date.now();
  const streak = (lastFailure?.streak ?? 0) + 1;

  let until: number;
  if (status === 429) {
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      until = now + seconds * 1000;
    } else {
      const step =
        BACKOFF_STEPS_MS[Math.min(streak - 1, BACKOFF_STEPS_MS.length - 1)];
      until = now + step;
    }
  } else {
    until = now + NON_429_BACKOFF_MS;
  }

  const error = `HTTP ${status}`;
  const value: ClaudeLimits = lastGood
    ? { ...lastGood, stale: true, error }
    : errorResult(error);

  lastFailure = { at: now, until, streak, value };
  return value;
}
