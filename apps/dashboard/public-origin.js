/**
 * The origin the browser reached this dashboard at: the one derivation every
 * check of "is this the dashboard's own page" and every report of "where the
 * dashboard is reached" reads, in serve.js (adapter-node's scheme and host for
 * SvelteKit's CSRF check and the hooks gate; the `/ws` relay's gate; the page
 * origin the relay tells the hub) and in vite.config.ts (the dev and preview
 * servers' `/ws` relay).
 *
 * Direct access is plain HTTP at `Host`. A proxy in front (a TLS terminator, a
 * tunnel, an auth gate) forwards the browser's scheme and host: RFC 7239
 * `Forwarded` first, then `X-Forwarded-Proto` and `X-Forwarded-Host`, the
 * first hop of each. A proxy that names no scheme leaves http: this server
 * never speaks TLS itself, so http is what a request with no proxy word in it
 * arrived as; a TLS proxy that leaves the scheme out gets its page's
 * `https://` Origin refused by name, never a guess that breaks every direct
 * http access.
 *
 * Trusting these headers keeps the gate whole: a page of another site can
 * set none of them on its request, and its own Origin still differs from what
 * they say.
 *
 * Plain JavaScript: serve.js runs under node, which loads it as it is.
 */

// RFC 7239 permits quoted values and case-insensitive parameter names. Commas
// inside quoted extension values belong to the first element, not the next hop.
const FIRST_FORWARDED_ELEMENT = /^(?:[^",]|"(?:\\.|[^"\\])*")*/;
const FORWARDED_PARAMETER =
  /(?:^|;)\s*([!#$%&'*+.^_`|~0-9a-z-]+)\s*=\s*("(?:\\.|[^"\\])*"|[^;\s]+)\s*(?=;|$)/gi;
const QUOTED_PAIR = /\\(.)/g;

/** A header's one value, as node gives a repeated one (an array) or joins it. */
const one = (value) => (Array.isArray(value) ? value[0] : value);

export function publicOrigin(headers) {
  const first =
    one(headers.forwarded)?.match(FIRST_FORWARDED_ELEMENT)?.[0] ?? "";
  const forwarded = new Map(
    [...first.matchAll(FORWARDED_PARAMETER)].map(([, name, value]) => [
      name.toLowerCase(),
      value.startsWith('"')
        ? value.slice(1, -1).replace(QUOTED_PAIR, "$1")
        : value,
    ])
  );
  const said = (
    forwarded.get("proto") ??
    one(headers["x-forwarded-proto"])?.split(",")[0] ??
    "http"
  )
    .trim()
    .toLowerCase();
  const protocol = said === "https" ? "https" : "http";
  const host =
    (
      forwarded.get("host") ?? one(headers["x-forwarded-host"])?.split(",")[0]
    )?.trim() || one(headers.host);
  return { protocol, host, origin: `${protocol}://${host}` };
}
