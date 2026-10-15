/**
 * Two panes of long, live sessions stay inside the frame budget (owner: "i
 * just tried opening two panes , and the ui is becoming very laggy").
 *
 *   bun scripts/probe-kit/run.ts two-pane-perf
 *
 * The scene is the owner's: a scratch fleet with two long sessions (an
 * orchestrator of `LONG` calls with `DELEGATES` delegates of its own, whose
 * tray rides over its composer, and a session of `LONG` calls), both still
 * streaming, three more sessions streaming, and finished ones enough for a
 * rail of about 25. The built dashboard opens on them twice: one pane holding
 * all six tabs, then two panes of three side by side, the orchestrator in
 * front of the left one and the other long session in front of the right.
 * Each layout reads older pages into its long transcripts, then runs four
 * phases on a CPU slowed `THROTTLE` times (the owner's machine, not this
 * one's 48 cores): steady streaming, typing in the left composer, wheeling
 * the left transcript, and switching tabs in both panes.
 *
 * Read from the page itself: every long task (PerformanceObserver
 * `longtask`) and every interaction's input-to-paint latency (Event Timing,
 * the entries an `interactionId` marks: a key, a click). Asserted on two
 * panes: no task over two frames' budget while streaming and while typing,
 * and the main thread no busier than `BUSY_SHARE` times one pane's (the
 * longest task is noted against `LONG_TASK_MS`), no interaction slower than `INPUT_MS`
 * while streaming, typing or
 * scrolling, and tab switches no slower than one pane's by more than
 * `SWITCH_SHARE` (the owner's regression: a second pane made the whole
 * dashboard lag). A switch's own latency is noted against `INPUT_MS`. Every
 * phase's numbers for both layouts are noted, and written to `numbers.json`
 * in the spec's out folder.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one phase, one tab, one key at a time, as a person makes them
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { SCROLLER, traceMain } from "../frames";
import { type Kit, open, type Spec } from "../kit";

/** Calls in each long session. */
const LONG = 2000;
/** The orchestrator's delegates, started at the end of its run. */
const DELEGATES = 5;
const STREAMING = ["streamC", "streamD", "streamE"];
const FINISHED = 14;
/** How much slower than this machine's the CPU runs: a mid-tier laptop. */
const THROTTLE = 4;
/** The frame budget's long task: the target each phase's longest is noted against. */
const LONG_TASK_MS = 50;
/**
 * How much busier two panes may keep the main thread than one, streaming or
 * typing. Our own call: after the fix the lab's runs had the two within a
 * tenth of each other (streaming 7.4 to 8.1s of 10s in two panes, 6.7 to
 * 8.0s in one, at 4x CPU under ten sessions streaming). How many long tasks
 * either has is not held to a count: 0 to 9 of 50 to 70ms from run to run in
 * either layout, each the hub's transcript frames landing together.
 */
const BUSY_SHARE = 1.25;
const INPUT_MS = 100;
/**
 * How much slower two panes' slowest tab switch may be than one pane's. Our
 * own call: after the fix the lab's slowest switch was 392ms in one pane and
 * in two, where before it two panes' switches kept the main thread busy for
 * 40.8s against one pane's 8.0s.
 */
const SWITCH_SHARE = 1.25;
/** Older pages read into each long transcript, a scroll to its top apiece. */
const PAGES = 6;
const START_TOOL = "mcp__cawco__start_session";

type Layout = "one" | "two";
const PHASES = ["stream", "type", "scroll", "switch"] as const;
type Phase = (typeof PHASES)[number];
interface Reading {
  busyMs: number;
  interactions: number;
  longTasks: number;
  maxInput: number;
  maxTask: number;
  /** The longest animation frame's account of itself: what ran in it. */
  worstFrame: string;
}

/** A long animation frame as the page tells it: its start, length, and what filled it. */
type Frame = [number, number, string];

interface Cost {
  events: [number, number][];
  frames: Frame[];
  /** Each hub message the page took 4ms or more over: when, how long, and what it said it was. */
  messages: [number, number, string][];
  tasks: [number, number][];
}

/**
 * The page's long tasks, its interactions, and its long animation frames
 * (Long Animation Frames: the scripts that ran in each, by what invoked
 * them, and the style and layout they forced), from before its own scripts.
 */
function watchCost(): void {
  const w = window as unknown as { __cost: Cost };
  w.__cost = { tasks: [], events: [], frames: [], messages: [] };
  // Each hub message timed from its handler to the microtasks behind it,
  // where the store's change is drawn, and named by the first kind it
  // carries.
  const socketMessage = Object.getOwnPropertyDescriptor(
    WebSocket.prototype,
    "onmessage"
  );
  Object.defineProperty(WebSocket.prototype, "onmessage", {
    configurable: true,
    get() {
      return socketMessage?.get?.call(this);
    },
    set(handler: ((event: MessageEvent) => void) | null) {
      socketMessage?.set?.call(
        this,
        handler &&
          function (this: WebSocket, event: MessageEvent) {
            const start = performance.now();
            handler.call(this, event);
            const text = String(event.data).slice(0, 400);
            const kind =
              // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
              /"kind":"([^"]+)"/.exec(text)?.[1] ??
              // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
              /"type":"([^"]+)"/.exec(text)?.[1] ??
              "?";
            queueMicrotask(() => {
              const ms = performance.now() - start;
              if (ms >= 4) {
                w.__cost.messages.push([start, ms, kind]);
              }
            });
          }
      );
    },
  });
  interface Script {
    duration: number;
    forcedStyleAndLayoutDuration: number;
    invoker: string;
    sourceFunctionName: string;
  }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & {
      renderStart: number;
      scripts: Script[];
      styleAndLayoutStart: number;
    })[]) {
      const scripts = [...entry.scripts]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3)
        .map(
          (s) =>
            `${s.invoker}${s.sourceFunctionName ? ` ${s.sourceFunctionName}` : ""} ${Math.round(s.duration)}ms (forced style and layout ${Math.round(s.forcedStyleAndLayoutDuration)}ms)`
        );
      const render = entry.renderStart
        ? Math.round(entry.startTime + entry.duration - entry.renderStart)
        : 0;
      w.__cost.frames.push([
        entry.startTime,
        entry.duration,
        `${scripts.join("; ") || "no script"}; rendering ${render}ms`,
      ]);
    }
  }).observe({ type: "long-animation-frame", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      w.__cost.tasks.push([entry.startTime, entry.duration]);
    }
  }).observe({ type: "longtask", buffered: true });
  // Event Timing's own option, which this TypeScript's DOM types leave out:
  // every event of 16ms or more, the shortest it reports.
  const events: PerformanceObserverInit & { durationThreshold: number } = {
    type: "event",
    durationThreshold: 16,
    buffered: true,
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceEventTiming[]) {
      if (entry.interactionId) {
        w.__cost.events.push([entry.startTime, entry.duration]);
      }
    }
  }).observe(events);
}

const layoutOf = (mode: Layout, ids: Record<string, string>) => {
  const [a, b, c, d, e, f] = [
    ids.longA,
    ids.longB,
    ids.streamC,
    ids.streamD,
    ids.streamE,
    ids.done0,
  ] as string[];
  return mode === "two"
    ? {
        v: 1,
        root: {
          t: "b",
          id: "pbranch",
          dir: "h",
          sizes: [50, 50],
          kids: [
            { t: "l", id: "pleft", tabs: [a, c, f], active: a, opened: null },
            { t: "l", id: "pright", tabs: [b, d, e], active: b, opened: null },
          ],
        },
        focusedLeaf: "pleft",
      }
    : {
        v: 1,
        root: {
          t: "l",
          id: "pleft",
          tabs: [a, c, f, b, d, e],
          active: a,
          opened: null,
        },
        focusedLeaf: "pleft",
      };
};

/** Every visible transcript scrolled to its top, then all of them to their ends. */
async function readOlder(page: Page): Promise<void> {
  for (let p = 0; p < PAGES; p += 1) {
    await page.evaluate((sel) => {
      for (const s of document.querySelectorAll<HTMLElement>(sel)) {
        if (s.getBoundingClientRect().width > 0) {
          s.scrollTop = 0;
        }
      }
    }, SCROLLER);
    await page.waitForTimeout(1500);
  }
  await page.evaluate((sel) => {
    for (const s of document.querySelectorAll<HTMLElement>(sel)) {
      s.scrollTop = s.scrollHeight;
    }
  }, SCROLLER);
  await page.waitForTimeout(4000);
}

async function measure(
  kit: Kit,
  base: string,
  mode: Layout,
  ids: Record<string, string>
): Promise<Record<Phase, Reading>> {
  const page = await kit.page("desk", { init: [watchCost] });
  await page.addInitScript(
    (layout) => {
      localStorage.setItem("cawco-workspace", JSON.stringify(layout));
    },
    layoutOf(mode, ids)
  );
  await open(page, base, `${SCROLLER} [data-row]`, 120_000);
  await readOlder(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  const now = () => page.evaluate(() => performance.now());
  const spans = {} as Record<Phase, { busy: number; from: number; to: number }>;
  // How busy the main thread was, off a DevTools trace's top-level tasks (a
  // sampling profiler's own cost, under the throttle, read as the page's).
  const phase = async (name: Phase, act: () => Promise<void>) => {
    let from = 0;
    let to = 0;
    const main = await traceMain(page, async () => {
      await page.evaluate((mark) => performance.mark(mark), `two-pane:${name}`);
      from = await now();
      await act();
      to = await now();
    });
    const busy = main.tasks.reduce((sum, task) => sum + task.wall, 0);
    spans[name] = { from, to, busy };
  };
  await phase("stream", () => page.waitForTimeout(10_000));
  await phase("type", async () => {
    await page.locator('[data-leaf="pleft"] textarea').first().click();
    await page.keyboard.type(
      "The quick brown fox jumps over the lazy dog while both panes stream on",
      { delay: 70 }
    );
    await page.waitForTimeout(500);
  });
  await phase("scroll", async () => {
    const box = await page
      .locator(SCROLLER)
      .filter({ visible: true })
      .first()
      .boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 30; i += 1) {
        await page.mouse.wheel(0, i < 15 ? -120 : 120);
        await page.waitForTimeout(50);
      }
    }
    await page.waitForTimeout(500);
  });
  await phase("switch", async () => {
    const order =
      mode === "two"
        ? [ids.streamD, ids.streamE, ids.longB, ids.streamC, ids.longA]
        : [ids.longB, ids.streamD, ids.longA, ids.streamC, ids.longA];
    for (const id of order) {
      await page
        .locator(`[data-session-tab="${id}"]`)
        .filter({ visible: true })
        .first()
        .click();
      await page.waitForTimeout(900);
    }
  });
  const seen = await page.evaluate(
    () => (window as unknown as { __cost: Cost }).__cost
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.close();
  const readings = {} as Record<Phase, Reading>;
  for (const name of PHASES) {
    const { from, to, busy } = spans[name];
    const tasks = seen.tasks.filter(([at]) => at >= from && at < to);
    const events = seen.events.filter(([at]) => at >= from && at < to);
    const [worst] = seen.frames
      .filter(([at]) => at >= from && at < to)
      .sort((a, b) => b[1] - a[1]);
    const byKind = new Map<string, { n: number; max: number; ms: number }>();
    for (const [at, ms, kind] of seen.messages) {
      if (at >= from && at < to) {
        const was = byKind.get(kind) ?? { n: 0, max: 0, ms: 0 };
        byKind.set(kind, {
          n: was.n + 1,
          max: Math.max(was.max, ms),
          ms: was.ms + ms,
        });
      }
    }
    const heavy = [...byKind]
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, 4)
      .map(
        ([kind, s]) =>
          `${kind} ${s.n}x, ${Math.round(s.ms)}ms in all, the slowest ${Math.round(s.max)}ms`
      )
      .join("; ");
    readings[name] = {
      longTasks: tasks.length,
      maxTask: Math.round(Math.max(0, ...tasks.map(([, ms]) => ms))),
      interactions: events.length,
      maxInput: Math.round(Math.max(0, ...events.map(([, ms]) => ms))),
      busyMs: Math.round(busy),
      worstFrame: `${worst ? `${Math.round(worst[1])}ms frame: ${worst[2]}` : "no long frame"}; hub messages of 4ms or more: ${heavy || "none"}`,
    };
  }
  return readings;
}

/** Words streamed one by one, the first naming what says them. */
const wordsOf = (n: number, label: string): string[] =>
  Array.from({ length: n }, (_, i) => `${i === 0 ? `${label}: ` : ""}w${i} `);

/**
 * What the mock answers each session: the long ones a call apiece (seeded
 * fast, then streaming words before each call, a second apart), the
 * orchestrator's last `DELEGATES` calls starting its delegates, and the
 * streaming ones and the delegates words and a call every turn. Each
 * session is told apart by the mark its first message carries.
 */
function sceneModel() {
  const tag = crypto.randomUUID().slice(0, 6);
  const mark = (name: string) => `two-pane ${name} ${tag}`;
  const counts: Record<string, number> = {};
  const scene = {
    counts,
    mark,
    workdir: "",
    respond: (request: Seen): Reply => {
      if (!request.tools) {
        return { everyMs: 1, words: ["Two panes"] };
      }
      const long = ["longA", "longB"].find((name) =>
        request.all.includes(mark(name))
      );
      if (long) {
        const n = (counts[long] ?? 0) + 1;
        counts[long] = n;
        return longReply(long, n, request, scene.workdir, mark);
      }
      const working = [...STREAMING, "delegate"].find((name) =>
        request.all.includes(mark(name))
      );
      if (working) {
        counts[working] = (counts[working] ?? 0) + 1;
        return {
          everyMs: 40,
          words: wordsOf(40, `${working} turn ${counts[working]}`),
          tool: {
            name: "Bash",
            input: { command: "sleep 1; echo ok", description: "Step" },
          },
        };
      }
      return { everyMs: 5, words: ["Done."] };
    },
  };
  return scene;
}

/** A long session's `n`th call. */
function longReply(
  name: string,
  n: number,
  request: Seen,
  workdir: string,
  mark: (name: string) => string
): Reply {
  if (
    name === "longA" &&
    n > LONG - DELEGATES &&
    n <= LONG &&
    request.toolNames.includes(START_TOOL)
  ) {
    return {
      everyMs: 1,
      words: [],
      tool: {
        name: START_TOOL,
        input: {
          cwd: workdir,
          prompt: `${mark("delegate")} ${n}: work on it.`,
          title: `Delegate ${n}`,
        },
      },
    };
  }
  const live = n > LONG;
  const id = String(n).padStart(5, "0");
  return {
    everyMs: live ? 40 : 1,
    words: live || n % 3 === 0 ? wordsOf(live ? 30 : 4, `${name} ${id}`) : [],
    tool: {
      name: "Bash",
      input: {
        command: live ? `sleep 1; echo ${id}` : `echo ${name}-${id}`,
        description: `Print ${name}-${id}`,
      },
    },
  };
}

const spec: Spec = {
  name: "two-pane-perf",
  run: async (kit) => {
    const scene = sceneModel();
    const { counts, mark } = scene;
    const fleet = await kit.fleet(scene.respond);
    scene.workdir = fleet.workdir;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const ids: Record<string, string> = {};
    const start = async (name: string, title: string) => {
      ids[name] = await fleet.spawn("claude", title);
      await fleet.send(ids[name] as string, `${mark(name)}: go.`);
    };
    await Promise.all([
      start("longA", "Orchestrator"),
      start("longB", "Long session"),
    ]);
    for (let i = 0; i < FINISHED; i += 1) {
      await start(`done${i}`, `Finished ${i}`);
    }
    await until(
      `${LONG} calls in each long session`,
      () => counts,
      (c) => (c.longA ?? 0) >= LONG && (c.longB ?? 0) >= LONG,
      40 * 60_000
    );
    for (const name of STREAMING) {
      await start(name, `Working ${name}`);
    }
    const base = await fleet.dashboard();
    const numbers = {} as Record<Layout, Record<Phase, Reading>>;
    for (const mode of ["one", "two"] as Layout[]) {
      numbers[mode] = await measure(kit, base, mode, ids);
      for (const name of PHASES) {
        const r = numbers[mode][name];
        kit.note(
          `${mode} pane(s), ${name}: ${r.longTasks} long tasks (longest ${r.maxTask}ms), ${r.interactions} interactions (slowest ${r.maxInput}ms), main thread busy ${r.busyMs}ms; the longest ${r.worstFrame}`
        );
      }
    }
    await writeFile(
      join(kit.out, "numbers.json"),
      `${JSON.stringify(numbers, null, 2)}\n`
    );
    const { two } = numbers;
    const { one } = numbers;
    for (const name of ["stream", "type"] as Phase[]) {
      kit.check(
        `two panes, ${name}: no task longer than two frames' budget (${2 * LONG_TASK_MS}ms) at ${THROTTLE}x CPU`,
        two[name].maxTask <= 2 * LONG_TASK_MS,
        `${two[name].longTasks} long tasks, the longest ${two[name].maxTask}ms; the longest ${two[name].worstFrame}`
      );
      kit.check(
        `two panes, ${name}: the main thread no busier than ${BUSY_SHARE}x one pane's at ${THROTTLE}x CPU`,
        two[name].busyMs <= one[name].busyMs * BUSY_SHARE,
        `two panes ${two[name].busyMs}ms (${two[name].longTasks} long tasks), one pane ${one[name].busyMs}ms (${one[name].longTasks})`
      );
      kit.note(
        `two panes, ${name}: the longest task ${two[name].maxTask}ms against the ${LONG_TASK_MS}ms target`
      );
    }
    for (const name of ["stream", "type", "scroll"] as Phase[]) {
      kit.check(
        `two panes, ${name}: every interaction paints within ${INPUT_MS}ms at ${THROTTLE}x CPU`,
        two[name].maxInput < INPUT_MS,
        `${two[name].interactions} interactions, the slowest ${two[name].maxInput}ms`
      );
    }
    kit.check(
      `two panes switch tabs as fast as one: the slowest switch within ${SWITCH_SHARE}x one pane's, at ${THROTTLE}x CPU`,
      two.switch.maxInput <= one.switch.maxInput * SWITCH_SHARE,
      `two panes ${two.switch.maxInput}ms (${two.switch.longTasks} long tasks, main thread busy ${two.switch.busyMs}ms); one pane ${one.switch.maxInput}ms (${one.switch.longTasks}, ${one.switch.busyMs}ms)`
    );
    kit.note(
      `a switch's slowest paint is ${two.switch.maxInput}ms at ${THROTTLE}x CPU, against the ${INPUT_MS}ms budget: revealing a pane put away (content-visibility: hidden) styles its whole transcript in that frame`
    );
  },
};
export default spec;
