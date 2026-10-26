/**
 * A comment's thread while the agent works on it (DESIGN.md, A thread beside
 * its pin; Live dot; Live work breathes), on the /motion/pin-working bench:
 * the real PinCard in the real PinFloat, its pin a fixture, put to work, its
 * reply landed and set at rest through `window.__pinWorking`.
 *
 * At 390 (the well's foot sheet, under a finger), 680 and 1440, in both
 * schemes:
 * 1. Who has the comment is its status, never a speaker line (the owner:
 *    a speaker line under his words read as the session answering): at the
 *    card's foot one status line, "Sent to" and the session's chip, then
 *    "· working on it" after the live dot, its words and the dot inside the
 *    foot; the thread holds the person's and the agent's entries alone,
 *    nothing of the working state among them; no "Working on it…" is left.
 * 2. Nothing overlaps: the card's head, every entry and the foot stand one
 *    under another inside the card, the entries inside the thread's room,
 *    and neither the card nor the page scrolls sideways.
 * 3. Landed, the reply is the thread's last entry, the agent's, and the
 *    status line still says "Sent to" with no "working on it" nor live dot.
 *
 * At 1440, in both schemes, one clock: put to work by one change, the
 * card's working mark and the pin's own pill each run one `breath`, of
 * equal length and curve, each begun on the one clock (core breath.ts: a
 * multiple of the breath on the wall clock) (the owner's pick: "One breath
 * everywhere"). Then the motion, read through the kit's `readMotion`
 * on the DevTools clock with its loops caught: putting the agent to work
 * starts one run inside the card, the shared `breath` keyframes on the live
 * dot, a loop of `--breath` on `--ease-in-out`; held at 0, ½ and 1 of it
 * the dot's opacity reads 1, `--breath-floor` and 1.
 *
 * And at 1440, on Chromium and WebKit, the card is its pill grown (the
 * owner: "a gooey animation that morphs out of the comment just how the
 * caw/search/machine bar on the top right does it"), its pill near the
 * well's foot (`?at=foot`): opened and closed on the clock (the DevTools
 * Animation domain on Chromium, the page's held clock on WebKit), read at
 * 0, ¼, ½, ¾ and 1. One surface stands the whole way, opaque; at the
 * pill's end it is the pill (its box within 1px, its round corner, its
 * face's fill), at the card's the card (its box, --radius-lg, the raised
 * surface), growing (or shrinking) one way between; the thread shows only
 * once the shape has room, and is gone by half way as it goes back. Open,
 * the card stands as tall as what it holds, moved up to stand whole.
 *
 * And on a page that scrolls under the open card (`?at=scroll`; the owner:
 * "when scrolling the page why does this jump up and down"), by wheel
 * steps and from code, every frame read: its offset from its pill holds
 * within 1px while it is clear of the well's edges, it never steps more
 * than its pill moved plus 1.5px, and it keeps its side.
 *
 *   bun scripts/probe-kit/run.ts web pin-working
 */
import type { Page } from "playwright-core";
import { commentWords } from "../../../../packages/core/src/words/comments";
import { readBreath } from "../../breath";
import type { Kit, Spec, View } from "../../kit";
import { open, readMotion, THEMES } from "../../kit";

const VIEWS_READ: { view: View; width: number }[] = [
  { view: "phone", width: 390 },
  { view: "narrowDesk", width: 680 },
  { view: "desk", width: 1440 },
];
const CARD = '[data-slot="pin-card"]';
const WORKING = `${CARD} [data-slot="working"]`;
const DOT = `${WORKING} [data-slot="live-dot"]`;
/** The pin's own pill in the well, wearing its live dot. */
const PILL_DOT =
  '[data-slot="pin-room"] > span > [data-mark] [data-dot="live"]';

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface Read {
  /** Each entry's speaker, in order. */
  by: string[];
  card: Box | null;
  cardSpills: boolean;
  /** The live dot in the status line. */
  dot: Box | null;
  entries: Box[];
  foot: Box | null;
  head: Box | null;
  /** Anything of the working state inside the thread's room. */
  inThread: boolean;
  oldWords: boolean;
  pageSpills: boolean;
  room: Box | null;
  /** The status line's words, as shown. */
  status: string;
  /** The status line stands inside the foot. */
  statusInFoot: boolean;
  /** The working words and their dot stand inside the status line. */
  working: Box | null;
}

function readWorking(): Read {
  const box = (el: Element | null | undefined): Box | null => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const card = document.querySelector<HTMLElement>('[data-slot="pin-card"]');
  const room = card?.querySelector<HTMLElement>("[data-pin-room]") ?? null;
  const foot = card?.querySelector('[data-slot="foot"]');
  const status = card?.querySelector<HTMLElement>('[data-slot="sent-to"]');
  const working = status?.querySelector('[data-slot="working"]');
  const entries = [
    ...(card?.querySelectorAll<HTMLElement>('[data-slot="entry"]') ?? []),
  ];
  return {
    card: box(card),
    cardSpills: !!card && card.scrollWidth > card.clientWidth + 0.5,
    dot: box(working?.querySelector('[data-slot="live-dot"]')),
    entries: entries.flatMap((el) => box(el) ?? []),
    by: entries.map((el) => el.dataset.by ?? ""),
    foot: box(foot),
    head: box(card?.querySelector('[data-slot="head"]')),
    inThread: !!room?.querySelector(
      '[data-slot="working"], [data-slot="live-dot"]'
    ),
    oldWords: (card?.textContent ?? "").includes("Working on it"),
    pageSpills: document.documentElement.scrollWidth > window.innerWidth + 0.5,
    room: box(room),
    status: (status?.innerText ?? "").replaceAll(/\s+/gu, " ").trim(),
    statusInFoot: !!(foot && status && foot.contains(status)),
    working: box(working),
  };
}

/**
 * Every part of the card that scrolls sideways or has a part drawn past its
 * edge: one that can scroll sideways (`overflow-x` auto or scroll) holds no
 * more than its width; every other part has no child in the flow drawn past
 * its edges, but a part that ends its words in an ellipsis by design. A
 * screen reader's words are none of it. Runs in the page.
 */
function readWide(): string[] {
  const card = document.querySelector<HTMLElement>('[data-slot="pin-card"]');
  const wide: string[] = [];
  if (!card) {
    return ["no card"];
  }
  const name = (el: Element) =>
    `${el.localName}[${(el as HTMLElement).dataset.slot ?? (el.getAttribute("class") ?? "").slice(0, 40)}]`;
  for (const el of [card, ...card.querySelectorAll<HTMLElement>("*")]) {
    if (el.clientWidth === 0 || el.closest(".sr-only")) {
      continue;
    }
    const style = getComputedStyle(el);
    if (
      ["auto", "scroll"].includes(style.overflowX) &&
      el.scrollWidth > el.clientWidth
    ) {
      wide.push(
        `${name(el)} scrolls sideways: ${el.scrollWidth} in ${el.clientWidth}`
      );
      continue;
    }
    if (
      style.textOverflow === "ellipsis" ||
      (style as unknown as { webkitLineClamp?: string }).webkitLineClamp !==
        "none"
    ) {
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
        wide.push(`${name(child)} ${past.toFixed(1)}px past ${name(el)}`);
      }
    }
  }
  return wide;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const near = (a: number, b: number, by = 0.5) => Math.abs(a - b) <= by;
/** Two boxes overlap by more than half a pixel down the page. */
const crosses = (a: Box, b: Box) =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

async function bench(page: Page, url: string, call: string): Promise<void> {
  await page.evaluate((name) => {
    const held = (
      globalThis as unknown as {
        __pinWorking?: Record<string, () => void>;
      }
    ).__pinWorking;
    held?.[name]?.();
  }, call);
  await page.waitForTimeout(0);
  if (!page.url().startsWith(url)) {
    throw new Error(`the bench left ${url}`);
  }
}

async function boxes(kit: Kit, base: string): Promise<void> {
  const url = `${base}/motion/pin-working`;
  for (const theme of THEMES) {
    for (const { view, width } of VIEWS_READ) {
      // biome-ignore lint/performance/noAwaitInLoops: one viewport at a time
      const page = await kit.page(view, { theme });
      await open(page, url, DOT);
      // The card's entrance (the kit's pop, --dur-pop) has landed.
      await page.waitForTimeout(400);
      const read = await page.evaluate(readWorking);
      const at = `${width} ${theme}`;
      const { sentTo, workingOnIt: workingOn } = commentWords;
      kit.check(
        `${at}: who has the comment is its status, never a speaker line: at the card's foot "${sentTo}", the session's chip, then "· ${workingOn}" after the live dot; the thread holds its ${read.entries.length} entries alone, nothing of the working state among them; no "Working on it…"`,
        read.statusInFoot &&
          read.status.startsWith(sentTo) &&
          read.status.endsWith(`· ${workingOn}`) &&
          !!(read.dot && read.working) &&
          read.dot.left >= read.working.left - 0.5 &&
          read.dot.right <= read.working.right + 0.5 &&
          !read.inThread &&
          read.by.join() === "person,agent,person" &&
          !read.oldWords,
        `\n    status "${read.status}" in foot ${read.statusInFoot}; dot ${JSON.stringify(read.dot)} in ${JSON.stringify(read.working)}; entries by ${read.by.join()}; working state in the thread ${read.inThread}; old words ${read.oldWords}`
      );
      const stack = [read.head, ...read.entries, read.foot];
      const stacked =
        stack.every(Boolean) &&
        stack.every((one, i) => {
          const next = stack[i + 1];
          return !(one && next && crosses(one, next));
        });
      const inside =
        !!(read.card && read.room) &&
        read.room.left >= read.card.left - 0.5 &&
        read.room.right <= read.card.right + 0.5 &&
        read.entries.every(
          (one) =>
            !!read.room &&
            one.left >= read.room.left - 0.5 &&
            one.right <= read.room.right + 0.5
        );
      kit.check(
        `${at}: the head, every entry and the foot stand one under another, the entries inside the thread's room inside the card; nothing spills sideways`,
        stacked && inside && !read.cardSpills && !read.pageSpills,
        `\n    ${stack.map((one) => (one ? `${r1(one.top)}–${r1(one.bottom)}` : "∅")).join(", ")}; room ${JSON.stringify(read.room)} card ${JSON.stringify(read.card)} spills ${read.cardSpills}/${read.pageSpills}`
      );
      const wide = await page.evaluate(readWide);
      kit.check(
        `${at}: nothing in the card scrolls sideways or is drawn past its edge (scrollWidth ≤ clientWidth for every part that can scroll; every other part's children inside it, but words ended in an ellipsis by design)`,
        wide.length === 0,
        wide.slice(0, 6).join("; ")
      );
      await bench(page, url, "land");
      await page
        .locator(`${CARD} [data-slot="entry"][data-by="agent"]`)
        .nth(1)
        .waitFor({ timeout: 5000 });
      await page.locator(WORKING).waitFor({ state: "detached" });
      const landed = await page.evaluate(readWorking);
      kit.check(
        `${at}: landed, the reply is the thread's last entry, the agent's, and the status line says "${sentTo}" with no "${workingOn}" nor live dot`,
        landed.by.join() === "person,agent,person,agent" &&
          landed.status.startsWith(sentTo) &&
          !landed.status.includes(workingOn) &&
          !landed.dot &&
          !landed.inThread,
        `\n    entries by ${landed.by.join()}; status "${landed.status}"; dot ${JSON.stringify(landed.dot)}`
      );
      await page.context().close();
    }
  }
}

async function breath(kit: Kit, base: string): Promise<void> {
  const url = `${base}/motion/pin-working`;
  for (const theme of THEMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time
    const page = await kit.page("desk", { theme });
    const engine = page.context().browser()?.browserType().name() ?? "";
    await open(page, url, DOT);
    await bench(page, url, "rest");
    await page.locator(WORKING).waitFor({ state: "detached" });
    await page.waitForTimeout(400);
    // The tokens as the page computes them: one breath's length and curve, and its floor.
    const tokens = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.animationDuration = "var(--breath)";
      probe.style.animationTimingFunction = "var(--ease-in-out)";
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const read = {
        ms: Number.parseFloat(style.animationDuration) * 1000,
        easing: style.animationTimingFunction,
        floor: Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--breath-floor")
            .trim()
        ),
      };
      probe.remove();
      return read;
    });
    // One clock: the card's mark and the pin's own pill, both put to work
    // by one change, run the same breath from the same moment.
    await bench(page, url, "work");
    await page.locator(DOT).waitFor();
    await page.waitForTimeout(100);
    const mark = await page.evaluate(readBreath, DOT);
    const pill = await page.evaluate(readBreath, PILL_DOT);
    kit.check(
      `1440 ${theme} (${engine}): the card's working mark and the pin's pill breathe on one clock: one breath each, equal length (${tokens.ms}ms) and curve, opacity 1, the floor (${tokens.floor}) and 1 at 0, ½ and 1 of a loop, each begun on the one clock (core breath.ts)`,
      !!(mark && pill) &&
        mark.runs === 1 &&
        pill.runs === 1 &&
        near(mark.length, tokens.ms, 1) &&
        mark.length === pill.length &&
        mark.easing === pill.easing &&
        mark.easing.replaceAll(" ", "") === tokens.easing.replaceAll(" ", "") &&
        mark.offClock !== null &&
        pill.offClock !== null &&
        mark.offClock <= 1 &&
        pill.offClock <= 1 &&
        [mark, pill].every(
          (one) =>
            near(one.opacity[0] ?? 0, 1, 0.01) &&
            near(one.opacity[1] ?? 0, tokens.floor, 0.01) &&
            near(one.opacity[2] ?? 0, 1, 0.01)
        ),
      `\n    mark ${JSON.stringify(mark)}\n    pill ${JSON.stringify(pill)}`
    );
    if (engine !== "chromium") {
      // The kit reads a loop on the DevTools clock alone (readMotion
      // `loops`): elsewhere the breath is read above, off its own timing.
      kit.note(
        `1440 ${theme} (${engine}): the breath's motion read runs on Chromium only; its timing and values are read above`
      );
      await page.context().close();
      continue;
    }
    await bench(page, url, "rest");
    await page.locator(WORKING).waitFor({ state: "detached" });
    await page.waitForTimeout(400);
    const motion = await readMotion(
      page,
      () => bench(page, url, "work"),
      CARD,
      {
        loops: true,
        // Every twentieth of the clock: the breath begins on the one clock
        // (its delay), so where in a loop each stands is its own progress.
        fractions: Array.from({ length: 21 }, (_, i) => i / 20),
        read: () =>
          page.evaluate((sel) => {
            const el = document.querySelector(sel) as Element;
            const [run] = el.getAnimations();
            // A CSS animation carries its curve on its keyframes, which the
            // protocol reports as linear: the dot's own style names it.
            return {
              opacity: Number(getComputedStyle(el).opacity),
              progress: Number(run?.effect?.getComputedTiming().progress ?? -1),
              easing: getComputedStyle(el).animationTimingFunction,
            };
          }, DOT),
      }
    );
    const [run] = motion.runs;
    // The sample nearest 0, ½ and 1 of a loop, by its own progress.
    const nearest = (share: number) =>
      motion.at.reduce<(typeof motion.at)[number] | undefined>(
        (best, one) =>
          !best ||
          Math.abs(one.value.progress - share) <
            Math.abs(best.value.progress - share)
            ? one
            : best,
        undefined
      )?.value;
    const at = [nearest(0), nearest(0.5), nearest(1)];
    const values = at.map((one) => one?.opacity ?? Number.NaN);
    const shares = at.map((one) => one?.progress ?? Number.NaN);
    const curve = motion.at[0]?.value.easing ?? "";
    kit.check(
      `1440 ${theme}: put to work, the card starts one run, the shared breath on the live dot: a loop of --breath (${tokens.ms}ms) on --ease-in-out, its opacity 1, the floor (${tokens.floor}) and 1 at 0, ½ and 1 of a loop`,
      motion.by === "clock" &&
        motion.runs.length === 1 &&
        !!run &&
        run.name === "breath" &&
        run.type === "CSSAnimation" &&
        run.target.includes("live-dot") &&
        run.end === Number.POSITIVE_INFINITY &&
        near(run.period ?? 0, tokens.ms, 1) &&
        curve.replaceAll(" ", "") === tokens.easing.replaceAll(" ", "") &&
        shares.every((share, i) => near(share, [0, 0.5, 1][i] ?? 0, 0.05)) &&
        near(values[0] ?? 0, 1, 0.01) &&
        near(values[1] ?? 0, tokens.floor, 0.01) &&
        near(values[2] ?? 0, 1, 0.01),
      `\n    ${JSON.stringify(motion.runs.map(({ name, type, target, period, end, easing }) => ({ name, type, target, period, end, easing })))} opacity ${JSON.stringify(values)} at ${JSON.stringify(shares)} of a loop, curve ${curve}`
    );
    await page.context().close();
  }
}

/**
 * The card's one surface against its pill, in the page's px: how many
 * surfaces stand, the surface's box, corner, fill and opacity, the card's
 * and the pill's boxes (the pill as the bench tells the card: its MARK,
 * 20px square, where its holder stands, as the overlay tells the pane a
 * pin's mark), what the thread shows, and the face it grows from. Runs in
 * the page.
 */
function readMorph() {
  const room = document.querySelector<HTMLElement>('[data-slot="pin-room"]');
  const card = room?.querySelector<HTMLElement>('[data-slot="pin-card"]');
  const surfaces = card?.querySelectorAll<HTMLElement>(
    '[data-slot="pin-surface"]'
  );
  const surface = surfaces?.[0];
  const body = card?.querySelector<HTMLElement>('[data-slot="pin-body"]');
  const holder = room?.querySelector<HTMLElement>(
    ":scope > span:has([data-mark])"
  );
  if (!(room && card && surface && body && holder)) {
    return null;
  }
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const told = holder.getBoundingClientRect();
  // A colour as the screen draws it, sRGB bytes: the engine serialises an
  // animated colour in its interpolation space and a token in its own.
  const paint = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  });
  const drawn = (value: string) => {
    if (!paint) {
      return value;
    }
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    return [...paint.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(",");
  };
  const colour = (token: string) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return drawn(value);
  };
  const shape = getComputedStyle(surface);
  return {
    surfaces: surfaces?.length ?? 0,
    surface: rect(surface),
    radius: Number.parseFloat(shape.borderTopLeftRadius),
    fill: drawn(shape.backgroundColor),
    opacity: Number(shape.opacity) * Number(getComputedStyle(card).opacity),
    shown: Number(getComputedStyle(body).opacity),
    card: rect(card),
    pill: { x: told.left, y: told.top, w: 20, h: 20 },
    pillFill: colour("--action-solid"),
    cardFill: colour("--surface-raised"),
    cardRadius: Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--radius-lg")
    ),
    gap: Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    ),
    room: rect(room),
    side: card.dataset.side ?? "",
  };
}
type Morph = NonNullable<ReturnType<typeof readMorph>>;
type Rect = Morph["card"];

const sameRect = (a: Rect, b: Rect, by = 1) =>
  near(a.x, b.x, by) &&
  near(a.y, b.y, by) &&
  near(a.w, b.w, by) &&
  near(a.h, b.h, by);
const rectWords = (r: Rect) => `${r1(r.x)},${r1(r.y)} ${r1(r.w)}×${r1(r.h)}`;
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

/** The reads at each fraction, each a step on from the last toward `to`: the box, then the corner. */
const monotonic = (reads: Morph[], growing: boolean) =>
  reads.every((read, i) => {
    const before = reads[i - 1];
    if (!before) {
      return true;
    }
    const sign = growing ? 1 : -1;
    return (
      sign * (read.surface.w - before.surface.w) >= -0.5 &&
      sign * (read.surface.h - before.surface.h) >= -0.5 &&
      sign * (read.radius - before.radius) >= -0.5
    );
  });

/**
 * The card is its pill grown (the owner: "a gooey animation that morphs
 * out of the comment just how the caw/search/machine bar on the top right
 * does it"): opened and closed on the clock (the DevTools Animation domain
 * on Chromium, the page's held clock on WebKit), read at 0, ¼, ½, ¾ and 1.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each engine, the open then the close, five checks on what each read
async function morph(kit: Kit, base: string): Promise<void> {
  const url = `${base}/motion/pin-working`;
  for (const engine of ["chromium", "webkit"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
    const page = await kit.page("desk", { engine });
    await open(page, `${url}?at=foot`, CARD);
    await bench(page, url, "hide");
    await page.locator(CARD).waitFor({ state: "detached" });
    const tag = `1440 (${engine})`;
    for (const way of ["opens", "closes"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: the open, then the close
      const motion = await readMotion(
        page,
        () => bench(page, url, way === "opens" ? "show" : "hide"),
        CARD,
        {
          fractions: FRACTIONS,
          read: () => page.evaluate(readMorph),
        }
      );
      const reads = motion.at.map((one) => one.value);
      if (reads.length !== FRACTIONS.length || reads.some((one) => !one)) {
        kit.check(
          `${tag}: the card ${way}, read at 0, ¼, ½, ¾ and 1`,
          false,
          JSON.stringify(reads)
        );
        continue;
      }
      const held = reads as Morph[];
      const first = held[0] as Morph;
      const last = held.at(-1) as Morph;
      const [pillEnd, cardEnd] =
        way === "opens" ? [first, last] : [last, first];
      kit.check(
        `${tag}: as the card ${way}, one surface stands the whole way, opaque (${held.map((one) => `${one.surfaces}@${r1(one.opacity)}`).join(" ")}), on the house clock (${motion.by}): ${motion.runs.map((run) => `${run.name} ${run.end - run.delay}ms`).join(", ")}`,
        held.every((one) => one.surfaces === 1 && near(one.opacity, 1, 0.001)),
        JSON.stringify(
          held.map((one) => ({ surfaces: one.surfaces, opacity: one.opacity }))
        )
      );
      kit.check(
        `${tag}: ${way === "opens" ? "at 0" : "at 1"} the surface is the pill: its box ${rectWords(pillEnd.surface)} against the pill's ${rectWords(pillEnd.pill)}, its corner ${r1(pillEnd.radius)}px (the pill's ${pillEnd.pill.h / 2}px), its fill the pill's face (${pillEnd.fill} against ${pillEnd.pillFill})`,
        sameRect(pillEnd.surface, pillEnd.pill) &&
          near(pillEnd.radius, pillEnd.pill.h / 2, 0.5) &&
          pillEnd.fill === pillEnd.pillFill,
        JSON.stringify(pillEnd)
      );
      kit.check(
        `${tag}: ${way === "opens" ? "at 1" : "at 0"} the surface is the card: its box ${rectWords(cardEnd.surface)} against the card's ${rectWords(cardEnd.card)}, its corner ${r1(cardEnd.radius)}px (--radius-lg ${cardEnd.cardRadius}px), its fill the raised surface`,
        sameRect(cardEnd.surface, cardEnd.card) &&
          near(cardEnd.radius, cardEnd.cardRadius, 0.5) &&
          cardEnd.fill === cardEnd.cardFill,
        JSON.stringify(cardEnd)
      );
      kit.check(
        `${tag}: between, the shape ${way === "opens" ? "grows" : "shrinks"} one way, box and corner (${held.map((one) => `${r1(one.surface.w)}×${r1(one.surface.h)} r${r1(one.radius)}`).join(" → ")})`,
        monotonic(held, way === "opens"),
        JSON.stringify(held.map((one) => one.surface))
      );
      const shown = held.map((one) => r1(one.shown * 100) / 100);
      kit.check(
        way === "opens"
          ? `${tag}: the thread shows only once the shape has room: hidden at 0 and ¼, whole at 1 (${shown.join(" → ")})`
          : `${tag}: the thread is gone by half way as it goes back (${shown.join(" → ")})`,
        way === "opens"
          ? shown[0] === 0 && shown[1] === 0 && shown[4] === 1
          : shown[0] === 1 && shown[2] === 0 && shown[4] === 0,
        JSON.stringify(shown)
      );
      if (way === "opens") {
        kit.check(
          `${tag}: its pill near the well's foot, the card stands whole, as tall as what it holds, moved up from the pill's top (${rectWords(last.card)} in ${rectWords(last.room)}), level with its pill`,
          last.card.y < last.pill.y - 1 &&
            last.card.y >= last.room.y + last.gap - 0.5 &&
            near(
              last.card.y + last.card.h,
              last.room.y + last.room.h - last.gap,
              1
            ) &&
            last.pill.y + 10 >= last.card.y &&
            last.pill.y + 10 <= last.card.y + last.card.h,
          JSON.stringify(last)
        );
      }
    }
    await page.context().close();
  }
}

/** Records, every frame for `ms`, the card's and its pill's boxes and the page's scroll. Runs in the page. */
function recordScroll(ms: number) {
  const frames: {
    card: { y: number; h: number };
    pill: number;
    room: { y: number; h: number };
    side: string;
  }[] = [];
  const room = document.querySelector<HTMLElement>('[data-slot="pin-room"]');
  const until = performance.now() + ms;
  return new Promise<typeof frames>((done) => {
    const step = () => {
      const card = room?.querySelector<HTMLElement>('[data-slot="pin-card"]');
      const holder = room?.querySelector(":scope > span:has([data-mark])");
      if (room && card && holder) {
        const c = card.getBoundingClientRect();
        const r = room.getBoundingClientRect();
        frames.push({
          card: { y: c.top, h: c.height },
          pill: holder.getBoundingClientRect().top,
          room: { y: r.top, h: r.height },
          side: card.dataset.side ?? "",
        });
      }
      if (performance.now() < until) {
        requestAnimationFrame(step);
      } else {
        done(frames);
      }
    };
    requestAnimationFrame(step);
  });
}

/** What a run of frames says of a card following its pill. */
function followed(
  frames: Awaited<ReturnType<typeof recordScroll>>,
  gap: number
) {
  let drift = 0;
  let step = 0;
  let base: number | null = null;
  for (const [i, frame] of frames.entries()) {
    const clear =
      frame.card.y > frame.room.y + gap + 0.5 &&
      frame.card.y + frame.card.h < frame.room.y + frame.room.h - gap - 0.5;
    const offset = frame.card.y - frame.pill;
    if (clear) {
      base ??= offset;
      drift = Math.max(drift, Math.abs(offset - base));
    }
    const before = frames[i - 1];
    if (before) {
      step = Math.max(
        step,
        Math.abs(frame.card.y - before.card.y) -
          Math.abs(frame.pill - before.pill)
      );
    }
  }
  const sides = new Set(frames.map((frame) => frame.side));
  const moved = frames.reduce(
    (sum, frame, i) =>
      sum + Math.abs(frame.pill - (frames[i - 1]?.pill ?? frame.pill)),
    0
  );
  return { drift, step, sides: [...sides], moved, frames: frames.length };
}

/**
 * Scrolling the page under an open card (the owner: "when scrolling the
 * page why does this jump up and down instead of animating its
 * position?"): by wheel steps over the page and by a scroll set from code,
 * every frame read. While the card is clear of the well's edges its offset
 * from its pill holds within 1px; at an edge it is held there, never
 * stepping more than its pill moved, plus 1.5px; it never changes side.
 */
async function scrollFollow(kit: Kit, base: string): Promise<void> {
  const url = `${base}/motion/pin-working`;
  for (const engine of ["chromium", "webkit"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
    const page = await kit.page("desk", { engine });
    await open(page, `${url}?at=scroll`, CARD);
    await page.waitForTimeout(400);
    const gap = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--space-2")
      )
    );
    const pageBox = await page
      .locator('[data-slot="bench-page"]')
      .boundingBox();
    const tag = `1440 (${engine})`;
    for (const how of ["wheel", "code"] as const) {
      const recording = page.evaluate(recordScroll, 1600);
      if (how === "wheel" && pageBox) {
        // biome-ignore lint/performance/noAwaitInLoops: the wheel, then a scroll from code, each read on its own
        await page.mouse.move(pageBox.x + pageBox.width - 40, pageBox.y + 200);
        for (const dy of [120, 120, 120, 120, -120, -120, 200, 200]) {
          // biome-ignore lint/performance/noAwaitInLoops: one wheel step a frame or so apart, as a hand gives them
          await page.mouse.wheel(0, dy);
          await page.waitForTimeout(60);
        }
      } else {
        await page.evaluate(async () => {
          const scroller = document.querySelector<HTMLElement>(
            '[data-slot="bench-page"]'
          );
          for (const top of [0, 150, 320, 520, 760, 400, 90, 0]) {
            if (scroller) {
              scroller.scrollTop = top;
            }
            // biome-ignore lint/performance/noAwaitInLoops: one scroll a frame, in order
            await new Promise((done) => requestAnimationFrame(done));
            await new Promise((done) => setTimeout(done, 40));
          }
        });
      }
      const read = followed(await recording, gap);
      kit.check(
        `${tag}: scrolled by ${how === "wheel" ? "wheel steps" : "code"} (the pill travelled ${r1(read.moved)}px over ${read.frames} frames), the card follows its pill: its offset from it holds within 1px while clear of the edges (${r1(read.drift)}px), it never steps more than the pill moved plus 1.5px (${r1(read.step)}px over), and it keeps its side (${read.sides.join(", ")})`,
        read.frames > 10 &&
          read.drift <= 1 &&
          read.step <= 1.5 &&
          read.sides.length === 1,
        JSON.stringify(read)
      );
    }
    await page.context().close();
  }
}

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "pin-working",
  run: async (kit: Kit) => {
    const base = await kit.bench();
    await boxes(kit, base);
    await breath(kit, base);
    await morph(kit, base);
    await scrollFollow(kit, base);
  },
};

export default spec;
