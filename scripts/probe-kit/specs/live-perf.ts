/**
 * The live dashboard's frame and main-thread cost, on the fleet as it runs,
 * read-only (owner, 2026-10-24: "opening a preview that has canvases within
 * nukes performance, and the app has gotten significantly slower overall,
 * switching tabs, emulate heavy multitasking setup and big transcripts from
 * the live data and check scrolling performance").
 *
 *   bun scripts/probe-kit/run.ts live-perf --base https://<hub>:3455 \
 *     [--legs scroll,canvas,switch,idle,nav,memory] [--sessions <id>,…] \
 *     [--pages <artifact>,…] [--tabs <id>,…] [--quiet <id>] \
 *     [--maps <dir>] [--storage <state.json>]
 *
 * It is the procedure behind the audit of 2026-10-24, taken again the same
 * way after its fixes ship. It runs where the hub is reached: from the host
 * or any machine of the tailnet, never inside a workspace, whose boundary
 * reaches none of the owner's machines. A hub that pairs its browsers wants
 * the paired cookie: `--storage` names a Playwright storage state that holds
 * it (`context.storageState()` of a paired page). Nothing it does writes to
 * the hub: it opens pages, scrolls, switches tabs and opens lists, and never
 * types, sends, stops, picks or opens a page in a panel.
 *
 * WHAT IS READ. Each page carries live-page.ts's watcher from before its own
 * scripts: long animation frames (each script in one, what invoked it, its
 * source position and the style and layout it forced), long tasks, Event
 * Timing interactions, frame timestamps and the reading position after each
 * paint, the DOM's changes by region, and each socket message's handling by
 * kind. A trace (frames.ts `traceMain`) is taken over each leg's window as
 * well: the main thread's own CPU (thread time) by task, its style and
 * layout passes, and with `profile` the functions it ran, said at their
 * source line when `--maps` holds the build of the commit the hub serves
 * (apps/dashboard, `vite build --sourcemap hidden`: the same chunks, a map
 * beside each; its `.svelte-kit/output/client`). The display's own frame
 * interval is read off a still page (`displayFrame`): a desk's 60 Hz, or the
 * 30 Hz of a virtual display, against which frames are counted as dropped.
 *
 * THE LEGS.
 * - scroll: each of `--sessions` (by default the three running sessions
 *   that have run longest) opened at its tail, then wheeled up through its
 *   history a notch of 100px every 100ms for 20s, flung up, flung back
 *   down: frame cadence, long work, style and layout, the reading
 *   position's jumps, DOM nodes and heap before and after.
 * - canvas: each of `--pages` opened in its own dashboard tab
 *   (`/artifact/<id>`), the dashboard's thread read while it is open; then
 *   the page's own document opened at its preview origin, its previews
 *   counted as they arrive until they stand (time to stable, iframes, their
 *   origins, the other renderers' main-thread time off the trace), and its
 *   scroller wheeled.
 * - switch: each of `--tabs` opened as a tab of one pane, then each chosen
 *   by a pointer's press, twice round, and the one hidden longest chosen
 *   after a minute on another: each press's interaction, the long frames
 *   and CPU after it, and what it changed, by region.
 * - idle: `--quiet` (by default the newest stopped session) left open for a
 *   minute while the fleet runs: the main thread's busy share (live-page.ts
 *   `busyMeter`, beside its floor on a blank page), socket messages a
 *   second and each kind's handling; then the thread time of a trace with
 *   no profiler (the budget), and a second trace with it, where that time
 *   went.
 * - nav: cold loads of the home, a session and a project page (time to
 *   first byte, the HTML in, first and largest paint and what each largest
 *   paint painted, the first frame the transcript's newest row is drawn in
 *   and whether the rows drawn fill it, the server's first screen handing
 *   its place to the list, the page's own transcript reads, layout shifts
 *   and what moved, long tasks; the HTML by part, each page's kept in the
 *   out folder), then the home's common presses: Finished, Recent open and
 *   shut, a project.
 * - memory: thirty tab switches between two readings of the heap after a
 *   collection, the DOM's nodes and the listeners (DevTools `Memory`).
 *   Chromium only, as scroll is: both read the heap through the DevTools
 *   protocol, and on another engine say so and are skipped.
 *
 * Asserted, the budgets the audit holds the dashboard to: no long task over
 * `LONG_TASK_MS` while a transcript is wheeled steadily; frames dropped
 * under `DROPPED_SHARE` of the display's while wheeling; no reading-position
 * jump; every press an interaction within `INTERACTION_MS`; the main
 * thread's own CPU at rest under `IDLE_SHARE`; after thirty switches the
 * DOM's nodes and the heap within `GROWTH_SHARE` of before. On the scale
 * fleet, a cold session page draws its newest rows within `NEWEST_ROW_MS`
 * of its HTML being in, filling the transcript, reads no newest page of
 * its own and hands its first screen to the list with no row moving; its
 * HTML and a project's stay under their budgets, and their paints within
 * theirs (`coldBudgets`). A hub message
 * costs what it changed, never the fleet's size: at rest a pulse's handling
 * within `PULSE_MS` and a board delta's within `DELTA_MS` on average; no
 * held list's reorder timer (motion/held-order) runs `HELD_ORDER_MS` in a
 * long frame; and no tab switch's frame (the long frame its press ran in)
 * handles a hub message before it renders: neither the socket's handler
 * nor the store's take of what it said. Every number is written to
 * `numbers.json` in the spec's out folder.
 *
 * THE FLEET AT ITS SIZE, WITHOUT THE LIVE HUB. `--fleet` stands up a
 * scratch fleet at the live board's size instead (fleet-scale.ts: 1763
 * rows, 1698 asleep, `--rows` and `--asleep` to name others, one of them
 * on a long conversation, which the nav leg opens cold, and a project
 * board of 200 tasks), sessions streaming and taking turns, and reads the
 * `idle`, `switch` and `nav` legs on it
 * (`--legs` to name others), its build's source maps beside it. It runs
 * inside a workspace. `PROBE_ENGINE=webkit` reads it in WebKit, which has
 * no trace and no long animation frames: there the hub messages' handling
 * is the reading.
 *
 *   bun scripts/probe-kit/run.ts live-perf --fleet
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one session, one tab, one press at a time, as a person makes them
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright-core";
import { HUB_TAKE_MEASURE } from "../../../packages/core/src/stream";
import { LIVE_ASLEEP, LIVE_ROWS, scaleFleet } from "../fleet-scale";
import { type MainThread, OWN_PASS, traceMain } from "../frames";
import { type Kit, ROOT, type Spec } from "../kit";
import {
  attributeOn,
  busyMeter,
  installPerf,
  journey,
  type LoafScript,
  type PerfState,
  pageNow,
  perfRead,
  perfReset,
  rest,
  type Step,
  wheel,
} from "../live-page";
import {
  cadence,
  displayFrame,
  interactions,
  jumps,
  longFrames,
  longWork,
  scriptsOf,
  sourceAt,
} from "../live-read";
import { machineQuiet, quietWords } from "../quiet";

/** A long task: the frame budget a steady wheel stays inside. */
const LONG_TASK_MS = 50;
/** The share of the display's frames a steady wheel may miss. Our own call. */
const DROPPED_SHARE = 0.02;
/** An interaction a person feels as slow (web.dev INP "good": 200 ms). */
const INTERACTION_MS = 200;
/** The main thread's own CPU at rest, the fleet streaming: the brief's 5%. */
const IDLE_SHARE = 0.05;
/** How much thirty switches may grow the DOM's nodes and the heap. Our own call. */
const GROWTH_SHARE = 0.1;
/**
 * A pulse's handling and a board delta's, each on average, ms: the
 * research's budgets for a message that costs what it changed at the live
 * board's size (7433e2b3, mechanism 2).
 */
const PULSE_MS = 2;
const DELTA_MS = 5;
const KIND_BUDGETS = [
  ["pulse", PULSE_MS],
  ["instances_delta", DELTA_MS],
] as const;
/** A held list's reorder timer in a long frame (7433e2b3, mechanism 7). */
const HELD_ORDER_MS = 5;
/*
 * A cold load's budgets, held on the scale fleet at the desk's 1440×900
 * (`coldBudgets`). The numbers they come from, Chromium / WebKit, before
 * the server painted a first screen of 32 blocks (2026-10-25) and after:
 *
 *   the long session  HTML 1255 → 844 KB; newest rows drawn 720 / 1528 →
 *                     105 / 342 ms after the HTML is in; fcp 404 / 536 →
 *                     308 / 504 ms; lcp 968 / 1707 → 308 / 1522 ms
 *   the project       HTML 1672 → 377 KB; fcp 380 / 914 → 228 / 473 ms;
 *                     lcp 2548 / 1166 → 228 / 699 ms
 *
 * WebKit's largest paint after is the first screen's own paragraph painted
 * again where it stands, as its row takes the store's copy of the page.
 */
/** The newest rows drawn after the HTML is in: the brief's "well under a second". */
const NEWEST_ROW_MS = 500;
/** How far a row may move as the list takes the server's first screen's place: none, to the pixel's rounding. */
const SWAP_PX = 1;
/**
 * The session's HTML: a first screen weighs 844 KB, nearly all of it the
 * tool output its 32 blocks carry; room for a row's markup to grow, none
 * for a second page or a second copy of the rows (1255 KB).
 */
const SESSION_HTML_KB = 900;
/** Its first paint: twice the slower engine's after, a third under the brief's second. */
const SESSION_FCP_MS = 1000;
/** Its largest paint: WebKit's re-paint of the first screen (1522 ms) with room; before, WebKit's was 1707 ms behind a skeleton. */
const SESSION_LCP_MS = 1800;
/** The project's HTML: 16 cards a column and the board's data (156 KB); before, every card (1672 KB). */
const PROJECT_HTML_KB = 450;
/** Its first and largest paint: the slower engine's after (473 / 699 ms) with room; before, Chromium's largest was 2548 ms. */
const PROJECT_FCP_MS = 1000;
const PROJECT_LCP_MS = 1000;
/** The engine the run's pages open on (kit.ts `RUN_ENGINE`): only Chromium traces. */
const TRACES = (process.env.PROBE_ENGINE ?? "chromium") === "chromium";
/** A long frame's script the hub socket's message ran (live-page.ts keeps the page's handler a listener). */
const SOCKET = /WebSocket/;
/** A long frame's script a person's press ran: a pointer, a click, a key. */
const PRESS = /click|pointer|mouse|key/i;
/** The store's take of what its socket said, a message of its own channel (client.svelte.ts `takeHeld`). */
const TAKE = /MessagePort/;
/** The module the store's take runs in, as a source map names it. */
const CLIENT = /client\.svelte\.ts/;

/** Whether a long frame's script is the hub's messages being handled: the socket's own handler, or the store's take of them. */
const handlesHub = (script: LoafScript, maps: string | undefined): boolean =>
  SOCKET.test(script.invoker) ||
  (TAKE.test(script.invoker) &&
    maps !== undefined &&
    CLIENT.test((script.url && sourceAt(maps, script.url, script.pos)) || ""));
/** A sampled frame of the dashboard's own source, as a source map names it. */
const OWN_SOURCE = /@src\/lib\//;
/** The held lists' module, as a source map names it. */
const HELD_ORDER = /held-order\.svelte\.ts/;
/** How long a page is left to stand after it opens before it is read. */
const SETTLE_MS = 12_000;
/** How long after a press its frames and tasks are its own. */
const SWITCH_MS = 2500;
/** How long a tab is left hidden, streaming, before it is chosen again. */
const HIDDEN_MS = 60_000;
/** How long the rest is read for. */
const IDLE_MS = 60_000;
const TRANSCRIPT = '[aria-label="Session transcript"]';
const TAB_STRIP = '[role=tablist][aria-label="Open sessions in this group"]';
const LEGS = ["scroll", "canvas", "switch", "idle", "nav", "memory"] as const;
type Leg = (typeof LEGS)[number];

/** The decision pages of the audit: caw-panel (33 previews), three-designs (10), project-screens (7). */
const PAGES = [
  "78a326ed-76cd-44b0-90c3-5e3261a17b56",
  "0f42361a-c890-4315-9567-588680eecd97",
  "d063282e-b87b-486f-a778-48df82d6f5c8",
];

/** The scroll journey, the same for every transcript. */
const JOURNEY: Step[] = [
  { name: "tail still", ms: 2000 },
  { name: "steady up", px: -100, everyMs: 100, ms: 20_000 },
  { name: "rest", ms: 1500 },
  { name: "fling up", px: -150, everyMs: 16, ms: 2500 },
  { name: "rest", ms: 1500 },
  { name: "fling down", px: 200, everyMs: 16, ms: 8000 },
  { name: "rest", ms: 1500 },
];

const option = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const listed = (name: string): string[] | undefined =>
  option(name)
    ?.split(",")
    .map((one) => one.trim())
    .filter(Boolean);

/** The page's helpers, as live-page.ts gives them, on `window.__pf`. */
interface PageLib {
  attributeOn: typeof attributeOn;
  busyMeter: typeof busyMeter;
  journey: typeof journey;
  pageNow: typeof pageNow;
  perfRead: typeof perfRead;
  perfReset: typeof perfReset;
  rest: typeof rest;
  wheel: typeof wheel;
}
type Watched = PerfState;
declare global {
  interface Window {
    __perf: Watched;
    __pf: PageLib;
  }
}

/** live-page.ts's helpers, put on every page before its own scripts. */
/** live-page.ts's watcher, given the name of the measure a page makes of each take of its messages. */
const WATCHER = {
  content: `(${installPerf.toString()})(${JSON.stringify(HUB_TAKE_MEASURE)});`,
};

const LIB = {
  content: `window.__pf = {${[
    pageNow,
    perfReset,
    wheel,
    journey,
    rest,
    busyMeter,
    perfRead,
    attributeOn,
  ]
    .map((fn) => `${fn.name}: ${fn.toString()}`)
    .join(",\n")}};`,
};

/** A session row of the hub's board, as much of it as the legs read. */
interface Row {
  createdAt: string;
  derivedTitle?: string | null;
  id: string;
  parentInstanceId: string | null;
  status: string;
  title?: string | null;
  updatedAt: string;
}

/** A sampled function of a trace (`name@file:line:column`) at its source line. */
const SAMPLED = /^(.*)@([^@:]+):(\d+):(\d+)$/;
const atSource = (maps: string | undefined, sampled: string): string => {
  const match = SAMPLED.exec(sampled);
  if (!(maps && match)) {
    return sampled;
  }
  const [, fn = "", file = "", line = "0", column = "0"] = match;
  const source = sourceAt(maps, file, 0, {
    line: Number(line),
    column: Number(column),
  });
  return source ? `${fn}@${source}` : sampled;
};

/** The trace's tasks inside a span of the page's clock: their CPU, wall, style and layout. */
function cpuIn(main: MainThread, offsetUs: number, from: number, to: number) {
  const inside = main.tasks.filter(
    (task) =>
      task.at >= from * 1000 + offsetUs && task.at < to * 1000 + offsetUs
  );
  const sum = (pick: (task: (typeof inside)[number]) => number) =>
    inside.reduce((total, task) => total + pick(task), 0);
  return {
    cpuMs: sum((task) => task.cpu),
    wallMs: sum((task) => task.wall),
    styleMs: sum((task) => task.styleMs),
    layoutMs: sum((task) => task.layoutMs),
    restyled: sum((task) => task.restyled),
    longest: Math.max(0, ...inside.map((task) => task.cpu)),
  };
}

/** The functions a span ran most, by sampled self time, at their source lines. */
const topFunctions = (
  main: MainThread,
  maps: string | undefined,
  offsetUs: number,
  from: number,
  to: number,
  most = 12
): [string, number][] =>
  main
    .selfTime(from * 1000 + offsetUs, to * 1000 + offsetUs)
    .filter(([fn]) => !fn.startsWith("("))
    .slice(0, most)
    .map(([fn, ms]) => [atSource(maps, fn), Math.round(ms)]);

/** What an engine with no trace gives: nothing the trace would have read. */
const UNTRACED: MainThread = {
  elsewhere: () => [],
  evaluated: [],
  inclusive: () => [],
  marks: [],
  selfTime: () => [],
  stacksIn: () => [],
  tasks: [],
};

/**
 * Traces `act` on `page` and says how the page's clock maps onto the
 * trace's: a mark made at the start, with the page's time at it. On an
 * engine with no trace, runs `act` and reads nothing ({@link UNTRACED}).
 */
async function traced(
  page: Page,
  act: () => Promise<unknown>,
  profile = true,
  /** Why each style and layout pass ran too (frames.ts `restyles`): heavier, for a page at rest. */
  restyles = false
): Promise<{ main: MainThread; offsetUs: number }> {
  if (!TRACES) {
    await act();
    return { main: UNTRACED, offsetUs: 0 };
  }
  let pageAt = 0;
  const main = await traceMain(
    page,
    async () => {
      pageAt = await page.evaluate(() => {
        performance.mark("live-perf");
        return performance.now();
      });
      await act();
    },
    { passes: true, profile, restyles }
  );
  const mark = main.marks.find((one) => one.name === "live-perf");
  return { main, offsetUs: (mark?.at ?? 0) - pageAt * 1000 };
}

/** The DevTools heap after a collection, and the DOM's counters. */
async function memoryOf(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  await cdp.detach();
  return {
    heapMB: Math.round(heap.usedSize / 1_048_576),
    documents: dom.documents,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
  };
}

const round = (value: number, places = 1): number =>
  Math.round(value * 10 ** places) / 10 ** places;

/** A trailing slash, off the base address. */
const TRAILING_SLASH = /\/$/;
/** A box that scrolls its own content. */
const SCROLLS = /(auto|scroll)/;
/** The home's Recent disclosure, by its name and count. */
const RECENT = /^Recent/;

/** What every leg is given: the run's page, how to open more, and where its numbers go. */
interface Live {
  base: string;
  /** A desk page on the live dashboard, the watcher in it before its own scripts; a cold one reads its newest row's first frame too. */
  desk: (cold?: boolean) => Promise<Page>;
  /** The legs read the scale fleet (`--fleet`), not a live hub. */
  fleet: boolean;
  /** Opens a path on the run's page and lets it stand. */
  goto: (path: string, ready?: string) => Promise<void>;
  kit: Kit;
  maps: string | undefined;
  numbers: Record<string, unknown>;
  page: Page;
  /** The display's own frame interval, ms. */
  slot: number;
  titleOf: (id: string) => string;
}

/** The run's page's watcher and DOM, with the heap after a collection. */
const readingOf = async (page: Page) => ({
  ...(await memoryOf(page)),
  ...(await page.evaluate(() => window.__pf.pageNow())),
});

/** One phase of a scroll journey, as its numbers. */
function phaseOf(
  live: Live,
  state: Watched,
  traceOf: { main: MainThread; offsetUs: number },
  [name, from, to, moved]: [string, number, number, number]
) {
  const frames = cadence(
    state.rafs.filter((t) => t >= from && t < to),
    live.slot
  );
  return {
    name,
    moved,
    frames: {
      p50: round(frames.p50),
      p95: round(frames.p95),
      longest: round(frames.longest),
      droppedShare: round(frames.droppedShare, 3),
    },
    long: longWork(state.long, from, to),
    longFrames: longFrames(state.loaf, from, to),
    jumps: jumps(state.painted, from, to),
    cpu: cpuIn(traceOf.main, traceOf.offsetUs, from, to),
  };
}

/** Scroll: each transcript wheeled up through its history, flung, and back. */
async function scrollLeg(live: Live, sessions: string[]) {
  const { kit, page, titleOf } = live;
  const read: Record<string, unknown>[] = [];
  for (const id of sessions) {
    await live.goto(`/session/${id}`);
    const before = await readingOf(page);
    const traceOf = await traced(page, async () => {
      await page.evaluate((steps) => window.__pf.journey(steps), JOURNEY);
      await page.waitForFunction(() => window.__perf.done === true, null, {
        timeout: 120_000,
        polling: 500,
      });
    });
    const state = await page.evaluate(() => window.__pf.perfRead());
    const after = await readingOf(page);
    const span = state.phases ?? [];
    const phases = span.map((one) => phaseOf(live, state, traceOf, one));
    const from = span[0]?.[1] ?? 0;
    const to = span.at(-1)?.[2] ?? Number.POSITIVE_INFINITY;
    const scripts = scriptsOf(state.loaf, live.maps, from, to).slice(0, 12);
    const functions = topFunctions(
      traceOf.main,
      live.maps,
      traceOf.offsetUs,
      from,
      to
    );
    read.push({
      session: id,
      title: titleOf(id),
      before,
      after,
      phases,
      scripts,
      functions,
      mutated: state.mutated,
    });
    const steady = phases.find((phase) => phase.name === "steady up");
    const long = steady?.long ?? { count: 1, totalMs: 0, longest: 0 };
    const dropped = steady?.frames.droppedShare ?? 1;
    kit.note(
      `scroll ${titleOf(id)}: steady p50 ${steady?.frames.p50}ms p95 ${steady?.frames.p95}ms, ${round(dropped * 100)}% dropped, ${long.count} long tasks (${round(long.totalMs, 0)}ms, longest ${round(long.longest, 0)}), CPU ${round(steady?.cpu.cpuMs ?? 0, 0)}ms, style ${round(steady?.cpu.styleMs ?? 0, 0)}ms layout ${round(steady?.cpu.layoutMs ?? 0, 0)}ms; nodes ${before.nodes} → ${after.nodes}, heap ${before.heapMB} → ${after.heapMB} MB; top ${functions
        .slice(0, 3)
        .map(([fn, ms]) => `${fn} ${ms}ms`)
        .join(", ")}`
    );
    kit.check(
      `scroll ${titleOf(id)}: no long task over ${LONG_TASK_MS}ms while wheeled steadily`,
      long.count === 0,
      `${long.count} of them, longest ${round(long.longest, 0)}ms; ${scripts
        .slice(0, 3)
        .map((script) => `${script.source} ${round(script.ms, 0)}ms`)
        .join(", ")}`
    );
    kit.check(
      `scroll ${titleOf(id)}: under ${DROPPED_SHARE * 100}% of the display's frames dropped while wheeled steadily`,
      dropped < DROPPED_SHARE,
      `${round(dropped * 100)}% at ${round(live.slot)}ms a frame`
    );
    const jumped = phases.reduce((sum, phase) => sum + phase.jumps.count, 0);
    kit.check(
      `scroll ${titleOf(id)}: the reading position never jumps`,
      jumped === 0,
      `${jumped} jump(s): ${JSON.stringify(phases.flatMap((phase) => phase.jumps.first).slice(0, 3))}`
    );
  }
  live.numbers.scroll = read;
}

/** A page's own document opened at its preview origin: its previews counted until they stand, then its scroller wheeled. */
async function pageOpen(live: Live, host: string) {
  const own = await live.desk();
  // Each sample is the page's own clock: ms since its navigation began.
  let samples: [number, number][] = [];
  const { main } = await traced(
    own,
    async () => {
      await own.goto(host, { waitUntil: "domcontentloaded" });
      samples = await own.evaluate(async () => {
        const seen: [number, number][] = [];
        let standing = 0;
        const begun = performance.now();
        while (performance.now() - begun < 60_000 && standing < 4) {
          await new Promise((done) => setTimeout(done, 1000));
          const count = document.querySelectorAll("iframe").length;
          standing = count > 0 && count === seen.at(-1)?.[1] ? standing + 1 : 0;
          seen.push([performance.now(), count]);
        }
        return seen;
      });
    },
    false
  );
  const stableAt = samples.findLast(
    ([, count], i) => count !== samples[i - 1]?.[1]
  )?.[0];
  const frames = await own.evaluate(() =>
    [...document.querySelectorAll("iframe")].map((frame) => frame.src)
  );
  const scrolled = await own.evaluate(async (scrolls) => {
    const [box] = [...document.querySelectorAll<HTMLElement>("*")]
      .filter(
        (el) =>
          el.scrollHeight > el.clientHeight + 50 &&
          new RegExp(scrolls).test(getComputedStyle(el).overflowY)
      )
      .sort((a, b) => b.scrollHeight - a.scrollHeight);
    window.__pf.perfReset(true, false);
    const begun = performance.now();
    while (box && performance.now() - begun < 10_000) {
      // A wheel's input first: the reader's scroll (a transcript takes one
      // for the reader's only after their input).
      box.dispatchEvent(new WheelEvent("wheel"));
      box.scrollBy({ top: 100, behavior: "instant" });
      await new Promise((done) => setTimeout(done, 100));
    }
    window.__perf.frames = false;
    return window.__pf.perfRead();
  }, SCROLLS.source);
  await own.close();
  // The trace's mark was made on the blank page the page opened from: the
  // page's own renderer and its previews' are all "elsewhere".
  const elsewhere = main.elsewhere(0, Number.POSITIVE_INFINITY);
  return {
    stableMs: stableAt ? round(stableAt, 0) : null,
    iframes: frames.length,
    origins: new Set(frames.map((src) => new URL(src).origin)).size,
    pageAndPreviewsMainMs: Object.fromEntries(
      elsewhere.filter(([name]) => name.startsWith("RunTask"))
    ),
    scroll: {
      frames: cadence(scrolled.rafs, live.slot),
      long: longWork(scrolled.long),
    },
  };
}

/** Canvas: each page in its own dashboard tab, then its own document, its previews counted as they arrive. */
async function canvasLeg(live: Live, pages: string[]) {
  const { kit, page } = live;
  const read: Record<string, unknown>[] = [];
  for (const id of pages) {
    await live.goto(`/artifact/${id}`, "iframe");
    const host = await page.evaluate(
      () => document.querySelector("iframe")?.src ?? ""
    );
    const dashboard = await page.evaluate(async () => {
      window.__pf.perfReset(true, true);
      const busy = await window.__pf.busyMeter(20_000);
      window.__perf.frames = false;
      return busy;
    });
    if (!host) {
      kit.check(`canvas ${id}: its page opens in its tab`, false, "no frame");
      continue;
    }
    const opened = await pageOpen(live, host);
    read.push({
      page: id,
      host,
      dashboardBusyShare: round(dashboard.busyShare, 3),
      ...opened,
    });
    kit.note(
      `canvas ${id}: ${opened.iframes} previews from ${opened.origins} origins, standing ${opened.stableMs}ms after it opened; its and its previews' main threads ${JSON.stringify(opened.pageAndPreviewsMainMs)}; the dashboard's thread ${round(dashboard.busyShare * 100)}% busy with it open; its scroll ${round(opened.scroll.frames.droppedShare * 100)}% dropped, ${opened.scroll.long.count} long tasks`
    );
  }
  live.numbers.canvas = read;
}

/** A tab of the strip, by its session's title. */
const tabOf = (live: Live, id: string) =>
  live.page.locator(`${TAB_STRIP} [data-session-tab="${id}"]`).first();

/** Presses `id`'s tab in the strip, and reads what followed. */
async function press(live: Live, id: string) {
  const { page } = live;
  const at = await page.evaluate(() => {
    window.__perf.mutated = {};
    return performance.now();
  });
  await tabOf(live, id).click();
  await page.waitForTimeout(SWITCH_MS);
  const state = await page.evaluate(() => window.__pf.perfRead());
  const [interaction] = interactions(
    state.events.filter((one) => one.at >= at)
  );
  // The switch's frame: the long animation frame that ran the press's own
  // handler. A script handling the hub's messages in it, before the press
  // (its input delay) or between it and the frame's rendering, held the
  // switch for a message. One after the rendering, while the frame is
  // still being presented, holds nothing of it.
  const shown = interaction ? interaction.at + interaction.ms : at;
  const socketInSwitch = state.loaf
    .filter((frame) =>
      frame.scripts.some(
        (script) =>
          PRESS.test(script.invoker) && script.at >= at && script.at < shown
      )
    )
    .flatMap((frame) =>
      frame.scripts.filter(
        (script) =>
          handlesHub(script, live.maps) &&
          (frame.render === 0 || script.at < frame.at + frame.ms - frame.render)
      )
    );
  return {
    tab: live.titleOf(id),
    interactionMs: interaction ? round(interaction.ms, 0) : null,
    presentationMs: interaction ? round(interaction.present, 0) : null,
    socketInSwitch: {
      count: socketInSwitch.length,
      ms: round(socketInSwitch.reduce((sum, one) => sum + one.ms, 0)),
    },
    /** The switch's frames on the page's clock: its press to its paint. */
    window: [interaction?.at ?? at, shown] as [number, number],
    long: longWork(state.long, at, at + SWITCH_MS),
    longFrames: longFrames(state.loaf, at, at + SWITCH_MS),
    scripts: scriptsOf(state.loaf, live.maps, at, at + SWITCH_MS).slice(0, 4),
    mutated: state.mutated,
    nodes: (await page.evaluate(() => window.__pf.pageNow())).nodes,
  };
}

/** Opens each session as a tab of the pane, then lets the page stand. */
async function openTabs(live: Live, tabs: string[]) {
  // The pane's tabs as the workspace keeps them (workspace.svelte.ts), the
  // first in front: a page opened on a session shows it in the tab in
  // front, it adds none.
  await live.page.evaluate(
    ([held, active]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: held, active, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [tabs, tabs[0]] as const
  );
  await live.page.goto(`${live.base}/session/${tabs[0]}`, {
    waitUntil: "domcontentloaded",
  });
  for (const id of tabs) {
    await tabOf(live, id).waitFor({ timeout: 60_000 });
  }
  await live.page.waitForTimeout(SETTLE_MS);
  await live.page.evaluate(() => window.__pf.perfReset(true, true));
}

/** Switch: every tab pressed, twice round, then the one hidden longest after a minute on another. */
async function switchLeg(live: Live, tabs: string[]) {
  const { kit } = live;
  await openTabs(live, tabs);
  const read: Awaited<ReturnType<typeof press>>[] = [];
  /** Each press with the trace it was taken under. */
  const tracedBy: { main: MainThread; offsetUs: number }[] = [];
  const traceOf = await traced(live.page, async () => {
    for (const id of [...tabs, ...tabs]) {
      read.push(await press(live, id));
    }
  });
  tracedBy.push(...read.map(() => traceOf));
  const [first, second] = tabs as [string, string];
  tracedBy.push(
    await traced(live.page, async () => {
      read.push(await press(live, first));
    })
  );
  await live.page.waitForTimeout(HIDDEN_MS);
  tracedBy.push(
    await traced(live.page, async () => {
      read.push(await press(live, second));
    })
  );
  // What the page's takes of its messages ran inside each switch's frames,
  // by sampled self time: what a take that held a switch was doing.
  const spans = await live.page.evaluate(
    () => window.__pf.perfRead().ws.takeSpans
  );
  const presses = read.map((one, i) => {
    const trace = tracedBy[i];
    const [from, to] = one.window;
    const inTakes = new Map<string, number>();
    for (const [start, ms] of spans) {
      if (!trace || start + ms <= from || start >= to) {
        continue;
      }
      const at = start * 1000 + trace.offsetUs;
      for (const [fn, self] of trace.main.selfTime(at, at + ms * 1000)) {
        inTakes.set(fn, (inTakes.get(fn) ?? 0) + self);
      }
    }
    return {
      ...one,
      takeFunctions: [...inTakes]
        .filter(([fn]) => !fn.startsWith("("))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([fn, ms]): [string, number] => [
          atSource(live.maps, fn),
          round(ms),
        ]),
    };
  });
  live.numbers.switch = {
    presses,
    cpuMs: cpuIn(traceOf.main, traceOf.offsetUs, 0, Number.POSITIVE_INFINITY),
  };
  for (const one of presses) {
    kit.note(
      `switch to ${one.tab}: interaction ${one.interactionMs}ms (presented ${one.presentationMs}ms after its handlers), ${one.long.count} long tasks (${round(one.long.totalMs, 0)}ms) in the ${SWITCH_MS}ms after, the hub socket's handler ${one.socketInSwitch.count}× (${one.socketInSwitch.ms}ms) in its frames${one.takeFunctions.length > 0 ? ` (the takes in them ran ${one.takeFunctions.map(([fn, ms]) => `${fn} ${ms}ms`).join(", ")})` : ""}, ${one.nodes} nodes`
    );
  }
  if (TRACES) {
    const held = read.filter((one) => one.socketInSwitch.count > 0);
    kit.check(
      "switch: no switch's frame handles a hub message before it renders",
      held.length === 0,
      held
        .map(
          (one) =>
            `${one.tab}: ${one.socketInSwitch.count}× ${one.socketInSwitch.ms}ms`
        )
        .join(", ")
    );
  }
  const slow = read.filter(
    (one) => (one.interactionMs ?? Number.POSITIVE_INFINITY) > INTERACTION_MS
  );
  kit.check(
    `switch: every press an interaction within ${INTERACTION_MS}ms`,
    slow.length === 0,
    slow.map((one) => `${one.tab} ${one.interactionMs}ms`).join(", ")
  );
}

/** A sampled total per function, its largest first, in ms. */
const largest = (under: Map<string, number>): [string, number][] =>
  [...under]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([fn, ms]): [string, number] => [fn, round(ms)]);

/**
 * What the page's takes of its messages ran, by the trace's samples: each
 * function's own time in them (`messageFunctions`), all the time under each
 * of the dashboard's own functions (`messageInclusive`: a derived that walks
 * the board, whatever it called), and that again in the takes that held a
 * message of each budgeted kind (`kindInclusive`: what that kind sets off).
 */
function takesRan(
  { main, offsetUs }: { main: MainThread; offsetUs: number },
  spans: [number, number, string[]][],
  maps: string | undefined
) {
  const inMessages = new Map<string, number>();
  const underMessages = new Map<string, number>();
  const underKind = new Map<string, Map<string, number>>(
    KIND_BUDGETS.map(([kind]) => [kind, new Map()])
  );
  for (const [start, ms, kinds] of spans) {
    const from = start * 1000 + offsetUs;
    for (const [fn, self] of main.selfTime(from, from + ms * 1000)) {
      if (!fn.startsWith("(")) {
        const at = atSource(maps, fn);
        inMessages.set(at, (inMessages.get(at) ?? 0) + self);
      }
    }
    const alsoUnder = [...new Set(kinds)].flatMap(
      (kind) => underKind.get(kind) ?? []
    );
    for (const [stack, self] of main.stacksIn(from, from + ms * 1000)) {
      const own = new Set(
        stack
          .split(" < ")
          .map((frame) => atSource(maps, frame))
          .filter((frame) => OWN_SOURCE.test(frame))
      );
      for (const frame of own) {
        for (const under of [underMessages, ...alsoUnder]) {
          under.set(frame, (under.get(frame) ?? 0) + self);
        }
      }
    }
  }
  return {
    messageFunctions: largest(inMessages),
    messageInclusive: largest(underMessages),
    kindInclusive: Object.fromEntries(
      [...underKind].map(([kind, under]) => [kind, largest(under)])
    ),
  };
}

/**
 * The animations running on the page, by name and the element they run
 * on (its `data-slot`, else its tag), with how many: a page at rest whose
 * frames keep coming is drawing one of these. Run in the page.
 */
function runningAnimations(): string {
  const said = new Map<string, number>();
  for (const run of document.getAnimations()) {
    if (run.playState !== "running") {
      continue;
    }
    const target = (run.effect as KeyframeEffect | null)?.target ?? null;
    let name = `script ${run.id}`;
    if (run instanceof CSSAnimation) {
      name = run.animationName;
    } else if (run instanceof CSSTransition) {
      name = `transition ${run.transitionProperty}`;
    }
    const endless =
      run.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY
        ? " (endless)"
        : "";
    const where = target
      ? (target.getAttribute("data-slot") ?? target.tagName.toLowerCase())
      : "?";
    const key = `${name}${endless} on ${where}`;
    said.set(key, (said.get(key) ?? 0) + 1);
  }
  return (
    [...said]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => `${key} ×${count}`)
      .join(", ") || "nothing"
  );
}

/** Adds `ms` to `key`'s total. */
const addTo = (totals: Map<string, number>, key: string, ms: number) => {
  totals.set(key, (totals.get(key) ?? 0) + ms);
};

/**
 * The style and layout passes of the trace's tasks: the frames' own by
 * phase, with how many and the elements or layout objects each took on
 * (`counts`), and by their layout's root box (a layout of the whole page,
 * or of one row); and each a script forced, at its frames, ms with how
 * many: what reads geometry while nothing moves.
 */
function passesOf(main: MainThread, maps: string | undefined) {
  const phases = new Map<string, number>();
  const counts = new Map<string, number>();
  const objects = new Map<string, number>();
  const roots = new Map<string, number>();
  const forced = new Map<string, number>();
  const forcedCount = new Map<string, number>();
  for (const pass of main.tasks.flatMap((task) => task.passes)) {
    if (pass.at === OWN_PASS) {
      const own = `${pass.name} (the frame's)`;
      addTo(phases, own, pass.ms);
      addTo(counts, own, 1);
      addTo(objects, own, pass.elements);
      if (pass.root) {
        addTo(roots, pass.root, pass.ms);
      }
    } else {
      const site = `${pass.name} at ${pass.at
        .split(" ← ")
        .map((frame) => atSource(maps, frame))
        .join(" ← ")}`;
      addTo(forced, site, pass.ms);
      addTo(forcedCount, site, 1);
    }
  }
  const passes = [...counts].map(([own, count]): [string, number, number] => [
    own,
    count,
    round((objects.get(own) ?? 0) / count, 0),
  ]);
  return { phases, passes, roots, forced, forcedCount };
}

/**
 * What the page's own CPU went to while the trace ran: each task's thread
 * time by what it opened with (`byTask`: a timer, a frame's callbacks, an
 * event, the frame's own rendering), and all the time sampled under each of
 * the dashboard's own functions (`under`), whatever ran beneath them.
 */
function restOf(
  { main, offsetUs }: { main: MainThread; offsetUs: number },
  maps: string | undefined
) {
  const byTask = new Map<string, number>();
  const tasks = new Map<string, number>();
  const { phases, passes, roots, forced, forcedCount } = passesOf(main, maps);
  // The frames the main thread painted; with `PROBE_IDLE_WHY`, what each
  // layout and restyle was asked for, by the element it named.
  let painted = 0;
  const relaidOut = new Map<string, number>();
  const restyled = new Map<string, number>();
  for (const task of main.tasks) {
    addTo(byTask, task.ran, task.cpu);
    addTo(tasks, task.ran, 1);
    for (const [phase, ms] of task.rendering) {
      addTo(phases, phase, ms);
    }
    if (task.rendering.some(([phase]) => phase === "Paint")) {
      painted += 1;
    }
    for (const [why, count] of task.relaidOut) {
      addTo(relaidOut, why, count);
    }
    for (const [why, count] of task.invalidated) {
      addTo(restyled, why, count);
    }
  }
  const under = new Map<string, number>();
  for (const [stack, self] of main.stacksIn(
    offsetUs,
    Number.POSITIVE_INFINITY
  )) {
    const own = new Set(
      stack
        .split(" < ")
        .map((frame) => atSource(maps, frame))
        .filter((frame) => OWN_SOURCE.test(frame))
    );
    for (const frame of own) {
      under.set(frame, (under.get(frame) ?? 0) + self);
    }
  }
  return {
    byTask: largest(byTask).map(([ran, ms]): [string, number, number] => [
      ran,
      ms,
      tasks.get(ran) ?? 0,
    ]),
    painted,
    passes,
    phases: largest(phases),
    relaidOut: largest(relaidOut).slice(0, 12),
    restyled: largest(restyled).slice(0, 8),
    roots: largest(roots).slice(0, 4),
    forced: largest(forced).map(([site, ms]): [string, number, number] => [
      site,
      ms,
      forcedCount.get(site) ?? 0,
    ]),
    under: largest(under),
  };
}

/** Idle: a quiet session left open while the fleet runs. */
async function idleLeg(live: Live, quiet: string) {
  const { kit, page } = live;
  await live.goto(`/session/${quiet}`);
  const at = await page.evaluate(() => window.__pf.perfReset(false, true));
  // The machine's pressure as the minute begins and ends (quiet.ts): a
  // message's handling is read by the wall clock, which a busy box
  // stretches, so each reading says what it was taken under.
  const pressedBefore = machineQuiet();
  const meter = await page.evaluate((ms) => window.__pf.busyMeter(ms), IDLE_MS);
  const pressedAfter = machineQuiet();
  const state = await page.evaluate(() => window.__pf.perfRead());
  // The minute's DOM changes and frame asks are read: the probe's own
  // recorders stop, so neither trace counts their work as the page's.
  await page.evaluate(() => window.__pf.perfReset(false, false));
  // The budget, read on a trace of the main thread's tasks alone. The CPU
  // profiler the trace after it runs is the trace's, not the page's: its
  // start is a task of its own on the trace's first frame (232ms on the
  // scale fleet), and its sampling and the stacks every pass records added
  // 0.1–1.1% at rest, alternating 8s traces of the same page.
  const bare = TRACES
    ? await traceMain(page, () => page.waitForTimeout(20_000), {})
    : UNTRACED;
  const spanMs =
    ((bare.tasks.at(-1)?.end ?? 0) - (bare.tasks[0]?.at ?? 0)) / 1000 || 1;
  const ownCpu = bare.tasks.reduce((sum, task) => sum + task.cpu, 0) / spanMs;
  // Where the time goes, on a second trace with the profiler and each pass.
  const traceOf = await traced(
    page,
    () => page.waitForTimeout(20_000),
    true,
    // Why each pass ran, on request: the invalidation tracking it turns on
    // costs the page CPU of its own.
    process.env.PROBE_IDLE_WHY === "1"
  );
  const { main } = traceOf;
  // What the page's own time went to at rest, by sampled self time, and
  // what its message tasks (the hub socket's) ran, the same way.
  const functions = topFunctions(
    main,
    live.maps,
    traceOf.offsetUs,
    0,
    Number.POSITIVE_INFINITY,
    16
  );
  // The page's takes of its messages while the trace ran (live-page.ts
  // `takeSpans`), each read on the trace's clock.
  const spans = await page.evaluate(() => window.__pf.perfRead().ws.takeSpans);
  const { messageFunctions, messageInclusive, kindInclusive } = takesRan(
    traceOf,
    spans,
    live.maps
  );
  const atRest = restOf(traceOf, live.maps);
  const moving = await page.evaluate(runningAnimations);
  // The meter's floor: the same meter on a blank page, the machine's other
  // turns alone.
  const blank = await live.desk();
  await blank.goto("about:blank");
  const floor = await blank.evaluate(busyMeter, 20_000);
  await blank.close();
  const messages = Object.entries(state.ws.kinds).map(
    ([kind, [count, chars, ms, longest]]) => ({
      kind,
      count,
      kB: round(chars / 1024),
      msEach: round(ms / count),
      longest: round(longest, 0),
    })
  );
  const total = messages.reduce((sum, one) => sum + one.count, 0);
  live.numbers.idle = {
    session: quiet,
    pressure: { before: pressedBefore, after: pressedAfter },
    busyShare: round(meter.busyShare, 3),
    floorShare: round(floor.busyShare, 3),
    meterGrainMs: meter.grainMs,
    traceCpuShare: round(ownCpu, 3),
    messagesPerSecond: round((total / IDLE_MS) * 1000),
    messages,
    long: longWork(state.long, at),
    scripts: scriptsOf(state.loaf, live.maps, at).slice(0, 8),
    functions,
    messageFunctions,
    messageInclusive,
    kindInclusive,
    atRest,
    moving,
    // The page's takes of its messages (if it takes them after its frame):
    // how many, how many messages, their ms all told and the longest.
    takes: state.ws.takes,
    mutated: state.mutated,
  };
  kit.note(
    `idle on ${live.titleOf(quiet)} (the machine as the minute began: ${quietWords(pressedBefore)}; as it ended: ${quietWords(pressedAfter)}): busy ${round(meter.busyShare * 100)}% (blank page ${round(floor.busyShare * 100)}%; the meter's clock steps ${round(meter.grainMs, 3)}ms, no task under that seen), its own CPU by a trace with no profiler ${round(ownCpu * 100)}%; ${round((total / IDLE_MS) * 1000)} messages a second: ${messages
      .sort((a, b) => b.msEach * b.count - a.msEach * a.count)
      .slice(0, 6)
      .map(
        (one) =>
          `${one.kind} ×${one.count} ${one.msEach}ms each (longest ${one.longest})`
      )
      .join(
        ", "
      )}; the page took them in ${state.ws.takes[0]} takes (${state.ws.takes[1]} messages, ${round(state.ws.takes[2])}ms, the longest ${round(state.ws.takes[3])}ms); top functions ${functions
      .slice(0, 8)
      .map(([fn, ms]) => `${fn} ${ms}ms`)
      .join(", ")}; in message tasks ${messageFunctions
      .slice(0, 8)
      .map(([fn, ms]) => `${fn} ${ms}ms`)
      .join(", ")}; under the dashboard's own ${messageInclusive
      .slice(0, 10)
      .map(([fn, ms]) => `${fn} ${ms}ms`)
      .join(", ")}${Object.entries(kindInclusive)
      .filter(([, top]) => top.length > 0)
      .map(
        ([kind, top]) =>
          `; in the takes that held a ${kind}, under the dashboard's own ${top
            .slice(0, 12)
            .map(([fn, ms]) => `${fn} ${ms}ms`)
            .join(", ")}`
      )
      .join("")}; at rest, its CPU by task ${atRest.byTask
      .slice(0, 6)
      .map(([ran, ms, count]) => `${ran} ×${count} ${ms}ms`)
      .join(
        ", "
      )}; ${atRest.painted} frames painted, their own work ${atRest.phases
      .slice(0, 6)
      .map(([phase, ms]) => `${phase} ${ms}ms`)
      .join(", ")}, their passes ${atRest.passes
      .map(([pass, count, each]) => `${pass} ×${count} (${each} each)`)
      .join(", ")}, their layouts by root ${atRest.roots
      .map(([root, ms]) => `${root} ${ms}ms`)
      .join(", ")}${
      atRest.relaidOut.length > 0
        ? `, laid out for ${atRest.relaidOut
            .map(([why, count]) => `${why} ×${count}`)
            .join(", ")}; restyled for ${atRest.restyled
            .map(([why, count]) => `${why} ×${count}`)
            .join(", ")}`
        : ""
    }; frames asked for in the minute by ${Object.entries(state.framesAsked)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(
        ([asker, count]) =>
          `${asker
            .split(" ← ")
            .map((frame) => atSource(live.maps, frame))
            .join(" ← ")} ×${count}`
      )
      .join(
        ", "
      )}; running at rest ${moving}; changed in the minute ${Object.entries(
      state.mutatedAt
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(
        ([where, count]) =>
          `${where} ×${count} [${(state.mutationSamples[where] ?? []).join(" | ")}]`
      )
      .join(", ")}; under the dashboard's own ${atRest.under
      .slice(0, 14)
      .map(([fn, ms]) => `${fn} ${ms}ms`)
      .join(", ")}; forced ${atRest.forced
      .slice(0, 8)
      .map(([site, ms, count]) => `${site} ×${count} ${ms}ms`)
      .join("; ")}`
  );
  if (TRACES) {
    kit.check(
      `idle: the main thread's own CPU under ${IDLE_SHARE * 100}% while the fleet runs`,
      ownCpu < IDLE_SHARE,
      `${round(ownCpu * 100)}% by the thread time of a trace with no profiler`
    );
  }
  for (const [kind, budget] of KIND_BUDGETS) {
    const heard = messages.find((one) => one.kind === kind);
    kit.check(
      `idle: a ${kind}'s handling within ${budget}ms on average`,
      heard !== undefined && heard.msEach <= budget,
      heard
        ? `${heard.count}× ${heard.msEach}ms each, the longest ${heard.longest}ms`
        : "none heard"
    );
  }
  const { maps } = live;
  if (TRACES && maps) {
    const timers = state.loaf
      .flatMap((frame) => frame.scripts)
      .filter((script) =>
        HELD_ORDER.test(
          (script.url && sourceAt(maps, script.url, script.pos)) || ""
        )
      );
    const longest = Math.max(0, ...timers.map((script) => script.ms));
    kit.check(
      `idle: no held list's reorder runs ${HELD_ORDER_MS}ms in a long frame`,
      longest < HELD_ORDER_MS,
      `${timers.length} in long frames, the longest ${round(longest)}ms`
    );
  }
}

/** What a cold page's first frames said of its transcript ({@link watchNewestRow}). */
interface FirstRows {
  /** How far the rows drawn in the newest row's first frame reach above the area's top, px. */
  above: number;
  /** That frame, on the page's clock. */
  at: number;
  /** The rows drawn in it fill the area from its top. */
  filled: boolean;
  /** The area's height, px. */
  height: number;
  /**
   * The server's first screen handing its place to the list: the frame the
   * list was drawn in, how many of the first screen's last rows the list
   * drew too (by their words), and the most any of them moved, px. Null
   * while no first screen has gone.
   */
  swap: {
    at: number;
    matched: number;
    movedPx: number;
    /** Each of those rows: its words' start, its top and height in the first screen, then in the list. */
    rows: [string, number, number, number, number][];
  } | null;
}

/**
 * The first frame a page draws its transcript's newest row in, on the
 * page's clock: the last row in the transcript area (`Row`'s
 * `[data-slot="row"]`, a call in a run's too: in document order oldest to
 * newest, the list's, then the server's first screen standing over it),
 * drawn (not hidden, not see-through) and inside the area's box; whether
 * the rows drawn in that frame fill the area from its top; and, once the
 * server's first screen (`first-screen`) has gone, where the list drew its
 * last rows against where the first screen had them. Read before each
 * frame from the page's start, put on the page before its own scripts:
 * `window.__firstRows`.
 */
function watchNewestRow() {
  const w = window as unknown as {
    __firstRows: FirstRows | null;
    __paints: [number, string][];
  };
  w.__firstRows = null;
  // Room for every request the page makes: the timeline keeps 250 by
  // default, and the page's own modules (some 230) fill it before its
  // transcript is read.
  performance.setResourceTimingBufferSize(100_000);
  // Each largest paint as it is reported, with what it painted while that
  // is still in the page (the entry's own element is null once removed).
  w.__paints = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const { element } = entry as unknown as { element?: Element | null };
      const slot = element?.closest("[data-slot]")?.getAttribute("data-slot");
      w.__paints.push([
        Math.round(entry.startTime),
        element
          ? `${element.tagName.toLowerCase()}${slot ? ` in ${slot}` : ""}${element.closest('[data-slot="first-screen"]') ? " (first screen)" : ""}`
          : "gone",
      ]);
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  const drawn = (row: Element) =>
    row.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  /** A row of its own, not a call inside a run's row, by its words and box. */
  const placed = (within: Element) =>
    [...within.querySelectorAll('[data-slot="row"]')]
      .filter((row) => !row.parentElement?.closest('[data-slot="row"]'))
      .filter(drawn)
      .map((row) => {
        const box = row.getBoundingClientRect();
        return {
          words: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
          top: box.top,
          height: box.height,
        };
      });
  /** The first screen's last rows, as its last frame drew them. */
  let stood: ReturnType<typeof placed> = [];
  const handOver = (at: number): boolean => {
    const area = document.querySelector('[data-slot="transcript-slide"]');
    const first = area?.querySelector('[data-slot="first-screen"]');
    if (first) {
      stood = placed(first).slice(-8);
      return false;
    }
    const list = area?.querySelector('[data-slot="listing"][data-shown]');
    if (!(list && stood.length > 0 && w.__firstRows)) {
      return stood.length === 0 && Boolean(list);
    }
    const now = placed(list);
    // A row is found by its words; among rows of the same words (a run of
    // `Edited` calls), the one nearest where it stood.
    const pairs = stood.flatMap((row) => {
      const [same] = now
        .filter((one) => one.words === row.words)
        .sort((a, b) => Math.abs(a.top - row.top) - Math.abs(b.top - row.top));
      return same ? [[row, same] as const] : [];
    });
    const moved = pairs.map(([row, same]) =>
      Math.max(Math.abs(same.top - row.top), Math.abs(same.height - row.height))
    );
    w.__firstRows.swap = {
      at,
      matched: moved.length,
      movedPx: Math.round(Math.max(0, ...moved) * 10) / 10,
      rows: pairs.map(([row, same]) => [
        row.words.slice(0, 24),
        Math.round(row.top),
        Math.round(row.height),
        Math.round(same.top),
        Math.round(same.height),
      ]),
    };
    return true;
  };
  const look = (at: number) => {
    const area = document.querySelector('[data-slot="transcript-slide"]');
    const rows = [...(area?.querySelectorAll('[data-slot="row"]') ?? [])];
    const last = rows.at(-1);
    if (!w.__firstRows && area && last) {
      const view = area.getBoundingClientRect();
      const box = last.getBoundingClientRect();
      if (
        box.height > 0 &&
        box.bottom > view.top &&
        box.top < view.bottom &&
        drawn(last)
      ) {
        const top = Math.min(
          ...rows.filter(drawn).map((row) => row.getBoundingClientRect().top)
        );
        w.__firstRows = {
          at,
          filled: top <= view.top + 1,
          above: Math.round(view.top - top),
          height: Math.round(view.height),
          swap: null,
        };
      }
    }
    if (!(w.__firstRows && handOver(at))) {
      requestAnimationFrame(look);
    }
  };
  requestAnimationFrame(look);
}
const NEWEST_ROW = { content: `(${watchNewestRow.toString()})();` };

/** A cold page's load: its first byte, its paints, its newest row, its long tasks. */
const coldLoad = async () => {
  const [nav] = performance.getEntriesByType(
    "navigation"
  ) as PerformanceNavigationTiming[];
  const lcp = await new Promise<PerformanceEntry | undefined>((done) => {
    new PerformanceObserver((list) => done(list.getEntries().at(-1))).observe({
      type: "largest-contentful-paint",
      buffered: true,
    });
    setTimeout(() => done(undefined), 500);
  });
  const lcpOn = (lcp as { element?: Element | null } | undefined)?.element;
  const [fcp] = performance.getEntriesByName("first-contentful-paint");
  const newest = (window as unknown as { __firstRows: FirstRows | null })
    .__firstRows;
  // The page's layout shifts (Chromium's Layout Instability API; none where
  // the engine has none): each one's score, when, and what moved.
  interface Shift {
    sources: {
      currentRect: DOMRectReadOnly;
      node?: Node | null;
      previousRect: DOMRectReadOnly;
    }[];
    startTime: number;
    value: number;
  }
  const shifts = PerformanceObserver.supportedEntryTypes.includes(
    "layout-shift"
  )
    ? await new Promise<Shift[]>((done) => {
        new PerformanceObserver((list) =>
          done(list.getEntries() as unknown as Shift[])
        ).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => done([]), 500);
      })
    : null;
  /** A node as the slots it stands in say it, the nearest first. */
  const named = (node: Node | null | undefined) => {
    if (!(node instanceof Element)) {
      return String(node?.nodeName ?? "gone");
    }
    const slots: string[] = [];
    for (
      let at = node.closest("[data-slot]");
      at && slots.length < 3;
      at = at.parentElement?.closest("[data-slot]") ?? null
    ) {
      slots.push(at.getAttribute("data-slot") ?? "");
    }
    return `${node.tagName.toLowerCase()} in ${slots.join(" < ")}`;
  };
  const box = (rect: DOMRectReadOnly) =>
    [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(",");
  // The page's own reads of a transcript (the hub's `/transcript`): of the
  // newest page, and of the pages before it.
  const reads = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.includes("/transcript"));
  return {
    newestReads: reads.filter((name) => !name.includes("before=")).length,
    olderReads: reads.filter((name) => name.includes("before=")).length,
    ttfbMs: Math.round(nav?.responseStart ?? -1),
    /** The HTML wholly in: what a paint of it can follow at the soonest. */
    htmlInMs: Math.round(nav?.responseEnd ?? -1),
    htmlKB: Math.round((nav?.decodedBodySize ?? 0) / 1024),
    fcpMs: Math.round(fcp?.startTime ?? -1),
    lcpMs: Math.round(lcp?.startTime ?? -1),
    lcpOn: lcpOn
      ? `${lcpOn.tagName.toLowerCase()}${lcpOn.closest("[data-slot]") ? ` in ${lcpOn.closest("[data-slot]")?.getAttribute("data-slot")}` : ""}`
      : null,
    newestRowMs: newest === null ? null : Math.round(newest.at),
    filled: newest?.filled ?? null,
    /** How far the rows drawn in that frame reach above the area's top, and the area's height, px. */
    rowsAbovePx: newest?.above ?? null,
    areaPx: newest?.height ?? null,
    swap: newest?.swap ?? null,
    /** Every largest paint reported, and what it painted as it was. */
    paints: (window as unknown as { __paints?: [number, string][] }).__paints,
    cls:
      shifts === null
        ? null
        : Math.round(shifts.reduce((sum, one) => sum + one.value, 0) * 10_000) /
          10_000,
    shifts: shifts?.map((one) => ({
      at: Math.round(one.startTime),
      value: Math.round(one.value * 10_000) / 10_000,
      moved: one.sources.map(
        (source) =>
          `${named(source.node)} ${box(source.previousRect)} → ${box(source.currentRect)}`
      ),
    })),
    long: window.__perf.long.length,
    longMs: Math.round(window.__perf.long.reduce((sum, [, ms]) => sum + ms, 0)),
    nodes: document.getElementsByTagName("*").length,
  };
};

/**
 * A cold page's HTML as the server sent it, by part, KB: the serialized
 * data of the loads (the inline scripts: the app's start and the data it
 * hydrates from), the responses a universal load fetched
 * (`data-sveltekit-fetched`, served again to the hydrating load), the
 * inline styles, and the markup.
 */
const htmlParts = (html: string) => {
  const sum = (pattern: RegExp) =>
    [...html.matchAll(pattern)].reduce((total, [one]) => total + one.length, 0);
  const fetched = sum(
    /<script type="application\/json" data-sveltekit-fetched[^>]*>[\s\S]*?<\/script>/g
  );
  const scripts = sum(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g);
  const styles = sum(/<style[^>]*>[\s\S]*?<\/style>/g);
  const kb = (chars: number) => Math.round(chars / 1024);
  return {
    totalKB: kb(html.length),
    dataKB: kb(scripts - fetched),
    fetchedKB: kb(fetched),
    stylesKB: kb(styles),
    markupKB: kb(html.length - scripts - styles),
  };
};

/**
 * What the rail's home lists say: its tabs (each with its count), Recent's
 * header (its count, and what a shut one says still runs inside), and how
 * many trees an open Recent draws. Read the same way before a change and
 * after it, the two say whether a person sees the same lists.
 */
const homeSays = () => {
  const words = (el: Element | null | undefined) =>
    el?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  const rail = document.querySelector("aside");
  return {
    tabs: [...(rail?.querySelectorAll("[role=tab]") ?? [])].map(words),
    recent: words(rail?.querySelector('[data-slot="recent"] > button')),
    recentTrees:
      rail?.querySelectorAll('[data-slot="home-recent-session-tree"] > *')
        .length ?? 0,
  };
};

/** A cold load as the nav leg reads it. */
type Cold = Awaited<ReturnType<typeof coldLoad>> & {
  parts: ReturnType<typeof htmlParts>;
  path: string;
};

/**
 * The cold loads held to their budgets: a session's (the scale fleet's long
 * one) and a project's. Asserted on the fleet alone: the live hub's
 * sessions and boards are what they are.
 */
function coldBudgets(kit: Kit, loads: Cold[]): void {
  const session = loads.find((one) => one.path.startsWith("/session/"));
  if (session) {
    const { parts, swap } = session;
    const after =
      session.newestRowMs === null
        ? null
        : session.newestRowMs - session.htmlInMs;
    kit.check(
      `cold ${session.path}: its newest rows drawn within ${NEWEST_ROW_MS}ms of its HTML being in`,
      after !== null && after <= NEWEST_ROW_MS,
      `${after}ms (the HTML in at ${session.htmlInMs}ms, the newest row drawn at ${session.newestRowMs}ms)`
    );
    kit.check(
      `cold ${session.path}: the page reads no newest page of its own: the server's is the store's`,
      session.newestReads === 0,
      `${session.newestReads} read(s) of the newest page, ${session.olderReads} of older ones`
    );
    kit.check(
      `cold ${session.path}: the rows its first frame draws fill the transcript from its top`,
      session.filled === true,
      `${session.rowsAbovePx}px above the ${session.areaPx}px area`
    );
    kit.check(
      `cold ${session.path}: the list takes the server's first screen's place with no row moving more than ${SWAP_PX}px`,
      swap !== null && swap.matched > 0 && swap.movedPx <= SWAP_PX,
      JSON.stringify(swap)
    );
    kit.check(
      `cold ${session.path}: its HTML under ${SESSION_HTML_KB} KB`,
      parts.totalKB <= SESSION_HTML_KB,
      JSON.stringify(parts)
    );
    kit.check(
      `cold ${session.path}: first paint within ${SESSION_FCP_MS}ms, largest paint within ${SESSION_LCP_MS}ms`,
      session.fcpMs >= 0 &&
        session.fcpMs <= SESSION_FCP_MS &&
        session.lcpMs >= 0 &&
        session.lcpMs <= SESSION_LCP_MS,
      `fcp ${session.fcpMs}ms, lcp ${session.lcpMs}ms (ttfb ${session.ttfbMs}ms)`
    );
  }
  const project = loads.find((one) => one.path.startsWith("/project/"));
  if (project) {
    kit.check(
      `cold ${project.path}: no hub answer inlined beside its data, its HTML under ${PROJECT_HTML_KB} KB`,
      project.parts.fetchedKB === 0 && project.parts.totalKB <= PROJECT_HTML_KB,
      JSON.stringify(project.parts)
    );
    kit.check(
      `cold ${project.path}: first paint within ${PROJECT_FCP_MS}ms, largest paint within ${PROJECT_LCP_MS}ms`,
      project.fcpMs >= 0 &&
        project.fcpMs <= PROJECT_FCP_MS &&
        project.lcpMs >= 0 &&
        project.lcpMs <= PROJECT_LCP_MS,
      `fcp ${project.fcpMs}ms, lcp ${project.lcpMs}ms (ttfb ${project.ttfbMs}ms)`
    );
  }
}

/** Nav: cold loads, then the home's common presses. */
async function navLeg(live: Live, session: string | undefined) {
  const { kit, page } = live;
  const projects = await page.evaluate(async () => {
    const answer = await fetch("/api/projects");
    return answer.ok ? ((await answer.json()) as { id: string }[]) : [];
  });
  const paths = [
    "/session",
    ...(session ? [`/session/${session}`] : []),
    ...(projects[0] ? [`/project/${projects[0].id}`] : []),
  ];
  const loads: Cold[] = [];
  for (const path of paths) {
    const cold = await live.desk(true);
    const sent = await cold.goto(`${live.base}${path}`, { waitUntil: "load" });
    const html = (await sent?.text()) ?? "";
    await cold.waitForTimeout(SETTLE_MS);
    const read = await cold.evaluate(coldLoad);
    const parts = htmlParts(html);
    await writeFile(
      join(live.kit.out, `cold${path.replaceAll("/", "-")}.html`),
      html
    );
    loads.push({ path, ...read, parts });
    await cold.close();
  }
  await live.goto("/session", "aside");
  await page.evaluate(() => window.__pf.perfReset(true, true));
  const presses: { interactionMs: number | null; press: string }[] = [];
  const pressed = async (name: string, act: () => Promise<void>) => {
    const at = await page.evaluate(() => performance.now());
    await act();
    await page.waitForTimeout(SWITCH_MS);
    const state = await page.evaluate(() => window.__pf.perfRead());
    const [interaction] = interactions(
      state.events.filter((one) => one.at >= at)
    );
    presses.push({
      press: name,
      interactionMs: interaction ? round(interaction.ms, 0) : null,
    });
  };
  await pressed("Finished", () =>
    page.getByRole("tab", { name: "Finished" }).first().click()
  );
  const recent = page.getByRole("button", { name: RECENT }).first();
  const shut = await page.evaluate(homeSays);
  await pressed("Recent, open", () => recent.click());
  const open = await page.evaluate(homeSays);
  await pressed("Recent, shut", () => recent.click());
  await pressed("a project", () =>
    page.locator('aside a[href^="/project/"]').first().click()
  );
  live.numbers.nav = { loads, presses, home: { shut, open } };
  for (const one of loads) {
    kit.note(`cold ${JSON.stringify(one)}`);
  }
  if (live.fleet) {
    coldBudgets(kit, loads);
  }
  kit.note(
    `nav: the rail's home says, Recent shut ${JSON.stringify(shut)}, Recent open ${JSON.stringify(open)}`
  );
  const slow = presses.filter(
    (one) => (one.interactionMs ?? Number.POSITIVE_INFINITY) > INTERACTION_MS
  );
  kit.check(
    `nav: every common press an interaction within ${INTERACTION_MS}ms`,
    slow.length === 0,
    JSON.stringify(presses)
  );
}

/** Memory: thirty switches between two readings after a collection. */
async function memoryLeg(live: Live, tabs: string[]) {
  const { kit, page } = live;
  await openTabs(live, tabs);
  const before = await memoryOf(page);
  for (let i = 0; i < 30; i += 1) {
    await tabOf(live, tabs[(i * 5 + 1) % tabs.length] as string).click();
    await page.waitForTimeout(1300);
  }
  const after = await memoryOf(page);
  live.numbers.memory = { before, after };
  kit.note(
    `memory over 30 switches: heap ${before.heapMB} → ${after.heapMB} MB, nodes ${before.nodes} → ${after.nodes}, listeners ${before.listeners} → ${after.listeners}, documents ${before.documents} → ${after.documents}`
  );
  kit.check(
    `memory: thirty switches grow the DOM's nodes and the heap under ${GROWTH_SHARE * 100}%`,
    after.nodes <= before.nodes * (1 + GROWTH_SHARE) &&
      after.heapMB <= before.heapMB * (1 + GROWTH_SHARE),
    JSON.stringify({ before, after })
  );
}

/** The display's own frame interval, read off sixty frames of a still page. */
const stillFrames = () =>
  new Promise<number[]>((done) => {
    const at: number[] = [];
    const frame = (t: number) => {
      at.push(t);
      if (at.length < 61) {
        requestAnimationFrame(frame);
      } else {
        done(at);
      }
    };
    requestAnimationFrame(frame);
  });

/** The board, as this browser is answered it: the rows, or the status refused. */
const boardRead = async (): Promise<unknown> => {
  const answer = await fetch("/api/instances");
  return answer.ok ? ((await answer.json()) as unknown) : answer.status;
};

const spec: Spec = {
  name: "live-perf",
  run: async (kit: Kit) => {
    const fleetMode = process.argv.includes("--fleet");
    if (fleetMode) {
      // The build's maps beside its chunks, read where its frames are said.
      process.env.PROBE_SOURCEMAP ??= "hidden";
    }
    const scale = fleetMode
      ? await scaleFleet(
          kit,
          Number(option("rows") ?? LIVE_ROWS),
          Number(option("asleep") ?? LIVE_ASLEEP)
        )
      : null;
    try {
      await measureLive(kit, scale);
    } finally {
      scale?.stop();
    }
  },
};

/**
 * The sessions the legs open: as the options name them, else the scale
 * fleet's own, else the board's running ones that have run longest and its
 * newest stopped one.
 */
function chosen(
  rows: Row[],
  running: Row[],
  scale: Awaited<ReturnType<typeof scaleFleet>> | null
) {
  const quiet =
    option("quiet") ??
    scale?.quiet ??
    rows
      .filter((row) => row.status === "stopped")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id;
  return {
    sessions: listed("sessions") ?? running.slice(0, 3).map((row) => row.id),
    tabs:
      listed("tabs") ?? scale?.live ?? running.slice(0, 7).map((row) => row.id),
    quiet,
  };
}

/** The legs, on the dashboard `--base` names or on the scale fleet's. */
async function measureLive(
  kit: Kit,
  scale: Awaited<ReturnType<typeof scaleFleet>> | null
): Promise<void> {
  const base = (scale?.base ?? option("base"))?.replace(TRAILING_SLASH, "");
  if (!base) {
    kit.check(
      "a live dashboard is named",
      false,
      "pass --base https://<hub>:3455 (and --storage <state.json> for a hub that pairs its browsers), or --fleet"
    );
    return;
  }
  const storage = option("storage");
  const legs = new Set<Leg>(
    (listed("legs") ?? (scale ? ["idle", "switch", "nav"] : [...LEGS])).filter(
      (one): one is Leg => (LEGS as readonly string[]).includes(one)
    )
  );
  const desk = async (cold = false): Promise<Page> => {
    const one = await kit.page("desk", {
      init: cold ? [WATCHER, LIB, NEWEST_ROW] : [WATCHER, LIB],
      scale: 1,
      scrollbars: true,
    });
    if (storage) {
      const state = JSON.parse(readFileSync(storage, "utf8")) as {
        cookies?: Parameters<BrowserContext["addCookies"]>[0];
      };
      await one.context().addCookies(state.cookies ?? []);
    }
    return one;
  };
  const page = await desk();
  await page.goto(`${base}/session`, { waitUntil: "domcontentloaded" });
  const board = await page.evaluate(boardRead);
  if (!Array.isArray(board)) {
    kit.check(
      "the hub's board answers this browser",
      false,
      `GET /api/instances answered ${String(board)}: a hub that pairs its browsers wants --storage`
    );
    return;
  }
  const rows = board as Row[];
  const running = rows
    .filter((row) => row.status === "running")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const live: Live = {
    base,
    fleet: scale !== null,
    desk,
    kit,
    maps:
      option("maps") ??
      (scale
        ? join(ROOT, "apps/dashboard/.svelte-kit/output/client")
        : undefined),
    numbers: { base, at: new Date().toISOString() },
    page,
    slot: displayFrame(await page.evaluate(stillFrames)),
    titleOf: (id) => {
      const row = rows.find((one) => one.id === id);
      return row?.title || row?.derivedTitle || id.slice(0, 8);
    },
    goto: async (path, ready = TRANSCRIPT) => {
      await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(ready, { timeout: 60_000 });
      await page.waitForTimeout(SETTLE_MS);
    },
  };
  live.numbers.displayFrameMs = round(live.slot);
  const { sessions, tabs, quiet } = chosen(rows, running, scale);
  kit.note(
    `live-perf: ${base}, ${rows.length} sessions on the board, ${running.length} running, the display's frame ${round(live.slot)}ms; legs ${[...legs].join(", ")}`
  );
  // The scroll and memory legs read the heap and the DOM's counters through
  // the DevTools protocol (`memoryOf`), which only Chromium speaks.
  const chromiumOnly = (leg: Leg): boolean => {
    if (legs.has(leg) && !TRACES) {
      kit.note(
        `${leg}: Chromium only (the heap and the DOM's counters are read through the DevTools protocol); skipped on ${process.env.PROBE_ENGINE}`
      );
      return false;
    }
    return legs.has(leg);
  };
  if (chromiumOnly("scroll")) {
    await scrollLeg(live, sessions);
  }
  if (legs.has("canvas")) {
    await canvasLeg(live, listed("pages") ?? PAGES);
  }
  if (legs.has("idle") && quiet) {
    await idleLeg(live, quiet);
  }
  if (legs.has("switch") && tabs.length > 1) {
    await switchLeg(live, tabs);
  }
  if (legs.has("nav")) {
    await navLeg(live, scale?.long ?? sessions[0]);
  }
  if (chromiumOnly("memory") && tabs.length > 1) {
    await memoryLeg(live, tabs);
  }
  await writeFile(
    join(kit.out, "numbers.json"),
    `${JSON.stringify(live.numbers, null, 2)}\n`
  );
}

export default spec;
