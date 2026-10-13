import { realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { PreviewFrame, PreviewSource } from "@cawco/core";
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
import type { ServerWebSocket, WebSocketHandler } from "bun";
import {
  ARTIFACT_PATH,
  type ArtifactSocket,
  type artifactSend,
  type artifactSocket,
} from "./artifacts/sync";
import { ARTIFACTS_ROOT, PREVIEW_PORT } from "./config";
import { FolderRefusal, folderPath } from "./project-folder";

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
export interface PreviewTarget {
  /** The artifact the panel shows (Projects spec §5.10). */
  artifact: PreviewFrame["artifact"];
  machineId: string;
  revision: string;
  source: PreviewSource;
  upstream?: { address: string; port: number };
}

export const previewTargets = new Map<string, PreviewTarget>();

/** One string per thing a preview shows: a page by name, a port in a workspace or on the host, a folder. */
export const previewSourceKey = (source: PreviewSource): string => {
  if ("page" in source) {
    return `page:${source.page}`;
  }
  if ("port" in source) {
    return source.workspace
      ? `port:${source.port}@${source.workspace}`
      : `port:${source.port}`;
  }
  return `dir:${source.dir}`;
};

export function previewFrame(
  instanceId: string,
  state: "open" | "closed",
  target: Pick<PreviewTarget, "artifact" | "revision" | "source">
): PreviewFrame {
  return {
    kind: "preview",
    instanceId,
    state,
    artifact: target.artifact,
    path: `/preview/${encodeURIComponent(instanceId)}/${encodeURIComponent(target.revision)}/`,
    port: PREVIEW_PORT,
    source: target.source,
    revision: target.revision,
  };
}

/**
 * A file of a page artifact, `artifacts/<id>/…` under the hub's data dir,
 * served by the hub itself: no machine holds that folder. A path that leaves
 * the page's folder, by `..` or by a link, is refused; the HTML gets the
 * overlay like any other preview.
 */
async function servePage(
  artifactId: string,
  pathname: string,
  state: (artifactId: string) => string
): Promise<Response> {
  if (pathname === OVERLAY_PATH) {
    return overlayResponse();
  }
  let file: string;
  let root: string;
  try {
    root = await realpath(join(ARTIFACTS_ROOT, artifactId));
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
    ? new Response(
        injectOverlay(await body.text(), {
          artifact: artifactId,
          state: state(artifactId),
        }),
        { headers }
      )
    : new Response(body, { headers });
}

type ListenerSocket = PreviewSocket | ArtifactSocket;

const isArtifact = (
  socket: ServerWebSocket<ListenerSocket>
): socket is ServerWebSocket<ArtifactSocket> => "artifactId" in socket.data;

/**
 * The session a request is for. The dashboard names the preview in a header
 * on every hop; a web view in the Apple app cannot put a header on the
 * page's own loads, so it names it in a cookie on the hub's host, which they
 * all carry.
 */
const sessionNamed = (request: Request): string | null | undefined =>
  request.headers.get("x-cawco-preview") ??
  new Bun.CookieMap(request.headers.get("cookie") ?? "").get("cawco-preview");

/** An artifact's sync socket, or its send (`/send`), for the session that owns it only. */
const joinArtifact = (
  request: Request,
  server: Bun.Server<ListenerSocket>,
  [, artifactId, send]: RegExpMatchArray,
  instanceId: string | null | undefined,
  artifacts: {
    ownerOf: (artifactId: string) => string | undefined;
    send: ReturnType<typeof artifactSend>;
  }
): Response | Promise<Response> | undefined => {
  if (!instanceId || artifacts.ownerOf(artifactId) !== instanceId) {
    return new Response("This session has no such artifact.", { status: 404 });
  }
  if (send) {
    return artifacts.send(request, instanceId, artifactId);
  }
  return server.upgrade(request, { data: { artifactId } })
    ? undefined
    : new Response("WebSocket upgrade failed", { status: 400 });
};

export function startPreviewListener(
  hostname: string,
  artifacts: {
    /** The session that owns an artifact; undefined when there is none. */
    ownerOf: (artifactId: string) => string | undefined;
    send: ReturnType<typeof artifactSend>;
    socket: ReturnType<typeof artifactSocket>;
    /** A page artifact's doc as one base64 Yjs update, embedded in its overlay tag. */
    state: (artifactId: string) => string;
  }
) {
  const proxy = previewWebSocket as unknown as WebSocketHandler<ListenerSocket>;
  return Bun.serve<ListenerSocket>({
    hostname,
    port: PREVIEW_PORT,
    websocket: {
      open: (socket) =>
        isArtifact(socket)
          ? artifacts.socket.open(socket)
          : proxy.open?.(socket),
      message: (socket, message) =>
        isArtifact(socket)
          ? artifacts.socket.message(socket, message)
          : proxy.message(socket, message),
      close: (socket, code, reason) =>
        isArtifact(socket)
          ? artifacts.socket.close(socket)
          : proxy.close?.(socket, code, reason),
    },
    async fetch(request, server) {
      const instanceId = sessionNamed(request);
      const synced = new URL(request.url).pathname.match(ARTIFACT_PATH);
      if (synced) {
        return joinArtifact(request, server, synced, instanceId, artifacts);
      }
      const target = instanceId ? previewTargets.get(instanceId) : undefined;
      if (!target) {
        return new Response("No preview selected.", { status: 404 });
      }
      if ("page" in target.source) {
        return servePage(
          target.artifact.id,
          new URL(request.url).pathname,
          artifacts.state
        );
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
