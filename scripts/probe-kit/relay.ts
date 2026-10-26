/**
 * The kit's relay between an app and its hub, with the network fault switch.
 *
 * It answers on a port of its own and passes everything both ways: every
 * request to the hub's routes, and every socket (a dashboard's, an agent's
 * `/ws`) message by message (what the app sends before the hub's socket
 * opens is held, then sent in order). What goes to the app leaves through
 * the wire's outbox (`@cawco/core/wire`), so none is dropped however much the
 * hub sends at once. A spec reads or changes what passes (`toApp`, `toHub`),
 * and turns the fault switch:
 *
 * - `cutAfter(bytes)`: the app's socket is cut the moment what the app sent
 *   on it since now passes `bytes`. The message that crosses it never
 *   reaches the hub (a large send goes in parts, `Wire.frames`, so the hub
 *   holds the first parts of it and never the rest), and the hub is gone
 *   from then on (`refuse`) until `release`.
 * - `muteAfter(bytes)`: everything the hub says to the app is swallowed
 *   once the app has sent `bytes` more: what it sends reaches the hub whole,
 *   and no answer comes back.
 * - `breakAnswer(match)`: the next request `match` picks reaches the hub
 *   whole and is answered there; the relay reads that answer to its end,
 *   passes the first half of it on, and drops the app's connection: the hub
 *   took the call, and the app never had its answer (`fault.broke`).
 * - `cut()`: every socket cut now, and the hub gone until `release`.
 * - `refuse` / `release`: while refused, the hub's routes answer 502 and its
 *   socket opens to nothing, as a hub gone from the network is to the app.
 *
 * Otherwise it cuts nothing: a network keeps a request open however long
 * the hub takes to answer it, so the relay has no idle timeout of its own,
 * and the hub's own server keeps its (hub index.ts `idleTimeout`, and none
 * on its tool routes). With Bun's default of 10 s it cut whatever waited on
 * the hub longer, which no machine's link would: Bun said so as
 * "Bun.serve() timed out a request after 10 seconds" at the end of every
 * link-under-load run (r60 to r77). A request its app leaves after that long
 * with nothing passing is kept in `idleCuts`, for a spec to say none was.
 */
import type { ServerWebSocket } from "bun";
import { Outbox, serverTransport } from "../../packages/core/src/wire";

const HTTP = /^http/u;

/**
 * Bun.serve's default idle timeout, what such a server cuts: "By default,
 * `Bun.serve` closes connections after 10 seconds of inactivity … That
 * includes in-flight requests where your handler is still running"
 * (bun.com/docs/runtime/http/server, idleTimeout).
 */
const IDLE_CUT_MS = 10_000;

/** A request its app left with nothing passing for {@link IDLE_CUT_MS} or more. */
export interface IdleCut {
  /** How long nothing had passed when its app left it. */
  idleMs: number;
  method: string;
  path: string;
}

export interface Pipe {
  /** The app's messages (text, as every one it sends) before the hub's socket opened. */
  held: string[];
  /** The hub's socket, once open; what the app sent before is held. */
  hub?: WebSocket;
  /** What goes to the app, in order, never dropped. */
  out?: Outbox;
  /** The socket's path on the hub: `/ws/dashboard`, an agent's `/ws`. */
  path: string;
  search: string;
}

export interface RelayOptions {
  /**
   * What the hub said to the app, changed or as it was, or undefined: lost on
   * its way. `send` puts more in front of the app.
   */
  toApp?: (
    text: string,
    send: (text: string) => void,
    app: ServerWebSocket<Pipe>
  ) => string | undefined;
  /** What the app said to the hub, read as it passes; a string returned goes to the hub in its place. */
  toHub?: (text: string) => string | undefined;
}

/** A request as {@link Relay.breakAnswer}'s `match` reads it. */
export interface Passing {
  body: string;
  method: string;
  path: string;
}

export interface Relay {
  breakAnswer: (match: (request: Passing) => boolean) => void;
  cut: () => void;
  cutAfter: (bytes: number) => void;
  /** The hub is gone to the app: why, and when it went. */
  readonly fault: {
    /** The answer `breakAnswer` broke: when, its bytes, and how many were passed on. */
    broke?: { at: number; bytes: number; passed: number; path: string };
    cutAt?: number;
    mutedAt?: number;
    refused: boolean;
  };
  /** Requests the app left after {@link IDLE_CUT_MS} with nothing passing, but those `breakAnswer` broke. */
  readonly idleCuts: IdleCut[];
  muteAfter: (bytes: number) => void;
  readonly port: number;
  refuse: () => void;
  release: () => void;
  stop: () => void;
  /** The relay's address, which the app is given as its hub. */
  readonly url: string;
}

export function relay(hubBase: string, options: RelayOptions = {}): Relay {
  const hubSocket = hubBase.replace(HTTP, "ws");
  const apps = new Set<ServerWebSocket<Pipe>>();
  const fault: Relay["fault"] = { refused: false };
  /** The armed switch: bytes left before it acts, and which it is. */
  let armed: { left: number; act: "cut" | "mute" } | undefined;
  let muted = false;
  /** The request whose answer is to be broken, as `breakAnswer` armed it. */
  let breakOn: ((request: Passing) => boolean) | undefined;
  const idleCuts: IdleCut[] = [];

  /**
   * The hub's answer to `request`, passed on chunk by chunk; when the app
   * leaves before its end, with nothing passed for {@link IDLE_CUT_MS} or
   * more, the request goes into {@link idleCuts}.
   */
  const passing = (
    request: Request,
    path: string,
    answer: Response,
    headers: Headers
  ): Response => {
    let last = Date.now();
    let ended = false;
    const left = () => {
      const idleMs = Date.now() - last;
      if (!ended && idleMs >= IDLE_CUT_MS) {
        idleCuts.push({ method: request.method, path, idleMs });
      }
      ended = true;
    };
    request.signal.addEventListener("abort", left);
    const reader = answer.body?.getReader();
    return new Response(
      reader
        ? new ReadableStream<Uint8Array>({
            async pull(controller) {
              const next = await reader.read();
              last = Date.now();
              if (next.done) {
                ended = true;
                controller.close();
              } else {
                controller.enqueue(next.value);
              }
            },
            cancel: (reason) => {
              left();
              return reader.cancel(reason);
            },
          })
        : null,
      { status: answer.status, headers }
    );
  };

  const cut = () => {
    fault.refused = true;
    fault.cutAt ??= Date.now();
    armed = undefined;
    for (const app of [...apps]) {
      app.data.hub?.close();
      app.close();
    }
  };

  const server = Bun.serve<Pipe>({
    hostname: "127.0.0.1",
    port: 0,
    // A network cuts no request for waiting: the hub's own server decides.
    idleTimeout: 0,
    async fetch(request, served) {
      if (fault.refused) {
        return new Response(null, { status: 502 });
      }
      const url = new URL(request.url);
      if (
        url.pathname.startsWith("/ws") &&
        served.upgrade(request, {
          data: { held: [], path: url.pathname, search: url.search },
        })
      ) {
        return;
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer();
      const breaking = breakOn?.({
        method: request.method,
        path: url.pathname,
        body: body ? new TextDecoder().decode(body) : "",
      });
      if (breaking) {
        breakOn = undefined;
      }
      const answer = await fetch(`${hubBase}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
      });
      // fetch hands the body on decoded: its encoding and length no longer hold.
      const out = new Headers(answer.headers);
      out.delete("content-encoding");
      out.delete("content-length");
      if (!breaking) {
        return passing(request, url.pathname, answer, out);
      }
      const whole = new Uint8Array(await answer.arrayBuffer());
      const half = whole.subarray(0, Math.floor(whole.byteLength / 2));
      fault.broke = {
        at: Date.now(),
        bytes: whole.byteLength,
        passed: half.byteLength,
        path: url.pathname,
      };
      // Its connection goes a second after the half, as a dropped link's
      // does: with no idle timeout the server would hold it open for good.
      served.timeout(request, 1);
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(half);
          },
          // The half on its way first, then the connection dropped.
          async pull(controller) {
            await Bun.sleep(200);
            controller.error(new Error("The relay dropped the connection."));
          },
        }),
        { status: answer.status, headers: out }
      );
    },
    websocket: {
      open(app: ServerWebSocket<Pipe>) {
        apps.add(app);
        // Each frame passed on as it came: parts stay parts, cut by the hub.
        app.data.out = new Outbox(serverTransport(app, false), false);
        const hub = new WebSocket(
          `${hubSocket}${app.data.path}${app.data.search}`
        );
        hub.onopen = () => {
          app.data.hub = hub;
          for (const message of app.data.held.splice(0)) {
            hub.send(message);
          }
        };
        hub.onmessage = (event) => {
          if (muted) {
            return;
          }
          const text =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
          const out = app.data.out as Outbox;
          const said = options.toApp
            ? options.toApp(text, (more) => out.forward(more), app)
            : text;
          if (said !== undefined) {
            out.forward(said);
          }
        };
        hub.onclose = () => app.close();
      },
      message(app, message) {
        const text = typeof message === "string" ? message : message.toString();
        if (armed) {
          armed.left -= Buffer.byteLength(text);
          if (armed.left < 0) {
            if (armed.act === "cut") {
              cut();
              return;
            }
            armed = undefined;
            muted = true;
            fault.mutedAt = Date.now();
          }
        }
        const passed = options.toHub?.(text) ?? text;
        if (app.data.hub) {
          app.data.hub.send(passed);
        } else {
          app.data.held.push(passed);
        }
      },
      drain(app) {
        app.data.out?.drained();
      },
      close(app) {
        apps.delete(app);
        app.data.out?.close();
        app.data.hub?.close();
      },
    },
  });

  return {
    port: server.port as number,
    url: `http://127.0.0.1:${server.port}`,
    fault,
    idleCuts,
    breakAnswer(match) {
      breakOn = match;
    },
    cutAfter(bytes) {
      armed = { left: bytes, act: "cut" };
    },
    muteAfter(bytes) {
      armed = { left: bytes, act: "mute" };
    },
    cut,
    refuse() {
      fault.refused = true;
    },
    release() {
      armed = undefined;
      muted = false;
      fault.refused = false;
      fault.cutAt = undefined;
      fault.mutedAt = undefined;
    },
    stop() {
      server.stop(true);
    },
  };
}
