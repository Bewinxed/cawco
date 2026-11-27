/**
 * The CawCo tool calls this hub is answering, from any machine: what a restart
 * of the hub would cut. Every harness reaches `/mcp/cawco` through its
 * machine's agent gateway, and a restart drops
 * every call held open there, up to a day long. The hub's machine reads this
 * before its update restarts the hub, and holds the fence below up from its
 * last look until the restart: it raises it, then renews it on each of its
 * beats, and the fence falls one quiet spell (`QUIET_MS`) after the last, so
 * an update whose agent died cannot leave it up.
 *
 * A call to a tool the hub finishes by itself ({@link RESUMABLE_CAWCO_TOOLS})
 * holds nothing and is never refused.
 */
import {
  HUB_RESTARTING,
  RESUMABLE_CAWCO_TOOLS,
  type RestartReadiness,
} from "@cawco/core/binary-updates";
import { QUIET_MS } from "@cawco/core/bounded";

const calls = new Map<symbol, string>();
/** When the fence was last raised (`performance.now()`: awake time), while it is up. */
let raisedAt: number | undefined;

/** Whether the fence stands: raised, and raised again within the last quiet spell. */
const fenceStands = (): boolean => {
  if (raisedAt !== undefined && performance.now() - raisedAt >= QUIET_MS) {
    raisedAt = undefined;
  }
  return raisedAt !== undefined;
};

/**
 * Admits one call to `tool` for `actor`: the release to call when it has
 * answered, or the refusal when the fence stands.
 */
export function admitToolCall(
  tool: string,
  actor: string
): { release: () => void } | { refused: string } {
  if (RESUMABLE_CAWCO_TOOLS.has(tool)) {
    return { release: () => undefined };
  }
  if (fenceStands()) {
    return { refused: HUB_RESTARTING };
  }
  const key = Symbol(tool);
  calls.set(key, `${tool}:${actor}`);
  return {
    release: () => {
      calls.delete(key);
    },
  };
}

export function hubRestartReadiness(): RestartReadiness & { fenced: boolean } {
  const ids = [...calls.values()];
  return {
    ready: ids.length === 0,
    holds: ids.length ? [{ reason: "hub-tool-call", ids }] : [],
    fenced: fenceStands(),
  };
}

/**
 * Moves the fence, then says what still holds: `raise` puts it up, `renew`
 * raises it again only while it stands (a beat sent to the hub before its
 * restart and read by the hub after it puts up nothing), `lower` takes it
 * down.
 */
export function fenceHub(
  fence: "raise" | "renew" | "lower"
): RestartReadiness & { fenced: boolean } {
  if (fence === "raise" || (fence === "renew" && fenceStands())) {
    raisedAt = performance.now();
  } else if (fence === "lower") {
    raisedAt = undefined;
  }
  return hubRestartReadiness();
}
