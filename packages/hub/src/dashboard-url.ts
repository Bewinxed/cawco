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
 * In precedence order: the operator's override, then the last origin observed
 * (loopback and unparseable ones already discarded by the registry), then a URL
 * composed from this machine's hostname — the best guess available on a hub no
 * dashboard has ever connected to, and better than no link at all.
 */
export const dashboardUrl = (registry: RegistryShape): string =>
  DASHBOARD_URL_OVERRIDE ??
  registry.dashboardOrigin() ??
  `http://${hostname()}:${DASHBOARD_PORT}`;

/**
 * The dashboard's https address, or null when none is known: where a sign-in
 * that may only return over https (OpenRouter's OAuth callback, which takes
 * "https URLs and localhost/127.0.0.1 URLs") sends the person back to. The
 * operator's override when it is https, else the last https origin a
 * dashboard connected from. Never composed: an https address the hub only
 * guessed would send the sign-in somewhere nothing answers.
 */
export const secureDashboardUrl = (registry: RegistryShape): string | null =>
  (DASHBOARD_URL_OVERRIDE?.startsWith("https://")
    ? DASHBOARD_URL_OVERRIDE
    : undefined) ??
  registry.secureDashboardOrigin() ??
  null;
