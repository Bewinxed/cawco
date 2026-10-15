/**
 * A previewed page's WebSocket reaches its own server through every way the
 * preview is reached, and comes back when that server restarts. On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model, which calls artifact_create) one session shows a server this spec
 * runs on the host, by its port (a machine-port preview, no workspace).
 *
 * The server gates its sockets as the dashboard's dev server gates `/ws`
 * (vite.config.ts `gateHubSocket`): the page's Origin has to be the origin
 * `publicOrigin` reads off the request, `X-Forwarded-Proto` and
 * `X-Forwarded-Host` first. Its page opens a socket to its own origin, says
 * hello, and opens it again whenever it closes, as the dashboard's client
 * does; the server echoes each word with its generation.
 *
 * In front of the preview origin stands a proxy that does what Cloudflare
 * does on the owner's names: the browser's Host kept, `X-Forwarded-Proto:
 * https`, `CF-Visitor`, `CF-Connecting-IP`, `X-Forwarded-For`, `CDN-Loop`
 * added, a WebSocket relayed with the browser's own headers.
 *
 * 1. Port mode, the session's port loaded straight: the socket echoes.
 * 2. Port mode, through the Cloudflare-like proxy: the socket echoes.
 * 3. The server restarts on its port: the open page's socket echoes the new
 *    generation, no reload.
 * 4. The agent restarts (its listener with it): the open page's socket alone
 *    reconnects and echoes again.
 * 5. An upgrade the server refuses is said in the agent's journal with the
 *    server's reason (`Expected 101 status code`).
 * 6. Host mode (`http://p-{port}.localhost:<proxy>`), entered with a ticket
 *    through the proxy: the socket echoes, and again once the server
 *    restarts.
 *
 *   bun scripts/probe-kit/run.ts preview-socket
 */
import type { Page } from "playwright-core";
import { publicOrigin } from "../../../apps/dashboard/public-origin.js";
import { crossSiteRefusal } from "../../../packages/core/src/browser-gate";
import {
  type PreviewTicket,
  previewEnterUrl,
} from "../../../packages/core/src/frames";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const TITLE = "Socket probe page";
/** How long a socket has to echo after a load or a restart. Our call: the page retries every 300 ms, a register takes a few seconds. */
const ECHO_MS = 30_000;

/** The page: a socket to its own `/echo` that says hello on each open, keeps every echo, and opens again 300 ms after any close. */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title></head><body><h1>${TITLE}</h1><script>window.__heard=[];window.__opens=0;function connect(){var ws=new WebSocket(location.origin.replace(/^http/,"ws")+"/echo");ws.onopen=function(){window.__opens+=1;ws.send("hello")};ws.onmessage=function(e){window.__heard.push(String(e.data))};ws.onclose=function(){setTimeout(connect,300)}}connect();</script></body></html>`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/**
 * The app, generation `generation`, on `port` (0: any): its page, and its
 * `/echo` socket behind the dashboard's own gate; `/refuse` refuses every
 * upgrade. Each refusal is kept, in the gate's words.
 */
const appOn = (port: number, generation: number, refusals: string[]) =>
  Bun.serve<{ generation: number }>({
    hostname: "127.0.0.1",
    port,
    fetch(request, bun) {
      const { pathname } = new URL(request.url);
      if (pathname === "/refuse") {
        return new Response("refused", { status: 403 });
      }
      if (pathname === "/echo") {
        const refused = crossSiteRefusal(
          "GET",
          (name) => request.headers.get(name),
          publicOrigin(Object.fromEntries(request.headers)).origin
        );
        if (refused) {
          refusals.push(refused);
          return new Response(`refused ${refused}`, { status: 403 });
        }
        return bun.upgrade(request, { data: { generation } })
          ? undefined
          : new Response("no upgrade", { status: 400 });
      }
      return new Response(PAGE, { headers: { "content-type": "text/html" } });
    },
    websocket: {
      message(ws, said) {
        ws.send(`${ws.data.generation}:${String(said)}`);
      },
    },
  });

const HOP = new Set([
  "connection",
  "upgrade",
  "keep-alive",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
  "sec-websocket-accept",
]);
/** A WebSocket opened with headers of its own (Bun's client takes them). */
const SocketWith = WebSocket as unknown as new (
  url: string,
  options: { headers: Record<string, string> }
) => WebSocket;

/** What Cloudflare adds to every request it sends on to an origin (developers.cloudflare.com/fundamentals/reference/http-headers). */
const CLOUDFLARE = {
  "x-forwarded-proto": "https",
  "cf-visitor": '{"scheme":"https"}',
  "cf-connecting-ip": "203.0.113.7",
  "x-forwarded-for": "203.0.113.7",
  "cdn-loop": "cloudflare",
  "cf-ray": "8f00000000000000-AMS",
};

/** A proxy in front of `target` (`host:port`) as Cloudflare stands in front of the owner's names: the browser's Host and headers kept, Cloudflare's added. */
const cloudflareTo = (target: string) =>
  Bun.serve<{
    backend: WebSocket;
    queue: (string | Uint8Array<ArrayBuffer>)[];
  }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, bun) {
      const url = new URL(request.url);
      const headers = new Headers(request.headers);
      for (const [name, value] of Object.entries(CLOUDFLARE)) {
        headers.set(name, value);
      }
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const kept: Record<string, string> = {};
        for (const [name, value] of headers) {
          if (!HOP.has(name)) {
            kept[name] = value;
          }
        }
        const backend = new SocketWith(
          `ws://${target}${url.pathname}${url.search}`,
          { headers: kept }
        );
        if (bun.upgrade(request, { data: { backend, queue: [] } })) {
          return;
        }
        backend.close();
        return new Response("upgrade failed", { status: 500 });
      }
      return fetch(`http://${target}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
        decompress: false,
      } as RequestInit);
    },
    websocket: {
      open(ws) {
        const { backend } = ws.data;
        backend.addEventListener("message", (event) => ws.send(event.data));
        backend.addEventListener("close", () => ws.close());
        backend.addEventListener("error", () => ws.close());
        backend.addEventListener("open", () => {
          for (const held of ws.data.queue) {
            backend.send(held);
          }
          ws.data.queue.length = 0;
        });
      },
      message(ws, said) {
        const { backend, queue } = ws.data;
        const message = typeof said === "string" ? said : new Uint8Array(said);
        if (backend.readyState === WebSocket.OPEN) {
          backend.send(message);
        } else if (backend.readyState === WebSocket.CONNECTING) {
          queue.push(message);
        }
      },
      close(ws) {
        ws.data.backend.close();
      },
    },
  });

/** What the page's socket has heard, and how often it opened. */
const heard = (page: Page) =>
  page
    .evaluate(() => {
      const w = window as unknown as { __heard?: string[]; __opens?: number };
      return { heard: w.__heard ?? [], opens: w.__opens ?? 0 };
    })
    .catch((error: Error) => ({ heard: [error.message], opens: 0 }));

/** Waits until the page's socket has echoed `word` more than `before` times; what it heard. */
const echoes = async (page: Page, word: string, before = 0) => {
  let last = { heard: [] as string[], opens: 0 };
  const ok = await until(
    `an echo ${word}`,
    async () => {
      last = await heard(page);
      return last.heard.filter((one) => one === word).length > before;
    },
    Boolean,
    ECHO_MS
  ).catch(() => false);
  return {
    ok,
    said: `heard ${JSON.stringify(last.heard.slice(-6))}, ${last.opens} opens`,
  };
};

const probe = async (kit: Kit) => {
  const refusals: string[] = [];
  /** The app's refusals, each once with its count. */
  const refused = () =>
    JSON.stringify(
      Object.entries(
        Object.groupBy(refusals, (word) => word) as Record<string, string[]>
      ).map(([word, all]) => `${word} ×${all.length}`)
    );
  let generation = 1;
  let app = appOn(0, generation, refusals);
  const appPort = app.port as number;
  const restartApp = async () => {
    await app.stop(true);
    generation += 1;
    app = appOn(appPort, generation, refusals);
  };

  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Socket", fleet.repo);

  asks.set("1", {
    name: CREATE,
    input: { kind: "preview", name: "socket", port: appPort },
  });
  await fleet.send(session, "PROBE-CALL:1");
  await until("the preview made", () => answered.get("1"), Boolean, 180_000);
  const address = async () =>
    (await (
      await fetch(`${fleet.base}/api/instances/${session}/preview-address`, {
        method: "POST",
      })
    ).json()) as { origin?: string; port?: number };
  const sessionPort = (await address()).port ?? 0;
  const portOrigin = `http://127.0.0.1:${sessionPort}`;
  const portFront = cloudflareTo(`127.0.0.1:${sessionPort}`);

  // 1. Port mode, straight.
  const straight = await kit.page("desk");
  await straight.goto(`${portOrigin}/`, { waitUntil: "domcontentloaded" });
  const one = await echoes(straight, "1:hello");
  kit.check(
    "1: port mode, the session's port loaded straight: the page's socket echoes through the preview",
    one.ok,
    `${portOrigin}: ${one.said}; the app refused ${refused()}`
  );
  await straight.context().close();

  // 2. Port mode, behind Cloudflare.
  const tab = await kit.page("desk");
  await tab.goto(`http://127.0.0.1:${portFront.port}/`, {
    waitUntil: "domcontentloaded",
  });
  const two = await echoes(tab, "1:hello");
  kit.check(
    "2: port mode behind a Cloudflare-like proxy (X-Forwarded-Proto: https, CF-Visitor): the page's socket echoes, the app's gate refuses nothing",
    two.ok && refusals.length === 0,
    `${two.said}; the app refused ${refused()}`
  );

  // 3. The server restarts.
  await restartApp();
  const three = await echoes(tab, `${generation}:hello`);
  kit.check(
    "3: the app's server restarts on its port: the open page's socket echoes its new generation, no reload",
    three.ok,
    three.said
  );

  // 4. The agent restarts.
  const before = (await heard(tab)).heard.filter(
    (word) => word === `${generation}:hello`
  ).length;
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const four = await echoes(tab, `${generation}:hello`, before);
  kit.check(
    "4: the agent restarts: the open page's socket alone reconnects and echoes again",
    four.ok,
    four.said
  );
  await tab.context().close();

  // 5. A refused upgrade names its reason.
  const refusedSocket = await new Promise<string>((done) => {
    const ws = new WebSocket(`${portOrigin.replace("http", "ws")}/refuse`);
    // The relay takes the browser's socket before it opens the app's, so it
    // opens, then closes once the app refuses.
    ws.onclose = (event) => done(`closed ${event.code}`);
  });
  const line = await until(
    "the agent's line for the refused upgrade",
    async () =>
      (await fleet.logs("agent"))
        .split("\n")
        .find((text) =>
          text.includes(
            `its WebSocket to ws://127.0.0.1:${appPort}/refuse didn't open: Expected 101 status code`
          )
        ),
    Boolean,
    10_000
  ).catch(() => undefined);
  kit.check(
    "5: an upgrade the app refuses is said in the agent's journal with the app's reason",
    !!line,
    `${line ?? "no line"}; the browser's socket ${refusedSocket}`
  );

  // 6. Host mode behind Cloudflare, entered with a ticket.
  const range = (await (
    await fetch(`${fleet.base}/api/preview-settings`)
  ).json()) as { ports: string };
  const first = Number(range.ports.split("–")[0]);
  const hostFront = cloudflareTo(`127.0.0.1:${first}`);
  const put = await fetch(`${fleet.base}/api/preview-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "host",
      pattern: `http://p-{port}.localhost:${hostFront.port}`,
    }),
  });
  const origin = (await address()).origin ?? "none";
  const { ticket } = (await (
    await fetch(`${fleet.base}/api/instances/${session}/preview-ticket`, {
      method: "POST",
    })
  ).json()) as PreviewTicket;
  const named = await kit.page("desk");
  const entered = await named.goto(previewEnterUrl(origin, ticket, "/"), {
    waitUntil: "domcontentloaded",
  });
  const six = await echoes(named, `${generation}:hello`);
  await restartApp();
  const sixAgain = await echoes(named, `${generation}:hello`);
  kit.check(
    "6: host mode behind a Cloudflare-like proxy, entered with a ticket: the page's socket echoes, and echoes the new generation once the app restarts",
    put.ok && entered?.status() === 200 && six.ok && sixAgain.ok,
    `host mode ${put.status}; ${origin} entered ${entered?.status()}; ${six.said}; after the restart ${sixAgain.said}; the app refused ${refused()}`
  );
  await named.context().close();

  portFront.stop(true);
  hostFront.stop(true);
  await app.stop(true);
};

const spec: Spec = { name: "preview-socket", run: probe };
export default spec;
