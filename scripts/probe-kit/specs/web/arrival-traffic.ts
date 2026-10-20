/**
 * The transcript's arrival rule on the traffic bench (/motion/traffic), on
 * the desk in Chromium: what the page actually animated, each scenario's run
 * set against the rule (transcript/arrivals.svelte.ts) as Row.svelte and
 * LiveRow.svelte play it.
 *
 * - A row arrives once: its place opens (a `block-size` tween on the row)
 *   and what stands in it fades up. A call in a run of tool calls is a row
 *   of its own and arrives the same way, each once.
 * - History is no arrival: a conversation opening on its rows is silent.
 * - Reasoning giving way to the answer is no second arrival: the live row
 *   keeps its place, crossfades its faces and tweens its own height once.
 *
 * Read from every `Element.animate` the page makes (an init script wraps it
 * before the page's own scripts run): which element, whether it is a row, a
 * call in a run or the live row, and what it animates. The defect this was
 * built for, a run of tool calls animating only its first call, was invisible
 * in the source and in a screenshot.
 *
 * Each scenario starts from a transcript that has landed and gone quiet
 * (`reset` remounts it), since arrivals wait on exactly that: one that skipped
 * it would measure the silence, not the motion.
 */
import type { Page } from "playwright-core";
import { type Kit, open, type Spec } from "../../kit";
// `window.__traffic`, read inside each callback: one runs alone in the page.
import "../../traffic-bench";

/** One `Element.animate` the page made while a scenario was recorded. */
interface Played {
  blockSize: boolean;
  /** Each element's own number, so one played twice is seen. */
  element: number;
  inTools: boolean;
  opacity: boolean;
  /** The element's `data-slot`: `row` for a row's place, `live` for the live row. */
  slot: string | null;
}

declare global {
  interface Window {
    __played: Played[];
    __recording: boolean;
  }
}

/** Wraps `Element.animate` before the page's scripts run, recording while `__recording`. */
function recordAnimate(): void {
  const { animate } = Element.prototype;
  const numbers = new WeakMap<Element, number>();
  let counted = 0;
  window.__played = [];
  window.__recording = false;
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions
  ) {
    if (window.__recording) {
      const frames = Array.isArray(keyframes) ? keyframes : [];
      if (!numbers.has(this)) {
        counted += 1;
        numbers.set(this, counted);
      }
      window.__played.push({
        element: numbers.get(this) as number,
        slot: this.getAttribute("data-slot"),
        inTools: !!this.closest('[data-slot="tools"]'),
        blockSize: frames.some((frame) => "blockSize" in frame),
        opacity: frames.some((frame) => "opacity" in frame),
      });
    }
    return animate.call(this, keyframes, options);
  };
}

/** What a scenario's recording is checked against. */
interface Analysis {
  /** Fades: something standing in a row coming up. */
  fades: number;
  /** The live row's own height tweens. */
  liveTweens: number;
  /** Row places that opened: one per element. */
  opened: Played[];
  /** Every animation recorded. */
  total: number;
  /** Row places opened more than once. */
  twice: number;
}

interface Scenario {
  drive: (page: Page) => Promise<void>;
  expect: (a: Analysis) => [string, number | boolean, number | boolean][];
  /** The rows the transcript opens on; 12 unless named. */
  seed?: number;
  what: string;
}

/** THE ARRIVAL RULE, scenario by scenario, as a recording can check it. */
const SCENARIOS: Record<string, Scenario> = {
  /* A run of tool calls arriving one at a time into one run: every call
     opens its line, the case that used to animate once. */
  run: {
    what: "6 tool calls, 900ms apart, into one run",
    drive: (page) => page.evaluate(() => window.__traffic.run(6, 900)),
    expect: (a) => [
      [
        "every call opens its line",
        a.opened.filter((one) => one.inTools).length,
        6,
      ],
      ["no place opens twice", a.twice, 0],
    ],
  },
  /* The same run faster than the burst's cascade: still one opening a call. */
  burst: {
    what: "6 tool calls, 120ms apart",
    drive: (page) => page.evaluate(() => window.__traffic.run(6, 120)),
    expect: (a) => [
      [
        "every call opens its line",
        a.opened.filter((one) => one.inTools).length,
        6,
      ],
      ["no place opens twice", a.twice, 0],
    ],
  },
  /* Prose reserves its space like any other row. */
  prose: {
    what: "4 assistant paragraphs arriving",
    drive: async (page) => {
      for (let i = 0; i < 4; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each paragraph lands before the next, as a turn's do
        await page.evaluate(
          (n) =>
            window.__traffic.assistant(
              `Turn ${n}. A paragraph of prose long enough to wrap onto more than one line, so the space it reserves is worth watching.`
            ),
          i
        );
        await page.waitForTimeout(800);
      }
    },
    expect: (a) => [
      ["one place opens per paragraph", a.opened.length, 4],
      ["no place opens twice", a.twice, 0],
      ["the words fade up into them", a.fades > 0, true],
    ],
  },
  /* Reasoning, then the answer: one live row the whole time. As two rows,
     the reasoning went at full height and the answer opened below the hole
     (an 18px lurch on a viewport pinned to the bottom). */
  swap: {
    what: "reasoning giving way to the answer in one row",
    drive: async (page) => {
      await page.evaluate(() =>
        window.__traffic.thinking(
          "Working out how the rail behaves when a run of calls arrives together."
        )
      );
      await page.waitForTimeout(1100);
      await page.evaluate(() => {
        window.__traffic.thinking(null);
        window.__traffic.streaming(
          "Here is the answer that takes the reasoning block's place in the same container."
        );
      });
      await page.waitForTimeout(1400);
    },
    expect: (a) => [
      ["the live row's place opens once, not twice", a.opened.length, 1],
      ["the same row tweens its height between phases", a.liveTweens, 1],
    ],
  },
  /* History landing is no arrival: opening a conversation is silent, seeded
     through `reset` so the rows are there as the transcript mounts. */
  history: {
    what: "a transcript opening on 14 rows of history",
    seed: 0,
    drive: async (page) => {
      await page.evaluate(() => window.__traffic.reset(14));
      await page.waitForTimeout(1800);
    },
    expect: (a) => [["opening a conversation is silent", a.total, 0]],
  },
};

const spec: Spec = {
  name: "arrival-traffic",
  run: async (kit: Kit) => {
    const page = await kit.page("desk", { init: [recordAnimate] });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(
      page,
      `${await kit.bench()}/motion/traffic`,
      () => "__traffic" in window
    );
    for (const [key, scenario] of Object.entries(SCENARIOS)) {
      // biome-ignore lint/performance/noAwaitInLoops: each scenario remounts the transcript and is recorded alone
      await page.evaluate(
        (count) => window.__traffic.reset(count),
        scenario.seed ?? 12
      );
      await page.waitForTimeout(1600);
      await page.evaluate(() => {
        window.__played = [];
        window.__recording = true;
      });
      await scenario.drive(page);
      await page.waitForTimeout(1600);
      const played = await page.evaluate(() => {
        window.__recording = false;
        return window.__played;
      });
      const opens = played.filter((one) => one.slot === "row" && one.blockSize);
      const perElement = new Map<number, number>();
      for (const one of opens) {
        perElement.set(one.element, (perElement.get(one.element) ?? 0) + 1);
      }
      const analysis: Analysis = {
        opened: [...new Map(opens.map((one) => [one.element, one])).values()],
        twice: [...perElement.values()].filter((n) => n > 1).length,
        total: played.length,
        liveTweens: played.filter((one) => one.slot === "live" && one.blockSize)
          .length,
        fades: played.filter((one) => one.opacity && !one.blockSize).length,
      };
      const tally = played.map(
        (one) =>
          `${one.slot ?? "-"}#${one.element}${one.blockSize ? " h" : ""}${one.opacity ? " o" : ""}${one.inTools ? " tools" : ""}`
      );
      for (const [label, got, want] of scenario.expect(analysis)) {
        kit.check(
          `${key} (${scenario.what}): ${label}`,
          got === want,
          `${got}, expected ${want}; played ${tally.join(", ") || "none"}`
        );
      }
    }
    kit.check("no page error", errors.length === 0, errors.join(" | "));
  },
};
export default spec;
