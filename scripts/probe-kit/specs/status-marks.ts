/**
 * Every status mark is a solid Solar bold glyph (DESIGN.md, The failure mark
 * and the blocked mark; Badge; Session status), read from the engine on the
 * dashboard's stage (stage-host/host.ts, started as held-post-row starts it)
 * over TaskCard.stories.ts and SessionStatus.stories.ts, each story drawn
 * light and dark (`scheme=both`). A glyph is named by its drawing: its
 * paths' `d` matched against the installed Solar set.
 *
 * 1. Can't start, waits (light and dark): the card's badge draws
 *    forbidden-circle-bold on the attn pair, its word Can't start, the hub's
 *    reason its title and its sr-only text.
 * 2. Can't start, broke: danger-circle-bold on the fail pair, the same word,
 *    title and sr-only text.
 * 3. Failed: danger-circle-bold on the fail pair.
 * 4. Session status: Working refresh-circle-bold, Needs you hand-shake-bold,
 *    Failed danger-circle-bold, Passed check-circle-bold, Pending
 *    pause-circle-bold, Unknown question-circle-bold; no glyph carries a
 *    half-opacity layer (no duotone).
 * 5. The knock-out: the badge's ground shows through the solid disc's mark,
 *    so the mark's contrast is the badge's ground against its ink (the
 *    glyph's computed colour), for the attn and fail pairs, light and dark:
 *    at least 3:1 (non-text).
 * 6. Ink: the inner mark of the 16px badge glyph (the "!" bar, the slash's
 *    gap) at 1× and 2×, as drawn: its width in device px along a row
 *    through it, each pixel counted by how far it stands from the ink
 *    toward the ground; the slash's perpendicular width is that over √2.
 *    Solar draws both marks 1.5 of 24 units, so 16px gives one device px at
 *    1× (DESIGN.md, Badge): each is held to that (0.95 for antialiasing's
 *    rounding), and its most ground-like pixel is reported, since a 1px
 *    mark that falls between two pixels reads at half strength in each.
 *
 *   bun scripts/probe-kit/run.ts status-marks
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one frame read at a time.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { colours, contrast, dx, dy, px, type Raster, type Rgb } from "../ink";
import { type Kit, ROOT, type Spec, settle } from "../kit";

const APP = join(ROOT, "apps/dashboard");
const CARD = "src/lib/cawco/tasks/TaskCard.stories.ts";
const STATUS = "src/lib/cawco/workspace/SessionStatus.stories.ts";
const SCHEMES = ["light", "dark"] as const;

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** Every installed Solar glyph by its drawing: its paths' `d`, joined. */
const solarByDrawing = (): Map<string, string> => {
  const file = Bun.resolveSync("@iconify-json/solar/icons.json", APP);
  const set = JSON.parse(readFileSync(file, "utf8")) as {
    icons: Record<string, { body: string }>;
  };
  const byDrawing = new Map<string, string>();
  for (const [name, { body }] of Object.entries(set.icons)) {
    const d = [...body.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).join("|");
    byDrawing.set(d, name);
  }
  return byDrawing;
};

interface Mark {
  /** The svg's box, css px. */
  box: { bottom: number; left: number; right: number; top: number };
  /** Its paths' `d`, joined. */
  drawing: string;
  /** Its computed colour, the ink. */
  ink: string;
  /** Any layer drawn at less than full opacity (a duotone's half disc). */
  layered: boolean;
}

type FrameAsk = [
  file: string,
  story: string,
  scheme: string,
  markSel: string,
  holderSel: string,
];

/**
 * One frame's mark (`markSel`) and the box that holds it (`holderSel`), the
 * mark scrolled into the middle of the view first so a capture finds it.
 */
const readFrame = (args: FrameAsk) => {
  const [file, story, scheme, markSel, holderSel] = args;
  const frame = document.querySelector(
    `.cawco-frame[data-cawco-file="${file}"][data-cawco-story="${story}"][data-cawco-scheme="${scheme}"][data-cawco-interaction="rest"]`
  );
  const holder = frame?.querySelector<HTMLElement>(holderSel) ?? null;
  const svg = frame?.querySelector<SVGSVGElement>(markSel) ?? null;
  if (!(frame && svg)) {
    return null;
  }
  svg.scrollIntoView({
    behavior: "instant",
    block: "center",
    inline: "center",
  });
  const r = svg.getBoundingClientRect();
  const mark = {
    box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    drawing: [...svg.querySelectorAll("path")]
      .map((path) => path.getAttribute("d") ?? "")
      .join("|"),
    ink: getComputedStyle(svg).color,
    layered: [...svg.querySelectorAll("*")].some(
      (el) => Number(el.getAttribute("opacity") ?? "1") < 1
    ),
  };
  return {
    mark,
    ground: holder ? getComputedStyle(holder).backgroundColor : null,
    words: (holder?.textContent ?? "").replace(/\s+/g, " ").trim(),
    title: holder?.getAttribute("title") ?? null,
    sr: holder?.querySelector(".sr-only")?.textContent?.trim() ?? null,
    kind: holder?.getAttribute("data-start-problem") ?? null,
    pair: (["attn", "fail"] as const).map((pair) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = `var(--status-${pair}-bg)`;
      probe.style.color = `var(--status-${pair}-ink)`;
      holder?.parentElement?.append(probe);
      const style = getComputedStyle(probe);
      const read = { pair, bg: style.backgroundColor, ink: style.color };
      probe.remove();
      return read;
    }),
  };
};

/** The glyph shown at zoom 1, its centre at the canvas's; its viewport box. */
const showGlyph = async (page: Page, selector: string) => {
  // The canvas pans and zooms its world by one transform inside a clipped
  // viewport, so nothing scrolls a frame into view: the canvas is asked to
  // stand at its own size (`cawco:canvas-view`, zoom 1) and to show the
  // frame (`cawco:canvas-go`, its key), and its flight is waited out.
  const shown = await page.evaluate(async (css) => {
    const svg = document.querySelector<SVGElement>(css);
    const key = svg?.closest<HTMLElement>(".cawco-frame")?.dataset.cawcoKey;
    const world = document.querySelector<HTMLElement>(".cawco-world");
    const canvas = document.querySelector<HTMLElement>(".cawco-canvas");
    if (!(svg && key && world && canvas)) {
      return null;
    }
    dispatchEvent(
      new CustomEvent("cawco:canvas-view", { detail: { zoom: 1 } })
    );
    dispatchEvent(new CustomEvent("cawco:canvas-go", { detail: { key } }));
    // A flight the canvas cancels for a newer one rejects its `finished`
    // (AbortError): each is waited out settled, until none is left.
    for (let flights = world.getAnimations(); flights.length > 0;) {
      await Promise.allSettled(flights.map((one) => one.finished));
      flights = world.getAnimations();
    }
    // A frame wider than the canvas is centred on its middle, which can leave
    // the badge at its start outside: the canvas's own wheel pan (zoom.x -=
    // deltaX) then brings the glyph's centre to the canvas's.
    const room = canvas.getBoundingClientRect();
    const was = svg.getBoundingClientRect();
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: was.x + was.width / 2 - (room.x + room.width / 2),
        deltaY: was.y + was.height / 2 - (room.y + room.height / 2),
      })
    );
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const box = svg.getBoundingClientRect();
    return {
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      inside:
        box.left >= room.left &&
        box.right <= room.right &&
        box.top >= room.top &&
        box.bottom <= room.bottom,
      zoom: new DOMMatrix(getComputedStyle(world).transform).a,
    };
  }, selector);
  if (!(shown?.inside && Math.abs(shown.zoom - 1) < 1e-6)) {
    throw new Error(
      `the glyph ${selector} was not shown at zoom 1 inside the canvas: ${JSON.stringify(shown)}`
    );
  }
  return shown.box;
};

/** Where `selector` stands in the viewport now. */
const boxNow = (page: Page, selector: string) =>
  page.evaluate((css) => {
    const box = document.querySelector(css)?.getBoundingClientRect();
    return box
      ? { x: box.x, y: box.y, width: box.width, height: box.height }
      : null;
  }, selector);

/** A pixel's place between `ink` (0) and `ground` (1), clamped. */
const shareOf = (rgb: Rgb, ink: Rgb, ground: Rgb): number => {
  const axis = ground.map((g, i) => g - (ink[i] ?? 0));
  const length2 = axis.reduce((sum, a) => sum + a * a, 0) || 1;
  const t =
    rgb.reduce((sum, c, i) => sum + (c - (ink[i] ?? 0)) * (axis[i] ?? 0), 0) /
    length2;
  return Math.min(1, Math.max(0, t));
};

/**
 * The glyph's own pixels: shown, left to settle, captured at the box it
 * holds then, and kept only if it held that box through the capture and the
 * capture carries the glyph's ink (its disc is ink: a capture with none is
 * of whatever stood there before the glyph did).
 */
const captureGlyph = async (
  page: Page,
  selector: string,
  ink: Rgb,
  ground: Rgb
): Promise<Raster> => {
  const seen: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await showGlyph(page, selector);
    await settle(page, 300);
    const box = await boxNow(page, selector);
    if (!box) {
      break;
    }
    // The page itself never scrolls (the canvas page is overflow hidden),
    // so the glyph's viewport box is its place in the capture.
    const png = PNG.sync.read(
      await page.screenshot({ animations: "allow", caret: "hide", clip: box })
    );
    const after = await boxNow(page, selector);
    const raster: Raster = {
      data: png.data,
      width: png.width,
      height: png.height,
      scale: png.width / box.width,
      x: 0,
      y: 0,
    };
    let inkiest = 1;
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        inkiest = Math.min(inkiest, shareOf(px(raster, x, y), ink, ground));
      }
    }
    const held = JSON.stringify(after) === JSON.stringify(box);
    if (held && inkiest <= 0.05) {
      return raster;
    }
    seen.push(
      `${JSON.stringify(box)} → ${JSON.stringify(after)}, inkiest ${inkiest.toFixed(2)}`
    );
  }
  throw new Error(
    `the glyph ${selector} was never captured holding still with its ink: ${seen.join("; ")}`
  );
};

/**
 * The inner mark's width in device px along the row at `atY` (a fraction of
 * the glyph's height), inside the disc: each pixel counted by where it
 * stands between the ink (0) and the ground (1), so an antialiased edge
 * counts its share. Also the most ground-like pixel there (1: pure ground).
 */
const innerMark = async (
  page: Page,
  selector: string,
  ink: Rgb,
  ground: Rgb,
  atY: number
) => {
  const raster = await captureGlyph(page, selector, ink, ground);
  const side = raster.width / raster.scale;
  const y = Math.round(dy(raster, side * atY));
  // The disc's middle half, clear of its antialiased rim.
  const from = Math.floor(dx(raster, side * 0.25));
  const to = Math.ceil(dx(raster, side * 0.75));
  let width = 0;
  let peak = 0;
  for (let x = from; x < to; x += 1) {
    const share = shareOf(px(raster, x, y), ink, ground);
    width += share;
    peak = Math.max(peak, share);
  }
  return { width, peak, scale: raster.scale };
};

const BY_DRAWING = solarByDrawing();
const nameOf = (mark: Mark | undefined): string =>
  (mark && BY_DRAWING.get(mark.drawing)) ?? "unknown";

/** The session status glyph each SessionStatus story must draw. */
const SESSION_GLYPHS = {
  Working: "refresh-circle-bold",
  NeedsYou: "hand-shake-bold",
  Failed: "danger-circle-bold",
  Passed: "check-circle-bold",
  Pending: "pause-circle-bold",
  Unknown: "question-circle-bold",
} as const;

/** The dashboard's stage on a free port, once it says it is ready. */
const startStage = async () => {
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
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  stage.stdout.on("data", hear);
  stage.stderr.on("data", hear);
  try {
    await until(
      "the stage's ready",
      () => words,
      (text) => text.includes('"cawco":"ready"'),
      60_000
    );
  } catch (error) {
    stage.kill("SIGTERM");
    throw error;
  }
  return { port, stop: () => stage.kill("SIGTERM") };
};

/** Both states files drawn light and dark at `scale`, every glyph in. */
const openCanvas = async (kit: Kit, port: number, scale: number) => {
  const page = await kit.page("desk", { scale });
  const logged: string[] = [];
  page.on("pageerror", (error) => logged.push(error.message));
  const query = new URLSearchParams([
    ["file", CARD],
    ["file", STATUS],
    ["scheme", "both"],
  ]);
  await page.goto(`http://127.0.0.1:${port}/@cawco/canvas?${query}`, {
    waitUntil: "load",
  });
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll(
          '.cawco-frame[data-cawco-interaction="rest"] :is([data-slot="badge"], .session-status) svg'
        ).length >= 18,
      undefined,
      { timeout: 60_000 }
    )
    .catch(async (error: Error) => {
      const frames = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".cawco-frame")].map(
          (frame) =>
            `${frame.dataset.cawcoStory}/${frame.dataset.cawcoScheme}: ${frame.querySelector(".cawco-frame-status")?.textContent ?? ""}`
        )
      );
      throw new Error(
        `${error.message}; frames ${JSON.stringify(frames)}; errors ${JSON.stringify(logged.slice(0, 5))}`
      );
    });
  return page;
};

/** A TaskCard story's badge. */
const badgeOf = (page: Page, story: string, scheme: string) =>
  page.evaluate(readFrame, [
    CARD,
    story,
    scheme,
    '[data-slot="badge"] svg',
    '[data-slot="badge"]',
  ] as FrameAsk);
type Badge = Awaited<ReturnType<typeof badgeOf>>;

/** A computed colour (oklch, oklab) as the screen draws it. */
const rgbOf = async (page: Page, css: string): Promise<Rgb> =>
  (await colours(page, [css]))[0] ?? [0, 0, 0];

/** The status pair `pair` as the badge's frame computes it. */
const pairOf = (read: Badge, pair: "attn" | "fail") =>
  read?.pair.find((one) => one.pair === pair);

/** Whether a badge draws `glyph`, solid, on `pair`, its word starting `word`. */
const drawsOn = (
  read: Badge,
  glyph: string,
  pair: "attn" | "fail",
  word: string
): boolean =>
  !!read &&
  nameOf(read.mark) === glyph &&
  !read.mark.layered &&
  read.ground === pairOf(read, pair)?.bg &&
  read.mark.ink === pairOf(read, pair)?.ink &&
  read.words.startsWith(word);

const said = (read: Badge): string =>
  JSON.stringify({ ...read, mark: nameOf(read?.mark ?? undefined) });

/** 1 to 3: the card's badges, in `scheme`. */
const checkBadges = async (kit: Kit, page: Page, scheme: string) => {
  const waits = await badgeOf(page, "CantStartWaits", scheme);
  const broke = await badgeOf(page, "CantStartBroke", scheme);
  const failed = await badgeOf(page, "Failed", scheme);
  kit.check(
    `1 (${scheme}): Can't start, waits: the badge draws ${nameOf(waits?.mark)} on the attn pair (${waits?.ground}), "Can't start", the reason its title and sr-only text`,
    drawsOn(waits, "forbidden-circle-bold", "attn", "Can't start") &&
      waits?.kind === "waits" &&
      !!waits.title?.startsWith("No checkout of tidewater") &&
      waits.sr === waits.title,
    said(waits)
  );
  kit.check(
    `2 (${scheme}): Can't start, broke: the badge draws ${nameOf(broke?.mark)} on the fail pair (${broke?.ground}), "Can't start", the reason its title and sr-only text`,
    drawsOn(broke, "danger-circle-bold", "fail", "Can't start") &&
      broke?.kind === "broke" &&
      !!broke.title?.includes("did not start") &&
      broke.sr === broke.title,
    said(broke)
  );
  kit.check(
    `3 (${scheme}): Failed: the badge draws ${nameOf(failed?.mark)} on the fail pair`,
    drawsOn(failed, "danger-circle-bold", "fail", "Failed") &&
      failed?.words === "Failed",
    said(failed)
  );
  return { waits, broke };
};

/** 4: the session status glyphs, in `scheme`. */
const checkSession = async (kit: Kit, page: Page, scheme: string) => {
  const seen: Record<string, string> = {};
  let solid = true;
  for (const story of Object.keys(SESSION_GLYPHS)) {
    const read = await page.evaluate(readFrame, [
      STATUS,
      story,
      scheme,
      '.session-status [data-slot="mark"] svg',
      ".session-status",
    ] as FrameAsk);
    seen[story] = nameOf(read?.mark);
    solid &&= read !== null && !read.mark.layered;
  }
  kit.check(
    `4 (${scheme}): session status glyphs ${Object.entries(seen)
      .map(([story, name]) => `${story} ${name}`)
      .join(", ")}, none duotone`,
    solid &&
      Object.entries(SESSION_GLYPHS).every(
        ([story, name]) => seen[story] === name
      ),
    JSON.stringify(seen)
  );
};

/** 5: the knock-out contrast of the attn and fail pairs, in `scheme`. */
const checkKnockOut = async (
  kit: Kit,
  page: Page,
  scheme: string,
  reads: { broke: Badge; waits: Badge }
) => {
  for (const [pair, read] of [
    ["attn", reads.waits],
    ["fail", reads.broke],
  ] as const) {
    const ratio = read?.ground
      ? contrast(
          await rgbOf(page, read.ground),
          await rgbOf(page, read.mark.ink)
        )
      : 0;
    kit.check(
      `5 (${scheme}): the ${pair} pair's knock-out, its ground ${read?.ground} through the ink ${read?.mark.ink}: ${ratio.toFixed(2)}:1 (at least 3:1)`,
      ratio >= 3
    );
  }
};

const INNER_MARKS = [
  ['the "!" bar (danger-circle-bold)', "CantStartBroke", 0.42, false],
  ["the slash's gap (forbidden-circle-bold)", "CantStartWaits", 0.5, true],
] as const;

/** 6: the 12px badge glyph's inner mark as drawn, in `scheme` at `scale`. */
const checkInk = async (
  kit: Kit,
  page: Page,
  scheme: string,
  scale: number
) => {
  for (const [name, story, atY, diagonal] of INNER_MARKS) {
    const read = await badgeOf(page, story, scheme);
    if (!read?.ground) {
      kit.check(`6 (${scheme}, ${scale}×): ${name} drawn`, false);
      continue;
    }
    const ink = await innerMark(
      page,
      `.cawco-frame[data-cawco-file="${CARD}"][data-cawco-story="${story}"][data-cawco-scheme="${scheme}"][data-cawco-interaction="rest"] [data-slot="badge"] svg`,
      await rgbOf(page, read.mark.ink),
      await rgbOf(page, read.ground),
      atY
    );
    const width = diagonal ? ink.width / Math.SQRT2 : ink.width;
    const line = `6 (${scheme}, ${scale}×): ${name} at ${(read.mark.box.right - read.mark.box.left).toFixed(0)}px: ${width.toFixed(2)} device px of ground wide${diagonal ? " (perpendicular)" : ""}, its most ground-like pixel ${(ink.peak * 100).toFixed(0)}% ground`;
    kit.check(`${line} (one device px or more)`, width >= 0.95);
  }
};

const spec: Spec = {
  name: "status-marks",
  run: async (kit: Kit) => {
    const stage = await startStage();
    try {
      for (const scale of [1, 2]) {
        const page = await openCanvas(kit, stage.port, scale);
        for (const scheme of SCHEMES) {
          if (scale === 1) {
            const reads = await checkBadges(kit, page, scheme);
            await checkSession(kit, page, scheme);
            await checkKnockOut(kit, page, scheme, reads);
          }
          await checkInk(kit, page, scheme, scale);
        }
        await page.close();
      }
    } finally {
      stage.stop();
    }
  },
};
export default spec;
