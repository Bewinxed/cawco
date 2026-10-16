/**
 * A hub on tape: what a dashboard reads from a hub, recorded once from a
 * scratch fleet and served back byte for byte, so a probe that measures the
 * dashboard reads the same fleet on every run, in any workspace, with no
 * fleet standing.
 *
 * `recorder(target)` stands between the dashboard's server and a real hub:
 * every HTTP exchange (method, path and query, request body, status,
 * response) and every socket's frames, both ways in order, go on the tape.
 * `player(tape)` answers as that hub did:
 *  - HTTP: the first response recorded for the request (method, path, query
 *    and body, the client's own random ids masked); a request the tape never
 *    saw is a 404 and a miss.
 *  - A socket: the hub's frames the recorded connection opened with, then,
 *    for each frame the page sends, the frames the hub answered the same
 *    frame with on tape (its ids put back to the page's own); a frame the
 *    tape never saw is a miss.
 * A miss is listed (`misses`), never guessed at: a probe prints them.
 *
 * A preview's own origin (a session's port, the tape's own number, which
 * the page reads off the tape) is no hub the dashboard's server reaches:
 * the page goes there itself. Each page's context routes it (`attach`):
 * its HTTP is recorded and answered by port and path, its sockets by frame,
 * so the preview and its overlay load from the tape with nothing listening.
 *
 * An artifact's doc socket (`/ws/artifact/…` on the hub, `/__cawco/artifact/…`
 * on the preview's origin) speaks y-websocket in binary frames, which hold
 * the page's own random client ids, so it is played by the hub's own rules
 * (hub artifacts/sync.ts `artifactSocket`), not by bytes: the page's sync
 * step 1 gets the step 2 the tape holds; its step 2 and its updates go to
 * the artifact's other sockets, as the hub relays them; awareness and text
 * frames get nothing, as the hub ignores them.
 *
 * Time stands still at `tape.at`: the page's clock is frozen there
 * (`page.clock.setFixedTime`), so every "2m ago" the tape's times make
 * reads the same on every run.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import type { BrowserContext, Route } from "playwright-core";

/** One HTTP exchange as the hub answered it. */
export interface TapeHttp {
  binary: boolean;
  /** The request body, ids masked (`canonical`); "" for none. */
  body: string;
  /** The response body: text, or base64 when `binary`. */
  bytes: string;
  headers: Record<string, string>;
  method: string;
  /** Path and query, as the dashboard's server asked it. */
  path: string;
  status: number;
}

/** One HTTP exchange on a preview's own origin: its port, then as on the hub. */
export interface TapePreview extends TapeHttp {
  port: string;
}

/** One frame: a text frame as sent, or a binary frame's bytes in base64. */
export interface TapeFrame {
  binary?: true;
  data: string;
  dir: "in" | "out";
}

/** One socket: its path and query, and its frames in order (`in` from the hub). */
export interface TapeSocket {
  frames: TapeFrame[];
  path: string;
}

export interface Tape {
  /** The moment the page's clock stands at (ms since the epoch). */
  at: number;
  http: TapeHttp[];
  /** What the previews' own origins answered. */
  preview: TapePreview[];
  /** What the recording made, by name (a session's id, a project's), for the probe's routes. */
  scene: Record<string, string>;
  sockets: TapeSocket[];
}

/**
 * Routes a page's context to the tape: the previews' origins, whose URLs
 * `isPreview` knows (any loopback origin but the dashboard's and the hub's).
 */
export type Attach = (
  context: BrowserContext,
  isPreview: (url: URL) => boolean
) => Promise<void>;

/** What a socket carries: a text frame, or a binary one's bytes. */
type Wire = string | Uint8Array<ArrayBuffer>;

const frameOf = (dir: TapeFrame["dir"], data: Wire): TapeFrame =>
  typeof data === "string"
    ? { dir, data }
    : { dir, data: Buffer.from(data).toString("base64"), binary: true };

const wireOf = (frame: TapeFrame): Wire =>
  frame.binary ? new Uint8Array(Buffer.from(frame.data, "base64")) : frame.data;

/** A socket message as Bun or Playwright hands it over. */
const wire = (message: string | ArrayBuffer | Uint8Array): Wire =>
  typeof message === "string" ? message : new Uint8Array(message);

/** y-protocols' sync message type, and its steps (sync.ts `messageYjsSyncStep1` …). */
const MESSAGE_SYNC = 0;
const SYNC_STEP_1 = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

/** A y-websocket frame's message type and, for a sync message, its step: lib0 varUints. */
function yjsKind(bytes: Uint8Array): { step: number; type: number } | null {
  let at = 0;
  const varUint = (): number | null => {
    let value = 0;
    for (let shift = 0; at < bytes.length && shift < 35; shift += 7) {
      const byte = bytes[at] as number;
      at += 1;
      value += (byte % 128) * 2 ** shift;
      if (byte < 128) {
        return value;
      }
    }
    return null;
  };
  const type = varUint();
  if (type === null) {
    return null;
  }
  const step = type === MESSAGE_SYNC ? varUint() : -1;
  return step === null ? null : { type, step };
}

const kindOf = (frame: TapeFrame) =>
  frame.binary ? yjsKind(new Uint8Array(Buffer.from(frame.data, "base64"))) : null;

/** A hub's update to an artifact's doc: what it relays from the artifact's other sockets. */
const isRelay = (frame: TapeFrame): boolean => {
  const kind = kindOf(frame);
  return kind?.type === MESSAGE_SYNC && kind.step === SYNC_UPDATE;
};

/** What a frame is matched by: a text frame by its masked text, a y-websocket frame by its kind. */
function frameKey(frame: TapeFrame): string {
  if (!frame.binary) {
    return canonical(frame.data);
  }
  const kind = kindOf(frame);
  return kind ? `yjs ${kind.type}.${kind.step}` : `bytes ${frame.data}`;
}

/** A page's end of a socket the player answers. */
interface Peer {
  send: (data: Wire) => void;
}

/** An artifact's doc socket on either origin, by the artifact's id. */
const ARTIFACT_SOCKET =
  /^\/(?:ws\/artifact\/[^/]+|__cawco\/artifact)\/([0-9a-f-]{36})$/;

/**
 * What a page's socket plays: an artifact's doc sockets, the pane's on the
 * hub and the page's own on the preview's origin, by the artifact (the hub
 * keeps one doc per artifact and answers any of its sockets from it, sync.ts
 * `docs.join`); any other socket by its path.
 */
const scriptKey = (pathname: string): string => {
  const artifact = pathname.match(ARTIFACT_SOCKET)?.[1];
  return artifact ? `artifact ${artifact}` : pathname;
};

/** The keys whose values the page makes up itself, fresh on every run. */
const ID_KEYS = new Set([
  "requestId",
  "commandId",
  "clientId",
  // A preview pane's own id, in what it reports (`…/artifacts/<id>/shown`).
  "client",
  "nonce",
  "subscriptionId",
]);
const MASK = "<id>";

/** A frame or body with the page's own ids masked: equal for the same request on any run. */
export function canonical(text: string): string {
  if (!text) {
    return "";
  }
  try {
    return JSON.stringify(
      JSON.parse(text, (key, value) =>
        ID_KEYS.has(key) && typeof value === "string" ? MASK : value
      )
    );
  } catch {
    return text;
  }
}

/** The page's own ids in a frame or body, by key path, for putting back into the answers. */
function idsOf(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (value: unknown, at: string) => {
    if (Array.isArray(value)) {
      for (const [i, one] of value.entries()) {
        walk(one, `${at}.${i}`);
      }
    } else if (value && typeof value === "object") {
      for (const [key, one] of Object.entries(value)) {
        if (ID_KEYS.has(key) && typeof one === "string") {
          out.set(`${at}.${key}`, one);
        } else {
          walk(one, `${at}.${key}`);
        }
      }
    }
  };
  try {
    walk(JSON.parse(text), "");
  } catch {
    // not JSON: no ids
  }
  return out;
}

const TEXT_TYPE = /json|text|javascript|xml|svg|css|html/i;
const HTTP_SCHEME = /^http/;
/** Hop-by-hop and length headers: the server that answers sets its own. */
const DROPPED = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
  "date",
]);
const HTTP_KEY = (method: string, path: string, body: string) =>
  `${method} ${normalPath(path)} ${body}`;

/** A path with its query sorted: the same request asked in another order. */
function normalPath(path: string): string {
  const url = new URL(path, "http://tape");
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}

/** Headers a request is forwarded with: the client's own, less the hop's. */
function forwardHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of headers) {
    if (!(
      DROPPED.has(key) ||
      key === "host" ||
      key === "upgrade" ||
      key.startsWith("sec-websocket")
    )) {
      out[key] = value;
    }
  }
  return out;
}

interface SocketData {
  /** The page's frames sent before the hub's socket opened. */
  early: Wire[];
  path: string;
  record: TapeSocket | null;
  upstream: WebSocket | null;
}

/**
 * The dashboard's origin as a preview's answers name it: the run's own
 * port, fresh every run, in the page's `frame-ancestors` and the overlay's
 * parents (hub preview.ts `previewParents`). Masked on the tape, put back
 * as the replaying dashboard's.
 */
const PARENT_MASK = "<dashboard-origin>";

/** The dashboard page a preview request comes from: the preview frame's parent, or the page itself. */
function parentOrigin(route: Route): string {
  try {
    const frame = route.request().frame();
    const { origin } = new URL((frame.parentFrame() ?? frame).url());
    return origin === "null" ? "" : origin;
  } catch {
    return "";
  }
}

const withParent = (text: string, from: string, to: string): string =>
  from ? text.replaceAll(from, to) : text;

/** A preview origin's response as the tape keeps it, the asking dashboard's origin masked. */
function previewExchange(
  url: URL,
  method: string,
  body: string,
  parent: string,
  response: { bytes: Uint8Array; headers: Record<string, string>; status: number }
): TapePreview {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(response.headers)) {
    if (!DROPPED.has(key)) {
      kept[key] = withParent(value, parent, PARENT_MASK);
    }
  }
  const { "content-type": type }: { "content-type"?: string } = kept;
  const binary = !TEXT_TYPE.test(type ?? "text/plain");
  return {
    port: url.port,
    method,
    path: `${url.pathname}${url.search}`,
    body,
    status: response.status,
    headers: kept,
    binary,
    bytes: binary
      ? Buffer.from(response.bytes).toString("base64")
      : withParent(
          new TextDecoder().decode(response.bytes),
          parent,
          PARENT_MASK
        ),
  };
}

const PREVIEW_KEY = (port: string, method: string, path: string, body: string) =>
  `${port} ${HTTP_KEY(method, path, body)}`;

/**
 * A proxy to `target` (a hub's `http://host:port`) that records every
 * exchange onto `tape`. Its address is the hub a dashboard is served against.
 */
export function recorder(target: string, tape: Tape) {
  const server = Bun.serve<SocketData>({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request, srv) {
      const url = new URL(request.url);
      const path = `${url.pathname}${url.search}`;
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const record: TapeSocket = { path, frames: [] };
        tape.sockets.push(record);
        const upstream = new (
          WebSocket as unknown as new (
            url: string,
            options?: { headers: Record<string, string> }
          ) => WebSocket
        )(`${target.replace(HTTP_SCHEME, "ws")}${path}`, {
          headers: forwardHeaders(request.headers),
        });
        const data: SocketData = { early: [], path, record, upstream };
        if (srv.upgrade(request, { data })) {
          return;
        }
        upstream.close();
        return new Response("upgrade failed", { status: 400 });
      }
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer();
      const response = await fetch(`${target}${path}`, {
        method: request.method,
        headers: forwardHeaders(request.headers),
        body,
        redirect: "manual",
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const headers: Record<string, string> = {};
      for (const [key, value] of response.headers) {
        if (!DROPPED.has(key)) {
          headers[key] = value;
        }
      }
      const binary = !TEXT_TYPE.test(
        response.headers.get("content-type") ?? "text/plain"
      );
      tape.http.push({
        method: request.method,
        path,
        body: body ? canonical(new TextDecoder().decode(body)) : "",
        status: response.status,
        headers,
        binary,
        bytes: binary
          ? Buffer.from(bytes).toString("base64")
          : new TextDecoder().decode(bytes),
      });
      return new Response(bytes, { status: response.status, headers });
    },
    websocket: {
      open(ws) {
        const { upstream, record } = ws.data;
        if (!(upstream && record)) {
          return;
        }
        // Binary frames stay binary both ways: an artifact's doc speaks
        // y-websocket, and the hub ignores a text frame there.
        upstream.binaryType = "arraybuffer";
        upstream.onmessage = (event) => {
          const data = wire(event.data as string | ArrayBuffer);
          record.frames.push(frameOf("in", data));
          ws.send(data);
        };
        upstream.onopen = () => {
          for (const early of ws.data.early) {
            upstream.send(early);
          }
          ws.data.early = [];
        };
        upstream.onclose = () => ws.close();
        upstream.onerror = () => ws.close();
      },
      message(ws, message) {
        const data = wire(message);
        ws.data.record?.frames.push(frameOf("out", data));
        const { upstream } = ws.data;
        if (upstream?.readyState === WebSocket.OPEN) {
          upstream.send(data);
        } else {
          ws.data.early.push(data);
        }
      },
      close(ws) {
        ws.data.upstream?.close();
      },
    },
  });
  /**
   * The previews' origins' HTTP, recorded on its way, by port and path. The
   * page's own doc socket there goes to the hub as it is: an artifact's doc
   * sockets are played by the artifact (`scriptKey`), so the pane's,
   * recorded through this proxy, answer it.
   */
  const attach: Attach = async (context, isPreview) => {
    await context.route(isPreview, async (route) => {
      const request = route.request();
      const response = await route.fetch();
      const bytes = new Uint8Array(await response.body());
      tape.preview.push(
        previewExchange(
          new URL(request.url()),
          request.method(),
          canonical(request.postData() ?? ""),
          parentOrigin(route),
          { status: response.status(), headers: response.headers(), bytes }
        )
      );
      await route.fulfill({ response, body: Buffer.from(bytes) });
    });
  };
  return {
    base: `http://127.0.0.1:${server.port}`,
    attach,
    stop: () => server.stop(true),
  };
}

/**
 * A recorded connection's page frames, each with the hub frames that answer
 * it, in order: a hub frame that carries a page frame's id (a `requestId`)
 * answers that frame, however late it came; a hub's sync step 2 answers the
 * page's last step 1; a hub's doc update answers nothing (it relays another
 * socket's, which a replay relays itself); any other answers the page frame
 * sent last before it. Hub frames before the page's first are the
 * connection's opening (`player` sends them on connect).
 */
function answered(socket: TapeSocket): [TapeFrame, TapeFrame[]][] {
  const out: [TapeFrame, TapeFrame[]][] = [];
  const byId = new Map<string, TapeFrame[]>();
  let last: TapeFrame[] | null = null;
  let stepOne: TapeFrame[] | null = null;
  /** The page frame a hub frame answers, or none. */
  const ownerOf = (frame: TapeFrame): TapeFrame[] | null => {
    if (!frame.binary) {
      return [...byId].find(([id]) => frame.data.includes(id))?.[1] ?? last;
    }
    if (isSync(frame, SYNC_STEP_2)) {
      return stepOne;
    }
    return isRelay(frame) ? null : last;
  };
  for (const frame of socket.frames) {
    if (frame.dir === "in") {
      ownerOf(frame)?.push(frame);
      continue;
    }
    const replies: TapeFrame[] = [];
    out.push([frame, replies]);
    for (const id of frame.binary ? [] : idsOf(frame.data).values()) {
      byId.set(id, replies);
    }
    if (isSync(frame, SYNC_STEP_1)) {
      stepOne = replies;
    }
    last = replies;
  }
  return out;
}

/** Whether a frame is a y-websocket sync message at `step`. */
const isSync = (frame: TapeFrame, step: number): boolean => {
  const kind = kindOf(frame);
  return kind?.type === MESSAGE_SYNC && kind.step === step;
};

/**
 * How a page frame on an artifact's doc socket is met, by the hub's rules
 * (sync.ts `artifactSocket.message`): a text frame or a non-sync message is
 * ignored; a step 2 or an update is applied and relayed to the artifact's
 * other sockets as an update; a step 1 is answered (the tape's step 2).
 */
function artifactFrame(data: Wire): "ignored" | "relayed" | "answered" {
  if (typeof data === "string") {
    return "ignored";
  }
  const kind = yjsKind(data);
  if (kind?.type !== MESSAGE_SYNC) {
    return "ignored";
  }
  if (kind.step === SYNC_STEP_2 || kind.step === SYNC_UPDATE) {
    return "relayed";
  }
  return kind.step === SYNC_STEP_1 ? "answered" : "ignored";
}

/**
 * A connection's opening: the hub's frames before the page's first, less
 * any that answer a page frame (a reply can beat the page's next send) and
 * any relay (a replay relays its own).
 */
function opening(script: TapeSocket): TapeFrame[] {
  const owned = new Set(answered(script).flatMap(([, r]) => r));
  const first = script.frames.findIndex((frame) => frame.dir === "out");
  return script.frames
    .slice(0, first === -1 ? script.frames.length : first)
    .filter((frame) => !(owned.has(frame) || isRelay(frame)));
}

/** A recorded answer for the page's `data`: binary as recorded, text with the page's own ids put back for the recorded page's. */
function repliesTo(
  found: { frame: TapeFrame; replies: TapeFrame[] },
  data: Wire
): Wire[] {
  const recorded = found.frame.binary
    ? new Map<string, string>()
    : idsOf(found.frame.data);
  const own =
    typeof data === "string" ? idsOf(data) : new Map<string, string>();
  const swaps = [...recorded].flatMap(([at, was]) => {
    const now = own.get(at);
    return now && now !== was ? [[was, now] as const] : [];
  });
  return found.replies.map((reply) =>
    reply.binary
      ? wireOf(reply)
      : swaps.reduce((out, [was, now]) => out.replaceAll(was, now), reply.data)
  );
}

/** A page's step 2 or update, to the artifact's other sockets, as the hub relays it. */
function relay(
  room: Set<Peer> | null,
  from: Peer,
  data: Uint8Array<ArrayBuffer>
): void {
  for (const other of room ?? []) {
    if (other !== from) {
      other.send(asUpdate(data));
    }
  }
}

/** A step 2 or an update, as the hub relays it: an update (one-byte varUints: `[0, 2, …]`). */
const asUpdate = (data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const update = data.slice();
  update[1] = SYNC_UPDATE;
  return update;
};

/** What a player could not answer from its tape. */
export interface Miss {
  what: string;
}

/** The hub `tape` recorded, answering again: its address, and what it could not answer. */
export function player(tape: Tape) {
  const http = new Map<string, TapeHttp>();
  for (const one of tape.http) {
    const key = HTTP_KEY(one.method, one.path, one.body);
    if (!http.has(key)) {
      http.set(key, one);
    }
  }
  const previews = new Map<string, TapePreview>();
  for (const one of tape.preview) {
    const key = PREVIEW_KEY(one.port, one.method, one.path, one.body);
    if (!previews.has(key)) {
      previews.set(key, one);
    }
  }
  // Every socket path's recorded connections; a connection plays the first.
  const scripts = new Map<string, TapeSocket[]>();
  for (const socket of tape.sockets) {
    const key = scriptKey(new URL(socket.path, "http://tape").pathname);
    scripts.set(key, [...(scripts.get(key) ?? []), socket]);
  }
  /**
   * For a page frame on a socket: the hub's answer frames, from the first
   * time the tape saw it answered (a connection the page left before its
   * answer came holds it unanswered).
   */
  const answers = new Map<
    string,
    { frame: TapeFrame; replies: TapeFrame[] }
  >();
  for (const [key, sockets] of scripts) {
    for (const socket of sockets) {
      for (const [frame, replies] of answered(socket)) {
        const at = `${key} ${frameKey(frame)}`;
        const had = answers.get(at);
        if (!had || (had.replies.length === 0 && replies.length > 0)) {
          answers.set(at, { frame, replies });
        }
      }
    }
  }
  const misses = new Set<string>();
  /** Each artifact's open doc sockets, on either origin: what a relay reaches. */
  const rooms = new Map<string, Set<Peer>>();

  /** A page's socket on `pathname`, answered from the tape; null when the tape has no such socket. */
  const connect = (pathname: string, peer: Peer) => {
    const played = scriptKey(pathname);
    const script = scripts.get(played)?.[0];
    if (!script) {
      misses.add(`socket ${pathname}`);
      return null;
    }
    const artifact = pathname.match(ARTIFACT_SOCKET)?.[1];
    const room = artifact ? (rooms.get(artifact) ?? new Set<Peer>()) : null;
    if (artifact && room) {
      rooms.set(artifact, room);
      room.add(peer);
    }
    for (const frame of opening(script)) {
      peer.send(wireOf(frame));
    }
    /** The tape's answer to a frame it must answer; a frame it never saw is a miss. */
    const answer = (data: Wire) => {
      const key = frameKey(frameOf("out", data));
      const found = answers.get(`${played} ${key}`);
      if (!found) {
        misses.add(`socket ${pathname} frame ${key.slice(0, 200)}`);
        return;
      }
      for (const reply of repliesTo(found, data)) {
        peer.send(reply);
      }
    };
    return {
      message(data: Wire) {
        const met = room ? artifactFrame(data) : "answered";
        if (met === "answered") {
          answer(data);
        } else if (met === "relayed" && typeof data !== "string") {
          relay(room, peer, data);
        }
      },
      close() {
        room?.delete(peer);
      },
    };
  };
  type Connection = NonNullable<ReturnType<typeof connect>>;

  /** The previews' origins on a page's context: HTTP from the tape by port and path, sockets as the hub's are. */
  const attach: Attach = async (context, isPreview) => {
    await context.route(isPreview, (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const path = `${url.pathname}${url.search}`;
      const body =
        method === "GET" || method === "HEAD"
          ? ""
          : canonical(request.postData() ?? "");
      const found = previews.get(PREVIEW_KEY(url.port, method, path, body));
      if (!found) {
        misses.add(
          `preview :${url.port} ${method} ${path}${body ? ` ${body.slice(0, 200)}` : ""}`
        );
        return route.fulfill({ status: 404, json: { error: "not on the tape" } });
      }
      const parent = parentOrigin(route);
      return route.fulfill({
        status: found.status,
        headers: Object.fromEntries(
          Object.entries(found.headers).map(([key, value]) => [
            key,
            withParent(value, PARENT_MASK, parent),
          ])
        ),
        body: found.binary
          ? Buffer.from(found.bytes, "base64")
          : withParent(found.bytes, PARENT_MASK, parent),
      });
    });
    await context.routeWebSocket(isPreview, (ws) => {
      const connection = connect(new URL(ws.url()).pathname, {
        send: (data) => ws.send(typeof data === "string" ? data : Buffer.from(data)),
      });
      ws.onMessage((message) => connection?.message(wire(message)));
      ws.onClose(() => connection?.close());
    });
  };

  const server = Bun.serve<{
    connection: Connection | null;
    pathname: string;
  }>({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request, srv) {
      const url = new URL(request.url);
      const path = `${url.pathname}${url.search}`;
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        if (
          srv.upgrade(request, {
            data: { pathname: url.pathname, connection: null },
          })
        ) {
          return;
        }
        return new Response("upgrade failed", { status: 400 });
      }
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? ""
          : canonical(await request.text());
      const found = http.get(HTTP_KEY(request.method, path, body));
      if (!found) {
        misses.add(
          `${request.method} ${path}${body ? ` ${body.slice(0, 200)}` : ""}`
        );
        return Response.json({ error: "not on the tape" }, { status: 404 });
      }
      return new Response(
        found.binary ? Buffer.from(found.bytes, "base64") : found.bytes,
        { status: found.status, headers: found.headers }
      );
    },
    websocket: {
      open(ws) {
        ws.data.connection = connect(ws.data.pathname, {
          send: (data) => ws.send(data),
        });
      },
      message(ws, message) {
        ws.data.connection?.message(wire(message));
      },
      close(ws) {
        ws.data.connection?.close();
      },
    },
  });
  return {
    base: `http://127.0.0.1:${server.port}`,
    attach,
    misses: () => [...misses].sort(),
    stop: () => server.stop(true),
  };
}

/** A tape as its file holds it: gzipped JSON. */
export async function readTape(path: string): Promise<Tape> {
  return JSON.parse(
    gunzipSync(new Uint8Array(await Bun.file(path).arrayBuffer())).toString(
      "utf8"
    )
  ) as Tape;
}

export async function writeTape(path: string, tape: Tape): Promise<void> {
  await Bun.write(path, gzipSync(JSON.stringify(tape), { level: 9 }));
}
