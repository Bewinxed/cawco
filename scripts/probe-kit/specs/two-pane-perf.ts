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
 *
 * A LEG COUNTS ONLY UNCONTENDED. Each phase is a leg, and it counts when the
 * spec's own cgroup's CPU pressure (Linux PSI, `cpu.pressure`, `some avg10`)
 * is under `PSI_LIMIT` at its start, middle and end; a leg over it is void
 * and measured again (`LEG_TRIES`), and each leg's note leads with its PSI,
 * the box's load average beside it for reference only. The pressure that
 * cannot be read stops the spec: there is no other gate. On a box shared
 * with the fleet the spec runs in a scope of its own weighted high, the
 * fleet's services low, so its legs get a CPU whenever they ask:
 *
 *   systemd-run --user --scope -p CPUWeight=10000 bun scripts/probe-kit/run.ts two-pane-perf
 *
 * The weighting is the host's systemd's, run from its own shell; a
 * workspace's commands cannot reach it.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one phase, one tab, one key at a time, as a person makes them
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type MainTask, type MainThread, SCROLLER, traceMain } from "../frames";
import { COMPOSER, type Kit, open, type Spec } from "../kit";

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
/** How long after a switch the view is read frame by frame (`viewFrames`): the brief's 300ms. */
const LANDING_MS = 300;
/** Between two ways of switching: every pane a reach warmed has gone cold (warm.svelte.ts `COOL_MS`). */
const REST_MS = 2000;
/** The longest a switch's own task may take on the slower CPU, ms: two frames. */
const SWITCH_MS = 100;
/** A box holding this many elements or more is named when a switch changes it. */
const ROOT_ELEMENTS = 100;
/** How long after its press a switch's own changes are taken to be, ms, the page's clock. */
const CLICK_MS = 100;
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

/** One attribute change on the page, as its observer heard it: when, which, on what, from what. */
interface Changed {
  /** The nodes put into `target`, for a change to what it holds. */
  added: Node[];
  at: number;
  name: string | null;
  /**
   * For rows put into a transcript's list: whose pane, in what state as
   * they went in, and where they stand (virtua's inline `top`, read
   * without laying anything out).
   */
  rows: string | null;
  target: Node;
  was: string | null;
}

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

/**
 * What showing a pane costs alone, the page's clock: `hides` (the class that
 * keeps it from view) taken off the pane `selector` finds, with the page
 * otherwise settled; the style that asks for (a computed style read, which
 * styles the page) and then the layout (a box read); the class put back.
 * `.pane-settling` reveals by `visibility`, which the pane's every element
 * inherits; `.pane-hidden` by `content-visibility`, which none does.
 */
const revealAlone = (
  page: Page,
  selector: string,
  hides: string
): Promise<string> =>
  page.evaluate(
    ([find, name]) => {
      const pane = document.querySelector<HTMLElement>(find);
      if (!pane) {
        return `no ${find}`;
      }
      const inside = pane.getElementsByTagName("*").length;
      const last = pane.querySelector<HTMLElement>("*:last-child") ?? pane;
      document.body.getBoundingClientRect();
      const at = performance.now();
      pane.classList.remove(name);
      const shown = getComputedStyle(last).visibility;
      const styled = performance.now();
      pane.getBoundingClientRect();
      last.getBoundingClientRect();
      const laid = performance.now();
      pane.classList.add(name);
      document.body.getBoundingClientRect();
      return `${inside} elements (${shown}): style ${(styled - at).toFixed(1)}ms, layout ${(laid - styled).toFixed(1)}ms`;
    },
    [selector, hides] as const
  );

/**
 * The drawn transcript, frame by frame for `ms` after a switch: its first row
 * in view (its top in the view and its words), how tall its content stands,
 * and how far the view stands from its tail. Read each frame in its
 * callbacks, apart from every timed pass (each read lays the page out).
 */
const viewFrames = (page: Page, ms: number): Promise<string[][]> =>
  page.evaluate(
    (within) =>
      new Promise<string[][]>((done) => {
        const out: string[][] = [];
        const stop = performance.now() + within;
        const step = () => {
          const view = document.querySelector<HTMLElement>(
            ".pane:not(.pane-hidden, .pane-settling) .tr"
          );
          if (view) {
            const { top } = view.getBoundingClientRect();
            const rows = view.querySelectorAll<HTMLElement>(
              ".listing > div > div"
            );
            const first = [...rows].find(
              (row) => row.getBoundingClientRect().bottom > top + 1
            );
            out.push([
              first
                ? `${(first.getBoundingClientRect().top - top).toFixed(1)}|${(first.textContent ?? "").trim().slice(0, 40)}`
                : "none",
              String(view.scrollHeight),
              (view.scrollHeight - view.clientHeight - view.scrollTop).toFixed(
                1
              ),
            ]);
          }
          if (performance.now() < stop) {
            requestAnimationFrame(step);
          } else {
            done(out);
          }
        };
        requestAnimationFrame(step);
      }),
    ms
  );

/**
 * What in `frames` moved what the reader sees once the view had landed (the
 * first frame at its tail, `viewFrames`): a frame whose content stood as tall
 * as the frame before and whose first row in view is not the same, or a frame
 * the view stood off its tail in.
 */
function movedAfterLanding(frames: string[][]): string[] {
  const landed = frames.findIndex(([, , gap]) => Number(gap) <= 1);
  const moved: string[] = [];
  for (
    let i = Math.max(1, landed + 1);
    landed >= 0 && i < frames.length;
    i += 1
  ) {
    const [row, height, gap] = frames[i];
    const [rowBefore, heightBefore] = frames[i - 1];
    if (height === heightBefore && row !== rowBefore) {
      moved.push(`frame ${i}: ${rowBefore} → ${row}`);
    }
    if (Number(gap) > 1) {
      moved.push(`frame ${i}: ${gap}px off the tail`);
    }
  }
  return moved;
}

/**
 * What putting the pane on screen away costs alone, the switch's other half:
 * `.pane-hidden` (`content-visibility: hidden`) put on the drawn pane, the
 * style and then the layout that asks for, the class taken off again.
 */
const hideAlone = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(
      ".pane:not(.pane-hidden, .pane-settling)"
    );
    if (!pane) {
      return "no drawn pane";
    }
    const inside = pane.getElementsByTagName("*").length;
    document.body.getBoundingClientRect();
    const at = performance.now();
    pane.classList.add("pane-hidden");
    const skipped = getComputedStyle(pane).contentVisibility;
    const styled = performance.now();
    pane.getBoundingClientRect();
    document.body.getBoundingClientRect();
    const laid = performance.now();
    pane.classList.remove("pane-hidden");
    document.body.getBoundingClientRect();
    return `${inside} elements (${skipped}): style ${(styled - at).toFixed(1)}ms, layout ${(laid - styled).toFixed(1)}ms`;
  });

/**
 * What the composer's half of a switch lays out alone, each part on its
 * own and put back: the draft handed to the field (its text swapped), the
 * offer stack's height, and the tray shown swapped for the next.
 */
const composerAlone = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>(".leaf > .dock .dock");
    if (!dock) {
      return "no composer";
    }
    const timed = (change: () => void, undo: () => void) => {
      document.body.getBoundingClientRect();
      const at = performance.now();
      change();
      document.body.getBoundingClientRect();
      const ms = performance.now() - at;
      undo();
      document.body.getBoundingClientRect();
      return `${ms.toFixed(1)}ms`;
    };
    const field = dock.querySelector<HTMLTextAreaElement>("textarea");
    const draft = field?.value ?? "";
    const stack = dock.querySelector<HTMLElement>(".stack");
    const height = stack?.style.blockSize ?? "";
    const trays = [...dock.querySelectorAll<HTMLElement>(".tray")];
    const swap = () => {
      for (const tray of trays) {
        tray.classList.toggle("away");
      }
    };
    return [
      `the draft: ${
        field
          ? timed(
              () => {
                field.value = draft
                  ? ""
                  : "A draft of two lines, as long as a reply asked for";
              },
              () => {
                field.value = draft;
              }
            )
          : "no field"
      }`,
      `the offer stack's height: ${
        stack
          ? timed(
              () => {
                stack.style.blockSize = `${stack.offsetHeight + 40}px`;
              },
              () => {
                stack.style.blockSize = height;
              }
            )
          : "no stack"
      }`,
      `the tray (${trays.length}): ${trays.length > 1 ? timed(swap, swap) : "one or none"}`,
    ].join(", ");
  });

/**
 * Each `setAttribute` the page makes from here on, timed: a style pass
 * forced from inside one (a box's focusability read again) is named by the
 * attribute and the box. Read and put back by `slowSetsOf`.
 */
const timeSets = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const slow: { at: string; ms: number }[] = [];
    const set = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
      const from = performance.now();
      set.call(this, name, value);
      const ms = performance.now() - from;
      if (ms >= 0.2) {
        const kind = (this.getAttribute("class") ?? "").split(" ").slice(0, 2);
        slow.push({
          at: `${name} on ${this.tagName.toLowerCase()}.${kind.join(".")}`,
          ms,
        });
      }
    };
    const w = window as unknown as {
      __setAttribute: typeof set;
      __slowSets: typeof slow;
    };
    w.__slowSets = slow;
    w.__setAttribute = set;
  });
/**
 * A switch's layout, part by part: the tab chosen (its link's click, the
 * pane warmed first by the pointer resting on it), Svelte's flush let run,
 * then one forced layout timed; the same again with one thing about the
 * page changed (a rule laid on before the switch, its own layout forced
 * first), so the difference is that thing's share. A reading, not the
 * switch's frame: the frame callbacks' work is not in it.
 */
const LAYOUT_PARTS = [
  ["nothing changed", ""],
  ["the tab strip taken out", ".session-tabs { display: none !important; }"],
  [
    "the strip's layout its own (contain: layout)",
    ".session-tabs { contain: layout !important; }",
  ],
  [
    "the track's layout its own (contain: layout)",
    ".session-tabs .ff-tabs-list { contain: layout !important; }",
  ],
  [
    "the panes' stack's layout its own (contain: layout)",
    ".stack[data-drop-leaf] { contain: layout !important; }",
  ],
  [
    "every tab's contents taken out, its box kept",
    ".session-tabs .ff-tab > * { display: none !important; }",
  ],
] as const;
async function switchLayoutParts(
  page: Page,
  tabs: [string, string],
  reach: (id: string) => Promise<void>
): Promise<string> {
  const read: string[] = [];
  for (const [name, selector] of LAYOUT_PARTS) {
    const ms: string[] = [];
    for (const id of [...tabs, ...tabs]) {
      await reach(id);
      ms.push(
        await page.evaluate(
          async ({ hide, tab }) => {
            const drawn = () =>
              [
                ...document.querySelectorAll<HTMLElement>(
                  ".pane:not(.pane-hidden, .pane-settling)"
                ),
              ]
                .map((pane) => pane.dataset.pane)
                .join();
            const style = document.createElement("style");
            if (hide) {
              style.textContent = hide;
              document.head.append(style);
            }
            document.body.getBoundingClientRect();
            const was = drawn();
            document
              .querySelector<HTMLElement>(`[data-session-tab="${tab}"]`)
              ?.click();
            await Promise.resolve();
            await Promise.resolve();
            const flushed = performance.now();
            document.body.getBoundingClientRect();
            const laid = performance.now() - flushed;
            // A switch that did not happen lays nothing out: said, not counted.
            const switched = drawn() !== was;
            style.remove();
            return `${laid.toFixed(1)}${switched ? "" : " (no switch)"}`;
          },
          { hide: selector, tab: id }
        )
      );
      await page.waitForTimeout(SETTLE_MS);
    }
    read.push(`${name}: ${ms.join(", ")}ms`);
  }
  return read.join("; ");
}
/**
 * A leg counts when the spec itself got the CPU it asked for: its own
 * cgroup's CPU pressure (Linux PSI, cgroup v2 `cpu.pressure`, `some avg10`:
 * the share of the last 10s some task of its waited for a CPU) under this at
 * the leg's start, middle and end. The box's load average says how busy the
 * machine is, not whether this spec waited on it; with the fleet's services
 * weighted low and the spec's scope high, the machine can be loaded and the
 * spec uncontended, and PSI is what proves it.
 */
const PSI_LIMIT = 1.0;
/** How often the pressure is read while waiting for it to fall. */
const PSI_POLL_MS = 5000;
/** The longest a leg waits for the pressure to fall before it is measured as it stands. */
const PSI_WAIT_MS = 20 * 60_000;
/** How often the pressure is read while a leg runs (its middle is the middle reading). */
const LEG_SAMPLE_MS = 1000;
/** How many times a leg the spec waited for CPU in is measured again. */
const LEG_TRIES = 3;

/** This process's cgroup's `cpu.pressure` file, read off `/proc/self/cgroup` (v2's `0::` line). */
function pressureFile(): string {
  const line = readFileSync("/proc/self/cgroup", "utf8")
    .split("\n")
    .find((one) => one.startsWith("0::"));
  if (!line) {
    throw new Error(
      "two-pane-perf: no cgroup v2 line in /proc/self/cgroup, so its CPU pressure cannot be read; it measures nothing without it"
    );
  }
  return `/sys/fs/cgroup${line.slice(3)}/cpu.pressure`;
}
const PRESSURE = /^some avg10=([\d.]+)/m;
/** The spec's own `some avg10`; throws when it cannot be read: there is no other gate. */
function cpuPressure(file: string): number {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(
      `two-pane-perf: ${file} cannot be read (${String(error)}); it measures nothing without its CPU pressure`,
      { cause: error }
    );
  }
  const found = PRESSURE.exec(text);
  if (!found) {
    throw new Error(`two-pane-perf: no "some avg10" in ${file}: ${text}`);
  }
  return Number.parseFloat(found[1]);
}
/** The box's 1-minute load average, said beside the pressure for reference only. */
const oneMinuteLoad = (): string =>
  readFileSync("/proc/loadavg", "utf8").split(" ")[0];

/** Waits for the spec's CPU pressure to fall under `PSI_LIMIT`, bounded; how long it waited, from what. */
async function uncontended(file: string): Promise<string> {
  const began = Date.now();
  const first = cpuPressure(file);
  let pressure = first;
  while (!(pressure < PSI_LIMIT) && Date.now() - began < PSI_WAIT_MS) {
    await Bun.sleep(PSI_POLL_MS);
    pressure = cpuPressure(file);
  }
  return `waited ${((Date.now() - began) / 1000).toFixed(0)}s from PSI ${first}`;
}

/**
 * Runs a leg once the spec waits on no one for CPU, reading its pressure
 * each second while it runs, and again (up to `LEG_TRIES`) when its start,
 * middle or end reading was `PSI_LIMIT` or more: a contended leg is void.
 * Says the leg's readings: PSI at start, middle and end, the try kept, the
 * wait, and the load average beside them for reference.
 */
async function quietLeg(
  name: string,
  file: string,
  run: () => Promise<void>
): Promise<string> {
  let said = "";
  for (let attempt = 1; attempt <= LEG_TRIES; attempt += 1) {
    const waited = await uncontended(file);
    const readings: number[] = [cpuPressure(file)];
    const loadAt = oneMinuteLoad();
    const sampler = setInterval(
      () => readings.push(cpuPressure(file)),
      LEG_SAMPLE_MS
    );
    try {
      await run();
    } finally {
      clearInterval(sampler);
    }
    readings.push(cpuPressure(file));
    const marks = [
      readings[0],
      readings[Math.floor(readings.length / 2)],
      readings.at(-1) ?? 0,
    ];
    const quiet = marks.every((one) => one < PSI_LIMIT);
    said = `PSI some avg10 ${marks.join(" / ")} (start / middle / end), try ${attempt} (${waited}), load ${loadAt}–${oneMinuteLoad()} for reference${quiet ? "" : `, CONTENDED (PSI ${PSI_LIMIT} or more)`}`;
    console.log(`  ${name}: ${said}`);
    if (quiet) {
      break;
    }
  }
  return said;
}

/**
 * Each switch's work from its input (`two-pane:switch:<n>`, marked as the
 * input goes in) to the frame that shows its pane (`two-pane:shown:<n>`,
 * marked in that frame's callbacks): the CPU of every task from the one to
 * the end of the task holding the other, and the wall clock over them.
 * Noted for a phase that made switches.
 */
function noteInputToShown(
  kit: Kit,
  where: string,
  own: MainTask[],
  markAt: (mark: string) => number | undefined
): void {
  const read: string[] = [];
  for (let n = 0; markAt(`two-pane:switch:${n}`) !== undefined; n += 1) {
    const made = markAt(`two-pane:switch:${n}`) ?? 0;
    const shown = markAt(`two-pane:shown:${n}`);
    if (shown === undefined) {
      read.push("not shown in 2s");
      continue;
    }
    const frame = own.find((task) => task.at <= shown && task.end >= shown);
    const end = frame ? frame.end : shown;
    const cpu = own
      .filter((task) => task.at >= made && task.at <= end)
      .reduce((sum, task) => sum + task.cpu, 0);
    read.push(`${cpu.toFixed(1)}ms (${((end - made) / 1000).toFixed(0)}ms)`);
  }
  if (read.length > 0) {
    kit.note(
      `${where}: from the input to the frame that shows the pane, the page's CPU (and the wall clock): ${read.join(", ")}`
    );
  }
}

/** The slow `setAttribute` calls of the switches `press` makes, one tab at a time. */
async function slowSetsIn(
  page: Page,
  tabs: string[],
  press: (id: string) => Promise<void>
): Promise<string> {
  await timeSets(page);
  for (const id of tabs) {
    await press(id);
  }
  return slowSetsOf(page);
}
/** The ten slowest `setAttribute` calls since `timeSets`, the wrapper taken off. */
const slowSetsOf = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const w = window as unknown as {
      __setAttribute: typeof Element.prototype.setAttribute;
      __slowSets: { at: string; ms: number }[];
    };
    Element.prototype.setAttribute = w.__setAttribute;
    return (
      w.__slowSets
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 10)
        .map((one) => `${one.at} ${one.ms.toFixed(1)}ms`)
        .join("; ") || "none over 0.2ms"
    );
  });

/**
 * The script in each press's longest task (the one a switch is held to),
 * by self time across the presses, the most first.
 */
function scriptOf(sampled: MainThread, presses: number[]): string {
  const spent = new Map<string, number>();
  for (const at of presses) {
    const longestTask = sampled.tasks
      .filter((task) => task.at >= at && task.at < at + SETTLE_MS * 1000)
      .reduce<MainTask | null>(
        (most, task) => (most && most.cpu >= task.cpu ? most : task),
        null
      );
    if (!longestTask) {
      continue;
    }
    for (const [fn, ms] of sampled.selfTime(longestTask.at, longestTask.end)) {
      spent.set(fn, (spent.get(fn) ?? 0) + ms);
    }
  }
  return [...spent]
    .filter(([fn]) => fn !== "(idle)")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([fn, ms]) => `${fn} ${ms.toFixed(1)}ms`)
    .join("; ");
}

/**
 * Which task a switch's longest is: what it ran, and how long after its
 * switch it began. The click's own, a timer it set going, or a frame later.
 */
function whichOf(task: MainTask | null, madeOf: Map<MainTask, number>): string {
  if (!task) {
    return "";
  }
  const after = Math.round((task.at - (madeOf.get(task) ?? task.at)) / 1000);
  return `${task.ran}, ${after}ms after the switch; `;
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
  const measurePhase = async (name: Phase, act: () => Promise<void>) => {
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
    // The phase's own tasks, from its mark on: the trace's first task is
    // DevTools beginning it (the sampling profiler's start alone was 206ms
    // of CPU), not the page's.
    const begun = markAt(`two-pane:${name}`) ?? 0;
    const own = main.tasks.filter((task) => task.at >= begun);
    const reaches: MainTask[] = [];
    const switches: MainTask[] = [];
    /** Each switch's task, and the switch's mark it falls after. */
    const madeOf = new Map<MainTask, number>();
    const afterSwitch: (readonly [MainTask, number])[] = [];
    for (let n = 0; markAt(`two-pane:switch:${n}`) !== undefined; n += 1) {
      const reach = markAt(`two-pane:reach:${n}`) ?? 0;
      const made = markAt(`two-pane:switch:${n}`) ?? 0;
      reaches.push(...own.filter((task) => task.at >= reach && task.at < made));
      afterSwitch.push(
        ...own
          .filter(
            (task) => task.at >= made && task.at < made + SETTLE_MS * 1000
          )
          .map((task) => [task, made] as const)
      );
    }
    for (const [task, made] of afterSwitch) {
      switches.push(task);
      madeOf.set(task, made);
    }
    noteInputToShown(kit, `${mode} pane(s), ${name}`, own, markAt);
    const longestSwitch = longestOf(switches);
    const whichTask = whichOf(longestSwitch, madeOf);
    const longest = longestSwitch ?? longestOf(own);
    spans[name] = {
      from,
      to,
      cpu: own.reduce((sum, task) => sum + task.cpu, 0),
      maxCpu: longestOf(own)?.cpu ?? 0,
      reachCpu: longestOf(reaches)?.cpu ?? 0,
      switchCpu: longestSwitch?.cpu ?? 0,
      restyled: longest
        ? `${whichTask}${longest.restyled} elements in ${Math.round(longest.styleMs)}ms of style, ${Math.round(longest.layoutMs)}ms of layout [${longest.passes
            .filter((pass) => pass.ms >= 0.5)
            .map(
              (pass) =>
                `${pass.name === "Layout" ? "layout" : "style"} ${pass.elements || ""} ${pass.ms.toFixed(1)}ms by ${pass.at}${pass.root ? ` from a ${pass.root} root` : ""}`
            )
            .join("; ")}], asked for by ${
            longest.invalidated
              .map(([what, n]) => `${what} ${n}x`)
              .join("; ") || "nothing traced"
          }; laid out again for ${
            longest.relaidOut.map(([what, n]) => `${what} ${n}x`).join("; ") ||
            "nothing traced"
          }; set off by ${
            longest.scheduled.map(([what, n]) => `${what} ${n}x`).join("; ") ||
            "nothing traced"
          }; its other phases: ${
            longest.rendering
              .map(([what, ms]) => `${what} ${ms.toFixed(1)}ms`)
              .join("; ") || "none"
          }`
        : "nothing",
    };
  };
  // Each leg uncontended (`quietLeg`): measured again when the spec waited
  // for CPU while it ran, its readings said with it.
  const pressure = pressureFile();
  cpuPressure(pressure);
  const phase = async (name: Phase, act: () => Promise<void>) => {
    const leg = await quietLeg(`${mode} pane(s), ${name}`, pressure, () =>
      measurePhase(name, act)
    );
    spans[name].restyled = `${leg} | ${spans[name].restyled}`;
  };
  await phase("stream", () => page.waitForTimeout(20_000));
  await phase("type", async () => {
    await page.locator(`[data-leaf="pleft"] ${COMPOSER}`).first().click();
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
  // The pointer's own input, as the browser takes it from a mouse (CDP
  // `Input.dispatchMouseEvent`): a locator's click first scrolls, waits for
  // the box to be stable and hit-tests it in the page (`expectHitTarget`,
  // `elementsFromPoint`), about 4ms of the page's main thread inside the
  // switch it is measuring. The tab's centre is read before the switch.
  const input = await page.context().newCDPSession(page);
  /** Where the pointer came onto the tab it is about to press. */
  let pointedAt = { x: 0, y: 0 };
  const centreOf = async (tab: Locator) => {
    const box = await tab.boundingBox();
    if (!box) {
      throw new Error("two-pane-perf: a tab to switch to has no box");
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const mouse = (
    type: "mouseMoved" | "mousePressed" | "mouseReleased",
    at: { x: number; y: number }
  ) =>
    input.send("Input.dispatchMouseEvent", {
      type,
      x: at.x,
      y: at.y,
      button: type === "mouseMoved" ? "none" : "left",
      buttons: type === "mousePressed" ? 1 : 0,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
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
      // Pressed where the reach came onto the tab: its box is read before
      // the switch's mark, not inside the switch.
      make: async () => {
        await mouse("mousePressed", pointedAt);
        await mouse("mouseReleased", pointedAt);
      },
      reach: async (tab) => {
        pointedAt = await centreOf(tab);
        await mouse("mouseMoved", pointedAt);
      },
    },
  };
  // What each switch changed on a box holding `ROOT_ELEMENTS` or more: an
  // inherited style changing on one restyles all it holds, so this names
  // the box and the attribute behind a switch's restyle. The observer only
  // keeps the records, in the switch's own task; they are read, and the
  // boxes counted, after it (`Changed`). And the elements each switch put
  // into the page, by where: each is styled whole as it goes in.
  await page.evaluate(() => {
    const kept: Changed[] = [];
    const rowsOf = (target: Node, added: Node[]): string | null => {
      const pane =
        target instanceof Element && target.closest(".listing")
          ? target.closest<HTMLElement>("[data-pane]")
          : null;
      const tops = added.flatMap((node) =>
        node instanceof HTMLElement && node.style.top
          ? [Number.parseFloat(node.style.top)]
          : []
      );
      if (!pane || tops.length === 0) {
        return null;
      }
      let state = "drawn";
      if (pane.classList.contains("pane-hidden")) {
        state = "put away";
      } else if (pane.classList.contains("pane-settling")) {
        state = "settling";
      }
      return `${tops.length} rows into ${pane.dataset.pane?.slice(0, 8)} (${state}) at ${Math.min(...tops)}-${Math.max(...tops)}px`;
    };
    // Every scroll and every row taken out of a transcript, by pane, with
    // when: what a switch sets going after its own frame (a list scrolled
    // to its tail, a range re-cut), past the 100ms the boxes are read for.
    const later: { at: number; line: string }[] = [];
    const paneOf = (node: Node | null): string => {
      const pane =
        node instanceof Element
          ? node.closest<HTMLElement>("[data-pane]")
          : null;
      if (!pane) {
        return "outside a pane";
      }
      let state = "drawn";
      if (pane.classList.contains("pane-hidden")) {
        state = "put away";
      } else if (pane.classList.contains("pane-settling")) {
        state = "settling";
      }
      return `${(pane.getAttribute("data-pane") ?? "").slice(0, 8)} (${state})`;
    };
    document.addEventListener(
      "scroll",
      (event) => {
        // Where, not how far: the offset is a read of the page's layout,
        // which styled it inside the very task being measured.
        const box = event.target;
        if (box instanceof HTMLElement) {
          later.push({
            at: performance.now(),
            line: `scrolled ${paneOf(box)} ${box.className.split(" ")[0]}`,
          });
        }
      },
      { capture: true, passive: true }
    );
    new MutationObserver((records) => {
      const at = performance.now();
      for (const { removedNodes, target } of records) {
        const gone = [...removedNodes].filter(
          (node) => node instanceof HTMLElement && node.style.top
        ).length;
        if (
          gone > 0 &&
          target instanceof Element &&
          target.closest(".listing")
        ) {
          later.push({ at, line: `${gone} rows out of ${paneOf(target)}` });
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    (window as unknown as { __later: typeof later }).__later = later;
    new MutationObserver((records) => {
      const at = performance.now();
      for (const { addedNodes, target, attributeName, oldValue } of records) {
        const added = [...addedNodes];
        kept.push({
          added,
          at,
          name: attributeName,
          rows: rowsOf(target, added),
          target,
          was: oldValue,
        });
      }
    }).observe(document.body, {
      attributeOldValue: true,
      attributes: true,
      childList: true,
      subtree: true,
    });
    (window as unknown as { __changed: Changed[] }).__changed = kept;
  });
  for (const how of SWITCHES) {
    const way = ways[how];
    const changed = new Map<string, number>();
    const after = new Map<string, number>();
    await page.waitForTimeout(REST_MS);
    await phase(how, async () => {
      for (const [n, id] of order.entries()) {
        const tab = tabOf(id);
        await marked(`two-pane:reach:${n}`);
        await way.reach(tab);
        await page.waitForTimeout(way.dwell);
        // The frame that shows the chosen pane, marked in its callbacks:
        // the switch's work from its input to that frame is read off the
        // trace between the two marks (`measurePhase`).
        const madeAt = await page.evaluate(
          ({ mark, shown, pane }) => {
            const drawn = () => {
              const box = document.querySelector(
                `.pane[data-pane="${CSS.escape(pane)}"]`
              );
              return (
                box !== null &&
                !box.classList.contains("pane-hidden") &&
                !box.classList.contains("pane-settling")
              );
            };
            const began = performance.now();
            const look = () => {
              if (drawn()) {
                performance.mark(shown);
              } else if (performance.now() - began < 2000) {
                requestAnimationFrame(look);
              }
            };
            performance.mark(mark);
            requestAnimationFrame(look);
            return performance.now();
          },
          {
            mark: `two-pane:switch:${n}`,
            shown: `two-pane:shown:${n}`,
            pane: id,
          }
        );
        await way.make(tab);
        await page.waitForTimeout(SETTLE_MS);
        const said = await page.evaluate(
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialized into the page whole, so it cannot lean on helpers out here
          ([since, within, least]) => {
            const kept = (window as unknown as { __changed: Changed[] })
              .__changed;
            const clip = (value: string | null) => (value ?? "").slice(0, 80);
            const ours: string[] = [];
            const regions: [string, string][] = [
              ["[data-pane]:not(.pane-hidden)", "a pane drawn"],
              ["[data-pane].pane-hidden", "a pane put away"],
              [".dock", "the composer"],
              [".session-tabs, [data-session-tab]", "the tabs"],
            ];
            const nameOf = (box: Element) =>
              [box.tagName.toLowerCase(), ...box.classList]
                .filter((part) => !part.startsWith("svelte-"))
                .slice(0, 3)
                .join(".");
            // The box it went into, and the nearest named one round it.
            const boxOf = (box: Element) => {
              const named = box.closest("[class]:not([class^='svelte-'])");
              return named && named !== box
                ? `${nameOf(box)} in ${nameOf(named)}`
                : nameOf(box);
            };
            const regionOf = (box: Element) =>
              `inserted into ${
                regions.find(([where]) => box.closest(where))?.[1] ?? "the page"
              }: ${boxOf(box)}`;
            for (const { added, at, name, rows, target, was } of kept) {
              if (!(at >= since && at < since + within)) {
                continue;
              }
              if (rows) {
                ours.push(rows);
              }
              if (target instanceof Element && added.length > 0) {
                const elements = added.reduce(
                  (sum, node) =>
                    node instanceof Element
                      ? sum + 1 + node.getElementsByTagName("*").length
                      : sum,
                  0
                );
                for (let i = 0; i < elements; i += 1) {
                  ours.push(regionOf(target));
                }
              }
              if (!(target instanceof Element && name)) {
                continue;
              }
              const holds = target.getElementsByTagName("*").length;
              const is = target.getAttribute(name);
              if (holds >= least && is !== was) {
                const box = [target.tagName.toLowerCase(), ...target.classList]
                  .slice(0, 3)
                  .join(".");
                ours.push(
                  `${box} [${name}] "${clip(was)}" → "${clip(is)}" (${holds} inside)`
                );
              }
            }
            kept.length = 0;
            return ours;
          },
          [madeAt, CLICK_MS, ROOT_ELEMENTS] as const
        );
        for (const what of said) {
          changed.set(what, (changed.get(what) ?? 0) + 1);
        }
        const happened = await page.evaluate(
          ([since, within]) => {
            const later = (
              window as unknown as { __later: { at: number; line: string }[] }
            ).__later;
            const ours = later
              .filter(({ at }) => at >= since && at < since + within)
              .map(
                ({ at, line }) =>
                  `${line} at ${Math.round((at - since) / 10) * 10}ms`
              );
            later.length = 0;
            return ours;
          },
          [madeAt, SETTLE_MS] as const
        );
        for (const what of happened) {
          after.set(what, (after.get(what) ?? 0) + 1);
        }
      }
    });
    kit.note(
      `${mode} pane(s), ${how}: what followed each switch within ${SETTLE_MS}ms, scrolls and rows taken out: ${
        [...after]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([what, times]) => `${what} ${times}x`)
          .join("; ") || "nothing"
      }`
    );
    kit.note(
      `${mode} pane(s), ${how}: what its switches changed, within ${CLICK_MS}ms of each, on boxes of ${ROOT_ELEMENTS} elements or more: ${
        [...changed]
          .sort((a, b) => b[1] - a[1])
          .map(([what, times]) => `${what} ${times}x`)
          .join("; ") || "nothing"
      }`
    );
  }
  // Where a switch's script goes: the pointer's switches again, sampled,
  // after the measured ones (the sampler is not in what they read), each
  // switch's own window from its press to `SETTLE_MS` on.
  await page.waitForTimeout(REST_MS);
  const presses: number[] = [];
  const sampled = await traceMain(
    page,
    async () => {
      for (const [n, id] of order.entries()) {
        const tab = tabOf(id);
        await ways.point.reach(tab);
        await page.waitForTimeout(REACH_MS);
        await marked(`two-pane:sampled:${n}`);
        await ways.point.make(tab);
        await page.waitForTimeout(SETTLE_MS);
      }
    },
    { profile: true }
  );
  for (const { at, name } of sampled.marks) {
    if (name.startsWith("two-pane:sampled:")) {
      presses.push(at);
    }
  }
  kit.note(
    `${mode} pane(s), point: the script in its ${presses.length} switches' longest tasks, by self time, all told: ${scriptOf(sampled, presses)}`
  );
  // A pane shown alone, both ways: put away (`content-visibility`), the
  // tab not yet reached for; then warm (`visibility`), its tab under the
  // pointer.
  const putAway: string[] = [];
  const warmed: string[] = [];
  const hidden: string[] = [];
  const composed: string[] = [];
  for (const id of order) {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(REST_MS);
    hidden.push(await hideAlone(page));
    composed.push(await composerAlone(page));
    const pane = `.pane.pane-hidden[data-pane="${id}"]`;
    putAway.push(await revealAlone(page, pane, "pane-hidden"));
    await ways.point.reach(tabOf(id));
    await page.waitForTimeout(REACH_MS);
    warmed.push(
      await revealAlone(page, ".pane.pane-settling", "pane-settling")
    );
  }
  await page.mouse.move(0, 0);
  kit.note(
    `${mode} pane(s), a pane shown alone by \`content-visibility\` (\`.pane-hidden\` taken off): ${putAway.join("; ")}`
  );
  kit.note(
    `${mode} pane(s), a pane shown alone by \`visibility\` (\`.pane-settling\` taken off): ${warmed.join("; ")}`
  );
  kit.note(
    `${mode} pane(s), the drawn pane put away alone (\`.pane-hidden\` put on): ${hidden.join("; ")}`
  );
  kit.note(
    `${mode} pane(s), the composer's half of a switch laid out alone: ${composed.join("; ")}`
  );
  // Which attributes a press's switch sets slowly, past the timed switches
  // (the wrapper is not free).
  const slowSets = await slowSetsIn(page, order.slice(0, 2), async (id) => {
    await ways.point.reach(tabOf(id));
    await page.waitForTimeout(REACH_MS);
    await ways.point.make(tabOf(id));
    await page.waitForTimeout(SETTLE_MS);
  });
  kit.note(
    `${mode} pane(s), point: the slow setAttribute calls in two switches: ${slowSets}`
  );
  const parts = await switchLayoutParts(
    page,
    [order[0], order[1]],
    async (id) => {
      await ways.point.reach(tabOf(id));
      await page.waitForTimeout(REACH_MS);
    }
  );
  kit.note(
    `${mode} pane(s): a switch's layout forced after its flush, with a part of the page taken out: ${parts}`
  );
  // What the reader sees after each switch, frame by frame, apart from the
  // timed passes: once a catch-up has landed at the tail, nothing mounted
  // after it moves the first row in view.
  const moved: string[] = [];
  for (const [n, id] of order.entries()) {
    await ways.point.reach(tabOf(id));
    await page.waitForTimeout(REACH_MS);
    await ways.point.make(tabOf(id));
    const seen = movedAfterLanding(await viewFrames(page, LANDING_MS));
    moved.push(...seen.map((what) => `switch ${n}, ${what}`));
    await page.waitForTimeout(REST_MS);
  }
  kit.check(
    `two-pane-perf: ${mode} pane(s): once a switch has landed at the tail, nothing that follows in ${LANDING_MS}ms moves the first row in view`,
    moved.length === 0,
    moved.slice(0, 8).join("; ") || "nothing moved"
  );
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
    // Its CPU pressure readable before anything is built: no gate, no run.
    const pressure = pressureFile();
    console.log(
      `  two-pane-perf: legs gated on ${pressure}, PSI some avg10 ${cpuPressure(pressure)} now`
    );
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
