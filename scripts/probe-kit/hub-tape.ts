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
 * Time stands still at `tape.at`: the page's clock is frozen there
 * (`page.clock.setFixedTime`), so every "2m ago" the tape's times make
 * reads the same on every run.
 */
import { gunzipSync, gzipSync } from "node:zlib";

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

/** One socket: its path and query, and its frames in order (`in` from the hub). */
export interface TapeSocket {
  frames: { data: string; dir: "in" | "out" }[];
  path: string;
}

export interface Tape {
  /** The moment the page's clock stands at (ms since the epoch). */
  at: number;
  http: TapeHttp[];
  /** What the recording made, by name (a session's id, a project's), for the probe's routes. */
  scene: Record<string, string>;
  sockets: TapeSocket[];
}

/** The keys whose values the page makes up itself, fresh on every run. */
const ID_KEYS = new Set([
  "requestId",
  "commandId",
  "clientId",
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
  early: string[];
  path: string;
  record: TapeSocket | null;
  upstream: WebSocket | null;
}

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
        upstream.onmessage = (event) => {
          const data = String(event.data);
          record.frames.push({ dir: "in", data });
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
        const data = String(message);
        ws.data.record?.frames.push({ dir: "out", data });
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
  return {
    base: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

/**
 * A recorded connection's page frames, each with the hub frames that answer
 * it, in order: a hub frame that carries a page frame's id (a `requestId`)
 * answers that frame, however late it came; any other answers the page
 * frame sent last before it. Hub frames before the page's first are the
 * connection's opening (`player` sends them on connect).
 */
function answered(socket: TapeSocket): [string, string[]][] {
  const out: [string, string[]][] = [];
  const byId = new Map<string, string[]>();
  let last: string[] | null = null;
  for (const frame of socket.frames) {
    if (frame.dir === "out") {
      const replies: string[] = [];
      out.push([frame.data, replies]);
      for (const id of idsOf(frame.data).values()) {
        byId.set(id, replies);
      }
      last = replies;
      continue;
    }
    const owner =
      [...byId].find(([id]) => frame.data.includes(id))?.[1] ?? last;
    owner?.push(frame.data);
  }
  return out;
}

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
  // Every socket path's recorded connections; a connection plays the first.
  const scripts = new Map<string, TapeSocket[]>();
  for (const socket of tape.sockets) {
    const { pathname } = new URL(socket.path, "http://tape");
    scripts.set(pathname, [...(scripts.get(pathname) ?? []), socket]);
  }
  /** For a page frame on a socket path: the hub's answer frames, from the first time the tape saw it. */
  const answers = new Map<string, { frame: string; replies: string[] }>();
  for (const [pathname, sockets] of scripts) {
    for (const socket of sockets) {
      for (const [frame, replies] of answered(socket)) {
        const key = `${pathname} ${canonical(frame)}`;
        if (!answers.has(key)) {
          answers.set(key, { frame, replies });
        }
      }
    }
  }
  const misses = new Set<string>();
  const server = Bun.serve<{ pathname: string }>({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request, srv) {
      const url = new URL(request.url);
      const path = `${url.pathname}${url.search}`;
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        if (srv.upgrade(request, { data: { pathname: url.pathname } })) {
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
        const script = scripts.get(ws.data.pathname)?.[0];
        if (!script) {
          misses.add(`socket ${ws.data.pathname}`);
          return;
        }
        // The opening: the hub's frames before the page's first, less any
        // that answer a page frame (a reply can beat the page's next send).
        const owned = new Set(answered(script).flatMap(([, r]) => r));
        for (const frame of script.frames) {
          if (frame.dir === "out") {
            break;
          }
          if (!owned.has(frame.data)) {
            ws.send(frame.data);
          }
        }
      },
      message(ws, message) {
        const data = String(message);
        const found = answers.get(`${ws.data.pathname} ${canonical(data)}`);
        if (!found) {
          misses.add(
            `socket ${ws.data.pathname} frame ${canonical(data).slice(0, 200)}`
          );
          return;
        }
        // The page's own ids for the recorded page's, in every answer.
        const recorded = idsOf(found.frame);
        const own = idsOf(data);
        const swaps = [...recorded].flatMap(([at, was]) => {
          const now = own.get(at);
          return now && now !== was ? [[was, now] as const] : [];
        });
        for (const reply of found.replies) {
          let out = reply;
          for (const [was, now] of swaps) {
            out = out.replaceAll(was, now);
          }
          ws.send(out);
        }
      },
    },
  });
  return {
    base: `http://127.0.0.1:${server.port}`,
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
