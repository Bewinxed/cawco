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
 * mock model) and the built dashboard, an artifact's own tab at the desk
 * runs through an HTTP proxy (idle-proxy.ts) that cuts every tunnel quiet
 * for {@link IDLE_MS}, and that the spec cuts or refuses by path. Read from
 * each frame's own sockets (opens, closes and their codes), the pane's DOM,
 * the overlay's link (`cawcoArtifact`), the hub's pins and what the model
 * was sent:
 *
 * 1. Quiet past the proxy's timeout: a socket that says nothing (the
 *    control) is cut at it with 1006; the pane's and the overlay's links
 *    stay open the whole time, the proxy cutting neither (y-websocket's
 *    resync, core doc-link.ts `RESYNC_MS`, is their keepalive).
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
 * 5. A pin written on the page while its link is down (cut and refused for
 *    3 s, under the overlay's 5 s before it refuses the pen) reaches the
 *    hub once the link is back, and the session hears it once.
 *
 *   bun scripts/probe-kit/run.ts comment-link
 */
import type { Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { idleProxy } from "../idle-proxy";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
const LIST = '[data-pin-list-pop] [data-slot="pin-list"]';
const READ = `${LIST} [data-slot="pin-list-read"]`;
const NAME = "comment-link";
const PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Link</title></head><body><h1>Link</h1><p id="here">The paragraph the pin stands on.</p></body></html>';
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
const PIN_WORDS = "Written while the link was down.";
/** The comments notice (core injected.ts `artifactCommentsNotice`). */
const NOTICE =
  /\[CawCo\] The person commented on the page "comment-link" \(artifact [0-9a-f-]{36}\)\./;
/** The hub's quiet period, how far past it a delivery may reach the model, and how long after it no second one may come. */
const DELIVERY_MS = 10_000 + 6000;
const STILL_MS = 12_000;
const PANE_PATH = /^\/ws\/artifact\//;
const OVERLAY_PATH = /\/__cawco\/artifact\/[0-9a-f-]{36}$/;
/** The control's own mark on its socket's address. */
const CONTROL = "probe=quiet";

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
        pathname.includes("/__cawco/artifact/")
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

/** A tab on the artifact through `proxy`, the Comments list open, every frame recording. */
const tab = async (at: At, proxy: string): Promise<Page> => {
  const page = await at.kit.page("desk", { proxy });
  await page.addInitScript((key) => {
    localStorage.setItem(key, "open");
  }, `cawco-preview-comments:${at.session}`);
  await page.addInitScript(recorder);
  await open(
    page,
    `${at.base}/artifact/${at.id}`,
    `${PANE} [data-slot="comments"]`
  );
  return page;
};

const paneLinks = (seen: Recorded) =>
  seen.links.filter(
    (link) => PANE_PATH.test(link.path) && !link.path.includes(CONTROL)
  );

const hubPins = async ({ fleet, id, session }: At) =>
  (
    await fleet.api<{
      artifacts: {
        id: string;
        pins: { id: string; thread: { text: string }[] }[];
      }[];
    }>(`/api/instances/${session}/artifacts/comments?artifact=${id}&filter=all`)
  ).artifacts.find((one) => one.id === id)?.pins ?? [];

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
  const base = await fleet.dashboard();
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
  try {
    const at = { base, fleet, id, kit, session };
    const page = await quiet(at, proxy);
    await droppedOnceSynced(at, proxy, page);
    await pinnedWhileDown(at, proxy, page);
    await page.close();
    await droppedBeforeSync(at, proxy);
    await downForGood(at, proxy);
  } finally {
    proxy.stop();
  }
};

type Proxy = Awaited<ReturnType<typeof idleProxy>>;

/** 1. Quiet past the proxy's timeout: the control is cut, the two links are not. */
const quiet = async (at: At, proxy: Proxy): Promise<Page> => {
  const page = await tab(at, proxy.url);
  await page.waitForSelector(READ, { timeout: 30_000 });
  const frame = await pageFrame(page);
  await until(
    "the overlay synced",
    () => overlayLink(frame),
    (s) => s === "synced",
    30_000
  );
  const cutsBefore = proxy.idleCuts().length;
  // The control: a socket on the pane's own path that never answers the hub.
  await page.evaluate(
    ({ session, id, mark }) => {
      Object.defineProperty(window, "probeControl", {
        value: new WebSocket(
          `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/artifact/${session}/${id}?${mark}`
        ),
      });
    },
    { session: at.session, id: at.id, mark: CONTROL }
  );
  await page.waitForTimeout(QUIET_MS);
  const tabSeen = await linksOf(page);
  const pageSeen = await linksOf(frame);
  const control = tabSeen.links.find((link) => link.path.includes(CONTROL));
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
  const cut = proxy.idleCuts().slice(cutsBefore);
  at.kit.check(
    `1: quiet for ${QUIET_MS} ms, the pane's and the overlay's links stay open, the proxy cutting neither`,
    pane.length === 1 &&
      pane[0]?.closed === null &&
      overlay.length === 1 &&
      overlay[0]?.closed === null &&
      cut.every((path) => path.includes(CONTROL)),
    `pane ${JSON.stringify(pane)}; overlay ${JSON.stringify(overlay)}; idle cuts ${JSON.stringify(cut)}`
  );
  return page;
};

/** 2. Both links cut once synced: each opens again within the backoff, no fault said. */
const droppedOnceSynced = async (at: At, proxy: Proxy, page: Page) => {
  const frame = await pageFrame(page);
  const before = [
    (await linksOf(page)).links.length,
    (await linksOf(frame)).links.length,
  ];
  const t0 = Date.now();
  const cut = proxy.drop(
    (path) =>
      (PANE_PATH.test(path) || OVERLAY_PATH.test(path)) &&
      !path.includes(CONTROL)
  );
  const back = await until(
    "both links open again and the overlay synced",
    async () => {
      const tabSeen = await linksOf(page);
      const pageSeen = await linksOf(frame);
      return {
        tabSeen,
        pageSeen,
        link: await overlayLink(frame),
        ms: Date.now() - t0,
      };
    },
    (now) =>
      paneLinks(now.tabSeen).some(
        (link, i) => i >= 1 && link.opened !== null && link.closed === null
      ) &&
      now.pageSeen.links
        .slice(before[1])
        .some((link) => link.opened !== null && link.closed === null) &&
      now.link === "synced",
    15_000
  ).catch(async () => ({
    tabSeen: await linksOf(page),
    pageSeen: await linksOf(frame),
    link: await overlayLink(frame),
    ms: Date.now() - t0,
  }));
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
    `back in ${back.ms} ms; pane ${JSON.stringify(pane)}; overlay ${JSON.stringify(overlay)}; overlay link ${back.link}; tab links before ${before[0]}`
  );
  await page.waitForTimeout(1000);
  const { faults } = await linksOf(page);
  at.kit.check(
    "2: the pane never says the comments couldn't be read, and its list stands",
    faults.length === 0 && (await page.locator(READ).count()) === 1,
    `faults ${JSON.stringify(faults)}`
  );
};

/** 5. A pin written while the overlay's link is down reaches the hub, and the session once. */
const pinnedWhileDown = async (at: At, proxy: Proxy, page: Page) => {
  const frame = await pageFrame(page);
  const heardBefore = heard.length;
  proxy.refuse((path) => OVERLAY_PATH.test(path));
  proxy.drop((path) => OVERLAY_PATH.test(path));
  const down = await until(
    "the overlay's link lost",
    () => overlayLink(frame),
    (s) => s !== "synced",
    5000
  ).catch(() => "synced");
  await frame.evaluate((words) => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => { set: (k: string, v: object) => void };
          };
        };
      }
    ).cawcoArtifact;
    const now = new Date().toISOString();
    doc.getMap("pins").set("probe-link-pin", {
      id: "probe-link-pin",
      number: 1,
      kind: "comment",
      anchor: { selector: "#here", text: "The paragraph the pin stands on." },
      at: now,
      by: "person",
      elements: [],
      point: { x: 0.5, y: 0.5 },
      thread: [{ id: "probe-link-entry", by: "person", text: words, at: now }],
    });
  }, PIN_WORDS);
  const onHubWhileDown = (await hubPins(at)).some(
    (pin) => pin.id === "probe-link-pin"
  );
  await page.waitForTimeout(DOWN_MS);
  proxy.refuse(null);
  const synced = await until(
    "the overlay synced again",
    () => overlayLink(frame),
    (s) => s === "synced",
    15_000
  ).catch(() => "not synced");
  const onHub = await until(
    "the pin on the hub",
    () => hubPins(at),
    (pins) => pins.some((pin) => pin.id === "probe-link-pin"),
    15_000
  ).catch(() => hubPins(at));
  at.kit.check(
    "5: a pin written while the link is down is on the hub once the link is back",
    down !== "synced" &&
      !onHubWhileDown &&
      synced === "synced" &&
      onHub.some((pin) => pin.thread.some((entry) => entry.text === PIN_WORDS)),
    `overlay while down ${down}; on the hub while down ${onHubWhileDown}; after ${synced}; hub ${JSON.stringify(onHub.map((pin) => pin.id))}`
  );
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
    "5: the session hears the pin once",
    deliveries.length === 1 && deliveries[0]?.last.includes(PIN_WORDS) === true,
    `${deliveries.length} deliveries; ${deliveries.map((one) => one.last.slice(0, 300)).join(" | ")}`
  );
};

/** 3. The pane's first two attempts cut before its first sync: read on the third, nothing said. */
const droppedBeforeSync = async (at: At, proxy: Proxy) => {
  let cuts = 2;
  proxy.refuse((path) => {
    if (!PANE_PATH.test(path) || cuts === 0) {
      return false;
    }
    cuts -= 1;
    return true;
  });
  const page = await tab(at, proxy.url);
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
  at.kit.check(
    "3: a drop before the first sync (two attempts cut, 1006) is reopened by itself, the comments read on the third",
    read &&
      pane.length === 3 &&
      pane.slice(0, 2).every((link) => link.code === 1006) &&
      synced !== undefined &&
      synced.at - first <= REOPEN_MS,
    `pane ${JSON.stringify(pane)}`
  );
  at.kit.check(
    "3: the pane never says the comments couldn't be read",
    seen.faults.length === 0,
    `faults ${JSON.stringify(seen.faults)}`
  );
  await page.close();
};

/** 4. Every attempt cut: said only past the grace, in the formula; cleared by itself once let through. */
const downForGood = async (at: At, proxy: Proxy) => {
  proxy.refuse((path) => PANE_PATH.test(path));
  const page = await tab(at, proxy.url);
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
  at.kit.check(
    `4: a link down for good is said only after ${LINK_DOWN_MS} ms of reconnects`,
    after !== null &&
      after >= LINK_DOWN_MS &&
      after < LINK_DOWN_MS + 2000 &&
      pane.length >= 5,
    `said ${after} ms after the first drop; ${pane.length} attempts, codes ${pane.map((link) => link.code).join(",")}`
  );
  at.kit.check(
    "4: it says what happened, why, how to fix it and what happens next",
    text.includes(
      "The comments couldn't be read. The link to the hub dropped (1006) and hasn't come back. It keeps trying by itself; Try again tries now."
    ),
    JSON.stringify(text)
  );
  proxy.refuse(null);
  const t0 = Date.now();
  const back = await page.waitForSelector(READ, { timeout: 10_000 }).then(
    () => Date.now() - t0,
    () => null
  );
  at.kit.check(
    "4: let through, the comments come back by themselves, no Try again pressed, the fault gone",
    back !== null &&
      back <= REOPEN_MS + 1000 &&
      (await page.locator("[data-pin-list-failed]").count()) === 0,
    `back in ${back} ms`
  );
  await page.close();
};

const spec: Spec = { name: "comment-link", run };
export default spec;
