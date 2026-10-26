import { hostname } from "node:os";
// The port the dashboard is served on, for the composed fallback below.
import { DASHBOARD_PORT } from "./config";
import type { RegistryShape } from "./registry";

/**
 * The explicit answer, for a hub whose public URL it cannot see: behind a
 * reverse proxy or a tunnel, the origin a browser used is the proxy's, not the
 * one the operator wants in a link.
 */
const DASHBOARD_URL_OVERRIDE = Bun.env.CAWCO_DASHBOARD_URL;

/**
 * The dashboard's address on the hub machine's tailnet name while the hub
 * serves HTTPS there (tailnet-https.ts), else null: what every device on the
 * tailnet opens in a secure context.
 */
let tailnetDashboard: string | null = null;

/** HTTPS on the tailnet name began (its dashboard address) or stopped (null). */
export const noteTailnetDashboard = (url: string | null): void => {
  tailnetDashboard = url;
};

/**
 * The dashboard's address a browser off the hub's machine opens, or null
 * when the hub knows none: {@link dashboardUrl} without its guess. A
 * delegate's browser runs in a container (agent browser/container-host.ts),
 * whose loopback is its own, so it is told this address, never 127.0.0.1
 * (work-items.ts, core injected.ts `withDashboardLine`). The guess is no
 * such address: a hostname the container's resolver may not know.
 */
export const reachableDashboardUrl = (registry: RegistryShape): string | null =>
  DASHBOARD_URL_OVERRIDE ??
  tailnetDashboard ??
  registry.dashboardOrigin() ??
  null;

/**
 * Where a link the hub hands out (a session's page, the app's web dashboard)
 * sends the reader.
 *
 * Observed rather than configured, because a hub cannot know its own
 * externally-reachable address: it may be reached by tailnet name, by LAN
 * address, through a container's published port or a proxy, and nothing in its
 * own environment distinguishes those. But it is the thing dashboards connect
 * TO — so rather than being told an address, it watches one arrive. Every
 * dashboard websocket carries the `Origin` its browser reached the hub from,
 * which is by construction a URL that worked for a real client, which is
 * exactly the property a link sent to a phone needs.
 *
 * In precedence order: the operator's override, then the tailnet name's https
 * address while the hub serves it (a link that opens in a secure context on
 * every device of the tailnet), then the last origin observed (loopback and
 * unparseable ones already discarded by the registry), then a URL composed
 * from this machine's hostname — the best guess available on a hub no
 * dashboard has ever connected to, and better than no link at all.
 */
export const dashboardUrl = (registry: RegistryShape): string =>
  reachableDashboardUrl(registry) ?? `http://${hostname()}:${DASHBOARD_PORT}`;

/**
 * The dashboard's https address, or null when none is known: where a sign-in
 * that may only return over https (OpenRouter's OAuth callback, which takes
 * "https URLs and localhost/127.0.0.1 URLs") sends the person back to. The
 * operator's override when it is https, else the tailnet name's while the
 * hub serves it, else the last https origin a dashboard connected from.
 * Never composed: an https address the hub only guessed would send the
 * sign-in somewhere nothing answers.
 */
export const secureDashboardUrl = (registry: RegistryShape): string | null =>
  (DASHBOARD_URL_OVERRIDE?.startsWith("https://")
    ? DASHBOARD_URL_OVERRIDE
    : undefined) ??
  tailnetDashboard ??
  registry.secureDashboardOrigin() ??
  null;
