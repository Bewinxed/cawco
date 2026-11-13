/**
 * `bun run takeover:bench`: the browser take-over bench, live. The
 * dashboard's browser bench (`/dev/browser-panel?state=live&live=1`) on one port (`PORT`, else 5190), its
 * view socket answered by the daemon's own take-over (agent
 * cdp-takeover.ts `CdpTakeover`) of a real headless Chromium launched as the
 * local host launches it (local-host.ts), showing a sign-in page of
 * Northwind's with a "Continue with Google" popup. Nothing reaches a hub:
 * the page's Take over and Hand back are answered here, the hand-back as
 * the shield's does it (the take-over's link closed, the page loaded again
 * by GET, every page set to its window's size), and while nobody holds the browser the view is the page's
 * screencast alone, as the local host's watched view is (cdp-watch.ts).
 *
 * Everything else on the port is the dashboard's dev server (`vite dev`
 * on the next port), its sockets included, so the bench is served whole
 * from one origin a preview can open.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import {
  CdpLink,
  CdpTakeover,
  type CdpViewer,
  cdpInputOf,
} from "../packages/agent/src/browser/cdp-takeover";
import { restoreWindows } from "../packages/agent/src/browser/own-size";
import { browserExecutable } from "../packages/agent/src/capabilities";
import {
  BROWSER_SCREEN,
  BROWSER_VIEW_MOVED,
} from "../packages/core/src/browser";

const PORT = Number(process.env.PORT ?? 5190);
const VITE = PORT + 1;
const DASHBOARD = join(import.meta.dir, "../apps/dashboard");

/** The site's two origins, each a name Chromium resolves to this machine: the sign-in's and its provider's. */
const SITE = "accounts.northwind.test";
const PROVIDER = "accounts.google.test";

const SIGN_IN = `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><title>Sign in · Northwind</title>
<style>
*{box-sizing:border-box} body{margin:0;font:16px system-ui,sans-serif;color:#111827}
.wrap{display:grid;grid-template-columns:46% 1fr;min-height:100vh}
.brand{background:#0f2a3d;color:#fff;padding:56px} .brand h2{font-size:40px;margin-top:180px}
.form{padding:160px 0 0;display:grid;justify-content:center} .form>div{width:380px}
input{width:100%;font-size:16px;padding:12px;border:1px solid #d1d5db;border-radius:8px;margin:6px 0 16px}
button,a.btn{display:block;width:100%;text-align:center;font-size:16px;padding:12px;border-radius:8px;border:0;background:#2563eb;color:#fff;text-decoration:none}
a.alt{background:#fff;color:#111827;border:1px solid #d1d5db;margin-top:12px}
.help p{margin:0;padding:14px 0;border-bottom:1px solid #eee}
@media (max-width:600px){.wrap{grid-template-columns:1fr}.brand{padding:16px 20px}.brand h2{display:none}.form{padding:24px 20px}.form>div{width:auto}}
</style></head><body><div class=wrap><div class=brand><b>Northwind</b><h2>Billing for teams that ship every week.</h2></div>
<div class=form><div><h1>Sign in to Northwind</h1><p>Your agent asked you to finish signing in.</p>
<label>Work email<input id=email autofocus value="maya.okafor@northwind.dev"></label>
<label>Password<input id=password type=password></label>
<button id=go onclick="this.textContent='Signed in'">Sign in</button>
<a id=pop class="btn alt" href="http://${PROVIDER}:PORT/popup" target=_blank>Continue with Google</a>
<div class=help>${Array.from({ length: 40 }, (_, at) => `<p>Help article ${at + 1}: managing seats, invoices and who can see them</p>`).join("")}</div>
</div></div></div></body></html>`;

const POPUP = `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><title>Sign in · Google</title>
<style>*{box-sizing:border-box} body{margin:0;font:16px system-ui,sans-serif;padding:24px} input{width:100%;font-size:16px;padding:12px;border:1px solid #9ca3af;border-radius:6px} button{margin-top:16px;font-size:16px;padding:10px 20px;border:0;border-radius:6px;background:#1a73e8;color:#fff}</style></head>
<body><h2>Choose an account</h2><p>to continue to Northwind</p><input id=code placeholder="Email or phone"><button onclick="window.close()">Next</button></body></html>`;

const site: Server<undefined> = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request): Response {
    const { pathname } = new URL(request.url);
    const page =
      pathname === "/popup"
        ? POPUP
        : SIGN_IN.replace("PORT", String(site.port));
    return new Response(page, { headers: { "content-type": "text/html" } });
  },
});
const signIn = `http://${SITE}:${site.port}/`;

const executable =
  browserExecutable() ??
  (await import("playwright-core")).chromium.executablePath();
const devtoolsPort = 20_000 + Math.floor(Math.random() * 20_000);
const chromium = spawn(
  executable,
  [
    "--headless=new",
    `--remote-debugging-port=${devtoolsPort}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "takeover-bench-"))}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--host-resolver-rules=MAP ${SITE} 127.0.0.1, MAP ${PROVIDER} 127.0.0.1`,
    // The site is this machine's: no proxy the environment names reaches it.
    "--no-proxy-server",
    `--screen-info={${BROWSER_SCREEN.width}x${BROWSER_SCREEN.height}}`,
    `--window-size=${BROWSER_SCREEN.width},${BROWSER_SCREEN.height}`,
    "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
    "--no-sandbox",
    "about:blank",
  ],
  { stdio: "ignore" }
);
const vite = spawn(
  "bunx",
  [
    "vite",
    "dev",
    "--port",
    String(VITE),
    "--strictPort",
    "--host",
    "127.0.0.1",
  ],
  { cwd: DASHBOARD, stdio: "inherit" }
);
const end = () => {
  chromium.kill();
  vite.kill();
};
process.on("exit", end);
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

/** Waits, up to a minute, for `url` to answer: the bench opens its port only once all it fronts is up. */
const answering = async (url: string) => {
  for (let tries = 0; tries < 600; tries += 1) {
    const up = await fetch(url).then(
      () => true,
      () => false
    );
    if (up) {
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error(`Nothing answered at ${url} within a minute.`);
};
const devtools = `http://127.0.0.1:${devtoolsPort}`;
await Promise.all([
  answering(`${devtools}/json/version`),
  answering(`http://127.0.0.1:${VITE}/`),
]);
const agent = await CdpLink.open(devtools);
const { targetId } = (await agent.call("Target.createTarget", {
  url: signIn,
})) as { targetId: string };

/** The take-over while the person holds the browser; else the page's screencast alone. */
let held: CdpTakeover | null = null;
let since: number | null = null;
let watch: Promise<CdpTakeover> | null = null;
const watching = () => {
  watch ??= CdpTakeover.start(devtools, targetId, { watch: true });
  return watch;
};

/**
 * The page loaded again by GET, as the shield's hand-back does (shield.ts
 * `reloadFront`): nothing typed survives. A popup the sign-in left open is
 * closed, and the page brought to the front again: the bench watches this
 * one page, and a page behind another paints no frames.
 */
const reloadPage = async () => {
  const { targetInfos } = (await agent.call("Target.getTargets")) as {
    targetInfos: { targetId: string; type: string }[];
  };
  for (const one of targetInfos) {
    if (one.type === "page" && one.targetId !== targetId) {
      await agent.call("Target.closeTarget", { targetId: one.targetId });
    }
  }
  await agent.call("Target.activateTarget", { targetId });
  const session = await agent.attach(targetId);
  const { entries, currentIndex } = (await agent.call(
    "Page.getNavigationHistory",
    {},
    session
  )) as { entries: { url: string }[]; currentIndex: number };
  const url = entries[currentIndex]?.url ?? signIn;
  await agent.call("Page.navigate", { url: "about:blank" }, session);
  agent.post("Page.navigate", { url }, session);
  await agent.call("Target.detachFromTarget", { sessionId: session });
};

interface View {
  early: string[];
  leave?: () => void;
  viewer?: CdpViewer;
}
interface Passed {
  early: (string | Uint8Array<ArrayBuffer>)[];
  up: WebSocket;
}
type Socket = { view: View } | { passed: Passed };

/** Where the bench stands, as the bench page reads it after every ask. */
const benchState = () => Response.json({ since, origin: `http://${SITE}` });

const VIEW_PATH = /^\/ws\/browser\/[^/]+\/[^/]+\/cdp$/u;

const server = Bun.serve<Socket>({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(request, upgrade) {
    const url = new URL(request.url);
    if (url.pathname === "/__bench/state") {
      return benchState();
    }
    if (url.pathname === "/__bench/takeover" && request.method === "POST") {
      if (!held) {
        await (
          await watch
        )?.stop(BROWSER_VIEW_MOVED, "The person took the browser over.");
        watch = null;
        held = await CdpTakeover.start(devtools, targetId);
        since = Date.now();
      }
      return benchState();
    }
    if (url.pathname === "/__bench/handback" && request.method === "POST") {
      await held?.stop(
        BROWSER_VIEW_MOVED,
        "The person handed the browser back."
      );
      held = null;
      since = null;
      await reloadPage();
      // As the shield's release does before the gate opens.
      await restoreWindows(devtools);
      return benchState();
    }
    if (VIEW_PATH.test(url.pathname)) {
      return upgrade.upgrade(request, { data: { view: { early: [] } } })
        ? undefined
        : new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const protocol = request.headers.get("sec-websocket-protocol");
      const up = new WebSocket(
        `ws://127.0.0.1:${VITE}${url.pathname}${url.search}`,
        protocol ? protocol.split(",").map((one) => one.trim()) : []
      );
      return upgrade.upgrade(request, {
        data: { passed: { up, early: [] } },
        ...(protocol
          ? {
              headers: {
                "sec-websocket-protocol": protocol.split(",")[0]?.trim() ?? "",
              },
            }
          : {}),
      })
        ? undefined
        : new Response("WebSocket upgrade failed", { status: 400 });
    }
    const headers = new Headers(request.headers);
    headers.set("host", `127.0.0.1:${VITE}`);
    headers.delete("accept-encoding");
    const answer = await fetch(
      `http://127.0.0.1:${VITE}${url.pathname}${url.search}`,
      {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      }
    );
    const out = new Headers(answer.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(answer.body, { status: answer.status, headers: out });
  },
  websocket: {
    async open(socket: ServerWebSocket<Socket>) {
      const { data } = socket;
      if ("passed" in data) {
        const { up, early } = data.passed;
        up.binaryType = "arraybuffer";
        up.onmessage = (event) => socket.send(event.data as string);
        up.onclose = () => socket.close();
        up.onopen = () => {
          for (const one of early.splice(0)) {
            up.send(one);
          }
        };
        return;
      }
      const viewer: CdpViewer = {
        send: (frame) => socket.send(frame),
        close: (code, why) => socket.close(code, why),
      };
      data.view.viewer = viewer;
      const view = held ?? (await watching());
      data.view.leave = await view.attach(viewer);
      for (const text of data.view.early.splice(0)) {
        const input = cdpInputOf(text);
        if (input && held) {
          held.input(input).catch(() => undefined);
        }
      }
    },
    message(socket, message) {
      const { data } = socket;
      if ("passed" in data) {
        // The dev server's own socket: passed on as it came.
        const said =
          typeof message === "string" ? message : new Uint8Array(message);
        if (data.passed.up.readyState === WebSocket.OPEN) {
          data.passed.up.send(said);
        } else {
          data.passed.early.push(said);
        }
        return;
      }
      if (!data.view.leave) {
        data.view.early.push(String(message));
        return;
      }
      const input = cdpInputOf(String(message));
      if (input && held) {
        held.input(input).catch(() => undefined);
      }
    },
    close(socket) {
      const { data } = socket;
      if ("passed" in data) {
        data.passed.up.close();
        return;
      }
      data.view.leave?.();
    },
  },
});

console.info(
  `takeover bench: http://127.0.0.1:${server.port}/dev/browser-panel?state=live&live=1 (the agent's browser: ${executable})`
);
