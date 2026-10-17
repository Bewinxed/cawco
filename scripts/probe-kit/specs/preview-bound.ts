/**
 * Opening a preview, however heavy its page, never stalls the dashboard
 * (owner, 2026-10-17: "whenever the preview tool opens it slows down and
 * eventually hangs my browser and even crashes the ios app").
 *
 *   PROBE_HEAVY_PREVIEW=<folder> bun scripts/probe-kit/run.ts preview-bound
 *
 * `PROBE_HEAVY_PREVIEW` is a page's folder as `artifact_create(kind:
 * "preview", dir)` takes it: the design preview he had open (a 23 MB build
 * of 360 files, its Rive wasm and .riv files). A one-line page beside it
 * says what the tool costs alone.
 *
 * A scratch fleet, the built dashboard at the desk at 2x (a Mac's screen),
 * two sessions, each showing one preview. Read from the dashboard's own
 * document: its long tasks (PerformanceObserver), the gaps in a 16 ms timer
 * on its thread (WebKit reports no long tasks), and the overlay's messages
 * as the pane hears them; the frame's process from DevTools' targets.
 *
 * 1. Heavy page, Chromium: from the page's `cawco:ready` (where the pane
 *    asks for its thumbnail) to the thumbnail's arrival plus `AFTER_MS`, the
 *    dashboard's longest task is under `TASK_MS`, and the thumbnail is at
 *    most `THUMB_BYTES` of base64.
 * 2. The preview's origin asks for a process of its own on every answer
 *    (`Origin-Agent-Cluster: ?1`); where Chromium runs the frame (an
 *    out-of-process iframe target or not) is noted. Playwright's Chromium
 *    keys a secure origin's process by itself, so 1 reads the thumbnail's
 *    own cost on the dashboard's thread only where 7 does: WebKit, which
 *    runs every frame there, as Chromium does over plain http.
 * 3. The light page: the same window, noted beside 1, the tool's own cost.
 * 4. A conversation's tab put off screen: its preview's frame stands for
 *    `PARK_MS`, is gone after it, and loads again (the page says ready)
 *    when its tab is back.
 * 5. Back from parked, the frame's document fetches none of the page's
 *    files again (Resource Timing, `transferSize` 0): each stands at its
 *    folder's key (core `versionAssets`) and comes from the cache, and so
 *    does the overlay, at its own key (core `keyOverlay`).
 * 6. A file of the folder changed on disk, then the pane's Reload: the
 *    page's files stand at a new key, and the changed sheet is fetched
 *    with its new bytes.
 * 8. A dashboard opened at another origin (`localhost`) adds a parent to
 *    the overlay's text: after a reload the overlay stands at a new key and
 *    is fetched over the network.
 * 7. Heavy page, WebKit at a phone (the owner's Brave on iOS), which runs
 *    every frame on the dashboard's thread: its load to its thumbnail is
 *    noted (the page's own work is in it); the page settled, the thumbnail
 *    asked again alone holds the dashboard's thread under `TASK_MS` at a
 *    time (the longest gap in a 16 ms timer).
 *
 * Every reading is written to `numbers.json` in the spec's out folder.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, as a person opens them
import { existsSync } from "node:fs";
import { appendFile, cp, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Frame, Page } from "playwright-core";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

/** The dashboard's longest task a preview's load and thumbnail may cost it. Our call: two frames at 60 Hz plus slack, not the 1.8 s a whole-page capture took. */
const TASK_MS = 200;
/** After the thumbnail arrives, what the pane does with it (the tool row's picture) is the pane's own: counted. */
const AFTER_MS = 500;
/** A thumbnail's base64 at most: the overlay's 200,000 px bound as a PNG. Our call. */
const THUMB_BYTES = 400_000;
/** PreviewPane's `PARK_MS`. */
const PARK_MS = 30_000;
const LIGHT = `<!doctype html><html><head><meta charset="utf-8"><title>Light</title></head><body><p>One line.</p></body></html>`;

/** What the dashboard's own document records, from before its scripts. */
interface Cost {
  gaps: [number, number][];
  heard: [number, string, number][];
  tasks: [number, number][];
}

/** Installed in every frame; only the dashboard's own top document records. */
function watchDashboard(): void {
  if (window.top !== window) {
    return;
  }
  const cost: Cost = { tasks: [], gaps: [], heard: [] };
  (window as unknown as { __cost: Cost }).__cost = cost;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        cost.tasks.push([entry.startTime, entry.duration]);
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // WebKit has no long tasks: the timer's gaps stand for them.
  }
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (now - last > 50) {
      cost.gaps.push([last, now - last]);
    }
    last = now;
  }, 16);
  addEventListener(
    "message",
    (event) => {
      const data = event.data as { png?: unknown; type?: unknown } | null;
      if (typeof data?.type === "string" && data.type.startsWith("cawco:")) {
        cost.heard.push([
          performance.now(),
          data.type,
          typeof data.png === "string" ? data.png.length : 0,
        ]);
      }
    },
    true
  );
}

const costOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cost: Cost }).__cost);

interface Span {
  /** The thumbnail's length, base64; 0 when none came. */
  bytes: number;
  /** The longest task (or timer gap) in the window, ms. */
  longest: number;
  /** When the page said ready and when its thumbnail came, the dashboard's clock. */
  ready: number;
  thumb: number;
  /** Every long task in the window, ms. */
  total: number;
}

/** From the page's first `cawco:ready` to its thumbnail plus `AFTER_MS`: what the dashboard's thread held. */
async function captureWindow(page: Page, by: "tasks" | "gaps"): Promise<Span> {
  await until(
    "the page's thumbnail heard by the pane",
    () => costOf(page),
    (heard) => heard.heard.some(([, type]) => type === "cawco:capture"),
    120_000
  );
  await page.waitForTimeout(AFTER_MS + 100);
  const read = await costOf(page);
  const ready = read.heard.find(([, type]) => type === "cawco:ready")?.[0] ?? 0;
  const [thumb, , bytes] = read.heard.find(
    ([, type]) => type === "cawco:capture"
  ) ?? [0, "", 0];
  const inside = (by === "tasks" ? read.tasks : read.gaps).filter(
    ([at, ms]) => at + ms >= ready && at <= thumb + AFTER_MS
  );
  return {
    ready,
    thumb,
    bytes,
    longest: Math.max(0, ...inside.map(([, ms]) => ms)),
    total: inside.reduce((sum, [, ms]) => sum + ms, 0),
  };
}

/** How long the page is left to settle after its load before the thumbnail is asked again alone. Our call. */
const SETTLE_MS = 5000;

/**
 * The thumbnail alone, the page settled: the dashboard asks the frame
 * again (`cawco:capture`, as the pane does on a load) and reads its thread
 * from the ask to the answer plus `AFTER_MS`.
 */
async function captureAlone(page: Page, by: "tasks" | "gaps"): Promise<Span> {
  await page.waitForTimeout(SETTLE_MS);
  const asked = await page.evaluate(() => {
    const cost = (window as unknown as { __cost: Cost }).__cost;
    cost.heard.length = 0;
    const frame = document.querySelector<HTMLIFrameElement>(
      'iframe[title="Preview"][data-ready]'
    );
    frame?.contentWindow?.postMessage(
      { type: "cawco:capture" },
      new URL(frame.src).origin
    );
    return performance.now();
  });
  await until(
    "the thumbnail asked alone",
    () => costOf(page),
    (heard) => heard.heard.some(([, type]) => type === "cawco:capture"),
    60_000
  );
  await page.waitForTimeout(AFTER_MS + 100);
  const read = await costOf(page);
  const [thumb, , bytes] = read.heard.find(
    ([, type]) => type === "cawco:capture"
  ) ?? [0, "", 0];
  const inside = (by === "tasks" ? read.tasks : read.gaps).filter(
    ([at, ms]) => at + ms >= asked && at <= thumb + AFTER_MS
  );
  return {
    ready: asked,
    thumb,
    bytes,
    longest: Math.max(0, ...inside.map(([, ms]) => ms)),
    total: inside.reduce((sum, [, ms]) => sum + ms, 0),
  };
}

const said = (w: Span) =>
  `ready at ${w.ready.toFixed(0)} ms, thumbnail at ${w.thumb.toFixed(0)} ms (${w.bytes} bytes); longest ${w.longest.toFixed(0)} ms, ${w.total.toFixed(0)} ms of long tasks in all`;

/** The browser's out-of-process frames on `origin`: DevTools' `iframe` targets. */
async function ownProcessFrames(
  browser: Browser,
  origin: string
): Promise<string[]> {
  const cdp = await browser.newBrowserCDPSession();
  const { targetInfos } = (await cdp.send("Target.getTargets")) as {
    targetInfos: { type: string; url: string }[];
  };
  await cdp.detach();
  return targetInfos
    .filter((one) => one.type === "iframe" && one.url.startsWith(origin))
    .map((one) => one.url);
}

/** How long a loaded page is given for what it loads later (its states' Rive files, its grammars). Our call. */
const LAZY_MS = 5000;

/** The preview's frame in `page`: the frame on the preview's origin under the dashboard. */
const previewFrameOf = (page: Page, origin: string): Frame | undefined =>
  page
    .frames()
    .find(
      (frame) => frame !== page.mainFrame() && frame.url().startsWith(origin)
    );

/** What the frame's document loaded of its origin's files, by Resource Timing: at a key or not, from the cache (`transferSize` 0) or the network. */
interface Fetched {
  cached: number;
  fetched: string[];
  fetchedBytes: number;
  keys: string[];
  overlayBytes: number;
  overlayKey: string;
  versioned: number;
}

function fetchedFiles(page: Page, origin: string): Promise<Fetched> {
  const frame = previewFrameOf(page, origin);
  if (!frame) {
    return Promise.resolve({
      versioned: 0,
      cached: 0,
      fetched: ["no preview frame"],
      fetchedBytes: 0,
      overlayBytes: 0,
      overlayKey: "",
      keys: [] as string[],
    });
  }
  return frame.evaluate(() => {
    const own = (
      performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    ).filter((entry) => entry.name.startsWith(location.origin));
    const path = (entry: PerformanceResourceTiming) =>
      new URL(entry.name).pathname;
    // The hub's own: the overlay, its ping, the doc's socket and sends.
    const files = own.filter(
      (entry) =>
        !path(entry).startsWith("/__cawco/") ||
        path(entry).startsWith("/__cawco/v/")
    );
    const fetched = files.filter((entry) => entry.transferSize > 0);
    const overlay = own.find((entry) => path(entry) === "/__cawco/overlay.js");
    return {
      versioned: files.filter((entry) => path(entry).startsWith("/__cawco/v/"))
        .length,
      cached: files.filter((entry) => entry.transferSize === 0).length,
      fetched: fetched.map((entry) => path(entry)),
      fetchedBytes: fetched.reduce((sum, entry) => sum + entry.transferSize, 0),
      overlayBytes: overlay?.transferSize ?? 0,
      // Its address's `?k=<key>`: the overlay's key (core `keyOverlay`).
      overlayKey: overlay
        ? (new URL(overlay.name).searchParams.get("k") ?? "")
        : "",
      // `/__cawco/v/<key>/…`: its third segment.
      keys: [
        ...new Set(
          files
            .filter((entry) => path(entry).startsWith("/__cawco/v/"))
            .map((entry) => path(entry).split("/")[3] ?? "")
        ),
      ],
    };
  });
}

/** Sheet `name` as the frame's document loaded it: its key, whether it came over the network, and its bytes now. */
function sheetOf(page: Page, origin: string, name: string) {
  const frame = previewFrameOf(page, origin);
  if (!(frame && name)) {
    return Promise.resolve({ key: "", fetched: false, text: "" });
  }
  return frame.evaluate(async (file) => {
    const entry = (
      performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    ).find((one) => one.name.includes(`/assets/${file}`));
    if (!entry) {
      return { key: "", fetched: false, text: "" };
    }
    const path = new URL(entry.name).pathname;
    return {
      key: path.startsWith("/__cawco/v/") ? (path.split("/")[3] ?? "") : "",
      fetched: entry.transferSize > 0,
      text: await (await fetch(entry.name, { cache: "force-cache" })).text(),
    };
  }, name);
}

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const run = async (kit: Kit) => {
  const heavy = process.env.PROBE_HEAVY_PREVIEW;
  if (!(heavy && existsSync(join(heavy, "index.html")))) {
    kit.check(
      "0: PROBE_HEAVY_PREVIEW names a page's folder (its index.html)",
      false,
      `PROBE_HEAVY_PREVIEW=${heavy ?? "unset"}`
    );
    return;
  }
  const numbers: Record<string, unknown> = {};
  // A copy, so the spec can make a new revision of it (6).
  const folder = join(kit.out, "heavy");
  await cp(heavy, folder, { recursive: true });
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const heavyOne = await fleet.spawn("claude", "Heavy preview", fleet.repo);
  const lightOne = await fleet.spawn("claude", "Light preview", fleet.repo);
  await fleet.api(`/api/instances/${heavyOne}/artifacts`, {
    kind: "preview",
    name: "heavy",
    dir: folder,
  });
  await fleet.api(`/api/instances/${lightOne}/artifacts`, {
    kind: "page",
    name: "light",
    html: LIGHT,
  });
  const base = await fleet.dashboard();

  // 1, 2. The heavy page at the desk, on Chromium.
  const desk = await kit.page("desk", { init: [watchDashboard] });
  await desk.addInitScript(
    (ids) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: ids, active: ids[0], opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [heavyOne, lightOne]
  );
  await open(desk, `${base}/session/${heavyOne}`, 'iframe[title="Preview"]');
  const heavyDesk = await captureWindow(desk, "tasks");
  numbers.heavyDesk = heavyDesk;
  kit.check(
    `1: heavy page, Chromium at 2x: the dashboard's longest task from ready to the thumbnail is under ${TASK_MS} ms, and the thumbnail at most ${THUMB_BYTES} bytes`,
    heavyDesk.longest < TASK_MS && heavyDesk.bytes <= THUMB_BYTES,
    said(heavyDesk)
  );
  const frameSrc = await desk
    .locator('iframe[title="Preview"]')
    .first()
    .getAttribute("src");
  const previewOrigin = frameSrc ? new URL(frameSrc).origin : "";
  const headers = await fetch(`${previewOrigin}/__cawco/ping`).then(
    (answer) => answer.headers.get("origin-agent-cluster") ?? "none"
  );
  const browser = desk.context().browser();
  const isolated = browser
    ? await ownProcessFrames(browser, previewOrigin)
    : [];
  numbers.isolated = { previewOrigin, headers, isolated };
  kit.check(
    "2: every answer on the preview's origin asks for a process of its own (Origin-Agent-Cluster: ?1)",
    headers === "?1",
    `origin ${previewOrigin}, origin-agent-cluster ${headers}`
  );
  // Playwright's Chromium keys this origin's process by itself (it did
  // without the header too): where the frame runs is said, not held.
  kit.note(
    `2: the preview's frame in Chromium: ${isolated.length > 0 ? "out of process" : "in the dashboard's process"} (${isolated.length} out-of-process frames)`
  );

  // 3. The heavy page's tab put off screen (its neighbour's shown): its
  // frame stands, then goes, and loads again with its tab.
  const heavyFrames = () =>
    desk
      .locator(
        `[data-slot="pane"][data-pane="${heavyOne}"] iframe[title="Preview"]`
      )
      .count();
  await desk.locator(`[data-session-tab="${lightOne}"]`).click();
  await desk.waitForTimeout(1000);
  const before = await heavyFrames();
  await desk.waitForTimeout(PARK_MS + 2000);
  const after = await heavyFrames();
  await desk.evaluate(() => {
    (window as unknown as { __cost: Cost }).__cost.heard.length = 0;
  });
  await desk.locator(`[data-session-tab="${heavyOne}"]`).click();
  const back = await until(
    "the heavy page ready again",
    () => costOf(desk),
    (read) => read.heard.some(([, type]) => type === "cawco:ready"),
    120_000
  ).then(
    () => true,
    () => false
  );
  numbers.parked = { before, after, back };
  kit.check(
    `4: a tab off screen: its preview's frame stands, is gone ${PARK_MS / 1000} s on, and loads again with its tab`,
    before === 1 && after === 0 && back,
    `frames 1 s off screen ${before}, ${(PARK_MS + 3000) / 1000} s off screen ${after}, ready again ${back}`
  );

  // 5. Back from parked, the revision already loaded comes from the cache.
  await desk.waitForTimeout(LAZY_MS);
  const returned = await fetchedFiles(desk, previewOrigin);
  numbers.returned = returned;
  kit.check(
    "5: back from parked, none of the page's files nor the overlay is fetched again: each comes from the cache at its key",
    returned.versioned > 0 &&
      returned.fetched.length === 0 &&
      !!returned.overlayKey &&
      returned.overlayBytes === 0,
    `${returned.versioned} files at a key, ${returned.cached} from the cache; fetched again ${returned.fetched.length} (${returned.fetchedBytes} bytes): ${returned.fetched.slice(0, 6).join(", ") || "none"}; the overlay at key ${returned.overlayKey || "none"}, ${returned.overlayBytes} bytes over the network`
  );

  // 6. A new revision (one file changed on disk) loads the new files.
  const sheet = (await readdir(join(folder, "assets"))).find((name) =>
    name.endsWith(".css")
  );
  const marker = `/* preview-bound revision ${Date.now()} */`;
  if (sheet) {
    await appendFile(join(folder, "assets", sheet), `\n${marker}\n`);
  }
  await desk.evaluate(() => {
    (window as unknown as { __cost: Cost }).__cost.heard.length = 0;
  });
  await desk
    .locator(
      `[data-slot="pane"][data-pane="${heavyOne}"] button[aria-label="Reload"]`
    )
    .click();
  await until(
    "the new revision ready",
    () => costOf(desk),
    (read) => read.heard.some(([, type]) => type === "cawco:ready"),
    120_000
  );
  const revised = await sheetOf(desk, previewOrigin, sheet ?? "");
  numbers.revised = { sheet, ...revised, was: returned.keys };
  kit.check(
    "6: a file changed on disk is a new key: after a reload the page's files stand at it, and the sheet is fetched with its new bytes",
    !!sheet &&
      !!revised.key &&
      !returned.keys.includes(revised.key) &&
      revised.fetched &&
      revised.text.includes(marker),
    `sheet ${sheet}: key ${revised.key} (was ${returned.keys.join(", ")}), fetched ${revised.fetched}, new bytes ${revised.text.includes(marker)}`
  );

  // 8. A changed overlay (a dashboard on a new origin adds a parent to its
  // text, as one reached by another name does) loads at its new key.
  const keyBefore = (await fetchedFiles(desk, previewOrigin)).overlayKey;
  const elsewhere = await kit.page("desk");
  await open(
    elsewhere,
    `${base.replace("127.0.0.1", "localhost")}/session/${heavyOne}`,
    'iframe[title="Preview"]'
  );
  await elsewhere.close();
  await desk.evaluate(() => {
    (window as unknown as { __cost: Cost }).__cost.heard.length = 0;
  });
  await desk
    .locator(
      `[data-slot="pane"][data-pane="${heavyOne}"] button[aria-label="Reload"]`
    )
    .click();
  await until(
    "the page ready under the changed overlay",
    () => costOf(desk),
    (read) => read.heard.some(([, type]) => type === "cawco:ready"),
    120_000
  );
  const changed = await fetchedFiles(desk, previewOrigin);
  numbers.overlayChanged = {
    before: keyBefore,
    after: changed.overlayKey,
    bytes: changed.overlayBytes,
  };
  kit.check(
    "8: a changed overlay (a new parent origin) is a new key, fetched once over the network",
    !!keyBefore &&
      !!changed.overlayKey &&
      changed.overlayKey !== keyBefore &&
      changed.overlayBytes > 0,
    `the overlay's key ${keyBefore || "none"} → ${changed.overlayKey || "none"}, ${changed.overlayBytes} bytes over the network`
  );

  // The light page alone, the tool's own cost.
  const lightDesk = await kit.page("desk", { init: [watchDashboard] });
  await lightDesk.addInitScript((id) => {
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root: { t: "l", id: "pone", tabs: [id], active: id, opened: null },
        focusedLeaf: "pone",
      })
    );
  }, lightOne);
  await open(
    lightDesk,
    `${base}/session/${lightOne}`,
    'iframe[title="Preview"]'
  );
  const light = await captureWindow(lightDesk, "tasks");
  numbers.lightDesk = light;
  kit.note(`3: light page, Chromium at 2x: ${said(light)}`);

  // 5. The heavy page on WebKit at a phone.
  const phone = await kit.page("iphone15Pro", {
    engine: "webkit",
    scale: 3,
    init: [watchDashboard],
  });
  await open(phone, `${base}/session/${heavyOne}`, 'iframe[title="Preview"]');
  const heavyPhone = await captureWindow(phone, "gaps");
  numbers.heavyPhone = heavyPhone;
  // WebKit runs every frame on the dashboard's thread: the page's own work
  // after its load (its bundle, its Rive) shares the window above.
  kit.note(
    `7: heavy page, WebKit at a phone (3x), its load to its thumbnail: ${said(heavyPhone)}`
  );
  const alonePhone = await captureAlone(phone, "gaps");
  numbers.alonePhone = alonePhone;
  kit.check(
    `7: heavy page, WebKit at a phone (3x), the page settled: the thumbnail alone holds the dashboard's thread under ${TASK_MS} ms at a time`,
    alonePhone.longest < TASK_MS && alonePhone.bytes <= THUMB_BYTES,
    said(alonePhone)
  );
  await writeFile(
    join(kit.out, "numbers.json"),
    JSON.stringify(numbers, null, 2)
  );
};

const spec: Spec = { name: "preview-bound", run };
export default spec;
