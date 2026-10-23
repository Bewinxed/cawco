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
 *    size, and held to the direction's numbers: A 400px at the 1320px desk with the
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
 *
 * Then each canvas opened on a page of its own (and StatTile's, a floor):
 * when its page loaded, how many files it fetched by then and in all, when
 * every frame stood whole (its composer in), and the stage's weight of it.
 * And the decision page itself (design/explorations/comment-card-sizing/
 * page.oui) as the hub's decision host draws it, its Previews on this
 * stage (decision-embeds.ts), at 1440 on a cold stage and again warm, at
 * 390 under a finger, and at 390 in a desk's window whose scrollbars take
 * their width:
 * 8. Every Preview draws, each one's time from the page's load to its
 *    frames whole, and when it was asked, loaded and stood at its shape.
 * 9. Nothing spills sideways: the page, no scroller holding more than its
 *    width, no box past the window (a desk's picture scrolling in its well
 *    on a phone is the page's design); and the page's height.
 * 10. No page error.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  CAWCO_BRIDGE,
  type DecisionStage,
  EMBED_FRAME,
  startDecisionStage,
} from "../decision-embeds";
import { type Engine, type Kit, ROOT, type Spec, settle } from "../kit";

/** The directions' states files, from the dashboard's root, by the letter the page names them. */
const FILES = {
  A: "src/lib/cawco/preview/PinCardReading.stories.ts",
  B: "src/lib/cawco/preview/PinCardShort.stories.ts",
  C: "src/lib/cawco/preview/PinCardPanel.stories.ts",
} as const;

/** The width each frame's thread holder must take, px (within 1px); none where it is the sheet's whole width. */
const WIDTHS: Record<string, number> = {
  "A DeskListOpen": 400,
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
 * Frames whose sheet or panel stands over the pill it answers: C's tablet
 * side sheet. A phone's drawer scrolls the page as little as lifts the pin
 * above it (PinCardFixture, as the overlay's `reveal` does).
 */
const COVERS_PILL = new Set(["C TabletListOpen"]);

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
  room: {
    client: number;
    clientW: number;
    scroll: number;
    scrollW: number;
  } | null;
  /** The holder's own width and what it holds. */
  self: { client: number; scroll: number };
  /** The surface the thread stands on as a sheet or a panel: the list's sheet round a row, else the holder. */
  sheet: Box | null;
  /** The pill, where the holder is a sheet or a panel. */
  sheetPill: Box | null;
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
          pane.querySelector('[contenteditable="true"]') &&
          (!pane.querySelector("[data-pin-room]") ||
            pane.querySelector('[data-slot="entry"]'))
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

/** The page's name, its program, and the canvases its Previews embed by their artifact ids. */
const PAGE = "comment-card-sizing";
const PROGRAM = join(ROOT, "design/explorations/comment-card-sizing/page.oui");
const ARTIFACTS: Record<string, readonly string[]> = {
  "b9b09f77-c5ec-416b-b79c-8cc9c7e21744": [FILES.A],
  "9a5d35f3-751a-4902-8f8e-9250979d2489": [FILES.B],
  "cd60e3e8-a370-48f2-b3c1-f62105666dab": [FILES.C],
};
/** The longest an embed may take to draw, ms, before the read gives up on it. */
const EMBED_WAIT_MS = 90_000;

/**
 * Whether an embedded canvas has drawn every rest frame it shows, whole:
 * each pane's composer (the card's reply, or the new comment's) arrived. In
 * the embed's frame.
 */
const allDrawn = (): boolean => {
  const states = [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status'
    ),
  ].map((one) => one.dataset.state ?? "");
  const panes = [...document.querySelectorAll('[data-slot="fixture-pane"]')];
  return (
    states.length > 0 &&
    states.every((one) => one === "drawn") &&
    panes.every((pane) => pane.querySelector('[contenteditable="true"]'))
  );
};

/** Records, from the page's start, when each embed's frame is asked for, loads and says its shape. An init script. */
function embedPhases(): void {
  const seen: Record<string, number>[] = [];
  (window as unknown as { __phases: typeof seen }).__phases = seen;
  const watch = () => {
    for (const [at, frame] of [
      ...document.querySelectorAll("iframe[data-slot=embed]"),
    ].entries()) {
      seen[at] ??= {};
      const one = seen[at];
      const now = Math.round(performance.now());
      if (frame.getAttribute("src") && one.asked === undefined) {
        one.asked = now;
      }
      if (frame.hasAttribute("data-drawn") && one.loaded === undefined) {
        one.loaded = now;
      }
      if (
        frame.getAttribute("data-shape") === "drawn" &&
        one.shaped === undefined
      ) {
        one.shaped = now;
      }
    }
  };
  new MutationObserver(watch).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
  });
}

/** Each embed's time from the page's load to its frames drawn, ms, in the page's order; -1 for one that never drew. */
async function embedTimes(page: Page, started: number): Promise<number[]> {
  const times: number[] = [];
  const frames = page.locator(EMBED_FRAME);
  /** Whether embed `at` has drawn whole now. */
  const drawnNow = async (at: number): Promise<boolean> => {
    const frame = await (await frames.nth(at).elementHandle())?.contentFrame();
    return frame ? await frame.evaluate(allDrawn).catch(() => false) : false;
  };
  const late = () => Date.now() - started > EMBED_WAIT_MS;
  // biome-ignore lint/performance/noAwaitInLoops: polled until every embed has drawn, a tenth of a second apart
  for (let count = await frames.count(); ; count = await frames.count()) {
    const asked = Array.from({ length: count }, (_, at) => at).filter(
      (at) => (times[at] ?? -1) < 0
    );
    const drew = await Promise.all(asked.map(drawnNow));
    for (const [n, at] of asked.entries()) {
      times[at] = drew[n] ? Date.now() - started : -1;
    }
    if ((count > 0 && times.every((one) => one >= 0)) || late()) {
      return times;
    }
    await page.waitForTimeout(100);
  }
}

/**
 * Everything on the decision page that spills sideways, as the person
 * would see it: the page itself scrolling sideways, a scroller holding more
 * than its width (a scrollbar shows, or what it holds is cut), and a box
 * painted past the window's edges. A media well scrolling a picture wider
 * than a phone sideways (a desk's design on a phone, under its edge fade) is
 * the page's design, never a spill; a box no one sees (folded shut, or
 * outside a box that clips it) is no spill either. In the page.
 */
function sideSpills(narrow: boolean): string[] {
  const spills: string[] = [];
  const name = (el: Element) =>
    `${el.localName}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""}.${(el.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}`;
  const clipped = (el: Element, box: DOMRect) => {
    for (let up = el.parentElement; up; up = up.parentElement) {
      const style = getComputedStyle(up);
      const outer = up.getBoundingClientRect();
      const misses = box.right <= outer.left || box.left >= outer.right;
      if (misses && style.overflowX !== "visible") {
        return true;
      }
    }
    return false;
  };
  const root = document.documentElement;
  const wide = root.clientWidth;
  if (root.scrollWidth > wide + 1) {
    spills.push(`the page: ${root.scrollWidth} in ${wide}`);
  }
  for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
    const box = el.getBoundingClientRect();
    const seen =
      box.width > 0 &&
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
      !clipped(el, box);
    /** A desk's design scrolled sideways in its well on a phone: the well and what it holds. */
    const designed =
      narrow && !!el.closest("[data-slot=media-stage][data-wide]");
    if (!seen || (designed && !el.matches("[data-slot=media-stage]"))) {
      continue;
    }
    if (
      getComputedStyle(el).overflowX !== "visible" &&
      !designed &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      spills.push(`${name(el)}: holds ${el.scrollWidth} in ${el.clientWidth}`);
    }
    if (box.right > wide + 1 || box.left < -1) {
      spills.push(
        `${name(el)}: ${Math.round(box.left)} to ${Math.round(box.right)} in a ${wide}px window`
      );
    }
  }
  return spills;
}

/** The page's own height: its document's, or its tallest scroller's where the page scrolls inside one. In the page. */
const pageHeight = (): number =>
  Math.max(
    document.documentElement.scrollHeight,
    ...[...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => getComputedStyle(el).overflowY !== "visible")
      .map((el) => el.scrollHeight)
  );

/** The decision page at `view`: each embed's first draw, then its sideways spills and its height. */
async function readPage(
  kit: Kit,
  stage: DecisionStage,
  view: "desk" | "phone" | "narrow",
  when: string
): Promise<void> {
  const page = await kit.page(view === "phone" ? "phone" : "desk", {
    init: [CAWCO_BRIDGE, embedPhases],
    scale: 1,
    scrollbars: true,
  });
  if (view === "narrow") {
    // A desk's window drawn down to a phone's width: a mouse, and scrollbars that take their width.
    await page.setViewportSize({ width: 390, height: 844 });
  }
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  const started = Date.now();
  await page.goto(stage.pageUrl(PAGE, "light"), { waitUntil: "load" });
  const times = await embedTimes(page, started);
  kit.check(
    `page ${view} ${when}: every Preview draws (${times.map((ms) => `${(ms / 1000).toFixed(1)}s`).join(", ")} from the page's load)`,
    times.length > 0 && times.every((ms) => ms >= 0)
  );
  const phases = await page.evaluate(
    () => (window as unknown as { __phases: Record<string, number>[] }).__phases
  );
  kit.check(
    `page ${view} ${when}: each embed asked, loaded and shaped at (ms) ${phases.map((one) => `${one.asked}/${one.loaded}/${one.shaped}`).join(", ")}`,
    true
  );
  await settle(page, 500);
  const spills = await page.evaluate(sideSpills, view !== "desk");
  const height = await page.evaluate(pageHeight);
  kit.check(
    `page ${view}: nothing spills sideways (${spills.length}); the page is ${height}px tall`,
    spills.length === 0,
    spills.slice(0, 12).join(" | ")
  );
  kit.check(
    `page ${view}: no page error`,
    errors.length === 0,
    errors.join(" | ")
  );
  await page.close();
}

/** A small states file, the floor a canvas's first draw stands on: its time beside the directions' says what is theirs. */
const FLOOR = "src/lib/cawco/StatTile.stories.ts";

/** Each direction's canvas opened on its own page: the time to its frames drawn, and its weight as the stage reads it. */
async function canvasLoads(kit: Kit, base: string): Promise<void> {
  for (const file of [FLOOR, ...Object.values(FILES)]) {
    // biome-ignore lint/performance/noAwaitInLoops: one canvas at a time, each on a fresh page
    const page = await kit.page("desk", {
      scale: 1,
      init: [() => performance.setResourceTimingBufferSize(5000)],
    });
    const started = Date.now();
    await page.goto(
      `${base}/@cawco/canvas?by=embed&file=${encodeURIComponent(file)}`,
      { waitUntil: "load" }
    );
    await page.waitForFunction(allDrawn, undefined, { timeout: EMBED_WAIT_MS });
    const ms = Date.now() - started;
    /** The page's load (every module its first draw waits on, fetched) and how many it fetched by then; then all it fetched. */
    const fetched = await page.evaluate(() => {
      const [nav] = performance.getEntriesByType(
        "navigation"
      ) as PerformanceNavigationTiming[];
      const loads = performance.getEntriesByType("resource");
      const at = nav?.loadEventStart ?? 0;
      return {
        load: Math.round(at),
        first: loads.filter((one) => one.responseEnd <= at).length,
        all: loads.length,
      };
    });
    const weight = (await (
      await fetch(`${base}/__cawco/weight?file=${encodeURIComponent(file)}`)
    ).json()) as {
      weight: {
        bytes: number;
        modules: number;
        over: boolean;
        cut: string | null;
      } | null;
    };
    kit.check(
      `canvas ${file.split("/").at(-1)}: loaded at ${(fetched.load / 1000).toFixed(1)}s on ${fetched.first} files, drawn whole ${(ms / 1000).toFixed(1)}s after its start on ${fetched.all}; the stage weighs it ${weight.weight?.modules} modules, ${Math.round((weight.weight?.bytes ?? 0) / 1000)} kB`,
      true,
      weight.weight?.cut ?? ""
    );
    await page.close();
  }
}

const run = async (kit: Kit) => {
  const stage = await startDecisionStage(
    new Map([[PAGE, readFileSync(PROGRAM, "utf8")]]),
    ARTIFACTS
  );
  try {
    await canvasLoads(kit, `http://127.0.0.1:${stage.stagePort}`);
    await readPage(kit, stage, "desk", "cold stage");
    await readPage(kit, stage, "desk", "warm stage");
    await readPage(kit, stage, "phone", "warm stage");
    await readPage(kit, stage, "narrow", "warm stage");
    const base = `http://127.0.0.1:${stage.stagePort}`;
    for (const engine of ["chromium", "webkit"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one engine at a time, on one stage
      await readEngine(kit, base, engine);
    }
  } finally {
    await stage.stop();
  }
};

const spec: Spec = { name: "comment-card-sizing", run };
export default spec;
