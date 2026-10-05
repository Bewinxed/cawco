import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { PreviewSource } from "@cawco/core";
import {
  type PreviewSocket,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/core/preview-proxy";
import { embeddedFile, standalone } from "@cawco/core/runtime";
import type { Server } from "bun";

/**
 * The listeners this process serves, with the source each was asked for. They
 * outlive the hub connection: a hub that drops and comes back reads them off
 * the register ({@link servingPreviews}) and points its targets at them again.
 */
const previews = new Map<
  string,
  { listener: Server<PreviewSocket>; source: PreviewSource }
>();
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HEAD_OPEN = /<head(\s[^>]*)?\s*>/i;
const HEAD_CLOSE = /<\/head\s*>/i;
const BODY = /<\/body\s*>/i;
const PREVIEW_PREFIX = /^\/preview\/[^/]+\/[^/]+\//;
let overlay: Promise<string> | undefined;

/**
 * The script the forwarder injects into every previewed page. Two deployment
 * shapes reach this code: a source checkout, where the overlay's TypeScript
 * sits beside this file and is bundled here on first request; and the packed
 * release, where `build-release.mjs` folded this file into `cli.js` and put a
 * prebuilt `preview-overlay.js` next to it, because the source and its
 * dependency are not shipped. The sibling wins when it is there.
 */
async function buildOverlay(): Promise<string> {
  if (standalone) {
    return Bun.file(embeddedFile("preview/overlay.js")).text();
  }
  const prebuilt = Bun.file(new URL("./preview-overlay.js", import.meta.url));
  if (await prebuilt.exists()) {
    return await prebuilt.text();
  }
  const result = await Bun.build({
    entrypoints: [
      new URL("./preview-overlay/overlay.ts", import.meta.url).pathname,
    ],
    target: "browser",
    minify: true,
    format: "iife",
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Preview overlay build failed");
  }
  return result.outputs[0].text();
}

/**
 * Built once per process and kept, unless the build fails — a missing source
 * file makes `Bun.build` throw rather than answer `success: false`, and a
 * rejected promise left in the cache would turn one bad request into every
 * request until restart. A failure clears the slot so the next one retries.
 */
function loadOverlay(): Promise<string> {
  overlay ??= buildOverlay().catch((error: unknown) => {
    overlay = undefined;
    throw error;
  });
  return overlay;
}

export function stopPreview({ instanceId }: { instanceId: string }): boolean {
  previews.get(instanceId)?.listener.stop(true);
  return previews.delete(instanceId);
}

/** What the register tells the hub this process is serving. */
export function servingPreviews(): {
  instanceId: string;
  port: number;
  source: PreviewSource;
}[] {
  return [...previews].map(([instanceId, { listener, source }]) => ({
    instanceId,
    port: listener.port as number,
    source,
  }));
}

export function stopPreviews(): void {
  for (const instanceId of previews.keys()) {
    stopPreview({ instanceId });
  }
}

export async function startPreview(options: {
  instanceId: string;
  port?: number;
  dir?: string;
}): Promise<{ port: number }> {
  const { instanceId, port, dir } = options;
  if ((port === undefined) === (dir === undefined)) {
    throw new Error("Pass exactly one of port or dir.");
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
  const source: PreviewSource =
    port === undefined ? { dir: root as string } : { port };
  const script = `<script src="/__cawco/overlay.js"></script>`;
  stopPreview({ instanceId });
  const listener = Bun.serve<PreviewSocket>({
    hostname: "0.0.0.0",
    port: 0,
    websocket: previewWebSocket,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the two source modes converge here so header rewriting and HTML injection have one path.
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/__cawco/overlay.js") {
        return new Response(await loadOverlay(), {
          headers: {
            "content-type": "text/javascript",
            "cache-control": "no-store",
          },
        });
      }
      let response: Response;
      if ("port" in source) {
        const headers = proxyHeaders(request.headers);
        // A preview always asks for bytes, never a cached representation.
        headers.delete("if-none-match");
        headers.delete("if-modified-since");
        headers.set("host", `localhost:${source.port}`);
        if (headers.has("origin")) {
          headers.set("origin", `http://localhost:${source.port}`);
        }
        const referer = headers.get("referer");
        if (referer) {
          try {
            const ref = new URL(referer);
            const stripped = ref.pathname.replace(PREVIEW_PREFIX, "/");
            headers.set(
              "referer",
              `http://localhost:${source.port}${stripped}${ref.search}`
            );
          } catch {
            // malformed Referer — drop it rather than forward a dashboard URL
            headers.delete("referer");
          }
        }
        headers.set("accept-encoding", "identity");
        const target = `127.0.0.1:${source.port}${url.pathname}${url.search}`;
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          return upgradePreview(request, server, `ws://${target}`, headers)
            ? undefined
            : new Response("WebSocket upgrade failed", { status: 400 });
        }
        response = await fetch(`http://${target}`, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        });
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
        const html = await response.text();
        // Inject as the first child of <head> so it executes before Vite's
        // deferred /@vite/client module. Fall back to before </head> or </body>.
        if (HEAD_OPEN.test(html)) {
          body = html.replace(HEAD_OPEN, (match) => match + script);
        } else if (HEAD_CLOSE.test(html)) {
          body = html.replace(HEAD_CLOSE, (match) => script + match);
        } else if (BODY.test(html)) {
          body = html.replace(BODY, (match) => script + match);
        } else {
          body = html + script;
        }
        headers.delete("content-length");
        headers.delete("content-encoding");
      }
      return new Response(request.method === "HEAD" ? null : body, {
        status: response.status,
        headers,
      });
    },
    error() {
      return new Response("Preview upstream unavailable", { status: 502 });
    },
  });
  previews.set(instanceId, {
    listener,
    source: port === undefined ? { dir: dir as string } : { port },
  });
  return { port: listener.port as number };
}
