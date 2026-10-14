import { realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  type ArtifactKind,
  CAWCO_ENV,
  DASHBOARD_COOKIE,
  PREVIEW_PING_PATH,
  type PreviewAddress,
  type PreviewDown,
  type PreviewFrame,
  type PreviewSettings,
  type PreviewSource,
  readEnv,
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
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import { serveCanvas } from "./artifacts/canvas";
import {
  ARTIFACT_PATH,
  type ArtifactSocket,
  type artifactPicture,
  type artifactSend,
  type artifactSocket,
} from "./artifacts/sync";
import { ARTIFACTS_ROOT, PREVIEW_PORTS, PREVIEW_PORTS_TEXT } from "./config";
import type { PreviewsDb } from "./db/previews";
import { FolderRefusal, folderPath } from "./project-folder";

/**
 * A session's preview: the artifact its panel shows, and the machine and
 * address that serve it. Every preview is an origin of its own, never the
 * dashboard's: the session's listener on a port of the hub's range (port
 * mode), or the session's own host name on the first port (host mode). So a
 * previewed app keeps its own storage and cookies, routes by its own paths
 * at the root, and two sessions' previews open at once never cross.
 *
 * A target is the operator's intent, kept in the database (`shown_previews`)
 * so it outlives the hub too, and it outlives the machine's listener: while
 * none serves it (its machine away or restarted, or its start failed)
 * `upstream` is absent, and the machine's register or the preview's next
 * request starts it again. Only a close, or the session ending, ends it.
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

/**
 * The dashboard origins this hub is reached from: each one a dashboard or an
 * artifact's tab opened its socket from (server.ts, from the origin the
 * dashboard's relay gated), and the operator's dashboard address. Only these
 * may frame a preview (`frame-ancestors`), and only these may hello its
 * overlay (`overlayResponse`): a page of another site that frames a preview
 * port it can reach is refused by the browser and ignored by the overlay.
 */
const parents = new Set<string>();

/** A dashboard opened its socket from `origin`, an origin its relay let through. */
export const noteParent = (origin: string | undefined): void => {
  if (!origin) {
    return;
  }
  try {
    const url = new URL(origin);
    if (url.protocol === "http:" || url.protocol === "https:") {
      parents.add(url.origin);
    }
  } catch {
    // Not an origin: nothing to add.
  }
};

// The operator's own dashboard address, before any dashboard has connected.
noteParent(readEnv(CAWCO_ENV.dashboardUrl));

/** Every origin that may frame a preview now. */
export const previewParents = (): string[] => [...parents];

/**
 * `answer` as the browser may frame it: from the dashboards alone. A
 * response a hop made with headers it holds fixed goes on as a copy.
 */
const framedBy = (answer: Response): Response => {
  // `'self'` too: every ancestor is checked, and a page's own frames (an
  // app's inner frame) have the preview's origin among theirs.
  const policy = `frame-ancestors 'self' ${previewParents().join(" ")}`.trim();
  try {
    answer.headers.set("content-security-policy", policy);
    return answer;
  } catch {
    const copy = new Response(answer.body, answer);
    copy.headers.set("content-security-policy", policy);
    return copy;
  }
};

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
  target: Pick<PreviewTarget, "artifact" | "revision" | "source">,
  address: PreviewAddress | null
): PreviewFrame {
  return {
    kind: "preview",
    instanceId,
    state,
    artifact: target.artifact,
    ...(address ?? {}),
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

/** What a listener needs of the hub to serve a session's previews and artifacts. */
export interface PreviewListenerDeps {
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

/** An artifact's sync socket, its send (`/send`) or a canvas's picture (`/picture`), for the session that owns it only. */
const joinArtifact = (
  request: Request,
  server: Server<ListenerSocket>,
  [, artifactId, action]: RegExpMatchArray,
  instanceId: string,
  deps: PreviewListenerDeps
): Response | Promise<Response> | undefined => {
  if (deps.ownerOf(artifactId) !== instanceId) {
    return new Response("This session has no such artifact.", { status: 404 });
  }
  if (action === "/send") {
    return deps.send(request, instanceId, artifactId);
  }
  if (action === "/picture") {
    return deps.picture(request, artifactId);
  }
  const screen = new URL(request.url).searchParams.get("screen") === "1";
  return server.upgrade(request, { data: { artifactId, screen } })
    ? undefined
    : new Response("WebSocket upgrade failed", { status: 400 });
};

/**
 * A canvas by its id, whichever artifact the panel shows: the composer's
 * canvas stands outside the panel, at `/__cawco/canvas/<id>/` on its
 * session's preview origin, its bundle and fonts under that.
 */
const CANVAS_PATH = /^\/__cawco\/canvas\/([0-9a-f-]{36})(\/.*)$/;

/** Everything under it is the hub's own on a preview origin; a previewed app never sees it. */
const RESERVED = "/__cawco/";

const HOP = "hub listener";

/** The dashboard's probe: answered to any page, with no credentials, so the pane learns the origin is reachable. */
const ping = (): Response =>
  new Response("ok", {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "content-type": "text/plain",
    },
  });

/** `cookie` without the dashboard's own (core `DASHBOARD_COOKIE`). */
const appCookies = (header: string | null): string | null => {
  if (!header) {
    return null;
  }
  const kept = header
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair && !DASHBOARD_COOKIE.test(pair.split("=")[0] ?? ""));
  return kept.length > 0 ? kept.join("; ") : null;
};

/** What goes on to the machine: hop-by-hop headers off, and none of the dashboard's cookies. */
const upstreamHeaders = (request: Request): Headers => {
  const headers = proxyHeaders(request.headers);
  const cookies = appCookies(headers.get("cookie"));
  if (cookies) {
    headers.set("cookie", cookies);
  } else {
    headers.delete("cookie");
  }
  return headers;
};

/** What comes back to the browser: no cookie the app sets under one of the dashboard's names. */
const downstreamHeaders = (response: Response): Headers => {
  const headers = proxyHeaders(response.headers);
  // Same as the daemon hop: the body is already decoded here.
  if (headers.has("content-encoding")) {
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  const set = headers.getSetCookie();
  if (set.length > 0) {
    headers.delete("set-cookie");
    for (const cookie of set) {
      if (!DASHBOARD_COOKIE.test(cookie.split("=")[0]?.trim() ?? "")) {
        headers.append("set-cookie", cookie);
      }
    }
  }
  return headers;
};

/** A preview's request on to its machine's listener, and the answer back; a listener that does not answer is said in one line. */
async function relay(
  request: Request,
  server: Server<ListenerSocket>,
  instanceId: string,
  at: NonNullable<PreviewTarget["upstream"]>
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const address = at.address.includes(":") ? `[${at.address}]` : at.address;
  const upstream = `${address}:${at.port}${url.pathname}${url.search}`;
  const headers = upstreamHeaders(request);
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
  return new Response(response.body, {
    status: response.status,
    headers: downstreamHeaders(response),
  });
}

/** One request to session `instanceId`'s preview origin, at its root. */
async function serveSession(
  request: Request,
  server: Server<ListenerSocket>,
  instanceId: string,
  deps: PreviewListenerDeps
): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);
  if (pathname === PREVIEW_PING_PATH) {
    return ping();
  }
  if (pathname === OVERLAY_PATH) {
    return overlayResponse(previewParents());
  }
  const synced = pathname.match(ARTIFACT_PATH);
  if (synced) {
    return joinArtifact(request, server, synced, instanceId, deps);
  }
  const canvas = pathname.match(CANVAS_PATH);
  if (canvas) {
    const [, artifactId, rest] = canvas;
    return deps.ownerOf(artifactId) === instanceId &&
      deps.kindOf(artifactId) === "canvas"
      ? serveCanvas(artifactId, rest, deps.state)
      : new Response("This session has no such canvas.", { status: 404 });
  }
  if (pathname.startsWith(RESERVED)) {
    return new Response("Not found", { status: 404 });
  }
  const target = previewTargets.get(instanceId);
  if (!target) {
    previewFailed(HOP, instanceId, "its session shows no preview");
    return downResponse("closed", 404);
  }
  if ("page" in target.source) {
    return HUB_SERVES[target.artifact.kind](
      target.artifact.id,
      pathname,
      deps.state
    );
  }
  // No listener serves it now (its machine restarted, or the last start
  // failed): started here, or the hop that failed says why.
  const reached = await deps.reach(instanceId);
  if (!reached.ok) {
    previewFailed(HOP, instanceId, `${reached.down}: ${reached.error}`);
    return downResponse(
      reached.down,
      reached.down === "closed" ? 404 : 503,
      reached.down === "reach" ? reached.error : undefined
    );
  }
  return relay(request, server, instanceId, reached.upstream);
}

/** The fleet's preview mode could not be taken: why, in one sentence. */
export class PreviewRefusal extends Error {
  readonly status: 409 | 422 | 503;
  constructor(status: 409 | 422 | 503, message: string) {
    super(message);
    this.status = status;
  }
}

/** `{session}`, and a host name around it, with a port after it or not. */
const PATTERN_SHAPE = /^[a-z0-9.-]*\{session\}[a-z0-9.-]*(?::\d{1,5})?$/;
const SESSION_ID = "[0-9a-f-]{36}";

/** The host name a pattern gives session `instanceId`. */
const hostFor = (pattern: string, instanceId: string): string =>
  pattern.replace("{session}", instanceId);

/** The session a Host header names under `pattern`; undefined when it names none. */
const sessionOfHost = (
  pattern: string,
  host: string | null
): string | undefined => {
  if (!host) {
    return;
  }
  const [before, after] = pattern.split("{session}") as [string, string];
  // The Host header names the port only when it is not the scheme's own.
  const withoutPort = after.replace(PORT_SUFFIX, "");
  const shape = new RegExp(
    `^${literal(before)}(${SESSION_ID})(?:${literal(after)}|${literal(withoutPort)})$`,
    "i"
  );
  return host.match(shape)?.[1]?.toLowerCase();
};

const PORT_SUFFIX = /:\d+$/;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
/** `text` as a regular expression that matches it alone. */
const literal = (text: string): string =>
  text.replaceAll(REGEX_SPECIAL, "\\$&");

/**
 * Whether a host pattern's names reach anything: one generated name has to
 * resolve. `.localhost` names always do (RFC 6761); any other has to be in
 * the DNS, its wildcard pointing at the hub or the proxy in front of it.
 */
const probePattern = async (pattern: string): Promise<string | null> => {
  const name = hostFor(pattern, "00000000-0000-4000-8000-000000000000").replace(
    PORT_SUFFIX,
    ""
  );
  if (name === "localhost" || name.endsWith(".localhost")) {
    return null;
  }
  try {
    await Bun.dns.lookup(name);
    return null;
  } catch (error) {
    return `${name} doesn't resolve (${causeOf(error)}): point the pattern's names at the hub's port ${PREVIEW_PORTS.first}, then save again.`;
  }
};

/**
 * Every session's preview origin. Port mode (the default, no setup): each
 * session that shows a preview or a canvas takes a port of the range and a
 * listener on it, on the hub's own bind address; its port is kept, so the
 * previewed app keeps its storage across restarts. Host mode: one listener
 * on the range's first port routes each request by its Host, a name per
 * session from the fleet's pattern (`{session}` its id) that DNS or a proxy
 * brings there. (The hub's own server is Elysia's, whose sockets run its
 * lifecycle: a previewed app's HMR socket cannot be upgraded there.)
 */
export function createPreviewListeners(
  hostname: string,
  deps: PreviewListenerDeps,
  db: PreviewsDb
) {
  const proxy = previewWebSocket as unknown as WebSocketHandler<ListenerSocket>;
  const websocket: WebSocketHandler<ListenerSocket> = {
    open: (socket) =>
      isArtifact(socket) ? deps.socket.open(socket) : proxy.open?.(socket),
    message: (socket, message) =>
      isArtifact(socket)
        ? deps.socket.message(socket, message)
        : proxy.message(socket, message),
    close: (socket, code, reason) =>
      isArtifact(socket)
        ? deps.socket.close(socket)
        : proxy.close?.(socket, code, reason),
  };
  const error = (thrown: Error) => {
    previewFailed(HOP, null, causeOf(thrown));
    return downResponse("machine");
  };
  const listen = (
    port: number,
    route: (request: Request) => string | undefined
  ): Server<ListenerSocket> =>
    Bun.serve<ListenerSocket>({
      hostname,
      port,
      websocket,
      error,
      async fetch(request, server) {
        const instanceId = route(request);
        if (!instanceId) {
          previewFailed(
            HOP,
            null,
            `no session's preview at ${request.headers.get("host")}`
          );
          return framedBy(downResponse("closed", 404));
        }
        const answer = await serveSession(request, server, instanceId, deps);
        return answer && framedBy(answer);
      },
    });

  let settings = db.settings();
  /** Port mode's listeners, by session. */
  const sessions = new Map<string, Server<ListenerSocket>>();
  /** Host mode's one listener. */
  let byHost: Server<ListenerSocket> | undefined;

  /** Serves `instanceId` on `port`; false when the port is taken by something else. */
  const serveOn = (instanceId: string, port: number): boolean => {
    try {
      sessions.set(
        instanceId,
        listen(port, () => instanceId)
      );
      return true;
    } catch (thrown) {
      previewFailed(
        HOP,
        instanceId,
        `port ${port} didn't open: ${causeOf(thrown)}`
      );
      return false;
    }
  };

  /** Session `instanceId`'s port: the one it keeps, else the lowest free one of the range that opens. */
  const portFor = (instanceId: string): number => {
    const held = db.ports();
    const kept = held.find((row) => row.instanceId === instanceId)?.port;
    if (kept !== undefined && serveOn(instanceId, kept)) {
      return kept;
    }
    const taken = new Set(held.map((row) => row.port));
    for (
      let port = PREVIEW_PORTS.first;
      port <= PREVIEW_PORTS.last;
      port += 1
    ) {
      if (!taken.has(port) && serveOn(instanceId, port)) {
        db.keepPort(instanceId, port);
        return port;
      }
    }
    throw new PreviewRefusal(
      503,
      `Every preview port (${PREVIEW_PORTS_TEXT}) is taken: end a session that has a preview or a canvas, then show this one again.`
    );
  };

  /** Host mode's listener on the range's first port; why it didn't open, or null. */
  const startHostMode = (): string | null => {
    const pattern = settings.pattern ?? "";
    try {
      byHost = listen(PREVIEW_PORTS.first, (request) =>
        sessionOfHost(pattern, request.headers.get("host"))
      );
      return null;
    } catch (thrown) {
      const why = `Port ${PREVIEW_PORTS.first} didn't open for host-mode previews (${causeOf(thrown)}): free it, or set CAWCO_PREVIEW_PORTS to a range whose first port is free.`;
      previewFailed(HOP, null, why);
      return why;
    }
  };

  const stopAll = () => {
    for (const server of sessions.values()) {
      server.stop(true);
    }
    sessions.clear();
    byHost?.stop(true);
    byHost = undefined;
  };

  return {
    /** Starts what the stored mode serves: host mode's listener; port mode's start as each session asks. */
    start(): void {
      if (settings.mode === "host") {
        startHostMode();
      }
    },

    /** Session `instanceId`'s preview origin, its listener started (port mode) when it has none. */
    address(instanceId: string): PreviewAddress {
      if (settings.mode === "host") {
        return { host: hostFor(settings.pattern ?? "", instanceId) };
      }
      const running = sessions.get(instanceId);
      return { port: running?.port ?? portFor(instanceId) };
    },

    /** The session ended: its listener stops and its port is free again. */
    release(instanceId: string): void {
      sessions.get(instanceId)?.stop(true);
      sessions.delete(instanceId);
      db.dropPort(instanceId);
    },

    settings(): PreviewSettings {
      return settings.mode === "host"
        ? {
            mode: "host",
            pattern: settings.pattern ?? "",
            ports: PREVIEW_PORTS_TEXT,
          }
        : { mode: "port", ports: PREVIEW_PORTS_TEXT };
    },

    /**
     * The fleet's mode, from the person's Settings or Caw's approved write.
     * Host mode takes a pattern with `{session}` in a host name whose
     * generated name resolves; a refusal says why and changes nothing.
     */
    async set(next: {
      mode: "port" | "host";
      pattern?: string;
    }): Promise<PreviewSettings> {
      if (next.mode === "host") {
        const pattern = (next.pattern ?? "").trim().toLowerCase();
        if (!PATTERN_SHAPE.test(pattern)) {
          throw new PreviewRefusal(
            422,
            "A host pattern is a host name with {session} in it, like p-{session}.example.com, and a port after it or not."
          );
        }
        const unreachable = await probePattern(pattern);
        if (unreachable) {
          throw new PreviewRefusal(422, unreachable);
        }
        const before = settings;
        stopAll();
        settings = { mode: "host", pattern };
        const failed = startHostMode();
        if (failed) {
          // Nothing changes: the mode before goes on as it was.
          settings = before;
          if (before.mode === "host") {
            startHostMode();
          }
          throw new PreviewRefusal(503, failed);
        }
        db.setSettings(settings);
        return this.settings();
      }
      stopAll();
      settings = { mode: "port", pattern: null };
      db.setSettings(settings);
      return this.settings();
    },
  };
}

export type PreviewListeners = ReturnType<typeof createPreviewListeners>;
