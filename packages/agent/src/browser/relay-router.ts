/**
 * The stream relay's ports opened on this machine's router (the journey's
 * router step, core stream-relay.ts `relay.map`), asked only once the person
 * pressed "Open the ports": UDP and TCP 3478 and TCP 5349 (TURN over TLS),
 * then the UDP relay range port by port. A router whose table
 * caps the range keeps the listener mapped and the range is a forward by
 * hand. `relay.remove` takes every mapping back.
 *
 * Asked in turn, the first that answers maps:
 * 1. UPnP, with `@runonflux/nat-upnp` ("UPnP port mapping client for Node.js
 *    with IGD v1/v2 support", github.com/RunOnFlux/nat-upnp): the gateway
 *    SSDP finds, its WAN connection service (IGD v2's before v1's), each port
 *    by `AddPortMapping`, asked again for a permanent lease where the router
 *    takes only those (725, OnlyPermanentLeasesSupported);
 * 2. NAT-PMP at the default route's gateway (`default-gateway`), with
 *    `@achingbrain/nat-port-mapper`'s NAT-PMP client. Its UPnP is not used:
 *    under Bun its every UPnP call fails (its `device.run` hands `protocol:
 *    'udp'` to `fetch`, which Bun refuses: "fetch: 'protocol' must be
 *    "http2", "h2", "http3", "h3", "http1.1", or "h1"").
 *
 * What neither library does is ours, each part saying why where it stands:
 * the leases' renewal ({@link holding}), a fresh NAT-PMP client past an
 * unanswered request ({@link natPmpClient}), and the relay's own ports, the
 * range taken back when the router caps it ({@link mapRange}).
 *
 * A scratch fleet names its stand-in gateways (`CAWCO_UPNP_GATEWAY`, a
 * descriptor URL; `CAWCO_NAT_PMP_GATEWAY`, an address): then only those are
 * asked, never SSDP and never the default route, so no request reaches a
 * real router.
 */
import { type MapPortOptions, pmpNat } from "@achingbrain/nat-port-mapper";
import { CAWCO_ENV, readEnv } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import {
  type RelayMapArgs,
  type RelayMapHow,
  type RelayMapped,
  STREAM_RELAY_PORT,
  STREAM_RELAY_PORTS,
  STREAM_RELAY_TLS_PORT,
} from "@cawco/core/stream-relay";
import { Client } from "@runonflux/nat-upnp";
import { gateway4async } from "default-gateway";

/** How long a gateway has to be found, and each mapping to be answered. */
const FIND_MS = 5000;
const MAP_MS = 5000;
/** What the router's table names each mapping as. */
const DESCRIPTION = "CawCo stream relay";
/** A lease asked for, in seconds, and renewed a minute before it ends. */
const LEASE_S = 3600;
const RENEW_BEFORE_MS = 60_000;

type Protocol = "udp" | "tcp";

/** One protocol's client for one router: a port mapped to itself on the relay's machine, one taken back, and the client closed. */
interface PortClient {
  close: () => Promise<void>;
  map: (port: number, protocol: Protocol) => Promise<boolean>;
  unmap: (port: number, protocol: Protocol) => Promise<void>;
}

/** The relay's mappings on one router: made, taken back, and every one taken back on `stop`. */
interface PortGateway {
  map: (port: number, protocol: Protocol) => Promise<boolean>;
  stop: () => Promise<void>;
  unmap: (port: number, protocol: Protocol) => Promise<void>;
}

/** `read` given `ms` to answer (core bounded.ts `readWithin`); unanswered, it throws saying what went unanswered. */
const within = async <T>(
  ms: number,
  what: string,
  read: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const answer = await readWithin(ms, read);
  if (answer.kind === "unanswered") {
    throw new Error(`${what}: no answer within ${ms} ms`);
  }
  return answer.value;
};

/** The gateway the relay's ports are mapped on, and how it was reached; none before a map. */
let mapped: { gateway: PortGateway; how: RelayMapHow } | null = null;

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const keyOf = (port: number, protocol: Protocol) => `${protocol}:${port}`;
const portOf = (key: string): [number, Protocol] => {
  const [protocol, port] = key.split(":") as [Protocol, string];
  return [Number(port), protocol];
};

/**
 * The mappings `client` makes, held: each asked again a minute before its
 * lease ends, and every one taken back on `stop`. Ours because neither
 * library renews one here: nat-upnp has no renewal, and nat-port-mapper's
 * (`autoRefresh`) sends its own unmap's delete again without end (904 times
 * in a second against the stand-in) and keys its timers by port alone, so
 * UDP and TCP 3478 share one.
 */
const holding = (client: PortClient): PortGateway => {
  const held = new Set<string>();
  let renewal: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const renewAll = async () => {
    for (const key of [...held]) {
      if (held.has(key) && !stopped) {
        // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one mapping at a time.
        await client.map(...portOf(key));
      }
    }
    if (!stopped) {
      schedule();
    }
  };
  const schedule = () => {
    renewal = setTimeout(
      () => {
        renewAll().catch(() => undefined);
      },
      LEASE_S * 1000 - RENEW_BEFORE_MS
    );
    renewal.unref();
  };
  const unmap = async (port: number, protocol: Protocol) => {
    held.delete(keyOf(port, protocol));
    await client.unmap(port, protocol);
  };
  return {
    map: async (port, protocol) => {
      const ok = await client.map(port, protocol);
      if (ok) {
        held.add(keyOf(port, protocol));
        if (!renewal) {
          schedule();
        }
      }
      return ok;
    },
    unmap,
    stop: async () => {
      stopped = true;
      clearTimeout(renewal);
      for (const key of [...held]) {
        // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one change at a time.
        await unmap(...portOf(key));
      }
      await client.close();
    },
  };
};

/**
 * nat-upnp's client for the gateway described at `url`, or the one SSDP
 * finds (kept between calls, `cacheGateway`, or each call searches again),
 * every mapping to `lan`: none when no gateway describes itself within
 * {@link FIND_MS}.
 */
const upnpClient = async (
  lan: string,
  url: string | undefined
): Promise<PortClient | undefined> => {
  const client = new Client(
    url
      ? { url, localAddress: lan }
      : { localAddress: lan, timeout: FIND_MS, cacheGateway: true }
  );
  const device = await within(FIND_MS, "the UPnP gateway", async (signal) =>
    (await client.getGateway({ signal })).getDevice()
  ).catch((error: unknown) => {
    client.close();
    throw error;
  });
  if (!device) {
    client.close();
    return;
  }
  return {
    map: async (port, protocol) => {
      try {
        await within(MAP_MS, `UPnP ${protocol} ${port}`, (signal) =>
          client.createMapping({
            public: port,
            private: { port, host: lan },
            protocol,
            description: DESCRIPTION,
            ttl: LEASE_S,
            signal,
          })
        );
        return true;
      } catch {
        return false;
      }
    },
    unmap: async (port, protocol) => {
      await within(MAP_MS, `UPnP ${protocol} ${port} taken back`, (signal) =>
        client.removeMapping({ public: port, protocol, signal })
      ).catch(() => undefined);
    },
    close: () => Promise.resolve(client.close()),
  };
};

/**
 * nat-port-mapper's NAT-PMP client for the gateway at `at`, every mapping
 * from this machine (NAT-PMP maps the asking address) to its own port: none
 * when the gateway doesn't answer for its external address within
 * {@link FIND_MS}. Its refresh is off ({@link holding} renews), so its `ttl`
 * reaches only the request's lifetime field, which is seconds (RFC 6886
 * §3.3), though its types say ms. It sends each request once and holds its
 * queue behind one unanswered, so an unanswered request closes it and opens
 * a fresh one.
 */
const natPmpClient = async (
  at: string,
  lan: string
): Promise<PortClient | undefined> => {
  const open = () =>
    pmpNat(at, { description: DESCRIPTION, autoRefresh: false });
  let nat = open();
  const ask = async <T>(
    what: string,
    ms: number,
    read: (signal: AbortSignal) => Promise<T>
  ): Promise<T> => {
    const answer = await readWithin(ms, read);
    if (answer.kind === "unanswered") {
      await nat.stop().catch(() => undefined);
      nat = open();
      throw new Error(`${what}: no answer within ${ms} ms`);
    }
    return answer.value;
  };
  let found: string;
  try {
    found = await ask("the NAT-PMP gateway", FIND_MS, (signal) =>
      nat.externalIp({ signal })
    );
  } catch (error) {
    await nat.stop().catch(() => undefined);
    throw error;
  }
  if (!found) {
    await nat.stop().catch(() => undefined);
    return;
  }
  const unmap = async (port: number, protocol: Protocol) => {
    // Its unmap is its map at lifetime 0 with these options spread in: the
    // protocol (its own default is TCP), and its refresh off, which on sends
    // the delete again without end.
    const off: MapPortOptions = { protocol, autoRefresh: false };
    await ask(`NAT-PMP ${protocol} ${port} taken back`, MAP_MS, (signal) =>
      nat.unmap(port, { ...off, signal })
    ).catch(() => undefined);
  };
  return {
    map: async (port, protocol) => {
      try {
        const mapping = await ask(
          `NAT-PMP ${protocol} ${port}`,
          MAP_MS,
          (signal) =>
            nat.map(port, lan, {
              protocol,
              externalPort: port,
              ttl: LEASE_S,
              autoRefresh: false,
              description: DESCRIPTION,
              signal,
            })
        );
        if (mapping.externalPort === port) {
          return true;
        }
        // Another port given in its place: the relay needs its own, so that one goes back.
        await unmap(port, protocol);
        return false;
      } catch {
        return false;
      }
    },
    unmap,
    close: async () => {
      await nat.stop().catch(() => undefined);
    },
  };
};

type Way = [RelayMapHow, () => Promise<PortClient | undefined>];

/** The stand-ins named: those alone. A real router: UPnP by SSDP, then NAT-PMP at the default route's gateway. */
const waysFor = (lan: string): Way[] => {
  const upnp = readEnv(CAWCO_ENV.upnpGateway);
  const natPmp = readEnv(CAWCO_ENV.natPmpGateway);
  if (upnp || natPmp) {
    const named: Way[] = [];
    if (upnp) {
      named.push(["UPnP", () => upnpClient(lan, upnp)]);
    }
    if (natPmp) {
      named.push(["NAT-PMP", () => natPmpClient(natPmp, lan)]);
    }
    return named;
  }
  return [
    ["UPnP", () => upnpClient(lan, undefined)],
    ["NAT-PMP", async () => natPmpClient((await gateway4async()).gateway, lan)],
  ];
};

/** The listeners, UDP and TCP 3478 and TCP 5349: every mapping answered, or none kept. */
const mapListener = async (gateway: PortGateway): Promise<boolean> => {
  const wanted: [number, Protocol][] = [
    [STREAM_RELAY_PORT, "udp"],
    [STREAM_RELAY_PORT, "tcp"],
    [STREAM_RELAY_TLS_PORT, "tcp"],
  ];
  for (const [port, protocol] of wanted) {
    // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one mapping at a time.
    if (!(await gateway.map(port, protocol))) {
      await gateway.stop();
      return false;
    }
  }
  return true;
};

/** The relay range, port by port: all mapped, or the ones mapped taken back (the range is then a forward by hand). */
const mapRange = async (gateway: PortGateway): Promise<boolean> => {
  const [first, last] = STREAM_RELAY_PORTS.relayRange;
  const done: number[] = [];
  for (let port = first; port <= last; port += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a router's table takes one mapping at a time.
    if (!(await gateway.map(port, "udp"))) {
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
  const tried: string[] = [];
  for (const [how, find] of waysFor(args.lan)) {
    // biome-ignore lint/performance/noAwaitInLoops: each way only once the one before did not answer.
    const client = await find().catch((error: unknown) => {
      tried.push(`${how}: ${said(error)}`);
      return null;
    });
    if (client === null) {
      continue;
    }
    if (!client) {
      tried.push(`${how}: no gateway answered`);
      continue;
    }
    const gateway = holding(client);
    if (!(await mapListener(gateway))) {
      tried.push(
        `${how}: the router refused UDP and TCP ${STREAM_RELAY_PORT} or TCP ${STREAM_RELAY_TLS_PORT}`
      );
      continue;
    }
    mapped = { gateway, how };
    const range = await mapRange(gateway);
    console.info(
      `[relay] the router opened UDP and TCP ${STREAM_RELAY_PORT} and TCP ${STREAM_RELAY_TLS_PORT} to ${args.lan} by ${how}${range ? ", and the relay range" : "; it capped the relay range"}`
    );
    return { how, listener: true, range };
  }
  console.info(`[relay] the router opened nothing: ${tried.join("; ")}`);
  return { how: null, listener: false, range: false, why: tried.join("; ") };
};

/** Every mapping the relay asked for taken back, and the leases' renewal with them. */
export const unmapRelayPorts = async (): Promise<void> => {
  const was = mapped;
  mapped = null;
  await was?.gateway.stop().catch(() => undefined);
};
