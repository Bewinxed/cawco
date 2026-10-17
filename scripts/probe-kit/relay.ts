/**
 * The kit's relay between an app and its hub, with the network fault switch.
 *
 * It answers on a port of its own and passes everything both ways: every
 * request to the hub's routes, and the dashboard socket message by message
 * (what the app sends before the hub's socket opens is held, then sent in
 * order). A spec reads or changes what passes (`toApp`, `toHub`), and turns
 * the fault switch:
 *
 * - `cutAfter(bytes)`: the app's socket is cut the moment what the app sent
 *   on it since now passes `bytes`. The message that crosses it never
 *   reaches the hub (a large send goes in parts, `Wire.frames`, so the hub
 *   holds the first parts of it and never the rest), and the hub is gone
 *   from then on (`refuse`) until `release`.
 * - `muteAfter(bytes)`: everything the hub says to the app is swallowed
 *   once the app has sent `bytes` more: what it sends reaches the hub whole,
 *   and no answer comes back.
 * - `cut()`: every socket cut now, and the hub gone until `release`.
 * - `refuse` / `release`: while refused, the hub's routes answer 502 and its
 *   socket opens to nothing, as a hub gone from the network is to the app.
 */
import type { ServerWebSocket } from "bun";

const HTTP = /^http/;

export interface Pipe {
  /** The app's messages (text, as every one it sends) before the hub's socket opened. */
  held: string[];
  /** The hub's socket, once open; what the app sent before is held. */
  hub?: WebSocket;
  search: string;
}

export interface RelayOptions {
  /** What the hub said to the app, changed or as it was; `send` puts more in front of the app. */
  toApp?: (
    text: string,
    send: (text: string) => void,
    app: ServerWebSocket<Pipe>
  ) => string;
  /** What the app said to the hub, read as it passes. */
  toHub?: (text: string) => void;
}

export interface Relay {
  cut: () => void;
  cutAfter: (bytes: number) => void;
  /** The hub is gone to the app: why, and when it went. */
  readonly fault: { refused: boolean; cutAt?: number; mutedAt?: number };
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
        url.pathname === "/ws/dashboard" &&
        served.upgrade(request, { data: { held: [], search: url.search } })
      ) {
        return;
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      const answer = await fetch(`${hubBase}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : await request.arrayBuffer(),
        redirect: "manual",
      });
      // fetch hands the body on decoded: its encoding and length no longer hold.
      const out = new Headers(answer.headers);
      out.delete("content-encoding");
      out.delete("content-length");
      return new Response(answer.body, { status: answer.status, headers: out });
    },
    websocket: {
      open(app: ServerWebSocket<Pipe>) {
        apps.add(app);
        const hub = new WebSocket(
          `${hubSocket}/ws/dashboard${app.data.search}`
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
          const said = options.toApp
            ? options.toApp(text, (more) => app.send(more), app)
            : text;
          app.send(said);
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
      close(app) {
        apps.delete(app);
        app.data.hub?.close();
      },
    },
  });

  return {
    port: server.port as number,
    url: `http://127.0.0.1:${server.port}`,
    fault,
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
