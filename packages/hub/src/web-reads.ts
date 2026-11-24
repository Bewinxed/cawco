/**
 * What a URL outside the fleet is, for what an agent's memory lesson may
 * carry (memory-run.ts): a link whose host is not local. A local host is
 * loopback (127/8, ::1, localhost), private (10/8, 172.16/12, 192.168/16,
 * fc00::/7), link-local (169.254/16, fe80::/10), CGNAT and tailnet
 * (100.64/10, `*.ts.net`), mDNS (`*.local`), or one of the fleet's own
 * machines by hostname or id ({@link localHost}). Also CawCo's own tools as
 * a harness names them ({@link CAWCO_TOOL}).
 */

/** CawCo's own tools as a harness names them: `mcp__cawco__<tool>` (Claude, pi), `cawco_<tool>` (OpenCode). */
export const CAWCO_TOOL = /^(?:mcp__cawco__|cawco_)/u;

/** A URL anywhere in a text, of a scheme that fetches. */
const URL_IN_TEXT = /\b(?:https?|ftps?|wss?|git):\/\/[^\s'"`<>|;()]+/giu;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu;
const USERINFO = /^[^@/?#]*@/u;
const HOST_END = /[:/?#]/u;
const TRAILING_DOT = /\.$/u;
/** An IPv6 host as a URL writes it: `[::1]`. */
const BRACKETS = /^\[(.*)\]$/u;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u;
const MAPPED_V4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u;
const LINK_LOCAL_V6 = /^fe[89ab][0-9a-f]:/u;
const PRIVATE_V6 = /^f[cd][0-9a-f]{2}:/u;

const inRange = (value: number, from: number, to: number): boolean =>
  value >= from && value <= to;

/** Whether an IPv4 address is loopback, private, link-local, CGNAT (tailnet) or unspecified. */
const localV4 = (address: string): boolean => {
  const parts = IPV4.exec(address)?.slice(1).map(Number);
  if (!parts || parts.some((part) => part > 255)) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 127 ||
    a === 10 ||
    a === 0 ||
    (a === 172 && inRange(b, 16, 31)) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && inRange(b, 64, 127))
  );
};

/** Whether a host is inside the fleet (the module header's list); `fleet` holds its machines' hostnames and ids, lower case. */
const localHost = (raw: string, fleet: ReadonlySet<string>): boolean => {
  const host = raw
    .toLowerCase()
    .replace(TRAILING_DOT, "")
    .replace(BRACKETS, "$1");
  if (!host) {
    return false;
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".ts.net") ||
    fleet.has(host)
  ) {
    return true;
  }
  if (IPV4.test(host)) {
    return localV4(host);
  }
  if (host.includes(":")) {
    const mapped = MAPPED_V4.exec(host)?.[1];
    return (
      host === "::1" ||
      host === "::" ||
      LINK_LOCAL_V6.test(host) ||
      PRIVATE_V6.test(host) ||
      (mapped !== undefined && localV4(mapped))
    );
  }
  return false;
};

/** A target's host: its scheme and user taken off, up to its port or path; undefined when there is none. */
const hostOf = (target: string): string | undefined => {
  const rest = target.replace(SCHEME, "").replace(USERINFO, "");
  if (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    return end > 1 ? rest.slice(0, end + 1) : undefined;
  }
  // httpie's `:3000/path` is localhost.
  if (rest.startsWith(":")) {
    return "localhost";
  }
  const [host] = rest.split(HOST_END);
  return host || undefined;
};

/** Whether a target is local: a host the hub reads, inside the fleet; a variable or an unreadable one is not. */
const localTarget = (target: string, fleet: ReadonlySet<string>): boolean => {
  if (target.includes("$") || target.includes("`")) {
    return false;
  }
  const host = hostOf(target);
  return host !== undefined && localHost(host, fleet);
};

/**
 * The URLs `text` names whose host is outside the fleet: what an agent's
 * lesson may not carry (memory-run.ts), a page's link being the way a page's
 * words travel.
 */
export const outsideUrls = (
  text: string,
  fleet: ReadonlySet<string>
): string[] =>
  (text.match(URL_IN_TEXT) ?? []).filter((url) => !localTarget(url, fleet));
