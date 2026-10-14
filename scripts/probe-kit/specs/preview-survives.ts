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
 * 14. Host mode set through Settings › Previews with `p-{session}.localhost`:
 *     the panel loads the page from `p-<session>.localhost`, routed by Host.
 * 15. A page on a third origin that frames the preview's port gets nothing:
 *     the preview names the dashboards in `frame-ancestors`, not it.
 * 16. With that header taken off in the browser, the third origin's frame
 *     loads the page, and a hello it forges is ignored: the overlay answers
 *     no `cawco:ready`.
 *
 * Every app's server refuses a WebSocket whose Origin is not `http://<its
 * Host>`, as a dashboard's `/ws` gate and Vite's HMR do: the agent rewrites
 * the Origin to the app's own `localhost:<port>`, and the Host has to say the
 * same on the socket as on a request.
 *
 * A second preview is of a port inside a workspace: a delegate of a project
 * session starts a server in its own workspace (its boundary's network,
 * reached through the agent's bridge) and shows it by its port. Needs a
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
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the checks are read in order, one after another.
import type { Frame, Page } from "playwright-core";
import { PREVIEW_PING_PATH } from "../../../packages/core/src/frames";
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
/** The delegate's brief asks for the server; its Bash's output says it is up (the command spells it apart, so its own text never matches). */
const SERVE = "PROBE-WORKSPACE-SERVE";
const SERVING = "WORKSPACE-SERVER-UP";
/** How long a preview has to answer again after a restart. Our call: a register and a listener start take a few seconds. */
const BOUND_MS = 30_000;
const HTTP = /^http/;

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

/** `text` as one single-quoted shell word. */
const quoted = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * What the delegate runs in its workspace: the same app as {@link appOf}, on
 * {@link WORKSPACE_PORT} of its boundary's loopback, left running in a
 * session of its own; the marker once it answers.
 */
const serveCommand = (): string => {
  const app = [
    `const page=${JSON.stringify(pageOf(IN_WORKSPACE))};`,
    `Bun.serve({hostname:"127.0.0.1",port:${WORKSPACE_PORT},fetch(r,s){`,
    `if(new URL(r.url).pathname==="/hmr"){const o=r.headers.get("origin");`,
    `if(o&&o!=="http://"+r.headers.get("host"))return new Response("refused",{status:403});`,
    `return s.upgrade(r)?undefined:new Response("no upgrade",{status:400})}`,
    `return new Response(page,{headers:{"content-type":"text/html"}})},`,
    `websocket:{open(w){w.send(${JSON.stringify(IN_WORKSPACE)})},message(){}}});`,
  ].join("");
  const [head, tail] = [SERVING.slice(0, 10), SERVING.slice(10)];
  return [
    `printf '%s' ${quoted(app)} > "$TMPDIR/workspace-app.js"`,
    `(setsid nohup bun "$TMPDIR/workspace-app.js" > "$TMPDIR/workspace-app.log" 2>&1 < /dev/null &)`,
    `for i in $(seq 100); do bun -e ${quoted(`await fetch("http://127.0.0.1:${WORKSPACE_PORT}/")`)} 2>/dev/null && echo "${head}""${tail}" && break; sleep 0.1; done`,
  ].join(" && ");
};

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
let serveIssued = false;

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(SERVE) && !request.all.includes(SERVING)) {
    if (serveIssued) {
      return text("The workspace's server did not start.");
    }
    serveIssued = true;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: serveCommand(), description: "Start the server" },
      },
    };
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
    const ws = new (
      WebSocket as unknown as new (
        url: string,
        options: { headers: Record<string, string> }
      ) => WebSocket
    )(`${origin.replace(HTTP, "ws")}/hmr`, { headers: { origin } });
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
    ).json()) as { host?: string; port?: number };

  const session = await fleet.spawn("claude", "Survives", fleet.repo);
  const madeFirst = await create(session, {
    name: "survives",
    port: first.server.port,
  });
  const base = await fleet.dashboard();
  const where = `${base}/session/${session}`;
  const { port: firstPort } = await address(session);
  const firstOrigin = `http://127.0.0.1:${firstPort}`;

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
      body: JSON.stringify({ mode: "host", pattern: "p-{session}.localhost" }),
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
  const pattern = `p-{session}.localhost:${range.ports.split("–")[0]}`;
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
  await tab.reload({ waitUntil: "domcontentloaded" });
  const byHost = await paneFrame(tab, TITLE);
  kit.check(
    "14: host mode set in Settings with p-{session}.localhost loads the page from the session's own host",
    !!saved &&
      !!byHost.frame &&
      new URL(byHost.frame.url()).host ===
        pattern.replace("{session}", session),
    `${JSON.stringify(saved)}; ${byHost.last}`
  );
  await fetch(`${fleet.base}/api/preview-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "port" }),
  });

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
      input: { kind: "preview", name: "in-workspace", port: WORKSPACE_PORT },
    });
    const delegated = await fleet.api<{
      instanceId: string;
      workspaceId: string;
    }>("/api/work-items", {
      parentInstanceId: parent,
      title: "Serve a page in the workspace",
      prompt: `${SERVE}: start the server, then show it. PROBE-CALL:${marker}`,
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
      "1c: a delegate's server on a port in its workspace is previewed: 200 with the overlay, and its WebSocket through the bridge opens",
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
  second.server.stop(true);
};

const spec: Spec = { name: "preview-survives", run };
export default spec;
