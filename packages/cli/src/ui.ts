import {
  clientTransport,
  Outbox,
  serverTransport,
  WIRE_FRAME_LIMIT_BYTES,
} from "@cawco/core/wire";
import { spawn } from "bun";

const HTTP_PREFIX = /^http/;

/**
 * Serves the dashboard on this machine, whichever machine that is.
 *
 * The built dashboard is an adapter-node server: it renders pages and knows
 * nothing about the hub. In development the Vite server proxies `/ws` and
 * `/api` to the hub, and the built one does not — so a dashboard started on a
 * laptop would render, then sit there disconnected. This puts the same proxy in
 * front of the built server, which is what lets the UI run anywhere and still
 * talk to a hub somewhere else on the tailnet.
 *
 * The dashboard's client always talks to its own origin. That stays true here:
 * the origin is this process, and this process is what knows where the hub is.
 */
export interface UiOptions {
  /** The adapter-node build directory (`apps/dashboard/build`). */
  readonly buildDir: string;
  /** The hub this dashboard drives, as an http(s) origin. */
  readonly hubUrl: string;
  /** Where the browser connects. */
  readonly port: number;
}

/** Paths the hub owns; everything else is the dashboard's to render. */
const isHubPath = (path: string): boolean =>
  path.startsWith("/api/") || path === "/health" || path.startsWith("/ws");

/**
 * One browser's relay to the hub. Frames pass through as they are (a message
 * too long for one frame is already parts, `@cawco/core/wire`), each way
 * through an outbox, so a slow side holds frames rather than losing them.
 */
interface Relay {
  /** The socket this process opened to the hub. */
  hub: WebSocket | null;
  /** Frames the browser sent before the hub socket opened. */
  queued: string[];
  /** The page's own query: it names the wire the page was built for. */
  search: string;
  /** Frames to the browser. */
  toBrowser: Outbox | null;
  /** Frames to the hub, once its socket is open. */
  toHub: Outbox | null;
}

export async function serveUi({
  port,
  hubUrl,
  buildDir,
}: UiOptions): Promise<() => void> {
  const hub = new URL(hubUrl);
  // A free port for the renderer: it is never addressed from outside, so it
  // does not need to be predictable — only private to this pair of processes.
  const renderPort = port + 1000;

  const renderer = spawn({
    cmd: [process.execPath, `${buildDir}/index.js`],
    env: { ...process.env, PORT: String(renderPort), HOST: "127.0.0.1" },
    stdout: "inherit",
    stderr: "inherit",
  });

  // The renderer answers before the first browser does, or the first page load
  // races it and returns a connection error the user reads as "it is broken".
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a retry poll — each attempt must see whether the previous one succeeded before deciding to try again.
      await fetch(`http://127.0.0.1:${renderPort}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      break;
    } catch (error) {
      if (Date.now() > deadline) {
        throw new Error("the dashboard renderer did not start", {
          cause: error,
        });
      }
      await Bun.sleep(200);
    }
  }

  const server = Bun.serve<Relay>({
    port,
    hostname: "0.0.0.0",
    idleTimeout: 0,

    async fetch(request, self) {
      const url = new URL(request.url);

      // The dashboard's one socket, relayed to the hub's `/ws/dashboard`.
      if (url.pathname.startsWith("/ws")) {
        if (
          self.upgrade(request, {
            data: {
              hub: null,
              queued: [],
              search: url.search,
              toBrowser: null,
              toHub: null,
            },
          })
        ) {
          return;
        }
        return new Response("expected a websocket upgrade", { status: 426 });
      }

      const target = isHubPath(url.pathname)
        ? `${hub.origin}${url.pathname}${url.search}`
        : `http://127.0.0.1:${renderPort}${url.pathname}${url.search}`;

      // A GET or HEAD has no body, and naming one — even a null one, even with
      // `duplex` — is rejected rather than ignored. Every read the dashboard
      // makes is a GET, so getting this wrong fails all of them at once.
      const hasBody = request.method !== "GET" && request.method !== "HEAD";

      // `Host` belongs to this hop. Forwarding it asks the hub to answer as
      // `localhost:3000`, which is this proxy's name for itself, not the hub's.
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.delete("connection");

      try {
        const answer = await fetch(target, {
          method: request.method,
          headers,
          ...(hasBody
            ? {
                body: request.body,
                // A streamed body needs this on Bun.
                duplex: "half",
              }
            : {}),
          redirect: "manual",
        });

        // `fetch` has already decoded the body, so the upstream's
        // `content-encoding` is a lie by the time it reaches the browser — it
        // gunzips plain bytes and fails the whole asset with
        // ERR_CONTENT_DECODING_FAILED. The length it was sent with is wrong for
        // the same reason.
        const out = new Headers(answer.headers);
        out.delete("content-encoding");
        out.delete("content-length");
        return new Response(answer.body, {
          status: answer.status,
          statusText: answer.statusText,
          headers: out,
        });
      } catch (error) {
        const where = isHubPath(url.pathname)
          ? `the hub at ${hub.origin}`
          : "the dashboard";
        return new Response(
          `Cannot reach ${where}: ${(error as Error).message}`,
          { status: 502 }
        );
      }
    },

    websocket: {
      maxPayloadLength: WIRE_FRAME_LIMIT_BYTES,
      open(browser) {
        // The hub compresses every frame to a dashboard; so does the relay.
        const toBrowser = new Outbox(serverTransport(browser, true));
        browser.data.toBrowser = toBrowser;
        const wsOrigin = hub.origin.replace(HTTP_PREFIX, "ws");
        const upstream = new WebSocket(
          `${wsOrigin}/ws/dashboard${browser.data.search}`
        );
        browser.data.hub = upstream;

        upstream.onopen = () => {
          const toHub = new Outbox(clientTransport(upstream));
          browser.data.toHub = toHub;
          for (const frame of browser.data.queued) {
            toHub.forward(frame);
          }
          browser.data.queued = [];
        };
        upstream.onmessage = (event) => toBrowser.forward(String(event.data));
        // The browser retries on close, so a hub that went away is reported by
        // closing rather than by holding a socket open that answers nothing.
        upstream.onclose = () => browser.close();
        upstream.onerror = () => browser.close();
      },
      message(browser, message) {
        const frame = String(message);
        if (browser.data.toHub) {
          browser.data.toHub.forward(frame);
        } else {
          browser.data.queued.push(frame);
        }
      },
      drain(browser) {
        browser.data.toBrowser?.drained();
      },
      close(browser) {
        browser.data.toBrowser?.close();
        browser.data.toHub?.close();
        browser.data.hub?.close();
      },
    },
  });

  return () => {
    server.stop(true);
    renderer.kill();
  };
}
