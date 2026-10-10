import { realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { FramePayload, PreviewSource } from "@cawco/core";
import {
  downResponse,
  injectOverlay,
  OVERLAY_PATH,
  overlayResponse,
  type PreviewSocket,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/core/preview-proxy";
import { PREVIEW_PORT } from "./config";
import { FolderRefusal, folderPath, projectRoot } from "./project-folder";

/**
 * Each preview target maps an instance id to the daemon address and port that
 * serves its content. The dashboard routes `/preview/<id>/…` here via the
 * `x-cawco-preview` header, so there is no per-browser limitation — every
 * tab can show a different preview simultaneously.
 *
 * A target is the operator's intent, and it outlives the listener: while its
 * machine is away `upstream` is absent, and the register that brings the
 * machine back starts the listener again and fills it in.
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
    port: PREVIEW_PORT,
    source,
    revision,
  };
}

/**
 * A file of a decision page, `decisions/<page>/…` in the project's hub
 * folder, served by the hub itself: no machine holds that folder. A path
 * that leaves the page's folder, by `..` or by a link, is refused; the HTML
 * gets the overlay like any other preview.
 */
async function servePage(
  source: { project: string; page: string },
  pathname: string
): Promise<Response> {
  if (pathname === OVERLAY_PATH) {
    return overlayResponse();
  }
  let file: string;
  let root: string;
  try {
    root = await realpath(
      join(projectRoot(source.project), "decisions", folderPath(source.page))
    );
    file = await realpath(
      join(
        root,
        folderPath(
          decodeURIComponent(pathname === "/" ? "/index.html" : pathname).slice(
            1
          )
        )
      )
    );
  } catch (error) {
    return error instanceof FolderRefusal
      ? new Response(error.message, { status: error.status })
      : new Response("Not found", { status: 404 });
  }
  const inside = relative(root, file);
  if (inside === ".." || inside.startsWith(`..${sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await stat(file)).isFile()) {
    return new Response("Not found", { status: 404 });
  }
  const body = Bun.file(file);
  const headers = { "cache-control": "no-store", "content-type": body.type };
  return body.type.startsWith("text/html")
    ? new Response(injectOverlay(await body.text()), { headers })
    : new Response(body, { headers });
}

export function startPreviewListener(hostname: string) {
  return Bun.serve<PreviewSocket>({
    hostname,
    port: PREVIEW_PORT,
    websocket: previewWebSocket,
    async fetch(request, server) {
      // The dashboard names the preview in a header on every hop; a web
      // view in the Apple app cannot put a header on the page's own loads,
      // so it names it in a cookie on the hub's host, which they all carry.
      const instanceId =
        request.headers.get("x-cawco-preview") ??
        new Bun.CookieMap(request.headers.get("cookie") ?? "").get(
          "cawco-preview"
        );
      const target = instanceId ? previewTargets.get(instanceId) : undefined;
      if (!target) {
        return new Response("No preview selected.", { status: 404 });
      }
      if ("project" in target.source) {
        return servePage(target.source, new URL(request.url).pathname);
      }
      // Its machine is away: the register that brings it back serves it again.
      if (!target.upstream) {
        return downResponse("machine", 503);
      }
      const url = new URL(request.url);
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
      return new Response(response.body, {
        status: response.status,
        headers: downstream,
      });
    },
    // The machine's preview listener did not answer.
    error() {
      return downResponse("machine");
    },
  });
}
