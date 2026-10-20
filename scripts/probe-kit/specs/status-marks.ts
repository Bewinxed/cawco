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
import { STATUS_MARKS } from "../../../apps/dashboard/src/lib/status-marks";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import type {
  Account,
  AccountSignin,
  ProviderChoice,
} from "../../../packages/core/src/accounts";
import type { InstancesFrame } from "../../../packages/core/src/frames";
import type { AgentRow, Envelope } from "../../../packages/core/src/index";
import { WIRE_PROTOCOL } from "../../../packages/core/src/stream";
import { until } from "../../scratch-fleet";
import { colours, contrast, dx, dy, px, type Raster, type Rgb } from "../ink";
import { type Kit, open, ROOT, type Spec, settle } from "../kit";

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

/** Each status mark's drawing (its paths' `d`), by its Solar name. */
const STATUS_DRAWINGS = (() => {
  const byName = new Map(
    [...BY_DRAWING].map(([drawing, name]) => [name, drawing] as const)
  );
  return [...STATUS_MARKS].map((name) => byName.get(name) ?? name);
})();

/** One status mark as drawn, beside its words, in its row. */
interface Swept {
  /**
   * What the mark's middle is held to: its words' x-height middle, or, a
   * mark with no words beside it (a row's trailing mark, its meaning said in
   * the row's own lines), its row's middle.
   */
  against: "x-height" | "row";
  h: number;
  /** The line the mark stands in (its own box's parent): its height, css px. */
  line: number;
  name: string;
  /** The mark's middle less the middle it is held to (`against`), css px. */
  off: number;
  /** The row the line stands in: its height, css px. */
  row: number;
  /** The `[data-surface]` it stands in, or where its portal came from. */
  surface: string;
  w: number;
  /** The words it was read against. */
  words: string;
}

/** A mark as the page reads it, named by its drawing. */
type Drawn = Omit<Swept, "name"> & { drawing: string };

/**
 * Every status mark drawn under `rootSel` (shown: not at opacity 0, a box
 * of its own), each named by its drawing. Its words are the run beside it:
 * the first element after its cell with words a reader sees (else the
 * last before it), the cell the mark's own `.mark-cell`, `.rail-cell` or
 * wordless `[data-box]` tile when it stands in one. Their x-height's middle
 * is read off a zero-width inline-block 1ex tall set at the words' start:
 * its bottom stands on their baseline, so its middle is the x-height's.
 * A mark with no words beside it is read against its row's middle.
 */
const sweepIn = (
  args: [
    rootSel: string,
    label: string | null,
    drawings: string[],
    rowSel: string | null,
  ]
): Drawn[] => {
  const [rootSel, label, drawings, rowSel] = args;
  const wanted = new Set(drawings);
  const shown = (el: Element) => {
    for (let at: Element | null = el; at; at = at.parentElement) {
      if (Number(getComputedStyle(at).opacity) === 0) {
        return false;
      }
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const readable = (el: Element) =>
    !el.closest(".sr-only") &&
    (el.textContent ?? "").trim().length > 0 &&
    shown(el);
  const drawingOf = (svg: Element) =>
    [...svg.querySelectorAll("path")]
      .map((path) => path.getAttribute("d") ?? "")
      .join("|");
  /** The mark's own tile when it stands in one, else the mark. */
  const cellOf = (svg: Element, root: Element) => {
    const tile = svg.parentElement?.closest(
      ".mark-cell, .rail-cell, [data-box]"
    );
    return tile && tile !== root && root.contains(tile) && !readable(tile)
      ? tile
      : svg;
  };
  /** The row: the one `rowSel` names, else the component the bench's surface holds. */
  const rowOf = (svg: Element, line: Element): Element => {
    if (rowSel) {
      return svg.closest(rowSel) ?? line;
    }
    const surface = svg.closest("[data-surface]");
    for (let at: Element | null = svg; at && surface; at = at.parentElement) {
      if (at.parentElement === surface) {
        return at;
      }
    }
    return line;
  };
  const wordsOf = (cell: Element, line: Element) => {
    const siblings = [...line.children];
    const at = siblings.indexOf(cell);
    return (
      siblings.slice(at + 1).find(readable) ??
      siblings.slice(0, at).reverse().find(readable) ??
      null
    );
  };
  /** The mark's middle less the words' x-height middle. */
  const offOf = (svg: Element, words: Element) => {
    const ex = document.createElement("span");
    ex.style.cssText =
      "display:inline-block;inline-size:0;block-size:1ex;padding:0;margin:0;border:0";
    words.prepend(ex);
    const e = ex.getBoundingClientRect();
    ex.remove();
    const m = svg.getBoundingClientRect();
    return (m.top + m.bottom) / 2 - (e.top + e.bottom) / 2;
  };
  const out: Drawn[] = [];
  for (const root of document.querySelectorAll(rootSel)) {
    for (const svg of root.querySelectorAll("svg")) {
      // The kit's spinner is the working mark wherever it stands.
      const drawing = svg.classList.contains("animate-spin")
        ? "spinner"
        : drawingOf(svg);
      if (!((drawing === "spinner" || wanted.has(drawing)) && shown(svg))) {
        continue;
      }
      const cell = cellOf(svg, root);
      const line = cell.parentElement ?? cell;
      const words = wordsOf(cell, line);
      const row = rowOf(svg, line);
      const m = svg.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      out.push({
        against: words ? "x-height" : "row",
        surface:
          label ??
          (svg.closest("[data-surface]") as HTMLElement | null)?.dataset
            .surface ??
          "page",
        drawing,
        // The box as laid out: a spinning mark's rect is its turned box's.
        w: Number.parseFloat(getComputedStyle(svg).width),
        h: Number.parseFloat(getComputedStyle(svg).height),
        off: words
          ? offOf(svg, words)
          : (m.top + m.bottom) / 2 - (r.top + r.bottom) / 2,
        // biome-ignore lint/performance/useTopLevelRegex: this runs in the page (page.evaluate), which has no module scope to hoist it to
        words: (words?.textContent ?? "").split(/\s+/).join(" ").trim(),
        line: line.getBoundingClientRect().height,
        row: r.height,
      });
    }
  }
  return out;
};

/** The marks under `rootSel`, named. */
const sweep = async (
  page: Page,
  rootSel: string,
  label: string | null = null,
  rowSel: string | null = null
): Promise<Swept[]> => {
  const read = await page.evaluate(sweepIn, [
    rootSel,
    label,
    STATUS_DRAWINGS,
    rowSel,
  ] as [string, string | null, string[], string | null]);
  return read.map(({ drawing, ...rest }) => ({
    ...rest,
    name:
      drawing === "spinner"
        ? "spinner"
        : (BY_DRAWING.get(drawing) ?? "unknown"),
  }));
};

/** The bench's surfaces, each held to 16×16 and its words' x-height. */
const SURFACES = [
  "task-card",
  "task-table",
  "view-pipeline",
  "view-made",
  "moved-login",
  "run-status",
  "section-row",
  "rollout",
  "update-card",
  "system-line",
  "compaction",
  "device-panel",
  "signin-panel",
] as const;

/** The surfaces drawing more than one mark: run-status's five states, section-row's failure and spinner. */
const EXPECT: Partial<Record<(typeof SURFACES)[number], number>> = {
  "run-status": 5,
  "section-row": 2,
};

/** One surface's marks: a check, and its rows' heights said. */
const checkSwept = (kit: Kit, where: string, marks: Swept[], expect = 1) => {
  const each = marks
    .map(
      (m) =>
        `${m.name} ${m.w.toFixed(2)}×${m.h.toFixed(2)}, ${m.against === "row" ? "row middle" : `x-height ("${m.words.slice(0, 28)}")`} ${m.off >= 0 ? "+" : ""}${m.off.toFixed(2)}, line ${m.line.toFixed(2)}, row ${m.row.toFixed(2)}`
    )
    .join("; ");
  kit.check(
    `7 ${where}: ${marks.length} status mark${marks.length === 1 ? "" : "s"} 16×16, each one's middle on its words' x-height middle (a wordless one's on its row's) within 0.5px: ${each || "none drawn"}`,
    marks.length >= expect &&
      marks.every(
        (m) =>
          Math.abs(m.w - 16) < 0.01 &&
          Math.abs(m.h - 16) < 0.01 &&
          Math.abs(m.off) <= 0.5
      )
  );
};

/**
 * 8: each transcript rail row's first line is its rail line and nothing
 * more: no room between the rail line's bottom and what follows it (the
 * next block's top less its own margin, else the row's bottom). An inline
 * rail line stood in a line box of the row's, set on its glyph cell's
 * baseline (the glyph's bottom edge) with the row's strut below it, so the
 * row's height followed the glyph's size: 2.43px under a 12px glyph, 2px
 * more once a status mark was 16px. Read on the failed and moved rows' 16px
 * marks and the hook note's 12px glyph.
 */
const checkRailRows = async (kit: Kit, page: Page, theme: string) => {
  const rows = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "[data-surface='system-line'] [data-system-line-rail-row]"
      ),
    ].map((row) => {
      const line = row.querySelector(".rail-line");
      const r = row.getBoundingClientRect();
      if (!line) {
        return { below: Number.NaN, line: 0, row: r.height, title: "" };
      }
      // The row's own child the line stands in, and the block after it.
      let block: Element = line;
      while (block.parentElement && block.parentElement !== row) {
        block = block.parentElement;
      }
      let next = block.nextElementSibling;
      while (next && next.getBoundingClientRect().height === 0) {
        next = next.nextElementSibling;
      }
      const l = line.getBoundingClientRect();
      const end = next
        ? next.getBoundingClientRect().top -
          Number.parseFloat(getComputedStyle(next).marginBlockStart)
        : r.bottom;
      return {
        below: end - l.bottom,
        line: l.height,
        row: r.height,
        title: (line.textContent ?? "").trim(),
      };
    })
  );
  kit.check(
    `8 (${theme}) system-line: ${rows.length} rail rows, nothing under each one's rail line but what hangs from it: ${rows.map((one) => `"${one.title}" line ${one.line.toFixed(2)}, ${one.below.toFixed(2)} under it, row ${one.row.toFixed(2)}`).join("; ")}`,
    rows.length === 3 &&
      rows.every(
        (one) =>
          Math.abs(one.below) < 0.01 && Math.abs(one.line - rows[0].line) < 0.01
      )
  );
};

/** 7: every swept surface on the bench, in `theme`. */
const checkBench = async (kit: Kit, theme: "light" | "dark") => {
  const bench = await kit.bench();
  const page = await kit.page("desk", { theme });
  await open(page, `${bench}/motion/status-marks`, "[data-bench]");
  await settle(page, 400);
  const marks = await sweep(page, "[data-surface]");
  for (const surface of SURFACES) {
    checkSwept(
      kit,
      `(${theme}) ${surface}`,
      marks.filter((m) => m.surface === surface),
      EXPECT[surface] ?? 1
    );
  }
  await checkRailRows(kit, page, theme);
  // The chip's list: each machine's mark, in the popover it opens.
  await page.locator(".rollout-chip").click();
  await page.waitForSelector(
    '[data-slot="popover-content"] [data-slot="mark"] svg'
  );
  await settle(page, 400);
  checkSwept(
    kit,
    `(${theme}) rollout's list`,
    await sweep(
      page,
      '[data-slot="popover-content"]',
      "rollout's list",
      "[data-slot='machine'] > .line, [data-slot='note'], [data-slot='top']"
    ),
    2
  );
  await page.close();
};

/** The hub's two machines, as the board frame carries them: what the account pages read. */
const MACHINES = [
  ["m-1", "obelisk"],
  ["m-2", "gauntlet"],
].map(([machineId, hostname]) => ({
  auth: "ok",
  harnesses: [
    { harness: "claude", installed: true },
    { harness: "pi", installed: true },
  ],
  hostname,
  lastSeenAt: null,
  machineId,
  os: "linux-x64",
  pausedUntil: null,
  pauseStopped: null,
  status: "online",
})) as unknown as AgentRow[];

const BOARD: Envelope<InstancesFrame> = {
  verb: "frames",
  machineId: "hub",
  payload: {
    kind: "instances",
    agents: MACHINES,
    continuations: [],
    formerIds: {},
    handoffs: {},
    hubBuild: { startedAt: 0, version: "0.0.0" },
    instances: [],
    moves: [],
    noticesSeen: [],
    protocol: WIRE_PROTOCOL,
    pulses: {},
  },
};

const AT = Date.UTC(2026, 9, 20, 9, 30);

const accountOf = (
  id: string,
  provider: string,
  kind: Account["kind"],
  email: string | null
): Account =>
  ({
    atPlanLimit: null,
    createdAt: AT,
    email,
    hue: "blue",
    id,
    identity: null,
    kind,
    label: null,
    neverBackup: false,
    order: 0,
    provider,
    reservePct: null,
  }) as unknown as Account;

const signinOf = (
  accountId: string,
  machineId: string,
  state: AccountSignin["state"]
): AccountSignin => ({
  accountId,
  checkedAt: AT,
  machineId,
  movedAt: null,
  movedFrom: null,
  reason: null,
  state,
});

/** The picker's Claude subscription row, not its Console row. */
const CLAUDE_ROW = /^Claude$/;

const PROVIDERS: ProviderChoice[] = [
  {
    provider: "anthropic",
    kind: "subscription",
    name: "Claude",
    signin: "paste-code",
    harnesses: ["claude"],
    limits: true,
  },
  {
    provider: "openai",
    kind: "api_key",
    name: "OpenAI",
    signin: "api-key",
    harnesses: ["pi"],
    limits: false,
  },
];

/**
 * The hub as the account pages read it, on `page`: the board's machines over
 * its socket, and `/api/accounts`. Ada's Claude account is signed in as
 * someone else on obelisk and as her on gauntlet; the OpenAI key account is
 * on neither, and obelisk refuses the key sent to it. An account made by the
 * setup's first sign-in comes back as Ada's does.
 */
const hubForAccounts = async (page: Page) => {
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (hubSide) => {
      hubSide.send(JSON.stringify(BOARD));
    }
  );
  let made = false;
  const theirs = (id: string) => [
    signinOf(id, "m-1", "mismatch"),
    signinOf(id, "m-2", "signed-in"),
  ];
  const ada = (id: string, email: string | null) =>
    accountOf(id, "anthropic", "subscription", email);
  /** Each route the pages ask, by method and path: its answer. */
  const answers: [
    test: (method: string, path: string) => boolean,
    answer: () => unknown,
  ][] = [
    [
      (method, path) => method === "GET" && path === "/api/accounts",
      () => ({
        accounts: [
          ada("acc-1", "ada@tidewater.dev"),
          accountOf("acc-2", "openai", "api_key", null),
          ...(made ? [ada("acc-new", "ada@tidewater.dev")] : []),
        ],
        bench: [],
        catalogFaults: [],
        catalogs: [],
        readings: [],
        rebalances: [],
        routing: [],
        signins: [...theirs("acc-1"), ...(made ? theirs("acc-new") : [])],
      }),
    ],
    [
      (method, path) => method === "GET" && path === "/api/accounts/providers",
      () => PROVIDERS,
    ],
    [
      (method, path) => method === "POST" && path === "/api/accounts",
      () => {
        made = true;
        return ada("acc-new", null);
      },
    ],
    [
      (method, path) => method === "POST" && path.endsWith("/signin"),
      () => ({ url: "about:blank#signin" }),
    ],
    [
      (method, path) => method === "POST" && path.endsWith("/key"),
      () => ({
        machines: [
          {
            machineId: "m-1",
            error: "obelisk refused it: not a key for OpenAI.",
          },
        ],
      }),
    ],
  ];
  await page.route(
    (url) => url.pathname.startsWith("/api/accounts"),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const found = answers.find(([test]) => test(request.method(), path));
      await route.fulfill(
        found
          ? {
              contentType: "application/json",
              body: JSON.stringify(found[1]()),
            }
          : { status: 404, body: "" }
      );
    }
  );
};

/** 7: the account pages' marks, against {@link hubForAccounts}, in `theme`. */
const checkAccounts = async (kit: Kit, theme: "light" | "dark") => {
  const bench = await kit.bench();
  const page = await kit.page("desk", { theme });
  await hubForAccounts(page);

  // The list: Ada's row says someone else is signed in on obelisk.
  await open(page, `${bench}/config/accounts`, ".arow .problem svg");
  await settle(page, 400);
  checkSwept(
    kit,
    `(${theme}) account-list-row`,
    await sweep(page, ".arow", "account-list-row", ".arow"),
    1
  );

  // Ada's machines: obelisk's row says Someone else.
  await open(page, `${bench}/config/accounts/acc-1`, ".mrow .state svg");
  await settle(page, 400);
  checkSwept(
    kit,
    `(${theme}) account-machines`,
    await sweep(page, ".mrow", "account-machines", ".mrow"),
    1
  );

  // The key account: obelisk refuses the key sent to it.
  await open(
    page,
    `${bench}/config/accounts/acc-2`,
    ".mrow button[aria-haspopup]"
  );
  await page.locator(".mrow button[aria-haspopup]").first().click();
  const field = page.locator(
    '[data-ns-pop] input[placeholder="Paste the key"]'
  );
  await field.fill("sk-probe");
  await field.press("Enter");
  await page.waitForSelector("[data-ns-pop] .bad svg");
  await settle(page, 400);
  checkSwept(
    kit,
    `(${theme}) key-panel`,
    await sweep(page, "[data-ns-pop] .send", "key-panel", ".send"),
    1
  );

  // The setup: Claude chosen, obelisk's Sign in made the account; the hub
  // then says obelisk is someone else's and gauntlet is Ada's.
  await open(page, `${bench}/config/accounts/new`, "button[data-choice]");
  await page
    .locator("button[data-choice]")
    .filter({ has: page.locator(".plabel", { hasText: CLAUDE_ROW }) })
    .click();
  await page
    .locator(".mrow.paste")
    .first()
    .getByRole("button", { name: "Sign in" })
    .click();
  await page.waitForSelector(".mrow.paste .st.fail svg");
  await page.waitForSelector(".mrow.paste .st.ok svg");
  await settle(page, 600);
  checkSwept(
    kit,
    `(${theme}) account-setup`,
    await sweep(
      page,
      ".mrow.paste, [data-slot='signed-as'], ol.steps",
      "account-setup",
      ".mrow, [data-slot='signed-as'], li"
    ),
    4
  );
  await page.close();
};

const spec: Spec = {
  name: "status-marks",
  run: async (kit: Kit) => {
    for (const theme of SCHEMES) {
      await checkBench(kit, theme);
      await checkAccounts(kit, theme);
    }
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
