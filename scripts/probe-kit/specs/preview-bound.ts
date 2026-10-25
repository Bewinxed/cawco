/**
 * Opening a preview, however heavy its page, never stalls the dashboard
 * (owner, 2026-10-17: "whenever the preview tool opens it slows down and
 * eventually hangs my browser and even crashes the ios app"), and a
 * preview kept off screen is there as it was when its tab is back, up to
 * the owner's bound of hidden pages ("2 on desktop, 1 on phone").
 *
 *   PROBE_HEAVY_PREVIEW=<folder> bun scripts/probe-kit/run.ts preview-bound
 *
 * `PROBE_HEAVY_PREVIEW` is a page's folder as `artifact_create(kind:
 * "preview", dir)` takes it: the design preview he had open (a 23 MB build
 * of 360 files, its Rive wasm and .riv files), with its sheets under
 * `assets/`. One-line pages beside it say what the tool costs alone and
 * take the bound's places.
 *
 * A scratch fleet, the built dashboard at the desk at 2x (a Mac's screen),
 * a session per preview. Read from the dashboard's own document: its long
 * tasks (PerformanceObserver), the gaps in a 16 ms timer on its thread
 * (WebKit reports no long tasks), and the overlay's messages as the pane
 * hears them; the frame's process from DevTools' targets.
 *
 * 1. Heavy page, Chromium: from the page's `cawco:ready` for `LOAD_MS`, the
 *    dashboard's longest task is under `TASK_MS`, and no thumbnail is taken
 *    (no transcript card shows this page); the thumbnail asked alone holds
 *    the dashboard under `TASK_MS` and is at most `THUMB_BYTES` of base64.
 * 2. The preview's origin asks for a process of its own on every answer
 *    (`Origin-Agent-Cluster: ?1`); where Chromium runs the frame (an
 *    out-of-process iframe target or not) is noted. Playwright's Chromium
 *    keys a secure origin's process by itself, so 1 reads the thumbnail's
 *    own cost on the dashboard's thread only where 7 does: WebKit, which
 *    runs every frame there, as Chromium does over plain http.
 * 3. The light page: its thumbnail asked alone, noted beside 1, the tool's
 *    own cost.
 * 4. A conversation's tab put off screen for `KEPT_MS`, within the bound:
 *    its preview's frame stands, held, and is the same document when its
 *    tab is back (no new `cawco:ready`).
 * 4b. Past the bound: two more preview tabs shown in turn, then another, so
 *    the heavy page is the third hidden and the one hidden longest: its
 *    frame is gone, and it loads again (the page says ready) with its tab.
 * 5. Back past the bound, the frame's document fetches none of the page's
 *    files again (Resource Timing, `transferSize` 0): each stands at its
 *    folder's key (core `versionAssets`) and comes from the cache, and so
 *    does the overlay, at its own key (core `keyOverlay`). A document the
 *    page frames on its own origin (the heavy page frames itself, at
 *    `./index.html?frame`) is no file of the page: every hop serves a
 *    document `no-store` (core preview-proxy.ts:126, as it names the
 *    overlay's key when served and a page artifact's carries its doc's
 *    state), and a frame loaded again "asks the network for its document
 *    alone" (preview-proxy.ts:338). It is noted, address and bytes, asked at
 *    most once; the files it loads are the page's, each at its key and from
 *    the cache.
 * 6. A file of the folder changed on disk, then the pane's Reload: the
 *    page's files stand at a new key, and the changed sheet is fetched
 *    with its new bytes.
 * 8. A dashboard opened at another origin (`localhost`) adds a parent to
 *    the overlay's text: after a reload the overlay stands at a new key and
 *    is fetched over the network.
 * 9. A session page loaded with a conversation's tab behind another: that
 *    tab's preview has no frame for `RESTORED_MS`, and loads once its tab
 *    is shown.
 * 10. A page the session made with `artifact_create`: its card in the
 *    transcript on screen, the pane open, the thumbnail is taken once and
 *    the card shows it.
 * 12. A page artifact of a real size (`FULL_SECTIONS` sections, each with a
 *    choice and a kept field) opening on a Chromium that keeps every frame in the
 *    dashboard's process: the overlay's own script, read off a DevTools
 *    trace as its evaluation's thread time (its compile and top-level run)
 *    and, outside that, V8's sampled self time of its functions (and the
 *    natives they called), up to `OPENED_MS` after the frame is ready, is
 *    under `OVERLAY_CPU_MS`; its bytes, decoded and over the wire, are noted.
 * 7. Heavy page, Playwright WebKit with a phone's viewport and agent, which runs
 *    every frame on the dashboard's thread: its load is noted (the page's
 *    own work is in it); the page settled, the thumbnail asked alone holds
 *    the dashboard's thread under `TASK_MS` at a time (the longest gap in a
 *    16 ms timer).
 * 11. WebKit at a phone, the bound of 1: three conversations each with a
 *    page in its sheet. Back to the first from the second, its frame is
 *    the same element and the same document; past the bound (the second,
 *    then the third shown), the first's frame is gone, and it loads again
 *    with its tab.
 *
 * 13. The desk's bound of 2 across switches, as the live run made them: A,
 *    B and C opened, then C→A→B→C→A, each stood on `DWELL_MS`: every
 *    return finds its page as it was (the same document). Each switch shows
 *    one pane and puts another away, each pane saying so from its own effect
 *    in the tree's order.
 * 14. A phone's bound of 1: B's conversation opened, then A→B→A: A's page
 *    is kept. Panes are built in the order they are first shown, so B's
 *    effect runs before A's on B→A.
 * 15. A page artifact whose own script starts an interval as it is parsed,
 *    with no <head> and with one: off screen `DWELL_MS` its interval runs 0
 *    times, and runs again once its tab is back.
 * 16. A canvas standing in a conversation's panel: held while its tab is
 *    off screen (its frame says `cawco:held` true), let go with its tab.
 *
 * Every reading is written to `numbers.json` in the spec's out folder.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, as a person opens them
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: one scenario, read in order, one check after another.
import { existsSync } from "node:fs";
import { appendFile, cp, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { traceMain } from "../frames";
import { type Kit, open, type Spec } from "../kit";

/** The dashboard's longest task a preview's load and thumbnail may cost it. Our call: two frames at 60 Hz plus slack, not the 1.8 s a whole-page capture took. */
const TASK_MS = 200;
/** After the thumbnail arrives, what the pane does with it (the tool row's picture) is the pane's own: counted. */
const AFTER_MS = 500;
/** A thumbnail's base64 at most: the overlay's 200,000 px bound as a PNG. Our call. */
const THUMB_BYTES = 400_000;
/** The window after a load's `cawco:ready` that 1 reads: the pane once asked for a thumbnail inside it. Our call. */
const LOAD_MS = 3000;
/** How long a tab stays off screen within the bound (4): past the 30 s the pane once unloaded at. */
const KEPT_MS = 33_000;
/** How long a restored tab behind another is watched for a frame (9). */
const RESTORED_MS = 5000;
/** How long after a page artifact's frame is ready its overlay's work is counted (12): its hello, its doc's join, what the pane asks of it then. */
const OPENED_MS = 3000;
/** The overlay's own script time as a page artifact opens, at most (12). The owner's design: under 30 ms. */
const OVERLAY_CPU_MS = 30;
/** A sampled function of the overlay's own script (`name@overlay.js?k=…:line:column`, or a native it called). */
const OVERLAY_FRAME = /@overlay\.js/;
/** The overlay's own address (core `OVERLAY_PATH`), at its key or not. */
const OVERLAY_URL = /\/__cawco\/overlay\.js(?:\?|$)/;
/** Sections of the page artifact 12 opens: a long landing page's worth, each with a choice and a field. Our call. */
const FULL_SECTIONS = 300;
/** A page artifact the size of a real one (12): headings, copy, a choice and a kept field in every section. */
const fullPage = () =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Full</title></head><body>${Array.from(
    { length: FULL_SECTIONS },
    (_, i) =>
      `<section><h2>Part ${i}</h2><p>${"A sentence of copy on this part of the page. ".repeat(6)}</p><div data-cawco-choice="pick-${i}"><button data-option="a">A</button><button data-option="b">B</button></div><input name="note-${i}" placeholder="Note"></section>`
  ).join("")}</body></html>`;
/** An interval the page starts as it is parsed, counting on its window (15). */
const TICKER =
  "<script>window.__ticks=0;setInterval(function(){window.__ticks++;},1000);</script>";
/** A page artifact with no <head> nor <html>, its interval in its body (15). */
const TICKS_BARE = `<!doctype html><meta charset="utf-8"><title>Ticks</title><h1>Ticks</h1>${TICKER}`;
/** The same with a <head> (15). */
const TICKS_HEAD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ticks</title></head><body><h1>Ticks</h1>${TICKER}</body></html>`;
/** How long each conversation is stood on in 13's switches, and a ticking page left off screen in 15: the live run's 11 s. */
const DWELL_MS = 11_000;
const pageOf = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1></body></html>`;

/** What the dashboard's own document records, from before its scripts. */
interface Cost {
  gaps: [number, number][];
  heard: [number, string, number][];
  /** Each frame's word that it is held or let go (`cawco:held`): when, its origin, and which. */
  held: [number, string, boolean][];
  tasks: [number, number][];
}

/** Installed in every frame; only the dashboard's own top document records. */
function watchDashboard(): void {
  if (window.top !== window) {
    return;
  }
  const cost: Cost = { tasks: [], gaps: [], heard: [], held: [] };
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
      const data = event.data as {
        held?: unknown;
        png?: unknown;
        type?: unknown;
      } | null;
      if (typeof data?.type === "string" && data.type.startsWith("cawco:")) {
        cost.heard.push([
          performance.now(),
          data.type,
          typeof data.png === "string" ? data.png.length : 0,
        ]);
      }
      if (data?.type === "cawco:held") {
        cost.held.push([performance.now(), event.origin, data.held === true]);
      }
    },
    true
  );
}

const costOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cost: Cost }).__cost);

/** Forgets what the dashboard heard so far: the next read starts here. */
const forget = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __cost: Cost }).__cost.heard.length = 0;
  });

/** Whether `type` was heard since the last {@link forget}. */
const heard = async (page: Page, type: string) =>
  (await costOf(page)).heard.some(([, one]) => one === type);

interface Span {
  /** The thumbnail's length, base64; 0 when none came. */
  bytes: number;
  /** The longest task (or timer gap) in the window, ms. */
  longest: number;
  /** When the window opened and when its thumbnail came (0 when none), the dashboard's clock. */
  ready: number;
  thumb: number;
  /** Every long task in the window, ms. */
  total: number;
}

/** From the page's first `cawco:ready` for `LOAD_MS`: what the dashboard's thread held, and any thumbnail asked meanwhile. */
async function loadWindow(page: Page, by: "tasks" | "gaps"): Promise<Span> {
  await until(
    "the page's ready heard by the pane",
    () => costOf(page),
    (so) => so.heard.some(([, type]) => type === "cawco:ready"),
    120_000
  );
  await page.waitForTimeout(LOAD_MS);
  const read = await costOf(page);
  const ready = read.heard.find(([, type]) => type === "cawco:ready")?.[0] ?? 0;
  const [thumb, , bytes] = read.heard.find(
    ([, type]) => type === "cawco:captured"
  ) ?? [0, "", 0];
  const inside = (by === "tasks" ? read.tasks : read.gaps).filter(
    ([at, ms]) => at + ms >= ready && at <= ready + LOAD_MS
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
 * (`cawco:capture`, as the pane does for a card on screen) and reads its
 * thread from the ask to the answer plus `AFTER_MS`.
 */
async function captureAlone(page: Page, by: "tasks" | "gaps"): Promise<Span> {
  await page.waitForTimeout(SETTLE_MS);
  const asked = await page.evaluate(() => {
    const cost = (window as unknown as { __cost: Cost }).__cost;
    cost.heard.length = 0;
    const frame = [
      ...document.querySelectorAll<HTMLIFrameElement>(
        'iframe[title="Preview"][data-ready]'
      ),
    ].find((one) => one.checkVisibility());
    frame?.contentWindow?.postMessage(
      { type: "cawco:capture" },
      new URL(frame.src).origin
    );
    return performance.now();
  });
  await until(
    "the thumbnail asked alone",
    () => costOf(page),
    (so) => so.heard.some(([, type]) => type === "cawco:captured"),
    60_000
  );
  await page.waitForTimeout(AFTER_MS + 100);
  const read = await costOf(page);
  const [thumb, , bytes] = read.heard.find(
    ([, type]) => type === "cawco:captured"
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
  `from ${w.ready.toFixed(0)} ms, thumbnail ${w.thumb ? `at ${w.thumb.toFixed(0)} ms (${w.bytes} bytes)` : "none"}; longest ${w.longest.toFixed(0)} ms, ${w.total.toFixed(0)} ms of long tasks in all`;

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

/** The document a preview's frame holds now, by its start (`performance.timeOrigin`); null when none stands. */
const bornOf = (page: Page, origin: string): Promise<number | null> =>
  previewFrameOf(page, origin)
    ?.evaluate(() => performance.timeOrigin)
    .catch(() => null) ?? Promise.resolve(null);

/**
 * What the frame's document, and every document it frames on its own origin,
 * loaded of the origin's files, by Resource Timing: at a key or not, from the
 * cache (`transferSize` 0) or the network.
 *
 * A document is not one of the page's files. Every hop serves it `no-store`
 * (core preview-proxy.ts:126, `keyOverlay`: it names the overlay's key as it
 * is when served, and a page artifact's carries its doc's state), and "a
 * frame loaded again (a reload, a tab back from parked) asks the network for
 * its document alone" (preview-proxy.ts:338). So a document the page frames
 * (an entry an `iframe` or `frame` started) is said apart in `documents`,
 * with its address and bytes; its own files are the page's, read in `nested`.
 */
interface Fetched {
  cached: number;
  /** Each framed document's address and bytes over the network. */
  documents: { at: string; bytes: number }[];
  fetched: string[];
  fetchedBytes: number;
  keys: string[];
  /** The files the framed documents loaded themselves (theirs, not the hub's), how many at a key and from the cache, and which not. */
  nested: {
    cached: number;
    fetched: string[];
    files: number;
    unkeyed: string[];
    versioned: number;
  };
  overlayBytes: number;
  overlayKey: string;
  /** Every load of the overlay, the framed documents' too: its key and its bytes over the network. */
  overlays: { bytes: number; key: string }[];
  versioned: number;
}

function fetchedFiles(page: Page, origin: string): Promise<Fetched> {
  const frame = previewFrameOf(page, origin);
  if (!frame) {
    return Promise.resolve({
      versioned: 0,
      cached: 0,
      documents: [],
      fetched: ["no preview frame"],
      fetchedBytes: 0,
      nested: { files: 0, versioned: 0, cached: 0, fetched: [], unkeyed: [] },
      overlayBytes: 0,
      overlayKey: "",
      overlays: [],
      keys: [] as string[],
    });
  }
  return frame.evaluate(() => {
    type Entry = PerformanceResourceTiming;
    /** `win`'s own resource entries on this origin, then each same-origin frame's under it, marked nested. */
    const entriesUnder = (
      win: Window,
      nested: boolean
    ): { entry: Entry; nested: boolean }[] => {
      const inner = [...win.document.querySelectorAll("iframe, frame")]
        .map((el) => {
          try {
            const framed = (el as HTMLIFrameElement).contentWindow;
            return framed?.location.origin === location.origin ? framed : null;
          } catch {
            return null;
          }
        })
        .filter((framed): framed is Window => framed !== null);
      return [
        ...(win.performance.getEntriesByType("resource") as Entry[])
          .filter((entry) => entry.name.startsWith(location.origin))
          .map((entry) => ({ entry, nested })),
        ...inner.flatMap((framed) => entriesUnder(framed, true)),
      ];
    };
    const all = entriesUnder(window, false);
    const path = (entry: Entry) => new URL(entry.name).pathname;
    const isDocument = (entry: Entry) =>
      entry.initiatorType === "iframe" || entry.initiatorType === "frame";
    const isOverlay = (entry: Entry) => path(entry) === "/__cawco/overlay.js";
    const keyed = (entry: Entry) => path(entry).startsWith("/__cawco/v/");
    // A page's file: neither a document nor the hub's own (the overlay, its
    // ping, the doc's socket and sends), but its files at their key.
    const isFile = (entry: Entry) =>
      !isDocument(entry) &&
      (!path(entry).startsWith("/__cawco/") || keyed(entry));
    const files = all.filter((one) => isFile(one.entry) && !one.nested);
    const nestedFiles = all.filter((one) => isFile(one.entry) && one.nested);
    const fetched = files.filter((one) => one.entry.transferSize > 0);
    const overlays = all.filter((one) => isOverlay(one.entry));
    const overlay = overlays.find((one) => !one.nested)?.entry;
    const keyOf = (entry: Entry) =>
      new URL(entry.name).searchParams.get("k") ?? "";
    return {
      versioned: files.filter((one) => keyed(one.entry)).length,
      cached: files.filter((one) => one.entry.transferSize === 0).length,
      documents: all
        .filter((one) => isDocument(one.entry))
        .map((one) => ({
          at: `${path(one.entry)}${new URL(one.entry.name).search}`,
          bytes: one.entry.transferSize,
        })),
      fetched: fetched.map((one) => path(one.entry)),
      fetchedBytes: fetched.reduce(
        (sum, one) => sum + one.entry.transferSize,
        0
      ),
      nested: {
        files: nestedFiles.length,
        versioned: nestedFiles.filter((one) => keyed(one.entry)).length,
        cached: nestedFiles.filter((one) => one.entry.transferSize === 0)
          .length,
        fetched: nestedFiles
          .filter((one) => one.entry.transferSize > 0)
          .map((one) => path(one.entry)),
        unkeyed: nestedFiles
          .filter((one) => !keyed(one.entry))
          .map((one) => path(one.entry)),
      },
      overlayBytes: overlay?.transferSize ?? 0,
      // Its address's `?k=<key>`: the overlay's key (core `keyOverlay`).
      overlayKey: overlay ? keyOf(overlay) : "",
      overlays: overlays.map((one) => ({
        key: keyOf(one.entry),
        bytes: one.entry.transferSize,
      })),
      // `/__cawco/v/<key>/…`: its third segment.
      keys: [
        ...new Set(
          files
            .filter((one) => keyed(one.entry))
            .map((one) => path(one.entry).split("/")[3] ?? "")
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

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The calls the mock model makes, by the marker the message asking for each carries (artifact-reopen's). */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("ok");
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

/** The desk's workspace: one group of `tabs`, `active` in front. */
const tabsAt = (page: Page, tabs: string[], active: string) =>
  page.addInitScript(
    ([ids, shown]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: ids, active: shown, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [tabs, active] as const
  );

/** Tab `id` chosen, by its own click. */
const choose = (page: Page, id: string) =>
  page
    .locator(`[data-session-tab="${id}"]`)
    .first()
    .evaluate((el) => (el as HTMLElement).click());

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
  await fleet.api(`/api/instances/${heavyOne}/artifacts`, {
    kind: "preview",
    does: "try",
    ask: "Try this page and say whether it works",
    name: "heavy",
    dir: folder,
  });
  /** Sessions showing a one-line page each: the light page (3) and the bound's places (4b, 11). */
  const lightOf = async (name: string) => {
    const id = await fleet.spawn("claude", `Light ${name}`, fleet.repo);
    await fleet.api(`/api/instances/${id}/artifacts`, {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name,
      html: pageOf(name),
    });
    return id;
  };
  const [lightOne, lightTwo, lightThree] = [
    await lightOf("light"),
    await lightOf("light-2"),
    await lightOf("light-3"),
  ];
  // A page artifact the size of a real one, its choices and fields kept (12).
  const fullOne = await fleet.spawn("claude", "Full page", fleet.repo);
  await fleet.api(`/api/instances/${fullOne}/artifacts`, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "full",
    html: fullPage(),
  });
  // Page artifacts that count an interval's ticks (15): one with no <head>, one with it.
  const tickOf = async (name: string, html: string) => {
    const id = await fleet.spawn("claude", `Ticks ${name}`, fleet.repo);
    await fleet.api(`/api/instances/${id}/artifacts`, {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name,
      html,
    });
    return id;
  };
  const ticks = [
    { name: "no head", id: await tickOf("ticks-bare", TICKS_BARE) },
    { name: "a head", id: await tickOf("ticks-head", TICKS_HEAD) },
  ];
  const base = await fleet.dashboard();
  const paneFrame = (page: Page, pane: string) =>
    page.locator(
      `[data-slot="pane"][data-pane="${pane}"] iframe[title="Preview"]`
    );
  const readyIn = (page: Page, pane: string) => () =>
    page
      .locator(
        `[data-slot="pane"][data-pane="${pane}"] iframe[title="Preview"][data-ready]`
      )
      .count()
      .then((n) => n > 0);

  // 1, 2. The heavy page at the desk, on Chromium.
  const desk = await kit.page("desk", { init: [watchDashboard] });
  await tabsAt(desk, [heavyOne, lightOne, lightTwo, lightThree], heavyOne);
  await open(desk, `${base}/session/${heavyOne}`, 'iframe[title="Preview"]');
  const heavyDesk = await loadWindow(desk, "tasks");
  numbers.heavyDesk = heavyDesk;
  kit.check(
    `1: heavy page, Chromium at 2x: the dashboard's longest task in the ${LOAD_MS / 1000} s after its ready is under ${TASK_MS} ms`,
    heavyDesk.longest < TASK_MS,
    said(heavyDesk)
  );
  kit.check(
    "1: no thumbnail is taken of a page no transcript card shows",
    heavyDesk.thumb === 0,
    said(heavyDesk)
  );
  const heavyAlone = await captureAlone(desk, "tasks");
  numbers.heavyAlone = heavyAlone;
  kit.check(
    `1: heavy page, Chromium at 2x, the thumbnail asked alone: the dashboard's longest task under ${TASK_MS} ms, the thumbnail at most ${THUMB_BYTES} bytes`,
    heavyAlone.longest < TASK_MS &&
      heavyAlone.bytes > 0 &&
      heavyAlone.bytes <= THUMB_BYTES,
    said(heavyAlone)
  );
  const frameSrc = await paneFrame(desk, heavyOne).first().getAttribute("src");
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

  // 4. The heavy page's tab off screen (its neighbour's shown) within the
  // bound: its frame stands, held, the same document when its tab is back.
  const heavyFrames = () => paneFrame(desk, heavyOne).count();
  const bornBefore = await bornOf(desk, previewOrigin);
  await choose(desk, lightOne);
  await until(
    "the light page loaded",
    readyIn(desk, lightOne),
    Boolean,
    60_000
  );
  await desk.waitForTimeout(KEPT_MS);
  const keptFrames = await heavyFrames();
  await forget(desk);
  await choose(desk, heavyOne);
  await desk.waitForTimeout(2000);
  const bornAfter = await bornOf(desk, previewOrigin);
  const reloaded = await heard(desk, "cawco:ready");
  numbers.kept = { keptFrames, bornBefore, bornAfter, reloaded };
  kit.check(
    `4: a tab off screen ${KEPT_MS / 1000} s within the bound: its preview's frame stands, and is the same page when its tab is back (no new ready)`,
    keptFrames === 1 &&
      bornBefore !== null &&
      bornAfter === bornBefore &&
      !reloaded,
    `frames ${KEPT_MS / 1000} s off screen ${keptFrames}; document ${bornBefore} → ${bornAfter}; a new ready ${reloaded}`
  );

  // 4b. Past the bound: the heavy page the third hidden, hidden longest.
  for (const light of [lightOne, lightTwo, lightThree]) {
    await choose(desk, light);
    await until("a light page loaded", readyIn(desk, light), Boolean, 60_000);
    await desk.waitForTimeout(1000);
  }
  const pastFrames = await heavyFrames();
  await forget(desk);
  await choose(desk, heavyOne);
  const back = await until(
    "the heavy page ready again",
    () => costOf(desk),
    (read) => read.heard.some(([, type]) => type === "cawco:ready"),
    120_000
  ).then(
    () => true,
    () => false
  );
  numbers.past = { pastFrames, back };
  kit.check(
    "4b: past the bound (2 at the desk), the tab hidden longest lets its page go, and loads it again with its tab",
    pastFrames === 0 && back,
    `the heavy page's frames with three tabs hidden after it: ${pastFrames}; ready again ${back}`
  );

  // 5. Back past the bound, the revision already loaded comes from the cache.
  await desk.waitForTimeout(LAZY_MS);
  const returned = await fetchedFiles(desk, previewOrigin);
  numbers.returned = returned;
  const { documents, nested, overlays } = returned;
  const fetchedDocuments = documents.filter((one) => one.bytes > 0);
  const documentsOnce =
    new Set(fetchedDocuments.map((one) => one.at)).size ===
    fetchedDocuments.length;
  kit.note(
    `5: documents the page framed on the return (each asked of the network, as the pane's own: core preview-proxy.ts:126, :338): ${
      documents.map((one) => `${one.at} ${one.bytes} bytes`).join(", ") ||
      "none"
    }`
  );
  kit.check(
    "5: back past the bound, none of the page's files nor the overlay is fetched again: each comes from the cache at its key, the files a framed document loads too; each framed document is asked at most once",
    returned.versioned > 0 &&
      returned.fetched.length === 0 &&
      !!returned.overlayKey &&
      returned.overlayBytes === 0 &&
      overlays.every((one) => !!one.key && one.bytes === 0) &&
      (documents.length === 0 || nested.files > 0) &&
      nested.unkeyed.length === 0 &&
      nested.fetched.length === 0 &&
      documentsOnce,
    `${returned.versioned} files at a key, ${returned.cached} from the cache; fetched again ${returned.fetched.length} (${returned.fetchedBytes} bytes): ${returned.fetched.slice(0, 6).join(", ") || "none"}; the overlay at key ${returned.overlayKey || "none"}, ${returned.overlayBytes} bytes over the network; framed documents ${documents.length} (${documents.map((one) => `${one.at} ${one.bytes} bytes`).join(", ") || "none"}), each once ${documentsOnce}; their files ${nested.files}, ${nested.versioned} at a key, ${nested.cached} from the cache, fetched again ${nested.fetched.length}: ${nested.fetched.slice(0, 6).join(", ") || "none"}, not at a key: ${nested.unkeyed.slice(0, 6).join(", ") || "none"}; overlay loads ${overlays.length}, over the network ${overlays.filter((one) => one.bytes > 0).length}`
  );

  // 6. A new revision (one file changed on disk) loads the new files.
  const sheet = (await readdir(join(folder, "assets"))).find((name) =>
    name.endsWith(".css")
  );
  const marker = `/* preview-bound revision ${Date.now()} */`;
  if (sheet) {
    await appendFile(join(folder, "assets", sheet), `\n${marker}\n`);
  }
  await forget(desk);
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
  await forget(desk);
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

  // 9. The session page loaded with the heavy page's tab behind another.
  const restored = await kit.page("desk", { init: [watchDashboard] });
  await tabsAt(restored, [lightOne, heavyOne], lightOne);
  await open(
    restored,
    `${base}/session/${lightOne}`,
    `[data-slot="pane"][data-pane="${lightOne}"] iframe[title="Preview"]`
  );
  let restoredFrames = 0;
  for (let at = 0; at < RESTORED_MS; at += 250) {
    restoredFrames = Math.max(
      restoredFrames,
      await paneFrame(restored, heavyOne).count()
    );
    await restored.waitForTimeout(250);
  }
  await choose(restored, heavyOne);
  const shownLoads = await until(
    "the restored tab's page loaded once shown",
    readyIn(restored, heavyOne),
    Boolean,
    120_000
  ).then(
    () => true,
    () => false
  );
  numbers.restored = { restoredFrames, shownLoads };
  kit.check(
    `9: a session page loaded with a conversation's tab behind another: no frame for that tab's preview in ${RESTORED_MS / 1000} s, and it loads once the tab is shown`,
    restoredFrames === 0 && shownLoads,
    `frames behind ${restoredFrames}; loaded once shown ${shownLoads}`
  );
  await restored.close();

  // 10. A page the session made: its card on screen, one thumbnail.
  const made = await fleet.spawn("claude", "Made page", fleet.repo);
  const madeDesk = await kit.page("desk", { init: [watchDashboard] });
  await tabsAt(madeDesk, [made], made);
  await open(madeDesk, `${base}/session/${made}`, '[data-slot="pane"]');
  asks.set("1", {
    name: CREATE,
    input: {
      // The hub's record of the answer, which this spec reads (mcp-tool.ts).
      response_format: "detailed",
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: "made",
      html: pageOf("Made"),
    },
  });
  await fleet.send(made, "PROBE-CALL:1");
  await until("the page made", () => answered.get("1"), Boolean, 180_000);
  const card = madeDesk.locator(
    '[data-slot="preview-tool"] [data-slot="page-thumb"] img'
  );
  const thumbed = await until(
    "the card's thumbnail",
    () => card.count(),
    (n) => n > 0,
    60_000
  ).then(
    () => true,
    () => false
  );
  await madeDesk.waitForTimeout(3000);
  const captures = (await costOf(madeDesk)).heard.filter(
    ([, type]) => type === "cawco:captured"
  ).length;
  numbers.made = { thumbed, captures };
  kit.check(
    "10: a page the session made, its card on screen and its pane open: the thumbnail is taken once, and the card shows it",
    thumbed && captures === 1,
    `the card shows a thumbnail ${thumbed}; captures heard ${captures}`
  );
  await madeDesk.close();

  // 12. The overlay's own work as a page artifact opens, the frame in the
  // dashboard's process (as every WebKit and Chromium over plain http).
  const traced = await kit.page("desk", { oneProcess: true });
  await tabsAt(traced, [fullOne], fullOne);
  const opened = await traceMain(
    traced,
    async () => {
      await open(
        traced,
        `${base}/session/${fullOne}`,
        'iframe[title="Preview"][data-ready]'
      );
      await traced.waitForTimeout(OPENED_MS);
      await traced.evaluate(() => performance.mark("preview-bound:opened"));
    },
    { profile: true, restyles: true, scripts: true }
  );
  // The page's style and layout the overlay's own script forced, each pass.
  const forced = opened.tasks
    .flatMap((task) => task.passes)
    .filter((pass) => OVERLAY_FRAME.test(pass.at));
  const forcedMs = forced.reduce((sum, pass) => sum + pass.ms, 0);
  // Its script's evaluation (compile and top-level run), then what its
  // functions ran outside it, sampled: none of it counted twice.
  const evaluations = opened.evaluated.filter((one) =>
    OVERLAY_URL.test(one.url)
  );
  const evaluatedMs = evaluations.reduce((sum, one) => sum + one.cpu, 0);
  const outside: [number, number][] = [
    [0, evaluations[0]?.at ?? Number.POSITIVE_INFINITY],
    ...evaluations.map((one, i): [number, number] => [
      one.end,
      evaluations[i + 1]?.at ?? Number.POSITIVE_INFINITY,
    ]),
  ];
  const overlaySamples = outside
    .flatMap(([from, to]) => opened.selfTime(from, to))
    .filter(([fn]) => OVERLAY_FRAME.test(fn))
    .sort((a, b) => b[1] - a[1]);
  const sampledMs = overlaySamples.reduce((sum, [, ms]) => sum + ms, 0);
  const overlayMs = evaluatedMs + sampledMs;
  const fullFrame = await paneFrame(traced, fullOne)
    .first()
    .getAttribute("src");
  const overlayBytes = fullFrame
    ? await previewFrameOf(traced, new URL(fullFrame).origin)?.evaluate(() => {
        const entry = (
          performance.getEntriesByType(
            "resource"
          ) as PerformanceResourceTiming[]
        ).find((one) => new URL(one.name).pathname === "/__cawco/overlay.js");
        return entry
          ? { decoded: entry.decodedBodySize, encoded: entry.encodedBodySize }
          : null;
      })
    : null;
  numbers.overlayOpened = {
    overlayMs,
    evaluatedMs,
    sampledMs,
    overlayBytes,
    top: overlaySamples.slice(0, 8),
    forced,
  };
  kit.note(
    `12: the page's style and layout the overlay forced as it opened: ${forced.length} passes, ${forcedMs.toFixed(1)} ms; ${
      forced
        .slice(0, 8)
        .map(
          (pass) =>
            `${pass.name === "Layout" ? "layout" : "style"} ${pass.elements} ${pass.ms.toFixed(1)}ms by ${pass.at}`
        )
        .join("; ") || "none"
    }`
  );
  kit.check(
    `12: a page artifact opening, its frame in the dashboard's process: the overlay's own script takes under ${OVERLAY_CPU_MS} ms of the thread in the ${OPENED_MS / 1000} s after its frame is ready`,
    evaluations.length > 0 && overlayMs < OVERLAY_CPU_MS,
    `${overlayMs.toFixed(1)} ms: its evaluation ${evaluatedMs.toFixed(1)} ms (${evaluations.length} of it, compile and top-level run, thread time), its functions after it ${sampledMs.toFixed(1)} ms (sampled self time); the overlay ${overlayBytes ? `${overlayBytes.decoded} bytes, ${overlayBytes.encoded} over the wire` : "not read"}; most: ${
      overlaySamples
        .slice(0, 5)
        .map(([fn, ms]) => `${fn} ${ms.toFixed(1)}ms`)
        .join(", ") || "none"
    }`
  );
  await traced.close();

  // 3. The light page alone, the tool's own cost.
  const lightDesk = await kit.page("desk", { init: [watchDashboard] });
  await tabsAt(lightDesk, [lightOne], lightOne);
  await open(
    lightDesk,
    `${base}/session/${lightOne}`,
    'iframe[title="Preview"]'
  );
  await loadWindow(lightDesk, "tasks");
  const light = await captureAlone(lightDesk, "tasks");
  numbers.lightDesk = light;
  kit.note(
    `3: light page, Chromium at 2x, the thumbnail asked alone: ${said(light)}`
  );
  await lightDesk.close();

  // 7. The heavy page on WebKit at a phone.
  const phone = await kit.page("iphone15Pro", {
    engine: "webkit",
    scale: 3,
    init: [watchDashboard],
  });
  await open(phone, `${base}/session/${heavyOne}`, 'iframe[title="Preview"]');
  const heavyPhone = await loadWindow(phone, "gaps");
  numbers.heavyPhone = heavyPhone;
  // WebKit runs every frame on the dashboard's thread: the page's own work
  // after its load (its bundle, its Rive) shares the window above.
  kit.note(
    `7: heavy page, WebKit at a phone (3x), its load: ${said(heavyPhone)}`
  );
  const alonePhone = await captureAlone(phone, "gaps");
  numbers.alonePhone = alonePhone;
  kit.check(
    `7: heavy page, WebKit at a phone (3x), the page settled: the thumbnail alone holds the dashboard's thread under ${TASK_MS} ms at a time`,
    alonePhone.longest < TASK_MS &&
      alonePhone.bytes > 0 &&
      alonePhone.bytes <= THUMB_BYTES,
    said(alonePhone)
  );
  await phone.close();

  // 11. The phone's bound of 1: three conversations, a page each in its sheet.
  const deck = await kit.page("iphone15Pro", {
    engine: "webkit",
    scale: 3,
    init: [watchDashboard],
  });
  const sheets = [lightOne, lightTwo, lightThree];
  await tabsAt(deck, sheets, lightOne);
  const OPEN_SHEET_FRAME =
    '[data-preview-sheet][data-state="open"] iframe[title="Preview"][data-ready]';
  await open(deck, `${base}/session/${lightOne}`, OPEN_SHEET_FRAME);
  const firstSrc = await deck.locator(OPEN_SHEET_FRAME).getAttribute("src");
  const firstOrigin = firstSrc ? new URL(firstSrc).origin : "";
  const firstFrame = `iframe[title="Preview"][src^="${firstOrigin}"]`;
  // The first's frame element, marked where only that element carries it.
  await deck.locator(firstFrame).evaluate((el) => {
    (el as unknown as { __probeKept: boolean }).__probeKept = true;
  });
  const firstBorn = await bornOf(deck, firstOrigin);
  const sheetShown = async (id: string) => {
    await choose(deck, id);
    await deck.waitForTimeout(500);
    await until(
      "the shown conversation's sheet loaded",
      () => deck.locator(OPEN_SHEET_FRAME).count(),
      (n) => n > 0,
      60_000
    );
    await deck.waitForTimeout(1000);
  };
  await sheetShown(lightTwo);
  await forget(deck);
  await choose(deck, lightOne);
  await deck.waitForTimeout(2000);
  const sameElement = await deck
    .locator(firstFrame)
    .evaluate(
      (el) => (el as unknown as { __probeKept?: boolean }).__probeKept === true
    )
    .catch(() => false);
  const keptBorn = await bornOf(deck, firstOrigin);
  const phoneReloaded = await heard(deck, "cawco:ready");
  numbers.phoneKept = { sameElement, firstBorn, keptBorn, phoneReloaded };
  kit.check(
    "11: a phone, back to a conversation within the bound (1): its sheet's frame is the same element and the same page (no new ready)",
    sameElement &&
      firstBorn !== null &&
      keptBorn === firstBorn &&
      !phoneReloaded,
    `same element ${sameElement}; document ${firstBorn} → ${keptBorn}; a new ready ${phoneReloaded}`
  );
  await sheetShown(lightTwo);
  await sheetShown(lightThree);
  const phonePastFrames = await deck.locator(firstFrame).count();
  await forget(deck);
  await choose(deck, lightOne);
  const phoneBack = await until(
    "the first conversation's page ready again",
    () => costOf(deck),
    (read) => read.heard.some(([, type]) => type === "cawco:ready"),
    60_000
  ).then(
    () => true,
    () => false
  );
  numbers.phonePast = { phonePastFrames, phoneBack };
  kit.check(
    "11: a phone, past the bound (1): the conversation hidden longest lets its page go, and loads it again with its tab",
    phonePastFrames === 0 && phoneBack,
    `the first's frames with two hidden after it: ${phonePastFrames}; ready again ${phoneBack}`
  );
  await deck.close();

  /** Pane `pane`'s page in `page`, by its frame's origin; "" while none stands. */
  const originIn = async (page: Page, pane: string) => {
    const src = await paneFrame(page, pane)
      .first()
      .getAttribute("src", { timeout: 1000 })
      .catch(() => null);
    return src ? new URL(src).origin : "";
  };

  // 13. The desk's bound of 2 across switches (the live run): A, B, C
  // opened, then C→A→B→C→A, each stood on DWELL_MS. Every switch shows one
  // pane and puts another away, each pane saying so from its own effect.
  const trio = await kit.page("desk", { init: [watchDashboard] });
  const [paneA, paneB, paneC] = [lightOne, lightTwo, lightThree];
  await tabsAt(trio, [paneA, paneB, paneC], paneA);
  await open(trio, `${base}/session/${paneA}`, 'iframe[title="Preview"]');
  await until("A's page loaded", readyIn(trio, paneA), Boolean, 60_000);
  for (const pane of [paneB, paneC]) {
    await choose(trio, pane);
    await until("a page loaded", readyIn(trio, pane), Boolean, 60_000);
  }
  const trioOrigins = new Map<string, string>();
  const trioBorn = new Map<string, number | null>();
  for (const pane of [paneA, paneB, paneC]) {
    const origin = await originIn(trio, pane);
    trioOrigins.set(pane, origin);
    trioBorn.set(pane, await bornOf(trio, origin));
  }
  const names = new Map([
    [paneA, "A"],
    [paneB, "B"],
    [paneC, "C"],
  ]);
  const steps: string[] = [];
  let trioKept = true;
  for (const pane of [paneA, paneB, paneC, paneA]) {
    await choose(trio, pane);
    await trio.waitForTimeout(1500);
    const born = await bornOf(trio, trioOrigins.get(pane) ?? "");
    const kept = born !== null && born === trioBorn.get(pane);
    trioKept &&= kept;
    steps.push(
      `→${names.get(pane)} ${kept ? "kept" : `loaded again (${trioBorn.get(pane)} → ${born})`}`
    );
    await trio.waitForTimeout(DWELL_MS - 1500);
  }
  numbers.desktopSwitches = steps;
  kit.check(
    "13: the desk (bound 2), A, B, C opened then C→A→B→C→A: every return finds its page as it was (same document)",
    trioKept,
    steps.join(", ")
  );
  await trio.close();

  // 14. The phone's bound of 1, A→B→A, B's conversation opened before A's:
  // panes are built in the order they are first shown, and each pane's
  // effect runs in that order, so on B→A the leaving B says it went before
  // the arriving A says it came.
  const pair = await kit.page("phone", { scale: 3, init: [watchDashboard] });
  await tabsAt(pair, [paneA, paneB], paneB);
  const OPEN_SHEET =
    '[data-preview-sheet][data-state="open"] iframe[title="Preview"][data-ready]';
  const sheetSrc = () =>
    pair
      .locator(OPEN_SHEET)
      .getAttribute("src", { timeout: 1000 })
      .catch(() => null)
      .then((src) => src ?? "");
  await open(pair, `${base}/session/${paneB}`, OPEN_SHEET);
  const bOrigin = new URL(await sheetSrc()).origin;
  /** Conversation `pane` chosen, until its sheet shows another page than `other`'s. */
  const showSheet = async (pane: string, other: string) => {
    await choose(pair, pane);
    await until(
      "the shown conversation's sheet loaded",
      sheetSrc,
      (src) => !!src && !src.startsWith(other),
      60_000
    );
  };
  await showSheet(paneA, bOrigin);
  const aOrigin = new URL(await sheetSrc()).origin;
  const aBorn = await bornOf(pair, aOrigin);
  await showSheet(paneB, aOrigin);
  await pair.waitForTimeout(DWELL_MS);
  await choose(pair, paneA);
  await pair.waitForTimeout(2000);
  const aBack = await bornOf(pair, aOrigin);
  numbers.phoneSwitches = { aBorn, aBack };
  kit.check(
    "14: a phone (bound 1), B opened, then A→B→A: A's page is kept (same document)",
    aBorn !== null && aBack === aBorn,
    `A's document ${aBorn} → ${aBack}`
  );
  await pair.close();

  // 15. A hidden page artifact's own interval stands still, with or
  // without a <head>, and runs again with its tab.
  const ticking = await kit.page("desk", { init: [watchDashboard] });
  await tabsAt(ticking, [...ticks.map((one) => one.id), lightOne], lightOne);
  await open(ticking, `${base}/session/${lightOne}`, 'iframe[title="Preview"]');
  const ticksOf = (origin: string) =>
    previewFrameOf(ticking, origin)
      ?.evaluate(
        () => (window as unknown as { __ticks?: number }).__ticks ?? -1
      )
      .catch(() => -1) ?? Promise.resolve(-1);
  for (const { name, id } of ticks) {
    await choose(ticking, id);
    await until(
      "the ticking page loaded",
      readyIn(ticking, id),
      Boolean,
      60_000
    );
    await ticking.waitForTimeout(2000);
    const origin = await originIn(ticking, id);
    await choose(ticking, lightOne);
    await ticking.waitForTimeout(1500);
    const before = await ticksOf(origin);
    await ticking.waitForTimeout(DWELL_MS);
    const hidden = await ticksOf(origin);
    await choose(ticking, id);
    await ticking.waitForTimeout(3500);
    const resumed = await ticksOf(origin);
    numbers[`ticks ${name}`] = { before, hidden, resumed };
    kit.check(
      `15: a page artifact with ${name}, its tab off screen ${DWELL_MS / 1000} s: its own interval ran 0 times, and runs again once its tab is back`,
      before >= 0 && hidden === before && resumed > hidden,
      `ticks ${before} as it went off screen, ${hidden} after ${DWELL_MS / 1000} s off screen, ${resumed} 3.5 s after it came back`
    );
  }
  await ticking.close();

  // 16. A canvas in a hidden conversation's panel is held, and let go with its tab.
  const drawn = await fleet.spawn("claude", "Canvas", fleet.repo);
  const easel = await kit.page("desk", { init: [watchDashboard] });
  await tabsAt(easel, [drawn, lightOne], drawn);
  await open(easel, `${base}/session/${drawn}`, '[data-slot="pane"]');
  asks.set("2", {
    name: CREATE,
    input: {
      // The hub's record of the answer, which this spec reads (mcp-tool.ts).
      response_format: "detailed",
      kind: "canvas",
      does: "draw",
      ask: "Draw on this canvas",
      name: "held",
    },
  });
  await fleet.send(drawn, "PROBE-CALL:2");
  await until("the canvas made", () => answered.get("2"), Boolean, 180_000);
  const canvasFrame = easel.locator('iframe[title="Canvas"]').first();
  const docked = await until(
    "the canvas standing in the panel",
    () => easel.locator("[data-canvas-stages-docked]").count(),
    (n) => n > 0,
    60_000
  ).then(
    () => true,
    () => false
  );
  await easel.waitForTimeout(3000);
  const canvasSrc = await canvasFrame.getAttribute("src").catch(() => null);
  const canvasOrigin = canvasSrc ? new URL(canvasSrc).origin : "";
  const heldFrom = async (since: number, held: boolean) =>
    (await costOf(easel)).held.some(
      ([when, from, word]) =>
        when >= since && from === canvasOrigin && word === held
    );
  const awayAt = await easel.evaluate(() => performance.now());
  await choose(easel, lightOne);
  await easel.waitForTimeout(2500);
  const heldAway = await heldFrom(awayAt, true);
  const backAt = await easel.evaluate(() => performance.now());
  await choose(easel, drawn);
  await easel.waitForTimeout(2500);
  const releasedBack = await heldFrom(backAt, false);
  numbers.canvasHeld = { docked, canvasOrigin, heldAway, releasedBack };
  kit.check(
    "16: a canvas standing in a conversation's panel: held while its tab is off screen, let go with its tab",
    docked && !!canvasOrigin && heldAway && releasedBack,
    `in the panel ${docked}; origin ${canvasOrigin || "none"}; held off screen ${heldAway}; let go on return ${releasedBack}`
  );
  await easel.close();

  await writeFile(
    join(kit.out, "numbers.json"),
    JSON.stringify(numbers, null, 2)
  );
};

const spec: Spec = { name: "preview-bound", run };
export default spec;
