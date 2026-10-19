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
 * 6. Ink: the inner mark of the 12px badge glyph (the "!" bar, the slash's
 *    gap) at 1× and 2×, as drawn: its width in device px along a row
 *    through it, each pixel counted by how far it stands from the ink
 *    toward the ground; the slash's perpendicular width is that over √2.
 *    Held to one device px of ground at 2×. At 1× it is reported: Solar
 *    draws both marks 1.5 units wide on its 24-unit grid, 0.75px at 12px,
 *    so no 1× screen gives them a whole pixel.
 *
 *   bun scripts/probe-kit/run.ts status-marks
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one frame read at a time.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { capture, colours, contrast, dx, dy, px, type Rgb } from "../ink";
import { type Kit, ROOT, type Spec } from "../kit";

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

/**
 * The inner mark's width in device px along the row at `atY` (a fraction of
 * the glyph's height), inside the disc: each pixel counted by where it
 * stands between the ink (0) and the ground (1), so an antialiased edge
 * counts its share. Also the most ground-like pixel there (1: pure ground).
 */
const innerMark = async (
  page: Page,
  seen: Mark,
  ink: Rgb,
  ground: Rgb,
  atY: number
) => {
  const pad = 2;
  // A clip is in the document's coordinates; the box is the view's.
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const mark = {
    box: {
      left: seen.box.left + scroll.x,
      right: seen.box.right + scroll.x,
      top: seen.box.top + scroll.y,
      bottom: seen.box.bottom + scroll.y,
    },
  };
  const raster = await capture(page, {
    x: mark.box.left - pad,
    y: mark.box.top - pad,
    width: mark.box.right - mark.box.left + pad * 2,
    height: mark.box.bottom - mark.box.top + pad * 2,
  });
  const y = Math.round(
    dy(raster, mark.box.top + (mark.box.bottom - mark.box.top) * atY)
  );
  // The disc's middle half, clear of its antialiased rim.
  const span = mark.box.right - mark.box.left;
  const from = Math.floor(dx(raster, mark.box.left + span * 0.25));
  const to = Math.ceil(dx(raster, mark.box.left + span * 0.75));
  const axis = ground.map((g, i) => g - (ink[i] ?? 0));
  const length2 = axis.reduce((sum, a) => sum + a * a, 0) || 1;
  let width = 0;
  let peak = 0;
  for (let x = from; x < to; x += 1) {
    const rgb = px(raster, x, y);
    const t =
      rgb.reduce((sum, c, i) => sum + (c - (ink[i] ?? 0)) * (axis[i] ?? 0), 0) /
      length2;
    const share = Math.min(1, Math.max(0, t));
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
    // Read again: it scrolls the badge to the middle of the view.
    const read = await badgeOf(page, story, scheme);
    if (!read?.ground) {
      kit.check(`6 (${scheme}, ${scale}×): ${name} drawn`, false);
      continue;
    }
    const ink = await innerMark(
      page,
      read.mark,
      await rgbOf(page, read.mark.ink),
      await rgbOf(page, read.ground),
      atY
    );
    const width = diagonal ? ink.width / Math.SQRT2 : ink.width;
    const line = `6 (${scheme}, ${scale}×): ${name} at ${(read.mark.box.right - read.mark.box.left).toFixed(0)}px: ${width.toFixed(2)} device px of ground wide${diagonal ? " (perpendicular)" : ""}, its most ground-like pixel ${(ink.peak * 100).toFixed(0)}% ground`;
    if (scale === 1) {
      kit.note(`${line} (reported)`);
    } else {
      kit.check(`${line} (at least 1 device px)`, width >= 1);
    }
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
