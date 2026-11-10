/**
 * A long conversation holds the frame budget while it is wheeled, while the
 * pointer moves over it, and while the rail beside it is dragged wider and
 * back (owner's trace of 2026-11-08, nightly 7148: an orchestrator of
 * hundreds of turns, its frames 70-112ms each, about 285 frame callbacks a
 * second).
 *
 *   bun scripts/probe-kit/run.ts conversation-frames
 *
 * On a scratch fleet, one Claude Code session of `TURNS` calls, each with a
 * reply of product-shaped prose (three of a paragraph, a list and a code
 * block), opened alone in one pane at the desk's 1440x900 and read back
 * to its first turn. Four legs, each traced (DevTools, the timeline's own
 * category with its stacks, the CPU throttled `SLOWER` times but the one
 * marked 1x):
 *
 * - wheel: the pointer over the transcript, wheeled up a notch of 120px every
 *   50ms for `WHEELS` notches, moving a little between notches;
 * - wheel1x: the same wheel on this machine's own CPU;
 * - pointer: the pointer swept across the rows for `SWEEPS` moves, nothing
 *   scrolled;
 * - rail: the rail's grip dragged out `RAIL_TRAVEL`px and back, a step a
 *   frame, and let go.
 *
 * Read off each trace, on the page's main thread: frame callbacks a second
 * (`FireAnimationFrame`), the longest task by its own CPU (`tdur`, less the
 * garbage collections in it), and the style recalculations and layouts, all
 * of them and those a script forced (one with a stack), and the most
 * elements one style pass restyled. Asserted: while the pointer moves and
 * while the rail is dragged, frame callbacks a second under `RAF_PER_S`
 * (every observer's answer in one callback, no loop where nothing moves);
 * no style or layout forced by a script in the drag; no style pass of the
 * rail leg past `RAIL_RESTYLED` elements (letting go restyles the rail, not
 * the page); no task of the 1x wheel over `FRAME_MS` of CPU; and find's
 * highlight styled only while the root holds marks. Each leg's tasks over
 * `FRAME_MS` are noted. `PROBE_FRAMES_DIAGNOSE=1`, `PROBE_FRAMES_PROFILE=1`
 * and `PROBE_FRAMES_SELECTORS=1` add invalidations and script samples,
 * script samples alone, and selector costs to the traces. Each leg's numbers
 * and its raw trace go to the spec's out folder.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { asReader, SCROLLER } from "../frames";
import { open } from "../kit";
import type { Kit, Spec } from "../spec";

/** Calls in the long session: the owner's "hundreds of turns". */
const TURNS = 400;
/** Older pages read in, a scroll to the top apiece. */
const PAGES = 12;
const WHEELS = 60;
const SWEEPS = 60;
const RAIL_TRAVEL = 160;
/**
 * How much slower the owner's CPU is taken to be than this machine's (DevTools
 * CPU throttling over each leg), as two-pane-perf takes it.
 */
const SLOWER = 4;
/** `PROBE_FRAMES_DIAGNOSE=1`: each trace also records invalidations and samples script, for reading by hand. */
const DIAGNOSE = process.env.PROBE_FRAMES_DIAGNOSE === "1";
/** `PROBE_FRAMES_SELECTORS=1`: each trace also records each style pass's selector costs (Blink's `SelectorStats`). */
const SELECTORS = process.env.PROBE_FRAMES_SELECTORS === "1";
/** `PROBE_FRAMES_PROFILE=1`: each trace also samples script, without the invalidation tracking that weighs on every DOM write. */
const PROFILE = process.env.PROBE_FRAMES_PROFILE === "1";
/** A frame's budget at 60 Hz, the page's own work. */
const FRAME_MS = 16;
/**
 * Frame callbacks a second while the pointer moves or the rail is dragged:
 * the frame's own and one for every observer's answer, no loop behind
 * them. Our own call, above the 60 frames a second and under the owner's
 * 285.
 */
const RAF_PER_S = 70;
/**
 * The most elements one style pass of the rail leg may restyle: the rail and
 * what it holds. Through the root's `--rail-w`, the release restyled the
 * page (1,794). Our own call.
 */
const RAIL_RESTYLED = 600;

const PROSE = [
  "The hub's merge checks passed on the rebased branch; the dashboard build is green and the probe kit's web specs ran clean on chromium and webkit.",
  "- Rebased onto main at 2377ab104\n- `bun run check` green in 4m12s\n- Two findings left for the orchestrator: the rail's grip under a finger, and the composer's twin on a narrow pane",
  "```ts\nconst sizes = frameObserver(read, { read: take });\nsizes.observe(node);\n```",
  "Read the transcript windows once more against the builder: every compaction joins where its logical parent was never written, and a deleted transcript pages as none.",
];

/** The session's calls so far. */
let calls = 0;

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 1, words: ["Long orchestrator"] };
  }
  calls += 1;
  const n = calls;
  if (n > TURNS) {
    return { everyMs: 1, words: ["Done."] };
  }
  const id = String(n).padStart(4, "0");
  const words = [0, 1, 2]
    .map((k) => PROSE[(n + k) % PROSE.length])
    .join("\n\n")
    .split(" ")
    .map((word) => `${word} `);
  return {
    everyMs: 1,
    words,
    tool: {
      name: "Bash",
      input: {
        command: `echo conversation-frames call ${id}`,
        description: `Print call ${id}`,
      },
    },
  };
};

interface TraceEvent {
  args?: {
    beginData?: { stackTrace?: unknown[] };
    data?: { name?: string; stackTrace?: unknown[] };
    elementCount?: number;
    name?: string;
  };
  dur?: number;
  name: string;
  ph: string;
  pid: number;
  tdur?: number;
  tid: number;
  ts: number;
}

interface LegNumbers {
  forcedLayoutMs: number;
  forcedLayouts: number;
  forcedStyleMs: number;
  forcedStyles: number;
  layoutMs: number;
  layouts: number;
  longestTaskCpuMs: number;
  longestTaskWallMs: number;
  /** The most elements one style pass restyled. */
  mostRestyled: number;
  rafPerS: number;
  seconds: number;
  styleMs: number;
  styles: number;
  tasksOverFrame: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The page's main thread over `act`, off a raw DevTools trace: the leg's numbers, and the trace kept in the out folder. */
async function traced(
  kit: Kit,
  page: Page,
  name: string,
  act: () => Promise<void>,
  rate = SLOWER
): Promise<LegNumbers> {
  const cdp = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  cdp.on("Tracing.dataCollected", ({ value }) => {
    events.push(...(value as unknown as TraceEvent[]));
  });
  const complete = new Promise<void>((resolve) => {
    cdp.once("Tracing.tracingComplete", () => resolve());
  });
  await cdp.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      includedCategories: [
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "disabled-by-default-devtools.timeline.stack",
        "blink.user_timing",
        ...(SELECTORS ? ["disabled-by-default-blink.debug"] : []),
        ...(PROFILE && !DIAGNOSE
          ? ["disabled-by-default-v8.cpu_profiler"]
          : []),
        ...(DIAGNOSE
          ? [
              "disabled-by-default-devtools.timeline.invalidationTracking",
              "disabled-by-default-v8.cpu_profiler",
            ]
          : []),
      ],
    },
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.evaluate((n) => performance.mark(`frames:${n}:start`), name);
  await act();
  await page.evaluate((n) => performance.mark(`frames:${n}:end`), name);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await cdp.send("Tracing.end");
  await complete;
  await cdp.detach();
  await writeFile(
    join(kit.out, `${name}.trace.json`),
    JSON.stringify({ traceEvents: events })
  );
  const mark = (which: string) =>
    events.find(
      (e) =>
        e.name === `frames:${name}:${which}` ||
        e.args?.data?.name === `frames:${name}:${which}`
    );
  const start = mark("start");
  const end = mark("end");
  if (!(start && end)) {
    throw new Error(`${name}: the trace holds no marks`);
  }
  const main = (e: TraceEvent) =>
    e.pid === start.pid &&
    e.tid === start.tid &&
    e.ph === "X" &&
    e.ts >= start.ts &&
    e.ts <= end.ts;
  const on = events.filter(main);
  const named = (n: string) => on.filter((e) => e.name === n);
  const ms = (list: TraceEvent[]) =>
    round(list.reduce((sum, e) => sum + (e.dur ?? 0), 0) / 1000);
  const forced = (e: TraceEvent) =>
    (e.args?.beginData?.stackTrace?.length ?? 0) > 0;
  const styles = named("UpdateLayoutTree");
  const layouts = named("Layout");
  // A task's own CPU less the garbage collections inside it: a major GC
  // that lands in a leg is the heap's turn, not the frame's work.
  const collections = on.filter(
    (e) => e.name === "MajorGC" || e.name === "MinorGC"
  );
  const tasks = named("RunTask").map((task) => {
    const taskEnd = task.ts + (task.dur ?? 0);
    const gc = collections
      .filter((e) => e.ts >= task.ts && e.ts < taskEnd)
      .reduce((sum, e) => sum + (e.dur ?? 0), 0);
    return { ...task, tdur: Math.max(0, (task.tdur ?? 0) - gc) };
  });
  const seconds = (end.ts - start.ts) / 1e6;
  return {
    seconds: round(seconds),
    rafPerS: round(named("FireAnimationFrame").length / seconds),
    longestTaskCpuMs: round(
      Math.max(0, ...tasks.map((t) => t.tdur ?? 0)) / 1000
    ),
    longestTaskWallMs: round(
      Math.max(0, ...tasks.map((t) => t.dur ?? 0)) / 1000
    ),
    mostRestyled: Math.max(0, ...styles.map((e) => e.args?.elementCount ?? 0)),
    tasksOverFrame: tasks.filter((t) => (t.tdur ?? 0) > FRAME_MS * 1000).length,
    styles: styles.length,
    styleMs: ms(styles),
    forcedStyles: styles.filter(forced).length,
    forcedStyleMs: ms(styles.filter(forced)),
    layouts: layouts.length,
    layoutMs: ms(layouts),
    forcedLayouts: layouts.filter(forced).length,
    forcedLayoutMs: ms(layouts.filter(forced)),
  };
}

const said = (n: LegNumbers) =>
  `${n.seconds}s: ${n.rafPerS} frame callbacks/s; longest task ${n.longestTaskCpuMs}ms CPU (${n.longestTaskWallMs}ms wall), ${n.tasksOverFrame} over ${FRAME_MS}ms; style ${n.styles} passes ${n.styleMs}ms (forced ${n.forcedStyles}, ${n.forcedStyleMs}ms); layout ${n.layouts} passes ${n.layoutMs}ms (forced ${n.forcedLayouts}, ${n.forcedLayoutMs}ms)`;

const spec: Spec = {
  group: "Speed",
  name: "conversation-frames",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    await fleet.up();
    const id = await fleet.spawn("claude", "Long orchestrator");
    await fleet.send(id, "conversation-frames: go.");
    // Every call answered before the page opens: the transcript as the
    // owner had it, at rest.
    await until(
      `${TURNS} calls answered`,
      () => calls,
      (n) => n > TURNS,
      30 * 60_000
    );
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await page.addInitScript((tab) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: [tab], active: tab, opened: null },
          focusedLeaf: "pone",
        })
      );
    }, id);
    await open(page, base, `${SCROLLER} [data-row]`, 120_000);
    for (let p = 0; p < PAGES; p += 1) {
      await asReader(page, (s) => {
        s.scrollTop = 0;
      });
      await page.waitForTimeout(1200);
    }
    await asReader(page, (s) => {
      s.scrollTop = s.scrollHeight;
    });
    await page.waitForTimeout(3000);
    const held = await page.evaluate(
      (sel) => ({
        rows: document.querySelectorAll(`${sel} [data-row]`).length,
        elements: document.getElementsByTagName("*").length,
      }),
      SCROLLER
    );
    kit.note(
      `the transcript mounts ${held.rows} rows, the page ${held.elements} elements`
    );

    const box = await page.locator(SCROLLER).first().boundingBox();
    if (!box) {
      throw new Error("no transcript on the page");
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(1000);

    const numbers: Record<string, LegNumbers> = {};
    const wheel = async () => {
      for (let i = 0; i < WHEELS; i += 1) {
        await page.mouse.move(cx + (i % 7) * 9, cy + (i % 5) * 11);
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(500);
    };
    numbers.wheel = await traced(kit, page, "wheel", wheel);
    await page.waitForTimeout(1500);
    // The same wheel on this machine's own CPU: the budget as the frame
    // holds it, the page's own work in 16ms.
    numbers.wheel1x = await traced(kit, page, "wheel1x", wheel, 1);
    await page.waitForTimeout(1500);
    numbers.pointer = await traced(kit, page, "pointer", async () => {
      for (let i = 0; i < SWEEPS; i += 1) {
        const t = i / SWEEPS;
        await page.mouse.move(
          box.x + 40 + t * (box.width - 80),
          box.y + 60 + ((i * 37) % Math.max(1, box.height - 120))
        );
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(500);
    });
    await page.waitForTimeout(1500);
    // The rail's grip: the one vertical slider in the rail.
    const grip = await page
      .locator('aside [role="slider"][aria-orientation="vertical"]')
      .first()
      .boundingBox();
    if (grip) {
      const gx = grip.x + grip.width / 2;
      const gy = grip.y + grip.height / 2;
      numbers.rail = await traced(kit, page, "rail", async () => {
        await page.mouse.move(gx, gy);
        await page.mouse.down();
        for (let i = 1; i <= 40; i += 1) {
          await page.mouse.move(gx + (RAIL_TRAVEL * i) / 40, gy);
          await page.waitForTimeout(16);
        }
        for (let i = 39; i >= 0; i -= 1) {
          await page.mouse.move(gx + (RAIL_TRAVEL * i) / 40, gy);
          await page.waitForTimeout(16);
        }
        await page.mouse.up();
        await page.waitForTimeout(500);
      });
    } else {
      kit.note("no rail grip on the page: the rail leg is not run");
    }
    for (const [leg, n] of Object.entries(numbers)) {
      kit.note(`${leg}: ${said(n)}`);
    }
    await writeFile(
      join(kit.out, "numbers.json"),
      `${JSON.stringify(numbers, null, 2)}\n`
    );
    // Each observer's answer comes in one frame callback, and none runs
    // where nothing it owns moves.
    for (const leg of ["pointer", "rail"]) {
      const n = numbers[leg];
      if (n) {
        kit.check(
          `${leg}: frame callbacks only for what moves (under ${RAF_PER_S} a second)`,
          n.rafPerS < RAF_PER_S,
          said(n)
        );
      }
    }
    // A drag measures on the layout the frame has already done: no script
    // lays the page out in it (the swipe's width, the columns, the nests,
    // the edge fades, the composer, the panes' widths).
    if (numbers.rail) {
      kit.check(
        "rail: no style or layout forced by a script while the rail is dragged",
        numbers.rail.forcedStyles + numbers.rail.forcedLayouts === 0,
        said(numbers.rail)
      );
    }
    // The rail's width is the rail's own: letting go restyles the rail,
    // not the page (through the root's --rail-w it was every element).
    if (numbers.rail) {
      kit.check(
        `rail: no style pass restyles more than ${RAIL_RESTYLED} elements`,
        numbers.rail.mostRestyled <= RAIL_RESTYLED,
        `the most in one pass: ${numbers.rail.mostRestyled}`
      );
    }
    // The wheel holds the frame on this machine's own CPU. At 4x it is
    // noted, not asserted: what a frame holds there is the rows virtua
    // mounts (their components, their markdown, their style and layout)
    // and its own scroll read.
    const wheel1x = numbers.wheel1x as LegNumbers;
    kit.check(
      `wheel at 1x: no task over ${FRAME_MS}ms of the page's own CPU`,
      wheel1x.tasksOverFrame === 0,
      said(wheel1x)
    );
    for (const [leg, n] of Object.entries(numbers)) {
      kit.note(
        `${leg}: ${n.tasksOverFrame} task(s) over ${FRAME_MS}ms of the page's own CPU at ${leg === "wheel1x" ? 1 : SLOWER}x, the longest ${n.longestTaskCpuMs}ms`
      );
    }
    // Find's marks are styled only while find holds some: a ::highlight()
    // rule over every element costs Chromium every element's highlight
    // style in every style pass (design.css).
    const washes = await page.evaluate((sel) => {
      const row = document.querySelector(`${sel} [data-row] p`);
      if (!row) {
        return null;
      }
      const wash = () =>
        getComputedStyle(row, "::highlight(find-place)").backgroundColor;
      const without = wash();
      document.documentElement.setAttribute("data-find-marks", "");
      const marked = wash();
      document.documentElement.removeAttribute("data-find-marks");
      return { without, marked };
    }, SCROLLER);
    kit.check(
      "find's highlight is styled only while the root holds marks",
      washes !== null && washes.without !== washes.marked,
      JSON.stringify(washes)
    );
  },
};
export default spec;
