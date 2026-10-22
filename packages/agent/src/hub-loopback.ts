import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import type { TailnetServing } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import {
  causeOf,
  type PreviewSocket,
  previewFailed,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/core/preview-proxy";
import { isStreamRelayPort } from "@cawco/core/stream-relay";
import type { Server } from "bun";

/**
 * The hub's dashboard and preview ports on this computer's loopback: on any
 * computer running the agent, `http://localhost:3455` (core
 * `localDashboardPort`, a port of CawCo's own, never a dev server's 3000) is
 * the hub's dashboard, carried to the dashboard's port on the hub over the
 * network the agent already reaches it on; on the hub's computer the
 * dashboard's own socket listens on it. Loopback is a secure context, so the hub's
 * `Origin-Agent-Cluster: ?1` holds there and Chromium runs each preview in a
 * process of its own (a frame at 127.0.0.1 attached as its own process with a
 * 13 ms worst dashboard stall, against 2002 ms over a tailnet IP, Chrome 156);
 * a preview at `localhost:<port>` is the dashboard's own site, so its cookies
 * and storage are as in its own tab.
 *
 * Every request goes on as the browser sent it: its Host and its
 * Accept-Encoding, the answer's bytes untouched, gzip and all. It names its
 * hop, `X-Forwarded-Proto: http` and `X-Forwarded-Host` the browser's Host:
 * the first hop is what the dashboard's `publicOrigin` reads (its `/ws` gate
 * holds the page's Origin to it), and what the hub's TLS listeners keep
 * ahead of their own when the loopback carries over https.
 *
 * Over the tailnet, while the hub serves HTTPS on its tailnet name (hub
 * tailnet-https.ts), its tailnet addresses answer plain http with a redirect
 * alone: so when the agent reaches the hub at one of them, the loopback
 * carries over https and wss to that address, verifying the certificate
 * against the name (`serverName`), and needs no MagicDNS on this computer.
 * Elsewhere (the LAN, no tailnet HTTPS) it carries plain http. The hub's
 * register answer and every beat's say which ({@link TailnetServing}), so it
 * follows HTTPS starting and stopping without a restart.
 */
const HOP = "hub loopback";

/** This computer's loopback, by both families: `localhost` is either. */
const LOOPBACK = ["127.0.0.1", "::1"];
/** An IPv6 literal's brackets, as a URL's hostname carries them. */
const BRACKETS = /^\[|\]$/g;
/** 127.0.0.0/8, as itself or IPv4-mapped (`::ffff:127.0.0.1`). */
const LOOPBACK_V4 = /^(?:::ffff:)?127\./i;

/** Whether `address` (as `dns.lookup` answers it) is this computer's loopback: 127.0.0.0/8 or `::1`. */
const loopbackAddress = (address: string): boolean =>
  address === "::1" || LOOPBACK_V4.test(address);

/**
 * The ports the hub's register answer names: the dashboard's on the hub
 * (`hub`) and on every computer's loopback (`local`), and its previews',
 * the same on both.
 */
export interface HubPorts {
  dashboard: { hub: number; local: number };
  previews: { first: number; last: number };
}

export interface HubLoopback {
  /** The hub's tailnet HTTPS as its latest answer says it: the next request carries by it. */
  follow: (tailnet: TailnetServing | undefined) => void;
  stop: () => Promise<void>;
}

/** How the loopback reaches the hub now: plain http, or https verified against the tailnet name. */
type Route = { secure: false } | { secure: true; serverName: string };

/**
 * The route to a hub the agent reaches at `addresses` (its host, resolved):
 * https to the tailnet name when one of them is an address the hub serves
 * HTTPS on, else plain http.
 */
const routeOf = (
  addresses: string[],
  tailnet: TailnetServing | undefined
): Route => {
  const served = new Set(tailnet?.ips.map((ip) => ip.toLowerCase()));
  return tailnet && addresses.some((one) => served.has(one.toLowerCase()))
    ? { secure: true, serverName: tailnet.name }
    : { secure: false };
};

/** `ports` as a person reads them: runs as `3457–3556`. */
const portRuns = (ports: number[]): string => {
  const runs: string[] = [];
  let [start] = ports;
  for (let at = 1; at <= ports.length; at += 1) {
    const port = ports[at];
    const previous = ports[at - 1] as number;
    if (port !== previous + 1) {
      runs.push(start === previous ? `${previous}` : `${start}–${previous}`);
      start = port;
    }
  }
  return runs.join(", ");
};

/** What the browser gets when the hub doesn't answer: WORDS.md's error formula. */
const unreachable = (hub: string, cause: string): Response =>
  new Response(
    `The hub at ${hub} didn't answer (${cause}). This computer's CawCo agent carries localhost to it: check that the agent is connected, then reload.\n`,
    {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );

/** One loopback listener: `hostname:local`, every request and socket carried to `hubHost:port` by the route as it stands. */
const listen = (
  hubHost: string,
  hostname: string,
  local: number,
  port: number,
  route: () => Route
): Server<PreviewSocket> =>
  Bun.serve<PreviewSocket>({
    hostname,
    port: local,
    websocket: previewWebSocket,
    async fetch(request, server) {
      const url = new URL(request.url);
      const at = `${url.pathname}${url.search}`;
      const headers = proxyHeaders(request.headers);
      headers.set("x-forwarded-proto", "http");
      headers.set("x-forwarded-host", request.headers.get("host") ?? url.host);
      const now = route();
      const serverName = now.secure ? now.serverName : undefined;
      const scheme = now.secure ? "s" : "";
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return upgradePreview(
          request,
          server,
          `ws${scheme}://${hubHost}:${port}${at}`,
          headers,
          { hop: HOP, instanceId: null, serverName }
        )
          ? undefined
          : new Response("WebSocket upgrade failed", { status: 400 });
      }
      let answer: Response;
      try {
        answer = await fetch(`http${scheme}://${hubHost}:${port}${at}`, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
          decompress: false,
          ...(serverName ? { tls: { serverName } } : {}),
        });
      } catch (error) {
        previewFailed(
          HOP,
          null,
          `${hubHost}:${port} didn't answer: ${causeOf(error)}`
        );
        return unreachable(`${hubHost}:${port}`, causeOf(error));
      }
      return new Response(answer.body, {
        status: answer.status,
        statusText: answer.statusText,
        headers: proxyHeaders(answer.headers),
      });
    },
    error(error) {
      previewFailed(HOP, null, causeOf(error));
      return unreachable(`${hubHost}:${port}`, causeOf(error));
    },
  });

/**
 * Every pair of `all` (a loopback port, the hub's port it is carried to) on
 * each of `hosts`: what opened, the ports another listener holds, and the
 * loopback addresses this computer does not have (a container with no IPv6
 * has no `::1`). Anything else that fails a bind stops what opened and throws.
 */
async function listenAll(
  hubHost: string,
  hosts: string[],
  all: [local: number, hub: number][],
  route: () => Route
): Promise<{
  absent: string[];
  held: Map<string, number[]>;
  servers: Server<PreviewSocket>[];
}> {
  const servers: Server<PreviewSocket>[] = [];
  const held = new Map<string, number[]>();
  const absent: string[] = [];
  try {
    for (const hostname of hosts) {
      for (const [local, port] of all) {
        try {
          servers.push(listen(hubHost, hostname, local, port, route));
        } catch (error) {
          const { code } = error as { code?: unknown };
          if (code === "EADDRINUSE") {
            held.set(hostname, [...(held.get(hostname) ?? []), local]);
            continue;
          }
          if (code === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT") {
            absent.push(hostname);
            break;
          }
          throw error;
        }
      }
    }
  } catch (error) {
    // What did open goes with the start that failed.
    await Promise.all(servers.map((server) => server.stop(true)));
    throw error;
  }
  return { servers, held, absent };
}

/**
 * Why the hub at `hubHost` (resolved, `addresses`) is on this computer, or
 * undefined when it is elsewhere: the hub's own word (`hostsHub`, its
 * register answer: this machine's id is the hub's), or an address that is
 * this computer's: its loopback ({@link loopbackAddress}) or one of its own
 * interfaces' (obelisk's agent reached its hub at 192.168.3.100, its own LAN
 * address, and took 3455 from its dashboard socket, 2026-10-18).
 */
function onThisComputer(
  addresses: string[],
  hostsHub: boolean
): string | undefined {
  if (hostsHub) {
    return "the hub says this is its own computer";
  }
  if (addresses.some(loopbackAddress)) {
    return "it is this computer's loopback";
  }
  const own = new Set(
    Object.values(networkInterfaces())
      .flat()
      .flatMap((one) => (one ? [one.address] : []))
  );
  const mine = addresses.find((address) => own.has(address));
  return mine ? `${mine} is this computer's own address` : undefined;
}

/** How a route is said in the agent's lines. */
const routeWords = (route: Route): string =>
  route.secure ? `over https as ${route.serverName}` : "over plain http";

/**
 * Serves the hub at `hubUrl` (the address the agent is connected to it on)
 * on this computer's loopback: the dashboard's loopback port, carried to its
 * port on the hub, and every preview port, each to its own. A hub on this
 * computer ({@link onThisComputer}) gets nothing: its dashboard socket listens
 * on the loopback port itself, and a listener of the agent's would only take
 * that port and relay to its own computer. A port another listener holds is
 * said once and left to it. `tailnet` is the hub's tailnet HTTPS as its
 * register answer says it ({@link routeOf}); `follow` takes each later word.
 */
export async function startHubLoopback(
  hubUrl: string,
  ports: HubPorts,
  hostsHub: boolean,
  tailnet: TailnetServing | undefined
): Promise<HubLoopback> {
  const hubHost = new URL(hubUrl).hostname;
  const addresses = (
    await lookup(hubHost.replace(BRACKETS, ""), { all: true })
  ).map((one) => one.address);
  const here = onThisComputer(addresses, hostsHub);
  if (here) {
    console.info(
      `[${HOP}] the hub at ${hubHost} is on this computer (${here}): its dashboard socket is localhost here, so nothing is carried`
    );
    return { follow: () => undefined, stop: async () => undefined };
  }
  return await carryElsewhere(hubHost, addresses, ports, tailnet);
}

/**
 * The hub at `hubHost` (resolved, `addresses`), on another computer, served
 * on this one's loopback by {@link routeOf}. The probe kit's
 * hub-loopback-relay calls it straight: on one computer every address the
 * hub can stand on is this computer's own.
 */
export async function carryElsewhere(
  hubHost: string,
  addresses: string[],
  ports: HubPorts,
  tailnet: TailnetServing | undefined
): Promise<HubLoopback> {
  let route = routeOf(addresses, tailnet);
  /** Each loopback port, and the hub's port it is carried to. */
  const all: [local: number, hub: number][] = [
    [ports.dashboard.local, ports.dashboard.hub],
  ];
  // The hub never gives a preview one of the stream relay's ports (hub
  // preview.ts `barred`), so none is carried: on the relay's machine coturn
  // listens on them, loopback included.
  for (
    let port = ports.previews.first;
    port <= ports.previews.last;
    port += 1
  ) {
    if (!isStreamRelayPort(port)) {
      all.push([port, port]);
    }
  }
  const { servers, held, absent } = await listenAll(
    hubHost,
    LOOPBACK,
    all,
    () => route
  );
  for (const hostname of absent) {
    console.info(
      `[${HOP}] this computer has no ${hostname}, so localhost is served without it`
    );
  }
  for (const [hostname, taken] of held) {
    console.info(
      `[${HOP}] ${hostname} ports ${portRuns(taken)} are held by another program on this computer: left to it`
    );
  }
  console.info(
    `[${HOP}] the hub at ${hubHost} is served on ${LOOPBACK.filter((host) => !absent.includes(host)).join(" and ")} ${routeWords(route)}: http://localhost:${ports.dashboard.local} (its dashboard at :${ports.dashboard.hub}), previews ${ports.previews.first}–${ports.previews.last} (${servers.length} listeners)`
  );
  return {
    follow: (next) => {
      const now = routeOf(addresses, next);
      if (JSON.stringify(now) !== JSON.stringify(route)) {
        route = now;
        console.info(
          `[${HOP}] the hub at ${hubHost} is carried ${routeWords(route)} now`
        );
      }
    },
    stop: async () => {
      await Promise.all(servers.map((server) => server.stop(true)));
    },
  };
}

/** The loopback serving the hub now, by the hub address and ports it was started for. */
let carried: { key: string; loopback: Promise<HubLoopback | null> } | undefined;

/**
 * The hub at `hubUrl` answered the agent's register or beat, naming `ports`,
 * whether this machine is its own computer (`hostsHub`) and its tailnet
 * HTTPS (`tailnet`): its loopback serves that hub. Started on the first
 * register; a register with another hub address (a rediscovery repinned
 * it), other ports or another word stops the one before and starts anew;
 * otherwise the loopback follows `tailnet` as it stands.
 */
export function carryHub(
  hubUrl: string,
  ports: HubPorts,
  hostsHub: boolean,
  tailnet: TailnetServing | undefined
): void {
  const key = JSON.stringify([hubUrl, ports, hostsHub]);
  if (carried?.key === key) {
    followHub(tailnet);
    return;
  }
  const before = carried?.loopback;
  const start = async (): Promise<HubLoopback | null> => {
    await (await before)?.stop();
    try {
      return await startHubLoopback(hubUrl, ports, hostsHub, tailnet);
    } catch (error) {
      console.warn(
        `[${HOP}] the hub at ${hubUrl} isn't served on this computer's loopback: ${causeOf(error)}`
      );
      // The next register tries again.
      if (carried?.key === key) {
        carried = undefined;
      }
      return null;
    }
  };
  carried = { key, loopback: start() };
}

/** A beat's word on the hub's tailnet HTTPS: the loopback carrying the hub follows it. */
export function followHub(tailnet: TailnetServing | undefined): void {
  const now = carried;
  if (now) {
    detach(
      now.loopback.then((loopback) => loopback?.follow(tailnet)),
      "hub loopback follow"
    );
  }
}

/** The agent is stopping: its loopback stops serving the hub. */
export async function stopCarrying(): Promise<void> {
  const was = carried;
  carried = undefined;
  await (await was?.loopback)?.stop();
}
