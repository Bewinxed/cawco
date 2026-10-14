/**
 * The gate every API and socket request to the hub and the dashboard passes
 * (fetch metadata, https://w3c.github.io/webappsec-fetch-metadata/): a page
 * on any other origin, a previewed app on its own port of the same host
 * above all (`same-site`), may not call them with the browser's cookies.
 *
 * - `Sec-Fetch-Site` same-origin or none passes; same-site and cross-site
 *   are refused. A client that is no browser (the Apple app's URLSession,
 *   the CLI, a machine's agent) sends none and passes.
 * - An `Origin`, when present, must be the server's own, port included.
 * - A navigation (`navigate`, GET or HEAD, never into an object or embed)
 *   passes from anywhere: a link from elsewhere, a sign-in coming back, a
 *   previewed copy of the dashboard loading in a pane. It cannot read what
 *   it gets, and where the dashboard may be framed is its own
 *   `frame-ancestors 'self'` to say.
 *
 * Answers why a request is refused, or null.
 */
export function crossSiteRefusal(
  method: string,
  header: (name: string) => string | null | undefined,
  ownOrigin: string
): string | null {
  const site = header("sec-fetch-site");
  const dest = header("sec-fetch-dest");
  const navigation =
    header("sec-fetch-mode") === "navigate" &&
    (method === "GET" || method === "HEAD") &&
    !(dest && FRAMED.has(dest));
  if (navigation) {
    return null;
  }
  if (site && site !== "same-origin" && site !== "none") {
    return `a ${site} request`;
  }
  const origin = header("origin");
  if (origin && origin !== ownOrigin) {
    return `a request from ${origin}`;
  }
  return null;
}

/** Where a navigation's document may run a plugin's: never let through. */
const FRAMED = new Set(["object", "embed"]);

/**
 * What a relay that passed the gate tells the hub instead of `Origin`: the
 * page's origin, which it read and found its own. The hub learns from it
 * where its dashboard is reached (the origins that may frame a preview, the
 * dashboard address a sign-in comes back to). A page can't set it: a
 * browser puts no header of a page's on a WebSocket, and a fetch carrying
 * one from another origin is preflighted, which nothing here answers.
 */
export const PAGE_ORIGIN_HEADER = "x-cawco-page-origin";

/** The origin of the page behind a request: its relay's word, else the browser's own `Origin` when it reached the hub directly. */
export const pageOrigin = (
  headers: Record<string, string | undefined>
): string | undefined => headers[PAGE_ORIGIN_HEADER] ?? headers.origin;

/** The headers a relay that passed the gate removes before it goes on: the hop behind it is not the page's origin. */
export const BROWSER_HEADERS = [
  "origin",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
] as const;
