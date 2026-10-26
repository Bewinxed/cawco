/**
 * What a Linux workspace's boundary dials out to, and what it never does: the
 * one statement of it, read by the boundary's srt settings (agent
 * boundary-policy.ts `srtSettings`) and by the hub before it hands a session
 * in a workspace an address to open, so no session is handed a URL its
 * boundary refuses. The one exception is the hub's own preview origins,
 * which each workspace's relay dials from the host (core hub-previews.ts,
 * agent proxy-relay.ts): the hub asks this only of every other origin.
 */
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * The address space no workspace dials by a name that resolves into it: the
 * private ranges, the tailnet's CGNAT range (every one of the owner's
 * machines, the hub among them: "The tailnet is the perimeter", PRODUCT.md)
 * and IPv6 unique-local. srt's own guard refuses loopback, link-local,
 * multicast, cloud metadata and this host's own addresses besides
 * (src/sandbox/resolved-address-guard.ts in 0.0.81); IPv4 and IPv6 listed
 * apart, as its README asks.
 */
export const DENIED_RESOLVED_ADDRESSES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
];

/**
 * What srt's own guard refuses besides ({@link DENIED_RESOLVED_ADDRESSES}):
 * "this", loopback, link-local (cloud metadata in it) and multicast. The
 * host's own addresses it refuses too are the workspace machine's: the
 * caller names them ({@link workspaceReach}'s `own`).
 */
const GUARDED = [
  "0.0.0.0/8",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "224.0.0.0/4",
  "::1/128",
  "fe80::/10",
  "ff00::/8",
];

const refused = new BlockList();
for (const range of [...DENIED_RESOLVED_ADDRESSES, ...GUARDED]) {
  const [network, prefix] = range.split("/") as [string, string];
  refused.addSubnet(
    network,
    Number(prefix),
    isIP(network) === 6 ? "ipv6" : "ipv4"
  );
}

/** An IPv6 host's brackets in a URL. */
const BRACKETS = /^\[|\]$/gu;

const family = (address: string): "ipv4" | "ipv6" =>
  isIP(address) === 6 ? "ipv6" : "ipv4";

/**
 * Whether a workspace's boundary refuses to dial `address`, an IP literal:
 * one in the space every boundary refuses, or one of `own`, its machine's
 * own addresses.
 */
const workspaceRefuses = (
  address: string,
  own: readonly string[] = []
): boolean => {
  if (refused.check(address, family(address))) {
    return true;
  }
  const mine = new BlockList();
  for (const one of own.filter((each) => isIP(each) !== 0)) {
    mine.addAddress(one, family(one));
  }
  return mine.check(address, family(address));
};

/**
 * Why a browser inside a workspace cannot open `url`, or null when it can:
 * its host is, or resolves only to, an address the boundary refuses
 * ({@link workspaceRefuses}, `own` the workspace machine's own addresses),
 * or resolves to nothing. Read from where it is asked, which names the
 * tailnet's and the LAN's hosts as the workspace's machine does.
 */
export const workspaceReach = async (
  url: string,
  own: readonly string[] = []
): Promise<string | null> => {
  const { hostname, origin } = new URL(url);
  const host = hostname.replace(BRACKETS, "");
  let addresses: string[];
  try {
    addresses = isIP(host)
      ? [host]
      : (await lookup(host, { all: true })).map((one) => one.address);
  } catch (error) {
    return `${origin}'s host does not resolve (${(error as NodeJS.ErrnoException).code ?? String(error)}), so no browser in a workspace reaches it`;
  }
  const open = addresses.filter((address) => !workspaceRefuses(address, own));
  return open.length > 0
    ? null
    : `${origin} is at ${addresses.join(", ")}, on the owner's own network or the workspace's own machine, and a workspace's boundary reaches public hosts only: no browser in a workspace opens it`;
};
