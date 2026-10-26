import { z } from "zod";
/**
 * The network links another device can reach this machine on: the only ones
 * whose addresses this machine offers anyone. The hub's Connect a machine
 * list and its `.local` name (hub join.ts, lan-interfaces.ts), and the
 * addresses a remote browser's screen is told to reach (agent
 * media-forwarding.ts), all start from these. Read from what the OS reports
 * about each link, never from its name. Left out:
 *
 * - Loopback.
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
 * A VPN tunnel stays: other devices on the tailnet reach the machine on it.
 */

/** A link, with its flags as the OS reports them (`MULTICAST`, `POINTOPOINT`). */
export interface ReachableLink {
  flags: string[];
  name: string;
}

interface Link extends ReachableLink {
  /** Its kind as the kernel reports it (`veth`, `bridge`, `tun` for tun and tap). */
  kind?: string;
  /** The bridge or bond this link is a port of. */
  master?: string;
  /** What its master is (`bridge`, `bond`, `vrf`). */
  masterKind?: string;
}

/** A port of one of these hands its frames, and their addresses, to its master. */
const ABSORBING = new Set(["bridge", "bond"]);
/** Kinds that reach a guest on this machine: a container (veth) or a VM (tap). */
const GUEST = new Set(["veth", "tun"]);

const isReachable = (
  link: Link,
  links: Link[],
  leavesMachine: (port: Link) => boolean
): boolean => {
  if (link.flags.includes("LOOPBACK")) {
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

const reachable = (
  links: Link[],
  leavesMachine: (port: Link) => boolean
): ReachableLink[] =>
  links
    .filter((link) => isReachable(link, links, leavesMachine))
    .map(({ name, flags }) => ({ name, flags }));

const IpLinkSchema = z.object({
  flags: z.array(z.string()),
  ifname: z.string(),
  linkinfo: z
    .object({
      info_kind: z.string().optional(),
      info_slave_kind: z.string().optional(),
    })
    .optional(),
  master: z.string().optional(),
});

/** Linux: iproute2's own report of every link in this network namespace. */
const linuxLinks = async (): Promise<ReachableLink[]> => {
  const report = (await Bun.$`ip -details -json link show`.quiet()).stdout;
  const links: Link[] = z.array(IpLinkSchema).parse(JSON.parse(report.toString())).map(
    (link) => ({
      name: link.ifname,
      flags: link.flags,
      master: link.master,
      kind: link.linkinfo?.info_kind,
      masterKind: link.linkinfo?.info_slave_kind,
    })
  );
  return reachable(links, (port) => !GUEST.has(port.kind ?? ""));
};

/** `networksetup -listallhardwareports`: a hardware port's interface. */
const HARDWARE_PORT = /^Device: (\S+)$/gmu;
/** `ifconfig -a`: an interface's first line, its name and flags. */
const IFCONFIG_HEAD = /^(\S+): flags=\w+<([^>]*)>/u;
/** `ifconfig -a`: a bridge's member. */
const IFCONFIG_MEMBER = /^\s+member: (\S+)/u;

/** macOS: `ifconfig -a`'s flags and bridge members, and the Mac's hardware ports. */
const darwinLinks = async (): Promise<ReachableLink[]> => {
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
  return reachable([...byName.values()], (port) => hardware.has(port.name));
};

/**
 * The links another device can reach this machine on. Throws when the OS's
 * report can't be read, and on a platform there is no reader for.
 */
export const reachableLinks = (): Promise<ReachableLink[]> => {
  if (process.platform === "linux") {
    return linuxLinks();
  }
  if (process.platform === "darwin") {
    return darwinLinks();
  }
  return Promise.reject(
    new Error(`no reader for ${process.platform}'s network interfaces`)
  );
};
