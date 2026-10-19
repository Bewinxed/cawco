/**
 * The stream relay's ports opened on this machine's router (the journey's
 * router step, core stream-relay.ts `relay.map`), asked only once the person
 * pressed "Open the ports": UPnP first, then NAT-PMP, with
 * `@achingbrain/nat-port-mapper` ("Port mapping with UPnP and NAT-PMP",
 * npmjs.com/package/@achingbrain/nat-port-mapper). UDP and TCP 443 (and TCP
 * 80 for a certificate over HTTP), then the UDP relay range port by port: a
 * router whose table caps the range keeps the listener mapped and the range
 * is a forward by hand. The library renews each lease before it ends
 * (`autoRefresh`, its default); `relay.remove` unmaps them.
 *
 * A scratch fleet names its stand-in gateway's descriptor URL
 * (`CAWCO_UPNP_GATEWAY`): then that gateway alone is asked, never one SSDP
 * finds and never NAT-PMP, so no request reaches a real router.
 */
import { readFile } from "node:fs/promises";
import {
  type Gateway,
  pmpNat,
  upnpNat,
} from "@achingbrain/nat-port-mapper";
import { CAWCO_ENV, readEnv } from "@cawco/core";
import {
  RELAY_HTTP_PORT,
  type RelayMapArgs,
  type RelayMapHow,
  type RelayMapped,
  STREAM_RELAY_PORT,
  STREAM_RELAY_PORTS,
} from "@cawco/core/stream-relay";

/** How long a gateway has to be found, and each mapping to be answered. */
const FIND_MS = 5000;
const MAP_MS = 5000;
/** What the router's table names each mapping as. */
const DESCRIPTION = "CawCo stream relay";

/** The gateway the relay's ports are mapped on, and how it was reached; none before a map. */
let mapped: { gateway: Gateway; how: RelayMapHow } | null = null;

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The default route's gateway, from the kernel's routing table (Linux): `/proc/net/route`'s gateway is little-endian hex. */
const defaultGateway = async (): Promise<string | undefined> => {
  const table = await readFile("/proc/net/route", "utf8").catch(() => "");
  for (const line of table.split("\n").slice(1)) {
    const [, destination, gateway] = line.trim().split(/\s+/);
    if (destination === "00000000" && gateway && gateway !== "00000000") {
      const bytes = gateway.match(/../g)?.map((hex) => Number.parseInt(hex, 16));
      return bytes ? bytes.reverse().join(".") : undefined;
    }
  }
  return;
};

/** The router's UPnP gateway: the stand-in named, else the first SSDP finds within {@link FIND_MS}. */
const upnpGateway = async (): Promise<Gateway | undefined> => {
  const client = upnpNat({ description: DESCRIPTION });
  const named = readEnv(CAWCO_ENV.upnpGateway);
  if (named) {
    return client.getGateway(new URL(named), {
      signal: AbortSignal.timeout(FIND_MS),
    });
  }
  for await (const gateway of client.findGateways({
    signal: AbortSignal.timeout(FIND_MS),
  })) {
    if (gateway.family === "IPv4") {
      return gateway;
    }
  }
  return;
};

/** One port mapped to itself on `lan`; false when the router refused it or gave another external port. */
const mapOne = async (
  gateway: Gateway,
  port: number,
  lan: string,
  protocol: "udp" | "tcp"
): Promise<boolean> => {
  try {
    const mapping = await gateway.map(port, lan, {
      protocol,
      externalPort: port,
      description: DESCRIPTION,
      signal: AbortSignal.timeout(MAP_MS),
    });
    if (mapping.externalPort !== port) {
      await gateway.unmap(port).catch(() => undefined);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

/** The listener (and port 80 with `http`) on `gateway`: every mapping answered, or none kept. */
const mapListener = async (
  gateway: Gateway,
  args: RelayMapArgs
): Promise<boolean> => {
  const wanted: [number, "udp" | "tcp"][] = [
    [STREAM_RELAY_PORT, "udp"],
    [STREAM_RELAY_PORT, "tcp"],
    ...(args.http ? [[RELAY_HTTP_PORT, "tcp"] as [number, "tcp"]] : []),
  ];
  for (const [port, protocol] of wanted) {
    // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one mapping at a time.
    if (!(await mapOne(gateway, port, args.lan, protocol))) {
      await gateway.stop().catch(() => undefined);
      return false;
    }
  }
  return true;
};

/** The relay range, port by port: all mapped, or the ones mapped taken back (the range is then a forward by hand). */
const mapRange = async (gateway: Gateway, lan: string): Promise<boolean> => {
  const [first, last] = STREAM_RELAY_PORTS.relayRange;
  const done: number[] = [];
  for (let port = first; port <= last; port += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one mapping at a time.
    if (!(await mapOne(gateway, port, lan, "udp"))) {
      for (const one of done) {
        // biome-ignore lint/performance/noAwaitInLoops: taken back in turn, as they were made.
        await gateway.unmap(one).catch(() => undefined);
      }
      return false;
    }
    done.push(port);
  }
  return true;
};

/**
 * `relay.map`: the relay's ports opened on the router to `args.lan`, UPnP
 * first, then NAT-PMP at the default route's gateway (never with a stand-in
 * named). What it opened, by how, or why nothing was.
 */
export const mapRelayPorts = async (
  args: RelayMapArgs
): Promise<RelayMapped> => {
  await unmapRelayPorts();
  const tried: string[] = [];
  const ways: [RelayMapHow, () => Promise<Gateway | undefined>][] = [
    ["UPnP", upnpGateway],
    ...(readEnv(CAWCO_ENV.upnpGateway)
      ? []
      : [
          [
            "NAT-PMP",
            async () => {
              const at = await defaultGateway();
              return at
                ? pmpNat(at, { description: DESCRIPTION })
                : undefined;
            },
          ] as [RelayMapHow, () => Promise<Gateway | undefined>],
        ]),
  ];
  for (const [how, find] of ways) {
    // biome-ignore lint/performance/noAwaitInLoops: UPnP first; NAT-PMP only once it did not answer.
    const gateway = await find().catch((error: unknown) => {
      tried.push(`${how}: ${said(error)}`);
      return undefined;
    });
    if (!gateway) {
      tried.push(`${how}: no gateway answered`);
      continue;
    }
    if (!(await mapListener(gateway, args))) {
      tried.push(`${how}: the router refused UDP and TCP ${STREAM_RELAY_PORT}`);
      continue;
    }
    mapped = { gateway, how };
    const range = await mapRange(gateway, args.lan);
    console.info(
      `[relay] the router opened UDP and TCP ${STREAM_RELAY_PORT}${args.http ? ` and TCP ${RELAY_HTTP_PORT}` : ""} to ${args.lan} by ${how}${range ? ", and the relay range" : "; it capped the relay range"}`
    );
    return { how, listener: true, range };
  }
  console.info(`[relay] the router opened nothing: ${tried.join("; ")}`);
  return { how: null, listener: false, range: false, why: tried.join("; ") };
};

/** Every mapping the relay asked for taken back, and the leases' renewals with them. */
export const unmapRelayPorts = async (): Promise<void> => {
  const was = mapped;
  mapped = null;
  await was?.gateway.stop().catch(() => undefined);
};
