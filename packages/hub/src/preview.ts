import { createHash } from "node:crypto";
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
import { readWithin } from "@cawco/core/bounded";
import { decisionHostFile } from "@cawco/core/decision-host";
import { detach } from "@cawco/core/detach";
import { passDomainRefusal } from "@cawco/core/pass-domain";
import {
  cachePreview,
  causeOf,
  compressed,
  DOWN_WORDS,
  decodedHeaders,
  downOf,
  downResponse,
  folderKey,
  heldWhileServed,
  IMMUTABLE,
  injectOverlay,
  keyOverlay,
  OVERLAY_KEY,
  OVERLAY_PATH,
  overlayResponse,
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
import {
  type HubReach,
  PREVIEW_PING_HEADER,
  PREVIEW_REACH_PATH,
  type PreviewPingDown,
} from "@cawco/core/preview-reach";
import type { StageState } from "@cawco/core/stage";
import { isStreamRelayPort } from "@cawco/core/stream-relay";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import { serveCanvas } from "./artifacts/canvas";
import {
  ARTIFACT_PATH,
  type ArtifactSocket,
  type artifactPicture,
  type artifactPictures,
  type artifactSend,
  type artifactSocket,
} from "./artifacts/sync";
import {
  ARTIFACTS_ROOT,
  FLEET_PORTS,
  LOCAL_DASHBOARD_PORT,
  PREVIEW_PORTS,
  PREVIEW_PORTS_TEXT,
} from "./config";
import type { ArtifactRow } from "./db/artifacts";
import type { PreviewPassesDb } from "./db/preview-passes";
import {
  artifactOfOrigin,
  artifactOrigin,
  type PreviewsDb,
  projectOfOrigin,
} from "./db/previews";
import { DECISION_ASSETS } from "./decision-program";
import { enter, lockedResponse, type PassLock, passOf } from "./preview-access";
import { FolderRefusal, folderPath } from "./project-folder";
import { asReached, type TailnetHttpsService } from "./tailnet-https";

/**
 * What an origin serves: a session's panel's artifact (the operator's
 * intent, kept in the database, `shown_previews`, so it outlives the hub
 * too; only a close, or the session ending, ends it), or a machine
 * artifact's own ({@link embedTargets}), with the machine and address that
 * serve it. Every preview is an origin of its own, never the dashboard's: a
 * port of the hub's range, and in host mode a host name on the first port
 * too. So a previewed app keeps its own storage and cookies, routes by its
 * own paths at the root, and two previews open at once never cross.
 *
 * A machine artifact's target outlives its machine's listener: while none
 * serves it (its machine away or restarted, or its start failed) `upstream`
 * is absent, and the machine's register or the preview's next request
 * starts it again.
 */
export interface PreviewTarget {
  /** The artifact the panel shows (Projects spec §5.10). */
  artifact: PreviewFrame["artifact"];
  machineId: string;
  revision: string;
  source: PreviewSource;
  /** The machine's listener, and the token of the start that opened it. */
  upstream?: { address: string; port: number; token: string };
}

/**
 * What each session's panel shows, by instance id: every key is a session's,
 * so the board and the panel's frames read it as one. A page the hub
 * serves stands at the session's origin's root too (the apps load it
 * there); a machine's preview is served on its artifact's own origin alone
 * ({@link embedTargets}), never the session's, so whatever the panel shows
 * next, a frame of it keeps its own content.
 */
export const previewTargets = new Map<string, PreviewTarget>();

/** An artifact as its panel's frame names it: with its ask, the head's line under its name, when it has one. */
export const shownArtifact = (
  row: Pick<ArtifactRow, "ask" | "id" | "kind" | "name">
): PreviewFrame["artifact"] => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  ...(row.ask ? { ask: row.ask } : {}),
});

/**
 * A machine artifact's own origin (a dev server's or a folder's preview, a
 * sheet), which its session's panel, its own tab and every decision page's
 * Preview of it load: its target here and its listener on a port of its own
 * are keyed by the artifact ({@link embedKey}), apart from every session's,
 * and its port is kept while the origin that opened it lives (db previews.ts
 * `artifactOrigin`, `createPreviewListeners`' `holds`). A dev server and a
 * stage serve from their root, so no other origin can show one under a path
 * of its own; the machine keys its listener by the same key. It is never in {@link previewTargets}.
 */
export const embedTargets = new Map<string, PreviewTarget>();

export const embedKey = artifactOrigin;
const isEmbed = (key: string): boolean => artifactOfOrigin(key) !== null;

/**
 * The map that holds `key`'s target: an embed's, or a session's. Only what
 * reaches a machine's listener (the relay, its start, a register, a machine
 * gone) takes either key; everything a session's panel or the board reads
 * goes to {@link previewTargets} by name.
 */
export const targetsOf = (key: string): Map<string, PreviewTarget> =>
  isEmbed(key) ? embedTargets : previewTargets;

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
// The dashboard on every computer's loopback (core `localDashboardPort`).
noteParent(`http://localhost:${LOCAL_DASHBOARD_PORT}`);

/** Every origin that may frame a preview now. */
const previewParents = (): string[] => [...parents];

/**
 * What every answer on a preview origin carries: who may frame it, and its
 * ask for a process of its own. A preview's port is the dashboard's site (a
 * site is a scheme and a host, its port left out), so Chromium runs the
 * frame in the dashboard's renderer, on its main thread, and a heavy page
 * stalls the dashboard's own input. `Origin-Agent-Cluster: ?1` asks for an
 * origin-keyed agent cluster, which Chromium backs with an origin-locked
 * process ("The Origin-Agent-Cluster HTTP response header can be used by web
 * developers to hint to the browser that an origin locked process can be
 * used", chromium.googlesource.com/chromium/src/+/HEAD/docs/
 * process_model_and_site_isolation.md). It is sent on every answer, as the
 * header must be ("send this header on all responses from your origin",
 * web.dev/articles/origin-agent-cluster). It holds only in a secure context
 * (https, or localhost): over plain http to an address the page stays in the
 * dashboard's process, and WebKit runs no frame in a process of its own.
 */
const PREVIEW_HEADERS = (ancestors: string[] = []): [string, string][] => [
  // `'self'` too: every ancestor is checked, and a page's own frames (an
  // app's inner frame) have the preview's origin among theirs. An embed's
  // decision page is an ancestor of its own (`ancestors`).
  [
    "content-security-policy",
    `frame-ancestors 'self' ${[...previewParents(), ...ancestors].join(" ")}`.trim(),
  ],
  ["origin-agent-cluster", "?1"],
];

/**
 * `answer` with {@link PREVIEW_HEADERS}. A response a hop made with headers
 * it holds fixed goes on as a copy.
 */
const framedBy = (answer: Response, ancestors: string[] = []): Response => {
  const headers = PREVIEW_HEADERS(ancestors);
  try {
    for (const [name, value] of headers) {
      answer.headers.set(name, value);
    }
    return answer;
  } catch {
    const copy = new Response(answer.body, answer);
    for (const [name, value] of headers) {
      copy.headers.set(name, value);
    }
    return copy;
  }
};

/**
 * `answer`, when it is a page, with its overlay tag at the overlay's key
 * (core `keyOverlay`): the hub's own pages and a machine's alike, since only
 * the hub knows the overlay's whole text (its parents line).
 */
const withKeyedOverlay = (answer: Response): Promise<Response> | Response =>
  answer.body && answer.headers.get("content-type")?.startsWith("text/html")
    ? keyOverlay(answer, previewParents())
    : answer;

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
  address: PreviewAddress | null,
  /** The session's artifacts by id, newest first. */
  artifacts: string[],
  /** A sheet's stage as its doc keeps it; none for any other kind, or before it was told. */
  stage: StageState | null = null,
  /** The project whose origin serves it, `address` being that origin's: a project's page. */
  project?: string
): PreviewFrame {
  return {
    kind: "preview",
    instanceId,
    state,
    artifact: target.artifact,
    artifacts,
    ...(address ?? {}),
    ...(project ? { project } : {}),
    source: target.source,
    revision: target.revision,
    ...(stage ? { stage } : {}),
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
  deps: Pick<PreviewListenerDeps, "program" | "seed">,
  /** The page's address as the browser asked for it: an embed's address is built from it. */
  reachedAt: URL,
  /** Where the page stands on its origin: its root, or the Decisions tab's `/__cawco/page/<id>/`. */
  mount = "/"
): Promise<Response> {
  let file: string;
  let root: string;
  // A file at its folder's key (core `versionAssets`), or the page's own address.
  const versioned = versionedFile(pathname);
  const asked = versioned ?? pathname;
  try {
    root = await realpath(join(ARTIFACTS_ROOT, artifactId));
    file = await realpath(
      join(
        root,
        folderPath(
          decodeURIComponent(asked === "/" ? "/index.html" : asked).slice(1)
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
  // The page's document is never kept (it carries the doc's state as it is
  // now); a file at its folder's key never changes, and is kept for good.
  const headers = {
    "cache-control": versioned === null ? "no-store" : IMMUTABLE,
    "content-type": body.type,
  };
  if (!body.type.startsWith("text/html")) {
    return new Response(body, { headers });
  }
  // The overlay hashes the page as it was written, before its files are
  // keyed; a decision page's hash is its program's, and it carries what the
  // artifacts its media show are now.
  const program = deps.program(artifactId, reachedAt);
  const injected = injectOverlay(
    await body.text(),
    { artifact: artifactId, ...deps.seed(artifactId) },
    program?.hash
  );
  const page = program
    ? injected.replace("</head>", `${program.media}</head>`)
    : injected;
  return new Response(
    versioned === null
      ? versionAssets(page, await folderKey(root), mount, pathname)
      : page,
    { headers }
  );
}

/**
 * What the hub serves for an artifact it holds: a page's files, or a
 * canvas's host page. A sheet is its workspace's stage, relayed as a port
 * preview: its source names no page, and it never comes here. A browser is
 * drawn by its panel from its stream (Projects spec §5.11, the view; hub
 * browser-routes.ts), and no origin serves it.
 */
const HUB_SERVES: Record<
  Exclude<ArtifactKind, "component" | "browser">,
  (
    artifactId: string,
    pathname: string,
    deps: PreviewListenerDeps,
    reachedAt: URL
  ) => Promise<Response>
> = {
  page: servePage,
  preview: servePage,
  canvas: (artifactId, pathname, deps) =>
    serveCanvas(artifactId, pathname, deps.seed),
};

type ListenerSocket = PreviewSocket | ArtifactSocket;

/** A preview origin's listener on its port: the plain one and its TLS twins, stopped together with their connections. */
interface Listener {
  port: number;
  stop: () => Promise<void>;
}

const isArtifact = (
  socket: ServerWebSocket<ListenerSocket>
): socket is ServerWebSocket<ArtifactSocket> => "artifactId" in socket.data;

/** What a listener needs of the hub to serve a session's previews and artifacts. */
export interface PreviewListenerDeps {
  /** A Diagram of a decision page opened as a canvas in its session's panel (`/canvas`). */
  canvasFrom: (
    request: Request,
    instanceId: string,
    artifactId: string
  ) => Promise<Response>;
  /**
   * The shape a decision page's Preview heard a component canvas of page
   * `pageId`'s media say (`POST /__cawco/page/<id>/shape`, a JSON body of
   * the canvas's `artifact`, its `stories` and an `EmbedShape`), kept for
   * every next Preview of it (artifacts service `keepSaidShape`).
   */
  keepShape: (request: Request, pageId: string) => Promise<Response>;
  /** An artifact's kind; undefined when there is none. */
  kindOf: (artifactId: string) => ArtifactKind | undefined;
  /** Origins that let their port go to another: what each shows is told again, without its old address. */
  letGo: (keys: string[]) => void;
  /**
   * The origin that serves an artifact, by its key: a project's page its
   * project's ({@link projectOrigin}), whichever session holds it or none;
   * every other artifact its session's. Undefined when there is none.
   */
  originOf: (artifactId: string) => string | undefined;
  /** The session that holds an artifact (its panel); undefined when there is none, as for a project's page whose session is gone. */
  ownerOf: (artifactId: string) => string | undefined;
  picture: ReturnType<typeof artifactPicture>;
  /** The page's pictures of the person's marks, held for their delivery. */
  pictures: ReturnType<typeof artifactPictures>;
  /**
   * A decision page's program: its hash (the page's, for the overlay) and
   * the script tag naming what the artifacts its Canvas and Preview pieces
   * show are now, an embedded preview's address built from where the page
   * was reached (`reachedAt`); null for any other page.
   */
  program: (
    artifactId: string,
    reachedAt: URL
  ) => { hash: string; media: string } | null;
  /** Where a shown preview of a machine's is served now, its listener started when it has none. */
  reach: (instanceId: string) => Promise<PreviewReach>;
  /** A page artifact's doc as its overlay tag carries it (artifacts/docs.ts `seed`). */
  seed: (artifactId: string) => { maps: string; state: string };
  send: ReturnType<typeof artifactSend>;
  /**
   * Whether origin `key` serves an artifact by its id: the origin that
   * serves it ({@link originOf}); a session's origin also another session's
   * artifact its panel or one of its decision pages' Canvas and Preview
   * pieces shows (its delegation tree's), a project's page
   * excepted; and a project's origin also its project's canvases, and any
   * artifact its project's pages show as a Canvas or Preview piece (Open to
   * draw, Open full size).
   */
  servedOn: (artifactId: string, key: string) => boolean;
  /** Whether session `instanceId` still runs: a session's ticket enters host mode's names only while it does (preview-access.ts). */
  sessionLive: (instanceId: string) => boolean;
  /**
   * Whether session `instanceId` uses its preview origins now: its process
   * may run (starting, running, or not yet reported since the hub started),
   * or a screen follows its conversation. A sleeping, failed or ended one
   * that no screen follows does not.
   */
  sessionUsed: (instanceId: string) => boolean;
  /** An artifact of the session's brought to the front of its panel from a page (`/show`: a decision page's Canvas, Open to draw). */
  showFrom: (
    request: Request,
    instanceId: string,
    artifactId: string
  ) => Promise<Response>;
  socket: ReturnType<typeof artifactSocket>;
  /** Artifact `artifactId`'s stage answered its page through the relay (core `PREVIEW_SERVED_HEADER`): it is reachable. */
  stageAnswered: (artifactId: string) => void;
  /** The machine's listener at `upstream` refused a connection: the next request reaches the preview again. */
  unreachable: (
    instanceId: string,
    upstream: NonNullable<PreviewTarget["upstream"]>
  ) => void;
}

/** An artifact's sync socket, its send (`/send`) or a canvas's picture (`/picture`), on the origin that serves it only ({@link PreviewListenerDeps.originOf}). */
const joinArtifact = (
  request: Request,
  server: Server<ListenerSocket>,
  [, artifactId, action]: RegExpMatchArray,
  key: string,
  deps: PreviewListenerDeps
): Response | Promise<Response> | undefined => {
  if (!deps.servedOn(artifactId, key)) {
    return new Response("This origin serves no such artifact.", {
      status: 404,
    });
  }
  if (!action) {
    const screen = new URL(request.url).searchParams.get("screen") === "1";
    return server.upgrade(request, { data: { artifactId, at: key, screen } })
      ? undefined
      : new Response("WebSocket upgrade failed", { status: 400 });
  }
  // What the page asks of its session: the one that holds it now.
  const instanceId = deps.ownerOf(artifactId);
  if (!instanceId) {
    return new Response(
      "No session holds this page now: send it from its project's Decisions tab.",
      { status: 409 }
    );
  }
  if (action === "/send") {
    return deps.send(request, instanceId, artifactId);
  }
  if (action === "/picture") {
    return deps.picture(request, artifactId);
  }
  if (action === "/pictures") {
    return deps.pictures(request, instanceId, artifactId);
  }
  if (action === "/canvas") {
    return deps.canvasFrom(request, instanceId, artifactId);
  }
  if (action === "/show") {
    return deps.showFrom(request, instanceId, artifactId);
  }
  return new Response("Not found", { status: 404 });
};

/**
 * A canvas by its id, whichever artifact the panel shows: the composer's
 * canvas stands outside the panel, at `/__cawco/canvas/<id>/` on its
 * session's preview origin, its bundle and fonts under that.
 */
const CANVAS_PATH = /^\/__cawco\/canvas\/([0-9a-f-]{36})(\/.*)$/u;

/**
 * A page by its id, whichever artifact the panel shows: the project page's
 * Decisions tab opens a decision page in its own pane, at
 * `/__cawco/page/<id>/` on its session's preview origin, beside the doc's
 * socket the page joins there.
 */
const PAGE_PATH = /^\/__cawco\/page\/([0-9a-f-]{36})(\/.*)$/u;

/**
 * Where a decision page's Preview tells the shape its component canvas
 * said, relative to the page (`shape` beside `/__cawco/page/<id>/`): a POST
 * of the canvas's id, its stories and the shape ({@link PreviewListenerDeps.keepShape}).
 */
const PAGE_SHAPE_PATH = /^\/__cawco\/page\/([0-9a-f-]{36})\/shape$/u;

/** Everything under it is the hub's own on a preview origin; a previewed app never sees it. */
const RESERVED = "/__cawco/";

/** A path the hub keeps for itself: under {@link RESERVED}, but a page's own file at its folder's key, which goes on to whatever serves the page. */
const hubsOwn = (pathname: string): boolean =>
  pathname.startsWith(RESERVED) && versionedFile(pathname) === null;

const HOP = "hub listener";

/** What every answer to the dashboard's probe carries: readable to any page, never kept, marked the hub's own. */
const PING_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": PREVIEW_PING_HEADER,
  "cache-control": "no-store",
  [PREVIEW_PING_HEADER]: "1",
} as const;

/** The dashboard's probe: answered to any page, with no credentials, so the pane learns the origin is reachable. */
const ping = (): Response =>
  new Response("ok", {
    headers: { ...PING_HEADERS, "content-type": "text/plain" },
  });

/**
 * The probe's answer when what serves the page doesn't answer the hub: why
 * in the hub's words, which the pane says (core `PreviewPingDown`). A 200:
 * the origin answered, and a browser logs every error status a page's fetch
 * meets in its console, so a pane holding a preview that is down would fill
 * the person's console at each of its probes.
 */
const pingDown = (why: string): Response =>
  Response.json({ why } satisfies PreviewPingDown, { headers: PING_HEADERS });

/** A sentence's last stop: the pane's words put their own after `why` (core `previewUnreachedWords`). */
const TRAILING_STOP = /\.$/u;

/** How long the machine's listener has to answer the ping's relay. Our call: under the pane's own 10 s for the whole probe. */
const PING_RELAY_MS = 5000;

/** A thrown fetch's short name for the pane: its code (`ECONNRESET`), else its kind. */
const codeOf = (error: unknown): string => {
  const { code } = (error ?? {}) as { code?: unknown };
  if (typeof code === "string") {
    return code;
  }
  return error instanceof Error ? error.name : String(error);
};

/**
 * The ping on session `instanceId`'s origin: ok once whatever serves its
 * page answers the hub. A page the hub serves, or no preview at all (the
 * frame's own load says it is closed), is the hub's answer alone; a
 * machine's preview is reached (started when no listener serves it) and its
 * listener asked for its own ping, so a listener that is gone answers why
 * ({@link pingDown}), and is forgotten as a request's is ({@link relay}).
 */
async function pingSession(
  instanceId: string,
  deps: PreviewListenerDeps
): Promise<Response> {
  const target = targetsOf(instanceId).get(instanceId);
  // A session's or a project's origin serves only what the hub holds: a
  // machine's preview answers on its artifact's own origin.
  if (!(target && isEmbed(instanceId)) || "page" in target.source) {
    return ping();
  }
  const reached = await deps.reach(instanceId);
  if (!reached.ok) {
    return reached.down === "closed" ? ping() : pingDown(reached.error);
  }
  const at = reached.upstream;
  const address = at.address.includes(":") ? `[${at.address}]` : at.address;
  const failed = (cause: string, code: string): Response => {
    previewFailed(
      HOP,
      instanceId,
      `its machine's listener at ${address}:${at.port} didn't answer the ping: ${cause}`
    );
    deps.unreachable(instanceId, at);
    return pingDown(`its machine's listener didn't answer the hub (${code})`);
  };
  try {
    const read = await readWithin(PING_RELAY_MS, (signal) =>
      fetch(`http://${address}:${at.port}${PREVIEW_PING_PATH}`, {
        headers: { [RELAY_HEADER]: at.token },
        signal,
      })
    );
    if (read.kind !== "answered") {
      return failed(`no answer within ${read.after} ms`, "timeout");
    }
    if (read.value.ok) {
      await read.value.body?.cancel();
      return ping();
    }
    // The listener answered as a load would be met: the down page it names,
    // in the machine's words, else the hop's (the pane adds the stop).
    const said = downOf(await read.value.text());
    const words = said
      ? (said.why ?? DOWN_WORDS[said.down])
      : `its machine's listener answered ${read.value.status}`;
    return pingDown(words.replace(TRAILING_STOP, ""));
  } catch (error) {
    return failed(causeOf(error), codeOf(error));
  }
}

/**
 * A preview no panel shows, loaded once through its machine's listener `at`
 * as a pane's load is (a sleeping stage or served server wakes for it): null
 * when nothing stands in its way, else the hop that failed and why. A page
 * with no answer within `waitMs` is a server still making it (a first
 * compile, a build holding its event loop), and no failure: a served server
 * is up once its port listens, however long its pages take (agent stage.ts
 * `listens`). The listener's own ping then says whether the way to the server
 * stands, so `machine` is said only of a listener that answers neither.
 */
export async function loadedOnce(
  at: NonNullable<PreviewTarget["upstream"]>,
  path: string | undefined,
  waitMs: number
): Promise<{ failure: PreviewDown; why: string | null } | null> {
  const address = at.address.includes(":") ? `[${at.address}]` : at.address;
  const said = (html: string) => {
    const down = downOf(html);
    return down && { failure: down.down, why: down.why };
  };
  try {
    const page = await readWithin(waitMs, async (signal) => {
      const answer = await fetch(`http://${address}:${at.port}${path ?? "/"}`, {
        // A pane's load: a sleeping stage or served server wakes for it.
        headers: { [RELAY_HEADER]: at.token, "sec-fetch-mode": "navigate" },
        redirect: "manual",
        signal,
      });
      return await answer.text();
    });
    if (page.kind === "answered") {
      return said(page.value);
    }
    const pinged = await readWithin(PING_RELAY_MS, async (signal) => {
      const answer = await fetch(
        `http://${address}:${at.port}${PREVIEW_PING_PATH}`,
        { headers: { [RELAY_HEADER]: at.token }, signal }
      );
      return await answer.text();
    });
    return pinged.kind === "answered"
      ? said(pinged.value)
      : {
          failure: "machine",
          why: `its listener didn't answer the hub within ${Math.round(pinged.after / 1000)} s`,
        };
  } catch (error) {
    return {
      failure: "machine",
      why: `its listener didn't answer the hub: ${causeOf(error)}`,
    };
  }
}

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

/**
 * What goes on to the machine: hop-by-hop headers off, and none of the
 * dashboard's cookies. On a host-mode name (`direct` false) every answer
 * but an immutable one is `no-store` ({@link downstreamHeaders}), so nothing
 * there is a copy to revalidate: a conditional request asks for bytes, never
 * a 304 for a copy the browser was told not to keep.
 */
const upstreamHeaders = (request: Request, direct: boolean): Headers => {
  const headers = proxyHeaders(request.headers);
  if (!direct) {
    headers.delete("if-none-match");
    headers.delete("if-modified-since");
  }
  const cookies = appCookies(headers.get("cookie"));
  if (cookies) {
    headers.set("cookie", cookies);
  } else {
    headers.delete("cookie");
  }
  return headers;
};

/**
 * What comes back to the browser: no cookie the app sets under one of the
 * dashboard's names, and only the caching that is safe where it was asked
 * (core `previewCache`): on a host-mode name (`direct` false) a CDN may stand
 * in front, so a module the app would have revalidated is never stored.
 */
const downstreamHeaders = (response: Response, direct: boolean): Headers => {
  const headers = decodedHeaders(response.headers);
  cachePreview(headers, response.status, direct);
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
 * next request asks the machine where the preview is served now. `direct`:
 * the request came to a session's own port listener ({@link downstreamHeaders}).
 */
async function relay(
  request: Request,
  server: Server<ListenerSocket>,
  instanceId: string,
  at: NonNullable<PreviewTarget["upstream"]>,
  deps: PreviewListenerDeps,
  direct: boolean,
  /** The preview's own port answered, as the machine's listener marks it. */
  answered?: () => void
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const address = at.address.includes(":") ? `[${at.address}]` : at.address;
  const upstream = `${address}:${at.port}${url.pathname}${url.search}`;
  const headers = upstreamHeaders(request, direct);
  // The listener's start token: it answers the hub's relay and nothing else.
  headers.set(RELAY_HEADER, at.token);
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    // A machine listener that is gone (its agent restarted) is forgotten, as
    // a request's is below: a page whose socket alone reconnects (a live
    // dashboard's) would otherwise be sent to the dead port for good.
    return upgradePreview(request, server, `ws://${upstream}`, headers, {
      hop: HOP,
      instanceId,
      nothingListens: () => deps.unreachable(instanceId, at),
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
    const why = `its machine's listener at ${address}:${at.port} didn't answer the hub: ${causeOf(error)}`;
    previewFailed(HOP, instanceId, why);
    deps.unreachable(instanceId, at);
    return downResponse("machine", 502, why);
  }
  const down = downstreamHeaders(response, direct);
  if (down.get(PREVIEW_SERVED_HEADER) === "1") {
    answered?.();
  }
  down.delete(PREVIEW_SERVED_HEADER);
  return new Response(response.body, {
    status: response.status,
    headers: down,
  });
}

/**
 * What the hub serves on a session's origin by an artifact's id, whatever
 * the panel shows: a decision page's host bundle (`/__cawco/decision/`), a
 * canvas (`/__cawco/canvas/<id>/`, `?embed=1` in a decision page) or a page
 * (`/__cawco/page/<id>/`) of the session's own; null for any other path.
 */
async function artifactById(
  url: URL,
  instanceId: string,
  deps: PreviewListenerDeps
): Promise<Response | null> {
  const { pathname } = url;
  if (pathname.startsWith(DECISION_ASSETS)) {
    return (
      (await decisionHostFile(pathname.slice(DECISION_ASSETS.length))) ??
      new Response("Not found", { status: 404 })
    );
  }
  const canvas = pathname.match(CANVAS_PATH);
  if (canvas) {
    const [, artifactId, rest] = canvas;
    const embed = url.searchParams.get("embed") === "1";
    return deps.servedOn(artifactId, instanceId) &&
      deps.kindOf(artifactId) === "canvas"
      ? serveCanvas(artifactId, rest, deps.seed, embed)
      : new Response("This session has no such canvas.", { status: 404 });
  }
  const paged = pathname.match(PAGE_PATH);
  if (paged) {
    const [, artifactId, rest] = paged;
    return deps.servedOn(artifactId, instanceId) &&
      deps.kindOf(artifactId) === "page"
      ? servePage(artifactId, rest, deps, url, `/__cawco/page/${artifactId}/`)
      : new Response("This origin serves no such page.", { status: 404 });
  }
  return null;
}

/**
 * What a page asks of an artifact on this origin by its path: its doc's
 * socket or an action ({@link joinArtifact}), or, beside a decision page,
 * the shape one of its Previews heard ({@link PAGE_SHAPE_PATH}); null for any
 * other path.
 */
function artifactAsked(
  request: Request,
  server: Server<ListenerSocket>,
  pathname: string,
  instanceId: string,
  deps: PreviewListenerDeps
): Response | Promise<Response> | undefined | null {
  const synced = pathname.match(ARTIFACT_PATH);
  if (synced) {
    return joinArtifact(request, server, synced, instanceId, deps);
  }
  const shaped = pathname.match(PAGE_SHAPE_PATH)?.[1];
  if (!shaped) {
    return null;
  }
  return deps.servedOn(shaped, instanceId) && deps.kindOf(shaped) === "page"
    ? deps.keepShape(request, shaped)
    : new Response("This origin serves no such page.", { status: 404 });
}

/** One request to session `instanceId`'s preview origin, at its root; `direct` as {@link relay} takes it. */
async function serveSession(
  request: Request,
  server: Server<ListenerSocket>,
  instanceId: string,
  deps: PreviewListenerDeps,
  direct: boolean
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === PREVIEW_PING_PATH) {
    return pingSession(instanceId, deps);
  }
  if (pathname === OVERLAY_PATH) {
    return overlayResponse(
      previewParents(),
      request.headers.get("accept-encoding"),
      url.searchParams.get(OVERLAY_KEY)
    );
  }
  const told = artifactAsked(request, server, pathname, instanceId, deps);
  if (told !== null) {
    return told;
  }
  const byId = await artifactById(url, instanceId, deps);
  if (byId) {
    return byId;
  }
  if (hubsOwn(pathname)) {
    return new Response("Not found", { status: 404 });
  }
  const target = targetsOf(instanceId).get(instanceId);
  if (!target) {
    previewFailed(HOP, instanceId, "its session shows no preview");
    return downResponse("closed", 404);
  }
  if (target.artifact.kind === "browser") {
    return new Response(
      "A browser is drawn by its panel from its stream; no page serves it.",
      { status: 404 }
    );
  }
  if ("page" in target.source && target.artifact.kind !== "component") {
    // A project's page is served on its project's origin alone, at its own
    // address there (`/__cawco/page/<id>/`): its frame names that origin.
    if (!deps.servedOn(target.artifact.id, instanceId)) {
      previewFailed(HOP, instanceId, "its page is its project's origin's");
      return downResponse("closed", 404);
    }
    return HUB_SERVES[target.artifact.kind](
      target.artifact.id,
      pathname,
      deps,
      url
    );
  }
  // A machine's preview is served on its artifact's own origin alone
  // (embedKey): the session's panel names that origin, never this one.
  if (!isEmbed(instanceId)) {
    previewFailed(
      HOP,
      instanceId,
      "its machine's preview is on its own origin"
    );
    return downResponse("closed", 404);
  }
  // It waits on the machine: a listener started, its stage's wake, the
  // server's first answer.
  heldWhileServed(server, request);
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
  // A canvas's stage answering its page is the stage reached again.
  const { artifact } = target;
  return relay(
    request,
    server,
    instanceId,
    reached.upstream,
    deps,
    direct,
    artifact.kind === "component"
      ? () => deps.stageAnswered(artifact.id)
      : undefined
  );
}

/**
 * The lock on one request (preview-access.ts), to a name of host mode's
 * pattern or to an origin's own port, `instanceId` the origin that holds
 * the name or port (a session's, a project's, an embed's), or undefined when
 * no name does: the answer that stops the request, or undefined when it
 * goes on.
 *
 * The person's live pass goes through on every held name, whichever origin
 * holds it; a session's (`artifact_browse`) on the names of its scope
 * alone, and any other name answers it as it answers a stranger.
 * A stranger learns nothing of which names are held: without a pass, a name
 * nobody holds answers exactly as a held one does, the locked page, and an
 * entry there is refused as one with a spent ticket would be. Only the
 * person's live pass learns that a name is closed (404). The
 * ping answers on every name, so the dashboard learns the origin is
 * reachable and nobody learns more.
 */
const atTheLock = (
  request: Request,
  lock: PassLock,
  instanceId: string | undefined
): Response | undefined => {
  const { pathname } = new URL(request.url);
  if (pathname === PREVIEW_PING_PATH) {
    return instanceId ? undefined : ping();
  }
  if (pathname === PREVIEW_ENTER_PATH) {
    if (!instanceId) {
      return lockedResponse();
    }
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
  if (!passOf(request, lock, instanceId)) {
    return lockedResponse();
  }
  if (instanceId) {
    return;
  }
  previewFailed(
    HOP,
    null,
    `no session's preview at ${request.headers.get("host")}`
  );
  return downResponse("closed", 404);
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

/** An origin whose session or project the hub no longer holds: let go, and said, never kept. */
const ownerGone = (key: string): PreviewRefusal =>
  new PreviewRefusal(
    409,
    `No session or project holds the preview origin ${key} now, so it serves nothing.`
  );

/**
 * `https://` (how the proxy in front of the names serves them, never how a
 * client reached the hub: the pass is a `Secure` cookie, which no browser
 * keeps from plain http, RFC 6265bis §5.7 step 13), then a host name whose
 * first label holds exactly one placeholder, `{session}` or `{port}`, with a
 * port after it or not. The first label: every name then stands under one
 * domain, the rest of the name, which the pass is set on. The characters
 * around the placeholder hold no brace, so a second one never fits.
 */
const PATTERN_SHAPE =
  /^https:\/\/([a-z0-9-]*)\{(session|port)\}([a-z0-9-]*\.([a-z0-9.-]+?))(:\d{1,5})?$/u;
const PATTERN_REFUSAL =
  "A host pattern is https:// and a host name whose first label holds one of {session} or {port}, like https://p-{session}.example.com or https://p-{port}.example.com, and a port after it or not.";

/**
 * Host mode's names, parsed once: what stands for a session in them, its id
 * (`{session}`) or the preview port it keeps (`{port}`), the host text
 * before and after it, and the domain they all stand under.
 */
interface HostPattern {
  after: string;
  before: string;
  /** The domain every name stands under: its pass's `Domain` (core `hostModeDomain`). */
  domain: string;
  key: "session" | "port";
  /** A Host header's name for one session: the placeholder's value at group 1. */
  shape: RegExp;
}

/** The port a host pattern's name ends in (`HostPattern.after`), when it names one. */
const PATTERN_PORT = /:(\d+)$/u;

/** One DNS label: what a `{session}` name's placeholder holds ({@link labelOf}). */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const VALUE_OF = {
  // Any origin's label (labelOf): a session's, a project's, an embed's.
  session: "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?",
  port: "\\d{1,5}",
} as const;

/**
 * The label a `{session}` pattern names origin `key` by: the key itself
 * when it is a DNS label already (a session's id, `project-<uuid>`,
 * `embed-<uuid>`, a project id like `proj-00000-tde5z`), else `o-` and a
 * hash of it (a project id with capitals or `_`, or one longer than a
 * label holds), so every origin the hub hands out has a name, and each name
 * reads back to one origin ({@link sessionOfHost}).
 */
const labelOf = (key: string): string =>
  DNS_LABEL.test(key)
    ? key
    : `o-${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;

/**
 * `pattern` parsed, or refused in one sentence: one whose names stand under
 * a public suffix (`ts.net`, `pages.dev`, a bare `localhost`), or under an
 * ending the Public Suffix List doesn't know (`.localhost`, `.test`,
 * `.lan`), is refused, since no browser's frames would carry their pass
 * (core pass-domain.ts).
 */
const parsePattern = (pattern: string): HostPattern => {
  const parts = pattern.match(PATTERN_SHAPE);
  if (!parts) {
    throw new PreviewRefusal(422, PATTERN_REFUSAL);
  }
  const [, before, key, name, domain, port = ""] = parts as [
    string,
    string,
    HostPattern["key"],
    string,
    string,
    string?,
  ];
  const refusal = passDomainRefusal(domain);
  if (refusal?.kind === "public") {
    throw new PreviewRefusal(
      422,
      `The pattern's names stand under ${domain}, a public suffix, where no browser keeps a cookie, so the hub can't give them a pass. Use names under a domain of your own, like https://p-{port}.previews.example.com, then save again.`
    );
  }
  if (refusal) {
    throw new PreviewRefusal(
      422,
      `The pattern's names stand under ${domain}, whose ending .${refusal.suffix} no public registry holds, so a browser takes each name for a site of its own and no frame of the dashboard carries their pass. Use names under a domain registered on the internet, like https://p-{port}.previews.example.com, then save again.`
    );
  }
  const after = `${name}${port}`;
  // The Host header names the port only when it is not the scheme's own.
  return {
    before,
    key,
    after,
    domain,
    shape: new RegExp(
      `^${literal(before)}(${VALUE_OF[key]})(?:${literal(after)}|${literal(name)})$`,
      "iu"
    ),
  };
};

/** The host name `pattern` gives a session whose placeholder value is `value` (`name[:port]`). */
const hostFor = (pattern: HostPattern, value: string | number): string =>
  `${pattern.before}${value}${pattern.after}`;

/** The whole origin `pattern` gives that session. */
const originFor = (pattern: HostPattern, value: string | number): string =>
  `https://${hostFor(pattern, value)}`;

const PORT_SUFFIX = /:\d+$/u;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;
/** `text` as a regular expression that matches it alone. */
const literal = (text: string): string =>
  text.replaceAll(REGEX_SPECIAL, "\\$&");

/** One name of the pattern's, its port left off: a made-up session's, or the range's first port's. */
const sampleName = (pattern: HostPattern): string =>
  hostFor(
    pattern,
    pattern.key === "port"
      ? PREVIEW_PORTS.first
      : "00000000-0000-4000-8000-000000000000"
  ).replace(PORT_SUFFIX, "");

/**
 * Whether a host pattern's names reach anything: one generated name has to
 * resolve, a made-up session's or the range's first port's, in the DNS, its
 * record (a wildcard for `{session}`, one per port for `{port}`) pointing at
 * the hub or the proxy in front of it.
 */
const probePattern = async (pattern: HostPattern): Promise<string | null> => {
  const name = sampleName(pattern);
  try {
    await Bun.dns.lookup(name);
    return null;
  } catch (error) {
    return `${name} doesn't resolve (${causeOf(error)}): point the pattern's names at the hub's port ${PREVIEW_PORTS.first}, then save again.`;
  }
};

/**
 * Every session's preview origin. In either mode each session that shows a
 * preview or a canvas takes a port of the range and a listener on it, on the
 * hub's own bind address; its port is kept, so the previewed app keeps its
 * storage across restarts. That is all port mode (the default, no setup)
 * has. Every listener is behind the lock (preview-access.ts): without the
 * person's pass or a session's, whoever reaches a port is answered the
 * locked page. Host mode adds one listener on the range's first port that routes
 * each request by its Host, a name per session from the fleet's pattern that
 * DNS or a proxy brings there, behind the lock: `{session}` its id, or
 * `{port}` the preview port it keeps, so a fixed pool of names, one per port
 * of the range, serves every session. A client reached under the pattern's
 * domain loads the names; any other loads the ports (core `previewRoute`).
 * (The hub's own server is Elysia's, whose sockets run its lifecycle: a
 * previewed app's HMR socket cannot be upgraded there.)
 *
 * While the hub serves HTTPS on its machine's tailnet name
 * (tailnet-https.ts), every listener has a TLS twin, the same handler behind
 * it, which the port's door on each tailnet address carries TLS to, and a
 * session's address names its origin on that name too (`tailnet`). The
 * plain one binds with `reusePort`, which Linux needs on both sockets to let
 * a door on an address stand beside the wildcard listener.
 */
export function createPreviewListeners(
  hostname: string,
  deps: PreviewListenerDeps,
  db: PreviewsDb,
  passes: PreviewPassesDb,
  tailnet: Pick<TailnetHttpsService, "beside" | "origin">
) {
  const proxy = previewWebSocket as unknown as WebSocketHandler<ListenerSocket>;
  /**
   * Each origin's open sockets, by its key: a frame that shows it holds one
   * while it stands (its overlay's doc link, which keeps itself open: core
   * doc-link.ts; a previewed app's own), so an origin a screen shows is in
   * use, as a stage counts its viewers by its sockets (agent stage.ts).
   */
  const viewers = new Map<string, number>();
  const viewed = (socket: ServerWebSocket<ListenerSocket>, by: 1 | -1) => {
    const { data } = socket;
    const key = "artifactId" in data ? data.at : data.instanceId;
    if (key) {
      const now = (viewers.get(key) ?? 0) + by;
      if (now > 0) {
        viewers.set(key, now);
      } else {
        viewers.delete(key);
      }
    }
  };
  const websocket: WebSocketHandler<ListenerSocket> = {
    open: (socket) => {
      viewed(socket, 1);
      return isArtifact(socket)
        ? deps.socket.open(socket)
        : proxy.open?.(socket);
    },
    message: (socket, message) =>
      isArtifact(socket)
        ? deps.socket.message(socket, message)
        : proxy.message(socket, message),
    drain: (socket) => {
      if (!isArtifact(socket)) {
        proxy.drain?.(socket);
      }
    },
    close: (socket, code, reason) => {
      viewed(socket, -1);
      return isArtifact(socket)
        ? deps.socket.close(socket)
        : proxy.close?.(socket, code, reason);
    },
  };
  const error = (thrown: Error) => {
    const why = `the hub's preview listener failed serving it: ${causeOf(thrown)}`;
    previewFailed(HOP, null, why);
    return downResponse("machine", 502, why);
  };
  /**
   * A listener on `port`, each request's session from `route`, and its TLS
   * twins on the tailnet addresses while those serve HTTPS, behind `lock`
   * (preview-access.ts): a request needs the browser's pass, WebSocket
   * upgrades too, but the dashboard's ping and the entry that spends a
   * ticket for one. Host mode's names set it on their domain, an origin's
   * own port on the host it was reached at.
   */
  const listen = (
    port: number,
    route: (request: Request) => string | undefined,
    lock: PassLock
  ): Listener => {
    const fetch = async (
      request: Request,
      server: Server<ListenerSocket>
    ): Promise<Response | undefined> => {
      const instanceId = route(request);
      const stopped = atTheLock(request, lock, instanceId);
      if (stopped) {
        return framedBy(stopped, ancestorsOf(instanceId));
      }
      // A page served here (a decision page) asks whether the hub reaches
      // one of its embeds' origins, which this browser didn't.
      const asked = new URL(request.url);
      if (asked.pathname === PREVIEW_REACH_PATH) {
        return Response.json({
          ...(await reachOrigin(asked.searchParams.get("origin") ?? "")),
          // What the page can't read from the hub's API, for its words.
          ports: PREVIEW_PORTS_TEXT,
          hostMode: settings.mode === "host",
        });
      }
      // Port mode: every listener is one session's, so a route names it.
      if (!instanceId) {
        previewFailed(
          HOP,
          null,
          `no session's preview at ${request.headers.get("host")}`
        );
        return framedBy(downResponse("closed", 404));
      }
      // An origin's own port has no CDN in front of it; host mode's names
      // may.
      const answer = await serveSession(
        request,
        server,
        instanceId,
        deps,
        lock.domain === null
      );
      // Gzipped here, once, after the overlay tag is keyed; an immutable
      // answer once for its address on this session's origin.
      return (
        answer &&
        (await compressed(
          framedBy(await withKeyedOverlay(answer), ancestorsOf(instanceId)),
          request.headers.get("accept-encoding"),
          `${instanceId} ${request.url}`
        ))
      );
    };
    const plain = Bun.serve<ListenerSocket>({
      hostname,
      port,
      reusePort: true,
      websocket,
      error,
      fetch,
    });
    /*
     * Its HTTPS speaks HTTP/2 to a browser that offers it (ALPN): a component
     * canvas's first draw asks for its whole module graph, 845 modules for
     * caw-panel's States, and over HTTP/1.1 a browser takes six connections
     * to an origin, so they queued (median 580 ms, the tail 11 s, measured on
     * the owner's tailnet) and the picture drew 13.8 s in. One HTTP/2
     * connection carries them all at once. "`Bun.serve` now supports HTTP/2
     * on the same port as HTTP/1.1 ... Over TLS the protocol is negotiated
     * with ALPN" (bun.com/blog/bun-v1.4.1); "`server.upgrade()` only works on
     * HTTP/1.1 requests" (bun.com/docs/runtime/http/server), and a browser
     * opens a preview's sockets (Vite's HMR, the overlay's) on HTTP/1.1 of
     * its own, as no extended CONNECT is offered.
     */
    const secure = tailnet.beside(port, (at) =>
      Bun.serve<ListenerSocket>({
        ...at,
        http2: true,
        websocket,
        error,
        fetch: (request, server) => fetch(asReached(request), server),
      })
    );
    return {
      port,
      stop: (): Promise<void> => {
        secure.close();
        return plain.stop(true);
      },
    };
  };

  /**
   * Whether the hub reaches `origin`'s ping itself now, as a browser asks it
   * (core preview-reach.ts): the origin must be one of this hub's previews,
   * a port of its range or a name under host mode's domain, and only its
   * ping is asked. Reached is CawCo's own answer, which carries
   * `PREVIEW_PING_HEADER`; anything else that answered (a proxy, a CDN's
   * own page) is said with its status.
   */
  const reachOrigin = async (origin: string): Promise<HubReach> => {
    let at: URL;
    try {
      at = new URL(origin);
    } catch {
      return { reached: false, why: "not an origin" };
    }
    const port = Number(at.port);
    const ours =
      (at.protocol === "http:" || at.protocol === "https:") &&
      ((port >= PREVIEW_PORTS.first && port <= PREVIEW_PORTS.last) ||
        (!!hostPattern &&
          (at.hostname === hostPattern.domain ||
            at.hostname.endsWith(`.${hostPattern.domain}`))));
    if (!ours) {
      return { reached: false, why: "not one of this hub's preview origins" };
    }
    try {
      const read = await readWithin(PING_RELAY_MS, (signal) =>
        fetch(`${at.origin}${PREVIEW_PING_PATH}`, {
          cache: "no-store",
          redirect: "manual",
          signal,
        })
      );
      if (read.kind !== "answered") {
        return {
          reached: false,
          why: `no answer within ${PING_RELAY_MS / 1000} s`,
        };
      }
      const answer = read.value;
      await answer.body?.cancel();
      return answer.headers.get(PREVIEW_PING_HEADER) === "1"
        ? { reached: true }
        : {
            reached: false,
            why: `something other than CawCo answered it ${answer.status}`,
          };
    } catch (thrown) {
      return { reached: false, why: causeOf(thrown) };
    }
  };

  let settings = db.settings();
  /**
   * Host mode's pattern once its listener stands; none in port mode, or
   * while host mode didn't start (its stored pattern refused, as an http://
   * one kept from before the names took a pass is, or its port held): host
   * mode then names no origin, and every client loads each session's port
   * until Settings › Previews saves a pattern the hub takes.
   */
  let hostPattern: HostPattern | undefined;
  /**
   * Whether no socket holds `port` on the listeners' address now: a bind
   * without `reusePort`, closed at once. A listener binds with `reusePort`
   * (its tailnet twin needs it), and such a bind succeeds silently on a port
   * another process holds the same way, the kernel then splitting
   * connections between the two: a scratch hub beside another took half of
   * an embed's requests that way, its frame left on the browser's error page.
   */
  const unheld = (port: number): boolean => {
    try {
      Bun.serve({ hostname, port, fetch: () => new Response(null) }).stop(true);
      return true;
    } catch (thrown) {
      // Held: another socket has the port. Any other refusal is the bind
      // address's, which no other port avoids: said as itself, never as
      // every preview port taken.
      if ((thrown as { code?: unknown }).code === "EADDRINUSE") {
        return false;
      }
      throw portRefused(port, thrown);
    }
  };

  /** The lock on every origin's own port: its pass set on the host it was reached at. */
  const portLock: PassLock = {
    domain: null,
    passes,
    sessionLive: deps.sessionLive,
  };
  /** Each session's listener on its own port, by session. */
  const sessions = new Map<string, Listener>();
  /**
   * Each machine artifact's listener on the port it keeps (made again as a
   * frame next names it, after a mode change too), by its key, with the origin of the
   * page that shows it and every origin that page was served on: exactly
   * those may frame it.
   */
  const embeds = new Map<
    string,
    { ancestors: Set<string>; listener: Listener; owner: string }
  >();
  /** Host mode's one listener. */
  let byHost: Listener | undefined;

  /**
   * Serves `instanceId` on `port`: false when another process holds it
   * (EADDRINUSE). Any other refusal is the bind address's, not the port's,
   * so no other port would open either: it is thrown, in one sentence.
   */
  const serveOn = (instanceId: string, port: number): boolean => {
    if (!unheld(port)) {
      return false;
    }
    let refused: unknown;
    try {
      sessions.set(
        instanceId,
        listen(port, () => instanceId, portLock)
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
    // A machine of the fleet may run the stream relay on these (3478, 3479,
    // 5349, 5350): no preview ever takes one, wherever CAWCO_PREVIEW_PORTS
    // puts the range.
    if (isStreamRelayPort(port)) {
      return "it is the stream relay's port";
    }
    if (settings.mode === "host" && port === PREVIEW_PORTS.first) {
      return "it is host mode's listener port";
    }
    return port < PREVIEW_PORTS.first || port > PREVIEW_PORTS.last
      ? `it is outside the preview ports ${PREVIEW_PORTS_TEXT}`
      : null;
  };

  /**
   * The session or project that holds origin `key`'s port: a session's or a
   * project's origin itself; an embed's, the origin that opened it, or with
   * no listener open (after a restart) its artifact's own. Undefined when
   * none does.
   */
  const holderOf = (key: string): string | undefined => {
    const artifactId = artifactOfOrigin(key);
    if (artifactId === null) {
      return key;
    }
    return embeds.get(key)?.owner ?? deps.originOf(artifactId);
  };

  /**
   * Whether origin `key` holds its port now: its owner (the session, the
   * project, the artifact) is a row, and something serves or uses it. A
   * frame of it open on a screen ({@link viewers}); a project's, while the
   * hub keeps the project; a session's, while the session is used
   * (`sessionUsed`: its process may run, or a screen follows it); an
   * artifact's, while the session that opened it is used or a used
   * session's panel shows it. The OS holds the port itself while a listener
   * is bound (`unheld`); the stored port is the one the origin comes back
   * to, a claim that counts only while this holds, as Portless keeps a
   * route only while its process is alive (github.com/vercel-labs/portless,
   * routes.ts `loadRoutes`).
   */
  const holds = (key: string): boolean => {
    if (!db.ownerHeld(key)) {
      return false;
    }
    if (viewers.has(key) || projectOfOrigin(key) !== null) {
      return true;
    }
    const artifactId = artifactOfOrigin(key);
    if (artifactId === null) {
      return deps.sessionUsed(key);
    }
    const opener = holderOf(key);
    return (
      (opener !== undefined &&
        projectOfOrigin(opener) === null &&
        deps.sessionUsed(opener)) ||
      [...previewTargets].some(
        ([instanceId, target]) =>
          target.artifact.id === artifactId && deps.sessionUsed(instanceId)
      )
    );
  };

  /**
   * Every origin that doesn't hold its port ({@link holds}) lets it go: its
   * listener stops, its stored port is dropped, and what shows it is told
   * again without that address. A sleeping session's preview, or an ended
   * one's page opened again, is served on a port no origin in use needs,
   * and gives it up here once one does. How many went.
   */
  const letUnusedGo = (): number => {
    const unused = [
      ...new Set([
        ...db.ports().map((row) => row.key),
        ...sessions.keys(),
        ...embeds.keys(),
      ]),
    ].filter((key) => !holds(key));
    for (const key of unused) {
      release(key);
    }
    if (unused.length > 0) {
      deps.letGo(unused);
    }
    return unused.length;
  };

  /**
   * The one way a session gets its port, at the hub's start and on demand:
   * the port it keeps while that is still a preview port and `opens`; else
   * the lowest of the range that is not the fleet's own, not another
   * origin's, and opens; else, once every origin that doesn't hold its
   * port let it go ({@link letUnusedGo}), the lowest that opens then. A move is saved, so a collision
   * heals itself, and said in one line. Its listener opens on it (`bind`),
   * and host mode's `{port}` names it too.
   */
  const portFor = (
    instanceId: string,
    opens: (port: number) => boolean
  ): number => {
    // An origin whose session or project is gone holds no port: it is let go, never kept.
    if (!db.ownerHeld(instanceId)) {
      throw ownerGone(instanceId);
    }
    const held = db.ports();
    const kept = held.find((row) => row.key === instanceId)?.port;
    let why = "";
    if (kept !== undefined) {
      const refused = barred(kept);
      if (!refused && opens(kept)) {
        return kept;
      }
      why = refused ?? "another process holds it";
    }
    const port =
      firstOpen(new Set(held.map((row) => row.port)), opens) ??
      (letUnusedGo() > 0
        ? firstOpen(new Set(db.ports().map((row) => row.port)), opens)
        : undefined);
    if (port === undefined) {
      throw everyPortTaken();
    }
    if (!db.keepPort(instanceId, port)) {
      // Its owner went while the listener opened.
      release(instanceId);
      throw ownerGone(instanceId);
    }
    if (kept !== undefined) {
      console.warn(
        `[preview] ${HOP}: preview of ${instanceId} moves from port ${kept} to ${port}: ${why}`
      );
    }
    return port;
  };

  /** The lowest port of the range not `taken`, not barred, that `opens`; undefined when none does. */
  const firstOpen = (
    taken: Set<number>,
    opens: (port: number) => boolean
  ): number | undefined => {
    for (
      let port = PREVIEW_PORTS.first;
      port <= PREVIEW_PORTS.last;
      port += 1
    ) {
      if (!(taken.has(port) || barred(port)) && opens(port)) {
        return port;
      }
    }
  };

  /**
   * Every port of the range is held, each by a live origin or another
   * program: said with how many each holds, and what frees one.
   */
  const everyPortTaken = (): PreviewRefusal => {
    const { sessions: bySessions, projects, others } = portHolders();
    const held = [
      bySessions
        ? `${bySessions} by sessions that run or are open on a screen`
        : "",
      projects ? `${projects} by projects' pages` : "",
      others ? `${others} by other programs on the hub's machine` : "",
    ].filter(Boolean);
    const free = [
      bySessions ? "end a session that has a preview or a canvas" : "",
      others ? "stop one of those programs" : "",
      projects ? "delete a project you no longer need" : "",
    ].filter(Boolean);
    const action = new Intl.ListFormat("en", { type: "disjunction" }).format(
      free
    );
    return new PreviewRefusal(
      503,
      `Every preview port (${PREVIEW_PORTS_TEXT}) is taken: ${new Intl.ListFormat("en").format(held)}. ${action.charAt(0).toUpperCase()}${action.slice(1)}, then show this one again.`
    );
  };

  /** How many ports of the range, the barred left out, sessions in use, projects and other programs hold. */
  const portHolders = (): {
    others: number;
    projects: number;
    sessions: number;
  } => {
    const keys = new Map(db.ports().map((row) => [row.port, row.key]));
    const count = { others: 0, projects: 0, sessions: 0 };
    for (
      let port = PREVIEW_PORTS.first;
      port <= PREVIEW_PORTS.last;
      port += 1
    ) {
      const key = keys.get(port);
      const holder = key === undefined ? undefined : holderOf(key);
      if (barred(port)) {
        continue;
      }
      if (holder === undefined) {
        count.others += 1;
      } else if (projectOfOrigin(holder) === null) {
        count.sessions += 1;
      } else {
        count.projects += 1;
      }
    }
    return count;
  };

  /** Origin `key`'s listener stops and its port is free again. */
  const release = (key: string): void => {
    const listener = sessions.get(key) ?? embeds.get(key)?.listener;
    if (listener) {
      detach(listener.stop(), "preview listener stop");
    }
    sessions.delete(key);
    embeds.delete(key);
    viewers.delete(key);
    db.dropPort(key);
  };

  /** Session `instanceId`'s listener on its port. */
  const bind = (instanceId: string): number =>
    portFor(instanceId, (port) => serveOn(instanceId, port));

  /** Session `instanceId`'s port, its listener started when it has none. */
  const portOf = (instanceId: string): number =>
    sessions.get(instanceId)?.port ?? bind(instanceId);

  /** The session a Host header names under `pattern`; undefined when it names none, or a port no session holds. */
  const sessionOfHost = (
    pattern: HostPattern,
    host: string | null
  ): string | undefined => {
    const value = host?.match(pattern.shape)?.[1]?.toLowerCase();
    if (!value) {
      return;
    }
    if (pattern.key === "session") {
      // The origin, of every one held now (a session's, a project's, an embed's), this label names.
      return [...db.ports().map((row) => row.key), ...embeds.keys()].find(
        (key) => labelOf(key) === value
      );
    }
    const port = Number(value);
    return (
      db.ports().find((row) => row.port === port)?.key ??
      [...embeds].find(([, embed]) => embed.listener.port === port)?.[0]
    );
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
    const fleet =
      FLEET_PORTS.get(PREVIEW_PORTS.first) ??
      (isStreamRelayPort(PREVIEW_PORTS.first) ? "the stream relay's" : null);
    if (fleet) {
      const why = `Port ${PREVIEW_PORTS.first} is ${fleet} port, so host-mode previews can't take it: set CAWCO_PREVIEW_PORTS to a range whose first port is free.`;
      previewFailed(HOP, null, why);
      return why;
    }
    try {
      // Its listener binds with `reusePort`, which succeeds beside any other
      // socket bound the same way, and that one would take a share of the
      // names' requests past the lock: host mode opens only on a port
      // nothing holds.
      if (!unheld(PREVIEW_PORTS.first)) {
        const why = `Port ${PREVIEW_PORTS.first} is held by another listener, so host-mode previews can't take it: free it, or set CAWCO_PREVIEW_PORTS to a range whose first port is free.`;
        previewFailed(HOP, null, why);
        return why;
      }
      byHost = listen(
        PREVIEW_PORTS.first,
        (request) => sessionOfHost(pattern, request.headers.get("host")),
        { domain: pattern.domain, passes, sessionLive: deps.sessionLive }
      );
      hostPattern = pattern;
      return null;
    } catch (thrown) {
      const why = `Port ${PREVIEW_PORTS.first} didn't open for host-mode previews (${causeOf(thrown)}): free it, or set CAWCO_PREVIEW_PORTS to a range whose first port is free.`;
      previewFailed(HOP, null, why);
      return why;
    }
  };

  /** A port that would not open for a reason no other port avoids, in one sentence. */
  const portRefused = (port: number, thrown: unknown): PreviewRefusal =>
    new PreviewRefusal(
      503,
      `Preview port ${port} didn't open on ${hostname} (${causeOf(thrown)}).`,
      { cause: thrown }
    );

  /**
   * A machine artifact's listener on the port it keeps ({@link portFor}),
   * so its origin is the same one across the hub's restarts while the
   * origin that opened it lives: the port it keeps while that still opens,
   * else the lowest of the range no other origin holds, kept from then on.
   */
  const openEmbed = (
    key: string,
    owner: string
  ): { ancestors: Set<string>; listener: Listener; owner: string } => {
    portFor(key, (port) => {
      if (!unheld(port)) {
        return false;
      }
      try {
        embeds.set(key, {
          owner,
          ancestors: new Set<string>(),
          listener: listen(port, () => key, portLock),
        });
        return true;
      } catch (thrown) {
        if ((thrown as { code?: unknown }).code === "EADDRINUSE") {
          return false;
        }
        throw portRefused(port, thrown);
      }
    });
    const opened = embeds.get(key);
    if (!opened) {
      throw everyPortTaken();
    }
    return opened;
  };

  /**
   * Who may frame what origin `key` serves beside the dashboards: an embed's
   * page, on each exact origin it was served on ({@link embeds}); nobody for
   * any other origin.
   */
  const ancestorsOf = (key: string | undefined): string[] => [
    ...(key === undefined ? [] : (embeds.get(key)?.ancestors ?? [])),
  ];

  /**
   * The origin origin `owner`'s page was served on, read from where it was
   * reached: host mode's name for it, else its own port on the name the
   * browser used (a LAN address, the tailnet's name, its HTTPS twin, a
   * loopback). Null when `at` is neither.
   */
  const pageOrigin = (owner: string, at: URL): string | null => {
    const port = sessions.get(owner)?.port;
    if (port !== undefined && at.port === String(port)) {
      return at.origin;
    }
    if (hostPattern && port !== undefined) {
      return originFor(
        hostPattern,
        hostPattern.key === "port" ? port : labelOf(owner)
      );
    }
    return null;
  };

  /**
   * Each kept port is checked once ({@link holds}): one no origin holds
   * now lets it go; each session or project that holds one and has no
   * listener yet gets one on it (`bind`). A machine artifact's opens as a
   * frame names it ({@link openEmbed}): only its page knows who may frame it.
   */
  const bindKept = (): void => {
    letUnusedGo();
    for (const { key } of db.ports()) {
      if (!(sessions.has(key) || isEmbed(key))) {
        try {
          bind(key);
        } catch (thrown) {
          previewFailed(HOP, key, causeOf(thrown));
        }
      }
    }
  };

  /**
   * Every listener stopped, each one's connections closed, before the mode
   * changes: a machine artifact's too, which opens again on a port the new
   * mode allows as a frame next names it ({@link openEmbed}). One left
   * standing kept a port host mode's listener then binds beside it
   * (`reusePort`), and the kernel handed it half of that port's requests,
   * served with no lock.
   */
  const stopAll = async (): Promise<void> => {
    const stopping = [
      ...sessions.values(),
      ...[...embeds.values()].map((embed) => embed.listener),
      ...(byHost ? [byHost] : []),
    ].map((listener) => listener.stop());
    sessions.clear();
    embeds.clear();
    byHost = undefined;
    hostPattern = undefined;
    await Promise.all(stopping);
  };

  /**
   * A preview port as a process on the hub's own machine dials it: on the
   * listeners' bind address, loopback for a wildcard. Behind the lock like
   * every port: its caller enters with a session's ticket (server.ts, a
   * canvas's unseen screen, an artifact's picture).
   */
  const loopback = (port: number): string => {
    let host = hostname;
    if (hostname === "0.0.0.0") {
      host = "127.0.0.1";
    } else if (hostname === "::") {
      host = "[::1]";
    } else if (hostname.includes(":")) {
      host = `[${hostname}]`;
    }
    return `http://${host}:${port}`;
  };

  /**
   * Origin `key`'s address on `port`: the port, its tailnet origin while the
   * hub serves HTTPS there, and once host mode stands its whole origin,
   * named by its key or by that port.
   */
  const addressAt = (key: string, port: number): PreviewAddress => {
    const secure = tailnet.origin(port);
    const onTailnet = secure ? { tailnet: secure } : {};
    if (hostPattern) {
      const origin = originFor(
        hostPattern,
        hostPattern.key === "port" ? port : labelOf(key)
      );
      return { port, origin, ...onTailnet };
    }
    return { port, ...onTailnet };
  };

  return {
    /**
     * Starts what the stored mode serves: host mode's listener, then each
     * session's listener on the port it keeps, so a pane or a tab that loads
     * its preview origin straight after a hub restart finds it bound, before
     * any dashboard asks for its address. A kept port that is the fleet's
     * own, or host mode's, or that another process holds now, moves here
     * (`bind`).
     */
    start(): void {
      if (settings.mode === "host") {
        startHostMode();
      }
      bindKept();
    },

    /**
     * Session `instanceId`'s preview origin: its port, its listener started
     * when it has none; once host mode stands its whole origin too, named
     * by its id or by that port.
     */
    address(instanceId: string): PreviewAddress {
      return addressAt(instanceId, portOf(instanceId));
    },

    /**
     * Origin `key`'s address while its listener stands, none opened for it:
     * what a frame no one uses names ({@link holds}); null when it has none.
     */
    bound(key: string): PreviewAddress | null {
      const listener = sessions.get(key) ?? embeds.get(key)?.listener;
      return listener ? addressAt(key, listener.port) : null;
    },

    /** Whether origin `key` holds its port now ({@link holds}): a frame of it takes one. */
    holds,

    /**
     * Session `instanceId`'s origin as a process on the hub's own machine
     * dials it ({@link loopback}): a canvas's unseen screen (server.ts).
     */
    local(instanceId: string): string {
      return loopback(portOf(instanceId));
    },

    loopback,

    /**
     * An embedded preview's origin (`key`, {@link embedKey}) for origin
     * `owner`'s decision page (`pageAt`, where the browser reached it), or
     * for a session's own browser opening it at the top (`artifact_browse`,
     * no page): its listener on a free preview port of its own, started when
     * it has none, which the page's origin may frame; in host mode its whole
     * origin too, named by its key or port.
     */
    embed(key: string, owner: string, pageAt?: URL): PreviewAddress {
      const held = embeds.get(key) ?? openEmbed(key, owner);
      // The page that shows it, as the browser reached it: that exact origin may frame it.
      const framer = pageAt && pageOrigin(owner, pageAt);
      if (framer) {
        held.ancestors.add(framer);
      }
      return addressAt(key, held.listener.port);
    },

    /** The artifacts' origins origin `owner` (a session, a project) opened end with it, each letting its port go: their keys, so their machines' listeners stop too. */
    releaseEmbeds(owner: string): string[] {
      const gone = [...embeds]
        .filter(([, embed]) => embed.owner === owner)
        .map(([key]) => key);
      for (const key of gone) {
        release(key);
      }
      return gone;
    },

    /** The origin's owner ended (a session, a project): its listener stops and its port is free again. */
    release,

    /** Whether the hub reaches a preview origin's ping itself now ({@link reachOrigin}). */
    reach: reachOrigin,

    /**
     * Host mode's names as a browser's resolver takes them (Chromium's
     * `--host-resolver-rules` patterns: every name under the domain, and
     * the domain), with one name of theirs to resolve: null in port mode,
     * or while host mode doesn't stand.
     */
    names(): { patterns: string[]; sample: string } | null {
      if (!hostPattern) {
        return null;
      }
      return {
        patterns: [`*.${hostPattern.domain}`, hostPattern.domain],
        sample: sampleName(hostPattern),
      };
    },

    /**
     * Host mode's preview domain and the port its pattern names (443 when it
     * names none): with the preview range, where its names are served (core
     * hub-previews.ts). Null in port mode, or while host mode doesn't stand.
     */
    domain(): { name: string; port: number } | null {
      if (!hostPattern) {
        return null;
      }
      const named = PATTERN_PORT.exec(hostPattern.after)?.[1];
      return { name: hostPattern.domain, port: named ? Number(named) : 443 };
    },

    settings(): PreviewSettings {
      return settings.mode === "host"
        ? {
            mode: "host",
            pattern: settings.pattern ?? "",
            passDomain: hostPattern?.domain ?? "",
            ports: PREVIEW_PORTS_TEXT,
          }
        : { mode: "port", ports: PREVIEW_PORTS_TEXT };
    },

    /**
     * The fleet's mode, from the person's Settings or Caw's approved write.
     * Host mode takes a pattern of `https://` and a host name whose first
     * label holds one of `{session}` or `{port}`, under a domain a cookie may
     * be set on, whose generated name resolves; a refusal says why and
     * changes nothing.
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
        await stopAll();
        settings = { mode: "host", pattern };
        const failed = startHostMode();
        if (failed) {
          // Nothing changes: the mode before goes on as it was.
          settings = before;
          this.start();
          throw new PreviewRefusal(503, failed);
        }
        db.setSettings(settings);
        // Its sessions' own ports, which clients reached outside the
        // pattern's domain load (core `previewRoute`).
        bindKept();
        return this.settings();
      }
      await stopAll();
      settings = { mode: "port", pattern: null };
      db.setSettings(settings);
      this.start();
      return this.settings();
    },
  };
}

export type PreviewListeners = ReturnType<typeof createPreviewListeners>;
