/**
 * On a computer running the agent, `http://localhost:<dashboard port>` is
 * the hub's dashboard, carried by that agent (agent hub-loopback.ts), and a
 * preview opened there runs same-site with it and in a process of its own.
 *
 * A scratch fleet: hub and the built dashboard on 127.0.0.1, its agent
 * connected at 127.0.0.1. That address is the hub's, so the agent serves
 * the hub on `::1` alone, and Chromium is told `localhost` is `[::1]`: what
 * answers there is the agent, nothing else (the hub, the dashboard and the
 * app listen on 127.0.0.1 only), and each check reads the address that
 * answered. A session shows a port preview of an app this spec runs: its
 * page sets a cookie, reads it back on its next request, and opens an HMR
 * socket (`vite-hmr`) that echoes.
 *
 * 1. The agent says it serves the hub on ::1.
 * 2. `GET /` at the dashboard port through the agent: 200, the dashboard.
 * 3. The dashboard's `/ws/dashboard` through the agent: a page of its own
 *    origin reaches the hub (it speaks), a page of another origin is closed
 *    unheard (the gate reads the Host the agent passed on).
 * 4. The preview port through the agent keeps the hub's gzip
 *    (`content-encoding: gzip`, the bytes a gzip stream).
 * 5. Chromium at `http://localhost:<dashboard>`: served from ::1; the
 *    session's preview frame is at `http://localhost:<preview port>`, its
 *    document answers `origin-agent-cluster: ?1` and a `frame-ancestors`
 *    naming `http://localhost:<dashboard>`, and gzip.
 * 6. The frame runs out of process: DevTools' `Target.setAutoAttach` on the
 *    page attaches it as an `iframe` target.
 * 7. The app's cookie, set in the frame, is on its next request; its HMR
 *    socket echoes.
 * 8. The agent connected to the hub as `localhost` (the hub is on its
 *    computer by both families): it serves nothing, and [::1] at the
 *    dashboard port no longer answers.
 *
 *   bun scripts/probe-kit/run.ts hub-loopback
 */
import type { Response as PageResponse } from "playwright-core";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const TITLE = "Loopback app";
/** Text enough for the hub to gzip it. */
const FILLER = "The preview's page, said again so it compresses. ".repeat(200);
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title></head><body><h1>${TITLE}</h1><p>${FILLER}</p><script>window.__app={cookie:null,docCookie:document.cookie,echo:null};fetch("/cookie").then(function(r){return r.text()}).then(function(t){window.__app.cookie=t});var ws=new WebSocket(location.origin.replace(/^http/,"ws")+"/hmr","vite-hmr");ws.onopen=function(){ws.send("hello")};ws.onmessage=function(e){window.__app.echo=String(e.data)};</script></body></html>`;
const SPACES = /\s+/;
/** How long a frame has to load and its socket to echo. Our call. */
const FRAME_MS = 60_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

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

/**
 * A socket at `url` with `headers`: `heard` once the hub speaks on it, or
 * how it closed. Every relay hop (core `previewWebSocket`) takes the
 * browser's socket before it opens its own, so a socket the gate behind it
 * refuses opens too, then closes: only the hub's own word says it got through.
 */
const socketHeard = (url: string, headers: Record<string, string>) =>
  new Promise<string>((done) => {
    const ws = new (
      WebSocket as unknown as new (
        url: string,
        options: { headers: Record<string, string> }
      ) => WebSocket
    )(url, { headers });
    const timer = setTimeout(() => {
      ws.close();
      done("open, and silent for 10 s");
    }, 10_000);
    ws.onmessage = () => {
      clearTimeout(timer);
      ws.close();
      done("heard");
    };
    ws.onclose = (event) => {
      clearTimeout(timer);
      done(`closed ${event.code} ${event.reason}`.trim());
    };
  });

const run = async (kit: Kit) => {
  const served = app();
  const fleet = await kit.fleet(respond);
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const dashboard = fleet.dashboardPort;

    // 1.
    const carrying = await until(
      "the agent's hub loopback line",
      async () =>
        (await fleet.logs("agent"))
          .split("\n")
          .find((line) => line.includes("[hub loopback] the hub at")),
      Boolean,
      30_000
    ).catch(() => undefined);
    kit.check(
      "1: the agent serves the hub on ::1 alone (127.0.0.1 is the hub's own address)",
      !!carrying?.includes("served on ::1:"),
      carrying ?? "no line"
    );

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
    const local = `http://localhost:${dashboard}`;

    // 2.
    const home = await fetch(`http://[::1]:${dashboard}/`, {
      headers: { host: `localhost:${dashboard}` },
    });
    const homeText = await home.text();
    kit.check(
      "2: GET / at the dashboard port on ::1 is the dashboard, through the agent",
      home.status === 200 && homeText.includes("_app/immutable"),
      `status ${home.status}, ${homeText.length} bytes`
    );

    // 3.
    const own = await socketHeard(`ws://[::1]:${dashboard}/ws/dashboard`, {
      host: `localhost:${dashboard}`,
      origin: local,
      "sec-fetch-site": "same-origin",
    });
    const foreign = await socketHeard(`ws://[::1]:${dashboard}/ws/dashboard`, {
      host: `localhost:${dashboard}`,
      origin: `http://localhost:${previewPort}`,
      "sec-fetch-site": "same-site",
    });
    kit.check(
      "3: the dashboard's /ws through the agent reaches the hub for its own origin, and another origin's is closed unheard",
      own === "heard" && foreign.startsWith("closed"),
      `${local}: ${own}; http://localhost:${previewPort}: ${foreign}`
    );

    // 4.
    const zipped = await fetch(`http://[::1]:${previewPort}/`, {
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

    // 5.
    const page = await kit.page("desk", { hostRules: "MAP localhost [::1]" });
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
      } else if (
        response.url().startsWith(`http://localhost:${previewPort}/`)
      ) {
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
      "5: the dashboard at localhost is served by the agent (::1), and its preview frame is at localhost:<preview port>, from ::1",
      pageFrom.includes("::1") &&
        frameFrom.includes("::1") &&
        new URL(src).origin === `http://localhost:${previewPort}`,
      `dashboard from ${pageFrom}; frame ${src} from ${frameFrom}`
    );
    kit.check(
      "5: the frame's document answers origin-agent-cluster ?1, frame-ancestors naming the localhost dashboard, and gzip",
      frameHeaders["origin-agent-cluster"] === "?1" &&
        ancestors.split(SPACES).includes(local) &&
        frameHeaders["content-encoding"] === "gzip",
      `origin-agent-cluster ${frameHeaders["origin-agent-cluster"]}; ${ancestors}; content-encoding ${frameHeaders["content-encoding"]}`
    );

    // 6.
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
      (target) =>
        target.type === "iframe" &&
        target.url.startsWith(`http://localhost:${previewPort}/`)
    );
    kit.check(
      "6: the preview frame runs in a process of its own (Target.setAutoAttach attaches it as an iframe target)",
      isolated.length === 1,
      JSON.stringify(attached)
    );

    // 7.
    const frame = page
      .frames()
      .find((one) => one.url().startsWith(`http://localhost:${previewPort}/`));
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

    // 8.
    await fleet.stop("agent");
    fleet.launch("agent", [], {
      CAWCO_HUB_URL: `ws://localhost:${new URL(fleet.base).port}/ws`,
    });
    await fleet.agentUp();
    const onIt = await until(
      "the agent's line for a hub on its computer",
      async () =>
        (await fleet.logs("agent"))
          .split("\n")
          .find((line) => line.includes("is on this computer")),
      Boolean,
      30_000
    ).catch(() => undefined);
    const gone = await fetch(`http://[::1]:${dashboard}/`, {
      headers: { host: `localhost:${dashboard}` },
    }).then(
      (answer) => `answered ${answer.status}`,
      (error: Error) => `refused: ${error.message}`
    );
    kit.check(
      "8: an agent that reaches its hub as localhost serves nothing: its loopback already is the hub",
      !!onIt && gone.startsWith("refused"),
      `${onIt ?? "no line"}; [::1]:${dashboard} ${gone}`
    );
  } finally {
    await served.stop(true);
  }
};

const spec: Spec = { name: "hub-loopback", run };
export default spec;
