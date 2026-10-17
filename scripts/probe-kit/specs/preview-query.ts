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
 * For each query form a page sends (Vite's `?import&url`, a glob's `?url`,
 * `?a&b=1`, vite-plugin-svelte's `?svelte&type=style&lang.css`), the request
 * line the server reads names the path and query the client wrote, to the
 * byte:
 * 1. in port mode, through the session's own port;
 * 2. in host mode, through the session's name on the first port, past its
 *    lock with the pass a ticket gives (preview-access.ts).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one request at a time, each read off the wire before the next
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "bun";
import type { Kit, Spec } from "../kit";

/** Host mode's listener: the first of the preview ports this spec gives its hub. Our pick, clear of a hub's default range. */
const HOST_PORT = 47_460;
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

/**
 * One GET of `target` on `port`, its request line written as given, under
 * `host` (the port's own address unless named) with `headers`; the
 * response's head, its status line first.
 */
const rawGet = (
  port: number,
  target: string,
  host = `127.0.0.1:${port}`,
  headers = ""
): Promise<string[]> =>
  new Promise((done, fail) => {
    let got = "";
    Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open(socket) {
          socket.write(
            `GET ${target} HTTP/1.1\r\nhost: ${host}\r\n${headers}connection: close\r\n\r\n`
          );
        },
        data(_socket, chunk) {
          got += chunk.toString("latin1");
        },
        close() {
          done(got.split("\r\n\r\n")[0]?.split("\r\n") ?? []);
        },
        error(_socket, error) {
          fail(error);
        },
      },
    }).catch(fail);
  });

/** Host mode's names, `.localhost` so they resolve with no DNS (RFC 6761), on the range's first port. */
const PATTERN = `http://p-{session}.localhost:${HOST_PORT}`;
const NAME = `p-${INSTANCE}.localhost:${HOST_PORT}`;

/** The pass host mode's lock gives for a ticket, as the browser sends it back: `name=value`. */
const PASS = /^set-cookie:\s*([^;]+)/im;

const run = async (kit: Kit) => {
  // Before the hub's config is read: its secret key in scratch, its preview ports clear of any hub's.
  const scratch = await mkdtemp(join(tmpdir(), "preview-query-"));
  process.env.CAWCO_DB_PATH = join(scratch, "hub.db");
  process.env.CAWCO_PREVIEW_PORTS = `${HOST_PORT}-${HOST_PORT + 9}`;
  const { startPreview, stopPreview } =
    await import("../../../packages/agent/src/preview");
  const { createPreviewListeners, previewTargets } =
    await import("../../../packages/hub/src/preview");
  const { mintTicket } =
    await import("../../../packages/hub/src/preview-access");
  const { PREVIEW_ENTER_PATH } =
    await import("../../../packages/core/src/frames");
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
  /** `target` through `port`, then what the server behind read: its check, numbered `leg`. */
  const through = async (
    leg: string,
    port: number,
    target: string,
    host?: string,
    headers?: string
  ) => {
    const before = arrived.length;
    const [status = ""] = await rawGet(port, target, host, headers);
    const got = arrived.length > before ? arrived.at(-1) : undefined;
    kit.check(
      `${leg}: ${target} reaches the server behind the hub and agent listeners byte-identical`,
      status.startsWith("HTTP/1.1 200") && got === target,
      `answered ${JSON.stringify(status)}; the server read ${JSON.stringify(got ?? null)}`
    );
  };
  try {
    // 1. Port mode: the session's own port.
    const sessionPort = listeners.address(INSTANCE).port;
    for (const target of FORMS) {
      await through("1 (port mode)", sessionPort, target);
    }
    // 2. Host mode: the session's name on the first port, behind its lock.
    await listeners.set({ mode: "host", pattern: PATTERN });
    const entered = await rawGet(
      HOST_PORT,
      `${PREVIEW_ENTER_PATH}?ticket=${encodeURIComponent(mintTicket(INSTANCE).ticket)}&next=%2F`,
      NAME
    );
    const pass = entered.join("\n").match(PASS)?.[1];
    kit.check(
      "2: host mode's lock gives a pass for a ticket",
      entered[0]?.startsWith("HTTP/1.1 302") === true && Boolean(pass),
      `answered ${JSON.stringify(entered[0] ?? "")}`
    );
    for (const target of FORMS) {
      await through(
        "2 (host mode)",
        HOST_PORT,
        target,
        NAME,
        `cookie: ${pass}\r\n`
      );
    }
  } finally {
    await listeners.set({ mode: "port" });
    listeners.release(INSTANCE);
    previewTargets.delete(INSTANCE);
    await stopPreview({ instanceId: INSTANCE });
    server.stop(true);
    await rm(scratch, { recursive: true, force: true });
  }
};

const spec: Spec = { name: "preview-query", run };
export default spec;
