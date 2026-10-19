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
 * only the interfaces other devices sit on, read from what the OS reports
 * about each link, never from its name:
 *
 * - No MULTICAST flag: mDNS is multicast, and the link carries none
 *   (netdevice(7): "IFF_MULTICAST Supports multicast",
 *   https://man7.org/linux/man-pages/man7/netdevice.7.html).
 * - POINTOPOINT: the one peer is the tunnel's far end (netdevice(7):
 *   "IFF_POINTOPOINT Interface is a point-to-point link"). Tailscale,
 *   WireGuard, OpenVPN's tun, PPP; macOS `utun`.
 * - A port of a bridge or bond: its frames are its master's, and so are the
 *   addresses that answer for them.
 * - A veth: the other end of the pair is a network namespace on this
 *   machine (veth(4): "They can act as tunnels between network namespaces",
 *   https://man7.org/linux/man-pages/man4/veth.4.html).
 * - A bridge whose every port leads to a guest on this machine (veth to a
 *   container, tap to a VM) or that has no port at all: Podman's and
 *   Docker's networks, libvirt's `virbr0` (Docker: "Bridge networks apply
 *   to containers running on the same Docker daemon host",
 *   https://docs.docker.com/engine/network/drivers/bridge/). A bridge with a
 *   NIC among its ports is the LAN itself. On macOS the same rule reads the
 *   bridge's `member:` lines against the Mac's hardware ports
 *   (`networksetup -listallhardwareports`): the Thunderbolt Bridge has some,
 *   a VM's `bridge100` has none.
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

interface Link {
  flags: string[];
  /** Its kind as the kernel reports it (`veth`, `bridge`, `tun` for tun and tap). */
  kind?: string;
  /** The bridge or bond this link is a port of. */
  master?: string;
  /** What its master is (`bridge`, `bond`, `vrf`). */
  masterKind?: string;
  name: string;
}

/** A port of one of these hands its frames, and their addresses, to its master. */
const ABSORBING = new Set(["bridge", "bond"]);
/** Kinds that reach a guest on this machine: a container (veth) or a VM (tap). */
const GUEST = new Set(["veth", "tun"]);

const isShared = (
  link: Link,
  links: Link[],
  leavesMachine: (port: Link) => boolean
): boolean => {
  if (
    !link.flags.includes("MULTICAST") ||
    link.flags.includes("LOOPBACK") ||
    link.flags.includes("POINTOPOINT")
  ) {
    return false;
  }
  if (link.master && ABSORBING.has(link.masterKind ?? "")) {
    return false;
  }
  if (link.kind === "veth") {
    return false;
  }
  if (link.kind === "bridge") {
    return links.some(
      (port) => port.master === link.name && leavesMachine(port)
    );
  }
  return true;
};

interface IpLink {
  flags: string[];
  ifname: string;
  linkinfo?: { info_kind?: string; info_slave_kind?: string };
  master?: string;
}

/** Linux: iproute2's own report of every link in this network namespace. */
const linuxShared = async (): Promise<string[]> => {
  const report = (await Bun.$`ip -details -json link show`.quiet()).stdout;
  const links: Link[] = (JSON.parse(report.toString()) as IpLink[]).map(
    (link) => ({
      name: link.ifname,
      flags: link.flags,
      master: link.master,
      kind: link.linkinfo?.info_kind,
      masterKind: link.linkinfo?.info_slave_kind,
    })
  );
  return links
    .filter((link) =>
      isShared(link, links, (port) => !GUEST.has(port.kind ?? ""))
    )
    .map((link) => link.name);
};

/** `networksetup -listallhardwareports`: a hardware port's interface. */
const HARDWARE_PORT = /^Device: (\S+)$/gm;
/** `ifconfig -a`: an interface's first line, its name and flags. */
const IFCONFIG_HEAD = /^(\S+): flags=\w+<([^>]*)>/;
/** `ifconfig -a`: a bridge's member. */
const IFCONFIG_MEMBER = /^\s+member: (\S+)/;

/** macOS: `ifconfig -a`'s flags and bridge members, and the Mac's hardware ports. */
const darwinShared = async (): Promise<string[]> => {
  const [ifconfig, ports] = await Promise.all([
    Bun.$`ifconfig -a`.quiet(),
    Bun.$`networksetup -listallhardwareports`.quiet(),
  ]);
  const hardware = new Set(
    [...ports.stdout.toString().matchAll(HARDWARE_PORT)].map(
      (match) => match[1]
    )
  );
  const links: Link[] = [];
  let block: Link | undefined;
  for (const line of ifconfig.stdout.toString().split("\n")) {
    const head = IFCONFIG_HEAD.exec(line);
    if (head?.[1]) {
      block = { name: head[1], flags: (head[2] ?? "").split(",") };
      links.push(block);
      continue;
    }
    const member = IFCONFIG_MEMBER.exec(line);
    const bridge = block;
    if (member?.[1] && bridge) {
      bridge.kind = "bridge";
      links.push({
        name: member[1],
        flags: [],
        master: bridge.name,
        masterKind: "bridge",
      });
    }
  }
  // A member's own block comes before or after its bridge's: merge by name.
  const byName = new Map<string, Link>();
  for (const link of links) {
    const known = byName.get(link.name);
    byName.set(link.name, {
      name: link.name,
      flags: link.flags.length > 0 ? link.flags : (known?.flags ?? []),
      master: link.master ?? known?.master,
      masterKind: link.masterKind ?? known?.masterKind,
      kind: link.kind ?? known?.kind,
    });
  }
  const merged = [...byName.values()];
  return merged
    .filter((link) => isShared(link, merged, (port) => hardware.has(port.name)))
    .map((link) => link.name);
};

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
    return oneNetwork(await linuxShared());
  }
  if (process.platform === "darwin") {
    return darwinShared();
  }
  throw new Error(`no reader for ${process.platform}'s network interfaces`);
};
