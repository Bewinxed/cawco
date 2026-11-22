/**
 * One request to a preview origin, answered by the preview server: the
 * dashboard's ping, the lock (preview-access.ts), a page's document and its
 * files, the decision and file viewer hosts' files, a canvas's host page,
 * and a machine's preview relayed to its listener, each answer framed for
 * the dashboards, its overlay tag keyed, and gzipped. What only the hub
 * answers (an entry, which writes a pass; an artifact's doc socket and its
 * Send, picture, pictures and canvas; a page's shape; a page's fault report)
 * is relayed to the hub as the browser sent it (wire.ts `ORIGIN_PATH`,
 * `SYNC_PATH`). Nothing a page's own open needs waits on the hub, but a
 * machine's preview's first request since this server started (the hub
 * starts its listener on the machine) and a page's document the hub hasn't
 * built yet.
 */
import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { errnoCode } from "@cawco/core/absent";
import { readWithin } from "@cawco/core/bounded";
import { FILE_VIEWER_ASSETS, fileViewerFile } from "@cawco/core/file-viewer";
import type { PreviewDown } from "@cawco/core/preview/protocol";
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
} from "@cawco/core/preview/routes";
import { sourceKeyOf, type Upstream } from "@cawco/core/preview/upstream";
import { htmlDesignOf, CANVAS_PATH as STAGE_PATH } from "@cawco/core/stage";
import { DOWN_WORDS } from "@cawco/core/words/preview-down";
import {
  asksUpgrade,
  cachePreview,
  causeOf,
  compressed,
  decodedHeaders,
  downOf,
  downResponse,
  heldWhileServed,
  IMMUTABLE,
  injectOverlay,
  keyedOverlayPath,
  keyOverlay,
  loadDesignStage,
  notUpYet,
  OVERLAY_KEY,
  overlayResponse,
  type PreviewSocket,
  previewFailed,
  proxyHeaders,
  RELAY_HEADER,
  upgradePreview,
  versionedFile,
} from "@cawco/preview/proxy";
import type { Server } from "bun";
import { ElysiaStatus } from "elysia";
import { serveCanvas } from "../artifacts/canvas";
import { ARTIFACT_PATH } from "../artifacts/sync";
import { ARTIFACTS_ROOT, PREVIEW_PORTS_TEXT } from "../config";
import type { ArtifactDocumentRow } from "../db/artifact-documents";
import { decisionHostFile } from "../decision-host";
import { DECISION_ASSETS } from "../decision-program";
import { lockedResponse, type PassCheck, passOf } from "../preview-access";
import { type HostPattern, labelOf, originFor } from "../preview-hosts";
import { type MachineRow, servedByMachine } from "../preview-machine";
import { HOP, isEmbed } from "../preview-origin";
import {
  CANVAS_PATH,
  hubsOwn,
  PAGE_PATH,
  PAGE_SHAPE_PATH,
} from "../preview-paths";
import { reachOrigin } from "../preview-reach-origin";
import type { PreviewStop } from "../preview-stops";
import { folderPath } from "../project-folder";
import { composePage, type EmbedAt } from "./document";
import { type HubLink, hubOrigin } from "./link";
import type { PreviewStore } from "./store";
import {
  DOCUMENT_PATH,
  isRevivedAnswer,
  isUpstreamAnswer,
  LOCK_HEADER,
  OPEN_PATH,
  OpenedSchema,
  ORIGIN_PATH,
  REACHED_HEADER,
  REVIVE_PATH,
  type RevivedAnswer,
  SYNC_PATH,
  TOKEN_HEADER,
  UPSTREAM_PATH,
  type UpstreamAnswer,
} from "./wire";

/** A socket a listener carries: a previewed app's, relayed to its machine, or a doc socket relayed to the hub. */
export type ListenerSocket = PreviewSocket;

/** Where a machine's preview is served now, or the hop that failed, why, and what stopped it (hub preview-service.ts `reach`). */
type Reached = UpstreamAnswer;

/** `text` as HTML text or an attribute's value. */
const escapedHtml = (text: string): string =>
  text.replaceAll(/[&<>"]/gu, (char) => HTML_ESCAPES[char] ?? char);
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/**
 * An HTML design's stage document (`serveDesign`): its title, each page's
 * name for the graph (`names`), and the stage's script inline. The page
 * runs to the window's edges, its ground the picked scheme's canvas, the
 * frame centred in it.
 */
const designStage = (
  title: string,
  names: Record<string, string>,
  script: string
): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapedHtml(title)}</title>
<style>
html,body{margin:0;block-size:100%}
body{box-sizing:border-box;overflow:auto;background:Canvas;color:CanvasText}
[data-slot="design-holder"]{margin-inline:auto;overflow:clip}
iframe{display:block;border:0;transform-origin:0 0}
</style>
</head>
<body>
<script type="application/json" id="cawco-design">${JSON.stringify({ names }).replaceAll("<", "\\u003c")}</script>
<script>${script.replaceAll("</script", "<\\/script")}</script>
</body>
</html>
`;

/** The status a preview's own down page answers with for each stop. */
const STOP_STATUS: Record<PreviewStop["kind"], number> = {
  away: 503,
  silent: 504,
  paused: 409,
  closed: 404,
  failed: 502,
};

/** The status a machine's listener answers a preview whose workspace is gone with (agent preview.ts `staged`). */
const GONE_STATUS = 410;

/** Whether `request` is a page's own load (`Sec-Fetch-Mode: navigate`): the person opening it, never a request of a page already open. */
const opens = (request: Request): boolean =>
  request.method === "GET" &&
  request.headers.get("sec-fetch-mode") === "navigate";

/** How long the machine's listener has to answer the ping's relay. Our call: under the pane's own 10 s for the whole probe. */
const PING_RELAY_MS = 5000;

/** What serving needs of the server around it. */
export interface ServeEnv {
  /** Origin `key` may be framed by `origin` too: a page that shows it was reached there. */
  allow: (key: string, origin: string) => void;
  /** The origins that may frame what origin `key` serves beside the dashboards. */
  ancestorsOf: (key: string | undefined) => string[];
  /** Host mode's pattern while its listener stands. */
  hostPattern: () => HostPattern | undefined;
  link: HubLink;
  /** The origins that may frame a preview: the dashboards (hub preview.ts `previewParents`). */
  parents: () => string[];
  /** Origin `key`'s port while it stands. */
  portOf: (key: string) => number | undefined;
  store: PreviewStore;
  /** A socket opened on origin `key`: a frame of it stands on a screen; the release, as it closes. */
  watch: (key: string) => () => void;
}

/**
 * What every answer on a preview origin carries: who may frame it, and its
 * ask for a process of its own (`Origin-Agent-Cluster: ?1`, sent on every
 * answer, as the header must be: web.dev/articles/origin-agent-cluster).
 */
const previewHeaders = (
  env: ServeEnv,
  ancestors: string[] = []
): [string, string][] => [
  // `'self'` too: every ancestor is checked, and a page's own frames (an
  // app's inner frame) have the preview's origin among theirs.
  [
    "content-security-policy",
    `frame-ancestors 'self' ${[...env.parents(), ...ancestors].join(" ")}`.trim(),
  ],
  ["origin-agent-cluster", "?1"],
];

/** `answer` with {@link previewHeaders}; a response whose headers a hop holds fixed goes on as a copy. */
const framedBy = (
  env: ServeEnv,
  answer: Response,
  ancestors: string[] = []
): Response => {
  const headers = previewHeaders(env, ancestors);
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
 * `answer`, when it is a page whose overlay tag isn't keyed yet (a machine's
 * page, a canvas's host page), with its tag at the overlay's key. A page's
 * document this server composed carries it keyed already, and its ETag.
 */
const withKeyedOverlay = (
  env: ServeEnv,
  answer: Response
): Promise<Response> | Response =>
  answer.body &&
  !answer.headers.has("etag") &&
  answer.headers.get("content-type")?.startsWith("text/html")
    ? keyOverlay(answer, env.parents())
    : answer;

/** What every answer to the dashboard's probe carries: readable to any page, never kept, marked CawCo's own. */
const PING_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": `${PREVIEW_PING_HEADER}, ${PREVIEW_HELD_HEADER}`,
  "cache-control": "no-store",
  [PREVIEW_PING_HEADER]: "1",
} as const;

/** The dashboard's probe, answered to any page with no credentials. */
const ping = (held?: string | null): Response =>
  new Response("ok", {
    headers: {
      ...PING_HEADERS,
      "content-type": "text/plain",
      ...(held ? { [PREVIEW_HELD_HEADER]: held } : {}),
    },
  });

/** The probe's answer when what serves the page doesn't answer: why, in CawCo's words (core `PreviewPingDown`), as a 200. */
const pingDown = (why: string, down?: PreviewDown): Response =>
  Response.json({ why, ...(down ? { down } : {}) } satisfies PreviewPingDown, {
    headers: PING_HEADERS,
  });

const TRAILING_STOP = /\.$/u;

/** A thrown fetch's short name: its code (`ECONNRESET`), else its kind. */
const codeOf = (error: unknown): string => {
  const code = errnoCode(error);
  if (code !== undefined) {
    return code;
  }
  return error instanceof Error ? error.name : String(error);
};

/** An upstream's host as a URL names it: an IPv6 address bracketed. */
const hostOf = (at: Upstream): string =>
  at.address.includes(":") ? `[${at.address}]` : at.address;

/**
 * Each machine origin's upstream as the hub last said it, kept while what
 * its row names is what it was started for (core `Upstream.for`): a
 * machine's preview asks the hub once, then goes straight to its listener.
 */
export const createUpstreams = (env: Pick<ServeEnv, "link">) => {
  const held = new Map<string, Upstream>();
  const asking = new Map<string, Promise<Reached>>();
  return {
    /** Where machine origin `key`'s row `row` is served now, as kept; undefined while it isn't. */
    held: (key: string, row: MachineRow): Upstream | undefined => {
      const at = held.get(key);
      return at?.for === sourceFor(row) ? at : undefined;
    },
    /** Where it is served now: kept, else the hub's answer, its listener started when none serves it. */
    reach: (key: string, row: MachineRow): Promise<Reached> => {
      const at = held.get(key);
      if (at?.for === sourceFor(row)) {
        return Promise.resolve({ ok: true, upstream: at });
      }
      const already = asking.get(key);
      if (already !== undefined) {
        return already;
      }
      const asked = env.link
        .ask(`${UPSTREAM_PATH}${encodeURIComponent(key)}`)
        .then(async (answer) => {
          if (!answer.ok) {
            return {
              ok: false as const,
              down: "machine" as const,
              error: `the hub answered ${answer.status}`,
              stop: { kind: "failed" as const },
            };
          }
          const reached: unknown = await answer.json();
          if (!isUpstreamAnswer(reached)) {
            return {
              ok: false as const,
              down: "machine" as const,
              error: "the hub's answer wasn't where the preview is served",
              stop: { kind: "failed" as const },
            };
          }
          if (reached.ok) {
            held.set(key, reached.upstream);
          }
          return reached;
        })
        .catch((error: unknown): Reached => ({
          ok: false,
          down: "machine",
          error: `the hub didn't answer: ${causeOf(error)}`,
          stop: { kind: "failed" },
        }))
        .finally(() => asking.delete(key));
      asking.set(key, asked);
      return asked;
    },
    /** The listener at `at` didn't answer: forgotten here and at the hub, so the next request asks where it is now. */
    unreachable: (key: string, at: Upstream): void => {
      if (held.get(key)?.token === at.token) {
        held.delete(key);
      }
      env.link.say({ type: "unreachable", key, upstream: at });
    },
  };
};

export type Upstreams = ReturnType<typeof createUpstreams>;

/** The source key a machine row names now (core `sourceKeyOf`): what an upstream was started for. */
const sourceFor = (row: MachineRow) =>
  sourceKeyOf({ machineId: row.machineId, source: row.source });

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

/** What goes on to the machine: hop-by-hop headers off, and none of the dashboard's cookies (hub preview.ts, as it was). */
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

/** What comes back to the browser: no cookie under one of the dashboard's names, and only the caching safe where it was asked (core `previewCache`). */
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

export function createServe(env: ServeEnv, upstreams: Upstreams) {
  /** The hub's origin on loopback, for a relayed request. */
  const hubAt = (path: string): string => `${hubOrigin()}${path}`;

  /**
   * Each machine origin whose workspace the hub is cutting again for an
   * open ({@link revive}), since when, and the hub's answer on its way: one
   * ask per origin at a time, every open of it waiting on that one, and the
   * origin's ping saying its page is held meanwhile (core
   * `PREVIEW_HELD_HEADER`), so a decision page's Preview waits on it as on
   * a server still compiling.
   */
  const reviving = new Map<
    string,
    { answer: Promise<RevivedAnswer>; since: number }
  >();
  /** The workspace machine origin `key` is served from, which its machine said is gone, cut again by the hub (wire.ts `REVIVE_PATH`), or why it can't be. */
  const revive = (key: string): Promise<RevivedAnswer> => {
    const under = reviving.get(key);
    if (under) {
      return under.answer;
    }
    const answer = env.link
      .ask(`${REVIVE_PATH}${encodeURIComponent(key)}`, { method: "POST" })
      .then(async (said): Promise<RevivedAnswer> => {
        const read: unknown = await said.json();
        return isRevivedAnswer(read)
          ? read
          : { ok: false, down: "gone", why: null };
      })
      .catch((error: unknown): RevivedAnswer => ({
        ok: false,
        down: "machine",
        why: `the hub didn't answer: ${causeOf(error)}`,
      }))
      .finally(() => reviving.delete(key));
    reviving.set(key, { answer, since: Date.now() });
    return answer;
  };

  /**
   * A hub-owned path on origin `key` relayed to the hub as the browser sent
   * it, its address as the browser reached it and the lock it met named in
   * headers (wire.ts `ORIGIN_PATH`); an upgrade to the doc socket on the
   * hub's own route (`SYNC_PATH`).
   */
  const toHub = async (
    request: Request,
    server: Server<ListenerSocket>,
    key: string | undefined,
    lock: PassCheck
  ): Promise<Response | undefined> => {
    const url = new URL(request.url);
    const headers = proxyHeaders(request.headers);
    headers.set(TOKEN_HEADER, env.link.token);
    headers.set(REACHED_HEADER, url.href);
    headers.set(LOCK_HEADER, lock.domain ?? "port");
    if (asksUpgrade(request)) {
      const synced = url.pathname.match(ARTIFACT_PATH);
      if (!(synced?.[1] && key) || synced[2]) {
        return new Response("Not found", { status: 404 });
      }
      const target = `ws${hubAt(`${SYNC_PATH}${encodeURIComponent(key)}/${synced[1]}${url.search}`).slice(4)}`;
      return upgradePreview(request, server, target, headers, {
        hop: "hub link",
        instanceId: key,
        viewer: () => env.watch(key),
      })
        ? undefined
        : new Response("WebSocket upgrade failed", { status: 400 });
    }
    try {
      const answer = await fetch(
        hubAt(
          `${ORIGIN_PATH}${encodeURIComponent(key ?? "-")}${url.pathname}${url.search}`
        ),
        {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        }
      );
      return new Response(answer.body, {
        status: answer.status,
        headers: decodedHeaders(answer.headers),
      });
    } catch (error) {
      const why = `the hub didn't answer the preview server: ${causeOf(error)}`;
      previewFailed(HOP, key ?? null, why);
      return downResponse("machine", 502, why);
    }
  };

  /** Origin `key`'s port, opened by the hub when it has none; or the hub's words for why none opens. */
  const portFor = async (key: string): Promise<number | string> => {
    const held = env.portOf(key);
    if (held !== undefined) {
      return held;
    }
    try {
      const answer = await env.link.ask(
        `${OPEN_PATH}${encodeURIComponent(key)}`,
        { method: "POST" }
      );
      const said = OpenedSchema.safeParse(await answer.json()).data;
      return typeof said?.port === "number"
        ? said.port
        : (said?.detail ?? `the hub answered ${answer.status}`);
    } catch (error) {
      return `the hub didn't answer: ${causeOf(error)}`;
    }
  };

  /** Origin `key`'s origin where a browser that reached `at` reaches it: host mode's name, else its port on that host. */
  const originAt = (key: string, port: number, at: URL): string | null => {
    const pattern = env.hostPattern();
    if (at.port !== String(port) && pattern) {
      return originFor(pattern, pattern.key === "port" ? port : labelOf(key));
    }
    return null;
  };

  /**
   * Artifact `id`'s document row: as last built while it stands (each doc it
   * was read from at the seq it read), else built by the hub now, so an
   * open after the person's edits serves the doc as it stands.
   */
  const documentRow = async (
    id: string
  ): Promise<ArtifactDocumentRow | undefined> => {
    const kept = env.store.document(id);
    if (kept && env.store.stands(kept)) {
      return kept;
    }
    try {
      const answer = await env.link.ask(
        `${DOCUMENT_PATH}${encodeURIComponent(id)}`,
        { method: "POST" }
      );
      return answer.ok ? env.store.document(id) : undefined;
    } catch (error) {
      previewFailed(
        HOP,
        null,
        `the hub didn't build ${id}'s document: ${causeOf(error)}`
      );
      // The last one built, which its overlay's socket brings up to date once the hub answers.
      return kept;
    }
  };

  /** Each embed of a decision page's media with its port now, opened by the hub for one that has none. */
  const embedPorts = async (
    row: ArtifactDocumentRow
  ): Promise<Map<string, number | string>> => {
    const ports = new Map<string, number | string>();
    if (row.media === null) {
      return ports;
    }
    const keys = new Set<string>();
    for (const match of row.media.matchAll(EMBED_KEY)) {
      if (match[1]) {
        keys.add(match[1]);
      }
    }
    await Promise.all(
      [...keys].map(async (key) => {
        ports.set(key, await portFor(key));
      })
    );
    return ports;
  };

  /**
   * The file `asked` names in page artifact `artifactId`'s folder,
   * `artifacts/<id>/…` under the hub's data dir, its real path inside it; a
   * path that leaves the folder, by `..` or by a link, is refused.
   */
  const pageFileAt = async (
    artifactId: string,
    asked: string
  ): Promise<
    | Response
    | {
        file: string;
        inside: string;
        root: string;
        stats: Stats;
      }
  > => {
    let file: string;
    let root: string;
    try {
      root = await realpath(join(ARTIFACTS_ROOT, artifactId));
      const rel = folderPath(
        decodeURIComponent(asked === "/" ? "/index.html" : asked).slice(1)
      );
      if (rel instanceof ElysiaStatus) {
        return new Response(rel.response.detail, { status: rel.status });
      }
      file = await realpath(join(root, rel));
    } catch {
      return new Response("Not found", { status: 404 });
    }
    const inside = relative(root, file);
    if (inside === ".." || inside.startsWith(`..${sep}`)) {
      return new Response("Forbidden", { status: 403 });
    }
    const stats = await stat(file);
    return stats.isFile()
      ? { file, root, inside, stats }
      : new Response("Not found", { status: 404 });
  };

  /**
   * Each embed's address where a page of origin `owner` was reached
   * (`reachedAt`), its port among `ports`: on the page's own port, the same
   * host at the embed's port; on a host-mode name, the embed's name. The
   * origin the page was reached at may frame each of them.
   */
  const embedsAt = (
    owner: string,
    reachedAt: URL,
    ports: Map<string, number | string>
  ): EmbedAt => {
    const ownPort = env.portOf(owner);
    const onOwnPort = reachedAt.port === String(ownPort);
    let framer: string | null = null;
    if (onOwnPort) {
      framer = reachedAt.origin;
    } else if (ownPort !== undefined) {
      framer = originAt(owner, ownPort, reachedAt);
    }
    return (key, path) => {
      const port = ports.get(key);
      if (typeof port !== "number") {
        return { unopened: port ?? "No preview port opened for it." };
      }
      if (framer) {
        env.allow(key, framer);
      }
      const named = onOwnPort ? null : originAt(key, port, reachedAt);
      return {
        embed: named
          ? `${named}${path}`
          : `${reachedAt.protocol}//${reachedAt.hostname}:${port}${path}`,
      };
    };
  };

  /**
   * A file of page artifact `artifactId`, `artifacts/<id>/…` under the
   * hub's data dir: its document composed from its row (document.ts), any
   * other file as it is. A path that leaves the page's folder, by `..` or by
   * a link, is refused. The document is `no-cache` with an ETag naming all
   * it is made of, so a repeat open is a 304 from its row alone.
   */
  async function servePage(
    request: Request,
    artifactId: string,
    pathname: string,
    owner: string,
    reachedAt: URL,
    mount = "/"
  ): Promise<Response> {
    const versioned = versionedFile(pathname);
    const found = await pageFileAt(artifactId, versioned ?? pathname);
    if (found instanceof Response) {
      return found;
    }
    const { file, inside, stats } = found;
    const body = Bun.file(file);
    if (!body.type.startsWith("text/html")) {
      return new Response(body, {
        headers: {
          "cache-control": versioned === null ? "no-store" : IMMUTABLE,
          "content-type": body.type,
        },
      });
    }
    const row = await documentRow(artifactId);
    if (!row) {
      return new Response("This page's document isn't built yet.", {
        status: 503,
        headers: { "retry-after": "1" },
      });
    }
    const ports = await embedPorts(row);
    const overlayAt = await keyedOverlayPath(env.parents());
    const etag = documentEtag([
      row.etag,
      inside,
      stats.mtimeMs,
      stats.size,
      mount,
      pathname,
      reachedAt.origin,
      overlayAt,
      [...ports],
      env.portOf(owner) ?? null,
      env.hostPattern()?.domain ?? null,
    ]);
    const headers = {
      "cache-control": versioned === null ? "no-cache" : IMMUTABLE,
      "content-type": body.type,
      etag,
    };
    if (sameEtag(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers });
    }
    const embedAt = embedsAt(owner, reachedAt, ports);
    const composed = composePage(artifactId, await body.text(), row, {
      embedAt,
      mount,
      overlayAt,
      pathname,
      versioned: versioned !== null,
    });
    return new Response(composed.body, {
      headers: composed.links ? { ...headers, link: composed.links } : headers,
    });
  }

  /**
   * HTML design `artifactId`'s files on its page's place (core stage.ts
   * `htmlDesignOf`): at the design graph's address its stage, the document
   * the graph frames (design-stage/stage.ts, carried inline) with the
   * overlay in it as in every page; any other path one of its pages, as the
   * hub keeps it under `artifacts/<id>/`, with no overlay of its own: the
   * stage's reaches into it. Neither is kept: a revision moves every page
   * under the same names, and the panel loads its frame again.
   */
  async function serveDesign(
    artifactId: string,
    pathname: string
  ): Promise<Response> {
    const row = env.store.artifact(artifactId);
    const design = row ? htmlDesignOf(row) : null;
    if (!(row && design)) {
      return new Response("This origin serves no such design.", {
        status: 404,
      });
    }
    if (pathname !== STAGE_PATH) {
      const found = await pageFileAt(artifactId, pathname);
      if (found instanceof Response) {
        return found;
      }
      const file = Bun.file(found.file);
      return new Response(file, {
        headers: { "cache-control": "no-store", "content-type": file.type },
      });
    }
    // Each page's name as the graph shows it: its direction's, else the design's title.
    const names = Object.fromEntries(
      design.files.map((file) => [
        file,
        design.spec.directions?.find((one) => one.file === file)?.name ??
          row.title,
      ])
    );
    const stage = injectOverlay(
      designStage(row.title, names, await loadDesignStage()),
      { artifact: artifactId }
    ).replace(
      `<script src="${OVERLAY_PATH}"`,
      `<script src="${await keyedOverlayPath(env.parents())}"`
    );
    return new Response(stage, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  /** The ping on origin `key`: ok once whatever serves its page answers; a machine's preview's listener asked for its own (hub preview.ts `pingSession`, as it was). */
  async function pingOrigin(key: string): Promise<Response> {
    const row = isEmbed(key) ? env.store.rowAt(key) : undefined;
    if (!(row && servedByMachine(row))) {
      return ping();
    }
    const reached = await upstreams.reach(key, row);
    if (!reached.ok) {
      return reached.down === "closed" ? ping() : pingDown(reached.error);
    }
    const at = reached.upstream;
    const failed = (cause: string, code: string): Response => {
      previewFailed(
        HOP,
        key,
        `its machine's listener at ${hostOf(at)}:${at.port} didn't answer the ping: ${cause}`
      );
      upstreams.unreachable(key, at);
      return pingDown(`its machine's listener didn't answer the hub (${code})`);
    };
    try {
      const read = await readWithin(PING_RELAY_MS, (signal) =>
        fetch(`http://${hostOf(at)}:${at.port}${PREVIEW_PING_PATH}`, {
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
      const said = downOf(await read.value.text());
      const words = said
        ? (said.why ?? DOWN_WORDS[said.down])
        : `its machine's listener answered ${read.value.status}`;
      return pingDown(words.replace(TRAILING_STOP, ""), said?.down);
    } catch (error) {
      return failed(causeOf(error), codeOf(error));
    }
  }

  /** A machine preview's request on to its listener, and its answer back; a listener that doesn't answer is said and forgotten. */
  async function relay(
    request: Request,
    server: Server<ListenerSocket>,
    key: string,
    at: Upstream,
    direct: boolean
  ): Promise<Response | undefined> {
    const url = new URL(request.url);
    const upstream = `${hostOf(at)}:${at.port}${url.pathname}${url.search}`;
    const headers = upstreamHeaders(request, direct);
    headers.set(RELAY_HEADER, at.token);
    if (asksUpgrade(request)) {
      return upgradePreview(request, server, `ws://${upstream}`, headers, {
        hop: HOP,
        instanceId: key,
        nothingListens: () => upstreams.unreachable(key, at),
        viewer: () => env.watch(key),
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
      const why = `its machine's listener at ${hostOf(at)}:${at.port} didn't answer the hub: ${causeOf(error)}`;
      previewFailed(HOP, key, why);
      upstreams.unreachable(key, at);
      return downResponse("machine", 502, why);
    }
    return new Response(response.body, {
      status: response.status,
      headers: downstreamHeaders(response, direct),
    });
  }

  /** A machine's preview on its artifact's own origin: relayed to its listener, which the hub starts when none serves it. */
  async function serveMachine(
    request: Request,
    server: Server<ListenerSocket>,
    key: string,
    row: MachineRow,
    direct: boolean
  ): Promise<Response | undefined> {
    if (asksUpgrade(request) && !upstreams.held(key, row)) {
      upstreams.reach(key, row).catch(() => undefined);
      return notUpYet();
    }
    heldWhileServed(server, request);
    const reached = await upstreams.reach(key, row);
    if (!reached.ok) {
      previewFailed(HOP, key, `${reached.down}: ${reached.error}`);
      return downResponse(
        reached.down,
        STOP_STATUS[reached.stop.kind],
        reached.down === "reach" ? reached.error : undefined
      );
    }
    const answer = await relay(request, server, key, reached.upstream, direct);
    const served =
      answer && opens(request)
        ? await afterGone(request, server, key, answer, direct)
        : answer;
    return served && withKeyedOverlay(env, served);
  }

  /**
   * The person's open of a machine preview (its page's own load, never a
   * request of a page already open, which never brings a workspace back by
   * itself) answered `gone` by its machine (agent preview.ts `staged`: the
   * workspace that serves it is not there): the workspace cut again by the
   * hub ({@link revive}), the open held meanwhile as a sleeping server's is
   * while it wakes, and relayed again once it is back, to wherever the row
   * serves it now (a design moved to the later workspace its work went on
   * in). When it can't come back, the proxy's page names why (core
   * preview.ts `goneWhy`). Any other answer as it came.
   */
  async function afterGone(
    request: Request,
    server: Server<ListenerSocket>,
    key: string,
    answer: Response,
    direct: boolean
  ): Promise<Response | undefined> {
    if (answer.status !== GONE_STATUS) {
      return answer;
    }
    const text = await answer.text();
    const kept = new Response(text, {
      status: answer.status,
      headers: answer.headers,
    });
    if (downOf(text)?.down !== "gone") {
      return kept;
    }
    const back = await revive(key);
    if (!back.ok) {
      previewFailed(
        HOP,
        key,
        `its workspace can't come back: ${back.why ?? back.down}`
      );
      return downResponse(
        back.down,
        back.down === "gone" ? GONE_STATUS : STOP_STATUS.away,
        back.why ?? undefined
      );
    }
    const row = env.store.rowAt(key);
    if (!(row && servedByMachine(row))) {
      return kept;
    }
    const reached = await upstreams.reach(key, row);
    if (!reached.ok) {
      return downResponse(
        reached.down,
        STOP_STATUS[reached.stop.kind],
        reached.down === "reach" ? reached.error : undefined
      );
    }
    return relay(request, server, key, reached.upstream, direct);
  }

  /** A canvas by its id on origin `key` (`/__cawco/canvas/<id>/`, `?embed=1` in a decision page); null for any other path. */
  async function canvasById(url: URL, key: string): Promise<Response | null> {
    const canvas = url.pathname.match(CANVAS_PATH);
    if (!(canvas?.[1] && canvas[2])) {
      return null;
    }
    const [, artifactId, rest] = canvas;
    if (
      env.store.artifact(artifactId)?.kind !== "canvas" ||
      !env.store.servedOn(artifactId, key)
    ) {
      return new Response("This session has no such canvas.", {
        status: 404,
      });
    }
    const row = rest === "/" ? await documentRow(artifactId) : undefined;
    return serveCanvas(
      artifactId,
      rest,
      () => ({ maps: row?.seedMaps ?? "{}", state: row?.seedState ?? "" }),
      url.searchParams.get("embed") === "1"
    );
  }

  /** A page by its id on origin `key` (`/__cawco/page/<id>/`); null for any other path. */
  function pageById(
    request: Request,
    url: URL,
    key: string
  ): Promise<Response> | Response | null {
    const paged = url.pathname.match(PAGE_PATH);
    if (!(paged?.[1] && paged[2])) {
      return null;
    }
    const [, artifactId, rest] = paged;
    const row = env.store.artifact(artifactId);
    if (!(
      row &&
      (row.kind === "page" || htmlDesignOf(row)) &&
      env.store.servedOn(artifactId, key)
    )) {
      return new Response("This origin serves no such page.", {
        status: 404,
      });
    }
    if (row.kind === "component") {
      return serveDesign(artifactId, rest);
    }
    return servePage(
      request,
      artifactId,
      rest,
      key,
      url,
      `/__cawco/page/${artifactId}/`
    );
  }

  /** What the server serves on an origin by an artifact's id: the decision and file viewer hosts' files, a canvas, a page; null for any other path. */
  async function byId(
    request: Request,
    url: URL,
    key: string
  ): Promise<Response | null> {
    const { pathname } = url;
    if (pathname.startsWith(DECISION_ASSETS)) {
      return (
        (await decisionHostFile(pathname.slice(DECISION_ASSETS.length))) ??
        new Response("Not found", { status: 404 })
      );
    }
    if (pathname.startsWith(FILE_VIEWER_ASSETS)) {
      return (
        (await fileViewerFile(pathname.slice(FILE_VIEWER_ASSETS.length))) ??
        new Response("Not found", { status: 404 })
      );
    }
    return (await canvasById(url, key)) ?? (await pageById(request, url, key));
  }

  /** What origin `key` shows at `url`: a page or a canvas the hub holds, or a machine's preview relayed. */
  async function serveShown(
    request: Request,
    server: Server<ListenerSocket>,
    key: string,
    url: URL,
    direct: boolean
  ): Promise<Response | undefined> {
    const { pathname } = url;
    const row = env.store.rowAt(key);
    if (!row) {
      previewFailed(HOP, key, `its origin shows no preview at ${pathname}`);
      return downResponse("closed", 404);
    }
    if (row.kind === "browser") {
      return new Response(
        "A browser is drawn by its panel from its stream; no page serves it.",
        { status: 404 }
      );
    }
    if ("page" in row.source) {
      if (!env.store.servedOn(row.id, key)) {
        previewFailed(HOP, key, "its page is its project's origin's");
        return downResponse("closed", 404);
      }
      if (row.kind === "canvas") {
        const document = await documentRow(row.id);
        return serveCanvas(row.id, pathname, () => ({
          maps: document?.seedMaps ?? "{}",
          state: document?.seedState ?? "",
        }));
      }
      if (row.kind === "component") {
        return serveDesign(row.id, pathname);
      }
      return servePage(request, row.id, pathname, key, url);
    }
    if (!(isEmbed(key) && servedByMachine(row))) {
      previewFailed(HOP, key, "its machine's preview is on its own origin");
      return downResponse("closed", 404);
    }
    return serveMachine(request, server, key, row, direct);
  }

  /** One request to origin `key`, past the lock; `direct`: it came to an origin's own port, which no CDN stands before. */
  async function serveOrigin(
    request: Request,
    server: Server<ListenerSocket>,
    key: string,
    lock: PassCheck,
    direct: boolean
  ): Promise<Response | undefined> {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === PREVIEW_PING_PATH) {
      // Its workspace cut again for an open: the page is held meanwhile.
      const under = reviving.get(key);
      return under ? ping(String(Date.now() - under.since)) : pingOrigin(key);
    }
    if (pathname === OVERLAY_PATH) {
      return overlayResponse(
        env.parents(),
        request.headers.get("accept-encoding"),
        url.searchParams.get(OVERLAY_KEY)
      );
    }
    if (
      pathname === PREVIEW_ERRORS_PATH ||
      ARTIFACT_PATH.test(pathname) ||
      PAGE_SHAPE_PATH.test(pathname)
    ) {
      return toHub(request, server, key, lock);
    }
    const found = await byId(request, url, key);
    if (found) {
      return found;
    }
    if (hubsOwn(pathname)) {
      return new Response("Not found", { status: 404 });
    }
    return serveShown(request, server, key, url, direct);
  }

  return {
    /**
     * One request on a listener whose origin is `key` (undefined: a name or
     * port no origin holds), behind `lock`: what stops it at the lock, then
     * what the origin answers, framed, keyed and gzipped.
     */
    async answer(
      request: Request,
      server: Server<ListenerSocket>,
      key: string | undefined,
      lock: PassCheck
    ): Promise<Response | undefined> {
      const { pathname } = new URL(request.url);
      if (pathname === PREVIEW_PING_PATH && !key) {
        return framedBy(env, ping(), env.ancestorsOf(key));
      }
      // An entry spends a ticket and writes a pass: the hub's.
      if (pathname === PREVIEW_ENTER_PATH) {
        const entered = await toHub(request, server, key, lock);
        return entered && framedBy(env, entered, env.ancestorsOf(key));
      }
      if (pathname !== PREVIEW_PING_PATH && !passOf(request, lock, key)) {
        return framedBy(env, lockedResponse(), env.ancestorsOf(key));
      }
      if (!key) {
        previewFailed(
          HOP,
          null,
          `no origin's preview at ${request.headers.get("host")}`
        );
        return framedBy(env, downResponse("closed", 404));
      }
      if (pathname === PREVIEW_REACH_PATH) {
        const asked = new URL(request.url).searchParams.get("origin") ?? "";
        return Response.json({
          ...(await reachOrigin(asked, env.hostPattern())),
          ports: PREVIEW_PORTS_TEXT,
          hostMode: env.hostPattern() !== undefined,
        } satisfies HubReach & { hostMode: boolean; ports: string });
      }
      const answer = await serveOrigin(
        request,
        server,
        key,
        lock,
        lock.domain === null
      );
      if (!answer) {
        return;
      }
      const framed = framedBy(
        env,
        await withKeyedOverlay(env, answer),
        env.ancestorsOf(key)
      );
      return compressed(
        framed,
        request.headers.get("accept-encoding"),
        `${key} ${request.url}`
      );
    },
  };
}

/** An embed's origin key in a document's media JSON. */
const EMBED_KEY = /"embedKey":"([^"]+)"/gu;

/** A document's ETag, weak, naming everything it is made of (`parts`). */
const documentEtag = (parts: unknown[]): string =>
  `W/"${createHash("sha256").update(JSON.stringify(parts)).digest("base64url").slice(0, 27)}"`;

/** A weak validator's mark. */
const WEAK = /^W\//u;

/** Whether `asked` (a request's If-None-Match) names `etag`, weak or strong. */
const sameEtag = (asked: string | null, etag: string): boolean => {
  if (!asked) {
    return false;
  }
  const bare = (tag: string) => tag.trim().replace(WEAK, "");
  const want = bare(etag);
  return asked
    .split(",")
    .some((tag) => bare(tag) === want || tag.trim() === "*");
};
