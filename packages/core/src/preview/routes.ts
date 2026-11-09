/** How a preview origin is reached: its address, routes, cookies and the pass into it. */

import { onTailnet, type TailnetOrigin } from "../tailnet-https";

/** Where a page stands on the origin that serves it by id: a project's page on its project's origin, any page in the Decisions tab. */
export const projectPagePlace = (artifactId: string): string =>
  `/__cawco/page/${artifactId}/`;

/**
 * Where a session's preview is served, as the hub reports it: its own port,
 * which the hub listens on in either mode, and in host mode the whole origin
 * the fleet's pattern names it by too. Which one a client loads is its own
 * choice, by where it reached the hub ({@link previewRoute}).
 */
export interface PreviewAddress {
  /** Host mode's whole origin for the session. */
  origin?: string;
  /** The session's own preview port, listened on in either mode. */
  port: number;
  /**
   * The session's origin on the hub machine's tailnet name, while the hub
   * serves HTTPS there (core tailnet-https.ts): on the tailnet addresses the
   * port answers HTTPS alone.
   */
  tailnet?: TailnetOrigin;
}

/**
 * The domain host mode's names stand under: the origin's host name less its
 * first label (`p-3459.example.com` → `example.com`); empty for a one-label
 * name. The preview pass's cookie is set on it ({@link PREVIEW_PASS_COOKIE}),
 * so every name under it carries the one pass.
 */
export const hostModeDomain = (origin: string): string => {
  const name = new URL(origin).hostname.toLowerCase();
  const dot = name.indexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1);
};

/** Whether `hostname` is `domain` or a name under it, label by label. */
const under = (hostname: string, domain: string): boolean => {
  const name = hostname.toLowerCase();
  return !!domain && (name === domain || name.endsWith(`.${domain}`));
};

/**
 * Where a client loads a session's previews from, picked by where it
 * reached the hub or dashboard (`at`). Reached under host mode's domain
 * (the dashboard behind the same DNS or proxy as the pattern's names): the
 * origin the hub named, behind the browser's pass (`byHost`). Reached over the
 * tailnet while the hub serves HTTPS on its name (a tailnet address, the
 * short name, the full one): the session's origin on that name, since the
 * port answers HTTPS alone there; a client that reached the hub's own port
 * over plain http (the app) loads it too. Reached any other way (a LAN
 * address, `.local`, localhost): that host and scheme on the session's own
 * port. Every route is behind the browser's pass, entered with a ticket.
 * Null when the hub named nothing this client can load.
 */
export const previewRoute = (
  address: { origin?: string; port?: number; tailnet?: TailnetOrigin },
  at: { hostname: string; protocol: string }
): { origin: string; byHost: boolean } | null => {
  if (address.origin && under(at.hostname, hostModeDomain(address.origin))) {
    return { origin: address.origin, byHost: true };
  }
  if (address.tailnet && onTailnet(address.tailnet, at.hostname)) {
    return { origin: address.tailnet.origin, byHost: false };
  }
  if (address.port) {
    const host =
      at.hostname.includes(":") && !at.hostname.startsWith("[")
        ? `[${at.hostname}]`
        : at.hostname;
    return { origin: `${at.protocol}//${host}:${address.port}`, byHost: false };
  }
  return null;
};

/** The one path a preview origin answers with CORS and no credentials: the dashboard's reachability probe. */
export const PREVIEW_PING_PATH = "/__cawco/ping";

/**
 * What says the person's hand is on a page: a key, a pointer press or move, a
 * wheel, a touch. The dashboard hears them on its own window (reload.svelte.ts)
 * and a previewed page's overlay on the page's (preview overlay/page.ts).
 */
export const PERSONS_INPUT = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
] as const;

/**
 * An input of {@link PERSONS_INPUT} the person made. A browser sends a move of
 * none to the element under a resting cursor when the page moves under it (a
 * streaming reply, a scroll), and that is no one's hand. Our call.
 */
export const personsInput = (event: Event): boolean =>
  event.isTrusted &&
  (event.type !== "pointermove" ||
    (event as PointerEvent).movementX !== 0 ||
    (event as PointerEvent).movementY !== 0);

/**
 * A previewed page's overlay to its host: the person's hand is on the page.
 * Input in a frame of another origin never reaches the page around it, and a
 * preview is never the dashboard's origin, so this is how a dashboard hears it.
 */
export const PAGE_TOUCHED_MESSAGE = "cawco:touched";

/** Where every previewed page loads the overlay from, on its own origin (preview proxy.ts `injectOverlay`). */
export const OVERLAY_PATH = "/__cawco/overlay.js";

/**
 * Where a page on a preview origin sends its errors (a decision page's host,
 * dashboard lib/cawco/error-report.ts): the hub's own path there, answered as
 * its `/api/dashboard-errors` is (hub dashboard-errors.ts), since every path
 * outside `/__cawco/` on a preview origin is the previewed page's.
 */
export const PREVIEW_ERRORS_PATH = "/__cawco/errors";

/**
 * The way into a preview (hub preview-access.ts). Every request to a
 * preview origin, a host-mode name or an origin's own port, needs the
 * browser's pass ({@link PREVIEW_PASS_COOKIE}, {@link PREVIEW_PORT_PASS_COOKIE}),
 * but for {@link PREVIEW_PING_PATH} and this path. A client the hub already
 * trusts (the dashboard through its relay, the app with its credential) asks
 * the hub for a ticket (`POST /api/preview-ticket`, a {@link PreviewTicket})
 * and opens `<origin>/__cawco/enter?ticket=…` ({@link previewEnterUrl}) on
 * any name the hub serves: the hub spends the ticket and sets the pass, then
 * sends the client on to `next` when it names one.
 */
export const PREVIEW_ENTER_PATH = "/__cawco/enter";

/** What a preview origin answers without a pass: the page says so to its parent as this, so the frame's host enters again. */
export const PREVIEW_LOCKED_MESSAGE = "cawco:locked";

/**
 * Host mode's pass: one cookie per browser, set on the domain the names
 * stand under ({@link hostModeDomain}), so every preview, embed and asset
 * there carries it. `__Secure-`, never `__Host-`: a cookie with a `Domain`
 * can't carry `__Host-` (RFC 6265bis §5.7 step 21).
 */
export const PREVIEW_PASS_COOKIE = "__Secure-cawco-pass";

/**
 * The same pass on a preview origin's own port reached over plain http (a
 * LAN address, localhost), where no browser keeps a `Secure` cookie: set on
 * that host alone, which every port of it carries (RFC 6265 §8.5), so one
 * entry opens every preview port the host serves. Over https a port takes
 * {@link PREVIEW_PASS_COOKIE}, on its host alone.
 */
export const PREVIEW_PORT_PASS_COOKIE = "cawco-preview-pass";

/** A ticket into the previews for the device or browser that asked: single-use, and spent by `expiresAt` (ms epoch). */
export interface PreviewTicket {
  expiresAt: number;
  ticket: string;
}

/**
 * Where a client spends `ticket` on a preview `origin`: sent on to
 * `place` (a path there) when it names one, else answered with the pass
 * alone.
 */
export const previewEnterUrl = (
  origin: string,
  ticket: string,
  place?: string
): string =>
  `${origin}${PREVIEW_ENTER_PATH}?ticket=${encodeURIComponent(ticket)}${place === undefined ? "" : `&next=${encodeURIComponent(place)}`}`;

/**
 * `place` (a path on a preview origin, with its query and hash) at a state's
 * own `link`, `artifact_read`'s `state` for a preview or a page: the link's
 * query merged into the place's, each key it names set, and its hash in the
 * place's stead. A state-machine preview's link is `?__state=<value>` or
 * `?__state=<group>:<value>,…` (its state-switcher.js writes it this way).
 */
export const placeAtLink = (place: string, link: string): string => {
  const base = "http://place.invalid";
  const at = new URL(place, base);
  const asked = new URL(link, at);
  for (const [key, value] of asked.searchParams) {
    at.searchParams.set(key, value);
  }
  if (asked.hash) {
    at.hash = asked.hash;
  }
  return `${at.pathname}${at.search}${at.hash}`;
};

/**
 * The dashboard's own cookies, by name: every one it sets is `cawco-…`,
 * `__Host-`- or `__Secure-`-prefixed where the scheme allows. A preview
 * listener shares the dashboard's host in port mode, and cookies are not
 * isolated by port (RFC 6265 §8.5), so it strips these from what the
 * previewed app is sent and drops any the app tries to set; the preview
 * passes ({@link PREVIEW_PASS_COOKIE}, {@link PREVIEW_PORT_PASS_COOKIE}) are
 * among them.
 */
export const DASHBOARD_COOKIE = /^(?:__Host-|__Secure-)?cawco-/u;

/**
 * How previews are reached, fleet-wide (Settings › Previews, Caw's
 * `admin_previews_write`): `port`, one port per session from the hub's range,
 * which needs no setup; or `host`, an origin per session from `pattern`
 * (`https://`, then a host name whose first label holds `{session}`, standing
 * for the session's id, or `{port}`, for the preview port it keeps, so one
 * name per port of the range serves every session), for a fleet behind DNS
 * or a proxy that routes them to the hub's first preview port. `passDomain`:
 * the domain the names stand under, which the browser's pass is set on
 * ({@link PREVIEW_PASS_COOKIE}).
 */
export type PreviewSettings =
  | { mode: "port"; ports: string }
  | { mode: "host"; pattern: string; passDomain: string; ports: string };
