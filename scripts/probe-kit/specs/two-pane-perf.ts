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
 * phases: steady streaming, typing in the left composer, wheeling the left
 * transcript, and switching tabs in both panes three ways: the pointer
 * coming onto a tab and clicking it (`point`), the focus resting on a tab
 * and Enter (`focus`), and a switch nobody reached for first, as a shortcut
 * makes it (`cold`).
 *
 * WHAT IS MEASURED IS THE PAGE'S OWN WORK, NOT THE MACHINE'S. Each phase's
 * main thread is read off a DevTools trace by its thread clock (`tdur`, the
 * CPU each task took), as traffic-longtask reads it: the wall clock, and a
 * CPU throttled on top of it, read a loaded host's turns as the page's (a
 * checks run at a load of 20 had one pane's tab switches at twice the CPU
 * the same code took on a quiet machine). The owner's machine is not this
 * one's 48 cores, so a task's CPU is read as on one `SLOWER` times slower.
 *
 * Asserted on two panes: no task over two frames' budget (`LONG_TASK_MS`
 * each) on that slower CPU while streaming and typing; the main thread's
 * CPU per hub message streaming within `MESSAGE_SHARE` of one pane's (typing
 * noted); a switch reached for first (`point`, `focus`), in either layout,
 * no longer than `SWITCH_MS` on the slower CPU, its reach's task noted; a
 * cold switch within `COLD_SHARE` of one pane's (the owner's regression: a
 * second pane made switching five times the work), its own length noted;
 * and every key typed painting within `INPUT_MS` (Event Timing, the
 * entries an `interactionId` marks). Each phase's longest task on the
 * slower CPU is noted against `LONG_TASK_MS`, its longest animation frame
 * by the scripts that filled it, and the hub's messages that took 4ms or
 * more by kind; every number is written to `numbers.json` in the spec's out
 * folder.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one phase, one tab, one key at a time, as a person makes them
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type MainTask, SCROLLER, traceMain } from "../frames";
import { type Kit, open, type Spec } from "../kit";

/** Calls in each long session. */
const LONG = 2000;
/** The orchestrator's delegates, started at the end of its run. */
const DELEGATES = 5;
const STREAMING = ["streamC", "streamD", "streamE"];
const FINISHED = 14;
/**
 * How much slower the owner's CPU is taken to be than this machine's: a
 * mid-tier laptop against 48 server cores. Our own call.
 */
const SLOWER = 4;
/** A long task: the frame budget each phase's longest is noted against. */
const LONG_TASK_MS = 50;
/**
 * How much longer two panes' longest cold switch may be than one pane's: the
 * owner's regression was a second pane making switching five times the work
 * (40.8s against 8.0s, wall clock, 4x throttled). Our own call.
 */
const COLD_SHARE = 1.25;
const INPUT_MS = 100;
/** Older pages read into each long transcript, a scroll to its top apiece. */
const PAGES = 6;
const START_TOOL = "mcp__cawco__start_session";

type Layout = "one" | "two";
/** How a switch is made: see `measure`. */
const SWITCHES = ["point", "focus", "cold"] as const;
type Switch = (typeof SWITCHES)[number];
const PHASES = ["stream", "type", "scroll", ...SWITCHES] as const;
type Phase = (typeof PHASES)[number];
/**
 * How long a reach rests on a tab before it switches: a pointer coming onto
 * a tab and pressing it, the focus resting a beat before Enter. Our own call,
 * a short dwell: a frame is all the warming needs (warm.svelte.ts).
 */
const REACH_MS = 300;
/** How long after a switch its tasks are its own: the glide, the catch-up behind it. */
const SETTLE_MS = 900;
/** Between two ways of switching: every pane a reach warmed has gone cold (warm.svelte.ts `COOL_MS`). */
const REST_MS = 2000;
/** The longest a switch's own task may take on the slower CPU, ms: two frames. */
const SWITCH_MS = 100;
/** How much more a message's CPU two panes may take while streaming than one pane's. */
const MESSAGE_SHARE = 1.1;
interface Reading {
  /** The main thread's CPU over the phase, ms. */
  cpuMs: number;
  interactions: number;
  /** Long tasks by the wall clock (PerformanceObserver `longtask`). */
  longTasks: number;
  /** The longest task's CPU, ms. */
  maxCpu: number;
  maxInput: number;
  /** How many hub messages the page took over the phase. */
  messages: number;
  /** The longest task between a reach and its switch, CPU ms (switch phases). */
  reachCpu: number;
  /** What the longest task restyled, and its style and layout time. */
  restyled: string;
  /** The longest task a switch set off, from it to `SETTLE_MS` after, CPU ms (switch phases). */
  switchCpu: number;
  /** The longest animation frame's account of itself: what ran in it. */
  worstFrame: string;
}

/** A long animation frame as the page tells it: its start, length, and what filled it. */
type Frame = [number, number, string];

interface Cost {
  events: [number, number][];
  frames: Frame[];
  /** Each hub message the page took: when, how long, and what it said it was. */
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
              w.__cost.messages.push([start, performance.now() - start, kind]);
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

/**
 * What each pane holds, by elements: in all, in its transcript's list (and
 * how many rows virtua has mounted there), and the biggest of everything
 * else, by the box it stands in on the way to the list.
 */
const census = (page: Page): Promise<string> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".pane[data-pane]")]
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialized into the page whole, so it cannot lean on helpers out here
      .map((pane) => {
        const all = pane.getElementsByTagName("*").length;
        const listing = pane.querySelector(".listing");
        const inList = listing?.getElementsByTagName("*").length ?? 0;
        const items = listing?.firstElementChild?.children.length ?? 0;
        // The boxes beside the path down to the list, each with what it holds.
        const beside: [string, number][] = [];
        for (
          let at: Element | null = listing;
          at && at !== pane;
          at = at.parentElement
        ) {
          for (const sibling of at.parentElement?.children ?? []) {
            if (sibling !== at) {
              const cls =
                typeof sibling.className === "string"
                  ? (sibling.className.split(" ")[0] ?? "")
                  : "";
              beside.push([
                `${sibling.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`,
                sibling.getElementsByTagName("*").length + 1,
              ]);
            }
          }
        }
        const biggest = beside
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, n]) => `${name} ${n}`)
          .join(", ");
        const state = pane.classList.contains("pane-hidden")
          ? "hidden"
          : "shown";
        // Where the mounted rows stand against the view: virtua's buffer.
        const scroller = pane.querySelector<HTMLElement>(
          '[aria-label="Session transcript"]'
        );
        const tops = [...(listing?.firstElementChild?.children ?? [])].map(
          (item) => Number.parseFloat((item as HTMLElement).style.top)
        );
        const span = tops.length
          ? `rows ${Math.round(Math.min(...tops))}-${Math.round(Math.max(...tops))}px`
          : "no rows";
        const view = scroller
          ? `view ${Math.round(scroller.scrollTop)}+${scroller.clientHeight}px of ${(listing?.firstElementChild as HTMLElement | null)?.style.height}`
          : "";
        return `${pane.dataset.pane?.slice(0, 8)} (${state}): ${all} elements, ${inList} in the list's ${items} rows (${span}; ${view}); beside it ${biggest || "nothing"}`;
      })
      .concat(
        [...document.querySelectorAll("section.leaf")].map((leaf) => {
          const count = (selector: string) =>
            [...leaf.querySelectorAll(selector)].reduce(
              (sum, el) => sum + el.getElementsByTagName("*").length + 1,
              0
            );
          return `group ${(leaf as HTMLElement).dataset.leaf}: its composer ${count(":scope > .dock")}, its tabs ${count("[data-strip]")}`;
        }),
        [
          `the rail ${document.querySelector("aside")?.getElementsByTagName("*").length ?? 0}, the page ${document.getElementsByTagName("*").length}`,
        ]
      )
      .join(" | ")
  );

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
  kit.note(`${mode} pane(s), what each pane holds: ${await census(page)}`);
  const now = () => page.evaluate(() => performance.now());
  const spans = {} as Record<
    Phase,
    {
      cpu: number;
      from: number;
      maxCpu: number;
      reachCpu: number;
      restyled: string;
      switchCpu: number;
      to: number;
    }
  >;
  // The main thread's CPU, off a DevTools trace's top-level tasks; in a
  // switch phase, the longest task of each switch's reach and of the switch
  // itself (its marks, `two-pane:reach:<n>` and `two-pane:switch:<n>`); and
  // what the longest task (the longest switch's, in a switch phase)
  // restyled and laid out, and why.
  const phase = async (name: Phase, act: () => Promise<void>) => {
    let from = 0;
    let to = 0;
    const main = await traceMain(
      page,
      async () => {
        await page.evaluate(
          (mark) => performance.mark(mark),
          `two-pane:${name}`
        );
        from = await now();
        await act();
        to = await now();
      },
      // Streaming is sampled for where its script goes, in either layout alike.
      { profile: name === "stream", restyles: true }
    );
    if (name === "stream") {
      const [start] = main.marks;
      const spent = main
        .selfTime(start?.at ?? 0, Number.POSITIVE_INFINITY)
        .slice(0, 16)
        .map(([fn, ms]) => `${fn} ${ms.toFixed(0)}ms`)
        .join("; ");
      kit.note(
        `${mode} pane(s), stream: the script it ran, by self time: ${spent}`
      );
    }
    const longestOf = (tasks: MainTask[]) =>
      tasks.reduce<MainTask | null>(
        (most, task) => (most && most.cpu >= task.cpu ? most : task),
        null
      );
    const markAt = (mark: string) =>
      main.marks.find((one) => one.name === mark)?.at;
    const reaches: MainTask[] = [];
    const switches: MainTask[] = [];
    for (let n = 0; markAt(`two-pane:switch:${n}`) !== undefined; n += 1) {
      const reach = markAt(`two-pane:reach:${n}`) ?? 0;
      const made = markAt(`two-pane:switch:${n}`) ?? 0;
      reaches.push(
        ...main.tasks.filter((task) => task.at >= reach && task.at < made)
      );
      switches.push(
        ...main.tasks.filter(
          (task) => task.at >= made && task.at < made + SETTLE_MS * 1000
        )
      );
    }
    const longestSwitch = longestOf(switches);
    const longest = longestSwitch ?? longestOf(main.tasks);
    spans[name] = {
      from,
      to,
      cpu: main.tasks.reduce((sum, task) => sum + task.cpu, 0),
      maxCpu: longestOf(main.tasks)?.cpu ?? 0,
      reachCpu: longestOf(reaches)?.cpu ?? 0,
      switchCpu: longestSwitch?.cpu ?? 0,
      restyled: longest
        ? `${longest.restyled} elements in ${Math.round(longest.styleMs)}ms of style, ${Math.round(longest.layoutMs)}ms of layout [${longest.passes
            .filter((pass) => pass.ms >= 0.5)
            .map(
              (pass) =>
                `${pass.name === "Layout" ? "layout" : "style"} ${pass.elements || ""} ${pass.ms.toFixed(1)}ms by ${pass.at}`
            )
            .join("; ")}], asked for by ${
            longest.invalidated
              .map(([what, n]) => `${what} ${n}x`)
              .join("; ") || "nothing traced"
          }`
        : "nothing",
    };
  };
  await phase("stream", () => page.waitForTimeout(20_000));
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
  // Five switches each way along both groups' tabs: by a pointer that comes
  // onto the tab and rests before it clicks, by the keyboard's focus resting
  // on it before Enter, and cold (the tab's own `click()`: no pointer over
  // it, no focus on it, as a shortcut or a link switches).
  const order = (
    mode === "two"
      ? [ids.streamD, ids.streamE, ids.longB, ids.streamC, ids.longA]
      : [ids.longB, ids.streamD, ids.longA, ids.streamC, ids.longA]
  ) as string[];
  const tabOf = (id: string) =>
    page
      .locator(`[data-session-tab="${id}"]`)
      .filter({ visible: true })
      .first();
  const marked = (mark: string) =>
    page.evaluate((name) => performance.mark(name), mark);
  const ways: Record<
    Switch,
    {
      dwell: number;
      make: (tab: Locator) => Promise<unknown>;
      reach: (tab: Locator) => Promise<unknown>;
    }
  > = {
    cold: {
      dwell: 0,
      make: (tab) => tab.evaluate((el) => (el as HTMLElement).click()),
      reach: () => Promise.resolve(),
    },
    focus: {
      dwell: REACH_MS,
      make: () => page.keyboard.press("Enter"),
      reach: (tab) => tab.focus(),
    },
    point: {
      dwell: REACH_MS,
      make: (tab) => tab.click(),
      reach: (tab) => tab.hover(),
    },
  };
  for (const how of SWITCHES) {
    const way = ways[how];
    await page.waitForTimeout(REST_MS);
    await phase(how, async () => {
      for (const [n, id] of order.entries()) {
        const tab = tabOf(id);
        await marked(`two-pane:reach:${n}`);
        await way.reach(tab);
        await page.waitForTimeout(way.dwell);
        await marked(`two-pane:switch:${n}`);
        await way.make(tab);
        await page.waitForTimeout(SETTLE_MS);
      }
    });
  }
  const seen = await page.evaluate(
    () => (window as unknown as { __cost: Cost }).__cost
  );
  await page.close();
  const readings = {} as Record<Phase, Reading>;
  for (const name of PHASES) {
    const { from, to, cpu, maxCpu, reachCpu, restyled, switchCpu } =
      spans[name];
    const tasks = seen.tasks.filter(([at]) => at >= from && at < to);
    const events = seen.events.filter(([at]) => at >= from && at < to);
    const [worst] = seen.frames
      .filter(([at]) => at >= from && at < to)
      .sort((a, b) => b[1] - a[1]);
    const heard = seen.messages.filter(([at]) => at >= from && at < to);
    const byKind = new Map<string, { n: number; max: number; ms: number }>();
    for (const [, ms, kind] of heard) {
      if (ms >= 4) {
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
      maxCpu: Math.round(maxCpu),
      interactions: events.length,
      maxInput: Math.round(Math.max(0, ...events.map(([, ms]) => ms))),
      cpuMs: Math.round(cpu),
      messages: heard.length,
      reachCpu: Math.round(reachCpu),
      restyled,
      switchCpu: Math.round(switchCpu),
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
          `${mode} pane(s), ${name}: main thread CPU ${r.cpuMs}ms over ${r.messages} hub messages${r.switchCpu || r.reachCpu ? `, the longest reach's task ${r.reachCpu}ms and switch's ${r.switchCpu}ms of CPU` : ""}, the longest task ${r.maxCpu}ms of CPU (${r.maxCpu * SLOWER}ms ${SLOWER}x slower, against ${LONG_TASK_MS}ms), restyling ${r.restyled}; ${r.longTasks} long tasks by the wall clock; ${r.interactions} interactions, the slowest ${r.maxInput}ms; the longest ${r.worstFrame}`
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
        `two panes, ${name}: no task longer than two frames' budget (${2 * LONG_TASK_MS}ms) on a CPU ${SLOWER}x slower`,
        two[name].maxCpu * SLOWER <= 2 * LONG_TASK_MS,
        `the longest task ${two[name].maxCpu}ms of CPU; the longest ${two[name].worstFrame}`
      );
    }
    // A streamed message's CPU is held to one pane's: what a second pane
    // adds is its own transcript's tail, not a pass over every row it holds.
    const perMessage = (r: Reading) => r.cpuMs / Math.max(1, r.messages);
    kit.check(
      `two panes, stream: the main thread's CPU per hub message within ${MESSAGE_SHARE}x one pane's`,
      perMessage(two.stream) <= perMessage(one.stream) * MESSAGE_SHARE,
      `${(perMessage(two.stream) / perMessage(one.stream)).toFixed(2)}x: two panes ${two.stream.cpuMs}ms over ${two.stream.messages}, one pane ${one.stream.cpuMs}ms over ${one.stream.messages}`
    );
    kit.note(
      `two panes, type: ${(perMessage(two.type) / perMessage(one.type)).toFixed(2)}x one pane's CPU per hub message (${two.type.cpuMs}ms over ${two.type.messages}, one pane ${one.type.cpuMs}ms over ${one.type.messages})`
    );
    kit.check(
      `two panes, type: every key paints within ${INPUT_MS}ms`,
      two.type.maxInput < INPUT_MS,
      `${two.type.interactions} interactions, the slowest ${two.type.maxInput}ms`
    );
    // A switch the reader reached for first (a pointer resting on its tab,
    // the focus resting on it) only paints: its pane was laid out in the
    // reach. In either layout.
    for (const mode of ["one", "two"] as Layout[]) {
      for (const how of ["point", "focus"] as Switch[]) {
        const r = numbers[mode][how];
        kit.check(
          `${mode} pane(s), ${how}: the switch's longest task within ${SWITCH_MS}ms on a CPU ${SLOWER}x slower`,
          r.switchCpu * SLOWER <= SWITCH_MS,
          `the switch's longest task ${r.switchCpu}ms of CPU (${r.switchCpu * SLOWER}ms ${SLOWER}x slower), restyling ${r.restyled}; the reach's ${r.reachCpu}ms`
        );
      }
    }
    // A switch nobody reached for first lays its pane out in the switch:
    // held to one pane's, its own cost noted against two frames.
    kit.check(
      `two panes, cold: the switch's longest task within ${COLD_SHARE}x one pane's`,
      two.cold.switchCpu <= one.cold.switchCpu * COLD_SHARE,
      `two panes ${two.cold.switchCpu}ms of CPU, one pane ${one.cold.switchCpu}ms`
    );
    kit.note(
      `a cold switch's longest task is ${two.cold.switchCpu}ms of CPU (${two.cold.switchCpu * SLOWER}ms ${SLOWER}x slower) against the ${SWITCH_MS}ms of two frames: a pane nobody reached for is laid out whole as it is shown`
    );
  },
};
export default spec;
