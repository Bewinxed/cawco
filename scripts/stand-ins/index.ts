/**
 * What a scratch fleet's hub reaches in place of the world, as a spec sets
 * it on `fleet.standIns` before it launches the hub (scratch-fleet.ts). The
 * fleet hands it to each service it starts in {@link STAND_INS_ENV}, which
 * only this folder's preload reads (preload.ts): it runs the hub with
 * hub-upstreams.ts in place of the product's upstreams.ts, and with the
 * canvas page's binding shown to the probe (canvas-host-plugins.ts). No
 * product module reads any of it.
 */

/** The variable a fleet's services are handed their stand-ins in, as JSON. */
export const STAND_INS_ENV = "SCRATCH_FLEET_STAND_INS";

export interface StandIns {
  /** GitHub's REST API origin the hub's pollers, relay and publisher call: a fake one in the spec's process. */
  githubApi?: string;
  /** CawCo's GitHub OAuth app's client ID a code sign-in sends: one the spec's fake GitHub takes. */
  githubClientId?: string;
  /** GitHub's MCP server a `gh` connection the hub makes reaches: a fake one's `/mcp` in the spec's process. */
  githubMcp?: string;
  /** GitHub's site origin (device codes, the app manifest form, installations): a fake one in the spec's process. */
  githubWeb?: string;
  /** Linear's API origin the tracker sync and a Linear app's sign-in call: a fake one in the spec's process. */
  linearApi?: string;
  /**
   * How long a project's starters wait for quiet, and the least time
   * between two of its asks of Jev, in ms (hub project-starters.ts).
   */
  startersPace?: { gap: number; quiet: number };
  /** TypeSafe's System One URL Jev's typesafe route posts to: the probe kit's Jev mock (jev-mock.ts). */
  typesafeUrl?: string;
}

/** The stand-ins this process was handed; none outside a scratch fleet. */
export const standIns = (): StandIns =>
  JSON.parse(process.env[STAND_INS_ENV] ?? "{}") as StandIns;
