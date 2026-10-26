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

/** An IPv6 host's brackets, as `URL.hostname` keeps them. */
const IPV6_BRACKETS = /^\[|\]$/gu;

/** The names that are the delegate's browser's own machine, not the hub's. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

/** HTTPS on the tailnet name began (its dashboard address) or stopped (null). */
export const noteTailnetDashboard = (url: string | null): void => {
  tailnetDashboard = url;
};

/**
 * Where a delegate's browser opens the dashboard (core injected.ts
 * `withDashboardLine`). That browser runs in a container (agent
 * browser/container-host.ts) whose loopback is its own, and it signs in to
 * nothing: an address in front of the hub (a tunnel behind an access gate,
 * the operator's {@link DASHBOARD_URL_OVERRIDE}) may stop it at a sign-in
 * page. So it is told, in order:
 * - `own`: an address on the hub machine's own names, which nothing stands
 *   in front of: the tailnet name's https address while the hub serves it,
 *   else the newest origin a dashboard reached the hub from whose host is
 *   one of `ownNames` (its LAN or tailnet address, its hostname);
 * - `elsewhere`: when it knows none, the override or the newest origin
 *   observed, an address the person opens that may not open for it;
 * - `none`: no address at all. The hostname guess {@link dashboardUrl}
 *   falls back to is never one: the container's resolver may not know it.
 */
export const delegateDashboard = (
  registry: RegistryShape,
  ownNames: readonly string[]
): { kind: "own" | "elsewhere"; url: string } | { kind: "none" } => {
  const own = new Set(
    ownNames
      .map((name) => name.toLowerCase())
      .filter((name) => !LOOPBACK.has(name))
  );
  const onOwnName = [DASHBOARD_URL_OVERRIDE, ...registry.dashboardOrigins()]
    .filter((one): one is string => one !== undefined && URL.canParse(one))
    .find((one) =>
      own.has(new URL(one).hostname.replace(IPV6_BRACKETS, "").toLowerCase())
    );
  const ownUrl = tailnetDashboard ?? onOwnName;
  if (ownUrl) {
    return { kind: "own", url: ownUrl };
  }
  const elsewhere = DASHBOARD_URL_OVERRIDE ?? registry.dashboardOrigins()[0];
  return elsewhere ? { kind: "elsewhere", url: elsewhere } : { kind: "none" };
};

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
  DASHBOARD_URL_OVERRIDE ??
  tailnetDashboard ??
  registry.dashboardOrigins()[0] ??
  `http://${hostname()}:${DASHBOARD_PORT}`;

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
