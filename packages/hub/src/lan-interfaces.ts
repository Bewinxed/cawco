/**
 * The interfaces this machine shares with other devices: the only ones the
 * hub's `.local` name is announced and answered on (mdns.ts).
 *
 * RFC 6762 §14: "addresses in IPv4 or IPv6 address records in Multicast DNS
 * responses MUST be valid for use on the interface on which the response is
 * being sent" (https://www.rfc-editor.org/rfc/rfc6762#section-14). ciao
 * keeps a socket per interface and answers on each with that interface's
 * records, but on Linux every one of those sockets also receives the
 * queries that arrive on the others (its own MDNSServer.ts: "we will
 * nonetheless receive packets from ALL other interfaces"). A question
 * arriving on the LAN is then also answered by the container bridge's socket
 * and the VPN tunnel's, each with its own address, and a querier that asked
 * for a unicast reply (macOS does) is sent all of them. A client that tries
 * the bridge's address first waits out a connect timeout. So ciao is given
 * only the links another device reaches this machine on (core
 * reachable-links.ts: no container or VM bridges, veths or ports), and of
 * those the ones mDNS runs on, from each link's flags:
 *
 * - No MULTICAST flag: mDNS is multicast, and the link carries none
 *   (netdevice(7): "IFF_MULTICAST Supports multicast",
 *   https://man7.org/linux/man-pages/man7/netdevice.7.html).
 * - POINTOPOINT: the one peer is the tunnel's far end (netdevice(7):
 *   "IFF_POINTOPOINT Interface is a point-to-point link"). Tailscale,
 *   WireGuard, OpenVPN's tun, PPP; macOS `utun`.
 *
 * On Linux the crosstalk runs between the shared interfaces too: with the
 * Ethernet on one network and the Wi-Fi on another, a question from the
 * first is answered by the Wi-Fi's socket with the Wi-Fi's address. So
 * there the interfaces answered on are those of one network: the one the
 * default route leaves by, when they hold addresses on more than one. macOS
 * gives each socket its own interface's packets alone (ciao's same
 * comment), so a Mac answers on every shared interface.
 */
import { networkInterfaces } from "node:os";
import { reachableLinks } from "@cawco/core/reachable-links";

/**
 * The reachable links (core reachable-links.ts) mDNS can run on: those that
 * carry multicast and have more than one peer.
 */
const mdnsLinks = async (): Promise<string[]> =>
  (await reachableLinks())
    .filter(
      (link) =>
        link.flags.includes("MULTICAST") && !link.flags.includes("POINTOPOINT")
    )
    .map((link) => link.name);

/**
 * The network an interface's IPv4 address sits on (`192.168.3.0/255.255.255.0`),
 * or the interface's own name when it holds no IPv4 address: a link with only
 * IPv6 is a network of its own here. A mask's octet is 256 less a power of
 * two, so an address octet masked is that octet less its remainder.
 */
const networkOf = (name: string): string => {
  const v4 = networkInterfaces()[name]?.find(
    (entry) => entry.family === "IPv4"
  );
  if (!v4) {
    return name;
  }
  const mask = v4.netmask.split(".").map(Number);
  const net = v4.address
    .split(".")
    .map(Number)
    .map((octet, i) => octet - (octet % (256 - (mask[i] ?? 0))));
  return `${net.join(".")}/${v4.netmask}`;
};

/** The interface the default route leaves by, IPv4's first, else IPv6's. */
const defaultRoute = async (): Promise<string | undefined> => {
  const [v4, v6] = await Promise.all(
    ["-4", "-6"].map(
      async (family) =>
        JSON.parse(
          (
            await Bun.$`ip ${family} -json route show default`.quiet()
          ).stdout.toString()
        ) as { dev?: string }[]
    )
  );
  return [...(v4 ?? []), ...(v6 ?? [])].find((route) => route.dev)?.dev;
};

/**
 * Of the shared interfaces holding an address now, those on one network:
 * all of them when they share it, else the default route's. Throws when they
 * span networks and no default route names this machine's.
 */
const oneNetwork = async (shared: string[]): Promise<string[]> => {
  const addressed = shared.filter((name) =>
    (networkInterfaces()[name] ?? []).some((entry) => !entry.internal)
  );
  const networks = new Set(addressed.map(networkOf));
  if (networks.size <= 1) {
    return addressed;
  }
  const dev = await defaultRoute();
  if (!(dev && addressed.includes(dev))) {
    throw new Error(
      `${addressed.join(", ")} are on different networks and no default route says which is this machine's`
    );
  }
  return addressed.filter((name) => networkOf(name) === networkOf(dev));
};

/**
 * The names of the interfaces the hub's name is answered on: those other
 * devices share with this machine, on one network on Linux. Empty while no
 * such interface holds an address. Throws when the OS's report can't be
 * read, and on a platform the hub has no reader for.
 */
export const lanInterfaces = async (): Promise<string[]> => {
  if (process.platform === "linux") {
    return oneNetwork(await mdnsLinks());
  }
  return mdnsLinks();
};
