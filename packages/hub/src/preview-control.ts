/**
 * The hub's side of its preview server (preview-server/wire.ts): the control
 * link it holds open, what it says on it, and the routes for what only the
 * hub answers on a preview origin, each refused but to a request from
 * loopback that carries the server's token. One server is linked at a time:
 * a new link replaces the one before.
 */

import type { ArtifactKind } from "@cawco/core/artifact-kinds";
import { readWithin } from "@cawco/core/bounded";
import type { PageFaultReport } from "@cawco/core/page-faults";
import {
  PREVIEW_ENTER_PATH,
  PREVIEW_ERRORS_PATH,
} from "@cawco/core/preview/routes";
import type { Upstream } from "@cawco/core/preview/upstream";
import { unhandled } from "@cawco/core/unhandled";
import { causeOf, previewFailed } from "@cawco/preview/proxy";
import { Elysia, ElysiaStatus, problem } from "elysia";
import { problemResponse } from "elysia/error";
import type { ArtifactDocuments } from "./artifact-documents";
import type { artifactPictures, artifactSend } from "./artifacts/page-posts";
import {
  ARTIFACT_PATH,
  type ArtifactSocketEnd,
  type artifactPicture,
  type artifactSocket,
  type StoreSocketEnd,
  type storeSocket,
} from "./artifacts/sync";
import { takeErrorReport } from "./dashboard-errors";
import type { StoreKey } from "./db/page-stores";
import type { PreviewPassesDb } from "./db/preview-passes";
import type { PreviewsDb } from "./db/previews";
import { hidden } from "./hidden";
import type { PreviewListeners, PreviewServerHand } from "./preview";
import { enter, lockedResponse, type PassLock } from "./preview-access";
import { labelOf, originFor, parsePattern } from "./preview-hosts";
import { HOP } from "./preview-origin";
import { PAGE_SHAPE_PATH } from "./preview-paths";
import {
  CONTROL_PATH,
  DOCUMENT_PATH,
  type HubSays,
  isPreviewServer,
  LOCK_HEADER,
  OPEN_PATH,
  ORIGIN_PATH,
  PREVIEW_SERVER_PREFIX,
  REACHED_HEADER,
  REVIVE_PATH,
  type RevivedAnswer,
  STORE_SYNC_PATH,
  SYNC_PATH,
  serverSaid,
  TOKEN_HEADER,
  UPSTREAM_PATH,
  type UpstreamAnswer,
} from "./preview-server/wire";
import { staleEntry } from "./preview-stale";
import type { TailnetLive } from "./tailnet-doors";

/** How long `stood` waits for the server's answer to a stand. Our call: a bind is milliseconds. */
const STOOD_MS = 5000;

/** What a hub-owned path on a preview origin needs of the hub (server.ts). */
export interface PreviewOriginDeps {
  /** A Diagram of a decision page opened as a canvas in its session's panel (`/canvas`). */
  canvasFrom: (
    request: Request,
    instanceId: string,
    artifactId: string
  ) => Promise<Response>;
  /** The shape a decision page's Preview heard a design graph of page `pageId`'s media say (`POST /__cawco/page/<id>/shape`). */
  keepShape: (request: Request, pageId: string) => Promise<Response>;
  /** An artifact's kind; undefined when there is none. */
  kindOf: (artifactId: string) => ArtifactKind | undefined;
  /** The session that holds an artifact (its panel); undefined when there is none. */
  ownerOf: (artifactId: string) => string | undefined;
  /** A fault a page met as it drew, reported by its overlay on an origin that serves its artifact: kept for `artifact_read`. */
  pageFault: (report: PageFaultReport) => void;
  picture: ReturnType<typeof artifactPicture>;
  pictures: ReturnType<typeof artifactPictures>;
  send: ReturnType<typeof artifactSend>;
  /** Whether origin `key` serves an artifact by its id (server.ts `servedOn`). */
  servedOn: (artifactId: string, key: string) => boolean;
  /** Whether session `instanceId` still runs: a session's ticket enters only while it does. */
  sessionLive: (instanceId: string) => boolean;
  socket: ReturnType<typeof artifactSocket>;
  /**
   * The store of `scope` a page on origin `key` joins (artifacts/page-stores.ts):
   * the artifact whose own origin `key` is, or its project; else why none.
   */
  storeOf: (key: string, scope: string) => StoreKey | string;
  stores: ReturnType<typeof storeSocket>;
}

export interface PreviewControlDeps {
  documents: ArtifactDocuments;
  listeners: PreviewListeners;
  origin: PreviewOriginDeps;
  passes: PreviewPassesDb;
  previews: Pick<PreviewsDb, "used">;
  /** Where machine origin `key`'s preview is served now, its listener started when none serves it (preview-service.ts `reach`); undefined for an origin no machine serves. */
  reach: (key: string) => Promise<UpstreamAnswer> | undefined;
  /**
   * The workspace machine origin `key`'s preview is served from, which its
   * machine said is gone, cut again (server.ts `reviveServed`, workspaces.ts
   * `revive`); undefined for an origin no machine serves.
   */
  revive: (key: string) => Promise<RevivedAnswer> | undefined;
  /** The listener at `upstream` didn't answer (preview-service.ts `unreachable`). */
  unreachable: (key: string, upstream: Upstream) => void;
}

/** Whether a request came from the preview server: on loopback (`address`), with its token (`header`, read by name). */
const fromServer = (
  header: (name: string) => string | null | undefined,
  address: string | undefined
): boolean =>
  isPreviewServer(header(TOKEN_HEADER)) &&
  (address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1");

/** {@link fromServer} for an HTTP request. */
const requestFromServer = (
  request: Request,
  server: { requestIP: (request: Request) => { address: string } | null } | null
): boolean =>
  fromServer(
    (name) => request.headers.get(name),
    server?.requestIP(request)?.address
  );

/**
 * Whether `request` is the preview server's, to one of its routes
 * (wire.ts): the one request the hub's cross-site gate (server.ts) lets by
 * whatever its `Origin` and `Sec-Fetch-*` say. A relayed one (an entry, a
 * doc socket's upgrade, a Send, a fault report) carries them as the browser
 * sent them, from a page on a preview origin, never the hub's own, and the
 * route reads them as sent (preview-stale.ts reads `Sec-Fetch-Dest`). The
 * server's token, which only a process that reads the hub's secret key
 * holds, on loopback, is what lets it by; a page can't send that header
 * cross-origin without a preflight nothing here answers.
 */
export const fromPreviewServer = (
  request: Request,
  server: { requestIP: (request: Request) => { address: string } | null } | null
): boolean =>
  new URL(request.url).pathname.startsWith(`${PREVIEW_SERVER_PREFIX}/`) &&
  requestFromServer(request, server);

/** A request not from the preview server, refused (the origin route's own answer is a Response, {@link notServerResponse}). */
const notServer = () =>
  problem(403, {
    code: "preview-server-only",
    detail: "Only this hub's preview server asks this.",
  });

const notServerResponse = () =>
  problemResponse({
    status: 403,
    code: "preview-server-only",
    detail: "Only this hub's preview server asks this.",
  });

/** The hub's end of the link: what it says to the server, and what the server's stands answered. */
export const createPreviewLink = (deps: {
  parents: () => string[];
  tailnet: () => TailnetLive | null;
}) => {
  /** The server's link now, by its socket's id; null while none is open. */
  let linked: { id: string; send: (said: string) => void } | null = null;
  /** Each wait on the next stand's answer. */
  const waiting = new Set<
    (said: Parameters<PreviewListeners["stood"]>[0]) => void
  >();

  const say = (said: HubSays): void => {
    linked?.send(JSON.stringify(said));
  };

  const hand: PreviewServerHand = {
    stand: () => say({ type: "ports" }),
    stood: async () => {
      if (!linked) {
        return null;
      }
      let heard:
        ((said: Parameters<PreviewListeners["stood"]>[0]) => void) | undefined;
      const read = await readWithin(
        STOOD_MS,
        () =>
          new Promise<Parameters<PreviewListeners["stood"]>[0]>((done) => {
            heard = done;
            waiting.add(done);
          })
      );
      if (heard) {
        waiting.delete(heard);
      }
      return read.kind === "answered" ? read.value : null;
    },
  };

  return {
    hand,
    say,
    /** The server's link opened: it is told everything it holds by. */
    opened(id: string, send: (said: string) => void): void {
      linked = { id, send };
      say({ type: "parents", parents: deps.parents() });
      say({ type: "tailnet", serving: deps.tailnet() });
      say({ type: "ports" });
    },
    closed(id: string): void {
      if (linked?.id === id) {
        linked = null;
      }
    },
    /** The server's answer to a stand. */
    stood(said: Parameters<PreviewListeners["stood"]>[0]): void {
      for (const heard of waiting) {
        heard(said);
      }
    },
  };
};

export type PreviewLink = ReturnType<typeof createPreviewLink>;

/** A relayed request as the browser sent it: its address restored, and the lock it met. */
const asSent = (
  request: Request
): { sent: Request; lockDomain: string | null } | null => {
  const reached = request.headers.get(REACHED_HEADER);
  if (!reached) {
    return null;
  }
  const headers = new Headers(request.headers);
  headers.delete(REACHED_HEADER);
  headers.delete(TOKEN_HEADER);
  const lock = headers.get(LOCK_HEADER);
  headers.delete(LOCK_HEADER);
  const hasBody = !(request.method === "GET" || request.method === "HEAD");
  return {
    sent: new Request(reached, {
      method: request.method,
      headers,
      ...(hasBody ? { body: request.body } : {}),
    }),
    lockDomain: lock === null || lock === "port" ? null : lock,
  };
};

export const previewControlRoutes = (
  link: PreviewLink,
  deps: PreviewControlDeps
) => {
  /** Each origin's doc sockets the server relays, by the hub's socket id. */
  const synced = new Map<string, ArtifactSocketEnd>();
  /** Each page's store socket the preview server relays, by Elysia's socket id. */
  const stored = new Map<string, StoreSocketEnd>();

  /** Where origin `key` stands now as a browser that reached `at` reaches it: a stale entry's next. */
  const standsAt = (
    key: string,
    at: URL
  ): Promise<{ origin: string } | { refused: string }> =>
    Promise.resolve(standsNow(key, at));

  const standsNow = (
    key: string,
    at: URL
  ): { origin: string } | { refused: string } => {
    const address = deps.listeners.address(key);
    if (address instanceof ElysiaStatus) {
      return { refused: address.response.detail };
    }
    const settings = deps.listeners.settings();
    const pattern =
      settings.mode === "host" ? parsePattern(settings.pattern) : undefined;
    if (
      pattern &&
      !(pattern instanceof ElysiaStatus) &&
      (at.hostname === pattern.domain ||
        at.hostname.endsWith(`.${pattern.domain}`))
    ) {
      return {
        origin: originFor(
          pattern,
          pattern.key === "port" ? address.port : labelOf(key)
        ),
      };
    }
    return { origin: `${at.protocol}//${at.hostname}:${address.port}` };
  };

  /** An artifact's Send, picture, pictures or canvas on origin `key` (core `ARTIFACT_PATH`), as the browser sent it. */
  const onArtifact = async (
    sent: Request,
    pathname: string,
    key: string
  ): Promise<Response> => {
    const { origin } = deps;
    const [, artifactId, action] = pathname.match(ARTIFACT_PATH) ?? [];
    if (!(artifactId && action)) {
      return new Response("Not found", { status: 404 });
    }
    if (!origin.servedOn(artifactId, key)) {
      return new Response("This origin serves no such artifact.", {
        status: 404,
      });
    }
    // What the page asks of its session: the one that holds it now.
    const instanceId = origin.ownerOf(artifactId);
    if (!instanceId) {
      return new Response(
        "No session holds this page now: send it from its project's Decisions tab.",
        { status: 409 }
      );
    }
    switch (action) {
      case "/send": {
        if (sent.method !== "POST") {
          return problemResponse(
            { status: 405, code: "send-post", detail: "Send is a POST." },
            { allow: "POST" }
          );
        }
        const answered = await origin.send(
          instanceId,
          artifactId,
          await sent.text(),
          `POST ${pathname}`
        );
        return answered instanceof ElysiaStatus
          ? problemResponse({
              status: answered.status,
              code: answered.response.code,
              detail: answered.response.detail,
            })
          : Response.json(answered);
      }
      case "/picture":
        return origin.picture(sent, artifactId);
      case "/pictures":
        return origin.pictures(sent, instanceId, artifactId);
      case "/canvas":
        return origin.canvasFrom(sent, instanceId, artifactId);
      default:
        return new Response("Not found", { status: 404 });
    }
  };

  /** An entry on origin `key` (none: a port no origin holds): a stale one sent on, else the ticket spent and the pass set. */
  const onEnter = async (
    sent: Request,
    url: URL,
    key: string | undefined,
    lockDomain: string | null
  ): Promise<Response> => {
    const { origin } = deps;
    const stale = await staleEntry(url, key, standsAt);
    if (stale) {
      return stale;
    }
    if (!key) {
      return lockedResponse();
    }
    const lock: PassLock = {
      domain: lockDomain,
      passes: deps.passes,
      sessionLive: origin.sessionLive,
    };
    const entered = enter(sent, lock, key);
    if (entered.refused) {
      previewFailed(HOP, key, `a ticket was refused: ${entered.refused}`);
    }
    return entered.response;
  };

  /** A hub-owned path on origin `key` (none: a port no origin holds), as the browser sent it. */
  const onOrigin = (
    sent: Request,
    key: string | undefined,
    lockDomain: string | null
  ): Promise<Response> | Response => {
    const url = new URL(sent.url);
    const { pathname } = url;
    const { origin } = deps;
    if (pathname === PREVIEW_ENTER_PATH) {
      return onEnter(sent, url, key, lockDomain);
    }
    if (!key) {
      return new Response("Not found", { status: 404 });
    }
    if (pathname === PREVIEW_ERRORS_PATH) {
      // A fault is kept only for an artifact this origin serves.
      return takeErrorReport(sent, (report) => {
        if (origin.servedOn(report.artifact, key)) {
          origin.pageFault(report);
        }
      });
    }
    const shaped = pathname.match(PAGE_SHAPE_PATH)?.[1];
    if (shaped) {
      return origin.servedOn(shaped, key) && origin.kindOf(shaped) === "page"
        ? origin.keepShape(sent, shaped)
        : new Response("This origin serves no such page.", { status: 404 });
    }
    return onArtifact(sent, pathname, key);
  };

  return new Elysia()
    .ws(CONTROL_PATH, {
      open(ws) {
        if (!fromServer((name) => ws.headers[name], ws.remoteAddress)) {
          ws.close(4403, "Only this hub's preview server opens this link.");
          return;
        }
        link.opened(ws.id, (said) => ws.send(said));
        console.log("[preview] the preview server's link is open");
      },
      message(_ws, message) {
        const said = serverSaid(
          typeof message === "string" ? message : JSON.stringify(message)
        );
        if (!said) {
          return;
        }
        switch (said.type) {
          case "used":
            deps.previews.used(said.key, new Date(said.at));
            return;
          case "touched":
            deps.passes.touch(said.id, new Date(said.at));
            return;
          case "watched":
            deps.listeners.watched(said.key, said.on);
            return;
          case "bound":
            deps.listeners.stood(said);
            link.stood(said);
            return;
          case "unreachable":
            deps.unreachable(said.key, said.upstream);
            return;
          default:
            unhandled("what the preview server said", said);
        }
      },
      close(ws) {
        link.closed(ws.id);
      },
    })
    .all(
      `${ORIGIN_PATH}:key/*`,
      { ...hidden, parse: "none" },
      async ({ params, request, server }) => {
        if (!requestFromServer(request, server)) {
          return notServerResponse();
        }
        const relayed = asSent(request);
        if (!relayed) {
          return new Response("A relayed request names where it was reached.", {
            status: 400,
          });
        }
        const key = params.key === "-" ? undefined : params.key;
        try {
          return await onOrigin(relayed.sent, key, relayed.lockDomain);
        } catch (error) {
          previewFailed(
            HOP,
            key ?? null,
            `the hub failed its own path: ${causeOf(error)}`
          );
          return new Response("The hub failed this request.", { status: 500 });
        }
      }
    )
    .ws(`${SYNC_PATH}:key/:artifact`, {
      open(ws) {
        const { key, artifact } = ws.params;
        if (!fromServer((name) => ws.headers[name], ws.remoteAddress)) {
          ws.close(4403, "Only this hub's preview server opens this link.");
          return;
        }
        if (!deps.origin.servedOn(artifact, key)) {
          ws.close(4404, "This origin serves no such artifact.");
          return;
        }
        const end: ArtifactSocketEnd = {
          data: {
            artifactId: artifact,
            at: key,
            screen: ws.query.screen === "1",
          },
          send: (message) => ws.send(message),
          close: (code, reason) => ws.close(code, reason),
        };
        synced.set(ws.id, end);
        deps.origin.socket.open(end);
      },
      message(ws, message) {
        const end = synced.get(ws.id);
        if (end && typeof message === "string") {
          deps.origin.socket.message(end, message);
        } else if (end && message instanceof Uint8Array) {
          deps.origin.socket.message(end, Buffer.from(message));
        }
      },
      close(ws) {
        const end = synced.get(ws.id);
        synced.delete(ws.id);
        if (end) {
          deps.origin.socket.close(end);
        }
      },
    })
    .ws(`${STORE_SYNC_PATH}:key/:scope`, {
      open(ws) {
        const { key, scope } = ws.params;
        if (!fromServer((name) => ws.headers[name], ws.remoteAddress)) {
          ws.close(4403, "Only this hub's preview server opens this link.");
          return;
        }
        const store = deps.origin.storeOf(key, scope);
        if (typeof store === "string") {
          ws.close(4404, store);
          return;
        }
        const end: StoreSocketEnd = {
          data: { store },
          send: (message) => ws.send(message),
          close: (code, reason) => ws.close(code, reason),
        };
        stored.set(ws.id, end);
        deps.origin.stores.open(end);
      },
      message(ws, message) {
        const end = stored.get(ws.id);
        if (end && typeof message === "string") {
          deps.origin.stores.message(end, message);
        } else if (end && message instanceof Uint8Array) {
          deps.origin.stores.message(end, Buffer.from(message));
        }
      },
      close(ws) {
        const end = stored.get(ws.id);
        stored.delete(ws.id);
        if (end) {
          deps.origin.stores.close(end);
        }
      },
    })
    .get(
      `${UPSTREAM_PATH}:key`,
      hidden,
      async ({
        params,
        request,
        server,
      }): Promise<UpstreamAnswer | ReturnType<typeof notServer>> => {
        if (!requestFromServer(request, server)) {
          return notServer();
        }
        const reached = deps.reach(params.key);
        return reached === undefined
          ? {
              ok: false,
              down: "closed",
              error: "no machine serves this origin",
              stop: { kind: "closed" },
            }
          : await reached;
      }
    )
    .post(
      `${REVIVE_PATH}:key`,
      hidden,
      async ({
        params,
        request,
        server,
      }): Promise<RevivedAnswer | ReturnType<typeof notServer>> => {
        if (!requestFromServer(request, server)) {
          return notServer();
        }
        return (
          (await deps.revive(params.key)) ?? {
            ok: false,
            down: "gone",
            why: null,
          }
        );
      }
    )
    .post(`${OPEN_PATH}:key`, hidden, ({ params, request, server }) => {
      if (!requestFromServer(request, server)) {
        return notServer();
      }
      const address = deps.listeners.address(params.key);
      return address instanceof ElysiaStatus ? address : { port: address.port };
    })
    .post(
      `${DOCUMENT_PATH}:id`,
      hidden,
      async ({ params, request, server }) => {
        if (!requestFromServer(request, server)) {
          return notServer();
        }
        const built = await deps.documents.build(params.id);
        return built
          ? { built: true }
          : problem(404, {
              code: "no-page-or-canvas",
              detail: "No page or canvas of that id.",
            });
      }
    );
};
