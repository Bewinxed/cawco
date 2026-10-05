/** Real relay transport probe: peer integrity, keep-alive, half-close and backpressure. */
// biome-ignore-all lint/performance/noAwaitInLoops: successive requests must reuse the same channel to prove peer binding survives keep-alive.
import { dlopen, FFIType, ptr } from "bun:ffi";
import http from "node:http";
import net from "node:net";
import {
  applyRelayPeer,
  listenInherited,
} from "../../apps/dashboard/inherited-relay.js";

const libc = dlopen("libc.so.6", {
  socket: {
    args: [FFIType.i32, FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
  bind: { args: [FFIType.i32, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  listen: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  close: { args: [FFIType.i32], returns: FFIType.i32 },
});
const fd = libc.symbols.socket(2, 1, 0);
const address = Buffer.alloc(16);
address.writeUInt16LE(2);
address.writeUInt16BE(43_683, 2);
address.set([127, 0, 0, 1], 4);
if (
  libc.symbols.bind(fd, ptr(address), 16) !== 0 ||
  libc.symbols.listen(fd, 128) !== 0
) {
  throw new Error("Relay proof socket bind failed");
}
const server = http.createServer(async (incoming, response) => {
  const peer = applyRelayPeer(incoming);
  if (incoming.url === "/download") {
    response.end(Buffer.alloc(2 * 1024 * 1024, 118));
    return;
  }
  let bytes = 0;
  for await (const chunk of incoming) {
    bytes += chunk.length;
  }
  response.end(JSON.stringify({ peer: peer.address, bytes }));
});
const relay = await listenInherited(server, fd, () => {
  /* listener event is not the proof; successful requests below are */
});
const agent = new http.Agent({ keepAlive: true });
function request(body?: Buffer) {
  return new Promise<{ peer: string; bytes: number }>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 43_683,
        path: "/",
        method: body ? "POST" : "GET",
        agent,
        headers: {
          "x-cawco-relay-token": "forged",
          "x-cawco-peer-address": "203.0.113.99",
          ...(body ? { "content-length": String(body.length) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(JSON.parse(data)));
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}
try {
  for (let i = 0; i < 2; i += 1) {
    const result = await request();
    if (result.peer !== "127.0.0.1") {
      throw new Error("Forged peer header accepted");
    }
  }
  console.log(
    "real peer 127.0.0.1 arrives on repeated keep-alive requests; forged relay/address headers ignored"
  );
  const body = Buffer.alloc(2 * 1024 * 1024, 7);
  const result = await request(body);
  if (result.bytes !== body.length) {
    throw new Error("Backpressure lost request bytes");
  }
  console.log("2 MiB request survives relay backpressure");
  await new Promise<void>((resolve, reject) => {
    http
      .get(
        { host: "127.0.0.1", port: 43_683, path: "/download", agent },
        (res) => {
          let bytes = 0;
          res.pause();
          setTimeout(() => res.resume(), 100);
          res.on("data", (chunk) => {
            bytes += chunk.length;
          });
          res.on("end", () =>
            bytes === 2 * 1024 * 1024
              ? resolve()
              : reject(new Error(`Backpressure lost response bytes: ${bytes}`))
          );
          res.on("error", reject);
        }
      )
      .on("error", reject);
  });
  console.log("2 MiB response survives a paused client and relay backpressure");
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(
      { host: "127.0.0.1", port: 43_683, allowHalfOpen: true },
      () =>
        socket.end(
          "GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        )
    );
    let data = "";
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("end", () => {
      socket.destroy();
      if (data.includes("200 OK")) {
        resolve();
      } else {
        reject(new Error("Half-close cut off response"));
      }
    });
    socket.on("error", reject);
  });
  console.log("client write-half close preserves full HTTP response");
} finally {
  agent.destroy();
  relay.stopAccepting();
  relay.destroy();
  server.close();
  libc.close();
}
