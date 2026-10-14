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
 *
 * It survives (port mode again), between loads:
 *
 * 2. The agent restarts (its listeners go with it).
 * 3. The hub restarts (the agent's listener stays).
 * 4. The agent and the hub restart together.
 * 5. The dashboard tab closes, nothing shows the session, and a new tab
 *    opens it.
 * 6. The server stops: the pane draws the worded state, and the agent's
 *    journal has one `[preview] agent listener` line naming the port.
 * 7. The panel's preview is closed: a load of its origin answers the worded
 *    closed page (404, `cawco-preview-down` closed), and the hub's journal
 *    says so in one `[preview] hub listener` line.
 * 8. No journal says "No preview selected".
 *
 * A boundary handover needs a workspace boundary, which needs unprivileged
 * user namespaces: a run inside a workspace (where bwrap is refused) notes
 * it and goes on.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the checks are read in order, one after another.
import type { Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const FRAME = 'iframe[title="Preview"]';
const TITLE = "Survives probe page";
const OTHER = "Second session's page";

/** A page whose script opens a WebSocket back to its own origin, as an HMR client does, and keeps what its server said. */
const pageOf = (title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><script>window.__said=new Promise(function(done){var ws=new WebSocket(location.origin.replace(/^http/,"ws")+"/hmr");ws.onmessage=function(e){done(String(e.data))};ws.onerror=function(){done("error")}});</script></body></html>`;

/** A server for one session's page: its page, its socket saying its title, and every Cookie header it was sent. */
const appOf = (title: string) => {
  const cookies: string[] = [];
  const server = Bun.serve<{ title: string }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, bun) {
      cookies.push(request.headers.get("cookie") ?? "");
      if (new URL(request.url).pathname === "/hmr") {
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

const run = async (kit: Kit) => {
  try {
    await Bun.$`bwrap --unshare-user --unshare-net --ro-bind / / --dev /dev --proc /proc true`.quiet();
  } catch (error) {
    kit.note(
      `boundary handover not run here: ${(error as { stderr?: Buffer }).stderr?.toString().trim() ?? String(error)}`
    );
  }
  const first = appOf(TITLE);
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
    await shown.frame.evaluate(
      (hub) =>
        fetch(`${hub}/api/preview-settings`, {
          method: "PUT",
          mode: "no-cors",
          credentials: "include",
          headers: { "content-type": "text/plain" },
          body: JSON.stringify({
            mode: "host",
            pattern: "p-{session}.localhost",
          }),
        }).catch(() => undefined),
      fleet.base
    );
    await tab.waitForTimeout(500);
    const hubLine = (await fleet.logs("hub"))
      .split("\n")
      .find((line) =>
        line.includes(
          "[hub] refused a same-site request to PUT /api/preview-settings"
        )
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
  await create(viewer, {
    name: "dashboard-copy",
    port: Number(new URL(base).port),
    path: `/session/${session}`,
  });
  const viewerTab = await kit.page("desk");
  await open(viewerTab, `${base}/session/${viewer}`, FRAME);
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
  /** Where the previewed dashboard stands, and whether its window is the one marked before the click. */
  const standing = async (frame: Frame): Promise<string> => {
    try {
      return await frame.evaluate(
        (id) =>
          location.pathname === `/session/${id}` &&
          (window as unknown as { __kept?: number }).__kept === 1
            ? "moved in place"
            : `${location.pathname}, kept ${(window as unknown as { __kept?: number }).__kept ?? "lost"}`,
        other
      );
    } catch {
      return "the frame reloaded";
    }
  };
  let moved = "no previewed dashboard";
  if (copy) {
    await copy.evaluate(() => {
      (window as unknown as { __kept: number }).__kept = 1;
    });
    await copy.locator(`a[href="/session/${other}"]`).first().click();
    const frame = copy;
    try {
      moved = (await until(
        "the previewed dashboard on the other session",
        async () => {
          const now = await standing(frame);
          return now === "moved in place" ? now : null;
        },
        Boolean,
        30_000
      )) as string;
    } catch {
      moved = await standing(frame);
    }
  }
  kit.check(
    "12: a previewed dashboard routes /session/<id> at its own root and moves to another session without a reload",
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
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await load("2", "after the agent restarts");
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await load("3", "after the hub restarts");
  await fleet.stop("agent");
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  await load("4", "after the agent and the hub restart together");
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
        ) && line.includes(`port ${first.server.port}`)
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
