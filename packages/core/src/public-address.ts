/**
 * Which addresses the internet reaches a machine by: global unicast, outside
 * private, CGNAT, link-local, loopback, documentation, multicast and reserved
 * ranges. The agent's `public-address` capability lists its interfaces'
 * (a stream relay listens on one, Projects spec §5.11), and the hub reads the
 * address it sees an agent connect from the same way. Node-only (node:net).
 */
import { BlockList, isIP } from "node:net";

const NOT_PUBLIC = new BlockList();
for (const [address, prefix] of [
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
] as const) {
  NOT_PUBLIC.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 3],
  ["4000::", 2],
  ["8000::", 1],
  ["2001:db8::", 32],
] as const) {
  NOT_PUBLIC.addSubnet(address, prefix, "ipv6");
}

/** An IPv4-mapped IPv6 address (`::ffff:203.0.113.9`), as a socket reports an IPv4 peer on a dual-stack listener. */
const MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** An IPv6 address's zone (`fe80::1%eth0`). */
const ZONE = /%.*$/;

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
  return !NOT_PUBLIC.check(plain, family === 4 ? "ipv4" : "ipv6");
};
