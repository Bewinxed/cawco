/**
 * The plan view's three ways on the component canvas: each way's states
 * file (apps/dashboard/src/lib/cawco/plan/proposal/{OneList,Lanes,
 * CrewFirst}.stories.ts) drawn live by the stage host, started on the
 * dashboard as the agent starts a SvelteKit project's stage (svelte, kit,
 * vite), minus the workspace boundary. These are what the decision page's
 * cards embed (plan-decision, a host check). Read from the engine: the
 * canvas's own report, the frames' DOM, `getAnimations()`.
 *
 *   bun scripts/probe-kit/run.ts plan-ways
 *
 * At 1440 and 390, light and dark, for each way:
 * - every frame is drawn (a phone stands one at a time: that one), none
 *   failed or unnamed, with the three dials (tile size, line weight, sweep
 *   speed) on the story args;
 * - each story draws its way's plan, every row leading with an 18px tile;
 * - the edited, commented and answered stories draw the step's
 *   acknowledgement, one short line: a reworded to-do seen by this
 *   session, a comment sent to Fable (which carries the step), the same
 *   comment answered on the step's thread;
 * - no line runs through text; every upright line stands on its lane's
 *   rail; the two lines into the booking step share no stretch; the
 *   opened step's title stands clear of the scroller's top fade; Crew
 *   first's tiles are 18px, none over another; the after chip's names are
 *   links that light their steps;
 * - while the live story's delegate works, its progress sweep runs only on
 *   a working delegate's line;
 * - in the at-rest story, a step opens to its description, and a comment
 *   typed on its thread is sent to Fable, seen, then answered, live;
 * - nothing is written to the console as an error.
 *
 * Captures of each canvas go to `$TMPDIR/caps/` and the clone's `caps/`:
 * each frame whole (label, card, the card's own end), every timed run in it
 * held at rest by the Animation domain.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one canvas at a time
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import type {
  CanvasSpec,
  RenderReport,
} from "../../../packages/core/src/stage";
import { until } from "../../scratch-fleet";
import { Clock } from "../anim";
import { type Kit, ROOT, type Spec } from "../kit";
import { DIALS } from "./plan-decision";

const DASHBOARD = join(ROOT, "apps", "dashboard");
const STORIES = "src/lib/cawco/plan/proposal";
const CAPS = [join(process.env.TMPDIR ?? "/tmp", "caps"), join(ROOT, "caps")];

/** A figure in a head: the to-dos head carries none. */
const DIGIT = /\d/;

const WAYS = [
  { file: "OneList", label: "One list", variation: "a" },
  { file: "Lanes", label: "Lanes", variation: "b" },
  { file: "CrewFirst", label: "Crew first", variation: "c" },
] as const;

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** The dashboard's stage, as the agent starts one for a SvelteKit project. */
async function stageOn(): Promise<{
  base: string;
  ms: number;
  stop: () => void;
}> {
  const started = performance.now();
  const host = await buildStageHost();
  mkdirSync(join(DASHBOARD, ".cawco/stage"), { recursive: true });
  writeFileSync(join(DASHBOARD, ".cawco/stage/host.mjs"), host);
  const port = await freePort();
  const child: ChildProcess = spawn(
    "bun",
    [join(DASHBOARD, ".cawco/stage/host.mjs")],
    {
      cwd: DASHBOARD,
      env: {
        ...process.env,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(port),
        CAWCO_STAGE_FRAMEWORK: "svelte",
        CAWCO_STAGE_KIT: "1",
        CAWCO_STAGE_TOOLCHAIN: "vite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let words = "";
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  child.stdout?.on("data", hear);
  child.stderr?.on("data", hear);
  await until(
    "the dashboard's stage ready",
    () => words,
    (text) => text.includes('"cawco":"ready"'),
    120_000
  ).catch(() => {
    throw new Error(`the stage never said ready: ${words.slice(-1500)}`);
  });
  return {
    base: `http://127.0.0.1:${port}`,
    ms: Math.round(performance.now() - started),
    stop: () => child.kill("SIGTERM"),
  };
}

const canvasUrl = (base: string, file: string, canvas: CanvasSpec) =>
  `${base}/@cawco/canvas?file=${encodeURIComponent(file)}&spec=${encodeURIComponent(JSON.stringify(canvas))}`;

/** What a panel's overlay gives a page (`window.cawco`). */
const BRIDGE = () => {
  (window as unknown as { cawco: unknown }).cawco = {
    set: () => Promise.resolve(),
    on: () => () => undefined,
  };
};

async function reportOn(page: Page): Promise<RenderReport> {
  await page.waitForFunction(
    () => {
      const state = (
        window as unknown as { __cawcoCanvas?: { report: RenderReport | null } }
      ).__cawcoCanvas;
      return !!state?.report && state.report.sections.length > 0;
    },
    null,
    { timeout: 90_000 }
  );
  await page.waitForTimeout(2500);
  return page.evaluate(
    () =>
      (window as unknown as { __cawcoCanvas: { report: RenderReport } })
        .__cawcoCanvas.report
  );
}

/** One story's rest frame, as its body draws it. */
const FRAME = (story: string) =>
  `.cawco-frame[data-cawco-story="${story}"][data-cawco-interaction="rest"] .cawco-frame-body`;

/** What each story's rest frame draws: its variation, its rows' leads, its acknowledgements. */
const readStories = (page: Page) =>
  page.evaluate(() => {
    const out: Record<
      string,
      { acks: string[]; leads: string[]; rows: number; variation: string }
    > = {};
    for (const body of document.querySelectorAll(
      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-body'
    )) {
      const story =
        body.closest(".cawco-frame")?.getAttribute("data-cawco-story") ?? "";
      if (out[story]) {
        continue;
      }
      const rows = [...body.querySelectorAll('[data-slot="plan-row"]')].filter(
        (row) =>
          !row.closest('[data-slot="fold-body"]:not([data-open])') &&
          row.checkVisibility({ visibilityProperty: true })
      );
      out[story] = {
        variation:
          body
            .querySelector('[data-slot="plan"]')
            ?.getAttribute("data-variation") ?? "",
        rows: rows.length,
        leads: rows.flatMap((row) => {
          const mark = row.querySelector(
            ':scope > .pv-lead :is([data-slot="step-tile"], [data-slot="tree-mark"])'
          );
          const box = mark?.getBoundingClientRect();
          const scale =
            (body as HTMLElement).getBoundingClientRect().width /
            ((body as HTMLElement).offsetWidth || 1);
          const side = box ? box.width / scale : 0;
          return Math.abs(side - 18) <= 0.6
            ? []
            : [`${row.textContent?.trim().slice(0, 30)}: ${side.toFixed(1)}`];
        }),
        acks: [...body.querySelectorAll('[data-slot="ack"]')].map(
          (ack) => ack.textContent?.replace(/\s+/g, " ").trim() ?? ""
        ),
      };
    }
    return out;
  });

/** The sweeps running in the live story: on which delegates' lines. */
const readSweeps = (page: Page) =>
  page.evaluate((selector) => {
    const live = document.querySelector(selector);
    const runs = document.getAnimations().filter((run) => {
      const target = (run.effect as KeyframeEffect | null)?.target;
      return (
        run instanceof CSSAnimation &&
        run.animationName === "kit-skeleton-sweep" &&
        target instanceof Element &&
        target.matches(".pv-sweep") &&
        !!live?.contains(target)
      );
    });
    return {
      running: runs.length,
      off: runs
        .map((run) =>
          ((run.effect as KeyframeEffect).target as Element)
            .closest('[data-slot="progress-line"]')
            ?.getAttribute("data-status")
        )
        .filter((status) => status !== "live"),
    };
  }, FRAME("Live"));

/**
 * What each story's rest frame lays out, in layout pixels (offsetWidth:
 * the canvas's zoom aside): the plan card's width, whether the head's
 * words overlap, the opened date picker's description, the dependency
 * lines' drawn lengths, and the sweeps running in it.
 */
const readGeometry = (page: Page) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one read of every frame, run in the page's own scope, so it cannot call helpers of the spec's
  page.evaluate(() => {
    const out: Record<
      string,
      {
        shown: boolean;
        card: { kind: string; width: number };
        description: { height: number; width: number };
        overlaps: string[];
        sweeps: number;
        wires: number[];
      }
    > = {};
    const boxes = (el: Element | null | undefined) =>
      el ? el.getBoundingClientRect() : null;
    for (const body of document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-body'
    )) {
      const story =
        body.closest(".cawco-frame")?.getAttribute("data-cawco-story") ?? "";
      if (out[story]) {
        continue;
      }
      const card = body.querySelector<HTMLElement>(
        '[data-slot="side-card"], [data-slot="phone-screen"]'
      );
      // The head's words: "Plan", its figure, the task's title and stage.
      const words = [
        ...body.querySelectorAll(
          '[data-slot="side-card"] :is(.title, .figure, .task-title, .stage), [data-slot="phone-screen"] :is(.sheet-title > span, .figure, .task-title, .stage)'
        ),
      ];
      const overlaps: string[] = [];
      for (const [i, a] of words.entries()) {
        for (const b of words.slice(i + 1)) {
          if (a.contains(b) || b.contains(a)) {
            continue;
          }
          const x = boxes(a);
          const y = boxes(b);
          if (
            x &&
            y &&
            x.width > 0 &&
            y.width > 0 &&
            x.left < y.right - 0.5 &&
            y.left < x.right - 0.5 &&
            x.top < y.bottom - 0.5 &&
            y.top < x.bottom - 0.5
          ) {
            overlaps.push(
              `"${a.textContent?.trim()}" over "${b.textContent?.trim()}"`
            );
          }
        }
      }
      const description = body.querySelector<HTMLElement>(
        '[data-row="a2"] [data-slot="fold-body"][data-open] [data-slot="description"]'
      );
      const frame = body.closest<HTMLElement>(".cawco-frame");
      out[story] = {
        // A phone's canvas stands one frame at a time; the rest are not drawn.
        shown: !!frame && getComputedStyle(frame).display !== "none",
        card: {
          kind: card?.getAttribute("data-slot") ?? "none",
          width: card?.offsetWidth ?? 0,
        },
        description: {
          height: description?.offsetHeight ?? 0,
          width: description?.offsetWidth ?? 0,
        },
        overlaps,
        sweeps: document.getAnimations().filter((run) => {
          const target = (run.effect as KeyframeEffect | null)?.target;
          return (
            run instanceof CSSAnimation &&
            run.animationName === "kit-skeleton-sweep" &&
            target instanceof Element &&
            body.contains(target)
          );
        }).length,
        wires: [
          ...body.querySelectorAll<SVGPathElement>(
            'svg[data-slot="connectors"] path.wire'
          ),
        ].map((path) => Math.round(path.getTotalLength())),
      };
    }
    return out;
  });

/** The canvas pans its world to the frame (`cawco:canvas-go` to its key), then the frame's box with its label, which stands above it. */
async function goTo(page: Page, selector: string) {
  await page.evaluate((one) => {
    const key = document.querySelector(one)?.getAttribute("data-cawco-key");
    if (key) {
      dispatchEvent(new CustomEvent("cawco:canvas-go", { detail: { key } }));
    }
  }, selector);
  await page.waitForTimeout(900);
  return page.evaluate((one) => {
    const el = document.querySelector(one);
    const label = el?.querySelector(".cawco-frame-label");
    const a = el?.getBoundingClientRect();
    const b = label?.getBoundingClientRect() ?? a;
    if (!(a && b)) {
      return null;
    }
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    return {
      x: left - 4,
      y: top - 4,
      width: Math.max(a.right, b.right) - left + 8,
      height: Math.max(a.bottom, b.bottom) - top + 8,
    };
  }, selector);
}

/** Why a frame is not shown: each box up its chain that hides it. */
const hiddenWhy = (page: Page, selector: string) =>
  page.evaluate((one) => {
    const el = document.querySelector<HTMLElement>(one);
    const chain: string[] = [];
    for (let at: HTMLElement | null = el; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (
        style.display === "none" ||
        style.visibility !== "visible" ||
        at.getBoundingClientRect().width === 0
      ) {
        chain.push(
          `${at.className.toString().split(" ")[0]} display ${style.display} visibility ${style.visibility} ${Math.round(at.getBoundingClientRect().width)}×${Math.round(at.getBoundingClientRect().height)}`
        );
      }
    }
    return chain.join(" < ");
  }, selector);

/**
 * How the frame stands still for its picture: every timed run in it,
 * restarted and held at its first frame by the Animation domain, and what
 * the rest pose draws (a pulse's band, the working glyph's breath).
 */
const stillOf = (page: Page, selector: string) =>
  page.evaluate((one) => {
    const frame = document.querySelector(one);
    const runs = document.getAnimations().filter((run) => {
      const target = (run.effect as KeyframeEffect | null)?.target;
      return (
        run.timeline === document.timeline &&
        target instanceof Element &&
        !!frame?.contains(target)
      );
    });
    return {
      runs: runs.length,
      moving: runs.filter((run) => run.playState !== "paused").length,
      pulses: [...(frame?.querySelectorAll(".pv-pulse") ?? [])].map((el) =>
        Number(getComputedStyle(el).opacity)
      ),
      breaths: [
        ...(frame?.querySelectorAll(
          '[data-slot="step-tile"][data-state="doing"] .glyph'
        ) ?? []),
      ].map((el) => Number(getComputedStyle(el).opacity)),
    };
  }, selector);

/**
 * The frame alone, whole (its label, its card, the card's own end): the
 * canvas's chrome and the Dials panel hidden, the view grown to hold the
 * frame where it would not, and every run in it held at rest. Says how it
 * stood: the clip, and the still's reads.
 */
async function capture(
  page: Page,
  clock: Clock,
  name: string,
  story: string
): Promise<string> {
  await page.addStyleTag({
    content: "#cawco-chrome, .dialkit-root { display: none !important; }",
  });
  // The canvas pans its world itself: a scroll of its own box would carry
  // the section past the far margin, and the canvas would put it to sleep.
  const selector = `.cawco-frame[data-cawco-story="${story}"][data-cawco-interaction="rest"]`;
  await page.waitForSelector(selector, { state: "attached", timeout: 20_000 });
  const was = page.viewportSize();
  if (!was) {
    throw new Error("the page has no viewport");
  }
  let box = await goTo(page, selector);
  const seen = await page
    .locator(selector)
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!seen) {
    throw new Error(
      `${story}'s frame is not shown: ${await hiddenWhy(page, selector)}`
    );
  }
  if (box && (box.height > was.height || box.width > was.width)) {
    // A frame taller than the view (the phone's 844 and its label): the
    // view grows to hold it whole, and the canvas stands it in the middle.
    await page.setViewportSize({
      width: Math.max(was.width, Math.ceil(box.width + 64)),
      height: Math.ceil(box.height + 64),
    });
    box = await goTo(page, selector);
  }
  const view = page.viewportSize();
  try {
    if (!(box && view)) {
      throw new Error(`${story}'s frame has no box to picture`);
    }
    if (
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.width > view.width ||
      box.y + box.height > view.height
    ) {
      throw new Error(
        `${story}'s frame is not whole in the view: ${JSON.stringify({ box, view })}`
      );
    }
    // Each timed run started again as a new run (its element's animation
    // taken off and put back: a replayed run keeps its id, and the
    // protocol reports no start for it), caught by the clock as it starts
    // and held at its first frame.
    await clock.catchRuns(
      () =>
        page.evaluate((one) => {
          const frame = document.querySelector(one);
          const targets = new Set<HTMLElement | SVGElement>();
          for (const run of document.getAnimations()) {
            const target = (run.effect as KeyframeEffect | null)?.target;
            if (
              run instanceof CSSAnimation &&
              run.timeline === document.timeline &&
              (target instanceof HTMLElement || target instanceof SVGElement) &&
              frame?.contains(target)
            ) {
              targets.add(target);
            }
          }
          for (const target of targets) {
            target.style.animationName = "none";
          }
          // A layout read applies the style, which ends the old runs.
          frame?.getBoundingClientRect();
          for (const target of targets) {
            target.style.removeProperty("animation-name");
          }
        }, selector),
      selector
    );
    const still = await stillOf(page, selector);
    if (
      still.moving > 0 ||
      still.pulses.some((one) => one !== 0) ||
      still.breaths.some((one) => one !== 1)
    ) {
      throw new Error(
        `${story}'s frame is not at rest for its picture: ${JSON.stringify(still)}`
      );
    }
    const clip = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
    for (const dir of CAPS) {
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${name}.png`), clip });
    }
    return `${Math.round(clip.width)}×${Math.round(clip.height)} whole in ${view.width}×${view.height}; ${still.runs} runs held at rest (pulses ${still.pulses.join(",") || "none"}, breath ${still.breaths.join(",") || "none"})`;
  } finally {
    await clock.release();
    if (view && (view.width !== was.width || view.height !== was.height)) {
      await page.setViewportSize(was);
    }
  }
}

/** In the at-rest story: open the date picker, comment on it, and read the answer arrive. */
async function commentLive(page: Page): Promise<{
  acks: string[][];
  opened: boolean;
  thread: string;
}> {
  const frame = page.locator(FRAME("Plan")).first();
  const words = frame
    .locator('[data-row="a2"] > [data-slot="plan-row"] [data-slot="words"]')
    .first();
  // The canvas moves its world by transform, so a row can lie outside the
  // viewport where no scroll reaches: the keyboard opens it, as a person can.
  await words.press("Enter");
  await page.waitForTimeout(500);
  const opened = await frame
    .locator(
      '[data-row="a2"] [data-slot="fold-body"][data-open] [data-slot="description"]'
    )
    .first()
    .isVisible()
    .catch(() => false);
  const say = frame
    .locator('[data-row="a2"] [data-slot="thread"] textarea')
    .first();
  await say.fill("Skip the tide site on bank holidays.");
  // The canvas's world is moved by transform, so a press below the frame's
  // fold lies outside the viewport: the keyboard sends it, as a person can.
  await say.press("Control+Enter");
  const acks: string[][] = [];
  for (const wait of [200, 1200, 2200]) {
    await page.waitForTimeout(wait);
    acks.push(
      await frame
        .locator('[data-row="a2"] [data-slot="ack"]')
        .allTextContents()
        .then((all) => all.map((one) => one.replace(/\s+/g, " ").trim()))
    );
  }
  const thread =
    (await frame
      .locator('[data-row="a2"] [data-slot="thread"]')
      .first()
      .textContent()) ?? "";
  return { acks, opened, thread };
}

/**
 * Colour and contrast in the page, for the review's reads: a CSS colour as
 * RGBA (through a canvas, so oklch and color() resolve), WCAG's ratio, a
 * token resolved where an element stands (its scheme's value), and the
 * ground an element is drawn on.
 */
const HELPERS = () => {
  const pen = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  const rgba = (css: string): number[] => {
    if (!pen) {
      return [0, 0, 0, 0];
    }
    pen.clearRect(0, 0, 1, 1);
    pen.fillStyle = css;
    pen.fillRect(0, 0, 1, 1);
    return [...pen.getImageData(0, 0, 1, 1).data];
  };
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (p: number[]) =>
    0.2126 * lin(p[0] ?? 0) + 0.7152 * lin(p[1] ?? 0) + 0.0722 * lin(p[2] ?? 0);
  const ratio = (a: number[], b: number[]) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const token = (inside: Element, name: string) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    inside.append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return rgba(color);
  };
  const ground = (el: Element | null) => {
    for (let at = el; at; at = at.parentElement) {
      const paint = getComputedStyle(at).backgroundColor;
      if (paint !== "rgba(0, 0, 0, 0)" && paint !== "transparent") {
        return rgba(paint);
      }
    }
    return [255, 255, 255, 255];
  };
  (window as unknown as { pv: unknown }).pv = { rgba, ratio, token, ground };
};

interface Pv {
  ground: (el: Element | null) => number[];
  ratio: (a: number[], b: number[]) => number;
  rgba: (css: string) => number[];
  token: (inside: Element, name: string) => number[];
}

/** Everything the round-2 review named, read off each rest frame. */
const readReview = (page: Page) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one read of every frame, run in the page's own scope, so it cannot call helpers of the spec's
  page.evaluate(() => {
    const { pv } = window as unknown as { pv: Pv };
    const near = (a: number[], b: number[]) =>
      a.slice(0, 3).every((v, i) => Math.abs(v - (b[i] ?? 0)) <= 3);
    const seconds = (words: string) => {
      // biome-ignore lint/performance/useTopLevelRegex: it runs in the page's own scope, once per frame
      const m = words.match(/(?:(\d+)m\s*)?(\d+)s/);
      return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : -1;
    };
    const out: Record<string, Record<string, unknown>> = {};
    for (const body of document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-body'
    )) {
      const frameEl = body.closest<HTMLElement>(".cawco-frame");
      const story = frameEl?.getAttribute("data-cawco-story") ?? "";
      if (
        out[story] ||
        !frameEl ||
        getComputedStyle(frameEl).display === "none"
      ) {
        continue;
      }
      const scroller = body.querySelector<HTMLElement>(
        '[data-slot="side-card"] .body, [data-slot="phone-screen"] .kit-sheet-scroll'
      );
      const view = scroller?.getBoundingClientRect();
      const inView = (el: Element | null) => {
        const box = el?.getBoundingClientRect();
        return !!(
          box &&
          view &&
          box.height > 0 &&
          box.top >= view.top - 1 &&
          box.bottom <= view.bottom + 1
        );
      };
      // 1. The answer's words, once in the step.
      const a2 = body.querySelector('[data-row="a2"]');
      const replies =
        (a2?.textContent ?? "").split("closed_days only. I've told").length - 1;
      // 2. Each progress line's colour against its tokens.
      const lines = [
        ...body.querySelectorAll<HTMLElement>('[data-slot="progress-line"]'),
      ].map((line) => {
        const status = line.getAttribute("data-status") ?? "";
        const bar = line.querySelector<HTMLElement>(".bar");
        const fill = bar?.querySelector<HTMLElement>('[data-slot="fill"]');
        const result = status === "done" || status === "fail";
        const wantFill = pv.token(
          line,
          result ? `--status-${status}-ink` : "--ink-muted"
        );
        const wantTrack = pv.token(
          line,
          result ? `--status-${status}-bg` : "--border-control"
        );
        const gotFill = pv.rgba(
          fill ? getComputedStyle(fill).backgroundColor : "transparent"
        );
        const gotTrack = pv.rgba(
          bar ? getComputedStyle(bar).backgroundColor : "transparent"
        );
        return {
          status,
          ok: near(gotFill, wantFill) && near(gotTrack, wantTrack),
          gotFill: gotFill.join(","),
          wantFill: wantFill.join(","),
        };
      });
      // 3. The drawn dependency lines against the plan's own data.
      const rows = [...body.querySelectorAll<HTMLElement>("li[data-row]")]
        .filter((li) => li.querySelector(':scope > [data-slot="plan-row"]'))
        .map((li) => ({
          id: li.getAttribute("data-row") ?? "",
          after: (li.getAttribute("data-after") ?? "")
            .split(" ")
            .filter(Boolean),
          state:
            li
              .querySelector(':scope > [data-slot="plan-row"]')
              ?.getAttribute("data-state") ?? "",
        }));
      const drawn = [
        ...body.querySelectorAll<SVGPathElement>(
          'svg[data-slot="connectors"] path.wire[data-kind="after"]'
        ),
      ].map((path) => ({
        edge: `${path.getAttribute("data-from")}>${path.getAttribute("data-to")}`,
        length: Math.round(path.getTotalLength()),
      }));
      const deps = rows.flatMap((row) =>
        row.after.map((from) => ({
          edge: `${from}>${row.id}`,
          open: rows.find((one) => one.id === from)?.state !== "done",
        }))
      );
      // 4. What is cut: the failure in view, the sheet's foot, gaps, the opened step.
      const failure = body.querySelector(
        '[data-needs="a11y-check-44e"], [data-slot="stack"] [data-row="a11y-check-44e"]'
      );
      // Everything drawn in the list: rows, the groups' heads, the fold
      // lines; a gap is the paper between two of them.
      const shownRows = [
        ...body.querySelectorAll<HTMLElement>(
          '[data-slot="plan-row"], [data-slot="plan"] h3, [data-slot="plan"] button.finished, [data-slot="needs-you"] button'
        ),
      ]
        .filter(
          (row) =>
            !(
              row.closest('[data-slot="fold-body"]:not([data-open])') ||
              row.closest('[data-slot="pushed-page"]')
            ) && row.getBoundingClientRect().height > 0
        )
        .map((row) => row.getBoundingClientRect())
        .sort((x, y) => x.top - y.top);
      const zoom = body.getBoundingClientRect().width / (body.offsetWidth || 1);
      const gaps = shownRows
        .slice(1)
        .map((row, i) =>
          Math.round((row.top - (shownRows[i]?.bottom ?? row.top)) / zoom)
        );
      const sheet = body.querySelector<HTMLElement>(".kit-sheet-scroll");
      const description = body.querySelector(
        '[data-row="a2"] [data-slot="fold-body"][data-open] [data-slot="description"]'
      );
      // 5. The stack's head against what it holds; the to-dos head.
      const stackHead = body
        .querySelector('[aria-labelledby^="on-it"] h3')
        ?.textContent?.replace(/\s+/g, " ")
        .trim();
      const stackRows = body.querySelectorAll(
        '[data-slot="stack"] > [data-delegate]'
      ).length;
      const todosHead = body
        .querySelector('[aria-labelledby^="todos"] h3')
        ?.textContent?.trim();
      // 6. Controls.
      const answer = [...body.querySelectorAll<HTMLElement>(".act button")].map(
        (button) => {
          const hit = getComputedStyle(button, "::after");
          return {
            height: button.offsetHeight,
            radius: getComputedStyle(button).borderTopLeftRadius,
            hit: `${Math.round(Number.parseFloat(hit.width) || 0)}×${Math.round(Number.parseFloat(hit.height) || 0)}`,
          };
        }
      );
      const toolbar = body.querySelector<HTMLElement>(
        '[data-row="a2"] [role="toolbar"]'
      );
      const tools = [...(toolbar?.querySelectorAll("button") ?? [])].map(
        (button) => ({
          top: Math.round(button.offsetTop),
          height: button.offsetHeight,
          weight: Number(getComputedStyle(button).fontWeight),
          ghost: getComputedStyle(button).backgroundColor,
        })
      );
      const comment = body.querySelector<HTMLElement>(
        '[data-row="a2"] [data-slot="thread"] button[type="submit"]'
      );
      // 7. Lanes: pulses only while moving, the gutter given back.
      const pulses = [...body.querySelectorAll<SVGElement>(".pv-pulse")].map(
        (el) => ({
          moving: el.getAnimations().length > 0,
          opacity: Number(getComputedStyle(el).opacity),
        })
      );
      const lead = (id: string) =>
        body.querySelector<HTMLElement>(
          `[data-row="${id}"] > [data-slot="plan-row"] > .pv-lead`
        )?.offsetWidth ?? 0;
      // 8. The head's gap, the working glyph at its breath's floor, titles, times.
      // The head's words as drawn: the figure's box cut by the first box
      // over it that clips (SideSurface's name keeps "Plan" and cuts what
      // trails it where the head is short).
      const figureEl = body.querySelector('[data-slot="side-card"] .figure');
      let figure: { right: number } | undefined;
      if (figureEl) {
        let { right } = figureEl.getBoundingClientRect();
        for (let at = figureEl.parentElement; at && at !== body;) {
          if (getComputedStyle(at).overflowX !== "visible") {
            right = Math.min(right, at.getBoundingClientRect().right);
          }
          at = at.parentElement;
        }
        figure = { right };
      }
      const glyph = body
        .querySelector('[data-slot="side-card"] .task-glyph')
        ?.getBoundingClientRect();
      const doing = body.querySelector<HTMLElement>(
        '[data-slot="step-tile"][data-state="doing"] .glyph'
      );
      let breath = 0;
      if (doing) {
        const floor = Math.min(
          1,
          ...doing
            .getAnimations()
            .flatMap(
              (run) =>
                (run.effect as KeyframeEffect | null)?.getKeyframes() ?? []
            )
            .map((frame) => {
              // The shared breath's floor is a token (`var(--breath-floor)`):
              // its value where the glyph stands, this scheme's.
              const said = String(frame.opacity ?? 1);
              // biome-ignore lint/performance/useTopLevelRegex: it runs in the page's own scope, once per frame
              const token = said.match(/var\((--[\w-]+)\)/)?.[1];
              return Number(
                token
                  ? getComputedStyle(doing).getPropertyValue(token).trim()
                  : said
              );
            })
        );
        const ink = pv.rgba(getComputedStyle(doing).color);
        const under = pv.ground(doing.parentElement);
        const shown = ink.map((v, i) =>
          i < 3 ? v * floor + (under[i] ?? 0) * (1 - floor) : 255
        );
        breath = Math.round(pv.ratio(shown, under) * 100) / 100;
      }
      const titles = [
        ...body.querySelectorAll<HTMLElement>(
          '[data-delegate] [data-slot="words"] .problem'
        ),
      ].map((one) => one.textContent?.trim() ?? "");
      const named = [
        ...body.querySelectorAll<HTMLElement>(
          '[data-delegate] [data-slot="words"]'
        ),
      ].filter((words) => {
        const seen = [...words.childNodes]
          .filter(
            (node) =>
              !(
                node instanceof HTMLElement &&
                node.classList.contains("sr-only")
              )
          )
          .map((node) => node.textContent ?? "")
          .join("")
          .trim();
        const name =
          words
            .querySelector(".sr-only")
            ?.textContent?.replace(":", "")
            .trim() ?? "";
        // The name prefixed to the title: a title may mention a tool by name.
        return name.length > 0 && seen.startsWith(name);
      }).length;
      const timeOf = (id: string) =>
        seconds(
          body.querySelector(
            `[data-row="${id}"] > [data-slot="plan-row"] [data-slot="time"]`
          )?.textContent ?? ""
        );
      out[story] = {
        replies,
        lines,
        drawn,
        deps,
        afterChip:
          body
            .querySelector('[data-row="a6"] [data-slot="after"]')
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? "",
        failureInView: inView(failure),
        dependentInView: inView(body.querySelector('[data-row="a6"]')),
        dependentPast: Math.round(
          ((body.querySelector('[data-row="a6"]')?.getBoundingClientRect()
            .bottom ?? 0) -
            (view?.bottom ?? 0)) /
            zoom
        ),
        sheet: sheet
          ? {
              runsOn: sheet.scrollHeight > sheet.clientHeight + 1,
              mask: getComputedStyle(sheet).maskImage,
            }
          : null,
        maxGap: Math.max(0, ...gaps),
        descriptionInView: description ? inView(description) : null,
        stack: { head: stackHead ?? "", rows: stackRows },
        todosHead: todosHead ?? "",
        answer,
        tools,
        commentPrimary: comment
          ? getComputedStyle(comment).backgroundImage !== "none"
          : null,
        pulses,
        leads: { a2: lead("a2"), a4: lead("a4"), a7: lead("a7") },
        headGap:
          figure && glyph
            ? Math.round((glyph.left - figure.right) / zoom)
            : null,
        breath,
        titles,
        named,
        times: {
          fable: timeOf("fable-calendar-21c"),
          datePicker: timeOf("a2"),
        },
      };
    }
    return out;
  });

type Review = Record<string, Record<string, unknown>>;

/**
 * The round-4 review's reads off every rest frame shown, in layout pixels:
 * what each line runs through (sampled every 2px against every text box
 * drawn), the upright runs against the lanes' rails, the two lines into
 * the booking step, the opened step's title against the scroller's top
 * fade, each acknowledgement's lines, and the crew tiles' boxes.
 */
const readDrawn = (page: Page) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one read of every frame, run in the page's own scope, so it cannot call helpers of the spec's
  page.evaluate(() => {
    const out: Record<
      string,
      {
        acks: { lines: number; text: string }[];
        blank: number | null;
        crew: { overlaps: number; sides: number[] };
        crossings: string[];
        rails: { lanes: number[]; off: string[] } | null;
        shared: number | null;
        title: {
          fade: number;
          mask: string;
          opacity: number;
          top: number;
        } | null;
      }
    > = {};
    const shownText = (el: Element | null) =>
      !!el &&
      !el.closest(
        'svg, .sr-only, [data-slot="fold-body"]:not([data-open]), [inert]'
      ) &&
      el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    for (const body of document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-body'
    )) {
      const frameEl = body.closest<HTMLElement>(".cawco-frame");
      const story = frameEl?.getAttribute("data-cawco-story") ?? "";
      if (
        out[story] ||
        !frameEl ||
        getComputedStyle(frameEl).display === "none"
      ) {
        continue;
      }
      const zoom = body.getBoundingClientRect().width / (body.offsetWidth || 1);
      // Every text box drawn in the plan.
      const texts: { box: DOMRect; words: string }[] = [];
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const words = node.textContent?.trim() ?? "";
        if (!(words && shownText(node.parentElement))) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          if (box.width > 1 && box.height > 1) {
            texts.push({ box, words: words.slice(0, 24) });
          }
        }
      }
      // 1. Each line sampled every 2px: never inside a text box.
      const crossings: string[] = [];
      const paths = [
        ...body.querySelectorAll<SVGPathElement>(
          'svg[data-slot="connectors"] path.wire'
        ),
      ];
      const sample = (path: SVGPathElement, step: number) => {
        const length = path.getTotalLength();
        const points: DOMPoint[] = [];
        for (let at = 0; at <= length; at += step) {
          points.push(path.getPointAtLength(at));
        }
        return points;
      };
      for (const path of paths) {
        const svg = path.ownerSVGElement;
        const origin = svg?.getBoundingClientRect();
        if (!origin) {
          continue;
        }
        const hit = new Set<string>();
        for (const point of sample(path, 2)) {
          const x = origin.left + point.x * zoom;
          const y = origin.top + point.y * zoom;
          for (const text of texts) {
            const b = text.box;
            if (x > b.left && x < b.right && y > b.top && y < b.bottom) {
              hit.add(text.words);
            }
          }
        }
        for (const words of hit) {
          crossings.push(
            `${path.getAttribute("data-from")}>${path.getAttribute("data-to")} through "${words}"`
          );
        }
      }
      // 4. The upright runs on the lanes' rails; the two lines into the booking step.
      const host = body.querySelector<HTMLElement>(".lanes");
      let rails: { lanes: number[]; off: string[] } | null = null;
      let shared: number | null = null;
      if (host) {
        const at = host.getBoundingClientRect();
        const half = (n: number) => Math.round(n * 2) / 2;
        const lanes = [
          ...new Set(
            [...host.querySelectorAll("[data-tile]")]
              .filter(
                (tile) =>
                  !tile.getAttribute("data-tile")?.startsWith("d:") &&
                  tile.getBoundingClientRect().width > 0
              )
              .map((tile) => {
                const r = tile.getBoundingClientRect();
                return half((r.left + r.width / 2 - at.left) / zoom);
              })
          ),
        ].sort((p, q) => p - q);
        const uprights: { x: number; what: string }[] = [];
        for (const path of host.querySelectorAll<SVGPathElement>(
          'svg[data-slot="connectors"] path.wire'
        )) {
          // The path is written one space between its words (Connectors).
          const words = (path.getAttribute("d") ?? "")
            .split(" ")
            .filter(Boolean);
          let x = 0;
          for (let i = 0; i < words.length; i += 1) {
            const command = words[i];
            if (command === "M") {
              x = Number(words[i + 1]);
              i += 2;
            } else if (command === "H") {
              x = Number(words[i + 1]);
              i += 1;
            } else if (command === "Q") {
              x = Number(words[i + 3]);
              i += 4;
            } else if (command === "V") {
              uprights.push({
                x,
                what: `${path.getAttribute("data-from")}>${path.getAttribute("data-to")}`,
              });
              i += 1;
            }
          }
        }
        for (const list of host.querySelectorAll<HTMLElement>(".kit-nest")) {
          if (!shownText(list) || list.getBoundingClientRect().height === 0) {
            continue;
          }
          uprights.push({
            x:
              (list.getBoundingClientRect().left - at.left) / zoom +
              Number.parseFloat(
                getComputedStyle(list).getPropertyValue("--nest-x")
              ),
            what: `the nesting rail under ${list.closest("[data-row]")?.getAttribute("data-row")}`,
          });
        }
        rails = {
          lanes,
          off: uprights
            .filter((one) => !lanes.some((x) => Math.abs(x - one.x) <= 0.5))
            .map((one) => `${one.what} at ${one.x.toFixed(1)}`),
        };
        const into = [
          ...host.querySelectorAll<SVGPathElement>(
            'svg[data-slot="connectors"] path.wire[data-kind="after"][data-to="a6"]'
          ),
        ];
        if (into.length === 2) {
          const [p, q] = into.map((path) => sample(path, 1));
          shared = (p ?? []).filter((a) =>
            (q ?? []).some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.6)
          ).length;
        }
      }
      // 2. The opened step's title against the scroller's top fade.
      const scroller = body.querySelector<HTMLElement>(
        '[data-slot="side-card"] .body, [data-slot="phone-screen"] .kit-sheet-scroll'
      );
      const words = body.querySelector<HTMLElement>(
        '[data-row="a2"] > [data-slot="plan-row"] [data-slot="words"]'
      );
      let title: {
        fade: number;
        mask: string;
        opacity: number;
        top: number;
      } | null = null;
      if (
        scroller &&
        words &&
        body.querySelector('[data-row="a2"] [data-slot="fold-body"][data-open]')
      ) {
        let opacity = 1;
        for (let el: Element | null = words; el && el !== body;) {
          opacity *= Number(getComputedStyle(el).opacity);
          el = el.parentElement;
        }
        const style = getComputedStyle(scroller);
        title = {
          top: Math.round(
            (words.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top) /
              zoom
          ),
          fade: Number.parseFloat(style.getPropertyValue("--fade-start")) || 0,
          mask: style.maskImage,
          opacity: Math.round(opacity * 100) / 100,
        };
      }
      // 3. Each acknowledgement: how many lines its words take.
      const acks = [
        ...body.querySelectorAll<HTMLElement>('[data-slot="ack"] .said'),
      ]
        .filter((said) => shownText(said))
        .map((said) => {
          const range = document.createRange();
          range.selectNodeContents(said);
          const tops = new Set(
            [...range.getClientRects()]
              .filter((r) => r.width > 0)
              .map((r) => Math.round(r.top / zoom))
          );
          return {
            text: said.textContent?.replace(/\s+/g, " ").trim() ?? "",
            lines: tops.size,
          };
        });
      // 7. The crew tiles: their sides, and none over another.
      const crewBoxes = [
        ...body.querySelectorAll<HTMLElement>('[data-slot="crew"] button'),
      ]
        .filter((tile) => shownText(tile))
        .map((tile) => tile.getBoundingClientRect());
      let overlaps = 0;
      for (const [i, a] of crewBoxes.entries()) {
        for (const b of crewBoxes.slice(i + 1)) {
          if (
            a.left < b.right - 0.5 &&
            b.left < a.right - 0.5 &&
            a.top < b.bottom - 0.5 &&
            b.top < a.bottom - 0.5
          ) {
            overlaps += 1;
          }
        }
      }
      // 5. The phone's sheet: the paper under its last line of words.
      const sheet = body.querySelector<HTMLElement>(
        '[data-slot="phone-screen"] .plan-sheet'
      );
      const runsOn = body.querySelector<HTMLElement>(
        '[data-slot="phone-screen"] .kit-sheet-scroll'
      );
      // The sheet's foot as drawn: its own, or the scroller's where the
      // list runs on under it; the paper from the last words above it.
      const foot =
        sheet && runsOn
          ? Math.min(
              sheet.getBoundingClientRect().bottom,
              runsOn.getBoundingClientRect().bottom
            )
          : null;
      const above =
        foot === null
          ? []
          : texts.filter(
              (text) =>
                text.box.top >= (sheet?.getBoundingClientRect().top ?? 0) &&
                text.box.top < foot
            );
      const blank =
        foot === null || above.length === 0
          ? null
          : Math.round(
              (foot - Math.max(...above.map((text) => text.box.bottom))) / zoom
            );
      out[story] = {
        blank,
        crossings,
        rails,
        shared,
        title,
        acks,
        crew: {
          overlaps,
          sides: crewBoxes.map(
            (box) =>
              Math.round((Math.min(box.width, box.height) / zoom) * 10) / 10
          ),
        },
      };
    }
    return out;
  });

/** The round-4 review's items, each read off what is drawn. */
function checkDrawn(
  kit: Kit,
  name: string,
  way: Way,
  drawn: Awaited<ReturnType<typeof readDrawn>>,
  view: "desk" | "phone"
): void {
  const json = (value: unknown) => String(JSON.stringify(value)).slice(0, 700);
  const shown = Object.entries(drawn);
  // 1. Lines never cross text.
  const crossings = shown.flatMap(([story, one]) =>
    one.crossings.map((what) => `${story}: ${what}`)
  );
  kit.check(
    `${name}: no line runs through any text, in every frame shown (${shown.map(([story]) => story).join(", ")})`,
    shown.length > 0 && crossings.length === 0,
    crossings.slice(0, 6).join(" | ")
  );
  // 2. The opened step's title clear of the top fade, in full ink.
  const titles = shown.flatMap(([story, one]) =>
    one.title ? [{ story, ...one.title }] : []
  );
  if (view === "desk") {
    kit.check(
      `${name}: the opened step's title stands below the scroller's top fade, in full ink (${titles.map((one) => `${one.story} top ${one.top} ≥ fade ${one.fade}, opacity ${one.opacity}`).join("; ")})`,
      titles.length >= 2 &&
        titles.every(
          (one) => one.top >= one.fade && one.opacity === 1 && one.mask !== ""
        ),
      json(titles)
    );
  }
  // 5. No blank paper under the phone sheet's last line.
  const blanks = shown.flatMap(([story, one]) =>
    one.blank === null ? [] : [{ story, blank: one.blank }]
  );
  kit.check(
    `${name}: the phone sheet's foot stands close under its last words, no blank paper (${blanks.map((one) => `${one.story} ${one.blank}px`).join("; ")})`,
    // The desk's canvas stands every frame, the phone story's sheet with them.
    (view === "phone" || blanks.length > 0) &&
      blanks.every((one) => one.blank <= 40),
    json(blanks)
  );
  // 3. Each acknowledgement one short line.
  const acks = shown.flatMap(([story, one]) =>
    one.acks.map((ack) => ({ story, ...ack }))
  );
  const named = (text: string) =>
    (text.match(/Fable|this session/g) ?? []).length;
  kit.check(
    `${name}: every acknowledgement is one line naming each receiver once (${acks.map((one) => `"${one.text}" ${one.lines}`).join("; ")})`,
    (view === "phone" || acks.length >= 3) &&
      acks.every(
        (one) =>
          one.lines === 1 &&
          !(one.text.includes("Fable") && one.text.split("Fable").length > 2) &&
          named(one.text) <= 2
      ),
    json(acks)
  );
  if (way.variation === "a") {
    return;
  }
  // 4. One rail per lane; the two lines into the booking step share nothing.
  const rails = shown.flatMap(([story, one]) =>
    one.rails ? [{ story, ...one.rails }] : []
  );
  kit.check(
    `${name}: every upright line and nesting rail stands on a lane's rail, one x per lane (${rails.map((one) => `${one.story} ${one.lanes.join("/")}`).join("; ")})`,
    rails.length > 0 &&
      rails.every((one) => one.lanes.length <= 2 && one.off.length === 0),
    json(rails.filter((one) => one.off.length > 0 || one.lanes.length > 2))
  );
  if (view === "desk") {
    const plan = drawn.Plan;
    kit.check(
      `${name}: the two lines into the booking step share no stretch (${plan?.shared ?? "not two"} px shared)`,
      plan?.shared === 0,
      json(plan?.rails)
    );
  }
  // 7. Crew first's tiles at the tree mark's 18px, none over another.
  if (way.variation === "c") {
    const crew = shown.map(([story, one]) => ({ story, ...one.crew }));
    kit.check(
      `${name}: who is on each to-do shows as 18px tiles, none over another (${crew.map((one) => `${one.story} ${one.sides.join(",")}`).join("; ")})`,
      crew.some((one) => one.sides.length > 0) &&
        crew.every(
          (one) =>
            one.overlaps === 0 &&
            one.sides.every((side) => Math.abs(side - 18) <= 0.6)
        ),
      json(crew)
    );
  }
}

/** 8. The after chip: no arrow; each name a link that lights its step. */
async function checkAfterLinks(
  kit: Kit,
  name: string,
  page: Page
): Promise<void> {
  const read = await page.evaluate(async (selector) => {
    const plan = document.querySelector(selector);
    const chip = plan?.querySelector('[data-row="a6"] [data-slot="after"]');
    const links = [
      ...(chip?.querySelectorAll<HTMLButtonElement>("button[data-goes]") ?? []),
    ];
    const lit: string[] = [];
    for (const link of links) {
      const id = link.getAttribute("data-goes") ?? "";
      link.click();
      await new Promise((done) => requestAnimationFrame(() => done(null)));
      await new Promise((done) => requestAnimationFrame(() => done(null)));
      if (plan?.querySelector(`[data-row="${id}"][data-lit]`)) {
        lit.push(id);
      }
    }
    return {
      text: chip?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      links: links.map((link) => ({
        id: link.getAttribute("data-goes") ?? "",
        label: link.getAttribute("aria-label") ?? "",
        ink: getComputedStyle(link).color,
      })),
      lit,
    };
  }, FRAME("Plan"));
  kit.check(
    `${name}: "${read.text}" has no arrow, and each name is a link that lights its step (${read.links.map((one) => one.label).join(", ")}; lit ${read.lit.join(", ")})`,
    !read.text.includes("↑") &&
      read.links.length === 2 &&
      read.links.every((one) => read.lit.includes(one.id)),
    JSON.stringify(read)
  );
}

type Way = (typeof WAYS)[number];
type Stories = Awaited<ReturnType<typeof readStories>>;

/** At 390: a phone stands one frame at a time (its strip steps between them). */
function checkPhone(
  kit: Kit,
  name: string,
  way: Way,
  report: RenderReport,
  stories: Stories
): void {
  const frames = report.sections.flatMap((one) => one.frames);
  const failed = frames.filter((one) => one.state === "failed");
  const drawn = frames.filter((one) => one.state === "drawn");
  const plans = Object.values(stories).filter((one) => one.rows > 0);
  kit.check(
    `${name}: the frame a phone stands is drawn (${drawn.map((one) => one.story).join(", ")}), none failed, none unnamed, its plan on 18px tiles`,
    drawn.length > 0 &&
      failed.length === 0 &&
      report.unnamed.length === 0 &&
      plans.length > 0 &&
      plans.every(
        (one) => one.variation === way.variation && one.leads.length === 0
      ),
    JSON.stringify({ failed: failed.map((one) => one.story), stories }).slice(
      0,
      800
    )
  );
}

/** At 1440: every frame, every story's plan, and the acknowledgements. */
function checkDesk(
  kit: Kit,
  name: string,
  way: Way,
  report: RenderReport,
  stories: Stories
): void {
  const frames = report.sections.flatMap((one) => one.frames);
  const bad = frames.filter((one) => one.state !== "drawn");
  kit.check(
    `${name}: all ${frames.length} frames drawn, none unnamed`,
    frames.length >= 6 && bad.length === 0 && report.unnamed.length === 0,
    `${bad
      .slice(0, 4)
      .map(
        (one) =>
          `${one.story}/${one.interaction} ${one.state} ${one.error?.message ?? ""}`
      )
      .join(" | ")} unnamed ${report.unnamed.join(",")}`
  );
  const names = Object.keys(stories).sort();
  kit.check(
    `${name}: its 6 stories draw its own plan (${names.join(", ")}), every row on an 18px tile`,
    names.length === 6 &&
      Object.values(stories).every(
        (one) =>
          one.variation === way.variation &&
          one.rows > 0 &&
          one.leads.length === 0
      ),
    JSON.stringify(stories).slice(0, 800)
  );
  const ack = (story: string, words: string) =>
    (stories[story]?.acks ?? []).some((one) => one.includes(words));
  kit.check(
    `${name}: edited, commented and answered draw the acknowledgement (seen by this session; sent to Fable; answered on the thread)`,
    ack("Edited", "Seen by this session") &&
      ack("Commented", "Comment sent to Fable") &&
      ack("Acknowledged", "Answered on the thread"),
    JSON.stringify({
      edited: stories.Edited?.acks,
      commented: stories.Commented?.acks,
      acknowledged: stories.Acknowledged?.acks,
    })
  );
}

/**
 * The live story's sweep: the deposit's delegate works on its first two
 * beats and has finished from the third, so the read runs across one whole
 * cycle (5 beats of 2.4s) for a working beat.
 */
async function checkSweeps(kit: Kit, name: string, page: Page): Promise<void> {
  const sweeps = await until(
    `${name}: a live beat with its delegate working`,
    () => readSweeps(page),
    (now) => now.running > 0 || now.off.length > 0,
    13_000
  ).catch(() => ({ running: 0, off: [] as (string | null | undefined)[] }));
  kit.check(
    `${name}: while the live story's delegate works, its ${sweeps.running} sweeps run only on working delegates' lines`,
    sweeps.running > 0 && sweeps.off.length === 0,
    JSON.stringify(sweeps)
  );
}

/** The at-rest story, operated: a step opened, a comment sent, its answer read. */
async function checkComment(kit: Kit, name: string, page: Page): Promise<void> {
  const live = await commentLive(page);
  const [first = [], second = [], third = []] = live.acks;
  kit.check(
    `${name}: a step opens to its description, and a comment on it is sent to Fable, seen, then answered (${[first, second, third].map((one) => one.join(" ")).join(" → ")})`,
    live.opened &&
      first.some((one) => one.includes("sent to Fable")) &&
      second.some((one) => one.includes("Seen by Fable")) &&
      third.some((one) => one.includes("Answered on the thread")) &&
      live.thread.includes("Will do"),
    JSON.stringify(live)
  );
}

/**
 * What is laid out, not only named: each card at its width (the side card
 * 340 or more, the phone's screen 370 or more), the head's words apart, and
 * in the commented and answered stories the date picker's description
 * open, a dependency line drawn (Lanes and Crew first) and the working
 * delegate's sweep running.
 */
function checkGeometry(
  kit: Kit,
  name: string,
  way: Way,
  geometry: Awaited<ReturnType<typeof readGeometry>>,
  desk: boolean
): void {
  const shown = Object.entries(geometry).filter(
    ([, one]) => one.shown && one.card.kind !== "none"
  );
  const narrow = shown.filter(([, one]) =>
    one.card.kind === "phone-screen"
      ? one.card.width < 370
      : one.card.width < 340
  );
  kit.check(
    `${name}: every card stands at its width (side card ≥ 340, phone ≥ 370): ${shown.map(([story, one]) => `${story} ${one.card.width}`).join(", ")}`,
    shown.length > 0 && narrow.length === 0,
    JSON.stringify(narrow.map(([story, one]) => [story, one.card]))
  );
  const overlaps = shown.flatMap(([story, one]) =>
    one.overlaps.map((what) => `${story}: ${what}`)
  );
  kit.check(
    `${name}: the head's title and its other words never overlap`,
    shown.length > 0 && overlaps.length === 0,
    overlaps.slice(0, 4).join(" | ")
  );
  // The opened step's stories, at the desk where every frame stands.
  for (const story of desk ? ["Commented", "Acknowledged"] : []) {
    const one = geometry[story];
    if (!one) {
      continue;
    }
    const lined =
      way.variation === "a" || one.wires.some((length) => length > 0);
    kit.check(
      `${name}: ${story} opens the date picker's description (${one.description.width}×${one.description.height}), draws its dependency lines (${one.wires.join(",") || "none"}) and sweeps its working delegate (${one.sweeps})`,
      one.description.height > 20 &&
        one.description.width > 200 &&
        lined &&
        one.sweeps > 0,
      JSON.stringify(one)
    );
  }
}

/** The round-2 review's eight items, each read off the frames. */
function checkReview(
  kit: Kit,
  name: string,
  way: Way,
  review: Review,
  view: "desk" | "phone"
): void {
  const json = (value: unknown) => String(JSON.stringify(value)).slice(0, 700);
  const shown = Object.entries(review);
  // 2. Colour means state, on every frame shown.
  const lines = shown.flatMap(([at, one]) =>
    ((one.lines as { ok: boolean }[] | undefined) ?? []).map((line) => ({
      at,
      ...line,
    }))
  );
  kit.check(
    `${name}: every progress line is ink while it runs and its state pair once done or failed (${lines.length} lines)`,
    lines.length > 0 && lines.every((line) => line.ok),
    json(lines.filter((line) => !line.ok))
  );
  // 6a. Answer and Retry: button-sm, a finger's 44 under a coarse pointer.
  const answer = shown.flatMap(
    ([, one]) =>
      (one.answer as
        { height: number; radius: string; hit: string }[] | undefined) ?? []
  );
  kit.check(
    `${name}: Answer and Retry are the 30px button, 10px radius${view === "phone" ? ", with a 44px hit area" : ""} (${answer.map((one) => `${one.height} ${one.radius} ${one.hit}`).join("; ")})`,
    answer.length > 0 &&
      answer.every(
        (one) =>
          one.height >= 30 &&
          one.radius === "10px" &&
          (view === "desk" ||
            one.hit.split("×").every((side) => Number(side) >= 44))
      ),
    json(answer)
  );
  if (view === "phone") {
    return;
  }
  checkReply(kit, name, review);
  checkGraph(kit, name, way, review);
  checkCuts(kit, name, way, review);
  checkControls(kit, name, way, review);
  checkSmall(kit, name, review);
}

/** 1. The answer once in the step. */
function checkReply(kit: Kit, name: string, review: Review): void {
  const story = (one: string) => review[one] ?? {};
  const json = (value: unknown) => String(JSON.stringify(value)).slice(0, 700);
  // 1. The answer once in the step.
  kit.check(
    `${name}: the answer to the comment stands once in its step (${story("Acknowledged").replies})`,
    story("Acknowledged").replies === 1,
    json(story("Acknowledged"))
  );
}

/** 3. Drawn lines against the plan's dependency data. */
function checkGraph(kit: Kit, name: string, way: Way, review: Review): void {
  const story = (one: string) => review[one] ?? {};
  const json = (value: unknown) => String(JSON.stringify(value)).slice(0, 700);
  const plan = story("Plan");
  // 3. Drawn lines against the plan's dependency data.
  const deps = plan.deps as { edge: string; open: boolean }[];
  const drawn = plan.drawn as { edge: string; length: number }[];
  const drew = new Set(
    drawn.filter((one) => one.length > 0).map((one) => one.edge)
  );
  const wanted = new Set(
    deps
      .filter((one) => (way.variation === "c" ? one.open : true))
      .map((one) => one.edge)
  );
  if (way.variation === "a") {
    kit.check(
      `${name}: One list draws no lines; the waiting step says what it waits on (${plan.afterChip})`,
      drawn.length === 0 &&
        String(plan.afterChip).includes("Date picker") &&
        String(plan.afterChip).includes("Deposit"),
      json({ drawn, chip: plan.afterChip })
    );
  } else {
    kit.check(
      `${name}: every line drawn is a dependency of the plan's, and every ${way.variation === "c" ? "open " : ""}dependency is drawn (${[...drew].join(", ")})`,
      drew.size === wanted.size &&
        [...wanted].every((edge) => drew.has(edge)) &&
        drawn.every((one) => deps.some((dep) => dep.edge === one.edge)),
      json({ drawn, wanted: [...wanted] })
    );
  }
  if (way.variation === "c") {
    kit.check(
      `${name}: the waiting step says what it waits on (${plan.afterChip}), and on the phone it stands in view`,
      String(plan.afterChip).includes("Date picker") &&
        String(plan.afterChip).includes("Deposit") &&
        story("Phone").dependentInView === true,
      json({
        chip: plan.afterChip,
        phone: story("Phone").dependentInView,
        past: story("Phone").dependentPast,
      })
    );
  }
}

/** 4, 5. Nothing cut; the stack's head names what it holds. */
function checkCuts(kit: Kit, name: string, way: Way, review: Review): void {
  const story = (one: string) => review[one] ?? {};
  const json = (value: unknown) => String(JSON.stringify(value)).slice(0, 700);
  const plan = story("Plan");
  // 4. Nothing cut.
  kit.check(
    `${name}: the failed delegate is in view without scrolling, on the desk and the phone`,
    plan.failureInView === true && story("Phone").failureInView === true,
    json({ desk: plan.failureInView, phone: story("Phone").failureInView })
  );
  const sheet = story("Phone").sheet as {
    runsOn: boolean;
    mask: string;
  } | null;
  kit.check(
    `${name}: where the phone's sheet runs on past its foot, it fades there (${sheet?.mask.slice(0, 40)})`,
    !!sheet && (!sheet.runsOn || sheet.mask !== "none"),
    json(sheet)
  );
  kit.check(
    `${name}: no blank stretch between rows (largest gap: desk ${plan.maxGap}px, phone ${story("Phone").maxGap}px)`,
    Number(plan.maxGap) <= 48 && Number(story("Phone").maxGap) <= 48,
    json({ desk: plan.maxGap, phone: story("Phone").maxGap })
  );
  kit.check(
    `${name}: the commented and answered stories stand on the opened step, its description in view`,
    story("Commented").descriptionInView === true &&
      story("Acknowledged").descriptionInView === true,
    json({
      commented: story("Commented").descriptionInView,
      acknowledged: story("Acknowledged").descriptionInView,
    })
  );
  // 5. The stack's head names and counts what it holds.
  if (way.variation === "c") {
    const stack = plan.stack as { head: string; rows: number };
    kit.check(
      `${name}: the stack's head says what it holds ("${stack.head}" over ${stack.rows} rows), the to-dos head no second count ("${plan.todosHead}")`,
      stack.head === `Delegates ${stack.rows}` &&
        !DIGIT.test(String(plan.todosHead)),
      json({ stack, todos: plan.todosHead })
    );
  }
}

/** 6, 7. The controls; Lanes' pulses and gutter. */
function checkControls(kit: Kit, name: string, way: Way, review: Review): void {
  const story = (one: string) => review[one] ?? {};
  const json = (value: unknown) => String(JSON.stringify(value)).slice(0, 700);
  const plan = story("Plan");
  const shown = Object.entries(review);
  // 6b, 6c. The step's actions: one row of 30px ghost buttons; Comment not the coral.
  const tools = story("Commented").tools as {
    top: number;
    height: number;
    weight: number;
    ghost: string;
  }[];
  kit.check(
    `${name}: the step's actions are one row of 30px ghost buttons in the label weight (${tools.map((one) => `${one.top}/${one.height}/${one.weight}`).join(" ")})`,
    tools.length === 5 &&
      new Set(tools.map((one) => one.top)).size === 1 &&
      tools.every(
        (one) =>
          one.height >= 30 &&
          one.weight <= 500 &&
          one.ghost === "rgba(0, 0, 0, 0)"
      ),
    json(tools)
  );
  kit.check(
    `${name}: Comment is an outline button, never the coral primary`,
    story("Commented").commentPrimary === false,
    json(story("Commented").commentPrimary)
  );
  // 7. Lanes: a pulse only while it moves; the gutter given back.
  const pulses = shown.flatMap(
    ([, one]) =>
      (one.pulses as { moving: boolean; opacity: number }[] | undefined) ?? []
  );
  kit.check(
    `${name}: a pulse is drawn only while it moves (${pulses.filter((one) => one.moving).length} moving, ${pulses.filter((one) => !one.moving).length} still)`,
    pulses.every((one) => one.moving || one.opacity === 0),
    json(pulses)
  );
  if (way.variation === "b") {
    const leads = plan.leads as { a2: number; a4: number; a7: number };
    kit.check(
      `${name}: the two-lane gutter stands only where the second lane runs (date picker ${leads.a2}px; confirmation email ${leads.a4}px, waiting list ${leads.a7}px)`,
      leads.a4 === 18 && leads.a7 === 18 && leads.a2 >= leads.a4 * 2,
      json(leads)
    );
  }
}

/** 8. The head's gap, the working glyph's floor, titles, times. */
function checkSmall(kit: Kit, name: string, review: Review): void {
  const story = (one: string) => review[one] ?? {};
  const json = (value: unknown) => String(JSON.stringify(value)).slice(0, 700);
  const plan = story("Plan");
  // 8. The head's gap, the working glyph's floor, titles, times.
  kit.check(
    `${name}: the head's words as drawn and the task's glyph stand ${plan.headGap}px apart, at least 8`,
    Number(plan.headGap) >= 8,
    json(plan.headGap)
  );
  kit.check(
    `${name}: the working glyph holds ${plan.breath}:1 on its tile at its breath's floor, at least 3`,
    Number(plan.breath) >= 3,
    json(plan.breath)
  );
  kit.check(
    `${name}: a delegate's row shows its title alone (${(plan.titles as string[]).join(" | ")})`,
    plan.named === 0 && (plan.titles as string[]).length > 0,
    json({ named: plan.named, titles: plan.titles })
  );
  const times = plan.times as { fable: number; datePicker: number };
  kit.check(
    `${name}: a delegate never runs longer than the step that started it (Fable ${times.fable}s, the date picker ${times.datePicker}s)`,
    times.fable > 0 && times.datePicker >= times.fable,
    json(times)
  );
}

/** One way's canvas at one width and scheme. */
async function leg(
  kit: Kit,
  base: string,
  view: "desk" | "phone",
  theme: "light" | "dark",
  way: Way
): Promise<void> {
  const name = `${view === "desk" ? 1440 : 390} ${theme} ${way.label}`;
  const page = await kit.page(view, { init: [BRIDGE, HELPERS], theme });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().split("\n")[0] ?? "");
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    canvasUrl(base, `${STORIES}/${way.file}.stories.ts`, {
      name: way.label,
      about: `${way.label}: the plan on the desk card and the phone sheet, edited, commented, answered, and live`,
      dials: DIALS as CanvasSpec["dials"],
    })
  );
  const report = await reportOn(page);
  const stories = await readStories(page);
  kit.check(
    `${name}: the canvas reports no page errors`,
    report.page.errors.length === 0,
    JSON.stringify(report.page.errors).slice(0, 600)
  );
  checkGeometry(kit, name, way, await readGeometry(page), view === "desk");
  checkReview(kit, name, way, await readReview(page), view);
  checkDrawn(kit, name, way, await readDrawn(page), view);
  // Each frame drawn in the page's scheme: its color-scheme, and the card's
  // ground dark at night (a channel under 128) and light by day.
  const scheme = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-body'
    );
    const card = body?.querySelector<HTMLElement>(
      '[data-slot="side-card"] [data-slot="side-surface"], [data-slot="side-card"] > *, [data-slot="phone-screen"]'
    );
    const pen = document.createElement("canvas").getContext("2d");
    let ground = 0;
    for (
      let at: HTMLElement | null | undefined = card;
      at && pen;
      at = at.parentElement
    ) {
      const paint = getComputedStyle(at).backgroundColor;
      if (paint !== "rgba(0, 0, 0, 0)" && paint !== "transparent") {
        pen.fillStyle = paint;
        pen.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = pen.getImageData(0, 0, 1, 1).data;
        ground = Math.round((r + g + b) / 3);
        break;
      }
    }
    return {
      scheme: body ? getComputedStyle(body).colorScheme : "",
      ground,
    };
  });
  kit.check(
    `${name}: its frames are drawn ${theme} (color-scheme ${scheme.scheme}, the card's ground ${scheme.ground})`,
    scheme.scheme.includes(theme) &&
      (theme === "dark" ? scheme.ground < 128 : scheme.ground >= 128),
    JSON.stringify(scheme)
  );
  if (view === "phone") {
    checkPhone(kit, name, way, report, stories);
  } else {
    checkDesk(kit, name, way, report, stories);
    await checkSweeps(kit, name, page);
  }
  if (view === "desk") {
    // The frames alone: the desk card, the phone sheet, and a step opened
    // with its comment answered.
    const clock = await Clock.on(page);
    for (const [shot, story] of [
      ["desk", "Plan"],
      ["phone", "Phone"],
      ["answered", "Acknowledged"],
    ] as const) {
      // A frame that cannot be pictured is a failed check, never the end of the run.
      const said = await capture(
        page,
        clock,
        `plan-ways-${way.file}-${shot}-${theme}`,
        story
      ).then(
        (how) => ({ ok: true, how }),
        (error: unknown) => ({ ok: false, how: String(error).slice(0, 400) })
      );
      kit.check(
        `${name}: the ${story} frame is captured whole and still (${said.ok ? said.how : "failed"})`,
        said.ok,
        said.how
      );
    }
  }
  if (view === "desk" && theme === "light") {
    await checkComment(kit, name, page);
    await checkAfterLinks(kit, name, page);
  }
  kit.check(
    `${name}: no console errors`,
    errors.length === 0,
    errors.slice(0, 4).join(" | ")
  );
  await page.close();
}

const spec: Spec = {
  name: "plan-ways",
  run: async (kit: Kit) => {
    const stage = await stageOn();
    kit.note(`the dashboard's stage served in ${stage.ms} ms`);
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of ["light", "dark"] as const) {
          for (const way of WAYS) {
            await leg(kit, stage.base, view, theme, way);
          }
        }
      }
      kit.note(`captures in ${CAPS.join(" and ")}`);
    } finally {
      stage.stop();
    }
  },
};

export default spec;
