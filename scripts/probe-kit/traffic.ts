/**
 * What a page loads and opens, for the specs that hold a bare route to
 * loading only what it needs (artifact-tab: an artifact in its own tab;
 * views: one custom view, what the iOS app's web view loads). The owner:
 * "an artifact shouldn't load anything that is not needed for the
 * preview/artifact, no unnecessary connections etc".
 *
 * - {@link watchTraffic} records every request and WebSocket a page makes,
 *   and the JS it transferred, from its first request.
 * - {@link strayTraffic} names each one off the route's allow-list: the
 *   route's rules, plus its build's files and, on the dev server, Vite's own
 *   module URLs and HMR socket. A request a child frame makes (a preview's
 *   page) is that frame's own and never stray.
 * - {@link APP_MODULE} names a source file only the app around a page uses,
 *   which a bare route on the dev server must never fetch.
 */
import type { Page } from "playwright-core";

/**
 * A source file only the app around a page uses: the Shell and what it
 * mounts, the session surface and its panes, the fleet store
 * (client.svelte.ts) and the app's upkeep, and anything under transcript/
 * or workspace/.
 */
export const APP_MODULE =
  /\/lib\/cawco\/(?:Shell|Sidebar|SessionSurface|SessionPane|ThreadPane|NeedsCaw|MachinesButton|GlassCard|CawPanel|client)\.svelte|\/lib\/cawco\/(?:transcript|workspace|updates|tab-icon)\/|\/lib\/cawco\/motion\/rest\./;

/** The build's own files: JS, CSS, fonts, the tab's icon. */
const BUILD_FILE = /^GET \/_app\//;
const VITE_MODULE =
  /^GET \/(?:@vite\/|@fs\/|@id\/|node_modules\/|src\/|\.svelte-kit\/)/;
const VITE_HMR = /^\/\?token=/;
/** A socket's origin as the page's: `ws:`/`wss:` for `http:`/`https:`. */
const WS_SCHEME = /^ws/;
const NOT_AN_ID = /[^0-9A-Za-z_-]/g;

/** An id or name as it stands in a rule: nothing a RegExp reads as syntax. */
export const literal = (value: string): string => value.replace(NOT_AN_ID, "");

export interface Traffic {
  /** The JS transferred, in files and KB. */
  bytes: () => Promise<{ files: number; kb: number }>;
  /** Each request, as `METHOD /path`, its origin, and whether a child frame made it. */
  requests: { framed: boolean; line: string; origin: string }[];
  /** The path of each script fetched. */
  scripts: string[];
  /** Each WebSocket, as `/path?query`, and its origin. */
  sockets: { line: string; origin: string }[];
}

export const watchTraffic = (page: Page): Traffic => {
  const sizes: Promise<number>[] = [];
  const traffic: Traffic = {
    requests: [],
    sockets: [],
    scripts: [],
    bytes: async () => {
      const all = await Promise.all(sizes);
      return {
        files: all.length,
        kb: Math.round(all.reduce((a, b) => a + b, 0) / 1024),
      };
    },
  };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }
    traffic.requests.push({
      line: `${request.method()} ${url.pathname}`,
      origin: url.origin,
      framed: request.frame() !== page.mainFrame(),
    });
    if (request.resourceType() === "script") {
      traffic.scripts.push(url.pathname);
    }
  });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    traffic.sockets.push({
      line: `${url.pathname}${url.search}`,
      origin: url.origin,
    });
  });
  page.on("requestfinished", (request) => {
    if (request.resourceType() === "script") {
      sizes.push(
        request.sizes().then((s) => s.responseBodySize + s.responseHeadersSize)
      );
    }
  });
  return traffic;
};

/** Every request and socket of `seen` off the allow-list, and the sockets it opened. */
export const strayTraffic = (
  seen: Traffic,
  where: {
    base: string;
    dev: boolean;
    /** The preview origins the tab shows: anything on one is the preview's own. */
    previews?: string[];
    requests: RegExp[];
    sockets: RegExp[];
  }
): { sockets: string[]; strays: string[] } => {
  const { origin } = new URL(where.base);
  const previews = new Set(where.previews ?? []);
  const requests = [
    BUILD_FILE,
    ...where.requests,
    ...(where.dev ? [VITE_MODULE] : []),
  ];
  const sockets = [...where.sockets, ...(where.dev ? [VITE_HMR] : [])];
  const strayRequests = seen.requests
    .filter(
      (one) =>
        !(one.framed || previews.has(one.origin)) &&
        (one.origin !== origin || !requests.some((rule) => rule.test(one.line)))
    )
    .map((one) =>
      one.origin === origin ? one.line : `${one.origin}${one.line}`
    );
  const straySockets = seen.sockets
    .filter((one) => {
      const at = one.origin.replace(WS_SCHEME, "http");
      return (
        !previews.has(at) &&
        (at !== origin || !sockets.some((rule) => rule.test(one.line)))
      );
    })
    .map((one) => `WS ${one.line}`);
  return {
    strays: [...new Set([...strayRequests, ...straySockets])],
    sockets: [...new Set(seen.sockets.map((one) => one.line))],
  };
};
