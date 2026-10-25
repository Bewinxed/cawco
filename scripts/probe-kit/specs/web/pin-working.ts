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
 * And at 1440, on Chromium and WebKit, the card hangs from its pin (the
 * owner: "a gooey animation that morphs out of the comment just how the
 * caw/search/machine bar on the top right does it"; DESIGN.md, A thread
 * beside its pin): the top bar's own HangCard and `hang`, hung beside the
 * pin's end side from its foot (PinFoot), its pill near the well's foot
 * (`?at=foot`). Opened and closed on the clock (the DevTools Animation
 * domain on Chromium, the page's held clock on WebKit), read at 0, ⅒, ¼,
 * ½, ¾ and 1 (pin-hang.ts): only translate animates on the card, nothing on
 * the pin's foot; shut, the card stands wholly behind the cut at the pin's
 * side; at every fraction the card's edge is on the cut and its neck runs
 * from the pin's top to its foot within 1px; the pin's own fill never
 * changes; early in the slide the pin and the card are one silhouette, the
 * liquid bridge between them (the ink along the pin's middle row, on a
 * ground of its own), and open it has drawn itself into the neck (the
 * silhouette at the cut the pin and its flares, within 2px). Open, the card
 * stands whole, as tall as what it holds, moved up from the pin's top.
 *
 * One clock with the top bar: the card's open and close run the same
 * length and curve as the glass's own card (GlassCard, Caw's panel) on the
 * same page. On WebKit, frame by frame through an open, the page's
 * main-thread CPU in each frame is read (cpu.ts) and none runs over 25ms.
 *
 * And on a page that scrolls under the open card (`?at=scroll`; the owner:
 * "WRONG, u keep animating it as i scroll down, instead of only letting it
 * move when it reaches the spot where it will move from one spot to the
 * next, it should animate THEN, not animate WHILE i'm scrolling"), by wheel
 * steps and from code, every frame read: the card's box stands still on
 * every frame between its moves, each move one travel from the box it
 * stood at to its next, and it keeps its side.
 *
 *   bun scripts/probe-kit/run.ts web pin-working
 */
import type { Page } from "playwright-core";
import { commentWords } from "../../../../packages/core/src/words/comments";
import { readBreath } from "../../breath";
import { pageCpu } from "../../cpu";
import { attribute, ourWork, tell, watch, watched } from "../../frames";
import type { Kit, Spec, View } from "../../kit";
import { open, readMotion, THEMES } from "../../kit";
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
} from "../../pin-hang";

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
    status: (status?.innerText ?? "").replaceAll(/\s+/g, " ").trim(),
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

const HANG: HangSel = {
  card: CARD,
  face: '[data-slot="pin-room"] > span > [data-mark]',
  room: '[data-slot="pin-room"]',
};
const FRACTIONS = [0, 0.1, 0.25, 0.5, 0.75, 1];

/** The card's box and the room's, for its height: whole, as tall as what it holds, moved up from its pin. Runs in the page. */
function readStands() {
  const room = document.querySelector<HTMLElement>('[data-slot="pin-room"]');
  const card = room?.querySelector<HTMLElement>('[data-slot="pin-card"]');
  const foot = room?.querySelector<HTMLElement>('[data-slot="pin-foot"]');
  if (!(room && card && foot)) {
    return null;
  }
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  return {
    card: rect(card),
    room: rect(room),
    pin: rect(foot),
    gap: Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    ),
  };
}

/**
 * The card hung from its pin, opened and closed on the clock (the DevTools
 * Animation domain on Chromium, the page's held clock on WebKit), read at
 * its fractions with the ink where the pin meets it (pin-hang.ts).
 */
async function hung(kit: Kit, base: string): Promise<void> {
  const url = `${base}/motion/pin-working`;
  for (const engine of ["chromium", "webkit"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
    const page = await kit.page("desk", { engine });
    await open(page, `${url}?at=foot`, CARD);
    // At rest (no live dot breathing on the pin), so the whole pin room is
    // still before each run: the card's close is held by the block that
    // holds it as it leaves, which stands in the room, round the card.
    await bench(page, url, "rest");
    await bench(page, url, "hide");
    await page.locator(CARD).waitFor({ state: "detached" });
    const tag = `1440 (${engine})`;
    for (const way of ["opens", "closes"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: the open, then the close
      const motion = await readMotion(
        page,
        () => bench(page, url, way === "opens" ? "show" : "hide"),
        HANG.room,
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
          `${tag}: the card ${way}, read at ${FRACTIONS.join(", ")}`,
          false,
          JSON.stringify(motion.at)
        );
        continue;
      }
      hangChecks(kit, tag, way, reads, motion.runs);
      if (way === "opens") {
        await page.waitForTimeout(400);
        const stands = await page.evaluate(readStands);
        kit.check(
          `${tag}: its pill near the well's foot, the card stands whole, as tall as what it holds, moved up from the pin's top (${stands ? `${r1(stands.card.y)}–${r1(stands.card.y + stands.card.h)} in ${r1(stands.room.y)}–${r1(stands.room.y + stands.room.h)}, the pin at ${r1(stands.pin.y)}` : "no card"}), the pin against its edge`,
          !!stands &&
            stands.card.y < stands.pin.y - 1 &&
            stands.card.y >= stands.room.y + stands.gap - 0.5 &&
            near(
              stands.card.y + stands.card.h,
              stands.room.y + stands.room.h - stands.gap,
              1
            ) &&
            stands.pin.y >= stands.card.y - 0.5 &&
            stands.pin.y + stands.pin.h <= stands.card.y + stands.card.h + 0.5,
          JSON.stringify(stands)
        );
      }
    }
    await page.context().close();
  }
}

/** The slide run on a hanging card while it moves: its length and curve. Runs in the page. */
function slideOf(selector: string) {
  const card = document.querySelector(selector);
  const run = card
    ?.getAnimations()
    .find((one) =>
      (one.effect as KeyframeEffect | null)
        ?.getKeyframes()
        .some((frame) => "translate" in frame)
    );
  return run
    ? {
        ms: Number(run.effect?.getComputedTiming().duration),
        easing: (run.effect as KeyframeEffect).getTiming().easing ?? "",
      }
    : null;
}

/**
 * One clock with the top bar (DESIGN.md, A card that hangs from its
 * anchor): the thread's card opens and closes on the same length and curve
 * as the glass's own card (GlassCard, Caw's panel, pressed open on the
 * bench's own top bar), each read from `getAnimations()` while it moves.
 */
async function sameClock(kit: Kit, base: string): Promise<void> {
  const url = `${base}/motion/pin-working`;
  for (const engine of ["chromium", "webkit"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
    const page = await kit.page("desk", { engine });
    await open(page, `${url}?at=foot`, CARD);
    await bench(page, url, "hide");
    await page.locator(CARD).waitFor({ state: "detached" });
    await page.waitForTimeout(1500);
    const read = async (action: () => Promise<unknown>, selector: string) => {
      await action();
      return page.evaluate(
        (sel) =>
          new Promise<ReturnType<typeof slideOf>>((done) => {
            const until = performance.now() + 2000;
            const step = () => {
              const got = (
                window as unknown as { slideOf: typeof slideOf }
              ).slideOf(sel);
              if (got || performance.now() > until) {
                done(got);
              } else {
                requestAnimationFrame(step);
              }
            };
            step();
          }),
        selector
      );
    };
    await page.evaluate((source) => {
      (window as unknown as { slideOf: unknown }).slideOf = new Function(
        `return (${source})`
      )();
    }, slideOf.toString());
    const glassCard = "[data-glass-card-frame]";
    const glassOpen = await read(
      () => page.locator('[data-glass-opens="caw"]').first().click(),
      glassCard
    );
    await page.waitForTimeout(600);
    const glassClose = await read(
      () => page.keyboard.press("Escape"),
      glassCard
    );
    await page.waitForTimeout(600);
    const pinOpen = await read(() => bench(page, url, "show"), CARD);
    await page.waitForTimeout(600);
    const pinClose = await read(() => bench(page, url, "hide"), CARD);
    const same = (
      a: ReturnType<typeof slideOf>,
      b: ReturnType<typeof slideOf>
    ) =>
      !!(a && b) &&
      near(a.ms, b.ms, 0.5) &&
      a.easing.replaceAll(" ", "") === b.easing.replaceAll(" ", "");
    const words = (one: ReturnType<typeof slideOf>) =>
      one ? `${one.ms}ms ${one.easing}` : "none";
    kit.check(
      `1440 (${engine}): one clock with the top bar: the thread's card opens on the glass's card's own (${words(pinOpen)} against ${words(glassOpen)}) and closes on it (${words(pinClose)} against ${words(glassClose)}), read from getAnimations() on the same page`,
      same(pinOpen, glassOpen) &&
        same(pinClose, glassClose) &&
        !same(pinOpen, pinClose),
      JSON.stringify({ glassOpen, glassClose, pinOpen, pinClose })
    );
    await page.context().close();
  }
}

/**
 * WebKit, frame by frame through the card's slide out of its pin (the
 * bridge drawn every frame on its clock): the page's main-thread CPU in
 * each frame interval inside the slide (cpu.ts, the kernel's run time),
 * none over 25ms, quoted; and, read out beside them, the frame it starts in
 * (the card placed and first drawn), the frame it lands in (standing open,
 * the foot plain again) and the frame the card mounted in (the thread's
 * whole card drawn at once).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: six opens, each frame interval sorted into the slide, its start, its landing or the mount
async function webkitFrames(kit: Kit, base: string): Promise<void> {
  const url = `${base}/motion/pin-working`;
  const page = await kit.page("desk", {
    engine: "webkit",
    init: [watch, attribute],
  });
  await open(page, `${url}?at=foot`, CARD);
  await bench(page, url, "hide");
  await page.locator(CARD).waitFor({ state: "detached" });
  await page.waitForTimeout(800);
  // Each slide's start and length, as the card says it starts (motion/hang `SLIDE`).
  await page.evaluate(() => {
    const kept = window as unknown as { __slides: [number, number][] };
    kept.__slides = [];
    document.addEventListener(
      "hang-slide",
      (event) => {
        const run = (event as CustomEvent<{ opens: boolean; run: Animation }>)
          .detail;
        if (run.opens) {
          kept.__slides.push([
            performance.now(),
            Number(run.run.effect?.getComputedTiming().duration),
          ]);
        }
      },
      true
    );
  });
  const cpu = await pageCpu(page);
  const sliding: { at: number; cpu: number; ms: number; ours: number }[] = [];
  const starting: { cpu: number; ms: number; ours: number }[] = [];
  const landing: { cpu: number; ms: number; ours: number }[] = [];
  const mounting: { cpu: number; ms: number; ours: number }[] = [];
  for (let n = 0; n < 6; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one open at a time, each from rest
    const recording = await cpu.record();
    await tell(page, { rafs: [], calls: [], tap: -1, cadence: true });
    await page.waitForTimeout(100);
    const pressed = await page.evaluate(() => performance.now());
    await bench(page, url, "show");
    await page.waitForTimeout(700);
    const seen = await watched(page);
    await tell(page, { cadence: false });
    const ran = await recording.stop();
    const [start, length] = await page.evaluate(
      () =>
        (window as unknown as { __slides: [number, number][] }).__slides.at(
          -1
        ) ?? [0, 0]
    );
    const frames = seen.rafs;
    for (const [k, t] of frames.slice(1).entries()) {
      const from = frames[k] as number;
      const interval = {
        ms: t - from,
        cpu: ran.between(from, t),
        ours: ourWork(seen.calls, from, t).ms,
      };
      if (from >= start && t <= start + length) {
        sliding.push({ at: from - start, ...interval });
      } else if (from < start + length && t > start + length && from >= start) {
        landing.push(interval);
      } else if (from < start && t > start) {
        starting.push(interval);
      } else if (from <= pressed && t > pressed) {
        mounting.push(interval);
      }
    }
    await bench(page, url, "hide");
    await page.waitForTimeout(500);
  }
  const sorted = [...sliding].sort((a, b) => b.cpu - a.cpu);
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const [worst] = sorted;
  const [mounted] = [...mounting].sort((a, b) => b.cpu - a.cpu);
  const [started] = [...starting].sort((a, b) => b.cpu - a.cpu);
  const [landed] = [...landing].sort((a, b) => b.cpu - a.cpu);
  kit.check(
    `1440 (webkit): through 6 slides of the card out of its pin (${sliding.length} frame intervals from each slide's start to its end, the bridge drawn in each), the page's main-thread CPU per frame: median ${r1(median(sliding.map((one) => one.cpu)))}ms, heaviest ${worst ? `${r1(worst.cpu)}ms in ${r1(worst.ms)}ms at +${r1(worst.at)}ms (our code ${r1(worst.ours)}ms)` : "none"}, none over 25ms. Beside them: the frame each slide starts in (the card placed and first drawn out from behind its cut), at most ${started ? `${r1(started.cpu)}ms of CPU in ${r1(started.ms)}ms (our code ${r1(started.ours)}ms)` : "no frame read"}; the frame each lands in (the card standing open, the foot drawn plain again), at most ${landed ? `${r1(landed.cpu)}ms in ${r1(landed.ms)}ms (our code ${r1(landed.ours)}ms)` : "no frame read"}; and the frame the card mounted in, ${mounted ? `${r1(mounted.cpu)}ms (our code ${r1(mounted.ours)}ms)` : "no frame read"}`,
    sliding.length > 10 && (worst?.cpu ?? 0) <= 25,
    JSON.stringify(sorted.slice(0, 4))
  );
  await page.context().close();
}

/**
 * Scrolling the page under an open card (the owner: "WRONG, u keep
 * animating it as i scroll down, instead of only letting it move when it
 * reaches the spot where it will move from one spot to the next, it should
 * animate THEN, not animate WHILE i'm scrolling"): by wheel steps and by a
 * scroll set from code, every frame read (pin-hang.ts `stillOf`).
 */
async function scrollStill(kit: Kit, base: string): Promise<void> {
  const url = `${base}/motion/pin-working`;
  for (const engine of ["chromium", "webkit"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
    const page = await kit.page("desk", { engine });
    await open(page, `${url}?at=scroll`, CARD);
    await page.waitForTimeout(600);
    const pageBox = await page
      .locator('[data-slot="bench-page"]')
      .boundingBox();
    const tag = `1440 (${engine})`;
    for (const how of ["wheel", "code"] as const) {
      const recording = page.evaluate(recordStill, {
        ms: 2200,
        card: CARD,
        room: HANG.room,
      });
      if (how === "wheel" && pageBox) {
        // biome-ignore lint/performance/noAwaitInLoops: the wheel, then a scroll from code, each read on its own
        await page.mouse.move(pageBox.x + pageBox.width - 40, pageBox.y + 200);
        for (const dy of [120, 120, 120, 120, -120, -120, -200, 200]) {
          // biome-ignore lint/performance/noAwaitInLoops: one wheel step a frame or so apart, as a hand gives them
          await page.mouse.wheel(0, dy);
          await page.waitForTimeout(90);
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
            await new Promise((done) => setTimeout(done, 120));
          }
        });
      }
      stillChecks(kit, tag, how, stillOf(await recording));
      await page.waitForTimeout(400);
    }
    await page.context().close();
  }
}

const spec: Spec = {
  name: "pin-working",
  run: async (kit: Kit) => {
    const base = await kit.bench();
    await boxes(kit, base);
    await breath(kit, base);
    await hung(kit, base);
    await sameClock(kit, base);
    await webkitFrames(kit, base);
    await scrollStill(kit, base);
  },
};

export default spec;
