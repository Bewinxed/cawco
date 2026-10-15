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
 * panes: no long task over `LONG_TASK_MS` while streaming and while typing,
 * and no interaction slower than `INPUT_MS` in any phase. Every phase's
 * numbers for both layouts are noted, and written to `numbers.json` in the
 * spec's out folder.
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
const LONG_TASK_MS = 50;
const INPUT_MS = 100;
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
}

/** The page's long tasks and interactions, from before its own scripts. */
function watchCost(): void {
  const w = window as unknown as {
    __cost: { events: [number, number][]; tasks: [number, number][] };
  };
  w.__cost = { tasks: [], events: [] };
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
    () =>
      (
        window as unknown as {
          __cost: { events: [number, number][]; tasks: [number, number][] };
        }
      ).__cost
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.close();
  const readings = {} as Record<Phase, Reading>;
  for (const name of PHASES) {
    const { from, to, busy } = spans[name];
    const tasks = seen.tasks.filter(([at]) => at >= from && at < to);
    const events = seen.events.filter(([at]) => at >= from && at < to);
    readings[name] = {
      longTasks: tasks.length,
      maxTask: Math.round(Math.max(0, ...tasks.map(([, ms]) => ms))),
      interactions: events.length,
      maxInput: Math.round(Math.max(0, ...events.map(([, ms]) => ms))),
      busyMs: Math.round(busy),
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
          `${mode} pane(s), ${name}: ${r.longTasks} long tasks (longest ${r.maxTask}ms), ${r.interactions} interactions (slowest ${r.maxInput}ms), main thread busy ${r.busyMs}ms`
        );
      }
    }
    await writeFile(
      join(kit.out, "numbers.json"),
      `${JSON.stringify(numbers, null, 2)}\n`
    );
    const { two } = numbers;
    for (const name of ["stream", "type"] as Phase[]) {
      kit.check(
        `two panes, ${name}: no long task over ${LONG_TASK_MS}ms at ${THROTTLE}x CPU`,
        two[name].maxTask <= LONG_TASK_MS,
        `${two[name].longTasks} long tasks, the longest ${two[name].maxTask}ms`
      );
    }
    for (const name of PHASES) {
      kit.check(
        `two panes, ${name}: every interaction paints within ${INPUT_MS}ms at ${THROTTLE}x CPU`,
        two[name].maxInput < INPUT_MS,
        `${two[name].interactions} interactions, the slowest ${two[name].maxInput}ms`
      );
    }
  },
};
export default spec;
