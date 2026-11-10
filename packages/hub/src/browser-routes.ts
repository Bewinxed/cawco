/**
 * The person's view of a project's browser, on the hub's own origin (Projects
 * spec §5.11 "Reaching the stream", build item 4). A dashboard or the app
 * reaches it here, authorised as every dashboard socket is (hub-auth.ts: the
 * person's, never a session's), and the hub relays it to the browser's
 * machine, to that machine's one browser listener (agent preview.ts
 * `listenBrowsers`, which answers the hub's token alone):
 *
 * - `/ws/browser/<instance>/<artifact>/api/ws`: neko's signaling socket
 *   (container host). Each `signal/provide` neko sends has its `iceservers`
 *   (neko 3.2.0 `message.SignalProvide`, json tag `iceservers`) replaced
 *   with the fleet's stream relay and a credential minted for this viewer
 *   for {@link VIEWER_RELAY_TTL_MS} while the fleet has one, and the
 *   fleet's STUN server (core `stunServer`).
 * - `/ws/browser/<instance>/<artifact>/api/*`: neko's REST.
 * - `/ws/browser/<instance>/<artifact>/cdp`: the take-over view of the local
 *   host (agent shield.ts `cdpView`): frames out, input in.
 *
 * Each answers only for an artifact of kind `browser` listed for that
 * session. Whatever credential the viewer's client sent (`Authorization`,
 * `?token`) goes no further: neko is given the viewer's own session, made
 * once per viewer by the daemon (`browser.viewerToken`), a viewer being one
 * paired device (or the trusted network) on one browser artifact. The
 * daemon is told how many views each browser has on every socket's open and
 * close (`browser.viewers`), which its unwatched hand-back reads.
 */
import { randomUUID } from "node:crypto";
import {
  BROWSER_LISTEN,
  BROWSER_VIEWER_TOKEN,
  BROWSER_VIEWERS,
  type BrowserFrame,
  type BrowserKey,
  type BrowserRelay,
  type BrowserViewerSession,
  browserMount,
  isBrowserKey,
} from "@cawco/core/browser";
import { detach } from "@cawco/core/detach";
import { PAIRING_REQUIRED } from "@cawco/core/hub-auth";
import { stunServer } from "@cawco/core/stream-relay";
import { HOUR_MS } from "@cawco/core/time";
import {
  causeOf,
  decodedHeaders,
  type PreviewSocket,
  previewWebSocket,
  proxyHeaders,
  RELAY_HEADER,
} from "@cawco/preview/proxy";
import type { ServerWebSocket } from "bun";
import { Elysia, ElysiaStatus, problem } from "elysia";
import { problemResponse } from "elysia/error";
import { z } from "zod";
import { answered } from "./browsers";
import type { ArtifactRow } from "./db/artifacts";
import { hidden } from "./hidden";
import type { Caller } from "./hub-auth";

import type { RelayCall } from "./stream-relay";

/** How long a viewer's stream relay credential lasts (Projects spec item 4). */
const VIEWER_RELAY_TTL_MS = 12 * HOUR_MS;

/** How long a viewer's session may take: its browser may be woken, its image built first. */
const VIEWER_MS = 15 * 60_000;
const LISTEN_MS = 30_000;
const VIEWERS_MS = 30_000;

/** What the routes' path is under, before the artifact's own part. */
const BASE = "/ws/browser";

const HOP = "hub browser relay";

/** The bytes a WebSocket close reason may take (RFC 6455 §5.5: a control frame's payload is 125 bytes, two of them the code). */
const REASON_BYTES = 123;

export interface BrowserStreamDeps {
  /** The artifact `id`, when there is one. */
  artifact: (id: string) => ArtifactRow | undefined;
  call: RelayCall;
  /** An HTTP route's caller, as the hub's gate classified its request (hub-auth.ts `callerOf`). */
  callerOf: (request: Request) => Caller;
  /** A socket's caller at its open, read as a dashboard socket's is (hub-auth.ts `classify`). */
  classify: (
    header: (name: string) => string | undefined,
    method: string,
    path: string,
    address: string | null
  ) => Caller;
  /** The browsers a machine has reported (db browsers). */
  keysOf: (machineId: string) => BrowserKey[];
  machineName: (machineId: string) => string;
  /** A credential of the fleet's stream relay, or null while it has none (stream-relay.ts). */
  mint: (userId: string, ttlMs: number) => BrowserRelay | null;
  /** Where the hub reaches a port of the machine's: its address, or the hub's end of its SSH connection (ssh-tunnels.ts); refused (browser-machine-unreached) when it is not connected. */
  reach: (
    machineId: string,
    port: number
  ) => Promise<
    | { address: string; port: number }
    | ReturnType<
        typeof problem<
          503,
          { code: "browser-machine-unreached"; detail: string }
        >
      >
  >;
}

/** The browser an artifact shows, and the machine it runs on. */
interface Place {
  key: BrowserKey;
  machineId: string;
}

/** The machine's browser listener, and the token it answers. */
interface Upstream {
  address: string;
  port: number;
  token: string;
}

/** One view's socket, as the routes hand it over. */
export interface ViewSocket {
  address: string | null;
  artifact: string;
  close: (code: number, reason: string) => void;
  header: (name: string) => string | undefined;
  id: string;
  instance: string;
  send: (message: string | ArrayBuffer | Uint8Array) => void;
  /** The token its client named itself by (its `?token`). */
  token: string | undefined;
}

/** A view's socket while it is open: relayed once its upstream is known, its first frames held until then. */
interface Relayed {
  adapter?: ServerWebSocket<PreviewSocket>;
  closed: boolean;
  /** The browser it counts as a view of, once counted. */
  counted?: Place;
  early: (string | Buffer<ArrayBuffer>)[];
}

const hostOf = (at: { address: string; port: number }): string =>
  `${at.address.includes(":") ? `[${at.address}]` : at.address}:${at.port}`;

const placeKey = (place: Place): string =>
  `${place.machineId}\u0000${place.key}`;

/** `why` cut to what a close reason may carry. */
const reasonOf = (why: string): string => {
  let reason = why;
  while (Buffer.byteLength(reason) > REASON_BYTES) {
    reason = reason.slice(0, -1);
  }
  return reason;
};

/** A neko frame with `signal/provide`'s ICE servers replaced by `servers`; any other frame as it came. */
const withIceServers = (text: string, servers: RTCIceServer[]): string => {
  if (!text.includes('"signal/provide"')) {
    return text;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  const read = z
    .looseObject({
      event: z.literal("signal/provide"),
      payload: z.looseObject({}),
    })
    .safeParse(parsed);
  if (!read.success) {
    return text;
  }
  const message = read.data;
  return JSON.stringify({
    ...message,
    payload: { ...message.payload, iceservers: servers },
  });
};

/** The token a view's client named itself by: its Bearer, else its `?token`. */
const clientToken = (
  authorization: string | null | undefined,
  url: URL
): string | undefined =>
  (authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : undefined) ||
  url.searchParams.get("token") ||
  undefined;

/** A frame as the view sent it: Elysia hands a text frame over parsed when it reads as JSON. */
const frameOf = (message: unknown): string | Buffer<ArrayBuffer> => {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message);
  }
  if (ArrayBuffer.isView(message)) {
    // A copy: Bun's frame is no SharedArrayBuffer, but its type allows one.
    return Buffer.from(
      new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
    );
  }
  return JSON.stringify(message);
};

export const createBrowserStream = (deps: BrowserStreamDeps) => {
  /** Each machine's browser listener as the hub reaches it, and the starts in flight. */
  const reached = new Map<string, Upstream>();
  const reaching = new Map<string, ReturnType<typeof listenOn>>();
  /** Each viewer's neko session, or its refusal; `ready` once it was answered. */
  const viewers = new Map<
    string,
    { place: Place; ready: boolean; session: ReturnType<typeof sessionOf> }
  >();
  /** How many views each browser has open now. */
  const views = new Map<string, number>();
  const sockets = new Map<string, Relayed>();

  /** The browser artifact `artifact` of session `instance`; refused when it is no such thing. */
  const placeOf = (instance: string, artifact: string) => {
    const row = deps.artifact(artifact);
    const page =
      row && "page" in row.source ? (row.source.page as unknown) : undefined;
    if (!(
      row?.kind === "browser" &&
      row.instanceId === instance &&
      row.machineId &&
      isBrowserKey(page)
    )) {
      return problem(404, {
        code: "browser-unknown",
        detail: "This session has no such browser.",
      });
    }
    const place: Place = { key: page, machineId: row.machineId };
    return place;
  };

  /**
   * Who is viewing: one paired device (or the trusted network) on one browser
   * artifact, under the token its client named itself by (neko's client sends
   * it as its Bearer and `?token`), so a client that names each view gets a
   * session for each.
   */
  const viewerIdOf = (
    caller: Caller,
    artifact: string,
    named: string | undefined
  ): string =>
    JSON.stringify([
      caller.kind === "owner" ? (caller.device?.id ?? "trusted") : caller.kind,
      artifact,
      named ?? "",
    ]);

  /** The machine's browser listener started and reached, or the refusal of either. */
  const listenOn = async (machineId: string) => {
    const token = randomUUID();
    const listened = answered<{ port: number }>(
      await deps.call(machineId, BROWSER_LISTEN, [{ token }], LISTEN_MS),
      deps.machineName(machineId),
      "be reached"
    );
    if (listened instanceof ElysiaStatus) {
      return listened;
    }
    const at = await deps.reach(machineId, listened.port);
    if (at instanceof ElysiaStatus) {
      return at;
    }
    const upstream: Upstream = { ...at, token };
    return upstream;
  };

  const listenerOf = (machineId: string) => {
    const known = reached.get(machineId);
    if (known) {
      return known;
    }
    const inFlight = reaching.get(machineId);
    if (inFlight !== undefined) {
      return inFlight;
    }
    const start = listenOn(machineId);
    reaching.set(machineId, start);
    start
      .then(
        (upstream) => {
          if (
            reaching.get(machineId) === start &&
            !(upstream instanceof ElysiaStatus)
          ) {
            reached.set(machineId, upstream);
          }
        },
        () => undefined
      )
      .finally(() => {
        if (reaching.get(machineId) === start) {
          reaching.delete(machineId);
        }
      });
    return start;
  };

  /** The listener at `at` did not answer: the next view asks the machine for it again. */
  const forgetListener = (machineId: string, at: Upstream): void => {
    if (reached.get(machineId) === at) {
      reached.delete(machineId);
    }
  };

  /** A neko session of `place`'s browser for one viewer, or its machine's refusal. */
  const sessionOf = async (place: Place) =>
    answered<BrowserViewerSession>(
      await deps.call(
        place.machineId,
        BROWSER_VIEWER_TOKEN,
        [{ key: place.key }],
        VIEWER_MS
      ),
      deps.machineName(place.machineId),
      "be viewed"
    );

  const viewerOf = (viewerId: string, place: Place) => {
    const held = viewers.get(viewerId);
    if (held) {
      return held.session;
    }
    const session = sessionOf(place);
    const entry = { place, ready: false, session };
    viewers.set(viewerId, entry);
    const forget = () => {
      if (viewers.get(viewerId) === entry) {
        viewers.delete(viewerId);
      }
    };
    session.then((answer) => {
      if (answer instanceof ElysiaStatus) {
        forget();
      } else {
        entry.ready = true;
      }
    }, forget);
    return session;
  };

  const forgetViewer = (viewerId: string): void => {
    viewers.delete(viewerId);
  };

  /** `place`'s daemon told it has `now` views (core `BROWSER_VIEWERS`). */
  const tell = (place: Place, now: number): void =>
    detach(
      deps
        .call(
          place.machineId,
          BROWSER_VIEWERS,
          [{ key: place.key, count: now }],
          VIEWERS_MS
        )
        .then((read) => {
          if (read.kind === "unanswered" || !read.value.ok) {
            console.warn(
              `[browser] ${deps.machineName(place.machineId)} was not told ${place.key} has ${now} view${now === 1 ? "" : "s"}: ${read.kind === "unanswered" ? read.reason : (read.value.error ?? "refused")}`
            );
          }
        }),
      "browser viewers"
    );

  /** One more (or one fewer) view of `place`: the daemon told the count. */
  const count = (place: Place, by: 1 | -1): void => {
    const at = placeKey(place);
    const now = Math.max(0, (views.get(at) ?? 0) + by);
    if (now === 0) {
      views.delete(at);
    } else {
      views.set(at, now);
    }
    tell(place, now);
  };

  /**
   * The ICE servers a viewer's offer carries: the stream relay with its own
   * credential while the fleet has one, and the fleet's STUN server (core
   * `stunServer`, the one neko's own list names). Full ICE: host, server
   * reflexive and relay candidates, no server no one chose.
   */
  const iceServersFor = (session: string): RTCIceServer[] => {
    const relay = deps.mint(`viewer:${session}`, VIEWER_RELAY_TTL_MS);
    return [
      ...(relay
        ? [
            {
              urls: relay.urls,
              username: relay.username,
              credential: relay.credential,
            },
          ]
        : []),
      { urls: [stunServer()] },
    ];
  };

  const shut = (socket: ViewSocket, code: number, why: string): void =>
    socket.close(code, reasonOf(why));

  /**
   * The view's socket as the preview relay's socket (core `previewWebSocket`):
   * to the machine's listener at `at`, with the viewer's neko session; each
   * neko frame on its way to the view with the viewer's ICE servers.
   */
  const relayTo = (
    socket: ViewSocket,
    to: { at: Upstream; kind: "api" | "cdp"; place: Place },
    viewer: { id: string; session: BrowserViewerSession } | undefined
  ): ServerWebSocket<PreviewSocket> => {
    const { at, kind, place } = to;
    const servers = viewer ? iceServersFor(viewer.session.session) : undefined;
    /** Whether neko has said its `system/init`: a disconnect before it is its refusal of the session. */
    let initiated = false;
    const data: PreviewSocket = {
      url: `ws://${hostOf(at)}${browserMount(place.key)}/${kind === "api" ? "api/ws" : "cdp"}`,
      protocol: "",
      headers: new Headers({
        [RELAY_HEADER]: at.token,
        ...(viewer ? { authorization: `Bearer ${viewer.session.token}` } : {}),
      }),
      pending: [],
      closed: false,
      opened: false,
      hop: HOP,
      instanceId: socket.instance,
      nothingListens: () => forgetListener(place.machineId, at),
    };
    return {
      data,
      send: (frame: string | ArrayBuffer) => {
        if (typeof frame !== "string" || !(servers && viewer)) {
          socket.send(frame);
          return;
        }
        if (!initiated) {
          if (frame.includes('"system/init"')) {
            initiated = true;
          } else if (frame.includes('"system/disconnect"')) {
            forgetViewer(viewer.id);
          }
        }
        socket.send(withIceServers(frame, servers));
      },
      close: (code: number, reason: string) => shut(socket, code, reason),
    } as unknown as ServerWebSocket<PreviewSocket>;
  };

  /** A view's socket opened: relayed to the machine once its browser and viewer are known. */
  const open = async (socket: ViewSocket, kind: "api" | "cdp") => {
    const entry: Relayed = { closed: false, early: [] };
    sockets.set(socket.id, entry);
    const path = `${BASE}/${socket.instance}/${socket.artifact}/${kind === "api" ? "api/ws" : "cdp"}`;
    // The person's alone, read again at the open as the dashboard's socket
    // is (the gate let only them upgrade): a browser reads no refused
    // upgrade's answer, only a close's code and reason.
    const caller = deps.classify(socket.header, "GET", path, socket.address);
    if (!(caller.kind === "owner" || caller.kind === "hub")) {
      shut(socket, 4401, PAIRING_REQUIRED);
      return;
    }
    try {
      const relayed = await relay(socket, kind, caller, entry);
      // A refusal closes the view with its status, in its words.
      if (relayed instanceof ElysiaStatus) {
        shut(socket, 4000 + relayed.status, relayed.response.detail);
      }
    } catch (error) {
      console.warn(`[browser] ${path} was not relayed: ${causeOf(error)}`);
      shut(socket, 1011, causeOf(error));
    }
  };

  /** The view's socket relayed to its machine's listener, the frames sent early first; the refusal of its browser, viewer or listener. */
  const relay = async (
    socket: ViewSocket,
    kind: "api" | "cdp",
    caller: Caller,
    entry: Relayed
  ) => {
    const place = placeOf(socket.instance, socket.artifact);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    const viewerId = viewerIdOf(caller, socket.artifact, socket.token);
    const viewer = kind === "api" ? await viewerOf(viewerId, place) : undefined;
    if (viewer instanceof ElysiaStatus) {
      return viewer;
    }
    const at = await listenerOf(place.machineId);
    if (at instanceof ElysiaStatus) {
      return at;
    }
    if (entry.closed) {
      return;
    }
    const adapter = relayTo(
      socket,
      { at, kind, place },
      viewer ? { id: viewerId, session: viewer } : undefined
    );
    entry.adapter = adapter;
    previewWebSocket.open?.(adapter);
    for (const frame of entry.early.splice(0)) {
      previewWebSocket.message(adapter, frame);
    }
    entry.counted = place;
    count(place, 1);
  };

  const message = (socket: ViewSocket, sent: unknown): void => {
    const entry = sockets.get(socket.id);
    if (!entry) {
      return;
    }
    const frame = frameOf(sent);
    if (entry.adapter) {
      previewWebSocket.message(entry.adapter, frame);
    } else {
      entry.early.push(frame);
    }
  };

  const close = (socket: ViewSocket, code: number, reason: string): void => {
    const entry = sockets.get(socket.id);
    sockets.delete(socket.id);
    if (!entry) {
      return;
    }
    entry.closed = true;
    entry.early.length = 0;
    if (entry.adapter) {
      previewWebSocket.close?.(entry.adapter, code, reason);
    }
    if (entry.counted) {
      count(entry.counted, -1);
    }
  };

  /** One neko REST request, relayed with the viewer's own session in place of whatever its client sent. */
  const forward = async (
    request: Request,
    instance: string,
    artifact: string
  ) => {
    const place = placeOf(instance, artifact);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    const url = new URL(request.url);
    const viewerId = viewerIdOf(
      deps.callerOf(request),
      artifact,
      clientToken(request.headers.get("authorization"), url)
    );
    const viewer = await viewerOf(viewerId, place);
    if (viewer instanceof ElysiaStatus) {
      return viewer;
    }
    const at = await listenerOf(place.machineId);
    if (at instanceof ElysiaStatus) {
      return at;
    }
    // `/ws/browser/<instance>/<artifact>/api/<rest>`, as the client wrote it.
    const rest = url.pathname.split("/").slice(6).join("/");
    url.searchParams.delete("token");
    const headers = proxyHeaders(request.headers);
    for (const name of ["cookie", "origin", "referer", "host"]) {
      headers.delete(name);
    }
    headers.set("authorization", `Bearer ${viewer.token}`);
    headers.set(RELAY_HEADER, at.token);
    let response: Response;
    try {
      response = await fetch(
        `http://${hostOf(at)}${browserMount(place.key)}/api/${rest}${url.search}`,
        {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        }
      );
    } catch (error) {
      forgetListener(place.machineId, at);
      return problemResponse({
        status: 502,
        code: "browser-listener-didnt-answer",
        detail: `${deps.machineName(place.machineId)}'s browser listener didn't answer the hub: ${causeOf(error)}`,
      });
    }
    // neko no longer knows the session (its container was made again): the
    // viewer's next request is given a new one.
    if (response.status === 401) {
      forgetViewer(viewerId);
    }
    const answer = decodedHeaders(response.headers);
    answer.delete("set-cookie");
    return new Response(response.body, {
      status: response.status,
      headers: answer,
    });
  };

  return {
    open,
    message,
    close,
    forward,
    /**
     * A machine registered: its browser listener is asked for again (an
     * agent that restarted serves another port), and its daemon is told how
     * many views each of its browsers has now: none, after the hub itself
     * restarted, which a daemon still holding an older count would not learn
     * otherwise, and its unwatched hand-back would never come.
     */
    connected(machineId: string): void {
      reached.delete(machineId);
      for (const key of deps.keysOf(machineId)) {
        tell({ key, machineId }, views.get(placeKey({ key, machineId })) ?? 0);
      }
    },
    /**
     * A machine's browsers, whole: a viewer's session of a browser that is
     * no longer live is forgotten (neko's sessions go with its container).
     */
    heard(machineId: string, frame: BrowserFrame): void {
      for (const [viewerId, held] of viewers) {
        if (
          held.ready &&
          held.place.machineId === machineId &&
          !frame.browsers.some(
            (row) => row.key === held.place.key && row.state === "live"
          )
        ) {
          viewers.delete(viewerId);
        }
      }
    },
  };
};

export type BrowserStream = ReturnType<typeof createBrowserStream>;

/** Bun's own socket under an Elysia one: its frames go out as they came, never serialised again. */
interface RawSocket {
  close: (code?: number, reason?: string) => void;
  send: (message: string | ArrayBuffer | Uint8Array) => unknown;
}

/**
 * An Elysia socket as a {@link ViewSocket}. Every callback's socket is an
 * `ElysiaWS`, whose `raw` is Bun's socket; the route's context type leaves
 * it out.
 */
const viewOf = (ws: {
  id: string;
  params: { instance: string; artifact: string };
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  remoteAddress?: string;
}): ViewSocket => {
  const { raw } = ws as unknown as { raw: RawSocket };
  const bearer = ws.headers.authorization;
  return {
    token:
      (bearer?.startsWith("Bearer ")
        ? bearer.slice("Bearer ".length).trim()
        : undefined) ||
      ws.query.token ||
      undefined,
    id: ws.id,
    instance: ws.params.instance,
    artifact: ws.params.artifact,
    header: (name) => ws.headers[name],
    address: ws.remoteAddress ?? null,
    send: (message) => {
      raw.send(message);
    },
    close: (code, reason) => raw.close(code, reason),
  };
};

/** A view's socket for `kind`, relayed through `stream`. */
const streamSocket = (stream: BrowserStream, kind: "api" | "cdp") => ({
  open: (ws: Parameters<typeof viewOf>[0]) => stream.open(viewOf(ws), kind),
  message: (ws: Parameters<typeof viewOf>[0], sent: unknown) =>
    stream.message(viewOf(ws), sent),
  close: (ws: Parameters<typeof viewOf>[0], code?: number, reason?: string) =>
    stream.close(viewOf(ws), code ?? 1000, reason ?? ""),
});

/** The view's three routes (see the head of this file). */
export const browserStreamRoutes = (stream: BrowserStream) =>
  new Elysia()
    .ws(`${BASE}/:instance/:artifact/api/ws`, streamSocket(stream, "api"))
    .ws(`${BASE}/:instance/:artifact/cdp`, streamSocket(stream, "cdp"))
    .all(
      `${BASE}/:instance/:artifact/api/*`,
      // Bodies stream on to neko; neko's own REST is no route of the hub's API.
      { ...hidden, parse: "none" },
      ({ request, params }) =>
        stream.forward(request, params.instance, params.artifact)
    );
