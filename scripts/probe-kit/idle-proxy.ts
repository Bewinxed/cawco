/**
 * An HTTP proxy a page's context goes through (kit `PageOptions.proxy`),
 * standing for what is between the owner's browser and his hub: Cloudflare
 * in front of `outpost`, which closes a WebSocket "when no data is
 * transmitted in either direction for a period of time" and on its own
 * restarts (developers.cloudflare.com/network/websockets).
 *
 * Chromium and Firefox send a `ws://` socket through an HTTP proxy as a
 * CONNECT tunnel, whose upgrade's request line the proxy reads in it;
 * WebKit sends the upgrade itself, its URL absolute. Either way a spec
 * names a socket by its path. Every tunnel that carries no byte either way
 * for `idleMs` is cut, both ends at once and with no close frame, so the
 * page reads 1006, as it does from a proxy's drop. A tunnel the spec
 * stalls carries nothing either way and is never closed, as a dropped
 * network or a sleeping laptop leaves an open socket. Plain requests are
 * passed on as they are.
 */
import http from "node:http";
import net from "node:net";

/** One tunnel: where it goes, the path of the upgrade it carries, and its sockets. */
interface Tunnel {
  client: net.Socket;
  last: number;
  path: string | null;
  /** Carrying nothing either way, never cut for idling, its upstream's close kept from the page. */
  stalled: boolean;
  target: string;
  upstream: net.Socket;
}

export interface IdleProxy {
  /** Cuts every open tunnel whose upgrade's path `matches`, now: what a proxy's restart does. The count cut. */
  drop: (matches: (path: string) => boolean) => number;
  /** Tunnels cut for idling, by their upgrade's path. */
  idleCuts: () => string[];
  /** While set, a new tunnel whose upgrade's path `matches` is cut before it reaches the hub (a link that doesn't come back); null lets them through. */
  refuse: (matches: ((path: string) => boolean) | null) => void;
  /**
   * While set, every tunnel whose upgrade's path `matches`, open now or
   * opened later, stops carrying bytes and is never closed: a link gone
   * silent. Null forwards again, the stalled tunnels cut as a network that
   * comes back resets the connections that died on it. The count stalled now.
   */
  stall: (matches: ((path: string) => boolean) | null) => number;
  stop: () => void;
  /** The paths of the tunnels open now. */
  tunnels: () => string[];
  url: string;
}

const REQUEST_LINE = /^[A-Z]+ (\S+) HTTP\/1\.1\r\n/u;
/** An upgrade sent to the proxy whole (WebKit's), and how much of a head tells one apart. */
const WS_LINE = /^GET wss?:\/\//u;
const WS_PREFIX = "GET wss://".length;

/** The proxy, its tunnels cut once idle for `idleMs`. */
export async function idleProxy(idleMs: number): Promise<IdleProxy> {
  const open = new Set<Tunnel>();
  const idleCuts: string[] = [];
  let refusing: ((path: string) => boolean) | null = null;
  let stalling: ((path: string) => boolean) | null = null;
  const cut = (tunnel: Tunnel) => {
    open.delete(tunnel);
    tunnel.client.destroy();
    tunnel.upstream.destroy();
  };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/");
    const { "proxy-connection": _, ...headers } = request.headers;
    const onward = http.request(
      {
        host: url.hostname,
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers,
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      }
    );
    onward.on("error", () => response.destroy());
    request.pipe(onward);
  });
  /**
   * A tunnel from `client` to `host:hostPort`, tracked for idling: `opened`
   * runs once the upstream connects; `path` is known already (an upgrade
   * sent to the proxy whole) or read from the first bytes through it.
   */
  const openTunnel = (
    client: net.Socket,
    host: string,
    hostPort: number,
    path: string | null,
    opened: (upstream: net.Socket) => void
  ) => {
    const upstream = net.connect(hostPort, host);
    const made: Tunnel = {
      client,
      upstream,
      target: `${host}:${hostPort}`,
      path,
      last: Date.now(),
      stalled: path !== null && stalling?.(path) === true,
    };
    open.add(made);
    upstream.on("connect", () => {
      if (!made.stalled) {
        opened(upstream);
      }
    });
    wire(made);
  };
  // Chromium and Firefox send a `ws://` socket as a CONNECT tunnel.
  server.on("connect", (request, client: net.Socket, head: Buffer) => {
    const target = request.url ?? "";
    const at = target.lastIndexOf(":");
    openTunnel(
      client,
      target.slice(0, at),
      Number(target.slice(at + 1)),
      null,
      (upstream) => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) {
          upstream.write(head);
        }
      }
    );
  });
  /**
   * WebKit sends a `ws://` socket to the proxy whole: `GET ws://host:port/path`.
   * Bun's node:http answers that line 400 where node emits `upgrade` (Bun
   * keeps parsing an upgraded connection: oven-sh/bun#28157, #28396), so
   * it is read off the raw socket here, its head sent on in origin form.
   */
  const wsUpgrade = (client: net.Socket, head: string) => {
    const end = head.indexOf("\r\n\r\n");
    const [line = "", ...fields] = head.slice(0, end).split("\r\n");
    const url = new URL(line.split(" ")[1] ?? "/");
    const path = `${url.pathname}${url.search}`;
    if (refusing?.(path)) {
      client.destroy();
      return;
    }
    const kept = fields.filter(
      (field) => !field.toLowerCase().startsWith("proxy-connection:")
    );
    openTunnel(
      client,
      url.hostname,
      Number(url.port || 80),
      path,
      (upstream) => {
        upstream.write(
          `GET ${path} HTTP/1.1\r\n${kept.join("\r\n")}\r\n\r\n${head.slice(end + 4)}`,
          "latin1"
        );
      }
    );
  };
  /** Where every connection lands: a whole `ws://` upgrade is tunnelled here, the rest goes to {@link server}. */
  const front = net.createServer((client) => {
    let head = "";
    const first = (chunk: Buffer) => {
      head += chunk.toString("latin1");
      if (head.length < WS_PREFIX && !head.includes("\r\n")) {
        return;
      }
      if (!WS_LINE.test(head)) {
        client.off("data", first);
        client.pause();
        const inner = net.connect(innerPort, "127.0.0.1", () => {
          inner.write(Buffer.from(head, "latin1"));
          client.pipe(inner);
          inner.pipe(client);
        });
        const close = () => {
          inner.destroy();
          client.destroy();
        };
        inner.on("error", close);
        client.on("error", close);
        inner.on("close", close);
        client.on("close", close);
        return;
      }
      if (head.includes("\r\n\r\n")) {
        client.off("data", first);
        wsUpgrade(client, head);
      }
    };
    client.on("data", first);
  });
  let innerPort = 0;
  /** Carries a tunnel's bytes both ways, its last byte's time kept; the first through a CONNECT names its path. */
  function wire(tunnel: Tunnel) {
    const { client, upstream } = tunnel;
    client.on("data", (chunk: Buffer) => {
      tunnel.last = Date.now();
      if (tunnel.path === null) {
        tunnel.path = REQUEST_LINE.exec(chunk.toString("latin1"))?.[1] ?? "";
        if (refusing?.(tunnel.path)) {
          cut(tunnel);
          return;
        }
        tunnel.stalled = stalling?.(tunnel.path) === true;
      }
      if (!tunnel.stalled) {
        upstream.write(chunk);
      }
    });
    upstream.on("data", (chunk: Buffer) => {
      tunnel.last = Date.now();
      if (!tunnel.stalled) {
        client.write(chunk);
      }
    });
    const end = () => {
      if (open.has(tunnel)) {
        cut(tunnel);
      }
    };
    // A stalled tunnel's far end closing never reaches the page: the network between is dead.
    const upstreamEnd = () => {
      if (tunnel.stalled) {
        upstream.destroy();
        return;
      }
      end();
    };
    client.on("close", end);
    upstream.on("close", upstreamEnd);
    client.on("error", end);
    upstream.on("error", upstreamEnd);
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const tunnel of open) {
      if (!tunnel.stalled && now - tunnel.last > idleMs) {
        idleCuts.push(tunnel.path ?? tunnel.target);
        cut(tunnel);
      }
    }
  }, 100);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  innerPort = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) =>
    front.listen(0, "127.0.0.1", () => resolve())
  );
  const { port } = front.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    drop: (matches) => {
      let count = 0;
      for (const tunnel of [...open]) {
        if (tunnel.path !== null && matches(tunnel.path)) {
          cut(tunnel);
          count += 1;
        }
      }
      return count;
    },
    idleCuts: () => [...idleCuts],
    refuse: (matches) => {
      refusing = matches;
    },
    stall: (matches) => {
      stalling = matches;
      let count = 0;
      for (const tunnel of [...open]) {
        if (matches === null) {
          if (tunnel.stalled) {
            cut(tunnel);
          }
        } else if (tunnel.path !== null && matches(tunnel.path)) {
          tunnel.stalled = true;
          count += 1;
        }
      }
      return count;
    },
    tunnels: () =>
      [...open].map((tunnel) => tunnel.path ?? `(${tunnel.target})`),
    stop: () => {
      clearInterval(sweep);
      for (const tunnel of [...open]) {
        cut(tunnel);
      }
      front.close();
      server.close();
    },
  };
}
