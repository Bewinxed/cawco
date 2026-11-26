import type { BackoffPolicy } from "@cawco/core/backoff";
import { readWithin } from "@cawco/core/bounded";
import { backoffSchedule } from "@cawco/core/effect/backoff-schedule";
import { Clock, Duration, Effect, Schedule, Schema } from "effect";

/**
 * THE HUB AWAY IS NO ANSWER. What this machine asks of the hub over HTTP is
 * decided by the hub's answer, never by the hub not being there to give one:
 * a restart refuses the connection, a link cut leaves nothing to reach it
 * by, and what stands between (a gateway, a proxy) answers 502, 503 or 504.
 * Each is waited through until {@link HUB_AWAY_BOUND_MS} from the first try
 * ({@link throughHubAway}). Users: a session's start (its credential's ACK,
 * session-identity.ts; pi's tool list, delegation.ts `delegationTools`),
 * where a launch that met a deploy's restart failed at once, and the MCP
 * gateway's relay of a session's CawCo tool calls (mcp-oauth.ts), where a
 * delegate's `finish_item` made during its machine's 3 s link cut came back
 * "The CawCo hub could not be reached." and its item failed three quiet
 * turns later (link-under-load lane 1, 2026-10-20).
 */

/**
 * How long a request waits for the hub through its being away, from its
 * first try. Ours: the bound the launch's ask for its credential already has
 * (core handover.ts `CUSTODY_BOUND_MS`, 90 s), three times the 30.5 s hub
 * outage measured on 2026-10-09.
 */
export const HUB_AWAY_BOUND_MS = 90_000;

/** Statuses that say the hub is not there to answer, rather than that it answered. */
const AWAY = new Set([502, 503, 504]);

/** Whether `status` says the hub is away rather than that it answered. */
const isHubAway = (status: number): boolean => AWAY.has(status);

/**
 * Whether `status` says the hub failed in itself (Elysia's 500 for what a
 * route threw: its database busy with another statement, a law broken),
 * which is no verdict on what was asked. Only a request the hub takes twice
 * as once ({@link hubAnswer}) tries again on it.
 */
const isHubFault = (status: number): boolean => status === 500;

/** The hub was not there to answer one try, in words: the last reason {@link throughHubAway} gives. */
class HubAway extends Schema.TaggedError<HubAway>()("HubAway", {
  away: Schema.String,
}) {}

/** The waits between tries: from 0.5 s, doubling to 5 s; the end is the bound's ({@link throughHubAway}). */
const HUB_AWAY_WAITS: BackoffPolicy = {
  firstMs: 500,
  mostMs: 5000,
  giveUp: { never: "it ends at its bound, which a held process moves out" },
};

/** `error` in words for the log and a last refusal: its message, else its name. */
const awayWords = (error: unknown): string =>
  error instanceof Error ? error.message || error.name : String(error);

/**
 * `tryOnce`'s first response that is not the hub away ({@link isHubAway}),
 * nor one `again` says to try again past, whatever its status, for the
 * caller to read; the last reason the hub was
 * away once {@link HUB_AWAY_BOUND_MS} from the first try has passed, or once
 * `stopped` is aborted (the asker gave up). `tryOnce` throws when no answer
 * came (refused, reset, none within its own bound). Tries every 0.5 s
 * doubling to 5 s; a wait that ran late (this process held) moves the bound
 * out by as much.
 *
 * The promise edge of an `Effect.retry` on the house backoff
 * ({@link backoffSchedule}): the schedule gives each wait, and the bound is
 * kept beside it, since a schedule alone does not know this process was
 * held.
 */
export const throughHubAway = (
  tryOnce: () => Promise<Response>,
  stopped?: AbortSignal,
  again: (status: number) => boolean = isHubAway
): Promise<Response | { away: string }> => {
  // The bound is the hub's to use: time this process was held (a wait
  // that ran late) is given back, so a loop blocked here never spends it.
  let deadline = Date.now() + HUB_AWAY_BOUND_MS;
  /** The wait last begun, until the try after it reads how late it ran. */
  let waited: { at: number; ms: number } | undefined;
  const attempt = Effect.gen(function* () {
    if (waited) {
      const now = yield* Clock.currentTimeMillis;
      deadline += Math.max(0, now - waited.at - waited.ms);
      waited = undefined;
    }
    const answer = yield* Effect.tryPromise({
      try: tryOnce,
      catch: (error) => new HubAway({ away: awayWords(error) }),
    });
    if (!again(answer.status)) {
      return answer;
    }
    // What could not be read of the answer is the reason in its place.
    const unread = (error: unknown) => new HubAway({ away: awayWords(error) });
    if (isHubAway(answer.status)) {
      yield* Effect.tryPromise({
        try: async () => answer.body?.cancel(),
        catch: unread,
      });
      return yield* new HubAway({ away: `HTTP ${answer.status}` });
    }
    // The hub's own failure, in its words, for the log and a last refusal.
    const text = yield* Effect.tryPromise({
      try: () => answer.text(),
      catch: unread,
    });
    return yield* new HubAway({
      away: `HTTP ${answer.status}: ${text.slice(0, 300)}`,
    });
  });
  // Each wait is the house backoff's; it gives up once the asker has, or
  // at the bound. The wait it goes on to is noted, for the next try to read
  // how late it ran.
  const waits = backoffSchedule(HUB_AWAY_WAITS).pipe(
    Schedule.while(
      ({ duration, now }) =>
        !stopped?.aborted && now + Duration.toMillis(duration) < deadline
    ),
    Schedule.tap(({ duration, now }) =>
      Effect.sync(() => {
        waited = { at: now, ms: Duration.toMillis(duration) };
      })
    )
  );
  return Effect.runPromise(
    attempt.pipe(
      Effect.retry(waits),
      Effect.catchTag("HubAway", ({ away }) => Effect.succeed({ away }))
    )
  );
};

/**
 * The hub's answer to `url` ({@link throughHubAway}), each try bounded by
 * `tryMs`; throws `what` with the last reason the hub was away. Only for
 * requests the hub takes twice as once (an ACK of what it holds answers
 * `installed`; a read), so the hub's own failure ({@link isHubFault}) is
 * tried again within the same bound too: a session's credential installed
 * and proved is never stopped because the hub's bookkeeping of it failed
 * once (its database busy with another statement, 2026-11-19).
 */
export const hubAnswer = async (
  url: string,
  init: Omit<RequestInit, "signal">,
  tryMs: number,
  what: string
): Promise<Response> => {
  const answer = await throughHubAway(
    async () => {
      const tried = await readWithin(tryMs, (signal) =>
        fetch(url, { ...init, signal })
      );
      if (tried.kind === "unanswered") {
        throw new Error(`no answer within ${tryMs / 1000} s`);
      }
      return tried.value;
    },
    undefined,
    (status) => isHubAway(status) || isHubFault(status)
  );
  if ("away" in answer) {
    throw new Error(
      `${what}: the hub gave no answer but its being away or its own failure within ${HUB_AWAY_BOUND_MS / 1000} s (last: ${answer.away}).`
    );
  }
  return answer;
};
