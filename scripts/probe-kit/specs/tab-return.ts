/**
 * Switching to a tab shows it within the frame budget, however much happened
 * in it while it was hidden (owner, 2026-10-17: "switching to a tab that had
 * stuff going on or previews is still laggy").
 *
 *   bun scripts/probe-kit/run.ts tab-return
 *
 * Two-pane-perf's scratch fleet, trace and counting, on the owner's two
 * scenes. One pane at the desk holds five tabs: a quiet session in front,
 * a busy one streaming tool calls with long outputs (a long transcript
 * already behind it), one showing a heavy folder preview (`heavy`: a
 * multi-MB script and Rive's 2 MB wasm, compiled at load, its canvas drawn
 * every frame, its animation frames and a 100 ms interval counted on its
 * own window), and two showing a one-line page each, which load as their
 * tabs are first shown and take the bound's places.
 *
 * 1. Return to a busy tab: the quiet tab in front for `SHORT_MS`, then the
 *    busy one chosen again; then for `BACKLOG_MS`, and again.
 * 2. Return to a preview tab. Off screen, the page is kept and held, up to
 *    PreviewPane's bound of hidden pages (loaded.svelte.ts: 2 at the desk):
 *    a: the quiet tab in front for `SHORT_MS`, then back (kept);
 *    b: the two light tabs shown, then the quiet one, so the heavy page is
 *       the third hidden and the one hidden longest, then back past the
 *       bound (let go, loaded again).
 *    Playwright's Chromium keys the preview's origin to a process of its
 *    own, so these are read again on a Chromium that keeps every frame in
 *    the dashboard's process (the kit's `oneProcess`), as every WebKit and
 *    a Chromium that does not isolate the preview's site run it: c (as a),
 *    e (hidden `HELD_MS`, held: no animation frame or timer of the page's
 *    runs), d (as b). The kept returns, a, c and e, are read again on
 *    WebKit, without a trace.
 *
 * Each Chromium return is a pointer's switch, as two-pane-perf's `point`
 * makes it (the pointer comes onto the tab, rests `REACH_MS`, presses),
 * read off a DevTools trace by thread clock: the longest task from the
 * reach to the window's end (`WINDOW_MS`, or to the page's `cawco:ready`
 * and `AFTER_READY_MS` past it for a reloaded preview), on a CPU `SLOWER`
 * times slower; the style and layout passes and elements restyled from the
 * input to the frame that shows the pane (`workOf`); the press's
 * interaction by Event Timing. A WebKit return is the tab's click. Each
 * return is a leg gated on the spec's own CPU pressure (`quietLeg`). Every
 * number is written to `numbers.json`.
 *
 * The busy session streams as the spec lets it: once seeded, its live turns
 * run only while the busy tab is away (one per `TURN_MS` of the absence) and
 * land before the return, and none runs while a return is measured. Every
 * run, on any tree, is shown the same turns at the same points; each return
 * says how many elements the page put in from the reach on (`inserted`). A
 * return to the preview says when the pane reached into its frame to post
 * (`watchPosts`), when its release reached the page, the page's own long
 * tasks before its first frame, and that frame.
 *
 * Asserted per Chromium return: its interaction under `INPUT_MS`, and,
 * for a busy or kept return, its longest task within two frames' budget
 * (`2 × LONG_TASK_MS`) on the slower CPU. A return past the bound loads the
 * page again, in the dashboard's process where a frame shares it, so its
 * longest task is the page's own load: noted, and asserted only to have let
 * the page go and loaded it again. Asserted per kept return, on every
 * engine: the page is the document it was (no reload), held off screen
 * (none of its animation frames or timers ran), and its first animation
 * frame after the press comes within `BACK_MS`.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one return at a time, as a person makes them
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CDPSession, Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type MainTask, SCROLLER, traceMain } from "../frames";
import { type Kit, open, ROOT, type Spec } from "../kit";
import {
  type Cost,
  census,
  INPUT_MS,
  inputsOf,
  LONG_TASK_MS,
  pressureFile,
  quietLeg,
  REACH_MS,
  SLOWER,
  type SwitchWork,
  watchCost,
  workLine,
  workOf,
} from "./two-pane-perf";

/** Calls already behind the busy session when the dashboard opens. */
const SEED = 400;
/** A short absence: a glance at another tab and back. */
const SHORT_MS = 10_000;
/** A long one: minutes of backlog. */
const BACKLOG_MS = 3 * 60_000;
/** How long a held page is left off screen (e): the 30 s the pane once unloaded at, and a margin past it. */
const HELD_MS = 30_000 + 3000;
/** A kept page's first animation frame after the press comes within this. The owner's bound on a return. */
const BACK_MS = 100;
/** Light pages are given this to load once their tab is shown. */
const LIGHT_READY_MS = 60_000;
/** How long after the press what other renderers ran is summed (`elsewhere`). */
const ELSEWHERE_MS = 1000;
/** After the switch away, how long before a kept page's window is first read: its hold has landed. */
const SETTLE_MS = 1000;
/** How long after a switch its tasks are its own: the shown frame, the catch-up, the landing's steps. */
const WINDOW_MS = 2500;
/** A reloaded preview's window runs on past its `cawco:ready` by this. */
const AFTER_READY_MS = 1500;
/** The most a reloaded preview is waited for. */
const READY_MS = 30_000;
/** Lines each long output prints. */
const OUTPUT_LINES = 400;
/** Lines of the heavy page's generated script, each a function it runs at load. */
const SCRIPT_FUNCTIONS = 60_000;
/** A task this long or longer is listed with when it ran (`Back.heavy`), CPU ms. */
const HEAVY_MS = 8;
/**
 * A live busy turn's length (its 30 words at 40ms, its tool's second, the
 * harness's round trip): how many turns an absence lets through.
 */
const TURN_MS = 3000;
/** The most a leg's released turns may take. */
const RELEASE_MS = 5 * 60_000;
/** After the last released turn, for its frames to reach the page. */
const LANDED_MS = 1500;
/**
 * The reach's longest task, CPU ms on a quiet host: a quarter of the frame
 * budget the slower CPU leaves (`2 × LONG_TASK_MS` over `SLOWER`), so a
 * slower machine still has room. The parent's call (tab-return, 2026-10-19).
 */
const REACH_TASK_MS = 12;
/** A press this soon after the reach comes while the warm pane's rows are still staged (Transcript `parkRows`). */
const PRESS_IN_STAGING_MS = 40;
/** An interaction's length in `inputsOf`'s line. */
const LENGTH = / (\d+)ms/;
const RIVE = join(
  ROOT,
  "node_modules/.bun/@rive-app+canvas@2.44.0/node_modules/@rive-app/canvas"
);

/** One return, read. */
interface Back {
  /** What other renderers' main threads (an out-of-process preview's) ran in the second after the press, by event. */
  elsewhere: string;
  /** Every task of `HEAVY_MS` or more from the reach on: when after the press, what it ran, its CPU and what it restyled. */
  heavy: string;
  /** What each pane held as the pointer came onto the tab (two-pane-perf's `census`). */
  held: string;
  /** The press's interaction, Event Timing's longest entry. */
  input: string;
  inputMs: number;
  /** Elements put into the page from the reach to the window's end, each with all it holds. */
  inserted: number;
  /** To a busy tab, to a preview kept off screen, or to one past the bound. */
  kind: "busy" | "kept" | "past";
  /** A busy return: where its transcript stood once the window was over (`landingOf`). */
  landing?: string;
  /** The longest task from the reach to the window's end, CPU ms, and what it was. */
  longest: number;
  longestWhat: string;
  /** A return to the preview: what its page's own window said of it. */
  page?: PageBack;
  /** When the switch was pressed, epoch ms. */
  pressAt: number;
  psi: string;
  /** The longest task between the reach and the press, CPU ms. */
  reach: number;
  /** That task said whole: what it ran, its restyle, the changes that scheduled it and its sampled stacks. */
  reachWhat: string;
  scene: string;
  /** The pane once the window is over: anything left skipped, rows in view with no text box, rows a different height (`shownStateOf`). */
  shown: string;
  /** From `shownStateOf`: elements with an inline skip, computing it hidden, rows in view, and those with no text box; empty when unread. */
  shownCounts: number[];
  /** How many item sizes told from the reach to the press differ from the size the item had before it. */
  sizeChanges: number;
  /** How many of its rows were still staged (an inline skip) as the press came. */
  stagedAtPress: number;
  /** From the reach to the press: the rows staged, the sizes virtua was told and which changed (`watchSizes`). */
  staging: string;
  /** Read off a DevTools trace (Chromium); a WebKit return is its click alone. */
  traced: boolean;
  /**
   * The reach task itself, CPU ms: the longer of the task that warms the
   * pane (`markWarm`) and the frame after it that first lays the pane out;
   * NaN when no warm was traced.
   */
  warmTask: number;
  /** That task said whole, as `reachWhat`. */
  warmWhat: string;
  work: SwitchWork | null;
  /** The longest animation frame in the window, by the scripts that filled it. */
  worstFrame: string;
}
/** A return as its trace reads it, before its leg's pressure is said. */
type Read = Omit<Back, "kind" | "psi" | "scene" | "page">;

/** The heavy page's own window, read in its frame: its document's start and its counters. */
interface Clock {
  /** Its document's `performance.timeOrigin`: a new one is a new document. */
  born: number;
  /** Calls to `requestAnimationFrame`, `setTimeout` and `setInterval` since it loaded, any script's. */
  calls: number;
  /** Its own long tasks, each its start (epoch ms) and length (ms). */
  long: [number, number][];
  /** Its own long animation frames: when (epoch ms), how long, its rendering's and its style and layout's share, and the scripts in it. */
  longFrames: {
    at: number;
    ms: number;
    render: number;
    scripts: string;
    style: number;
  }[];
  /** When the pane's last `cawco:release` reached it, epoch ms; 0 when none has. */
  releasedAt: number;
  /** Its animation frames' times, epoch ms, the last 600. */
  tickAt: number[];
  ticks: number;
  timers: number;
}

/** A return to the preview, as its page's own window read it. */
interface PageBack {
  /** From the press to its first animation frame after it, ms; null when none came. */
  firstTickMs: number | null;
  /** Frame and timer requests any of its scripts made while its tab was off screen (held, each waits); NaN when its page was gone. */
  hiddenCalls: number;
  /** Its animation frames and interval ticks while its tab was off screen; NaN when its page was gone. */
  hiddenTicks: number;
  hiddenTimers: number;
  /** The page's own long tasks from the press to its first animation frame after it: when after the press, and how long, ms. */
  longAfter: [number, number][];
  /** Its own long animation frames in the same span, each said whole (when after the press, its length, its rendering and style shares, its scripts). */
  longFramesAfter: string[];
  /** From the press to the pane's first reach into the frame to post (`watchPosts`), ms; null where unread (WebKit) or none came. */
  postMs: number | null;
  /** From the press to the pane's `cawco:release` reaching the page, ms; null when none came after the press. */
  releaseMs: number | null;
  /** Its document was replaced, or gone: the return loaded it again. */
  reloaded: boolean;
}

/** Pane `pane`'s preview frame; null while no page stands there. */
async function previewFrame(page: Page, pane: string): Promise<Frame | null> {
  const iframe = page
    .locator(`[data-slot="pane"][data-pane="${pane}"] iframe[title="Preview"]`)
    .first();
  // Read at once, never waited for: a busy tab has none, and its reach is timed.
  if ((await iframe.count()) === 0) {
    return null;
  }
  const src = await iframe
    .getAttribute("src", { timeout: 1000 })
    .catch(() => null);
  if (!src) {
    return null;
  }
  const { origin } = new URL(src);
  return (
    page
      .frames()
      .find(
        (one) => one !== page.mainFrame() && one.url().startsWith(origin)
      ) ?? null
  );
}

/** Pane `pane`'s preview page's window, read in its frame; null while no page stands there. */
async function clockOf(page: Page, pane: string): Promise<Clock | null> {
  const frame = await previewFrame(page, pane);
  if (!frame) {
    return null;
  }
  return frame
    .evaluate(() => {
      const own = window as unknown as {
        __calls?: number;
        __frames?: Clock["longFrames"];
        __long?: [number, number][];
        __releasedAt?: number;
        __tickAt?: number[];
        __ticks?: number;
        __timers?: number;
      };
      return {
        born: performance.timeOrigin,
        calls: own.__calls ?? 0,
        long: [...(own.__long ?? [])],
        longFrames: [...(own.__frames ?? [])],
        releasedAt: own.__releasedAt ?? 0,
        ticks: own.__ticks ?? 0,
        tickAt: [...(own.__tickAt ?? [])],
        timers: own.__timers ?? 0,
      };
    })
    .catch(() => null);
}

/** What the page's window said of a return pressed at `pressAt` (epoch ms). */
function pageBack(
  before: Clock | null,
  hidden: Clock | null,
  after: Clock | null,
  pressAt: number,
  posts: number[]
): PageBack {
  const posted = posts.find((at) => at >= pressAt);
  const kept = !!(before && hidden && hidden.born === before.born);
  const first = after?.tickAt.find((at) => at > pressAt);
  /** The span its own long tasks and frames are read in: from the press to its first frame. */
  const spanEnd = first ?? pressAt + WINDOW_MS;
  return {
    reloaded: !(before && after && after.born === before.born),
    hiddenTicks:
      kept && before && hidden ? hidden.ticks - before.ticks : Number.NaN,
    hiddenTimers:
      kept && before && hidden ? hidden.timers - before.timers : Number.NaN,
    hiddenCalls:
      kept && before && hidden ? hidden.calls - before.calls : Number.NaN,
    firstTickMs: first === undefined ? null : Math.round(first - pressAt),
    releaseMs:
      after && after.releasedAt > pressAt
        ? Math.round(after.releasedAt - pressAt)
        : null,
    postMs: posted === undefined ? null : Math.round(posted - pressAt),
    // An observer buffered and live can say a task twice: each once, by its start.
    longAfter: [
      ...new Map(
        (after?.long ?? [])
          .filter(([at]) => at >= pressAt && at <= spanEnd)
          .map(([at, ms]) => [at, ms])
      ),
    ].map(([at, ms]): [number, number] => [
      Math.round(at - pressAt),
      Math.round(ms),
    ]),
    longFramesAfter: [
      ...new Map(
        (after?.longFrames ?? [])
          .filter((frame) => frame.at >= pressAt && frame.at <= spanEnd)
          .map((frame) => [frame.at, frame])
      ).values(),
    ].map(
      (frame) =>
        `${frame.ms}ms at ${Math.round(frame.at - pressAt)}ms (rendering ${frame.render}ms, style and layout ${frame.style}ms; scripts: ${frame.scripts || "none"})`
    ),
  };
}

const pageLine = (back: PageBack) =>
  `its page ${back.reloaded ? "loaded again" : "kept"}; off screen ${back.hiddenTicks} animation frames and ${back.hiddenTimers} interval ticks, ${back.hiddenCalls} frame and timer requests; the pane reached into its frame ${back.postMs === null ? "unread" : `${back.postMs}ms after the press`}; its release reached it ${back.releaseMs === null ? "never" : `${back.releaseMs}ms after the press`}; its own long tasks before its first frame ${back.longAfter.map(([at, ms]) => `${ms}ms at ${at}ms`).join(", ") || "none"}, its long frames ${back.longFramesAfter.join("; ") || "none"}; its first animation frame ${back.firstTickMs === null ? "never came" : `${back.firstTickMs}ms after the press`}`;

/**
 * The heavy page: Rive's runtime and its wasm (compiled and instantiated at
 * load, `RuntimeLoader`), a generated script of `SCRIPT_FUNCTIONS`
 * functions run at load, and a canvas drawn every frame.
 */
async function heavyFolder(dir: string): Promise<void> {
  await cp(join(RIVE, "rive.js"), join(dir, "rive.js"));
  await cp(join(RIVE, "rive.wasm"), join(dir, "rive.wasm"));
  const fns = Array.from(
    { length: SCRIPT_FUNCTIONS },
    (_, i) =>
      `function f${i}(a){var s=0;for(var j=0;j<4;j++){s+=(a*${i}+j)%7;}return s+"${"x".repeat(24)}".length;}`
  );
  await writeFile(
    join(dir, "bundle.js"),
    `${fns.join("\n")}\nwindow.__ran=0;for(var i=0;i<${SCRIPT_FUNCTIONS};i++){window.__ran+=window["f"+i](i);}\n`
  );
  await writeFile(
    join(dir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><title>Heavy</title>
<style>html,body{margin:0;height:100%}canvas{width:100%;height:100%;display:block}</style></head>
<body><canvas id="c"></canvas>
<script src="./bundle.js"></script>
<script src="./rive.js"></script>
<script>
rive.RuntimeLoader.setWasmUrl("./rive.wasm");
rive.RuntimeLoader.awaitInstance().then(function () { window.__wasm = true; });
var c = document.getElementById("c"), g = c.getContext("2d");
window.__ticks = 0; window.__tickAt = []; window.__timers = 0; window.__releasedAt = 0;
setInterval(function () { window.__timers++; }, 100);
window.__calls = 0;
["requestAnimationFrame", "setTimeout", "setInterval"].forEach(function (name) {
  var own = window[name];
  window[name] = function () { window.__calls++; return own.apply(window, arguments); };
});
window.__long = [];
try {
  new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (entry) { window.__long.push([performance.timeOrigin + entry.startTime, entry.duration]); });
  }).observe({ type: "longtask", buffered: true });
} catch (e) {}
window.__frames = [];
try {
  new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (entry) {
      window.__frames.push({
        at: performance.timeOrigin + entry.startTime,
        ms: Math.round(entry.duration),
        render: Math.round(entry.renderStart ? entry.startTime + entry.duration - entry.renderStart : 0),
        style: Math.round(entry.styleAndLayoutStart ? entry.startTime + entry.duration - entry.styleAndLayoutStart : 0),
        scripts: (entry.scripts || []).map(function (s) { return s.invoker + " " + Math.round(s.duration) + "ms"; }).join("; ")
      });
    });
  }).observe({ type: "long-animation-frame", buffered: true });
} catch (e) {}
addEventListener("message", function (event) {
  if (event.data && event.data.type === "cawco:release") window.__releasedAt = performance.timeOrigin + performance.now();
});
(function draw(t) {
  window.__ticks++;
  window.__tickAt.push(performance.timeOrigin + performance.now());
  if (window.__tickAt.length > 600) window.__tickAt.shift();
  c.width = c.clientWidth; c.height = c.clientHeight;
  for (var k = 0; k < 200; k++) {
    g.fillStyle = "hsl(" + ((t / 10 + k * 7) % 360) + " 60% 60%)";
    g.fillRect((k * 37 + t / 5) % c.width, (k * 53) % c.height, 24, 24);
  }
  requestAnimationFrame(draw);
})(0);
</script></body></html>`
  );
}

/**
 * The mock's answers, each session told apart by the mark its first message
 * carries. Once `hold` is called, the busy session's live turns go only as a
 * leg lets them (`release`): every run, on any tree, is shown the same turns
 * at the same points, and nothing streams while a return is measured.
 */
function sceneModel() {
  const tag = crypto.randomUUID().slice(0, 6);
  const mark = (name: string) => `tab-return ${name} ${tag}`;
  const counts: { busy?: number } = {};
  /** The last busy request let through; null while the turns run freely. */
  const pace: { upTo: number | null; open: (() => void) | null } = {
    upTo: null,
    open: null,
  };
  const turn = () =>
    new Promise<void>((resolve) => {
      pace.open = resolve;
    });
  /** The busy session's `n`th turn: seeded fast, then live (30 words at 40ms, a second's tool), once its leg lets it. */
  const busyTurn = async (n: number): Promise<Reply> => {
    const live = n > SEED;
    while (live && pace.upTo !== null && n > pace.upTo) {
      await turn();
    }
    const id = String(n).padStart(5, "0");
    return {
      everyMs: live ? 40 : 1,
      words:
        live || n % 3 === 0
          ? Array.from(
              { length: live ? 30 : 4 },
              (_, i) => `${i === 0 ? `busy ${id}: ` : ""}w${i} `
            )
          : [],
      tool: {
        name: "Bash",
        input: {
          command: `${live ? "sleep 1; " : ""}seq -f 'busy ${id} line %g' ${OUTPUT_LINES}`,
          description: `Print busy ${id}`,
        },
      },
    };
  };
  const respond = (request: Seen): Reply | Promise<Reply> => {
    if (!request.tools) {
      return { everyMs: 1, words: ["Tab return"] };
    }
    if (request.all.includes(mark("busy"))) {
      const n = (counts.busy ?? 0) + 1;
      counts.busy = n;
      return busyTurn(n);
    }
    return { everyMs: 5, words: ["Done."] };
  };
  /** From now on a busy turn waits for its leg. */
  const hold = () => {
    pace.upTo = counts.busy ?? 0;
  };
  /** Lets `turns` more busy turns run, and answers once each has run whole: its tool's output sent back, the next turn waiting. */
  const release = async (turns: number) => {
    const upTo = (pace.upTo ?? 0) + turns;
    pace.upTo = upTo;
    const began = Date.now();
    while ((counts.busy ?? 0) <= upTo && Date.now() - began < RELEASE_MS) {
      pace.open?.();
      await Bun.sleep(50);
    }
    if ((counts.busy ?? 0) <= upTo) {
      throw new Error(
        `tab-return: ${turns} busy turns did not run within ${RELEASE_MS / 1000}s`
      );
    }
  };
  return { counts, hold, mark, release, respond };
}

/** The pane's frame for `id` and the press's input, the reach first, as two-pane-perf's `point`. */
async function pointAt(page: Page, input: CDPSession, id: string) {
  const tab = page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first();
  await tab.scrollIntoViewIfNeeded();
  const box = await tab.boundingBox();
  if (!box) {
    throw new Error("tab-return: a tab to switch to has no box");
  }
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const mouse = (type: "mouseMoved" | "mousePressed" | "mouseReleased") =>
    input.send("Input.dispatchMouseEvent", {
      type,
      ...at,
      button: type === "mouseMoved" ? "none" : "left",
      buttons: type === "mousePressed" ? 1 : 0,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
  return {
    reach: () => mouse("mouseMoved"),
    press: async () => {
      await mouse("mousePressed");
      await mouse("mouseReleased");
    },
  };
}

/** A switch nobody measures: the tab's own click, the pointer parked off the strip. */
async function away(page: Page, id: string): Promise<void> {
  await page.mouse.move(0, 0);
  await page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first()
    .evaluate((el) => (el as HTMLElement).click());
}

/**
 * In the dashboard's own document: when the pane reaches into a preview's
 * frame to post to it (its `contentWindow`, epoch ms), so a return says how
 * long the pane took to send its release, apart from how long it took to
 * reach the page.
 */
function watchPosts(): void {
  if (window.top !== window) {
    return;
  }
  const posts: number[] = [];
  (window as unknown as { __posts: number[] }).__posts = posts;
  const own = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentWindow"
  );
  if (!own?.get) {
    return;
  }
  const read = own.get;
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
    ...own,
    get(this: HTMLIFrameElement) {
      if (this.title === "Preview") {
        posts.push(performance.timeOrigin + performance.now());
      }
      return read.call(this);
    },
  });
}

/**
 * In the dashboard's own document: every size a ResizeObserver is told of a
 * list item (virtua's `[data-item]`), by its row's key and its pane, with
 * when (epoch ms) and the size it last reported for that item, so a return
 * says whether a row changed size while its pane was laid out and its rows
 * staged (`stagingOf`). Read from the entries virtua is handed: nothing
 * here reads the page's layout.
 */
function watchSizes(): void {
  if (window.top !== window) {
    return;
  }
  const seen: { at: number; key: string; pane: string; was: number | null; px: number }[] = [];
  const last = new WeakMap<Element, number>();
  const w = window as unknown as {
    __sizes: typeof seen;
    __lastSize: (el: Element) => number | null;
  };
  w.__sizes = seen;
  w.__lastSize = (el) => last.get(el) ?? null;
  const Own = window.ResizeObserver;
  window.ResizeObserver = class extends Own {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        for (const entry of entries) {
          const el = entry.target;
          if (el instanceof HTMLElement && el.hasAttribute("data-item")) {
            const px = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
            seen.push({
              at: performance.timeOrigin + performance.now(),
              key: el.querySelector<HTMLElement>(":scope > [data-row]")?.dataset.row ?? "?",
              pane: el.closest<HTMLElement>("[data-pane]")?.dataset.pane ?? "?",
              was: last.get(el) ?? null,
              px,
            });
            last.set(el, px);
          }
        }
        callback(entries, observer);
      });
    }
  };
}

/** What pane `pane`'s list items last reported (`watchSizes`), by key: the sizes before a reach. Attributes and the watch alone. */
const itemSizesOf = (page: Page, pane: string) =>
  page.evaluate((id) => {
    const w = window as unknown as { __lastSize?: (el: Element) => number | null };
    const sizes: Record<string, number | null> = {};
    for (const item of document.querySelectorAll(
      `[data-slot="pane"][data-pane="${CSS.escape(id)}"] [data-item]`
    )) {
      const key = item.querySelector<HTMLElement>(":scope > [data-row]")?.dataset.row;
      if (key) {
        sizes[key] = w.__lastSize?.(item) ?? null;
      }
    }
    return sizes;
  }, pane);

/**
 * The sizes virtua's observer was told of pane `pane`'s items from `from`
 * to `to` (epoch ms, `watchSizes`): how many, which differ from the size the
 * item had before the reach (`before`), and those with no size before.
 */
async function sizesTold(
  page: Page,
  pane: string,
  before: Record<string, number | null>,
  from: number,
  to: number
): Promise<{ changes: number; line: string }> {
  const sizes = (
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __sizes?: {
              at: number;
              key: string;
              pane: string;
              was: number | null;
              px: number;
            }[];
          }
        ).__sizes ?? []
    )
  ).filter((one) => one.pane === pane && one.at >= from && one.at < to);
  // A size virtua had measured before the reach; a row it never measured
  // has none, and what it is told of that row is its first measurement.
  const hadOf = (one: { key: string }) => before[one.key] ?? null;
  const changed = sizes.filter((one) => {
    const had = hadOf(one);
    return had !== null && Math.abs(one.px - had) > 0.5;
  });
  const unmeasured = sizes.filter((one) => hadOf(one) === null);
  const which = changed
    .slice(0, 6)
    .map(
      (one) =>
        `${one.key.slice(0, 16)} ${hadOf(one)}→${one.px}px at ${Math.round(one.at - to)}ms`
    )
    .join(", ");
  const rows = Object.keys(before).length;
  const never = Object.values(before).filter((one) => one === null).length;
  return {
    changes: changed.length,
    line: `${rows} rows mounted before the reach (${never} never measured); ${sizes.length} item sizes told from the reach to the press, ${changed.length} of them a change from the size before${which ? ` (${which})` : ""}, ${unmeasured.length} first measurements of rows never measured`,
  };
}

/**
 * Pane `pane` once its return's window is over: any element in it with an
 * inline `content-visibility` or computing it `hidden`, and each row in its
 * view whose first text has no box; with each row still mounted whose box
 * differs from the size it had before the reach (`before`).
 */
const shownStateOf = (
  page: Page,
  pane: string,
  before: Record<string, number | null>
) =>
  page.evaluate(
    ([id, scroller, was]) => {
      const box = document.querySelector<HTMLElement>(
        `[data-slot="pane"][data-pane="${CSS.escape(id)}"]`
      );
      if (!box) {
        return null;
      }
      const all = [...box.querySelectorAll<HTMLElement>("*")];
      const inline = all.filter((el) => el.style.contentVisibility).length;
      const computed = all.filter(
        (el) => getComputedStyle(el).contentVisibility === "hidden"
      ).length;
      const view = box
        .querySelector<HTMLElement>(scroller)
        ?.getBoundingClientRect();
      const inView = (row: HTMLElement) => {
        const rect = row.getBoundingClientRect();
        return (
          !!view &&
          rect.height > 0 &&
          rect.bottom > view.top &&
          rect.top < view.bottom
        );
      };
      // Its first text that is not blank, and whether it has a box.
      const draws = (row: HTMLElement) => {
        const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) =>
            node.textContent?.trim()
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP,
        });
        const text = walk.nextNode();
        if (!text) {
          return false;
        }
        const range = document.createRange();
        range.selectNodeContents(text);
        const r = range.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const shownRows = [
        ...box.querySelectorAll<HTMLElement>("[data-row]"),
      ].filter(inView);
      const rows = shownRows.length;
      const blank = shownRows.filter((row) => !draws(row)).length;
      // Each item measured before the reach, and whether its box is that size now.
      const sized = [...box.querySelectorAll<HTMLElement>("[data-item]")]
        .map((item) => {
          const key = item.querySelector<HTMLElement>(":scope > [data-row]")
            ?.dataset.row;
          return { item, had: key ? (was[key] ?? null) : null };
        })
        .filter((one) => one.had !== null);
      const kept = sized.length;
      const moved = sized.filter(
        ({ item, had }) =>
          Math.abs(item.getBoundingClientRect().height - (had ?? 0)) > 0.5
      ).length;
      return { inline, computed, rows, blank, kept, moved };
    },
    [pane, SCROLLER, before] as const
  );

/**
 * In the dashboard's own document on WebKit, which reports no long tasks:
 * every gap of more than 50 ms in a 16 ms timer on its thread (its start,
 * epoch ms, and its length), where a task held the thread.
 */
function watchGaps(): void {
  if (window.top !== window) {
    return;
  }
  const gaps: [number, number][] = [];
  (window as unknown as { __gaps: [number, number][] }).__gaps = gaps;
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (now - last > 50) {
      gaps.push([performance.timeOrigin + last, now - last]);
    }
    last = now;
  }, 16);
}

/**
 * Where pane `pane`'s transcript stands, read once a return's window is
 * over: its scroll offset against its end, and the first row in its view,
 * by its words and how far its top stands from the view's.
 */
function landingOf(page: Page, pane: string): Promise<string> {
  return page.evaluate(
    ([scroller, id]) => {
      const box = document.querySelector<HTMLElement>(
        `[data-slot="pane"][data-pane="${CSS.escape(id)}"] ${scroller}`
      );
      if (!box) {
        return "no transcript";
      }
      const view = box.getBoundingClientRect();
      const [first] = [...box.querySelectorAll<HTMLElement>("[data-row]")]
        .map((row) => ({ row, rect: row.getBoundingClientRect() }))
        .filter(({ rect }) => rect.height > 0 && rect.bottom > view.top)
        .sort((a, b) => a.rect.top - b.rect.top);
      const words = (first?.row.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 48);
      return `scrollTop ${box.scrollTop} of ${box.scrollHeight - box.clientHeight} (${box.scrollHeight - box.clientHeight - box.scrollTop}px off its end); first row in view "${words}", its top ${first ? Math.round(first.rect.top - view.top) : "none"}px from the view's`;
    },
    [SCROLLER, pane] as const
  );
}

/** The dashboard's reaches into a preview's frame (`watchPosts`), epoch ms. */
const postsOf = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __posts?: number[] }).__posts ?? []
  );

const costOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cost: Cost }).__cost);

/**
 * Marks `two-pane:warm:0` in the task that warms pane `pane` (PaneLeaf
 * `data-pane-settling` set, warm.svelte.ts): an attribute observer's
 * callback runs in the microtasks of the task whose change it reports.
 */
function markWarm(page: Page, pane: string): Promise<void> {
  return page.evaluate((id) => {
    const w = window as unknown as { __warmWatch?: MutationObserver };
    w.__warmWatch?.disconnect();
    const box = document.querySelector(
      `[data-slot="pane"][data-pane="${CSS.escape(id)}"]`
    );
    if (!box) {
      return;
    }
    const watch = new MutationObserver(() => {
      if (box.hasAttribute("data-pane-settling")) {
        performance.mark("two-pane:warm:0");
        watch.disconnect();
      }
    });
    w.__warmWatch = watch;
    watch.observe(box, {
      attributes: true,
      attributeFilter: ["data-pane-settling"],
    });
  }, pane);
}

/**
 * The reach task among the tasks before the press: the longer of the one
 * that warms the pane (holding the `two-pane:warm:0` mark `markWarm` makes,
 * trace clock `warmAt`) and the first after it that restyles, the frame
 * that lays the pane out.
 */
function reachTaskOf(
  tasks: MainTask[],
  warmAt: number | undefined
): MainTask | null {
  const at =
    warmAt === undefined
      ? -1
      : tasks.findIndex((task) => task.at <= warmAt && warmAt <= task.end);
  if (at < 0) {
    return null;
  }
  const laysOut = tasks.slice(at + 1).find((task) => task.restyled > 0);
  const warms = tasks[at];
  return laysOut && laysOut.cpu > warms.cpu ? laysOut : warms;
}

/**
 * One return to `id` by the pointer, traced: reach, rest, press, and the
 * window after it (`waitFor`, when given, holds it open until it answers or
 * `READY_MS`, then `AFTER_READY_MS` more).
 */
async function measureBack(
  page: Page,
  input: CDPSession,
  id: string,
  waitFor?: () => Promise<boolean>,
  rest = REACH_MS
): Promise<Read> {
  const point = await pointAt(page, input, id);
  const held = await census(page);
  const sizesBefore = await itemSizesOf(page, id);
  await markWarm(page, id);
  let reachEpoch = 0;
  let skippedAtPress = 0;
  await page.evaluate(() => {
    const w = window as unknown as {
      __inserted: number;
      __insertWatch?: MutationObserver;
    };
    w.__insertWatch?.disconnect();
    w.__inserted = 0;
    w.__insertWatch = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            w.__inserted += 1 + node.querySelectorAll("*").length;
          }
        }
      }
    });
    w.__insertWatch.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
  let madeAt = 0;
  let origin = 0;
  const main = await traceMain(
    page,
    async () => {
      // The trace's CPU profiler starts in an idle isolate at its next script:
      // a held out-of-process preview's first is its release, where starting
      // (every compiled function logged) took ~500 ms of its thread. A script
      // run there now, before the reach is counted, keeps that off the return.
      await (
        await previewFrame(page, id)
      )
        ?.evaluate(() => 0)
        .catch(() => undefined);
      reachEpoch = await page.evaluate(() => {
        performance.mark("two-pane:reach:0");
        return performance.timeOrigin + performance.now();
      });
      await point.reach();
      await page.waitForTimeout(rest);
      origin = await page.evaluate(() => performance.timeOrigin);
      [madeAt, skippedAtPress] = await page.evaluate((pane) => {
        const drawn = () => {
          const box = document.querySelector(
            `[data-slot="pane"][data-pane="${CSS.escape(pane)}"]`
          );
          return (
            box !== null &&
            !box.matches("[data-pane-hidden], [data-pane-settling]")
          );
        };
        const began = performance.now();
        const look = () => {
          if (drawn()) {
            performance.mark("two-pane:shown:0");
          } else if (performance.now() - began < 2000) {
            requestAnimationFrame(look);
          }
        };
        performance.mark("two-pane:switch:0");
        requestAnimationFrame(look);
        // The rows still staged as the press comes: an inline skip, read off the attribute alone.
        const staged = document.querySelectorAll(
          `[data-slot="pane"][data-pane="${CSS.escape(pane)}"] [data-item][style*="content-visibility"]`
        ).length;
        return [performance.now(), staged] as const;
      }, id);
      await point.press();
      await page.waitForTimeout(WINDOW_MS);
      if (waitFor) {
        const began = Date.now();
        while (!(await waitFor()) && Date.now() - began < READY_MS) {
          await page.waitForTimeout(250);
        }
        await page.waitForTimeout(AFTER_READY_MS);
      }
      await page.evaluate(() => performance.mark("two-pane:end"));
    },
    // Sampled too, so each heavy task names the script it ran (`heavy`).
    { profile: true, restyles: true }
  );
  const markAt = (name: string) =>
    main.marks.find((one) => one.name === name)?.at;
  const reachAt = markAt("two-pane:reach:0") ?? 0;
  const madeMark = markAt("two-pane:switch:0") ?? 0;
  const own = main.tasks.filter((task) => task.at >= reachAt);
  const longestOf = (tasks: MainTask[]) =>
    tasks.reduce<MainTask | null>(
      (most, task) => (most && most.cpu >= task.cpu ? most : task),
      null
    );
  const longest = longestOf(own);
  const beforePress = own.filter((task) => task.at < madeMark);
  const reach = longestOf(beforePress);
  const warmed = reachTaskOf(beforePress, markAt("two-pane:warm:0"));
  /** A task said whole: what it ran, when, its CPU and restyle, what scheduled it, its sampled stacks. */
  const taskLine = (task: MainTask) =>
    `${task.ran}, ${Math.round((task.at - madeMark) / 1000)}ms after the press: ${task.cpu.toFixed(1)}ms of CPU, ${task.restyled} elements in ${Math.round(task.styleMs)}ms of style; scheduled by ${
      task.scheduled.map(([what, n]) => `${what} ${n}x`).join("; ") ||
      "nothing traced"
    }; its stacks: ${main
      .stacksIn(task.at, task.end)
      .filter(([stack]) => stack !== "(idle)")
      .slice(0, 8)
      .map(([stack, ms]) => `${stack} ${ms.toFixed(1)}ms`)
      .join(" || ")}`;
  const pressEpoch = origin + madeAt;
  const told = await sizesTold(page, id, sizesBefore, reachEpoch, pressEpoch);
  const staging = `${skippedAtPress} rows still staged as the press came; ${told.line}`;
  const settled = await shownStateOf(page, id, sizesBefore);
  const shown = settled
    ? `${settled.inline} elements with an inline content-visibility, ${settled.computed} computing it hidden; ${settled.rows} rows in view, ${settled.blank} of them with no box on their first text; ${settled.kept} rows measured before the reach still mounted, ${settled.moved} of them a different height now`
    : "no pane";
  const inserted = await page.evaluate(() => {
    const w = window as unknown as {
      __inserted: number;
      __insertWatch?: MutationObserver;
    };
    w.__insertWatch?.disconnect();
    return w.__inserted;
  });
  const cost = await costOf(page);
  const [press] = inputsOf(cost.events, [madeAt]);
  const inputMs = Number(LENGTH.exec(press ?? "")?.[1] ?? 0);
  const [worst] = cost.frames
    .filter(([at]) => at >= madeAt)
    .sort((a, b) => b[1] - a[1]);
  const after = longest
    ? Math.round((longest.at - madeMark) / 1000)
    : Number.NaN;
  return {
    held,
    inserted,
    input: press ?? "none reported",
    inputMs,
    pressAt: origin + madeAt,
    elsewhere:
      main
        .elsewhere(madeMark, madeMark + ELSEWHERE_MS * 1000)
        .slice(0, 16)
        .map(([name, ms]) => `${name} ${ms.toFixed(1)}ms`)
        .join(", ") || "nothing",
    traced: true,
    longest: Math.round(longest?.cpu ?? 0),
    longestWhat: longest
      ? `${longest.ran}, ${after}ms after the press: ${longest.restyled} elements in ${Math.round(longest.styleMs)}ms of style, ${Math.round(longest.layoutMs)}ms of layout [${longest.passes
          .filter((pass) => pass.ms >= 0.5)
          .map(
            (pass) =>
              `${pass.name === "Layout" ? "layout" : "style"} ${pass.elements || ""} ${pass.ms.toFixed(1)}ms by ${pass.at}${pass.root ? ` from a ${pass.root} root` : ""}`
          )
          .join("; ")}]; asked for by ${
          longest.invalidated
            .slice(0, 8)
            .map(([what, n]) => `${what} ${n}x`)
            .join("; ") || "nothing traced"
        }; its other phases: ${
          longest.rendering
            .map(([what, ms]) => `${what} ${ms.toFixed(1)}ms`)
            .join("; ") || "none"
        }`
      : "nothing",
    shown,
    shownCounts: settled
      ? [settled.inline, settled.computed, settled.rows, settled.blank]
      : [],
    staging,
    sizeChanges: told.changes,
    stagedAtPress: skippedAtPress,
    reach: Math.round(reach?.cpu ?? 0),
    reachWhat: reach ? taskLine(reach) : "nothing",
    warmTask: warmed ? warmed.cpu : Number.NaN,
    warmWhat: warmed ? taskLine(warmed) : "no warm traced",
    heavy:
      own
        .filter((task) => task.cpu >= HEAVY_MS)
        .map(
          (task) =>
            `${Math.round((task.at - madeMark) / 1000)}ms ${task.ran} ${task.cpu.toFixed(0)}ms (${task.restyled} restyled, ${Math.round(task.styleMs)}ms style, ${Math.round(task.layoutMs)}ms layout; ${main
              .selfTime(task.at, task.end)
              .filter(([fn]) => fn !== "(idle)")
              .slice(0, 4)
              .map(([fn, ms]) => `${fn} ${ms.toFixed(1)}ms`)
              .join(", ")})`
        )
        .join("; ") || "none",
    work: workOf(own, markAt)[0] ?? null,
    worstFrame: worst
      ? `${Math.round(worst[1])}ms frame ${Math.round(worst[0] - madeAt)}ms after the press: ${worst[2]}`
      : "no long frame",
  };
}

/** One return to `id` on WebKit, which has no trace: the tab's click, timed by the dashboard's clock, and the window after it. */
async function clickBack(
  page: Page,
  id: string,
  waitFor?: () => Promise<boolean>
): Promise<Read> {
  const pressAt = await page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first()
    .evaluate((el) => {
      const at = performance.timeOrigin + performance.now();
      (el as HTMLElement).click();
      return at;
    });
  await page.waitForTimeout(WINDOW_MS);
  if (waitFor) {
    const began = Date.now();
    while (!(await waitFor()) && Date.now() - began < READY_MS) {
      await page.waitForTimeout(250);
    }
  }
  // WebKit reports no long tasks: the gaps in a 16 ms timer on the dashboard's thread stand for them (`watchGaps`).
  const gaps = (
    await page.evaluate(
      () => (window as unknown as { __gaps?: [number, number][] }).__gaps ?? []
    )
  ).filter(([at, ms]) => at + ms >= pressAt && at <= pressAt + WINDOW_MS);
  const [worstAt, worstMs] = gaps.reduce<[number, number]>(
    (most, gap) => (gap[1] > most[1] ? gap : most),
    [pressAt, 0]
  );
  return {
    held: "not read",
    heavy: "not traced",
    input: "a click, not traced",
    inputMs: 0,
    inserted: 0,
    longest: 0,
    longestWhat: `not traced; the dashboard's thread stood still at most ${Math.round(worstMs)}ms, ${Math.round(worstAt - pressAt)}ms after the press (its longest timer gap)`,
    pressAt,
    elsewhere: "not traced",
    reach: 0,
    reachWhat: "not traced",
    warmTask: Number.NaN,
    warmWhat: "not traced",
    shown: "not read",
    shownCounts: [],
    staging: "not read",
    sizeChanges: 0,
    stagedAtPress: 0,
    traced: false,
    work: null,
    worstFrame: "not traced",
  };
}

/**
 * A busy return's staging (Transcript `parkRows`): no row changed size from
 * the reach to the press, nothing left skipped once shown with every row in
 * view drawing its text, the reach's longest task within `REACH_TASK_MS`
 * (a press with its rows still staged, 1c, carries the staging in its own
 * window instead), and 1c's press came while rows were staged.
 */
function checkStaging(kit: Kit, back: Back): void {
  if (!(back.traced && back.kind === "busy")) {
    return;
  }
  kit.check(
    `${back.scene}: from the reach to the press no row's size changed (virtua's observer told the size each item had before)`,
    back.sizeChanges === 0,
    back.staging
  );
  const [inline, computed, rows, blank] = back.shownCounts;
  kit.check(
    `${back.scene}: once shown nothing in the pane is skipped (no inline content-visibility, none computing it hidden) and every row in view draws its text`,
    inline === 0 && computed === 0 && rows > 0 && blank === 0,
    back.shown
  );
  if (back.scene.startsWith("1c")) {
    kit.check(
      `${back.scene}: the press came while rows were still staged`,
      back.stagedAtPress > 0,
      back.staging
    );
    return;
  }
  kit.check(
    `${back.scene}: the reach task (its warm and the frame laying the pane out) within ${REACH_TASK_MS}ms of CPU (${REACH_TASK_MS * SLOWER}ms ${SLOWER}x slower)`,
    back.warmTask <= REACH_TASK_MS,
    back.warmWhat.slice(0, 600)
  );
}

const run = async (kit: Kit) => {
  const pressure = pressureFile();
  const folder = join(kit.out, "heavy");
  await mkdir(folder, { recursive: true });
  await heavyFolder(folder);
  const scene = sceneModel();
  const fleet = await kit.fleet(scene.respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const front = await fleet.spawn("claude", "Quiet");
  await fleet.send(front, `${scene.mark("front")}: hello.`);
  const busy = await fleet.spawn("claude", "Busy");
  await fleet.send(busy, `${scene.mark("busy")}: go.`);
  const previewed = await fleet.spawn("claude", "Heavy preview", fleet.repo);
  await fleet.api(`/api/instances/${previewed}/artifacts`, {
    kind: "preview",
    name: "heavy",
    dir: folder,
  });
  // The bound's other places: a page each, loaded once its tab is shown.
  const lights: string[] = [];
  for (const name of ["light-a", "light-b"]) {
    const light = await fleet.spawn("claude", `Light ${name}`, fleet.repo);
    await fleet.api(`/api/instances/${light}/artifacts`, {
      kind: "page",
      name,
      html: `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body><p>${name}</p></body></html>`,
    });
    lights.push(light);
  }
  await until(
    `${SEED} calls in the busy session`,
    () => scene.counts,
    (c) => (c.busy ?? 0) > SEED + 5,
    30 * 60_000
  );
  scene.hold();
  const base = await fleet.dashboard();
  /**
   * The dashboard at the desk on `tabs`, `shown` in front once each tab
   * has been drawn and the preview's page has loaded, as the owner had it.
   * On WebKit, no trace and no cost watch: its returns are clicks.
   */
  const desk = async (
    tabs: string[],
    shown: string,
    engine: "chromium" | "one-process" | "webkit"
  ) => {
    const page = await kit.page(
      "desk",
      engine === "webkit"
        ? { engine: "webkit", init: [watchGaps] }
        : {
            init: [watchCost, watchPosts, watchSizes],
            oneProcess: engine === "one-process",
          }
    );
    await page.addInitScript(
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
      [tabs, shown] as const
    );
    await open(
      page,
      `${base}/session/${shown}`,
      `${SCROLLER} [data-row]`,
      120_000
    );
    const readyOf = (pane: string) => () =>
      page
        .locator(
          `[data-slot="pane"][data-pane="${pane}"] iframe[title="Preview"][data-ready]`
        )
        .count()
        .then((n) => n > 0);
    const ready = readyOf(previewed);
    await away(page, previewed);
    await until("the heavy page loaded", ready, Boolean, 120_000);
    await page.waitForTimeout(3000);
    await away(page, shown);
    await page.waitForTimeout(3000);
    return {
      page,
      input:
        engine === "webkit" ? null : await page.context().newCDPSession(page),
      ready,
      readyOf,
    };
  };
  type Desk = Awaited<ReturnType<typeof desk>>;
  /** The two light tabs shown in turn, each until its page is ready, then the quiet one: the heavy page is the third hidden, hidden longest. */
  const pastBound = async (on: Desk) => {
    for (const light of lights) {
      await away(on.page, light);
      await until(
        "a light page loaded",
        on.readyOf(light),
        Boolean,
        LIGHT_READY_MS
      );
      await on.page.waitForTimeout(1000);
    }
    await away(on.page, front);
    await on.page.waitForTimeout(SHORT_MS);
  };
  const isolated = await desk(
    [front, busy, previewed, ...lights],
    busy,
    "chromium"
  );

  const backs: Back[] = [];
  /**
   * One return to `to`: a busy tab's, a kept preview's (the quiet tab in
   * front for `absence`), or a preview's past the bound (`pastBound`). A
   * preview's page's window is read as the switch away has settled, just
   * before the return and after it.
   */
  const leg = async (
    on: Desk,
    name: string,
    to: string,
    kind: Back["kind"],
    absence = SHORT_MS,
    rest = REACH_MS
  ) => {
    const { page, input, ready } = on;
    const got: { read?: Read; page?: PageBack } = {};
    const turns = kind === "busy" ? Math.round(absence / TURN_MS) : 0;
    const psi = await quietLeg(name, pressure, async () => {
      let before: Clock | null = null;
      if (kind === "past") {
        before = await clockOf(page, to);
        await pastBound(on);
      } else {
        await away(page, front);
        const began = Date.now();
        await page.waitForTimeout(SETTLE_MS);
        before = kind === "kept" ? await clockOf(page, to) : null;
        // Away from the busy tab, its session runs the absence's turns, landed before the return.
        if (turns > 0) {
          await scene.release(turns);
          await page.waitForTimeout(LANDED_MS);
        }
        await page.waitForTimeout(Math.max(0, absence - (Date.now() - began)));
      }
      const hidden = kind === "busy" ? null : await clockOf(page, to);
      const waitFor = kind === "past" ? ready : undefined;
      got.read = input
        ? await measureBack(page, input, to, waitFor, rest)
        : await clickBack(page, to, waitFor);
      if (kind !== "busy") {
        got.page = pageBack(
          before,
          hidden,
          await clockOf(page, to),
          got.read.pressAt,
          await postsOf(page)
        );
      }
    });
    if (!got.read) {
      throw new Error(`tab-return: ${name} read nothing`);
    }
    // Its turns held, nothing moves the busy transcript after its window.
    const landing = kind === "busy" ? await landingOf(page, to) : undefined;
    const back: Back = {
      scene: name,
      kind,
      psi,
      ...got.read,
      ...(got.page ? { page: got.page } : {}),
      ...(landing ? { landing } : {}),
    };
    backs.push(back);
    kit.note(
      `${name}: ${back.psi} | ${turns} busy turns while away, ${back.inserted} elements inserted from the reach on | ${back.page ? `${pageLine(back.page)} | ` : ""}${back.landing ? `landed: ${back.landing} | ` : ""}longest task ${back.longest}ms of CPU (${back.longest * SLOWER}ms ${SLOWER}x slower), ${back.longestWhat} | the reach task (its warm and the frame laying the pane out) ${Number.isNaN(back.warmTask) ? "not traced" : `${back.warmTask.toFixed(1)}ms`}: ${back.warmWhat} | the longest from the reach to the press ${back.reach}ms: ${back.reachWhat} | staging: ${back.staging} | once shown: ${back.shown} | tasks of ${HEAVY_MS}ms or more, by when after the press: ${back.heavy} | input to the shown frame: ${back.work ? workLine([back.work]) : "no switch read"} | the press: ${back.input} | other renderers in the second after the press: ${back.elsewhere} | the longest ${back.worstFrame} | as the pointer came: ${back.held}`
    );
  };
  await leg(isolated, `1a: busy, back after ${SHORT_MS / 1000}s`, busy, "busy");
  await leg(
    isolated,
    `1c: busy, back after ${SHORT_MS / 1000}s, pressed ${PRESS_IN_STAGING_MS}ms after the reach, its rows still staged`,
    busy,
    "busy",
    SHORT_MS,
    PRESS_IN_STAGING_MS
  );
  await leg(
    isolated,
    `1b: busy, back after ${BACKLOG_MS / 60_000} min`,
    busy,
    "busy",
    BACKLOG_MS
  );
  await leg(
    isolated,
    `2a: preview, back after ${SHORT_MS / 1000}s (kept, held)`,
    previewed,
    "kept"
  );
  await leg(isolated, "2b: preview, back past the bound", previewed, "past");
  await isolated.page.close();
  // Scene 2 again with the preview's page on the dashboard's own thread:
  // every WebKit, and Chromium where it does not isolate the preview's site.
  const shared = await desk(
    [front, previewed, ...lights],
    front,
    "one-process"
  );
  const browser = shared.page.context().browser();
  const frameSrc = await shared.page
    .locator(
      `[data-slot="pane"][data-pane="${previewed}"] iframe[title="Preview"]`
    )
    .first()
    .getAttribute("src");
  const origin = frameSrc ? new URL(frameSrc).origin : "";
  const cdp = browser ? await browser.newBrowserCDPSession() : null;
  const { targetInfos } = cdp
    ? ((await cdp.send("Target.getTargets")) as {
        targetInfos: { type: string; url: string }[];
      })
    : { targetInfos: [] };
  await cdp?.detach();
  const ownProcess = targetInfos.filter(
    (one) => one.type === "iframe" && one.url.startsWith(origin)
  ).length;
  kit.check(
    "2c, 2d, 2e: the preview's page runs in the dashboard's process (no out-of-process frame on its origin)",
    !!origin && ownProcess === 0,
    `origin ${origin || "none"}, ${ownProcess} out-of-process frames on it`
  );
  await leg(
    shared,
    `2c: preview in the dashboard's process, back after ${SHORT_MS / 1000}s (kept, held)`,
    previewed,
    "kept"
  );
  await leg(
    shared,
    `2e: preview in the dashboard's process, hidden ${HELD_MS / 1000}s, held`,
    previewed,
    "kept",
    HELD_MS
  );
  await leg(
    shared,
    "2d: preview in the dashboard's process, back past the bound",
    previewed,
    "past"
  );
  await shared.page.close();
  // The kept returns on WebKit, which runs every frame on the dashboard's thread.
  const webkit = await desk([front, previewed, ...lights], front, "webkit");
  await leg(
    webkit,
    `2c (WebKit): preview, back after ${SHORT_MS / 1000}s (kept, held)`,
    previewed,
    "kept"
  );
  await leg(
    webkit,
    `2e (WebKit): preview, hidden ${HELD_MS / 1000}s, held`,
    previewed,
    "kept",
    HELD_MS
  );
  await writeFile(
    join(kit.out, "numbers.json"),
    `${JSON.stringify(backs, null, 2)}\n`
  );
  for (const back of backs) {
    checkStaging(kit, back);
    // Past the bound a return loads the page again, and in the dashboard's
    // process its load is the dashboard's task: that page's own weight,
    // noted above, not the return's.
    if (back.traced && back.kind !== "past") {
      kit.check(
        `${back.scene}: no task longer than two frames' budget (${2 * LONG_TASK_MS}ms) on a CPU ${SLOWER}x slower`,
        back.longest * SLOWER <= 2 * LONG_TASK_MS,
        `the longest ${back.longest}ms of CPU, ${back.longest * SLOWER}ms slower; ${back.longestWhat.slice(0, 300)}`
      );
    }
    if (back.traced) {
      kit.check(
        `${back.scene}: the press paints within ${INPUT_MS}ms`,
        back.inputMs < INPUT_MS,
        back.input
      );
    }
    const { page } = back;
    if (back.kind === "kept" && page) {
      kit.check(
        `${back.scene}: the page is the one it was, held off screen (no animation frame or timer of its ran), and its first animation frame comes within ${BACK_MS}ms of the press`,
        !page.reloaded &&
          page.hiddenTicks === 0 &&
          page.hiddenTimers === 0 &&
          page.firstTickMs !== null &&
          page.firstTickMs <= BACK_MS,
        pageLine(page)
      );
    }
    if (back.kind === "past" && page) {
      kit.check(
        `${back.scene}: off screen past the bound its page was let go, and it loads again with its tab`,
        Number.isNaN(page.hiddenTicks) && page.reloaded,
        pageLine(page)
      );
    }
  }
};

const spec: Spec = { name: "tab-return", run };
export default spec;
