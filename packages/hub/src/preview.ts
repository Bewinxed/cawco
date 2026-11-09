import { realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { ArtifactKind } from "@cawco/core/artifact-kinds";
import { readWithin } from "@cawco/core/bounded";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { detach } from "@cawco/core/detach";
import type { PreviewFrame } from "@cawco/core/frames";
import type { PageFaultReport } from "@cawco/core/page-faults";
import type { PreviewDown, PreviewSource } from "@cawco/core/preview/protocol";
import {
  type HubReach,
  PREVIEW_HELD_HEADER,
  PREVIEW_PING_HEADER,
  PREVIEW_REACH_PATH,
  type PreviewPingDown,
} from "@cawco/core/preview/reach";
import {
  DASHBOARD_COOKIE,
  OVERLAY_PATH,
  PREVIEW_ENTER_PATH,
  PREVIEW_ERRORS_PATH,
  PREVIEW_PING_PATH,
  type PreviewAddress,
  type PreviewSettings,
  previewEnterUrl,
} from "@cawco/core/preview/routes";
import type { MachineSource, Upstream } from "@cawco/core/preview/upstream";
import type { StageState } from "@cawco/core/stage";
import { isStreamRelayPort } from "@cawco/core/stream-relay";
import { MINUTE_MS, secondsOf } from "@cawco/core/time";
import { DOWN_WORDS } from "@cawco/core/words/preview-down";
import {
  type PortHolders,
  previewPortWords,
} from "@cawco/core/words/preview-ports";
import {
  asksUpgrade,
  cachePreview,
  causeOf,
  compressed,
  decodedHeaders,
  downOf,
  downResponse,
  errorWhy,
  folderKey,
  heldWhileServed,
  IMMUTABLE,
  injectOverlay,
  keyOverlay,
  notUpYet,
  OVERLAY_KEY,
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
} from "@cawco/preview/proxy";
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
import { takeErrorReport } from "./dashboard-errors";
import type { ArtifactRow } from "./db/artifacts";
import type { PreviewPassesDb } from "./db/preview-passes";
import { type PreviewsDb, projectOfOrigin } from "./db/previews";
import { decisionHostFile } from "./decision-host";
import { DECISION_ASSETS } from "./decision-program";
import {
  enter,
  lockedResponse,
  type PassLock,
  passOf,
  SESSION_PASS_MS,
  sessionTicketScope,
} from "./preview-access";
import {
  type HostPattern,
  hostFor,
  labelOf,
  originFor,
  PORT_SUFFIX,
  PreviewRefusal,
  parsePattern,
} from "./preview-hosts";
import { isEmbed } from "./preview-origin";
import { FolderRefusal, folderPath } from "./project-folder";
import { asReached, type TailnetHttpsService } from "./tailnet-https";

/**
 * What a session's panel shows: its artifact, and which open of it this is.
 * The operator's intent, kept in the database (`shown_previews`) so it
 * outlives the hub too; only a close, or the session ending, ends it. What
 * serves it is never kept here: a frame reads its source off the
 * artifact's row as it is published, and a machine's preview is served on
 * its artifact's own origin, whose upstream follows the row
 * (preview-service.ts). Every preview is an origin of its own, never the
 * dashboard's: a port of the hub's range, and in host mode a host name on
 * the first port too. So a previewed app keeps its own storage and
 * cookies, routes by its own paths at the root, and two previews open at
 * once never cross.
 */
export interface PreviewTarget {
  /** The artifact the panel shows (Projects spec §5.10). */
  artifact: PreviewFrame["artifact"];
  revision: string;
}

/**
 * What each session's panel shows, by instance id: every key is a session's,
 * so the board and the panel's frames read it as one. A page the hub
 * serves stands at the session's origin's root too (the apps load it
 * there); a machine's preview is served on its artifact's own origin alone
 * ({@link embedKey}), never the session's, so whatever the panel shows
 * next, a frame of it keeps its own content.
 */
export const previewTargets = new Map<string, PreviewTarget>();

/** An artifact as its panel's frame names it: its title, the head's name, and its ask, the head's line under it, when it has one. */
export const shownArtifact = (
  row: Pick<ArtifactRow, "ask" | "id" | "kind" | "name" | "title">
): PreviewFrame["artifact"] => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  title: row.title,
  ...(row.ask ? { ask: row.ask } : {}),
});
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

/** Where a machine's preview is served now, or the hop that failed and why (preview-service.ts `reach`). */
export type PreviewReach =
  | { ok: true; upstream: Upstream }
  | { ok: false; down: PreviewDown; error: string };

/** A machine artifact's row: one a machine serves (a port or a folder), never a page the hub serves itself. */
export type MachineRow = ArtifactRow & {
  machineId: string;
  source: MachineSource;
};

/** Whether a machine serves artifact `row` ({@link MachineRow}). */
export const servedByMachine = (row: ArtifactRow): row is MachineRow =>
  row.machineId !== null && !("page" in row.source);

export function previewFrame(
  instanceId: string,
  state: "open" | "closed",
  target: PreviewTarget,
  /** What serves it, as its row names it now; none once the row is gone. */
  source: PreviewSource | undefined,
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
    ...(source ? { source } : {}),
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

/** A machine artifact's listener ({@link createPreviewListeners}' `embeds`), and the origins that may frame it. */
interface Embed {
  ancestors: Set<string>;
  listener: Listener;
}

const isArtifact = (
  socket: ServerWebSocket<ListenerSocket>
): socket is ServerWebSocket<ArtifactSocket> => "artifactId" in socket.data;

/** What a listener needs of the hub to serve a session's previews and artifacts. */
export interface PreviewListenerDeps {
  /** The artifact whose row points at artifact origin `key` now (schema.ts `artifacts.origin`); undefined for any other origin, or one no row points at. */
  artifactAt: (key: string) => string | undefined;
  /** A Diagram of a decision page opened as a canvas in its session's panel (`/canvas`). */
  canvasFrom: (
    request: Request,
    instanceId: string,
    artifactId: string
  ) => Promise<Response>;
  /**
   * Whether a screen follows session `instanceId`'s conversation now, so
   * its panel stands on that screen. Whether its process runs is no use of
   * a preview port: an origin no screen shows gives its port back
   * ({@link createPreviewListeners}' `reclaimOne`).
   */
  followed: (instanceId: string) => boolean;
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
  /** A fault a page met as it drew (core page-faults.ts), reported by its overlay on an origin that serves its artifact: kept for `artifact_read`. */
  pageFault: (report: PageFaultReport) => void;
  picture: ReturnType<typeof artifactPicture>;
  /** The page's pictures of the person's marks, held for their delivery. */
  pictures: ReturnType<typeof artifactPictures>;
  /**
   * A decision page's program: its hash (the page's, for the overlay) and
   * what its head carries as it is served: its faces' preloads
   * (decision-program.ts `FACE_PRELOADS`), and the script tags naming what
   * the artifacts its Canvas and Preview pieces
   * show are now, an embedded preview's address built from where the page
   * was reached (`reachedAt`), and its pictures' sizes
   * (artifacts/page-pictures.ts); null for any other page.
   */
  program: (
    artifactId: string,
    reachedAt: URL
  ) => { hash: string; media: string } | null;
  /** Where machine artifact `row`'s preview is served now, its machine's listener started for what the row names when none is (preview-service.ts `reach`). */
  reach: (row: MachineRow) => Promise<PreviewReach>;
  /**
   * The artifact origin `key` shows now, read off its row as it stands:
   * an artifact's own origin's ({@link embedKey}) the row that points at
   * it (schema.ts `artifacts.origin`), so the address it was handed under
   * answers for as long as the artifact lasts; a session's, its panel's
   * artifact. Undefined when nothing does.
   */
  rowAt: (key: string) => ArtifactRow | undefined;
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
  socket: ReturnType<typeof artifactSocket>;
  /** Artifact `artifactId`'s stage answered its page through the relay (core `PREVIEW_SERVED_HEADER`): it is reachable. */
  stageAnswered: (artifactId: string) => void;
  /** The machine's listener at `upstream` refused a connection: the next request reaches the preview again. */
  unreachable: (key: string, upstream: Upstream) => void;
  /** Where machine artifact `row`'s preview is served now, when a listener started for what the row names serves it; undefined while none does (preview-service.ts `upstreamOf`). */
  upstream: (row: MachineRow) => Upstream | undefined;
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
  "access-control-expose-headers": `${PREVIEW_PING_HEADER}, ${PREVIEW_HELD_HEADER}`,
  "cache-control": "no-store",
  [PREVIEW_PING_HEADER]: "1",
} as const;

/** The dashboard's probe: answered to any page, with no credentials, so the pane learns the origin is reachable; with how long its server has held the page's oldest request, as its machine's listener said it (core `PREVIEW_HELD_HEADER`). */
const ping = (held?: string | null): Response =>
  new Response("ok", {
    headers: {
      ...PING_HEADERS,
      "content-type": "text/plain",
      ...(held ? { [PREVIEW_HELD_HEADER]: held } : {}),
    },
  });

/**
 * The probe's answer when what serves the page doesn't answer the hub: why
 * in the hub's words, which the pane says (core `PreviewPingDown`). A 200:
 * the origin answered, and a browser logs every error status a page's fetch
 * meets in its console, so a pane holding a preview that is down would fill
 * the person's console at each of its probes.
 */
const pingDown = (why: string, down?: PreviewDown): Response =>
  Response.json({ why, ...(down ? { down } : {}) } satisfies PreviewPingDown, {
    headers: PING_HEADERS,
  });

/** A sentence's last stop: the pane's words put their own after `why` (core `previewUnreachedWords`). */
const TRAILING_STOP = /\.$/u;

/** How long the machine's listener has to answer the ping's relay. Our call: under the pane's own 10 s for the whole probe. */
const PING_RELAY_MS = 5000;

/** How often an origin's use is written to its port row at most (`used`): the reclaim's order needs no finer grain. Our call. */
const USE_WRITE_MS = MINUTE_MS;
/**
 * How long a port an origin let go stays held for its stale addresses
 * (createPreviewListeners' `holdVacant`): a session's pass ticket's life
 * (preview-access.ts `SESSION_PASS_MS`), the longest an `artifact_browse`
 * url can still be entered, which a tab kept open past it outlives only
 * on a reload. Past it, the port is free for any program.
 */
const VACANT_HOLD_MS = SESSION_PASS_MS;

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
  // A session's or a project's origin serves only what the hub holds: a
  // machine's preview answers on its artifact's own origin.
  const row = isEmbed(instanceId) ? deps.rowAt(instanceId) : undefined;
  if (!(row && servedByMachine(row))) {
    return ping();
  }
  const reached = await deps.reach(row);
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
      return ping(read.value.headers.get(PREVIEW_HELD_HEADER));
    }
    // The listener answered as a load would be met: the down page it names,
    // in the machine's words, else the hop's (the pane adds the stop).
    const said = downOf(await read.value.text());
    const words = said
      ? (said.why ?? DOWN_WORDS[said.down])
      : `its machine's listener answered ${read.value.status}`;
    return pingDown(words.replace(TRAILING_STOP, ""), said?.down);
  } catch (error) {
    return failed(causeOf(error), codeOf(error));
  }
}

/**
 * A preview no panel shows, loaded once through its machine's listener `at`
 * as a pane's load is (a sleeping stage or served server wakes for it): null
 * when nothing stands in its way, else what failed and why, as CawCo's own
 * down page names it (`downOf`): a hop that didn't answer, or `error`, a page
 * its server answered with an error status (4xx, 5xx, as a render that
 * throws answers 500), which the machine's listener answers with CawCo's
 * page when it has nothing to draw (core `errorPageResponse`) and serves
 * as the page when it is HTML, its why said here the same way (core
 * `errorWhy`). A
 * page with no answer within `waitMs` is a server still making it (a first
 * compile, a build holding its event loop), and no failure: a served server
 * is up once its port listens, however long its pages take (agent stage.ts
 * `listens`). The listener's own ping then says whether the way to the server
 * stands, so `machine` is said only of a listener that answers neither.
 */
export async function loadedOnce(
  at: Upstream,
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
      return { status: answer.status, body: await answer.text() };
    });
    if (page.kind === "answered") {
      const { status, body } = page.value;
      // An HTML error page the listener served as the page (a render that
      // throws answers 500 with its own): no page to hand up all the same.
      return (
        said(body) ??
        (status >= 400
          ? { failure: "error", why: errorWhy(status, body) }
          : null)
      );
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
          why: `its listener didn't answer the hub within ${secondsOf(pinged.after)} s`,
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
  at: Upstream,
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
    if (
      deps.servedOn(artifactId, instanceId) &&
      deps.kindOf(artifactId) === "canvas"
    ) {
      return serveCanvas(artifactId, rest, deps.seed, embed);
    }
    return new Response("This session has no such canvas.", { status: 404 });
  }
  const paged = pathname.match(PAGE_PATH);
  if (paged) {
    const [, artifactId, rest] = paged;
    if (
      deps.servedOn(artifactId, instanceId) &&
      deps.kindOf(artifactId) === "page"
    ) {
      return servePage(
        artifactId,
        rest,
        deps,
        url,
        `/__cawco/page/${artifactId}/`
      );
    }
    return new Response("This origin serves no such page.", { status: 404 });
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
  if (pathname === PREVIEW_ERRORS_PATH) {
    // A fault is kept only for an artifact this origin serves.
    return takeErrorReport(request, (report) => {
      if (deps.servedOn(report.artifact, instanceId)) {
        deps.pageFault(report);
      }
    });
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
  const row = deps.rowAt(instanceId);
  if (!row) {
    previewFailed(
      HOP,
      instanceId,
      `its session shows no preview at ${pathname}`
    );
    return downResponse("closed", 404);
  }
  if (row.kind === "browser") {
    return new Response(
      "A browser is drawn by its panel from its stream; no page serves it.",
      { status: 404 }
    );
  }
  if ("page" in row.source && row.kind !== "component") {
    // A project's page is served on its project's origin alone, at its own
    // address there (`/__cawco/page/<id>/`): its frame names that origin.
    if (!deps.servedOn(row.id, instanceId)) {
      previewFailed(HOP, instanceId, "its page is its project's origin's");
      return downResponse("closed", 404);
    }
    return HUB_SERVES[row.kind](row.id, pathname, deps, url);
  }
  // A machine's preview is served on its artifact's own origin alone
  // (embedKey): the session's panel names that origin, never this one.
  if (!(isEmbed(instanceId) && servedByMachine(row))) {
    previewFailed(
      HOP,
      instanceId,
      "its machine's preview is on its own origin"
    );
    return downResponse("closed", 404);
  }
  return serveMachine(request, server, instanceId, row, deps, direct);
}

/**
 * A machine's preview, on its artifact's own origin: relayed to the
 * machine's listener, which is started when none serves it. A page's
 * request waits for it (and for its stage's wake beyond, on the machine); a
 * socket is refused at once until it serves (core `notUpYet`).
 */
async function serveMachine(
  request: Request,
  server: Server<ListenerSocket>,
  instanceId: string,
  row: MachineRow,
  deps: PreviewListenerDeps,
  direct: boolean
): Promise<Response | undefined> {
  // A socket before a listener for what the row names serves it is refused
  // at once, the listener started and not waited on (core `notUpYet`).
  if (asksUpgrade(request) && !deps.upstream(row)) {
    deps.reach(row).catch(() => undefined);
    return notUpYet();
  }
  // A page's request waits on the machine: a listener started, its stage's
  // wake, the server's first answer.
  heldWhileServed(server, request);
  // No listener serves what the row names now (its machine restarted, the
  // last start failed, or the row moved to another source): started here,
  // or the hop that failed says why.
  const reached = await deps.reach(row);
  if (!reached.ok) {
    previewFailed(HOP, instanceId, `${reached.down}: ${reached.error}`);
    return downResponse(
      reached.down,
      reached.down === "closed" ? 404 : 503,
      reached.down === "reach" ? reached.error : undefined
    );
  }
  // A canvas's stage answering its page is the stage reached again.
  return relay(
    request,
    server,
    instanceId,
    reached.upstream,
    deps,
    direct,
    row.kind === "component" ? () => deps.stageAnswered(row.id) : undefined
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
/** An origin whose session or project the hub no longer holds: let go, and said, never kept. */
const ownerGone = (key: string): PreviewRefusal =>
  new PreviewRefusal(
    409,
    `No session or project holds the preview origin ${key} now, so it serves nothing.`
  );
/** The port a host pattern's name ends in (`HostPattern.after`), when it names one. */
const PATTERN_PORT = /:(\d+)$/u;
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

/** How often host mode tries its port again while another listener holds it at start, ms. Our call: a hub restart lets go of its ports within a second or two. */
const HOST_RETRY_MS = 2000;

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
  tailnet: Pick<TailnetHttpsService, "beside" | "origin">,
  {
    listens,
    after,
  }: {
    /** False for a hub built only to be read (server.ts `serves`): it opens no listener, and every ask for an origin's port is refused. */
    listens: boolean;
    /** Runs `run` once after `ms`, on the hub's lifetime (lifetime.ts `after`): host mode's next try at a port held at start. */
    after: (ms: number, run: () => void) => void;
  }
) {
  const proxy = previewWebSocket as unknown as WebSocketHandler<ListenerSocket>;
  /**
   * Throws, in one sentence, when this hub opens no listener ({@link listens}):
   * asked before every bind and before any port is moved or taken back.
   */
  const mayListen = (): void => {
    if (!listens) {
      throw new PreviewRefusal(
        503,
        "This hub opens no preview listener: it was built only to be read."
      );
    }
  };
  /**
   * Each origin's open sockets, by its key: a frame that shows it holds one
   * while it stands (its overlay's doc link, which keeps itself open: core
   * doc-link.ts; a previewed app's own), so an origin a screen shows is in
   * use, as a stage counts its viewers by its sockets (agent stage.ts).
   */
  const viewers = new Map<string, number>();
  /**
   * When this hub process last wrote each origin's use, by its key: a write
   * throttle alone. The use itself is its port row's (`used_at`), which
   * orders a full range's reclaim ({@link reclaimOne}) across restarts.
   */
  const usedWritten = new Map<string, number>();
  /**
   * Origin `key` was used (a request, a socket opened or closed): its port
   * row's `used_at` written, at most once a minute ({@link USE_WRITE_MS}).
   */
  const used = (key: string): void => {
    const now = Date.now();
    if (now - (usedWritten.get(key) ?? 0) < USE_WRITE_MS) {
      return;
    }
    usedWritten.set(key, now);
    db.used(key, new Date(now));
  };
  const viewed = (socket: ServerWebSocket<ListenerSocket>, by: 1 | -1) => {
    const { data } = socket;
    const key = "artifactId" in data ? data.at : data.instanceId;
    if (key) {
      used(key);
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
        ? deps.socket.close(socket, code)
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
    mayListen();
    const serve = async (
      request: Request,
      server: Server<ListenerSocket>
    ): Promise<Response | undefined> => {
      const instanceId = route(request);
      if (instanceId) {
        used(instanceId);
      }
      const moved = movedOn(request, lock, instanceId);
      if (moved) {
        return moved;
      }
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
    /**
     * Each request's answer, and a socket refused said in the hub's log: a
     * browser reports any refused upgrade as a close with code 1006 and no
     * status, so the page's "closed (code 1006)" says nothing of which door
     * turned it away (the lock's 401, `joinArtifact`'s 404 or 409, a failed
     * upgrade's 400). The line names the origin, the path and the status.
     */
    const fetch = async (
      request: Request,
      server: Server<ListenerSocket>
    ): Promise<Response | undefined> => {
      const answered = await serve(request, server);
      if (
        answered &&
        request.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        previewFailed(
          HOP,
          route(request),
          `its socket at ${new URL(request.url).pathname} was refused (${answered.status})`
        );
      }
      return answered;
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
   * Where origin `key` stands now, as a browser that reached `at` reaches
   * it: host mode's name for it when `at` was one of the names, else its
   * port on the host `at` named. Its listener is opened when it has none;
   * throws as {@link portFor} does.
   */
  const standsAt = (key: string, at: URL, lock: PassLock): string => {
    const port = isEmbed(key)
      ? (embeds.get(key) ?? openEmbed(key)).listener.port
      : portOf(key);
    if (lock.domain !== null && hostPattern) {
      return originFor(
        hostPattern,
        hostPattern.key === "port" ? port : labelOf(key)
      );
    }
    return `${at.protocol}//${at.hostname}:${port}`;
  };

  /**
   * A browser at an address that went stale, its origin's port moved on
   * ({@link reclaimOne}) to another origin or to none ({@link vacant}),
   * sent on to where it stands now, as every outside link goes:
   *
   * - a tab (`Sec-Fetch-Dest: document`) at a page's or a canvas's
   *   address on an origin that doesn't serve it: the person's pass to the
   *   artifact's own tab on the dashboard (`/artifact/<id>`), on the
   *   dashboard origin this browser reached the same host by; a session's
   *   pass that opens the artifact's origin (`artifact_browse`) to that
   *   origin where it stands now, the same path, its pass carried there
   *   (a port's pass is set on its host, a name's on the names' domain);
   * - an entry with a session's ticket on a port of none of its origins
   *   (an `artifact_browse` url loaded after the port moved): the ticket,
   *   unspent, to the entry where its first origin, the artifact's own,
   *   stands now.
   *
   * A frame's load is no tab's: a frame's origin is told to it again
   * (server.ts `letGo`), and no dashboard is framed. Null for anything
   * else, which the lock and the origin answer as before.
   */
  const movedOn = (
    request: Request,
    lock: PassLock,
    key: string | undefined
  ): Response | null => {
    const url = new URL(request.url);
    try {
      if (url.pathname === PREVIEW_ENTER_PATH) {
        return staleEntry(url, lock, key);
      }
      return request.headers.get("sec-fetch-dest") === "document"
        ? staleTab(request, url, lock, key)
        : null;
    } catch (thrown) {
      // Its origin can't open now (its owner gone, every port in use): the
      // lock and this origin answer it as before.
      previewFailed(
        HOP,
        key ?? null,
        `a stale address stays: ${causeOf(thrown)}`
      );
      return null;
    }
  };

  /** An entry with a session's ticket on a port of none of its origins, sent on to its first origin's entry ({@link movedOn}). */
  const staleEntry = (
    url: URL,
    lock: PassLock,
    key: string | undefined
  ): Response | null => {
    const ticket = url.searchParams.get("ticket") ?? "";
    const scope = sessionTicketScope(ticket);
    const [own] = scope ?? [];
    if (!own || (key !== undefined && scope?.includes(key))) {
      return null;
    }
    const next = url.searchParams.get("next");
    return Response.redirect(
      previewEnterUrl(
        standsAt(own, url, lock),
        ticket,
        next === null ? undefined : next
      ),
      302
    );
  };

  /** A tab at a page's or a canvas's address on an origin that doesn't serve it, sent on by its pass ({@link movedOn}). */
  const staleTab = (
    request: Request,
    url: URL,
    lock: PassLock,
    key: string | undefined
  ): Response | null => {
    const paged = url.pathname.match(PAGE_PATH);
    const drawn = paged ? null : url.pathname.match(CANVAS_PATH);
    const artifactId = (paged ?? drawn)?.[1];
    if (
      !artifactId ||
      deps.kindOf(artifactId) !== (paged ? "page" : "canvas") ||
      (key !== undefined && deps.servedOn(artifactId, key))
    ) {
      return null;
    }
    if (passOf(request, lock, undefined)) {
      const dashboards = previewParents();
      const dashboard =
        dashboards.find((one) => new URL(one).hostname === url.hostname) ??
        dashboards[0];
      return dashboard
        ? Response.redirect(
            `${dashboard}/artifact/${encodeURIComponent(artifactId)}`,
            302
          )
        : null;
    }
    const origin = deps.originOf(artifactId);
    return origin && passOf(request, lock, origin)
      ? Response.redirect(
          `${standsAt(origin, url, lock)}${url.pathname}${url.search}`,
          302
        )
      : null;
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
    mayListen();
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
   * frame next names it, after a mode change or a restart too), by its key,
   * with every origin a page that shows it was served on: exactly those may
   * frame it. It lasts as long as its origin (schema.ts
   * `artifacts.origin`), whichever row points at it and whoever opened it.
   */
  const embeds = new Map<string, Embed>();
  /** Host mode's one listener. */
  let byHost: Listener | undefined;
  /**
   * Each port an origin of this hub served and let go ({@link release}),
   * held a while: a stale address there (a tab, or an `artifact_browse` url
   * kept from before its origin ended or moved) is answered as one on
   * another origin's port is ({@link movedOn}), not with the browser's
   * connection error. Only a port the hub handed out is ever held: one it
   * never gave a preview stays free for any program the person runs (the
   * release proof's systemd socket on 43458, inside its hub's range, failed
   * to start when every free port was held, a4df55bbc).
   *
   * A held port can't stand down for another program: nothing tells a
   * listener that another bind was refused (a plain bind just fails
   * EADDRINUSE; `reusePort` would split its connections, not hand the port
   * over). So the hold is bounded: {@link VACANT_HOLD_MS}, then the port is
   * free. Let go at once when an origin takes it ({@link takeVacant}).
   */
  const vacant = new Map<number, Listener>();

  /** Port `port`, which an origin served until now, held for {@link VACANT_HOLD_MS} while no origin and no other program has it. */
  const holdVacant = (port: number): void => {
    if (
      !listens ||
      vacant.has(port) ||
      barred(port) ||
      db.ports().some((row) => row.port === port) ||
      [...embeds.values()].some((embed) => embed.listener.port === port)
    ) {
      return;
    }
    try {
      if (!unheld(port)) {
        return;
      }
      const held = listen(port, () => undefined, portLock);
      vacant.set(port, held);
      after(VACANT_HOLD_MS, () => {
        if (vacant.get(port) === held) {
          takeVacant(port);
        }
      });
    } catch (thrown) {
      previewFailed(HOP, null, `port ${port} wasn't held: ${causeOf(thrown)}`);
    }
  };

  /** Port `port` let go by the hub, for an origin to bind: its socket closes as `stop` is called, its connections after. */
  const takeVacant = (port: number): void => {
    const held = vacant.get(port);
    if (held) {
      vacant.delete(port);
      detach(held.stop(), "vacant preview port let go");
    }
  };

  /**
   * Serves `instanceId` on `port`: false when another process holds it
   * (EADDRINUSE). Any other refusal is the bind address's, not the port's,
   * so no other port would open either: it is thrown, in one sentence.
   */
  const serveOn = (instanceId: string, port: number): boolean => {
    takeVacant(port);
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
   * Whether a screen shows origin `key` through a session's panel it
   * follows: a session's own origin while a screen follows the session; an
   * artifact's while a followed session's panel shows that artifact. A
   * project's origin no panel keeps: a frame of it does, or nothing. A
   * session that runs keeps nothing: a port belongs to what a screen shows
   * (decisions/preview-lifetime: the address follows the artifact's record,
   * so the next show opens it on a free port and says that address). Kept
   * for running sessions, 96 artifacts of the fleet's idle sessions held
   * the whole range and no show could open (2026-11-05).
   */
  const panelShows = (key: string): boolean => {
    if (projectOfOrigin(key) !== null) {
      return false;
    }
    if (!isEmbed(key)) {
      return deps.followed(key);
    }
    const artifactId = deps.artifactAt(key);
    return (
      artifactId !== undefined &&
      [...previewTargets].some(
        ([instanceId, target]) =>
          target.artifact.id === artifactId && deps.followed(instanceId)
      )
    );
  };

  /** Whether origin `key` is in use now: a frame of it open on a screen ({@link viewers}), or a panel a screen follows shows it ({@link panelShows}). */
  const inUse = (key: string): boolean => viewers.has(key) || panelShows(key);

  /**
   * Whether origin `key`'s address is told to every screen that shows it
   * (artifact-pages.ts `toldAddress`): its owner (the session, the project, the
   * artifact) is a row, and it is in use ({@link inUse}) or is a project's
   * that still keeps its stored port. Every origin keeps the port it stores
   * until the range is full and it is the one least recently used that
   * nothing uses now ({@link reclaimOne}), as Portless keeps a route only
   * while its process is alive (github.com/vercel-labs/portless, routes.ts
   * `loadRoutes`). A project's origin whose port was taken back holds none:
   * told again, it is told without one, and opens again only when a screen
   * asks for it. Held regardless, the telling took a port back for it,
   * whose origin's telling took one back in turn, each in a microtask
   * (server.ts `letGo`): two idle project origins on a full range traded
   * one port forever and the hub never answered again (nightly 0e08f76f8's
   * live-database check, 2026-11-04).
   */
  const holds = (key: string): boolean =>
    db.ownerHeld(key) &&
    (inUse(key) ||
      (projectOfOrigin(key) !== null &&
        db.ports().some((row) => row.key === key)));

  /**
   * One port taken back for origin `asking`, the range being full: from
   * the origin least recently used (`used_at`, db previews.ts
   * `portsByUse`) of those no screen shows ({@link inUse}), a running
   * session's among them; one whose owner went first. Its listener stops,
   * its stored port is dropped, and what shows it is told again without that
   * address: the next ask for it opens it on a free port, and says that
   * address (`letGo`). Every other origin keeps its port, and so its
   * address. The key that let its port go; undefined when every port is in
   * use.
   */
  const reclaimOne = (asking: string): string | undefined => {
    const idle = db
      .portsByUse()
      .map((row) => row.key)
      .filter((one) => one !== asking && !inUse(one));
    const taken = idle.find((one) => !db.ownerHeld(one)) ?? idle[0];
    if (taken === undefined) {
      return;
    }
    release(taken);
    deps.letGo([taken]);
    return taken;
  };

  /**
   * The one way a session gets its port, at the hub's start and on demand:
   * the port it keeps while that is still a preview port and `opens`; else
   * the lowest of the range that is not the fleet's own, not another
   * origin's, and opens; else, the range being full, the lowest that opens
   * once an origin that doesn't hold its port let it go, one at a time
   * ({@link reclaimOne}). A move is saved, so a collision heals itself, and
   * said in one line. Its listener opens on it (`bind`), and host mode's
   * `{port}` names it too.
   */
  const portFor = (
    instanceId: string,
    opens: (port: number) => boolean
  ): number => {
    mayListen();
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
    let port = firstOpen(new Set(held.map((row) => row.port)), opens);
    while (port === undefined && reclaimOne(instanceId) !== undefined) {
      port = firstOpen(new Set(db.ports().map((row) => row.port)), opens);
    }
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
   * Every port of the range is in use, each by an origin a screen shows or
   * another program: said with how many each, and what frees one (core
   * words/preview-ports.ts).
   */
  const everyPortTaken = (): PreviewRefusal =>
    new PreviewRefusal(
      503,
      previewPortWords.everyPortTaken(PREVIEW_PORTS_TEXT, portHolders())
    );

  /** What keeps each port of the range, the barred left out: a screen that shows its origin ({@link inUse}), else another program on the hub's machine. */
  const portHolders = (): PortHolders => {
    const keys = new Map(db.ports().map((row) => [row.port, row.key]));
    const count = { others: 0, screens: 0 };
    for (
      let port = PREVIEW_PORTS.first;
      port <= PREVIEW_PORTS.last;
      port += 1
    ) {
      if (barred(port)) {
        continue;
      }
      const key = keys.get(port);
      if (key !== undefined && inUse(key)) {
        count.screens += 1;
      } else {
        count.others += 1;
      }
    }
    return count;
  };

  /** Origin `key`'s listener stops and its port is free again, held by the hub a while for a stale address of it ({@link holdVacant}). */
  const release = (key: string): void => {
    const listener = sessions.get(key) ?? embeds.get(key)?.listener;
    if (listener) {
      // Its port answers a stale address of it from then on.
      detach(
        listener.stop().then(() => holdVacant(listener.port)),
        "preview listener stop"
      );
    }
    sessions.delete(key);
    embeds.delete(key);
    viewers.delete(key);
    usedWritten.delete(key);
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

  /**
   * Host mode's listener on the range's first port; why it didn't open, and
   * whether only another listener holding the port stopped it (`held`), or
   * null.
   */
  const startHostMode = (): { held: boolean; why: string } | null => {
    let pattern: HostPattern;
    try {
      pattern = parsePattern(settings.pattern ?? "");
    } catch (thrown) {
      const why = `The stored host pattern ${JSON.stringify(settings.pattern)} isn't one: ${causeOf(thrown)}`;
      previewFailed(HOP, null, why);
      return { held: false, why };
    }
    const fleet =
      FLEET_PORTS.get(PREVIEW_PORTS.first) ??
      (isStreamRelayPort(PREVIEW_PORTS.first) ? "the stream relay's" : null);
    if (fleet) {
      const why = `Port ${PREVIEW_PORTS.first} is ${fleet} port, so host-mode previews can't take it: set CAWCO_PREVIEW_PORTS to a range whose first port is free.`;
      previewFailed(HOP, null, why);
      return { held: false, why };
    }
    try {
      // Its listener binds with `reusePort`, which succeeds beside any other
      // socket bound the same way, and that one would take a share of the
      // names' requests past the lock: host mode opens only on a port
      // nothing holds.
      if (!unheld(PREVIEW_PORTS.first)) {
        const why = `Port ${PREVIEW_PORTS.first} is held by another listener, so host-mode previews can't take it: free it, or set CAWCO_PREVIEW_PORTS to a range whose first port is free.`;
        previewFailed(HOP, null, why);
        return { held: true, why };
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
      return { held: false, why };
    }
  };

  /**
   * Host mode's listener opened at start, and again every
   * {@link HOST_RETRY_MS} while another listener holds its port: a hub
   * started as the one before it still lets go of the port (every nightly
   * restarts it) opens host mode once the port is free, rather than leaving
   * every name refused until the next restart. A mode changed meanwhile
   * stops the tries.
   */
  const hostModeOnceFree = (): void => {
    const failed = startHostMode();
    if (!failed?.held) {
      return;
    }
    const { pattern } = settings;
    after(HOST_RETRY_MS, () => {
      if (settings.mode === "host" && settings.pattern === pattern && !byHost) {
        hostModeOnceFree();
      }
    });
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
   * so its origin is the same one across the hub's restarts while its
   * artifact lasts ({@link holds}): the port it keeps while that still opens,
   * else the lowest of the range no other origin holds, kept from then on.
   */
  const openEmbed = (key: string): Embed => {
    portFor(key, (port) => {
      takeVacant(port);
      if (!unheld(port)) {
        return false;
      }
      try {
        embeds.set(key, {
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
   * Each kept port is bound again: every session, project or machine
   * artifact that keeps one and has no listener yet gets one on it
   * (`bind`, {@link openEmbed}), so the address it was handed under answers
   * again; a decision page that frames it names its own origin as it loads.
   * One whose owner went (an artifact deleted while the hub was down, whose
   * port row no key holds) lets it go.
   */
  const bindKept = (): void => {
    for (const { key } of db.ports()) {
      if (!db.ownerHeld(key)) {
        db.dropPort(key);
        continue;
      }
      if (sessions.has(key) || embeds.has(key)) {
        continue;
      }
      try {
        if (isEmbed(key)) {
          openEmbed(key);
        } else {
          bind(key);
        }
      } catch (thrown) {
        previewFailed(HOP, key, causeOf(thrown));
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
      ...vacant.values(),
      ...(byHost ? [byHost] : []),
    ].map((listener) => listener.stop());
    sessions.clear();
    embeds.clear();
    vacant.clear();
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
        hostModeOnceFree();
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

    /** Whether origin `key` is in use now ({@link inUse}): a screen shows it. */
    inUse,

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
      const held = embeds.get(key) ?? openEmbed(key);
      // The page that shows it, as the browser reached it: that exact origin may frame it.
      const framer = pageAt && pageOrigin(owner, pageAt);
      if (framer) {
        held.ancestors.add(framer);
      }
      return addressAt(key, held.listener.port);
    },

    /** The origin's owner ended (a session, a project, an artifact): its listener stops and its port is free again ({@link release}). */
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
          throw new PreviewRefusal(503, failed.why);
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
