import { realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  type ArtifactKind,
  CAWCO_ENV,
  DASHBOARD_COOKIE,
  PREVIEW_ENTER_PATH,
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
import {
  ARTIFACTS_ROOT,
  FLEET_PORTS,
  PREVIEW_PORTS,
  PREVIEW_PORTS_TEXT,
} from "./config";
import type { PreviewsDb } from "./db/previews";
import {
  enter,
  holdsPass,
  lockedResponse,
  type PassCookie,
  passCookie,
} from "./preview-access";
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
  /** The machine's listener, and the token of the start that opened it. */
  upstream?: { address: string; port: number; token?: string };
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
  /** The machine's listener at `upstream` refused a connection: the next request reaches the preview again. */
  unreachable: (
    instanceId: string,
    upstream: NonNullable<PreviewTarget["upstream"]>
  ) => void;
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

/**
 * A preview's request on to its machine's listener, and the answer back. A
 * listener that does not answer is said in one line, and is forgotten: the
 * next request asks the machine where the preview is served now.
 */
async function relay(
  request: Request,
  server: Server<ListenerSocket>,
  instanceId: string,
  at: NonNullable<PreviewTarget["upstream"]>,
  deps: PreviewListenerDeps
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
    deps.unreachable(instanceId, at);
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
  return relay(request, server, instanceId, reached.upstream, deps);
}

/**
 * Host mode's lock on one request to session `instanceId`'s name
 * (preview-access.ts): the entry's answer, or the locked page for a request
 * with no pass; undefined when the request goes on. The ping goes on with
 * none, so the dashboard learns the origin is reachable.
 */
const atTheLock = (
  request: Request,
  lock: PassCookie,
  instanceId: string
): Response | undefined => {
  const { pathname } = new URL(request.url);
  if (pathname === PREVIEW_ENTER_PATH) {
    const entered = enter(request, lock, instanceId);
    if (entered.refused) {
      previewFailed(
        HOP,
        instanceId,
        `a ticket was refused: ${entered.refused}`
      );
    }
    return entered.response;
  }
  return pathname === PREVIEW_PING_PATH || holdsPass(request, lock, instanceId)
    ? undefined
    : lockedResponse();
};

/** The fleet's preview mode could not be taken: why, in one sentence. */
export class PreviewRefusal extends Error {
  readonly status: 409 | 422 | 503;
  constructor(
    status: 409 | 422 | 503,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.status = status;
  }
}

/**
 * The scheme the names are served on (`http` or `https`: how the proxy in
 * front of them serves them, never how a client reached the hub), then
 * exactly one placeholder, `{session}` or `{port}`, in a host name, with a
 * port after it or not. The characters around the placeholder hold no
 * brace, so a second one never fits.
 */
const PATTERN_SHAPE =
  /^(https?):\/\/([a-z0-9.-]*)\{(session|port)\}([a-z0-9.-]*(?::\d{1,5})?)$/;
const PATTERN_REFUSAL =
  "A host pattern is http:// or https:// and a host name with one of {session} or {port} in it, like https://p-{session}.example.com or https://p-{port}.example.com, and a port after it or not.";
/** A pattern stored before patterns carried their scheme. */
const SCHEMELESS = /^(?!https?:\/\/)/;

/**
 * Host mode's names, parsed once: the scheme they are served on, what
 * stands for a session in them, its id (`{session}`) or the preview port it
 * keeps (`{port}`), and the host text before and after it.
 */
interface HostPattern {
  after: string;
  before: string;
  key: "session" | "port";
  scheme: "http" | "https";
  /** A Host header's name for one session: the placeholder's value at group 1. */
  shape: RegExp;
}

const VALUE_OF = {
  session: "[0-9a-f-]{36}",
  port: "\\d{1,5}",
} as const;

/** `pattern` parsed, or refused in one sentence. */
const parsePattern = (pattern: string): HostPattern => {
  const parts = pattern.match(PATTERN_SHAPE);
  if (!parts) {
    throw new PreviewRefusal(422, PATTERN_REFUSAL);
  }
  const [, scheme, before, key, after] = parts as [
    string,
    HostPattern["scheme"],
    string,
    HostPattern["key"],
    string,
  ];
  // The Host header names the port only when it is not the scheme's own.
  const withoutPort = after.replace(PORT_SUFFIX, "");
  return {
    scheme,
    before,
    key,
    after,
    shape: new RegExp(
      `^${literal(before)}(${VALUE_OF[key]})(?:${literal(after)}|${literal(withoutPort)})$`,
      "i"
    ),
  };
};

/** The host name `pattern` gives a session whose placeholder value is `value` (`name[:port]`). */
const hostFor = (pattern: HostPattern, value: string | number): string =>
  `${pattern.before}${value}${pattern.after}`;

/** The whole origin `pattern` gives that session: its scheme, then its host. */
const originFor = (pattern: HostPattern, value: string | number): string =>
  `${pattern.scheme}://${hostFor(pattern, value)}`;

const PORT_SUFFIX = /:\d+$/;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
/** `text` as a regular expression that matches it alone. */
const literal = (text: string): string =>
  text.replaceAll(REGEX_SPECIAL, "\\$&");

/**
 * Whether a host pattern's names reach anything: one generated name has to
 * resolve, a made-up session's or the range's first port's. `.localhost`
 * names always do (RFC 6761); any other has to be in the DNS, its record
 * (a wildcard for `{session}`, one per port for `{port}`) pointing at the hub
 * or the proxy in front of it.
 */
const probePattern = async (pattern: HostPattern): Promise<string | null> => {
  const name = hostFor(
    pattern,
    pattern.key === "port"
      ? PREVIEW_PORTS.first
      : "00000000-0000-4000-8000-000000000000"
  ).replace(PORT_SUFFIX, "");
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
 * session from the fleet's pattern that DNS or a proxy brings there:
 * `{session}` its id, or `{port}` the preview port it keeps (taken as port
 * mode takes it, never listened on), so a fixed pool of names, one per port
 * of the range, serves every session. (The hub's own server is Elysia's, whose sockets run its
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
  /**
   * A listener on `port`, each request's session from `route`. `lock` (host
   * mode, preview-access.ts): a request to a session's name needs that
   * session's pass, WebSocket upgrades too, but the dashboard's ping and the
   * entry that spends a ticket for one.
   */
  const listen = (
    port: number,
    route: (request: Request) => string | undefined,
    lock?: PassCookie
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
        const stopped = lock && atTheLock(request, lock, instanceId);
        if (stopped) {
          return framedBy(stopped);
        }
        const answer = await serveSession(request, server, instanceId, deps);
        return answer && framedBy(answer);
      },
    });

  let settings = db.settings();
  // A pattern stored before patterns carried their scheme took the client's
  // scheme each time; it becomes http:// here, saved and said once, so the
  // stored pattern is always whole. An operator whose names are served over
  // HTTPS sets https:// in Settings › Previews.
  if (
    settings.mode === "host" &&
    settings.pattern &&
    SCHEMELESS.test(settings.pattern)
  ) {
    const was = settings.pattern;
    settings = { mode: "host", pattern: `http://${was}` };
    db.setSettings(settings);
    console.warn(
      `[preview] ${HOP}: the host pattern ${was} now names its scheme, ${settings.pattern}; set https:// in Settings › Previews if those names are served over HTTPS.`
    );
  }
  /** Port mode's listeners, by session. */
  const sessions = new Map<string, Server<ListenerSocket>>();
  /** Host mode's one listener. */
  let byHost: Server<ListenerSocket> | undefined;

  /**
   * Serves `instanceId` on `port`: false when another process holds it
   * (EADDRINUSE). Any other refusal is the bind address's, not the port's,
   * so no other port would open either: it is thrown, in one sentence.
   */
  const serveOn = (instanceId: string, port: number): boolean => {
    let refused: unknown;
    try {
      sessions.set(
        instanceId,
        listen(port, () => instanceId)
      );
      return true;
    } catch (thrown) {
      if ((thrown as { code?: unknown }).code === "EADDRINUSE") {
        return false;
      }
      refused = thrown;
    }
    throw new PreviewRefusal(
      503,
      `Preview port ${port} didn't open on ${hostname} (${causeOf(refused)}).`,
      { cause: refused }
    );
  };

  /** Why no session may have `port`: one of the fleet's own, or outside the range; null when one may. */
  const barred = (port: number): string | null => {
    const fleet = FLEET_PORTS.get(port);
    if (fleet) {
      return `it is ${fleet} port`;
    }
    return port < PREVIEW_PORTS.first || port > PREVIEW_PORTS.last
      ? `it is outside the preview ports ${PREVIEW_PORTS_TEXT}`
      : null;
  };

  /**
   * The one way a session gets its port, at the hub's start and on demand:
   * the port it keeps while that is still a preview port and `opens`; else
   * the lowest of the range that is not the fleet's own, not another
   * session's, and opens. A move is saved, so a collision heals itself, and
   * said in one line. Port mode opens a listener on it (`bind`); host mode's
   * `{port}` names it and opens nothing.
   */
  const portFor = (
    instanceId: string,
    opens: (port: number) => boolean
  ): number => {
    const held = db.ports();
    const kept = held.find((row) => row.instanceId === instanceId)?.port;
    let why = "";
    if (kept !== undefined) {
      const refused = barred(kept);
      if (!refused && opens(kept)) {
        return kept;
      }
      why = refused ?? "another process holds it";
    }
    const taken = new Set(held.map((row) => row.port));
    for (
      let port = PREVIEW_PORTS.first;
      port <= PREVIEW_PORTS.last;
      port += 1
    ) {
      if (!(taken.has(port) || barred(port)) && opens(port)) {
        db.keepPort(instanceId, port);
        if (kept !== undefined) {
          console.warn(
            `[preview] ${HOP}: preview of ${instanceId} moves from port ${kept} to ${port}: ${why}`
          );
        }
        return port;
      }
    }
    throw new PreviewRefusal(
      503,
      `Every preview port (${PREVIEW_PORTS_TEXT}) is taken: end a session that has a preview or a canvas, then show this one again.`
    );
  };

  /** Port mode: session `instanceId`'s listener on its port. */
  const bind = (instanceId: string): number =>
    portFor(instanceId, (port) => serveOn(instanceId, port));

  /** The session a Host header names under `pattern`; undefined when it names none, or a port no session holds. */
  const sessionOfHost = (
    pattern: HostPattern,
    host: string | null
  ): string | undefined => {
    const value = host?.match(pattern.shape)?.[1]?.toLowerCase();
    if (!value || pattern.key === "session") {
      return value;
    }
    const port = Number(value);
    return db.ports().find((row) => row.port === port)?.instanceId;
  };

  /** Host mode's listener on the range's first port; why it didn't open, or null. */
  const startHostMode = (): string | null => {
    let pattern: HostPattern;
    try {
      pattern = parsePattern(settings.pattern ?? "");
    } catch (thrown) {
      const why = `The stored host pattern ${JSON.stringify(settings.pattern)} isn't one: ${causeOf(thrown)}`;
      previewFailed(HOP, null, why);
      return why;
    }
    const fleet = FLEET_PORTS.get(PREVIEW_PORTS.first);
    if (fleet) {
      const why = `Port ${PREVIEW_PORTS.first} is ${fleet} port, so host-mode previews can't take it: set CAWCO_PREVIEW_PORTS to a range whose first port is free.`;
      previewFailed(HOP, null, why);
      return why;
    }
    try {
      byHost = listen(
        PREVIEW_PORTS.first,
        (request) => sessionOfHost(pattern, request.headers.get("host")),
        passCookie(
          pattern.scheme,
          hostFor(pattern, "x").replace(PORT_SUFFIX, "")
        )
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
    /**
     * Starts what the stored mode serves: host mode's listener; in port mode
     * each session's listener on the port it keeps, so a pane or a tab that
     * loads its preview origin straight after a hub restart finds it bound,
     * before any dashboard asks for its address. A kept port that is the
     * fleet's own, or that another process holds now, moves here (`bind`).
     */
    start(): void {
      if (settings.mode === "host") {
        startHostMode();
        return;
      }
      for (const { instanceId } of db.ports()) {
        if (!sessions.has(instanceId)) {
          try {
            bind(instanceId);
          } catch (thrown) {
            previewFailed(HOP, instanceId, causeOf(thrown));
          }
        }
      }
    },

    /**
     * Session `instanceId`'s preview origin: its listener started (port
     * mode) when it has none; in host mode its whole origin, on the
     * pattern's scheme, named by its id or by the port it keeps (taken now
     * when it has none).
     */
    address(instanceId: string): PreviewAddress {
      if (settings.mode === "host") {
        const pattern = parsePattern(settings.pattern ?? "");
        return {
          origin: originFor(
            pattern,
            pattern.key === "port"
              ? portFor(instanceId, () => true)
              : instanceId
          ),
        };
      }
      const running = sessions.get(instanceId);
      return { port: running?.port ?? bind(instanceId) };
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
     * Host mode takes a pattern of a scheme (`http://` or `https://`) and a
     * host name with one of `{session}` or `{port}` in it, whose generated
     * name resolves; a refusal says why and changes nothing.
     */
    async set(next: {
      mode: "port" | "host";
      pattern?: string;
    }): Promise<PreviewSettings> {
      if (next.mode === "host") {
        const pattern = (next.pattern ?? "").trim().toLowerCase();
        const unreachable = await probePattern(parsePattern(pattern));
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
      this.start();
      return this.settings();
    },
  };
}

export type PreviewListeners = ReturnType<typeof createPreviewListeners>;
