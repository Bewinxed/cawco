import { readWithin } from "@cawco/core/bounded";

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
export const isHubAway = (status: number): boolean => AWAY.has(status);

/**
 * `tryOnce`'s first response that is not the hub away ({@link isHubAway}),
 * whatever its status, for the caller to read; the last reason the hub was
 * away once {@link HUB_AWAY_BOUND_MS} from the first try has passed, or once
 * `stopped` is aborted (the asker gave up). `tryOnce` throws when no answer
 * came (refused, reset, none within its own bound). Tries every 0.5 s
 * doubling to 5 s; a wait that ran late (this process held) moves the bound
 * out by as much.
 */
export const throughHubAway = async (
  tryOnce: () => Promise<Response>,
  stopped?: AbortSignal
): Promise<Response | { away: string }> => {
  // The bound is the hub's to use: time this process was held (a wait
  // that ran late) is given back, so a loop blocked here never spends it.
  let deadline = Date.now() + HUB_AWAY_BOUND_MS;
  let wait = 500;
  for (;;) {
    let away: string;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one try at a time, the next only once this one found the hub away
      const answer = await tryOnce();
      if (!isHubAway(answer.status)) {
        return answer;
      }
      await answer.body?.cancel();
      away = `HTTP ${answer.status}`;
    } catch (error) {
      away =
        error instanceof Error ? error.message || error.name : String(error);
    }
    if (stopped?.aborted || Date.now() + wait >= deadline) {
      return { away };
    }
    const slept = Date.now();
    await Bun.sleep(wait);
    deadline += Math.max(0, Date.now() - slept - wait);
    wait = Math.min(wait * 2, 5000);
  }
};

/**
 * The hub's answer to `url` ({@link throughHubAway}), each try bounded by
 * `tryMs`; throws `what` with the last reason the hub was away. Only for
 * requests the hub takes twice as once (an ACK of what it holds answers
 * `installed`; a read).
 */
export const hubAnswer = async (
  url: string,
  init: Omit<RequestInit, "signal">,
  tryMs: number,
  what: string
): Promise<Response> => {
  const answer = await throughHubAway(async () => {
    const tried = await readWithin(tryMs, (signal) =>
      fetch(url, { ...init, signal })
    );
    if (tried.kind === "unanswered") {
      throw new Error(`no answer within ${tryMs / 1000} s`);
    }
    return tried.value;
  });
  if ("away" in answer) {
    throw new Error(
      `${what}: the hub did not answer within ${HUB_AWAY_BOUND_MS / 1000} s (last: ${answer.away}).`
    );
  }
  return answer;
};
