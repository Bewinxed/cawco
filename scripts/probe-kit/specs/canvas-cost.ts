/**
 * What a component canvas frame costs to load and to keep, read from the
 * engine: the dashboard's own stage (stage-host/host.ts, built from this
 * checkout as canvas-preload builds it), each frame a decision page's
 * Preview of one story (`by=embed`, core `canvasEmbedUrl`).
 *
 * Legs (`--legs trace,frame,page`, all by default):
 *
 * - `trace`: one frame's load, end to end, on a stage just started (cold),
 *   then again with the stage warm and a fresh browser cache, then a third
 *   time with the browser's cache warm too. Each is broken into the server
 *   (Vite's own `vite:transform` and `vite:time` lines: the modules it
 *   transformed for the load, their time, the slowest ten), the network
 *   (requests, bytes, the import chain's depth in round trips, when the last
 *   module arrived) and the browser (the page's main thread in a DevTools
 *   trace, Chromium: compile, module evaluation, other script, style,
 *   layout, paint, GC; and the sampled script time by where it runs: the
 *   framework, the components, the canvas runtime, Vite's client). WebKit
 *   gives its resources and when it drew, from the page's own timeline.
 * - `frame`: one frame's keep on a warm stage, each engine: resources it
 *   asked for and their decoded bytes (scripts, styles), the scripts its
 *   realm parsed and the modules it evaluated (Chromium), its realm's JS
 *   heap after a GC (Chromium) or its web process's memory (WebKit, read
 *   with no inspector), and the animation-frame callbacks it runs in 20 s
 *   idle.
 * - `page`: a page of `--embeds` (33, caw-panel's count) frames, each on its
 *   turn as embed-turns.ts gives them, each engine: time until every frame
 *   said its shape, the browser's CPU until then, the holding page's frame
 *   cadence while they load (p95), and the browser's memory sampled over
 *   `--idle` seconds (240) after (WebKit's, and its idle CPU, read with no
 *   inspector).
 * - `shared`: the same stories drawn inline in one frame, read alike.
 * - `decision`: a decision page of `--embeds` Previews on the decision host,
 *   at the owner's window: its first screen until every Preview in it is
 *   drawn, then scrolled to its end at a person's pace (`--scroll`, px a
 *   second): the time, frames, requests and page memory at each (WebKit's
 *   page run with no inspector), and every 50 ms while scrolling, whether a
 *   Preview in view stood drawn, as its skeleton, or empty.
 * - `raf`: a story running an animation-frame loop, its frame in view, in a
 *   pane the dashboard put away (directly, and through a decision page's
 *   relay) and one below the page's fold: the callbacks each runs in 20 s
 *   idle, and again once back or scrolled to.
 * - `rekey`: a write no page is served from costs the next frame nothing;
 *   an edit to an imported file reaches the open canvas and the next frame.
 * - `memory`: a decision page of ten canvas Previews in WebKit, served as
 *   the hub serves one (the preview overlay in every frame): its web
 *   process's memory once drawn, over `--idle` seconds untouched, and each
 *   time it is taken away and opened again (`--rounds`), in WebKit with no
 *   inspector, beside a control page of frames holding plain objects; and,
 *   asked for (`--memory-runs playwright,playwright-control`), the same
 *   under Playwright, whose inspector keeps every frame a page takes away.
 *
 * Every WebKit memory and idle reading is taken in WebKit with no inspector
 * (`noInspectorWebKit`): Playwright's own WebKit can't show what a page lets
 * go of.
 *
 * Numbers go to `numbers.json` in the spec's output folder, and each is a
 * NOTE line. The checks are what a frame owes: it draws, and it loads no
 * module its story's closure does not reach.
 *
 *   bun scripts/probe-kit/run.ts canvas-cost [--legs trace,page,shared,frame,raf,decision,memory] [--engines chromium,webkit] [--embeds 33] [--idle 240] [--story <file>#<story>] [--scroll 1200] [--rounds 6] [--memory-runs uninspected,collected,collected-control] [--memory-page decision]
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one frame at a time, as the page gives them turns
import { type ChildProcess, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, totalmem } from "node:os";
import { join, relative } from "node:path";
import { type CDPSession, type Page, webkit } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { readWithin } from "../../../packages/core/src/bounded";
import { signalGroup, spawnedPid } from "../../../packages/core/src/signal";
import { until } from "../../scratch-fleet";
import { scratchCertificate } from "../cloudflare-front";
import {
  CAWCO_BRIDGE,
  idOf as decisionId,
  EMBED_FRAME,
  embedOrigin,
  startDecisionStage,
} from "../decision-embeds";
import { type Engine, type Kit, ROOT, type Spec, safariParity } from "../kit";
import { type SafariPage, safariBridge } from "../safari-bridge";

const APP = join(ROOT, "apps/dashboard");

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const LEGS = new Set((arg("legs") ?? "trace,page,shared,frame,raf").split(","));
const ENGINES = (arg("engines") ?? "chromium,webkit").split(",") as Engine[];
const EMBEDS = Number(arg("embeds") ?? 33);
/** How many times the boot leg boots its frame; each phase its median. */
const BOOTS = Number(arg("boots") ?? 5);
const IDLE_S = Number(arg("idle") ?? 240);
const LATENCIES = (arg("latencies") ?? "50,350").split(",").map(Number);
/** The frame the trace and frame legs read: `<states file>#<story>`. */
const TRACED = arg("story") ?? "src/lib/cawco/home/NeedsCard.stories.ts";
/** How long a frame may take to say its shape. */
const DRAW_MS = 180_000;
/** The quiet a frame's rAF count is read over. The brief's. */
const RAF_IDLE_MS = 20_000;

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/* --- The stage, and what Vite says it did ------------------------------- */

/** A line of Vite's debug timing: when, which channel, how long, of what. */
interface ServerLine {
  at: number;
  kind: "time" | "transform";
  ms: number;
  url: string;
}

interface Stage {
  base: string;
  lines: ServerLine[];
  process: ChildProcess;
  /** Everything it said, stdout and stderr. */
  said: () => string;
  stop: () => void;
}

const DEBUG_LINE =
  /^(\d{4}-\d\d-\d\dT[\d:.]+Z) vite:(time|transform) ([\d.]+)ms\s+(?:\[skipped\] )?(\S+)/;

let hostBuilt: Promise<string> | undefined;

/** Where a stage starts, and how: the dashboard (SvelteKit) unless named; `bundledDev` turns on Vite's experimental bundled dev mode in its server. */
interface StageAt {
  bundledDev?: boolean;
  framework?: string;
  kit?: boolean;
  root?: string;
}

/** The text Vite's `createServer` options start with in the built host: the bundled dev mode goes in beside it. */
const CONFIG_LOADER = 'configLoader:"native"';

/** A stage, started fresh from this checkout's host (the dashboard's unless `at` names another root), Vite's request and transform times on its stderr. */
async function startStage(at: StageAt = {}): Promise<Stage> {
  hostBuilt ??= buildStageHost();
  const root = at.root ?? APP;
  const host = join(root, ".cawco/stage/host.mjs");
  mkdirSync(join(root, ".cawco/stage"), { recursive: true });
  let text = await hostBuilt;
  if (at.bundledDev) {
    if (!text.includes(CONFIG_LOADER)) {
      throw new Error(
        `the built host has no ${CONFIG_LOADER} to put bundled dev beside`
      );
    }
    text = text.replace(
      CONFIG_LOADER,
      `${CONFIG_LOADER},experimental:{bundledDev:!0}`
    );
  }
  writeFileSync(host, text);
  const port = await freePort();
  const child = spawn("bun", [host], {
    cwd: root,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: at.framework ?? "svelte",
      CAWCO_STAGE_KIT: (at.kit ?? !at.root) ? "1" : "0",
      CAWCO_STAGE_TOOLCHAIN: "vite",
      DEBUG: "vite:time,vite:transform",
      DEBUG_COLORS: "0",
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let said = "";
  const lines: ServerLine[] = [];
  let partial = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    said += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    partial += chunk.toString("utf8");
    const all = partial.split("\n");
    partial = all.pop() ?? "";
    for (const line of all) {
      const m = line.match(DEBUG_LINE);
      if (m) {
        lines.push({
          at: Date.parse(m[1] as string),
          kind: m[2] as ServerLine["kind"],
          ms: Number(m[3]),
          url: m[4] as string,
        });
      }
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    said += chunk.toString("utf8");
  });
  await until(
    "the stage's ready",
    () => said,
    (words) =>
      words.includes('"cawco":"ready"') || words.includes('"cawco":"fatal"'),
    120_000
  );
  if (!said.includes('"cawco":"ready"')) {
    child.kill("SIGTERM");
    throw new Error(`the stage did not start: ${said.slice(-1500)}`);
  }
  return {
    base: `http://127.0.0.1:${port}`,
    lines,
    process: child,
    said: () => said,
    stop: () => child.kill("SIGTERM"),
  };
}

/** Every states file of the dashboard, from its root. */
function statesFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const one of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, one.name);
      if (one.isDirectory()) {
        // The spec's own looping story stands apart: the page reads the app's.
        if (
          !one.name.startsWith(".") &&
          one.name !== "node_modules" &&
          one.name !== "probe-canvas-cost"
        ) {
          walk(at);
        }
      } else if (one.name.endsWith(".stories.ts")) {
        out.push(relative(APP, at));
      }
    }
  };
  walk(join(APP, "src"));
  return out.sort();
}

/** Each states file's stories, as the stage reads them. */
async function storiesOf(
  base: string,
  files: string[]
): Promise<{ file: string; story: string }[]> {
  const all: { file: string; story: string }[] = [];
  for (const file of files) {
    const read = (await (
      await fetch(`${base}/__cawco/stories?file=${encodeURIComponent(file)}`)
    ).json()) as { stories?: { name: string }[] };
    for (const one of read.stories ?? []) {
      all.push({ file, story: one.name });
    }
  }
  return all;
}

/** A Preview's address of one story: `by=embed`, as core `canvasEmbedUrl` writes it. */
const embedUrl = (base: string, file: string, story?: string): string => {
  const url = new URL(`${base}/@cawco/canvas`);
  url.searchParams.set("file", file);
  url.searchParams.set("by", "embed");
  if (story) {
    url.searchParams.set("story", story);
  }
  return url.href;
};

/* --- Processes: the browser's CPU and memory ---------------------------- */

const TICK_MS = 1000 / 100;
const PID = /^\d+$/;
const PSS = /^Pss:\s+(\d+) kB/m;
/** A keyed module's address, its key taken off: the module's own address. */
const KEYED_PREFIX = /^\/@cawco\/m\/[^/]+/;
/** A line of the stage's own words that says something went wrong. */
const STAGE_TROUBLE = /error|fatal|warn/i;
const PAGE_BYTES = 4096;

/** Every process under `roots` (and the roots), read from /proc. */
function treeOf(roots: number[]): number[] {
  const parents = new Map<number, number[]>();
  for (const name of readdirSync("/proc")) {
    if (!PID.test(name)) {
      continue;
    }
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      parents.set(ppid, [...(parents.get(ppid) ?? []), Number(name)]);
    } catch {
      // ended
    }
  }
  const out = new Set<number>(roots);
  const queue = [...roots];
  for (const pid of queue) {
    for (const child of parents.get(pid) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        queue.push(child);
      }
    }
  }
  return [...out];
}

const cmdline = (pid: number): string => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
  } catch {
    return "";
  }
};

/** The browser processes this run started: every process under it but the stages'. */
function browserPids(stages: Stage[]): number[] {
  const staged = new Set(
    treeOf(stages.map((one) => one.process.pid as number))
  );
  return treeOf([process.pid]).filter(
    (pid) => pid !== process.pid && !staged.has(pid) && cmdline(pid) !== ""
  );
}

/** CPU time of `pids`, ms. */
function cpuMs(pids: number[]): number {
  let ticks = 0;
  for (const pid of pids) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      ticks += Number(fields[11]) + Number(fields[12]);
    } catch {
      // ended
    }
  }
  return ticks * TICK_MS;
}

/** The CPU of `pids`' threads by their name (`/proc/<pid>/task/<tid>/comm`), ms: where a process's time went. */
function cpuByThread(pids: number[]): Record<string, number> {
  const by: Record<string, number> = {};
  for (const pid of pids) {
    let tasks: string[] = [];
    try {
      tasks = readdirSync(`/proc/${pid}/task`);
    } catch {
      // ended
    }
    for (const tid of tasks) {
      try {
        const name = readFileSync(
          `/proc/${pid}/task/${tid}/comm`,
          "utf8"
        ).trim();
        const stat = readFileSync(`/proc/${pid}/task/${tid}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        by[name] =
          (by[name] ?? 0) + (Number(fields[11]) + Number(fields[12])) * TICK_MS;
      } catch {
        // ended
      }
    }
  }
  return by;
}

/** What each thread name spent from `before` to `after` ({@link cpuByThread}), the most first, those that spent none left out. */
const threadsSpent = (
  before: Record<string, number>,
  after: Record<string, number>
): [string, number][] =>
  Object.entries(after)
    .map(([name, ms]): [string, number] => [name, ms - (before[name] ?? 0)])
    .filter(([, ms]) => ms > 0)
    .sort((one, two) => two[1] - one[1]);

/** Proportional memory of `pids` (their PSS; RSS where it doesn't read), MB. */
function memoryMb(pids: number[]): number {
  let kb = 0;
  for (const pid of pids) {
    try {
      const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
      kb += Number(rollup.match(PSS)?.[1] ?? 0);
    } catch {
      try {
        const statm = readFileSync(`/proc/${pid}/statm`, "utf8").split(" ");
        kb += (Number(statm[1]) * PAGE_BYTES) / 1024;
      } catch {
        // ended
      }
    }
  }
  return Math.round(kb / 1024);
}

/** WebKit's own native heap, libpas's pages (WTF FastMalloc.cpp `bmalloc::api::malloc`), as its web process names their mappings. */
const WEBKIT_HEAP = "[anon:WKFastMalloc]";

/** The proportional memory of `pids`' mappings named `name` (smaps), MB. */
function namedMb(pids: number[], name: string): number {
  let kb = 0;
  for (const pid of pids) {
    let at = false;
    try {
      for (const line of readFileSync(`/proc/${pid}/smaps`, "utf8").split(
        "\n"
      )) {
        if (SMAPS_HEAD.test(line)) {
          at = line.endsWith(` ${name}`);
        } else if (at && line.startsWith("Pss:")) {
          kb += Number(line.split(SPACES)[1]);
        }
      }
    } catch {
      // ended
    }
  }
  return Math.round(kb / 1024);
}
/** A mapping's head line in smaps: its address range first. */
const SMAPS_HEAD = /^[0-9a-f]+-[0-9a-f]+ /;
const SPACES = /\s+/;

/** The processes that run pages: Chromium's renderers, WebKit's web processes. */
const pageProcesses = (pids: number[]): number[] =>
  pids.filter((pid) => {
    const line = cmdline(pid);
    return line.includes("--type=renderer") || line.includes("WebProcess");
  });

/* --- In the page ---------------------------------------------------------- */

/** One document's census ({@link idleCensus}): what it ran over its last five seconds. */
interface Census {
  /** Its animation-frame callbacks. */
  frames: number;
  href: string;
  /** Whether any of it stands in the top document's view. */
  inView: boolean;
  /** Its loops running: animations running on an element the dashboard marks as one (`loops`, design.css), which it holds wherever nobody can see them. */
  loops: number;
  /** Its animations running, each as `<name> on <element>`. */
  running: string[];
  /** Who asked for its animation frames: the callers' stacks, the most asking first, and how many each asked for. */
  sites: [string, number][];
  /** Its timers' runs. */
  timers: number;
}

/**
 * Installed in every frame: what it runs while it stands untouched, told
 * to the top document every five seconds, which keeps each document's
 * latest (`__census()`): its animation-frame callbacks and its timers' runs
 * in those five seconds and who asked for the frames, its animations
 * running and what each animates, and whether any of it stands in the
 * top's view.
 */
function idleCensus(): void {
  const id = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  let frames = 0;
  let timers = 0;
  let sites: Record<string, number> = {};
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    // The callers, this wrapper's own line left out.
    const site = (new Error("the caller of requestAnimationFrame").stack ?? "")
      .split("\n")
      .slice(1, 6)
      // biome-ignore lint/performance/useTopLevelRegex: this function runs in the page, where none of this module's scope is
      .map((line) => line.trim().replace(/\/@cawco\/m\/[^/]+/, ""))
      .join(" < ");
    sites[site] = (sites[site] ?? 0) + 1;
    return raf((time) => {
      frames += 1;
      callback(time);
    });
  };
  const counted =
    (handler: TimerHandler): TimerHandler =>
    (...args: unknown[]) => {
      timers += 1;
      if (typeof handler === "function") {
        handler(...args);
      }
    };
  const later = window.setTimeout.bind(window);
  const every = window.setInterval.bind(window);
  window.setTimeout = ((
    handler: TimerHandler,
    ms?: number,
    ...rest: unknown[]
  ) => later(counted(handler), ms, ...rest)) as typeof setTimeout;
  window.setInterval = ((
    handler: TimerHandler,
    ms?: number,
    ...rest: unknown[]
  ) => every(counted(handler), ms, ...rest)) as typeof setInterval;
  let inView = false;
  addEventListener("DOMContentLoaded", () => {
    // In a frame, the implicit root is the top document's view.
    new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false;
    }).observe(document.documentElement);
  });
  if (window === top) {
    const latest = new Map<string, Census>();
    (window as unknown as { __census: () => Census[] }).__census = () => [
      ...latest.values(),
    ];
    addEventListener("message", (event) => {
      const said = event.data as
        ({ type?: unknown; id?: unknown } & Census) | null;
      if (said?.type === "probe:census" && typeof said.id === "string") {
        latest.set(said.id, {
          href: said.href,
          inView: said.inView,
          frames: said.frames,
          timers: said.timers,
          loops: said.loops,
          running: said.running,
          sites: said.sites,
        });
      }
    });
  }
  // Its own clock, uncounted.
  const nameOf = (one: Animation): string => {
    if (one instanceof CSSAnimation) {
      return one.animationName;
    }
    if (one instanceof CSSTransition) {
      return `transition ${one.transitionProperty}`;
    }
    return one.id || "script";
  };
  every(() => {
    const runs = document
      .getAnimations()
      .filter((one) => one.playState === "running");
    const targetOf = (one: Animation) =>
      (one.effect as KeyframeEffect | null)?.target ?? null;
    const loops = runs.filter((one) =>
      targetOf(one)?.classList.contains("loops")
    ).length;
    const running = runs.map((one) => {
      const target = targetOf(one);
      const name = nameOf(one);
      const on = target
        ? `${target.tagName.toLowerCase()}${target.classList[0] ? `.${target.classList[0]}` : ""}`
        : "nothing";
      return `${name} on ${on}`;
    });
    top?.postMessage(
      {
        type: "probe:census",
        id,
        href: location.href,
        inView,
        frames,
        timers,
        loops,
        running,
        sites: Object.entries(sites)
          .sort((one, two) => two[1] - one[1])
          .slice(0, 3),
      },
      "*"
    );
    frames = 0;
    timers = 0;
    sites = {};
  }, 5000);
}

/** A census's document by what it draws: its states file and story (a canvas's `file=` and `story=`), or its path. */
const documentOf = (href: string): string => {
  const at = new URL(href);
  const file = at.searchParams.get("file");
  return file ? `${file}#${at.searchParams.get("story") ?? ""}` : at.pathname;
};

/** The census of every document in words: how many stand in view and out, what they run, and each one that runs anything. */
function censusWords(all: readonly Census[]): {
  busy: {
    document: string;
    frames: number;
    inView: boolean;
    running: string[];
    sites: [string, number][];
    timers: number;
  }[];
  inView: number;
  outOfView: number;
  outOfViewBusy: number;
  /** Frames out of view running a loop ({@link Census} `loops`). */
  outOfViewLooping: number;
  framesPerS: number;
  timersPerS: number;
  running: Record<string, number>;
} {
  const out = all.filter((one) => !one.inView);
  const running: Record<string, number> = {};
  for (const one of all) {
    for (const name of one.running) {
      const key = `${one.inView ? "in view" : "out of view"}: ${name}`;
      running[key] = (running[key] ?? 0) + 1;
    }
  }
  return {
    inView: all.length - out.length,
    outOfView: out.length,
    outOfViewBusy: out.filter((one) => one.frames > 0 || one.running.length > 0)
      .length,
    outOfViewLooping: out.filter((one) => one.loops > 0).length,
    framesPerS: all.reduce((sum, one) => sum + one.frames, 0) / 5,
    timersPerS: all.reduce((sum, one) => sum + one.timers, 0) / 5,
    running,
    busy: all
      .filter(
        (one) => one.frames > 0 || one.timers > 0 || one.running.length > 0
      )
      .map((one) => ({
        document: documentOf(one.href),
        inView: one.inView,
        frames: one.frames,
        timers: one.timers,
        running: one.running,
        sites: one.sites,
      })),
  };
}

/** Installed before the page's own scripts: when the frame said its shape, and every animation-frame callback it runs. */
function installCounters(): void {
  const w = window as unknown as {
    __cost: {
      drawnAt: number | null;
      fetchedAt: number | null;
      raf: number;
      /** While set, each animation frame asked for is counted by the stack that asked for it. */
      sites: Record<string, number> | null;
    };
  };
  w.__cost = { drawnAt: null, fetchedAt: null, raf: 0, sites: null };
  // Every resource kept: the default buffer holds 250, a canvas asks for hundreds.
  performance.setResourceTimingBufferSize(100_000);
  addEventListener("message", (event) => {
    const type = (event.data as { type?: string } | null)?.type;
    if (type === "cawco:embed-size" && w.__cost.drawnAt === null) {
      w.__cost.drawnAt = performance.now();
      performance.mark("cawco-drawn");
    }
    if (type === "cawco:embed-fetched" && w.__cost.fetchedAt === null) {
      w.__cost.fetchedAt = performance.now();
    }
  });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const { sites } = w.__cost;
    if (sites) {
      // The callers, this wrapper's own line left out.
      const site = (
        new Error("the caller of requestAnimationFrame").stack ?? ""
      )
        .split("\n")
        .slice(1, 7)
        // biome-ignore lint/performance/useTopLevelRegex: this function runs in the page, where none of this module's scope is
        .map((line) => line.trim().replace(/\/@cawco\/m\/[^/]+/, ""))
        .join(" < ");
      sites[site] = (sites[site] ?? 0) + 1;
    }
    return raf((time) => {
      w.__cost.raf += 1;
      callback(time);
    });
  };
}

/** What the frame's own timeline says: its resources, their bytes by kind, the moments. */
function timeline() {
  // biome-ignore lint/performance/useTopLevelRegex: this function runs in the page, where none of this module's scope is
  const style = /\.(css|scss|pcss|postcss)(\?|$)|[?&]type=style|lang\.css/;
  const nav = performance.getEntriesByType("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  const resources = performance.getEntriesByType(
    "resource"
  ) as PerformanceResourceTiming[];
  const cost = (
    window as unknown as {
      __cost: { drawnAt: number | null; fetchedAt: number | null };
    }
  ).__cost;
  let scripts = 0;
  let styles = 0;
  let other = 0;
  let lastModule = 0;
  for (const one of resources) {
    const bytes = one.decodedBodySize || 0;
    if (style.test(one.name)) {
      styles += bytes;
    } else if (
      one.initiatorType === "script" ||
      one.initiatorType === "link" ||
      one.initiatorType === "other"
    ) {
      scripts += bytes;
    } else {
      other += bytes;
    }
    if (cost.drawnAt === null || one.responseEnd <= cost.drawnAt) {
      lastModule = Math.max(lastModule, one.responseEnd);
    }
  }
  const inlineStyle = [...document.querySelectorAll("style")].reduce(
    (sum, one) => sum + (one.textContent?.length ?? 0),
    0
  );
  return {
    requests: resources.length + 1,
    scriptBytes: scripts,
    styleBytes: styles,
    otherBytes: other,
    inlineStyleChars: inlineStyle,
    documentBytes: nav?.decodedBodySize ?? 0,
    firstByte: nav?.responseStart ?? 0,
    lastModule,
    fetchedAt: cost.fetchedAt,
    drawnAt: cost.drawnAt,
    paint:
      performance
        .getEntriesByType("paint")
        .find((one) => one.name === "first-contentful-paint")?.startTime ??
      null,
    preloads: document.querySelectorAll('link[rel="modulepreload"]').length,
    // A section that says why it didn't load drew no story.
    failed: [...document.querySelectorAll(".cawco-section-failed")].map(
      (one) => one.textContent?.slice(0, 600) ?? ""
    ),
    frames: document.querySelectorAll(".cawco-frame").length,
    styleSheets: document.styleSheets.length,
    elements: document.getElementsByTagName("*").length,
  };
}
type Timeline = ReturnType<typeof timeline>;

const drawn = (page: Page) =>
  page.waitForFunction(
    () =>
      ((window as unknown as { __cost?: { drawnAt: number | null } }).__cost
        ?.drawnAt ?? null) !== null,
    undefined,
    { timeout: DRAW_MS, polling: 100 }
  );

/* --- The trace: where one frame's load goes ------------------------------ */

interface TraceEvent {
  args?: { data?: Record<string, unknown>; name?: string };
  cat: string;
  dur?: number;
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
}

/** A main-thread event's group, as DevTools' summary counts them. */
const GROUPS: [RegExp, string][] = [
  [
    /^(v8\.compile|V8\.Compile|v8\.parseOnBackground|CompileScript|v8\.compileModule)/,
    "compile",
  ],
  [/^v8\.evaluateModule$/, "evaluate modules"],
  [/^(ParseHTML|HTMLDocumentParser)/, "parse HTML"],
  [
    /^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet|ScheduleStyleRecalculation|Document::updateStyle)/,
    "style",
  ],
  [/^(Layout|UpdateLayerTree|LayoutShift)/, "layout"],
  [
    /^(Paint|PrePaint|Commit|CompositeLayers|RasterTask|PaintImage|Layerize|UpdateLayer)/,
    "paint",
  ],
  [/(GC|Gc|gc\b|MinorGC|MajorGC|BlinkGC)/, "GC"],
  [
    /^(FunctionCall|EvaluateScript|v8\.run|v8\.callFunction|RunMicrotasks|EventDispatch|TimerFire|FireAnimationFrame|v8\.execute|V8\.Execute|XHRReadyStateChange|FireIdleCallback)/,
    "script",
  ],
];
const groupOf = (name: string): string =>
  GROUPS.find(([re]) => re.test(name))?.[1] ?? "other";

/** Self time by group on the renderer's busiest main thread, between `from` and `to` (trace µs). */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass picks the thread, nests its events and sums each one's self time
function mainThreadSelf(
  events: TraceEvent[],
  from: number,
  to: number
): {
  busy: number;
  groups: Record<string, number>;
  names: Record<string, number>;
} {
  const threads = new Map<string, string>();
  for (const one of events) {
    if (one.ph === "M" && one.name === "thread_name") {
      threads.set(`${one.pid}:${one.tid}`, String(one.args?.name ?? ""));
    }
  }
  const byThread = new Map<string, TraceEvent[]>();
  for (const one of events) {
    const key = `${one.pid}:${one.tid}`;
    if (threads.get(key) !== "CrRendererMain" || one.ph !== "X") {
      continue;
    }
    if (one.ts + (one.dur ?? 0) < from || one.ts > to) {
      continue;
    }
    byThread.set(key, [...(byThread.get(key) ?? []), one]);
  }
  let best: TraceEvent[] = [];
  let bestBusy = 0;
  for (const list of byThread.values()) {
    const busy = list
      .filter(
        (one) =>
          one.name === "RunTask" || one.name === "ThreadControllerImpl::RunTask"
      )
      .reduce((sum, one) => sum + (one.dur ?? 0), 0);
    if (busy > bestBusy) {
      best = list;
      bestBusy = busy;
    }
  }
  // Self time: each event's duration less its direct children's.
  const sorted = best.sort(
    (a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0)
  );
  const self = new Map<TraceEvent, number>();
  const stack: TraceEvent[] = [];
  for (const one of sorted) {
    while (stack.length > 0) {
      const top = stack.at(-1) as TraceEvent;
      if (one.ts >= top.ts + (top.dur ?? 0)) {
        stack.pop();
      } else {
        break;
      }
    }
    const parent = stack.at(-1);
    self.set(one, one.dur ?? 0);
    if (parent) {
      self.set(parent, (self.get(parent) ?? 0) - (one.dur ?? 0));
    }
    stack.push(one);
  }
  const groups: Record<string, number> = {};
  const names: Record<string, number> = {};
  let taskSelf = 0;
  for (const [one, time] of self) {
    if (
      one.name === "RunTask" ||
      one.name === "ThreadControllerImpl::RunTask"
    ) {
      taskSelf += time / 1000;
      continue;
    }
    const group = groupOf(one.name);
    groups[group] = (groups[group] ?? 0) + time / 1000;
    names[one.name] = (names[one.name] ?? 0) + time / 1000;
  }
  groups.task = taskSelf;
  return { busy: bestBusy / 1000, groups, names };
}

/** Sampled script self time by where it runs, ms. */
function scriptBy(profile: {
  nodes: { callFrame: { url: string; functionName: string }; id: number }[];
  samples: number[];
  timeDeltas: number[];
}): Record<string, number> {
  const urls = new Map(profile.nodes.map((one) => [one.id, one.callFrame]));
  const out: Record<string, number> = {};
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one sample's place, named by where its code was served from
  profile.samples.forEach((id, at) => {
    const frame = urls.get(id);
    const url = frame?.url ?? "";
    const name = frame?.functionName ?? "";
    let where = "other script";
    if (name === "(idle)") {
      return;
    }
    if (name === "(program)") {
      where = "(program: engine work outside JS)";
    } else if (name === "(garbage collector)") {
      where = "(garbage collector)";
    } else if (url.includes("cawco:stage/runtime")) {
      where = "canvas runtime";
    } else if (
      url.includes("@vite/client") ||
      url.includes("vite/dist/client")
    ) {
      where = "Vite's client";
    } else if (url.includes("/.vite/deps/") || url.includes("node_modules")) {
      where = url.includes("svelte") ? "framework (svelte deps)" : "other deps";
    } else if (url.includes("/src/")) {
      where = "project source (components, stories)";
    } else if (url.includes("cawco:")) {
      where = "stage's virtual modules";
    }
    out[where] = (out[where] ?? 0) + (profile.timeDeltas[at] ?? 0) / 1000;
  });
  return Object.fromEntries(
    Object.entries(out)
      .map(([k, v]) => [k, Math.round(v)] as const)
      .sort((a, b) => b[1] - a[1])
  );
}

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "v8",
  "v8.execute",
  "blink.user_timing",
  "loading",
  "blink",
  "disabled-by-default-v8.compile",
].join(",");

interface LoadRead {
  browser: {
    busyMs: number;
    groups: Record<string, number>;
    topNames: [string, number][];
    scriptBy: Record<string, number>;
  } | null;
  drawnMs: number | null;
  failed: string[];
  fetchedMs: number | null;
  frames: number;
  network: {
    depth: number | null;
    requests: number;
    scriptBytes: number;
    styleBytes: number;
    firstByteMs: number;
    lastModuleMs: number;
  };
  paintMs: number | null;
  preloads: number;
  server: {
    cpuMs: number;
    requests: number;
    requestMs: number;
    transformed: number;
    transformMs: number;
    slowest: [string, number][];
  };
}

/** One load of `url` read whole: the trace (Chromium), the network, the server's lines while it loaded; each request answered `latency` ms late when asked. */
async function readLoad(
  page: Page,
  url: string,
  stage: Stage,
  traced: boolean,
  latency = 0
): Promise<LoadRead> {
  if (latency > 0) {
    // Each answer `latency` late, fetched outside the browser's own connections as the hub's HTTP/2 proxy answers many at once (canvas-preload's stand-in).
    await page.route("**/*", async (route) => {
      await Bun.sleep(latency);
      await route.fulfill({ response: await route.fetch() });
    });
  }
  const cdp: CDPSession | null = traced
    ? await page.context().newCDPSession(page)
    : null;
  const events: TraceEvent[] = [];
  /** Each request's initiator, by its URL: the import chain's depth. */
  const initiator = new Map<string, string | null>();
  if (cdp) {
    await cdp.send("Network.enable");
    cdp.on("Network.requestWillBeSent", (event) => {
      const by =
        event.initiator?.url ??
        event.initiator?.stack?.callFrames?.[0]?.url ??
        null;
      if (!initiator.has(event.request.url)) {
        initiator.set(event.request.url, by);
      }
    });
    cdp.on("Tracing.dataCollected", (event) => {
      events.push(...(event.value as unknown as TraceEvent[]));
    });
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Tracing.start", {
      categories: TRACE_CATEGORIES,
      transferMode: "ReportEvents",
    });
    await cdp.send("Profiler.start");
  }
  const stageTree = () => treeOf([stage.process.pid as number]);
  const serverCpu0 = cpuMs(stageTree());
  const start = Date.now();
  await page.goto(url, { waitUntil: "commit", timeout: DRAW_MS });
  await drawn(page);
  const drawnWall = Date.now();
  const serverCpu = Math.round(cpuMs(stageTree()) - serverCpu0);
  // The frame's own settle after it said its shape (its fonts, its effects).
  await Bun.sleep(500);
  const read = (await page.evaluate(timeline)) as Timeline;
  let browser: LoadRead["browser"] = null;
  if (cdp) {
    const { profile } = (await cdp.send("Profiler.stop")) as {
      profile: Parameters<typeof scriptBy>[0];
    };
    const done = new Promise<void>((resolve) =>
      cdp.once("Tracing.tracingComplete", () => resolve())
    );
    await cdp.send("Tracing.end");
    await done;
    const drawnMark = events.find((one) => one.name === "cawco-drawn");
    const [navStart] = events
      .filter(
        (one) =>
          one.name === "ResourceSendRequest" &&
          String(one.args?.data?.url ?? "") === url
      )
      .map((one) => one.ts)
      .sort((a, b) => a - b);
    if (drawnMark && navStart) {
      const main = mainThreadSelf(events, navStart, drawnMark.ts);
      browser = {
        busyMs: Math.round(main.busy),
        groups: Object.fromEntries(
          Object.entries(main.groups)
            .map(([k, v]) => [k, Math.round(v)] as const)
            .sort((a, b) => b[1] - a[1])
        ),
        topNames: Object.entries(main.names)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([k, v]) => [k, Math.round(v)]),
        scriptBy: scriptBy(profile),
      };
    }
    await cdp.detach();
  }
  // The import chain's depth: each request one round trip past its initiator's.
  let depth: number | null = null;
  if (cdp) {
    const memo = new Map<string, number>();
    const depthOf = (one: string, seen: Set<string>): number => {
      const known = memo.get(one);
      if (known !== undefined) {
        return known;
      }
      const by = initiator.get(one);
      const d =
        by && initiator.has(by) && !seen.has(by)
          ? depthOf(by, new Set([...seen, one])) + 1
          : 1;
      memo.set(one, d);
      return d;
    };
    depth = Math.max(
      0,
      ...[...initiator.keys()].map((one) => depthOf(one, new Set()))
    );
  }
  const during = stage.lines.filter(
    (one) => one.at >= start - 50 && one.at <= drawnWall + 50
  );
  const transforms = during.filter((one) => one.kind === "transform");
  const requests = during.filter(
    (one) => one.kind === "time" && one.url.startsWith("/@cawco/m/")
  );
  return {
    browser,
    network: {
      depth,
      requests: read.requests,
      scriptBytes: read.scriptBytes,
      styleBytes: read.styleBytes,
      firstByteMs: Math.round(read.firstByte),
      lastModuleMs: Math.round(read.lastModule),
    },
    server: {
      cpuMs: serverCpu,
      requests: requests.length,
      requestMs: Math.round(requests.reduce((s, one) => s + one.ms, 0)),
      transformed: transforms.length,
      transformMs: Math.round(transforms.reduce((s, one) => s + one.ms, 0)),
      slowest: transforms
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 10)
        .map((one) => [one.url, Math.round(one.ms)]),
    },
    drawnMs: read.drawnAt === null ? null : Math.round(read.drawnAt),
    failed: read.failed,
    frames: read.frames,
    fetchedMs: read.fetchedAt === null ? null : Math.round(read.fetchedAt),
    paintMs: read.paint === null ? null : Math.round(read.paint),
    preloads: read.preloads,
  };
}

const numbers: Record<string, unknown> = {};
const keep = (kit: Kit, key: string, value: unknown) => {
  numbers[key] = value;
  kit.note(`${key}: ${JSON.stringify(value)}`);
  writeFileSync(
    join(kit.out, "numbers.json"),
    JSON.stringify(numbers, null, 2)
  );
};

async function traceLeg(kit: Kit, stages: Stage[]): Promise<void> {
  const stage = await startStage();
  stages.push(stage);
  const [file, story] = TRACED.split("#") as [string, string | undefined];
  const url = embedUrl(stage.base, file, story);
  for (const engine of ENGINES) {
    // Cold: the stage's first page since it started (Chromium first; WebKit's is then warm on the server).
    const runs: [string, boolean][] =
      engine === "chromium"
        ? [
            ["cold stage, cold cache", false],
            ["warm stage, cold cache", false],
            ["warm stage, warm cache", true],
          ]
        : [
            ["warm stage, cold cache", false],
            ["warm stage, warm cache", true],
          ];
    let reused: Page | null = null;
    for (const [name, sameContext] of runs) {
      const page: Page =
        sameContext && reused
          ? await reused.context().newPage()
          : await kit.page("desk", {
              scale: 1,
              engine,
              browser: `canvas-cost-trace-${engine}-${name}`,
              init: [installCounters],
            });
      const read = await readLoad(page, url, stage, engine === "chromium");
      keep(kit, `trace.${engine}.${name}`, read);
      kit.check(
        `trace ${engine} ${name}: the frame of ${TRACED} drew (${read.frames} frames in ${read.drawnMs} ms)`,
        read.drawnMs !== null && read.frames > 0 && read.failed.length === 0,
        read.failed.join(" | ")
      );
      if (sameContext) {
        await page.close();
      } else {
        reused = page;
      }
    }
  }
}

/** A frame's load cold and warm with every request a round trip of `--latencies` ms (50: a tailnet's; 350: the hub's preview proxy through Cloudflare, as canvas-preload reads it). */
async function latencyLeg(kit: Kit, stages: Stage[]): Promise<void> {
  const [file, story] = TRACED.split("#") as [string, string | undefined];
  for (const latency of LATENCIES) {
    const stage = await startStage();
    stages.push(stage);
    const url = embedUrl(stage.base, file, story);
    for (const name of ["cold stage", "warm stage"]) {
      const page = await kit.page("desk", {
        scale: 1,
        browser: `canvas-cost-latency-${latency}-${name}`,
        init: [installCounters],
      });
      const read = await readLoad(page, url, stage, false, latency);
      keep(kit, `latency.${latency}ms.${name}`, {
        drawnMs: read.drawnMs,
        lastModuleMs: read.network.lastModuleMs,
        requests: read.network.requests,
        preloads: read.preloads,
        serverCpuMs: read.server.cpuMs,
        transformed: read.server.transformed,
      });
      await page.close();
    }
    stage.stop();
  }
}

/* --- WebKit with no inspector ------------------------------------------- */

/**
 * Every frame asks for motion as a person with Reduce Motion off does
 * (`prefers-reduced-motion: no-preference`), as Playwright's WebKit pages
 * do: its contexts override the preference to `no-preference` by default,
 * and its WebKit with nothing overriding it answers `reduce` (`matchMedia`
 * in a context with `reducedMotion: null`: true; the MiniBrowser with no
 * inspector: true), whatever its WPE platform settings say (a
 * `--config-file` with `/wpe-platform/reduced-motion` false leaves it
 * `reduce`, where the same file's `interface-contrast` reaches every page).
 * The dashboard asks in its style sheets (Tailwind's `motion-safe:` and
 * `motion-reduce:`, nested in their rules, and its own `@media` blocks) and
 * in its scripts (`matchMedia`): each query of the preference is answered
 * here as `no-preference` would answer it, a sheet's as it loads or is
 * written again, as kit.ts `safariParity` reaches them.
 */
function fullMotion(): void {
  const REDUCE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/gi;
  const NO_PREFERENCE =
    /\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/gi;
  // In a boolean context it holds for any value but `no-preference`.
  const BARE = /\(\s*prefers-reduced-motion\s*\)/gi;
  const NEVER = "(width < 0px)";
  const ALWAYS = "(width >= 0px)";
  const answered = (query: string): string =>
    query
      .replace(REDUCE, NEVER)
      .replace(NO_PREFERENCE, ALWAYS)
      .replace(BARE, NEVER);
  const ask = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => ask(answered(query));
  const within = (rules: CSSRuleList | undefined) => {
    for (const rule of rules ?? []) {
      const media =
        rule instanceof CSSMediaRule || rule instanceof CSSImportRule
          ? rule.media
          : null;
      if (media) {
        const text = answered(media.mediaText);
        if (text !== media.mediaText) {
          media.mediaText = text;
        }
      }
      // Grouping rules, and a style rule's nested ones (Tailwind's variants).
      within((rule as Partial<CSSGroupingRule>).cssRules);
    }
  };
  const sheet = (one: CSSStyleSheet | null) => {
    try {
      within(one?.cssRules);
    } catch {
      // Another origin's: unread, as safariParity leaves it.
    }
  };
  const all = () => {
    for (const one of document.styleSheets) {
      sheet(one);
    }
  };
  addEventListener("load", all);
  document.addEventListener("DOMContentLoaded", () => {
    all();
    for (const link of document.querySelectorAll("link")) {
      link.addEventListener("load", () => sheet(link.sheet));
    }
    new MutationObserver((records) => {
      for (const node of records.flatMap(({ target, addedNodes }) => [
        target,
        ...addedNodes,
      ])) {
        if (node instanceof HTMLLinkElement) {
          node.addEventListener("load", () => sheet(node.sheet));
        }
        const style =
          node instanceof HTMLStyleElement ? node : node.parentElement;
        if (style instanceof HTMLStyleElement) {
          sheet(style.sheet);
        }
      }
    }).observe(document.head, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Every WebKit with no inspector this run started that has not ended
 * ({@link noInspectorWebKit}), each ended as the process exits, however it
 * exits but a SIGKILL: a stop signal reaches the exit through
 * scratch-fleet.ts's handlers, as kit.ts's vites do. Each leads a process
 * group of its own, which no signal to the run reaches: a run stopped
 * mid-leg left its MiniBrowser, web and network processes running.
 */
const NO_INSPECTOR_ENDS = new Set<() => void>();
process.on("exit", () => {
  for (const end of NO_INSPECTOR_ENDS) {
    end();
  }
});

/** How a WebKit with no inspector is started ({@link noInspectorWebKit}). */
interface NoInspectorOptions {
  /** JSC's options and the like, for its processes. */
  env?: Record<string, string>;
  /** Its certificates taken as trusted: the run's own (cloudflare-front.ts `scratchCertificate`), as kit.page's `ignoreHTTPSErrors` takes them. */
  ignoreTlsErrors?: boolean;
  /** Scripts run in every frame before its own, after the kit's WebKit parity and {@link fullMotion}, as kit.page's `init` are. */
  init?: ((() => void) | { content: string })[];
  /** Its window. 1440 × 900 unless given. */
  size?: { height: number; width: number };
}

/**
 * WebKit as a person runs it, nothing automating it: Playwright's own WebKit
 * build (its MiniBrowser, `webkit.executablePath()`) started headless on
 * `url` with no inspector (no `--inspector-pipe`); `url` carries the kit
 * bridge's agent (safari-bridge.ts), or an `init` script does, which runs
 * this spec's calls in it. Under Playwright, WebKit's inspector keeps every
 * frame a page takes away, a frame of plain objects as much as an app's,
 * and after `page.requestGC()` too (the memory leg's `playwright-control`),
 * and its page runs the kit's own frame loop (crash-watch.ts
 * `readFrames`): every WebKit memory and idle reading of this spec is taken
 * here. Every frame styles as Safari does, as a kit page in WebKit does
 * (kit.ts `safariParity`), and asks for full motion, as one does
 * ({@link fullMotion}), its `init` after: the MiniBrowser's start scripts
 * (`--user-script-at-start`) run in every frame, another origin's too, as a
 * context's init scripts do.
 */
function noInspectorWebKit(
  url: string,
  options: NoInspectorOptions = {}
): {
  cpu: () => number;
  /** Its processes' CPU by thread name ({@link cpuByThread}). */
  threads: () => Record<string, number>;
  end: () => void;
  memory: () => number;
  /** Its web processes' native heap ({@link WEBKIT_HEAP}), MB. */
  heap: () => number;
  /** Each collection JSC's GC log said (where `JSC_logGC` asks for it), in order: its heap, and the live size it left, KB. */
  collections: () => readonly { heap: string; kb: number }[];
} {
  const scripts = mkdtempSync(join(tmpdir(), "canvas-cost-webkit-"));
  const start = join(scripts, "start.js");
  writeFileSync(
    start,
    [safariParity, fullMotion, ...(options.init ?? [])]
      .map(
        (script) =>
          // Each on its own, as each init script is: one that throws stops none after it.
          `try { ${typeof script === "function" ? `(${script.toString()})();` : script.content} } catch (error) { console.error(error); }`
      )
      .join("\n")
  );
  const { width, height } = options.size ?? { width: 1440, height: 900 };
  // Its own process group's leader, so the whole browser (its web and network processes) ends with one signal to the group.
  const browser = spawn(
    webkit.executablePath(),
    [
      "--headless",
      `--size=${width}x${height}`,
      `--user-script-at-start=${start}`,
      ...(options.ignoreTlsErrors ? ["--ignore-tls-errors"] : []),
      url,
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, ...options.env },
      detached: true,
    }
  );
  const collections: { heap: string; kb: number }[] = [];
  let partial = "";
  browser.stderr?.on("data", (chunk: Buffer) => {
    const all = (partial + chunk.toString("utf8")).split("\n");
    partial = all.pop() ?? "";
    for (const line of all) {
      const m = line.match(GC_LEFT);
      if (m) {
        collections.push({ heap: m[1] as string, kb: Number(m[2]) });
      }
    }
  });
  const tree = () => treeOf([browser.pid as number]);
  const end = () => {
    NO_INSPECTOR_ENDS.delete(end);
    const leader = spawnedPid(browser);
    if (leader) {
      signalGroup(leader, "SIGTERM");
    }
    rmSync(scripts, { recursive: true, force: true });
  };
  NO_INSPECTOR_ENDS.add(end);
  return {
    collections: () => collections,
    memory: () => memoryMb(pageProcesses(tree())),
    heap: () => namedMb(pageProcesses(tree()), WEBKIT_HEAP),
    cpu: () => cpuMs(tree()),
    threads: () => cpuByThread(tree()),
    end,
  };
}

/** What the page leg's holder of frames reads in WebKit with no inspector. */
interface FramesRead {
  /** What each document ran over the idle's last five seconds ({@link idleCensus}). */
  census: Census[];
  drawnMb: number;
  /** Where the idle's CPU went, by thread name, ms. */
  idleCpuByThread: [string, number][];
  idleCpuMs: number;
  idleMb: [number, number][];
  said: number;
  settledMs: number | null;
}

/**
 * The page leg's holder of `urls` in WebKit with no inspector, each frame
 * in its turn: its web process's memory once every frame said its shape
 * (within {@link DRAW_MS} each), then every 20 s over `idleS` seconds, the
 * CPU its processes spent in them, and what each frame ran at their end.
 */
async function framesWithNoInspector(
  urls: string[],
  idleS: number
): Promise<FramesRead> {
  const bridge = safariBridge();
  const holder = bridge.html(
    `frames-${urls.length}-${Date.now()}`,
    HOLDER_STYLE,
    HOLDER_BODY(urls)
  );
  const browser = noInspectorWebKit(holder, { init: [idleCensus] });
  try {
    const page = await bridge.page((href) => href === holder);
    const settled = await page.run(
      async (ms: number) => {
        const h = (
          window as unknown as {
            __holder: { said: number; settledAt: number | null; start: number };
          }
        ).__holder;
        const t0 = Date.now();
        while (h.settledAt === null && Date.now() - t0 < ms) {
          await new Promise((done) => setTimeout(done, 250));
        }
        return {
          said: h.said,
          settledMs:
            h.settledAt === null ? null : Math.round(h.settledAt - h.start),
        };
      },
      [urls.length * DRAW_MS],
      urls.length * DRAW_MS + 10_000
    );
    // A last second for what the last frame's drawing set off.
    await Bun.sleep(1000);
    const drawnMb = browser.memory();
    const cpu0 = browser.cpu();
    const threads0 = browser.threads();
    const idleMb: [number, number][] = [];
    const from = Date.now();
    for (let s = 0; s <= idleS; s += 20) {
      idleMb.push([s, browser.memory()]);
      if (s < idleS) {
        await Bun.sleep(Math.max(0, from + (s + 20) * 1000 - Date.now()));
      }
    }
    const idleCpuMs = Math.round(browser.cpu() - cpu0);
    const idleCpuByThread = threadsSpent(threads0, browser.threads());
    const census = await page.run(() =>
      (window as unknown as { __census: () => Census[] }).__census()
    );
    return { ...settled, drawnMb, idleMb, idleCpuMs, idleCpuByThread, census };
  } finally {
    browser.end();
    bridge.stop();
  }
}

/* --- One frame's keep ------------------------------------------------------ */

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one frame read whole, its CDP reads beside its timeline's
async function frameLeg(
  kit: Kit,
  stages: Stage[],
  warm: Stage | null,
  label = "frame",
  built?: string
): Promise<Stage> {
  const stage = warm ?? (await startStage());
  if (!warm) {
    stages.push(stage);
  }
  const [file, story] = TRACED.split("#") as [string, string | undefined];
  const url = built ?? embedUrl(stage.base, file, story);
  // The stage warm with every states file drawn once, as a stage that has drawn many canvases is.
  if (!(warm || built)) {
    const all = statesFiles();
    const page = await kit.page("desk", { scale: 1, init: [installCounters] });
    for (const one of all) {
      // A page Vite reloads as it builds a dependency the page found (its `full-reload`) aborts the next one's navigation: that one is asked again.
      for (const _ of [1, 2]) {
        const went = await page
          .goto(embedUrl(stage.base, one), { waitUntil: "commit" })
          .then(() => true)
          .catch(() => false);
        if (
          went &&
          (await drawn(page)
            .then(() => true)
            .catch(() => false))
        ) {
          break;
        }
      }
    }
    await page.close();
  }
  for (const engine of ENGINES) {
    const before = new Set(browserPids(stages));
    const page = await kit.page("desk", {
      scale: 1,
      engine,
      browser: `canvas-cost-${label}-${engine}`,
      init: [installCounters],
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 400)));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text().slice(0, 400));
      }
    });
    const cdp =
      engine === "chromium" ? await page.context().newCDPSession(page) : null;
    const parsed: { url: string; length: number }[] = [];
    if (cdp) {
      await cdp.send("Debugger.enable");
      cdp.on("Debugger.scriptParsed", (event) => {
        parsed.push({ url: event.url, length: event.length ?? 0 });
      });
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.startPreciseCoverage", {
        callCount: true,
        detailed: false,
      });
    }
    await page.goto(url, { waitUntil: "commit", timeout: DRAW_MS });
    await drawn(page);
    await Bun.sleep(2000);
    const read = (await page.evaluate(timeline)) as Timeline;
    const heaviest = await page.evaluate(() =>
      (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .map(
          (one) =>
            [
              // biome-ignore lint/performance/useTopLevelRegex: this function runs in the page, where none of this module's scope is
              new URL(one.name).pathname.replace(/^\/@cawco\/m\/[^/]+/, ""),
              one.decodedBodySize,
            ] as [string, number]
        )
        .sort((a, b) => b[1] - a[1])
    );
    writeFileSync(
      join(kit.out, `${label}-${engine}-resources.json`),
      JSON.stringify(heaviest, null, 1)
    );
    let heap: number | null = null;
    let evaluated: number | null = null;
    if (cdp) {
      const { result } = (await cdp.send("Profiler.takePreciseCoverage")) as {
        result: { url: string; functions: { ranges: { count: number }[] }[] }[];
      };
      const ran = new Set(
        result
          .filter((one) =>
            one.functions.some((fn) => (fn.ranges[0]?.count ?? 0) > 0)
          )
          .map((one) => one.url)
      );
      evaluated = ran.size;
      // What the realm parsed and never ran: loaded outside the story's closure.
      const idle = parsed
        .filter((one) => one.url.startsWith("http") && !ran.has(one.url))
        .map((one) => new URL(one.url).pathname.replace(KEYED_PREFIX, ""));
      writeFileSync(
        join(kit.out, `${label}-${engine}-modules.json`),
        JSON.stringify(
          {
            ran: [...ran].map((one) =>
              one.startsWith("http")
                ? new URL(one).pathname.replace(KEYED_PREFIX, "")
                : one
            ),
            parsedNotRun: idle,
          },
          null,
          2
        )
      );
      await cdp.send("Profiler.stopPreciseCoverage");
      await cdp.send("HeapProfiler.collectGarbage");
      const usage = (await cdp.send("Runtime.getHeapUsage")) as {
        usedSize: number;
      };
      heap = Math.round(usage.usedSize / 1024 / 1024);
    }
    const mine = browserPids(stages).filter((pid) => !before.has(pid));
    // WebKit's, read with no inspector: the frame alone in a holder, drawn.
    const processMb =
      engine === "webkit"
        ? (await framesWithNoInspector([url], 0)).drawnMb
        : memoryMb(pageProcesses(mine));
    await page.evaluate(() => {
      (window as unknown as { __cost: { raf: number } }).__cost.raf = 0;
    });
    await Bun.sleep(RAF_IDLE_MS);
    const raf = await page.evaluate(
      () => (window as unknown as { __cost: { raf: number } }).__cost.raf
    );
    // Who asks for the frames an idle canvas runs: each caller's stack, for 3 s.
    await page.evaluate(() => {
      (window as unknown as { __cost: { sites: object } }).__cost.sites = {};
    });
    await Bun.sleep(3000);
    const loopSites = await page.evaluate(() =>
      Object.entries(
        (window as unknown as { __cost: { sites: Record<string, number> } })
          .__cost.sites
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    );
    const scripts = parsed.filter((one) => one.url.startsWith("http"));
    keep(kit, `${label}.${engine}`, {
      requests: read.requests,
      preloads: read.preloads,
      scriptBytes: read.scriptBytes,
      styleBytes: read.styleBytes,
      inlineStyleChars: read.inlineStyleChars,
      scriptsParsed: cdp ? scripts.length : null,
      scriptCharsParsed: cdp
        ? scripts.reduce((s, one) => s + one.length, 0)
        : null,
      modulesEvaluated: evaluated,
      heapMb: heap,
      pageProcessMb: processMb,
      rafPer20s: raf,
      loopSites,
      drawnMs: read.drawnAt === null ? null : Math.round(read.drawnAt),
      frames: read.frames,
      failed: read.failed,
      errors: errors.slice(0, 5),
    });
    if (cdp) {
      kit.check(
        `${label} chromium: it evaluates what it parses (${evaluated} of ${scripts.length} scripts parsed ran)`,
        evaluated !== null && evaluated >= scripts.length * 0.9,
        scripts
          .map((one) => one.url)
          .slice(0, 5)
          .join(", ")
      );
      await cdp.detach();
    }
    await page.close();
  }
  return stage;
}

/* --- A page of frames -------------------------------------------------------- */

/** The page holding the frames: each its turn, in order, as embed-turns.ts gives them on a page at its top. */
const HOLDER = (urls: string[]) =>
  `<!doctype html><meta charset="utf-8">\n${HOLDER_STYLE}\n${HOLDER_BODY(urls)}`;
const HOLDER_STYLE =
  "<style>body{margin:0;font:14px system-ui}main{height:100vh;overflow:auto}.card{margin:16px;min-height:240px;border:1px solid #ccc}iframe{display:block;inline-size:100%;block-size:240px;border:0}</style>";
const HOLDER_BODY = (urls: string[]) => `<main id="list"></main>
<script>
const urls = ${JSON.stringify(urls)};
const list = document.getElementById("list");
const cards = urls.map(() => { const c = document.createElement("div"); c.className = "card"; list.append(c); return c; });
const h = window.__holder = { start: performance.now(), intervals: [], said: 0, failed: 0, settledAt: null, turns: [] };
let last = null;
// Its cadence read until every frame said its shape, and its loop ended there: a page that asks for every frame makes the browser draw each one, and the idle after is the frames' own.
const tick = (t) => { if (h.settledAt !== null) return; if (last !== null) h.intervals.push(t - last); last = t; requestAnimationFrame(tick); };
requestAnimationFrame(tick);
let at = 0; let current = null; let timer = 0;
const frames = [];
const done = () => { clearTimeout(timer); current = null; setTimeout(next); };
const next = () => {
  if (current || at >= urls.length) return;
  const f = document.createElement("iframe");
  f.src = urls[at]; frames.push(f); cards[at].append(f); at += 1;
  current = f; h.turns.push(performance.now());
  timer = setTimeout(done, 20000);
};
addEventListener("message", (e) => {
  const f = frames.find((one) => one.contentWindow === e.source);
  if (!f) return;
  const type = e.data && e.data.type;
  if (type === "cawco:embed-size") {
    if (!f.dataset.said) { f.dataset.said = "1"; h.said += 1; }
    f.style.blockSize = e.data.height + "px";
    if (f === current) done();
    if (h.said === urls.length && h.settledAt === null) h.settledAt = performance.now();
  }
  if (type === "cawco:embed-fetched" && f === current) done();
  // Its graph told (core CANVAS_EMBED_GRAPH): its whole graph its own share, nothing more to wait on, as a page with this one frame fetching gives it.
  if (type === "cawco:embed-graph") { e.source.postMessage({ type: "cawco:embed-go", urls: e.data.urls }, "*"); e.source.postMessage({ type: "cawco:embed-ready", urls: [] }, "*"); }
});
next();
</script>`;

const p95 = (list: number[]): number => {
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0);
};

/** The page's stories: `--embeds` of the dashboard's, spread over its states files. */
async function pagePicks(
  base: string
): Promise<{ file: string; story: string }[]> {
  const all = await storiesOf(base, statesFiles());
  return Array.from(
    { length: EMBEDS },
    (_, at) => all[(at * 7) % all.length] as { file: string; story: string }
  );
}

/** A Preview of several stories of several states files: one frame drawing them all, one under another. */
const sharedUrl = (
  base: string,
  picks: { file: string; story: string }[]
): string => {
  const url = new URL(`${base}/@cawco/canvas`);
  for (const file of new Set(picks.map((one) => one.file))) {
    url.searchParams.append("file", file);
  }
  url.searchParams.set("by", "embed");
  for (const story of new Set(picks.map((one) => one.story))) {
    url.searchParams.append("story", story);
  }
  return url.href;
};

/** The memory of `pids` every 20 s over `idleS` seconds, and the CPU they spent in them, by thread name too. */
async function idleOf(
  pids: () => number[],
  idleS: number
): Promise<{
  byThread: [string, number][];
  cpuMs: number;
  memory: [number, number][];
}> {
  const memory: [number, number][] = [];
  const from = Date.now();
  const cpu0 = cpuMs(pids());
  const threads0 = cpuByThread(pids());
  for (let s = 0; s <= idleS; s += 20) {
    memory.push([s, memoryMb(pageProcesses(pids()))]);
    if (s < idleS) {
      await Bun.sleep(Math.max(0, from + (s + 20) * 1000 - Date.now()));
    }
  }
  return {
    cpuMs: Math.round(cpuMs(pids()) - cpu0),
    byThread: threadsSpent(threads0, cpuByThread(pids())),
    memory,
  };
}

/**
 * A page of `--embeds` stories, each engine: `cards`, a frame per story as
 * a decision page's Previews are; `shared`, one frame drawing every one of
 * them inline (Storybook's docs page: "Rendering multiple iframes on the
 * page can have performance issues which is why we avoid it as the
 * default", storybookjs/storybook#11328).
 */
async function pageLeg(
  kit: Kit,
  stages: Stage[],
  warm: Stage | null,
  mode: "cards" | "shared",
  label: string = mode,
  built?: (pick: { file: string; story: string }) => string
): Promise<Stage> {
  const stage = warm ?? (await startStage());
  if (!warm) {
    stages.push(stage);
  }
  const picks = await pagePicks(stage.base);
  let urls = [sharedUrl(stage.base, picks)];
  if (built) {
    urls = picks.map(built);
  } else if (mode === "cards") {
    urls = picks.map((one) => embedUrl(stage.base, one.file, one.story));
  }
  const holder = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(HOLDER(urls), { headers: { "content-type": "text/html" } }),
  });
  try {
    for (const engine of ENGINES) {
      const before = new Set(browserPids(stages));
      const page = await kit.page("desk", {
        scale: 1,
        engine,
        browser: `canvas-cost-${label}-${engine}`,
        init: [installCounters, idleCensus],
      });
      const mine = () => browserPids(stages).filter((pid) => !before.has(pid));
      const cpu0 = cpuMs(mine());
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${holder.port}/`);
      await page.waitForFunction(
        () =>
          (window as unknown as { __holder: { settledAt: number | null } })
            .__holder.settledAt !== null,
        undefined,
        { timeout: EMBEDS * 30_000, polling: 250 }
      );
      const settledMs = Date.now() - t0;
      // A last second for what the last frame's drawing set off.
      await Bun.sleep(1000);
      const cpu = Math.round(cpuMs(mine()) - cpu0);
      const held = (await page.evaluate(
        () =>
          (
            window as unknown as {
              __holder: { intervals: number[]; said: number };
            }
          ).__holder
      )) as { intervals: number[]; said: number };
      // Every frame's own resources, read in it.
      const frames = page.frames().filter((one) => one !== page.mainFrame());
      const per = (
        await Promise.all(
          frames.map((one) => one.evaluate(timeline).catch(() => null))
        )
      ).filter((one): one is Timeline => one !== null);
      // WebKit's memory and idle CPU read with no inspector (noInspectorWebKit), its Playwright page let go first.
      let idle: {
        byThread: [string, number][];
        census: Census[];
        cpuMs: number;
        memory: [number, number][];
      };
      if (engine === "webkit") {
        await page.close();
        const read = await framesWithNoInspector(urls, IDLE_S);
        idle = {
          cpuMs: read.idleCpuMs,
          byThread: read.idleCpuByThread,
          memory: read.idleMb,
          census: read.census,
        };
      } else {
        idle = {
          ...(await idleOf(mine, IDLE_S)),
          census: await page.evaluate(() =>
            (window as unknown as { __census: () => Census[] }).__census()
          ),
        };
        await page.close();
      }
      keep(kit, `page.${label}.${engine}`, {
        stories: EMBEDS,
        frames: urls.length,
        said: held.said,
        settledMs,
        cpuToSettleMs: cpu,
        cadenceP95Ms: p95(held.intervals),
        cadenceMaxMs: Math.round(Math.max(0, ...held.intervals)),
        painted: held.intervals.length,
        requests: per.reduce((s, one) => s + one.requests, 0),
        scriptBytes: per.reduce((s, one) => s + one.scriptBytes, 0),
        styleBytes: per.reduce((s, one) => s + one.styleBytes, 0),
        storyFrames: per.reduce((s, one) => s + one.frames, 0),
        failed: per.flatMap((one) => one.failed).slice(0, 5),
        memoryMbOverIdle: idle.memory,
        idleCpuMs: idle.cpuMs,
        idleCpuByThread: idle.byThread.slice(0, 8),
        idleSeconds: IDLE_S,
        idleRead: engine === "webkit" ? "WebKit with no inspector" : engine,
        idleRuns: censusWords(idle.census),
      });
      kit.check(
        `page ${label} ${engine}: all ${urls.length} frames of ${EMBEDS} stories said their shape (${held.said}) in ${(settledMs / 1000).toFixed(1)} s`,
        held.said === urls.length
      );
      // Nothing animates that nobody can see (motion/rest.ts): a canvas scrolled out of view holds its loops (agent canvas runtime). A page of one frame has none out of view.
      const runs = censusWords(idle.census);
      if (urls.length === 1) {
        continue;
      }
      kit.check(
        `page ${label} ${engine}: no frame out of view runs a loop while the page stands untouched (${runs.outOfViewLooping} of the ${runs.outOfView} out of view do; the page's CPU over ${IDLE_S} s: ${idle.cpuMs} ms)`,
        runs.outOfView > 0 && runs.outOfViewLooping === 0,
        runs.busy
          .filter((one) => !one.inView && one.running.length > 0)
          .map((one) => `${one.document}: ${one.running.join(", ")}`)
          .join("; ") || undefined
      );
    }
  } finally {
    holder.stop(true);
  }
  return stage;
}

/* --- A story's own loop, seen and unseen ---------------------------------- */

const LOOP_DIR = "src/lib/cawco/probe-canvas-cost";
const LOOP_FILE = `${LOOP_DIR}/Loop.stories.ts`;
/** A component that runs an animation-frame loop while it stands, as a strip's marquee does. */
const LOOP_SVELTE = `<script lang="ts">
  let { label = "loop" }: { label?: string } = $props();
  let turn = $state(0);
  $effect(() => {
    let id = 0;
    const spin = () => {
      turn = (turn + 1) % 360;
      id = requestAnimationFrame(spin);
    };
    id = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(id);
  });
</script>

<p data-loop style="inline-size: 120px; rotate: {turn}deg">{label}</p>
`;
const LOOP_STORY = `import Loop from "./Loop.svelte";

export default { component: Loop, args: { label: "loop" } };

export const Spins = { args: {}, parameters: { viewport: 400 } };
`;

/**
 * A page's answer to each frame's graph (core `CANVAS_EMBED_GRAPH`): its
 * whole graph its own share and nothing to wait on, as a page with that one
 * Preview gives it. An embed loads no story before it.
 */
const GRAPH_ANSWER = `<script>addEventListener("message", (e) => { if (e.data && e.data.type === "cawco:embed-graph") { e.source.postMessage({ type: "cawco:embed-go", urls: e.data.urls }, "*"); e.source.postMessage({ type: "cawco:embed-ready", urls: [] }, "*"); } });</script>`;

/**
 * Frames of the looping story: one in view; two in a pane put away by the
 * dashboard's own path (PaneLeaf's `data-pane-hidden`, `content-visibility:
 * hidden`, and motion/rest.ts `holdSkipped`, bundled from the dashboard),
 * one of them inside a page that relays it as a decision page does
 * (decisions/host/away.ts `relayAway`); one 4000px below the page's fold.
 */
const LOOP_HOLDER = (url: string) => `<!doctype html><meta charset="utf-8">
<style>body{margin:0}iframe{display:block;inline-size:600px;block-size:200px;border:0}.pane[data-pane-hidden]{content-visibility:hidden;contain-intrinsic-size:auto 400px}</style>
<script src="/away.js"></script>
${GRAPH_ANSWER}
<iframe id="seen" src="${url}"></iframe>
<div class="pane" id="pane"><iframe id="away" src="${url}"></iframe><iframe id="relay" src="/relay"></iframe></div>
<div style="block-size:4000px"></div>
<iframe id="unseen" src="${url}"></iframe>
<script>
const pane = document.getElementById("pane");
let back;
window.putAway = () => { pane.toggleAttribute("data-pane-hidden", true); back = window.__probeAway.holdSkipped(true)(pane); };
window.bringBack = () => { back?.(); pane.removeAttribute("data-pane-hidden"); };
</script>`;

/** A page standing for a decision page: the dashboard's relay, and one Preview's canvas. */
const RELAY_PAGE = (url: string) => `<!doctype html><meta charset="utf-8">
<style>body{margin:0}iframe{display:block;inline-size:600px;block-size:200px;border:0}</style>
<script src="/away.js"></script><script>window.__probeAway.relayAway();</script>
${GRAPH_ANSWER}
<iframe id="inner" src="${url}"></iframe>`;

/** The dashboard's pane-away path and the decision page's relay, bundled for the holder. */
async function awayScript(): Promise<string> {
  const entry = join(process.env.TMPDIR ?? "/tmp", "canvas-cost-away.ts");
  writeFileSync(
    entry,
    `import { holdSkipped } from ${JSON.stringify(join(APP, "src/lib/cawco/motion/rest.ts"))};
import { relayAway } from ${JSON.stringify(join(APP, "src/lib/cawco/decisions/host/away.ts"))};
(window as unknown as { __probeAway: object }).__probeAway = { holdSkipped, relayAway };
`
  );
  const built = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "iife",
  });
  rmSync(entry, { force: true });
  if (!built.success) {
    throw new Error(
      `the pane-away path did not bundle: ${built.logs.join(" | ")}`
    );
  }
  return await (built.outputs[0] as Bun.BuildArtifact).text();
}

async function rafLeg(
  kit: Kit,
  stages: Stage[],
  warm: Stage | null
): Promise<void> {
  const stage = warm ?? (await startStage());
  if (!warm) {
    stages.push(stage);
  }
  const url = embedUrl(stage.base, LOOP_FILE, "Spins");
  const away = await awayScript();
  const holder = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === "/away.js") {
        return new Response(away, {
          headers: { "content-type": "text/javascript" },
        });
      }
      return new Response(
        pathname === "/relay" ? RELAY_PAGE(url) : LOOP_HOLDER(url),
        { headers: { "content-type": "text/html" } }
      );
    },
  });
  try {
    for (const engine of ENGINES) {
      const page = await kit.page("desk", {
        scale: 1,
        engine,
        browser: `canvas-cost-raf-${engine}`,
        init: [installCounters],
      });
      await page.goto(`http://127.0.0.1:${holder.port}/`);
      const frameOf = async (id: string) => {
        const handle = await page.$(`#${id}`);
        return (await handle?.contentFrame()) ?? null;
      };
      const seen = await frameOf("seen");
      const inPane = await frameOf("away");
      const relay = await frameOf("relay");
      const relayed =
        (await (await relay?.$("#inner"))?.contentFrame()) ?? null;
      const unseen = await frameOf("unseen");
      const looping = (frame: typeof seen) =>
        frame
          ?.waitForFunction(
            () => document.querySelector("[data-loop]") !== null,
            undefined,
            {
              // Polled by time: a frame below the fold may get no animation frames to poll on.
              polling: 200,
              timeout: DRAW_MS,
            }
          )
          .then(() => true)
          .catch(() => false) ?? Promise.resolve(false);
      const frames = [seen, inPane, relayed, unseen];
      const mounted = await Promise.all(frames.map(looping));
      const reset = (frame: typeof seen) =>
        frame?.evaluate(() => {
          (window as unknown as { __cost: { raf: number } }).__cost.raf = 0;
        });
      const count = (frame: typeof seen) =>
        frame?.evaluate(
          () => (window as unknown as { __cost: { raf: number } }).__cost.raf
        ) ?? Promise.resolve(null);
      await page.evaluate(() =>
        (window as unknown as { putAway: () => void }).putAway()
      );
      await Bun.sleep(1000);
      await Promise.all(frames.map(reset));
      await Bun.sleep(RAF_IDLE_MS);
      const [inView, paneAway, relayedAway, outOfView] = await Promise.all(
        frames.map(count)
      );
      // Brought back: the loops held in the pane run again.
      await page.evaluate(() =>
        (window as unknown as { bringBack: () => void }).bringBack()
      );
      await Promise.all([reset(inPane), reset(relayed)]);
      await Bun.sleep(2000);
      const [paneBack, relayedBack] = await Promise.all([
        count(inPane),
        count(relayed),
      ]);
      // Scrolled to: the loop the engine held below the fold runs again.
      await page.evaluate(() =>
        document.getElementById("unseen")?.scrollIntoView()
      );
      await reset(unseen);
      await Bun.sleep(2000);
      const scrolledTo = await count(unseen);
      keep(kit, `raf.${engine}`, {
        mounted,
        inViewPer20s: inView,
        paneAwayPer20s: paneAway,
        relayedAwayPer20s: relayedAway,
        outOfViewPer20s: outOfView,
        paneBackPer2s: paneBack,
        relayedBackPer2s: relayedBack,
        scrolledToPer2s: scrolledTo,
      });
      kit.check(
        `raf ${engine}: a story's loop runs in view (${inView} in 20 s), is held in a pane put away (${paneAway}) and through a decision page's relay (${relayedAway}), and runs again once back (${paneBack}, ${relayedBack} in 2 s) and once scrolled to (${scrolledTo} in 2 s; ${outOfView} below the fold, the engine's own holding)`,
        mounted.every(Boolean) &&
          (inView ?? 0) > 100 &&
          (paneAway ?? 99) <= 3 &&
          (relayedAway ?? 99) <= 3 &&
          (paneBack ?? 0) > 10 &&
          (relayedBack ?? 0) > 10 &&
          (scrolledTo ?? 0) > 10
      );
      await page.close();
    }
  } finally {
    holder.stop(true);
  }
}

/* --- What a write in the stage's root costs the next frame -------------- */

/** An agent's note, in a folder the project's git ignores: no module reads it, and Tailwind scans no ignored file. */
const NOTE = ".cawco/probe-canvas-cost-note.md";

/** The key a page asked for its modules at (`/@cawco/m/<key>/…`), and how many of them came over the network rather than from the browser's cache. */
function keyedRead(): { fetched: number; key: string | null; modules: number } {
  const keyed = (
    performance.getEntriesByType("resource") as PerformanceResourceTiming[]
  ).filter((one) => new URL(one.name).pathname.startsWith("/@cawco/m/"));
  return {
    key: keyed[0]
      ? (new URL(keyed[0].name).pathname.split("/")[3] ?? null)
      : null,
    modules: keyed.length,
    fetched: keyed.filter((one) => one.transferSize > 0).length,
  };
}

/**
 * A write the pages are served from nowhere: an agent's note beside the
 * project. The next frame asks at the same key and takes every module from
 * the browser's cache. Then an edit to a file a canvas imports: it reaches
 * the open canvas by HMR, and the next frame asks at a new key and draws it.
 */
async function rekeyLeg(
  kit: Kit,
  stages: Stage[],
  warm: Stage | null
): Promise<Stage> {
  const stage = warm ?? (await startStage());
  if (!warm) {
    stages.push(stage);
  }
  const [file, story] = TRACED.split("#") as [string, string | undefined];
  const url = embedUrl(stage.base, file, story);
  const page = await kit.page("desk", {
    scale: 1,
    browser: "canvas-cost-rekey",
    init: [installCounters],
  });
  const load = async (into: Page, at: string) => {
    await into.goto(at, { waitUntil: "commit", timeout: DRAW_MS });
    await drawn(into);
    return (await into.evaluate(keyedRead)) as ReturnType<typeof keyedRead>;
  };
  try {
    const first = await load(page, url);
    writeFileSync(join(APP, NOTE), `A note no page reads, ${Date.now()}\n`);
    // The watcher's event, heard.
    await Bun.sleep(1500);
    const afterNote = await load(await page.context().newPage(), url);
    keep(kit, "rekey.unrelated write", { first, afterNote });
    kit.check(
      `rekey: after a write no page is served from (${NOTE}), the next frame asks at the same key (${first.key} → ${afterNote.key}) and fetches ${afterNote.fetched} of its ${afterNote.modules} modules from the network`,
      first.key !== null &&
        afterNote.key === first.key &&
        afterNote.fetched === 0
    );
    const loopUrl = embedUrl(stage.base, LOOP_FILE, "Spins");
    const open = await page.context().newPage();
    const before = await load(open, loopUrl);
    await open.waitForSelector("[data-loop]", { timeout: DRAW_MS });
    const wrote = Date.now();
    writeFileSync(join(APP, LOOP_DIR, "Loop.svelte"), loopWith(" edited"));
    const hmrMs = await open
      .waitForFunction(
        () =>
          document
            .querySelector("[data-loop]")
            ?.textContent?.includes(" edited") ?? false,
        undefined,
        { timeout: 60_000, polling: 50 }
      )
      .then(() => Date.now() - wrote)
      .catch(() => null);
    await Bun.sleep(500);
    const next = await page.context().newPage();
    const afterEdit = await load(next, loopUrl);
    const drawsEdit = await next
      .waitForFunction(
        () =>
          document
            .querySelector("[data-loop]")
            ?.textContent?.includes(" edited") ?? false,
        undefined,
        { timeout: 30_000, polling: 100 }
      )
      .then(() => true)
      .catch(() => false);
    keep(kit, "rekey.imported edit", { before, hmrMs, afterEdit, drawsEdit });
    kit.check(
      `rekey: an edit to an imported file reaches the open canvas by HMR (${hmrMs} ms), and the next frame asks at a new key (${before.key} → ${afterEdit.key}) and draws it (${drawsEdit})`,
      hmrMs !== null && afterEdit.key !== before.key && drawsEdit
    );
  } finally {
    rmSync(join(APP, NOTE), { force: true });
  }
  return stage;
}

/* --- The same stories built for production ------------------------------- */

/** Where the built canvases' sources are written, inside the app (its aliases and package imports resolve there). */
const BUILT_SRC = `${LOOP_DIR}/built`;
const BUILT_OUT = join(process.env.TMPDIR ?? "/tmp", "canvas-cost-built");
/** SvelteKit's `$lib`, which Kit's own plugin aliases: the built canvases have none of Kit's plugins. */
const LIB_ALIAS = /^\$lib\//;

/** The stage's Svelte adapter (host.ts `ADAPTERS.svelte`), its props holder a `.svelte.js` module the project's Svelte compiles. */
const BUILT_ADAPTER = `import { createRawSnippet, flushSync, getAllContexts, mount, unmount } from "svelte";
import { reactive } from "./props.svelte.js";
export function mountStory(target, s) {
  const inner = () => (s.render ? s.render(s.args, s.context) : { Component: s.component, props: s.args }) ?? {};
  const props = reactive({ ...(inner().props ?? {}) });
  let result = { ...inner(), props };
  for (const decorator of s.decorators) {
    const wrapped = result;
    const outer = decorator(() => wrapped, s.context);
    result = outer && outer !== wrapped && outer.Component ? { ...outer, child: wrapped } : (outer ?? wrapped);
  }
  const undo = mountSvelte(target, result);
  return {
    unmount: undo,
    update(next) {
      s.args = { ...s.args, ...next };
      s.context.args = s.args;
      const fresh = inner().props ?? {};
      for (const key of Object.keys(props)) if (!(key in fresh) && key !== "children") delete props[key];
      Object.assign(props, fresh);
      flushSync();
    },
  };
}
function mountSvelte(target, { Component, props = {}, child }, context) {
  if (child) {
    props.children = createRawSnippet(() => ({
      render: () => '<div style="display:contents"></div>',
      setup: (el) => mountSvelte(el, child, getAllContexts()),
    }));
  }
  const instance = mount(Component, { target, props, context });
  return () => unmount(instance);
}
`;

/** SvelteKit's client modules a sheet uses, as the stage stubs them (host.ts `KIT_STUBS`), and the two it leaves real, stood in for a page with no Kit. */
const BUILT_KIT: Record<string, string> = {
  "$app/navigation":
    "export const goto = () => Promise.resolve(); export const invalidate = () => Promise.resolve(); export const invalidateAll = () => Promise.resolve(); export const refreshAll = () => Promise.resolve(); export const preloadData = () => Promise.resolve(); export const preloadCode = () => Promise.resolve(); export const pushState = () => {}; export const replaceState = () => {}; export const afterNavigate = () => {}; export const beforeNavigate = () => {}; export const onNavigate = () => {}; export const disableScrollHandling = () => {};",
  "$app/state":
    "export const page = { url: new URL(location.href), params: {}, route: { id: null }, status: 200, error: null, data: {}, form: null, state: {} }; export const navigating = { from: null, to: null, type: null }; export const updated = { current: false, check: async () => false };",
  "$app/stores":
    'import { readable } from "svelte/store"; export const page = readable({ url: new URL(location.href), params: {}, route: { id: null }, status: 200, error: null, data: {}, form: null, state: {} }); export const navigating = readable(null); export const updated = { ...readable(false), check: async () => false }; export const getStores = () => ({ page, navigating, updated });',
  "$app/forms":
    "export const enhance = () => ({ destroy() {} }); export const applyAction = () => Promise.resolve(); export const deserialize = (r) => JSON.parse(r);",
  "$app/environment":
    'export const browser = true; export const dev = false; export const building = false; export const version = "built";',
  "$app/env":
    'export const browser = true; export const dev = false; export const building = false; export const version = "built";',
  "$app/paths":
    'export const base = ""; export const assets = ""; export const resolve = (p) => p; export const asset = (p) => p; export const resolveRoute = (p) => p;',
};

interface Built {
  buildMs: number;
  close: () => Promise<void>;
  /** Settles once the watch next writes a bundle (a minute at most). */
  nextBundle: () => Promise<void>;
  /** Each states file's canvas page, by file. */
  pages: Map<string, string>;
  port: number;
  /** An edit to `file` (absolute) rebuilt by Rolldown's watch: from the write to the new bundle written, ms. */
  rebuildMs: (
    file: string,
    text: string
  ) => Promise<{ at: number; rebuildMs: number | null }>;
  stop: () => void;
}

/**
 * `files`' canvases built for production by the project's own Vite and
 * config (SvelteKit's own plugins left out: Kit's build is the app's,
 * routes and server; Vite's and the Svelte plugin's stand), one HTML entry
 * per states file, each its runtime, adapter and section; served beside
 * the house faces. Watched, so an edit's rebuild is timed.
 */
async function buildCanvases(stage: Stage, files: string[]): Promise<Built> {
  const src = join(APP, BUILT_SRC);
  mkdirSync(src, { recursive: true });
  rmSync(BUILT_OUT, { recursive: true, force: true });
  const runtime = join(ROOT, "packages/agent/src/stage-host/canvas/runtime.ts");
  const tokens = readFileSync(join(APP, "src/lib/tokens/tokens.css"), "utf8");
  const { houseFaceSheet } =
    await import("../../../packages/core/src/house-faces");
  const faces = await houseFaceSheet("faces/");
  writeFileSync(join(src, "adapter.js"), BUILT_ADAPTER);
  writeFileSync(
    join(src, "props.svelte.js"),
    "export function reactive(value) {\n  const props = $state(value);\n  return props;\n}\n"
  );
  const input: Record<string, string> = {};
  const pages = new Map<string, string>();
  for (const [at, file] of files.entries()) {
    const read = await (
      await fetch(
        `${stage.base}/__cawco/stories?file=${encodeURIComponent(file)}`
      )
    ).json();
    writeFileSync(
      join(src, `section-${at}.js`),
      `import * as module from ${JSON.stringify(join(APP, file))};\nexport const SHEET = ${JSON.stringify({ ...read, file })};\nexport const HASH = "";\nexport { module };\n`
    );
    writeFileSync(
      join(src, `entry-${at}.js`),
      `import "/src/app.css";\nimport { mountStory } from "./adapter.js";\nimport { boot } from ${JSON.stringify(runtime)};\nboot({ adapter: { mountStory }, root: ${JSON.stringify(APP)}, tokens: ${JSON.stringify(tokens)}, faces: ${JSON.stringify(faces.css)}, load: () => import("./section-${at}.js") });\n`
    );
    writeFileSync(
      join(src, `canvas-${at}.html`),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>window.__cawcoGraph={asked:0,done:0,whole:true};</script></head><body><main id="cawco-canvas" class="cawco-canvas"></main><script type="module" src="./entry-${at}.js"></script></body></html>`
    );
    input[`canvas-${at}`] = join(src, `canvas-${at}.html`);
    pages.set(file, `${BUILT_SRC}/canvas-${at}.html`);
  }
  const viteHref = Bun.resolveSync("vite", APP);
  const vite = (await import(viteHref)) as {
    build: (config: object) => Promise<unknown>;
    loadConfigFromFile: (
      ...args: unknown[]
    ) => Promise<{ config: Record<string, unknown> } | null>;
  };
  const loaded = await vite.loadConfigFromFile(
    { command: "build", mode: "production", isSsrBuild: false },
    join(APP, "vite.config.ts"),
    APP,
    "warn",
    undefined,
    "native"
  );
  const flat = async (list: unknown): Promise<{ name?: string }[]> => {
    const out: { name?: string }[] = [];
    for (const one of (await list) as unknown[]) {
      const each = await one;
      if (Array.isArray(each)) {
        out.push(...(await flat(each)));
      } else if (each) {
        out.push(each as { name?: string });
      }
    }
    return out;
  };
  const config = loaded?.config ?? {};
  const plugins = (await flat(config.plugins ?? [])).filter(
    (one) => !one.name?.startsWith("vite-plugin-sveltekit")
  );
  const kitStubs = {
    name: "canvas-cost:kit-stubs",
    enforce: "pre" as const,
    resolveId: (id: string) => (id in BUILT_KIT ? `\0${id}` : null),
    load: (id: string) =>
      id.startsWith("\0$app/") ? (BUILT_KIT[id.slice(1)] ?? null) : null,
  };
  let bundled: () => void = () => undefined;
  let refused: (error: Error) => void = () => undefined;
  const written = {
    name: "canvas-cost:written",
    writeBundle: () => bundled(),
    buildEnd: (error?: Error) => {
      if (error) {
        refused(error);
      }
    },
  };
  const started = Date.now();
  const first = new Promise<void>((resolve, reject) => {
    bundled = resolve;
    refused = reject;
  });
  const watcher = (await vite.build({
    ...config,
    configFile: false,
    root: APP,
    logLevel: "warn",
    plugins: [kitStubs, ...plugins, written],
    resolve: {
      ...(config.resolve as object | undefined),
      alias: [{ find: LIB_ALIAS, replacement: `${join(APP, "src/lib")}/` }],
    },
    build: {
      outDir: BUILT_OUT,
      emptyOutDir: true,
      sourcemap: true,
      watch: {},
      rolldownOptions: { input },
    },
  })) as { close: () => Promise<void> };
  await first;
  const buildMs = Date.now() - started;
  mkdirSync(join(BUILT_OUT, BUILT_SRC, "faces"), { recursive: true });
  for (const [name, bytes] of faces.files) {
    writeFileSync(join(BUILT_OUT, BUILT_SRC, "faces", name), bytes);
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = Bun.file(join(BUILT_OUT, path));
      if (path.includes("..") || !(await file.exists())) {
        return new Response("not found", { status: 404 });
      }
      return new Response(file, {
        headers: { "cache-control": "private, max-age=31536000, immutable" },
      });
    },
  });
  return {
    pages,
    buildMs,
    port: server.port as number,
    stop: () => server.stop(true),
    close: () => watcher.close(),
    nextBundle: async () => {
      await readWithin(
        60_000,
        () =>
          new Promise<void>((resolve) => {
            bundled = resolve;
          })
      );
    },
    rebuildMs: async (file, text) => {
      const at = Date.now();
      const done = readWithin(
        60_000,
        () =>
          new Promise<number>((resolve) => {
            bundled = () => resolve(Date.now() - at);
            writeFileSync(file, text);
          })
      );
      const read = await done;
      return { at, rebuildMs: read.kind === "answered" ? read.value : null };
    },
  };
}

/** What a frame's report names as the source of its first frame's elements (a pin's `file:line`), and how many elements carry Svelte's dev place. */
async function pinsOf(kit: Kit, url: string, label: string): Promise<void> {
  const page = await kit.page("desk", {
    scale: 1,
    browser: `canvas-cost-pins-${label}`,
    init: [installCounters],
  });
  await page.goto(url, { waitUntil: "commit", timeout: DRAW_MS });
  await drawn(page);
  const read = await page
    .waitForFunction(
      () => {
        const canvas = (
          window as unknown as {
            __cawcoCanvas?: {
              report: {
                sections: {
                  frames: { parts: { file: string; at: string | null }[] }[];
                }[];
              } | null;
            };
          }
        ).__cawcoCanvas;
        const frames =
          canvas?.report?.sections.flatMap((one) => one.frames) ?? [];
        if (frames.length === 0) {
          return null;
        }
        const placed = [
          ...document.querySelectorAll(".cawco-frame-body *"),
        ].filter((el) => "__svelte_meta" in el).length;
        return {
          parts: frames[0]?.parts.slice(0, 3) ?? [],
          placedElements: placed,
        };
      },
      undefined,
      { timeout: 10_000, polling: 200 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  keep(kit, `pins.${label}`, read);
  await page.close();
}

/** Seconds from a write to `file` until the open canvas at `url` shows `marker` in its looping story, by `reach` (HMR on its own, or a rebuild and a reload). */
async function editToShow(
  kit: Kit,
  url: string,
  label: string,
  marker: string,
  write: () => Promise<{ at: number; rebuildMs: number | null }>,
  reload: boolean
): Promise<void> {
  const page = await kit.page("desk", {
    scale: 1,
    browser: `canvas-cost-edit-${label}`,
    init: [installCounters],
  });
  await page.goto(url, { waitUntil: "commit", timeout: DRAW_MS });
  await page.waitForSelector("[data-loop]", { timeout: DRAW_MS });
  const { at, rebuildMs } = await write();
  if (reload) {
    await page.reload({ waitUntil: "commit" });
  }
  const shown = await page
    .waitForFunction(
      (want) =>
        document.querySelector("[data-loop]")?.textContent?.includes(want) ??
        false,
      marker,
      { timeout: 120_000, polling: 50 }
    )
    .then(() => Date.now() - at)
    .catch(() => null);
  keep(kit, `edit.${label}`, { rebuildMs, writeToShownMs: shown, reload });
  kit.check(
    `edit ${label}: the edit shows on the open canvas (${shown} ms)`,
    shown !== null
  );
  await page.close();
}

/** The looping story's markup with `mark` after its label: what an edit changes. */
const loopWith = (mark: string) =>
  LOOP_SVELTE.replace("{label}</p>", `{label}${mark}</p>`);

async function builtLeg(
  kit: Kit,
  stages: Stage[],
  warm: Stage | null
): Promise<Stage> {
  const stage = warm ?? (await startStage());
  if (!warm) {
    stages.push(stage);
  }
  const picks = await pagePicks(stage.base);
  const [tracedFile, tracedStory] = TRACED.split("#") as [
    string,
    string | undefined,
  ];
  const files = [
    ...new Set([...picks.map((one) => one.file), tracedFile, LOOP_FILE]),
  ];
  // The project's own plugins read from where they run (unplugin-icons finds its icon sets from the working dir), as `vite build` runs in the project.
  const was = process.cwd();
  process.chdir(APP);
  let built: Built;
  try {
    built = await buildCanvases(stage, files);
  } catch (error) {
    process.chdir(was);
    keep(kit, "built.build", {
      entries: files.length,
      error: (error instanceof Error ? error.message : String(error)).slice(
        0,
        2000
      ),
    });
    kit.check("built: the canvases build for production", false);
    return stage;
  }
  const at = (file: string, story?: string) => {
    const url = new URL(
      `http://127.0.0.1:${built.port}/${built.pages.get(file)}`
    );
    url.searchParams.set("file", file);
    url.searchParams.set("by", "embed");
    if (story) {
      url.searchParams.set("story", story);
    }
    return url.href;
  };
  try {
    keep(kit, "built.build", { entries: files.length, buildMs: built.buildMs });
    for (const engine of LEGS.has("built") ? ENGINES : []) {
      const page = await kit.page("desk", {
        scale: 1,
        engine,
        browser: `canvas-cost-built-trace-${engine}`,
        init: [installCounters],
      });
      const cold = await readLoad(
        page,
        at(tracedFile, tracedStory),
        stage,
        engine === "chromium"
      );
      keep(kit, `trace.built.${engine}.cold cache`, cold);
      const again = await page.context().newPage();
      const warmCache = await readLoad(
        again,
        at(tracedFile, tracedStory),
        stage,
        engine === "chromium"
      );
      keep(kit, `trace.built.${engine}.warm cache`, warmCache);
      kit.check(
        `built ${engine}: the built frame of ${TRACED} drew (${cold.frames} frames in ${cold.drawnMs} ms)`,
        cold.drawnMs !== null && cold.frames > 0 && cold.failed.length === 0,
        cold.failed.join(" | ")
      );
      await again.close();
      await page.close();
    }
    if (LEGS.has("built")) {
      await frameLeg(
        kit,
        stages,
        stage,
        "built-frame",
        at(tracedFile, tracedStory)
      );
      await pageLeg(kit, stages, stage, "cards", "built-cards", (one) =>
        at(one.file, one.story)
      );
    }
    if (!LEGS.has("edit")) {
      return stage;
    }
    await pinsOf(kit, embedUrl(stage.base, tracedFile, tracedStory), "dev");
    await pinsOf(kit, at(tracedFile, tracedStory), "built");
    const loop = join(APP, LOOP_DIR, "Loop.svelte");
    // The rebuild the dev stage's edit sets off in the watch, ended before the built page opens.
    const settled = built.nextBundle();
    await editToShow(
      kit,
      embedUrl(stage.base, LOOP_FILE, "Spins"),
      "dev-hmr",
      "!",
      () => {
        const wrote = Date.now();
        writeFileSync(loop, loopWith("!"));
        return Promise.resolve({ at: wrote, rebuildMs: null });
      },
      false
    );
    await settled;
    await editToShow(
      kit,
      at(LOOP_FILE, "Spins"),
      "built-rebuild",
      "?",
      () => built.rebuildMs(loop, loopWith("?")),
      true
    );
  } finally {
    built.stop();
    await built.close();
    process.chdir(was);
  }
  return stage;
}

/**
 * The stage with Vite's experimental bundled dev mode on (`experimental.
 * bundledDev`, vite.dev/blog/announcing-vite8-1), on the dashboard
 * (SvelteKit) and on the plain Vite fixtures (Svelte, React, Vue): whether
 * it starts, whether a canvas draws, and in the words each said.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each project's install, its two starts and what each said, in one walk
async function bundledLeg(kit: Kit, stages: Stage[]): Promise<void> {
  const FIXTURES = join(ROOT, "scripts/probe-kit/fixtures/component-canvas");
  const scratch = join(process.env.TMPDIR ?? "/tmp", "canvas-cost-fixtures");
  const tried: { at: StageAt; file: string; name: string }[] = [
    {
      name: "dashboard (SvelteKit)",
      at: {},
      file: TRACED.split("#")[0] as string,
    },
  ];
  for (const [framework, file] of [
    ["svelte", "src/Badge.stories.js"],
    ["react", "src/Button.stories.jsx"],
    ["vue", "src/Button.stories.js"],
  ] as const) {
    const dir = join(scratch, framework);
    if (!existsSync(join(FIXTURES, framework))) {
      continue;
    }
    mkdirSync(dir, { recursive: true });
    cpSync(join(FIXTURES, framework), dir, { recursive: true });
    rmSync(join(dir, ".cawco/stage/cache"), { recursive: true, force: true });
    const install = Bun.spawnSync(["bun", "install"], { cwd: dir });
    if (install.exitCode !== 0) {
      kit.note(
        `bundled ${framework}: bun install failed: ${install.stderr.toString().slice(0, 300)}`
      );
      continue;
    }
    tried.push({
      name: `${framework} (plain Vite)`,
      at: { root: dir, framework, kit: false },
      file,
    });
  }
  for (const one of tried) {
    for (const bundledDev of [false, true]) {
      let stage: Stage | null = null;
      const label = `${one.name}${bundledDev ? ", bundled dev" : ", unbundled"}`;
      try {
        stage = await startStage({ ...one.at, bundledDev });
        stages.push(stage);
        const page = await kit.page("desk", {
          scale: 1,
          browser: "canvas-cost-bundled",
          init: [installCounters],
        });
        const errors: string[] = [];
        page.on("pageerror", (error) =>
          errors.push(error.message.slice(0, 300))
        );
        page.on("console", (message) => {
          if (message.type() === "error") {
            errors.push(message.text().slice(0, 300));
          }
        });
        let requests = 0;
        page.on("request", () => {
          requests += 1;
        });
        const refused: string[] = [];
        page.on("response", (response) => {
          if (response.status() >= 400) {
            const at = new URL(response.url());
            refused.push(
              `${response.status()} ${at.pathname.replace(KEYED_PREFIX, "")}`
            );
          }
        });
        const t0 = Date.now();
        const answer = await page.goto(embedUrl(stage.base, one.file), {
          waitUntil: "commit",
          timeout: 60_000,
        });
        const drew = await drawn(page)
          .then(() => Date.now() - t0)
          .catch(() => null);
        keep(kit, `bundled.${label}`, {
          status: answer?.status() ?? null,
          drawnMs: drew,
          requests,
          refused: refused.slice(0, 6),
          errors: errors.slice(0, 6),
          stage: stage
            .said()
            .split("\n")
            .filter(
              (line) => STAGE_TROUBLE.test(line) && !line.includes("vite:time")
            )
            .slice(0, 6)
            .map((line) => line.slice(0, 400)),
        });
        await page.close();
      } catch (error) {
        keep(kit, `bundled.${label}`, {
          started: false,
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            1500
          ),
        });
      } finally {
        stage?.stop();
      }
    }
  }
}

/* --- One frame's boot, phase by phase, on any engine ------------------------ */

/**
 * Installed in the frame before its scripts: the moment of each phase of
 * its boot (its graph's list read, the app's styles in, the runtime booted,
 * its graph whole, its first frame made, its first story mounted, drawn)
 * and every stretch its main thread was held past 30 ms (a chain of
 * zero-delay timers: a gap between two is a task that ran that long), so
 * an engine with no profiler for the page (WebKit) still says where its
 * boot went.
 */
function installBootClock(): void {
  if (!location.pathname.includes("/@cawco/canvas")) {
    return;
  }
  const t = () => Math.round(performance.now());
  const clock = {
    at: {} as Record<string, number>,
    held: [] as [number, number][],
    styles: 0,
    styleChars: 0,
  };
  (window as unknown as { __boot: typeof clock }).__boot = clock;
  const mark = (name: string) => {
    clock.at[name] ??= t();
  };
  const trap = (name: string, phase: string) => {
    let value: unknown;
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => value,
      set: (next) => {
        mark(phase);
        value = next;
      },
    });
  };
  trap("__cawcoGraph", "graph listed");
  trap("__cawcoCanvas", "runtime booted");
  addEventListener("cawco:graph-fetched", () => mark("graph whole"));
  addEventListener("message", (event) => {
    const type = (event.data as { type?: string } | null)?.type;
    if (type === "cawco:embed-ready") {
      mark("ready");
    }
  });
  new MutationObserver((changes) => {
    for (const change of changes) {
      for (const node of change.addedNodes) {
        if (node instanceof HTMLStyleElement) {
          mark("first style");
          clock.at["last style"] = t();
          clock.styles += 1;
          clock.styleChars += node.textContent?.length ?? 0;
        }
      }
    }
    if (document.querySelector(".cawco-frame")) {
      mark("frame made");
    }
    if (document.querySelector(".cawco-frame-body *")) {
      mark("story mounted");
    }
    if (document.querySelector('.cawco-frame-status[data-state="drawn"]')) {
      mark("drawn");
    }
  }).observe(document, { childList: true, subtree: true, attributes: true });
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    if (now - last > 30) {
      clock.held.push([Math.round(last), Math.round(now - last)]);
    }
    last = now;
    const drawnAt = clock.at.drawn as number | undefined;
    if (drawnAt === undefined || now - drawnAt < 1000) {
      setTimeout(tick, 0);
    }
  };
  setTimeout(tick, 0);
}

/** A page of one frame answering its graph at once, as a page with that one Preview does. */
const BOOT_HOLDER = (url: string) => `<!doctype html><meta charset="utf-8">
<style>body{margin:0}iframe{display:block;inline-size:100%;block-size:600px;border:0}</style>
<iframe src="${url}"></iframe>
${GRAPH_ANSWER}`;

/**
 * One Preview's frame of `--story` booted on a warm stage in a fresh
 * context, each engine, `--boots` times: each phase's moment, and the main
 * thread held between them (installBootClock), the median of the boots.
 */
async function bootLeg(
  kit: Kit,
  stages: Stage[],
  warm: Stage | null
): Promise<Stage> {
  const stage = warm ?? (await startStage());
  if (!warm) {
    stages.push(stage);
  }
  const [file, story] = TRACED.split("#") as [string, string | undefined];
  const url = embedUrl(stage.base, file, story);
  // Warm: drawn once on its own.
  const first = await kit.page("desk", { scale: 1, init: [installCounters] });
  await first
    .goto(url, { waitUntil: "commit" })
    .then(() => drawn(first))
    .catch(() => undefined);
  await first.close();
  const holder = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(BOOT_HOLDER(url), {
        headers: { "content-type": "text/html" },
      }),
  });
  try {
    for (const engine of ENGINES) {
      const boots: {
        at: Record<string, number>;
        held: [number, number][];
        styles: number;
        styleChars: number;
      }[] = [];
      for (let at = 0; at < BOOTS; at += 1) {
        const page = await kit.page("desk", {
          scale: 1,
          engine,
          browser: `canvas-cost-boot-${engine}`,
          init: [installBootClock],
        });
        await page.goto(`http://127.0.0.1:${holder.port}/`);
        const frame = await (await page.$("iframe"))?.contentFrame();
        await frame?.waitForFunction(
          () =>
            (window as unknown as { __boot?: { at: Record<string, number> } })
              .__boot?.at.drawn !== undefined,
          undefined,
          { timeout: DRAW_MS, polling: 100 }
        );
        await Bun.sleep(1200);
        const read = await frame?.evaluate(
          () =>
            (
              window as unknown as {
                __boot: {
                  at: Record<string, number>;
                  held: [number, number][];
                  styles: number;
                  styleChars: number;
                };
              }
            ).__boot
        );
        if (read) {
          boots.push(read);
        }
        await page.close();
      }
      const median = (values: number[]) =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ??
        null;
      const phases = Object.keys(boots[0]?.at ?? {});
      const at = Object.fromEntries(
        phases.map((name) => [
          name,
          median(boots.map((one) => one.at[name] ?? Number.NaN)),
        ])
      );
      // The main thread held inside each phase: from the phase before it to it.
      const order = Object.entries(at).sort(
        (a, b) => (a[1] ?? 0) - (b[1] ?? 0)
      );
      const heldIn = Object.fromEntries(
        order.map(([name, end], index) => {
          const start = index === 0 ? 0 : (order[index - 1]?.[1] ?? 0);
          return [
            name,
            median(
              boots.map((one) =>
                one.held
                  .filter(
                    ([from, ms]) =>
                      from + ms > (start ?? 0) && from < (end ?? 0)
                  )
                  .reduce((sum, [, ms]) => sum + ms, 0)
              )
            ),
          ];
        })
      );
      keep(kit, `boot.${engine}`, {
        story: TRACED,
        boots: boots.length,
        at,
        heldBefore: heldIn,
        longest: boots[0]?.held.sort((a, b) => b[1] - a[1]).slice(0, 8),
        styles: boots[0]?.styles,
        styleChars: boots[0]?.styleChars,
      });
      kit.check(
        `boot ${engine}: ${TRACED} drew ${boots.length} of ${BOOTS} boots (median ${at.drawn ?? "never"} ms)`,
        boots.length === BOOTS
      );
    }
  } finally {
    holder.stop(true);
  }
  return stage;
}

/* --- A decision page of Previews, as the person opens and scrolls it ------- */

/** The owner's window, as he reads a decision page. */
const PERSON_VIEW = { width: 1037, height: 760 };
/** A person's steady scroll through a page, px a second: a wheel's 100 px notches about twelve a second. Our call. */
const PERSON_SCROLL = Number(arg("scroll") ?? 1200);
/** How long the embed origin holds each answer: the hops through the hub's preview proxy (decision-embeds.ts `embedOrigin`). */
const DECISION_HOLD_MS = 350;
/** Options to a card on the leg's page. */
const PER_CARD = 3;

/** The leg's program: `picks` as Previews, `PER_CARD` options to a card, each its one Preview. */
function decisionProgram(
  picks: { file: string; story: string }[],
  idOf: (file: string) => string
): string {
  const cards = Math.ceil(picks.length / PER_CARD);
  const lines = [
    `root = Decisions("A page of ${picks.length} canvases", [${Array.from({ length: cards }, (_, at) => `c${at}`).join(", ")}])`,
  ];
  for (let card = 0; card < cards; card += 1) {
    const mine = picks.slice(card * PER_CARD, (card + 1) * PER_CARD);
    lines.push(
      `c${card} = Decision("c${card}", "Which reads right, ${card + 1} of ${cards}?", [${mine.map((_, at) => `c${card}o${at}`).join(", ")}], "Each option shows a canvas.")`
    );
    mine.forEach((pick, at) => {
      const n = card * PER_CARD + at;
      lines.push(
        `c${card}o${at} = Option("c${card}o${at}", "Option ${at + 1}", "This canvas.", ${at === 0}, [p${n}], "Another.")`,
        `p${n} = Preview("${idOf(pick.file)}", "${pick.story}", ["${pick.story}"])`
      );
    });
  }
  return lines.join("\n");
}

/**
 * The decision page's own clock and samples, in the page: every 50 ms, each
 * well in the scroller's view holds its drawn frame, its skeleton, or
 * nothing (an empty box, kept with what it held).
 */
function decisionSampler(): void {
  if (location.pathname.includes("/@cawco/canvas")) {
    return;
  }
  const seen = { samples: 0, waiting: 0, empty: [] as string[], drawn: 0 };
  (window as unknown as { __seen: typeof seen }).__seen = seen;
  setInterval(() => {
    const scroller = document.querySelector("[data-slot=page-scroll]");
    if (!scroller) {
      return;
    }
    const view = scroller.getBoundingClientRect();
    const wells = [
      ...document.querySelectorAll<HTMLElement>("[data-slot=media]"),
    ];
    seen.drawn = wells.filter((well) => {
      const frame = well.querySelector<HTMLIFrameElement>(
        "iframe[data-slot=embed]"
      );
      return (
        frame?.dataset.shape === "drawn" && frame.dataset.drawn !== undefined
      );
    }).length;
    wells.forEach((well, at) => {
      const box = well.getBoundingClientRect();
      if (box.bottom <= view.top || box.top >= view.bottom) {
        return;
      }
      seen.samples += 1;
      const frame = well.querySelector<HTMLIFrameElement>(
        "iframe[data-slot=embed]"
      );
      if (
        frame?.dataset.shape === "drawn" &&
        frame.dataset.drawn !== undefined
      ) {
        return;
      }
      const skeleton = well
        .querySelector("[data-slot=embed-wait] [data-slot=skeleton]")
        ?.getBoundingClientRect();
      if (skeleton && skeleton.width > 0 && skeleton.height > 0) {
        seen.waiting += 1;
      } else if (seen.empty.length < 8) {
        seen.empty.push(
          `well ${at + 1}: ${frame ? "frame not drawn" : "no frame"}, no skeleton`
        );
      }
    });
  }, 50);
}

/**
 * Installed in every frame: what its document fetched, by its resource
 * timing (each resource it loaded, and the document itself), told to the
 * top document, which keeps each document's last count, a gone one's too
 * (`__documentRequests`: their sum). WebKit with no inspector says no
 * request to anything watching; this counts alike in either engine.
 */
function documentRequests(): void {
  const id = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  let fetched = 1;
  const tell = () =>
    top?.postMessage({ type: "probe:document-requests", id, fetched }, "*");
  if (window === top) {
    const counts = new Map<string, number>();
    (window as unknown as DocumentRequests).__documentRequests = () =>
      [...counts.values()].reduce((sum, one) => sum + one, 0);
    addEventListener("message", (event) => {
      const said = event.data as {
        fetched?: unknown;
        id?: unknown;
        type?: unknown;
      } | null;
      if (
        said?.type === "probe:document-requests" &&
        typeof said.id === "string" &&
        typeof said.fetched === "number"
      ) {
        counts.set(said.id, said.fetched);
      }
    });
  }
  new PerformanceObserver((list) => {
    fetched += list.getEntries().length;
    tell();
  }).observe({ type: "resource", buffered: true });
  tell();
}

/** The top document's count of what its documents fetched ({@link documentRequests}). */
interface DocumentRequests {
  __documentRequests: () => number;
}

/** In the page: every Preview in the scroller's view drawn. */
const firstScreenDrawn = (): boolean => {
  const scroller = document.querySelector("[data-slot=page-scroll]");
  const view = scroller?.getBoundingClientRect();
  const wells = [
    ...document.querySelectorAll<HTMLElement>("[data-slot=media]"),
  ].filter((well) => {
    const box = well.getBoundingClientRect();
    return view && box.bottom > view.top && box.top < view.bottom;
  });
  return (
    wells.length > 0 &&
    wells.every((well) => {
      const frame = well.querySelector<HTMLIFrameElement>(
        "iframe[data-slot=embed]"
      );
      return (
        frame?.dataset.shape === "drawn" && frame.dataset.drawn !== undefined
      );
    })
  );
};

/** In the page: its scroller scrolled to its end at `speed` px a second, one step a frame; answers the time it took, ms. */
const scrolledToEnd = (speed: number): Promise<number> =>
  new Promise<number>((done) => {
    const scroller = document.querySelector(
      "[data-slot=page-scroll]"
    ) as HTMLElement;
    const t0 = performance.now();
    let last = t0;
    const step = (now: number) => {
      scroller.scrollTop += (speed * (now - last)) / 1000;
      last = now;
      if (
        scroller.scrollTop + scroller.clientHeight >=
        scroller.scrollHeight - 1
      ) {
        done(Math.round(now - t0));
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

/** The scripts the decision leg's page runs before its own, in every frame. */
const DECISION_INIT = [CAWCO_BRIDGE, decisionSampler, documentRequests];

/**
 * The decision leg's page in one engine, driven the same in either: a call
 * run in it, a test waited on, its browser's page processes' memory, and
 * the requests its page made.
 */
interface DecisionPage {
  close: () => Promise<void>;
  /** Whether an inspector watches it (Playwright's). */
  inspected: boolean;
  memoryMb: () => number;
  /** Takes the page to `url`, answering once its document has loaded. */
  open: (url: string) => Promise<void>;
  /** What its documents fetched ({@link documentRequests}), and, where Playwright watches the page, every request it saw. */
  requests: () => Promise<{ documentRequests: number; requests?: number }>;
  run: <A, R>(
    fn: (value: A) => R | Promise<R>,
    value: A
  ) => Promise<Awaited<R>>;
  /** Answers once `test` holds in the page, asked every `every` ms, within {@link DRAW_MS}. */
  until: <A>(
    test: (value: A) => boolean,
    value: A,
    every: number
  ) => Promise<void>;
}

/** The page under Playwright (the leg's Chromium), in a fresh context at the owner's window. */
async function inspectedDecisionPage(
  kit: Kit,
  engine: Engine
): Promise<DecisionPage> {
  const before = new Set(browserPids([]));
  const page = await kit.page("desk", {
    scale: 1,
    engine,
    browser: `canvas-cost-decision-${engine}`,
    init: DECISION_INIT,
    ignoreHTTPSErrors: true,
  });
  await page.setViewportSize(PERSON_VIEW);
  let requests = 0;
  page.on("request", () => {
    requests += 1;
  });
  return {
    inspected: true,
    open: async (url) => {
      await page.goto(url, { waitUntil: "load" });
    },
    // Playwright's types unbox what a call is given (a handle for its object): the leg gives none, so the page's copy of `value` is `value` itself.
    run: (fn, value) => page.evaluate(fn as never, value) as never,
    until: async (test, value, every) => {
      await page.waitForFunction(test as never, value, {
        timeout: DRAW_MS,
        polling: every,
      });
    },
    requests: async () => ({
      requests,
      documentRequests: await page.evaluate(() =>
        (window as unknown as DocumentRequests).__documentRequests()
      ),
    }),
    memoryMb: () =>
      memoryMb(
        pageProcesses(browserPids([]).filter((pid) => !before.has(pid)))
      ),
    close: () => page.close(),
  };
}

/**
 * The page in WebKit with no inspector ({@link noInspectorWebKit}), as a
 * person runs it: at the owner's window, the run's certificate (`tls`)
 * trusted, the leg's scripts in every frame as a context's are, and the
 * kit bridge's agent in its top document beside them, which runs the leg's
 * calls, the bridge on HTTPS with that certificate as the page is. It
 * starts on a page of the bridge's own, and `open` takes it on from there
 * as a link would.
 */
async function uninspectedDecisionPage(tls: {
  cert: string;
  key: string;
}): Promise<DecisionPage> {
  // On HTTPS as the page is: WebKit turns away a secure page's request to an HTTP bridge as mixed content.
  const bridge = safariBridge(tls);
  const blank = bridge.html("decision-start", "", "");
  const browser = noInspectorWebKit(blank, {
    init: [
      ...DECISION_INIT,
      // The bridge's own page carries its agent already.
      {
        content: `if (window === top && location.origin !== ${JSON.stringify(bridge.origin)}) {\n${bridge.agent}\n}`,
      },
    ],
    size: PERSON_VIEW,
    ignoreTlsErrors: true,
  });
  const end = () => {
    browser.end();
    bridge.stop();
    return Promise.resolve();
  };
  let page: SafariPage;
  try {
    page = await bridge.page((href) => href === blank);
  } catch (error) {
    await end();
    throw error;
  }
  return {
    inspected: false,
    open: async (url) => {
      // Its answer is lost with the page it leaves (the agent's post of it, cancelled as the next page comes in), so it is not waited on: the next page's agent asking is the answer.
      page
        .run(
          (to: string) => {
            setTimeout(() => location.assign(to), 0);
          },
          [url],
          5000
        )
        .catch(() => undefined);
      page = await bridge.page((href) => href === url, DRAW_MS);
      await page.run(
        () =>
          document.readyState === "complete"
            ? undefined
            : new Promise<undefined>((done) =>
                addEventListener("load", () => done(undefined), {
                  once: true,
                })
              ),
        [],
        DRAW_MS
      );
    },
    run: (fn, value) => page.run(fn, [value], DRAW_MS),
    until: async (test, value, every) => {
      // Asked from here, a call at a time: the agent runs what it is given and nothing it would have to build.
      const by = Date.now() + DRAW_MS;
      while (!(await page.run(test, [value], DRAW_MS))) {
        if (Date.now() > by) {
          throw new Error(`it did not hold within ${DRAW_MS} ms`);
        }
        await Bun.sleep(every);
      }
    },
    requests: async () => ({
      documentRequests: await page.run(
        () => (window as unknown as DocumentRequests).__documentRequests(),
        [],
        DRAW_MS
      ),
    }),
    memoryMb: browser.memory,
    close: end,
  };
}

/**
 * A decision page of `--embeds` Previews, each one story of the dashboard's
 * states files (as the page leg picks them), on the decision host the hub
 * serves (decision-embeds.ts `startDecisionStage`), the embed origin on
 * HTTPS over HTTP/2 holding each answer {@link DECISION_HOLD_MS}, the stage
 * warm and the page's media knowing each Preview's shape (a first page
 * scrolled through told them), each engine in a fresh browser at the
 * owner's window (Chromium under Playwright, WebKit with no inspector:
 * {@link DecisionPage}): until every Preview in the first screen is drawn,
 * then scrolled to its end at a person's pace ({@link PERSON_SCROLL}) and
 * on until every Preview is drawn. At each: the time, the frames on the
 * page, the requests made, and the browser's page processes' memory; while
 * scrolling, every 50 ms, each Preview in view holds its frame drawn, its
 * skeleton, or nothing.
 */
async function decisionLeg(kit: Kit): Promise<void> {
  const files = statesFiles().filter((file) => !file.startsWith(LOOP_DIR));
  const idOf = (file: string) => decisionId(`cost-${files.indexOf(file)}`);
  const programs = new Map<string, string>();
  const tls = await scratchCertificate(kit.out, ["localhost"]);
  const stage = await startDecisionStage(
    programs,
    Object.fromEntries(files.map((file) => [idOf(file), [file]])),
    { root: APP, kit: true },
    {},
    new Set(),
    DECISION_HOLD_MS,
    tls
  );
  try {
    const base = `http://127.0.0.1:${stage.stagePort}`;
    const picks = await pagePicks(base);
    programs.set("many", decisionProgram(picks, idOf));
    // The stage warm: every states file drawn once on it.
    const warmPage = await kit.page("desk", {
      scale: 1,
      init: [installCounters],
    });
    for (const one of new Set(picks.map((pick) => pick.file))) {
      // A load Vite's client cut short (a dependency it built since: it reloads the page) is warm enough.
      await warmPage
        .goto(embedUrl(base, one), { waitUntil: "commit" })
        .then(() => drawn(warmPage))
        .catch(() => undefined);
    }
    await warmPage.close();
    // Its Previews' shapes told once (each Preview tells the shape its canvas said, beside its page), so every next page's skeletons stand at their pictures' shapes, as a page the hub's media knows does.
    const prime = await kit.page("desk", {
      scale: 1,
      init: [CAWCO_BRIDGE, decisionSampler],
      ignoreHTTPSErrors: true,
    });
    await prime.setViewportSize(PERSON_VIEW);
    await prime.goto(stage.pageUrl("many", "light"), { waitUntil: "load" });
    for (let pass = 0; pass < 200; pass += 1) {
      const all = await prime.evaluate((count) => {
        const scroller = document.querySelector("[data-slot=page-scroll]");
        if (scroller) {
          scroller.scrollTop += scroller.clientHeight / 2;
          if (
            scroller.scrollTop + scroller.clientHeight >=
            scroller.scrollHeight - 1
          ) {
            scroller.scrollTop = 0;
          }
        }
        return (
          (window as unknown as { __seen: { drawn: number } }).__seen.drawn ===
          count
        );
      }, picks.length);
      if (all) {
        break;
      }
      await Bun.sleep(500);
    }
    await prime.close();
    for (const engine of ENGINES) {
      // WebKit as a person runs it: under Playwright its inspector keeps every frame the page lets go of, and the memory read would be the inspector's.
      const page =
        engine === "webkit"
          ? await uninspectedDecisionPage(tls)
          : await inspectedDecisionPage(kit, engine);
      try {
        const at = async (label: string, startedAt: number) => ({
          label,
          ms: Date.now() - startedAt,
          frames: await page.run(
            () => document.querySelectorAll("iframe[data-slot=embed]").length,
            null
          ),
          drawn: await page.run(
            () =>
              (window as unknown as { __seen: { drawn: number } }).__seen.drawn,
            null
          ),
          ...(await page.requests()),
          pageProcessMb: page.memoryMb(),
        });
        const started = Date.now();
        await page.open(stage.pageUrl("many", "light"));
        // The first screen: every Preview in the scroller's view drawn.
        await page.until(firstScreenDrawn, null, 50);
        const firstMs = Date.now() - started;
        // What the first screen set off settles (later turns, fonts).
        await Bun.sleep(3000);
        const first = {
          ...(await at("first screen", started)),
          settledMs: firstMs,
        };
        const shown = await page.run(
          () => ({ width: innerWidth, height: innerHeight }),
          null
        );
        await page.run(() => {
          const seen = (
            window as unknown as {
              __seen: { samples: number; waiting: number; empty: string[] };
            }
          ).__seen;
          seen.samples = 0;
          seen.waiting = 0;
          seen.empty = [];
        }, null);
        // Scrolled to its end at a person's pace, one step a frame.
        const scrolledMs = await page.run(scrolledToEnd, PERSON_SCROLL);
        const scrollStart = Date.now();
        await page.until(
          (count) =>
            (window as unknown as { __seen: { drawn: number } }).__seen
              .drawn === count,
          picks.length,
          100
        );
        await Bun.sleep(3000);
        const end = await at("scrolled to the end", scrollStart);
        const seen = await page.run(
          () =>
            (
              window as unknown as {
                __seen: { samples: number; waiting: number; empty: string[] };
              }
            ).__seen,
          null
        );
        keep(kit, `decision.${engine}`, {
          previews: picks.length,
          view: PERSON_VIEW,
          window: shown,
          inspector: page.inspected,
          scrollPxPerS: PERSON_SCROLL,
          first,
          scrolledMs,
          end,
          whileScrolling: seen,
        });
        kit.check(
          `decision ${engine}: the page stands in the owner's window (${shown.width} × ${shown.height}, his ${PERSON_VIEW.width} × ${PERSON_VIEW.height})`,
          shown.width === PERSON_VIEW.width &&
            shown.height === PERSON_VIEW.height
        );
        kit.check(
          `decision ${engine}: while scrolled at ${PERSON_SCROLL} px/s, no Preview in view is an empty box (${seen.empty.length} of ${seen.samples} samples)`,
          seen.samples > 0 && seen.empty.length === 0,
          seen.empty.join("; ") || undefined
        );
        kit.check(
          `decision ${engine}: while scrolled at ${PERSON_SCROLL} px/s, every Preview had drawn before it came into view (${seen.waiting} of ${seen.samples} samples in view still waiting)`,
          seen.samples > 0 && seen.waiting === 0
        );
        kit.check(
          `decision ${engine}: every one of the ${picks.length} Previews drawn once scrolled to the end (${end.drawn})`,
          end.drawn === picks.length
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await stage.stop();
  }
}

/* --- What a decision page's canvases keep in WebKit, idle and gone ------ */

/** The memory leg's Previews: three-designs' count (live-perf.ts `PAGES`), the page the audit watched grow. */
const MEMORY_PREVIEWS = 10;
/** How long after its frame is taken away the page's memory is read, s. */
const GONE_S = 60;
/**
 * How many times the page is opened and taken away. What a gone page let go
 * of is collected when JSC next collects, which nothing in a page can ask
 * for, and an idle web process allocates little to make it: with no
 * inspector, six rounds' drawn memory read 1027, 1189, 1258, 1382, 1095,
 * 1206 MB (its first four alone climbing), and 60 s after each page went
 * 440, 552, 715, 336, 510, 1030 MB.
 */
const MEMORY_ROUNDS = Number(arg("rounds") ?? 6);
/**
 * How many of them a run under Playwright reads: three show it keeping
 * every frame a page took away (the hub's page 977, 1545, 2098 MB after a
 * full collection), and by the sixth the control's kept frames took its
 * browser past the kit's 6 GiB cap (killed at 6.01 GiB).
 */
const PLAYWRIGHT_ROUNDS = Math.min(MEMORY_ROUNDS, 3);
/** How long a page opened again stands before it is taken away, s. */
const MEMORY_REST_S = 20;

/**
 * The memory leg's runs. `uninspected`: the hub's page in WebKit as a person
 * runs it, nothing automating it; `collected`: the same with every
 * collection full (`JSC_useGenerationalGC=0`) and the holder going on after
 * each page goes, so what a gone page holds is read, not when JSC next
 * collects; `playwright`: the same page in WebKit under Playwright, as the
 * audit read it, whose inspector keeps every frame a page takes away, so
 * run only when asked for, to show it; each with `-control`, a page of
 * frames holding plain objects and no app at all, in place of the hub's.
 */
const MEMORY_RUNS = (
  arg("memory-runs") ?? "uninspected,collected,collected-control"
).split(",") as (
  | "uninspected"
  | "uninspected-control"
  | "collected"
  | "collected-control"
  | "playwright"
  | "playwright-control"
)[];

/** A decision page of `picks`, a Preview of one story each, on cards of two options. */
const memoryProgram = (picks: { id: string; story: string }[]): string => {
  const cards = Array.from(
    { length: Math.ceil(picks.length / 2) },
    (_, at) => `c${at}`
  );
  return [
    `root = Decisions("Ten canvases on one page", [${cards.join(", ")}])`,
    ...cards.flatMap((card, at) => [
      `${card} = Decision("${card}", "Which reads right, ${at + 1} of ${cards.length}?", [${card}a, ${card}b], "Each option shows a canvas.")`,
      `${card}a = Option("${card}a", "First", "This canvas.", true, [p${at * 2}], "The other.")`,
      `${card}b = Option("${card}b", "Second", "That canvas.", false, [p${at * 2 + 1}], "The first.")`,
    ]),
    ...picks.map(
      (one, at) =>
        `p${at} = Preview("${one.id}", "Canvas ${at + 1}", ["${one.story}"])`
    ),
  ].join("\n");
};

/**
 * What the memory leg opens: `decision`, the hub's decision page of ten
 * canvas Previews (its overlay in it and in every canvas, as the hub serves
 * it); `bare`, that page with no overlay anywhere; `canvases`, its ten
 * canvases alone, no decision page; `loop`, ten canvases of the spec's own
 * one-element story (the canvas machinery and no dashboard component);
 * `vite`, the control's frames each with Vite's client (its HMR socket to
 * the stage) beside its objects; `xorigin`, the control's frames on an
 * origin of their own, as a canvas stands on the stage's; `cut-…`, ten of
 * the loop's canvases through a relay of the stage that cuts their page down
 * ({@link CUTS});
 * `control`, ten frames of plain objects and no app. `--memory-page` names the one its app runs open (decision by
 * default); its `-control` runs open the control.
 */
type MemoryPage =
  | "decision"
  | "bare"
  | "canvases"
  | "loop"
  | "vite"
  | "xorigin"
  | `cut-${keyof typeof CUTS}`
  | "control"
  | `probe-${keyof typeof PROBES}`;
/** The pages `--memory-page` names (comma-separated), each read in a browser of its own: decision by default. */
const MEMORY_PAGES = (arg("memory-page") ?? "decision").split(",") as Exclude<
  MemoryPage,
  "control"
>[];

/**
 * One engine feature or one of the stage's resources each, in the control's
 * frame (its callback reaching the frame's objects, `held`), calling
 * `ready()` once it stands: what a frame still standing on it keeps once it
 * is gone, read with every collection full. `stage`: the stage's address.
 */
const PROBES = {
  raf: () =>
    "const tick = () => { void held.length; requestAnimationFrame(tick); }; requestAnimationFrame(tick); ready();",
  interval: () => "setInterval(() => void held.length, 1000); ready();",
  resize: () =>
    "new ResizeObserver(() => void held.length).observe(document.documentElement); ready();",
  intersection: () =>
    "new IntersectionObserver(() => void held.length).observe(document.documentElement); ready();",
  mutation: () =>
    "new MutationObserver(() => void held.length).observe(document, { subtree: true, childList: true, attributes: true }); setInterval(() => document.documentElement.toggleAttribute('data-x'), 500); ready();",
  animation: () =>
    "document.documentElement.held = held; document.documentElement.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 1000, iterations: Infinity }); ready();",
  message: () =>
    "addEventListener('message', () => void held.length); ready();",
  fonts: () => "document.fonts.ready.then(() => void held.length); ready();",
  // A big sheet of width rules, as the kit's Tailwind sheet is, never written to.
  "css-big": () => `${BIG_SHEET} ready();`,
  // The same sheet, each width rule made a container rule as canvas/width.ts `asFrame` makes it.
  "css-rewrite": () =>
    `${BIG_SHEET} const sheet = style.sheet; for (let at = 0; at < sheet.cssRules.length; at += 1) { const rule = sheet.cssRules[at]; if (rule instanceof CSSMediaRule) { const inner = [...rule.cssRules].map((one) => one.cssText).join("\\n"); sheet.insertRule("@container cawco-width " + rule.media.mediaText.replace("width >=", "width >=") + " {\\n" + inner + "\\n}", at + 1); sheet.deleteRule(at); } } ready();`,
  // A media query's change listener, as the canvas's scheme follows the OS's (canvas/scheme.ts).
  media: () =>
    "matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void held.length); ready();",
  // A house face piece from the stage, text set in it, as a canvas's kit sets its text.
  webfont: (stage: string) =>
    `const face = document.createElement("style"); face.textContent = "@font-face { font-family: Probe; src: url(${stage}/src/house-faces/face-bd695ce806ea7f47.woff2) format('woff2'); }"; document.head.append(face); const line = document.createElement("p"); line.style.fontFamily = "Probe"; line.textContent = "The quick brown fox " + held.length; document.body.append(line); document.fonts.load("16px Probe").then(ready, ready);`,
  // A component from the stage, and the Svelte runtime it imports, as modules.
  modules: (stage: string) =>
    `import("${stage}/src/lib/cawco/probe-canvas-cost/Loop.svelte").then(ready, ready);`,
  // The kit's stylesheet from the stage, as Vite injects it into a canvas.
  css: (stage: string) => `import("${stage}/src/app.css").then(ready, ready);`,
} as const;

/** The canvases alone: a frame of each, its graph answered as a page with it alone answers it ({@link GRAPH_ANSWER}), counted once it says its shape (`said`), or with `byLoad` once it has loaded (a page that draws nothing). */
const CANVASES_PAGE = (urls: string[], byLoad = false) =>
  byLoad
    ? `<!doctype html>${GRAPH_ANSWER}<script>window.said = 0;</script>${urls.map((url) => `<iframe src="${url}" onload="window.said += 1"></iframe>`).join("")}`
    : `<!doctype html>${GRAPH_ANSWER}<script>window.said = 0; const seen = new Set(); addEventListener("message", (event) => { if (event.data && event.data.type === "cawco:embed-size" && !seen.has(event.source)) { seen.add(event.source); window.said = seen.size; } });</script>${urls.map((url) => `<iframe src="${url}"></iframe>`).join("")}`;

/** What the canvas page's entry imports, at the page's keyed addresses (stage-host host.ts `entryModule`), as the stage served it. */
interface EntryParts {
  adapter: string;
  /** The page's keyed prefix, `/@cawco/m/<key>`: the entry's own `BASE`. */
  base: string;
  runtime: string;
  /** The entry as served. */
  source: string;
  styles: string[];
}

/** The entry's imports, read off its served source, at `src`. */
const entryPartsOf = (source: string, src: string): EntryParts => {
  const all = [...source.matchAll(IMPORTED)].map((m) => m[1] as string);
  return {
    adapter: all.find((one) => one.includes("adapter.js")) ?? "",
    base: src.replace(ENTRY_PATH, ""),
    runtime: all.find((one) => one.includes("runtime.js")) ?? "",
    source,
    styles: all.filter((one) => CSS_ADDRESS.test(one)),
  };
};
/** The entry's own address under the page's key. */
const ENTRY_PATH = /\/@id\/__x00__cawco:stage\/entry\.js$/;
/** The entry's `BASE` (stage-host host.ts `entryModule`), read off its address, which an inline copy of it doesn't have. */
const ENTRY_BASE = /const BASE = [^\n]*\n/;
/** The entry's `load` of a section's module. */
const ENTRY_LOAD = /load: \(file, fresh\) => import\([^\n]*\n/;
/** The control's objects, as a script line. */
const HELD_LINE =
  'window.held = Array.from({ length: 400000 }, (_, i) => ({ i, s: String(i).padEnd(40, "x") }));';

/** The entry inlined in its place, `edit` made to its source, the control's objects beside it, saying the frame's shape once it has run. */
const bootOf = (
  html: string,
  entry: EntryParts,
  edit: (source: string) => string
): string =>
  html.replace(
    ENTRY_TAG,
    `<script type="module">${edit(entry.source.replace(ENTRY_BASE, `const BASE = ${JSON.stringify(entry.base)};\n`))}\n${HELD_LINE}parent.postMessage({ type: "cawco:embed-size", height: 1 }, "*");</script>`
  );
/** A static import's address in a module's source. */
const IMPORTED = /^import\s(?:[^"';]*\sfrom\s)?"([^"]+)";/gm;
/** A stylesheet's address, a query after it or not. */
const CSS_ADDRESS = /\.css(?:\?|$)/;

/** The entry's place taken by an inline module importing `addresses`, which says the frame's shape once they have run. */
const entryOf = (html: string, addresses: string[]): string =>
  html.replace(
    ENTRY_TAG,
    `<script type="module">${addresses.map((one) => `import ${JSON.stringify(one)};`).join("")}window.held = Array.from({ length: 400000 }, (_, i) => ({ i, s: String(i).padEnd(40, "x") }));parent.postMessage({ type: "cawco:embed-size", height: 1 }, "*");</script>`
  );

/**
 * Cuts of a canvas page as the stage serves it, each made by a relay of the
 * stage (decision-embeds.ts `embedOrigin`): `same`, the page as served;
 * `nopreload`, without its graph's preloads (and their counter); `noentry`,
 * without the entry module that boots the canvas (Vite's client stays);
 * `styles`, the entry's global styles alone; `runtime`, those and the canvas
 * runtime's module, never booted; `adapter`, those and the framework's
 * adapter, never booted; each of these three with the control's objects
 * beside it, so a frame kept once gone shows; `boot`, the entry inlined as
 * served, the objects beside it; `boot-noload`, the same, no section's
 * module ever loaded; `boot-importonly`, each section's module imported
 * (evaluated) and never handed to the runtime; `boot-nomount`, each section
 * loaded, no story mounted; `boot-nofaces`, the whole canvas with no house
 * faces in its page style.
 */
const CUTS = {
  same: (html: string) => html,
  nopreload: (html: string) =>
    html.replace(PRELOAD_LINK, "").replace(PRELOAD_COUNTER, ""),
  noentry: (html: string) => html.replace(ENTRY_TAG, ""),
  styles: (html: string, entry: EntryParts) => entryOf(html, entry.styles),
  runtime: (html: string, entry: EntryParts) =>
    entryOf(html, [...entry.styles, entry.runtime]),
  adapter: (html: string, entry: EntryParts) =>
    entryOf(html, [...entry.styles, entry.adapter]),
  boot: (html: string, entry: EntryParts) =>
    bootOf(html, entry, (source) => source),
  "boot-noload": (html: string, entry: EntryParts) =>
    bootOf(html, entry, (source) =>
      source.replace(ENTRY_LOAD, "load: () => new Promise(() => undefined),\n")
    ),
  "boot-importonly": (html: string, entry: EntryParts) =>
    bootOf(html, entry, (source) =>
      source.replace(
        ENTRY_LOAD,
        (line) =>
          `load: (...asked) => { (${line.slice("load: ".length).replace(TRAILING_COMMA, "")})(...asked); return new Promise(() => undefined); },\n`
      )
    ),
  "boot-nofaces": (html: string, entry: EntryParts) =>
    bootOf(html, entry, (source) =>
      source.replace(ENTRY_FACES, 'faces: "",\n')
    ),
  "boot-nomount": (html: string, entry: EntryParts) =>
    bootOf(html, entry, (source) =>
      source.replace(
        ENTRY_ADAPTER,
        "adapter: { mountStory: () => ({ unmount() {}, update() {} }) },"
      )
    ),
} as const;
/** The entry's house faces, a JSON string (stage-host host.ts `entryModule`). */
const ENTRY_FACES = /faces: "(?:[^"\\]|\\.)*",\n/;
/** A source line's trailing comma and newline. */
const TRAILING_COMMA = /,\n$/;
/** The entry's adapter option, by its shape (stage-host host.ts `entryModule`). */
const ENTRY_ADAPTER = /adapter: \{[^}\n]*\},/;
/** A canvas page's preload of its graph (stage-host host.ts `graphPreloads`). */
const PRELOAD_LINK = /<link rel="modulepreload" href="[^"]*">/g;
/** The script counting them (`__cawcoGraph`). */
const PRELOAD_COUNTER =
  /<script>\(function\(\)\{var g=window\.__cawcoGraph[\s\S]*?<\/script>/;
/** The canvas page's entry module (stage-host host.ts `CANVAS_ENTRY`, keyed). */
const ENTRY_TAG = /<script type="module" src="[^"]*entry\.js"><\/script>/;
/** Its address. */
const ENTRY_SRC = /<script type="module" src="([^"]*entry\.js)"><\/script>/;
/** The stage's module key in a page it served. */
const STAGE_KEY = /\/@cawco\/m\/([^/"]+)\//;

/** The control's frame with Vite's client from `stage` beside its objects: it says so once the client has run. */
const VITE_CHILD = (stage: string) =>
  `<!doctype html><script>window.held = Array.from({ length: 400000 }, (_, i) => ({ i, s: String(i).padEnd(40, "x") }));</script><script type="module">import "${stage}/@vite/client"; parent.postMessage({ type: "cawco:embed-size", height: 1 }, "*");</script>`;

/** A sheet of 4000 rules, one in four inside a width `@media`, written as one `<style>` (`style`), the same text in every frame. */
const BIG_SHEET =
  'const style = document.createElement("style"); const rules = []; for (let i = 0; i < 4000; i += 1) { const rule = ".p" + i + " { color: rgb(" + (i % 255) + ", 10, 20); padding: " + (i % 13) + "px; }"; rules.push(i % 4 === 0 ? "@media (width >= " + (40 + (i % 5) * 8) + "rem) { " + rule + " }" : rule); } style.textContent = rules.join("\\n"); document.head.append(style);';

/** The control's frame with one of {@link PROBES} standing on its objects: it says so once standing. */
const PROBE_CHILD = (probe: string) =>
  `<!doctype html><body><script type="module">window.held = Array.from({ length: 400000 }, (_, i) => ({ i, s: String(i).padEnd(40, "x") })); const ready = () => parent.postMessage({ type: "cawco:embed-size", height: 1 }, "*"); ${probe}</script></body>`;

/** The control's frame: no app at all, some 50 MB of plain objects held on its window. */
const CONTROL_CHILD = `<!doctype html><script>window.held = Array.from({ length: 400000 }, (_, i) => ({ i, s: String(i).padEnd(40, "x") }));</script>`;
/** The control: a page of {@link MEMORY_PREVIEWS} such frames, as many as the decision page has Previews. */
const CONTROL_PAGE = (child: string) =>
  `<!doctype html>${Array.from({ length: MEMORY_PREVIEWS }, () => `<iframe src="${child}"></iframe>`).join("")}`;

/**
 * Where the page stands in a frame of its own, as the dashboard's panel
 * holds one: the frame taken away is the page gone. Served on the page's
 * own origin, so it is read from here alone, through the page's document,
 * with no handle into its frames. `window.memoryPage` opens the page at a
 * URL and answers once it is drawn (every Preview at its drawn shape, the
 * page read through to its end a screen at a time, each once what stands
 * in its view has drawn, as a person reading it does: a Preview mounts and
 * draws only as it nears the view;
 * the control's frames each holding their objects), `memoryGone` takes it away,
 * `memoryFacts` says how the page stands (its visibility, focus, and the
 * animation frames it is given in a second). `?agent=<bridge>` puts the
 * kit's bridge's agent in it (safari-bridge.ts), which runs the leg's calls
 * in a browser nothing automates.
 */
const MEMORY_HOLDER = `<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{display:block;inline-size:1440px;block-size:900px;border:0}</style>
<script>
(() => {
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const ready = (frame, kind) => {
    const inner = frame.contentDocument;
    if (!inner) return false;
    if (kind === "control") return [...inner.querySelectorAll("iframe")].filter((one) => one.contentWindow && one.contentWindow.held !== undefined).length === ${MEMORY_PREVIEWS};
    if (kind === "canvases" || kind.startsWith("loop") || kind === "vite" || kind === "xorigin" || kind.startsWith("probe-") || kind.startsWith("cut-")) return inner.defaultView.said === ${MEMORY_PREVIEWS};
    return [...inner.querySelectorAll(${JSON.stringify(EMBED_FRAME)})].filter((one) => one.dataset.shape === "drawn").length === ${MEMORY_PREVIEWS};
  };
  // A decision page read on by a screen once every Preview in its view has drawn: its Previews mount and draw only as they near its view (dashboard decisions host Preview.svelte), and one read past before it drew stood out of reach, never drawn (a cold stage's first open waited out its ten minutes). A page with no scroller of its own stands as it is.
  const readOn = (frame) => {
    const inner = frame.contentDocument;
    const scroller = inner?.querySelector("[data-slot=page-scroll]");
    if (!scroller) return;
    const view = scroller.getBoundingClientRect();
    const shown = [...inner.querySelectorAll("[data-slot=media]")].filter((well) => {
      const box = well.getBoundingClientRect();
      return box.bottom > view.top && box.top < view.bottom;
    });
    if (shown.every((well) => well.querySelector("iframe[data-slot=embed]")?.dataset.shape === "drawn")) scroller.scrollTop += scroller.clientHeight;
  };
  window.memoryPage = async (url, kind) => {
    const t0 = Date.now();
    const frame = document.createElement("iframe");
    frame.id = "page";
    frame.src = url;
    document.body.append(frame);
    while (!ready(frame, kind) && Date.now() - t0 < ${MEMORY_PREVIEWS * 60_000}) {
      readOn(frame);
      await wait(500);
    }
    return { drawn: ready(frame, kind), ms: Date.now() - t0 };
  };
  // The page taken away, then the holder goes on for \`ms\` as a dashboard a person goes on using does: short-lived objects, which drive JSC's own collections; what the gone page let go of goes with the next full one. Answers the objects made.
  window.memoryGone = async (ms) => {
    document.getElementById("page")?.remove();
    const t0 = Date.now();
    let made = 0;
    while (Date.now() - t0 < ms) {
      const junk = [];
      for (let i = 0; i < 2000; i += 1) junk.push({ i, s: "x".repeat(64) + i });
      made += junk.length;
      await new Promise((done) => setTimeout(done, 0));
    }
    return made;
  };
  window.memoryFacts = () =>
    new Promise((done) => {
      let frames = 0;
      const t0 = performance.now();
      const tick = () => {
        frames += 1;
        if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(() => done({ visibility: document.visibilityState, focus: document.hasFocus(), framesInASecond: frames }), 1500);
    });
  // \`?agent=<bridge>\`: the kit's bridge drives the holder in a browser nothing automates (safari-bridge.ts).
  const agent = new URLSearchParams(location.search).get("agent");
  if (agent) {
    const tag = document.createElement("script");
    tag.src = agent + "/agent.js";
    document.head.append(tag);
  }
})();
</script>`;

/** One browser the memory leg reads: the page opened and taken away, the facts it states, its web process's memory, and a full collection where the browser takes one. */
interface MemoryBrowser {
  /** How many collections the browser has said (JSC's GC log); 0 where it says none. */
  collections: () => number;
  end: () => Promise<void>;
  facts: () => Promise<unknown>;
  gc: (() => Promise<void>) | null;
  /** The page taken away, the holder going on {@link GONE_S} s. */
  gone: () => Promise<void>;
  /** Its web process's native heap ({@link WEBKIT_HEAP}), MB; null where it is not read (under Playwright). */
  heap: () => number | null;
  /** The JS heap the latest collection since collection `since` left, MB, where the browser says it (JSC's GC log); null where none has run since, or it says none. */
  jsHeap: (since?: number) => number | null;
  memory: () => number;
  open: (
    url: string,
    kind: MemoryPage
  ) => Promise<{ drawn: boolean; ms: number }>;
}

/** The holder's calls in WebKit with no inspector ({@link noInspectorWebKit}), run by the kit's bridge. */
async function uninspectedWebKit(
  holder: string,
  everyCollectionFull: boolean
): Promise<MemoryBrowser> {
  const bridge = safariBridge();
  const url = new URL(holder);
  url.searchParams.set("agent", bridge.origin);
  // Every collection full, JSC's own GC log too, for what of the JS heap each leaves (`jsHeap`). Not with the default collector: its eden collections, logged a line each many times a second, stalled the page's main thread past the gone window's answer.
  const browser = noInspectorWebKit(url.href, {
    env: everyCollectionFull
      ? { JSC_useGenerationalGC: "0", JSC_logGC: "1" }
      : {},
  });
  const end = (): Promise<void> => {
    browser.end();
    bridge.stop();
    return Promise.resolve();
  };
  let page: SafariPage;
  try {
    page = await bridge.page((href) => href.startsWith(holder));
  } catch (error) {
    await end();
    throw error;
  }
  return {
    open: (at, kind) =>
      page.run(
        (address: string, which: MemoryPage) =>
          (window as unknown as Holder).memoryPage(address, which),
        [at, kind],
        MEMORY_PREVIEWS * 60_000 + 30_000
      ),
    gone: async () => {
      await page.run(
        (ms: number) => (window as unknown as Holder).memoryGone(ms),
        [GONE_S * 1000],
        GONE_S * 1000 + 30_000
      );
    },
    facts: () => page.run(() => (window as unknown as Holder).memoryFacts()),
    gc: null,
    memory: browser.memory,
    heap: browser.heap,
    collections: () => browser.collections().length,
    jsHeap: (since = 0) => jsHeapOf(browser.collections(), since),
    end,
  };
}

/**
 * A collection's last line in JSC's GC log (`JSC_logGC`): its heap, and the
 * live size it leaves (`=> 1669kb, p=`). A collection that ran in one go
 * says it on its `START` line, one the mutator came back to on a line of
 * its own (`: M a=…`). Read on the second alone, a run's log lost 161 of
 * its 872, and in the round WebKit released its memory nearly all of them
 * (107 of the 109 in the minute after the page went, the one it went in
 * among them): that round read `460 → null` once and `460 → 359` another
 * time, a collection from before the page went.
 */
const GC_LEFT = /^\[GC<(0x[0-9a-f]+)>: .* => (\d+)kb, p=/;

/** The JS heap the latest collection since collection `since` of each of the process's heaps left, MB; null where none has run since. */
const jsHeapOf = (
  collections: readonly { heap: string; kb: number }[],
  since: number
): number | null => {
  const left = new Map<string, number>();
  for (const one of collections.slice(since)) {
    left.set(one.heap, one.kb);
  }
  return left.size === 0
    ? null
    : Math.round([...left.values()].reduce((sum, kb) => sum + kb, 0) / 1024);
};

/** The holder's own steps, as its page gives them (`MEMORY_HOLDER`). */
interface Holder {
  memoryFacts: () => Promise<unknown>;
  memoryGone: (ms: number) => Promise<number>;
  memoryPage: (
    url: string,
    kind: MemoryPage
  ) => Promise<{ drawn: boolean; ms: number }>;
}

/** WebKit under Playwright, as the audit read it: the same holder, driven through the page itself. */
async function playwrightWebKit(
  kit: Kit,
  holder: string,
  label: string
): Promise<MemoryBrowser> {
  const before = new Set(browserPids([]));
  const page = await kit.page("desk", {
    scale: 1,
    engine: "webkit",
    browser: `canvas-cost-memory-${label}`,
  });
  await page.goto(holder);
  return {
    open: (url, kind) =>
      page.evaluate(
        ([at, which]) => (window as unknown as Holder).memoryPage(at, which),
        [url, kind] as const
      ),
    gone: async () => {
      await page.evaluate(
        (ms) => (window as unknown as Holder).memoryGone(ms),
        GONE_S * 1000
      );
    },
    facts: () =>
      page.evaluate(() => (window as unknown as Holder).memoryFacts()),
    gc: () => page.requestGC(),
    collections: () => 0,
    jsHeap: () => null,
    heap: () => null,
    memory: () =>
      memoryMb(
        pageProcesses(browserPids([]).filter((pid) => !before.has(pid)))
      ),
    end: () => page.close(),
  };
}

/** The browser a run reads its page in, and how many rounds it reads there. */
const memoryRunOf = async (
  kit: Kit,
  holder: string,
  label: (typeof MEMORY_RUNS)[number]
): Promise<{ browser: MemoryBrowser; rounds: number }> =>
  label.startsWith("playwright")
    ? {
        browser: await playwrightWebKit(kit, holder, label),
        rounds: PLAYWRIGHT_ROUNDS,
      }
    : {
        browser: await uninspectedWebKit(holder, label.startsWith("collected")),
        rounds: MEMORY_ROUNDS,
      };

/** One run's reading: the holder alone, the page drawn and left untouched, then each time it is taken away (and opened again). */
interface MemoryRead {
  /** WebKit's native heap with the holder alone, MB (null where it is not read). */
  aloneHeapMb: number | null;
  /** The JS heap with the holder alone, MB (null where the browser says none). */
  aloneJsMb: number | null;
  aloneMb: number;
  facts: unknown;
  idleMb: [number, number][];
  rounds: {
    drawn: boolean;
    drawnMb: number;
    gcMb: number | null;
    goneMb: number;
    /** WebKit's native heap {@link GONE_S} s after the page went, MB (null where it is not read). */
    goneHeapMb: number | null;
    /** The JS heap the latest collection left while the page stood drawn, MB (null where the browser says none). */
    drawnJsMb: number | null;
    /** The JS heap the latest collection after the page went left, MB (null where none ran after, or the browser says none). */
    goneJsMb: number | null;
    /** The stage's module key as the round's page was drawn (`/@cawco/m/<key>/`). */
    key: string;
    ms: number;
  }[];
}

/**
 * The page in `browser`: the holder alone, then the page opened, drawn and
 * left untouched `--idle` s (its memory every 20 s), then
 * `rounds` times taken away ({@link GONE_S} s later read, and
 * again after a full collection where the browser takes one) and, but for
 * the last, opened again and left {@link MEMORY_REST_S} s.
 */
async function memoryRounds(
  browser: MemoryBrowser,
  url: string,
  kind: MemoryPage,
  rounds: number,
  stageKey: () => Promise<string>
): Promise<MemoryRead> {
  await Bun.sleep(3000);
  const aloneMb = browser.memory();
  const aloneHeapMb = browser.heap();
  const aloneJsMb = browser.jsHeap();
  const facts = await browser.facts();
  const read: MemoryRead["rounds"] = [];
  const idleMb: [number, number][] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const opened = await browser.open(url, kind);
    const drawnMb = browser.memory();
    const drawnJsMb = browser.jsHeap();
    const key = await stageKey();
    const stands = round === 1 ? IDLE_S : MEMORY_REST_S;
    const from = Date.now();
    for (let at = 0; at <= stands; at += 20) {
      if (round === 1) {
        idleMb.push([at, browser.memory()]);
      }
      if (at < stands) {
        await Bun.sleep(Math.max(0, from + (at + 20) * 1000 - Date.now()));
      }
    }
    // What the page's JS left is read off a collection that ran after it went, never one from before.
    const before = browser.collections();
    await browser.gone();
    const goneMb = browser.memory();
    const goneHeapMb = browser.heap();
    const goneJsMb = browser.jsHeap(before);
    let gcMb: number | null = null;
    if (browser.gc) {
      await browser.gc();
      await Bun.sleep(5000);
      gcMb = browser.memory();
    }
    read.push({
      ...opened,
      drawnMb,
      goneMb,
      goneHeapMb,
      gcMb,
      drawnJsMb,
      goneJsMb,
      key,
    });
  }
  return { aloneMb, aloneHeapMb, aloneJsMb, facts, idleMb, rounds: read };
}

/** A reading in words: alone, drawn, after the idle, and each round's drawn → gone (→ after a full collection). */
const memoryWords = (read: MemoryRead): string =>
  `keys ${[...new Set(read.rounds.map((one) => one.key))].join(" → ")}; ${read.aloneMb} MB alone, ${read.idleMb[0]?.[1]} MB drawn, ${read.idleMb.at(-1)?.[1]} MB after ${IDLE_S} s untouched; each round drawn → ${GONE_S} s after the page went${read.rounds[0]?.gcMb === null ? "" : " → after a full collection"}: ${read.rounds.map((one) => [one.drawnMb, one.goneMb, ...(one.gcMb === null ? [] : [one.gcMb])].join(" → ")).join(", ")} MB (${JSON.stringify(read.facts)})`;

/**
 * A decision page of ten canvas Previews served as the hub serves one (the
 * preview overlay in the page and in every canvas frame its embed origin
 * relays, agent preview.ts `injectOverlay`), in WebKit, where every canvas
 * shares the dashboard's web process: in WebKit as a person runs it, and
 * under Playwright as the audit read it; beside it, a control page of
 * frames holding plain objects. What WebKit as a person runs it owes is
 * {@link memoryCheck}'s.
 */
async function memoryLeg(kit: Kit): Promise<void> {
  const programs = new Map<string, string>();
  const files: Record<string, string[]> = {};
  const holderId = decisionId("memory-holder");
  const controlId = decisionId("memory-control");
  const childId = decisionId("memory-child");
  const canvasesId = decisionId("memory-canvases");
  const loopId = decisionId("memory-loop");
  const viteId = decisionId("memory-vite");
  const viteChildId = decisionId("memory-vite-child");
  /** Read as each is asked for: the canvases page is written once the stage names its stories. */
  const pages: Record<string, string> = {
    [holderId]: MEMORY_HOLDER,
    [controlId]: CONTROL_PAGE(`/__cawco/page/${childId}/`),
    [childId]: CONTROL_CHILD,
  };
  const stage = await startDecisionStage(
    programs,
    files,
    { root: APP, kit: true },
    pages,
    new Set(["kept"])
  );
  const { origin } = new URL(stage.pageUrl("kept", "light"));
  const holder = `${origin}/__cawco/page/${holderId}/`;
  /** The control's frame on an origin of its own (another port), as a canvas stands on the stage's. */
  /** The entry's imports, read once the stage serves a canvas page (below). */
  let entry: EntryParts = {
    adapter: "",
    base: "",
    runtime: "",
    source: "",
    styles: [],
  };
  const cuts = Object.fromEntries(
    Object.entries(CUTS).map(([name, rewrite]) => [
      name,
      embedOrigin(stage.stagePort, null, 0, null, (html) =>
        rewrite(html, entry)
      ),
    ])
  ) as Record<keyof typeof CUTS, ReturnType<typeof embedOrigin>>;
  const elsewhere = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(PROBE_CHILD("ready();"), {
        headers: { "content-type": "text/html" },
      }),
  });
  try {
    const all = await storiesOf(
      `http://127.0.0.1:${stage.stagePort}`,
      statesFiles()
    );
    const picks = Array.from({ length: MEMORY_PREVIEWS }, (_, at) => {
      const one = all[(at * 7) % all.length] as { file: string; story: string };
      const id = decisionId(`memory-${at}`);
      files[id] = [one.file];
      return { id, ...one };
    });
    programs.set("kept", memoryProgram(picks));
    programs.set("bare", memoryProgram(picks));
    pages[canvasesId] = CANVASES_PAGE(
      picks.map((one) =>
        embedUrl(`http://127.0.0.1:${stage.stagePort}`, one.file, one.story)
      )
    );
    pages[loopId] = CANVASES_PAGE(
      picks.map(() =>
        embedUrl(`http://127.0.0.1:${stage.stagePort}`, LOOP_FILE, "Spins")
      )
    );
    pages[viteChildId] = VITE_CHILD(`http://127.0.0.1:${stage.stagePort}`);
    pages[viteId] = CANVASES_PAGE(
      picks.map(() => `/__cawco/page/${viteChildId}/`)
    );
    const probeAddress = {} as Record<`probe-${keyof typeof PROBES}`, string>;
    const stageBase = `http://127.0.0.1:${stage.stagePort}`;
    for (const [name, script] of Object.entries(PROBES)) {
      // decision-embeds `idOf` keeps 16 characters of a name: each probe's two names apart within them.
      const probeChildId = decisionId(`pc-${name}`);
      const pageId = decisionId(`pp-${name}`);
      pages[probeChildId] = PROBE_CHILD(script(stageBase));
      pages[pageId] = CANVASES_PAGE(
        picks.map(() => `/__cawco/page/${probeChildId}/`)
      );
      probeAddress[`probe-${name as keyof typeof PROBES}`] =
        `${origin}/__cawco/page/${pageId}/`;
    }
    const cutAddress = {} as Record<`cut-${keyof typeof CUTS}`, string>;
    for (const [name, relay] of Object.entries(cuts)) {
      const pageId = decisionId(`cut-${name}`);
      pages[pageId] = CANVASES_PAGE(
        picks.map(() =>
          embedUrl(`http://127.0.0.1:${relay.port}`, LOOP_FILE, "Spins")
        ),
        name === "noentry"
      );
      cutAddress[`cut-${name as keyof typeof CUTS}`] =
        `${origin}/__cawco/page/${pageId}/`;
    }
    // The entry the canvas page loads, as the stage serves it: what the cuts keep of it.
    const served = await (
      await fetch(
        embedUrl(`http://127.0.0.1:${stage.stagePort}`, LOOP_FILE, "Spins")
      )
    ).text();
    const entrySrc = served.match(ENTRY_SRC)?.[1] ?? "";
    entry = entryPartsOf(
      await (
        await fetch(`http://127.0.0.1:${stage.stagePort}${entrySrc}`)
      ).text(),
      entrySrc
    );
    kit.note(
      `memory entry: base ${entry.base}, BASE ${ENTRY_BASE.test(entry.source) ? "found" : "missing"}, load ${ENTRY_LOAD.test(entry.source) ? "found" : "missing"}, adapter ${ENTRY_ADAPTER.test(entry.source) ? "found" : "missing"}, faces ${ENTRY_FACES.test(entry.source) ? "found" : "missing"}`
    );
    kit.note(
      `memory entry ${entrySrc}: runtime ${entry.runtime}, adapter ${entry.adapter}, styles ${entry.styles.join(", ")}`
    );
    // Each cut as the browser gets it: what of the page it took away.
    for (const [name, relay] of Object.entries(cuts)) {
      const page = await (
        await fetch(
          embedUrl(`http://127.0.0.1:${relay.port}`, LOOP_FILE, "Spins")
        )
      ).text();
      kit.note(
        `memory cut ${name}: ${page.length} chars, ${page.match(PRELOAD_LINK)?.length ?? 0} preloads, ${page.match(ENTRY_TAG)?.length ?? 0} entry tags, ${page.includes("__cawcoGraph") ? "a" : "no"} preload counter`
      );
    }
    const xoriginId = decisionId("memory-xorigin");
    pages[xoriginId] = CANVASES_PAGE(
      picks.map(() => `http://127.0.0.1:${elsewhere.port}/`)
    );
    const addressOf: Record<MemoryPage, string> = {
      ...probeAddress,
      ...cutAddress,
      xorigin: `${origin}/__cawco/page/${xoriginId}/`,
      decision: stage.pageUrl("kept", "light"),
      bare: stage.pageUrl("bare", "light"),
      canvases: `${origin}/__cawco/page/${canvasesId}/`,
      loop: `${origin}/__cawco/page/${loopId}/`,
      vite: `${origin}/__cawco/page/${viteId}/`,
      control: `${origin}/__cawco/page/${controlId}/`,
    };
    const plan = MEMORY_RUNS.flatMap((label) =>
      label.endsWith("-control")
        ? [{ label, kind: "control" as MemoryPage }]
        : MEMORY_PAGES.map((kind) => ({ label, kind: kind as MemoryPage }))
    );
    const stageKey = async () => {
      const page = await (
        await fetch(
          embedUrl(`http://127.0.0.1:${stage.stagePort}`, LOOP_FILE, "Spins")
        )
      ).text();
      return page.match(STAGE_KEY)?.[1] ?? "";
    };
    for (const { label: run, kind } of plan) {
      const { browser, rounds } = await memoryRunOf(kit, holder, run);
      let read: MemoryRead;
      try {
        read = await memoryRounds(
          browser,
          addressOf[kind],
          kind,
          rounds,
          stageKey
        );
      } finally {
        await browser.end();
      }
      keep(kit, `memory.${run}.${kind}`, {
        page: kind,
        stories:
          kind === "control"
            ? []
            : picks.map((one) => `${one.file}#${one.story}`),
        ...read,
      });
      memoryCheck(kit, run, kind, read);
    }
  } finally {
    for (const relay of Object.values(cuts)) {
      relay.stop(true);
    }
    elsewhere.stop(true);
    await stage.stop();
  }
}

/** How much of what the page took it may grow by, left untouched `--idle` s. Our own call: a collection's swing. */
const IDLE_GROWTH_SHARE = 0.1;
/** How much of the JS heap a page stood drawn on may stay once it is gone: the holder's own (its bridge's calls, the objects it makes going on) is in both. Our own call: a page kept stays whole. */
const JS_LEFT_SHARE = 0.1;

/**
 * WebKit's strict memory threshold on a desk, MB: half the lesser of 3 GB
 * and the machine's memory (WTF MemoryPressureHandler.cpp
 * `baseThreshold(std::min(3 * GB, ramSize()))`, `s_strictThresholdFraction
 * = 0.5`), held against the web process's resident size (wtf/linux
 * MemoryFootprintLinux.cpp: `return memoryStatus.resident;`), read every
 * 30 s. Past it, its release is critical (WebCore MemoryRelease.cpp: `if
 * (critical == Critical::Yes) { // Return unused pages back to the OS now
 * … WTF::releaseFastMallocFreeMemory(); releaseCriticalMemory(…); }`).
 */
const WEBKIT_STRICT_MB = Math.round(
  (0.5 * Math.min(3 * 1024 ** 3, totalmem())) / 1024 ** 2
);

/** The least-squares slope of `ys` over their places, a round apart. */
const slopeOf = (ys: number[]): number => {
  const mean = (list: number[]) =>
    list.reduce((sum, one) => sum + one, 0) / Math.max(1, list.length);
  const xs = ys.map((_, at) => at);
  const mx = mean(xs);
  const my = mean(ys);
  const across = xs.reduce(
    (sum, x, at) => sum + (x - mx) * ((ys[at] ?? my) - my),
    0
  );
  const spread = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  return spread === 0 ? 0 : across / spread;
};

/**
 * What a run's reading owes. Every run: every page drawn. In WebKit as a
 * person runs it (`uninspected`), the hub's page left untouched `--idle` s
 * grows by no more than {@link IDLE_GROWTH_SHARE} of what it took. With
 * every collection full (`collected`), each time it goes its JS goes with
 * it: the heap a collection leaves once it is gone is no more than
 * {@link JS_LEFT_SHARE} of the heap it stood drawn on, every round; and
 * what its web process keeps natively once it is gone, which stands in
 * WebKit's own heap ({@link WEBKIT_HEAP}: 222, 318, 416 MB over three
 * rounds, the JS heaps' mappings empty, against 39 MB each round with the
 * control's frames), WebKit gives back: once a page has stood it past its
 * strict threshold ({@link WEBKIT_STRICT_MB}), a later round keeps no more
 * than the first did (here 357, 477, 622, then 265 MB). A page whose
 * frames something held would keep climbing past it.
 */
function memoryCheck(
  kit: Kit,
  label: (typeof MEMORY_RUNS)[number],
  kind: MemoryPage,
  read: MemoryRead
): void {
  const allDrawn = read.rounds.every((one) => one.drawn);
  const drawnMb = read.idleMb[0]?.[1] ?? 0;
  const took = drawnMb - read.aloneMb;
  const climb = Math.round(slopeOf(read.rounds.map((one) => one.drawnMb)));
  const said = `its web process ${memoryWords(read)}; drawn memory climbs ${climb} MB a round`;
  if (label === "uninspected" && kind === "decision") {
    const idleEnd = read.idleMb.at(-1)?.[1] ?? 0;
    kit.check(
      `memory uninspected: in WebKit as a person runs it (no inspector), the hub's page of ${MEMORY_PREVIEWS} canvases, drawn each of ${read.rounds.length} times, grows by no more than ${IDLE_GROWTH_SHARE * 100}% of the ${took} MB it took while untouched (${idleEnd - drawnMb} MB over ${IDLE_S} s); ${said}`,
      allDrawn && took > 0 && idleEnd - drawnMb <= IDLE_GROWTH_SHARE * took
    );
    return;
  }
  if (label === "collected" && kind === "decision") {
    const released = read.rounds.every(
      (one) =>
        one.drawnJsMb !== null &&
        one.goneJsMb !== null &&
        one.goneJsMb <= JS_LEFT_SHARE * one.drawnJsMb
    );
    const kept = read.rounds.map((one) => one.goneMb - read.aloneMb);
    const inHeap = read.rounds.map(
      (one) => (one.goneHeapMb ?? 0) - (read.aloneHeapMb ?? 0)
    );
    const peak = Math.max(...read.rounds.map((one) => one.drawnMb));
    const first = kept[0] ?? 0;
    const back = kept.slice(1).find((one) => one <= first);
    const givenBack =
      back === undefined
        ? `its page never stood it past WebKit's strict threshold of ${WEBKIT_STRICT_MB} MB (at most ${peak} MB)`
        : `which WebKit gave back past its strict threshold of ${WEBKIT_STRICT_MB} MB, a later round keeping ${back} MB, no more than the first round's ${first}`;
    kit.check(
      `memory collected: with every collection full, each time the hub's page of ${MEMORY_PREVIEWS} canvases went its JS went with it, the heap a collection left no more than ${JS_LEFT_SHARE * 100}% of the heap it stood drawn on, every round (drawn → gone ${read.rounds.map((one) => `${one.drawnJsMb} → ${one.goneJsMb}`).join(", ")} MB), and what its web process kept natively over the holder alone each round (${kept.join(", ")} MB; in WebKit's own heap ${inHeap.join(", ")} MB) did not climb: ${givenBack}; ${said}`,
      allDrawn && released && (back !== undefined || peak < WEBKIT_STRICT_MB)
    );
    return;
  }
  kit.check(
    `memory ${label} ${kind}: the page drawn each of ${read.rounds.length} times (${read.rounds.map((one) => `${(one.ms / 1000).toFixed(1)} s`).join(", ")}); ${said}`,
    allDrawn
  );
}

const run = async (kit: Kit) => {
  const stages: Stage[] = [];
  const loopDir = join(APP, LOOP_DIR);
  mkdirSync(loopDir, { recursive: true });
  writeFileSync(join(loopDir, "Loop.svelte"), LOOP_SVELTE);
  writeFileSync(join(APP, LOOP_FILE), LOOP_STORY);
  try {
    if (LEGS.has("trace")) {
      await traceLeg(kit, stages);
    }
    if (LEGS.has("latency")) {
      await latencyLeg(kit, stages);
    }
    let warm: Stage | null = null;
    if (LEGS.has("page")) {
      warm = await pageLeg(kit, stages, null, "cards");
    }
    if (LEGS.has("shared")) {
      warm = await pageLeg(kit, stages, warm, "shared");
    }
    if (LEGS.has("cards-warm")) {
      warm = await pageLeg(kit, stages, warm, "cards", "cards-warm");
    }
    if (LEGS.has("frame")) {
      warm = await frameLeg(kit, stages, warm);
    }
    if (LEGS.has("raf")) {
      await rafLeg(kit, stages, warm);
    }
    if (LEGS.has("rekey")) {
      warm = await rekeyLeg(kit, stages, warm);
    }
    if (LEGS.has("built") || LEGS.has("edit")) {
      warm = await builtLeg(kit, stages, warm);
    }
    if (LEGS.has("bundled")) {
      await bundledLeg(kit, stages);
    }
    if (LEGS.has("boot")) {
      warm = await bootLeg(kit, stages, warm);
    }
    if (LEGS.has("decision")) {
      await decisionLeg(kit);
    }
    if (LEGS.has("memory")) {
      await memoryLeg(kit);
    }
  } finally {
    for (const one of stages) {
      one.stop();
    }
    rmSync(loopDir, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "Speed",
  name: "canvas-cost",
  run,
};
export default spec;
