/**
 * Where a CawCo container that needs the internet gets it, and when one is
 * started again so it keeps it.
 *
 * The cause this answers (obelisk-of-light, rootless Podman 5.7 with pasta:
 * every page of the browser failed with DNS_PROBE_FINISHED_NO_INTERNET while
 * the machine reached the internet). A rootless runtime's bridge networks all
 * live in one namespace per user, which Podman makes at the first bridged
 * container start and keeps while its pasta process lives
 * (`getOrCreateNetns` in common/libnetwork/internal/rootlessnetns
 * netns_linux.go; `podman network reload` makes it again only once that
 * process is dead, bugs.passt.top 159). pasta copies the machine's addresses
 * and routes once, as it starts; with no default route it takes an interface
 * that has any route as its template (passt.1, `-a`, `-g`, `-i`; passt
 * commit f919dc7a "Don't require a default route to start"), so a namespace
 * made at boot before Wi-Fi had a default route has none for as long as that
 * pasta lives. Nothing refreshes it: pasta follows no change of the host's
 * routes (bugs.passt.top 141, CONFIRMED; "a known limitation. We're working
 * on it", passt-dev 2026-07). Ordering CawCo after the network cannot help:
 * its services are systemd user units, which cannot wait on
 * `network-online.target` (podman-systemd.unit(5), "Implicit network
 * dependencies"), and another service may make the namespace first.
 *
 * So on native rootless Podman 5.3 or later with pasta, each container that
 * needs the internet gets a namespace of its own (`NetworkMode: "pasta"`,
 * {@link placementOf} `own-namespace`): Podman starts a pasta for it at each
 * of its starts, copied from the machine's network as it stands then. 5.3 is
 * where `--map-guest-addr` arrived, which makes `host.containers.internal`
 * and `host-gateway` reach the machine under pasta (podman-run(1)
 * `--network`, pasta). What a start copies is kept with the container
 * ({@link MachineNetwork}), and a container is started again when the
 * machine has become routed or changed what pasta copied
 * ({@link startAgainDue}). Every other runtime keeps the media network
 * (media-network.ts): rootful engines route in the machine's own namespace
 * as each packet goes, RootlessKit and slirp4netns give a fixed address and
 * gateway whatever the machine has, and a VM's network is up before its
 * socket answers.
 */
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import type { Runtime } from "./runtime";

/** Where a container stands: the runtime's media network, or a namespace of its own. */
export type Placement = "media-network" | "own-namespace";

/** The first Podman whose pasta maps a guest address to the machine (`--map-guest-addr`). */
const FIRST_MAPPED = { major: 5, minor: 3 } as const;

/** Whether `version` (`5.7.0`) is {@link FIRST_MAPPED} or later. */
const mapsGuestAddress = (version: string): boolean => {
  const [major = 0, minor = 0] = version
    .split(".")
    .map((one) => Number.parseInt(one, 10));
  return (
    major > FIRST_MAPPED.major ||
    (major === FIRST_MAPPED.major && minor >= FIRST_MAPPED.minor)
  );
};

/** Where `runtime`'s containers that need the internet stand, as the module's header says. */
export const placementOf = (
  runtime: Pick<
    Runtime,
    "kind" | "ownNetwork" | "rootless" | "rootlessNetwork" | "version"
  >
): Placement =>
  runtime.kind === "podman" &&
  runtime.rootless &&
  runtime.ownNetwork &&
  runtime.rootlessNetwork === "pasta" &&
  mapsGuestAddress(runtime.version)
    ? "own-namespace"
    : "media-network";

/** `/proc/net/route`'s columns: Iface, Destination, Gateway, Flags, RefCnt, Use, Metric, Mask. */
const COLUMNS = { iface: 0, destination: 1, flags: 3, metric: 6, mask: 7 };
const ANYWHERE = "00000000";
const BLANKS = /\s+/u;

/** Whether a route's hex flags hold the kernel's up flag (`RTF_UP`, 0x1, the lowest bit). */
const up = (flags: string | undefined): boolean =>
  Number.parseInt(flags ?? "", 16) % 2 === 1;

/** The interface of `/proc/net/route`'s up IPv4 default route of least metric, or undefined while it has none. */
const defaultRouteInterface = (table: string): string | undefined => {
  let best: { iface: string; metric: number } | undefined;
  for (const line of table.split("\n").slice(1)) {
    const fields = line.trim().split(BLANKS);
    const parsed = Number.parseInt(fields[COLUMNS.metric] ?? "", 10);
    const metric = Number.isFinite(parsed) ? parsed : 0;
    const iface = fields[COLUMNS.iface];
    if (
      iface &&
      fields[COLUMNS.destination] === ANYWHERE &&
      fields[COLUMNS.mask] === ANYWHERE &&
      up(fields[COLUMNS.flags]) &&
      !(best && best.metric <= metric)
    ) {
      best = { iface, metric };
    }
  }
  return best?.iface;
};

/** Whether `/proc/net/route`'s text holds an up IPv4 default route. */
export const hasDefaultRoute = (table: string): boolean =>
  defaultRouteInterface(table) !== undefined;

/** The first `nameserver` of resolv.conf's text: pasta's DNS target ("By default, the first nameserver from the host's /etc/resolv.conf", passt.1 `--dns-host`). */
const resolverOf = (resolvConf: string): string | undefined =>
  resolvConf
    .split("\n")
    .map((line) => line.trim().split(BLANKS))
    .find(([word, address]) => word === "nameserver" && address)?.[1];

/**
 * The machine's network as pasta copies it when a container starts: whether
 * it has an IPv4 default route, the first nameserver, and the IPv4 address
 * of the default route's interface. pasta takes that address as the
 * namespace's own and as the target of `--map-guest-addr` (resolved once, at
 * start), so `host.containers.internal` and `host-gateway` reach the
 * machine only while it holds it.
 */
export interface MachineNetwork {
  /** The default route's interface's IPv4 address. */
  address?: string;
  /** The first nameserver of /etc/resolv.conf. */
  resolver?: string;
  routed: boolean;
}

/** The machine's interfaces and their addresses, as `os.networkInterfaces()` gives them. */
type Interfaces = ReturnType<typeof networkInterfaces>;

/** The machine's network from `/proc/net/route`'s text, resolv.conf's and the interfaces' addresses. */
export const machineNetworkOf = (
  table: string,
  resolvConf: string,
  interfaces: Interfaces
): MachineNetwork => {
  const iface = defaultRouteInterface(table);
  const resolver = resolverOf(resolvConf);
  const address = iface
    ? interfaces[iface]?.find((one) => one.family === "IPv4")?.address
    : undefined;
  return {
    routed: iface !== undefined,
    ...(resolver ? { resolver } : {}),
    ...(address ? { address } : {}),
  };
};

/** The machine's network now; a file that can't be read reads as empty (no route, no resolver). */
export const machineNetwork = async (): Promise<MachineNetwork> => {
  const [table, resolvConf] = await Promise.all([
    readFile("/proc/net/route", "utf8").catch(() => ""),
    readFile("/etc/resolv.conf", "utf8").catch(() => ""),
  ]);
  return machineNetworkOf(table, resolvConf, networkInterfaces());
};

/**
 * Whether a container that started on the machine's network `at` is started
 * again now, the machine's network being `now`: only while the machine is
 * routed (a start then copies a default route), and only when it was not
 * routed then, or pasta's copy of the resolver or of the machine's address
 * no longer matches. A container with no kept network (one on the media
 * network) never is.
 */
export const startAgainDue = (
  at: MachineNetwork | undefined,
  now: MachineNetwork
): boolean =>
  !!at &&
  now.routed &&
  (!at.routed || at.resolver !== now.resolver || at.address !== now.address);
