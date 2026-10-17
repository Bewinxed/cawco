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
 * computer running the agent, `http://localhost:3000` is the hub's
 * dashboard, carried to the hub over the network the agent already reaches
 * it on. Loopback is a secure context, so the hub's
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

/** The ports the hub serves its dashboard and its previews on, as its register answer names them. */
export interface HubPorts {
  dashboard: number;
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

/** One loopback listener: `hostname:port`, every request and socket carried to the same port of `hubHost`. */
const listen = (
  hubHost: string,
  hostname: string,
  port: number
): Server<PreviewSocket> =>
  Bun.serve<PreviewSocket>({
    hostname,
    port,
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
 * Serves the hub at `hubUrl` (the address the agent is connected to it on)
 * on this computer's loopback, at the hub's dashboard port and every preview
 * port. An address the hub itself is reached at is never bound: the hub is
 * on this computer there, its loopback already is the hub, and a listener of
 * its own would relay to itself. A port another listener holds (the hub's,
 * on its own computer) is said once and left to it.
 */
export async function startHubLoopback(
  hubUrl: string,
  ports: HubPorts
): Promise<HubLoopback> {
  const hubHost = new URL(hubUrl).hostname;
  const hubAddresses = new Set(
    (await lookup(hubHost.replace(BRACKETS, ""), { all: true })).map(
      (one) => one.address
    )
  );
  const hosts = LOOPBACK.filter((host) => !hubAddresses.has(host));
  if (hosts.length === 0) {
    console.info(
      `[${HOP}] the hub at ${hubHost} is on this computer: its own loopback is the hub, so nothing is carried`
    );
    return { stop: async () => undefined };
  }
  const all = [ports.dashboard];
  for (
    let port = ports.previews.first;
    port <= ports.previews.last;
    port += 1
  ) {
    all.push(port);
  }
  const servers: Server<PreviewSocket>[] = [];
  const held = new Map<string, number[]>();
  try {
    for (const hostname of hosts) {
      for (const port of all) {
        try {
          servers.push(listen(hubHost, hostname, port));
        } catch (error) {
          if ((error as { code?: unknown }).code !== "EADDRINUSE") {
            throw error;
          }
          held.set(hostname, [...(held.get(hostname) ?? []), port]);
        }
      }
    }
  } catch (error) {
    // What did open goes with the start that failed.
    await Promise.all(servers.map((server) => server.stop(true)));
    throw error;
  }
  for (const [hostname, taken] of held) {
    console.info(
      `[${HOP}] ${hostname} ports ${portRuns(taken)} are held by another listener (the hub's own, on its computer): left to it`
    );
  }
  console.info(
    `[${HOP}] the hub at ${hubHost} is served on ${hosts.join(" and ")}: http://localhost:${ports.dashboard}, previews ${ports.previews.first}–${ports.previews.last} (${servers.length} listeners)`
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
