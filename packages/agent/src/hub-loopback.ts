import { lookup } from "node:dns/promises";
import {
  causeOf,
  type PreviewSocket,
  previewFailed,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/core/preview-proxy";
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
 * Every request goes on as the browser sent it: its Host (the dashboard's
 * `publicOrigin` reads it, and its `/ws` gate holds the page's Origin to it)
 * and its Accept-Encoding, the answer's bytes untouched, gzip and all. No
 * `X-Forwarded-*` is added: `publicOrigin` would read those first.
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
  stop: () => Promise<void>;
}

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

/** One loopback listener: `hostname:local`, every request and socket carried to `hubHost:port`. */
const listen = (
  hubHost: string,
  hostname: string,
  local: number,
  port: number
): Server<PreviewSocket> =>
  Bun.serve<PreviewSocket>({
    hostname,
    port: local,
    websocket: previewWebSocket,
    async fetch(request, server) {
      const url = new URL(request.url);
      const at = `${url.pathname}${url.search}`;
      const headers = proxyHeaders(request.headers);
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return upgradePreview(
          request,
          server,
          `ws://${hubHost}:${port}${at}`,
          headers,
          { hop: HOP, instanceId: null }
        )
          ? undefined
          : new Response("WebSocket upgrade failed", { status: 400 });
      }
      let answer: Response;
      try {
        answer = await fetch(`http://${hubHost}:${port}${at}`, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
          decompress: false,
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
  all: [local: number, hub: number][]
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
          servers.push(listen(hubHost, hostname, local, port));
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
 * Serves the hub at `hubUrl` (the address the agent is connected to it on)
 * on this computer's loopback: the dashboard's loopback port, carried to its
 * port on the hub, and every preview port, each to its own. A hub reached at
 * a loopback address ({@link loopbackAddress}) is on this computer, whose
 * dashboard socket listens on the loopback port itself: nothing is carried,
 * as a listener of the agent's would only relay to its own computer. A port
 * another listener holds is said once and left to it.
 */
export async function startHubLoopback(
  hubUrl: string,
  ports: HubPorts
): Promise<HubLoopback> {
  const hubHost = new URL(hubUrl).hostname;
  const hubAddresses = (
    await lookup(hubHost.replace(BRACKETS, ""), { all: true })
  ).map((one) => one.address);
  if (hubAddresses.some(loopbackAddress)) {
    console.info(
      `[${HOP}] the hub at ${hubHost} is on this computer: its own loopback is the hub, so nothing is carried`
    );
    return { stop: async () => undefined };
  }
  /** Each loopback port, and the hub's port it is carried to. */
  const all: [local: number, hub: number][] = [
    [ports.dashboard.local, ports.dashboard.hub],
  ];
  for (
    let port = ports.previews.first;
    port <= ports.previews.last;
    port += 1
  ) {
    all.push([port, port]);
  }
  const { servers, held, absent } = await listenAll(hubHost, LOOPBACK, all);
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
    `[${HOP}] the hub at ${hubHost} is served on ${LOOPBACK.filter((host) => !absent.includes(host)).join(" and ")}: http://localhost:${ports.dashboard.local} (its dashboard at :${ports.dashboard.hub}), previews ${ports.previews.first}–${ports.previews.last} (${servers.length} listeners)`
  );
  return {
    stop: async () => {
      await Promise.all(servers.map((server) => server.stop(true)));
    },
  };
}

/** The loopback serving the hub now, by the hub address and ports it was started for. */
let carried: { key: string; loopback: Promise<HubLoopback | null> } | undefined;

/**
 * The agent registered with the hub at `hubUrl`, which named `ports`: its
 * loopback serves that hub. Started on the first register; a register with
 * another hub address (a rediscovery repinned it) or other ports stops the
 * one before and starts anew.
 */
export function carryHub(hubUrl: string, ports: HubPorts): void {
  const key = JSON.stringify([hubUrl, ports]);
  if (carried?.key === key) {
    return;
  }
  const before = carried?.loopback;
  const start = async (): Promise<HubLoopback | null> => {
    await (await before)?.stop();
    try {
      return await startHubLoopback(hubUrl, ports);
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

/** The agent is stopping: its loopback stops serving the hub. */
export async function stopCarrying(): Promise<void> {
  const was = carried;
  carried = undefined;
  await (await was?.loopback)?.stop();
}
