/**
 * A decision page's pick, read from the engine as the person makes it
 * (DESIGN.md, The Stay In Context Rule; the owner: "highlighting the answe
 * and ransitioning the screen to the next"), on the hub's decision host with
 * no hub (decision-embeds.ts `startDecisionStage`, the overlay's own pick on
 * the stand-in bridge). A page of three cards: `path` and `look` tall (a
 * long top-down diagram each), `radius` short.
 *
 * At 1440×900 light and 390×844 dark under a finger, each on the clock
 * (anim.ts `Clock`, the DevTools Animation domain):
 * 1. The pressed option shows chosen where it stands: its edge, fill and
 *    keycap change over --dur-control on ease-out, read at 0, ½ and 1 of
 *    that clock, landing on `brand-solid` and `chip-chosen-bg` (L905, L540).
 *    The card folds once that colour has landed, never before.
 * 2. The fold: the body's height, margin and opacity, the card's padding and
 *    the chosen option's flight on one clock (one start time, duration and
 *    easing: --dur-settle on --ease-crossfade, page-length travel by L690),
 *    read at 0, ½ and 1: the card from its open height to its decided line.
 *    The page's scroll rides that clock: at 0 where it stood before the
 *    press (no jump on the fold's frame), at ½ the fold's own eased progress
 *    of the way, at 1 where it lands, with the next card in view under the
 *    decided line. Scrubbed frame by frame (1/60s steps, 0 to 1), no frame
 *    moves the scroll or the card's height more than an eighth of its trip
 *    (L690: "every other house curve moves more than an eighth in one frame
 *    there, which reads as a lurch").
 * 3. Change pressed with the fold held at ½ turns it back from the height
 *    drawn there (L489), opening over --dur-settle on --ease-crossfade,
 *    focus on the pick.
 * 4. Played live, a pick folds its card --dur-control after the press (the
 *    chosen colour landing, no other wait), moves the page's scroll only
 *    forward on its way and never by the browser's anchoring; each painted
 *    frame's step is read (a ResizeObserver on the card, after layout), with
 *    the long tasks and long animation frames the page reports; focus lands
 *    on the next open card's first option once the fold lands, past the
 *    last card on the first open one above it, and on Send when none is
 *    left.
 * 5. From the keyboard (L690: "A choice made from the keyboard … is
 *    instant"): Enter on an option, and Space on another, land everything
 *    on the next frame, with no animation under the card: its chosen colour,
 *    the card at its decided line, the scroll where the fold would have
 *    taken it and focus on the next open card's first option. Enter on
 *    Change opens it the same way, focus on the pick.
 * 6. Reduced motion: the fold runs opacity alone (no height tween, no
 *    padding run), the scroll stands still while it fades and is placed at
 *    once where it lands, and focus still moves.
 * 7. A several-pick card (its own page): two options picked, Done by
 *    pointer flies each chosen option's keycap and label from its own chip
 *    to its own place in the head on the fold's clock, each source hidden
 *    while its copy flies.
 *
 *   bun scripts/probe-kit/run.ts web decision-pick
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import type { Page } from "playwright-core";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import { Clock } from "../../anim";
import { CAWCO_BRIDGE, startDecisionStage } from "../../decision-embeds";
import { type Kit, type Spec, settle } from "../../kit";

const NAME = "pick";
const LONG = Array.from({ length: 9 }, (_, i) => `S${i}[Step ${i + 1}]`).join(
  " --> "
);
const PROGRAM = [
  `root = Decisions("Shape the launch", [path, look, radius])`,
  `path = Decision("path", "Which path does a reader take to sign up?", [direct, docs], "Fewer steps convert better.", [flow1])`,
  `direct = Option("direct", "Straight to sign up", "Visit, read, sign up.", true, [], "Readers who want details leave.")`,
  `docs = Option("docs", "Through the docs", "Visit, docs, try, sign up.", false, [], "Two more steps.")`,
  `flow1 = Diagram("flowchart TD\\n${LONG}", "The long path")`,
  `look = Decision("look", "Which card goes beside the ledger?", [card, pin], "The week's spend is what a person checks.", [flow2])`,
  `card = Option("card", "The side card", "The week's spend in its own card.", true, [], "It takes 360px.")`,
  `pin = Option("pin", "The note", "Only the pinned note.", false, [], "The spend is a click away.")`,
  `flow2 = Diagram("flowchart TD\\n${LONG}", "Where it stands")`,
  `radius = Decision("radius", "How round are the cards?", [soft, sharp], "Softer reads friendlier on paper.")`,
  `soft = Option("soft", "Soft", "16px corners.", true, [], "Less room at the corners.")`,
  `sharp = Option("sharp", "Sharp", "8px corners.", false, [], "Reads colder.")`,
].join("\n");

/** A several-pick card, on a page of its own: its picks fly to the head together. */
const MANY = "many";
const MANY_PROGRAM = [
  `root = Decisions("Reach", [reach, after])`,
  `reach = Decision("reach", "Where does the launch reach people?", [mail, feed, talk], "Each reaches a different reader.", [], [], true)`,
  `mail = Option("mail", "The newsletter", "Every subscriber, once.", true, [], "One more thing to write each week.")`,
  `feed = Option("feed", "The feed", "Readers who follow along.", false, [], "It scrolls past in a day.")`,
  `talk = Option("talk", "A talk", "The room, live.", false, [], "One evening of preparing.")`,
  `after = Decision("after", "Who answers replies?", [owner, team], "Replies need a person.")`,
  `owner = Option("owner", "The owner", "One voice.", true, [], "Slower on busy weeks.")`,
  `team = Option("team", "The team", "Faster replies.", false, [], "Many voices.")`,
].join("\n");

/** --ease-crossfade as the engine writes it. */
const CROSSFADE = "cubic-bezier(0.42, 0, 0.58, 1)";
/** L690's lurch: the most of its trip one frame may move. */
const EIGHTH = 0.125;
/** --ease-out as the engine writes it. */
const OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const LEGS = [
  { view: "desk", theme: "light", label: "1440 light" },
  { view: "phone", theme: "dark", label: "390 dark (coarse)" },
] as const;

/** A token's colour as the page computes it. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);

/** A token's length in ms. */
const tokenMs = (page: Page, token: string) =>
  page.evaluate((name) => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    const value = Number.parseFloat(raw);
    return raw.endsWith("ms") ? value : value * 1000;
  }, token);

/** The chip `option` of card `id` as drawn: its edge, fill and keycap. */
const chipOf = (page: Page, id: string, option: string) =>
  page.evaluate(
    ([card, value]) => {
      const chip = document.querySelector<HTMLElement>(
        `#decision-${card} [data-option="${value}"]`
      );
      const cap = chip?.querySelector(".dp-kc");
      return {
        edge: chip ? getComputedStyle(chip).borderTopColor : "",
        fill: chip ? getComputedStyle(chip).backgroundColor : "",
        keycap: cap ? getComputedStyle(cap).backgroundColor : "",
      };
    },
    [id, option] as const
  );

/** Card `id` and the page's scroll as drawn now, with its fold's progress on its curve. */
const foldOf = (page: Page, id: string) =>
  page.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    const body = root?.querySelector<HTMLElement>(".dp-body");
    const run = body?.getAnimations()[0];
    return {
      card: Math.round((root?.getBoundingClientRect().height ?? 0) * 10) / 10,
      body: Math.round((body?.getBoundingClientRect().height ?? 0) * 10) / 10,
      opacity: body ? Number(getComputedStyle(body).opacity) : -1,
      padding: root ? getComputedStyle(root).paddingBlockStart : "",
      scroll: Math.round(scrollY * 10) / 10,
      progress: run?.effect?.getComputedTiming().progress ?? null,
      keyframes: run
        ? [
            ...new Set(
              (run.effect as KeyframeEffect)
                .getKeyframes()
                .flatMap((frame) =>
                  Object.keys(frame).filter(
                    (key) =>
                      ![
                        "offset",
                        "computedOffset",
                        "easing",
                        "composite",
                      ].includes(key)
                  )
                )
            ),
          ].sort()
        : [],
      decided: !!root?.hasAttribute("data-decided"),
    };
  }, id);

/** A box on screen, rounded to a tenth of a pixel. */
interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/**
 * The flight of option `option` of card `id`: its keycap and label run on
 * the decided line (the copy), the run in its chip (the source), whether
 * the source is hidden, and the copy's own transform.
 */
const flightOf = (page: Page, id: string, option: string) =>
  page.evaluate(
    ([card, value]) => {
      const root = document.getElementById(`decision-${card}`);
      const box = (el: Element | null | undefined) => {
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        const t = (n: number) => Math.round(n * 10) / 10;
        return { x: t(r.left), y: t(r.top), w: t(r.width), h: t(r.height) };
      };
      const chip = root?.querySelector<HTMLElement>(
        `header [data-pick="${value}"]`
      );
      const source = root?.querySelector<HTMLElement>(
        `[data-option="${value}"] > b`
      );
      return {
        copy: box(chip?.querySelector("b")),
        source: box(source),
        sourceHidden: source
          ? getComputedStyle(source).visibility === "hidden"
          : false,
        transform: chip ? getComputedStyle(chip).transform : "",
        header: box(root?.querySelector("header")),
      };
    },
    [id, option] as const
  );

/**
 * Every element in card `id`'s head with words of its own, and the ones
 * whose ink is a brand colour (DESIGN.md L580: coral marks the chosen
 * option, never words about it).
 */
const brandWordsIn = (page: Page, id: string) =>
  page.evaluate((card) => {
    const inks = new Set(
      ["--brand-ink", "--brand-solid", "--brand-ink-strong", "--link-ink"].map(
        (token) => {
          const probe = document.createElement("i");
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const colour = getComputedStyle(probe).color;
          probe.remove();
          return colour;
        }
      )
    );
    const head = document.querySelector(`#decision-${card} header`);
    const worded = [...(head?.querySelectorAll<HTMLElement>("*") ?? [])].filter(
      (el) =>
        [...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        )
    );
    return {
      words: worded.length,
      brand: worded
        .filter((el) => inks.has(getComputedStyle(el).color))
        .map((el) => `${el.className}: ${el.textContent?.trim()}`),
    };
  }, id);

/** Whether `a` and `b` stand on one place, within `px`. */
const near = (a: Box | null, b: Box | null, px = 1.5) =>
  !!a && !!b && Math.abs(a.x - b.x) <= px && Math.abs(a.y - b.y) <= px;

/** Where focus stands: the card and option it is on, or Send. */
const focusOf = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      card:
        active?.closest<HTMLElement>("[data-cawco-choice]")?.dataset
          .cawcoChoice ?? "",
      option: active?.dataset.option ?? "",
      send: !!active?.matches(".dp-send"),
    };
  });

/** Brings option `option` of card `id` to the window's middle, as a person scrolls to it. */
const toOption = async (page: Page, id: string, option: string) => {
  await page.evaluate(
    ([card, value]) =>
      document
        .querySelector(`#decision-${card} [data-option="${value}"]`)
        ?.scrollIntoView({ block: "center" }),
    [id, option] as const
  );
  await settle(page, 200);
};

/** One frame of a live pick, as the page drew it. */
interface LiveFrame {
  /** The card's height. */
  card: number;
  /** The most the page could scroll then. */
  most: number;
  /** The fold's progress on its curve, null before it starts. */
  p: number | null;
  scroll: number;
  /** The frame's time, ms. */
  t: number;
}

/** A long task or long animation frame the page reported, and what ran in it. */
interface LongWork {
  blocking: number;
  duration: number;
  kind: string;
  scripts: string[];
  start: number;
}

/**
 * Picks `option` of card `id` with the page played live, and answers every
 * frame from the press until the fold lands (its time, the scroll, the most
 * the page could scroll, the card's height, the fold's progress), the long
 * tasks and long animation frames the page reported meanwhile, when the
 * fold started, and where focus went.
 */
async function liveFold(page: Page, id: string, option: string) {
  await toOption(page, id, option);
  await page.evaluate((card) => {
    const frames: LiveFrame[] = [];
    const long: LongWork[] = [];
    const held = window as unknown as {
      kitFoldAt?: number;
      kitFrames?: LiveFrame[];
      kitLong?: LongWork[];
      kitPressAt?: number;
    };
    held.kitFrames = frames;
    held.kitLong = long;
    held.kitPressAt = undefined;
    held.kitFoldAt = undefined;
    const watch = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const loaf = entry as PerformanceEntry & {
          blockingDuration?: number;
          scripts?: {
            duration: number;
            invoker: string;
            sourceFunctionName: string;
          }[];
        };
        long.push({
          kind: entry.entryType,
          start: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
          blocking: Math.round(loaf.blockingDuration ?? 0),
          scripts: (loaf.scripts ?? []).map(
            (s) =>
              `${s.invoker} ${s.sourceFunctionName} ${Math.round(s.duration)}ms`
          ),
        });
      }
    });
    for (const type of ["long-animation-frame", "longtask"]) {
      try {
        watch.observe({ type, buffered: false });
      } catch {
        // An engine without the entry type reports none.
      }
    }
    addEventListener(
      "click",
      () => {
        held.kitPressAt = performance.now();
      },
      { capture: true, once: true }
    );
    const root = document.getElementById(`decision-${card}`);
    const turn = new MutationObserver(() => {
      if (root?.hasAttribute("data-decided")) {
        held.kitFoldAt = performance.now();
        turn.disconnect();
      }
    });
    if (root) {
      turn.observe(root, { attributeFilter: ["data-decided"] });
    }
    // Each frame as it is painted: a ResizeObserver runs after the frame's
    // animation callbacks and layout (the ride's scroll written, the fold's
    // height laid out), every frame the card changes size, and once as it
    // starts watching (the page at rest).
    const scroller = document.scrollingElement as Element;
    const sized = new ResizeObserver(() => {
      const body = root?.querySelector<HTMLElement>(".dp-body");
      const run = body?.getAnimations()[0];
      frames.push({
        t: Math.round(Number(document.timeline.currentTime) * 10) / 10,
        scroll: scroller.scrollTop,
        most: scroller.scrollHeight - scroller.clientHeight,
        card: Math.round((root?.getBoundingClientRect().height ?? 0) * 10) / 10,
        p: run?.effect?.getComputedTiming().progress ?? null,
      });
    });
    if (root) {
      sized.observe(root);
    }
    (window as unknown as { kitStop?: () => void }).kitStop = () => {
      sized.disconnect();
      watch.disconnect();
    };
  }, id);
  await page.locator(`#decision-${id} [data-option="${option}"]`).click();
  await page.waitForFunction(
    (card) => {
      const root = document.getElementById(`decision-${card}`);
      return (
        root?.hasAttribute("data-decided") &&
        root.querySelector(".dp-body")?.getAnimations().length === 0
      );
    },
    id,
    { timeout: 10_000 }
  );
  await settle(page, 200);
  const { frames, long, foldAt, pressAt } = await page.evaluate(() => {
    const held = window as unknown as {
      kitFoldAt?: number;
      kitFrames: LiveFrame[];
      kitLong: LongWork[];
      kitPressAt?: number;
      kitStop: () => void;
    };
    held.kitStop();
    return {
      frames: held.kitFrames,
      long: held.kitLong,
      foldAt: held.kitFoldAt ?? null,
      pressAt: held.kitPressAt ?? null,
    };
  });
  return {
    scrolls: frames.map((frame) => frame.scroll),
    frames,
    long,
    foldAt: foldAt === null ? null : Math.round(foldAt),
    pressAt: pressAt === null ? null : Math.round(pressAt),
    foldAfter:
      foldAt !== null && pressAt !== null ? Math.round(foldAt - pressAt) : null,
    focus: await focusOf(page),
  };
}

/**
 * A live pick's frames from the fold's start: each frame's step in the
 * scroll and the card's height, as a share of each one's whole trip.
 */
const stepsOf = (frames: LiveFrame[]) => {
  const at = frames.findIndex((frame) => frame.p !== null);
  const from = frames[Math.max(0, at - 1)];
  const run = at < 0 ? [] : frames.slice(at - 1);
  const last = frames.at(-1);
  const scrollTrip = Math.abs((last?.scroll ?? 0) - (from?.scroll ?? 0)) || 1;
  const cardTrip = Math.abs((last?.card ?? 0) - (from?.card ?? 0)) || 1;
  const steps = run.slice(1).map((frame, i) => {
    const was = run[i] as LiveFrame;
    return {
      t: Math.round((frame.t - (from?.t ?? 0)) * 10) / 10,
      scroll: Math.round((frame.scroll - was.scroll) * 10) / 10,
      scrollShare:
        Math.round((Math.abs(frame.scroll - was.scroll) / scrollTrip) * 1000) /
        1000,
      card: Math.round((frame.card - was.card) * 10) / 10,
      cardShare:
        Math.round((Math.abs(frame.card - was.card) / cardTrip) * 1000) / 1000,
      most: frame.most,
      p: frame.p === null ? null : Math.round(frame.p * 1000) / 1000,
    };
  });
  return {
    scrollTrip,
    cardTrip,
    steps,
    worst: Math.max(
      0,
      ...steps.map((step) => Math.max(step.scrollShare, step.cardShare))
    ),
  };
};

/** Card `id` on the frame after a key: its runs, its height, the scroll and where the fold's landing would put it, and focus. */
const nextFrameOf = (page: Page, id: string) =>
  page.evaluate(
    (card) =>
      new Promise<{
        body: number;
        card: number;
        decided: boolean;
        edge: string;
        runs: string[];
        scroll: number;
        target: number;
      }>((done) =>
        requestAnimationFrame(() => {
          const root = document.getElementById(`decision-${card}`);
          const scroller = document.scrollingElement as Element;
          const chip = root?.querySelector<HTMLElement>("[data-cawco-picked]");
          const top =
            (root?.getBoundingClientRect().top ?? 0) +
            scroller.scrollTop -
            (root
              ? Number.parseFloat(getComputedStyle(root).scrollMarginTop) || 0
              : 0);
          const most = scroller.scrollHeight - scroller.clientHeight;
          done({
            runs: (root?.getAnimations({ subtree: true }) ?? []).map(
              (run) =>
                `${run.constructor.name} ${(run as CSSTransition).transitionProperty ?? run.id}`
            ),
            card:
              Math.round((root?.getBoundingClientRect().height ?? 0) * 10) / 10,
            body:
              Math.round(
                (root?.querySelector(".dp-body")?.getBoundingClientRect()
                  .height ?? 0) * 10
              ) / 10,
            decided: !!root?.hasAttribute("data-decided"),
            edge: chip ? getComputedStyle(chip).borderTopColor : "",
            scroll: Math.round(scroller.scrollTop * 10) / 10,
            target: Math.round(Math.min(Math.max(0, top), most) * 10) / 10,
          });
        })
      ),
    id
  );

/**
 * The held clock scrubbed frame by frame, 0 to 1 in 1/60s steps of its `ms`:
 * card `id`'s height and the page's scroll at each, and each frame's step as
 * a share of its whole trip.
 */
async function scrubFrames(page: Page, clock: Clock, id: string, ms: number) {
  const reads: { card: number; scroll: number; t: number }[] = [];
  const count = Math.ceil(ms / (1000 / 60));
  for (let k = 0; k <= count; k += 1) {
    const t = Math.min(ms, (k * 1000) / 60);
    await clock.seek(t / ms);
    const read = await foldOf(page, id);
    reads.push({
      t: Math.round(t * 10) / 10,
      card: read.card,
      scroll: read.scroll,
    });
  }
  const [first] = reads;
  const last = reads.at(-1);
  const scrollTrip = Math.abs((last?.scroll ?? 0) - (first?.scroll ?? 0)) || 1;
  const cardTrip = Math.abs((last?.card ?? 0) - (first?.card ?? 0)) || 1;
  const steps = reads.slice(1).map((read, i) => {
    const was = reads[i] as (typeof reads)[number];
    return {
      t: read.t,
      scroll: Math.round((read.scroll - was.scroll) * 10) / 10,
      scrollShare:
        Math.round((Math.abs(read.scroll - was.scroll) / scrollTrip) * 1000) /
        1000,
      card: Math.round((read.card - was.card) * 10) / 10,
      cardShare:
        Math.round((Math.abs(read.card - was.card) / cardTrip) * 1000) / 1000,
    };
  });
  return {
    scrollTrip,
    cardTrip,
    steps,
    worst: Math.max(
      0,
      ...steps.map((step) => Math.max(step.scrollShare, step.cardShare))
    ),
  };
}

/** Whether a run of scroll readings only ever moves one way. */
const oneWay = (scrolls: number[]) => {
  const steps = scrolls.slice(1).map((y, i) => y - (scrolls[i] ?? y));
  return steps.every((d) => d >= -0.5) || steps.every((d) => d <= 0.5);
};

async function leg(
  kit: Kit,
  url: string,
  view: (typeof LEGS)[number]["view"],
  theme: (typeof LEGS)[number]["theme"],
  label: string
) {
  const page = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 300)));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll(".diagram svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 600);
  const clock = await Clock.on(page);
  const control = await tokenMs(page, "--dur-control");
  const settleMs = await tokenMs(page, "--dur-settle");
  const edge = await tokenColour(page, "--brand-solid");
  const keycap = await tokenColour(page, "--chip-chosen-bg");

  // 1. Chosen where it stands.
  await toOption(page, "path", "direct");
  const open = await foldOf(page, "path");
  const chosenRuns = await clock.catchRuns(
    () => page.locator('#decision-path [data-option="direct"]').click(),
    '#decision-path [data-option="direct"]'
  );
  const chip: Record<string, Awaited<ReturnType<typeof chipOf>>> = {};
  for (const at of [0, 0.5, 1]) {
    await clock.seek(at);
    chip[String(at)] = await chipOf(page, "path", "direct");
  }
  const chosenClock = clock.oneClock();
  // The chosen colour stands held at its end: the card waits on it.
  const before = await foldOf(page, "path");
  kit.check(
    `${label}: the pressed option turns chosen where it stands, its edge, fill and keycap over --dur-control on ease-out, landing on brand-solid and chip-chosen-bg, the card open until that colour lands`,
    chosenRuns.length > 0 &&
      chosenRuns.every(
        (run) => Math.abs(run.end - control) < 1 && run.easing === OUT
      ) &&
      chosenClock.faults.length === 0 &&
      chip["1"]?.edge === edge &&
      chip["1"]?.keycap === keycap &&
      chip["0"]?.keycap !== keycap &&
      !before.decided,
    JSON.stringify({
      runs: chosenRuns.map((r) => `${r.type} ${r.name} ${r.end}ms ${r.easing}`),
      chip,
      edge,
      keycap,
      chosenClock,
      decidedWhileHeld: before.decided,
    })
  );

  // 2. The colour lands (its own runs played to their end), and the fold
  // starts on one clock with the chosen option's flight and the scroll.
  const sourceBefore = (await flightOf(page, "path", "direct")).source;
  const inkHeld = await brandWordsIn(page, "path");
  const foldRuns = await clock
    .catchRuns(
      async () => {
        await clock.playOn(chosenRuns);
        await page.waitForFunction(
          () =>
            document
              .getElementById("decision-path")
              ?.hasAttribute("data-decided"),
          undefined,
          { timeout: 5000 }
        );
      },
      "#decision-path",
      5000
    )
    .catch((error: Error) => {
      throw new Error(
        `${error.message}; the card then ${JSON.stringify(before)}; the page said: ${errors.join(" | ") || "nothing"}`
      );
    });
  const fold: Record<string, Awaited<ReturnType<typeof foldOf>>> = {};
  const flight: Record<string, Awaited<ReturnType<typeof flightOf>>> = {};
  for (const at of [0, 0.5, 1]) {
    await clock.seek(at);
    fold[String(at)] = await foldOf(page, "path");
    flight[String(at)] = await flightOf(page, "path", "direct");
  }
  const inkDecided = await brandWordsIn(page, "path");
  const half = fold["0.5"];
  const ridden =
    half && fold["0"] && fold["1"] && half.progress !== null
      ? fold["0"].scroll + (fold["1"].scroll - fold["0"].scroll) * half.progress
      : Number.NaN;
  // One clock: the body's fold, the card's padding and the option's flight
  // (the Web Animations), one start, length and curve; the state line's
  // fade (a CSS transition, --dur-exit) leaves its slot from that start.
  const webs = foldRuns.filter((run) => run.type === "WebAnimation");
  const [lead] = webs;
  const stateFade = foldRuns.find(
    (run) => run.type === "CSSTransition" && run.name === "opacity"
  );
  const exit = await tokenMs(page, "--dur-exit");
  const what = (r: (typeof foldRuns)[number]) =>
    `${r.type} ${r.name || "(web)"} start ${r.start} ${r.end}ms ${r.easing}`;
  kit.check(
    `${label}: the fold is one clock, --dur-settle (${settleMs}ms) on --ease-crossfade: the body's height, margin and opacity, the card's padding and the chosen option's flight start together, and the state line leaves its slot from that start over --dur-exit`,
    webs.length === 3 &&
      !!lead &&
      webs.every(
        (run) =>
          run.start !== null &&
          lead.start !== null &&
          Math.abs(run.start - lead.start) <= 0.5 &&
          Math.abs(run.end - settleMs) < 1 &&
          run.easing === CROSSFADE
      ) &&
      webs.some((run) => run.name === "share-flight") &&
      !!stateFade &&
      stateFade.start !== null &&
      lead.start !== null &&
      Math.abs(stateFade.start - lead.start) <= 0.5 &&
      Math.abs(stateFade.end - exit) < 1,
    JSON.stringify({ runs: foldRuns.map(what) })
  );
  kit.check(
    `${label}: the chosen option's keycap and label fly from its chip to the head on that clock (L485): at 0 on the chip, at ½ on its way, at 1 at rest in the head; its chip's run hidden while it flies`,
    near(flight["0"]?.copy ?? null, sourceBefore) &&
      !!flight["0.5"]?.copy &&
      !!flight["0"]?.copy &&
      !!flight["1"]?.copy &&
      Math.abs(flight["0.5"].copy.y - flight["0"].copy.y) > 1 &&
      Math.abs(flight["0.5"].copy.y - flight["1"].copy.y) > 0.5 &&
      flight["1"].transform === "none" &&
      !!flight["1"].header &&
      flight["1"].copy.y >= flight["1"].header.y - 0.5 &&
      flight["1"].copy.y + flight["1"].copy.h <=
        flight["1"].header.y + flight["1"].header.h + 0.5 &&
      !!flight["0"]?.sourceHidden &&
      !!flight["0.5"]?.sourceHidden,
    JSON.stringify({ sourceBefore, flight })
  );
  kit.check(
    `${label}: no words in the card's head are in a brand ink, held chosen and decided (L580)`,
    inkHeld.brand.length === 0 &&
      inkDecided.brand.length === 0 &&
      inkDecided.words > 0,
    JSON.stringify({ inkHeld, inkDecided })
  );
  kit.check(
    `${label}: the card folds from its open height to its decided line (0, ½, 1)`,
    !!fold["0"] &&
      !!fold["1"] &&
      !!half &&
      Math.abs(fold["0"].card - open.card) < 1.5 &&
      half.card < fold["0"].card &&
      half.card > fold["1"].card &&
      fold["1"].body < 0.5 &&
      fold["1"].opacity < 0.01 &&
      fold["1"].card < 120,
    JSON.stringify({ open: open.card, fold })
  );
  kit.check(
    `${label}: the scroll rides the fold's clock: at 0 where it stood (no jump on the fold's frame), at ½ the fold's eased share of the way, at 1 where it lands`,
    !!fold["0"] &&
      !!fold["1"] &&
      Math.abs(fold["0"].scroll - before.scroll) < 1 &&
      Math.abs(fold["1"].scroll - fold["0"].scroll) > 20 &&
      Math.abs((half?.scroll ?? Number.NaN) - ridden) <= 1,
    JSON.stringify({
      before: before.scroll,
      at0: fold["0"]?.scroll,
      atHalf: half?.scroll,
      progress: half?.progress,
      expected: ridden,
      at1: fold["1"]?.scroll,
    })
  );

  // The pass measure: no frame of the clock carries more than an eighth of
  // the scroll's trip or the card's height's.
  const scrubbed = await scrubFrames(page, clock, "path", settleMs);
  kit.check(
    `${label}: scrubbed frame by frame (1/60s, 0 to 1), no frame moves the scroll or the card's height more than an eighth of its trip (L690)`,
    scrubbed.steps.length > 0 && scrubbed.worst <= EIGHTH,
    JSON.stringify(scrubbed)
  );

  // 4. Change at ½ turns it back from the height drawn there.
  await clock.seek(0.5);
  const drawn = await foldOf(page, "path");
  const backRuns = await clock.catchRuns(
    () => page.locator("#decision-path .dp-change").click(),
    "#decision-path"
  );
  const back: Record<string, Awaited<ReturnType<typeof foldOf>>> = {};
  for (const at of [0, 1]) {
    await clock.seek(at);
    back[String(at)] = await foldOf(page, "path");
  }
  await clock.release();
  await settle(page, 400);
  const backFocus = await focusOf(page);
  kit.check(
    `${label}: Change at ½ turns the fold back from the height drawn there, open over --dur-settle on --ease-crossfade, the head's chip closing back into its option on that clock, focus on the pick`,
    !!back["0"] &&
      !!back["1"] &&
      Math.abs(back["0"].card - drawn.card) < 1.5 &&
      Math.abs(back["1"].body - open.body) < 1.5 &&
      backRuns.filter(
        (run) =>
          run.type === "WebAnimation" &&
          Math.abs(run.end - settleMs) < 1 &&
          run.easing === CROSSFADE
      ).length >= 3 &&
      backFocus.card === "path" &&
      backFocus.option === "direct",
    JSON.stringify({
      drawn: drawn.body,
      open: open.body,
      back,
      runs: backRuns.map((r) => `${r.type} ${r.name} ${r.end}ms ${r.easing}`),
      backFocus,
    })
  );

  // 5. Played live: the scroll only moves on its way, focus goes on.
  const look = await liveFold(page, "look", "card");
  kit.check(
    `${label}: a pick played live folds its card once its chosen colour has landed (--dur-control, ${control}ms, after the press, and no longer), moves the scroll one way only, and focus lands on the next open card's first option`,
    look.foldAfter !== null &&
      look.foldAfter >= control - 5 &&
      look.foldAfter <= control + 60 &&
      oneWay(look.scrolls) &&
      look.focus.card === "radius" &&
      look.focus.option === "soft",
    JSON.stringify({
      foldAfter: look.foldAfter,
      foldAt: look.foldAt,
      pressAt: look.pressAt,
      focus: look.focus,
      long: look.long,
      live: stepsOf(look.frames),
      frames: look.frames.slice(0, 40),
    })
  );
  const radius = await liveFold(page, "radius", "soft");
  kit.check(
    `${label}: past the last card, focus goes to the first open card above it`,
    oneWay(radius.scrolls) &&
      radius.focus.card === "path" &&
      radius.focus.option === "direct",
    JSON.stringify(radius)
  );
  const last = await liveFold(page, "path", "docs");
  kit.check(
    `${label}: with no open card left, focus goes to Send`,
    oneWay(last.scrolls) && last.focus.send,
    JSON.stringify(last)
  );
  await page.close();
}

/** 5. From the keyboard: everything in one frame. */
async function keyLeg(
  kit: Kit,
  url: string,
  view: (typeof LEGS)[number]["view"],
  theme: (typeof LEGS)[number]["theme"],
  label: string
) {
  const keys = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
  await keys.goto(url, { waitUntil: "load" });
  await keys.waitForFunction(
    () => document.querySelectorAll(".diagram svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(keys, 600);
  const edge = await tokenColour(keys, "--brand-solid");
  await toOption(keys, "path", "direct");
  const keyOpen = await foldOf(keys, "path");
  await keys.locator('#decision-path [data-option="direct"]').focus();
  await keys.keyboard.press("Enter");
  const keyPick = await nextFrameOf(keys, "path");
  const keyFocus = await focusOf(keys);
  kit.check(
    `${label}: Enter on an option lands it on the next frame: no animation under the card, its chosen colour, the card at its decided line, the scroll at the fold's landing, focus on the next open card's first option`,
    keyPick.runs.length === 0 &&
      keyPick.decided &&
      keyPick.edge === edge &&
      keyPick.body < 0.5 &&
      keyPick.card < 120 &&
      Math.abs(keyPick.scroll - keyPick.target) <= 1 &&
      Math.abs(keyPick.scroll - keyOpen.scroll) > 20 &&
      keyFocus.card === "look" &&
      keyFocus.option === "card",
    JSON.stringify({ before: keyOpen.scroll, keyPick, keyFocus })
  );
  await keys.locator("#decision-path .dp-change").focus();
  await keys.keyboard.press("Enter");
  const keyBack = await nextFrameOf(keys, "path");
  const keyBackFocus = await focusOf(keys);
  kit.check(
    `${label}: Enter on Change opens the card on the next frame, no animation under it, focus on the pick`,
    keyBack.runs.length === 0 &&
      !keyBack.decided &&
      Math.abs(keyBack.body - keyOpen.body) < 1.5 &&
      keyBackFocus.card === "path" &&
      keyBackFocus.option === "direct",
    JSON.stringify({ open: keyOpen.body, keyBack, keyBackFocus })
  );
  // Space picks too: the other option, from the reopened card.
  await keys.locator('#decision-path [data-option="docs"]').focus();
  await keys.keyboard.press(" ");
  const spacePick = await nextFrameOf(keys, "path");
  const spaceFocus = await focusOf(keys);
  const spaceChips = await keys.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>("#decision-path [data-pick]"),
    ].map((one) => one.dataset.pick ?? "")
  );
  kit.check(
    `${label}: Space on an option lands it on the next frame the same way: no animation under the card, the card at its decided line with that option's chip, the scroll at the fold's landing, focus on the next open card's first option`,
    spacePick.runs.length === 0 &&
      spacePick.decided &&
      spacePick.body < 0.5 &&
      JSON.stringify(spaceChips) === '["docs"]' &&
      Math.abs(spacePick.scroll - spacePick.target) <= 1 &&
      spaceFocus.card === "look" &&
      spaceFocus.option === "card",
    JSON.stringify({ spacePick, spaceChips, spaceFocus })
  );
  await keys.close();
}

/** 7. A several-pick card: each chosen option flies to its own place in the head. */
async function manyLeg(
  kit: Kit,
  url: string,
  view: (typeof LEGS)[number]["view"],
  theme: (typeof LEGS)[number]["theme"],
  label: string
) {
  const page = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("#decision-reach", { timeout: 30_000 });
  await settle(page, 400);
  const settleMs = await tokenMs(page, "--dur-settle");
  const picked = ["mail", "feed"] as const;
  for (const option of picked) {
    await page.locator(`#decision-reach [data-option="${option}"]`).click();
    await settle(page, 300);
  }
  const sources = Object.fromEntries(
    await Promise.all(
      picked.map(
        async (option) =>
          [option, (await flightOf(page, "reach", option)).source] as const
      )
    )
  );
  const clock = await Clock.on(page);
  const runs = await clock.catchRuns(
    () => page.locator("#decision-reach .dp-change").click(),
    "#decision-reach"
  );
  const seen: Record<
    string,
    Record<string, Awaited<ReturnType<typeof flightOf>>>
  > = {};
  for (const at of [0, 0.5, 1]) {
    await clock.seek(at);
    for (const option of picked) {
      seen[option] ??= {};
      (seen[option] as Record<string, Awaited<ReturnType<typeof flightOf>>>)[
        String(at)
      ] = await flightOf(page, "reach", option);
    }
  }
  await clock.release();
  const webs = runs.filter((run) => run.type === "WebAnimation");
  const [lead] = webs;
  const flights = webs.filter((run) => run.name === "share-flight");
  const oneClock =
    !!lead &&
    webs.every(
      (run) =>
        run.start !== null &&
        lead.start !== null &&
        Math.abs(run.start - lead.start) <= 0.5 &&
        Math.abs(run.end - settleMs) < 1 &&
        run.easing === CROSSFADE
    );
  const each = picked.map((option) => {
    const at = seen[option] ?? {};
    return {
      option,
      fromItsRun: near(at["0"]?.copy ?? null, sources[option] ?? null),
      landed: at["1"]?.transform === "none",
      hidden: !!at["0"]?.sourceHidden && !!at["0.5"]?.sourceHidden,
      rest: at["1"]?.copy ?? null,
    };
  });
  const [one, two] = each;
  kit.check(
    `${label}: a several-pick card's Done flies each chosen option from its own chip to its own place in the head, on the fold's one clock (--dur-settle on --ease-crossfade), each source hidden while its copy flies`,
    flights.length === picked.length &&
      oneClock &&
      each.every(
        (option) => option.fromItsRun && option.landed && option.hidden
      ) &&
      !!one?.rest &&
      !!two?.rest &&
      !near(one.rest, two.rest, 1),
    JSON.stringify({
      runs: runs.map(
        (r) =>
          `${r.type} ${r.name || "(web)"} start ${r.start} ${r.end}ms ${r.easing}`
      ),
      sources,
      each,
      seen,
    })
  );
  await page.close();
}

/** 6. Reduced motion. */
async function stillLeg(
  kit: Kit,
  url: string,
  view: (typeof LEGS)[number]["view"],
  theme: (typeof LEGS)[number]["theme"],
  label: string
) {
  const still = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
  await still.emulateMedia({ reducedMotion: "reduce" });
  await still.goto(url, { waitUntil: "load" });
  await still.waitForFunction(
    () => document.querySelectorAll(".diagram svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(still, 600);
  const stillClock = await Clock.on(still);
  await toOption(still, "path", "direct");
  // The chosen colour still fades (a colour change, L517): caught as the
  // press starts it, then let play on, so the fold it waits for is caught.
  const stillChosen = await stillClock.catchRuns(
    () => still.locator('#decision-path [data-option="direct"]').click(),
    '#decision-path [data-option="direct"]'
  );
  const stillOpen = await foldOf(still, "path");
  const stillRuns = await stillClock.catchRuns(
    async () => {
      await stillClock.playOn(stillChosen);
      await still.waitForFunction(
        () =>
          document
            .getElementById("decision-path")
            ?.hasAttribute("data-decided"),
        undefined,
        { timeout: 5000 }
      );
    },
    "#decision-path",
    5000
  );
  const faded: Record<string, Awaited<ReturnType<typeof foldOf>>> = {};
  for (const at of [0, 0.5]) {
    await stillClock.seek(at);
    faded[String(at)] = await foldOf(still, "path");
  }
  await stillClock.release();
  await still.waitForFunction(
    () =>
      document.querySelector("#decision-path .dp-body")?.getAnimations()
        .length === 0,
    undefined,
    { timeout: 5000 }
  );
  await settle(still, 200);
  const landed = await foldOf(still, "path");
  const stillFocus = await focusOf(still);
  kit.check(
    `${label} reduced motion: the fold is opacity alone (no height tween, no padding run), the scroll still while it fades and placed at once where it lands, focus on the next card`,
    stillRuns.filter((run) => run.type === "WebAnimation").length === 1 &&
      JSON.stringify(
        faded["0"]?.keyframes.filter((key) => key !== "overflow")
      ) === '["opacity"]' &&
      Math.abs((faded["0.5"]?.body ?? 0) - stillOpen.body) < 1.5 &&
      (faded["0.5"]?.opacity ?? 1) < 1 &&
      Math.abs((faded["0.5"]?.scroll ?? 0) - stillOpen.scroll) < 1 &&
      landed.body < 0.5 &&
      Math.abs(landed.scroll - stillOpen.scroll) > 20 &&
      stillFocus.card === "look" &&
      stillFocus.option === "card",
    JSON.stringify({
      runs: stillRuns.map((r) => `${r.type} ${r.name} ${r.end}ms`),
      open: { body: stillOpen.body, scroll: stillOpen.scroll },
      faded,
      landed: { body: landed.body, scroll: landed.scroll },
      stillFocus,
    })
  );
  await still.close();
}

const spec: Spec = {
  name: "decision-pick",
  run: async (kit: Kit) => {
    for (const program of [PROGRAM, MANY_PROGRAM]) {
      let refusal = "";
      try {
        checkProgram(program);
      } catch (error) {
        refusal = (error as Error).message;
      }
      kit.check(
        `the hub's check keeps the program (${program.slice(0, 40)}…)`,
        refusal === "",
        refusal
      );
    }
    const stage = await startDecisionStage(
      new Map([
        [NAME, PROGRAM],
        [MANY, MANY_PROGRAM],
      ]),
      {}
    );
    try {
      for (const { view, theme, label } of LEGS) {
        const url = stage.pageUrl(NAME, theme);
        await leg(kit, url, view, theme, label);
        await keyLeg(kit, url, view, theme, label);
        await stillLeg(kit, url, view, theme, label);
        await manyLeg(kit, stage.pageUrl(MANY, theme), view, theme, label);
      }
    } finally {
      await stage.stop();
    }
  },
};

export default spec;
