/**
 * The local host's forward proxy. A PAC script cannot keep a local Chromium
 * off the hub: Chromium's net/docs/proxy.md says "there currently is no
 * mechanism to disable the implicit proxy bypass rules when using a PAC
 * script", and those rules match loopback. A manually configured proxy takes
 * loopback through with `--proxy-bypass-list=<-loopback>` (same document, M72),
 * so the local host's Chromium goes through this proxy, which refuses any
 * target on the hub's ports (hub-ports.ts) on any host and passes the rest:
 * a `CONNECT` as a TCP tunnel, a plain request in absolute form as a forward.
 * It starts with the first local browser and lives as long as the agent.
 */

import { createServer, request, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import { Backoff, type BackoffPolicy } from "@cawco/core/backoff";
import { BROWSER_PROXY_PORT } from "@cawco/core/browser";
import { hubPorts } from "../hub-ports";

/** The proxy's address as a Chromium's `--proxy-server` names it. */
export const hubProxyUrl = (): string =>
  `http://127.0.0.1:${BROWSER_PROXY_PORT}`;

const refuse = (socket: Socket): void => {
  socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
};

/** The host and port of a `CONNECT` target, `host:port` or `[v6]:port`. */
const authority = (target: string): { host: string; port: number } => {
  const at = target.lastIndexOf(":");
  return {
    host: target.slice(0, at).replace(/^\[|\]$/gu, ""),
    port: Number(target.slice(at + 1)),
  };
};

const server = (): Server => {
  const proxy = createServer((req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "");
    } catch {
      res.writeHead(400, { Connection: "close" }).end();
      return;
    }
    const port = Number(url.port || 80);
    if (url.protocol !== "http:" || hubPorts().includes(port)) {
      res.writeHead(403, { Connection: "close" }).end();
      return;
    }
    const out = request(
      {
        host: url.hostname.replace(/^\[|\]$/gu, ""),
        port,
        method: req.method,
        path: url.pathname + url.search,
        headers: req.headers,
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      }
    );
    out.on("error", () => res.destroy());
    req.pipe(out);
  });
  proxy.on("connect", (req, client: Socket, head) => {
    const { host, port } = authority(req.url ?? "");
    if (!(host && Number.isInteger(port)) || hubPorts().includes(port)) {
      refuse(client);
      return;
    }
    const upstream = connect(port, host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => client.destroy());
  });
  return proxy;
};

/**
 * Binding the port an older agent holds, tried again: from 1 s, doubling to
 * 30 s, for ten minutes (an update's handover ends the older agent within
 * its drain); then this agent goes on without its own proxy, and says so.
 */
const BINDS: BackoffPolicy = {
  firstMs: 1000,
  mostMs: 30_000,
  giveUp: { afterMs: 10 * 60_000 },
};

let started: Promise<void> | undefined;

/**
 * Starts the proxy once for the agent's life. A port held already is an older
 * agent's, whose proxy serves the same rule: this resolves at once, and the
 * binding goes on in the background, every second, until this process holds
 * the port, so the proxy is not lost when the older agent ends (an update's
 * handover). Any other listen error rejects.
 */
export const startHubProxy = (): Promise<void> => {
  started ??= new Promise<void>((resolve, reject) => {
    const proxy = server();
    const binds = new Backoff(BINDS);
    const bind = (): void => {
      proxy.listen(BROWSER_PROXY_PORT, "127.0.0.1");
    };
    proxy.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve();
        const step = binds.failed();
        if (step.kind === "gave-up") {
          console.warn(
            `[browser] the hub proxy's port ${BROWSER_PROXY_PORT} is still held by another process after ${Math.round(step.failingMs / 1000)} s; this agent stops trying to bind it, and that process's proxy serves`
          );
          return;
        }
        setTimeout(bind, step.ms).unref();
        return;
      }
      started = undefined;
      reject(error);
    });
    proxy.on("listening", () => resolve());
    bind();
  });
  return started;
};
