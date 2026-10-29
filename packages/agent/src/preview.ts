import { timingSafeEqual } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PREVIEW_PING_PATH, type PreviewSource } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import {
  type BrowserKey,
  type BrowserListenArgs,
  isBrowserKey,
} from "@cawco/core/browser";
import {
  cachePreview,
  causeOf,
  decodedHeaders,
  downResponse,
  type FolderWeight,
  folderGone,
  folderKey,
  folderWeight,
  heldWhileServed,
  IMMUTABLE,
  injectOverlay,
  isFolderGone,
  PREVIEW_SERVED_HEADER,
  type PreviewSocket,
  previewFailed,
  previewWebSocket,
  proxyHeaders,
  RELAY_HEADER,
  upgradePreview,
  versionAssets,
  versionedFile,
} from "@cawco/core/preview-proxy";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import { z } from "zod";
import { wakeBrowser } from "./browser/browsers";
import { cdpView } from "./browser/shield";
import { type BrowserRecord, portsOf, readBrowser } from "./browser/state";
import {
  closeBridge,
  reachWorkspace,
  WorkspaceDown,
  workspaceGone,
} from "./preview-bridge";
import { networkOf, sourceViewer, wakeSource } from "./stage";

/**
 * The listeners this process serves, with the source each was asked for and
 * the hub's token for the start that made it. They outlive the hub
 * connection: a hub that drops and comes back reads them off the register
 * ({@link servingPreviews}) and points its targets at them again.
 */
const previews = new Map<
  string,
  { listener: Server<PreviewSocket>; source: PreviewSource; token: string }
>();
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** How long the ping waits for the port's answer. Ours: under the hub's 5 s for the ping's relay (hub preview.ts `PING_RELAY_MS`). */
const PING_ASK_MS = 3000;

/**
 * The headers a proxy in front of the hub adds to name where the browser
 * reached it (Cloudflare sets `X-Forwarded-Proto` to the client's scheme and
 * `CF-Visitor` to it as JSON). The app is told it is reached at its own
 * `http://localhost:<port>` (Host and Origin below), so these go: an app that
 * judges its origin by them (the dashboard's `publicOrigin`) would read
 * `https://localhost:<port>`, refuse the Origin it was given as cross-site and
 * close every WebSocket the page opens (obelisk 2026-10-15 20:11, host mode
 * behind Cloudflare).
 */
const FORWARDING_HEADERS = [
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-forwarded-ssl",
  "x-forwarded-scheme",
  "cf-visitor",
];

/**
 * What a dev server answers by acting on its own machine rather than serving
 * the app: each opens a file in an editor there, or a debugger. A preview
 * shows a running app and never lets its viewer make the previewed machine
 * run a program or open a file, and the dev servers' own same-origin checks
 * don't hold behind this listener, which tells every request it comes from
 * the app's own `localhost:<port>` (Host, Origin, Referer below). So this
 * listener, the one hop every port preview reaches its server through
 * (from the hub, or straight to its port), refuses them:
 * - `__open-in-editor`: Vite (`middlewares.use('/__open-in-editor',
 *   launchEditorMiddleware())`), launch-editor-middleware's own example, and
 *   what Astro's toolbar and Svelte's and Vue's inspectors fetch;
 * - `__open-stack-frame-in-editor`: react-dev-utils (Create React App);
 * - `webpack-dev-server/open-editor`: webpack-dev-server;
 * - `__nextjs_launch-editor`, and `__nextjs_attach-nodejs-inspector`, which
 *   opens the dev server's Node inspector: Next.js.
 *
 * Each is matched as path segments anywhere in the path, case-folded:
 * connect and Express match a mount case-insensitively, and a `base` or
 * `basePath` puts it under a prefix. A last segment matches as itself or
 * with a `.` after it, as connect lets `/__open-in-editor.x` reach the mount.
 */
const MACHINE_ROUTES = [
  ["__open-in-editor"],
  ["__open-stack-frame-in-editor"],
  ["webpack-dev-server", "open-editor"],
  ["__nextjs_launch-editor"],
  ["__nextjs_attach-nodejs-inspector"],
];

/** The machine route `pathname` names, or undefined when it names none. */
const machineRoute = (pathname: string): string | undefined => {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Not percent-encoded validly: judged as it came.
  }
  const segments = path.toLowerCase().split("/");
  const named = (segment: string, name: string, last: boolean) =>
    segment === name || (last && segment.startsWith(`${name}.`));
  return MACHINE_ROUTES.find((route) =>
    segments.some(
      (_, at) =>
        at + route.length <= segments.length &&
        route.every((name, i) =>
          named(segments[at + i] as string, name, i === route.length - 1)
        )
    )
  )?.join("/");
};

/**
 * The HMR custom event a dev tool answers by reading the machine's files for
 * whoever is on the socket: Vue DevTools' server RPC (vite-plugin-vue-devtools,
 * which Nuxt's DevTools carries too) answers `getTextAssetContent` and
 * `getImageMeta` for any path, with no token. Vite takes custom events only
 * on its `vite-hmr` sockets, from each frame's text or bytes alike
 * (`JSON.parse(String(raw))`), so those sockets' frames are read, and a frame
 * naming it is dropped; every other frame, HMR's own among them, goes on.
 */
const MACHINE_EVENT = "__devtools-kit-vite-messaging-event-key__";
const HMR_PROTOCOL = "vite-hmr";

/** Whether `message`, sent up a Vite HMR socket, is a custom event naming {@link MACHINE_EVENT}. */
const machineEvent = (message: string | Buffer): boolean => {
  try {
    const sent = z
      .object({ type: z.unknown().optional(), event: z.unknown().optional() })
      .parse(JSON.parse(String(message)));
    return sent.type === "custom" && sent.event === MACHINE_EVENT;
  } catch {
    // Not JSON, or `null` (whose `.type` throws): no custom event.
    return false;
  }
};

/** The relay's socket handler, with a Vite HMR socket's {@link MACHINE_EVENT} frames dropped. */
const listenerSocket: WebSocketHandler<PreviewSocket> = {
  ...previewWebSocket,
  message(socket, message) {
    if (socket.data.protocol === HMR_PROTOCOL && machineEvent(message)) {
      previewFailed(
        "agent listener",
        socket.data.instanceId,
        `refused a ${MACHINE_EVENT} event on its HMR socket: Vue DevTools reads this machine's files for it`
      );
      return;
    }
    previewWebSocket.message(socket, message);
  },
};

/** What a request its hub didn't relay gets: CawCo's refusal, named as such. */
const notRelayed = (): Response =>
  new Response(
    "CawCo refused this request: a preview opens only through its hub. Open it from the CawCo dashboard or app.\n",
    {
      status: 403,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );

/** What a request for a machine route gets: CawCo's refusal, named as such. */
const refusal = (route: string): Response =>
  new Response(
    `CawCo refused /${route}: it would open a file or a program on the machine serving this preview, and a preview only shows its app. Open the file from that machine instead.\n`,
    {
      status: 403,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );

/**
 * Each preview's starts and stops, one after another: a start stops the
 * listener before it and opens its own across awaits, so two of them side by
 * side would each find nothing to stop and leave one listener running that
 * nothing names.
 */
const turns = new Map<string, Promise<unknown>>();

const inTurn = <T>(instanceId: string, work: () => Promise<T>): Promise<T> => {
  const before = turns.get(instanceId) ?? Promise.resolve();
  const mine = before.catch(() => undefined).then(work);
  const settled = mine.catch(() => undefined);
  turns.set(instanceId, settled);
  settled.then(() => {
    if (turns.get(instanceId) === settled) {
      turns.delete(instanceId);
    }
  });
  return mine;
};

const stopNow = async (instanceId: string): Promise<boolean> => {
  previews.get(instanceId)?.listener.stop(true);
  const had = previews.delete(instanceId);
  await closeBridge(instanceId);
  return had;
};

/**
 * Stops a preview's listener and its bridge; settles once the bridge's every
 * connection is gone. With `token`, only the listener that start made: the
 * hub telling a start it gave up on to go must not take the one a later
 * start opened.
 */
export function stopPreview({
  instanceId,
  token,
}: {
  instanceId: string;
  token?: string;
}): Promise<boolean> {
  return inTurn(instanceId, () =>
    token === undefined || previews.get(instanceId)?.token === token
      ? stopNow(instanceId)
      : Promise.resolve(false)
  );
}

/**
 * Where a port preview's requests go: the host's loopback, or for a
 * workspace's port the socket of the bridge into the network it is in
 * (`preview-bridge.ts`, stage.ts `networkOf`); a workspace with no boundary
 * running throws {@link WorkspaceDown}.
 */
const upstreamOf = async (
  instanceId: string,
  source: { port: number; stage?: unknown; workspace?: string }
): Promise<{ unix: string } | "host"> => {
  const network = networkOf(source);
  if (network === undefined) {
    return "host";
  }
  const reached = await reachWorkspace(instanceId, network, source.port);
  return reached === "host" ? "host" : { unix: reached };
};

/** What the register tells the hub this process is serving, each with the token of the start that made it. */
export function servingPreviews(): {
  instanceId: string;
  port: number;
  source: PreviewSource;
  token: string;
}[] {
  return [...previews].map(([instanceId, { listener, source, token }]) => ({
    instanceId,
    port: listener.port as number,
    source,
    token,
  }));
}

/** Stops every preview and the browser listener: each bridge's whole group is killed before this returns, its end awaited by no one. */
export function stopPreviews(): void {
  for (const instanceId of [...previews.keys()]) {
    stopPreview({ instanceId }).catch(console.error);
  }
  browserListener?.listener.stop(true);
  browserListener = undefined;
}

/** A take-over view's socket on the browser listener (local host): its frames out, its input in. */
interface CdpSocket {
  cdp: BrowserKey;
  closed: boolean;
  /** Input that came before the view was attached. */
  early: string[];
  view?: { input: (text: string) => void; leave: () => void };
}

type BrowserSocket = PreviewSocket | CdpSocket;

const isCdp = (data: BrowserSocket): data is CdpSocket => "cdp" in data;

/** What the hub tells a view of a browser that is no live local one here, or that shows no page (shield.ts `cdpView`). */
const NO_VIEW =
  "This browser is no live local browser on this machine, or shows no page.";

const cdpSocket: WebSocketHandler<CdpSocket> = {
  open(socket) {
    const { data } = socket;
    cdpView(data.cdp, {
      send: (frame) => {
        if (!data.closed) {
          socket.send(frame);
        }
      },
      close: (code, why) => socket.close(code, why),
    })
      .then((view) => {
        if (!view) {
          socket.close(4404, NO_VIEW);
          return;
        }
        if (data.closed) {
          view.leave();
          return;
        }
        data.view = view;
        for (const text of data.early.splice(0)) {
          view.input(text);
        }
      })
      .catch((error: unknown) => {
        previewFailed(
          "agent browser listener",
          null,
          `${data.cdp}'s take-over view did not attach: ${causeOf(error)}`
        );
        socket.close(1011, "The take-over view did not attach.");
      });
  },
  message(socket, message) {
    const text = String(message);
    if (socket.data.view) {
      socket.data.view.input(text);
    } else {
      socket.data.early.push(text);
    }
  },
  close(socket) {
    socket.data.closed = true;
    socket.data.view?.leave();
    socket.data.view = undefined;
  },
};

const browserSocket: WebSocketHandler<BrowserSocket> = {
  open: (socket) =>
    isCdp(socket.data)
      ? cdpSocket.open?.(socket as ServerWebSocket<CdpSocket>)
      : previewWebSocket.open?.(socket as ServerWebSocket<PreviewSocket>),
  message: (socket, message) =>
    isCdp(socket.data)
      ? cdpSocket.message(socket as ServerWebSocket<CdpSocket>, message)
      : previewWebSocket.message(
          socket as ServerWebSocket<PreviewSocket>,
          message
        ),
  drain: (socket) => {
    if (!isCdp(socket.data)) {
      previewWebSocket.drain?.(socket as ServerWebSocket<PreviewSocket>);
    }
  },
  close: (socket, code, reason) =>
    isCdp(socket.data)
      ? cdpSocket.close?.(socket as ServerWebSocket<CdpSocket>, code, reason)
      : previewWebSocket.close?.(
          socket as ServerWebSocket<PreviewSocket>,
          code,
          reason
        ),
};

/** `/__cawco/browser/<key>/api/…` or `/__cawco/browser/<key>/cdp` (core `browserMount`). */
const BROWSER_PATH = /^\/__cawco\/browser\/([^/]+)\/(api(?:\/.*)?|cdp)$/u;

const refused = (status: number, why: string): Response =>
  new Response(`${why}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });

/**
 * The machine's one browser listener (core `BROWSER_LISTEN`): the hub's
 * relay alone reaches it, by the token of its last `browser.listen`, as a
 * preview listener's start token. A browser that sleeps is woken first.
 */
let browserListener:
  { listener: Server<BrowserSocket>; token: Buffer } | undefined;

/** The live browser a listener path names, woken first when it sleeps; or the refusal. */
async function liveBrowser(
  named: string | undefined
): Promise<{ key: BrowserKey; record: BrowserRecord } | Response> {
  let key = "";
  try {
    key = decodeURIComponent(named ?? "");
  } catch {
    // Not percent-encoded validly: no key.
  }
  if (!isBrowserKey(key)) {
    return refused(404, "There is no such browser path on this machine.");
  }
  const before = await readBrowser(key);
  if (before?.state === "live") {
    return { key, record: before };
  }
  if (!before) {
    return refused(404, `${key} has no browser on this machine.`);
  }
  try {
    const record = await wakeBrowser(key);
    return record
      ? { key, record }
      : refused(404, `${key} has no browser on this machine.`);
  } catch (error) {
    previewFailed("agent browser listener", null, causeOf(error));
    return refused(503, `${key} did not wake: ${causeOf(error)}`);
  }
}

/** The local host's take-over view of `key` (shield.ts `cdpView`), as a socket. */
function takeoverView(
  request: Request,
  server: Server<BrowserSocket>,
  key: BrowserKey,
  record: BrowserRecord
): Response | undefined {
  if (record.host !== "local") {
    return refused(
      404,
      `${key} runs in a container: its view is neko's, not the take-over's.`
    );
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return refused(400, "The take-over view is a WebSocket.");
  }
  return server.upgrade(request, {
    data: { cdp: key, closed: false, early: [] },
  })
    ? undefined
    : refused(400, "WebSocket upgrade failed");
}

/** neko's REST or its `/api/ws` socket (container host), at `rest` under its HTTP port. */
async function toNeko(
  request: Request,
  server: Server<BrowserSocket>,
  key: BrowserKey,
  record: BrowserRecord,
  at: string
): Promise<Response | undefined> {
  const { http } = portsOf(record);
  if (record.host !== "container" || http === undefined) {
    return refused(
      404,
      `${key} runs as a local Chromium on this machine: it has no neko to reach.`
    );
  }
  const headers = proxyHeaders(request.headers);
  // The relay's credential is this listener's; neko reads the viewer's
  // Bearer the hub set, and nothing of the page that asked.
  for (const name of [RELAY_HEADER, "host", "origin", "referer", "cookie"]) {
    headers.delete(name);
  }
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return upgradePreview(
      request,
      server as unknown as Server<PreviewSocket>,
      `ws://127.0.0.1:${http}${at}`,
      headers,
      { hop: "agent browser listener", instanceId: null }
    )
      ? undefined
      : refused(400, "WebSocket upgrade failed");
  }
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${http}${at}`, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });
  } catch (error) {
    previewFailed(
      "agent browser listener",
      null,
      `${key}'s neko didn't answer: ${causeOf(error)}`
    );
    return refused(502, `${key}'s neko didn't answer: ${causeOf(error)}`);
  }
  return new Response(response.body, {
    status: response.status,
    headers: decodedHeaders(response.headers),
  });
}

/** One request on the browser listener, its token already checked. */
async function serveBrowser(
  request: Request,
  server: Server<BrowserSocket>
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname === PREVIEW_PING_PATH) {
    return new Response("ok", { headers: { "cache-control": "no-store" } });
  }
  const [, named, rest] = url.pathname.match(BROWSER_PATH) ?? [];
  if (!rest) {
    return refused(404, "There is no such browser path on this machine.");
  }
  const live = await liveBrowser(named);
  if (live instanceof Response) {
    return live;
  }
  return rest === "cdp"
    ? takeoverView(request, server, live.key, live.record)
    : toNeko(request, server, live.key, live.record, `/${rest}${url.search}`);
}

/**
 * Opens the machine's browser listener when it has none; from now on it
 * answers `token` alone. Answers the port it listens on.
 */
export function listenBrowsers(args: unknown): { port: number } {
  const { token } = (args ?? {}) as Partial<BrowserListenArgs>;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("browser.listen names the hub's token for it.");
  }
  if (browserListener) {
    browserListener.token = Buffer.from(token);
    return { port: browserListener.listener.port as number };
  }
  const listener = Bun.serve<BrowserSocket>({
    hostname: "0.0.0.0",
    port: 0,
    websocket: browserSocket,
    fetch(request, server) {
      const given = Buffer.from(request.headers.get(RELAY_HEADER) ?? "");
      const expected = browserListener?.token ?? Buffer.alloc(0);
      if (
        expected.length === 0 ||
        given.length !== expected.length ||
        !timingSafeEqual(given, expected)
      ) {
        previewFailed(
          "agent browser listener",
          null,
          `refused a request to ${new URL(request.url).pathname} that its hub didn't relay`
        );
        return notRelayed();
      }
      return serveBrowser(request, server);
    },
    error(error) {
      previewFailed("agent browser listener", null, causeOf(error));
      return refused(502, causeOf(error));
    },
  });
  browserListener = { listener, token: Buffer.from(token) };
  return { port: listener.port as number };
}

/** Why a request to `source`'s port got no answer, in the down page's words. */
const unanswered = (
  source: { port: number; workspace?: string },
  error: unknown
): string =>
  `port ${source.port}${source.workspace ? ` in workspace ${source.workspace}` : ""} didn't answer the agent's listener: ${causeOf(error)}`;

/** A port source with the parts a start names, and none it leaves out. */
const portSource = (
  port: number,
  parts: Pick<
    Parameters<typeof startPreview>[0],
    "serve" | "stage" | "workspace"
  >
): Extract<PreviewSource, { port: number }> => ({
  port,
  ...(parts.workspace === undefined ? {} : { workspace: parts.workspace }),
  ...(parts.stage === undefined ? {} : { stage: parts.stage }),
  ...(parts.serve === undefined ? {} : { serve: parts.serve }),
});

/** The system's codes for a path that is not there, or not a folder on the way to it. */
const NOT_THERE = new Set(["ENOENT", "ENOTDIR"]);

/**
 * A folder preview's folder, its links resolved; refused when it is no
 * absolute path to a folder, and in core's `folderGone` words when the
 * folder is not there, so the hub records the preview's source gone.
 */
async function folderRoot(dir: string): Promise<string> {
  if (!isAbsolute(dir)) {
    throw new Error("Directory must be an absolute path.");
  }
  const root = await realpath(dir).catch((error: unknown) => {
    const code = (error as { code?: unknown } | null)?.code;
    throw typeof code === "string" && NOT_THERE.has(code)
      ? new Error(folderGone(causeOf(error)))
      : error;
  });
  if (!(await stat(root)).isDirectory()) {
    throw new Error(folderGone(`${dir} is not a folder`));
  }
  return root;
}

/**
 * Whether each of `dirs` is still a folder on this machine, read with a
 * `realpath` and a `stat` (folderRoot) and nothing else: no listener, no
 * process. For each, in order, core's `folderGone` words when it isn't
 * there, else null (a path that is no absolute one says nothing of it).
 */
export async function foldersThere(dirs: unknown): Promise<(string | null)[]> {
  if (!(Array.isArray(dirs) && dirs.every((dir) => typeof dir === "string"))) {
    throw new Error("foldersThere takes a list of folders' absolute paths.");
  }
  return await Promise.all(
    dirs.map((dir) =>
      folderRoot(dir).then(
        () => null,
        (error: unknown) => {
          const said = error instanceof Error ? error.message : String(error);
          return isFolderGone(said) ? said : null;
        }
      )
    )
  );
}

/** What a folder preview of `dir` loads at most, and the desk captures on its start page at `path` (core `folderWeight`). */
export async function previewWeight(
  dir: unknown,
  path?: unknown
): Promise<FolderWeight> {
  if (typeof dir !== "string") {
    throw new Error("previewWeight takes a folder's absolute path.");
  }
  return folderWeight(
    await folderRoot(dir),
    typeof path === "string" ? path : undefined
  );
}

export function startPreview(options: {
  instanceId: string;
  port?: number;
  dir?: string;
  /** A sheet's: the workspace's stage serves the port (core `PreviewSource`); each request wakes it. */
  stage?: { dir: string; file: string };
  /** A workspace preview's: the server the workspace's stage runs on the port (core `ServeSpec`); each request wakes it. */
  serve?: { command: string; cwd: string };
  /** The workspace whose network the port is in; none, the host's. */
  workspace?: string;
  /**
   * The hub's name for this start, which a stop of it alone names, and the
   * one credential the listener answers (core `RELAY_HEADER`).
   */
  token: string;
}): Promise<{ port: number }> {
  return inTurn(options.instanceId, () => start(options));
}

async function start(
  options: Parameters<typeof startPreview>[0]
): Promise<{ port: number }> {
  const { instanceId, port, dir, workspace, token, stage, serve } = options;
  if ((port === undefined) === (dir === undefined)) {
    throw new Error("Pass exactly one of port or dir.");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("A preview start names the hub's token for it.");
  }
  const relayToken = Buffer.from(token);
  if (workspace !== undefined && port === undefined) {
    throw new Error("A workspace goes with a port, not a dir.");
  }
  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 1 || port > 65_535)
  ) {
    throw new Error("Port must be an integer from 1 to 65535.");
  }
  const root = dir === undefined ? undefined : await folderRoot(dir);
  const source: Exclude<PreviewSource, { page: string }> =
    port === undefined
      ? { dir: root as string }
      : portSource(port, { workspace, stage, serve });
  await stopNow(instanceId);
  // A workspace no boundary runs refuses the preview in so many words. A
  // sheet's stage or a served preview's server is woken by its first
  // request (`staged`), which starts the boundary it runs in: a boundary
  // closed while it slept is no refusal.
  if (
    "port" in source &&
    !(source.workspace && (source.stage || source.serve))
  ) {
    await upstreamOf(instanceId, source);
  }
  /**
   * A sheet's stage or a workspace preview's server, woken when it sleeps;
   * its refusal is the page the pane draws. One in `error` starts again only
   * for a page's own load (a navigation: the pane opened, or its Try again):
   * an open page's background requests (Vite's client pinging its server
   * while it is down) are answered with the refusal, so the stage that
   * didn't start stands until the person asks again.
   */
  const staged = async (request: Request): Promise<Response | null> => {
    if (!(
      "port" in source &&
      (source.stage || source.serve) &&
      source.workspace
    )) {
      return null;
    }
    try {
      await wakeSource(
        source,
        request.headers.get("sec-fetch-mode") === "navigate"
      );
      return null;
    } catch (error) {
      previewFailed("agent listener", instanceId, causeOf(error));
      return downResponse("reach", 502, causeOf(error));
    }
  };
  /**
   * The hub's ping (hub preview.ts `pingSession`), answered as a load of
   * the page would be met, short of waking a stage: "ok", or the down page
   * the load would get, which the hub reads (core `downOf`). A folder, and a
   * port a stage serves (the load wakes it), answer at once; any other port
   * needs its workspace running and its server answering on it.
   */
  const pinged = async (): Promise<Response> => {
    const ok = new Response("ok", { headers: { "cache-control": "no-store" } });
    if (
      !("port" in source) ||
      (source.workspace && (source.stage || source.serve))
    ) {
      return ok;
    }
    let upstream: Awaited<ReturnType<typeof upstreamOf>>;
    try {
      upstream = await upstreamOf(instanceId, source);
    } catch (error) {
      return error instanceof WorkspaceDown
        ? downResponse("workspace", 503)
        : downResponse("reach", 502, causeOf(error));
    }
    try {
      // Answering at all is serving: a server still compiling is no refusal.
      await readWithin(PING_ASK_MS, async (signal) => {
        const answer = await fetch(
          upstream === "host"
            ? `http://127.0.0.1:${source.port}/`
            : `http://localhost:${source.port}/`,
          {
            method: "HEAD",
            headers: { host: `localhost:${source.port}` },
            redirect: "manual",
            signal,
            ...(upstream === "host" ? {} : { unix: upstream.unix }),
          }
        );
        await answer.body?.cancel();
      });
      return ok;
    } catch (error) {
      return downResponse("server", 502, unanswered(source, error));
    }
  };
  const listener = Bun.serve<PreviewSocket>({
    hostname: "0.0.0.0",
    port: 0,
    websocket: listenerSocket,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the two source modes converge here so header rewriting and HTML injection have one path.
    async fetch(request, server) {
      // `/__cawco/*` (the overlay among it) is the hub listener's own and
      // never reaches here, but the ping, which the hub relays to learn this
      // listener answers (hub preview.ts `pingSession`).
      const url = new URL(request.url);
      // The hub's relay alone, before anything here acts on the request or
      // tells the app it comes from its own localhost: a request straight to
      // this port (it binds 0.0.0.0 so the hub can reach it) would pass the
      // hub's lock and every dev server's same-origin check.
      const given = Buffer.from(request.headers.get(RELAY_HEADER) ?? "");
      if (
        given.length !== relayToken.length ||
        !timingSafeEqual(given, relayToken)
      ) {
        previewFailed(
          "agent listener",
          instanceId,
          `refused a request to ${url.pathname} that its hub didn't relay`
        );
        return notRelayed();
      }
      if (url.pathname === PREVIEW_PING_PATH) {
        return await pinged();
      }
      let response: Response;
      /** A folder's file at its folder's key: kept for good. */
      let versioned: string | null = null;
      if ("port" in source) {
        const route = machineRoute(url.pathname);
        if (route) {
          previewFailed(
            "agent listener",
            instanceId,
            `refused /${route}: it opens a file or a program on this machine`
          );
          return refusal(route);
        }
        const headers = proxyHeaders(request.headers);
        // The relay's credential is this listener's, never the app's.
        headers.delete(RELAY_HEADER);
        headers.set("host", `localhost:${source.port}`);
        for (const name of FORWARDING_HEADERS) {
          headers.delete(name);
        }
        if (headers.has("origin")) {
          headers.set("origin", `http://localhost:${source.port}`);
        }
        // The page's own Referer names the preview origin: the dev server
        // hears it as its own address, as it does the Host and Origin.
        const referer = headers.get("referer");
        if (referer) {
          try {
            const ref = new URL(referer);
            headers.set(
              "referer",
              `http://localhost:${source.port}${ref.pathname}${ref.search}`
            );
          } catch {
            headers.delete("referer");
          }
        }
        headers.set("accept-encoding", "identity");
        // It waits on the stage's wake and the server's first answer.
        heldWhileServed(server, request);
        const asleep = await staged(request);
        if (asleep) {
          return asleep;
        }
        let upstream: Awaited<ReturnType<typeof upstreamOf>>;
        try {
          upstream = await upstreamOf(instanceId, source);
        } catch (error) {
          if (error instanceof WorkspaceDown) {
            previewFailed(
              "agent listener",
              instanceId,
              `workspace ${source.workspace} has no boundary running`
            );
            return downResponse("workspace", 503);
          }
          // The bridge into the workspace's network did not open.
          previewFailed("bridge", instanceId, causeOf(error));
          return downResponse("reach", 502, causeOf(error));
        }
        const at = `${url.pathname}${url.search}`;
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const ws =
            upstream === "host"
              ? `ws://127.0.0.1:${source.port}${at}`
              : `ws+unix://${upstream.unix}:${at}`;
          return upgradePreview(request, server, ws, headers, {
            hop: "agent listener",
            instanceId,
            // A page's open socket (its HMR) is a viewer: the stage stays awake for it.
            ...((source.stage || source.serve) && source.workspace
              ? { viewer: () => sourceViewer(source) }
              : {}),
          })
            ? undefined
            : new Response("WebSocket upgrade failed", { status: 400 });
        }
        try {
          response = await fetch(
            upstream === "host"
              ? `http://127.0.0.1:${source.port}${at}`
              : `http://localhost:${source.port}${at}`,
            {
              method: request.method,
              headers,
              body: request.body,
              redirect: "manual",
              ...(upstream === "host" ? {} : { unix: upstream.unix }),
            }
          );
        } catch (error) {
          // Nothing answered: the workspace closed under it, or its server is down.
          const network = networkOf(source);
          if (network !== undefined && (await workspaceGone(network))) {
            previewFailed(
              "agent listener",
              instanceId,
              `workspace ${source.workspace} closed under it`
            );
            await closeBridge(instanceId);
            return downResponse("workspace", 503);
          }
          const why = unanswered(source, error);
          previewFailed("agent listener", instanceId, why);
          return downResponse("server", 502, why);
        }
      } else {
        // A file at its folder's key (core `versionAssets`), or the page's own address.
        versioned = versionedFile(url.pathname);
        const asked = versioned ?? url.pathname;
        const filePath = resolve(
          source.dir,
          `.${decodeURIComponent(asked === "/" ? "/index.html" : asked)}`
        );
        let actual: string;
        try {
          actual = await realpath(filePath);
        } catch {
          return new Response("Not found", { status: 404 });
        }
        const path = relative(source.dir, actual);
        if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
          return new Response("Forbidden", { status: 403 });
        }
        if (!(await stat(actual)).isFile()) {
          return new Response("Not found", { status: 404 });
        }
        // A file at its folder's key never changes its bytes, so it is kept
        // for good (core `IMMUTABLE`, longer than any TTL a CDN would set);
        // the page's own address is what is on disk now.
        response = new Response(Bun.file(actual), {
          headers: {
            "cache-control": versioned === null ? "no-store" : IMMUTABLE,
          },
        });
      }
      const headers = decodedHeaders(response.headers);
      for (const name of [
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
      ]) {
        headers.delete(name);
      }
      // What the server said of its caching, as far as it is safe (core
      // `previewCache`): no CDN stands between this hop and the hub, so the
      // hub's listener for host-mode names is where `no-cache` becomes
      // `no-store`.
      cachePreview(headers, response.status, true);
      if ("port" in source) {
        // The preview's own port answered (every refusal of this listener returned above).
        headers.set(PREVIEW_SERVED_HEADER, "1");
        const location = headers.get("location");
        if (location) {
          // A redirect back to the app itself, under any loopback name, has
          // to stay inside the proxy: the browser's loopback is not this one.
          const target = new URL(location, `http://localhost:${source.port}/`);
          if (
            LOOPBACK.has(target.hostname) &&
            Number(target.port || 80) === source.port
          ) {
            headers.set(
              "location",
              `${target.pathname}${target.search}${target.hash}`
            );
          }
        }
      }
      let body: ReadableStream<Uint8Array> | string | null = response.body;
      if (
        headers.get("content-type")?.startsWith("text/html") &&
        request.method !== "HEAD" &&
        response.body
      ) {
        body = injectOverlay(await response.text());
        if ("dir" in source && versioned === null) {
          // The folder's page: its own files at the folder's key, kept.
          body = versionAssets(
            body,
            await folderKey(source.dir),
            "/",
            url.pathname
          );
        }
        headers.delete("content-length");
        headers.delete("content-encoding");
      }
      return new Response(request.method === "HEAD" ? null : body, {
        status: response.status,
        headers,
      });
    },
    // Anything else that threw while serving the preview.
    error(error) {
      const why = `the agent's listener failed serving it: ${causeOf(error)}`;
      previewFailed("agent listener", instanceId, why);
      return downResponse("server", 502, why);
    },
  });
  previews.set(instanceId, {
    listener,
    source: "port" in source ? source : { dir: dir as string },
    token,
  });
  return { port: listener.port as number };
}
