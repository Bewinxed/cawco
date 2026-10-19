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
async function stageOn(): Promise<{ base: string; stop: () => void }> {
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

async function capture(page: Page, name: string): Promise<void> {
  for (const dir of CAPS) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`) });
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
  await words.scrollIntoViewIfNeeded();
  await words.click();
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
  if (view === "phone") {
    checkPhone(kit, name, way, report, stories);
  } else {
    checkDesk(kit, name, way, report, stories);
    await checkSweeps(kit, name, page);
  }
  await capture(page, `plan-ways-${way.file}-${view}-${theme}`);
  if (view === "desk" && theme === "light") {
    await checkComment(kit, name, page);
    await capture(page, `plan-ways-${way.file}-commented-live`);
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
