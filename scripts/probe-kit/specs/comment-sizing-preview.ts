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
 *    whole inside the page area, and a sheet or the composer meets neither
 *    it nor its pill; the thread's card stands on the element only where it
 *    hangs from its pin standing on it (PinFloat: the card hangs beside the
 *    pin, its edge on the pin's foot), and never on the pill.
 * 3. The owner's case, measured: the agent's reply (about 180 words with
 *    bullets) against the room it scrolls in, and where scrolling remains,
 *    why.
 * 4. The opening and the hand-off on the house clocks, held and sought:
 *    A's card is the product's own PinFloat, live (live-card/card.js), the
 *    top bar's HangCard hung from its pin's foot: Replay opens it and its
 *    Close shuts it, read at 0, ⅒, ¼, ½, ¾ and 1 on the DevTools Animation
 *    domain (Chromium) or the page's held clock (WebKit), the long and the
 *    short thread, at 1440 and his window (pin-hang.ts): only translate
 *    animates on the card, over --dur-pop on --ease-out in and --dur-exit
 *    out; shut it stands wholly behind the cut at the pin's side; its neck
 *    stands on the pin within 1px at every fraction; the pin's fill never
 *    changes; early in the slide the pin and the card are one silhouette
 *    (the bridge), and open the bridge has drawn itself into the neck.
 *    Scrolling the page under it, by wheel steps and from code, every frame
 *    read: the card stands still between its moves (0px), each move one
 *    travel from the box it stood at to its next, keeping its side;
 *    a rail widening to hold the thread tweens its width over
 *    --dur-morph on --ease-drawer while the list fades out over --dur-exit
 *    and the thread fades in on the width's clock; a rail arriving comes in
 *    over --dur-panel on --ease-drawer; what opens in a list or a short card
 *    unfolds over --dur-pop on --ease-out.
 * 5. C's handle: dragged by a mouse it stops at 300px and at half the pane,
 *    the keyboard's Home and End too, and its width survives a reload, as
 *    does a thread B handed to Comments.
 * 6. A's card is as tall as what it holds, up to the page area: the
 *    owner's long thread near the foot moves up to stand whole beside its
 *    pin (never cut at the foot, never stretched to it), scrolling inside
 *    only at the page area's full height; a short exchange stays short, its
 *    top at its pin's.
 * 7. Nothing in the card, the composer, a sheet or the rail scrolls
 *    sideways (scrollWidth ≤ clientWidth for every part that can scroll)
 *    or is drawn past a part's edge, every option, comment and screen; the
 *    overflow sweep totals zero at 1440, 1037 × 760 and 390.
 * 8. No console error.
 * 9. The state switcher is the shared one (state-switcher.ts): the system
 *    font, a vertical list with arrowed headings at 1800, a select at 390,
 *    H hiding it.
 *
 *   bun scripts/probe-kit/run.ts comment-sizing-preview
 */
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import type { Engine, Kit, Spec, View } from "../kit";
import { ROOT, readMotion } from "../kit";
import {
  ground,
  type HangSel,
  hangChecks,
  inkAt,
  readHang,
  recordStill,
  stillChecks,
  stillOf,
  twoFrames,
} from "../pin-hang";
import { checkSwitcher } from "../state-switcher";

const DIR = join(ROOT, "design-previews", "comment-sizing");
/** A number written without its leading zero (a token's `.32`), as an engine serialises it with one (`0.32`). */
const BARE_POINT = /(?<![\d.])\./g;
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
  /** What of the element the card itself covers, px². */
  cardCover: number;
  /** The commented element's area outside the page area or under a card, a sheet or the composer, px². */
  covered: number;
  coveredBy: string;
  floatSide: string | null;
  holder: Box | null;
  /** A pill the card or a sheet stands on, px². */
  onPill: number;
  /** The card stands on the element because nothing round it holds all of it: too wide to stand beside, too little room above and below. */
  overByRule: string | null;
  /** What spills sideways, each as `what: px`. */
  overflow: string[];
  /** The list's foot sheet stands in the well. */
  railSheet: boolean;
  reply: {
    /** Its box cut by every box that clips it, px. */
    clipped: number;
    h: number;
    /** What the page hits there: the rows of it a press lands on the reply, px. */
    hit: number;
    /** What the readout says is in view, `seen/height`. */
    readout: string;
    room: number;
    words: number;
  } | null;
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
  await page.goto(
    `${base}?__state=option:${option},case:${which},screen:${screen}`
  );
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
  // The thread's card stands on the element only as it hangs from its pin
  // standing on it: its edge facing the pin on the pin's foot (PinFloat).
  let overByRule: string | null = null;
  const cardCover = target && float ? meet(box(target), box(float)) : 0;
  const foot = q<HTMLElement>('[data-slot="pin-foot"]');
  if (target && float && foot && cardCover > 1) {
    const card = box(float.parentElement ?? float);
    const f = box(foot);
    const t = box(target);
    const edge =
      float.dataset.side === "left"
        ? card.x + card.w - f.x
        : card.x - (f.x + f.w);
    const onIt = meet(f, t) > 1;
    if (Math.abs(edge) <= 1 && onIt) {
      overByRule = `hung from its pin, which stands on the element, its edge on the pin's foot at ${f.y.toFixed(0)}`;
    }
  }
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
    // Its box cut by every box that clips it, then what a person sees of it:
    // each 2px row of that box where the page's own hit test, at a quarter,
    // half and three quarters across, lands on the reply.
    const r = replyEl.getBoundingClientRect();
    let { top, bottom } = r;
    for (
      let up = replyEl.parentElement;
      up && up !== fit;
      up = up.parentElement
    ) {
      if (getComputedStyle(up).overflowY !== "visible") {
        const b = up.getBoundingClientRect();
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
    }
    let hit = 0;
    for (let y = top + 1; y < bottom; y += 2) {
      const lands = [0.25, 0.5, 0.75].some((f) => {
        const at = document.elementFromPoint(r.left + r.width * f, y);
        return at !== null && replyEl.contains(at);
      });
      if (lands) {
        hit += 2;
      }
    }
    reply = {
      clipped: Math.round(Math.max(0, bottom - top) / s),
      hit: Math.round(Math.min(hit / s, r.height / s)),
      readout:
        document.querySelector<HTMLElement>('[data-slot="readout"]')?.dataset
          .visible ?? "",
      h: Math.round(box(replyEl).h),
      room: room.clientHeight,
      words: (replyEl.querySelector('[data-slot="msg"]')?.textContent ?? "")
        .trim()
        // biome-ignore lint/performance/useTopLevelRegex: it runs in the page, which shares no scope with this module
        .split(/\s+/).length,
    };
  }
  return {
    railSheet: sheet !== null,
    s,
    stands,
    well,
    side: side ? Math.round(box(side).w) : null,
    holder: holderEl ? box(holderEl) : null,
    floatSide: float?.dataset.side ?? null,
    overflow,
    covered,
    coveredBy: coveredBy.trim(),
    overByRule,
    cardCover,
    onPill,
    reply,
  };
}

const why = (option: Option, read: Read): string => {
  if (read.stands === "card") {
    return `the card's tallest is ${read.floatSide === "top" || read.floatSide === "bottom" ? `the room ${read.floatSide === "top" ? "above" : "below"} what it is about` : "the page area's height"}${option === "b" ? ", capped at min(480px, 50% of the well)" : ""}`;
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
): Promise<number> {
  let spills = 0;
  for (const option of OPTIONS) {
    for (const which of CASES) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame at a time on one page
      await load(page, base, option, which, screen);
      const read = await page.evaluate(readFrame);
      spills += read.overflow.length;
      const wide = await page.evaluate(readWide);
      spills += wide.length;
      kit.check(
        `${engine} ${screen} ${option.toUpperCase()} ${which}: no part of the thread or the composer scrolls sideways (scrollWidth ≤ clientWidth for the card and every part inside it)`,
        wide.length === 0,
        wide.slice(0, 6).join("; ")
      );
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
        read.overByRule
          ? `${at}: the card stands on what the comment is about only as PinFloat allows it, ${read.overByRule}`
          : `${at}: what the comment is about stands whole in the page area, nothing over it${read.stands === "none" ? "" : ` (the thread ${read.stands}${read.floatSide ? `, ${read.floatSide}` : ""})`}`,
        read.covered <= 1 ||
          (read.overByRule !== null && read.covered - read.cardCover <= 1),
        read.coveredBy
      );
      kit.check(
        `${at}: no card or drawer stands on the comment's pill`,
        read.onPill <= 1,
        `${read.onPill.toFixed(0)}px²`
      );
      if (
        screen === "phone" &&
        (read.stands === "sheet" || read.stands === "compose")
      ) {
        kit.check(
          `${at}: on a phone the list's foot sheet stands aside while the ${read.stands === "sheet" ? "thread's" : "composer's"} drawer stands (PreviewPane railAway)`,
          !read.railSheet
        );
      }
      if (which !== "new") {
        const r = read.reply;
        if (r) {
          const [said] = r.readout.split("/").map(Number);
          kit.check(
            `${at}: nothing stands over the reply (${r.hit}px hit of ${r.clipped}px its clips leave), and the readout says what a person sees of it (${r.readout} against ${r.hit}px)`,
            r.hit >= r.clipped - 4 && Math.abs(said - r.hit) <= 4,
            JSON.stringify(r)
          );
        }
      }
      if (which === "long" || which === "closed") {
        const r = read.reply;
        if (!r) {
          kit.check(`${at}: the thread is open`, false, read.stands);
          continue;
        }
        const { room } = r;
        const fits =
          r.h <= room
            ? `fits its ${room}px room`
            : `needs ${r.h - room}px more than its ${room}px room, because ${why(option, read)}`;
        const line =
          r.hit >= r.h - 2
            ? `the agent's reply (${r.words} words, ${r.h}px) is all in view as it opens, ${Math.round(read.holder?.w ?? 0)} × ${Math.round(read.holder?.h ?? 0)}`
            : `${r.hit}px of the agent's reply (${r.words} words, ${r.h}px) is in view as it opens, ${r.h - r.hit}px a scroll away; it ${fits} (${Math.round(read.holder?.w ?? 0)} × ${Math.round(read.holder?.h ?? 0)})`;
        kit.check(
          `${at}, his case in ${OPTION_NAME[option]}: ${line}`,
          r.h > 0 && room > 0 && r.words >= 150
        );
      }
    }
  }
  return spills;
}

/**
 * Every part of the open thread or composer (the card, a sheet, the rail's
 * thread) that scrolls sideways or has a part drawn past its edge: the card
 * and every part inside it. A part that can scroll sideways (`overflow-x`
 * auto or scroll, which an `overflow-y: auto` alone gives it) holds no more
 * than its width (`scrollWidth ≤ clientWidth`); every other part has no
 * child in the flow drawn past its edges, so nothing is cut there, but a
 * part that ends its own words in an ellipsis by design (one line, or a
 * line clamp). A screen reader's words (`sr-only`) are none of it. Runs in
 * the page.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one walk in the page over every part, by what each can do with more than its width
function readWide(): string[] {
  const frame = document.querySelector<HTMLElement>('[data-slot="frame"]');
  const holders = [
    ...(frame?.querySelectorAll<HTMLElement>(
      '[data-slot="pin-card"], [data-slot="pin-composer"], [data-slot="foot-sheet"], [data-slot="side"]'
    ) ?? []),
  ];
  const wide: string[] = [];
  const name = (el: HTMLElement) =>
    `${el.localName}[${el.dataset.slot ?? (el.getAttribute("class") ?? "").slice(0, 40)}]`;
  for (const holder of holders) {
    for (const el of [holder, ...holder.querySelectorAll<HTMLElement>("*")]) {
      if (
        !(el instanceof HTMLElement) ||
        el.clientWidth === 0 ||
        el.closest(".sr-only, [data-slot='side-was']")
      ) {
        continue;
      }
      const style = getComputedStyle(el);
      const over = el.scrollWidth - el.clientWidth;
      if (["auto", "scroll"].includes(style.overflowX) && over > 0) {
        wide.push(
          `${name(el)} in ${holder.dataset.slot} scrolls sideways: ${el.scrollWidth} in ${el.clientWidth}`
        );
        continue;
      }
      const ellipsis =
        style.textOverflow === "ellipsis" ||
        (style as unknown as { webkitLineClamp?: string }).webkitLineClamp !==
          "none";
      if (ellipsis) {
        continue;
      }
      const edge = el.getBoundingClientRect();
      for (const child of el.children) {
        const box = child.getBoundingClientRect();
        const past = Math.max(edge.left - box.left, box.right - edge.right);
        if (
          box.width > 0 &&
          past > 1 &&
          getComputedStyle(child).position !== "absolute" &&
          !child.closest(".sr-only")
        ) {
          wide.push(
            `${child.localName}[${(child as HTMLElement).dataset.slot ?? ""}] ${past.toFixed(1)}px past ${name(el)} in ${holder.dataset.slot}`
          );
        }
      }
    }
  }
  return wide;
}

/** A's card as it stands, in the pin room's px, with its pill's and what it holds. Runs in the page. */
function readCard() {
  const frame = document.querySelector<HTMLElement>('[data-slot="frame"]');
  const room = frame?.querySelector<HTMLElement>('[data-slot="pin-room"]');
  const card = frame?.querySelector<HTMLElement>('[data-slot="pin-card"]');
  const pill = frame?.querySelector<HTMLElement>('[data-page-pin="3"]')
    ?.firstElementChild as HTMLElement | null | undefined;
  if (!(room && card && pill)) {
    return null;
  }
  const at = room.getBoundingClientRect();
  const p = pill.getBoundingClientRect();
  const thread = card.querySelector<HTMLElement>("[data-pin-room]");
  const body = card.querySelector<HTMLElement>('[data-slot="pin-body"]');
  // Its laid-out box: its floating wrapper's, which its slide never moves.
  const laid = (card.parentElement ?? card).getBoundingClientRect();
  return {
    side: card.dataset.side ?? "",
    box: {
      x: laid.left - at.left,
      y: laid.top - at.top,
      w: laid.width,
      h: laid.height,
    },
    pill: { x: p.left - at.left, y: p.top - at.top, w: p.width, h: p.height },
    well: { w: room.clientWidth, h: room.clientHeight },
    natural:
      card.offsetHeight +
      Math.max(
        0,
        (body ? body.scrollHeight - body.clientHeight : 0) +
          (thread ? thread.scrollHeight - thread.clientHeight : 0)
      ),
    scrolls: thread ? thread.scrollHeight - thread.clientHeight : 0,
    gap: Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    ),
  };
}
type CardRead = NonNullable<ReturnType<typeof readCard>>;

/** `value` brought onto [`low`, `high`]. */
const onto = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));

const HANG: HangSel = {
  card: '[data-slot="frame"] [data-slot="pin-card"]',
  face: '[data-page-pin="3"] [data-mark]',
  room: '[data-slot="pin-room"]',
};
const FRACTIONS = [0, 0.1, 0.25, 0.5, 0.75, 1];

/**
 * A's card hung from its pin (the owner: "a gooey animation that morphs out
 * of the comment just how the caw/search/machine bar on the top right does
 * it"): the product's PinFloat, live. Replay opens it again and its Close
 * shuts it, each held on the clock (the DevTools Animation domain on
 * Chromium; the page's held clock on WebKit) and read at its fractions with
 * the ink where the pin meets it (pin-hang.ts); each run on the house's own
 * clock, --dur-pop on --ease-out in, --dur-exit out.
 */
async function hangLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  screen: ScreenName
): Promise<void> {
  const tokens = await page.evaluate(() => {
    const probe = document.createElement("i");
    probe.style.transitionDuration = "var(--dur-pop), var(--dur-exit)";
    probe.style.transitionTimingFunction = "var(--ease-out)";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const [pop = "0", exit = "0"] = style.transitionDuration.split(",");
    const ease = style.transitionTimingFunction.replaceAll(" ", "");
    probe.remove();
    return {
      pop: Number.parseFloat(pop) * 1000,
      exit: Number.parseFloat(exit) * 1000,
      ease,
    };
  });
  for (const which of ["long", "short"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time on one page
    await load(page, base, "a", which, screen);
    const at = `${engine} ${screen} A ${which}`;
    for (const way of ["opens", "closes"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: the open, then the close
      const motion = await readMotion(
        page,
        () =>
          page.evaluate((opening) => {
            const press = opening
              ? document.querySelector<HTMLElement>('[data-slot="replay"]')
              : document.querySelector<HTMLElement>(
                  '[data-slot="pin-card"] button[aria-label="Close"]'
                );
            press?.click();
          }, way === "opens"),
        '[data-slot="frame"]',
        {
          fractions: FRACTIONS,
          read: async () => {
            await twoFrames(page);
            const read = await page.evaluate(readHang, HANG);
            if (!read) {
              return null;
            }
            await ground(page, HANG.room, true);
            const ink = await inkAt(page, read);
            await ground(page, HANG.room, false);
            return { read, ink };
          },
        }
      );
      const reads = motion.at.flatMap((one) =>
        one.value ? [{ fraction: one.fraction, ...one.value }] : []
      );
      if (reads.length !== FRACTIONS.length) {
        kit.check(
          `${at}: the card ${way}, read at each fraction`,
          false,
          JSON.stringify(motion.at.map((one) => one.fraction))
        );
        await landed(page);
        continue;
      }
      hangChecks(kit, at, way, reads, motion.runs);
      const slide = reads
        .flatMap((one) => one.read.runs)
        .find((run) => run.props === "translate");
      const want = way === "opens" ? tokens.pop : tokens.exit;
      kit.check(
        `${at}: it ${way === "opens" ? "opens" : "closes"} on the house's clock: ${slide ? `${slide.ms}ms on ${slide.easing}` : "no slide"} (--dur-${way === "opens" ? "pop" : "exit"} ${want}ms on --ease-out)`,
        !!slide &&
          Math.abs(slide.ms - want) < 1 &&
          slide.easing.replaceAll(" ", "") === tokens.ease,
        JSON.stringify({ slide, tokens })
      );
      await landed(page);
    }
  }
}

/**
 * Scrolling the page under A's open card (the owner: "WRONG, u keep
 * animating it as i scroll down, instead of only letting it move when it
 * reaches the spot where it will move from one spot to the next, it should
 * animate THEN, not animate WHILE i'm scrolling"): by wheel steps over the
 * page and by a scroll set from code, every frame read (pin-hang.ts
 * `stillOf`).
 */
async function stillLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  screen: ScreenName
): Promise<void> {
  for (const which of ["long", "short"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time on one page
    await load(page, base, "a", which, screen);
    const scroller = await page
      .locator('[data-slot="page-scroll"]')
      .boundingBox();
    const at = `${engine} ${screen} A ${which}`;
    for (const how of ["wheel", "code"] as const) {
      const recording = page.evaluate(recordStill, {
        ms: 2200,
        card: HANG.card,
        room: HANG.room,
      });
      if (how === "wheel" && scroller) {
        // biome-ignore lint/performance/noAwaitInLoops: the wheel, then a scroll from code, each read on its own
        await page.mouse.move(scroller.x + 40, scroller.y + 60);
        for (const dy of [-120, -120, -120, 120, 120, -200, 200, 120]) {
          // biome-ignore lint/performance/noAwaitInLoops: one wheel step a frame or so apart, as a hand gives them
          await page.mouse.wheel(0, dy);
          await page.waitForTimeout(90);
        }
      } else {
        await page.evaluate(async () => {
          const pane = document.querySelector<HTMLElement>(
            '[data-slot="page-scroll"]'
          );
          const start = pane?.scrollTop ?? 0;
          for (const by of [0, -80, -200, -360, -120, 60, -40, 0]) {
            if (pane) {
              pane.scrollTop = Math.max(0, start + by);
            }
            // biome-ignore lint/performance/noAwaitInLoops: one scroll a frame, in order
            await new Promise((done) => requestAnimationFrame(done));
            await new Promise((done) => setTimeout(done, 120));
          }
        });
      }
      stillChecks(kit, at, how, stillOf(await recording));
      await page.waitForTimeout(400);
    }
  }
}

/** Where A's card stands for its height: beside its pill, or over or under what it is about. */
function standsFor(kit: Kit, at: string, read: CardRead): void {
  const { box, pill, well, gap } = read;
  const full = well.h - 2 * gap;
  const whole = box.y >= gap - 0.5 && box.y + box.h <= well.h - gap + 0.5;
  const span = `${box.y.toFixed(0)} to ${(box.y + box.h).toFixed(0)}`;
  if (read.side === "right" || read.side === "left") {
    // Hung from its pin: the pill as drawn, its rings round its box.
    const ring = 4;
    const pin = {
      x: pill.x - ring,
      y: pill.y - ring,
      w: pill.w + 2 * ring,
      h: pill.h + 2 * ring,
    };
    const tall = Math.min(read.natural, full);
    const top = onto(pin.y, gap, well.h - gap - tall);
    const edge =
      read.side === "right" ? box.x - (pin.x + pin.w) : pin.x - (box.x + box.w);
    kit.check(
      `${at}: hung from its pin at its ${read.side === "right" ? "end" : "start"} side (its edge ${edge.toFixed(1)}px off the pin's), the card is as tall as what it holds (${box.h}px of ${read.natural}px, the page area ${well.h}px), whole on screen (${span}), the pin against its edge (${pin.y.toFixed(0)}–${(pin.y + pin.h).toFixed(0)}), its top at the pin's (${pin.y.toFixed(0)}) or moved up only as far as it takes to stand whole (${top.toFixed(0)}); it scrolls inside (${read.scrolls}px) only at the page area's full height`,
      Math.abs(edge) <= 1 &&
        Math.abs(box.h - tall) <= 1 &&
        whole &&
        pin.y >= box.y - 0.5 &&
        pin.y + pin.h <= box.y + box.h + 0.5 &&
        Math.abs(box.y - top) <= 1 &&
        (read.scrolls <= 1 || box.h >= full - 1),
      JSON.stringify(read)
    );
    return;
  }
  // Over or under what it is about (wider than the room beside it): as
  // tall as what it holds, or the whole room on that side, scrolling.
  const fills =
    read.side === "top"
      ? Math.abs(box.y - gap) <= 1
      : Math.abs(box.y + box.h - (well.h - gap)) <= 1;
  const held =
    Math.abs(box.h - read.natural) <= 1
      ? read.scrolls <= 1
      : fills && read.scrolls > 1;
  kit.check(
    `${at}: ${read.side === "top" ? "above" : "below"} what it is about (no room beside it), the card is as tall as what it holds (${box.h}px of ${read.natural}px), whole on screen (${span}), or takes that side's whole room and scrolls inside (${read.scrolls}px)`,
    whole && held,
    JSON.stringify(read)
  );
}

/** The owner's long thread near the foot: whole, never stretched, risen above its pill where it stands beside it. */
function longFor(kit: Kit, at: string, read: CardRead): void {
  const { box, pill, well, gap } = read;
  const full = well.h - 2 * gap;
  const beside = read.side === "right" || read.side === "left";
  const low = pill.y + Math.min(read.natural, full) > well.h - gap;
  const whole = box.y >= gap - 0.5 && box.y + box.h <= well.h - gap + 0.5;
  const rises = !(beside && low) || box.y < pill.y - 1;
  kit.check(
    `${at}: near the foot the long thread stands whole (${box.y.toFixed(0)} to ${(box.y + box.h).toFixed(0)} of ${well.h}px), never stretched past what it holds (${box.h}px of ${read.natural}px)${beside ? `, rising above its pill (its top ${box.y.toFixed(0)}px, the pill's ${pill.y.toFixed(0)}px)` : ""}`,
    whole && box.h <= read.natural + 1 && rises,
    JSON.stringify(read)
  );
}

/**
 * A's height: the owner's long thread near the foot moves up to stand whole
 * beside its pill, or over or under an element too wide to stand beside, as
 * tall as what it holds up to the room there (inner scroll only there); a
 * short exchange stays short.
 */
async function heightLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  screen: ScreenName
): Promise<void> {
  for (const which of ["long", "short"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time on one page
    await load(page, base, "a", which, screen);
    const read = await page.evaluate(readCard);
    const at = `${engine} ${screen} A ${which}`;
    if (!read) {
      kit.check(`${at}: the card stands`, false);
      continue;
    }
    standsFor(kit, at, read);
    if (which === "long") {
      longFor(kit, at, read);
      continue;
    }
    const full = read.well.h - 2 * read.gap;
    kit.check(
      `${at}: the short exchange stays short, as tall as what it holds (${read.box.h}px of ${read.natural}px, in a ${read.well.h}px page area), never stretched toward the foot, its entries whole (${read.scrolls}px of scroll)`,
      Math.abs(read.box.h - read.natural) <= 1 &&
        read.box.h < full - 1 &&
        read.scrolls <= 1,
      JSON.stringify(read)
    );
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
  const curve = (value: string) =>
    value.replaceAll(" ", "").replaceAll(BARE_POINT, "0.");
  const same = (a: string, b: string) => curve(a) === curve(b);
  const legs: {
    option: Option;
    which: Case;
    screen: ScreenName;
    what: string;
    want: { slot: string; ms: number; easing: string; prop: string }[];
    mid?: string;
  }[] = [
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
  await page.reload();
  await page.waitForSelector("html[data-ready]");
  await landed(page);
  const after = await page.evaluate(readFrame);
  kit.check(
    `${engine}: a thread B handed to Comments is still there after a reload, its address (the switcher's __state) saying so (${before.stands} at ${before.side}px, then ${after.stands} at ${after.side}px)`,
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
): Promise<number> {
  const over = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  kit.check(
    `${engine} at ${view}: the preview page scrolls no wider than the window (${over}px)`,
    over <= 0
  );
  return over > 0 ? 1 : 0;
}

const spec: Spec = {
  name: "comment-sizing-preview",
  async run(kit: Kit) {
    // A's float (live-card/) is the proposed thread card as built at
    // f38a69173, kept as it stands since the card left the product
    // (4f12dbb2f): there is no source left to build it from.
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (process.env.SIZING_ENGINES ?? "chromium,webkit").split(
        ","
      ) as Engine[];
      for (const engine of engines) {
        const errors: string[] = [];
        let spills = 0;
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
            height: shape.h + 600,
          });
          await page.goto(base);
          await page.evaluate(() => localStorage.clear());
          spills += await boxesLeg(kit, page, base, engine, screen);
          spills += await pageWidthLeg(kit, page, engine, shape.window);
          if (screen !== "phone") {
            await hangLeg(kit, page, base, engine, screen);
            await stillLeg(kit, page, base, engine, screen);
            await heightLeg(kit, page, base, engine, screen);
          }
          await capLeg(kit, page, base, engine, screen);
          if (screen === "window") {
            await motionLeg(kit, page, base, engine);
            await reloadLeg(kit, page, base, engine);
          }
          if (screen === "desk") {
            // The list stands beside the desk's 1440 from 1762 (232 + 1482 + 48).
            await checkSwitcher(kit, page, engine, { axes: true, desk: 1800 });
          }
          if (screen !== "phone") {
            await dragLeg(kit, page, base, engine, screen);
          }
          await page.close();
        }
        kit.check(
          `${engine}: the overflow sweep at 1440, 1037 × 760 and 390 totals ${spills}`,
          spills === 0
        );
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
