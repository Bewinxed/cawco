/**
 * The stream relay's ports opened on this machine's router (the journey's
 * router step, core stream-relay.ts `relay.map`), asked only once the person
 * pressed "Open the ports": UDP and TCP 443 (and TCP 80 for a certificate
 * over HTTP), then the UDP relay range port by port. A router whose table
 * caps the range keeps the listener mapped and the range is a forward by
 * hand. Each lease is renewed before it ends; `relay.remove` unmaps them.
 *
 * Asked in turn, the first that answers maps:
 * 1. UPnP IGD v2, with `@achingbrain/nat-port-mapper` ("Port mapping with
 *    UPnP and NAT-PMP", npmjs.com/package/@achingbrain/nat-port-mapper);
 * 2. UPnP IGD v1, with {@link igdV1}: nat-port-mapper 4.0.5, its newest,
 *    finds and maps v2 gateways alone (its discovery asks for
 *    `InternetGatewayDevice:2` only), and miniupnpd, most home routers'
 *    UPnP, advertises v1 by default ("My solution is to default to IGD v1",
 *    github.com/miniupnp/miniupnp/issues/277);
 * 3. NAT-PMP at the default route's gateway, with nat-port-mapper.
 *
 * A scratch fleet names its stand-in gateway's descriptor URL
 * (`CAWCO_UPNP_GATEWAY`): then that gateway alone is asked, by the version
 * its descriptor names, never one SSDP finds and never NAT-PMP, so no
 * request reaches a real router.
 */
import { createSocket } from "node:dgram";
import { readFile } from "node:fs/promises";
import { pmpNat, upnpNat } from "@achingbrain/nat-port-mapper";
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
/** A lease asked for, in seconds, and renewed a minute before it ends. */
const LEASE_S = 3600;
const RENEW_BEFORE_MS = 60_000;
/** UPnP IGD's own words for its device and connection services. */
const IGD_V1 = "urn:schemas-upnp-org:device:InternetGatewayDevice:1";
const IGD_V2 = "urn:schemas-upnp-org:device:InternetGatewayDevice:2";
const CONNECTIONS = [
  "urn:schemas-upnp-org:service:WANIPConnection:1",
  "urn:schemas-upnp-org:service:WANPPPConnection:1",
];
/** UPnP IGD v1's fault for a router that takes only permanent leases (WANIPConnection:1, error 725). */
const ONLY_PERMANENT = 725;

/** A router's port mapper, whatever protocol it answers: one port mapped to itself, and every mapping taken back. */
interface PortGateway {
  map: (port: number, lan: string, protocol: "udp" | "tcp") => Promise<boolean>;
  stop: () => Promise<void>;
  unmap: (port: number, protocol: "udp" | "tcp") => Promise<void>;
}

/** The gateway the relay's ports are mapped on, and how it was reached; none before a map. */
let mapped: { gateway: PortGateway; how: RelayMapHow } | null = null;

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/* ------------------------------------------------------------------ */
/* nat-port-mapper's gateways: UPnP IGD v2 and NAT-PMP                  */
/* ------------------------------------------------------------------ */

type LibraryGateway = Awaited<
  ReturnType<ReturnType<typeof upnpNat>["getGateway"]>
>;

/** A nat-port-mapper gateway as a {@link PortGateway}: its external port must be the one asked. */
const fromLibrary = (gateway: LibraryGateway): PortGateway => ({
  map: async (port, lan, protocol) => {
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
  },
  unmap: async (port) => {
    await gateway.unmap(port).catch(() => undefined);
  },
  stop: async () => {
    await gateway.stop().catch(() => undefined);
  },
});

/** The default route's gateway, from the kernel's routing table (Linux): `/proc/net/route`'s gateway is little-endian hex. */
const defaultGateway = async (): Promise<string | undefined> => {
  const table = await readFile("/proc/net/route", "utf8").catch(() => "");
  for (const line of table.split("\n").slice(1)) {
    const [, destination, gateway] = line.trim().split(/\s+/);
    if (destination === "00000000" && gateway && gateway !== "00000000") {
      const bytes = gateway
        .match(/../g)
        ?.map((hex) => Number.parseInt(hex, 16));
      return bytes ? bytes.reverse().join(".") : undefined;
    }
  }
  return;
};

/* ------------------------------------------------------------------ */
/* UPnP IGD v1                                                          */
/* ------------------------------------------------------------------ */

/** The descriptor URLs that answer an SSDP search for `target` within {@link FIND_MS}. */
const ssdpSearch = (target: string): Promise<string[]> =>
  new Promise((resolve) => {
    const socket = createSocket("udp4");
    const found = new Set<string>();
    const done = () => {
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolve([...found]);
    };
    socket.on("message", (message) => {
      const location = /^location:\s*(\S+)/im.exec(message.toString())?.[1];
      if (location) {
        found.add(location);
      }
    });
    socket.on("error", done);
    socket.bind(0, () => {
      const search = [
        "M-SEARCH * HTTP/1.1",
        "HOST: 239.255.255.250:1900",
        'MAN: "ssdp:discover"',
        "MX: 2",
        `ST: ${target}`,
        "",
        "",
      ].join("\r\n");
      socket.send(search, 1900, "239.255.255.250");
    });
    setTimeout(done, FIND_MS).unref();
  });

/** A descriptor's device type and its WAN connection service (the first of {@link CONNECTIONS} it lists), its control URL made whole. */
const describe = async (
  location: string
): Promise<{ device: string; service?: string; control?: string }> => {
  const response = await fetch(location, { signal: AbortSignal.timeout(FIND_MS) });
  const xml = await response.text();
  const device = /<deviceType>\s*([^<]+?)\s*<\/deviceType>/.exec(xml)?.[1] ?? "";
  for (const block of xml.match(/<service>[\s\S]*?<\/service>/g) ?? []) {
    const service = /<serviceType>\s*([^<]+?)\s*<\/serviceType>/.exec(block)?.[1];
    const control = /<controlURL>\s*([^<]+?)\s*<\/controlURL>/.exec(block)?.[1];
    if (service && control && CONNECTIONS.includes(service)) {
      return { device, service, control: new URL(control, location).toString() };
    }
  }
  return { device };
};

/** One SOAP action on an IGD v1 connection service: answered, or its UPnP error code (and words). */
const soap = async (
  control: string,
  service: string,
  action: string,
  args: [string, string | number][]
): Promise<{ ok: true } | { ok: false; code: number; said: string }> => {
  const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:${action} xmlns:u="${service}">${args.map(([name, value]) => `<${name}>${value}</${name}>`).join("")}</u:${action}></s:Body>
</s:Envelope>`;
  try {
    const response = await fetch(control, {
      method: "POST",
      headers: {
        "content-type": 'text/xml; charset="utf-8"',
        soapaction: `"${service}#${action}"`,
      },
      body,
      signal: AbortSignal.timeout(MAP_MS),
    });
    if (response.ok) {
      return { ok: true };
    }
    const text = await response.text();
    return {
      ok: false,
      code: Number(/<errorCode>\s*(\d+)/.exec(text)?.[1] ?? response.status),
      said:
        /<errorDescription>\s*([^<]+)/.exec(text)?.[1] ?? `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, code: -1, said: said(error) };
  }
};

/**
 * A UPnP IGD v1 gateway (WANIPConnection:1 or WANPPPConnection:1): each port
 * mapped by `AddPortMapping` with a lease of {@link LEASE_S}, renewed a minute
 * before it ends, or a permanent lease where the router takes only those.
 */
const igdV1 = (service: string, control: string): PortGateway => {
  const leases = new Map<string, ReturnType<typeof setTimeout> | null>();
  const add = async (
    port: number,
    lan: string,
    protocol: "udp" | "tcp",
    lease: number
  ) =>
    soap(control, service, "AddPortMapping", [
      ["NewRemoteHost", ""],
      ["NewExternalPort", port],
      ["NewProtocol", protocol.toUpperCase()],
      ["NewInternalPort", port],
      ["NewInternalClient", lan],
      ["NewEnabled", 1],
      ["NewPortMappingDescription", DESCRIPTION],
      ["NewLeaseDuration", lease],
    ]);
  const map = async (
    port: number,
    lan: string,
    protocol: "udp" | "tcp"
  ): Promise<boolean> => {
    const key = `${protocol}:${port}`;
    let answer = await add(port, lan, protocol, LEASE_S);
    let lease = LEASE_S;
    if (!answer.ok && answer.code === ONLY_PERMANENT) {
      answer = await add(port, lan, protocol, 0);
      lease = 0;
    }
    if (!answer.ok) {
      return false;
    }
    const renew =
      lease > 0
        ? setTimeout(() => {
            map(port, lan, protocol).catch(() => undefined);
          }, lease * 1000 - RENEW_BEFORE_MS)
        : null;
    renew?.unref();
    const before = leases.get(key);
    if (before) {
      clearTimeout(before);
    }
    leases.set(key, renew);
    return true;
  };
  const unmap = async (port: number, protocol: "udp" | "tcp") => {
    const key = `${protocol}:${port}`;
    const renew = leases.get(key);
    if (renew) {
      clearTimeout(renew);
    }
    leases.delete(key);
    await soap(control, service, "DeletePortMapping", [
      ["NewRemoteHost", ""],
      ["NewExternalPort", port],
      ["NewProtocol", protocol.toUpperCase()],
    ]);
  };
  return {
    map,
    unmap,
    stop: async () => {
      for (const key of [...leases.keys()]) {
        const [protocol, port] = key.split(":") as ["udp" | "tcp", string];
        // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one change at a time.
        await unmap(Number(port), protocol);
      }
    },
  };
};

/** The IGD v1 gateway at `location`, when its descriptor names a WAN connection service. */
const igdV1At = async (location: string): Promise<PortGateway | undefined> => {
  const found = await describe(location);
  return found.service && found.control
    ? igdV1(found.service, found.control)
    : undefined;
};

/* ------------------------------------------------------------------ */
/* The ways a router is asked, in turn                                  */
/* ------------------------------------------------------------------ */

type Way = [RelayMapHow, string, () => Promise<PortGateway | undefined>];

/** The stand-in's descriptor named: that gateway alone, by the version it names. */
const standInWays = (location: string): Way[] => [
  [
    "UPnP",
    "UPnP",
    async () => {
      const found = await describe(location);
      if (found.device === IGD_V2) {
        return fromLibrary(
          await upnpNat({ description: DESCRIPTION }).getGateway(
            new URL(location),
            { signal: AbortSignal.timeout(FIND_MS) }
          )
        );
      }
      return found.device === IGD_V1 ? igdV1At(location) : undefined;
    },
  ],
];

/** A real router: UPnP IGD v2, then IGD v1, both found by SSDP, then NAT-PMP at the default route's gateway. */
const routerWays = (): Way[] => [
  [
    "UPnP",
    "UPnP IGD v2",
    async () => {
      for await (const gateway of upnpNat({
        description: DESCRIPTION,
      }).findGateways({ signal: AbortSignal.timeout(FIND_MS) })) {
        if (gateway.family === "IPv4") {
          return fromLibrary(gateway);
        }
      }
      return;
    },
  ],
  [
    "UPnP",
    "UPnP IGD v1",
    async () => {
      for (const location of await ssdpSearch(IGD_V1)) {
        // biome-ignore lint/performance/noAwaitInLoops: the first gateway that names a WAN connection is the one.
        const gateway = await igdV1At(location).catch(() => undefined);
        if (gateway) {
          return gateway;
        }
      }
      return;
    },
  ],
  [
    "NAT-PMP",
    "NAT-PMP",
    async () => {
      const at = await defaultGateway();
      return at
        ? fromLibrary(pmpNat(at, { description: DESCRIPTION }))
        : undefined;
    },
  ],
];

/** The listener (and port 80 with `http`): every mapping answered, or none kept. */
const mapListener = async (
  gateway: PortGateway,
  args: RelayMapArgs
): Promise<boolean> => {
  const wanted: [number, "udp" | "tcp"][] = [
    [STREAM_RELAY_PORT, "udp"],
    [STREAM_RELAY_PORT, "tcp"],
    ...(args.http ? [[RELAY_HTTP_PORT, "tcp"] as [number, "tcp"]] : []),
  ];
  for (const [port, protocol] of wanted) {
    // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one mapping at a time.
    if (!(await gateway.map(port, args.lan, protocol))) {
      await gateway.stop();
      return false;
    }
  }
  return true;
};

/** The relay range, port by port: all mapped, or the ones mapped taken back (the range is then a forward by hand). */
const mapRange = async (gateway: PortGateway, lan: string): Promise<boolean> => {
  const [first, last] = STREAM_RELAY_PORTS.relayRange;
  const done: number[] = [];
  for (let port = first; port <= last; port += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one mapping at a time.
    if (!(await gateway.map(port, lan, "udp"))) {
      for (const one of done) {
        // biome-ignore lint/performance/noAwaitInLoops: taken back in turn, as they were made.
        await gateway.unmap(one, "udp");
      }
      return false;
    }
    done.push(port);
  }
  return true;
};

/**
 * `relay.map`: the relay's ports opened on the router to `args.lan`, each
 * way in turn until one maps the listener. What it opened, by how, or why
 * nothing was.
 */
export const mapRelayPorts = async (
  args: RelayMapArgs
): Promise<RelayMapped> => {
  await unmapRelayPorts();
  const named = readEnv(CAWCO_ENV.upnpGateway);
  const tried: string[] = [];
  for (const [how, label, find] of named ? standInWays(named) : routerWays()) {
    // biome-ignore lint/performance/noAwaitInLoops: each way only once the one before did not answer.
    const gateway = await find().catch((error: unknown) => {
      tried.push(`${label}: ${said(error)}`);
      return null;
    });
    if (gateway === null) {
      continue;
    }
    if (!gateway) {
      tried.push(`${label}: no gateway answered`);
      continue;
    }
    if (!(await mapListener(gateway, args))) {
      tried.push(`${label}: the router refused UDP and TCP ${STREAM_RELAY_PORT}`);
      continue;
    }
    mapped = { gateway, how };
    const range = await mapRange(gateway, args.lan);
    console.info(
      `[relay] the router opened UDP and TCP ${STREAM_RELAY_PORT}${args.http ? ` and TCP ${RELAY_HTTP_PORT}` : ""} to ${args.lan} by ${label}${range ? ", and the relay range" : "; it capped the relay range"}`
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
