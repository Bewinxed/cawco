import { type BackoffPolicy, backoffWait } from "@cawco/core/backoff";
import { boundedRead } from "@cawco/core/effect/bounded";
import { MINUTE_MS, secondsOf } from "@cawco/core/time";
import type { LimitWindow, OpenCodeGoLimits } from "@cawco/core/usage/types";
import { Clock, Effect, Result, Schema } from "effect";
import { z } from "zod";
import { runPromise } from "../daemon-runtime";

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
 * The count lives in the key's state across reads, each read one try
 * that its caller starts ({@link fetchOpenCodeGoLimits}): a wait between
 * calls, not a retry inside one, so it is `backoffWait` on that count.
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
  failures: number;
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

/** A read of the usage endpoint that failed before it answered: its fetch, or its answer's shape. */
class GoReadFailed extends Schema.TaggedError<GoReadFailed>()("GoReadFailed", {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

/** The usage endpoint's answer to `key`, within {@link TIMEOUT_MS}: its windows, or the HTTP status it refused with. */
const readGo = Effect.fn("readGo")((key: string) =>
  boundedRead(
    TIMEOUT_MS,
    Effect.tryPromise({
      try: async (signal) => {
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
      },
      catch: (cause) =>
        new GoReadFailed({
          message: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    })
  )
);

/** {@link fetchOpenCodeGoLimits} as an Effect. */
export const openCodeGoLimits = Effect.fn("openCodeGoLimits")(function* (
  key: string | null
) {
  if (!key) {
    return null;
  }
  const state: KeyState = states.get(key) ?? {
    cached: null,
    coolingUntil: 0,
    failed: null,
    failures: 0,
    lastGood: null,
  };
  states.set(key, state);
  const now = yield* Clock.currentTimeMillis;
  if (state.failed && now < state.coolingUntil) {
    return state.failed;
  }
  if (state.cached && now - state.cached.at < CACHE_TTL_MS) {
    return state.cached.value;
  }

  const read = yield* Effect.result(readGo(key));
  let error: string;
  if (Result.isSuccess(read)) {
    if (read.success.ok) {
      const value: OpenCodeGoLimits = {
        error: null,
        fetchedAt: yield* Clock.currentTimeMillis,
        windows: read.success.windows,
      };
      state.cached = { at: value.fetchedAt, value };
      state.lastGood = value;
      state.failed = null;
      state.failures = 0;
      return value;
    }
    error = `HTTP ${read.success.status}`;
  } else if (read.failure._tag === "Unanswered") {
    // No reading: the last good windows stand, marked stale below.
    error = `no answer within ${secondsOf(read.failure.after)}s`;
    yield* Effect.logWarning(
      `[usage] OpenCode Go's usage endpoint: ${error}; the last reading stands`
    );
  } else {
    error = read.failure.message;
  }

  const failedAt = yield* Clock.currentTimeMillis;
  state.failed = state.lastGood
    ? { ...state.lastGood, stale: true, error }
    : { error, fetchedAt: failedAt, windows: [] };
  state.failures += 1;
  state.coolingUntil = failedAt + backoffWait(FAILED_READS, state.failures);
  return state.failed;
});

/**
 * The Go windows for one OpenCode Go key (an account's, held by the agent);
 * null for no key: no plan, so nothing to meter. A failed read is served as
 * the last good windows marked stale, with the error attached, and is not
 * read again until its wait ({@link FAILED_READS}) is out. The promise edge
 * of {@link openCodeGoLimits}.
 */
export const fetchOpenCodeGoLimits = (
  key: string | null
): Promise<OpenCodeGoLimits | null> => runPromise(openCodeGoLimits(key));
