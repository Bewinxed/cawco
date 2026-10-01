import { readFile } from "node:fs/promises";
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
 * The key is the one `opencode providers` stored for `opencode-go` in
 * opencode's `auth.json`, read at call time for one request and never logged,
 * persisted or returned. The request goes only to that canonical host and
 * follows no redirect, so the key cannot be handed anywhere else.
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

/** `$OPENCODE_DATA_DIR` else `~/.local/share/opencode`, where opencode keeps `auth.json`. */
const dataDir = (): string =>
  process.env.OPENCODE_DATA_DIR ??
  join(homedir(), ".local", "share", "opencode");

let cached: { at: number; value: OpenCodeGoLimits | null } | null = null;
let lastGood: OpenCodeGoLimits | null = null;
let coolingUntil = 0;
let failed: OpenCodeGoLimits | null = null;

/** The machine's OpenCode Go key, or null when it has none. */
async function goKey(): Promise<string | null> {
  try {
    const auth = JSON.parse(
      await readFile(join(dataDir(), "auth.json"), "utf8")
    ) as Record<string, { key?: string } | undefined>;
    return auth["opencode-go"]?.key ?? null;
  } catch {
    return null;
  }
}

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
 * The Go windows, or null on a machine with no `opencode-go` key: no plan, so
 * nothing to meter. A failed read is served as the last good windows marked
 * stale, with the error attached, and is not retried for two minutes.
 */
export async function fetchOpenCodeGoLimits(): Promise<OpenCodeGoLimits | null> {
  const now = Date.now();
  if (failed && now < coolingUntil) {
    return failed;
  }
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const key = await goKey();
  if (!key) {
    cached = { at: now, value: null };
    return null;
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
      cached = { at: value.fetchedAt, value };
      lastGood = value;
      failed = null;
      return value;
    }
    error = `HTTP ${res.status}`;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  failed = lastGood
    ? { ...lastGood, stale: true, error }
    : { error, fetchedAt: Date.now(), windows: [] };
  coolingUntil = Date.now() + FAILURE_BACKOFF_MS;
  return failed;
}
