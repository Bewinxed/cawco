/**
 * THE HUB AWAY IS NO ANSWER. What a session's start asks of the hub over
 * HTTP (its credential's ACK, session-identity.ts; pi's tool list,
 * delegation.ts `delegationTools`) is decided by the hub's answer, never by
 * the hub not being there to give one: a restart refuses the connection, a
 * gateway that cannot reach the hub answers 502, a hub stalled under a burst
 * of launches answers nothing within a try's bound. Each is waited through
 * until {@link HUB_AWAY_BOUND_MS} from the first try. Before this, a launch
 * that met a deploy's restart at either step failed at once.
 */

/**
 * How long a session's start waits for the hub through its being away. The
 * credential gate's every step that needs the hub (the slot's connect,
 * claude.ts `#connectedCawcoSnapshot`; the ACK; pi's tool list) waits this
 * long from its first try. Ours: the bound the launch's ask for its
 * credential already has (core handover.ts `CUSTODY_BOUND_MS`, 90 s), three times
 * the 30.5 s hub outage measured on 2026-10-09.
 */
export const HUB_AWAY_BOUND_MS = 90_000;

/** Statuses that say the hub is not there to answer, rather than that it answered. */
const AWAY = new Set([502, 503, 504]);

/**
 * The hub's answer to `url`: the first response that is not the hub away,
 * whatever its status, for the caller to read. Tries every 0.5 s doubling to
 * 5 s, each bounded by `tryMs`; at {@link HUB_AWAY_BOUND_MS} throws `what`
 * with the last reason the hub was away. Only for requests the hub takes
 * twice as once (an ACK of what it holds answers `installed`; a read).
 */
export const hubAnswer = async (
  url: string,
  init: Omit<RequestInit, "signal">,
  tryMs: number,
  what: string
): Promise<Response> => {
  const deadline = Date.now() + HUB_AWAY_BOUND_MS;
  let wait = 500;
  for (;;) {
    let away: string;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one try at a time, the next only once this one found the hub away
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(tryMs),
      });
      if (!AWAY.has(response.status)) {
        return response;
      }
      away = `HTTP ${response.status}`;
    } catch (error) {
      // Refused, reset or timed out: no answer from the hub.
      away =
        error instanceof Error ? error.message || error.name : String(error);
    }
    if (Date.now() + wait >= deadline) {
      throw new Error(
        `${what}: the hub did not answer within ${HUB_AWAY_BOUND_MS / 1000} s (last: ${away}).`
      );
    }
    await Bun.sleep(wait);
    wait = Math.min(wait * 2, 5000);
  }
};
