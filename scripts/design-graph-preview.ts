/**
 * The design graph's preview on one port (`PORT`), for the owner to try
 * before he picks (the primitives spec's taste calls): the real artifact
 * panel in a tab of its own (`/dev/design-graph`, the built dashboard in
 * its `bench` mode) over a real component canvas, drawn live by the
 * dashboard's own stage (stage-host/host.ts, started as the daemon starts
 * one, minus the workspace boundary), on the task column's states file.
 *
 * One origin carries both, so the preview reaches the owner through the
 * one port the hub proxies: the canvas page's own paths (`/@cawco/`, the
 * stage's Vite modules and its HMR socket) go to the stage, everything else
 * to the dashboard. The artifact's document, which the panel and the page's
 * overlay both join, is kept here in memory on the y-websocket protocol, so
 * pins are written and read as on the hub; a stand-in answers the few hub
 * reads the bench makes (its preview pass) and refuses the rest, as the
 * probe kit's bench hub does.
 *
 * Behind the hub, the machine's preview proxy puts the hub's overlay on
 * every page this origin serves, and the hub answers `/__cawco/` itself.
 * The panel's page keeps the hub's (the hub's own panel hears the preview
 * through it). An overlay whose same-origin parent carries one stands down
 * (overlay.ts), so the canvas page's would never run and the panel would
 * never stand a state: there the hub's tag is left inert (its injection
 * lands inside a comment, {@link DECOY}), and the page carries the overlay
 * this origin serves itself, at {@link OVERLAY_HERE}, marked `data-embed`
 * so it runs under a marked parent, its document's paths moved out of the
 * hub's `/__cawco/` ({@link DOC_HERE}).
 * Branch-only: the design graph lands after his picks, and this goes then.
 *
 *   PORT=4300 bun scripts/design-graph-preview.ts
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildStageHost } from "../packages/agent/src/stage-host/build";
import {
  injectOverlay,
  OVERLAY_PATH,
  overlayResponse,
} from "../packages/core/src/preview-proxy";

const ROOT = resolve(import.meta.dir, "..");
/** The few parts of Yjs and its sync protocol the document's sockets speak, as the hub resolves them (the one copy its own sync runs on). */
interface Encoder {
  readonly kind?: "encoder";
}
interface Decoder {
  readonly kind?: "decoder";
}
interface YDoc {
  on: (
    event: "update",
    listener: (update: Uint8Array, origin: unknown) => void
  ) => void;
}
interface Yjs {
  Doc: new () => YDoc;
}
interface SyncProtocol {
  readSyncMessage: (
    decoder: Decoder,
    encoder: Encoder,
    doc: YDoc,
    origin: unknown
  ) => number;
  writeSyncStep1: (encoder: Encoder, doc: YDoc) => void;
  writeUpdate: (encoder: Encoder, update: Uint8Array) => void;
}
interface Encoding {
  createEncoder: () => Encoder;
  length: (encoder: Encoder) => number;
  toUint8Array: (encoder: Encoder) => Uint8Array;
  writeVarUint: (encoder: Encoder, value: number) => void;
}
interface Decoding {
  createDecoder: (bytes: Uint8Array) => Decoder;
  readVarUint: (decoder: Decoder) => number;
}
const fromHub = async <T>(name: string): Promise<T> =>
  (await import(Bun.resolveSync(name, join(ROOT, "packages/hub")))) as T;
const Y = await fromHub<Yjs>("yjs");
const syncProtocol = await fromHub<SyncProtocol>("y-protocols/sync");
const encoding = await fromHub<Encoding>("lib0/encoding");
const decoding = await fromHub<Decoding>("lib0/decoding");
const DASHBOARD = join(ROOT, "apps/dashboard");
const VITE = join(DASHBOARD, "node_modules/.bin/vite");
const PORT = Number(process.env.PORT ?? 4300);
/**
 * This serve's own build, which its `vite preview` serves (the config's
 * `CAWCO_KIT_OUT_DIR`): another serve's build, or a plain `vite build`, in
 * this workspace replaces the hashed assets in the shared one, and the page
 * this one served named files no longer there. Removed as it ends.
 */
const OUT = join(DASHBOARD, `node_modules/.cache/design-graph-preview-${PORT}`);

/** The canvas: the task column's states file, its flow the slider's steps, its list's records the dials'. */
const FILE = "src/lib/cawco/tasks/TaskColumn.stories.ts";
const SPEC = {
  name: "task-column",
  steps: ["Empty", "Arrived", "Several", "Picked", "Moving", "Refused"],
  group: { Over: "Drop target", Closed: "Over" },
  edges: [{ from: "Refused", to: "Several", label: "Try again" }],
  dials: [
    { name: "cards", kind: "count", target: { arg: "cards" } },
    { name: "longest", kind: "longest", by: "title", target: { arg: "cards" } },
    {
      name: "radius",
      kind: "number",
      min: 0,
      max: 16,
      unit: "px",
      target: { cssVar: "--radius-lg" },
    },
  ],
};
const CANVAS_PATH = `/@cawco/canvas?file=${encodeURIComponent(FILE)}&spec=${encodeURIComponent(JSON.stringify(SPEC))}`;
const ASK =
  "Try the task column's states: scrub the steps, switch to the graph, tune the list";

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

const until = async (
  what: string,
  ready: () => Promise<boolean>,
  ms: number
): Promise<void> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ready().catch(() => false)) {
      return;
    }
    await Bun.sleep(500);
  }
  throw new Error(`${what} didn't come up in ${ms / 1000} s.`);
};

/* --- Its children end with it, however it ends ------------------------------ */

const children: ChildProcess[] = [];
process.on("exit", () => {
  for (const child of children) {
    child.kill("SIGTERM");
  }
  rmSync(OUT, { recursive: true, force: true });
});
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => process.exit(0));
}
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(event, (error) => {
    console.error(error);
    process.exit(1);
  });
}

/* --- The artifact's document, kept here on the y-websocket protocol ------- */

interface DocSocket {
  doc: string;
  /** The stage's or the stand-in hub's socket this one relays, for any other upgrade. */
  path: string;
  protocols?: string[];
  queue: (string | Uint8Array<ArrayBuffer>)[];
  up?: WebSocket;
}
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const rooms = new Map<
  string,
  { doc: YDoc; sockets: Set<Bun.ServerWebSocket<DocSocket>> }
>();
const roomOf = (name: string) => {
  let room = rooms.get(name);
  if (!room) {
    const doc = new Y.Doc();
    const made = { doc, sockets: new Set<Bun.ServerWebSocket<DocSocket>>() };
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      for (const socket of made.sockets) {
        if (socket !== origin) {
          socket.send(message);
        }
      }
    });
    rooms.set(name, made);
    room = made;
  }
  return room;
};

/* --- The one origin ---------------------------------------------------------- */

/** Where the canvas page's own overlay is served: out of the hub's `/__cawco/`. */
const OVERLAY_HERE = "/@cawco-preview/overlay.js";
/** Where the page's overlay keeps the artifact's document (the pane names `/__cawco/artifact/`, which the hub answers itself). */
const DOC_HERE = "/@cawco-preview/artifact/";
/** The artifact's document sockets: the panel's (`/ws/artifact/<session>/<id>`) and the page's (`DOC_HERE<id>`). */
const DOC_SOCKET =
  /^\/(?:ws\/artifact\/[^/]+|@cawco-preview\/artifact|__cawco\/artifact)\/([^/]+)$/u;
/** The stage's own paths: its canvas page and its Vite modules. */
const STAGE_PATH =
  /^\/(?:@cawco\/|@vite\/|@fs\/|@id\/|src\/|node_modules\/|\.cawco\/)/u;
/**
 * A comment at the head of the canvas page: a proxy that puts its
 * overlay right after the page's `<head>` (core preview-proxy.ts
 * `overlayAt`) finds this one first, and its tag lands inside the comment,
 * where it never runs.
 */
const DECOY = "<!--<head>-->";
const DOCTYPE = /^\s*<!doctype[^>]*>/iu;
/**
 * The overlay's page realm opens the document's socket and posts its sends
 * on the paths the pane names: moved to {@link DOC_HERE}, which the hub
 * leaves to this origin.
 */
const DOC_PATHS = `(()=>{const at=(u)=>{try{const x=new URL(String(u),location.href);if(x.pathname.startsWith("/__cawco/artifact/")){x.pathname=${JSON.stringify(DOC_HERE)}+x.pathname.slice(18);return x.href}}catch{}return u};const W=window.WebSocket;window.WebSocket=class extends W{constructor(u,p){super(at(u),p)}};const F=window.fetch.bind(window);window.fetch=(i,o)=>F(typeof i==="string"||i instanceof URL?at(i):i,o);})();`;

/** A page served here: the panel's as it is; the canvas page with the hub's overlay inert and its own. */
const pageOf = (html: string, canvas: boolean): string => {
  if (!canvas) {
    // The panel's page keeps the hub's overlay: the hub's own panel hears the preview through it.
    return html;
  }
  // `data-embed`: the canvas page's overlay runs though its same-origin parent carries the hub's (overlay.ts).
  const own = injectOverlay(html, { embed: "" }).replace(
    `src="${OVERLAY_PATH}"`,
    `src="${OVERLAY_HERE}"`
  );
  const doctype = own.match(DOCTYPE)?.[0] ?? "";
  return `${doctype}${DECOY}${own.slice(doctype.length)}`;
};

/** Where the dashboard, the stage and the stand-in hub listen; 0 until each has started. */
const ports: Record<"dashboard" | "stage" | "hub", number> = {
  dashboard: 0,
  stage: 0,
  hub: 0,
};

const relay = async (
  request: Request,
  to: number,
  canvas: boolean
): Promise<Response> => {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set("host", `127.0.0.1:${to}`);
  // The dashboard's own writes check their origin against its host: both as it is served.
  if (headers.has("origin")) {
    headers.set("origin", `http://127.0.0.1:${to}`);
  }
  headers.delete("accept-encoding");
  const answer = await fetch(
    `http://127.0.0.1:${to}${url.pathname}${url.search}`,
    {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      redirect: "manual",
    }
  );
  const out = new Headers(answer.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  if (out.get("content-type")?.startsWith("text/html")) {
    return new Response(pageOf(await answer.text(), canvas), {
      status: answer.status,
      headers: out,
    });
  }
  return new Response(answer.body, { status: answer.status, headers: out });
};

// Bound before anything starts: a port already taken ends the run before a child is made.
const front = Bun.serve<DocSocket>({
  hostname: "0.0.0.0",
  port: PORT,
  idleTimeout: 0,
  async fetch(request, server) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (!(ports.dashboard && ports.stage)) {
      return new Response(
        "The design graph's preview is still starting: its dashboard builds and its stage starts, a few minutes. Reload in a moment.",
        { status: 503, headers: { "retry-after": "10" } }
      );
    }
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const offered = request.headers.get("sec-websocket-protocol");
      const protocols = offered?.split(",").map((one) => one.trim());
      const doc = pathname.match(DOC_SOCKET)?.[1] ?? "";
      return server.upgrade(request, {
        data: { doc, path: pathname + url.search, protocols, queue: [] },
        headers: protocols?.[0]
          ? { "Sec-WebSocket-Protocol": protocols[0] }
          : undefined,
      })
        ? undefined
        : new Response("No upgrade", { status: 400 });
    }
    if (pathname === "/") {
      return Response.redirect(
        `/dev/design-graph?graph-options&name=${encodeURIComponent("Task column")}&ask=${encodeURIComponent(ASK)}&path=${encodeURIComponent(CANVAS_PATH)}`,
        302
      );
    }
    // The hub's answers on a preview origin, when no hub stands in front: its reach check, its pass.
    if (pathname === "/__cawco/ping" || pathname === "/__cawco/enter") {
      return new Response(null, {
        status: 204,
        headers: { "access-control-allow-origin": "*" },
      });
    }
    // The panel says the canvas is shown; nothing here keeps it.
    if (pathname.endsWith("/shown")) {
      return Response.json({ ok: true });
    }
    if (pathname === "/api/preview-ticket") {
      return Response.json({ ticket: "preview" });
    }
    if (pathname === OVERLAY_HERE) {
      const overlay = await overlayResponse([], null, null);
      return new Response(`${DOC_PATHS}\n${await overlay.text()}`, {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    // A page's own send and pictures: kept nowhere, answered as heard.
    if (
      pathname.startsWith(DOC_HERE) ||
      pathname.startsWith("/__cawco/artifact/")
    ) {
      return Response.json({ ok: true });
    }
    return STAGE_PATH.test(pathname)
      ? await relay(request, ports.stage, pathname.startsWith("/@cawco/canvas"))
      : await relay(request, ports.dashboard, false);
  },
  websocket: {
    idleTimeout: 0,
    open(ws) {
      if (ws.data.doc) {
        const room = roomOf(ws.data.doc);
        room.sockets.add(ws);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, room.doc);
        ws.send(encoding.toUint8Array(encoder));
        return;
      }
      // Vite's HMR goes to the stage; the dashboard's own socket to the stand-in hub, which echoes it.
      const to = ws.data.protocols?.includes("vite-hmr")
        ? ports.stage
        : ports.hub;
      const up = new WebSocket(
        `ws://127.0.0.1:${to}${ws.data.path}`,
        ws.data.protocols
      );
      ws.data.up = up;
      up.binaryType = "arraybuffer";
      up.onopen = () => {
        for (const one of ws.data.queue) {
          up.send(one);
        }
        ws.data.queue = [];
      };
      up.onmessage = (event) =>
        ws.send(
          typeof event.data === "string"
            ? event.data
            : new Uint8Array(event.data as ArrayBuffer)
        );
      up.onclose = () => ws.close();
    },
    message(ws, message) {
      if (ws.data.doc) {
        const room = roomOf(ws.data.doc);
        const bytes =
          typeof message === "string"
            ? new TextEncoder().encode(message)
            : new Uint8Array(message);
        const decoder = decoding.createDecoder(bytes);
        const kind = decoding.readVarUint(decoder);
        if (kind === MESSAGE_SYNC) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
        } else if (kind === MESSAGE_AWARENESS) {
          for (const socket of room.sockets) {
            if (socket !== ws) {
              socket.send(bytes);
            }
          }
        }
        return;
      }
      const { up } = ws.data;
      const held =
        typeof message === "string" ? message : new Uint8Array(message);
      if (up?.readyState === WebSocket.OPEN) {
        up.send(held);
      } else {
        ws.data.queue.push(held);
      }
    },
    close(ws) {
      if (ws.data.doc) {
        rooms.get(ws.data.doc)?.sockets.delete(ws);
        return;
      }
      ws.data.up?.close();
    },
  },
});

/* --- The stand-in hub the built dashboard reads through its /api proxy --- */

const hub = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  fetch: (request, server) =>
    server.upgrade(request)
      ? undefined
      : new Response("no hub", { status: 503 }),
  websocket: {
    idleTimeout: 0,
    message: (socket, message) => {
      socket.send(message);
    },
  },
});
ports.hub = hub.port as number;
const HUB = `http://127.0.0.1:${ports.hub}`;
/** What the dashboard's build and its preview run with: the stand-in hub, and this serve's own build. */
const DASHBOARD_ENV = {
  ...process.env,
  CAWCO_DEV_HUB_URL: HUB,
  CAWCO_HUB_URL: HUB,
  CAWCO_KIT_OUT_DIR: OUT,
};

/* --- The dashboard, built in its bench mode, and served --------------------- */

console.log("… building the dashboard (bench mode)");
// Spawned, not spawnSync: a synchronous build holds the event loop, and the front's "still starting" 503 could never answer.
// One of its children, so it ends with it however it ends.
const build = spawn(VITE, ["build", "--mode", "bench"], {
  cwd: DASHBOARD,
  env: DASHBOARD_ENV,
  stdio: "inherit",
});
children.push(build);
const builtExit = await new Promise<number | null>((done) =>
  build.on("exit", (code) => done(code))
);
if (builtExit !== 0) {
  throw new Error(`The dashboard's build exited ${builtExit}.`);
}
const dashboardAt = await freePort();
children.push(
  spawn(
    VITE,
    [
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(dashboardAt),
      "--strictPort",
    ],
    {
      cwd: DASHBOARD,
      env: DASHBOARD_ENV,
      stdio: "inherit",
    }
  )
);

/* --- The dashboard's own stage, as the daemon starts one ------------------- */

mkdirSync(join(DASHBOARD, ".cawco/stage"), { recursive: true });
writeFileSync(join(DASHBOARD, ".cawco/stage/host.mjs"), await buildStageHost());
const stageAt = await freePort();
const stage = spawn("bun", [join(DASHBOARD, ".cawco/stage/host.mjs")], {
  cwd: DASHBOARD,
  env: {
    ...process.env,
    CAWCO_STAGE: "1",
    CAWCO_STAGE_PORT: String(stageAt),
    CAWCO_STAGE_FRAMEWORK: "svelte",
    // The dashboard is a SvelteKit app: its root layout's CSS is every frame's, as on its own pages.
    CAWCO_STAGE_KIT: "1",
    CAWCO_STAGE_TOOLCHAIN: "vite",
  },
  stdio: ["ignore", "pipe", "inherit"],
});
children.push(stage);
// Its stdout is the daemon's line protocol; nothing reads it but this, which keeps the stage alive.
stage.stdout?.on("data", () => undefined);

await until(
  "The stage",
  () =>
    fetch(`http://127.0.0.1:${stageAt}/@cawco/canvas`).then(
      (r) => r.status < 500
    ),
  240_000
);
await until(
  "The dashboard",
  () => fetch(`http://127.0.0.1:${dashboardAt}/`).then((r) => r.status < 500),
  120_000
);
ports.dashboard = dashboardAt;
ports.stage = stageAt;

console.log(
  `design graph preview on http://127.0.0.1:${front.port}/ (stage ${ports.stage}, dashboard ${ports.dashboard})`
);
