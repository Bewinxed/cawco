/**
 * The Workflows options preview (design-previews/workflows/), a static page
 * served as its folder, held to what the owner reads on it, on Chromium and
 * WebKit at the desk's 1440 and the phone's 390:
 *
 * - nothing spills and no control covers text (journeys/scan.ts), read down
 *   the whole page for every option and every job, and the page never
 *   scrolls sideways;
 * - each switch shows its state: the chosen segment is pressed, the thumb
 *   stands under it, and the stage draws that option and job; Night turns
 *   the page's ground dark;
 * - each named motion, on a held clock sought to 0, ½ and 1, moves its
 *   value continuously (½ strictly between the ends) and plays to its end;
 * - no console error and no page error.
 *
 *   bun scripts/probe-kit/run.ts web workflows-preview
 */
import { realpathSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { scan } from "../../journeys/scan";
import type { Engine, Kit, Spec, View } from "../../kit";
import { kitsOwnMessage, ROOT, readMotion, stillWithin } from "../../kit";

const DIR = realpathSync(join(ROOT, "design-previews", "workflows"));
const OPTIONS = ["A", "B", "C", "D"] as const;
const JOBS = ["create", "edit", "run", "evaluate", "delete"] as const;

interface Motion {
  id: string;
  job: (typeof JOBS)[number];
  option: (typeof OPTIONS)[number];
  /** What moves, and the value of it read at each fraction. */
  probe: string;
  prop: "opacity" | "height" | "top" | "left";
}

const MOTIONS: Motion[] = [
  {
    option: "A",
    id: "a-redraw",
    job: "create",
    probe: '[data-shape] [data-node="6"]',
    prop: "opacity",
  },
  {
    option: "B",
    id: "b-add",
    job: "create",
    probe: "[data-new-step]",
    prop: "height",
  },
  {
    option: "B",
    id: "b-shape",
    job: "edit",
    probe: "[data-swap] > [data-shape]",
    prop: "opacity",
  },
  {
    option: "B",
    id: "b-unfold",
    job: "run",
    probe: "[data-fold]",
    prop: "height",
  },
  {
    option: "C",
    id: "c-add",
    job: "create",
    probe: '[data-canvas-host] [data-node="2"]',
    prop: "opacity",
  },
  {
    option: "C",
    id: "c-select",
    job: "edit",
    probe: "[data-inspector]",
    prop: "opacity",
  },
  {
    option: "D",
    id: "d-keep",
    job: "create",
    probe: "[data-keep-src]",
    prop: "top",
  },
  {
    option: "D",
    id: "d-prune",
    job: "edit",
    probe: "[data-prune-row]",
    prop: "height",
  },
];

/** The folder, served as itself; nothing outside it. */
function serve(): { stop: () => void; url: string } {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(join(DIR, path === "/" ? "index.html" : path));
      if (!file.startsWith(`${DIR}/`)) {
        return new Response("not here", { status: 404 });
      }
      return new Response(Bun.file(file));
    },
  });
  return {
    stop: () => server.stop(true),
    url: `http://127.0.0.1:${server.port}/`,
  };
}

const readValue = (page: Page, probe: string, prop: Motion["prop"]) =>
  page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel);
      if (!el) {
        return Number.NaN;
      }
      const box = el.getBoundingClientRect();
      if (p === "height") {
        return box.height;
      }
      if (p === "top") {
        return box.top;
      }
      if (p === "left") {
        return box.left;
      }
      return Number.parseFloat(getComputedStyle(el).opacity);
    },
    [probe, prop] as const
  );

/** Presses a segment and waits for the page to stand still. */
async function pick(page: Page, group: string, value: string): Promise<void> {
  await page
    .locator(`[data-seg="${group}"] [data-value="${value}"]`)
    .first()
    .click();
  await stillWithin(page, "body", { ms: 3000 });
}

/** The switch's state, read off the engine. */
const switchState = (page: Page, group: string) =>
  page.evaluate((name) => {
    const seg = document.querySelector(`[data-seg="${name}"]`);
    const pressed = [...(seg?.querySelectorAll('[aria-pressed="true"]') ?? [])];
    const thumb = seg?.querySelector(".seg-thumb")?.getBoundingClientRect();
    const on = pressed[0]?.getBoundingClientRect();
    return {
      count: pressed.length,
      value: (pressed[0] as HTMLElement | undefined)?.dataset.value ?? "",
      off:
        thumb && on
          ? Math.max(
              Math.abs(thumb.left - on.left),
              Math.abs(thumb.width - on.width)
            )
          : 99,
    };
  }, group);

/** The whole page scanned screen by screen, and its width. */
async function sweep(page: Page): Promise<string[]> {
  const found: string[] = [];
  const { height, total, sideways } = await page.evaluate(() => ({
    height: window.innerHeight,
    total: document.documentElement.scrollHeight,
    sideways:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  if (sideways > 1) {
    found.push(`the page scrolls sideways by ${sideways}px`);
  }
  for (let y = 0; y < total; y += height - 60) {
    // biome-ignore lint/performance/noAwaitInLoops: one screen at a time, each scrolled to and read in turn
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await stillWithin(page, "body", { ms: 3000 });
    for (const line of await page.evaluate(scan)) {
      found.push(`at ${y}px: ${line}`);
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return [...new Set(found)];
}

async function onePage(
  kit: Kit,
  url: string,
  engine: Engine,
  view: View
): Promise<void> {
  const tag = `${engine} ${view}`;
  const page = await kit.page(view, { engine, theme: "light" });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  // A static page: no hydration to wait for, only its module's first draw and the faces.
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#stage [data-frame]");
  await page.evaluate(() => document.fonts.ready);

  for (const option of OPTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: the page walks one option and job at a time
    await pick(page, "Option", option);
    for (const job of JOBS) {
      // biome-ignore lint/performance/noAwaitInLoops: one job at a time, each drawn and swept in turn
      await pick(page, "Job", job);
      const opt = await switchState(page, "Option");
      const jb = await switchState(page, "Job");
      const drawn = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>("#stage");
        return {
          option: stage?.dataset.option,
          job: stage?.dataset.job,
          frames: document.querySelectorAll("#stage [data-frame]").length,
        };
      });
      kit.check(
        `${tag} ${option} ${job}: both switches show it (pressed, thumb under it) and the stage draws it`,
        opt.count === 1 &&
          opt.value === option &&
          opt.off < 1 &&
          jb.count === 1 &&
          jb.value === job &&
          jb.off < 1 &&
          drawn.option === option &&
          drawn.job === job &&
          drawn.frames >= 2,
        JSON.stringify({ opt, jb, drawn })
      );
      const found = process.env.WF_QUICK ? [] : await sweep(page);
      kit.check(
        `${tag} ${option} ${job}: nothing spills, nothing covers text`,
        found.length === 0,
        found.slice(0, 6).join(" | ")
      );
    }
  }

  await pick(page, "Theme", "dark");
  const ground = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  kit.check(
    `${tag} Night: the page turns dark`,
    ground.dark && ground.scheme === "dark",
    JSON.stringify(ground)
  );
  await pick(page, "Theme", "light");

  // The switch's own glide, and the stage arriving.
  await pick(page, "Option", "A");
  await pick(page, "Job", "create");
  const glide = await readMotion(
    page,
    () => page.locator('[data-seg="Job"] [data-value="evaluate"]').click(),
    '[data-seg="Job"]',
    {
      fractions: [0, 0.5, 1],
      read: () => readValue(page, '[data-seg="Job"] .seg-thumb', "left"),
    }
  );
  await motionCheck(kit, page, `${tag} switch glide`, glide, () =>
    readValue(page, '[data-seg="Job"] .seg-thumb', "left")
  );
  const swap = await readMotion(
    page,
    () => page.locator('[data-seg="Option"] [data-value="B"]').click(),
    "#option",
    {
      fractions: [0, 0.5, 1],
      read: () => readValue(page, "#stage", "opacity"),
    }
  );
  await motionCheck(kit, page, `${tag} stage arrives`, swap, () =>
    readValue(page, "#stage", "opacity")
  );

  for (const m of MOTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: one motion at a time on one page
    await pick(page, "Option", m.option);
    await pick(page, "Job", m.job);
    await page.locator(`[data-play="run:${m.id}"]`).scrollIntoViewIfNeeded();
    await page.locator("#stage").scrollIntoViewIfNeeded();
    const read = await readMotion(
      page,
      () => page.locator(`[data-play="run:${m.id}"]`).click(),
      "#stage",
      {
        fractions: [0, 0.5, 1],
        read: () => readValue(page, m.probe, m.prop),
      }
    );
    await motionCheck(kit, page, `${tag} ${m.option} ${m.id}`, read, () =>
      readValue(page, m.probe, m.prop)
    );
  }

  kit.check(
    `${tag}: no console error, no page error`,
    errors.length === 0,
    errors.slice(0, 4).join(" | ")
  );
  await page.close();
}

/**
 * A motion read on the held clock: its value at 0, ½ and 1 moves (½ strictly
 * between the ends), and once let go it lands where 1 stood. A run sought to
 * its very end leaves the page's getAnimations() (it is no longer in effect),
 * so its landing is read off the value itself, not off its `finished`.
 */
async function motionCheck(
  kit: Kit,
  page: Page,
  name: string,
  read: { at: { fraction: number; value: unknown }[]; runs: unknown[] },
  landed: () => Promise<number>
): Promise<void> {
  const [start, mid, end] = read.at.map((each) => Number(each.value));
  await stillWithin(page, "body", { ms: 3000 });
  const rest = await landed();
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  kit.check(
    `${name}: moves continuously at 0, ½, 1 and lands at 1`,
    read.runs.length > 0 &&
      Number.isFinite(mid) &&
      hi - lo > 0.01 &&
      mid > lo &&
      mid < hi &&
      Math.abs(rest - end) < 0.5,
    `values ${[start, mid, end, rest].map((v) => Math.round(v * 1000) / 1000).join(" → ")} (the last at rest); ${read.runs.length} run(s)`
  );
}

const run = async (kit: Kit): Promise<void> => {
  const server = serve();
  try {
    const quick = Boolean(process.env.WF_QUICK);
    for (const engine of quick
      ? (["chromium"] as const)
      : (["chromium", "webkit"] as const)) {
      for (const view of quick
        ? (["desk"] as const)
        : (["desk", "phone"] as const)) {
        // biome-ignore lint/performance/noAwaitInLoops: one page at a time
        await onePage(kit, server.url, engine, view);
      }
    }
  } finally {
    server.stop();
  }
};

const spec: Spec = { name: "workflows-preview", run };
export default spec;
