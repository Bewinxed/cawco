/**
 * On a computer running the agent, `http://localhost:P` (P the dashboard's
 * loopback port, core `localDashboardPort`, 3455 in production) is the hub's
 * dashboard, carried by that agent to the hub (agent hub-loopback.ts); a
 * preview opened there runs same-site with it and in a process of its own,
 * and nothing of CawCo's takes 3000.
 *
 * HOST ONLY. The scratch hub, its dashboard and its preview listeners stand
 * on this computer's own interface address, off loopback, so the agent
 * reaching the hub there carries it on 127.0.0.1 and ::1, where nothing else
 * of the fleet listens: what answers at localhost is the agent, and each
 * check reads the address that answered. A workspace has no such address:
 * its network namespace holds `lo` alone, and its proxy refuses this host's
 * own addresses and private ranges (agent boundary-policy.ts
 * `DENIED_RESOLVED_ADDRESSES`; "srt's own guard refuses loopback, link-local,
 * multicast, cloud metadata and this host's own addresses besides"), so
 * there this spec fails at its first check, saying so.
 *
 * A session shows a port preview of an app this spec runs: its page sets a
 * cookie, reads it back on its next request, and opens an HMR socket
 * (`vite-hmr`) that echoes.
 *
 * 1. The agent says it serves the hub on 127.0.0.1 and ::1, the dashboard at P.
 * 1b. The agent listens on P and the preview range alone (`ss`), never 3000.
 * 1c. A dev server started on 3000 after the agent registered binds it.
 * 2. `GET /` at P through the agent: 200, the dashboard.
 * 3. The dashboard's `/ws/dashboard` through the agent: a page of its own
 *    origin reaches the hub (it speaks), a page of another origin is closed
 *    unheard (the gate reads the Host the agent passed on).
 * 4. The preview port through the agent keeps the hub's gzip.
 * 5. Chromium at `http://localhost:P`: served from loopback; the session's
 *    preview frame is at `http://localhost:<preview port>`, its document
 *    answers `origin-agent-cluster: ?1` and a `frame-ancestors` naming
 *    `http://localhost:P`, and gzip.
 * 6. The frame runs out of process: DevTools' `Target.setAutoAttach` on the
 *    page attaches it as an `iframe` target.
 * 7. The app's cookie, set in the frame, is on its next request; its HMR
 *    socket echoes.
 *
 *   bun scripts/probe-kit/run.ts hub-loopback-relay   # on the host, outside every workspace
 */
import { networkInterfaces } from "node:os";
import type { Response as PageResponse } from "playwright-core";
import { until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import {
  devServerOn3000,
  hasIpv6Loopback,
  listening,
  loopbackPorts,
  portList,
  respond,
  socketHeard,
} from "./hub-loopback";

const TITLE = "Loopback app";
/** Text enough for the hub to gzip it. */
const FILLER = "The preview's page, said again so it compresses. ".repeat(200);
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title></head><body><h1>${TITLE}</h1><p>${FILLER}</p><script>window.__app={cookie:null,docCookie:document.cookie,echo:null};fetch("/cookie").then(function(r){return r.text()}).then(function(t){window.__app.cookie=t});var ws=new WebSocket(location.origin.replace(/^http/,"ws")+"/hmr","vite-hmr");ws.onopen=function(){ws.send("hello")};ws.onmessage=function(e){window.__app.echo=String(e.data)};</script></body></html>`;
const SPACES = /\s+/;
/** How long a frame has to load and its socket to echo. Our call. */
const FRAME_MS = 60_000;
/** A loopback address as Playwright's serverAddr names one. */
const LOOPBACK = /^(?:127\.|::1$|\[::1\]$)/;

/** This computer's first IPv4 address off loopback, or none. */
const ownAddress = (): string | undefined =>
  Object.values(networkInterfaces())
    .flat()
    .find((one) => one && !one.internal && one.family === "IPv4")?.address;

/** The previewed app: its page sets `app=1`, `/cookie` says what came back, `/hmr` echoes. */
const app = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      const { pathname } = new URL(request.url);
      if (pathname === "/hmr") {
        return server.upgrade(request, {
          headers: { "sec-websocket-protocol": "vite-hmr" },
        })
          ? undefined
          : new Response("no upgrade", { status: 400 });
      }
      if (pathname === "/cookie") {
        return new Response(request.headers.get("cookie") ?? "", {
          headers: {
            "content-type": "text/plain",
            "cache-control": "no-store",
          },
        });
      }
      return new Response(PAGE, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "set-cookie": "app=1; Path=/; SameSite=Lax",
        },
      });
    },
    websocket: {
      message(ws, said) {
        ws.send(`echo:${String(said)}`);
      },
    },
  });

/** 1, 1b, 1c: what the agent (`pid`) says it serves and listens on, and 3000 left free. */
async function carries(kit: Kit, fleet: KitFleet, pid: number) {
  const dashboard = fleet.localDashboardPort;
  const families = hasIpv6Loopback() ? "127.0.0.1 and ::1" : "127.0.0.1";
  const line = await until(
    "the agent's hub loopback line",
    async () =>
      (await fleet.logs("agent"))
        .split("\n")
        .find((one) => one.includes("[hub loopback] the hub at")),
    Boolean,
    30_000
  ).catch(() => undefined);
  kit.check(
    `1: the agent serves the hub on ${families}, the dashboard at its loopback port`,
    !!line?.includes(`served on ${families}: http://localhost:${dashboard} `),
    line ?? "no line"
  );
  const among = loopbackPorts(fleet);
  const expected = among.filter((port) => port !== 3000);
  const held = await listening(pid, among);
  kit.check(
    "1b: the agent listens on the dashboard's loopback port and the preview range alone, never 3000",
    JSON.stringify([...new Set(held)]) ===
      JSON.stringify(expected.toSorted((a, b) => a - b)),
    `listening ${portList([...new Set(held)])}; expected ${portList(expected)}`
  );
  const devServer = await devServerOn3000();
  kit.check(
    "1c: a dev server started on 3000 after the agent registered binds it on 127.0.0.1 and ::1",
    devServer.every((one) => one.includes('answers "dev server"')),
    devServer.join("; ")
  );
}

/** 2, 3, 4: the dashboard, its `/ws` gate and a preview's gzip, through the agent. */
async function throughTheAgent(kit: Kit, fleet: KitFleet, previewPort: number) {
  const dashboard = fleet.localDashboardPort;
  const local = `http://localhost:${dashboard}`;
  const home = await fetch(`http://127.0.0.1:${dashboard}/`, {
    headers: { host: `localhost:${dashboard}` },
  });
  const homeText = await home.text();
  kit.check(
    "2: GET / at the dashboard's loopback port is the dashboard, through the agent",
    home.status === 200 && homeText.includes("_app/immutable"),
    `status ${home.status}, ${homeText.length} bytes`
  );
  const ws = `ws://127.0.0.1:${dashboard}/ws/dashboard`;
  const own = await socketHeard(ws, {
    host: `localhost:${dashboard}`,
    origin: local,
    "sec-fetch-site": "same-origin",
  });
  const foreign = await socketHeard(ws, {
    host: `localhost:${dashboard}`,
    origin: `http://localhost:${previewPort}`,
    "sec-fetch-site": "same-site",
  });
  kit.check(
    "3: the dashboard's /ws through the agent reaches the hub for its own origin, and another origin's is closed unheard",
    own === "heard" && foreign.startsWith("closed"),
    `${local}: ${own}; http://localhost:${previewPort}: ${foreign}`
  );
  const zipped = await fetch(`http://127.0.0.1:${previewPort}/`, {
    headers: { host: `localhost:${previewPort}`, "accept-encoding": "gzip" },
    decompress: false,
  } as RequestInit);
  const bytes = new Uint8Array(await zipped.arrayBuffer());
  kit.check(
    "4: the preview port through the agent keeps the hub's gzip",
    zipped.headers.get("content-encoding") === "gzip" &&
      bytes[0] === 0x1f &&
      bytes[1] === 0x8b,
    `status ${zipped.status}, content-encoding ${zipped.headers.get("content-encoding")}, ${bytes.length} bytes, first ${bytes[0]?.toString(16)} ${bytes[1]?.toString(16)}`
  );
}

/** 5, 6, 7: Chromium at `http://localhost:P`, the session's preview in it. */
async function inChromium(
  kit: Kit,
  fleet: KitFleet,
  session: string,
  previewPort: number
) {
  const local = `http://localhost:${fleet.localDashboardPort}`;
  const preview = `http://localhost:${previewPort}`;
  const page = await kit.page("desk");
  await page.addInitScript((id) => {
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root: { t: "l", id: "pone", tabs: [id], active: id, opened: null },
        focusedLeaf: "pone",
      })
    );
  }, session);
  let pageDocument: PageResponse | undefined;
  let frameDocument: PageResponse | undefined;
  page.on("response", (response) => {
    if (response.request().resourceType() !== "document") {
      return;
    }
    if (response.url().startsWith(`${local}/`)) {
      pageDocument ??= response;
    } else if (response.url().startsWith(`${preview}/`)) {
      frameDocument ??= response;
    }
  });
  await open(page, `${local}/session/${session}`, 'iframe[title="Preview"]');
  const src =
    (await page
      .locator('iframe[title="Preview"]')
      .first()
      .getAttribute("src")) ?? "";
  await until("the frame's document", () => frameDocument, Boolean, FRAME_MS);
  const pageFrom = (await pageDocument?.serverAddr())?.ipAddress ?? "none";
  const frameFrom = (await frameDocument?.serverAddr())?.ipAddress ?? "none";
  const frameHeaders = (await frameDocument?.allHeaders()) ?? {};
  const ancestors = frameHeaders["content-security-policy"] ?? "";
  kit.check(
    "5: the dashboard at localhost is served by the agent (loopback), and its preview frame is at localhost:<preview port>, from loopback",
    LOOPBACK.test(pageFrom) &&
      LOOPBACK.test(frameFrom) &&
      new URL(src).origin === preview,
    `dashboard from ${pageFrom}; frame ${src} from ${frameFrom}`
  );
  kit.check(
    "5: the frame's document answers origin-agent-cluster ?1, frame-ancestors naming the localhost dashboard, and gzip",
    frameHeaders["origin-agent-cluster"] === "?1" &&
      ancestors.split(SPACES).includes(local) &&
      frameHeaders["content-encoding"] === "gzip",
    `origin-agent-cluster ${frameHeaders["origin-agent-cluster"]}; ${ancestors}; content-encoding ${frameHeaders["content-encoding"]}`
  );
  const cdp = await page.context().newCDPSession(page);
  const attached: { type: string; url: string }[] = [];
  cdp.on("Target.attachedToTarget", (event) => {
    attached.push(event.targetInfo);
  });
  await cdp.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
  });
  await until(
    "the frame's target",
    () => attached.length,
    (count) => count > 0,
    10_000
  ).catch(() => 0);
  await cdp.detach();
  const isolated = attached.filter(
    (target) => target.type === "iframe" && target.url.startsWith(`${preview}/`)
  );
  kit.check(
    "6: the preview frame runs in a process of its own (Target.setAutoAttach attaches it as an iframe target)",
    isolated.length === 1,
    JSON.stringify(attached)
  );
  const frame = page
    .frames()
    .find((one) => one.url().startsWith(`${preview}/`));
  const said = frame
    ? await until(
        "the app's cookie and echo",
        () =>
          frame.evaluate(
            () =>
              (
                window as unknown as {
                  __app?: {
                    cookie: string | null;
                    docCookie: string;
                    echo: string | null;
                  };
                }
              ).__app
          ),
        (read) => read?.cookie !== null && read?.echo !== null,
        FRAME_MS
      ).catch(() => undefined)
    : undefined;
  kit.check(
    "7: the app's cookie, set in the frame, is on its next request, and its HMR socket echoes through the agent",
    !!said?.cookie?.split("; ").includes("app=1") &&
      said.docCookie.includes("app=1") &&
      said.echo === "echo:hello",
    JSON.stringify(said ?? "no frame")
  );
  await page.context().close();
}

const run = async (kit: Kit) => {
  const address = ownAddress();
  if (!address) {
    kit.check(
      "0: this computer has an address off loopback for the hub (run this spec on the host, outside every workspace)",
      false,
      "no interface but lo: a workspace's network namespace has lo alone"
    );
    return;
  }
  const served = app();
  const fleet = await kit.fleet(respond, { bind: address, at: address });
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    const agent = fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    await carries(kit, fleet, agent.pid);
    const session = await fleet.spawn("claude", "Loopback", fleet.repo);
    await fleet.api(`/api/instances/${session}/artifacts`, {
      kind: "preview",
      name: "loopback",
      port: served.port,
    });
    const { port: previewPort } = (await (
      await fetch(`${fleet.base}/api/instances/${session}/preview-address`, {
        method: "POST",
      })
    ).json()) as { port: number };
    await fleet.dashboard();
    await throughTheAgent(kit, fleet, previewPort);
    await inChromium(kit, fleet, session, previewPort);
  } finally {
    await served.stop(true);
  }
};

const spec: Spec = { name: "hub-loopback-relay", run };
export default spec;
