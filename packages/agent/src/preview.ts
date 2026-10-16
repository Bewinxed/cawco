import { timingSafeEqual } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { PreviewSource } from "@cawco/core";
import {
  causeOf,
  downResponse,
  injectOverlay,
  type PreviewSocket,
  previewFailed,
  previewWebSocket,
  proxyHeaders,
  RELAY_HEADER,
  upgradePreview,
} from "@cawco/core/preview-proxy";
import type { Server, WebSocketHandler } from "bun";
import {
  closeBridge,
  reachWorkspace,
  WorkspaceDown,
  workspaceGone,
} from "./preview-bridge";
import { sourceViewer, wakeSource } from "./stage";

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
    const sent = JSON.parse(String(message)) as {
      type?: unknown;
      event?: unknown;
    };
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
 * workspace's port the socket of the bridge into that workspace's network
 * (`preview-bridge.ts`); a workspace with no boundary running throws
 * {@link WorkspaceDown}.
 */
const upstreamOf = async (
  instanceId: string,
  source: { port: number; workspace?: string }
): Promise<{ unix: string } | "host"> => {
  if (source.workspace === undefined) {
    return "host";
  }
  const reached = await reachWorkspace(
    instanceId,
    source.workspace,
    source.port
  );
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

/** Stops every preview: each bridge's whole group is killed before this returns, its end awaited by no one. */
export function stopPreviews(): void {
  for (const instanceId of [...previews.keys()]) {
    stopPreview({ instanceId }).catch(console.error);
  }
}

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
  if (dir !== undefined && !isAbsolute(dir)) {
    throw new Error("Directory must be an absolute path.");
  }
  const root = dir === undefined ? undefined : await realpath(dir);
  if (root && !(await stat(root)).isDirectory()) {
    throw new Error("Directory does not exist.");
  }
  const source: Exclude<PreviewSource, { page: string }> =
    port === undefined
      ? { dir: root as string }
      : portSource(port, { workspace, stage, serve });
  await stopNow(instanceId);
  if ("port" in source) {
    // A workspace no boundary runs refuses the preview in so many words.
    await upstreamOf(instanceId, source);
  }
  /** A sheet's stage or a workspace preview's server, woken when it sleeps or failed; its refusal is the page the pane draws. */
  const staged = async (): Promise<Response | null> => {
    if (!(
      "port" in source &&
      (source.stage || source.serve) &&
      source.workspace
    )) {
      return null;
    }
    try {
      await wakeSource(source);
      return null;
    } catch (error) {
      previewFailed("agent listener", instanceId, causeOf(error));
      return downResponse("reach", 502, causeOf(error));
    }
  };
  const listener = Bun.serve<PreviewSocket>({
    hostname: "0.0.0.0",
    port: 0,
    websocket: listenerSocket,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the two source modes converge here so header rewriting and HTML injection have one path.
    async fetch(request, server) {
      // `/__cawco/*` (the overlay among it) is the hub listener's own and
      // never reaches here.
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
      let response: Response;
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
        // A preview always asks for bytes, never a cached representation.
        headers.delete("if-none-match");
        headers.delete("if-modified-since");
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
        const asleep = await staged();
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
          if (
            source.workspace !== undefined &&
            (await workspaceGone(source.workspace))
          ) {
            previewFailed(
              "agent listener",
              instanceId,
              `workspace ${source.workspace} closed under it`
            );
            await closeBridge(instanceId);
            return downResponse("workspace", 503);
          }
          previewFailed(
            "agent listener",
            instanceId,
            `port ${source.port}${source.workspace ? ` in workspace ${source.workspace}` : ""} didn't answer: ${causeOf(error)}`
          );
          return downResponse("server");
        }
      } else {
        const filePath = resolve(
          source.dir,
          `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`
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
        response = new Response(Bun.file(actual));
      }
      const headers = proxyHeaders(response.headers);
      // fetch has already decoded the body; a `content-encoding` left on the
      // way down would label plain bytes as gzip and the browser refuses them.
      if (headers.has("content-encoding")) {
        headers.delete("content-encoding");
        headers.delete("content-length");
      }
      for (const name of [
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
      ]) {
        headers.delete(name);
      }
      // A preview is work in progress, so nothing in it is kept: the page the
      // operator reloads is the page on disk now. A dev server's own
      // `no-cache` does not say that to a CDN in front of the dashboard —
      // Cloudflare rewrites it, and a missing header, to `max-age=14400` and
      // caches the file at its edge, so a module stayed four hours stale in
      // the browser and a fix to the proxy never reached it. `no-store` is the
      // one value it passes through untouched.
      headers.set("cache-control", "no-store");
      headers.delete("expires");
      headers.delete("etag");
      headers.delete("last-modified");
      if ("port" in source) {
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
      previewFailed("agent listener", instanceId, causeOf(error));
      return downResponse("server");
    },
  });
  previews.set(instanceId, {
    listener,
    source: "port" in source ? source : { dir: dir as string },
    token,
  });
  return { port: listener.port as number };
}
