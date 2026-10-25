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
 *   heap after a GC (Chromium) or its web process's memory (WebKit), and the
 *   animation-frame callbacks it runs in 20 s idle.
 * - `page`: a page of `--embeds` (33, caw-panel's count) frames, each on its
 *   turn as embed-turns.ts gives them, each engine: time until every frame
 *   said its shape, the browser's CPU until then, the holding page's frame
 *   cadence while they load (p95), and the browser's memory sampled over
 *   `--idle` seconds (240) after.
 * - `shared`: the same stories drawn inline in one frame, read alike.
 * - `decision`: a decision page of `--embeds` Previews on the decision host,
 *   at the owner's window: its first screen until every Preview in it is
 *   drawn, then scrolled to its end at a person's pace (`--scroll`, px a
 *   second): the time, frames, requests and page memory at each, and every
 *   50 ms while scrolling, whether a Preview in view stood drawn, as its
 *   skeleton, or empty.
 * - `raf`: a story running an animation-frame loop, its frame in view, in a
 *   pane the dashboard put away (directly, and through a decision page's
 *   relay) and one below the page's fold: the callbacks each runs in 20 s
 *   idle, and again once back or scrolled to.
 * - `rekey`: a write no page is served from costs the next frame nothing;
 *   an edit to an imported file reaches the open canvas and the next frame.
 *
 * Numbers go to `numbers.json` in the spec's output folder, and each is a
 * NOTE line. The checks are what a frame owes: it draws, and it loads no
 * module its story's closure does not reach.
 *
 *   bun scripts/probe-kit/run.ts canvas-cost [--legs trace,page,shared,frame,raf,decision] [--engines chromium,webkit] [--embeds 33] [--idle 240] [--story <file>#<story>] [--scroll 1200]
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one frame at a time, as the page gives them turns
import { type ChildProcess, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { readWithin } from "../../../packages/core/src/bounded";
import { until } from "../../scratch-fleet";
import { scratchCertificate } from "../cloudflare-front";
import {
  CAWCO_BRIDGE,
  idOf as decisionId,
  startDecisionStage,
} from "../decision-embeds";
import { type Engine, type Kit, ROOT, type Spec } from "../kit";

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

/** The processes that run pages: Chromium's renderers, WebKit's web processes. */
const pageProcesses = (pids: number[]): number[] =>
  pids.filter((pid) => {
    const line = cmdline(pid);
    return line.includes("--type=renderer") || line.includes("WebProcess");
  });

/* --- In the page ---------------------------------------------------------- */

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
    const processMb = memoryMb(pageProcesses(mine));
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
const HOLDER = (urls: string[]) => `<!doctype html><meta charset="utf-8">
<style>body{margin:0;font:14px system-ui}main{height:100vh;overflow:auto}.card{margin:16px;min-height:240px;border:1px solid #ccc}iframe{display:block;inline-size:100%;block-size:240px;border:0}</style>
<main id="list"></main>
<script>
const urls = ${JSON.stringify(urls)};
const list = document.getElementById("list");
const cards = urls.map(() => { const c = document.createElement("div"); c.className = "card"; list.append(c); return c; });
const h = window.__holder = { start: performance.now(), intervals: [], said: 0, failed: 0, settledAt: null, turns: [] };
let last = null;
const tick = (t) => { if (last !== null && h.settledAt === null) h.intervals.push(t - last); last = t; requestAnimationFrame(tick); };
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
        init: [installCounters],
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
      const memory: [number, number][] = [];
      const idleStart = Date.now();
      const cpuIdle0 = cpuMs(mine());
      for (let s = 0; s <= IDLE_S; s += 20) {
        memory.push([s, memoryMb(pageProcesses(mine()))]);
        if (s < IDLE_S) {
          await Bun.sleep(
            Math.max(0, idleStart + (s + 20) * 1000 - Date.now())
          );
        }
      }
      const idleCpu = Math.round(cpuMs(mine()) - cpuIdle0);
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
        memoryMbOverIdle: memory,
        idleCpuMs: idleCpu,
        idleSeconds: IDLE_S,
      });
      kit.check(
        `page ${label} ${engine}: all ${urls.length} frames of ${EMBEDS} stories said their shape (${held.said}) in ${(settledMs / 1000).toFixed(1)} s`,
        held.said === urls.length
      );
      await page.close();
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
 * Frames of the looping story: one in view; two in a pane put away by the
 * dashboard's own path (PaneLeaf's `data-pane-hidden`, `content-visibility:
 * hidden`, and motion/rest.ts `holdSkipped`, bundled from the dashboard),
 * one of them inside a page that relays it as a decision page does
 * (decisions/host/away.ts `relayAway`); one 4000px below the page's fold.
 */
const LOOP_HOLDER = (url: string) => `<!doctype html><meta charset="utf-8">
<style>body{margin:0}iframe{display:block;inline-size:600px;block-size:200px;border:0}.pane[data-pane-hidden]{content-visibility:hidden;contain-intrinsic-size:auto 400px}</style>
<script src="/away.js"></script>
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
<script>addEventListener("message", (e) => { if (e.data && e.data.type === "cawco:embed-graph") { e.source.postMessage({ type: "cawco:embed-go", urls: e.data.urls }, "*"); e.source.postMessage({ type: "cawco:embed-ready", urls: [] }, "*"); } });</script>`;

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
 * A decision page of `--embeds` Previews, each one story of the dashboard's
 * states files (as the page leg picks them), on the decision host the hub
 * serves (decision-embeds.ts `startDecisionStage`), the embed origin on
 * HTTPS over HTTP/2 holding each answer {@link DECISION_HOLD_MS}, the stage
 * warm and the page's media knowing each Preview's shape (a first page
 * scrolled through told them), each engine in a fresh context at the
 * owner's window: until every
 * Preview in the first screen is drawn, then scrolled to its end at a
 * person's pace ({@link PERSON_SCROLL}) and on until every Preview is
 * drawn. At each: the time, the frames on the page, the requests made, and
 * the browser's page processes' memory; while scrolling, every 50 ms, each
 * Preview in view holds its frame drawn, its skeleton, or nothing.
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
      const before = new Set(browserPids([]));
      const page = await kit.page("desk", {
        scale: 1,
        engine,
        browser: `canvas-cost-decision-${engine}`,
        init: [CAWCO_BRIDGE, decisionSampler],
        ignoreHTTPSErrors: true,
      });
      await page.setViewportSize(PERSON_VIEW);
      let requests = 0;
      page.on("request", () => {
        requests += 1;
      });
      const mine = () => browserPids([]).filter((pid) => !before.has(pid));
      const at = async (label: string, startedAt: number) => {
        const frames = await page.evaluate(
          () => document.querySelectorAll("iframe[data-slot=embed]").length
        );
        const seen = await page.evaluate(
          () =>
            (window as unknown as { __seen: { drawn: number } }).__seen.drawn
        );
        return {
          label,
          ms: Date.now() - startedAt,
          frames,
          drawn: seen,
          requests,
          pageProcessMb: memoryMb(pageProcesses(mine())),
        };
      };
      const started = Date.now();
      await page.goto(stage.pageUrl("many", "light"), { waitUntil: "load" });
      // The first screen: every Preview in the scroller's view drawn.
      await page.waitForFunction(
        () => {
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
                frame?.dataset.shape === "drawn" &&
                frame.dataset.drawn !== undefined
              );
            })
          );
        },
        undefined,
        { timeout: DRAW_MS, polling: 50 }
      );
      const firstMs = Date.now() - started;
      // What the first screen set off settles (later turns, fonts).
      await Bun.sleep(3000);
      const first = {
        ...(await at("first screen", started)),
        settledMs: firstMs,
      };
      await page.evaluate(() => {
        const seen = (
          window as unknown as {
            __seen: { samples: number; waiting: number; empty: string[] };
          }
        ).__seen;
        seen.samples = 0;
        seen.waiting = 0;
        seen.empty = [];
      });
      // Scrolled to its end at a person's pace, one step a frame.
      const scrolledMs = await page.evaluate(
        (speed) =>
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
          }),
        PERSON_SCROLL
      );
      const scrollStart = Date.now();
      await page.waitForFunction(
        (count) =>
          (window as unknown as { __seen: { drawn: number } }).__seen.drawn ===
          count,
        picks.length,
        { timeout: DRAW_MS, polling: 100 }
      );
      await Bun.sleep(3000);
      const end = await at("scrolled to the end", scrollStart);
      const seen = await page.evaluate(
        () =>
          (
            window as unknown as {
              __seen: { samples: number; waiting: number; empty: string[] };
            }
          ).__seen
      );
      keep(kit, `decision.${engine}`, {
        previews: picks.length,
        view: PERSON_VIEW,
        scrollPxPerS: PERSON_SCROLL,
        first,
        scrolledMs,
        end,
        whileScrolling: seen,
      });
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
      await page.close();
    }
  } finally {
    await stage.stop();
  }
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
  } finally {
    for (const one of stages) {
      one.stop();
    }
    rmSync(loopDir, { recursive: true, force: true });
  }
};

const spec: Spec = { name: "canvas-cost", run };
export default spec;
