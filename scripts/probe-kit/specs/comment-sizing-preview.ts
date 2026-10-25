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
 *    meets neither it nor its pill; but for a card standing beside its pill
 *    over an element too wide to stand beside whose rooms above and below
 *    can't hold all of it (PinFloat: a long thread is read whole, never in a
 *    sliver).
 * 3. The owner's case, measured: the agent's reply (about 180 words with
 *    bullets) against the room it scrolls in, and where scrolling remains,
 *    why.
 * 4. The opening and the hand-off on the house clocks, held and sought to
 *    their middle: A's card grows out of its pill as every kit popover does
 *    (the kit's pop: opacity, scale from --pop-scale and translate over
 *    --dur-pop on --ease-drawer), its transform origin at the pill (on its
 *    edge facing the pill, at the pill's height), held at 0, ½ and 1 on the
 *    DevTools Animation domain (Chromium) or the page's held clock (WebKit);
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
 *    pill (never cut at the foot, never stretched to it), scrolling inside
 *    only at the page area's full height; a short exchange stays short, its
 *    top at its pill's.
 * 7. The overflow sweep totals zero at 1440, 1037 × 760 and 390.
 * 8. No console error.
 *
 *   bun scripts/probe-kit/run.ts comment-sizing-preview
 */
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import type { Engine, Kit, Spec, View } from "../kit";
import { ROOT, readMotion } from "../kit";

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
  // PinFloat's one case for standing on the element: beside its pill alone,
  // where the element leaves no room beside it and neither its room above
  // nor below holds the whole card (clear 11px, gap 7px).
  let overByRule: string | null = null;
  const cardCover = target && float ? meet(box(target), box(float)) : 0;
  if (target && float && pill && cardCover > 1) {
    const t = box(target);
    const p = box(pill.firstElementChild ?? pill);
    const top = Math.min(t.y, p.y);
    const bottom = Math.max(t.y + t.h, p.y + p.h);
    const left = Math.min(t.x, p.x);
    const right = Math.max(t.x + t.w, p.x + p.w);
    const card = box(float);
    const room = float.querySelector<HTMLElement>("[data-pin-room]");
    const natural =
      card.h +
      Math.max(0, float.scrollHeight - float.clientHeight) +
      (room ? Math.max(0, room.scrollHeight - room.clientHeight) : 0);
    const above = top - 11 - 7;
    const below = well.h - bottom - 11 - 7;
    const noBeside = right + 11 + card.w > well.w - 7 && left - 11 - card.w < 7;
    const besidePill =
      (float.dataset.side === "right" &&
        Math.abs(card.x - (p.x + p.w + 11)) <= 1) ||
      (float.dataset.side === "left" &&
        Math.abs(card.x + card.w - (p.x - 11)) <= 1);
    if (noBeside && besidePill && natural > Math.max(above, below)) {
      overByRule = `beside its pill alone: ${Math.round(natural)}px to hold, ${Math.round(above)}px above and ${Math.round(below)}px below the element, no room beside it`;
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
  const style = getComputedStyle(card);
  const [ox, oy] = style.transformOrigin
    .split(" ")
    .map((one) => Number.parseFloat(one));
  return {
    side: card.dataset.side ?? "",
    state: card.dataset.state ?? "",
    // Its laid-out box, which no transform moves.
    box: {
      x: card.offsetLeft,
      y: card.offsetTop,
      w: card.offsetWidth,
      h: card.offsetHeight,
    },
    origin: { x: card.offsetLeft + (ox ?? 0), y: card.offsetTop + (oy ?? 0) },
    pill: { x: p.left - at.left, y: p.top - at.top, w: p.width, h: p.height },
    well: { w: room.clientWidth, h: room.clientHeight },
    natural:
      card.offsetHeight +
      Math.max(
        0,
        card.scrollHeight -
          card.clientHeight +
          (thread ? thread.scrollHeight - thread.clientHeight : 0)
      ),
    scrolls: thread ? thread.scrollHeight - thread.clientHeight : 0,
    opacity: Number(style.opacity),
    scale: style.scale,
    translate: style.translate,
    gap: Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    ),
    popScale: Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--pop-scale")
    ),
  };
}
type CardRead = NonNullable<ReturnType<typeof readCard>>;

/** `value` brought onto [`low`, `high`]. */
const onto = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));
/** A computed `scale` as a number: `none` is 1. */
const scaleOf = (value: string) =>
  value === "none" ? 1 : Number.parseFloat(value);

/**
 * A's card grows out of its pill (the owner: "why is the panel animation
 * from bottom left when it should be "growing" from the comment just how we
 * do the hover menu?"): Replay opens it again, its runs held on the clock
 * (the DevTools Animation domain on Chromium, `Animation.setPaused` and
 * `seekAnimations`; the page's held clock on WebKit) and sought to 0, ½ and
 * 1; at each its transform origin stands at its pill, its scale and opacity
 * go from the kit's pop to rest, and its runs are the kit's pop.
 */
async function growLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  screen: ScreenName
): Promise<void> {
  await load(page, base, "a", "long", screen);
  const drawer = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--ease-drawer")
      .trim()
  );
  const pop = await page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--dur-pop")
    )
  );
  const motion = await readMotion(
    page,
    () =>
      page.evaluate(() =>
        document.querySelector<HTMLElement>('[data-slot="replay"]')?.click()
      ),
    '[data-slot="pin-card"]',
    {
      own: true,
      fractions: [0, 0.5, 1],
      read: () => page.evaluate(readCard),
    }
  );
  const at = `${engine} ${screen} A long`;
  const names = motion.runs.map((run) => run.name).sort();
  const same = (a: string, b: string) =>
    a.replaceAll(" ", "") === b.replaceAll(" ", "");
  kit.check(
    `${at}: opening runs the kit's pop on the card alone, opacity, scale and translate over --dur-pop (${pop}ms) on --ease-drawer (${motion.by} clock)`,
    ["opacity", "scale", "translate"].every((name) => names.includes(name)) &&
      motion.runs.every(
        (run) =>
          run.type === "CSSTransition" &&
          Math.abs(run.end - run.delay - pop) < 1 &&
          same(run.easing, drawer)
      ),
    JSON.stringify(
      motion.runs.map(({ name, type, end, easing }) => ({
        name,
        type,
        end,
        easing,
      }))
    )
  );
  const reads = motion.at.map((one) => one.value);
  const [first, middle, last] = reads;
  if (!(first && middle && last)) {
    kit.check(
      `${at}: the card read at 0, ½ and 1`,
      false,
      JSON.stringify(reads)
    );
    return;
  }
  for (const [fraction, read] of [
    [0, first],
    [0.5, middle],
    [1, last],
  ] as const) {
    const { box, pill, origin } = read as CardRead;
    const want = {
      x: onto(pill.x + pill.w / 2, box.x, box.x + box.w),
      y: onto(pill.y + pill.h / 2, box.y, box.y + box.h),
    };
    const beside = read.side === "right" || read.side === "left";
    kit.check(
      `${at} at ${fraction}: its transform origin stands at its pill, on its ${read.side} side${beside ? ", on the edge facing the pill at the pill's height" : ""} (origin ${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}; pill centre ${(pill.x + pill.w / 2).toFixed(1)}, ${(pill.y + pill.h / 2).toFixed(1)}), not a corner of the card`,
      Math.abs(origin.x - want.x) <= 1 &&
        Math.abs(origin.y - want.y) <= 1 &&
        (!beside || (origin.y > box.y + 1 && origin.y < box.y + box.h - 1)),
      JSON.stringify(read)
    );
  }
  const s0 = scaleOf(first.scale);
  const s5 = scaleOf(middle.scale);
  const s1 = scaleOf(last.scale);
  kit.check(
    `${at}: sought to 0, ½ and 1 it grows from the pop scale and fades in (scale ${s0} → ${s5} → ${s1}, opacity ${first.opacity} → ${middle.opacity.toFixed(2)} → ${last.opacity}), open`,
    Math.abs(s0 - first.popScale) < 0.005 &&
      s5 > s0 &&
      s5 < 1 &&
      Math.abs(s1 - 1) < 0.001 &&
      first.opacity < 0.01 &&
      middle.opacity > 0 &&
      middle.opacity < 1 &&
      last.opacity > 0.999 &&
      last.state === "open",
    JSON.stringify({ first, middle, last })
  );
}

/** Where A's card stands for its height: beside its pill, or over or under what it is about. */
function standsFor(kit: Kit, at: string, read: CardRead): void {
  const { box, pill, well, gap } = read;
  const full = well.h - 2 * gap;
  const whole = box.y >= gap - 0.5 && box.y + box.h <= well.h - gap + 0.5;
  const span = `${box.y.toFixed(0)} to ${(box.y + box.h).toFixed(0)}`;
  if (read.side === "right" || read.side === "left") {
    const tall = Math.min(read.natural, full);
    const top = onto(pill.y, gap, well.h - gap - tall);
    const pillMid = pill.y + pill.h / 2;
    kit.check(
      `${at}: beside its pill (${read.side}), the card is as tall as what it holds (${box.h}px of ${read.natural}px, the page area ${well.h}px), whole on screen (${span}), level with its pill (centre at ${pillMid.toFixed(0)}), its top at the pill's (${pill.y.toFixed(0)}) or moved up only as far as it takes to stand whole (${top.toFixed(0)}); it scrolls inside (${read.scrolls}px) only at the page area's full height`,
      Math.abs(box.h - tall) <= 1 &&
        whole &&
        pillMid >= box.y &&
        pillMid <= box.y + box.h &&
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

/** The owner's long thread near the foot: whole, never stretched, growing out of its pill. */
function longFor(kit: Kit, at: string, read: CardRead): void {
  const { box, pill, well, gap } = read;
  const full = well.h - 2 * gap;
  const beside = read.side === "right" || read.side === "left";
  const low = pill.y + Math.min(read.natural, full) > well.h - gap;
  const pillMid = pill.y + pill.h / 2;
  const whole = box.y >= gap - 0.5 && box.y + box.h <= well.h - gap + 0.5;
  const rises = !(beside && low) || box.y < pill.y - 1;
  kit.check(
    `${at}: near the foot the long thread stands whole (${box.y.toFixed(0)} to ${(box.y + box.h).toFixed(0)} of ${well.h}px), never stretched past what it holds (${box.h}px of ${read.natural}px)${beside ? `, rising above its pill (its top ${box.y.toFixed(0)}px, the pill's ${pill.y.toFixed(0)}px)` : ""}, its origin at the pill (${read.origin.y.toFixed(0)}px, the pill's centre ${pillMid.toFixed(0)}px) so it grows ${read.origin.y > box.y + box.h / 2 ? "upward" : "downward"} out of it`,
    whole &&
      box.h <= read.natural + 1 &&
      rises &&
      Math.abs(read.origin.y - onto(pillMid, box.y, box.y + box.h)) <= 1,
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
            await growLeg(kit, page, base, engine, screen);
            await heightLeg(kit, page, base, engine, screen);
          }
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
