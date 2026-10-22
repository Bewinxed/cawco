/**
 * An artifact's comments link holds through the owner's real network path,
 * and a drop on it is reopened by itself (owner, 2026-10-21: the Comments
 * panel said "The comments couldn't be read. The hub closed the link
 * (1006).", "and doesn't tel lthe gaent i commented"). The owner's browser
 * reaches the dashboard and the previews through Cloudflare, which closes a
 * WebSocket idle past its timeout and on its own restarts, with no close
 * frame (developers.cloudflare.com/network/websockets).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) and the dashboard as the owner's machines run it (serve.js on
 * the published build under systemd's socket activation, socket-served.ts),
 * an artifact's own tab runs through an HTTP proxy (idle-proxy.ts) that
 * cuts every tunnel quiet for {@link IDLE_MS}, and that the spec cuts or
 * refuses by path. Read from each frame's own sockets (opens, closes and
 * their codes), the pane's DOM, the overlay's link (`cawcoArtifact`), the
 * hub's pins and what the model was sent:
 *
 * 1. Quiet past the proxy's timeout: a socket that says nothing (the
 *    control, to a silent server of the spec's) is cut at it with 1006; the
 *    pane's and the overlay's links stay open the whole time, the proxy
 *    cutting neither.
 * 2. A drop once synced (both links cut at once, 1006): each frame opens
 *    its link again within y-websocket's first backoff, the overlay syncs
 *    again, and the pane never says the comments couldn't be read.
 * 3. A drop before the first sync (the pane's first two attempts cut): the
 *    pane reads the comments on the third, and never says it couldn't.
 * 4. A link down for good (every attempt of the pane's cut): nothing said
 *    for the pane's grace (artifact-doc.ts `LINK_DOWN_MS`), then the
 *    comments couldn't be read, why and what happens next in the WORDS
 *    error formula; with the link let through, the comments by themselves,
 *    no Try again pressed.
 *    3 and 4 run at the desk on Chromium, WebKit and Firefox, and on the
 *    phone on Chromium.
 * 5. A comment the person writes with Comment while the page's link is down
 *    (cut and refused for 3 s, under the overlay's 5 s before it refuses
 *    the pen): its composer opens and Comment writes it, words and all, in
 *    the page's doc alone; once the link is back its words reach the hub
 *    within the backoff, and on Send the session hears them once.
 * 6. A tab really hidden behind another (hidden-tab.ts: Chromium headed on
 *    a headless Wayland session, through the same proxy), under Chromium's
 *    intensive wake-up throttling (developer.chrome.com/blog/
 *    timer-throttling-in-chrome-88: a timer chained 5 deep or more runs only
 *    on a once-a-minute wake-up; an open WebSocket exempts nothing, chromium
 *    commit b3ca8d2 "enables the IntensiveWakeUpThrottling and
 *    AllowAggressiveThrottlingWithWebSocket features by default"), its grace
 *    cut to 10 s: its timers read back on minute wake-ups, and for
 *    {@link HIDDEN_MS} neither link closes nor opens again, and the
 *    overlay's stays synced. y-websocket's resync then goes out once a
 *    minute, under the proxy's idle cut, and its 30 s no-message check runs
 *    on the same wake-ups; the hub's beat (artifacts/docs.ts) keeps the
 *    link busy and what it last heard fresh.
 * 7. A link gone silent (owner, 2026-10-21: DevTools offline kept the
 *    socket open and the control said nothing for some 50 s): the proxy
 *    stops forwarding both links and closes neither. A comment written in
 *    the silence is kept in the page; the Comments control says
 *    the comments aren't reaching the agent within 30 s, from the hub's
 *    missed beats (core doc-link.ts `watchSilence`), not after
 *    y-websocket's 30 s check and the 15 s grace; forwarding again, it
 *    clears within 30 s, the words reach the hub, and on Send the session
 *    hears them once.
 *
 *   bun scripts/probe-kit/run.ts comment-link
 */
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { hiddenTabs } from "../hidden-tab";
import { idleProxy } from "../idle-proxy";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  pressAt,
  type Spec,
  settle,
} from "../kit";
import { freePort, publishBuild, serveUnder } from "../socket-served";

const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
const LIST = '[data-slot="comment-rail"]';
const READ = `${LIST} [data-slot="pin-list-read"]`;
const NAME = "comment-link";
const PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Link</title></head><body style="margin:0;font:18px/1.6 system-ui"><main style="padding:24px"><h1>Link</h1><p id="here" style="width:70%">The paragraph the pin stands on.</p></main></body></html>';
/** The proxy's idle timeout. Our stand-in: Cloudflare doesn't publish its own. */
const IDLE_MS = 15_000;
/** How long (1) stays quiet: twice the proxy's timeout and more. */
const QUIET_MS = 2 * IDLE_MS + 5000;
/** The pane's grace before it says the link is down (artifact-doc.ts `LINK_DOWN_MS`). */
const LINK_DOWN_MS = 15_000;
/** How soon a dropped link opens again: y-websocket's backoff (200 ms, then 400, 800…) and a handshake. Our bound. */
const REOPEN_MS = 3000;
/** How long (5)'s link is down. */
const DOWN_MS = 3000;
/** How long (6)'s tab stays hidden: three of the throttled tab's wake-ups and more. */
const HIDDEN_MS = 200_000;
/** Chromium's intensive throttling: a wake-up a minute. */
const WAKE_MS = 60_000;
const PIN_WORDS = "Written while the link was down.";
/** What (7)'s pin says, written while both links are silent. */
const SILENT_WORDS = "Written while the link was silent.";
/**
 * How soon a silent link is said, and said back once forwarding again: the
 * brief's 30 s, over core doc-link.ts `SILENT_MS` (25 s) and its 1 s read.
 */
const SILENT_SAID_MS = 30_000;
/** The Comments control saying the comments aren't reaching the agent (PreviewPane `linkDown`). */
const DOWN = `${PANE} button[data-slot="comments"][data-link-down]`;
/** The comments notice (core injected.ts `artifactCommentsNotice`). */
const NOTICE =
  /\[CawCo\] The person commented on the page "comment-link" \(artifact [0-9a-f-]{36}\)\./;
/** How long a Send's delivery may take to reach the model, and how long after it no second one may come. */
const DELIVERY_MS = 12_000;
const STILL_MS = 12_000;
const PANE_PATH = /^\/ws\/artifact\//;
const OVERLAY_PATH = /\/__cawco\/artifact\/[0-9a-f-]{36}$/;
/** The control's path on the silent server. */
const CONTROL = "/quiet";

/** Every request the model was asked with, in order. */
const heard: Seen[] = [];
const respond = (request: Seen): Reply => {
  if (request.tools) {
    heard.push(request);
  }
  return { everyMs: 5, words: [request.tools ? "ok" : "Probe title"] };
};

/** One artifact socket a frame opened, from its own clock. */
interface Link {
  at: number;
  closed: number | null;
  code: number | null;
  opened: number | null;
  path: string;
}

/** Every frame keeps its artifact sockets (the pane's in the tab, the overlay's in the page), and the tab every fault the list drew. */
const recorder = () => {
  const links: {
    at: number;
    closed: number | null;
    code: number | null;
    opened: number | null;
    path: string;
  }[] = [];
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      const { pathname, search } = new URL(String(url), location.href);
      if (!(
        pathname.includes("/ws/artifact/") ||
        pathname.includes("/__cawco/artifact/") ||
        pathname === "/quiet"
      )) {
        return;
      }
      const link = {
        path: `${pathname}${search}`,
        at: performance.now(),
        opened: null as number | null,
        closed: null as number | null,
        code: null as number | null,
      };
      links.push(link);
      this.addEventListener("open", () => {
        link.opened = performance.now();
      });
      this.addEventListener("close", (event) => {
        link.closed = performance.now();
        link.code = event.code;
      });
    }
  } as typeof WebSocket;
  const faults: { at: number; text: string }[] = [];
  const look = () => {
    const fault = document.querySelector("[data-pin-list-failed]");
    const text = fault?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (fault && faults.at(-1)?.text !== text) {
      faults.push({ at: performance.now(), text });
    }
  };
  new MutationObserver(look).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  Object.defineProperty(window, "probeLinks", {
    value: () => ({ links, faults, now: performance.now() }),
  });
};

interface Recorded {
  faults: { at: number; text: string }[];
  links: Link[];
  now: number;
}

const linksOf = (frame: Page | Frame): Promise<Recorded> =>
  frame.evaluate(() =>
    (window as unknown as { probeLinks: () => Recorded }).probeLinks()
  );

/** The overlay's link to the hub now (preview-overlay artifact.ts `Link`). */
const overlayLink = (frame: Frame): Promise<string> =>
  frame.evaluate(() => {
    let state = "none";
    const off = (
      window as unknown as {
        cawcoArtifact: {
          subscribe: (
            h: (hold: { link: { state: string } }) => void
          ) => () => void;
        };
      }
    ).cawcoArtifact.subscribe(({ link }) => {
      ({ state } = link);
    });
    off();
    return state;
  });

/** The pins in the page's own doc, by id. */
const pagePins = (frame: Frame) =>
  frame.evaluate(
    () =>
      (
        window as unknown as {
          cawcoArtifact: {
            doc: { getMap: (n: string) => { toJSON: () => object } };
          };
        }
      ).cawcoArtifact.doc
        .getMap("pins")
        .toJSON() as Record<string, { thread: { text: string }[] }>
  );

const pageFrame = async (page: Page): Promise<Frame> =>
  (await until(
    "the page in the pane",
    async () =>
      (await (await page.locator(FRAME).elementHandle())?.contentFrame()) ??
      null,
    Boolean,
    60_000
  )) as Frame;

interface At {
  base: string;
  fleet: KitFleet;
  id: string;
  kit: Kit;
  session: string;
}

interface Where {
  engine: Engine;
  view: "desk" | "phone";
}

const DESK: Where = { engine: "chromium", view: "desk" };

/** A tab on the artifact through `proxy`, the Comments list open, every frame recording. */
const tab = async (at: At, proxy: string, where: Where = DESK): Promise<Page> =>
  onArtifact(
    at,
    await at.kit.page(where.view, { proxy, engine: where.engine }),
    `${where.engine} ${where.view}`
  );

/** `page` on the artifact, the Comments list open, every frame recording; `label` names it in a failure. */
const onArtifact = async (at: At, page: Page, label: string): Promise<Page> => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "open");
  }, `cawco-preview-comments:${at.session}`);
  await page.addInitScript(recorder);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  try {
    await open(
      page,
      `${at.base}/artifact/${at.id}`,
      `${PANE} [data-slot="comments"]`
    );
  } catch (error) {
    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    throw new Error(
      `${label}: the artifact's tab never drew its pane (${error instanceof Error ? error.message.split("\n")[0] : String(error)}); the page says ${JSON.stringify(text.slice(0, 300))}; errors ${JSON.stringify(errors.slice(0, 5))}`,
      { cause: error }
    );
  }
  return page;
};

const paneLinks = (seen: Recorded) =>
  seen.links.filter((link) => PANE_PATH.test(link.path));

const hubPins = async ({ fleet, id, session }: At) =>
  (
    await fleet.api<{
      artifacts: {
        id: string;
        pins: { id: string; thread: { text: string }[] }[];
      }[];
    }>(`/api/instances/${session}/artifacts/comments?artifact=${id}&filter=all`)
  ).artifacts.find((one) => one.id === id)?.pins ?? [];

const withWords = (pins: { thread: { text: string }[] }[], words = PIN_WORDS) =>
  pins.filter((pin) => pin.thread.some((entry) => entry.text === words));

/** The dashboard as the owner's machines run it, against `fleet`'s hub: its address, and its end. */
const servedDashboard = async (kit: Kit, fleet: KitFleet) => {
  await publishBuild();
  const port = await freePort();
  const served = serveUnder(
    fleet,
    [{ address: `127.0.0.1:${port}`, name: "dashboard" }],
    join(kit.out, "serve.log")
  );
  const base = `http://127.0.0.1:${port}`;
  await until(
    "serve.js answering",
    () =>
      fetch(`${base}/`).then(
        (answer) => answer.status,
        () => 0
      ),
    (status) => status === 200,
    30_000
  );
  return { base, stop: () => served.kill() };
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const dashboard = await servedDashboard(kit, fleet);
  const session = await fleet.spawn("claude", "Comment link", fleet.repo);
  const { id } = await fleet.api<{ id: string }>(
    `/api/instances/${session}/artifacts`,
    {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: NAME,
      html: PAGE,
    }
  );
  const proxy = await idleProxy(IDLE_MS);
  // The control's server: it answers the upgrade and never says a word.
  const silent = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request, server) =>
      server.upgrade(request) ? undefined : new Response(null, { status: 426 }),
    websocket: { message: () => undefined },
  });
  try {
    const at = { base: dashboard.base, fleet, id, kit, session };
    const page = await quiet(at, proxy, silent.port as number);
    await droppedOnceSynced(at, proxy, page);
    await pinnedWhileDown(at, proxy, page);
    await silentDrop(at, proxy, page);
    await page.close();
    await hiddenTab(at, proxy);
    for (const where of [
      DESK,
      { engine: "chromium", view: "phone" },
      { engine: "webkit", view: "desk" },
      { engine: "firefox", view: "desk" },
    ] satisfies Where[]) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one browser after another, each through the one proxy
        await droppedBeforeSync(at, proxy, where);
        await downForGood(at, proxy, where);
      } catch (error) {
        proxy.refuse(null);
        kit.check(
          `3 and 4 ${where.engine} ${where.view} run`,
          false,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  } finally {
    proxy.stop();
    silent.stop(true);
    dashboard.stop();
  }
};

type Proxy = Awaited<ReturnType<typeof idleProxy>>;

/** 1. Quiet past the proxy's timeout: the control is cut, the two links are not. */
const quiet = async (at: At, proxy: Proxy, silent: number): Promise<Page> => {
  const page = await tab(at, proxy.url);
  await page.waitForSelector(READ, { timeout: 30_000 });
  const frame = await pageFrame(page);
  await until(
    "the overlay synced",
    () => overlayLink(frame),
    (s) => s === "synced",
    30_000
  );
  await page.evaluate(
    ({ port, path }) => {
      Object.defineProperty(window, "probeControl", {
        value: new WebSocket(`ws://127.0.0.1:${port}${path}`),
      });
    },
    { port: silent, path: CONTROL }
  );
  await page.waitForTimeout(QUIET_MS);
  const tabSeen = await linksOf(page);
  const pageSeen = await linksOf(frame);
  const control = tabSeen.links.find((link) => link.path === CONTROL);
  const controlLived =
    typeof control?.closed === "number" && typeof control.opened === "number"
      ? Math.round(control.closed - control.opened)
      : null;
  at.kit.check(
    "1: a socket that says nothing is cut at the proxy's idle timeout, with 1006 (the proxy drops idle links)",
    control?.code === 1006 &&
      controlLived !== null &&
      controlLived >= IDLE_MS &&
      controlLived < IDLE_MS + 2000,
    `control ${JSON.stringify(control)}; lived ${controlLived} ms; idle ${IDLE_MS} ms`
  );
  const pane = paneLinks(tabSeen);
  const overlay = pageSeen.links.filter((link) => OVERLAY_PATH.test(link.path));
  const cut = proxy.idleCuts();
  at.kit.check(
    `1: quiet for ${QUIET_MS} ms, the pane's and the overlay's links stay open, the proxy cutting neither`,
    pane.length === 1 &&
      pane[0]?.closed === null &&
      overlay.length === 1 &&
      overlay[0]?.closed === null &&
      cut.every((path) => path === CONTROL),
    `pane ${JSON.stringify(pane)}; overlay ${JSON.stringify(overlay)}; idle cuts ${JSON.stringify(cut)}`
  );
  return page;
};

/** 2. Both links cut once synced: each opens again within the backoff, no fault said. */
const droppedOnceSynced = async (at: At, proxy: Proxy, page: Page) => {
  const frame = await pageFrame(page);
  const overlayBefore = (await linksOf(frame)).links.length;
  const t0 = Date.now();
  const cut = proxy.drop(
    (path) => PANE_PATH.test(path) || OVERLAY_PATH.test(path)
  );
  const read = async () => ({
    tabSeen: await linksOf(page),
    pageSeen: await linksOf(frame),
    link: await overlayLink(frame),
    ms: Date.now() - t0,
  });
  const back = await until(
    "both links open again and the overlay synced",
    read,
    (now) =>
      paneLinks(now.tabSeen).some(
        (link, i) => i >= 1 && link.opened !== null && link.closed === null
      ) &&
      now.pageSeen.links
        .slice(overlayBefore)
        .some((link) => link.opened !== null && link.closed === null) &&
      now.link === "synced",
    15_000
  ).catch(read);
  const pane = paneLinks(back.tabSeen);
  const overlay = back.pageSeen.links.filter((link) =>
    OVERLAY_PATH.test(link.path)
  );
  at.kit.check(
    `2: a drop once synced (${cut} links cut, 1006) reopens both within ${REOPEN_MS} ms and the overlay syncs again`,
    cut === 2 &&
      pane.length === 2 &&
      pane[0]?.code === 1006 &&
      overlay.length === 2 &&
      overlay[0]?.code === 1006 &&
      back.link === "synced" &&
      back.ms <= REOPEN_MS,
    `back in ${back.ms} ms; pane ${JSON.stringify(pane)}; overlay ${JSON.stringify(overlay)}; overlay link ${back.link}`
  );
  await page.waitForTimeout(1000);
  const { faults } = await linksOf(page);
  at.kit.check(
    "2: the pane never says the comments couldn't be read, and its list stands",
    faults.length === 0 && (await page.locator(READ).count()) === 1,
    `faults ${JSON.stringify(faults)}`
  );
};

/** Where `selector` in the page stands on the tab's screen. */
const screenBox = async (page: Page, frame: Frame, selector: string) => {
  const outer = await page.locator(FRAME).boundingBox();
  const inner = await frame.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!outer) {
    throw new Error("the pane's frame has no box");
  }
  return { x: outer.x + inner.x, y: outer.y + inner.y, w: inner.w, h: inner.h };
};

/** Whether the page's Comment mode is on. */
const commenting = (frame: Frame): Promise<boolean> =>
  frame.evaluate(
    () =>
      document
        .querySelector("cawco-overlay")
        ?.shadowRoot?.querySelector(".layer")
        ?.classList.contains("comment") ?? false
  );

/**
 * The person presses `#here` with Comment on, `across` its width (each leg
 * its own spot, off the comments before it), and writes `words` in the
 * composer that opens there, then Enter: a comment in the page's own doc,
 * as comment-delivery's are made. When the composer opened and when the
 * words were kept in the page.
 */
const writeComment = async (
  page: Page,
  frame: Frame,
  across = 0.3,
  words = PIN_WORDS
): Promise<{ composerAt: number; keptAt: number }> => {
  const comments = page.locator(`${PANE} button[data-slot="comments"]`);
  if ((await comments.getAttribute("aria-expanded")) === "true") {
    await comments.click();
    await page
      .locator(LIST)
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => undefined);
  }
  if (!(await commenting(frame))) {
    await page.locator(`${PANE} button[aria-keyshortcuts='C']`).focus();
    await page.keyboard.press("c");
  }
  await until(
    "the page's Comment mode on",
    () => commenting(frame),
    Boolean,
    5000
  );
  await settle(page, 300);
  const b = await screenBox(page, frame, "#here");
  const x = b.x + b.w * across;
  const y = b.y + b.h / 2;
  await page.mouse.move(x, y, { steps: 4 });
  await pressAt(frame, { x, y });
  const composer = page.locator('[data-slot="pin-composer"]');
  await composer.waitFor({ timeout: 15_000 });
  const composerAt = Date.now();
  await composer.getByRole("combobox").fill(words);
  await page.keyboard.press("Enter");
  await until(
    "the comment's words in the page's doc",
    () => pagePins(frame),
    (pins) => withWords(Object.values(pins), words).length === 1,
    5000
  );
  const keptAt = Date.now();
  await page.keyboard.press("Escape");
  return { composerAt, keptAt };
};

/** 5. A pin placed with Comment while the overlay's link is down: kept, on the hub once back, heard once. */
const pinnedWhileDown = async (at: At, proxy: Proxy, page: Page) => {
  const frame = await pageFrame(page);
  const heardBefore = heard.length;
  proxy.refuse((path) => OVERLAY_PATH.test(path));
  const cutAt = Date.now();
  proxy.drop((path) => OVERLAY_PATH.test(path));
  const down = await until(
    "the overlay's link lost",
    () => overlayLink(frame),
    (s) => s !== "synced",
    5000
  ).catch(() => "synced");
  const pinsBefore = Object.keys(await pagePins(frame)).length;
  const hubBefore = (await hubPins(at)).length;
  let failed = "";
  await writeComment(page, frame).catch((error: unknown) => {
    failed = `the tap: ${error instanceof Error ? error.message : String(error)}`;
  });
  const inPage = Object.keys(await pagePins(frame)).length - pinsBefore;
  const onHubWhileDown = (await hubPins(at)).length - hubBefore;
  const linkWhileDown = await overlayLink(frame);
  await page.waitForTimeout(Math.max(0, cutAt + DOWN_MS - Date.now()));
  const releasedAt = Date.now();
  proxy.refuse(null);
  const onHub = await until(
    "the comment's words on the hub",
    async () => withWords(await hubPins(at)),
    (pins) => pins.length > 0,
    15_000
  ).catch(async () => withWords(await hubPins(at)));
  const reachedIn = Date.now() - releasedAt;
  at.kit.check(
    "5: a comment written with Comment while the page's link is down is made, words and all, in the page alone; once the link is back its words reach the hub within the backoff",
    down !== "synced" &&
      linkWhileDown !== "synced" &&
      inPage === 1 &&
      onHubWhileDown === 0 &&
      !failed &&
      reachedIn <= REOPEN_MS + 1000 &&
      onHub.length === 1,
    `link while down ${linkWhileDown}; comments made in the page ${inPage}, on the hub ${onHubWhileDown}; on the hub ${reachedIn} ms after the link was let through; ${failed.slice(0, 400)}; words on the hub ${onHub.length}`
  );
  // Nothing goes until the person's Send.
  await page.locator(`${PANE} [data-slot="send"]`).click();
  await until(
    "the delivery",
    () => heard.slice(heardBefore).filter((one) => NOTICE.test(one.last)),
    (got) => got.length > 0,
    DELIVERY_MS + 10_000
  ).catch(() => []);
  await page.waitForTimeout(STILL_MS);
  const deliveries = heard
    .slice(heardBefore)
    .filter((one) => NOTICE.test(one.last) && !one.afterTool);
  at.kit.check(
    "5: on Send the session hears the comment once",
    deliveries.length === 1 && deliveries[0]?.last.includes(PIN_WORDS) === true,
    `${deliveries.length} deliveries; ${deliveries.map((one) => one.last.slice(0, 300)).join(" | ")}`
  );
};

/**
 * 7. Both links gone silent, open and unclosed (the proxy stalls them): a
 * pin tapped and written in the silence, the warning said within
 * {@link SILENT_SAID_MS}, cleared within it once forwarding again, and the
 * words heard once.
 */
const silentDrop = async (at: At, proxy: Proxy, page: Page) => {
  const frame = await pageFrame(page);
  const down = page.locator(DOWN);
  const before = await until(
    "both links synced, nothing said",
    async () => ({ link: await overlayLink(frame), down: await down.count() }),
    (now) => now.link === "synced" && now.down === 0,
    30_000
  ).catch(async () => ({
    link: await overlayLink(frame),
    down: await down.count(),
  }));
  const heardBefore = heard.length;
  const t0 = Date.now();
  const stalled = proxy.stall(
    (path) => PANE_PATH.test(path) || OVERLAY_PATH.test(path)
  );
  let failed = "";
  const written = await writeComment(page, frame, 0.7, SILENT_WORDS).catch(
    (error: unknown) => {
      failed = `the comment: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
      return null;
    }
  );
  const writtenMs = written ? written.keptAt - t0 : null;
  const saidMs = await down
    .waitFor({
      timeout: Math.max(1000, t0 + SILENT_SAID_MS + 10_000 - Date.now()),
    })
    .then(
      () => Date.now() - t0,
      () => null
    );
  const onHubWhileSilent = withWords(await hubPins(at), SILENT_WORDS).length;
  const label = await page
    .locator(`${PANE} button[data-slot="comments"]`)
    .getAttribute("aria-label");
  at.kit.check(
    `7: both links silent and unclosed (${stalled} stalled), a comment written in the silence, the Comments control says they aren't reaching the agent within ${SILENT_SAID_MS} ms`,
    before.link === "synced" &&
      before.down === 0 &&
      stalled === 2 &&
      writtenMs !== null &&
      saidMs !== null &&
      writtenMs < saidMs &&
      saidMs <= SILENT_SAID_MS &&
      onHubWhileSilent === 0 &&
      label?.includes("Comments aren't reaching the agent") === true,
    `before: overlay ${before.link}, warning ${before.down}; words kept in the page ${writtenMs ?? `never (${failed.slice(0, 400)})`} ms in; warning ${saidMs ?? "never"} ms in; words on the hub meanwhile ${onHubWhileSilent}; control ${JSON.stringify(label)}`
  );
  const releasedAt = Date.now();
  proxy.stall(null);
  const clearedMs = await down
    .waitFor({ state: "detached", timeout: SILENT_SAID_MS + 10_000 })
    .then(
      () => Date.now() - releasedAt,
      () => null
    );
  const linkNow = await until(
    "the overlay synced again",
    () => overlayLink(frame),
    (s) => s === "synced",
    10_000
  ).catch(() => overlayLink(frame));
  const onHub = await until(
    "the silent pin's words on the hub",
    async () => withWords(await hubPins(at), SILENT_WORDS),
    (pins) => pins.length > 0,
    15_000
  ).catch(async () => withWords(await hubPins(at), SILENT_WORDS));
  at.kit.check(
    `7: forwarding again, the warning clears within ${SILENT_SAID_MS} ms, the overlay syncs, and the words written in the silence reach the hub`,
    clearedMs !== null &&
      clearedMs <= SILENT_SAID_MS &&
      linkNow === "synced" &&
      onHub.length === 1,
    `cleared ${clearedMs ?? "never"} ms after forwarding again; overlay ${linkNow}; words on the hub ${onHub.length}`
  );
  // Nothing goes until the person's Send.
  await page.locator(`${PANE} [data-slot="send"]`).click();
  await until(
    "the delivery",
    () => heard.slice(heardBefore).filter((one) => NOTICE.test(one.last)),
    (got) => got.length > 0,
    DELIVERY_MS + 10_000
  ).catch(() => []);
  await page.waitForTimeout(STILL_MS);
  const deliveries = heard
    .slice(heardBefore)
    .filter((one) => NOTICE.test(one.last) && !one.afterTool);
  at.kit.check(
    "7: on Send the session hears the comment written in the silence once",
    deliveries.length === 1 &&
      deliveries[0]?.last.includes(SILENT_WORDS) === true,
    `${deliveries.length} deliveries; ${deliveries.map((one) => one.last.slice(0, 300)).join(" | ")}`
  );
};

/** 6. The tab really hidden behind another, its timers throttled by Chromium itself: neither link closes. */
const hiddenTab = async (at: At, proxy: Proxy) => {
  const browser = await hiddenTabs(join(at.kit.out, "hidden-tab"), proxy.url);
  try {
    const page = await onArtifact(at, await browser.open(), "hidden tab");
    await page.waitForSelector(READ, { timeout: 30_000 });
    const frame = await pageFrame(page);
    await until(
      "the overlay synced",
      () => overlayLink(frame),
      (s) => s === "synced",
      30_000
    );
    await hiddenFor(at, page, frame, () => browser.coverAll());
  } finally {
    await browser.stop();
  }
};

/** `page` hidden by `hide` for {@link HIDDEN_MS}, read back: its timers on minute wake-ups, its links untouched. */
const hiddenFor = async (
  at: At,
  page: Page,
  frame: Frame,
  hide: () => Promise<void>
) => {
  const frames = [page, frame];
  const before = await Promise.all(
    frames.map(async (one) => (await linksOf(one)).links.length)
  );
  // A 10 s interval of the page's own, read back for when it ran.
  const hiddenAt = await Promise.all(
    frames.map((one) =>
      one.evaluate(() => {
        const runs: number[] = [];
        setInterval(() => runs.push(performance.now()), 10_000);
        Object.defineProperty(window, "probeRuns", { value: () => runs });
        return performance.now();
      })
    )
  );
  await hide();
  const shown = await page.evaluate(() => document.visibilityState);
  await page.waitForTimeout(HIDDEN_MS);
  const runs = await page.evaluate(() =>
    (window as unknown as { probeRuns: () => number[] }).probeRuns()
  );
  const gaps = runs.slice(1).map((ran, i) => Math.round(ran - (runs[i] ?? 0)));
  at.kit.check(
    "6: the tab behind another is hidden, and Chromium wakes its chained timers once a minute",
    shown === "hidden" && (gaps.at(-1) ?? 0) >= WAKE_MS - 1000,
    `visibility ${shown}; a 10 s interval's gaps ${JSON.stringify(gaps)} ms`
  );
  const seen = await Promise.all(frames.map(linksOf));
  const closed = seen.flatMap(({ links }, i) =>
    links.filter(
      (link) =>
        link.path !== CONTROL &&
        link.closed !== null &&
        link.closed > (hiddenAt[i] ?? 0)
    )
  );
  const opened = seen.map(({ links }, i) => links.length - (before[i] ?? 0));
  const overlayNow = await overlayLink(frame);
  at.kit.check(
    `6: hidden for ${HIDDEN_MS} ms, neither link closes nor opens again, and the overlay's stays synced`,
    closed.length === 0 &&
      opened.every((n) => n === 0) &&
      overlayNow === "synced",
    `closed ${JSON.stringify(closed)}; opened since ${JSON.stringify(opened)}; overlay ${overlayNow}`
  );
};

/** 3. The pane's first two attempts cut before its first sync: read on the third, nothing said. */
const droppedBeforeSync = async (at: At, proxy: Proxy, where: Where) => {
  let cuts = 2;
  proxy.refuse((path) => {
    if (!PANE_PATH.test(path) || cuts === 0) {
      return false;
    }
    cuts -= 1;
    return true;
  });
  const page = await tab(at, proxy.url, where);
  const read = await page.waitForSelector(READ, { timeout: 20_000 }).then(
    () => true,
    () => false
  );
  proxy.refuse(null);
  const seen = await linksOf(page);
  const pane = paneLinks(seen);
  const first = pane[0]?.at ?? 0;
  const synced = pane.find(
    (link) => link.opened !== null && link.closed === null
  );
  const leg = `${where.engine} ${where.view}`;
  at.kit.check(
    `3 ${leg}: a drop before the first sync (two attempts cut, 1006) is reopened by itself, the comments read on the third`,
    read &&
      pane.length === 3 &&
      pane.slice(0, 2).every((link) => link.code === 1006) &&
      synced !== undefined &&
      synced.at - first <= REOPEN_MS,
    `pane ${JSON.stringify(pane)}`
  );
  at.kit.check(
    `3 ${leg}: the pane never says the comments couldn't be read`,
    seen.faults.length === 0,
    `faults ${JSON.stringify(seen.faults)}`
  );
  await page.close();
};

/** 4. Every attempt cut: said only past the grace, in the formula; cleared by itself once let through. */
const downForGood = async (at: At, proxy: Proxy, where: Where) => {
  proxy.refuse((path) => PANE_PATH.test(path));
  const page = await tab(at, proxy.url, where);
  const fault = await until(
    "the pane saying the link is down",
    () => linksOf(page),
    (now) => now.faults.length > 0,
    LINK_DOWN_MS + 10_000
  ).catch(() => linksOf(page));
  const pane = paneLinks(fault);
  const firstDrop = pane.find((link) => link.closed !== null)?.closed ?? null;
  const saidAt = fault.faults[0]?.at ?? null;
  const after =
    firstDrop !== null && saidAt !== null
      ? Math.round(saidAt - firstDrop)
      : null;
  const text = fault.faults[0]?.text ?? "";
  const leg = `${where.engine} ${where.view}`;
  at.kit.check(
    `4 ${leg}: a link down for good is said only after ${LINK_DOWN_MS} ms of reconnects`,
    after !== null &&
      after >= LINK_DOWN_MS &&
      after < LINK_DOWN_MS + 2000 &&
      pane.length >= 5,
    `said ${after} ms after the first drop; ${pane.length} attempts, codes ${pane.map((link) => link.code).join(",")}`
  );
  at.kit.check(
    `4 ${leg}: it says what happened, why, how to fix it and what happens next`,
    text.includes(
      "The comments couldn't be read. The link to the hub dropped (1006) and hasn't come back. It keeps trying by itself; Try again tries now."
    ),
    JSON.stringify(text)
  );
  const failed = paneLinks(await linksOf(page)).length;
  // Firefox holds a socket to a host whose last ones failed for its own
  // delay (WebSocketChannel.cpp FailDelay, RFC 6455 §7.2.3): "randomly
  // chosen between 200-400 ms", times 1.5 each failure, at most 60 s.
  const browserDelay =
    where.engine === "firefox"
      ? Math.min(60_000, 400 * 1.5 ** Math.max(0, failed - 1))
      : 0;
  proxy.refuse(null);
  const t0 = Date.now();
  const back = await page
    .waitForSelector(READ, { timeout: REOPEN_MS + 1000 + browserDelay + 5000 })
    .then(
      () => Date.now() - t0,
      () => null
    );
  at.kit.check(
    `4 ${leg}: let through, the comments come back by themselves within the backoff (y-websocket's${browserDelay ? ", and Firefox's own" : ""}), no Try again pressed, the fault gone`,
    back !== null &&
      back <= REOPEN_MS + 1000 + browserDelay &&
      (await page.locator("[data-pin-list-failed]").count()) === 0,
    `back in ${back} ms; ${failed} attempts failed${browserDelay ? `, Firefox's delay at most ${Math.round(browserDelay)} ms` : ""}`
  );
  await page.close();
};

const spec: Spec = { name: "comment-link", run };
export default spec;
