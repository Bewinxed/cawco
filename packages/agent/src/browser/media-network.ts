/**
 * The runtime's media network, `cawco-media`: one user-defined bridge per
 * container runtime, with fixed addresses in its /24: the gateway at .1, the
 * stream relay's coturn at .2 (relay.ts), and browser slot s at .10 + s
 * (container-host.ts). Every browser container of every machine is made on
 * it; coturn joins it on the relay's machine, so a browser there reaches the
 * relay at .2 with no forwarder and no hairpin.
 *
 * Fixed addresses need a subnet named at the network's making: Docker takes
 * an address for a container only "when connecting to networks with user
 * configured subnets" (its daemon's refusal otherwise), so the subnet is
 * picked here, the first 10.198.N.0/24 that overlaps no network the runtime
 * has and no prefix of this machine's interfaces (our call: a range no home
 * router or VPN hands out by default). A network that stands is read back,
 * its subnet as made.
 */
import { networkInterfaces } from "node:os";
import type Docker from "dockerode";

/** The media network's name on every runtime. */
export const MEDIA_NETWORK = "cawco-media";
/** The label the media network carries. */
const MEDIA_LABEL = "dev.cawco.media";
/** The first host of a browser slot's address: slot s is .10 + s. */
const FIRST_SLOT_HOST = 10;
/** The candidate subnets' first two octets: 10.198.N.0/24. */
const CANDIDATE = [10, 198] as const;
const OCTETS = 256;

/** A /24 the runtime holds as a bridge network: its name and its first three octets. */
export interface MediaNetwork {
  name: string;
  /** The subnet as the runtime has it: `10.198.0.0/24`. */
  subnet: string;
}

/** The address of `host` in `network`'s /24. */
const hostOf = (network: MediaNetwork, host: number): string => {
  const [base = ""] = network.subnet.split("/");
  return `${base.split(".").slice(0, 3).join(".")}.${host}`;
};

/** The network's gateway: the host's own side of the bridge. */
const gatewayAddress = (network: MediaNetwork): string => hostOf(network, 1);

/** coturn's address on the media network. */
export const relayMediaAddress = (network: MediaNetwork): string =>
  hostOf(network, 2);

/** The address browser slot `slot` takes on the media network. */
export const slotAddress = (network: MediaNetwork, slot: number): string =>
  hostOf(network, slotHost(slot));

/** The last octet browser slot `slot` takes: .10 + s. */
export const slotHost = (slot: number): number => FIRST_SLOT_HOST + slot;

/** An IPv4 address as a number; undefined for anything else. */
const ipv4 = (address: string): number | undefined => {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    !parts.every((one) => Number.isInteger(one) && one >= 0 && one < OCTETS)
  ) {
    return;
  }
  return parts.reduce((sum, one) => sum * OCTETS + one, 0);
};

/** An IPv4 prefix (`a.b.c.d/n`) as its first address and its size; undefined for anything else. */
const rangeOf = (cidr: string): { first: number; size: number } | undefined => {
  const [address = "", bits = ""] = cidr.split("/");
  const start = ipv4(address);
  const length = Number(bits);
  if (start === undefined || !Number.isInteger(length) || length > 32) {
    return;
  }
  const size = 2 ** (32 - length);
  return { first: start - (start % size), size };
};

/** Whether `address` lies inside the IPv4 prefix `cidr`. */
export const insidePrefix = (address: string, cidr: string): boolean => {
  const at = ipv4(address);
  const range = rangeOf(cidr);
  return (
    at !== undefined &&
    range !== undefined &&
    at >= range.first &&
    at < range.first + range.size
  );
};

/** Whether two IPv4 prefixes share an address. */
const overlaps = (a: string, b: string): boolean => {
  const one = rangeOf(a);
  const two = rangeOf(b);
  return (
    !!one &&
    !!two &&
    one.first < two.first + two.size &&
    two.first < one.first + one.size
  );
};

/** Every IPv4 prefix of this machine's interfaces (`os.networkInterfaces()`'s cidr). */
export const interfacePrefixes = (): string[] =>
  Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((one) => one.family === "IPv4" && !one.internal && one.cidr)
    .map((one) => one.cidr as string);

/** The runtime's not-found answer. */
const notFound = (error: unknown): boolean =>
  (error as { statusCode?: number }).statusCode === 404;

/** The runtime's answer to a network made twice at once. */
const conflict = (error: unknown): boolean =>
  (error as { statusCode?: number }).statusCode === 409;

/** The IPv4 subnet `name` stands on, or undefined while no such network stands. */
const standing = async (
  docker: Docker,
  name: string
): Promise<string | undefined> => {
  const inspected = await docker
    .getNetwork(name)
    .inspect()
    .catch((error: unknown) => {
      if (notFound(error)) {
        return;
      }
      throw error;
    });
  if (!inspected) {
    return;
  }
  const config = (
    inspected as { IPAM?: { Config?: { Subnet?: string }[] } | null }
  ).IPAM?.Config;
  const subnet = config
    ?.map((one) => one.Subnet ?? "")
    .find((one) => rangeOf(one)?.size === OCTETS);
  if (!subnet) {
    throw new Error(
      `The container network ${name} stands without an IPv4 /24 subnet (${JSON.stringify(config ?? [])}), so its addresses can't be fixed. Remove it (docker network rm ${name}), then start again.`
    );
  }
  return subnet;
};

/** The first candidate /24 no network of the runtime and no interface of this machine overlaps. */
const freeSubnet = async (docker: Docker): Promise<string> => {
  const networks = await docker.listNetworks();
  const taken = [
    ...networks.flatMap(
      (one) =>
        (
          one as { IPAM?: { Config?: { Subnet?: string }[] } | null }
        ).IPAM?.Config?.map((config) => config.Subnet ?? "") ?? []
    ),
    ...interfacePrefixes(),
  ].filter((one) => rangeOf(one));
  for (let third = 0; third < OCTETS; third += 1) {
    const subnet = `${CANDIDATE[0]}.${CANDIDATE[1]}.${third}.0/24`;
    if (!taken.some((one) => overlaps(one, subnet))) {
      return subnet;
    }
  }
  throw new Error(
    `Every ${CANDIDATE[0]}.${CANDIDATE[1]}.N.0/24 overlaps a network of the container runtime or an interface of this machine, so the media network has no subnet.`
  );
};

/** One making at a time in this process. */
let making: Promise<unknown> = Promise.resolve();

/**
 * The bridge network `name` (the media network unless named), made with a
 * free /24 when it does not stand; read back when it does, or when another
 * process made it a moment before.
 */
export const ensureMediaNetwork = (
  docker: Docker,
  name: string = MEDIA_NETWORK
): Promise<MediaNetwork> => {
  const work = async (): Promise<MediaNetwork> => {
    const kept = await standing(docker, name);
    if (kept) {
      return { name, subnet: kept };
    }
    const subnet = await freeSubnet(docker);
    const network: MediaNetwork = { name, subnet };
    await docker
      .createNetwork({
        Name: name,
        Driver: "bridge",
        CheckDuplicate: true,
        Labels: { [MEDIA_LABEL]: name },
        IPAM: {
          Driver: "default",
          Config: [{ Subnet: subnet, Gateway: gatewayAddress(network) }],
        },
      })
      .catch((error: unknown) => {
        if (!conflict(error)) {
          throw error;
        }
      });
    const made = await standing(docker, name);
    if (!made) {
      throw new Error(
        `The container network ${name} was made and does not stand.`
      );
    }
    return { name, subnet: made };
  };
  const next = making.then(work, work);
  making = next.catch(() => undefined);
  return next;
};

/**
 * A container's place on the network `name` at `address`, as the Engine
 * API's create takes it: `NetworkMode` for its HostConfig, `NetworkingConfig`
 * beside it (docker run's `--ip`: "IPv4 address (e.g., 172.30.100.104)").
 */
export const onMediaNetwork = (
  name: string,
  address: string
): {
  NetworkMode: string;
  NetworkingConfig: NonNullable<
    Docker.ContainerCreateOptions["NetworkingConfig"]
  >;
} => ({
  NetworkMode: name,
  NetworkingConfig: {
    EndpointsConfig: { [name]: { IPAMConfig: { IPv4Address: address } } },
  },
});
