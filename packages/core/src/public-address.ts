/**
 * Which addresses the internet reaches a machine by: global unicast, outside
 * private, CGNAT, link-local, loopback, documentation, multicast and reserved
 * ranges. The agent's `public-address` capability lists its interfaces'
 * (a stream relay listens on one, Projects spec §5.11), and the hub reads the
 * address it sees an agent connect from the same way. What the hub connects
 * to for a name it was handed (favicon.ts) is held to
 * {@link isPublicDestination}. Node-only (node:net).
 */
import { BlockList, isIP } from "node:net";

/**
 * The ranges that are no public address, one list per family: Node's
 * `BlockList` checks an IPv4 address against IPv6 rules too, as its
 * IPv4-mapped form (`::ffff:a.b.c.d`), which lies inside `::/3`, so one list
 * holding both families' rules read every IPv4 address as not public.
 */
const blockList = (
  family: "ipv4" | "ipv6",
  ranges: readonly (readonly [string, number])[]
): BlockList => {
  const list = new BlockList();
  for (const [address, prefix] of ranges) {
    list.addSubnet(address, prefix, family);
  }
  return list;
};

const NOT_PUBLIC_V4 = blockList("ipv4", [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
]);
const NOT_PUBLIC_V6 = blockList("ipv6", [
  ["::", 3],
  ["4000::", 2],
  ["8000::", 1],
  ["2001:db8::", 32],
]);

/** Tunnel relays, which forward to any address: 6to4's anycast (RFC 3068), Teredo (RFC 4380) and 6to4 (RFC 3056). */
const TUNNEL_V4 = blockList("ipv4", [["192.88.99.0", 24]]);
const TUNNEL_V6 = blockList("ipv6", [
  ["2001::", 32],
  ["2002::", 16],
]);

/** An IPv4-mapped IPv6 address (`::ffff:203.0.113.9`), as a socket reports an IPv4 peer on a dual-stack listener. */
const MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu;

/** An IPv6 address's zone (`fe80::1%eth0`). */
const ZONE = /%.*$/u;

/** `address` as itself: an IPv4-mapped one unwrapped, an IPv6 zone dropped. */
export const plainAddress = (address: string): string =>
  MAPPED.exec(address)?.[1] ?? address.replace(ZONE, "");

/** Whether the internet reaches a machine at `address`. */
export const isPublicAddress = (address: string): boolean => {
  const plain = plainAddress(address);
  const family = isIP(plain);
  if (family === 0) {
    return false;
  }
  return family === 4
    ? !NOT_PUBLIC_V4.check(plain, "ipv4")
    : !NOT_PUBLIC_V6.check(plain, "ipv6");
};

/**
 * Whether the hub may connect to `address` for a name it was handed: a
 * public address that is no tunnel relay, which would carry the connection
 * on to anywhere, inside the network included.
 */
export const isPublicDestination = (address: string): boolean => {
  if (!isPublicAddress(address)) {
    return false;
  }
  const plain = plainAddress(address);
  return isIP(plain) === 4
    ? !TUNNEL_V4.check(plain, "ipv4")
    : !TUNNEL_V6.check(plain, "ipv6");
};
