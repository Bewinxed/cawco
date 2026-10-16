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
 * 7. A real Vite dev server, its `LAUNCH_EDITOR` a script that leaves a
 *    mark, and a plugin that marks each Vue DevTools RPC frame it hears.
 *    Straight to Vite, `/__open-in-editor?file=/etc/hostname` launches the
 *    editor and the page's RPC frame reaches the plugin. The session's
 *    preview then shows Vite by its port, and through it: the route answers
 *    CawCo's 403 and launches nothing, nor do its case and suffix forms;
 *    the page loads, its HMR socket carries its own custom events, an edit
 *    updates it in place, `/@fs/` inside `fs.allow` answers; the RPC frame,
 *    as the page's text and as a socket's bytes, never reaches the plugin.
 *    Straight to the agent's listener for it (its 0.0.0.0 port), not
 *    through the hub: HTTP with no relay token or a wrong one answers
 *    CawCo's 403, and a WebSocket never opens.
 *
 *   bun scripts/probe-kit/run.ts preview-socket
 */
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import type { Page } from "playwright-core";
import { publicOrigin } from "../../../apps/dashboard/public-origin.js";
import { crossSiteRefusal } from "../../../packages/core/src/browser-gate";
import {
  type PreviewTicket,
  previewEnterUrl,
} from "../../../packages/core/src/frames";
import { RELAY_HEADER } from "../../../packages/core/src/preview-proxy";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

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

/** Vue DevTools' HMR event (vite-plugin-vue-devtools), whose RPC reads the machine's files. */
const MACHINE_EVENT = "__devtools-kit-vite-messaging-event-key__";
/** How long a launched editor has to leave its mark. Our call: launch-editor spawns at once. */
const LAUNCH_MS = 2000;
const VITE = join(ROOT, "apps/dashboard/node_modules/vite/bin/vite.js");

/** The Vite app's module at `mark`: it marks the page, keeps its hot channel and every pong, and takes its own updates. */
const viteModule = (mark: string) =>
  `document.body.dataset.mark=${JSON.stringify(mark)};window.__hot=import.meta.hot;window.__pongs??=[];import.meta.hot.on("probe:pong",(d)=>window.__pongs.push(d));import.meta.hot.accept();`;

/**
 * A real Vite dev server on `port`, its app in `dir`: an editor script that
 * writes each launch to `marks`, and a plugin that answers `probe:ping` with
 * `probe:pong` and writes each {@link MACHINE_EVENT} it hears to `marks`.
 */
const viteOn = async (dir: string, port: number, marks: string) => {
  await mkdir(dir, { recursive: true });
  await Bun.write(marks, "");
  await Bun.write(
    join(dir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><title>Vite probe</title><script>window.__navigation=Math.random()</script></head><body><script type="module" src="/main.js"></script></body></html>`
  );
  await Bun.write(join(dir, "main.js"), viteModule("v1"));
  await Bun.write(
    join(dir, "vite.config.mjs"),
    `import { appendFileSync } from "node:fs";
export default { plugins: [{ name: "probe", configureServer(server) {
  server.ws.on("probe:ping", (data, client) => client.send("probe:pong", data));
  server.ws.on(${JSON.stringify(MACHINE_EVENT)}, () => appendFileSync(${JSON.stringify(marks)}, "rpc\\n"));
} }] };\n`
  );
  const editor = join(dir, "editor.sh");
  await Bun.write(editor, `#!/bin/sh\necho "editor $*" >> ${marks}\n`);
  await chmod(editor, 0o755);
  const proc = Bun.spawn(
    [
      "node",
      VITE,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: dir,
      env: { ...process.env, LAUNCH_EDITOR: editor },
      stdout: "ignore",
      stderr: "ignore",
    }
  );
  await until(
    "Vite answering",
    () =>
      fetch(`http://127.0.0.1:${port}/`)
        .then((answer) => answer.ok)
        .catch(() => false),
    Boolean,
    30_000
  );
  return proc;
};

/** The ports something listens on at 0.0.0.0 now, as `ss` lists them. */
const listeningOnAll = async (): Promise<Set<string>> =>
  new Set(
    (await $`ss -ltnH`.text())
      .split("\n")
      .flatMap((line) => line.match(WILDCARD_PORT)?.slice(1, 2) ?? [])
  );
const WILDCARD_PORT = /\s0\.0\.0\.0:(\d+)\s/;
/** A request straight to a listener: with no relay token, and with one that isn't its start's. */
const STRAIGHT_HEADERS: Record<string, string>[] = [
  {},
  { [RELAY_HEADER]: "00000000-0000-4000-8000-000000000000" },
];

/** What the Vite page shows: its mark, its load, whether its hot channel is up, its pongs. */
const vitePage = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __hot?: object;
      __navigation?: number;
      __pongs?: string[];
    };
    return {
      mark: document.body.dataset.mark ?? "",
      navigation: w.__navigation ?? 0,
      hot: !!w.__hot,
      pongs: w.__pongs ?? [],
    };
  });

/** The page sends `event` up its HMR socket with `data`. */
const hotSend = (page: Page, event: string, data: string) =>
  page.evaluate(
    ([name, said]) =>
      (
        window as unknown as {
          __hot: { send: (event: string, data: string) => void };
        }
      ).__hot.send(name, said),
    [event, data] as const
  );

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

  // 7. A real Vite dev server: before (straight), then through the preview,
  // in port mode again: host mode's listener took the range's first port,
  // so the session's port is read again.
  await fetch(`${fleet.base}/api/preview-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "port" }),
  });
  const viteOrigin = `http://127.0.0.1:${(await address()).port ?? 0}`;
  const free = Bun.serve({ port: 0, fetch: () => new Response() });
  const vitePort = free.port as number;
  free.stop(true);
  const viteDir = join(kit.out, "vite-app");
  const marks = join(kit.out, "vite-marks.txt");
  const vite = await viteOn(viteDir, vitePort, marks);
  const marked = async () => (await Bun.file(marks).text()).trim();
  const OPEN = "/__open-in-editor?file=/etc/hostname";
  const pongOf = (page: Page, word: string) =>
    until(
      `the pong ${word}`,
      async () => (await vitePage(page)).pongs.includes(word),
      Boolean,
      ECHO_MS
    ).catch(() => false);

  const directOpen = await fetch(`http://127.0.0.1:${vitePort}${OPEN}`);
  await Bun.sleep(LAUNCH_MS);
  const directPage = await kit.page("desk");
  await directPage.goto(`http://127.0.0.1:${vitePort}/`, {
    waitUntil: "domcontentloaded",
  });
  await until(
    "the straight page's hot channel",
    async () => (await vitePage(directPage)).hot,
    Boolean,
    ECHO_MS
  );
  await hotSend(directPage, MACHINE_EVENT, "{}");
  await hotSend(directPage, "probe:ping", "straight");
  const straightPong = await pongOf(directPage, "straight");
  await directPage.context().close();
  const straightMarks = await marked();
  kit.check(
    "7a: before, straight to Vite: /__open-in-editor?file=/etc/hostname launches the editor on the machine, and the page's Vue DevTools RPC frame reaches the plugin",
    directOpen.status === 200 &&
      straightMarks.includes("editor /etc/hostname") &&
      straightMarks.includes("rpc") &&
      straightPong,
    `${OPEN} ${directOpen.status}; marks ${JSON.stringify(straightMarks)}; pong ${straightPong}`
  );
  await Bun.write(marks, "");

  asks.set("2", {
    name: CREATE,
    input: { kind: "preview", name: "vite", port: vitePort },
  });
  const wildcards = await listeningOnAll();
  await fleet.send(session, "PROBE-CALL:2");
  await until(
    "the Vite preview made",
    () => answered.get("2"),
    Boolean,
    180_000
  );
  // The agent's listener for it: the one 0.0.0.0 port the start opened.
  const opened = [...(await listeningOnAll())].filter(
    (port) => !wildcards.has(port)
  );
  const straightTo = opened.length === 1 ? opened[0] : undefined;
  const straightAnswers = straightTo
    ? await Promise.all(
        STRAIGHT_HEADERS.map(async (headers) => {
          const answer = await fetch(`http://127.0.0.1:${straightTo}/`, {
            headers,
          });
          return {
            status: answer.status,
            body: (await answer.text()).trim(),
          };
        })
      )
    : [];
  const straightSocket = straightTo
    ? await new Promise<string>((done) => {
        const ws = new WebSocket(`ws://127.0.0.1:${straightTo}/`, ["vite-hmr"]);
        ws.onopen = () => {
          ws.close();
          done("opened");
        };
        ws.onclose = (event) => done(`closed ${event.code} unopened`);
      })
    : "no port";
  const straightLine = (await fleet.logs("agent"))
    .split("\n")
    .find((text) => text.includes("that its hub didn't relay"));
  kit.check(
    "7e: straight to the agent's preview listener, not through the hub: an HTTP request (with no relay token, and with a wrong one) answers CawCo's 403, and a WebSocket never opens",
    straightAnswers.length === 2 &&
      straightAnswers.every(
        (reply) =>
          reply.status === 403 &&
          reply.body.startsWith("CawCo refused this request")
      ) &&
      straightSocket.endsWith("unopened") &&
      !!straightLine,
    `new 0.0.0.0 ports ${JSON.stringify(opened)}; ${straightAnswers.map((reply) => reply.status).join(", ")}; body ${JSON.stringify(straightAnswers[0]?.body)}; socket ${straightSocket}; journal ${straightLine ?? "none"}`
  );
  const refusedForms = await Promise.all(
    [
      OPEN,
      "/__OPEN-IN-EDITOR?file=/etc/hostname",
      "/app/__open-in-editor.x?file=/etc/hostname",
    ].map(async (path) => {
      const answer = await fetch(`${viteOrigin}${path}`);
      return {
        path,
        status: answer.status,
        body: (await answer.text()).trim(),
      };
    })
  );
  await Bun.sleep(LAUNCH_MS);
  const journal = (await fleet.logs("agent"))
    .split("\n")
    .find((text) => text.includes("refused /__open-in-editor"));
  const afterOpen = await marked();
  kit.check(
    "7b: through the preview: /__open-in-editor (and its case and suffix forms) answers CawCo's 403, launches nothing, and the agent's journal says so",
    refusedForms.every(
      (form) => form.status === 403 && form.body.startsWith("CawCo refused")
    ) &&
      !afterOpen.includes("editor") &&
      !!journal,
    `${refusedForms.map((form) => `${form.path} ${form.status}`).join("; ")}; body ${JSON.stringify(refusedForms[0]?.body)}; marks ${JSON.stringify(afterOpen)}; journal ${journal ?? "none"}`
  );

  const viewed = await kit.page("desk");
  await viewed.goto(`${viteOrigin}/`, { waitUntil: "domcontentloaded" });
  await until(
    "the preview's hot channel",
    async () => (await vitePage(viewed)).hot,
    Boolean,
    ECHO_MS
  );
  const loaded = await vitePage(viewed);
  await hotSend(viewed, "probe:ping", "preview");
  const previewPong = await pongOf(viewed, "preview");
  const fs = await fetch(`${viteOrigin}/@fs${viteDir}/main.js`);
  await Bun.write(join(viteDir, "main.js"), viteModule("v2"));
  const updated = await until(
    "the edit in place",
    async () => (await vitePage(viewed)).mark === "v2",
    Boolean,
    ECHO_MS
  ).catch(() => false);
  const afterEdit = await vitePage(viewed);
  kit.check(
    "7c: through the preview: the Vite page loads, its HMR socket carries its own custom event (ping → pong), /@fs/ inside fs.allow answers 200, and an edit updates the page in place",
    loaded.mark === "v1" &&
      previewPong &&
      fs.status === 200 &&
      updated &&
      afterEdit.navigation === loaded.navigation,
    `mark ${loaded.mark} → ${afterEdit.mark}, same load ${afterEdit.navigation === loaded.navigation}; pong ${previewPong}; /@fs/…/main.js ${fs.status}`
  );

  await hotSend(viewed, MACHINE_EVENT, "{}");
  const bytes = await new Promise<string>((done) => {
    const ws = new WebSocket(`${viteOrigin.replace("http", "ws")}/`, [
      "vite-hmr",
    ]);
    ws.onopen = () => {
      ws.send(
        new TextEncoder().encode(
          JSON.stringify({ type: "custom", event: MACHINE_EVENT, data: {} })
        )
      );
      setTimeout(() => {
        ws.close();
        done("sent");
      }, 500);
    };
    ws.onerror = () => done("didn't open");
  });
  await hotSend(viewed, "probe:ping", "after");
  const afterPong = await pongOf(viewed, "after");
  await Bun.sleep(LAUNCH_MS);
  const afterRpc = await marked();
  kit.check(
    "7d: through the preview: the Vue DevTools RPC frame, as the page's text and as a socket's bytes, never reaches the plugin, and the socket goes on carrying the page's own events",
    !afterRpc.includes("rpc") && bytes === "sent" && afterPong,
    `marks ${JSON.stringify(afterRpc)}; bytes socket ${bytes}; pong after ${afterPong}`
  );
  await viewed.context().close();
  vite.kill();

  portFront.stop(true);
  hostFront.stop(true);
  await app.stop(true);
};

const spec: Spec = { name: "preview-socket", run: probe };
export default spec;
