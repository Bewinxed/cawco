/**
 * What the kit's edge fade (`.kit-edge-fade-block`, app.css: scroll-driven
 * animations of two registered lengths, `--fade-start` and `--fade-end`,
 * that a `mask-image` gradient reads) costs a long list as it scrolls: its
 * share of the frames over the 16.7ms budget, read off a DevTools trace.
 *
 *   bun scripts/probe-kit/run.ts web edge-fade-perf
 *
 * The list is the longest the fade masks: a project's Table view, `ROWS`
 * tasks, on a scratch fleet, at desk 1440 and phone 390. The fade belongs to
 * the box that scrolls the list: the pane on a desk; on a phone the page
 * (`.project-page`), where the pane grows to its rows, its foot's fade ending
 * at the views bar's top edge. Each leg scrolls that box from its top to its
 * foot and back as a person does
 * (`Input.synthesizeScrollGesture`, a wheel, at `SPEED`; `WIDTHS` says why
 * not a finger on the phone), under a trace, and reads:
 *
 *  - its frames: the page's `requestAnimationFrame` timestamps, one per frame
 *    the page drew, and every interval over the 16.7ms budget (`OVER_MS`);
 *  - what ran in each frame over budget: the main thread's trace events
 *    inside it by name, and its tasks' CPU;
 *  - what the fade asked of the main thread over the leg: its style
 *    recalculations, paint, and the main thread's CPU.
 *
 * Three legs, interleaved, `PAIRS` rounds per width, each round in another
 * order so a drift in the machine weighs on all alike:
 *  - `on`: the fade as it ships, each edge its own animation over the 6% of
 *    the scroll where it moves (`animation-range`);
 *  - `whole`: the form it replaced, one animation over the whole scroll
 *    (`WHOLE`, this spec's own style);
 *  - `off`: no fade (`OFF`, this spec's own style).
 * Neither style ships.
 *
 * Asserted at each width, on what the engine counts, not on the wall clock,
 * so a loaded host reads the same:
 *  - the box that scrolls the list wears the fade; on a phone its foot's
 *    fade ends at the views bar's top edge, within a pixel;
 *  - the look is the fade's, the same at every point of the scroll as the
 *    one animation drew it (`--fade-start`, `--fade-end` and the mask at 0,
 *    3, 50, 97 and 100% of the scroll timeline);
 *  - the shipped fade restyles the scroller on no more than `RESTYLE_SHARE`
 *    of a long scroll's frames (the whole-scroll form restyled it on every
 *    one: 4031 of 4050);
 *  - the main thread's CPU over the scroll, by its thread clock, is within
 *    `CPU_SHARE` of the legs without the fade, in the same run.
 * The frames over budget, and what ran in them, are noted, each leg with the
 * one-minute load (`/proc/loadavg`) through it: on a loaded host they are the
 * host's as much as the page's. Every number is written to `numbers.json`
 * in the spec's out folder.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { MACHINE } from "../../../scratch-fleet";
import { frames, type Kit, open, type Spec, settle } from "../../kit";

/** Tasks in the project: a list many screens long at either width. */
const ROWS = 400;
/** One frame at 60Hz, ms. */
const BUDGET_MS = 1000 / 60;
/**
 * A frame over budget: an interval between two drawn frames past one
 * vsync's, with a millisecond for the timer's jitter (Chromium coarsens
 * `requestAnimationFrame`'s clock). Our own call.
 */
const OVER_MS = BUDGET_MS + 1;
/** The scroll's speed, px/s: a steady read down a long list. Our own call. */
const SPEED = 1500;
/** Rounds of the three legs per width. */
const PAIRS = 3;
/** How often the load is read through a leg. */
const LOAD_EVERY_MS = 1000;
/**
 * The most of a long scroll's frames the shipped fade may restyle the
 * scroller on: its edges move over 12% of the scroll, the first and last
 * 6%, and only there (11.4% to 12.5% at the desk over five runs, 12.4% on
 * the phone's page, 639 of 5156 frames; the whole-scroll form over 99%). Our
 * own call, with room for the frames the gesture spends turning at the foot.
 */
const RESTYLE_SHARE = 0.2;
/**
 * How much more of the main thread's CPU a long scroll may take with the
 * fade than without it, the mask's own drawing included: at the desk
 * 1.32x to 1.55x over five runs on a host loaded 15 to 97, the whole-scroll
 * form 2.18x to 2.48x; at the phone 1.41x, the whole-scroll form 1.71x. Our
 * own call, past the noise; the restyle share is what tells the forms apart
 * on a phone.
 */
const CPU_SHARE = 1.75;
/** Where along the scroll the look is read, as fractions of it. */
const LOOK_AT = [0, 0.03, 0.5, 0.97, 1];
/** Where each edge's fade moves: the first and last 6% of the scroll. */
const EDGE_RUN = 0.06;
/**
 * Two lengths drawn alike: a hundredth of a pixel, past the float the
 * scroll's time conversion leaves (20.0093px against 20.0091px at 3%).
 */
const SAME_PX = 0.01;
/** A computed value with every number in it to a hundredth. */
const hundredths = (value: string) =>
  value.replace(/\d+\.\d+/g, (n) => Number.parseFloat(n).toFixed(2));
const PANE = ".pane";
/** The box that scrolls the list, as `markScroller` found it. */
const SCROLLER = "[data-probe-scroller]";
const ROW = ".ledger tr.row";
/** No fade: this spec's own style, never shipped. */
const OFF =
  ".kit-edge-fade, .kit-edge-fade-block { animation: none !important; mask-image: none !important; }";
/**
 * The form the fade replaced: one animation over the whole scroll, its
 * edges moving in the first and last 6%. This spec's own style, never shipped.
 */
const WHOLE = `
.kit-edge-fade-block { animation: probe-edge-fade-whole linear both !important; animation-timeline: scroll(self block) !important; animation-range: normal !important; }
.kit-edge-fade { animation: probe-edge-fade-whole linear both !important; animation-timeline: scroll(self inline) !important; animation-range: normal !important; }
@keyframes probe-edge-fade-whole {
  0% { --fade-start: 0px; --fade-end: var(--fade-len); }
  6%, 94% { --fade-start: var(--fade-len); --fade-end: var(--fade-len); }
  100% { --fade-start: var(--fade-len); --fade-end: 0px; }
}`;
const STYLES = { on: "", whole: WHOLE, off: OFF } as const;
type Fade = keyof typeof STYLES;
const ROUND: Fade[] = ["on", "whole", "off"];
/**
 * Each width and the gesture that scrolls it: a wheel on both. A
 * synthesized touch gesture never moved the phone's page here (0 of its
 * 21403px in nine legs), and a scroll the fade rides is the same whichever
 * input made it.
 */
const WIDTHS = [
  ["desk", "mouse"],
  ["phone", "mouse"],
] as const;

interface TraceEvent {
  args?: { elementCount?: number };
  cat: string;
  dur?: number;
  name: string;
  ph: string;
  pid: number;
  tdur?: number;
  tid: number;
  ts: number;
}

interface Leg {
  fade: Fade;
  /** Frames drawn over the leg. */
  frames: number;
  /** The load through it: at its start, and the most. */
  load: { at: number; most: number };
  /** The main thread's CPU over the leg, ms. */
  mainCpu: number;
  /** The longest interval between two frames, ms. */
  maxMs: number;
  /** Frames over budget, each with what ran in it. */
  over: { ms: number; ran: string }[];
  p95Ms: number;
  /** Paint on the main thread over the leg, CPU ms. */
  paintMs: number;
  /** Where the scroller stood after the gesture down and after it back up, against its run, px. */
  reached: { foot: number; run: number; top: number };
  /** Style recalculations over the leg: how many, their CPU ms, the elements they styled. */
  style: { elements: number; ms: number; n: number };
}

/** The one-minute load. */
const load1 = async (): Promise<number> =>
  Number.parseFloat((await readFile("/proc/loadavg", "utf8")).split(" ")[0]);

/** The page's drawn frames while `__fade.on`: each `requestAnimationFrame`'s timestamp. */
function frameClock(): void {
  const w = window as unknown as { __fade: { on: boolean; rafs: number[] } };
  w.__fade = { on: false, rafs: [] };
  const loop = (t: number) => {
    if (w.__fade.on) {
      w.__fade.rafs.push(t);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/**
 * Marks the list's scroller `data-probe-scroller`: the pane when it
 * scrolls, else the nearest box round it that does, else the document's.
 */
const markScroller = (page: Page) =>
  page.evaluate((pane) => {
    const from = document.querySelector<HTMLElement>(pane);
    let at: HTMLElement | null = from;
    while (at) {
      const { overflowY } = getComputedStyle(at);
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        at.scrollHeight > at.clientHeight + 1
      ) {
        break;
      }
      at = at.parentElement;
    }
    const scroller =
      at ?? (document.scrollingElement as HTMLElement | null) ?? document.body;
    scroller.setAttribute("data-probe-scroller", "");
    return {
      animations: scroller
        .getAnimations()
        .map((a) => (a as CSSAnimation).animationName)
        .join(", "),
      fades: scroller.classList.contains("kit-edge-fade-block"),
      scroller:
        scroller === from
          ? "the pane"
          : `.${[...scroller.classList].filter((c) => !c.startsWith("svelte-")).join(".")}`,
      run: scroller.scrollHeight - scroller.clientHeight,
      view: scroller.clientHeight,
    };
  }, PANE);

/**
 * On a phone, where the foot's fade ends against the views bar's top edge:
 * the scroller's foot less its `--fade-inset-end`, read off a box that
 * length tall.
 */
const footFade = (page: Page) =>
  page.evaluate((scrollerSel) => {
    const scroller = document.querySelector<HTMLElement>(scrollerSel);
    const bar = document.querySelector(".view-bar");
    if (!(scroller && bar)) {
      return null;
    }
    const ruler = document.createElement("div");
    ruler.style.cssText =
      "position:absolute;inline-size:0;block-size:var(--fade-inset-end, 0px)";
    scroller.append(ruler);
    const inset = ruler.getBoundingClientRect().height;
    ruler.remove();
    return {
      ends: scroller.getBoundingClientRect().bottom - inset,
      bar: bar.getBoundingClientRect().top,
    };
  }, SCROLLER);

/** The fade as `fade` names it, by this spec's own style. */
const setFade = (page: Page, fade: Fade): Promise<void> =>
  page.evaluate((css) => {
    document.getElementById("probe-fade")?.remove();
    if (css) {
      const style = document.createElement("style");
      style.id = "probe-fade";
      style.textContent = css;
      document.head.append(style);
    }
  }, STYLES[fade]);

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  );
};

const tenths = (n: number) => Math.round(n * 10) / 10;

/** The main thread's events while `act` runs, from a mark it makes there. */
async function traced(
  cdp: CDPSession,
  act: () => Promise<void>
): Promise<{ main: TraceEvent[]; mark: TraceEvent }> {
  const events: TraceEvent[] = [];
  const collect = ({ value }: { value: object[] }) => {
    events.push(...(value as unknown as TraceEvent[]));
  };
  cdp.on("Tracing.dataCollected", collect);
  const complete = new Promise<void>((resolve) => {
    cdp.once("Tracing.tracingComplete", () => resolve());
  });
  await cdp.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      includedCategories: [
        "blink.user_timing",
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
      ],
    },
  });
  await act();
  await cdp.send("Tracing.end");
  await complete;
  cdp.off("Tracing.dataCollected", collect);
  const mark = events.find(
    (e) => e.name === "edge-fade:leg" && e.cat.includes("blink.user_timing")
  );
  if (!mark) {
    throw new Error("the trace holds no edge-fade:leg mark");
  }
  return {
    mark,
    main: events.filter(
      (e) =>
        e.ph === "X" &&
        e.pid === mark.pid &&
        e.tid === mark.tid &&
        e.ts >= mark.ts
    ),
  };
}

/** What ran in one frame over budget: its tasks' CPU, and the main thread's events by name. */
function ranIn(main: TraceEvent[], from: number, to: number): string {
  const inside = main.filter((e) => e.ts >= from && e.ts < to);
  const byName = new Map<string, number>();
  for (const e of inside) {
    if (e.name !== "RunTask") {
      byName.set(e.name, (byName.get(e.name) ?? 0) + (e.dur ?? 0) / 1000);
    }
  }
  const cpu = inside
    .filter((e) => e.name === "RunTask")
    .reduce((sum, e) => sum + (e.tdur ?? 0) / 1000, 0);
  const named = [...byName]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, ms]) => `${name} ${ms.toFixed(1)}`)
    .join(", ");
  return `main-thread CPU ${cpu.toFixed(1)}ms: ${named || "nothing traced"}`;
}

/** One leg: the scroller scrolled to its foot and back under a trace. */
async function leg(
  page: Page,
  fade: Fade,
  source: "mouse" | "touch"
): Promise<Leg> {
  await setFade(page, fade);
  const box = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-probe-scroller]");
    if (!el) {
      return null;
    }
    el.scrollTop = 0;
    // The part of it in the viewport, where a wheel or a finger lands.
    const r = el.getBoundingClientRect();
    const top = Math.max(0, r.top);
    const bottom = Math.min(innerHeight, r.bottom);
    return {
      x: r.left + r.width / 2,
      y: (top + bottom) / 2,
      run: el.scrollHeight - el.clientHeight,
    };
  });
  if (!box) {
    throw new Error("no scroller marked on the page");
  }
  await settle(page, 400);
  const startLoad = await load1();
  const loads: number[] = [startLoad];
  const sampler = setInterval(() => {
    load1().then((l) => loads.push(l));
  }, LOAD_EVERY_MS);
  const cdp = await page.context().newCDPSession(page);
  let begun = 0;
  let rafs: number[] = [];
  const reached: number[] = [];
  const { main, mark } = await traced(cdp, async () => {
    begun = await page.evaluate(() => {
      const w = window as unknown as {
        __fade: { on: boolean; rafs: number[] };
      };
      w.__fade.rafs = [];
      w.__fade.on = true;
      performance.mark("edge-fade:leg");
      return performance.now();
    });
    for (const yDistance of [-box.run, box.run]) {
      await cdp.send("Input.synthesizeScrollGesture", {
        x: Math.round(box.x),
        y: Math.round(box.y),
        yDistance,
        speed: SPEED,
        gestureSourceType: source,
      });
      reached.push(
        await page.evaluate(
          (sel) => document.querySelector(sel)?.scrollTop ?? -1,
          SCROLLER
        )
      );
    }
    rafs = await page.evaluate(() => {
      const w = window as unknown as {
        __fade: { on: boolean; rafs: number[] };
      };
      w.__fade.on = false;
      return w.__fade.rafs;
    });
  });
  await cdp.detach();
  clearInterval(sampler);
  loads.push(await load1());
  // The page's clock to the trace's: the mark stands at `begun` in both.
  const toTrace = (ms: number) => mark.ts + (ms - begun) * 1000;
  const intervals = rafs
    .slice(1)
    .map((t, i) => [rafs[i] as number, t - (rafs[i] as number)] as const);
  const recalcs = main.filter((e) => e.name === "UpdateLayoutTree");
  // The thread clock where the trace has it: a loaded host's turns are not the page's.
  const cpuOf = (list: TraceEvent[]) =>
    list.reduce((sum, e) => sum + (e.tdur ?? e.dur ?? 0) / 1000, 0);
  return {
    fade,
    reached: { foot: reached[0] ?? -1, top: reached[1] ?? -1, run: box.run },
    frames: rafs.length,
    load: { at: startLoad, most: Math.max(...loads) },
    mainCpu: Math.round(
      main
        .filter((e) => e.name === "RunTask")
        .reduce((sum, e) => sum + (e.tdur ?? 0) / 1000, 0)
    ),
    maxMs: tenths(Math.max(0, ...intervals.map(([, t]) => t))),
    over: intervals
      .filter(([, t]) => t > OVER_MS)
      .map(([at, t]) => ({
        ms: tenths(t),
        ran: ranIn(main, toTrace(at), toTrace(at + t)),
      })),
    p95Ms: tenths(
      percentile(
        intervals.map(([, t]) => t),
        0.95
      )
    ),
    paintMs: tenths(cpuOf(main.filter((e) => e.name === "Paint"))),
    style: {
      n: recalcs.length,
      ms: tenths(cpuOf(recalcs)),
      elements: recalcs.reduce((s, e) => s + (e.args?.elementCount ?? 0), 0),
    },
  };
}

/**
 * The fade's look along the scroller's scroll, as `fade` draws it: its two
 * lengths and the mask they make, at each of `LOOK_AT`.
 */
const lookOf = (page: Page, fade: Fade) =>
  (async () => {
    await setFade(page, fade);
    const read: { at: number; end: string; mask: string; start: string }[] = [];
    for (const at of LOOK_AT) {
      await page.evaluate(
        ([pane, f]) => {
          const el = document.querySelector<HTMLElement>(pane);
          if (el) {
            el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
          }
        },
        [SCROLLER, at] as const
      );
      await frames(page);
      read.push({
        at,
        ...(await page.evaluate((scroller) => {
          const style = getComputedStyle(
            document.querySelector(scroller) as Element
          );
          return {
            start: style.getPropertyValue("--fade-start"),
            end: style.getPropertyValue("--fade-end"),
            mask: style.maskImage,
          };
        }, SCROLLER)),
      });
    }
    return read;
  })();

const describe = (l: Leg) =>
  `${l.frames} frames, ${l.over.length} over ${BUDGET_MS.toFixed(1)}ms (p95 ${l.p95Ms}ms, longest ${l.maxMs}ms); main thread ${l.mainCpu}ms CPU, ${l.style.n} style recalcs ${l.style.ms}ms CPU (${l.style.elements} elements), paint ${l.paintMs}ms CPU; load ${l.load.at} at its start, ${l.load.most} at most`;

/** The fade's look at `view`: the shipped fade's equals the whole-scroll form's, and the lengths its keyframes give. */
async function checkLook(kit: Kit, page: Page, view: string) {
  const len = Number.parseFloat(
    await page.evaluate(
      (scroller) =>
        getComputedStyle(document.querySelector(scroller) as Element)
          .getPropertyValue("--fade-len")
          .trim(),
      SCROLLER
    )
  );
  const shipped = await lookOf(page, "on");
  const whole = await lookOf(page, "whole");
  const ramp = (f: number) => len * Math.min(1, f / EDGE_RUN);
  const faults = shipped.flatMap((one, i) => {
    const was = whole[i];
    const start = Number.parseFloat(one.start);
    const end = Number.parseFloat(one.end);
    const wrong: string[] = [];
    if (
      !was ||
      Math.abs(start - Number.parseFloat(was.start)) > SAME_PX ||
      Math.abs(end - Number.parseFloat(was.end)) > SAME_PX ||
      hundredths(one.mask) !== hundredths(was.mask)
    ) {
      wrong.push(
        `at ${one.at * 100}%: ${JSON.stringify(one)} against ${JSON.stringify(was)}`
      );
    }
    if (
      Math.abs(start - ramp(one.at)) > 0.5 ||
      Math.abs(end - ramp(1 - one.at)) > 0.5
    ) {
      wrong.push(
        `at ${one.at * 100}%: ${start}px and ${end}px, not ${ramp(one.at)}px and ${ramp(1 - one.at)}px`
      );
    }
    return wrong;
  });
  kit.check(
    `${view}: the fade's look is the whole-scroll form's at ${LOOK_AT.map((f) => `${f * 100}%`).join(", ")} of the scroll`,
    faults.length === 0,
    faults.join("; ") ||
      shipped
        .map(
          (one) =>
            `${one.at * 100}%: --fade-start ${one.start}, --fade-end ${one.end}, mask ${one.mask}`
        )
        .join(" | ")
  );
}

const spec: Spec = {
  name: "edge-fade-perf",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 20, words: ["Ready."] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const { id: project } = await fleet.api<{ id: string }>("/api/projects", {
      name: "long-list",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    for (let i = 0; i < ROWS; i += 1) {
      await fleet.api(`/api/projects/${project}/tasks`, {
        title: `Task ${String(i).padStart(3, "0")}: tidy the release notes for the next build`,
        labels: [["web", "copy", "data"][i % 3] as string],
        fields: { priority: ["high", "medium", "low"][i % 3] as string },
      });
    }
    const base = await fleet.dashboard();
    const url = `${base}/project/${project}?view=table`;
    const numbers: Record<string, Leg[]> = {};
    for (const [view, source] of WIDTHS) {
      const page = await kit.page(view, { init: [frameClock] });
      page.setDefaultTimeout(120_000);
      await open(page, url, `.ledger tr:nth-child(${ROWS} of .row)`);
      await settle(page);
      const where = await markScroller(page);
      const masked = await page.evaluate(
        () => document.querySelectorAll(".kit-edge-fade-block").length
      );
      kit.check(
        `${view}: the box that scrolls the Table view's long list wears the edge fade, and no other box round it`,
        where.run > where.view * 5 &&
          where.fades &&
          where.animations.includes("kit-edge-fade") &&
          masked === 1,
        `${await page.locator(ROW).count()} rows; ${where.scroller} scrolls ${where.run}px past its ${where.view}px, its animations ${where.animations || "none"}; ${masked} box(es) wear the fade`
      );
      if (view === "phone") {
        const foot = await footFade(page);
        kit.check(
          `${view}: the foot's fade ends at the views bar's top edge`,
          foot !== null && Math.abs(foot.ends - foot.bar) <= 1,
          JSON.stringify(foot)
        );
      }
      await checkLook(kit, page, view);
      const legs: Leg[] = [];
      for (let round = 0; round < PAIRS; round += 1) {
        // Each round starts one later, so no leg always runs first.
        const order = ROUND.map(
          (_, i) => ROUND[(i + round) % ROUND.length] as Fade
        );
        for (const one of order) {
          const label = `${view}, fade ${one}, round ${round + 1}`;
          const ran = await leg(page, one, source);
          legs.push(ran);
          kit.note(`${label}: ${describe(ran)}`);
          for (const frame of ran.over.slice(0, 3)) {
            kit.note(`${label}: a ${frame.ms}ms frame, ${frame.ran}`);
          }
        }
      }
      numbers[view] = legs;
      const sum = (one: Fade, of: (l: Leg) => number) =>
        legs.filter((l) => l.fade === one).reduce((s, l) => s + of(l), 0);
      const intervals = (one: Fade) => sum(one, (l) => l.frames - 1);
      kit.note(
        `${view}, all rounds: ${ROUND.map(
          (one) =>
            `fade ${one} ${sum(one, (l) => l.over.length)} of ${intervals(one)} frames over budget (${((sum(one, (l) => l.over.length) / Math.max(1, intervals(one))) * 100).toFixed(1)}%), ${sum(one, (l) => l.style.n)} style recalcs ${sum(one, (l) => l.style.ms).toFixed(0)}ms, paint ${sum(one, (l) => l.paintMs).toFixed(0)}ms, main-thread CPU ${sum(one, (l) => l.mainCpu)}ms`
        ).join("; ")}`
      );
      const short = legs.filter(
        (l) => l.reached.foot < l.reached.run - 2 || l.reached.top > 2
      );
      kit.check(
        `${view}: every leg's gesture scrolls the scroller to its foot and back to its top`,
        short.length === 0,
        legs
          .map(
            (l) =>
              `${l.fade} ${l.reached.foot}/${l.reached.run} → ${l.reached.top}`
          )
          .join("; ")
      );
      const share = sum("on", (l) => l.style.n) / Math.max(1, intervals("on"));
      kit.check(
        `${view}: the fade restyles the scroller on no more than ${RESTYLE_SHARE * 100}% of a long scroll's frames`,
        share <= RESTYLE_SHARE,
        `${sum("on", (l) => l.style.n)} style recalcs over ${intervals("on")} frames (${(share * 100).toFixed(1)}%); the whole-scroll form ${sum("whole", (l) => l.style.n)} over ${intervals("whole")}; none ${sum("off", (l) => l.style.n)}`
      );
      const cpu = (one: Fade) => sum(one, (l) => l.mainCpu);
      const ratio = cpu("on") / Math.max(1, cpu("off"));
      kit.check(
        `${view}: a long scroll's main-thread CPU with the fade within ${CPU_SHARE}x of the same run's without it`,
        ratio <= CPU_SHARE,
        `${ratio.toFixed(2)}x: ${cpu("on")}ms with it, ${cpu("off")}ms without; the whole-scroll form ${cpu("whole")}ms (${(cpu("whole") / Math.max(1, cpu("off"))).toFixed(2)}x)`
      );
      await page.close();
    }
    await writeFile(
      join(kit.out, "numbers.json"),
      `${JSON.stringify(numbers, null, 2)}\n`
    );
  },
};
export default spec;
