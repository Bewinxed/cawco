/**
 * The values the server renders the first paint from: the rail's width, the
 * last narrow-or-wide, the config page's card heights, the workspace's
 * layout and its sessions' places, and the folder tabs' measured shapes
 * (fluid-tabs/fold-memory.ts). The page keeps each in its own
 * localStorage, which is its source; the server's copy is a cookie only the
 * server writes and reads (`/prefs`, HttpOnly), so no page script reads or
 * writes one. A previewed app shares this host in port mode, and cookies are
 * not isolated by port (RFC 6265 §8.5): it can neither read these nor
 * overwrite them, and the hub's preview listener strips them on the way in.
 */
export const RAIL_PREF = "cawco-rail-width";
export const NARROW_PREF = "cawco-narrow";
export const CONFIG_CARDS_PREF = "cawco-config-cards";
/**
 * The server's copy of the workspace localStorage keeps (workspace.svelte.ts,
 * Persistence): the whole tree or none, never a part. The first client render
 * draws from what the app's layout load gives it, so hydration keeps what was served.
 * Read with the tree's own module (workspace/tree.ts), which the server
 * imports without the client store and its module-level `$state`.
 */
export const WORKSPACE_PREF = "cawco-workspace";
/** The addresses of what the workspace's tree holds, kept apart from it. */
export const WORKSPACE_CTX_PREF = "cawco-workspace-ctx";
export const FOLD_BOXES_PREF = "cawco-tab-boxes";
export const PREFS = [
  RAIL_PREF,
  NARROW_PREF,
  CONFIG_CARDS_PREF,
  WORKSPACE_PREF,
  WORKSPACE_CTX_PREF,
  FOLD_BOXES_PREF,
] as const;
export type Pref = (typeof PREFS)[number];

/** A year: these are preferences, kept until changed. */
export const PREF_MAX_AGE = 31_536_000;

/**
 * The most a pref's value may come to, URI-encoded: a browser keeps no
 * cookie past 4096 bytes, name and value together.
 */
export const PREF_VALUE_LIMIT = 3800;

/**
 * A value as the server's copy is kept: itself where it fits a cookie, else
 * `null`, which takes the copy away. A copy that cannot follow the page is
 * absent, never an older one standing in for it.
 */
export const asPref = (value: string): string | null =>
  encodeURIComponent(value).length > PREF_VALUE_LIMIT ? null : value;

/**
 * The cookie a pref is kept under: `__Host-`-prefixed where the scheme lets
 * it be Secure (https, and http on `localhost`), so nothing on another path
 * or a parent domain can set one in its place.
 */
export const prefCookie = (
  pref: Pref,
  url: { hostname: string; protocol: string }
): string => (secureScheme(url) ? `__Host-${pref}` : pref);

export const secureScheme = (url: { hostname: string; protocol: string }) =>
  url.protocol === "https:" || url.hostname === "localhost";

/** Values to keep for the next server render (`null` keeps none), at once, past the page's own end (`keepalive`). */
export function keepPrefs(values: Partial<Record<Pref, string | null>>): void {
  fetch("/prefs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
    keepalive: true,
  }).catch(() => {
    // Not kept: the next render starts from the defaults, and the page
    // from its own localStorage.
  });
}
