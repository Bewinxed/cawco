/**
 * An HTTP proxy a page's context goes through (kit `PageOptions.proxy`),
 * standing for what is between the owner's browser and his hub: Cloudflare
 * in front of `outpost`, which closes a WebSocket "when no data is
 * transmitted in either direction for a period of time" and on its own
 * restarts (developers.cloudflare.com/network/websockets).
 *
 * Chromium sends a `ws://` socket through an HTTP proxy as a CONNECT
 * tunnel; the proxy reads the upgrade's request line in it, so a spec
 * names a socket by its path. Every tunnel that carries no byte either way
 * for `idleMs` is cut, both ends at once and with no close frame, so the
 * page reads 1006, as it does from a proxy's drop. Plain requests are
 * passed on as they are.
 */
import http from "node:http";
import net from "node:net";

/** One tunnel: where it goes, the path of the upgrade it carries, and its sockets. */
interface Tunnel {
  client: net.Socket;
  last: number;
  path: string | null;
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
  stop: () => void;
  /** The paths of the tunnels open now. */
  tunnels: () => string[];
  url: string;
}

const REQUEST_LINE = /^[A-Z]+ (\S+) HTTP\/1\.1\r\n/;

/** The proxy, its tunnels cut once idle for `idleMs`. */
export async function idleProxy(idleMs: number): Promise<IdleProxy> {
  const open = new Set<Tunnel>();
  const idleCuts: string[] = [];
  let refusing: ((path: string) => boolean) | null = null;
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
  server.on("connect", (request, client: net.Socket, head: Buffer) => {
    const target = request.url ?? "";
    const at = target.lastIndexOf(":");
    const upstream = net.connect(
      Number(target.slice(at + 1)),
      target.slice(0, at)
    );
    const tunnel: Tunnel = {
      client,
      upstream,
      target,
      path: null,
      last: Date.now(),
    };
    open.add(tunnel);
    upstream.on("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) {
        upstream.write(head);
      }
    });
    client.on("data", (chunk: Buffer) => {
      tunnel.last = Date.now();
      if (tunnel.path === null) {
        tunnel.path = REQUEST_LINE.exec(chunk.toString("latin1"))?.[1] ?? "";
        if (refusing?.(tunnel.path)) {
          cut(tunnel);
          return;
        }
      }
      upstream.write(chunk);
    });
    upstream.on("data", (chunk: Buffer) => {
      tunnel.last = Date.now();
      client.write(chunk);
    });
    const end = () => {
      if (open.has(tunnel)) {
        cut(tunnel);
      }
    };
    client.on("close", end);
    upstream.on("close", end);
    client.on("error", end);
    upstream.on("error", end);
  });
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const tunnel of open) {
      if (now - tunnel.last > idleMs) {
        idleCuts.push(tunnel.path ?? tunnel.target);
        cut(tunnel);
      }
    }
  }, 100);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  const { port } = server.address() as net.AddressInfo;
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
    tunnels: () =>
      [...open].map((tunnel) => tunnel.path ?? `(${tunnel.target})`),
    stop: () => {
      clearInterval(sweep);
      for (const tunnel of [...open]) {
        cut(tunnel);
      }
      server.close();
    },
  };
}
