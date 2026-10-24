/**
 * What the hub reaches outside the fleet, and how often a project's starters
 * ask Jev: the product's own values, the one place they are written. A
 * scratch fleet's hub runs the probe kit's stand-ins in this module's place
 * (scripts/scratch-fleet-stand-ins.ts); no installed hub can.
 */

import { CONNECTION_SERVICES } from "@cawco/core";

/** GitHub's REST API, which the pollers, the relay and the publisher call. */
export const GITHUB_API = "https://api.github.com";

/**
 * GitHub's own site: a code sign-in's `/login/device/code` and
 * `/login/oauth/access_token`, the manifest form a GitHub App is registered
 * through (`/settings/apps/new`), and an app's installation page.
 */
export const GITHUB_WEB = "https://github.com";

/**
 * CawCo's own GitHub OAuth app, which every hub's code sign-in goes through:
 * its client ID, public by design ("The `client_secret` is not needed for
 * the device flow", docs.github.com, authorizing OAuth apps). Empty until the
 * app is registered once on GitHub with device flow enabled; while it is, a
 * code sign-in says so and the other ways stand.
 */
export const GITHUB_DEVICE_CLIENT_ID: string = "";

/** GitHub's MCP server, which a `gh` connection the hub makes reaches: the one Sign in to GitHub's ways name (core `CONNECTION_SERVICES`). */
export const GITHUB_MCP =
  CONNECTION_SERVICES.find((one) => one.service === "github")?.url ?? "";

/**
 * Linear's API: its `/graphql`, which the tracker sync calls, and its
 * `/oauth/token`, which a Linear app's sign-in calls.
 */
export const LINEAR_API = "https://api.linear.app";

/** TypeSafe's System One, which Jev's typesafe route posts to. */
export const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";

/** Quiet before a project's starters are written: 60 s with no other ask. */
export const STARTERS_QUIET_MS = 60_000;

/** The least time between two of one project's asks of Jev: 10 min. */
export const STARTERS_GAP_MS = 600_000;
