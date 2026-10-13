/**
 * A long run's page landing on the traffic bench (/motion/traffic): an older
 * page of 250 tool calls (every one with a body to open) put in front of a
 * held transcript, as the store does (a new message list, the older first),
 * costs no main-thread task longer than `BOUND` reference tasks, and the
 * reader's row holds still to the pixel on every painted frame while it
 * lands. No page or window error.
 *
 * WHAT IS MEASURED IS THE PAGE'S OWN WORK, NOT THE MACHINE'S. The longest
 * task of each landing is read off a DevTools trace by its thread clock
 * (`tdur`, "the thread clock duration of complete events": the CPU the task
 * took), so the turns other processes take on the CPU are not in it. What
 * the CPU itself does under load (shared cores, its clock) is taken out by a
 * reference task measured on the same page in the same trace: a fixed DOM
 * build and layout, the engine work rows are made of, run before the
 * landings and after them. The bound is the landing's cost in references.
 * One landing varies by a tenth on its own, run to run, so three are made
 * and their median is the cost.
 *
 * The wall-clock bound this replaces (no long task, 50ms) was set when the
 * landing went from a 110ms task to under 50 (50ed05e9); on this machine at
 * a load average of 30 the same landing took 57–73ms of wall time with or
 * without any change to it.
 */
import type { Page } from "playwright-core";
import {
  type MainThread,
  SCROLLER,
  taskOf,
  tell,
  traceMain,
  watch,
  watched,
} from "../../frames";
import { open, type Spec } from "../../kit";

const CALLS = 250;
const LANDINGS = 3;
/** References measured, half before the landings and half after. */
const REFERENCES = 10;
/** The reference's rows: a task the size of a landing's (about 45ms here). */
const REFERENCE_ROWS = 4000;
/**
 * The longest task a landing may take, in reference tasks. Our own call,
 * between the bench as it stands (the median of three landings 1.10–1.40
 * over 13 runs, quiet and under a typecheck loop) and a landing 30ms slower
 * (1.81–1.88 over 3): their geometric middle, an eighth from each. A landing
 * that mounts every call again (the 110ms task 50ed05e9 took out) is far
 * past it.
 */
const BOUND = 1.6;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

/** The held conversation and the page put in front of it, and the reference task: run in the page. */
const furnish = ([calls, rows]: readonly [number, number]) => {
  let n = 0;
  let clock = Date.parse("2026-10-01T00:00:00Z");
  const message = (fields: Record<string, unknown>) => {
    n += 1;
    clock += 1000;
    return {
      id: `m-${n}`,
      instanceId: "traffic-bench",
      timestamp: new Date(clock).toISOString(),
      ...fields,
    };
  };
  const call = (label: string) =>
    message({
      type: "tool.use",
      toolCallId: `call-${label}`,
      content: "",
      metadata: {
        toolName: "Bash",
        toolInput: {
          command: `echo ${label}`,
          description: `Print ${label}`,
        },
        toolResult: label,
        toolStatus: "success",
      },
    });
  const older = Array.from({ length: calls }, (_, i) =>
    call(`older-${String(i).padStart(4, "0")}`)
  );
  const held = [
    ...Array.from({ length: 30 }, (_, i) =>
      call(`held-${String(i).padStart(4, "0")}`)
    ),
    message({
      type: "assistant",
      content: "The held conversation goes on under its run of calls.",
    }),
    ...Array.from({ length: 12 }, (_, i) =>
      message({
        type: "assistant",
        content: `held-turn-${i}: ${"A few lines of what the agent said, to give the view something to stand on. ".repeat(3)}`,
      })
    ),
  ];
  const w = window as unknown as {
    __traffic: {
      load: (blocks: unknown[]) => void;
      patch: (next: Record<string, unknown>) => void;
    };
    __hold: () => void;
    __land: () => void;
    __reference: (mark: string) => Promise<void>;
  };
  w.__hold = () => w.__traffic.load(held);
  w.__land = () => w.__traffic.patch({ messages: [...older, ...held] });
  // In a task of its own, marked inside it: rows of text built, laid out
  // off screen, and taken away.
  w.__reference = (mark) =>
    new Promise((done) => {
      setTimeout(() => {
        performance.mark(mark);
        const box = document.createElement("div");
        box.style.cssText = "position:absolute;left:-10000px;top:0;width:600px";
        for (let row = 0; row < rows; row += 1) {
          const line = document.createElement("div");
          line.textContent = `Reference row ${row}: a line of words for the engine to lay out.`;
          box.append(line);
        }
        document.body.append(box);
        box.getBoundingClientRect();
        box.remove();
        done();
      }, 50);
    });
};

/** The held transcript drawn, landed and settled, the reader near its top. */
const hold = async (page: Page) => {
  await page.evaluate(() =>
    (window as unknown as { __hold: () => void }).__hold()
  );
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __traffic: { landed: () => boolean } }
      ).__traffic.landed(),
    null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(1500);
  // The reader near the top of what is held, as a reader is when a page is
  // asked for: the run's first calls in view.
  await page.evaluate((sel) => {
    const scroller = document.querySelector<HTMLElement>(sel);
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }, SCROLLER);
  await page.waitForTimeout(1000);
};

/** The first held call fully in view, below the view's top. */
const anchorOf = (page: Page) =>
  page.evaluate((sel) => {
    const scroller = document.querySelector<HTMLElement>(sel);
    const top = scroller?.getBoundingClientRect().top ?? 0;
    for (const node of scroller?.querySelectorAll("*") ?? []) {
      const label =
        node.children.length === 0 &&
        // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
        node.textContent?.match(/held-\d{4}/)?.[0];
      if (label && node.getBoundingClientRect().top >= top + 40) {
        return label;
      }
    }
    return null;
  }, SCROLLER);

/** The longest task (by CPU) from a mark until the next one. */
const heaviestAfter = (main: MainThread, mark: string) => {
  const at = main.marks.find((one) => one.name === mark)?.at ?? 0;
  const next = main.marks
    .filter((one) => one.at > at)
    .reduce(
      (soonest, one) => Math.min(soonest, one.at),
      Number.POSITIVE_INFINITY
    );
  const tasks = main.tasks.filter((task) => task.end > at && task.at < next);
  return tasks.reduce((most, task) => (task.cpu > most.cpu ? task : most), {
    at,
    end: at,
    cpu: 0,
    wall: 0,
  });
};

const spec: Spec = {
  name: "traffic-longtask",
  run: async (kit) => {
    const page = await kit.page("desk", { init: [watch] });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await open(
      page,
      `${await kit.built()}/motion/traffic`,
      () => "__traffic" in window
    );
    await page.evaluate(furnish, [CALLS, REFERENCE_ROWS] as const);
    const references = async (from: number, to: number) => {
      for (let i = from; i < to; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each reference is a task of its own
        await page.evaluate(
          (mark) =>
            (
              window as unknown as {
                __reference: (name: string) => Promise<void>;
              }
            ).__reference(mark),
          `probe-kit:reference:${i}`
        );
      }
    };
    let anchor: string | null = null;
    let drawn: [number, number][] = [];
    let painted = 0;
    const main = await traceMain(page, async () => {
      await references(0, REFERENCES / 2);
      for (let landing = 0; landing < LANDINGS; landing += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one landing at a time, each on a transcript held afresh
        await page.evaluate(
          (mark) => performance.mark(mark),
          `probe-kit:hold:${landing}`
        );
        await hold(page);
        if (landing === 0) {
          anchor = await anchorOf(page);
          await tell(page, { anchor, ys: [] });
        }
        await page.evaluate((mark) => {
          performance.mark(mark);
          (window as unknown as { __land: () => void }).__land();
        }, `probe-kit:land:${landing}`);
        await page.waitForTimeout(3000);
        if (landing === 0) {
          const seen = await watched(page);
          drawn = seen.ys.filter(([, y]) => y !== null) as [number, number][];
          painted = seen.ys.length;
          await tell(page, { anchor: null });
        }
      }
      await page.evaluate(() => performance.mark("probe-kit:landed"));
      await references(REFERENCES / 2, REFERENCES);
    });

    const landings = Array.from({ length: LANDINGS }, (_, i) =>
      heaviestAfter(main, `probe-kit:land:${i}`)
    );
    const reference = median(
      Array.from(
        { length: REFERENCES },
        (_, i) => taskOf(main, `probe-kit:reference:${i}`)?.cpu ?? Number.NaN
      )
    );
    const cost = median(landings.map((task) => task.cpu));
    const ratio = cost / reference;
    kit.check(
      `${CALLS} calls put in front: the longest main-thread task under ${BOUND} reference tasks`,
      Number.isFinite(ratio) && ratio < BOUND,
      `${ratio.toFixed(2)} references: the longest task of each landing ${landings.map((task) => task.cpu.toFixed(1)).join(", ")}ms of CPU (wall ${landings.map((task) => task.wall.toFixed(1)).join(", ")}ms), median ${cost.toFixed(1)}; a reference ${reference.toFixed(1)}ms (median of ${REFERENCES})`
    );

    const first = drawn[0]?.[1] ?? 0;
    const widest = Math.max(0, ...drawn.map(([, y]) => Math.abs(y - first)));
    kit.check(
      `${anchor} holds still to the pixel while the page lands`,
      drawn.length > 1 && widest < 1,
      `${drawn.length} painted frames (${painted - drawn.length} without it), widest move ${widest.toFixed(1)}px`
    );
    const errors = [...(await watched(page)).errors, ...pageErrors];
    kit.check(
      "no page or window error",
      errors.length === 0,
      errors.slice(0, 3).join(" | ")
    );
  },
};
export default spec;
