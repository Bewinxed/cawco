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
 * - A top-level navigation (`navigate`, GET or HEAD, not into a frame)
 *   passes from anywhere: a link from elsewhere, a sign-in coming back. It
 *   cannot read what it gets, and a frame of the dashboard is refused by its
 *   own `frame-ancestors 'self'`.
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

const FRAMED = new Set(["iframe", "frame", "object", "embed"]);

/** The headers a relay that passed the gate removes before it goes on: the hop behind it is not the page's origin. */
export const BROWSER_HEADERS = [
  "origin",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
] as const;
