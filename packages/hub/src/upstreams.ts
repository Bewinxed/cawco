/**
 * What the hub reaches outside the fleet, and how often a project's starters
 * ask Jev: the product's own values, the one place they are written. A
 * scratch fleet's hub runs the probe kit's stand-ins in this module's place
 * (scripts/scratch-fleet-stand-ins.ts); no installed hub can.
 */

/** GitHub's REST API, which the pollers, the relay and the publisher call. */
export const GITHUB_API = "https://api.github.com";

/** TypeSafe's System One, which Jev's typesafe route posts to. */
export const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";

/** Quiet before a project's starters are written: 60 s with no other ask. */
export const STARTERS_QUIET_MS = 60_000;

/** The least time between two of one project's asks of Jev: 10 min. */
export const STARTERS_GAP_MS = 600_000;
