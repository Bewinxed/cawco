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
 */
import type { ServerWebSocket } from "bun";
import { Outbox, serverTransport } from "../../packages/core/src/wire";

const HTTP = /^http/;

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
  /** What the app said to the hub, read as it passes. */
  toHub?: (text: string) => void;
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
        return new Response(answer.body, {
          status: answer.status,
          headers: out,
        });
      }
      const whole = new Uint8Array(await answer.arrayBuffer());
      const half = whole.subarray(0, Math.floor(whole.byteLength / 2));
      fault.broke = {
        at: Date.now(),
        bytes: whole.byteLength,
        passed: half.byteLength,
        path: url.pathname,
      };
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
        options.toHub?.(text);
        if (app.data.hub) {
          app.data.hub.send(text);
        } else {
          app.data.held.push(text);
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
