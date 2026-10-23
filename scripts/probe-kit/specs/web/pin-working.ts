/**
 * A comment's thread while the agent works on it (DESIGN.md, A thread beside
 * its pin; Live dot; Live work breathes), on the /motion/pin-working bench:
 * the real PinCard in the real PinFloat, its pin a fixture, put to work, its
 * reply landed and set at rest through `window.__pinWorking`.
 *
 * At 390 (the well's foot sheet, under a finger), 680 and 1440, in both
 * schemes:
 * 1. The agent's speaker line stands where its reply will: under the last
 *    entry, its mark on the column the agent's earlier mark stands on, the
 *    live dot on that mark's top-end corner. The working turn says no words
 *    on screen beyond the agent's name, and "The agent is working on it" to
 *    a screen reader (its status); no "Working on it…" is left.
 * 2. Nothing overlaps: the card's head, every entry, the working turn and
 *    the foot stand one under another inside the card, the working turn
 *    inside the thread's room, and neither the card nor the page scrolls
 *    sideways.
 * 3. Landed, the reply's mark stands where the working mark stood (in the
 *    thread's own coordinates, its scroll counted), and the working turn is
 *    gone.
 *
 * With `PROBE_SHOTS_DIR` set, each viewport and scheme is captured there,
 * working and landed, for review.
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
 *   bun scripts/probe-kit/run.ts web pin-working
 */
import type { Page } from "playwright-core";
import { accountsWords } from "../../../../packages/core/src/words/accounts";
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
/** The accessible name the working state keeps. */
const SAID = commentWords.working;
/** Where each state's capture goes for review, when set: a run's output, never the repository. */
const SHOTS = process.env.PROBE_SHOTS_DIR;

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface Read {
  /** The earlier agent entry's mark. */
  agentMark: Box | null;
  card: Box | null;
  cardSpills: boolean;
  dot: Box | null;
  entries: Box[];
  foot: Box | null;
  head: Box | null;
  /** The working mark, in the room's own coordinates (its scroll counted). */
  inRoom: { left: number; top: number } | null;
  mark: Box | null;
  oldWords: boolean;
  pageSpills: boolean;
  room: Box | null;
  said: string;
  shown: string;
  turn: Box | null;
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
  const turn = card?.querySelector<HTMLElement>('[data-slot="working"]');
  const mark = turn?.querySelector('[data-slot="dot"]');
  const roomBox = box(room);
  const markBox = box(mark);
  const status = turn?.querySelector('[role="status"]');
  const visible = turn?.querySelector("[data-turn-who]");
  return {
    agentMark: box(
      card?.querySelector(
        '[data-slot="entry"][data-by="agent"] [data-slot="dot"]'
      )
    ),
    card: box(card),
    cardSpills: !!card && card.scrollWidth > card.clientWidth + 0.5,
    dot: box(turn?.querySelector('[data-slot="live-dot"]')),
    entries: [...(card?.querySelectorAll('[data-slot="entry"]') ?? [])].flatMap(
      (el) => box(el) ?? []
    ),
    foot: box(card?.querySelector('[data-slot="foot"]')),
    head: box(card?.querySelector('[data-slot="head"]')),
    inRoom:
      room && roomBox && markBox
        ? {
            left: markBox.left - roomBox.left,
            top: markBox.top - roomBox.top + room.scrollTop,
          }
        : null,
    mark: markBox,
    oldWords: (card?.textContent ?? "").includes("Working on it"),
    pageSpills: document.documentElement.scrollWidth > window.innerWidth + 0.5,
    room: roomBox,
    said: status?.textContent?.trim() ?? "",
    shown: (visible as HTMLElement | null)?.innerText.trim() ?? "",
    turn: box(turn),
  };
}

/** The landed reply's mark, in the room's own coordinates. */
function readLanded(): {
  inRoom: { left: number; top: number } | null;
  working: boolean;
} {
  const card = document.querySelector('[data-slot="pin-card"]');
  const room = card?.querySelector<HTMLElement>("[data-pin-room]");
  const agents = card?.querySelectorAll(
    '[data-slot="entry"][data-by="agent"] [data-slot="dot"]'
  );
  const mark = agents?.[agents.length - 1];
  if (!(room && mark)) {
    return { inRoom: null, working: false };
  }
  const r = mark.getBoundingClientRect();
  const at = room.getBoundingClientRect();
  return {
    inRoom: { left: r.left - at.left, top: r.top - at.top + room.scrollTop },
    working: !!card?.querySelector('[data-slot="working"]'),
  };
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
      // The card's entrance (PinFloat's grow, --dur-menu) has landed.
      await page.waitForTimeout(400);
      const read = await page.evaluate(readWorking);
      const at = `${width} ${theme}`;
      if (SHOTS) {
        await page.screenshot({
          path: `${SHOTS}/pin-working-${width}-${theme}.png`,
        });
      }
      const stack = [read.head, ...read.entries, read.turn, read.foot];
      const stacked =
        stack.every(Boolean) &&
        stack.every((one, i) => {
          const next = stack[i + 1];
          return !(one && next && crosses(one, next));
        });
      const inside =
        !!(read.card && read.turn && read.room) &&
        read.turn.left >= read.room.left - 0.5 &&
        read.turn.right <= read.room.right + 0.5 &&
        read.turn.top >= read.room.top - 0.5 &&
        read.room.left >= read.card.left - 0.5 &&
        read.room.right <= read.card.right + 0.5;
      const last = read.entries.at(-1);
      const placed =
        !!(read.mark && read.agentMark && last && read.turn) &&
        near(read.mark.left, read.agentMark.left) &&
        read.turn.top >= last.bottom - 0.5;
      const cornered =
        !!(read.dot && read.mark) &&
        near((read.dot.left + read.dot.right) / 2, read.mark.right, 3) &&
        near((read.dot.top + read.dot.bottom) / 2, read.mark.top, 3);
      kit.check(
        `${at}: the agent's speaker line stands where its reply will (under the last entry, its mark on the agent's column), the live dot on its mark's top-end corner; on screen only the agent's name, "${SAID}" its status; no "Working on it…"`,
        placed &&
          cornered &&
          read.shown === accountsWords.harnesses.claude &&
          read.said === SAID &&
          !read.oldWords,
        `\n    mark ${JSON.stringify(read.mark)} agent ${JSON.stringify(read.agentMark)} last ${JSON.stringify(last)} turn ${JSON.stringify(read.turn)} dot ${JSON.stringify(read.dot)} shown "${read.shown}" said "${read.said}" old ${read.oldWords}`
      );
      kit.check(
        `${at}: the head, every entry, the working turn and the foot stand one under another, the working turn inside the thread's room; nothing spills sideways`,
        stacked && inside && !read.cardSpills && !read.pageSpills,
        `\n    ${stack.map((one) => (one ? `${r1(one.top)}–${r1(one.bottom)}` : "∅")).join(", ")}; room ${JSON.stringify(read.room)} card ${JSON.stringify(read.card)} spills ${read.cardSpills}/${read.pageSpills}`
      );
      await bench(page, url, "land");
      await page
        .locator(`${CARD} [data-slot="entry"][data-by="agent"]`)
        .nth(1)
        .waitFor({ timeout: 5000 });
      await page.waitForTimeout(200);
      const landed = await page.evaluate(readLanded);
      if (SHOTS) {
        await page.screenshot({
          path: `${SHOTS}/pin-landed-${width}-${theme}.png`,
        });
      }
      kit.check(
        `${at}: the landed reply's mark stands where the working mark stood, and the working turn is gone`,
        !!(landed.inRoom && read.inRoom) &&
          near(landed.inRoom.left, read.inRoom.left) &&
          near(landed.inRoom.top, read.inRoom.top) &&
          !landed.working,
        `\n    working at ${JSON.stringify(read.inRoom)}, reply at ${JSON.stringify(landed.inRoom)}, working turn left ${landed.working}`
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
      `1440 ${theme}: the card's working mark and the pin's pill breathe on one clock: one breath each, equal length (${tokens.ms}ms) and curve, each begun on the one clock (core breath.ts)`,
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
        pill.offClock <= 1,
      `\n    mark ${JSON.stringify(mark)}\n    pill ${JSON.stringify(pill)}`
    );
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

const spec: Spec = {
  name: "pin-working",
  run: async (kit: Kit) => {
    const base = await kit.bench();
    await boxes(kit, base);
    await breath(kit, base);
  },
};

export default spec;
