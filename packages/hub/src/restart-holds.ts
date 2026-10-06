/**
 * The CawCo tool calls this hub is answering, from any machine: what a restart
 * of the hub would cut. Every harness reaches `/mcp/cawco` (directly on the
 * hub's machine, through its agent's gateway elsewhere), and a restart drops
 * every call held open there, up to a day long. The hub's machine reads this
 * before its update restarts the hub, and raises the fence below for the
 * moment between its last look and the restart.
 *
 * A call to a tool the hub finishes by itself ({@link RESUMABLE_CAWCO_TOOLS})
 * holds nothing and is never refused.
 */
import {
  HUB_RESTARTING,
  RESUMABLE_CAWCO_TOOLS,
  type RestartReadiness,
} from "@cawco/core/binary-updates";

const calls = new Map<symbol, string>();
/** Until when new calls a restart would cut are refused; past it, none are. */
let fenceUntil = 0;

/** The most a fence may stand without being raised again. */
const FENCE_CAP_MS = 15 * 60_000;

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
  if (Date.now() < fenceUntil) {
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
    fenced: Date.now() < fenceUntil,
  };
}

/** Raises the fence for `ms` from now (0 lowers it), then says what still holds. */
export function fenceHub(ms: number): RestartReadiness & { fenced: boolean } {
  fenceUntil = ms > 0 ? Date.now() + Math.min(ms, FENCE_CAP_MS) : 0;
  return hubRestartReadiness();
}
