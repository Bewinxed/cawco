import { realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  ArtifactKind,
  PreviewDown,
  PreviewFrame,
  PreviewSource,
} from "@cawco/core";
import {
  causeOf,
  downResponse,
  injectOverlay,
  OVERLAY_PATH,
  overlayResponse,
  type PreviewSocket,
  previewFailed,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/core/preview-proxy";
import type { ServerWebSocket, WebSocketHandler } from "bun";
import { serveCanvas } from "./artifacts/canvas";
import {
  ARTIFACT_PATH,
  type ArtifactSocket,
  type artifactPicture,
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
 * A target is the operator's intent, kept in the database (`shown_previews`)
 * so it outlives the hub too, and it outlives the listener: while no
 * listener serves it (its machine away or restarted, or its start failed)
 * `upstream` is absent, and the machine's register or the preview's next
 * request starts the listener again and fills it in. Only a close, or the
 * session ending, ends it.
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

/** Where a shown preview is served now, or the hop that failed and why (server.ts `reachPreview`). */
export type PreviewReach =
  | { ok: true; upstream: NonNullable<PreviewTarget["upstream"]> }
  | { ok: false; down: PreviewDown; error: string };

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

/** What the hub serves for an artifact it holds: a page's files, or a canvas's host page. */
const HUB_SERVES: Record<ArtifactKind, typeof servePage> = {
  page: servePage,
  preview: servePage,
  canvas: serveCanvas,
};

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

/** An artifact's sync socket, its send (`/send`) or a canvas's picture (`/picture`), for the session that owns it only. */
const joinArtifact = (
  request: Request,
  server: Bun.Server<ListenerSocket>,
  [, artifactId, action]: RegExpMatchArray,
  instanceId: string | null | undefined,
  artifacts: {
    ownerOf: (artifactId: string) => string | undefined;
    picture: ReturnType<typeof artifactPicture>;
    send: ReturnType<typeof artifactSend>;
  }
): Response | Promise<Response> | undefined => {
  if (!instanceId || artifacts.ownerOf(artifactId) !== instanceId) {
    return new Response("This session has no such artifact.", { status: 404 });
  }
  if (action === "/send") {
    return artifacts.send(request, instanceId, artifactId);
  }
  if (action === "/picture") {
    return artifacts.picture(request, artifactId);
  }
  const screen = new URL(request.url).searchParams.get("screen") === "1";
  return server.upgrade(request, { data: { artifactId, screen } })
    ? undefined
    : new Response("WebSocket upgrade failed", { status: 400 });
};

/**
 * A canvas by its id, whichever artifact the panel shows: the composer's
 * canvas stands outside the panel, at `/__cawco/canvas/<id>/` under the
 * session's preview prefix, its bundle and fonts under that.
 */
const CANVAS_PATH = /^\/__cawco\/canvas\/([0-9a-f-]{36})(\/.*)$/;

/** A canvas by its id, for the session that owns it only. */
const canvasById = (
  [, artifactId, rest]: RegExpMatchArray,
  instanceId: string | null | undefined,
  artifacts: {
    kindOf: (artifactId: string) => ArtifactKind | undefined;
    ownerOf: (artifactId: string) => string | undefined;
    state: (artifactId: string) => string;
  }
): Promise<Response> | Response =>
  instanceId &&
  artifacts.ownerOf(artifactId) === instanceId &&
  artifacts.kindOf(artifactId) === "canvas"
    ? serveCanvas(artifactId, rest, artifacts.state)
    : new Response("This session has no such canvas.", { status: 404 });

const HOP = "hub listener";

/**
 * A request for a session that shows nothing: the overlay, which a
 * composer's canvas loads; anything else is a closed preview's page.
 */
const noneShown = (
  instanceId: string | null | undefined,
  pathname: string
): Promise<Response> | Response => {
  if (pathname === OVERLAY_PATH) {
    return overlayResponse();
  }
  previewFailed(
    HOP,
    instanceId,
    instanceId ? "its session shows no preview" : "the request names no session"
  );
  return downResponse("closed", 404);
};

/** A preview's request on to its machine's listener, and the answer back; a listener that does not answer is said in one line. */
async function relay(
  request: Request,
  server: Bun.Server<ListenerSocket>,
  instanceId: string,
  at: NonNullable<PreviewTarget["upstream"]>
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const address = at.address.includes(":") ? `[${at.address}]` : at.address;
  const upstream = `${address}:${at.port}${url.pathname}${url.search}`;
  const headers = proxyHeaders(request.headers);
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return upgradePreview(request, server, `ws://${upstream}`, headers, {
      hop: HOP,
      instanceId,
    })
      ? undefined
      : new Response("WebSocket upgrade failed", { status: 400 });
  }
  let response: Response;
  try {
    response = await fetch(`http://${upstream}`, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });
  } catch (error) {
    previewFailed(
      HOP,
      instanceId,
      `its machine's listener at ${address}:${at.port} didn't answer: ${causeOf(error)}`
    );
    return downResponse("machine");
  }
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
}

export function startPreviewListener(
  hostname: string,
  artifacts: {
    /** An artifact's kind; undefined when there is none. */
    kindOf: (artifactId: string) => ArtifactKind | undefined;
    /** The session that owns an artifact; undefined when there is none. */
    ownerOf: (artifactId: string) => string | undefined;
    picture: ReturnType<typeof artifactPicture>;
    /** Where a shown preview of a machine's is served now, its listener started when it has none. */
    reach: (instanceId: string) => Promise<PreviewReach>;
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
      const { pathname } = new URL(request.url);
      const canvas = pathname.match(CANVAS_PATH);
      if (canvas) {
        return canvasById(canvas, instanceId, artifacts);
      }
      const target = instanceId ? previewTargets.get(instanceId) : undefined;
      if (!(instanceId && target)) {
        return noneShown(instanceId, pathname);
      }
      if ("page" in target.source) {
        return HUB_SERVES[target.artifact.kind](
          target.artifact.id,
          pathname,
          artifacts.state
        );
      }
      // No listener serves it now (its machine restarted, or the last start
      // failed): started here, or the hop that failed says why.
      const reached = await artifacts.reach(instanceId);
      if (!reached.ok) {
        previewFailed(HOP, instanceId, `${reached.down}: ${reached.error}`);
        return downResponse(
          reached.down,
          reached.down === "closed" ? 404 : 503,
          reached.down === "reach" ? reached.error : undefined
        );
      }
      return relay(request, server, instanceId, reached.upstream);
    },
    // Anything else that threw while relaying the preview.
    error(error) {
      previewFailed(HOP, null, causeOf(error));
      return downResponse("machine");
    },
  });
}
