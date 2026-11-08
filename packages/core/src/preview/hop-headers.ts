/**
 * The headers that belong to one connection, never to the message: a proxy
 * or relay drops each before it forwards a request or an answer, lowercased.
 * RFC 9110 §7.6.1's: `Connection`, and the fields an intermediary removes
 * "whether or not they appear as a connection-option … Proxy-Connection,
 * Keep-Alive, TE, Transfer-Encoding, Upgrade"
 * (https://www.rfc-editor.org/rfc/rfc9110#section-7.6.1); and RFC 2616
 * §13.5.1's hop-by-hop fields besides (`Trailer`, `Proxy-Authenticate`,
 * `Proxy-Authorization`), which a relay's next hop never reads as its own.
 * A browser-safe leaf: it imports nothing.
 */
export const HOP_BY_HOP_HEADERS = [
  "connection",
  "proxy-connection",
  "keep-alive",
  "te",
  "transfer-encoding",
  "upgrade",
  "trailer",
  "proxy-authenticate",
  "proxy-authorization",
] as const;
export type HopByHopHeader = (typeof HOP_BY_HOP_HEADERS)[number];
