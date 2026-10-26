/**
 * The hub's own preview origins, as one machine's workspaces may reach them
 * (agent proxy-relay.ts): the one exception to a Linux workspace's boundary
 * refusing the owner's network (core boundary-reach.ts). The hub states them
 * in its register ack (`RegisterAckPayload.previewOrigins`); the agent keeps
 * them in {@link HUB_PREVIEWS_FILE} in its own data dir, which no sandbox
 * reads; each workspace's relay reads that file and dials a request for one
 * of them from the host, where every other request goes to srt's proxy.
 *
 * Only the hub's own preview listeners are named: a name or address the hub
 * answers by on a port of its preview range, or a host-mode name under its
 * preview domain on that range or on the one port its pattern names. What
 * else the hub serves (its API, its dashboard), every other machine of the
 * owner's and every other port stay out of reach. A preview listener lets in
 * only a pass in host mode; in port mode it is what every device on the
 * owner's network already reaches.
 *
 * Dependency-free: the srt host (agent boundary-host.ts) imports it.
 */

/** The hub's preview origins, as its register ack states them. */
export interface HubPreviewOrigins {
  /** Host mode's preview domain and the port its pattern names (its front); null in port mode. */
  domain: { name: string; port: number } | null;
  /** Every name and address the hub answers by, lowercased, with no brackets or zone. */
  names: string[];
  /** The hub's preview ports. */
  ports: { first: number; last: number };
}

/** The file the agent keeps the hub's preview origins in, in its data dir. */
export const HUB_PREVIEWS_FILE = "hub-previews.json";

/** The srt host's environment entry naming {@link HUB_PREVIEWS_FILE}'s path for its relay. */
export const HUB_PREVIEWS_ENV = "CAWCO_HUB_PREVIEWS";

const BRACKETS = /^\[|\]$/gu;
const TRAILING_DOTS = /\.+$/u;

/** `host` as the origins name it: lowercased, IPv6 brackets and trailing dots gone. */
const nameOf = (host: string): string =>
  host.toLowerCase().replace(BRACKETS, "").replace(TRAILING_DOTS, "");

/** Whether `host:port` is one of the hub's preview origins ({@link HubPreviewOrigins}). */
export const isHubPreview = (
  origins: HubPreviewOrigins,
  host: string,
  port: number
): boolean => {
  const name = nameOf(host);
  const ranged = port >= origins.ports.first && port <= origins.ports.last;
  if (origins.names.includes(name)) {
    return ranged;
  }
  const { domain } = origins;
  return (
    !!domain &&
    name.endsWith(`.${domain.name}`) &&
    (ranged || port === domain.port)
  );
};

const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u;

/** A loopback name or address: `localhost`, a name under `.localhost`, 127/8, ::1. */
const isLoopback = (name: string): boolean =>
  name === "localhost" ||
  name.endsWith(".localhost") ||
  LOOPBACK_V4.test(name) ||
  name === "::1";

/**
 * The origins as a machine's relay dials them: a loopback name stays only on
 * the hub's own computer (`hostsHub`); elsewhere that computer's loopback on
 * a preview port is whatever listens there, never the hub.
 */
export const originsFor = (
  origins: HubPreviewOrigins,
  hostsHub: boolean
): HubPreviewOrigins =>
  hostsHub
    ? origins
    : { ...origins, names: origins.names.filter((name) => !isLoopback(name)) };

const isPort = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value > 0 &&
  value < 65_536;

/** `value` as {@link HubPreviewOrigins}, or null when it is none (a file from another build, or torn). */
export const hubPreviewOriginsOf = (
  value: unknown
): HubPreviewOrigins | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { names, ports, domain } = value as Record<string, unknown>;
  const range = ports as Record<string, unknown> | null | undefined;
  const front = domain as Record<string, unknown> | null | undefined;
  if (!(
    Array.isArray(names) &&
    names.every((one) => typeof one === "string") &&
    range &&
    isPort(range.first) &&
    isPort(range.last) &&
    (front === null ||
      (front !== undefined &&
        typeof front.name === "string" &&
        front.name.length > 0 &&
        isPort(front.port)))
  )) {
    return null;
  }
  return {
    names: (names as string[]).map(nameOf),
    ports: { first: range.first, last: range.last },
    domain: front
      ? { name: nameOf(front.name as string), port: front.port as number }
      : null,
  };
};
