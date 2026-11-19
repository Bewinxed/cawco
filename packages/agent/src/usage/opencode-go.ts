import { Backoff, type BackoffPolicy } from "@cawco/core/backoff";
import { readWithin } from "@cawco/core/bounded";
import { MINUTE_MS, secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import type { LimitWindow, OpenCodeGoLimits } from "@cawco/core/usage/types";
import { z } from "zod";

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
 *
 * `CAWCO_OPENCODE_BASE_URL` points the read at another host: a test-only
 * setting for a scratch fleet's stand-in, unset in production, as
 * `CAWCO_CHATGPT_BASE_URL` is for ChatGPT's (usage/chatgpt.ts).
 */

const DEFAULT_BASE_URL = "https://opencode.ai";
const TRAILING_SLASHES = /\/+$/u;

/** Where the Go usage read goes: OpenCode's host, or the stand-in `CAWCO_OPENCODE_BASE_URL` names. */
const usageUrl = (): string =>
  `${(process.env.CAWCO_OPENCODE_BASE_URL || DEFAULT_BASE_URL).replace(TRAILING_SLASHES, "")}/zen/go/v1/usage`;
const TIMEOUT_MS = 10_000;
/** The same cadence the Claude reading keeps: the daemon ticks faster and is served from cache. */
const CACHE_TTL_MS = 180_000;
/**
 * A failed read, read again: from 2 min, doubling to 30. Never given up: the
 * reading is the daemon's usage tick, which a key's removal ends, and its
 * failure is shown on the account as its last good windows marked stale.
 */
const FAILED_READS: BackoffPolicy = {
  firstMs: 2 * MINUTE_MS,
  mostMs: 30 * MINUTE_MS,
  giveUp: {
    never:
      "the usage tick reads every metered key while it is held; a failure only slows it",
  },
};

const GoWindowRaw = z.object({
  percent: z.number().optional(),
  resetsAt: z.string().nullish(),
  status: z.string().optional(),
});

const GoUsageResponse = z.object({
  usage: z
    .object({
      monthly: GoWindowRaw.nullish(),
      rolling: GoWindowRaw.nullish(),
      weekly: GoWindowRaw.nullish(),
    })
    .nullish(),
});
type GoUsageResponse = z.infer<typeof GoUsageResponse>;

/** The three Go windows and the {@link LimitWindow} identity each maps onto. */
const MAPPED = [
  { key: "rolling", kind: "rolling", group: "session" },
  { key: "weekly", kind: "weekly", group: "weekly" },
  { key: "monthly", kind: "monthly", group: "monthly" },
] as const;

/** What one key's reads came to: the last answer, the last good one, and a failure cooling down. */
interface KeyState {
  cached: { at: number; value: OpenCodeGoLimits } | null;
  coolingUntil: number;
  failed: OpenCodeGoLimits | null;
  /** Its reads that failed in a row ({@link FAILED_READS}). */
  failures: Backoff;
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
 * read again until its wait ({@link FAILED_READS}) is out.
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
    failures: new Backoff(FAILED_READS),
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
    const read = await readWithin(TIMEOUT_MS, async (signal) => {
      const res = await fetch(usageUrl(), {
        headers: { Authorization: `Bearer ${key}` },
        redirect: "error",
        signal,
      });
      if (!res.ok) {
        await res.body?.cancel();
        return { ok: false as const, status: res.status };
      }
      return {
        ok: true as const,
        windows: windowsOf(GoUsageResponse.parse(await res.json())),
      };
    });
    switch (read.kind) {
      case "answered":
        if (read.value.ok) {
          const value: OpenCodeGoLimits = {
            error: null,
            fetchedAt: Date.now(),
            windows: read.value.windows,
          };
          state.cached = { at: value.fetchedAt, value };
          state.lastGood = value;
          state.failed = null;
          state.failures.succeeded();
          return value;
        }
        error = `HTTP ${read.value.status}`;
        break;
      case "unanswered":
        // No reading: the last good windows stand, marked stale below.
        error = `no answer within ${secondsOf(read.after)}s`;
        console.warn(
          `[usage] OpenCode Go's usage endpoint: ${error}; the last reading stands`
        );
        break;
      default:
        unhandled("read", read);
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  state.failed = state.lastGood
    ? { ...state.lastGood, stale: true, error }
    : { error, fetchedAt: Date.now(), windows: [] };
  const step = state.failures.failed();
  state.coolingUntil =
    Date.now() + (step.kind === "wait" ? step.ms : FAILED_READS.mostMs);
  return state.failed;
}
