/**
 * The values the server renders the first paint from: the rail's width, the
 * last narrow-or-wide, the config page's card heights, and the workspace's
 * layout and its sessions' places. The page keeps each in its own
 * localStorage, which is its source; the server's copy is a cookie only the
 * server writes and reads (`/prefs`, HttpOnly), so no page script reads or
 * writes one. A previewed app shares this host in port mode, and cookies are
 * not isolated by port (RFC 6265 §8.5): it can neither read these nor
 * overwrite them, and the hub's preview listener strips them on the way in.
 */
export const PREFS = [
  "cawco-rail-width",
  "cawco-narrow",
  "cawco-config-cards",
  "cawco-workspace",
  "cawco-workspace-ctx",
] as const;
export type Pref = (typeof PREFS)[number];

/** A year: these are preferences, kept until changed. */
export const PREF_MAX_AGE = 31_536_000;

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

/** Values to keep for the next server render, at once, past the page's own end (`keepalive`). */
export function keepPrefs(values: Partial<Record<Pref, string>>): void {
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
