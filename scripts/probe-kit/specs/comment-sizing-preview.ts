/**
 * The comment sizing preview (design-previews/comment-sizing/), served as a
 * folder, read from the engine on Chromium and WebKit, every option (A
 * beside the comment, B a small card with long ones in Comments, C a panel
 * on the right) on every comment (the owner's long reply with Comments open
 * and closed, a short exchange, a new one being written) on every screen
 * (Desk 1440, his window 1037 = 637 + 400, Phone 390):
 *
 * 1. Boxes: nothing in the frame spills sideways (no scroller wider than
 *    its box, no part of the card, the rail, the panel or a sheet past its
 *    holder), and the page itself scrolls no wider than the window at 390,
 *    1100 and 1500.
 * 2. Nothing covers what the comment is about: the commented element stands
 *    whole inside the page area, and the card, a sheet or the composer
 *    meets neither it nor its pill.
 * 3. The owner's case, measured: the agent's reply (about 180 words with
 *    bullets) against the room it scrolls in, and where scrolling remains,
 *    why.
 * 4. The opening and the hand-off on the house clocks, held and sought to
 *    their middle: the card grows from its pill over --dur-menu on
 *    --ease-out; a rail widening to hold the thread tweens its width over
 *    --dur-morph on --ease-drawer while the list fades out over --dur-exit
 *    and the thread fades in on the width's clock; a rail arriving comes in
 *    over --dur-panel on --ease-drawer; what opens in a list or a short card
 *    unfolds over --dur-pop on --ease-out.
 * 5. C's handle: dragged by a mouse it stops at 300px and at half the pane,
 *    the keyboard's Home and End too, and its width survives a reload, as
 *    does a thread B handed to Comments.
 * 6. No console error.
 *
 *   bun scripts/probe-kit/run.ts comment-sizing-preview
 */
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import type { Engine, Kit, Spec, View } from "../kit";
import { ROOT } from "../kit";

const DIR = join(ROOT, "design-previews", "comment-sizing");
const OPTIONS = ["a", "b", "c"] as const;
const CASES = ["long", "closed", "short", "new"] as const;
type Option = (typeof OPTIONS)[number];
type Case = (typeof CASES)[number];
type ScreenName = "desk" | "window" | "phone";
/** Each screen's frame, and the window the preview is read in: wide enough that the frame stands at its real size. */
const SCREENS: Record<
  ScreenName,
  { w: number; h: number; view: View; window: number }
> = {
  desk: { w: 1440, h: 900, view: "desk", window: 1500 },
  window: { w: 1037, h: 760, view: "desk", window: 1100 },
  phone: { w: 390, h: 844, view: "phone", window: 390 },
};
const OPTION_NAME: Record<Option, string> = {
  a: "A (beside the comment)",
  b: "B (small card, long ones in Comments)",
  c: "C (a panel on the right)",
};

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}
interface Read {
  /** The commented element's area outside the page area or under a card, a sheet or the composer, px². */
  covered: number;
  coveredBy: string;
  floatSide: string | null;
  holder: Box | null;
  /** A pill the card or a sheet stands on, px². */
  onPill: number;
  /** What spills sideways, each as `what: px`. */
  overflow: string[];
  reply: { h: number; room: number; words: number } | null;
  s: number;
  side: number | null;
  stands: string;
  well: Box;
}

function serve() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(
        join(DIR, path.endsWith("/") ? `${path}index.html` : path)
      );
      if (!file.startsWith(DIR)) {
        return new Response("no", { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response("not found", { status: 404 });
    },
  });
}

/** The frame as the page drew it, every run let go to its end and the frame laid out after it. */
async function landed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (const run of document.getAnimations()) {
      run.finish();
    }
    await new Promise((done) => setTimeout(done, 450));
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
  });
}

async function load(
  page: Page,
  base: string,
  option: Option,
  which: Case,
  screen: ScreenName
): Promise<void> {
  const before = await page
    .evaluate(() => Number(document.documentElement.dataset.ready ?? 0))
    .catch(() => 0);
  await page.goto(`${base}?option=${option}&case=${which}&screen=${screen}`);
  await page.waitForFunction(
    (was) => Number(document.documentElement.dataset.ready ?? 0) > 0 || was < 0,
    before
  );
  await landed(page);
}

/** Every box the rules read, in the frame's own px. Runs in the page. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one read in the page of every rule's boxes, which cannot share this module's scope
function readFrame(): Read {
  const frame = document.querySelector<HTMLElement>('[data-slot="frame"]');
  const fit = document.querySelector<HTMLElement>('[data-slot="fit"]');
  if (!(frame && fit)) {
    throw new Error("no frame");
  }
  const s = Number(fit.style.getPropertyValue("--s"));
  const origin = frame.getBoundingClientRect();
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - origin.left) / s,
      y: (r.top - origin.top) / s,
      w: r.width / s,
      h: r.height / s,
    };
  };
  const meet = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const q = <T extends Element>(selector: string) =>
    frame.querySelector<T>(selector);
  const wellEl = q<HTMLElement>('[data-slot="well"]');
  if (!wellEl) {
    throw new Error("no well");
  }
  const well = box(wellEl);
  const float = q<HTMLElement>(
    '[data-slot="pin-card"], [data-slot="pin-composer"]'
  );
  const sheet = q<HTMLElement>('[data-slot="foot-sheet"]');
  const side = q<HTMLElement>('[data-slot="side"]');
  const target = q<HTMLElement>("[data-commented]");
  const stands = frame.dataset.stands ?? "";

  // What spills sideways: a scroller wider than its box, or a visible part
  // of a card, a rail, a panel or a sheet past its holder's edges.
  const overflow: string[] = [];
  const scrollers = [
    frame,
    wellEl,
    ...frame.querySelectorAll<HTMLElement>(
      '[data-slot="page-scroll"], [data-slot="side"], [data-slot="foot-sheet"], [data-slot="pin-card"], [data-slot="pin-composer"], [data-pin-room], [data-slot="rows"], [data-slot="rail-thread"], [data-slot="comment-rail"], [data-slot="row-thread"], [data-slot="pane-head"]'
    ),
  ];
  for (const el of scrollers) {
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) {
      overflow.push(
        `${el.dataset.slot ?? el.className.slice(0, 30)} scrolls ${over}px sideways`
      );
    }
  }
  for (const holder of [
    float,
    side,
    sheet,
    q<HTMLElement>('[data-slot="pane-head"]'),
  ]) {
    if (!holder) {
      continue;
    }
    const edge = box(holder);
    for (const el of holder.querySelectorAll<HTMLElement>("*")) {
      const style = getComputedStyle(el);
      const r = box(el);
      if (
        r.w <= 1 ||
        r.h <= 1 ||
        style.visibility === "hidden" ||
        el.closest(".sr-only, [data-slot='side-was']") ||
        style.position === "absolute"
      ) {
        continue;
      }
      // Clipped by a scroller inside the holder: its scroll is read above.
      let clipped = false;
      for (
        let up = el.parentElement;
        up && up !== holder;
        up = up.parentElement
      ) {
        const o = getComputedStyle(up).overflowX;
        if (o !== "visible") {
          clipped = true;
          break;
        }
      }
      if (clipped) {
        continue;
      }
      const past = Math.max(edge.x - r.x, r.x + r.w - (edge.x + edge.w));
      if (past > 1) {
        overflow.push(
          `${el.tagName.toLowerCase()}[${el.dataset.slot ?? ""}] ${past.toFixed(1)}px past ${holder.dataset.slot}`
        );
      }
    }
  }
  if (frame.scrollWidth > frame.clientWidth + 1) {
    overflow.push(`the frame ${frame.scrollWidth - frame.clientWidth}px`);
  }

  // What covers the commented element: the page area's edges, then a card,
  // a sheet or the composer standing on it.
  let covered = 0;
  let coveredBy = "";
  if (target) {
    const t = box(target);
    const area = t.w * t.h;
    const inside = meet(t, well);
    if (area - inside > 1) {
      covered += area - inside;
      coveredBy += `outside the page area by ${(area - inside).toFixed(0)}px² `;
    }
    for (const [name, el] of [
      ["card", float],
      ["sheet", sheet],
    ] as const) {
      if (el) {
        const over = meet(t, box(el));
        if (over > 1) {
          covered += over;
          coveredBy += `${name} ${over.toFixed(0)}px² `;
        }
      }
    }
  }
  const pill = q('[data-page-pin="3"], [data-page-pin="new"]');
  let onPill = 0;
  if (pill) {
    for (const el of [float, sheet]) {
      if (el) {
        onPill += meet(box(pill), box(el));
      }
    }
  }

  // The agent's reply against the room it scrolls in.
  const holderEl =
    side?.querySelector<HTMLElement>("[data-holds]") ??
    sheet?.querySelector<HTMLElement>(
      '[data-slot="row-thread"], [data-holds]'
    ) ??
    float;
  let reply: Read["reply"] = null;
  const replyEl = holderEl?.querySelector<HTMLElement>('li[data-by="agent"]');
  const room =
    stands === "row"
      ? sheet?.querySelector<HTMLElement>('[data-slot="rows"]')
      : holderEl?.querySelector<HTMLElement>("[data-pin-room]");
  if (replyEl && room && stands !== "compose") {
    reply = {
      h: Math.round(box(replyEl).h),
      room: room.clientHeight,
      words: (replyEl.querySelector('[data-slot="msg"]')?.textContent ?? "")
        .trim()
        // biome-ignore lint/performance/useTopLevelRegex: it runs in the page, which shares no scope with this module
        .split(/\s+/).length,
    };
  }
  return {
    s,
    stands,
    well,
    side: side ? Math.round(box(side).w) : null,
    holder: holderEl ? box(holderEl) : null,
    floatSide: float?.dataset.side ?? null,
    overflow,
    covered,
    coveredBy: coveredBy.trim(),
    onPill,
    reply,
  };
}

const why = (option: Option, read: Read): string => {
  if (read.stands === "card") {
    return `the card's tallest is the room ${read.floatSide === "above" ? "above what it is about" : "from its pin to the well's foot"}${option === "b" ? ", capped at min(480px, 50% of the well)" : ""}`;
  }
  if (read.stands === "sheet" || read.stands === "bottom") {
    return "the drawer stops at its share of the well, the page lifted above it";
  }
  if (read.stands === "row") {
    return "the list's drawer stops at 85% of the well, its rows scrolling round the opened one";
  }
  return "its head and its reply stand still, the entries scroll between them in the pane's height";
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every option on every comment, four rules each, and the owner's case read out
async function boxesLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  screen: ScreenName
): Promise<void> {
  for (const option of OPTIONS) {
    for (const which of CASES) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame at a time on one page
      await load(page, base, option, which, screen);
      const read = await page.evaluate(readFrame);
      const at = `${engine} ${screen} ${option.toUpperCase()} ${which}`;
      kit.check(
        `${at}: the frame stands at its real size (scale ${read.s})`,
        read.s === 1
      );
      kit.check(
        `${at}: nothing spills sideways`,
        read.overflow.length === 0,
        read.overflow.slice(0, 6).join("; ")
      );
      kit.check(
        `${at}: what the comment is about stands whole in the page area, nothing over it${read.stands === "none" ? "" : ` (the thread ${read.stands}${read.floatSide ? `, ${read.floatSide}` : ""})`}`,
        read.covered <= 1,
        read.coveredBy
      );
      kit.check(
        `${at}: no card or drawer stands on the comment's pill`,
        read.onPill <= 1,
        `${read.onPill.toFixed(0)}px²`
      );
      if (which === "long" || which === "closed") {
        const r = read.reply;
        if (!r) {
          kit.check(`${at}: the thread is open`, false, read.stands);
          continue;
        }
        const { room } = r;
        const line =
          r.h <= room
            ? `the agent's reply (${r.words} words, ${r.h}px) reads whole without scrolling in its ${room}px room, ${Math.round(read.holder?.w ?? 0)} × ${Math.round(read.holder?.h ?? 0)}`
            : `scrolling remains: the agent's reply (${r.words} words, ${r.h}px) in a ${room}px room, ${r.h - room}px a scroll away, because ${why(option, read)} (${Math.round(read.holder?.w ?? 0)} × ${Math.round(read.holder?.h ?? 0)})`;
        kit.check(
          `${at}, his case in ${OPTION_NAME[option]}: ${line}`,
          r.h > 0 && room > 0 && r.words >= 150
        );
      }
    }
  }
}

/** Every run the page holds, by what it moves: its target's slot, its length and its curve. Runs in the page. */
function heldRuns() {
  // The house edge fade runs on its scroller's timeline, not a clock: left out.
  return document
    .getAnimations()
    .filter((run) =>
      Number.isFinite(Number(run.effect?.getComputedTiming().duration))
    )
    .map((run) => {
      const effect = run.effect as KeyframeEffect;
      const target = effect.target as HTMLElement | null;
      const timing = effect.getComputedTiming();
      return {
        slot:
          target?.dataset.slot ??
          (target?.dataset.middle === undefined ? target?.className : "middle"),
        ms: Number(timing.duration),
        easing: effect.getTiming().easing,
        props: effect
          .getKeyframes()
          .flatMap((frame) =>
            Object.keys(frame).filter(
              (key) =>
                !["offset", "easing", "composite", "computedOffset"].includes(
                  key
                )
            )
          ),
      };
    });
}

async function motionLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine
): Promise<void> {
  const curves = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return {
      out: css.getPropertyValue("--ease-out").trim(),
      drawer: css.getPropertyValue("--ease-drawer").trim(),
    };
  });
  const same = (a: string, b: string) =>
    a.replaceAll(" ", "") === b.replaceAll(" ", "");
  const legs: {
    option: Option;
    which: Case;
    screen: ScreenName;
    what: string;
    want: { slot: string; ms: number; easing: string; prop: string }[];
    mid?: string;
  }[] = [
    {
      option: "a",
      which: "long",
      screen: "window",
      what: "A's card grows from its pill",
      want: [
        { slot: "pin-card", ms: 140, easing: curves.out, prop: "transform" },
      ],
    },
    {
      option: "b",
      which: "long",
      screen: "window",
      what: "B hands the long thread to Comments: the rail tweens from 320px to 400px while the list fades out and the thread in",
      want: [
        { slot: "side", ms: 180, easing: curves.drawer, prop: "width" },
        {
          slot: "comment-rail",
          ms: 180,
          easing: curves.drawer,
          prop: "opacity",
        },
        { slot: "side-was", ms: 160, easing: curves.out, prop: "opacity" },
      ],
      mid: "side",
    },
    {
      option: "b",
      which: "closed",
      screen: "desk",
      what: "B with Comments closed: the rail comes in from its end at 400px",
      want: [{ slot: "side", ms: 280, easing: curves.drawer, prop: "width" }],
      mid: "side",
    },
    {
      option: "c",
      which: "long",
      screen: "desk",
      what: "C opens the panel in the list's place: 320px tweening to 400px",
      want: [
        { slot: "side", ms: 180, easing: curves.drawer, prop: "width" },
        {
          slot: "comment-rail",
          ms: 180,
          easing: curves.drawer,
          prop: "opacity",
        },
      ],
      mid: "side",
    },
    {
      option: "b",
      which: "long",
      screen: "phone",
      what: "B on a phone: the comment's row unfolds into its thread",
      want: [
        { slot: "row-thread", ms: 260, easing: curves.out, prop: "height" },
      ],
    },
  ];
  for (const leg of legs) {
    // biome-ignore lint/performance/noAwaitInLoops: one held clock at a time
    await load(page, base, leg.option, leg.which, leg.screen);
    const runs = await page.evaluate(() => {
      document.querySelector<HTMLElement>('[data-slot="replay"]')?.click();
      const read = (
        window as unknown as { heldRuns: () => ReturnType<typeof heldRuns> }
      ).heldRuns();
      for (const run of document.getAnimations()) {
        run.pause();
      }
      return read;
    });
    const missing = leg.want.filter(
      (want) =>
        !runs.some(
          (run) =>
            run.slot === want.slot &&
            Math.abs(run.ms - want.ms) < 1 &&
            same(run.easing ?? "", want.easing) &&
            run.props.includes(want.prop)
        )
    );
    kit.check(
      `${engine} motion: ${leg.what} (${leg.want.map((w) => `${w.slot} ${w.prop} ${w.ms}ms`).join(", ")})`,
      missing.length === 0,
      `missing ${JSON.stringify(missing)}; held ${JSON.stringify(runs)}`
    );
    if (leg.mid) {
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: seeks every run to each fraction and reads the width there, in the page
      const mid = await page.evaluate((slot) => {
        const el = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
        const widths: number[] = [];
        for (const f of [0, 0.5, 1]) {
          for (const run of document.getAnimations()) {
            const total = Number(run.effect?.getComputedTiming().duration);
            if (Number.isFinite(total)) {
              run.currentTime = total * f;
            }
          }
          const fit = document.querySelector<HTMLElement>('[data-slot="fit"]');
          const s = Number(fit?.style.getPropertyValue("--s")) || 1;
          widths.push(el ? el.getBoundingClientRect().width / s : -1);
        }
        return widths;
      }, leg.mid);
      kit.check(
        `${engine} motion: ${leg.what}, sought to 0, ½ and 1 its width moves one way (${mid.map((w) => w.toFixed(0)).join(" → ")}px)`,
        mid[0] < mid[1] && mid[1] < mid[2]
      );
    }
    await landed(page);
  }
}

/**
 * B's cap, set by its definition (a short exchange stays a card, a long one
 * goes to Comments): min(480px, 50% of the well). The three-entry one-line
 * exchange stands as the card (a phone's drawer) whole, its entries not
 * scrolling; the 185-word thread goes to Comments (a phone's row); the
 * readout names the cap as our call.
 */
async function capLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  screen: ScreenName
): Promise<void> {
  const phone = screen === "phone";
  for (const which of ["short", "long"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time on one page
    await load(page, base, "b", which, screen);
    const read = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('[data-slot="frame"]');
      const room = frame?.querySelector<HTMLElement>(
        '[data-slot="pin-card"] [data-pin-room]'
      );
      return {
        stands: frame?.dataset.stands ?? "",
        needs: frame?.dataset.needs ?? "",
        scrolls: room ? room.scrollHeight - room.clientHeight : null,
        readout:
          document.querySelector('[data-slot="readout"]')?.textContent ?? "",
      };
    });
    const [need, cap] = read.needs.split("/").map(Number);
    const named = read.readout.includes("B's cap is our call");
    if (which === "short") {
      const want = phone ? "sheet" : "card";
      kit.check(
        `${engine} ${screen} B short: the three-entry one-line exchange needs ${need}px, within the card's ${cap}px cap (min(480px, 50% of the well)), so it stays ${phone ? "a drawer" : "a card"} (${read.stands}), its entries whole (${read.scrolls}px of scroll), and the readout names the cap as our call`,
        read.stands === want &&
          need <= cap &&
          read.scrolls !== null &&
          read.scrolls <= 1 &&
          named,
        read.readout
      );
    } else {
      const want = phone ? "row" : "rail";
      kit.check(
        `${engine} ${screen} B long: the 185-word thread needs ${need}px, over the card's ${cap}px cap, so it goes to Comments (${read.stands}), and the readout names the cap as our call`,
        read.stands === want && need > cap && named,
        read.readout
      );
    }
  }
}

async function dragLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  screen: ScreenName
): Promise<void> {
  await load(page, base, "c", "long", screen);
  const pane = SCREENS[screen].w;
  const handle = page.locator('[data-slot="resizable-handle"]');
  const at = await handle.boundingBox();
  if (!at) {
    kit.check(`${engine} ${screen} C: its handle stands`, false);
    return;
  }
  const y = at.y + at.height / 2;
  const x = at.x + at.width / 2;
  const width = () =>
    page.evaluate(() =>
      Math.round(
        document.querySelector('[data-slot="side"]')?.getBoundingClientRect()
          .width ?? -1
      )
    );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 2000, y, { steps: 8 });
  const held = await page.evaluate(
    () =>
      document.querySelector<HTMLElement>('[data-slot="resizable-handle"]')
        ?.dataset.active ?? ""
  );
  const widest = await width();
  await page.mouse.move(x + 2000, y, { steps: 8 });
  const narrowest = await width();
  await page.mouse.move(x - 150, y, { steps: 4 });
  await page.mouse.up();
  const left = await width();
  kit.check(
    `${engine} ${screen} C: dragged wider its panel stops at half the pane (${widest}px of ${pane}px), drawn in the handle's held ink`,
    Math.abs(widest - pane / 2) <= 1 && held === "pointer"
  );
  kit.check(
    `${engine} ${screen} C: dragged narrower it stops at 300px (${narrowest}px)`,
    Math.abs(narrowest - 300) <= 1
  );
  await page.reload();
  await page.waitForSelector("html[data-ready]");
  await landed(page);
  kit.check(
    `${engine} ${screen} C: the width it was left at survives a reload (${left}px, then ${await width()}px)`,
    Math.abs((await width()) - left) <= 1
  );
  await handle.focus();
  await page.keyboard.press("End");
  const end = await width();
  await page.keyboard.press("Home");
  const home = await width();
  kit.check(
    `${engine} ${screen} C: End and Home on the handle stop at half the pane and at 300px (${end}px, ${home}px)`,
    Math.abs(end - pane / 2) <= 1 && Math.abs(home - 300) <= 1
  );
  const read = await page.evaluate(readFrame);
  kit.check(
    `${engine} ${screen} C at 300px: nothing spills sideways and what the comment is about stays whole`,
    read.overflow.length === 0 && read.covered <= 1,
    `${read.overflow.join("; ")} ${read.coveredBy}`
  );
}

async function reloadLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine
): Promise<void> {
  await load(page, base, "b", "long", "window");
  const before = await page.evaluate(readFrame);
  await page.goto(base);
  await page.waitForSelector("html[data-ready]");
  await landed(page);
  const after = await page.evaluate(readFrame);
  kit.check(
    `${engine}: a thread B handed to Comments is still there after a reload, with no address to say so (${before.stands} at ${before.side}px, then ${after.stands} at ${after.side}px)`,
    before.stands === "rail" &&
      after.stands === "rail" &&
      before.side === after.side
  );
}

async function pageWidthLeg(
  kit: Kit,
  page: Page,
  engine: Engine,
  view: number
): Promise<void> {
  const over = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  kit.check(
    `${engine} at ${view}: the preview page scrolls no wider than the window (${over}px)`,
    over <= 0
  );
}

const spec: Spec = {
  name: "comment-sizing-preview",
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (process.env.SIZING_ENGINES ?? "chromium,webkit").split(
        ","
      ) as Engine[];
      for (const engine of engines) {
        const errors: string[] = [];
        for (const screen of Object.keys(SCREENS) as ScreenName[]) {
          const shape = SCREENS[screen];
          // biome-ignore lint/performance/noAwaitInLoops: one engine's pages one at a time
          const page = await kit.page(shape.view, {
            engine,
            scale: 1,
            init: [{ content: `window.heldRuns = ${heldRuns.toString()};` }],
          });
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(String(error)));
          await page.setViewportSize({
            width: shape.window,
            height: shape.h + 360,
          });
          await page.goto(base);
          await page.evaluate(() => localStorage.clear());
          await boxesLeg(kit, page, base, engine, screen);
          await pageWidthLeg(kit, page, engine, shape.window);
          await capLeg(kit, page, base, engine, screen);
          if (screen === "window") {
            await motionLeg(kit, page, base, engine);
            await reloadLeg(kit, page, base, engine);
          }
          if (screen !== "phone") {
            await dragLeg(kit, page, base, engine, screen);
          }
          await page.close();
        }
        kit.check(
          `${engine}: no console or page error`,
          errors.length === 0,
          errors.slice(0, 4).join(" | ")
        );
      }
    } finally {
      server.stop(true);
    }
  },
};

export default spec;
