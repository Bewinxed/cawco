/**
 * Scripts run in the iOS Simulator's own Mobile Safari, from a spec, or in
 * any browser nothing automates (canvas-cost's `memory` leg: WebKit with
 * no inspector, whose memory Playwright's own WebKit can't show).
 *
 * A workspace's boundary refuses the simulator's Web Inspector socket
 * (`ios_webkit_debug_proxy -s unix:…/com.apple.webinspectord_sim.socket`:
 * "connect failed: Operation not permitted"; safaridriver: "Could not find any
 * session hosts that match the requested capabilities"), so the page carries
 * its own agent instead: a script from this bridge that asks the bridge for
 * the next function to run (`GET /next`, held open until there is one),
 * runs it, and posts back what it returned (`POST /done`). Both are simple
 * requests (no preflight), and the bridge answers every origin.
 *
 * A page gets the agent two ways:
 *  - `bridge.html(body)`: a page the bridge serves itself, the agent in its head;
 *  - `bridge.front(upstream)`: a proxy in front of a dashboard server, which
 *    puts the agent's tag at the top of every HTML page it passes and relays
 *    the page's sockets. It names itself to the dashboard as a proxy does
 *    (`X-Forwarded-Host`, apps/dashboard/public-origin.js), so the dashboard's
 *    origin gate finds the page its own.
 *
 * `answer(page)` times one round trip: a page whose main thread is stuck
 * answers late or never, which is how a hung web process shows.
 */

import { readWithin } from "../../packages/core/src/bounded";

/** A page with the agent in it, by the address it was loaded at. */
export interface SafariPage {
  /** The page's address when its agent first asked. */
  href: string;
  /**
   * Runs `fn` in the page with `args` (JSON) and resolves to what it returned
   * (awaited, as JSON). Rejects with the page's error, or after `ms`.
   */
  run: <A extends unknown[], R>(
    fn: (...args: A) => R | Promise<R>,
    args?: A,
    ms?: number
  ) => Promise<Awaited<R>>;
}

export interface SafariBridge {
  /** A proxy in front of `upstream` (a dashboard's origin) that carries the agent: its origin. */
  front: (upstream: string) => string;
  /** A page of the bridge's own: `body` in a document whose head carries the agent. */
  html: (name: string, head: string, body: string) => string;
  /** Where the bridge is: a page loads its agent from `<origin>/agent.js`. */
  origin: string;
  /** The newest page whose address `matches`, once its agent asks (within `ms`). */
  page: (
    matches: (href: string) => boolean,
    ms?: number
  ) => Promise<SafariPage>;
  stop: () => void;
}

interface Call {
  args: unknown[];
  fn: string;
  id: number;
}
interface Agent {
  calls: Call[];
  href: string;
  seen: number;
  waiting: ((call: Call | null) => void) | null;
}

/** How long a `GET /next` is held open with nothing to run: below Bun's idle timeout. */
const HOLD_MS = 8000;
const CORS = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};

/** The agent, as the page runs it: `src` is where the bridge is. */
const agentSource = (origin: string) => `(() => {
  "use strict";
  const B = ${JSON.stringify(origin)};
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const run = async (call) => {
    let out;
    try {
      const fn = (0, eval)("(" + call.fn + ")");
      out = { ok: true, value: await fn(...call.args) };
    } catch (error) {
      out = { ok: false, error: String((error && error.stack) || error) };
    }
    let body;
    try {
      body = JSON.stringify({ call: call.id, ...out });
    } catch (error) {
      body = JSON.stringify({ call: call.id, ok: false, error: "unserialisable: " + error });
    }
    fetch(B + "/done?agent=" + id, { method: "POST", body, headers: { "content-type": "text/plain" } }).catch(() => {});
  };
  const loop = async () => {
    for (;;) {
      try {
        const r = await fetch(B + "/next?agent=" + id + "&href=" + encodeURIComponent(location.href), { cache: "no-store" });
        if (r.status === 200) {
          run(await r.json());
        }
      } catch {
        await new Promise((go) => setTimeout(go, 500));
      }
    }
  };
  loop();
})();`;

export function safariBridge(): SafariBridge {
  const agents = new Map<string, Agent>();
  const results = new Map<
    number,
    (out: { ok: boolean; value?: unknown; error?: string }) => void
  >();
  const pages = new Map<string, string>();
  let next = 0;
  let origin = "";
  /** An agent's ask for its next call: one waiting, or the next one queued within HOLD_MS. */
  const nextCall = async (url: URL): Promise<Response> => {
    const key = url.searchParams.get("agent") ?? "";
    const agent = agents.get(key) ?? {
      calls: [],
      href: url.searchParams.get("href") ?? "",
      seen: 0,
      waiting: null,
    };
    agent.seen = performance.now();
    agents.set(key, agent);
    let call = agent.calls.shift() ?? null;
    if (!call) {
      const held = await readWithin(
        HOLD_MS,
        () =>
          new Promise<Call | null>((resolve) => {
            agent.waiting = resolve;
          })
      );
      agent.waiting = null;
      call = held.kind === "answered" ? held.value : null;
    }
    return call
      ? Response.json(call, { headers: CORS })
      : new Response(null, { status: 204, headers: CORS });
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 30,
    fetch: async (req): Promise<Response> => {
      const url = new URL(req.url);
      if (url.pathname === "/agent.js") {
        return new Response(agentSource(origin), {
          headers: { ...CORS, "content-type": "text/javascript" },
        });
      }
      if (url.pathname === "/next") {
        return nextCall(url);
      }
      if (url.pathname === "/done") {
        const out = JSON.parse(await req.text()) as {
          call: number;
          error?: string;
          ok: boolean;
          value?: unknown;
        };
        results.get(out.call)?.(out);
        results.delete(out.call);
        return new Response(null, { status: 204, headers: CORS });
      }
      const page = pages.get(url.pathname);
      if (page) {
        return new Response(page, {
          headers: { ...CORS, "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found", { status: 404, headers: CORS });
    },
  });
  origin = `http://127.0.0.1:${server.port}`;
  const tag = `<script src="${origin}/agent.js"></script>`;
  const fronts: { stop: (close?: boolean) => void }[] = [];

  const handle = (key: string, agent: Agent): SafariPage => ({
    href: agent.href,
    run: async (fn, args = [] as never, ms = 30_000) => {
      next += 1;
      const call: Call = { id: next, fn: fn.toString(), args };
      const asked = await readWithin(
        ms,
        () =>
          new Promise<{ ok: boolean; value?: unknown; error?: string }>(
            (resolve) => {
              results.set(call.id, resolve);
              const live = agents.get(key);
              if (live?.waiting) {
                const give = live.waiting;
                live.waiting = null;
                give(call);
              } else {
                live?.calls.push(call);
              }
            }
          )
      );
      results.delete(call.id);
      if (asked.kind === "unanswered") {
        throw new Error(`the page did not answer within ${ms}ms`);
      }
      if (!asked.value.ok) {
        throw new Error(`in the page: ${asked.value.error}`);
      }
      return asked.value.value as never;
    },
  });

  return {
    origin,
    html: (name, head, body) => {
      const path = `/${name}`;
      pages.set(
        path,
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${tag}${head}</head><body>${body}</body></html>`
      );
      return `${origin}${path}`;
    },
    front: (upstream) => {
      const up = new URL(upstream);
      const front = Bun.serve<{ path: string; protocols: string | null }>({
        hostname: "127.0.0.1",
        port: 0,
        idleTimeout: 60,
        fetch: async (req, srv) => {
          const url = new URL(req.url);
          const host = req.headers.get("host") ?? url.host;
          if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
            return srv.upgrade(req, {
              data: {
                path: url.pathname + url.search,
                protocols: req.headers.get("sec-websocket-protocol"),
                headers: Object.fromEntries(req.headers),
              } as never,
            })
              ? undefined
              : new Response("upgrade failed", { status: 400 });
          }
          const headers = new Headers(req.headers);
          headers.set("x-forwarded-host", host);
          headers.delete("accept-encoding");
          const res = await fetch(`${up.origin}${url.pathname}${url.search}`, {
            method: req.method,
            headers,
            body:
              req.method === "GET" || req.method === "HEAD"
                ? undefined
                : await req.arrayBuffer(),
            redirect: "manual",
          });
          const out = new Headers(res.headers);
          out.delete("content-encoding");
          out.delete("content-length");
          if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
            return new Response(res.body, { status: res.status, headers: out });
          }
          const text = await res.text();
          const at = text.indexOf("<head>");
          const html =
            at === -1
              ? `${tag}${text}`
              : `${text.slice(0, at + 6)}${tag}${text.slice(at + 6)}`;
          return new Response(html, { status: res.status, headers: out });
        },
        websocket: {
          open(ws) {
            const data = ws.data as unknown as {
              headers: Record<string, string>;
              path: string;
              upstream?: WebSocket;
              queue: (string | Uint8Array<ArrayBuffer>)[];
            };
            data.queue = [];
            const headers: Record<string, string> = {
              "x-forwarded-host": data.headers.host,
            };
            for (const name of ["origin", "cookie", "user-agent"]) {
              if (data.headers[name]) {
                headers[name] = data.headers[name];
              }
            }
            const remote = new WebSocket(`ws://${up.host}${data.path}`, {
              headers,
            } as never);
            remote.binaryType = "arraybuffer";
            data.upstream = remote;
            remote.onopen = () => {
              for (const message of data.queue) {
                remote.send(message);
              }
              data.queue = [];
            };
            remote.onmessage = (event) => {
              ws.send(
                typeof event.data === "string"
                  ? event.data
                  : new Uint8Array(event.data as ArrayBuffer)
              );
            };
            remote.onclose = (event) => ws.close(event.code || 1000);
            remote.onerror = () => ws.close(1011);
          },
          message(ws, message) {
            const data = ws.data as unknown as {
              upstream?: WebSocket;
              queue: (string | Uint8Array<ArrayBuffer>)[];
            };
            // A binary frame, copied out of Bun's buffer into one of its own.
            const frame =
              typeof message === "string" ? message : new Uint8Array(message);
            if (data.upstream?.readyState === WebSocket.OPEN) {
              data.upstream.send(frame);
            } else {
              data.queue.push(frame);
            }
          },
          close(ws) {
            (ws.data as unknown as { upstream?: WebSocket }).upstream?.close();
          },
        },
      });
      fronts.push(front);
      return `http://127.0.0.1:${front.port}`;
    },
    page: async (matches, ms = 120_000) => {
      const end = performance.now() + ms;
      for (;;) {
        const [found] = [...agents.entries()]
          .filter(
            ([, agent]) =>
              matches(agent.href) &&
              performance.now() - agent.seen < HOLD_MS * 2
          )
          .sort((a, b) => b[1].seen - a[1].seen);
        if (found) {
          return handle(found[0], found[1]);
        }
        if (performance.now() > end) {
          throw new Error(
            `no page's agent asked within ${ms}ms (heard: ${[...agents.values()].map((a) => a.href).join(", ") || "none"})`
          );
        }
        // biome-ignore lint/performance/noAwaitInLoops: one look after the last
        await Bun.sleep(200);
      }
    },
    stop: () => {
      for (const front of fronts) {
        front.stop(true);
      }
      server.stop(true);
    },
  };
}

/**
 * Whether a page keeps answering while `work` runs: it is asked `() => 1`
 * every 250ms, and the longest round trip is kept. One it never answers
 * counts as `ms` and the watch ends.
 */
export async function answering<T>(
  page: SafariPage,
  work: () => Promise<T>,
  ms = 10_000
): Promise<{ asked: number; longest: number; result: T }> {
  let longest = 0;
  let asked = 0;
  let going = true;
  const watch = (async () => {
    while (going) {
      const started = performance.now();
      // biome-ignore lint/performance/noAwaitInLoops: one question at a time, timed
      const ok = await page
        .run(() => 1, [], ms)
        .then(
          () => true,
          () => false
        );
      asked += 1;
      longest = Math.max(longest, ok ? performance.now() - started : ms);
      if (!ok) {
        return;
      }
      await Bun.sleep(250);
    }
  })();
  let result: T;
  try {
    result = await work();
  } finally {
    going = false;
    // The question in flight as the work ends is counted too.
    await watch;
  }
  return { result, longest, asked };
}
