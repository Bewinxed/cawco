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
 * - no console error, no page error and no request answered 400 or worse;
 *   the page names a tab icon that loads;
 * - no glyph stands on a tile: the box round a glyph alone (no words of its
 *   own) draws no fill, edge or shadow, buttons apart (the owner: icons are
 *   the Solar glyph, no circle, square or box around it);
 * - at most one coral control in each drawn screen, by Day and by Night: the
 *   one act the person takes next;
 * - every switch's choices stand whole inside it, at 1440 and at 390;
 * - a create screen says nothing of a saved version (no “saved 2m ago”, no
 *   Save as v4): it is a workflow not made yet.
 *
 *   bun scripts/probe-kit/run.ts web workflows-preview
 */
import { realpathSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { HouseRules } from "../../house-rules";
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
    probe: '[data-canvas-host] [data-node="1"]',
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

/**
 * Glyphs on a tile, read in the page: for each glyph outside a button, every
 * box round it that holds no words of its own must draw no fill, edge or
 * shadow. Answers what drew one.
 */
function tiles(): string[] {
  const found = new Set<string>();
  const paints = (el: Element): string => {
    const s = getComputedStyle(el);
    const clear = (c: string) =>
      c === "transparent" ||
      // biome-ignore lint/performance/useTopLevelRegex: serialized into the page, so it lives inside the function
      /\/ 0\)$|, 0\)$/.test(c);
    if (!clear(s.backgroundColor) || s.backgroundImage !== "none") {
      return "a fill";
    }
    if (s.boxShadow !== "none") {
      return "a shadow";
    }
    const edged = ["Top", "Right", "Bottom", "Left"].some(
      (side) =>
        Number.parseFloat(
          s.getPropertyValue(`border-${side.toLowerCase()}-width`)
        ) > 0 &&
        s.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none" &&
        !clear(s.getPropertyValue(`border-${side.toLowerCase()}-color`))
    );
    return edged ? "an edge" : "";
  };
  for (const glyph of document.querySelectorAll("svg.ic")) {
    if (glyph.closest('button, [role="button"]')) {
      continue;
    }
    // A tile hugs its glyph: a box no more than two and a half glyphs across
    // and down. A row's cell (a ledger's lead column) is the row's, not a tile.
    const size = glyph.getBoundingClientRect();
    const hugs = (box: Element) => {
      const r = box.getBoundingClientRect();
      return r.width <= size.width * 2.5 && r.height <= size.height * 2.5;
    };
    for (
      let box = glyph.parentElement;
      box &&
      (box.textContent ?? "").trim() === "" &&
      !box.matches("td, th, tr") &&
      hugs(box);
      box = box.parentElement
    ) {
      const what = paints(box);
      if (what) {
        found.add(
          `${box.localName}.${[...box.classList].join(".")} draws ${what} round a glyph`
        );
      }
    }
  }
  return [...found];
}

/**
 * Coral controls in each drawn screen (a `.fit`): a control whose fill, first
 * gradient stop or edge is the coral hue (OKLCH chroma over 0.1, hue 26 to
 * 45: the action, the chosen keycap, brand-solid; crimson's 15 and spark's 95
 * are not). Answers each screen's count and what it counted.
 */
function corals(): { count: number; frame: string; what: string[] }[] {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ink = canvas.getContext("2d", { willReadFrequently: true });
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page, so it lives inside the function
  const COLOR = /(?:oklch|oklab|rgba?|color|lab|lch)\([^()]*\)/;
  const coral = (css: string): boolean => {
    if (!ink || css === "transparent") {
      return false;
    }
    ink.clearRect(0, 0, 1, 1);
    ink.fillStyle = "#000";
    ink.fillStyle = css;
    ink.fillRect(0, 0, 1, 1);
    const [r8, g8, b8, a8] = ink.getImageData(0, 0, 1, 1).data;
    if ((a8 ?? 0) < 128) {
      return false;
    }
    const lin = (v: number) => {
      const c = v / 255;
      return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = [lin(r8 ?? 0), lin(g8 ?? 0), lin(b8 ?? 0)];
    const l = Math.cbrt(
      0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b
    );
    const m = Math.cbrt(
      0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b
    );
    const s = Math.cbrt(
      0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b
    );
    const A = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
    const B = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
    const chroma = Math.hypot(A, B);
    const hue = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
    return chroma > 0.1 && hue >= 26 && hue <= 45;
  };
  const CONTROL = 'button, [role="button"], [role="menuitem"], .opt, .chip';
  /** Drawn inside the screen: a box of some size, seen, within the frame. */
  const shown = (el: Element, frame: DOMRect): boolean => {
    const box = el.getBoundingClientRect();
    return (
      box.width > 0 &&
      box.height > 0 &&
      getComputedStyle(el).visibility === "visible" &&
      box.right > frame.left &&
      box.left < frame.right &&
      box.bottom > frame.top &&
      box.top < frame.bottom
    );
  };
  /** Its fill, its fill's first gradient stop or its edge is coral. */
  const paintsCoral = (el: Element): boolean => {
    const s = getComputedStyle(el);
    const stop = COLOR.exec(s.backgroundImage)?.[0] ?? "";
    const edge =
      Number.parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none"
        ? s.borderTopColor
        : "transparent";
    return (
      coral(s.backgroundColor) || (stop !== "" && coral(stop)) || coral(edge)
    );
  };
  return [...document.querySelectorAll("#stage .fit")].map((fit) => {
    const frame = fit.getBoundingClientRect();
    const hits = new Set<Element>();
    for (const el of fit.querySelectorAll("*")) {
      const control = el.closest(CONTROL);
      if (control && shown(el, frame) && paintsCoral(el)) {
        hits.add(control);
      }
    }
    const what = [...hits].map(
      (el) =>
        `${el.localName}.${[...el.classList].join(".")} “${(el.textContent ?? "").trim().slice(0, 24) || el.getAttribute("aria-label")}”`
    );
    return {
      count: hits.size,
      frame:
        fit.querySelector("[data-frame]")?.getAttribute("data-frame") ?? "",
      what,
    };
  });
}

/** Every switch's choices whole inside it, and every switch inside the screen. */
function switchesWhole(): string[] {
  const found: string[] = [];
  const width = document.documentElement.clientWidth;
  for (const name of ["Option", "Job", "Theme"]) {
    const seg = document.querySelector(`[data-seg="${name}"]`);
    if (!seg) {
      found.push(`no ${name} switch`);
      continue;
    }
    const outer = seg.getBoundingClientRect();
    if (outer.left < -0.5 || outer.right > width + 0.5) {
      found.push(
        `${name} stands past the screen (${Math.round(outer.left)}..${Math.round(outer.right)} of ${width})`
      );
    }
    for (const item of seg.querySelectorAll(".seg-item")) {
      const box = item.getBoundingClientRect();
      if (box.left < outer.left - 0.5 || box.right > outer.right + 0.5) {
        found.push(
          `${name} cuts “${(item.textContent ?? "").trim()}” (${Math.round(box.left)}..${Math.round(box.right)} in ${Math.round(outer.left)}..${Math.round(outer.right)})`
        );
      }
    }
  }
  return found;
}

/** Each drawn screen's coral controls held to one, in the page's theme now. */
async function oneCoral(kit: Kit, page: Page, tag: string): Promise<void> {
  const screens = await page.evaluate(corals);
  const over = screens.filter((one) => one.count > 1);
  kit.check(
    `${tag}: one coral control at most in each of ${screens.length} drawn screens`,
    screens.length >= 2 && over.length === 0,
    over.map((one) => `${one.frame}: ${one.what.join(", ")}`).join(" | ")
  );
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
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  // A static page: no hydration to wait for, only its module's first draw and the faces.
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#stage [data-frame]");
  await page.evaluate(() => document.fonts.ready);

  const icon = await page.evaluate(async () => {
    const href =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href;
    if (!href) {
      return "no icon link";
    }
    const answer = await fetch(href);
    return `${answer.status} ${answer.headers.get("content-type")}`;
  });
  kit.check(`${tag}: the tab icon loads`, icon.startsWith("200 image/"), icon);
  const cut = await page.evaluate(switchesWhole);
  kit.check(
    `${tag}: every switch's choices stand whole`,
    cut.length === 0,
    cut.join(" | ")
  );

  const house = new HouseRules(kit, tag, {
    scope: "#stage",
    views: "#stage .fit",
    except: [
      {
        rule: "coral",
        selector: ".nav.on",
        reason:
          "the drawn rail's selected nav row, a coral DESIGN.md:596 sanctions beside the act (the mock row carries no aria-current to say so)",
      },
      {
        rule: "glyph",
        selector: ".composer",
        reason:
          "the Split's composer Send, on the composer's recipe (DESIGN.md:919), secondary while the run asks so Answer keeps the coral",
      },
    ],
  });
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
      const boxed = await page.evaluate(tiles);
      kit.check(
        `${tag} ${option} ${job}: no glyph on a tile (glyphs alone, buttons apart)`,
        boxed.length === 0,
        boxed.slice(0, 6).join(" | ")
      );
      await oneCoral(kit, page, `${tag} Day ${option} ${job}`);
      await house.at(page, `Day ${option} ${job}`);
      if (job === "create") {
        const words = await page.evaluate(
          () => document.querySelector("#stage")?.textContent ?? ""
        );
        const edits = ["Save as v4", "saved 2m ago"].filter((w) =>
          words.includes(w)
        );
        kit.check(
          `${tag} ${option} create: a create footer, none of Edit's (no saved version, no Save as v4)`,
          edits.length === 0,
          edits.join(", ")
        );
      }
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
  for (const option of OPTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: one option and job at a time, by Night
    await pick(page, "Option", option);
    for (const job of JOBS) {
      // biome-ignore lint/performance/noAwaitInLoops: one job at a time, by Night
      await pick(page, "Job", job);
      await oneCoral(kit, page, `${tag} Night ${option} ${job}`);
      await house.at(page, `Night ${option} ${job}`);
    }
  }
  house.report();
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
