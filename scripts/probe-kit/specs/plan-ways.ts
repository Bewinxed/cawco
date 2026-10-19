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
 *   acknowledgement: a reworded to-do seen by this session, a comment sent
 *   to Fable (which carries the step), the same comment seen by Fable with
 *   its reply;
 * - while the live story's delegate works, its progress sweep runs only on
 *   a working delegate's line;
 * - in the at-rest story, a step opens to its description, and a comment
 *   typed on its thread is sent to Fable, seen, then answered, live;
 * - nothing is written to the console as an error.
 *
 * Captures of each canvas go to `$TMPDIR/caps/` and the clone's `caps/`.
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
import { type Kit, ROOT, type Spec } from "../kit";
import { DIALS } from "./plan-decision";

const DASHBOARD = join(ROOT, "apps", "dashboard");
const STORIES = "src/lib/cawco/plan/proposal";
const CAPS = [join(process.env.TMPDIR ?? "/tmp", "caps"), join(ROOT, "caps")];

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

/** The frames alone: the canvas's own chrome and the Dials panel hidden for the picture. */
async function capture(page: Page, name: string, story: string): Promise<void> {
  await page.addStyleTag({
    content: "#cawco-chrome, .dialkit-root { display: none !important; }",
  });
  // The canvas pans its world itself (`cawco:canvas-go` to the frame's
  // key): a scroll of its own box would carry the section past the far
  // margin, and the canvas would put it to sleep.
  const selector = `.cawco-frame[data-cawco-story="${story}"][data-cawco-interaction="rest"]`;
  await page.waitForSelector(selector, { state: "attached", timeout: 20_000 });
  await page.evaluate((one) => {
    const key = document.querySelector(one)?.getAttribute("data-cawco-key");
    if (key) {
      dispatchEvent(new CustomEvent("cawco:canvas-go", { detail: { key } }));
    }
  }, selector);
  await page.waitForTimeout(900);
  const frame = page.locator(selector).first();
  const seen = await frame
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!seen) {
    const why = await page.evaluate((one) => {
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
    throw new Error(`${story}'s frame is not shown: ${why}`);
  }
  // The page cut to the frame's box: `go` stood it in the middle of the
  // view, and an element's own picture waits for a stillness a frame in a
  // transformed world never reports.
  const box = await frame.boundingBox();
  const view = page.viewportSize();
  if (!(box && view)) {
    throw new Error(`${story}'s frame has no box to picture`);
  }
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const clip = {
    x,
    y,
    width: Math.min(box.x + box.width, view.width) - x,
    height: Math.min(box.y + box.height, view.height) - y,
  };
  for (const dir of CAPS) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), clip });
  }
}

/** In the at-rest story: open the date picker, comment on it, and read the answer arrive. */
async function commentLive(page: Page): Promise<{
  acks: string[][];
  opened: boolean;
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
  return { acks, opened };
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
    `${name}: edited, commented and answered draw the acknowledgement (seen by this session; sent to Fable; seen by Fable with its reply)`,
    ack("Edited", "Seen by this session") &&
      ack("Commented", "sent to Fable") &&
      !ack("Commented", "this session heard it") &&
      ack("Acknowledged", "Seen by Fable · this session heard it") &&
      ack("Acknowledged", "closed_days only"),
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
      third.some((one) => one.includes("Will do")),
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

/** One way's canvas at one width and scheme. */
async function leg(
  kit: Kit,
  base: string,
  view: "desk" | "phone",
  theme: "light" | "dark",
  way: Way
): Promise<void> {
  const name = `${view === "desk" ? 1440 : 390} ${theme} ${way.label}`;
  const page = await kit.page(view, { init: [BRIDGE], theme });
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
    await capture(page, `plan-ways-${way.file}-desk-${theme}`, "Plan");
    await capture(page, `plan-ways-${way.file}-phone-${theme}`, "OnPhone");
    await capture(
      page,
      `plan-ways-${way.file}-answered-${theme}`,
      "Acknowledged"
    );
  }
  if (view === "desk" && theme === "light") {
    await checkComment(kit, name, page);
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
