/**
 * The comment card sizing exploration's three directions (PinCardFixture and
 * its states files PinCardReading, PinCardShort and PinCardPanel), read from the
 * engine on the dashboard's stage, each states file drawn as a decision
 * page's Preview draws it (`by=embed`), on Chromium and on WebKit. For each
 * rest frame, where the open thread stands (the card beside its pill, a
 * sheet, the rail, the panel, a row of the list):
 *
 * 1. Its width, its tallest (computed `max-height`, else its drawn height)
 *    and whether its entries scroll inside it, printed per direction per
 *    size, and held to the direction's numbers: A 415px at the desk with the
 *    list open, 480 shut, 328 on the tablet with the list shut; B's card
 *    320, its rail 400; C's panel 400, its composer 280.
 * 2. Its head and its reply stand inside it, inside the pane, and hold
 *    still to the pixel while its entries are scrolled to their middle.
 * 3. Nothing in it is wider than it is (no sideways scroll), and it stands
 *    wholly inside its pane.
 * 4. No console error and no page error while the three files draw.
 * 5. A's head: its quote in two lines at most, and Resolve and Delete in
 *    More only where the card is under 360px.
 * 6. A card or composer beside its pill stands clear of it.
 * 7. A thread in a sheet or a panel leaves its pill in view, except where
 *    the direction stands it over the pill (COVERS_PILL).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { type Engine, type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");

/** The directions' states files, from the dashboard's root, by the letter the page names them. */
const FILES = {
  A: "src/lib/cawco/preview/PinCardReading.stories.ts",
  B: "src/lib/cawco/preview/PinCardShort.stories.ts",
  C: "src/lib/cawco/preview/PinCardPanel.stories.ts",
} as const;

/** The width each frame's thread holder must take, px (within 1px); none where it is the sheet's whole width. */
const WIDTHS: Record<string, number> = {
  "A DeskListOpen": 415,
  "A DeskListClosed": 480,
  "A TabletListClosed": 328,
  "A TabletListOpen": 500,
  "A Phone": 390,
  "B DeskShortThread": 320,
  "B DeskListOpen": 400,
  "B DeskListClosed": 400,
  "B TabletListOpen": 400,
  "C DeskComposing": 280,
  "C DeskListOpen": 400,
  "C DeskListClosed": 400,
  "C TabletListOpen": 400,
  "C Phone": 390,
};

/** Frames whose entries are held to scroll inside the holder: every long thread. */
const NO_SCROLL = new Set(["B DeskShortThread", "C DeskComposing"]);

/**
 * Frames whose sheet or panel stands over the pill it answers: every phone
 * (the well's foot sheet, as today, over a page that doesn't scroll the pin
 * above it) and C's tablet side sheet.
 */
const COVERS_PILL = new Set([
  "A Phone",
  "B Phone",
  "C Phone",
  "C TabletListOpen",
]);

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** A box, px. */
interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** One rest frame's thread holder as the page reads it: boxes and sizes, nothing judged. */
interface Raw {
  box: Box | null;
  /** The head's and the reply's boxes before the entries were scrolled to their middle, and after. */
  feet: [Box | null, Box | null];
  folded: boolean;
  heads: [Box | null, Box | null];
  holder: string;
  maxHeight: string;
  name: { height: number; line: number } | null;
  pane: (Box & { client: number; scroll: number }) | null;
  /** The pill, where the holder stands beside it (not a sheet). */
  pill: Box | null;
  /** The surface the thread stands on as a sheet or a panel: the list's sheet round a row, else the holder. */
  sheet: Box | null;
  /** The pill, where the holder is a sheet or a panel. */
  sheetPill: Box | null;
  room: {
    client: number;
    clientW: number;
    scroll: number;
    scrollW: number;
  } | null;
  /** The holder's own width and what it holds. */
  self: { client: number; scroll: number };
  story: string;
}

/** Every rest frame of `file`, drawn and settled. */
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
    { timeout: 120_000 }
  );
  await page.evaluate(() => document.fonts.ready);
  // The thread's words load once (PinCard's MessageBody), then settle.
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-slot="fixture-pane"]')].every(
        (pane) =>
          !pane.querySelector("[data-pin-room]") ||
          pane.querySelector('[data-slot="entry"]')
      ),
    undefined,
    { timeout: 30_000 }
  );
  const running = () =>
    document
      .getAnimations()
      .filter(
        (motion) =>
          motion.playState === "running" &&
          // A scroll-driven one (the house edge fade) runs on its scroller's clock, never ending.
          motion.timeline === document.timeline &&
          motion.effect?.getComputedTiming().iterations !==
            Number.POSITIVE_INFINITY
      )
      .map((motion) => {
        const target = (motion.effect as KeyframeEffect | null)?.target;
        const name =
          (motion as CSSAnimation).animationName ??
          (motion as CSSTransition).transitionProperty ??
          "web animation";
        return `${name} on ${target?.localName ?? "?"}[${target?.getAttribute("data-slot") ?? ""}]`;
      });
  await page
    .waitForFunction(`(${running.toString()})().length === 0`, undefined, {
      timeout: 10_000,
    })
    .catch(async () => {
      throw new Error(
        `still running after 10s: ${(await page.evaluate(running)).slice(0, 6).join(", ")}`
      );
    });
}

/** The stories of `file`'s rest frames. In the page. */
const storiesOf = (file: string): string[] =>
  [
    ...document.querySelectorAll<HTMLElement>(
      `.cawco-frame[data-cawco-file="${file}"][data-cawco-interaction="rest"]`
    ),
  ].map((frame) => frame.dataset.cawcoStory ?? "?");

/** Story `story`'s thread holder, read, its entries scrolled to their middle and back. In the page. */
async function rawOf(args: { file: string; story: string }): Promise<Raw> {
  const frame = document.querySelector<HTMLElement>(
    `.cawco-frame[data-cawco-file="${args.file}"][data-cawco-interaction="rest"][data-cawco-story="${args.story}"]`
  );
  const boxOf = (el: Element | null | undefined): Box | null => {
    const at = el?.getBoundingClientRect();
    return at
      ? { top: at.top, bottom: at.bottom, left: at.left, right: at.right }
      : null;
  };
  const pane = frame?.querySelector<HTMLElement>('[data-slot="fixture-pane"]');
  const found =
    frame?.querySelector<HTMLElement>(
      '[data-slot="pin-card"], [data-slot="pin-composer"], [data-slot="row-thread"]'
    ) ??
    frame
      ?.querySelector('[data-slot="rail-thread"]')
      ?.closest<HTMLElement>('[data-slot="comment-rail"]');
  const room = found?.querySelector<HTMLElement>("[data-pin-room]") ?? null;
  const head = found?.querySelector('[data-slot="head"]');
  const foot = found?.querySelector('[data-slot="foot"]');
  const before = [boxOf(head), boxOf(foot)];
  if (room) {
    const kept = room.scrollTop;
    room.scrollTop = (room.scrollHeight - room.clientHeight) / 2;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done()))
    );
    before.push(boxOf(head), boxOf(foot));
    room.scrollTop = kept;
  }
  const name = found?.querySelector('[data-slot="name"]');
  const paneBox = boxOf(pane);
  return {
    story: args.story,
    holder: found?.dataset.slot ?? "none",
    box: boxOf(found),
    maxHeight: found ? getComputedStyle(found).maxHeight : "",
    pane:
      pane && paneBox
        ? { ...paneBox, client: pane.clientWidth, scroll: pane.scrollWidth }
        : null,
    self: { client: found?.clientWidth ?? 0, scroll: found?.scrollWidth ?? 0 },
    room: room
      ? {
          client: room.clientHeight,
          scroll: room.scrollHeight,
          clientW: room.clientWidth,
          scrollW: room.scrollWidth,
        }
      : null,
    heads: [before[0], before[2] ?? before[0]],
    feet: [before[1], before[3] ?? before[1]],
    folded: !!found?.querySelector("[data-folded]"),
    name: name
      ? {
          height: name.getBoundingClientRect().height,
          line: Number.parseFloat(getComputedStyle(name).lineHeight),
        }
      : null,
    pill:
      found?.dataset.side && found.dataset.sheet === undefined
        ? boxOf(frame?.querySelector('[data-slot="fixture-pill"]'))
        : null,
    sheetPill:
      found?.dataset.side === undefined
        ? boxOf(frame?.querySelector('[data-slot="fixture-pill"]'))
        : null,
    sheet: boxOf(found?.closest('[data-slot="rail-sheet"]') ?? found),
  };
}

/** `inner` stands inside `outer`, to half a pixel. */
const within = (inner: Box | null, outer: Box | null): boolean =>
  !!inner &&
  !!outer &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5 &&
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5;

/** How far `one` moved between two reads, px. */
const moved = (one: [Box | null, Box | null]): number =>
  one[0] && one[1] ? Math.abs(one[1].top - one[0].top) : -1;

/** Two boxes share no area. */
const apart = (one: Box, two: Box): boolean =>
  one.right <= two.left + 0.5 ||
  one.left >= two.right - 0.5 ||
  one.bottom <= two.top + 0.5 ||
  one.top >= two.bottom - 0.5;

/** A's head (its quote's lines, its fold), and a card's or composer's place clear of its pill. */
function holdBeside(
  kit: Kit,
  engine: Engine,
  letter: string,
  raw: Raw,
  width: number
): void {
  const key = `${letter} ${raw.story}`;
  if (letter === "A") {
    const lines = raw.name ? Math.round(raw.name.height / raw.name.line) : 0;
    kit.check(
      `${engine} 5 ${key}: the head's quote takes two lines at most, and Resolve and Delete fold into More only under 360px (${raw.folded ? "folded" : "unfolded"})`,
      lines >= 1 && lines <= 2 && raw.folded === width < 360,
      `${lines} lines at ${width}px`
    );
  }
  if (raw.sheetPill && raw.sheet) {
    const covers = COVERS_PILL.has(key);
    kit.check(
      `${engine} 7 ${key}: the thread ${covers ? "covers its pill, as the direction draws it" : "leaves its pill in view"}`,
      apart(raw.sheetPill, raw.sheet) === !covers,
      `pill ${Math.round(raw.sheetPill.top)} to ${Math.round(raw.sheetPill.bottom)}, thread ${Math.round(raw.sheet.top)} to ${Math.round(raw.sheet.bottom)}`
    );
  }
  if (raw.pill && raw.box) {
    kit.check(
      `${engine} 6 ${key}: it stands clear of its pill`,
      apart(raw.pill, raw.box)
    );
  }
}

/** Story `raw`'s numbers, held to its direction's. */
function holdRaw(kit: Kit, engine: Engine, letter: string, raw: Raw): void {
  const key = `${letter} ${raw.story}`;
  const width = raw.box
    ? Math.round((raw.box.right - raw.box.left) * 10) / 10
    : 0;
  const height = raw.box ? Math.round(raw.box.bottom - raw.box.top) : 0;
  const scrolls = !!raw.room && raw.room.scroll > raw.room.client + 1;
  const room = raw.room
    ? `${raw.room.client}px of ${raw.room.scroll}px`
    : "no entries";
  const cap = raw.maxHeight === "none" ? `${height}px` : raw.maxHeight;
  const wanted = WIDTHS[key];
  kit.check(
    `${engine} 1 ${key}: ${width}px wide, ${cap} max, ${scrolls ? "entries scroll" : "entries don't scroll"} (${room})`,
    (wanted === undefined || Math.abs(width - wanted) <= 1) &&
      scrolls === !NO_SCROLL.has(key),
    wanted === undefined ? "" : `wanted ${wanted}px`
  );
  if (raw.holder !== "pin-composer") {
    kit.check(
      `${engine} 2 ${key}: head and reply inside the thread and the pane, still while the entries scroll`,
      within(raw.heads[0], raw.box) &&
        within(raw.feet[0], raw.box) &&
        within(raw.heads[0], raw.pane) &&
        within(raw.feet[0], raw.pane) &&
        moved(raw.heads) === 0 &&
        moved(raw.feet) === 0,
      `head moved ${moved(raw.heads)}px, reply moved ${moved(raw.feet)}px`
    );
  }
  const spill = Math.max(
    0,
    raw.self.scroll - raw.self.client,
    raw.room ? raw.room.scrollW - raw.room.clientW : 0
  );
  const paneSpill = raw.pane ? raw.pane.scroll - raw.pane.client : -1;
  kit.check(
    `${engine} 3 ${key}: nothing wider than the thread, the thread inside its pane`,
    spill === 0 && paneSpill === 0 && within(raw.box, raw.pane),
    `spill ${spill}px, pane spill ${paneSpill}px`
  );
  holdBeside(kit, engine, letter, raw, width);
}

async function readEngine(kit: Kit, base: string, engine: Engine) {
  const page = await kit.page("desk", { engine, scale: 1 });
  await page.setViewportSize({ width: 1440, height: 1300 });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  for (const [letter, file] of Object.entries(FILES)) {
    // biome-ignore lint/performance/noAwaitInLoops: one page, each file in turn
    await openFile(page, base, file);
    const stories = await page.evaluate(storiesOf, file);
    const raws: Raw[] = [];
    for (const story of stories) {
      // biome-ignore lint/performance/noAwaitInLoops: each frame scrolls its own entries, one at a time
      raws.push(await page.evaluate(rawOf, { file, story }));
    }
    kit.check(
      `${engine} ${letter}: every rest frame holds its thread`,
      raws.length > 0 && raws.every((raw) => raw.holder !== "none"),
      raws.map((raw) => `${raw.story} ${raw.holder}`).join(", ")
    );
    for (const raw of raws) {
      holdRaw(kit, engine, letter, raw);
    }
  }
  kit.check(
    `${engine} 4: no console or page error while the three files draw`,
    errors.length === 0,
    errors.slice(0, 5).join(" | ")
  );
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
    for (const engine of ["chromium", "webkit"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one engine at a time, on one stage
      await readEngine(kit, base, engine);
    }
  } finally {
    stage.kill("SIGTERM");
  }
};

const spec: Spec = { name: "comment-card-sizing", run };
export default spec;
