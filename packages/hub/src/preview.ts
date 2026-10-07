import { extname } from "node:path";
import type { FramePayload, PreviewSource } from "@cawco/core";
import {
  type PreviewSocket,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/core/preview-proxy";
import { embeddedFile, standalone } from "@cawco/core/runtime";
import { PREVIEW_PORT } from "./config";
import { FolderRefusal, folderFileOnDisk } from "./project-folder";

/**
 * Each preview target maps an instance id to the daemon address and port that
 * serves its content. The dashboard routes `/preview/<id>/…` here via the
 * `x-cawco-preview` header, so there is no per-browser limitation — every
 * tab can show a different preview simultaneously.
 *
 * A target is the operator's intent, and it outlives the listener: while its
 * machine is away `upstream` is absent, and the register that brings the
 * machine back starts the listener again and fills it in.
 *
 * A page in a project's hub folder (`{ project, page }`, a decision page) has
 * no machine listener at all: this listener serves it from the folder itself,
 * with the same overlay injected, and `machineId` is only the session's.
 */
export const previewTargets = new Map<
  string,
  {
    machineId: string;
    source: PreviewSource;
    revision: string;
    upstream?: { address: string; port: number };
  }
>();

/** A page in a project's hub folder, which the hub serves itself. */
export const servedByHub = (
  source: PreviewSource
): source is { project: string; page: string } => "project" in source;

export function previewFrame(
  instanceId: string,
  state: "open" | "closed",
  source: PreviewSource,
  revision: string
): Extract<FramePayload, { kind: "preview" }> {
  return {
    kind: "preview",
    instanceId,
    state,
    path: `/preview/${encodeURIComponent(instanceId)}/${encodeURIComponent(revision)}/`,
    source,
    revision,
  };
}

// --- the page's hash ---------------------------------------------------------

/** Pages whose hash this process remembers, before the oldest is let go. */
const HASHES_KEPT = 2000;
/**
 * The content hash of each HTML page this listener served, by instance and
 * path: what a pick on that page is stored with (choices.ts), so a reader
 * can tell a pick made on an earlier revision.
 */
const pageHashes = new Map<string, string>();
const INDEX_FILE = /(^|\/)index\.html?$/i;

/** `/`, `/index.html` and `` are one page; so are `/a/` and `/a/index.html`. */
export const pagePath = (path: string): string => {
  const trimmed = path.replace(INDEX_FILE, "$1");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const hashKey = (instanceId: string, path: string) =>
  `${instanceId}\n${pagePath(path)}`;

/** sha256 of the page, its first 16 hex characters. */
export const contentHash = (html: string): string =>
  new Bun.CryptoHasher("sha256").update(html).digest("hex").slice(0, 16);

const rememberHash = (instanceId: string, path: string, html: string) => {
  const key = hashKey(instanceId, path);
  pageHashes.delete(key);
  pageHashes.set(key, contentHash(html));
  if (pageHashes.size > HASHES_KEPT) {
    const [oldest] = pageHashes.keys();
    if (oldest !== undefined) {
      pageHashes.delete(oldest);
    }
  }
};

/** The hash of the page at `path` as this listener last served it to `instanceId`'s preview. */
export const pageHash = (instanceId: string, path: string): string | null =>
  pageHashes.get(hashKey(instanceId, path)) ?? null;

// --- the overlay, for pages the hub serves itself ------------------------------

let overlay: Promise<string> | undefined;

/**
 * The same script the daemons inject (packages/agent/src/preview-overlay):
 * embedded in a release binary, beside a packed bundle, or built from the
 * source checkout on first use, as `packages/agent/src/preview.ts` does.
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
      Bun.fileURLToPath(
        new URL("../../agent/src/preview-overlay/overlay.ts", import.meta.url)
      ),
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

function loadOverlay(): Promise<string> {
  overlay ??= buildOverlay().catch((error: unknown) => {
    overlay = undefined;
    throw error;
  });
  return overlay;
}

const OVERLAY_TAG = `<script src="/__cawco/overlay.js"></script>`;
const HEAD_OPEN = /<head(\s[^>]*)?\s*>/i;
const HEAD_CLOSE = /<\/head\s*>/i;
const BODY = /<\/body\s*>/i;

/** The overlay first in <head>, as the daemons inject it. */
const withOverlay = (html: string): string => {
  if (HEAD_OPEN.test(html)) {
    return html.replace(HEAD_OPEN, (match) => match + OVERLAY_TAG);
  }
  if (HEAD_CLOSE.test(html)) {
    return html.replace(HEAD_CLOSE, (match) => OVERLAY_TAG + match);
  }
  if (BODY.test(html)) {
    return html.replace(BODY, (match) => OVERLAY_TAG + match);
  }
  return html + OVERLAY_TAG;
};

const NO_STORE = { "cache-control": "no-store" };
const LEADING_SLASHES = /^\/+/;

/** One file of a hub folder page: `/` is the page's index.html. */
async function serveFolderPage(
  instanceId: string,
  source: { project: string; page: string },
  url: URL
): Promise<Response> {
  if (url.pathname === "/__cawco/overlay.js") {
    return new Response(await loadOverlay(), {
      headers: { "content-type": "text/javascript", ...NO_STORE },
    });
  }
  let rel: string;
  try {
    rel = decodeURIComponent(url.pathname).replace(LEADING_SLASHES, "");
  } catch {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
  if (rel === "" || rel.endsWith("/")) {
    rel = `${rel}index.html`;
  }
  let real: string;
  try {
    real = await folderFileOnDisk(source.project, `${source.page}/${rel}`);
  } catch (error) {
    if (error instanceof FolderRefusal) {
      return new Response(error.message, {
        status: error.status === 404 ? 404 : 400,
        headers: NO_STORE,
      });
    }
    throw error;
  }
  const ext = extname(real).toLowerCase();
  if (ext === ".html" || ext === ".htm") {
    const html = await Bun.file(real).text();
    rememberHash(instanceId, url.pathname, html);
    return new Response(withOverlay(html), {
      headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE },
    });
  }
  return new Response(Bun.file(real), { headers: NO_STORE });
}

/**
 * An upstream answer on its way down. A page is read whole, for the hash its
 * picks are stored with; every other response streams.
 */
async function relayed(
  instanceId: string,
  request: Request,
  url: URL,
  response: Response,
  headers: Headers
): Promise<Response> {
  const page =
    request.method === "GET" &&
    response.ok &&
    response.body &&
    headers.get("content-type")?.startsWith("text/html");
  if (!page) {
    return new Response(response.body, { status: response.status, headers });
  }
  const html = await response.text();
  rememberHash(instanceId, url.pathname, html);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
}

export function startPreviewListener(hostname: string) {
  return Bun.serve<PreviewSocket>({
    hostname,
    port: PREVIEW_PORT,
    websocket: previewWebSocket,
    async fetch(request, server) {
      const instanceId = request.headers.get("x-cawco-preview");
      const target = instanceId ? previewTargets.get(instanceId) : undefined;
      if (!(instanceId && target)) {
        return new Response("No preview selected.", { status: 404 });
      }
      const url = new URL(request.url);
      if (servedByHub(target.source)) {
        return await serveFolderPage(instanceId, target.source, url);
      }
      if (!target.upstream) {
        return new Response("Preview is restarting.", { status: 503 });
      }
      const address = target.upstream.address.includes(":")
        ? `[${target.upstream.address}]`
        : target.upstream.address;
      const upstream = `${address}:${target.upstream.port}${url.pathname}${url.search}`;
      const headers = proxyHeaders(request.headers);
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return upgradePreview(request, server, `ws://${upstream}`, headers)
          ? undefined
          : new Response("WebSocket upgrade failed", { status: 400 });
      }
      const response = await fetch(`http://${upstream}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });
      const downstream = proxyHeaders(response.headers);
      // Same as the daemon hop: the body is already decoded here.
      if (downstream.has("content-encoding")) {
        downstream.delete("content-encoding");
        downstream.delete("content-length");
      }
      return await relayed(instanceId, request, url, response, downstream);
    },
    error() {
      return new Response("Preview upstream unavailable", { status: 502 });
    },
  });
}
