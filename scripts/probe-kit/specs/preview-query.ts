/**
 * A request through a preview reaches the server behind it with its query
 * byte-identical (the owner's sheet "pairing-round-2", 2026-10-17: its stage
 * failed every module with `idle.riv?url=` and `PairingQr.svelte … Invalid
 * declaration`; Vite matches `?import` and `?url` only without the `=` that
 * a URLSearchParams round trip adds).
 *
 *   bun scripts/probe-kit/run.ts preview-query
 *
 * Drives the real hops in-process: the hub's preview listener
 * (`createPreviewListeners`, its relay) in front of the agent's listener
 * (`startPreview` of a port), in front of a raw TCP server that records each
 * request line as it came off the wire. The client writes its request line
 * on a raw socket too, as a browser sends it, so nothing on either end
 * parses or rebuilds the URL. Needs no boundary: it runs anywhere.
 *
 * 1. For each query form a page sends (Vite's `?import&url`, a glob's
 *    `?url`, `?a&b=1`, vite-plugin-svelte's `?svelte&type=style&lang.css`),
 *    the request line the server reads names the path and query the client
 *    wrote, to the byte.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one request at a time, each read off the wire before the next
import type { Socket } from "bun";
import type { Kit, Spec } from "../kit";

const FORMS = [
  "/src/lib/assets/caw/idle.riv?import&url",
  "/src/lib/assets/caw/idle.riv?url",
  "/src/x.ts?a&b=1",
  "/src/lib/cawco/pairing/PairingQr.svelte?svelte&type=style&lang.css",
];
const INSTANCE = "00000000-0000-4000-8000-0000000a0e71";
const TOKEN = "preview-query-probe-relay-token-0";

/** Each request line the server read, its target alone. */
const arrived: string[] = [];

/** A server that answers every request `ok`, keeping its request line's target as the bytes said it. */
const recorder = () =>
  Bun.listen<{ head: string }>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        socket.data = { head: "" };
      },
      data(socket: Socket<{ head: string }>, chunk) {
        socket.data.head += chunk.toString("latin1");
        if (!socket.data.head.includes("\r\n\r\n")) {
          return;
        }
        arrived.push(socket.data.head.split("\r\n")[0]?.split(" ")[1] ?? "");
        socket.data.head = "";
        socket.write(
          "HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: 2\r\n\r\nok"
        );
      },
    },
  });

/** One GET of `target` on `port`, its request line written as given; the response's status line. */
const rawGet = (port: number, target: string): Promise<string> =>
  new Promise((done, fail) => {
    let got = "";
    Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open(socket) {
          socket.write(
            `GET ${target} HTTP/1.1\r\nhost: 127.0.0.1:${port}\r\nconnection: close\r\n\r\n`
          );
        },
        data(_socket, chunk) {
          got += chunk.toString("latin1");
        },
        close() {
          done(got.split("\r\n")[0] ?? "");
        },
        error(_socket, error) {
          fail(error);
        },
      },
    }).catch(fail);
  });

const run = async (kit: Kit) => {
  const { startPreview, stopPreview } =
    await import("../../../packages/agent/src/preview");
  const { createPreviewListeners, previewTargets } =
    await import("../../../packages/hub/src/preview");
  type Deps = Parameters<typeof createPreviewListeners>[1];
  type Db = Parameters<typeof createPreviewListeners>[2];
  const server = recorder();
  const { port: agentPort } = await startPreview({
    instanceId: INSTANCE,
    port: server.port,
    token: TOKEN,
  });
  previewTargets.set(INSTANCE, {
    artifact: { kind: "preview", id: INSTANCE } as never,
    machineId: "probe",
    revision: "probe",
    source: { port: server.port },
  });
  const deps = {
    reach: () =>
      Promise.resolve({
        ok: true,
        upstream: { address: "127.0.0.1", port: agentPort, token: TOKEN },
      }),
    unreachable: () => undefined,
    ownerOf: () => undefined,
    kindOf: () => undefined,
    state: () => "",
  } as unknown as Deps;
  const db = {
    settings: () => ({ mode: "port", pattern: null }),
    ports: () => [],
    keepPort: () => undefined,
    dropPort: () => undefined,
    setSettings: () => undefined,
  } as unknown as Db;
  const listeners = createPreviewListeners("127.0.0.1", deps, db);
  try {
    const hubPort = listeners.address(INSTANCE).port;
    for (const target of FORMS) {
      const status = await rawGet(hubPort, target);
      const got = arrived.at(-1);
      kit.check(
        `1: ${target} reaches the server behind the hub and agent listeners byte-identical`,
        status.startsWith("HTTP/1.1 200") && got === target,
        `answered ${JSON.stringify(status)}; the server read ${JSON.stringify(got)}`
      );
    }
  } finally {
    listeners.release(INSTANCE);
    previewTargets.delete(INSTANCE);
    await stopPreview({ instanceId: INSTANCE });
    server.stop(true);
  }
};

const spec: Spec = { name: "preview-query", run };
export default spec;
