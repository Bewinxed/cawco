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
 *    WebKit, without a trace, each a person's press: c and e the pointer's,
 *    and f (as c) the strip's arrow key, from the keyboard's focus resting
 *    on the tab before it, whose reach let its neighbours' previews go
 *    (warm.svelte.ts `besides`). g is f on the one-process Chromium, which
 *    reports the key's Event Timing; h is f with no rest, the first arrow
 *    into the strip, its first frame said and not bound. Then the keyboard's
 *    reach is read whole (`keyReach`), and two arrow keys in one task each
 *    choose their tab.
 * 3. A session with nothing said yet (the preview's, the light ones') shown
 *    in turn, on Chromium and on WebKit: its blank state, never a skeleton
 *    (a skeleton that never went kept its pane laid out and its sweep
 *    running); then all put away, every loop in their panes held.
 *
 * Each Chromium return is a pointer's switch, as two-pane-perf's `point`
 * makes it (the pointer comes onto the tab, rests `REACH_MS`, presses),
 * read off a DevTools trace by thread clock: the longest task from the
 * reach to the window's end (`WINDOW_MS`, or to the page's `cawco:ready`
 * and `AFTER_READY_MS` past it for a reloaded preview), on a CPU `SLOWER`
 * times slower; the style and layout passes and elements restyled from the
 * input to the frame that shows the pane (`workOf`); the press's
 * interaction by Event Timing. A WebKit return is a person's press
 * (`pressBack`), timed by the event's own stamp, with the dashboard's first
 * animation frames after it. Each return is a leg gated on the whole
 * machine's CPU and memory pressure (quiet.ts `quietLeg`). Every number is written to `numbers.json`.
 *
 * The busy session streams as the spec lets it: once seeded, its live turns
 * run only while the busy tab is away (one per `TURN_MS` of the absence) and
 * land before the return, and none runs while a return is measured. Every
 * run, on any tree, is shown the same turns at the same points; each return
 * says how many elements the page put in from the reach on (`inserted`). A
 * return to the preview says when the pane reached into its frame to post
 * (`watchPosts`, from the reach on), when its release reached the page, the
 * page's own long tasks before its first frame, and that frame. While a
 * busy tab is away, its turns running, every loop in a pane off screen is
 * read (`hiddenLoopsOf`): none costs a frame.
 *
 * Asserted per Chromium return: its interaction under `INPUT_MS`, and,
 * for a busy or kept return, its longest task within two frames' budget
 * (`2 × LONG_TASK_MS`) on the slower CPU. A return past the bound loads the
 * page again, in the dashboard's process where a frame shares it, so its
 * longest task is the page's own load: noted, and asserted only to have let
 * the page go and loaded it again. Asserted per kept return, on every
 * engine: the page is the document it was (no reload), held off screen
 * (none of its animation frames or timers ran), and its first animation
 * frame after the press comes within `BACK_MS`. Asserted in leg 3: each
 * silent session's blank state and no skeleton; and wherever the loops off
 * screen are read, none costing a frame (`hiddenLoopsOf` `costly`).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one return at a time, as a person makes them

import { readFileSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CDPSession, Frame, Locator, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type MainTask, type MainThread, SCROLLER, traceMain } from "../frames";
import { type Heap, heapOf } from "../heap";
import { type Kit, open, ROOT, type Spec } from "../kit";
import { machineQuiet, quietLeg } from "../quiet";
import {
  type Cost,
  census,
  INPUT_MS,
  inputsOf,
  LONG_TASK_MS,
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
/**
 * How long leg 3 watches the panes it put away for a run served there:
 * past the cover's wait (`--dur-wait-grace` 1000 ms, then `--dur-fade`
 * 200 ms), which a preview let go as its pane went away starts again.
 */
const OFFSCREEN_MS = 2500;
/**
 * From a switch away, the switch's own frames: a run it starts or ends in
 * the pane it puts away is the switch's, read with the switch, not the
 * absence's (`hiddenLoopsOf` reads from here on).
 */
const SWITCHED_MS = 500;
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
/** A run of whitespace, as the kernel's port range file separates its two ports. */
const SPACE_RUN = /\s+/;
/** Transcript's `ROW_ESTIMATE`: virtua's size for a row it has not measured, px. */
const ROW_ESTIMATE = 21;
/** How long leg 3 shows each silent session before reading its pane: its read has long landed. */
const SILENT_MS = 5000;
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
  /** The dashboard's first animation frames after the press, ms after it (WebKit's, read on its own clock); empty where the trace reads them. */
  frames: number[];
  /** Every task of `HEAVY_MS` or more from the reach on: when after the press, what it ran, its CPU and what it restyled. */
  heavy: string;
  /** A busy return: its list's heights at the landing (`heightsOf`). */
  heights?: string;
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
  /**
   * The press's own task (its pointerup) said whole, as `reachWhat`, with
   * its script's sampled self time by the bundle file it ran in.
   */
  pressWhat: string;
  psi: string;
  /** The longest task between the reach and the press, CPU ms. */
  reach: number;
  /** When the pointer came onto the tab or the focus did, epoch ms. */
  reachAt: number;
  /** That task said whole: what it ran, its restyle, the changes that scheduled it and its sampled stacks. */
  reachWhat: string;
  /** Chromium: the style passes Blink counted from the reach to the window's end, and their time. */
  recalc?: string;
  scene: string;
  /** The pane once the window is over: anything left skipped, rows in view with no text box, rows a different height (`shownStateOf`). */
  shown: string;
  /** From `shownStateOf`: elements with an inline skip, computing it hidden, rows in view, and those with no text box; empty when unread. */
  shownCounts: number[];
  /** WebKit: the first of the dashboard's frames that shows the pane (the frame painting the switch), ms after the press; null where unread. */
  shownMs: number | null;
  /** How many item sizes told from the reach to the press differ from the size the item had before it. */
  sizeChanges: number;
  /** How many of its rows were still staged (an inline skip) as the press came. */
  stagedAtPress: number;
  /** From the reach to the press: the rows staged, the sizes virtua was told and which changed (`watchSizes`). */
  staging: string;
  /** WebKit: that frame, the press's Event Timing, and the strip's selection and focus once over (`stripOf`). */
  switchLine: string;
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
  /** The dashboard's first animation frames after the press, ms after it; empty where unread. */
  frames: number[];
  /** Frame and timer requests any of its scripts made while its tab was off screen (held, each waits); NaN when its page was gone. */
  hiddenCalls: number;
  /** Its animation frames and interval ticks while its tab was off screen; NaN when its page was gone. */
  hiddenTicks: number;
  hiddenTimers: number;
  /** The page's own long tasks from the press to its first animation frame after it: when after the press, and how long, ms. */
  longAfter: [number, number][];
  /** Its own long animation frames in the same span, each said whole (when after the press, its length, its rendering and style shares, its scripts). */
  longFramesAfter: string[];
  /** From the press to the pane's first reach into the frame to post after it, ms; null when none came. */
  postMs: number | null;
  /** The pane's reaches into the frame to post (`watchPosts`) from the reach on, ms after the press (negative: before it); the first is its release. */
  posts: number[];
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
  posts: number[],
  { frames, reachAt }: { frames: number[]; reachAt: number }
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
    posts: posts
      .filter((at) => at >= reachAt && at <= pressAt + WINDOW_MS)
      .slice(0, 6)
      .map((at) => Math.round(at - pressAt)),
    frames,
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
  `its page ${back.reloaded ? "loaded again" : "kept"}; off screen ${back.hiddenTicks} animation frames and ${back.hiddenTimers} interval ticks, ${back.hiddenCalls} frame and timer requests; the pane reached into its frame ${back.postMs === null ? "never after the press" : `${back.postMs}ms after the press`} (from the reach on: ${back.posts.map((ms) => `${ms}ms`).join(", ") || "none"}); the dashboard's frames ${back.frames.length > 0 ? `${back.frames.map((ms) => `${ms}ms`).join(", ")} after the press` : "read off the trace"}; its release reached it ${back.releaseMs === null ? "never" : `${back.releaseMs}ms after the press`}; its own long tasks before its first frame ${back.longAfter.map(([at, ms]) => `${ms}ms at ${at}ms`).join(", ") || "none"}, its long frames ${back.longFramesAfter.join("; ") || "none"}; its first animation frame ${back.firstTickMs === null ? "never came" : `${back.firstTickMs}ms after the press`}`;

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

/**
 * A switch nobody measures: the tab's own click, the pointer parked off the
 * strip. A tab already chosen is left as it is: its click opens its details
 * (PaneTabs `clickTab`), which stood pinned over every leg after.
 */
async function away(page: Page, id: string): Promise<void> {
  await page.mouse.move(0, 0);
  await page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first()
    .evaluate((el) => {
      if (el.getAttribute("aria-selected") !== "true") {
        (el as HTMLElement).click();
      }
    });
}

/**
 * In the dashboard's own document, from `__hiddenRemovals.start()`: every
 * node taken out of a pane put away (`[data-pane-hidden]`), counted by
 * what it was and where it sat (the detached leg's `detached.txt`).
 */
function watchHiddenRemovals(): void {
  if (window.top !== window) {
    return;
  }
  /** Nodes taken out of a pane put away, by what each was and where it sat. */
  const by = new Map<string, number>();
  let on = false;
  const w = window as unknown as {
    __hiddenRemovals: {
      read: () => { count: number; what: string }[];
      start: () => void;
    };
  };
  w.__hiddenRemovals = {
    start: () => {
      by.clear();
      on = true;
    },
    read: () =>
      [...by]
        .map(([what, count]) => ({ what, count }))
        .sort((a, b) => b.count - a.count),
  };
  /** A node's mark: its tag and `data-slot`, or `#text` and its first words. */
  const markOf = (node: Node | null): string => {
    if (!(node instanceof Element)) {
      return node
        ? `${node.nodeName} ${(node.textContent ?? "").slice(0, 24)}`
        : "";
    }
    const slot = node.getAttribute("data-slot");
    return `${node.localName}${slot ? `[${slot}]` : ""}`;
  };
  const note = (parent: Node | null, child: Node | null) => {
    if (!(
      on &&
      parent instanceof Element &&
      parent.closest("[data-pane-hidden]")
    )) {
      return;
    }
    // Where it was: its parent's slots out to the row, and the list's mark.
    const chain: string[] = [];
    for (
      let at: Element | null = parent;
      at && chain.length < 6 && !at.matches('[data-slot="listing"]');
      at = at.parentElement
    ) {
      if (at.hasAttribute("data-slot") || at.hasAttribute("data-item")) {
        chain.push(markOf(at));
      }
    }
    const list = parent
      .closest('[data-slot="listing"]')
      ?.getAttribute("data-probe");
    const key = `${markOf(child)} in ${chain.join(" < ")} (${list ?? "no list"})`;
    by.set(key, (by.get(key) ?? 0) + 1);
  };
  const { remove } = Element.prototype;
  Element.prototype.remove = function (this: Element) {
    note(this.parentNode, this);
    remove.call(this);
  };
  const { remove: removeText } = CharacterData.prototype;
  CharacterData.prototype.remove = function (this: CharacterData) {
    note(this.parentNode, this);
    removeText.call(this);
  };
  const { removeChild } = Node.prototype;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T) {
    note(this, child);
    return removeChild.call(this, child) as T;
  };
  const { replaceWith } = Element.prototype;
  Element.prototype.replaceWith = function (
    this: Element,
    ...nodes: (Node | string)[]
  ) {
    note(this.parentNode, this);
    replaceWith.apply(this, nodes);
  };
  const content = Object.getOwnPropertyDescriptor(
    Node.prototype,
    "textContent"
  );
  Object.defineProperty(Node.prototype, "textContent", {
    ...content,
    set(this: Node, value: string) {
      if (this.firstChild) {
        note(this, this.firstChild);
      }
      content?.set?.call(this, value);
    },
  });
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
  const seen: {
    at: number;
    key: string;
    pane: string;
    was: number | null;
    px: number;
  }[] = [];
  // Each item's last size, and how long its text was then: a row whose
  // text has changed since was rewritten after virtua last measured it.
  const last = new WeakMap<Element, { px: number; text: number }>();
  const w = window as unknown as {
    __sizes: typeof seen;
    __lastSize: (el: Element) => { px: number; text: number } | null;
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
            const px =
              entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
            seen.push({
              at: performance.timeOrigin + performance.now(),
              key:
                el.querySelector<HTMLElement>(":scope > [data-row]")?.dataset
                  .row ?? "?",
              // PaneLeaf's slot: a side split's own panes carry an empty `data-pane`.
              pane:
                el.closest<HTMLElement>('[data-slot="pane"][data-pane]')
                  ?.dataset.pane ?? "?",
              was: last.get(el)?.px ?? null,
              px,
            });
            last.set(el, { px, text: el.textContent?.length ?? 0 });
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
    const w = window as unknown as {
      __lastSize?: (el: Element) => { px: number; text: number } | null;
    };
    const sizes: Record<string, number | null> = {};
    /** Rows whose text changed after virtua last measured them: rewritten while away. */
    const rewritten: string[] = [];
    for (const item of document.querySelectorAll(
      `[data-slot="pane"][data-pane="${CSS.escape(id)}"] [data-item]`
    )) {
      const key = item.querySelector<HTMLElement>(":scope > [data-row]")
        ?.dataset.row;
      if (key) {
        const had = w.__lastSize?.(item) ?? null;
        sizes[key] = had?.px ?? null;
        if (had && had.text !== (item.textContent?.length ?? 0)) {
          rewritten.push(key);
        }
      }
    }
    return { sizes, rewritten };
  }, pane);

/**
 * The sizes virtua's observer was told of pane `pane`'s items from `from`
 * to `to` (epoch ms, `watchSizes`): how many, which differ from the size the
 * item had before the reach (`before`), and those with no size before.
 */
async function sizesTold(
  page: Page,
  pane: string,
  {
    before,
    from,
    pressAt,
    rewritten,
    to,
  }: {
    before: Record<string, number | null>;
    from: number;
    pressAt: number;
    rewritten: string[];
    to: number;
  }
): Promise<{ changes: number; line: string; told: string }> {
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
  const differs = (one: { key: string; px: number }) => {
    const had = hadOf(one);
    return had !== null && Math.abs(one.px - had) > 0.5;
  };
  const wasRewritten = new Set(rewritten);
  // A row rewritten while away is a new size, told as virtua measures it.
  const changed = sizes.filter(
    (one) => differs(one) && !wasRewritten.has(one.key)
  );
  const remeasured = sizes.filter(
    (one) => differs(one) && wasRewritten.has(one.key)
  ).length;
  const unmeasured = sizes.filter((one) => hadOf(one) === null);
  const which = changed
    .slice(0, 6)
    .map(
      (one) =>
        `${one.key.slice(0, 16)} ${hadOf(one)}→${one.px}px at ${Math.round(one.at - pressAt)}ms`
    )
    .join(", ");
  const rows = Object.keys(before).length;
  const never = Object.values(before).filter((one) => one === null).length;
  const told = `${sizes.length} item sizes, ${changed.length} of them a change from the size before${which ? ` (${which})` : ""}, ${remeasured} of rows rewritten while away, ${unmeasured.length} first measurements of rows never measured`;
  return {
    changes: changed.length,
    told,
    line: `${rows} rows mounted before the reach (${never} never measured, ${rewritten.length} rewritten while away: ${rewritten.map((key) => key.slice(0, 16)).join(", ") || "none"}); from the reach to the press virtua was told ${told}`,
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
  before: Record<string, number | null>,
  rewritten: string[]
) =>
  page.evaluate(
    ([id, scroller, was, redone]) => {
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
          // A row rewritten while away is measured anew, not held to its old size.
          return {
            item,
            had: key && !redone.includes(key) ? (was[key] ?? null) : null,
          };
        })
        .filter((one) => one.had !== null);
      const kept = sized.length;
      const movedRows = sized
        .map(({ item, had }) => ({
          had,
          key:
            item.querySelector<HTMLElement>(":scope > [data-row]")?.dataset
              .row ?? "?",
          now: item.getBoundingClientRect().height,
        }))
        .filter(({ had, now }) => Math.abs(now - (had ?? 0)) > 0.5);
      const moved = movedRows.length;
      const which = movedRows
        .slice(0, 4)
        .map(({ had, key, now }) => `${key.slice(0, 24)} ${had}→${now}px`)
        .join(", ");
      return { inline, computed, rows, blank, kept, moved, which };
    },
    [pane, SCROLLER, before, rewritten] as const
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

/**
 * Every run the engine served in a pane off screen (PaneLeaf
 * `data-pane-hidden` or `data-pane-settling`), each the event it sent from
 * there (`__offscreenRuns`: when, epoch ms, and what). An engine sends a
 * CSS animation's or transition's events from the frame that updates it,
 * so a run it draws says so here; one in content it skips sends none until
 * shown (WebKit: "skip updating and sending events for animation in hidden
 * content-visibility subtrees", WebKit/WebKit#17540; Chromium restyles
 * nothing it skips). A run ended by script (PaneLeaf's `holdSkipped`
 * finishing an entrance where it stands) is no frame drawn, and is not
 * counted.
 */
function watchOffscreenRuns(): void {
  if (window.top !== window) {
    return;
  }
  const said: [number, string][] = [];
  (window as unknown as { __offscreenRuns: typeof said }).__offscreenRuns =
    said;
  const ended = new WeakMap<EventTarget, Set<string>>();
  const nameOf = (one: Animation) =>
    (one as CSSAnimation).animationName ??
    (one as CSSTransition).transitionProperty ??
    "";
  const { finish } = Animation.prototype;
  Animation.prototype.finish = function (this: Animation) {
    const el = (this.effect as KeyframeEffect | null)?.target;
    if (el) {
      const names = ended.get(el) ?? new Set();
      names.add(nameOf(this));
      ended.set(el, names);
    }
    return finish.call(this);
  };
  for (const type of [
    "animationstart",
    "animationiteration",
    "animationend",
    "transitionstart",
    "transitionend",
  ]) {
    addEventListener(
      type,
      (event) => {
        const el = event.target;
        const pane =
          el instanceof Element ? el.closest('[data-slot="pane"]') : null;
        if (!(
          el instanceof Element &&
          pane?.matches("[data-pane-hidden], [data-pane-settling]")
        )) {
          return;
        }
        const name =
          (event as AnimationEvent).animationName ??
          (event as TransitionEvent).propertyName;
        if (ended.get(el)?.has(name)) {
          return;
        }
        said.push([
          performance.timeOrigin + performance.now(),
          `${type} ${name} on ${el.localName}.${[...el.classList].slice(0, 2).join(".")} in ${pane.getAttribute("data-pane")?.slice(0, 8)}`,
        ]);
      },
      true
    );
  }
}

/**
 * What runs in a pane off screen, put away (PaneLeaf `data-pane-hidden`)
 * or laid out unseen (`data-pane-settling`: drawing its first picture, or
 * warm): every animation there by its play state and whether it runs on an
 * element or its `::before`/`::after`, and the runs the engine served there
 * since `since` (epoch ms, `watchOffscreenRuns`). `costly` is what costs
 * frames. On Chromium a running run is one: it restyles nothing in content
 * it skips, so a loop still running as its pane went away stayed running
 * and drew 120 frames in 2 s (motion/rest.ts `holdSkipped`). On WebKit a
 * run's play state is its clock's, served or not: one in skipped content
 * reads `running`, then `finished`, never updated and never drawn (a hidden
 * fade read so with no event, its process's CPU 2–4 ticks over five runs
 * against 37–40 shown, 2026-10-25), so only the runs it served cost.
 */
const hiddenLoopsOf = async (page: Page, since = 0) => {
  const webkit = page.context().browser()?.browserType().name() === "webkit";
  const read = await page.evaluate((from) => {
    const served = (
      (window as unknown as { __offscreenRuns?: [number, string][] })
        .__offscreenRuns ?? []
    ).filter(([at]) => at >= from);
    const panes = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="pane"][data-pane-hidden], [data-slot="pane"][data-pane-settling]'
      ),
    ];
    const unseen = (pane: HTMLElement) =>
      pane.hasAttribute("data-pane-settling");
    /** A loop said: its pane, the slot it stands in, its element and its keyframes. */
    const named = (loop: Animation, effect: KeyframeEffect, el: Element) =>
      `${(el.closest("[data-pane]") as HTMLElement | null)?.dataset.pane?.slice(0, 8)} ${el.parentElement?.closest("[data-slot]")?.getAttribute("data-slot") ?? ""} ${el.localName}.${[...el.classList].slice(0, 2).join(".")}${effect.pseudoElement ?? ""} ${(loop as CSSAnimation).animationName ?? "script"}`;
    const runs = document.getAnimations().flatMap((loop) => {
      const effect = loop.effect as KeyframeEffect | null;
      const el = effect?.target;
      return effect && el && panes.some((one) => one.contains(el))
        ? [{ loop, effect, el }]
        : [];
    });
    const running = runs.filter(({ loop }) => loop.playState === "running");
    const pseudo = runs.filter(({ effect }) => effect.pseudoElement).length;
    const laidOut = panes.filter(unseen).length;
    const where = running
      .slice(0, 4)
      .map(({ loop, effect, el }) => named(loop, effect, el));
    // Each loop by its keyframes, where it runs and its play state: which
    // loops the census holds (a skeleton's sweep on ::after, a breath).
    const kinds = new Map<string, number>();
    for (const { loop, effect } of runs) {
      const kind = `${(loop as CSSAnimation).animationName ?? "script"}${effect.pseudoElement ?? ""} ${loop.playState}`;
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
    const byKind = [...kinds].map(([kind, n]) => `${kind} ×${n}`).join(", ");
    return {
      running: running.length,
      served: served.length,
      paused: runs.length - running.length,
      panes: panes.length,
      line: `${runs.length} animations in ${panes.length} panes off screen (${panes.length - laidOut} put away, ${laidOut} laid out unseen): ${running.length} running, ${runs.length - running.length} paused; ${runs.length - pseudo} on elements, ${pseudo} on ::before/::after${byKind ? `; by keyframes: ${byKind}` : ""}${where.length > 0 ? ` (running: ${where.join(", ")})` : ""}; ${served.length} events from runs served there${
        served.length > 0
          ? `: ${served
              .slice(0, 4)
              .map(([, what]) => what)
              .join(", ")}`
          : ""
      }`,
    };
  }, since);
  return {
    ...read,
    costly: webkit ? read.served : read.running + read.served,
    line: `${read.line}; costing frames, as ${webkit ? "WebKit serves them (events sent)" : "Chromium runs them (running, or events sent)"}: ${webkit ? read.served : read.running + read.served}`,
  };
};

/** warm.svelte.ts `COOL_MS`: how long a reach outlasts the pointer or the focus that made it. */
const REACH_COOL_MS = 1500;
/** How long a preview's page is given to answer an animation frame of its own (held, it waits). */
const RUNS_MS = 400;

/**
 * Each preview frame standing in the dashboard, by its pane, and whether its
 * page runs: an animation frame it is asked for comes within `RUNS_MS`
 * (held, the overlay keeps it waiting). A pane whose page is unloaded has
 * no frame, and is not listed.
 */
async function previewsRunning(
  page: Page
): Promise<{ pane: string; runs: boolean }[]> {
  const iframes = page.locator(
    '[data-slot="pane"][data-pane] iframe[title="Preview"]'
  );
  const asked: { pane: string; frame: Frame }[] = [];
  for (const one of await iframes.all()) {
    const pane = await one.evaluate(
      (el) =>
        el
          .closest('[data-slot="pane"][data-pane]')
          ?.getAttribute("data-pane") ?? "?"
    );
    const frame = await (await one.elementHandle())?.contentFrame();
    if (frame) {
      await frame
        .evaluate(() => {
          const w = window as unknown as { __runs: boolean };
          w.__runs = false;
          requestAnimationFrame(() => {
            w.__runs = true;
          });
        })
        .catch(() => undefined);
      asked.push({ pane, frame });
    }
  }
  await page.waitForTimeout(RUNS_MS);
  return Promise.all(
    asked.map(async ({ pane, frame }) => ({
      pane,
      runs: await frame
        .evaluate(() => (window as unknown as { __runs: boolean }).__runs)
        .catch(() => false),
    }))
  );
}

/**
 * Pane `pane` as it stands: whether it says nothing has been said there
 * (SessionPane's blank state) and how many transcript skeletons stand in it.
 */
const silentStateOf = (page: Page, pane: string) =>
  page.evaluate((id) => {
    const box = document.querySelector<HTMLElement>(
      `[data-slot="pane"][data-pane="${CSS.escape(id)}"]`
    );
    return {
      blank: !!box?.textContent?.includes("Nothing has been said here yet"),
      skeletons: box?.querySelectorAll("[data-skeleton]").length ?? -1,
    };
  }, pane);

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

/** `shownStateOf`'s reading said, with what virtua was told after the press (`sizesTold`). */
function shownLine(
  settled: Awaited<ReturnType<typeof shownStateOf>>,
  toldAfter: string
): string {
  if (!settled) {
    return "no pane";
  }
  const moved = settled.which
    ? ` (${settled.which}); after the press virtua was told ${toldAfter}`
    : "";
  return `${settled.inline} elements with an inline content-visibility, ${settled.computed} computing it hidden; ${settled.rows} rows in view, ${settled.blank} of them with no box on their first text; ${settled.kept} rows measured before the reach still mounted, ${settled.moved} of them a different height now${moved}`;
}

/** A busy return once its window is over: where it landed (`landingOf`) and its list's heights (`heightsOf`). */
async function busyAfter(
  page: Page,
  pane: string,
  file: string
): Promise<{ heights: string; landing: string }> {
  const landing = await landingOf(page, pane);
  return { landing, heights: await heightsOf(page, pane, file) };
}

/** A return's whole line, as its note says it. */
function noteOf(back: Back, turns: number): string {
  const page = back.page ? `${pageLine(back.page)} | ` : "";
  const landed = back.landing
    ? `landed: ${back.landing} | heights at the landing: ${back.heights} | `
    : "";
  const warm = Number.isNaN(back.warmTask)
    ? "not traced"
    : `${back.warmTask.toFixed(1)}ms`;
  return `${back.scene}: ${back.psi} | ${turns} busy turns while away, ${back.inserted} elements inserted from the reach on | ${page}${landed}${back.recalc ? `from the reach to the window's end ${back.recalc} | ` : ""}longest task ${back.longest}ms of CPU (${back.longest * SLOWER}ms ${SLOWER}x slower), ${back.longestWhat} | the reach task (its warm and the frame laying the pane out) ${warm}: ${back.warmWhat} | the longest from the reach to the press ${back.reach}ms: ${back.reachWhat} | staging: ${back.staging} | once shown: ${back.shown} | tasks of ${HEAVY_MS}ms or more, by when after the press: ${back.heavy} | input to the shown frame: ${back.work ? workLine([back.work]) : "no switch read"} | the press: ${back.input}; its task: ${back.pressWhat} | the switch: ${back.switchLine} | other renderers in the second after the press: ${back.elsewhere} | the longest ${back.worstFrame} | as the pointer came: ${back.held}`;
}

/**
 * Pane `pane`'s list at the landing: its height (virtua's total, the
 * container's), every mounted row's box by key (in view or not, measured or
 * not: virtua's `visibility: hidden` on an item it has not measured), and
 * the last size virtua's observer was told of each of the pane's rows
 * (`watchSizes`). Written whole to `file`; said as a line.
 */
async function heightsOf(
  page: Page,
  pane: string,
  file: string
): Promise<string> {
  const read = await page.evaluate(
    ([id, scroller]) => {
      const box = document.querySelector<HTMLElement>(
        `[data-slot="pane"][data-pane="${CSS.escape(id)}"]`
      );
      const view = box?.querySelector<HTMLElement>(scroller);
      const container = box?.querySelector<HTMLElement>('[data-slot="listing"]')
        ?.firstElementChild as HTMLElement | null | undefined;
      if (!(view && container)) {
        return null;
      }
      const port = view.getBoundingClientRect();
      const mounted = [...container.children].map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          key:
            item.querySelector<HTMLElement>(":scope > [data-row]")?.dataset
              .row ?? "?",
          h: rect.height,
          unmeasured: (item as HTMLElement).style.visibility === "hidden",
          inView: rect.bottom > port.top && rect.top < port.bottom,
        };
      });
      const told: Record<string, number> = {};
      for (const one of (
        window as unknown as {
          __sizes?: { key: string; pane: string; px: number }[];
        }
      ).__sizes ?? []) {
        if (one.pane === id) {
          told[one.key] = one.px;
        }
      }
      return {
        total: Number.parseFloat(container.style.height),
        mounted,
        told,
      };
    },
    [pane, SCROLLER] as const
  );
  if (!read) {
    return "no list";
  }
  await writeFile(file, `${JSON.stringify(read, null, 2)}\n`);
  const sizes = Object.values(read.told);
  const sum = sizes.reduce((all, one) => all + one, 0);
  const rest = read.total - sum;
  const inView = read.mounted
    .filter((one) => one.inView)
    .map((one) => `${one.key.slice(0, 20)} ${one.h}`)
    .join(", ");
  return `list ${read.total}px; virtua was told the sizes of ${sizes.length} rows of this pane (any it has since let go of included), ${sum.toFixed(2)}px in all, ${rest.toFixed(2)}px of the list left over (${(rest / ROW_ESTIMATE).toFixed(2)} rows at the ${ROW_ESTIMATE}px estimate); ${read.mounted.length} mounted, ${read.mounted.filter((one) => one.unmeasured).length} of them never measured; in view by key: ${inView}; whole in ${file}`;
}

/**
 * From inside pane `pane`'s transcript (its list), what the bare
 * `[data-pane]` lookup finds against PaneLeaf's slot: a side split's own
 * panes (paneforge) carry an empty `data-pane`.
 */
async function checkPaneLookup(
  kit: Kit,
  page: Page,
  pane: string
): Promise<void> {
  const found = await page.evaluate((id) => {
    const listing = document.querySelector(
      `[data-slot="pane"][data-pane="${CSS.escape(id)}"] [data-slot="listing"]`
    );
    const say = (el: Element | null | undefined) =>
      el
        ? `${el.tagName.toLowerCase()} data-slot="${el.getAttribute("data-slot") ?? ""}" data-pane="${el.getAttribute("data-pane")}"`
        : "nothing";
    return {
      bare: say(listing?.closest("[data-pane]")),
      slot: say(listing?.closest('[data-slot="pane"][data-pane]')),
      slotPane:
        listing?.closest<HTMLElement>('[data-slot="pane"][data-pane]')?.dataset
          .pane ?? null,
    };
  }, pane);
  kit.check(
    `from inside the busy transcript, PaneLeaf's slot is found by [data-slot="pane"][data-pane]`,
    found.slotPane === pane,
    `[data-pane] finds ${found.bare}; [data-slot="pane"][data-pane] finds ${found.slot}`
  );
}

/** A sampled function's bundle file: `name@file:line:column`, or the engine's own. */
const FILE_OF = /@([^:@]+):\d+:\d+$/;

/**
 * The press's own task, the first pointerup at or after the press: said
 * whole (`line`), and its script's sampled self time summed by the bundle
 * file each function ran in, the most first.
 */
function pressLine(
  tasks: MainTask[],
  madeMark: number,
  main: MainThread,
  line: (task: MainTask) => string
): string {
  const task = tasks.find(
    (one) => one.at >= madeMark && one.ran === "a pointerup event"
  );
  if (!task) {
    return "no pointerup traced";
  }
  const byFile = new Map<string, number>();
  for (const [fn, ms] of main.selfTime(task.at, task.end)) {
    const file = FILE_OF.exec(fn.split(" ← ").at(-1) ?? fn)?.[1] ?? fn;
    byFile.set(file, (byFile.get(file) ?? 0) + ms);
  }
  const files = [...byFile]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([file, ms]) => `${file} ${ms.toFixed(1)}ms`)
    .join(", ");
  return `${line(task)}; by file: ${files}`;
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
  await input.send("Performance.enable");
  /** Blink's own style counters (`Performance.getMetrics`): passes run, seconds spent. */
  const styleNow = async () => {
    const { metrics } = await input.send("Performance.getMetrics");
    const of = (name: string) =>
      metrics.find((one) => one.name === name)?.value ?? 0;
    return [of("RecalcStyleCount"), of("RecalcStyleDuration")] as const;
  };
  let styleBefore: readonly [number, number] = [0, 0];
  let styleAfter: readonly [number, number] = [0, 0];
  const held = await census(page);
  const { sizes: sizesBefore, rewritten } = await itemSizesOf(page, id);
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
      styleBefore = await styleNow();
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
      styleAfter = await styleNow();
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
  const span = {
    before: sizesBefore,
    pressAt: pressEpoch,
    rewritten,
  };
  const told = await sizesTold(page, id, {
    ...span,
    from: reachEpoch,
    to: pressEpoch,
  });
  const toldAfter = await sizesTold(page, id, {
    ...span,
    from: pressEpoch,
    to: Number.POSITIVE_INFINITY,
  });
  const staging = `${skippedAtPress} rows still staged as the press came; ${told.line}`;
  const settled = await shownStateOf(page, id, sizesBefore, rewritten);
  const shown = shownLine(settled, toldAfter.told);
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
    frames: [],
    recalc: `${styleAfter[0] - styleBefore[0]} style passes, ${((styleAfter[1] - styleBefore[1]) * 1000).toFixed(1)}ms (Performance.getMetrics RecalcStyleCount, RecalcStyleDuration; traced, so slower than untraced)`,
    inserted,
    input: press ?? "none reported",
    inputMs,
    pressAt: origin + madeAt,
    reachAt: reachEpoch,
    shownMs: null,
    switchLine: "read off the trace",
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
    pressWhat: pressLine(own, madeMark, main, taskLine),
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

/**
 * In the dashboard's own document: the next press (a pointer's or a key's),
 * when it came by the event's own stamp (epoch ms), the dashboard's first
 * animation frames after it, the first of them in which pane `pane` stands
 * shown (neither put away nor laid out unseen: the frame that paints the
 * switch) and when that frame had rendered, and the press's Event Timing
 * entry where the engine reports one.
 */
function armPress(pane: string): void {
  const w = window as unknown as {
    __press: number;
    __pressFrames: number[];
    __pressShown: number;
    __pressPainted: number;
    __pressTiming: string[];
    __pressOff?: () => void;
  };
  w.__pressOff?.();
  w.__press = 0;
  w.__pressPainted = 0;
  w.__pressFrames = [];
  w.__pressShown = 0;
  w.__pressTiming = [];
  const shown = () => {
    const box = document.querySelector(
      `[data-slot="pane"][data-pane="${CSS.escape(pane)}"]`
    );
    return !!box && !box.matches("[data-pane-hidden], [data-pane-settling]");
  };
  const look = () => {
    const at = performance.timeOrigin + performance.now();
    w.__pressFrames.push(at);
    if (!w.__pressShown && shown()) {
      w.__pressShown = at;
      // A message posted from the frame's callbacks runs once that frame has rendered.
      const after = new MessageChannel();
      after.port1.onmessage = () => {
        w.__pressPainted = performance.timeOrigin + performance.now();
      };
      after.port2.postMessage(0);
    }
    if (
      (w.__pressFrames.length < 4 || !w.__pressShown) &&
      w.__pressFrames.length < 120
    ) {
      requestAnimationFrame(look);
    }
  };
  const pressed = (event: Event) => {
    if (w.__press) {
      return;
    }
    const now = performance.now();
    // The event's stamp, unless this engine's is on another clock.
    const stamp =
      event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now;
    w.__press = performance.timeOrigin + stamp;
    requestAnimationFrame(look);
  };
  let timing: PerformanceObserver | null = null;
  if (PerformanceObserver.supportedEntryTypes?.includes("event")) {
    timing = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (entry.name === "keydown" || entry.name === "pointerdown") {
          w.__pressTiming.push(
            `${entry.name} ${Math.round(entry.duration)}ms (processing ${Math.round(entry.processingStart - entry.startTime)}-${Math.round(entry.processingEnd - entry.startTime)}ms)`
          );
        }
      }
    });
    timing.observe({
      type: "event",
      durationThreshold: 16,
    } as PerformanceObserverInit);
  }
  addEventListener("pointerdown", pressed, true);
  addEventListener("keydown", pressed, true);
  w.__pressOff = () => {
    timing?.disconnect();
    removeEventListener("pointerdown", pressed, true);
    removeEventListener("keydown", pressed, true);
  };
}

/** What `armPress` read: the press, epoch ms, the dashboard's frames after it, the first showing the pane, and its Event Timing. */
const pressOf = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __press: number;
      __pressFrames: number[];
      __pressShown: number;
      __pressPainted: number;
      __pressTiming: string[];
      __pressOff?: () => void;
    };
    w.__pressOff?.();
    return {
      at: w.__press,
      frames: [...w.__pressFrames],
      paintedAt: w.__pressPainted,
      shownAt: w.__pressShown,
      timing: [...w.__pressTiming],
    };
  });

/**
 * The strip as the accessibility tree says it (Playwright's aria snapshot of
 * the tablist holding `id`'s tab): the tab selected and the tab focused, by
 * their place in it.
 */
async function stripOf(page: Page, id: string): Promise<string> {
  const list = page
    .locator('[role="tablist"]')
    .filter({ has: page.locator(`[data-session-tab="${id}"]`) })
    .first();
  const aria = await list.ariaSnapshot().catch(() => "");
  const tabs = aria.split("\n").filter((line) => line.includes("- tab "));
  const selected = tabs.findIndex((line) => line.includes("[selected]"));
  const focused = await list.evaluate((el) =>
    [...el.querySelectorAll('[role="tab"]')].indexOf(
      document.activeElement as Element
    )
  );
  return `${tabs.length} tabs; tab ${selected + 1} [selected], tab ${focused + 1} focused (aria: ${tabs.map((line) => (line.includes("[selected]") ? "selected" : "-")).join(" ")})`;
}

/**
 * The keyboard's focus on `tab` (its id `id`), as a person reaches the strip:
 * focused, then Tab out of the strip and Shift+Tab back onto its one tab
 * stop, so the focus is the keyboard's (`:focus-visible`), as the strip's
 * own keyboard reach asks (PaneTabs `besideOf`).
 */
async function keyFocus(page: Page, tab: Locator, id: string): Promise<void> {
  await tab.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      id: el?.getAttribute("data-session-tab") ?? null,
      keyboard: !!el?.matches(":focus-visible"),
    };
  });
  if (focused.id !== id || !focused.keyboard) {
    throw new Error(
      `tab-return: the keyboard's focus is not on tab ${id.slice(0, 8)} (${focused.id?.slice(0, 8) ?? "elsewhere"}, ${focused.keyboard ? "" : "not "}focus-visible)`
    );
  }
}

/**
 * One return to `id` on WebKit, which has no trace: a person's press, timed
 * by the dashboard's clock, and the window after it. `pointer`: the pointer
 * comes onto the tab, rests `rest`, presses; `keyboard`: the keyboard's focus
 * rests on the chosen tab before it as long (`keyFocus`), and the arrow moves
 * the focus onto it and chooses it (TabsList `onkeydown`).
 */
async function pressBack(
  page: Page,
  id: string,
  how: "pointer" | "keyboard",
  waitFor?: () => Promise<boolean>,
  rest = REACH_MS
): Promise<Read> {
  const tab = page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first();
  await tab.scrollIntoViewIfNeeded();
  const box = await tab.boundingBox();
  if (!box) {
    throw new Error("tab-return: a tab to switch to has no box");
  }
  const now = () =>
    page.evaluate(() => performance.timeOrigin + performance.now());
  let reachAt = 0;
  if (how === "pointer") {
    await page.evaluate(armPress, id);
    reachAt = await now();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(rest);
    await page.mouse.down();
    await page.mouse.up();
  } else {
    // The strip's own keys (TabsList): the focus on the chosen tab before
    // it, where a Tab into the strip lands, then the arrow that moves the
    // focus onto it and chooses it.
    const strip = page
      .locator('[role="tab"][data-session-tab]')
      .filter({ visible: true });
    const ids = await strip.evaluateAll((tabs) =>
      tabs.map((one) => one.getAttribute("data-session-tab") ?? "")
    );
    const at = ids.indexOf(id);
    if (at < 1) {
      throw new Error("tab-return: a keyboard return needs a tab before it");
    }
    // The reach is the focus's: its keys (Tab and back) come before the press is watched.
    reachAt = await now();
    await keyFocus(page, strip.nth(at - 1), ids[at - 1]);
    await page.waitForTimeout(rest);
    await page.evaluate(armPress, id);
    await page.keyboard.press("ArrowRight");
  }
  await page.waitForTimeout(WINDOW_MS);
  const press = await pressOf(page);
  if (!press.at) {
    throw new Error(`tab-return: the ${how}'s press never reached the page`);
  }
  const pressAt = press.at;
  const shownMs = press.shownAt ? Math.round(press.shownAt - pressAt) : null;
  const timed = await page.evaluate(
    () => PerformanceObserver.supportedEntryTypes?.includes("event") ?? false
  );
  const timing = timed
    ? press.timing.join(", ") || "no entry of 16ms or more"
    : "not reported by this engine";
  const paintedMs = press.paintedAt
    ? Math.round(press.paintedAt - pressAt)
    : null;
  const switchLine = `shown in the dashboard's frame ${shownMs === null ? "never" : `${shownMs}ms after the press`}, that frame rendered ${paintedMs === null ? "never" : `${paintedMs}ms after the press`}; Event Timing ${timing}; the strip after: ${await stripOf(page, id)}`;
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
    frames: press.frames.map((at) => Math.round(at - pressAt)),
    input: `a ${how}'s press, not traced`,
    inputMs: 0,
    inserted: 0,
    longest: 0,
    longestWhat: `not traced; the dashboard's thread stood still at most ${Math.round(worstMs)}ms, ${Math.round(worstAt - pressAt)}ms after the press (its longest timer gap; every gap over 50ms: ${gaps.map(([at, ms]) => `${Math.round(ms)}ms at ${Math.round(at - pressAt)}ms`).join(", ") || "none"})`,
    pressAt,
    reachAt,
    shownMs,
    switchLine,
    elsewhere: "not traced",
    reach: 0,
    reachWhat: "not traced",
    warmTask: Number.NaN,
    warmWhat: "not traced",
    pressWhat: "not traced",
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

/** Each read of the loops in panes off screen (`hiddenLoopsOf`), by the leg it was read in. */
type LoopRead = { scene: string } & Awaited<ReturnType<typeof hiddenLoopsOf>>;
/** Leg 3's readings: each silent session's pane once shown (`silentStateOf`). */
type SilentRead = { scene: string } & Awaited<ReturnType<typeof silentStateOf>>;

/** Leg 3's silent sessions each show their blank state and no skeleton; every read of the loops off screen finds none costing a frame. */
function checkQuiet(
  kit: Kit,
  silentReads: SilentRead[],
  loopReads: LoopRead[]
): void {
  for (const read of silentReads) {
    kit.check(
      `${read.scene}: its blank state stands, never a skeleton`,
      read.blank && read.skeletons === 0,
      `${read.blank ? "its blank state stands" : "no blank state"}, ${read.skeletons} skeletons in its pane`
    );
  }
  for (const read of loopReads) {
    kit.check(
      `${read.scene}: nothing in a pane off screen costs a frame (no animation there drawn)`,
      read.costly === 0,
      read.line
    );
  }
}

/** A return to the preview: kept and held (its first frame bound, but for the first arrow into the strip), or past the bound and loaded again. */
function checkPage(kit: Kit, back: Back): void {
  const { page } = back;
  // The first arrow into the strip comes with no reach before it: its first frame is said, not bound.
  if (back.kind === "kept" && page && back.scene.startsWith("2h")) {
    kit.check(
      `${back.scene}: the page is the one it was, held off screen (no animation frame or timer of its ran)`,
      !page.reloaded && page.hiddenTicks === 0 && page.hiddenTimers === 0,
      pageLine(page)
    );
  } else if (back.kind === "kept" && page) {
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

/** The detached kinds the leg holds at zero growth (audit 0d8f70d1: +192 div, +113 svg, +1688 text per 30 switches). */
const DETACHED_KINDS = ["SVGSVGElement", "div", "Text"] as const;
/** A step of a retaining path that is a DOM node. */
const DOM_STEP = /^native (<|SVG\w*Element|Text|Comment|DocumentFragment)/;
/** A context's heap id in a retaining path's step. */
const SCOPE_ID = /@\d+\b/g;
/** Quiet sessions the detached leg opens beside the scene's five, so the pane holds the audit's dozen tabs. */
const QUIET_TABS = 7;
/** Busy turns let run through the thirty switches (`TURN_MS` each: about their 39 s). */
const STREAM_TURNS = 12;
/** How many switches the detached leg makes between its two readings: the audit's thirty. */
const SWITCHES = 30;
/** How long each switch is left to land before the next: live-perf's memory leg's. */
const SWITCH_REST_MS = 1300;

/**
 * What holds each detached node of `DETACHED_KINDS` in `heap` that `before`
 * did not have, grouped by its path down to the first DOM node on it (the
 * detached subtree's top, which holds the rest), scope ids dropped.
 */
function holders(before: Heap, heap: Heap): string[] {
  const lines: string[] = [];
  for (const kind of DETACHED_KINDS) {
    const had = new Set(before.detachedOf(kind).map(before.idOf));
    const held = heap.detachedOf(kind).filter((at) => !had.has(heap.idOf(at)));
    lines.push(
      `## ${kind}: ${heap.detachedOf(kind).length} detached, ${held.length} of them not detached before`
    );
    const seen = new Map<string, { n: number; path: string[] }>();
    for (const at of held) {
      const path = heap.pathTo(at);
      const top = path.findIndex((step) => DOM_STEP.test(step));
      const key = path
        .slice(0, top === -1 ? path.length : top + 1)
        .join("\n")
        .replace(SCOPE_ID, "@");
      const one = seen.get(key) ?? { n: 0, path };
      one.n += 1;
      seen.set(key, one);
    }
    for (const { n, path } of [...seen.values()].sort((a, b) => b.n - a.n)) {
      lines.push(`  ${n} held so:`, ...path.map((step) => `    ${step}`), "");
    }
  }
  return lines;
}

/**
 * Detached nodes (TAB_RETURN_LEGS=detached): the scene's five tabs and
 * `QUIET_TABS` more in one pane, each shown once, so each pane has built
 * what it builds on its first visit; the heap read after a collection
 * (heap.ts); thirty pointer presses round the tabs while the busy session
 * streams `STREAM_TURNS` turns; read again. Asserted: no growth in detached
 * `<svg>`, `<div>` and text nodes. Then every pane is shown once more, the
 * busy one left in front, and read a third time (noted): what a pane put
 * away still holds is let go once it is laid out again. What holds each
 * node the later readings find that the first did not, root to node, is
 * written to `detached.txt`, each transcript's list named in the path by
 * its index (`data-probe`).
 */
async function detachedLeg(
  kit: Kit,
  base: string,
  tabs: string[],
  stream: () => Promise<void>
): Promise<void> {
  /** A person's press on the tab: the pointer onto it, then the click. */
  const press = (on: Page, id: string) =>
    on
      .locator(`[data-session-tab="${id}"]`)
      .filter({ visible: true })
      .first()
      .click();
  const page = await kit.page("desk", { init: [watchHiddenRemovals] });
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
    [tabs, tabs[0]] as const
  );
  await open(
    page,
    `${base}/session/${tabs[0]}`,
    `${SCROLLER} [data-row]`,
    120_000
  );
  for (const id of [...tabs.slice(1), tabs[0] as string]) {
    await away(page, id);
    await page.waitForTimeout(3000);
  }
  // Each transcript's list marked, so a path through it says which it is.
  await page.evaluate(() => {
    for (const [i, el] of document
      .querySelectorAll('[data-slot="listing"]')
      .entries()) {
      el.setAttribute(
        "data-probe",
        `list ${i}, ${el.querySelectorAll("[data-item]").length} items`
      );
    }
  });
  const cdp = await page.context().newCDPSession(page);
  const before = await heapOf(cdp);
  await page.evaluate(() =>
    (
      window as unknown as { __hiddenRemovals: { start: () => void } }
    ).__hiddenRemovals.start()
  );
  // The busy session streams through the switches, as the owner's fleet does.
  const streaming = stream();
  for (let i = 0; i < SWITCHES; i += 1) {
    await press(page, tabs[(i + 1) % tabs.length] as string);
    await page.waitForTimeout(SWITCH_REST_MS);
  }
  await press(page, tabs[0] as string);
  await streaming;
  await page.waitForTimeout(SWITCH_REST_MS);
  const after = await heapOf(cdp);
  const removals = await page.evaluate(() =>
    (
      window as unknown as {
        __hiddenRemovals: { read: () => { count: number; what: string }[] };
      }
    ).__hiddenRemovals.read()
  );
  // Every pane shown once more, each laid out again, the busy one last and
  // left in front; then read a third time.
  for (const id of [...tabs.slice(2), tabs[0], tabs[1]] as string[]) {
    await press(page, id);
    await page.waitForTimeout(SWITCH_REST_MS);
  }
  await page.waitForTimeout(3000);
  const shownAgain = await heapOf(cdp);
  // Where each transcript's list stands: its pane, and whether it is drawn.
  const listings = await page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="listing"]')].map((el) => ({
      marked: el.getAttribute("data-probe"),
      drawn: el.checkVisibility(),
      items: el.querySelectorAll("[data-item]").length,
    }))
  );
  await writeFile(
    join(kit.out, "detached.txt"),
    `${[
      `# After ${SWITCHES} switches`,
      ...holders(before, after),
      "# Once every pane is shown again, the busy one left in front",
      ...holders(before, shownAgain),
      `# Taken out of a pane put away over the switches: ${removals.reduce((n, one) => n + one.count, 0)}, by what each was and where it sat`,
      ...removals.slice(0, 20).map((one) => `  ${one.count}× ${one.what}`),
      `# The transcripts' lists (tabs in order: ${tabs.join(", ")}; the busy one second)`,
      ...listings.map((one) => `  ${JSON.stringify(one)}`),
    ].join("\n")}\n`
  );
  kit.note(
    `detached once every pane is shown again: ${JSON.stringify(Object.fromEntries(DETACHED_KINDS.map((kind) => [kind, shownAgain.detached[kind] ?? 0])))}; lists ${JSON.stringify(listings)}`
  );
  const counts = (heap: Heap) =>
    Object.fromEntries(
      DETACHED_KINDS.map((kind) => [kind, heap.detached[kind] ?? 0])
    );
  const was = counts(before);
  const now = counts(after);
  await writeFile(
    join(kit.out, "detached.json"),
    `${JSON.stringify({ before: before.detached, after: after.detached, shownAgain: shownAgain.detached }, null, 2)}\n`
  );
  kit.note(
    `detached: before ${JSON.stringify(before.detached)}, after ${SWITCHES} switches ${JSON.stringify(after.detached)} (held only for the driver: ${before.heldForDriver} → ${after.heldForDriver}); what holds each is in ${join(kit.out, "detached.txt")}`
  );
  for (const kind of DETACHED_KINDS) {
    kit.check(
      `detached: ${SWITCHES} switches round ${tabs.length} tabs leave no more detached ${kind} after a collection`,
      (now[kind] ?? 0) <= (was[kind] ?? 0),
      `${was[kind]} → ${now[kind]}`
    );
  }
  await cdp.detach();
  await page.close();
}

const run = async (kit: Kit) => {
  machineQuiet();
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
    does: "try",
    ask: "Try this page and say whether it works",
    name: "heavy",
    dir: folder,
  });
  // The bound's other places: a page each, loaded once its tab is shown.
  const lights: string[] = [];
  for (const name of ["light-a", "light-b"]) {
    const light = await fleet.spawn("claude", `Light ${name}`, fleet.repo);
    await fleet.api(`/api/instances/${light}/artifacts`, {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name,
      html: `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body><p>${name}</p></body></html>`,
    });
    lights.push(light);
  }
  // TAB_RETURN_LEGS=setup: the fleet and its five sessions, every preview
  // and page given its port, and no more.
  if (process.env.TAB_RETURN_LEGS === "setup") {
    kit.check(
      "setup: the five sessions are made, each preview and page given its port",
      true,
      `quiet ${front}, busy ${busy}, heavy ${previewed}, lights ${lights.join(", ")}; preview ports ${fleet.previewPorts}, the kernel's ephemeral ports ${readFileSync("/proc/sys/net/ipv4/ip_local_port_range", "utf8").trim().replace(SPACE_RUN, "-")}`
    );
    return;
  }
  await until(
    `${SEED} calls in the busy session`,
    () => scene.counts,
    (c) => (c.busy ?? 0) > SEED + 5,
    30 * 60_000
  );
  scene.hold();
  // TAB_RETURN_LEGS=detached: the detached-node leg alone; with
  // TAB_RETURN_DEV=1 on the dev server, so each holder's closure is said at
  // its source file and line.
  if (process.env.TAB_RETURN_LEGS === "detached") {
    const quiet: string[] = [];
    for (let i = 0; i < QUIET_TABS; i += 1) {
      const id = await fleet.spawn("claude", `Quiet ${i + 1}`);
      await fleet.send(id, `${scene.mark(`quiet-${i}`)}: hello.`);
      quiet.push(id);
    }
    await detachedLeg(
      kit,
      process.env.TAB_RETURN_DEV === "1"
        ? await fleet.devDashboard()
        : await fleet.dashboard(),
      [front, busy, previewed, ...lights, ...quiet],
      () => scene.release(STREAM_TURNS)
    );
    return;
  }
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
        ? {
            engine: "webkit",
            init: [watchGaps, watchPosts, watchOffscreenRuns],
          }
        : {
            init: [watchCost, watchPosts, watchSizes, watchOffscreenRuns],
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
  const loopReads: LoopRead[] = [];
  const silentReads: SilentRead[] = [];
  /**
   * Leg 3: each session with nothing said yet (the preview's, the light
   * ones') shown in turn for `SILENT_MS`: its blank state stands, and no
   * skeleton; then all put away, every loop in their panes held.
   */
  const silentLeg = async (on: Desk, engine: string) => {
    for (const [i, id] of [previewed, ...lights].entries()) {
      await away(on.page, id);
      await on.page.waitForTimeout(SILENT_MS);
      const state = await silentStateOf(on.page, id);
      const said = `3 (${engine}): silent session ${i + 1} shown ${SILENT_MS / 1000}s`;
      silentReads.push({ scene: said, ...state });
      kit.note(
        `${said}: ${state.blank ? "its blank state stands" : "no blank state"}, ${state.skeletons} skeletons in its pane`
      );
    }
    const awayAt = Date.now();
    await away(on.page, front);
    await on.page.waitForTimeout(OFFSCREEN_MS);
    loopReads.push({
      scene: `3 (${engine}): the silent sessions put away`,
      ...(await hiddenLoopsOf(on.page, awayAt + SWITCHED_MS)),
    });
  };
  /**
   * The keyboard's reach (warm.svelte.ts `besides`): with the keyboard's
   * focus resting on the quiet tab, the previews of the tabs an arrow lands
   * on next run, two at most, and nothing else does; with the focus gone
   * from the strip, once its reach is over, every preview is held again and
   * no loop off screen runs.
   */
  const keyReach = async (on: Desk, engine: string) => {
    const { page } = on;
    await away(page, front);
    await page.waitForTimeout(REACH_COOL_MS + SETTLE_MS);
    const strip = page
      .locator('[role="tab"][data-session-tab]')
      .filter({ visible: true });
    const ids = await strip.evaluateAll((tabs) =>
      tabs.map((one) => one.getAttribute("data-session-tab") ?? "")
    );
    const at = ids.indexOf(front);
    const beside = [
      ids[(at - 1 + ids.length) % ids.length],
      ids[(at + 1) % ids.length],
    ];
    const place = (id: string) => `tab ${ids.indexOf(id) + 1}`;
    const said = (runs: { pane: string; runs: boolean }[]) =>
      runs
        .map((one) => `${place(one.pane)} ${one.runs ? "runs" : "held"}`)
        .join(", ") || "no preview standing";
    await keyFocus(page, strip.nth(at), front);
    await page.waitForTimeout(REACH_MS);
    const resting = await previewsRunning(page);
    const restingLoops = await hiddenLoopsOf(page);
    const leftAt = await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      return performance.timeOrigin + performance.now();
    });
    await page.waitForTimeout(REACH_COOL_MS + SETTLE_MS);
    const left = await previewsRunning(page);
    const leftLoops = await hiddenLoopsOf(page, leftAt + SWITCHED_MS);
    const running = resting.filter((one) => one.runs);
    kit.check(
      `${engine}: the keyboard's focus resting on a tab lets go the previews of the tabs an arrow lands on next, two at most, and no other`,
      running.length <= 2 &&
        running.every((one) => beside.includes(one.pane)) &&
        running.some((one) => one.pane === previewed),
      `focus on ${place(front)}, an arrow lands on ${beside.map(place).join(" or ")}: ${said(resting)}; ${restingLoops.line}`
    );
    kit.check(
      `${engine}: the focus gone from the strip, its reach over, every preview is held again and nothing off screen costs a frame`,
      left.every((one) => !one.runs) && leftLoops.costly === 0,
      `${REACH_COOL_MS + SETTLE_MS}ms after the focus left: ${said(left)}; ${leftLoops.line}`
    );
  };
  /**
   * Two arrow keys in one task from the quiet tab: each chooses its tab in
   * its own key (TabsList), and the second is the one selected.
   */
  const doubleArrow = async (on: Desk, engine: string) => {
    const { page } = on;
    await away(page, front);
    await page.waitForTimeout(SETTLE_MS);
    const strip = page
      .locator('[role="tab"][data-session-tab]')
      .filter({ visible: true });
    const ids = await strip.evaluateAll((tabs) =>
      tabs.map((one) => one.getAttribute("data-session-tab") ?? "")
    );
    const at = ids.indexOf(front);
    await keyFocus(page, strip.nth(at), front);
    await page.waitForTimeout(REACH_MS);
    const clicked = await page.evaluate(async () => {
      const seen: string[] = [];
      const heard = (event: Event) => {
        const tab = (event.target as Element | null)?.closest(
          '[role="tab"][data-session-tab]'
        );
        if (tab) {
          seen.push(tab.getAttribute("data-session-tab") ?? "?");
        }
      };
      addEventListener("click", heard, true);
      for (const _ of [1, 2]) {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowRight",
            bubbles: true,
            cancelable: true,
          })
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      removeEventListener("click", heard, true);
      return seen;
    });
    const selected = await page.evaluate(
      () =>
        document
          .querySelector('[role="tab"][data-session-tab][aria-selected="true"]')
          ?.getAttribute("data-session-tab") ?? ""
    );
    const place = (id: string) => ids.indexOf(id) + 1;
    kit.check(
      `${engine}: two arrow keys in one task each choose their tab, the second last`,
      clicked.length === 2 &&
        clicked[0] === ids[at + 1] &&
        clicked[1] === ids[at + 2] &&
        selected === ids[at + 2],
      `from tab ${at + 1}: the strip clicked ${clicked.map((id) => `tab ${place(id)}`).join(", ") || "nothing"}; tab ${place(selected)} selected; ${await stripOf(page, front)}`
    );
  };
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
    rest = REACH_MS,
    how: "pointer" | "keyboard" = "pointer"
  ) => {
    const { page, input, ready } = on;
    const got: { read?: Read; page?: PageBack } = {};
    const turns = kind === "busy" ? Math.round(absence / TURN_MS) : 0;
    // A keyboard return is untraced on every engine: the strip's own key, timed by the page.
    const traced = how === "pointer" ? input : null;
    const psi = await quietLeg(name, async () => {
      let before: Clock | null = null;
      if (kind === "past") {
        before = await clockOf(page, to);
        await pastBound(on);
      } else {
        const began = Date.now();
        await away(page, front);
        await page.waitForTimeout(SETTLE_MS);
        before = kind === "kept" ? await clockOf(page, to) : null;
        // Away from the busy tab, its session runs the absence's turns, landed before the return.
        if (turns > 0) {
          await scene.release(turns);
          // Its session still answering, nothing in a pane off screen costs a frame.
          loopReads.push({
            scene: name,
            ...(await hiddenLoopsOf(page, began + SWITCHED_MS)),
          });
          await page.waitForTimeout(LANDED_MS);
        }
        await page.waitForTimeout(Math.max(0, absence - (Date.now() - began)));
      }
      const hidden = kind === "busy" ? null : await clockOf(page, to);
      const waitFor = kind === "past" ? ready : undefined;
      got.read = traced
        ? await measureBack(page, traced, to, waitFor, rest)
        : await pressBack(page, to, how, waitFor, rest);
      if (kind !== "busy") {
        got.page = pageBack(
          before,
          hidden,
          await clockOf(page, to),
          got.read.pressAt,
          await postsOf(page),
          got.read
        );
      }
    });
    if (!got.read) {
      throw new Error(`tab-return: ${name} read nothing`);
    }
    // Its turns held, nothing moves the busy transcript after its window.
    const after =
      kind === "busy"
        ? await busyAfter(
            page,
            to,
            join(kit.out, `heights-${name.slice(0, 2)}.json`)
          )
        : {};
    const back: Back = {
      scene: name,
      kind,
      psi,
      ...got.read,
      ...(got.page ? { page: got.page } : {}),
      ...after,
    };
    backs.push(back);
    kit.note(noteOf(back, turns));
  };
  await leg(isolated, `1a: busy, back after ${SHORT_MS / 1000}s`, busy, "busy");
  await checkPaneLookup(kit, isolated.page, busy);
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
  /** Scene 2, every engine: the preview's returns. */
  const previewLegs = async () => {
    await leg(
      isolated,
      `2a: preview, back after ${SHORT_MS / 1000}s (kept, held)`,
      previewed,
      "kept"
    );
    await leg(isolated, "2b: preview, back past the bound", previewed, "past");
    await silentLeg(isolated, "Chromium");
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
      `2g: preview in the dashboard's process, back after ${SHORT_MS / 1000}s by the keyboard (kept, held)`,
      previewed,
      "kept",
      SHORT_MS,
      REACH_MS,
      "keyboard"
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
    await leg(
      webkit,
      `2f (WebKit): preview, back after ${SHORT_MS / 1000}s by the keyboard (kept, held)`,
      previewed,
      "kept",
      SHORT_MS,
      REACH_MS,
      "keyboard"
    );
    await leg(
      webkit,
      `2h (WebKit): preview, back after ${SHORT_MS / 1000}s by the keyboard's first arrow into the strip, with no rest (kept, held)`,
      previewed,
      "kept",
      SHORT_MS,
      0,
      "keyboard"
    );
    await keyReach(webkit, "WebKit");
    await doubleArrow(webkit, "WebKit");
    await silentLeg(webkit, "WebKit");
  };
  // TAB_RETURN_LEGS=busy: scene 1 alone, its busy returns, then 1a and 1b
  // again on WebKit, each a person's press.
  if (process.env.TAB_RETURN_LEGS === "busy") {
    await isolated.page.close();
    const webkit = await desk([front, busy, previewed], front, "webkit");
    await leg(
      webkit,
      `1a (WebKit): busy, back after ${SHORT_MS / 1000}s`,
      busy,
      "busy"
    );
    await leg(
      webkit,
      `1b (WebKit): busy, back after ${BACKLOG_MS / 60_000} min`,
      busy,
      "busy",
      BACKLOG_MS
    );
    await webkit.page.close();
  } else {
    await previewLegs();
  }
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
    // An untraced busy return (WebKit's) has no task to read: the frame the
    // dashboard draws first after the press stands for it, on this CPU.
    if (!back.traced && back.kind === "busy") {
      kit.check(
        `${back.scene}: the dashboard's first frame after the press comes within ${2 * LONG_TASK_MS}ms`,
        (back.frames[0] ?? Number.POSITIVE_INFINITY) <= 2 * LONG_TASK_MS,
        `frames ${back.frames.slice(0, 6).join(", ")}ms after the press`
      );
    }
    if (back.traced) {
      kit.check(
        `${back.scene}: the press paints within ${INPUT_MS}ms`,
        back.inputMs < INPUT_MS,
        back.input
      );
    }
    checkPage(kit, back);
  }
  checkQuiet(kit, silentReads, loopReads);
};

const spec: Spec = { name: "tab-return", run };
export default spec;
