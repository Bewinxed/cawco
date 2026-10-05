/** Bun's net layer adopts fds; its HTTP layer (1.4.2) does not. */
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HEADER = "x-cawco-relay-token";
const peers = new Map();
const channels = new WeakMap();

/** First-request nonce binds the HTTP socket to its real accepted peer. */
export function applyRelayPeer(request) {
  let peer = channels.get(request.socket);
  if (!peer) {
    peer = peers.get(request.headers[HEADER]);
    if (!peer) {
      throw new Error("Unrecognised private dashboard relay connection");
    }
    channels.set(request.socket, peer);
    Object.defineProperty(request.socket, "remoteAddress", {
      value: peer.address,
      configurable: true,
    });
    Object.defineProperty(request.socket, "remotePort", {
      value: peer.port,
      configurable: true,
    });
  }
  // Never accept a caller's address/nonce header, including on keep-alive requests.
  delete request.headers[HEADER];
  request.headers["x-cawco-peer-address"] = peer.address;
  return peer;
}

export async function listenInherited(httpServer, fd, ready) {
  const dir = join(tmpdir(), `cawco-dashboard-${process.pid}-${randomUUID()}`);
  mkdirSync(dir, { mode: 0o700 });
  const path = join(dir, "http.sock");
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(path, resolve);
  });
  chmodSync(path, 0o600);
  const tunnels = new Set();
  const listener = net.createServer({ allowHalfOpen: true }, (client) => {
    const token = randomUUID();
    peers.set(token, {
      address: client.remoteAddress,
      port: client.remotePort,
    });
    const upstream = net.createConnection({ path, allowHalfOpen: true });
    tunnels.add(client);
    client.pause();
    const finish = () => {
      peers.delete(token);
      tunnels.delete(client);
    };
    client.on("close", finish);
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    upstream.on("close", () => {
      if (!upstream.readableEnded) {
        client.destroy();
      }
    });
    client.on("close", () => upstream.destroy());
    // Parse only the first HTTP header. Bodies, upgrades and later messages are opaque.
    let header = Buffer.alloc(0);
    const first = (chunk) => {
      header = Buffer.concat([header, chunk]);
      const end = header.indexOf("\r\n\r\n");
      if (end < 0) {
        if (header.length > 65_536) {
          client.destroy(new Error("HTTP header too large"));
          upstream.destroy();
        }
        return;
      }
      client.pause();
      client.removeListener("data", first);
      const lines = header.subarray(0, end).toString("latin1").split("\r\n");
      const clean = lines.filter(
        (line, i) => i === 0 || !line.toLowerCase().startsWith(`${HEADER}:`)
      );
      const forwarded = Buffer.concat([
        Buffer.from(
          `${clean.join("\r\n")}\r\n${HEADER}: ${token}\r\n\r\n`,
          "latin1"
        ),
        header.subarray(end + 4),
      ]);
      const start = () => {
        client.pipe(upstream);
        client.resume();
      };
      if (upstream.write(forwarded)) {
        start();
      } else {
        upstream.once("drain", start);
      }
    };
    client.on("data", first);
    client.on("end", () => upstream.end());
    upstream.pipe(client);
    upstream.once("connect", () => client.resume());
  });
  listener.on("error", (error) => {
    httpServer.close();
    throw error;
  });
  listener.listen({ fd }, ready);
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return {
    stopAccepting: () => listener.close(),
    destroy: () => {
      for (const socket of tunnels) {
        socket.destroy();
      }
    },
  };
}
