/**
 * The plan layer preview (apps/dashboard/previews/plan-layer, built into its `page/`), read
 * from the engine: each variant at Desk 1440 and Phone 390 on Chromium.
 *
 * - The layer's box: across the composer's width (at most 720px), as tall as
 *   it holds up to its room (PlanPane `room`: the dock's top less 16px),
 *   holding more than that room (its column scrolls), clear of the tray row
 *   by its `space-2` step, nothing in it spilling sideways, no two rows over
 *   each other.
 * - Where it opens: the variant's own row at the column's top.
 * - It moves nothing: every transcript row stands where it stands with the
 *   layer shut.
 * - Its marks (PlanTree's tick, LiveDot and ringed dot, the fold's tick and
 *   chevron, Close's cross) sit in no bordered or filled box.
 * - Variant 1's "4 done" fold, on the clock: held and sought to 0, 0.5 and
 *   1 through the DevTools Animation domain, its height, opacity and gap
 *   read at each, and the step under way below it read moving with it.
 * - No console error and nothing thrown, the shell's page included.
 *
 *   bun scripts/probe-kit/run.ts plan-layer-preview
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { bezierAt, Clock } from "../../anim";
import { type Kit, ROOT, type Spec } from "../../kit";

const PAGE_DIR = join(ROOT, "apps/dashboard/previews/plan-layer/page");
const VARIANTS = ["1", "2", "3"] as const;
const VIEWS = ["desk", "phone"] as const;
/** The row each variant opens at, at the column's top. */
const OPENS_AT = { "1": "fold", "2": "s5", "3": "s7" } as const;

function serve(): { base: string; stop: () => void } {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const file = Bun.file(
        join(PAGE_DIR, path === "/" ? "index.html" : path.slice(1))
      );
      return (await file.exists())
        ? new Response(file)
        : new Response("not found", { status: 404 });
    },
  });
  return {
    base: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

/** What the page said wrong: console errors and uncaught throws. */
function listen(page: Page): string[] {
  const said: string[] = [];
  page.on("console", (line) => {
    if (line.type() === "error") {
      said.push(`console: ${line.text()}`);
    }
  });
  page.on("pageerror", (error) => said.push(`thrown: ${error.message}`));
  return said;
}

/** Opens a stage and waits for the layer to stand: opened, its entrance over. */
async function stage(page: Page, url: string, opened: boolean): Promise<void> {
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  if (opened) {
    await page.waitForSelector('[data-slot="plan"] [data-opened]');
    await page.evaluate(() =>
      Promise.all(
        document
          .querySelector('[data-slot="plan"]')
          ?.getAnimations({ subtree: false })
          .map((run) => run.finished) ?? []
      )
    );
  } else {
    await page.waitForSelector('[data-slot="plan-ring"]');
  }
  // Two frames: the opening scroll is set a frame after the column mounts.
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
}

/** The transcript's rows, where they stand. */
const rowTops = (page: Page): Promise<string> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="scroller"] [data-row]')]
      .map((row) => {
        const box = row.getBoundingClientRect();
        return `${box.x},${box.y},${box.width},${box.height}`;
      })
      .join(";")
  );

interface Geometry {
  bodyContent: number;
  bodyHeight: number;
  bodyScroll: number;
  cap: number;
  column: number;
  height: number;
  openRow: string | null;
  openTop: number;
  trayGap: number;
  /** The waiting row's height, and its words' line height (px). */
  waitHeight: number;
  waitLine: number;
  width: number;
}

/** The layer's box against its column, room and tray, and where it opened. */
function geometry(page: Page, openAt: string): Promise<Geometry> {
  return page.evaluate((opensAt) => {
    const layer = document.querySelector<HTMLElement>('[data-slot="plan"]');
    const body = layer?.querySelector<HTMLElement>('[data-slot="body"]');
    const lift = document.querySelector<HTMLElement>('[data-slot="lift"]');
    const tray = document.querySelector<HTMLElement>('[data-slot="tray-slot"]');
    if (!(layer && body && lift && tray)) {
      throw new Error("no layer, column or tray on the page");
    }
    const box = layer.getBoundingClientRect();
    const bodyBox = body.getBoundingClientRect();
    const row =
      opensAt === "fold"
        ? layer.querySelector<HTMLElement>('[data-slot="fold"]')
        : layer.querySelector<HTMLElement>(`[data-plan-row="${opensAt}"]`);
    const firstShown = [
      ...layer.querySelectorAll<HTMLElement>(
        '[data-slot="row"], [data-slot="fold"]'
      ),
    ].find((el) => el.getBoundingClientRect().bottom > bodyBox.top + 1);
    // The chip at the end of a waiting step's words stands in its line, as
    // a word does: the row is a whole number of the label's lines.
    const waitRow = layer.querySelector<HTMLElement>(
      '[data-waits] > [data-slot="row"] > [data-slot="text"]'
    );
    return {
      width: box.width,
      height: box.height,
      column: lift.getBoundingClientRect().width,
      cap: Number.parseFloat(layer.style.getPropertyValue("--plan-room")),
      bodyScroll: body.scrollTop,
      bodyHeight: body.clientHeight,
      bodyContent: body.scrollHeight,
      trayGap: tray.getBoundingClientRect().top - box.bottom,
      openRow:
        firstShown?.closest<HTMLElement>("[data-plan-row]")?.dataset.planRow ??
        firstShown?.dataset.slot ??
        null,
      openTop: row ? row.getBoundingClientRect().top - bodyBox.top : Number.NaN,
      waitHeight: waitRow?.getBoundingClientRect().height ?? Number.NaN,
      waitLine: waitRow
        ? Number.parseFloat(getComputedStyle(waitRow).lineHeight)
        : Number.NaN,
    };
  }, openAt);
}

/**
 * What in the layer spills: a box running past the layer's sides, or a
 * box that clips or scrolls with more than it shows sideways. A box that
 * lets its overflow show hides nothing (a control's 44px touch area runs
 * past its drawn box on purpose).
 */
function spills(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>('[data-slot="plan"]');
    if (!layer) {
      return ["no layer"];
    }
    const box = layer.getBoundingClientRect();
    const found: string[] = [];
    for (const el of layer.querySelectorAll<HTMLElement>("*")) {
      const one = el.getBoundingClientRect();
      const name = `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ""}`;
      const drawn = one.width > 0 || one.height > 0;
      if (drawn && (one.left < box.left - 0.5 || one.right > box.right + 0.5)) {
        found.push(`${name} ${one.left.toFixed(1)}–${one.right.toFixed(1)}`);
      }
      const hides = getComputedStyle(el).overflowX !== "visible";
      if (hides && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
        found.push(
          `${name} hides ${el.scrollWidth - el.clientWidth}px sideways`
        );
      }
    }
    return found;
  });
}

/** Each row's own line (its mark and words) over any other. */
function overlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const lines = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="plan"] [data-slot="row"], [data-slot="plan"] [data-slot="fold"]'
      ),
    ].map((el) => ({
      box: el.getBoundingClientRect(),
      id:
        el.closest<HTMLElement>("[data-plan-row]")?.dataset.planRow ??
        el.dataset.slot ??
        "?",
    }));
    const found: string[] = [];
    lines.forEach((one, i) => {
      for (const other of lines.slice(i + 1)) {
        const y =
          Math.min(one.box.bottom, other.box.bottom) -
          Math.max(one.box.top, other.box.top);
        const x =
          Math.min(one.box.right, other.box.right) -
          Math.max(one.box.left, other.box.left);
        if (y > 0.5 && x > 0.5) {
          found.push(`${one.id}×${other.id} ${y.toFixed(1)}px`);
        }
      }
    });
    return found;
  });
}

/**
 * Each mark in the layer (PlanTree's tick, LiveDot and ringed dot, the
 * fold's tick and chevron, Close's cross) and the box it is drawn in: its
 * parent's computed border, fill, image and shadow, none of which may draw.
 */
function marks(page: Page): Promise<{ read: number; boxed: string[] }> {
  return page.evaluate(() => {
    const CLEAR = "rgba(0, 0, 0, 0)";
    const glyphs = [
      ...document.querySelectorAll<Element>(
        '[data-slot="plan"] [data-slot="plan-mark"] > *, [data-slot="plan"] [data-slot="fold"] svg, [data-slot="plan-head"] svg'
      ),
    ];
    const edges = (css: CSSStyleDeclaration) =>
      ["top", "right", "bottom", "left"].filter(
        (side) =>
          Number.parseFloat(css.getPropertyValue(`border-${side}-width`)) > 0 &&
          css.getPropertyValue(`border-${side}-style`) !== "none" &&
          css.getPropertyValue(`border-${side}-color`) !== CLEAR
      );
    const drawing = (css: CSSStyleDeclaration): string[] => {
      const said: string[] = [];
      const sides = edges(css);
      if (sides.length > 0) {
        said.push(`bordered ${sides.join("/")}`);
      }
      if (css.backgroundColor !== CLEAR) {
        said.push(`filled ${css.backgroundColor}`);
      }
      // A gradient of clear stops (the ghost button's resting one) draws nothing.
      const image = css.backgroundImage.replaceAll(CLEAR, "");
      if (
        css.backgroundImage !== "none" &&
        ["rgb", "oklch", "#", "url("].some((ink) => image.includes(ink))
      ) {
        said.push(`an image ${css.backgroundImage}`);
      }
      if (css.boxShadow !== "none") {
        said.push(`shadow ${css.boxShadow}`);
      }
      return said;
    };
    const boxed = glyphs.flatMap((glyph) => {
      const parent = glyph.parentElement;
      if (!parent) {
        return [];
      }
      const said = drawing(getComputedStyle(parent));
      const where =
        parent.closest<HTMLElement>("[data-plan-row]")?.dataset.planRow ??
        parent.dataset.slot ??
        parent.tagName.toLowerCase();
      return said.length > 0 ? [`${where}: ${said.join(", ")}`] : [];
    });
    return { read: glyphs.length, boxed };
  });
}

async function variantAt(
  kit: Kit,
  base: string,
  variant: (typeof VARIANTS)[number],
  view: (typeof VIEWS)[number]
): Promise<void> {
  const name = `plan-layer-preview: ${variant} at ${view === "desk" ? "Desk 1440" : "Phone 390"}`;
  const page = await kit.page(view, { theme: "light" });
  const said = listen(page);
  await stage(page, `${base}/stage.html?v=${variant}&open=0`, false);
  const shut = await rowTops(page);
  await stage(page, `${base}/stage.html?v=${variant}`, true);
  const opened = await rowTops(page);
  const at = OPENS_AT[variant];
  const r = await geometry(page, at);
  const spilt = await spills(page);
  const over = await overlaps(page);
  const marked = await marks(page);
  const peek = await page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-5")
    )
  );
  const space2 = await page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    )
  );
  kit.note(
    `${name}: layer ${r.width.toFixed(1)}×${r.height.toFixed(1)}px, column ${r.column.toFixed(1)}px, room ${r.cap}px, column holds ${r.bodyContent}px in ${r.bodyHeight}px, scrolled ${r.bodyScroll}px, "${at}" ${r.openTop.toFixed(1)}px under the column's top (first row in sight: ${r.openRow}), ${r.trayGap.toFixed(1)}px over the tray row, ${marked.read} marks read`
  );
  kit.check(
    `${name}: the layer is the composer's width, at most 720px`,
    Math.abs(r.width - r.column) < 0.5 && r.width <= 720.5,
    `${r.width} against the column's ${r.column}`
  );
  kit.check(
    `${name}: the layer stands within its room`,
    r.cap > 0 && r.height <= r.cap + 0.5,
    `${r.height} against ${r.cap}`
  );
  kit.check(
    `${name}: the plan is taller than the room, so its column scrolls`,
    r.bodyContent > r.bodyHeight + 1,
    `${r.bodyContent} in ${r.bodyHeight}`
  );
  kit.check(
    `${name}: the layer stands a space-2 step over the tray row`,
    Math.abs(r.trayGap - space2) < 0.5,
    `${r.trayGap} against ${space2}`
  );
  if (variant === "2") {
    kit.check(
      `${name}: it opens at the step under way, the row before it peeking`,
      r.bodyScroll > 0 && Math.abs(r.openTop - peek) < 1,
      `s5 at ${r.openTop}, peek ${peek}, scrolled ${r.bodyScroll}`
    );
  } else {
    kit.check(
      `${name}: it opens at its top, ${at} first`,
      r.bodyScroll === 0 && r.openRow === at,
      `scrolled ${r.bodyScroll}, first ${r.openRow}`
    );
  }
  kit.check(
    `${name}: nothing in it spills sideways`,
    spilt.length === 0,
    spilt.slice(0, 6).join("; ")
  );
  kit.check(
    `${name}: no two rows overlap`,
    over.length === 0,
    over.slice(0, 6).join("; ")
  );
  kit.check(
    `${name}: no mark sits in a bordered or filled box`,
    marked.read > 0 && marked.boxed.length === 0,
    marked.boxed.slice(0, 6).join("; ")
  );
  kit.check(
    `${name}: the Waiting on you chip keeps its step's lines`,
    // Within half a pixel of whole lines: Blink lays a flex box out in
    // 1/64px units and aligns the chip's label by a baseline it rounds, which
    // reads a third of a pixel on a 16.9px line; a chip that grew its line
    // (its own 18px line in this 16.9px one) read 1.1px.
    Math.abs(
      r.waitHeight - Math.round(r.waitHeight / r.waitLine) * r.waitLine
    ) < 0.5,
    `${r.waitHeight.toFixed(2)}px on ${r.waitLine}px lines`
  );
  kit.check(
    `${name}: the transcript stands where it stood with the layer shut`,
    shut.length > 0 && shut === opened,
    `${shut} | ${opened}`
  );
  if (variant === "1") {
    await foldOnClock(kit, page, name);
  }
  kit.check(`${name}: no console error`, said.length === 0, said.join("; "));
  await page.close();
}

/** Variant 1's fold opening, held and read at 0, 0.5 and 1 of its clock. */
async function foldOnClock(kit: Kit, page: Page, name: string): Promise<void> {
  const clock = await Clock.on(page);
  const before = await page.evaluate(() => {
    const row = document.querySelector('[data-plan-row="s5"]');
    return row?.getBoundingClientRect().top ?? Number.NaN;
  });
  const runs = await clock.catchRuns(
    () => page.click('[data-slot="fold"]'),
    '[data-slot="now"]',
    3000,
    { loops: false }
  );
  kit.note(
    `${name}: fold runs ${runs.map((one) => `${one.type} ${one.name || "-"} ${Math.round(one.end)}ms ${one.easing}`).join("; ")}`
  );
  const readings: string[] = [];
  const heights: number[] = [];
  for (const fraction of [0, 0.5, 1]) {
    // biome-ignore lint/performance/noAwaitInLoops: one point of the clock at a time
    await clock.seek(fraction);
    const at = await page.evaluate((top0) => {
      const folded = document.querySelector<HTMLElement>(
        '[data-slot="folded"]'
      );
      const row = document.querySelector('[data-plan-row="s5"]');
      if (!folded) {
        return null;
      }
      const css = getComputedStyle(folded);
      return {
        height: folded.getBoundingClientRect().height,
        opacity: Number(css.opacity),
        gap: Number.parseFloat(css.marginBlockEnd),
        moved: (row?.getBoundingClientRect().top ?? Number.NaN) - top0,
      };
    }, before);
    if (at) {
      heights.push(at.height);
      readings.push(
        `${fraction}: height ${at.height.toFixed(1)}px, opacity ${at.opacity.toFixed(3)}, gap ${at.gap.toFixed(2)}px, step under way moved ${at.moved.toFixed(1)}px`
      );
    } else {
      readings.push(`${fraction}: no folded rows`);
    }
  }
  kit.note(`${name}: fold by seek: ${readings.join(" | ")}`);
  const curve = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--ease-out")
      .trim()
  );
  const pop = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--dur-pop")
      .trim()
  );
  await clock.release();
  const natural = await page.evaluate(
    () =>
      new Promise<number>((done) =>
        setTimeout(
          () =>
            done(
              document
                .querySelector('[data-slot="folded"]')
                ?.getBoundingClientRect().height ?? Number.NaN
            ),
          600
        )
      )
  );
  const [h0, h5, h1] = heights;
  kit.check(
    `${name}: the fold grows from nothing to the rows' own height`,
    heights.length === 3 &&
      h0 < 0.5 &&
      h5 > h0 &&
      h1 > h5 &&
      Math.abs(h1 - natural) < 0.5,
    `${heights.join(", ")} against ${natural}`
  );
  // The house's lengths are written in seconds or milliseconds.
  const ms = (token: string) =>
    token.endsWith("ms")
      ? Number.parseFloat(token)
      : Number.parseFloat(token) * 1000;
  const run = runs.find((one) => one.type === "WebAnimation");
  kit.check(
    `${name}: the fold runs on the house's pop length`,
    run !== undefined && Math.abs(run.end - ms(pop)) < 0.5,
    `${run?.end}ms against --dur-pop ${pop}`
  );
  // Svelte samples a transition's easing into its keyframes (the run reads
  // linear), so the curve is read off the height: half way through the
  // clock it stands where --ease-out stands half way.
  const expected = bezierAt(curve, 0.5);
  const reached = h1 > 0 ? h5 / h1 : Number.NaN;
  kit.check(
    `${name}: the fold rides --ease-out`,
    Math.abs(reached - expected) < 0.01,
    `${reached.toFixed(4)} of its height at 0.5 against --ease-out ${curve} at 0.5: ${expected.toFixed(4)}`
  );
  const expanded = await page.getAttribute(
    '[data-slot="fold"]',
    "aria-expanded"
  );
  kit.check(
    `${name}: the fold says it is open`,
    expanded === "true",
    `${expanded}`
  );
}

async function shell(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  const said = listen(page);
  await page.goto(`${base}/index.html?v=2&w=phone`, { waitUntil: "load" });
  const frame = page.frameLocator("iframe");
  await frame.locator('[data-slot="plan"] [data-opened]').waitFor();
  await page
    .getByRole("button", { name: "What waits on you, then the rest" })
    .click();
  await frame.locator('[data-slot="plan"] [data-opened="top"]').waitFor();
  const size = await page.evaluate(() => {
    const iframe = document.querySelector("iframe");
    return iframe ? `${iframe.width}×${iframe.height}` : "none";
  });
  kit.check(
    "plan-layer-preview: the shell switches variants in the phone's frame",
    size === "390×844" && page.url().includes("v=3"),
    `${size} ${page.url()}`
  );
  kit.check(
    "plan-layer-preview: the shell says nothing wrong",
    said.length === 0,
    said.join("; ")
  );
  await page.close();
}

const spec: Spec = {
  name: "plan-layer-preview",
  run: async (kit) => {
    const { base, stop } = serve();
    try {
      for (const variant of VARIANTS) {
        for (const view of VIEWS) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time
          await variantAt(kit, base, variant, view);
        }
      }
      await shell(kit, base);
    } finally {
      stop();
    }
  },
};
export default spec;
