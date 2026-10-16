/**
 * A previewed page never shares an origin with the dashboard, and a shown
 * preview stays servable to every panel that opens it. On a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model, which
 * calls artifact_create as a PROBE-CALL message says) and the built
 * dashboard at the desk, previews of servers this spec runs on the host are
 * opened in their sessions' panels. Every load is read by the page's own
 * title in the panel's frame, never by pixels.
 *
 * Its own origin (port mode, the default):
 *
 * 1. The panel shows the page, its frame on the session's preview port.
 * 9. The previewed page's `localStorage` holds none of the dashboard's keys,
 *    its `document.cookie` none of the dashboard's cookies, and the app's
 *    server was sent none of them.
 * 10. A request from the preview's origin to the hub's API is refused (a
 *    real cross-port POST from the page, read from the hub's journal and its
 *    unchanged settings), and so is one to the dashboard's `/api`.
 * 11. Two sessions' previews open at once each show their own page, and each
 *     page's WebSocket (as an HMR client opens one) reaches its own server.
 * 12. A previewed copy of the dashboard opens at `/session/<id>` and routes
 *     it, and a click to another session moves its own history without a
 *     reload.
 * 13. An origin the tab cannot reach: the pane says "Previews need ports
 *     <range> reachable on <host>, or switch previews to a hostname pattern",
 *     with the way to the setting.
 * 14. Host mode set through Settings › Previews with
 *     `http://p-{session}.localhost`: in a dashboard reached under that
 *     domain (`dash.localhost`, as 14d and 14e), the panel enters with a
 *     ticket and loads the page from `p-<session>.localhost`, routed by Host.
 *     (A dashboard reached any other way: the preview-route spec.)
 * 14b. An `http://p-{port}.localhost` pattern: each session's origin is the
 *     port it keeps; entered with a ticket, both sessions' previews answer
 *     200 with the overlay on their own names and their WebSockets open; a
 *     pattern with both placeholders, neither, or no scheme is refused.
 * 14c. The lock (hub preview-access.ts): without a pass a name answers 401
 *     and refuses a WebSocket, its ping stays open, a ticket enters once,
 *     and a replayed, another session's and an expired ticket are refused.
 * 14d. The panel enters with a ticket on the port name.
 * 14e. An `https://` pattern gives `https://` origins to a dashboard reached
 *     over http: the hub's address and the pane's own ping.
 * 14f. A pattern stored with no scheme is `http://` after the hub's start,
 *     in its answer and its row, said in one line.
 * 14g. (Run after 14c.) A name no session holds answers the very 401 a held
 *     name without a pass answers, its ping answers as a held one's, and an
 *     entry there is refused; once a session ends, its name answers its
 *     owner's pass with the closed page and a stranger with the same 401.
 * 15. A page on a third origin that frames the preview's port gets nothing:
 *     the preview names the dashboards in `frame-ancestors`, not it.
 * 16. With that header taken off in the browser, the third origin's frame
 *     loads the page, and a hello it forges is ignored: the overlay answers
 *     no `cawco:ready`.
 * 15b. The dashboard reached through a proxy (as the owner's tunnel gate is:
 *     the dashboard's Host, the browser's in `X-Forwarded-Host`/`-Proto`, a
 *     WebSocket relayed over a client socket of its own with the browser's
 *     Origin and cookies), with no `CAWCO_DASHBOARD_URL` set: the proxy's
 *     origin joins the preview's `frame-ancestors`, and the panel opened
 *     through it shows the page.
 * 15c. Through that proxy, the page's own POST to the dashboard's `/api`
 *     passes its gate, and a POST naming another Origin is refused.
 *
 * Every app's server refuses a WebSocket whose Origin is not `http://<its
 * Host>`, as a dashboard's `/ws` gate and Vite's HMR do: the agent rewrites
 * the Origin to the app's own `localhost:<port>`, and the Host has to say the
 * same on the socket as on a request.
 *
 * A second preview is of a port inside a workspace: a delegate of a project
 * session shows a preview naming what serves it (`serve`), which CawCo's
 * stage runs in its workspace (its boundary's network, reached through the
 * agent's bridge). Needs a
 * workspace boundary, so unprivileged user namespaces: a run inside a
 * workspace (where bwrap is refused) notes it and checks the host's alone.
 *
 * 17. Three shows of each preview at once (overlapping starts, as a
 *     re-create during a register makes): each preview still answers.
 *
 * It survives (port mode again), between loads. After each, every preview
 * answers within {@link BOUND_MS}: its origin's page with HTTP 200 and the
 * overlay injected, and a WebSocket from its origin reaches its own server.
 *
 * 2. The agent restarts (its listeners go with it).
 * 3. The hub restarts (the agent's listener stays). With no dashboard open,
 *    each preview's origin on the hub answers its ping at once: the hub
 *    binds every session's kept port as it starts.
 * 4. The agent and the hub restart together.
 * 4b. The install's order: the hub restarts, the old agent registers with it
 *    again, then the agent restarts.
 * 5. The dashboard tab closes, nothing shows the session, and a new tab
 *    opens it.
 * 6. The server stops: the pane draws the worded state, and the agent's
 *    journal has one `[preview] agent listener` line naming the port.
 * 7. The panel's preview is closed: a load of its origin answers the worded
 *    closed page (404, `cawco-preview-down` closed), and the hub's journal
 *    says so in one `[preview] hub listener` line.
 * 8. No journal says "No preview selected".
 *
 * Its port is one the hub can bind (between 5 and 6):
 *
 * 19. The fleet's configured dashboard port (`CAWCO_DASHBOARD_PORT`) set to
 *     the port the first session keeps, with nothing bound there: the hub's
 *     start moves the row, says so in one line, and the preview answers 200
 *     with the overlay on its new port.
 * 20. A new session's port passes over the dashboard's port and one a
 *     stranger's server holds, both lower than the one it takes.
 * 21. A stranger takes that session's kept port while the hub is down: the
 *     hub's start moves it, and its preview answers on the new port.
 *
 * 18. A call never waits out its timeout on a socket that is no longer its
 *     machine's: the spec plays a machine over a raw agent socket, a config
 *     read (10 s timeout) waits on it, and a second socket registers as the
 *     same machine. The read answers MACHINE_DISCONNECTED within a second,
 *     and the old socket's late reply is refused.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the checks are read in order, one after another.
import type { Frame, Page } from "playwright-core";
import { INSPECT_CONFIG } from "../../../packages/core/src/fleet";
import {
  PREVIEW_PING_PATH,
  type PreviewTicket,
  previewEnterUrl,
} from "../../../packages/core/src/frames";
import { OVERLAY_PATH } from "../../../packages/core/src/preview-proxy";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const FRAME = 'iframe[title="Preview"]';
const TITLE = "Survives probe page";
const OTHER = "Second session's page";
const IN_WORKSPACE = "Workspace server's page";
/** The workspace server's port, in its boundary's own network. */
const WORKSPACE_PORT = 47_513;
/** How long a preview has to answer again after a restart. Our call: a register and a listener start take a few seconds. */
const BOUND_MS = 30_000;
/** A machine this spec plays itself, over raw agent sockets (check 18). */
const PROBE_MACHINE = "probe-superseded";
const HTTP = /^http/;
/** The hub's journal words for a ticket its preview listener refused (preview.ts), before the refusal's word. */
const TICKET_REFUSED = "a ticket was refused: ";

/** A page whose script opens a WebSocket back to its own origin, as an HMR client does, and keeps what its server said. */
const pageOf = (title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><script>window.__said=new Promise(function(done){var ws=new WebSocket(location.origin.replace(/^http/,"ws")+"/hmr");ws.onmessage=function(e){done(String(e.data))};ws.onerror=function(){done("error")};ws.onclose=function(e){done("closed "+e.code)}});</script></body></html>`;

/** Why a WebSocket upgrade is refused, as a dashboard's `/ws` gate refuses one: an Origin that is not `http://<Host>`. */
const crossOrigin = (headers: Headers): string | null => {
  const origin = headers.get("origin");
  return origin && origin !== `http://${headers.get("host")}`
    ? `a socket from ${origin} to ${headers.get("host")}`
    : null;
};

/** A server for one session's page: its page, its socket saying its title, and every Cookie header it was sent. */
const appOf = (title: string) => {
  const cookies: string[] = [];
  const server = Bun.serve<{ title: string }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, bun) {
      cookies.push(request.headers.get("cookie") ?? "");
      if (new URL(request.url).pathname === "/hmr") {
        const refused = crossOrigin(request.headers);
        if (refused) {
          return new Response(`refused ${refused}`, { status: 403 });
        }
        return bun.upgrade(request, { data: { title } })
          ? undefined
          : new Response("no upgrade", { status: 400 });
      }
      return new Response(pageOf(title), {
        headers: { "content-type": "text/html" },
      });
    },
    websocket: {
      open: (ws) => {
        ws.send(ws.data.title);
      },
      message: () => undefined,
    },
  });
  return { cookies, server };
};

/** A WebSocket opened with headers of its own (Bun's client takes them). */
const SocketWith = WebSocket as unknown as new (
  url: string,
  options: { headers: Record<string, string> }
) => WebSocket;

/**
 * A proxy in front of the dashboard at `dashboard`, as the owner's tunnel
 * gate is: it answers on an origin of its own, sends each request on with the
 * dashboard's Host and the browser's scheme and host in `X-Forwarded-Proto`
 * and `X-Forwarded-Host`, and relays a WebSocket over a client socket of its
 * own that carries the browser's Origin and cookies with the same two.
 */
const proxyOf = (dashboard: string) => {
  const behind = new URL(dashboard);
  return Bun.serve<{
    backend: WebSocket;
    queue: (string | Uint8Array<ArrayBuffer>)[];
  }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, bun) {
      const url = new URL(request.url);
      const forwarded: Record<string, string> = {
        "x-forwarded-host": url.host,
        "x-forwarded-proto": url.protocol.slice(0, -1),
      };
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const headers = { ...forwarded };
        for (const name of ["origin", "cookie"]) {
          const value = request.headers.get(name);
          if (value) {
            headers[name] = value;
          }
        }
        const backend = new SocketWith(
          `ws://${behind.host}${url.pathname}${url.search}`,
          { headers }
        );
        if (bun.upgrade(request, { data: { backend, queue: [] } })) {
          return;
        }
        backend.close();
        return new Response("upgrade failed", { status: 500 });
      }
      const headers = new Headers(request.headers);
      for (const [name, value] of Object.entries(forwarded)) {
        headers.set(name, value);
      }
      headers.set("host", behind.host);
      return fetch(`${behind.origin}${url.pathname}${url.search}`, {
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
};

/** `text` as one single-quoted shell word. */
const quoted = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * What serves the delegate's preview (artifact_create's `serve`): the same
 * app as {@link appOf}, on the `PORT` CawCo's stage gives it on its
 * boundary's loopback, run and kept up by the stage.
 */
const servedCommand = (): string => {
  const app = [
    `const page=${JSON.stringify(pageOf(IN_WORKSPACE))};`,
    `Bun.serve({hostname:"127.0.0.1",port:Number(process.env.PORT),fetch(r,s){`,
    `if(new URL(r.url).pathname==="/hmr"){const o=r.headers.get("origin");`,
    `if(o&&o!=="http://"+r.headers.get("host"))return new Response("refused",{status:403});`,
    `return s.upgrade(r)?undefined:new Response("no upgrade",{status:400})}`,
    `return new Response(page,{headers:{"content-type":"text/html"}})},`,
    `websocket:{open(w){w.send(${JSON.stringify(IN_WORKSPACE)})},message(){}}});`,
  ].join("");
  return `bun -e ${quoted(app)}`;
};

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

/** The panel's current frame, once its page's title is `title`; else null with the last title read and what the proxy said. */
const paneFrame = async (
  page: Page,
  title: string
): Promise<{ frame: Frame | null; last: string }> => {
  let last = "no frame";
  const read = async () => {
    const handles = await page.locator(FRAME).elementHandles();
    for (const handle of handles.reverse()) {
      // biome-ignore lint/performance/noAwaitInLoops: the newest frame first, one at a time
      const frame = await handle.contentFrame();
      const said = (await frame?.title().catch(() => "")) ?? "";
      const down = await frame
        ?.evaluate(() =>
          [...document.querySelectorAll("meta[name^=cawco-preview-]")]
            .map(
              (m) => `${m.getAttribute("name")}=${m.getAttribute("content")}`
            )
            .join(" ")
        )
        .catch(() => "");
      last = `${said || "an untitled frame"}${down ? ` [${down}]` : ""} at ${frame?.url() ?? "?"}`;
      if (said === title) {
        return frame;
      }
    }
    return null;
  };
  const frame = await until(
    "the preview's title in the panel",
    read,
    Boolean,
    90_000
  ).catch(() => null);
  return { frame: frame ?? null, last };
};

/** What a WebSocket from `origin` to its own `/hmr` heard first: its server's word, or why it said nothing. */
const socketSays = (origin: string): Promise<string> =>
  new Promise((done) => {
    const ws = new SocketWith(`${origin.replace(HTTP, "ws")}/hmr`, {
      headers: { origin },
    });
    const timer = setTimeout(() => {
      ws.close();
      done("nothing in 5 s");
    }, 5000);
    ws.onmessage = (event) => {
      clearTimeout(timer);
      ws.close();
      done(String(event.data));
    };
    ws.onerror = () => {
      clearTimeout(timer);
      done("error");
    };
    ws.onclose = (event) => {
      clearTimeout(timer);
      done(`closed ${event.code}`);
    };
  });

interface Shown {
  /** Which preview, in a check's words. */
  label: string;
  origin: string;
  title: string;
}

/**
 * Polls `preview`'s origin until its page answers 200 with its title and the
 * overlay's tag, and a WebSocket from its origin hears its server: how long
 * that took, or what it last answered once {@link BOUND_MS} is out.
 */
const served = async (
  preview: Shown
): Promise<{ ok: boolean; ms: number; last: string }> => {
  const started = Date.now();
  let last = "nothing yet";
  while (Date.now() - started < BOUND_MS) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polls until it answers or the bound passes
      const response = await fetch(`${preview.origin}/`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.text();
      const injected = body.includes(`src="${OVERLAY_PATH}"`);
      last = `${response.status}${injected ? " with the overlay" : ""}: ${body.replace(/\s+/g, " ").slice(0, 120)}`;
      if (
        response.status === 200 &&
        injected &&
        body.includes(`<title>${preview.title}</title>`)
      ) {
        const said = await socketSays(preview.origin);
        last = `200 with the overlay; its socket heard ${JSON.stringify(said)}`;
        if (said === preview.title) {
          return { ok: true, ms: Date.now() - started, last };
        }
      }
    } catch (error) {
      last = (error as Error).message;
    }
    await Bun.sleep(500);
  }
  return { ok: false, ms: Date.now() - started, last };
};

const run = async (kit: Kit) => {
  let boundaries = true;
  try {
    await Bun.$`bwrap --unshare-user --unshare-net --ro-bind / / --dev /dev --proc /proc true`.quiet();
  } catch (error) {
    boundaries = false;
    kit.note(
      `the workspace preview and the boundary handover not run here (no workspace boundary can start): ${(error as { stderr?: Buffer }).stderr?.toString().trim() ?? String(error)}`
    );
  }
  const first = appOf(TITLE);
  /** Read now: a stopped server names no port. */
  const firstAppPort = first.server.port as number;
  const second = appOf(OTHER);

  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  let sent = 0;
  const create = async (sid: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: CREATE, input: { kind: "preview", ...input } });
    await fleet.send(sid, `PROBE-CALL:${marker}`);
    const made = (await until(
      `artifact_create's answer (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
    return made.match(ANSWERED_ID)?.[1] ?? made.slice(0, 300);
  };
  const address = async (sid: string) =>
    (await (
      await fetch(`${fleet.base}/api/instances/${sid}/preview-address`, {
        method: "POST",
      })
    ).json()) as { origin?: string; port?: number };

  const session = await fleet.spawn("claude", "Survives", fleet.repo);
  const madeFirst = await create(session, {
    name: "survives",
    port: first.server.port,
  });
  const base = await fleet.dashboard();
  const where = `${base}/session/${session}`;
  const { port: firstPort } = await address(session);
  /** Moved by checks 19–21's hub starts. */
  let firstOrigin = `http://127.0.0.1:${firstPort}`;

  // 1. Its own origin.
  let tab = await kit.page("desk");
  await open(tab, where, FRAME);
  const shown = await paneFrame(tab, TITLE);
  kit.check(
    "1: the panel shows the page, on the session's own preview port",
    !!shown.frame && new URL(shown.frame.url()).origin === firstOrigin,
    `${shown.last}; the session's origin ${firstOrigin}; artifact ${madeFirst}`
  );

  // 9. Nothing of the dashboard's in the page.
  if (shown.frame) {
    await tab.waitForTimeout(800);
    const dashboard = await tab.evaluate(() => ({
      keys: Object.keys(localStorage),
      cookie: document.cookie,
    }));
    const page = await shown.frame.evaluate(() => ({
      keys: Object.keys(localStorage),
      cookie: document.cookie,
    }));
    // The kit writes its theme into every frame's storage before any script.
    const theirs = dashboard.keys.filter((key) => key !== "cawco-theme");
    const shared = page.keys.filter((key) => theirs.includes(key));
    const sentCookies = first.cookies.filter((one) => one.includes("cawco-"));
    // The dashboard's own, kept for its server (HttpOnly) on the host the
    // preview shares: what the page must neither read nor be sent.
    const jar = (await tab.context().cookies())
      .filter((one) => one.name.includes("cawco-"))
      .map((one) => `${one.name}${one.httpOnly ? " (HttpOnly)" : ""}`);
    kit.check(
      "9: the previewed page's localStorage and document.cookie hold nothing of the dashboard's, and its server was sent none of its cookies",
      theirs.length > 0 &&
        jar.length > 0 &&
        jar.every((one) => one.endsWith("(HttpOnly)")) &&
        shared.length === 0 &&
        !page.cookie.includes("cawco-") &&
        sentCookies.length === 0,
      `dashboard keys ${theirs.length} (${theirs.slice(0, 4).join(", ")}); its cookies ${jar.join(", ") || "none"}; page keys ${JSON.stringify(page.keys)}; page cookie ${JSON.stringify(page.cookie)}; cookies the app was sent with cawco-: ${sentCookies.length}`
    );

    // 10. From the preview's origin, the hub and the dashboard refuse.
    // A page may POST anywhere without CORS (`no-cors`): the browser sends
    // it with its cookies and its own Sec-Fetch-Site, and only the server's
    // gate stands in the way.
    const target = `/api/instances/${session}/preview-address`;
    await shown.frame.evaluate(
      (url) =>
        fetch(url, {
          method: "POST",
          mode: "no-cors",
          credentials: "include",
          headers: { "content-type": "text/plain" },
          body: "{}",
        }).catch(() => undefined),
      `${fleet.base}${target}`
    );
    await tab.waitForTimeout(500);
    const hubLine = (await fleet.logs("hub"))
      .split("\n")
      .find((line) =>
        line.includes(`[hub] refused a same-site request to POST ${target}`)
      );
    const still = (await (
      await fetch(`${fleet.base}/api/preview-settings`)
    ).json()) as { mode: string };
    const dash = await fetch(`${base}/api/preview-settings`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        origin: firstOrigin,
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
      },
      body: JSON.stringify({
        mode: "host",
        pattern: "http://p-{session}.localhost",
      }),
    });
    kit.check(
      "10: a POST from the preview's origin is refused by the hub (its line, settings unchanged) and by the dashboard's /api",
      !!hubLine && still.mode === "port" && dash.status === 403,
      `hub: ${hubLine ?? "no line"}; mode ${still.mode}; dashboard ${dash.status}`
    );
  }

  // 15–16. A third origin may not frame the preview, nor hello its overlay.
  const third = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><html><head><title>Third</title></head><body><iframe src="${firstOrigin}/" title="Framed" width="600" height="400"></iframe><script>window.__heard=[];addEventListener("message",function(e){window.__heard.push(e.data&&e.data.type)});</script></body></html>`,
        { headers: { "content-type": "text/html" } }
      ),
  });
  const thirdOrigin = `http://127.0.0.1:${third.port}`;
  const policy =
    (await fetch(`${firstOrigin}/`)).headers.get("content-security-policy") ??
    "";
  const framedTitle = async (outside: Page): Promise<string> => {
    const handle = await outside
      .locator("iframe[title=Framed]")
      .elementHandle();
    const frame = await handle?.contentFrame();
    return (
      (await frame?.title().catch(() => "")) || `nothing (${frame?.url()})`
    );
  };
  const framer = await kit.page("desk");
  await framer.goto(thirdOrigin, { waitUntil: "domcontentloaded" });
  await framer.waitForTimeout(2000);
  const framerTitle = await framedTitle(framer);
  kit.check(
    "15: a page on a third origin framing the preview gets nothing: frame-ancestors names the dashboard, not it",
    policy.includes("frame-ancestors") &&
      policy.includes(new URL(base).origin) &&
      !policy.includes(thirdOrigin) &&
      framerTitle !== TITLE,
    `policy ${JSON.stringify(policy)}; the framed page: ${framerTitle}`
  );
  await framer.context().close();

  // The header taken off in this browser alone: the overlay is all that stands.
  const forged = await kit.page("desk");
  await forged.context().route(`${firstOrigin}/**`, async (route) => {
    const response = await route.fetch();
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(
        ([name]) => name !== "content-security-policy"
      )
    );
    await route.fulfill({ response, headers });
  });
  await forged.goto(thirdOrigin, { waitUntil: "domcontentloaded" });
  const loadedTitle = await until(
    "the preview loaded in the third origin's frame",
    async () => {
      const title = await framedTitle(forged);
      return title === TITLE ? title : null;
    },
    Boolean,
    30_000
  ).catch(() => framedTitle(forged));
  await forged.evaluate(
    ([artifact]) => {
      const frame = document.querySelector<HTMLIFrameElement>(
        "iframe[title=Framed]"
      );
      frame?.contentWindow?.postMessage(
        {
          type: "cawco:hello",
          theme: "light",
          artifact: { id: artifact, kind: "preview", name: "forged" },
          sync: `/__cawco/artifact/${artifact}`,
        },
        "*"
      );
    },
    [madeFirst]
  );
  await forged.waitForTimeout(3000);
  const heard = await forged.evaluate(
    () => (window as unknown as { __heard: string[] }).__heard
  );
  kit.check(
    "16: with frame-ancestors taken off, the third origin's frame loads the page, and its forged hello is ignored (no cawco:ready)",
    loadedTitle === TITLE && !heard.includes("cawco:ready"),
    `framed page ${loadedTitle}; the third origin heard ${JSON.stringify(heard)}`
  );
  await forged.context().close();
  third.stop(true);

  // 15b. Through a proxy, the dashboard's origin is learned, never configured.
  const proxy = proxyOf(base);
  const proxiedOrigin = `http://localhost:${proxy.port}`;
  const viaProxy = await kit.page("desk");
  await viaProxy.goto(`${proxiedOrigin}/session/${session}`, {
    waitUntil: "domcontentloaded",
  });
  const policyNow = async () =>
    (await fetch(`${firstOrigin}/`)).headers.get("content-security-policy") ??
    "";
  const learned =
    (await until(
      "the proxied origin among the preview's frame-ancestors",
      async () => ((await policyNow()).includes(proxiedOrigin) ? true : null),
      Boolean,
      30_000
    ).catch(() => null)) === true;
  // Loaded again now that the hub knows it: the frame's first load may have
  // been answered before the page's socket opened.
  await viaProxy.reload({ waitUntil: "domcontentloaded" });
  const proxiedShown = await paneFrame(viaProxy, TITLE);
  kit.check(
    "15b: the dashboard reached through a proxy (X-Forwarded-Host/-Proto, its socket relayed with the browser's Origin), with no CAWCO_DASHBOARD_URL, becomes a preview parent: frame-ancestors names its origin and its panel shows the page",
    fleet.env.CAWCO_DASHBOARD_URL === undefined &&
      learned &&
      !!proxiedShown.frame,
    `CAWCO_DASHBOARD_URL ${fleet.env.CAWCO_DASHBOARD_URL ?? "unset"}; policy ${JSON.stringify(await policyNow())}; the panel: ${proxiedShown.last}`
  );
  // 15c. The dashboard's own gate judges the proxied page by the same origin:
  // its POST passes, and one naming another origin is refused.
  const target15c = `/api/instances/${session}/preview-address`;
  const ownPost = await viaProxy.evaluate(
    (url) =>
      fetch(url, { method: "POST" }).then(
        async (response) => `${response.status} ${await response.text()}`,
        (error: Error) => error.message
      ),
    target15c
  );
  const foreign = await fetch(`${proxiedOrigin}${target15c}`, {
    method: "POST",
    headers: { origin: "http://elsewhere.localhost:9" },
  });
  kit.check(
    "15c: through the proxy, the page's own POST to the dashboard's /api passes, and a POST with another Origin is refused (403)",
    ownPost.startsWith("200 ") &&
      ownPost.includes(`"port":${firstOrigin.split(":").at(-1)}`) &&
      foreign.status === 403,
    `own: ${ownPost.slice(0, 160)}; foreign: ${foreign.status} ${(await foreign.text()).slice(0, 120)}`
  );
  await viaProxy.context().close();
  proxy.stop(true);

  // 11. Two sessions at once, each with its own page and socket.
  const other = await fleet.spawn("claude", "Other", fleet.repo);
  await create(other, { name: "other", port: second.server.port });
  const otherTab = await kit.page("desk");
  await open(otherTab, `${base}/session/${other}`, FRAME);
  const otherShown = await paneFrame(otherTab, OTHER);
  await tab.reload({ waitUntil: "domcontentloaded" });
  const againShown = await paneFrame(tab, TITLE);
  const socketOf = (frame: Frame | null) =>
    frame?.evaluate(
      () => (window as unknown as { __said: Promise<string> }).__said
    ) ?? Promise.resolve("no frame");
  const [saidFirst, saidOther] = await Promise.all([
    socketOf(againShown.frame),
    socketOf(otherShown.frame),
  ]);
  kit.check(
    "11: two sessions' previews open at once each show their own page, and each page's socket reaches its own server",
    !!(againShown.frame && otherShown.frame) &&
      new URL(againShown.frame.url()).origin !==
        new URL(otherShown.frame.url()).origin &&
      saidFirst === TITLE &&
      saidOther === OTHER,
    `first: ${againShown.last}, socket said ${saidFirst}; other: ${otherShown.last}, socket said ${saidOther}`
  );
  await otherTab.context().close();

  // 12. A previewed copy of the dashboard routes by its own paths.
  const viewer = await fleet.spawn("claude", "Viewer", fleet.repo);
  const copyId = await create(viewer, {
    name: "dashboard-copy",
    port: Number(new URL(base).port),
    path: `/session/${session}`,
  });
  // The artifact's own tab: the same pane at the desk's full width, where
  // the copy draws its desk layout, rail and all.
  const viewerTab = await kit.page("desk");
  await open(viewerTab, `${base}/artifact/${copyId}`, FRAME);
  /** The panel's frame once it holds the previewed dashboard routed at `/session/<id>`, with that session's link. */
  const routedCopy = async (): Promise<Frame | null> => {
    const handles = (await viewerTab.locator(FRAME).elementHandles()).reverse();
    for (const handle of handles) {
      // biome-ignore lint/performance/noAwaitInLoops: the newest frame first, one at a time
      const frame = await handle.contentFrame();
      const routed = await frame
        ?.evaluate(
          (id) =>
            location.pathname === `/session/${id}` &&
            !!document.querySelector(`a[href="/session/${id}"]`),
          session
        )
        .catch(() => false);
      if (frame && routed) {
        return frame;
      }
    }
    return null;
  };
  let copy: Frame | null = null;
  try {
    copy = await until(
      "the previewed dashboard routing /session/<id>",
      routedCopy,
      Boolean,
      120_000
    );
  } catch {
    copy = null;
  }
  /** Where the previewed dashboard stands: its path, and whether its window is the one marked before the clicks. */
  const standing = async (frame: Frame): Promise<string> => {
    try {
      return await frame.evaluate(
        () =>
          `${location.pathname}${(window as unknown as { __kept?: number }).__kept === 1 ? "" : " (reloaded)"}`
      );
    } catch {
      return "the frame reloaded";
    }
  };
  /** Every in-app link the copy draws now. */
  const hrefs = (frame: Frame): Promise<string[]> =>
    frame.evaluate(() =>
      [...document.querySelectorAll("a[href]")].map(
        (a) => a.getAttribute("href") ?? ""
      )
    );
  /** A click on the copy's link to `href`, and where it then stands: `href`, its window kept, or what it reached. */
  const go = async (frame: Frame, href: string): Promise<string> => {
    // The pane is narrow: the copy may draw a link twice, one of them hidden.
    await frame
      .locator(`a[href="${href}"]:visible`)
      .first()
      .click({ timeout: 20_000 });
    try {
      return (await until(
        `the previewed dashboard at ${href}`,
        async () => ((await standing(frame)) === href ? href : null),
        Boolean,
        30_000
      )) as string;
    } catch {
      return await standing(frame);
    }
  };
  let moved = "no previewed dashboard";
  if (!copy) {
    // What the panel holds instead: each frame's address, path, title and
    // the session links it carries.
    const frames = await Promise.all(
      (await viewerTab.locator(FRAME).elementHandles()).map(async (handle) => {
        const frame = await handle.contentFrame();
        const seen = await frame
          ?.evaluate(() => ({
            path: location.pathname,
            title: document.title,
            links: [...document.querySelectorAll('a[href^="/session"]')]
              .map((a) => a.getAttribute("href"))
              .slice(0, 6),
            body: document.body?.innerText.slice(0, 160) ?? "",
          }))
          .catch((error: Error) => ({ error: error.message }));
        return `${frame?.url() ?? "?"} ${JSON.stringify(seen)}`;
      })
    );
    const pane = await viewerTab
      .locator(".preview-pane")
      .innerText()
      .catch(() => "no pane");
    moved = `no previewed dashboard; frames ${frames.join(" | ") || "none"}; pane ${JSON.stringify(pane.slice(0, 200))}`;
  }
  if (copy) {
    // The copy's own workspace, in its own origin's storage, holds both
    // sessions as tabs; one load of the copy takes it up.
    const firstTab = `/session/${session}`;
    const secondTab = `/session/${other}`;
    await copy.evaluate(
      ([a, b]) => {
        localStorage.setItem(
          "cawco-workspace",
          JSON.stringify({
            v: 1,
            root: { t: "l", id: "probe-leaf", tabs: [a, b], active: a },
            focusedLeaf: "probe-leaf",
            ctx: {},
          })
        );
      },
      [session, other]
    );
    await copy.goto(new URL(firstTab, copy.url()).href, {
      waitUntil: "domcontentloaded",
    });
    copy = (await until(
      "the copy again, both tabs drawn",
      async () => {
        const frame = await routedCopy();
        return frame && (await hrefs(frame)).includes(secondTab) ? frame : null;
      },
      Boolean,
      60_000
    ).catch(() => copy)) as Frame;
    await copy.evaluate(() => {
      (window as unknown as { __kept: number }).__kept = 1;
    });
    // To the other session's tab and back: in-app moves, the window the
    // one marked before them.
    const path: string[] = [];
    if ((await hrefs(copy)).includes(secondTab)) {
      path.push(await go(copy, secondTab));
      if (path[0] === secondTab) {
        path.push(await go(copy, firstTab));
      }
      moved =
        path.join(" → ") === `${secondTab} → ${firstTab}`
          ? "moved in place"
          : path.join(" → ");
    } else {
      moved = `no tab for the other session; links ${JSON.stringify((await hrefs(copy)).slice(0, 12))}`;
    }
  }
  kit.check(
    "12: a previewed dashboard routes /session/<id> at its own root, and switches to its other session's tab and back without a reload",
    !!copy && moved === "moved in place",
    `${copy ? new URL(copy.url()).origin : "none"}: ${moved}`
  );
  await viewerTab.context().close();

  // 13. An origin this tab cannot reach: the pane says what previews need.
  const blocked = await kit.page("desk");
  await blocked.route(`${firstOrigin}/**`, (route) => route.abort());
  await open(blocked, where, ".preview-pane");
  const need = await blocked
    .locator(".preview-pane .down[role=alert]")
    .textContent({ timeout: 30_000 })
    .catch(() => null);
  const range = (await (
    await fetch(`${fleet.base}/api/preview-settings`)
  ).json()) as {
    ports: string;
  };
  const exact = `Previews need ports ${range.ports} reachable on 127.0.0.1, or switch previews to a hostname pattern`;
  kit.check(
    "13: an unreachable preview origin shows the exact sentence, with the way to the setting",
    !!need?.includes(exact) && !!need.includes("Preview settings"),
    `${JSON.stringify(need?.replace(/\s+/g, " ").trim())}`
  );
  await blocked.context().close();

  // 14. Host mode through Settings › Previews, routed by Host.
  const pattern = `http://p-{session}.localhost:${range.ports.split("–")[0]}`;
  const settings = await kit.page("desk");
  await open(settings, `${base}/config/previews`, "#preview-mode");
  await settings.selectOption("#preview-mode", "host");
  await settings.fill("#preview-pattern", pattern);
  await settings.getByRole("button", { name: "Save" }).click();
  const saved = await until(
    "host mode kept",
    async () => {
      const now = (await (
        await fetch(`${fleet.base}/api/preview-settings`)
      ).json()) as { mode: string; pattern?: string };
      return now.mode === "host" ? now : null;
    },
    Boolean,
    15_000
  ).catch(() => null);
  await settings.context().close();
  // Host mode's names are a client's under the pattern's domain alone
  // (core `previewRoute`): the dashboard reached as `dash.localhost`, the
  // same server as `base`.
  const named = await kit.page("desk");
  await open(named, where.replace("//127.0.0.1:", "//dash.localhost:"), FRAME);
  const byHost = await paneFrame(named, TITLE);
  kit.check(
    "14: host mode set in Settings with http://p-{session}.localhost loads the page from the session's own host, entered with a ticket, in a dashboard reached under localhost",
    !!saved &&
      !!byHost.frame &&
      new URL(byHost.frame.url()).origin ===
        pattern.replace("{session}", session),
    `${JSON.stringify(saved)}; ${byHost.last}`
  );

  // 14b. A `{port}` pattern: a fixed name per port of the range.
  /** The port session `sid` keeps (preview_ports). */
  const portOf = (sid: string): number | undefined =>
    fleet.query<{ port: number }>(
      "SELECT port FROM preview_ports WHERE instance_id = ?",
      sid
    )[0]?.port;
  const [firstRangePort] = range.ports.split("–");
  const putPattern = (next: string) =>
    fetch(`${fleet.base}/api/preview-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "host", pattern: next }),
    });
  const both = await putPattern("http://p-{session}-{port}.localhost");
  const neither = await putPattern("http://previews.localhost");
  const schemeless = await putPattern("p-{port}.localhost");
  const refusals = `both ${both.status} ${await both.text()}; neither ${neither.status}; no scheme ${schemeless.status}`;
  const portPattern = `http://p-{port}.localhost:${firstRangePort}`;
  const kept = await putPattern(portPattern);
  const keptText = await kept.text();
  const originOf = async (sid: string) => (await address(sid)).origin ?? "none";
  const [firstOrigin14, otherOrigin14] = [
    await originOf(session),
    await originOf(other),
  ];
  /** A ticket into `sid`'s preview origin, from the hub's API as the dashboard's relay and the app reach it. */
  const ticketFor = async (sid: string): Promise<string> =>
    (
      (await (
        await fetch(`${fleet.base}/api/instances/${sid}/preview-ticket`, {
          method: "POST",
        })
      ).json()) as PreviewTicket
    ).ticket;
  const heldPorts = new Set(
    fleet
      .query<{ port: number }>("SELECT port FROM preview_ports")
      .map((row) => row.port)
  );
  const unheldPort = (() => {
    let port = Number(firstRangePort);
    while (heldPorts.has(port)) {
      port += 1;
    }
    return port;
  })();
  /** One load of `url` in `page` (the browser takes every `.localhost` name to loopback): its status and body. */
  const loadOf = async (page: Page, url: string) => {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    return {
      status: response?.status() ?? 0,
      body: (await response?.text().catch(() => "")) ?? "",
    };
  };
  /** What `sid`'s origin answers in a browser that enters it with a ticket: 200 with the overlay and the page, and the page's own WebSocket. */
  const enteredAs = async (origin: string, sid: string, title: string) => {
    const page = await kit.page("desk");
    const { status, body } = await loadOf(
      page,
      previewEnterUrl(origin, await ticketFor(sid), "/")
    );
    const said = await page
      .evaluate(() => (window as unknown as { __said: Promise<string> }).__said)
      .catch((error: Error) => error.message);
    await page.context().close();
    return {
      ok:
        status === 200 &&
        body.includes(`src="${OVERLAY_PATH}"`) &&
        body.includes(`<title>${title}</title>`) &&
        said === title,
      said: `${origin} ${status}${body.includes(OVERLAY_PATH) ? " with the overlay" : ""}, its socket heard ${JSON.stringify(said)}`,
    };
  };
  const firstByPort = await enteredAs(firstOrigin14, session, TITLE);
  const otherByPort = await enteredAs(otherOrigin14, other, OTHER);
  const passless = await kit.page("desk");
  const unheldOrigin = `http://p-${unheldPort}.localhost:${firstRangePort}`;
  const unheld = await loadOf(passless, `${unheldOrigin}/`);
  kit.check(
    "14b: a {port} pattern gives each session the origin of the port it keeps; both sessions' previews, entered with a ticket, answer 200 with the overlay on their own names and their WebSockets open; a pattern with both placeholders, neither, or no scheme is refused",
    both.status === 422 &&
      neither.status === 422 &&
      schemeless.status === 422 &&
      kept.ok &&
      firstOrigin14 ===
        `http://p-${portOf(session)}.localhost:${firstRangePort}` &&
      otherOrigin14 ===
        `http://p-${portOf(other)}.localhost:${firstRangePort}` &&
      firstOrigin14 !== otherOrigin14 &&
      firstByPort.ok &&
      otherByPort.ok,
    `${refusals}; kept ${kept.status} ${keptText.slice(0, 120)}; ${firstByPort.said}; ${otherByPort.said}`
  );

  // 14c. The lock: nothing without the hub's pass, but the ping; a ticket
  // opens the door once, for its own session, within its minute.
  const noPass = await loadOf(passless, `${firstOrigin14}/`);
  const passlessSocket = await passless
    .evaluate(
      () =>
        new Promise<string>((done) => {
          const ws = new WebSocket(
            `ws${location.origin.slice("http".length)}/hmr`
          );
          const timer = setTimeout(() => done("nothing in 5 s"), 5000);
          ws.onmessage = (event) => {
            clearTimeout(timer);
            done(String(event.data));
          };
          ws.onerror = () => {
            clearTimeout(timer);
            done("error");
          };
        })
    )
    .catch((error: Error) => error.message);
  const ping = await loadOf(passless, `${firstOrigin14}${PREVIEW_PING_PATH}`);
  const unheldPing = await loadOf(
    passless,
    `${unheldOrigin}${PREVIEW_PING_PATH}`
  );
  const unheldEntry = await loadOf(
    passless,
    previewEnterUrl(unheldOrigin, await ticketFor(session), "/")
  );
  const spentTicket = await ticketFor(session);
  const spender = await kit.page("desk");
  const firstSpend = await loadOf(
    spender,
    previewEnterUrl(firstOrigin14, spentTicket, "/")
  );
  await spender.context().close();
  const replayed = await loadOf(
    passless,
    previewEnterUrl(firstOrigin14, spentTicket, "/")
  );
  const elsewhere = await loadOf(
    passless,
    previewEnterUrl(firstOrigin14, await ticketFor(other), "/")
  );
  const lapsing = await ticketFor(session);
  // A ticket stands a minute (hub preview-access.ts TICKET_MS).
  await Bun.sleep(61_000);
  const expired = await loadOf(
    passless,
    previewEnterUrl(firstOrigin14, lapsing, "/")
  );
  await passless.context().close();
  const refusedLines = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes(TICKET_REFUSED))
    .map((line) =>
      line.slice(line.indexOf(TICKET_REFUSED) + TICKET_REFUSED.length)
    );
  const turnedAway = (said: { status: number; body: string }) =>
    said.status === 401 && said.body.includes("cawco-preview-locked");
  kit.check(
    "14c: without the hub's pass a preview name answers 401 and refuses a WebSocket, its ping stays open, a ticket from the API enters once (200), and a replayed ticket, another session's ticket and an expired ticket are each refused",
    turnedAway(noPass) &&
      passlessSocket !== TITLE &&
      ping.status === 200 &&
      firstSpend.status === 200 &&
      turnedAway(replayed) &&
      turnedAway(elsewhere) &&
      turnedAway(expired) &&
      ["spent", "elsewhere", "expired"].every((word) =>
        refusedLines.some((line) => line.startsWith(word))
      ),
    `no pass ${noPass.status}; its socket ${JSON.stringify(passlessSocket)}; ping ${ping.status}; entered ${firstSpend.status}; replayed ${replayed.status}; another session's ${elsewhere.status}; expired ${expired.status}; the hub said ${JSON.stringify(refusedLines)}`
  );

  // 14g. The lock tells a stranger nothing of which names are held: a name
  // no session holds answers as a held one does without a pass, its ping
  // too, and an entry there is refused. Only the owner's pass on a name
  // whose session has ended learns that it closed.
  const viewerOrigin = (await address(viewer)).origin ?? "none";
  const owner = await kit.page("desk");
  const viewerEntered = await loadOf(
    owner,
    previewEnterUrl(viewerOrigin, await ticketFor(viewer), PREVIEW_PING_PATH)
  );
  await fleet.stopSession(viewer);
  const released = await until(
    "the viewer's session ending and its port free",
    () => (portOf(viewer) === undefined ? 1 : null),
    Boolean,
    60_000
  ).catch(() => null);
  const ownerAfter = await loadOf(owner, `${viewerOrigin}/`);
  await owner.context().close();
  const strangerAfter = await kit.page("desk");
  const endedNoPass = await loadOf(strangerAfter, `${viewerOrigin}/`);
  await strangerAfter.context().close();
  kit.check(
    "14g: a name no session holds answers 401 with the very body a held name without a pass answers, its ping answers 200 as a held one's does, and an entry there is refused; a session's name after it ended answers its owner's pass with the closed page and a stranger with the same 401",
    turnedAway(unheld) &&
      unheld.body === noPass.body &&
      unheldPing.status === 200 &&
      unheldPing.body === ping.body &&
      turnedAway(unheldEntry) &&
      viewerEntered.status === 200 &&
      !!released &&
      ownerAfter.status === 404 &&
      ownerAfter.body.includes(
        '<meta name="cawco-preview-down" content="closed">'
      ) &&
      turnedAway(endedNoPass) &&
      endedNoPass.body === noPass.body,
    `unheld ${unheld.status}, same body as no pass: ${unheld.body === noPass.body}; its ping ${unheldPing.status}; its entry ${unheldEntry.status}; the viewer entered ${viewerEntered.status} at ${viewerOrigin}, ended ${released ? "and its port freed" : "but its port is still held"}; then its owner's pass ${ownerAfter.status}, a stranger ${endedNoPass.status}`
  );

  // 14d. The panel enters the preview with a ticket on its `{port}` name.
  await named.reload({ waitUntil: "domcontentloaded" });
  const byPortPane = await paneFrame(named, TITLE);
  kit.check(
    "14d: with a {port} pattern the panel loads the page from the session's port origin, entered with a ticket",
    !!byPortPane.frame &&
      new URL(byPortPane.frame.url()).origin === firstOrigin14,
    byPortPane.last
  );

  // 14e. The names' scheme is the pattern's, never the client's: an https
  // pattern gives https origins to a dashboard reached over http.
  const httpsKept = await putPattern(
    `https://p-{port}.localhost:${firstRangePort}`
  );
  const httpsOrigin = (await address(session)).origin ?? "none";
  const paneRequests: string[] = [];
  const noteRequest = (request: { url: () => string }) => {
    paneRequests.push(request.url());
  };
  named.on("request", noteRequest);
  await named.reload({ waitUntil: "domcontentloaded" });
  const pinged = await until(
    "the pane's ping to the https origin",
    () =>
      paneRequests.find((url) =>
        url.startsWith(`${httpsOrigin}${PREVIEW_PING_PATH}`)
      ),
    Boolean,
    30_000
  ).catch(() => null);
  named.off("request", noteRequest);
  await named.context().close();
  kit.check(
    "14e: an https pattern gives an https origin to a client that reached the hub over http, in the hub's address and in the web pane's own derivation",
    httpsKept.ok &&
      new URL(base).protocol === "http:" &&
      httpsOrigin ===
        `https://p-${portOf(session)}.localhost:${firstRangePort}` &&
      !!pinged,
    `kept ${httpsKept.status}; the dashboard on ${new URL(base).protocol}; address ${httpsOrigin}; the pane asked ${
      pinged ??
      `none of ${paneRequests
        .filter((url) => url.includes(".localhost"))
        .slice(0, 4)
        .join(", ")}`
    }`
  );

  // 14f. A pattern stored before patterns named their scheme takes http://
  // at the hub's start, saved and said in one line.
  await fleet.stop("hub");
  const stored = `p-{port}.localhost:${firstRangePort}`;
  fleet.write(
    "UPDATE preview_settings SET mode = 'host', pattern = ? WHERE id = 'preview'",
    stored
  );
  fleet.launch("hub");
  await fleet.hubUp();
  const migrated = (await (
    await fetch(`${fleet.base}/api/preview-settings`)
  ).json()) as { mode: string; pattern?: string };
  const migratedRow = fleet.query<{ pattern: string }>(
    "SELECT pattern FROM preview_settings WHERE id = 'preview'"
  )[0]?.pattern;
  const migrationLine = (await fleet.logs("hub"))
    .split("\n")
    .find((line) =>
      line.includes(`the host pattern ${stored} now names its scheme`)
    );
  kit.check(
    "14f: a host pattern stored with no scheme is http:// after the hub's start, in its answer and its row, said in one line",
    migrated.mode === "host" &&
      migrated.pattern === `http://${stored}` &&
      migratedRow === `http://${stored}` &&
      !!migrationLine,
    `${JSON.stringify(migrated)}; row ${migratedRow}; log: ${migrationLine ?? "none"}`
  );
  await fleet.agentUp();
  await fetch(`${fleet.base}/api/preview-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "port" }),
  });
  // Host mode bars the range's first port to sessions (it is its listener's):
  // a session that kept it moved, and keeps where it moved to.
  firstOrigin = `http://127.0.0.1:${(await address(session)).port}`;

  // 2–5. It survives, port mode again.
  const load = async (step: string, label: string) => {
    await tab.reload({ waitUntil: "domcontentloaded" });
    await tab.waitForSelector(FRAME, { timeout: 60_000 });
    const loaded = await paneFrame(tab, TITLE);
    kit.check(
      `${step}: ${label}, the next load shows the page`,
      !!loaded.frame,
      loaded.last
    );
  };
  await load("1b", "back in port mode");

  // The workspace's preview: a delegate's server in its own boundary.
  const previews: (Shown & { artifact: string; session: string })[] = [
    {
      label: "the host port's preview",
      origin: firstOrigin,
      title: TITLE,
      artifact: madeFirst,
      session,
    },
  ];
  if (boundaries) {
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Survives",
      machineId: MACHINE,
      cwd: fleet.repo,
    });
    const parent = await fleet.spawn("claude", "Parent", fleet.repo, {
      projectId: project.id,
    });
    sent += 1;
    const marker = String(sent);
    asks.set(marker, {
      name: CREATE,
      input: {
        kind: "preview",
        name: "in-workspace",
        port: WORKSPACE_PORT,
        serve: { command: servedCommand() },
      },
    });
    const delegated = await fleet.api<{
      instanceId: string;
      workspaceId: string;
    }>("/api/work-items", {
      parentInstanceId: parent,
      title: "Serve a page in the workspace",
      prompt: `Show the workspace's server. PROBE-CALL:${marker}`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: fleet.repo,
      checks: [{ name: "Probe check", command: "true" }],
    });
    const made = await until(
      "the workspace preview's artifact_create answer",
      () => answered.get(marker),
      Boolean,
      240_000
    ).catch(() => "no answer");
    const { port } = await address(delegated.instanceId);
    const inWorkspace = {
      label: `the workspace port's preview (workspace ${delegated.workspaceId.slice(0, 8)})`,
      origin: `http://127.0.0.1:${port}`,
      title: IN_WORKSPACE,
      artifact: made.match(ANSWERED_ID)?.[1] ?? "",
      session: delegated.instanceId,
    };
    const shownThere = await served(inWorkspace);
    kit.check(
      "1c: a delegate's served preview of a port in its workspace (its server run by the stage) is previewed: 200 with the overlay, and its WebSocket through the bridge opens",
      !!inWorkspace.artifact && shownThere.ok,
      `${made.slice(0, 160)}; ${shownThere.ms} ms; ${shownThere.last}`
    );
    previews.push(inWorkspace);
  }

  /** Every preview answers again within the bound, each its own check. */
  const answering = async (step: string, label: string) => {
    for (const preview of previews) {
      // biome-ignore lint/performance/noAwaitInLoops: one preview at a time, each its own line
      const again = await served(preview);
      kit.check(
        `${step}: ${label}, ${preview.label} answers 200 with the overlay and its WebSocket opens, within ${BOUND_MS / 1000} s`,
        again.ok,
        `${again.ms} ms; ${again.last}`
      );
    }
  };

  // 17. Overlapping starts: three shows of each at once.
  for (const preview of previews) {
    // biome-ignore lint/performance/noAwaitInLoops: one preview's shows at a time
    const shows = await Promise.all(
      [1, 2, 3].map(() =>
        fetch(
          `${fleet.base}/api/instances/${preview.session}/artifacts/${preview.artifact}/show`,
          { method: "POST", signal: AbortSignal.timeout(30_000) }
        )
          .then((response) => response.status)
          .catch((error: Error) => error.message)
      )
    );
    const after = await served(preview);
    kit.check(
      `17: three shows of ${preview.label} at once leave it answering, 200 with the overlay and its WebSocket open`,
      after.ok,
      `shows answered ${shows.join(", ")}; ${after.ms} ms; ${after.last}`
    );
  }

  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await answering("2", "after the agent restarts");
  await load("2", "after the agent restarts");

  // No dashboard open across the hub's restart: nothing asks for an address.
  await tab.context().close();
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  const pings = await Promise.all(
    previews.map(async (preview) => {
      const answer = await fetch(`${preview.origin}${PREVIEW_PING_PATH}`, {
        signal: AbortSignal.timeout(3000),
      })
        .then((response) => String(response.status))
        .catch((error: Error) => error.message);
      return `${preview.origin} ${answer}`;
    })
  );
  kit.check(
    "3: with no dashboard open, the restarted hub answers each preview origin's ping at once",
    pings.every((line) => line.endsWith(" 200")),
    pings.join("; ")
  );
  await fleet.agentUp();
  await answering("3", "after the hub restarts");
  tab = await kit.page("desk");
  await open(tab, where, FRAME);
  await load("3", "after the hub restarts");

  await fleet.stop("agent");
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  await answering("4", "after the agent and the hub restart together");
  await load("4", "after the agent and the hub restart together");

  // The install's order: the hub first, the old agent registering with it
  // again, then the agent.
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await answering("4b", "after the install's restarts (hub, then agent)");
  await load("4b", "after the install's restarts (hub, then agent)");
  await tab.context().close();
  await Bun.sleep(3000);
  tab = await kit.page("desk");
  await open(tab, where, FRAME);
  const reopened = await paneFrame(tab, TITLE);
  kit.check(
    "5: with no dashboard open in between, a new tab's panel shows the page",
    !!reopened.frame,
    reopened.last
  );

  // 19–21. A preview port is never the fleet's own, nor one another process holds.
  const [rangeFirst, rangeLast] = range.ports.split("–").map(Number) as [
    number,
    number,
  ];
  const inRange = (port: number | undefined): port is number =>
    port !== undefined && port >= rangeFirst && port <= rangeLast;
  /** The hub's line for `sid`'s preview moving from `from` to `to`, saying why. */
  const moveLine = async (sid: string, from: number, to: number) =>
    (await fleet.logs("hub"))
      .split("\n")
      .find((line) =>
        line.includes(
          `[preview] hub listener: preview of ${sid} moves from port ${from} to ${to}: `
        )
      );

  // 19. The dashboard's configured port is the one the session keeps (the
  // collision a hub already holds in its database): with no dashboard open,
  // nothing asks for an address, so the hub's start alone moves it.
  const dashboardPort = portOf(session) as number;
  await tab.context().close();
  await fleet.stop("hub");
  fleet.env.CAWCO_DASHBOARD_PORT = String(dashboardPort);
  fleet.launch("hub");
  await fleet.hubUp();
  const movedTo = portOf(session);
  firstOrigin = `http://127.0.0.1:${movedTo}`;
  previews[0].origin = firstOrigin;
  const onMoved = await served(previews[0]);
  const leftBehind = await fetch(
    `http://127.0.0.1:${dashboardPort}${PREVIEW_PING_PATH}`,
    { signal: AbortSignal.timeout(3000) }
  )
    .then((response) => String(response.status))
    .catch((error: Error) => error.message);
  const movedLine = await moveLine(session, dashboardPort, movedTo ?? 0);
  kit.check(
    "19: a session keeping the fleet's configured dashboard port (inside the range) is moved by the hub's start and saved, and its preview answers 200 with the overlay on the new port",
    inRange(movedTo) &&
      movedTo !== dashboardPort &&
      onMoved.ok &&
      leftBehind !== "200" &&
      !!movedLine?.endsWith("it is the dashboard's port"),
    `kept ${dashboardPort}, now ${movedTo}; ${onMoved.ms} ms; ${onMoved.last}; the old port's ping: ${leftBehind}; log: ${movedLine ?? "none"}`
  );

  // 20. A new session's port: the dashboard's and one another process holds
  // are passed over.
  const heldNow = new Set(
    fleet
      .query<{ port: number }>("SELECT port FROM preview_ports")
      .map((row) => row.port)
  );
  const lowestFree = (...also: number[]): number => {
    let port = rangeFirst;
    while (heldNow.has(port) || also.includes(port)) {
      port += 1;
    }
    return port;
  };
  const strangerPort = lowestFree(dashboardPort);
  const stranger = Bun.serve({
    hostname: "127.0.0.1",
    port: strangerPort,
    fetch: () => new Response("a stranger's server"),
  });
  const expected = lowestFree(dashboardPort, strangerPort);
  const newcomer = await fleet.spawn("claude", "Newcomer", fleet.repo);
  await create(newcomer, { name: "newcomer", port: second.server.port });
  const { port: newcomerPort } = await address(newcomer);
  const newcomerShown = await served({
    label: "the new session's preview",
    origin: `http://127.0.0.1:${newcomerPort}`,
    title: OTHER,
  });
  kit.check(
    "20: a new session's port passes over the dashboard's configured port and one another process holds, each lower than the port it takes, and its preview answers",
    newcomerPort === expected &&
      dashboardPort < expected &&
      strangerPort < expected &&
      newcomerShown.ok,
    `dashboard ${dashboardPort}, the stranger's ${strangerPort}, taken ${newcomerPort} (lowest open ${expected}); ${newcomerShown.ms} ms; ${newcomerShown.last}`
  );

  // 21. A kept port another process takes while the hub is down (the
  // dashboard socket's case): the hub's start moves it.
  await fleet.stop("hub");
  const squatter = Bun.serve({
    hostname: "127.0.0.1",
    port: newcomerPort as number,
    fetch: () => new Response("a squatter's server"),
  });
  fleet.launch("hub");
  await fleet.hubUp();
  const newcomerMoved = portOf(newcomer);
  const onNewcomer = await served({
    label: "the new session's preview",
    origin: `http://127.0.0.1:${newcomerMoved}`,
    title: OTHER,
  });
  const squatLine = await moveLine(
    newcomer,
    newcomerPort as number,
    newcomerMoved ?? 0
  );
  const squatterSays = await fetch(`http://127.0.0.1:${newcomerPort}/`)
    .then((response) => response.text())
    .catch((error: Error) => error.message);
  kit.check(
    "21: a kept port another process took while the hub was down is moved by the hub's start, past the dashboard's and the stranger's, and the preview answers 200 with the overlay there",
    inRange(newcomerMoved) &&
      ![newcomerPort, dashboardPort, strangerPort].includes(newcomerMoved) &&
      onNewcomer.ok &&
      squatterSays === "a squatter's server" &&
      !!squatLine?.endsWith("another process holds it"),
    `kept ${newcomerPort}, now ${newcomerMoved}; ${onNewcomer.ms} ms; ${onNewcomer.last}; the old port answers ${JSON.stringify(squatterSays)}; log: ${squatLine ?? "none"}`
  );
  await squatter.stop(true);
  await stranger.stop(true);
  await fleet.agentUp();
  tab = await kit.page("desk");
  await open(tab, where, FRAME);

  // 6. The server stops: the worded state, and the agent's one line.
  await first.server.stop(true);
  await tab.reload({ waitUntil: "domcontentloaded" });
  const down = await tab
    .locator(".preview-pane .down[role=alert]")
    .textContent({ timeout: 60_000 })
    .catch(() => null);
  const agentLog = await fleet.logs("agent");
  const agentLine = agentLog
    .split("\n")
    .find(
      (line) =>
        line.includes(
          `[preview] agent listener: preview of ${session} failed:`
        ) && line.includes(`port ${firstAppPort}`)
    );
  kit.check(
    "6: a stopped server draws the worded state with Try again, and the agent logs one line naming the port",
    !!down?.includes("The page's server stopped answering") &&
      down.includes("Try again") &&
      !!agentLine,
    `pane: ${JSON.stringify(down?.replace(/\s+/g, " ").trim())}; log: ${agentLine ?? "none"}`
  );

  // 7. Closed: a load of its origin answers the worded closed page.
  const closed = await fetch(`${fleet.base}/api/instances/${session}/preview`, {
    method: "DELETE",
  });
  const after = await fetch(`${firstOrigin}/gone/`);
  const body = await after.text();
  const hubLog = await fleet.logs("hub");
  const hubLine = hubLog
    .split("\n")
    .find((line) =>
      line.includes(
        `[preview] hub listener: preview of ${session} failed: its session shows no preview`
      )
    );
  kit.check(
    "7: a closed preview's origin answers the worded closed page, and the hub logs one line",
    closed.ok &&
      after.status === 404 &&
      body.includes('<meta name="cawco-preview-down" content="closed">') &&
      body.includes("This preview is closed") &&
      !!hubLine,
    `close ${closed.status}; load ${after.status}; ${body.slice(0, 160)}; log: ${hubLine ?? "none"}`
  );

  // 8. The old answer is gone from every hop.
  kit.check(
    "8: no journal says 'No preview selected'",
    ![hubLog, agentLog].some((text) => text.includes("No preview selected"))
  );

  // 18. A call waiting on a socket a newer register replaced fails at once.
  const agentUrl = `${fleet.base.replace(HTTP, "ws")}/ws`;
  /** A raw agent socket registered as {@link PROBE_MACHINE}, and every frame it hears. */
  const rawAgent = async () => {
    const frames: { verb?: string; payload?: unknown; requestId?: string }[] =
      [];
    const ws = new WebSocket(agentUrl);
    ws.onmessage = (event) => {
      frames.push(JSON.parse(String(event.data)));
    };
    await new Promise<void>((done, fail) => {
      ws.onopen = () => done();
      ws.onerror = () => fail(new Error(`no socket at ${agentUrl}`));
    });
    ws.send(
      JSON.stringify({
        verb: "register",
        machineId: PROBE_MACHINE,
        payload: { hostname: PROBE_MACHINE, os: "linux" },
      })
    );
    return { heard: frames, ws };
  };
  const old = await rawAgent();
  await until(
    "the probe machine online",
    async () =>
      (
        (await fetch(`${fleet.base}/api/agents`).then((r) => r.json())) as {
          machineId: string;
          status: string;
        }[]
      ).some(
        (row) => row.machineId === PROBE_MACHINE && row.status === "online"
      ),
    Boolean,
    15_000
  );
  // A call the old socket never answers: the machine's config read.
  const pending = fetch(`${fleet.base}/api/agents/${PROBE_MACHINE}/inspect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).then(async (response) => ({
    status: response.status,
    text: await response.text(),
    at: Date.now(),
  }));
  const asked = await until(
    "the inspect call on the old socket",
    () =>
      old.heard.find(
        (frame) =>
          frame.verb === "control" &&
          (frame.payload as { method?: string }).method === INSPECT_CONFIG
      ),
    Boolean,
    5000
  );
  const replacing = await rawAgent();
  const replacedAt = Date.now();
  const answer = await pending;
  // The old socket answers late: refused, as any frame from it is.
  const { requestId } = asked.payload as { requestId?: string };
  old.ws.send(
    JSON.stringify({
      verb: "frames",
      machineId: PROBE_MACHINE,
      requestId,
      payload: { kind: "control_result", requestId, ok: true, result: {} },
    })
  );
  const refusal = await until(
    "the late reply's refusal",
    () =>
      old.heard.find((frame) =>
        JSON.stringify(frame.payload ?? "").includes("not machine")
      ),
    Boolean,
    5000
  ).catch(() => undefined);
  const waited = answer.at - replacedAt;
  kit.check(
    "18: a call waiting on an agent socket a newer register replaced fails within a second with MACHINE_DISCONNECTED, not its 10 s timeout, and a late reply on the old socket is refused",
    answer.status === 500 &&
      answer.text.includes("The machine disconnected during this request") &&
      waited < 1000 &&
      !!refusal,
    `${answer.status} after ${waited} ms: ${answer.text.slice(0, 120)}; late reply: ${refusal ? JSON.stringify(refusal.payload).slice(0, 160) : "no refusal"}`
  );
  old.ws.close();
  replacing.ws.close();
  second.server.stop(true);
};

const spec: Spec = { name: "preview-survives", run };
export default spec;
