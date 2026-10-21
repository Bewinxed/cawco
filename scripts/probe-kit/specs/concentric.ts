/**
 * The house kit's nested corners keep DESIGN.md's Concentric Rule, and its
 * fractional strokes keep their width on every screen. Read from the engine,
 * on the dashboard's stage (stage-host/host.ts, started in apps/dashboard as
 * sheet-weight starts it), each states file drawn as a decision page's
 * Preview draws it (`by=embed`: its frames in the page's own flow, never
 * scaled, in the page's light scheme), its rest frames read:
 *
 * 1. Every nested pair in the popover's, the dropdown menu's, the segmented
 *    control's and the canvas stages' frames: a rounded box whose corner
 *    stands the same gap in from both edges of the nearest rounded box
 *    holding it, nearer than that box's radius (so its corner stands inside
 *    the outer's curve). Its outer radius is its inner radius plus that gap,
 *    the edge counted, within 0.5px. Radii as drawn: a radius past half its
 *    box's side is cut to fit, as CSS cuts it.
 * 2. The canvas's corner grips draw their `c-corner-grip-stroke` (1.5px) at
 *    1.5 CSS px at device scale 1 and 3: the drawn width as the engine
 *    computes it (a border's used width, which Chromium snaps to whole device
 *    pixels; an inset ring's spread, which it never snaps), and the ink of
 *    the straight run of the top-left grip's top leg, measured once per
 *    scale: its coverage summed down one device column, over the scale.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");

/** The states files read, from the dashboard's root. */
const FILES = {
  popover: "src/lib/components/ui/popover/popover.stories.ts",
  dropdown: "src/lib/components/ui/dropdown-menu/dropdown-menu.stories.ts",
  segmented: "src/lib/components/ui/tabs/segmented.stories.ts",
  stages: "src/lib/cawco/canvas/CanvasStages.stories.ts",
} as const;

/** Outer radius = inner radius + gap, within this. */
const RADIUS_SLACK = 0.5;
/** The grip's stroke, CSS px (`--c-corner-grip-stroke`). */
const STROKE = 1.5;
/** A drawn width within this of the stroke's. */
const STROKE_SLACK = 0.1;
/** The device scales the stroke is read at: a desk's screen and a phone's. */
const SCALES = [1, 3] as const;

/** One nested pair at one corner, as the page measured it. */
interface Pair {
  corner: string;
  gap: number;
  inner: string;
  innerR: number;
  outer: string;
  outerR: number;
  story: string;
}

/** What draws one corner grip's stroke, as the engine computes it. */
interface Stroke {
  handle: string;
  /** How it is drawn, and the widths it draws. */
  how: string;
  widths: number[];
}

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** The rest frames of `file`, drawn and settled: no animation or transition still running. */
async function openFile(page: Page, base: string, file: string) {
  await page.goto(
    `${base}/@cawco/canvas?by=embed&file=${encodeURIComponent(file)}`,
    { waitUntil: "load" }
  );
  await page.waitForFunction(
    (wanted) => {
      const sections =
        (
          window as unknown as {
            __cawcoCanvas?: {
              report?: {
                sections: { file: string; frames: { state: string }[] }[];
              };
            };
          }
        ).__cawcoCanvas?.report?.sections ?? [];
      const section = sections.find((one) => one.file === wanted);
      return (
        !!section &&
        section.frames.length > 0 &&
        section.frames.every(
          (frame) => frame.state === "drawn" || frame.state === "unshown"
        )
      );
    },
    file,
    { timeout: 90_000 }
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((motion) => motion.playState !== "running"),
    undefined,
    { timeout: 10_000 }
  );
}

/** The selector of `file`'s rest frames' bodies: an embed draws each in the page's scheme, light here. */
const restBodies = (file: string) =>
  `.cawco-frame[data-cawco-file="${file}"][data-cawco-interaction="rest"] > .cawco-frame-body`;

/** Every nested pair in the frames' bodies `selector` names. In the page. */
function nestedPairs(args: { selector: string; slack: number }): Pair[] {
  const name = (el: Element) => {
    const slot = el.getAttribute("data-slot");
    const classes = (el.getAttribute("class") ?? "")
      .split(" ")
      .filter(
        (one) =>
          one.startsWith("rounded") || one.startsWith("p-") || one === "border"
      )
      .join(" ");
    return `${el.localName}${slot ? `[${slot}]` : ""}${classes ? ` (${classes})` : ""}`;
  };
  const shown = (el: Element) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return (
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0 &&
      box.width > 0 &&
      box.height > 0
    );
  };
  /** Its four corners' radii as drawn, CSS px: each cut as CSS cuts radii past their box. */
  const radii = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const one = (value: string) => {
      const [x] = value.split(" ");
      return x.endsWith("%")
        ? (Number.parseFloat(x) / 100) * w
        : Number.parseFloat(x) || 0;
    };
    const r = {
      tl: one(style.borderTopLeftRadius),
      tr: one(style.borderTopRightRadius),
      br: one(style.borderBottomRightRadius),
      bl: one(style.borderBottomLeftRadius),
    };
    const f = Math.min(
      1,
      w / (r.tl + r.tr || 1),
      w / (r.bl + r.br || 1),
      h / (r.tl + r.bl || 1),
      h / (r.tr + r.br || 1)
    );
    return {
      tl: r.tl * f,
      tr: r.tr * f,
      br: r.br * f,
      bl: r.bl * f,
    };
  };
  const rounded = (r: ReturnType<typeof radii>) =>
    r.tl > 0 || r.tr > 0 || r.br > 0 || r.bl > 0;
  /** It draws a surface: a fill, an edge or a shadow. A box that draws none (a hit area) is no surface. */
  const paints = (el: Element) => {
    const style = getComputedStyle(el);
    return (
      (style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        style.backgroundColor !== "transparent") ||
      style.backgroundImage !== "none" ||
      style.boxShadow !== "none" ||
      ["Top", "Right", "Bottom", "Left"].some(
        (side) =>
          style.getPropertyValue(`border-${side.toLowerCase()}-style`) !==
            "none" &&
          Number.parseFloat(
            style.getPropertyValue(`border-${side.toLowerCase()}-width`)
          ) > 0
      )
    );
  };
  /** The nearest shown rounded box holding `inner` inside `body`; null when none does. */
  const holderOf = (inner: HTMLElement, body: HTMLElement) => {
    let outer = inner.parentElement;
    while (outer && outer !== body) {
      if (rounded(radii(outer)) && shown(outer)) {
        return outer;
      }
      outer = outer.parentElement;
    }
    return null;
  };
  /** Each corner of `inner` that stands the same gap in from both of `outer`'s edges, inside its curve: a nested corner the rule speaks of. */
  const cornersOf = (
    outer: HTMLElement,
    inner: HTMLElement,
    zoom: number,
    story: string
  ): Pair[] => {
    const or = radii(outer);
    const ir = radii(inner);
    const a = outer.getBoundingClientRect();
    const b = inner.getBoundingClientRect();
    const gaps = {
      tl: [(b.left - a.left) / zoom, (b.top - a.top) / zoom],
      tr: [(a.right - b.right) / zoom, (b.top - a.top) / zoom],
      br: [(a.right - b.right) / zoom, (a.bottom - b.bottom) / zoom],
      bl: [(b.left - a.left) / zoom, (a.bottom - b.bottom) / zoom],
    } as const;
    return (["tl", "tr", "br", "bl"] as const)
      .map((corner) => ({ corner, x: gaps[corner][0], y: gaps[corner][1] }))
      .filter(
        ({ corner, x, y }) =>
          Math.abs(x - y) <= args.slack &&
          (x + y) / 2 >= -args.slack &&
          (x + y) / 2 < or[corner]
      )
      .map(({ corner, x, y }) => ({
        story,
        corner,
        outer: name(outer),
        outerR: Number(or[corner].toFixed(3)),
        inner: name(inner),
        innerR: Number(ir[corner].toFixed(3)),
        gap: Number(((x + y) / 2).toFixed(3)),
      }));
  };
  const pairs: Pair[] = [];
  for (const body of document.querySelectorAll<HTMLElement>(args.selector)) {
    const story = body.parentElement?.dataset.cawcoStory ?? "?";
    // The canvas's own zoom on a frame wider than the embed: rects are
    // undone by it, radii are never zoomed.
    const zoom = body.getBoundingClientRect().width / body.offsetWidth || 1;
    for (const inner of body.querySelectorAll<HTMLElement>("*")) {
      const outer =
        inner instanceof SVGElement || !shown(inner)
          ? null
          : holderOf(inner, body);
      // A surface: rounded, or drawing something (a hit area draws nothing).
      if (outer && (rounded(radii(inner)) || paints(inner))) {
        pairs.push(...cornersOf(outer, inner, zoom, story));
      }
    }
  }
  return pairs;
}

/** What draws each corner grip's stroke in the frames `selector` names, as the engine computes it. In the page. */
function gripStrokes(selector: string): Stroke[] {
  const strokes: Stroke[] = [];
  for (const body of document.querySelectorAll<HTMLElement>(selector)) {
    for (const grab of body.querySelectorAll<HTMLElement>(
      '[data-canvas-stages-grab="top-left"], [data-canvas-stages-grab="top-right"]'
    )) {
      const handle = grab.dataset.canvasStagesGrab ?? "?";
      for (const el of grab.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        const borders = [
          style.borderTopWidth,
          style.borderLeftWidth,
          style.borderRightWidth,
        ]
          .filter(
            (_, i) =>
              [
                style.borderTopStyle,
                style.borderLeftStyle,
                style.borderRightStyle,
              ][i] !== "none"
          )
          .map(Number.parseFloat)
          .filter((width) => width > 0);
        if (borders.length > 0) {
          strokes.push({ handle, how: "border", widths: borders });
        }
        // An inset ring: `inset 0 0 0 <spread>` among the element's shadows.
        const spreads = [
          ...style.boxShadow.matchAll(
            /(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px inset/g
          ),
        ]
          .map((match) => Number.parseFloat(match[4]))
          .filter((spread) => spread > 0);
        if (spreads.length > 0) {
          strokes.push({ handle, how: "inset ring", widths: spreads });
        }
      }
    }
  }
  return strokes;
}

/**
 * The ink of the top-left grip's top leg, CSS px: one device column through
 * its straight run, each pixel's coverage between the surface under it and
 * the stroke's own colour (a swatch of `--border-control` set beside it),
 * summed, over the scale.
 */
async function inkWidth(page: Page, selector: string, scale: number) {
  const at = await page.evaluate((frames) => {
    const body = document.querySelector<HTMLElement>(frames);
    const grab = body?.querySelector<HTMLElement>(
      '[data-canvas-stages-grab="top-left"]'
    );
    const stage = body?.querySelector<HTMLElement>("[data-slot=canvas-stage]");
    if (!(grab && stage)) {
      return null;
    }
    const swatch = document.createElement("div");
    swatch.dataset.probe = "ink";
    swatch.style.cssText =
      "position:absolute;inset-block-end:8px;inset-inline-end:8px;inline-size:8px;block-size:8px;background:var(--border-control)";
    stage.append(swatch);
    const leg = grab.getBoundingClientRect();
    const box = swatch.getBoundingClientRect();
    const corner = stage.getBoundingClientRect();
    // The grip's L stands `--c-corner-grip-inset` in; its top leg runs
    // straight past its curve, two thirds along its length.
    const inset = Number.parseFloat(
      getComputedStyle(stage).getPropertyValue("--c-corner-grip-inset")
    );
    const length = Number.parseFloat(
      getComputedStyle(stage).getPropertyValue("--c-corner-grip-leg")
    );
    return {
      column: {
        x: leg.left + inset + (length * 2) / 3,
        y: corner.top + inset - 2,
      },
      swatch: { x: box.left + 2, y: box.top + 2 },
      surface: {
        x: leg.left + inset + (length * 2) / 3,
        y: corner.top + inset + 6,
      },
    };
  }, selector);
  if (!at) {
    return null;
  }
  const shot = async (x: number, y: number, h: number) =>
    PNG.sync.read(
      await page.screenshot({
        clip: { x, y, width: 1, height: h },
        scale: "device",
        animations: "disabled",
      })
    );
  const pixel = (png: PNG, row: number): number => {
    const i = (row * png.width + Math.floor(png.width / 2)) * 4;
    // Luma, sRGB: the stroke and the surface differ in lightness alone.
    return (
      0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]
    );
  };
  const ink = pixel(await shot(at.swatch.x, at.swatch.y, 1), 0);
  const ground = pixel(await shot(at.surface.x, at.surface.y, 1), 0);
  const column = await shot(at.column.x, at.column.y, 6);
  let covered = 0;
  for (let row = 0; row < column.height; row += 1) {
    const value = pixel(column, row);
    covered += Math.min(1, Math.max(0, (ground - value) / (ground - ink)));
  }
  await page.evaluate(() =>
    document.querySelector("[data-probe=ink]")?.remove()
  );
  return {
    width: Number((covered / scale).toFixed(3)),
    ink: Math.round(ink),
    ground: Math.round(ground),
  };
}

const run = async (kit: Kit) => {
  const host = join(APP, ".cawco/stage/host.mjs");
  mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
  writeFileSync(host, await buildStageHost());
  const port = await freePort();
  const stage = spawn("bun", [host], {
    cwd: APP,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: "1",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let words = "";
  stage.stdout.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  stage.stderr.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  try {
    await until(
      "the stage's ready",
      () => words,
      (text) => text.includes('"cawco":"ready"'),
      60_000
    );
    const base = `http://127.0.0.1:${port}`;

    // 1. The Concentric Rule, on every nested pair the four files draw.
    const page = await kit.page("desk", { scale: 1 });
    for (const [what, file] of Object.entries(FILES)) {
      // biome-ignore lint/performance/noAwaitInLoops: one page, each file in turn
      await openFile(page, base, file);
      const pairs = await page.evaluate(nestedPairs, {
        selector: restBodies(file),
        slack: RADIUS_SLACK,
      });
      kit.check(
        `1 ${what}: its frames hold a nested pair to read`,
        pairs.length > 0,
        file
      );
      const seen = new Set<string>();
      for (const pair of pairs) {
        const line = `${pair.story}: ${pair.outer} ${pair.outerR}px ⊃ ${pair.inner} ${pair.innerR}px, ${pair.gap}px in`;
        // One line per pair and radii: its corners alike say it once.
        if (seen.has(line)) {
          continue;
        }
        seen.add(line);
        kit.check(
          `1 ${what}: outer radius = inner radius + gap (${line})`,
          Math.abs(pair.outerR - (pair.innerR + pair.gap)) <= RADIUS_SLACK,
          `${pair.outerR} vs ${pair.innerR} + ${pair.gap} = ${Number((pair.innerR + pair.gap).toFixed(3))} at ${pair.corner}`
        );
      }
    }

    // 2. The grip's stroke at device scale 1 and 3.
    for (const scale of SCALES) {
      // biome-ignore lint/performance/noAwaitInLoops: one scale's page at a time, on one stage
      const at = await kit.page("desk", { scale });
      await openFile(at, base, FILES.stages);
      const strokes = await at.evaluate(gripStrokes, restBodies(FILES.stages));
      kit.check(
        `2 @${scale}x: each corner grip draws its stroke at ${STROKE}px as the engine computes it`,
        strokes.length >= 2 &&
          strokes.every((one) =>
            one.widths.every(
              (width) => Math.abs(width - STROKE) <= STROKE_SLACK
            )
          ),
        `devicePixelRatio ${await at.evaluate(() => window.devicePixelRatio)}: ${
          strokes
            .map((one) => `${one.handle} ${one.how} ${one.widths.join("/")}px`)
            .join("; ") || "no stroke found"
        }`
      );
      const ink = await inkWidth(at, restBodies(FILES.stages), scale);
      kit.check(
        `2 @${scale}x: the top-left grip's top leg inks ${STROKE} CSS px`,
        !!ink && Math.abs(ink.width - STROKE) <= STROKE_SLACK,
        ink
          ? `${ink.width} CSS px (ink ${ink.ink}, surface ${ink.ground})`
          : "no grip found"
      );
    }
  } finally {
    stage.kill("SIGTERM");
  }
};

const spec: Spec = { name: "concentric", run };
export default spec;
