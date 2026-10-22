/**
 * A decision page's pick, read from the engine as the person makes it
 * (DESIGN.md, The Stay In Context Rule; the owner: "highlighting the answe
 * and ransitioning the screen to the next"), on the hub's decision host with
 * no hub (decision-embeds.ts `startDecisionStage`, the overlay's own pick on
 * the stand-in bridge). A page of three cards: `path` and `look` tall (a
 * long top-down diagram each), `radius` short.
 *
 * A pick selects and waits for Continue (the owner: "follow the pattern of
 * waiting for a continue press"). At 1440×900 light (a mouse's clicks) and
 * 390×844 dark under a finger (real taps, `locator.tap()`), each on the
 * clock (anim.ts `Clock`, the DevTools Animation domain):
 * 1. The pressed option shows chosen where it stands and the card stays
 *    open, no fold run: its edge, fill and keycap change over --dur-control
 *    on ease-out, landing on `brand-solid` and `chip-chosen-bg` (L905, L540).
 *    Continue grows out of the card's foot on the card's own height tween
 *    (motion/morph, --dur-morph on the drawer curve), its fade on that
 *    clock, read at 0, ½ and 1. The live region says "Picked <option>". A
 *    press on the chosen option keeps it.
 * 2. Continue folds the card: the body's height, margin and opacity, the
 *    card's padding and the chosen option's flight on one clock (one start
 *    time, duration and easing: --dur-settle on --ease-crossfade,
 *    page-length travel by L690), read at 0, ½ and 1: the card from its open
 *    height to its decided line, Continue leaving with the body. The page's
 *    scroll rides that clock: at 0 where it stood before the press (no jump
 *    on the fold's frame), at ½ the fold's own eased progress of the way, at
 *    1 where it lands, with the next card in view under the decided line.
 *    Scrubbed frame by frame (1/60s steps, 0 to 1), no frame moves the
 *    scroll or the card's height more than an eighth of its trip (L690:
 *    "every other house curve moves more than an eighth in one frame there,
 *    which reads as a lurch"). The live region says "Decided: <option>" and
 *    the count.
 * 3. Change pressed with the fold held at ½ turns it back from the height
 *    drawn there (L489), opening over --dur-settle on --ease-crossfade,
 *    focus on the pick, which stands chosen; a press on it keeps it.
 * 4. Played live, Continue folds its card in the press's own task, moves
 *    the page's scroll only forward on its way and never by the browser's
 *    anchoring; each painted frame's step is read (a ResizeObserver on the
 *    card, after layout), with the long tasks and long animation frames the
 *    page reports; focus lands on the next open card's first option once
 *    the fold lands, past the last card on the first open one above it, and
 *    on Send when none is left. The count's MorphText (L515) runs on its own
 *    clock, --dur-morph on ease-out, its digit rolling and its box holding
 *    the wider of the old and new words; Send's label ("Send 3 picks") the
 *    same.
 * 5. From the keyboard (L690: "A choice made from the keyboard … is
 *    instant"): the arrows move focus among a card's options, one tab stop,
 *    and pick nothing; Space and an option's digit pick, in one frame;
 *    Enter on a card with no pick does nothing; Enter continues, landing
 *    everything on the next frame with no animation under the card (the
 *    card at its decided line, the scroll where the fold would have taken
 *    it, focus on the next open card's first option); Enter on Change opens
 *    it the same way, focus on the pick, and Enter folds it back unchanged;
 *    ⌘/Ctrl+Enter sends. The live region's words after each.
 * 6. Reduced motion: the pick's colour and Continue fade (no height tween),
 *    and Continue's fold runs opacity alone (no height tween, no padding
 *    run, no flight), the scroll stands still while it fades and is placed
 *    at once where it lands, and focus still moves.
 * 7. A several-pick card (its own page): two options picked, Continue by
 *    pointer flies each chosen option's keycap and label from its own chip
 *    to its own place in the head on the fold's clock, each source hidden
 *    while its copy flies.
 * 8. The reader's own scroll ends Continue's ride: a 200px wheel and a 200px
 *    scrollbar drag (the mouse on its thumb) at 1440, a 200px finger drag at
 *    390, each at ½ of the fold's held clock, then played on: the scroll
 *    stays where the reader put it on every frame, and the fold and the
 *    flight still land (L489, L491-492).
 * 9. In WebKit at 1440, with motion and with less: Continue's foot comes in
 *    by one animation on itself (motion/curves `appearOnMount`); Change and
 *    the decided chips' line by one run of their own opacity transition from
 *    their `data-entering` mark (`enterByStyle`), so a turn caught mid-way
 *    still fades back from where they stand. Never a @starting-style
 *    transition, which WebKit sometimes skips for an element just added.
 *
 *   bun scripts/probe-kit/run.ts web decision-pick
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import type { Locator, Page } from "playwright-core";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import { Clock, type Run } from "../../anim";
import {
  CAWCO_BRIDGE,
  pageReach,
  startDecisionStage,
} from "../../decision-embeds";
import { durOf, oneEntrance, recordRuns, runsOn } from "../../entrances";
import { traceMain } from "../../frames";
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
/** --ease-drawer as the engine writes it: motion/morph's tween. */
const DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";
const LEGS = [
  { view: "desk", theme: "light", label: "1440 light" },
  { view: "phone", theme: "dark", label: "390 dark (coarse)" },
] as const;

/**
 * A press as the device makes it: a finger's tap on the phone (touch input:
 * pointer, touch and compatibility mouse events, then the click), a mouse's
 * click on the desk.
 */
const pressOn = (locator: Locator, view: (typeof LEGS)[number]["view"]) =>
  view === "phone" ? locator.tap() : locator.click();

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
      const cap = chip?.querySelector("[data-slot=kbd]");
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
    const body = root?.querySelector<HTMLElement>("[data-slot=decision-body]");
    const run = body?.getAnimations()[0];
    return {
      card: Math.round((root?.getBoundingClientRect().height ?? 0) * 10) / 10,
      body: Math.round((body?.getBoundingClientRect().height ?? 0) * 10) / 10,
      opacity: body ? Number(getComputedStyle(body).opacity) : -1,
      padding: root ? getComputedStyle(root).paddingBlockStart : "",
      scroll:
        Math.round(
          (document.querySelector("[data-slot=page-scroll]")?.scrollTop ?? 0) *
            10
        ) / 10,
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

/**
 * A decided chip at rest in its head (DESIGN.md L633, "the actions centred
 * on the pair"): beside the question, its middle on the question's first
 * line; where the head wraps under a finger, on its own row at the head's
 * start.
 */
const restsInHead = (at: {
  copy: { x: number; y: number; h: number } | null;
  header: { x: number } | null;
  line: { y: number; lh: number } | null;
  question: { y: number; h: number } | null;
}) => {
  if (!(at.copy && at.header && at.line && at.question)) {
    return false;
  }
  return at.copy.y >= at.question.y + at.question.h - 0.5
    ? Math.abs(at.copy.x - at.header.x) <= 0.5
    : Math.abs(at.copy.y + at.copy.h / 2 - (at.line.y + at.line.lh / 2)) <= 0.5;
};

/** A box on screen, rounded to a tenth of a pixel. */
interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/**
 * The flight of option `option` of card `id`: its chip on the decided line
 * (the copy, the chip carried whole), its chip in the options (the source),
 * whether the source is hidden, and the copy's own transform.
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
        `[data-option="${value}"]`
      );
      return {
        copy: box(chip),
        source: box(source),
        sourceHidden: source
          ? getComputedStyle(source).visibility === "hidden"
          : false,
        transform: chip ? getComputedStyle(chip).transform : "",
        header: box(root?.querySelector("header")),
        question: box(root?.querySelector("header h2")),
        // The question's first line: its top and its line's height.
        line: (() => {
          const question = root?.querySelector("header h2");
          return question
            ? {
                y: question.getBoundingClientRect().top,
                lh: Number.parseFloat(getComputedStyle(question).lineHeight),
              }
            : null;
        })(),
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
      send: !!active?.matches("[data-send]"),
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

/** Card `id`'s Continue. */
const continueOf = (page: Page, id: string) =>
  page.locator(`#decision-${id} [data-continue]`);

/** Brings card `id`'s Continue into the window, as a person scrolls to it. */
const toContinue = async (page: Page, id: string) => {
  await page.evaluate(
    (card) =>
      document
        .querySelector(`#decision-${card} [data-continue]`)
        ?.scrollIntoView({ block: "center" }),
    id
  );
  await settle(page, 200);
};

/** Presses option `option` of card `id` and lets its pick settle. */
const pickIn = async (
  page: Page,
  id: string,
  option: string,
  view: (typeof LEGS)[number]["view"]
) => {
  await toOption(page, id, option);
  await pressOn(
    page.locator(`#decision-${id} [data-option="${option}"]`),
    view
  );
  await settle(page, 400);
};

/** What the page's one live region says now. */
const saidOf = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelector("[data-slot=page-said]")?.textContent?.trim() ?? ""
  );

/** The options card `id` holds picked, its options that Tab reaches, and whether it shows Continue. */
const pickedIn = (page: Page, id: string) =>
  page.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    const options = [
      ...(root?.querySelectorAll<HTMLElement>("[data-option]") ?? []),
    ];
    return {
      picked: options
        .filter((one) => one.hasAttribute("data-cawco-picked"))
        .map((one) => one.dataset.option ?? ""),
      stops: options
        .filter((one) => one.tabIndex === 0)
        .map((one) => one.dataset.option ?? ""),
      next: !!root?.querySelector("[data-continue]"),
      decided: !!root?.hasAttribute("data-decided"),
    };
  }, id);

/**
 * Card `id`'s Continue as drawn: how much of it shows inside the card and
 * its body (the share of its height past their clips) and how opaque it is
 * (its foot's and the body's opacity), with the card's height.
 */
const footOf = (page: Page, id: string) =>
  page.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    const body = root?.querySelector<HTMLElement>("[data-slot=decision-body]");
    const foot = root?.querySelector<HTMLElement>("[data-slot=decision-foot]");
    const t = (n: number) => Math.round(n * 1000) / 1000;
    if (!(root && body && foot)) {
      return {
        bodyTop: 0,
        card: 0,
        head: [] as string[],
        opacity: 0,
        shown: 0,
        there: false,
      };
    }
    const box = root.getBoundingClientRect();
    const edge = Number.parseFloat(getComputedStyle(root).borderBottomWidth);
    const clip = Math.min(
      box.bottom - (edge || 0),
      body.getBoundingClientRect().bottom
    );
    const at = foot.getBoundingClientRect();
    const head = root.querySelector("header");
    return {
      head: [...(head?.children ?? [])].map((one) => {
        const r = one.getBoundingClientRect();
        return `${one.className || one.tagName} ${Math.round(r.top - box.top)}+${Math.round(r.height)} x${Math.round(r.left - box.left)} w${Math.round(r.width)}`;
      }),
      bodyTop: Math.round(body.getBoundingClientRect().top - box.top),
      card: Math.round(box.height * 10) / 10,
      opacity: t(
        Number(getComputedStyle(foot).opacity) *
          Number(getComputedStyle(body).opacity)
      ),
      shown: t(
        Math.max(0, Math.min(at.bottom, clip) - at.top) / (at.height || 1)
      ),
      there: true,
    };
  }, id);

/** Runs that share one start, length and curve: the faults, none when they do. */
const sameClock = (runs: readonly Run[]) => {
  const [first] = runs;
  if (!first) {
    return ["no runs"];
  }
  return runs.flatMap((run) =>
    run.start === null ||
    first.start === null ||
    Math.abs(run.start - first.start) > 0.5 ||
    Math.abs(run.end - first.end) > 0.5 ||
    run.easing !== first.easing
      ? [`${run.type} ${run.name} ${run.start}+${run.end} ${run.easing}`]
      : []
  );
};

/** A caught run in words. */
const said = (r: Run) =>
  `${r.type} ${r.name || "(web)"} start ${r.start} ${r.end}ms ${r.easing}`;

/**
 * A MorphText under `selector` as drawn: its box's width, whether its
 * letters are mounted, a rolling digit's face transform, and its words.
 */
const morphOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const text = document.querySelector<HTMLElement>(
      `${sel} [data-slot="morph-text"]`
    );
    const letters = text?.querySelector<HTMLElement>('[data-slot="letters"]');
    const face = letters?.querySelector<HTMLElement>("[data-roll] > span");
    return {
      width: Math.round((text?.getBoundingClientRect().width ?? 0) * 10) / 10,
      letters: !!letters,
      roll: face ? getComputedStyle(face).transform : "",
      words: text?.textContent?.trim() ?? "",
    };
  }, selector);

/**
 * A pick's MorphText under `selector` (the count, Send's label), caught as
 * the pick of option `option` of card `id` starts it: its runs on one
 * clock, read at 0, ½ and 1, its box against the old and new words' widths.
 */
async function morphLeg(
  page: Page,
  clock: Clock,
  pick: { id: string; option: string; view: (typeof LEGS)[number]["view"] },
  selector: string
) {
  await toOption(page, pick.id, pick.option);
  const was = await morphOf(page, selector);
  const runs = await clock.catchRuns(
    () =>
      pressOn(
        page.locator(`#decision-${pick.id} [data-option="${pick.option}"]`),
        pick.view
      ),
    selector
  );
  const seen: Record<string, Awaited<ReturnType<typeof morphOf>>> = {};
  for (const at of [0, 0.5, 1]) {
    await clock.seek(at);
    seen[String(at)] = await morphOf(page, selector);
  }
  await clock.release();
  await settle(page, 400);
  const now = await morphOf(page, selector);
  const wider = Math.max(was.width, now.width);
  return {
    runs,
    faults: sameClock(runs),
    held: [0, 0.5, 1].every(
      (at) => (seen[String(at)]?.width ?? 0) >= wider - 0.5
    ),
    rolled: seen["0.5"]?.roll !== "" && seen["0.5"]?.roll !== "none",
    was,
    seen,
    now,
  };
}

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
 * Presses card `id`'s Continue with the page played live (its pick made
 * already), and answers every frame from the press until the fold lands
 * (its time, the scroll, the most the page could scroll, the card's height,
 * the fold's progress), the long tasks and long animation frames the page
 * reported meanwhile, when the fold started, and where focus went.
 */
async function liveFold(
  page: Page,
  id: string,
  view: (typeof LEGS)[number]["view"]
) {
  await toContinue(page, id);
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
    const scroller = document.querySelector(
      "[data-slot=page-scroll]"
    ) as Element;
    const sized = new ResizeObserver(() => {
      const body = root?.querySelector<HTMLElement>(
        "[data-slot=decision-body]"
      );
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
  await pressOn(continueOf(page, id), view);
  await page.waitForFunction(
    (card) => {
      const root = document.getElementById(`decision-${card}`);
      return (
        root?.hasAttribute("data-decided") &&
        root.querySelector("[data-slot=decision-body]")?.getAnimations()
          .length === 0
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
          const scroller = document.querySelector(
            "[data-slot=page-scroll]"
          ) as Element;
          const chip = root?.querySelector<HTMLElement>("[data-cawco-picked]");
          const top =
            (root?.getBoundingClientRect().top ?? 0) -
            scroller.getBoundingClientRect().top +
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
                (root
                  ?.querySelector("[data-slot=decision-body]")
                  ?.getBoundingClientRect().height ?? 0) * 10
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

/** The tokens a leg reads its runs against. */
interface Tokens {
  control: number;
  edge: string;
  exit: number;
  keycap: string;
  morph: number;
  settle: number;
}

const tokensOf = async (page: Page): Promise<Tokens> => ({
  control: await tokenMs(page, "--dur-control"),
  edge: await tokenColour(page, "--brand-solid"),
  exit: await tokenMs(page, "--dur-exit"),
  keycap: await tokenColour(page, "--chip-chosen-bg"),
  morph: await tokenMs(page, "--dur-morph"),
  settle: await tokenMs(page, "--dur-settle"),
});

type View = (typeof LEGS)[number]["view"];

/**
 * 1. A pick: the option chosen where it stands, the card open with no fold
 * run, and Continue growing out of the card's foot on its height tween.
 */
async function pickStep(
  kit: Kit,
  page: Page,
  clock: Clock,
  view: View,
  label: string,
  tokens: Tokens
) {
  await toOption(page, "path", "direct");
  const open = await foldOf(page, "path");
  const footBefore = await footOf(page, "path");
  const runs = await clock.catchRuns(
    () => pressOn(page.locator('#decision-path [data-option="direct"]'), view),
    "#decision-path"
  );
  const chip: Record<string, Awaited<ReturnType<typeof chipOf>>> = {};
  const foot: Record<string, Awaited<ReturnType<typeof footOf>>> = {};
  const card: Record<string, Awaited<ReturnType<typeof foldOf>>> = {};
  for (const at of [0, 0.5, 1]) {
    await clock.seek(at);
    chip[String(at)] = await chipOf(page, "path", "direct");
    foot[String(at)] = await footOf(page, "path");
    card[String(at)] = await foldOf(page, "path");
  }
  await clock.release();
  await settle(page, 400);
  const after = await pickedIn(page, "path");
  const words = await saidOf(page);
  const colours = runs.filter(
    (run) => run.type === "CSSTransition" && run.name !== "opacity"
  );
  const grows = runs.filter(
    (run) =>
      run.type === "WebAnimation" ||
      (run.type === "CSSTransition" && run.name === "opacity")
  );
  const [f0, fHalf, f1] = [foot["0"], foot["0.5"], foot["1"]];
  kit.check(
    `${label}: a pick turns the option chosen where it stands (its edge, fill and keycap over --dur-control on ease-out, landing on brand-solid and chip-chosen-bg) and the card stays open: no fold run at 0, ½ or 1, never decided`,
    colours.length > 0 &&
      colours.every(
        (run) => Math.abs(run.end - tokens.control) < 1 && run.easing === OUT
      ) &&
      sameClock(colours).length === 0 &&
      chip["1"]?.edge === tokens.edge &&
      chip["1"]?.keycap === tokens.keycap &&
      chip["0"]?.keycap !== tokens.keycap &&
      Object.values(card).every(
        (one) => one.progress === null && !one.decided
      ) &&
      !after.decided &&
      JSON.stringify(after.picked) === '["direct"]',
    JSON.stringify({
      runs: runs.map(said),
      colourFaults: sameClock(colours),
      chip,
      card,
      after,
    })
  );
  kit.check(
    `${label}: Continue grows out of the card's foot on the card's own height tween (--dur-morph, ${tokens.morph}ms, on the drawer curve), fading up on that clock: at 0 unseen at the open card's height, at ½ part way, at 1 whole`,
    !footBefore.there &&
      grows.length === 2 &&
      grows.some((run) => run.type === "WebAnimation") &&
      sameClock(grows).length === 0 &&
      grows.every(
        (run) => Math.abs(run.end - tokens.morph) < 1 && run.easing === DRAWER
      ) &&
      !!f0 &&
      !!fHalf &&
      !!f1 &&
      f0.opacity === 0 &&
      Math.abs(f0.card - open.card) < 1.5 &&
      fHalf.opacity > 0 &&
      fHalf.opacity < 1 &&
      fHalf.card > f0.card &&
      fHalf.card < f1.card &&
      f1.opacity === 1 &&
      f1.shown === 1 &&
      after.next,
    JSON.stringify({
      runs: grows.map(said),
      faults: sameClock(grows),
      open: open.card,
      foot,
    })
  );
  kit.check(
    `${label}: the live region says "Picked Straight to sign up"`,
    words === "Picked Straight to sign up",
    words
  );
  // A press on the chosen option keeps it.
  await pressOn(page.locator('#decision-path [data-option="direct"]'), view);
  await settle(page, 400);
  const kept = await pickedIn(page, "path");
  const keptSaid = await saidOf(page);
  kit.check(
    `${label}: a press on the chosen option keeps it: still the pick, the card open, Continue standing, and the live region says "Kept Straight to sign up"`,
    JSON.stringify(kept.picked) === '["direct"]' &&
      !kept.decided &&
      kept.next &&
      keptSaid === "Kept Straight to sign up",
    JSON.stringify({ ...kept, said: keptSaid })
  );
}

/**
 * 2. Continue: the fold, the flight and the scroll on one clock, Continue
 * leaving with the body; scrubbed frame by frame. Returns the card as it
 * stood open.
 */
async function continueStep(
  kit: Kit,
  page: Page,
  clock: Clock,
  view: View,
  label: string,
  tokens: Tokens
) {
  await toContinue(page, "path");
  // Its ↵ hint only where there is an Enter to press (B9: "Show an Enter
  // hint only where Enter is safe"; ui/kbd `reach: keyboard`), as Send's.
  const hints = await page.evaluate(() =>
    [
      "#decision-path [data-continue] [data-slot=kbd]",
      "[data-send] [data-slot=kbd]",
    ].map(
      (selector) =>
        [...document.querySelectorAll(selector)].filter((key) =>
          key.checkVisibility()
        ).length
    )
  );
  kit.check(
    `${label}: Continue's ↵ and Send's keys stand only where there is a keyboard (${view === "phone" ? "none under a finger" : "shown under a mouse"}: Continue ${hints[0]}, Send ${hints[1]})`,
    view === "phone"
      ? hints[0] === 0 && hints[1] === 0
      : hints[0] === 1 && hints[1] === 2
  );
  const before = await foldOf(page, "path");
  const footBefore = await footOf(page, "path");
  const sourceBefore = (await flightOf(page, "path", "direct")).source;
  const inkHeld = await brandWordsIn(page, "path");
  const foldRuns = await clock.catchRuns(
    () => pressOn(continueOf(page, "path"), view),
    "#decision-path"
  );
  const fold: Record<string, Awaited<ReturnType<typeof foldOf>>> = {};
  const flight: Record<string, Awaited<ReturnType<typeof flightOf>>> = {};
  const foot: Record<string, Awaited<ReturnType<typeof footOf>>> = {};
  for (const at of [0, 0.5, 1]) {
    await clock.seek(at);
    fold[String(at)] = await foldOf(page, "path");
    flight[String(at)] = await flightOf(page, "path", "direct");
    foot[String(at)] = await footOf(page, "path");
  }
  const inkDecided = await brandWordsIn(page, "path");
  const words = await saidOf(page);
  const half = fold["0.5"];
  const ridden =
    half && fold["0"] && fold["1"] && half.progress !== null
      ? fold["0"].scroll + (fold["1"].scroll - fold["0"].scroll) * half.progress
      : Number.NaN;
  // One clock: the body's fold, the card's padding, the head's change of
  // height and the option's flight (the Web Animations), and Change fading
  // up (a CSS transition), one start, length and curve. An open card's head
  // is its question alone (rule 15), so no state line leaves it.
  const webs = foldRuns.filter((run) => run.type === "WebAnimation");
  const [lead] = webs;
  const fades = foldRuns.filter(
    (run) => run.type === "CSSTransition" && run.name === "opacity"
  );
  const changeFade = fades.find((run) => Math.abs(run.end - tokens.settle) < 1);
  kit.check(
    `${label}: Continue's fold is one clock, --dur-settle (${tokens.settle}ms) on --ease-crossfade: the body's height, margin and opacity, the card's padding, the head's change of height, the chosen option's flight and Change fading up start together`,
    // The body's fold, the card's padding and the flight, and the head's
    // change of height where the decided line is taller or shorter.
    webs.length >= 3 &&
      !!lead &&
      !!changeFade &&
      sameClock([...webs, changeFade]).length === 0 &&
      Math.abs(lead.end - tokens.settle) < 1 &&
      lead.easing === CROSSFADE &&
      webs.some((run) => run.name === "share-flight"),
    JSON.stringify({ runs: foldRuns.map(said) })
  );
  const seen = (at: string) =>
    (foot[at]?.shown ?? 0) * (foot[at]?.opacity ?? 0);
  kit.check(
    `${label}: on the fold's first frame the body stands where it was drawn, the card at its drawn height, Continue whole; Continue leaves with the body on the fold's clock: going at ½, gone at 1`,
    Math.abs((foot["0"]?.bodyTop ?? 0) - footBefore.bodyTop) <= 0.5 &&
      Math.abs((foot["0"]?.card ?? 0) - footBefore.card) <= 0.5 &&
      seen("0") === 1 &&
      seen("0.5") < 1 &&
      seen("1") === 0,
    JSON.stringify({ footBefore, foot })
  );
  kit.check(
    `${label}: the chosen option's keycap and label fly from its chip to the head on that clock (L485): at 0 on the chip, at ½ on its way, at 1 at rest in the head, centred on the question's first line (on its own row at the head's start where the head wraps); its chip hidden while it flies`,
    near(flight["0"]?.copy ?? null, sourceBefore) &&
      !!flight["0.5"]?.copy &&
      !!flight["0"]?.copy &&
      !!flight["1"]?.copy &&
      Math.abs(flight["0.5"].copy.y - flight["0"].copy.y) > 1 &&
      Math.abs(flight["0.5"].copy.y - flight["1"].copy.y) > 0.5 &&
      flight["1"].transform === "none" &&
      restsInHead(flight["1"]) &&
      !!flight["0"]?.sourceHidden &&
      !!flight["0.5"]?.sourceHidden,
    JSON.stringify({ sourceBefore, flight })
  );
  kit.check(
    `${label}: no words in the card's head are in a brand ink, chosen and decided (L580)`,
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
      Math.abs(fold["0"].card - before.card) < 1.5 &&
      half.card < fold["0"].card &&
      half.card > fold["1"].card &&
      fold["1"].body < 0.5 &&
      fold["1"].opacity < 0.01 &&
      fold["1"].card < 120,
    JSON.stringify({ open: before.card, fold })
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
  kit.check(
    `${label}: the live region says "Decided: Straight to sign up. 1 of 3 picked"`,
    words === "Decided: Straight to sign up. 1 of 3 picked",
    words
  );
  // The pass measure: no frame of the clock carries more than an eighth of
  // the scroll's trip or the card's height's.
  const scrubbed = await scrubFrames(page, clock, "path", tokens.settle);
  kit.check(
    `${label}: scrubbed frame by frame (1/60s, 0 to 1), no frame moves the scroll or the card's height more than an eighth of its trip (L690)`,
    scrubbed.steps.length > 0 && scrubbed.worst <= EIGHTH,
    JSON.stringify(scrubbed)
  );
  return before;
}

/** 3. Change at ½ turns the fold back; the reopened card's pick stands chosen and is kept. */
async function changeStep(
  kit: Kit,
  page: Page,
  clock: Clock,
  view: View,
  label: string,
  tokens: Tokens,
  open: Awaited<ReturnType<typeof foldOf>>
) {
  await clock.seek(0.5);
  const drawn = await foldOf(page, "path");
  const drawnFoot = await footOf(page, "path");
  // At the held ½ the head stands above the window (the page is half way
  // down its ride) and the held clock's ride puts back any scroll that
  // would bring it in, so no finger or mouse reaches it there: the press is
  // a pointer's click dispatched on Change (`detail` 1, the pointer's turn,
  // as UI Events counts it).
  const backRuns = await clock.catchRuns(
    () =>
      page
        .locator("#decision-path [data-change]")
        .dispatchEvent("click", { detail: 1 }),
    "#decision-path"
  );
  const back: Record<string, Awaited<ReturnType<typeof foldOf>>> = {};
  const backFoot: Record<string, Awaited<ReturnType<typeof footOf>>> = {};
  for (const at of [0, 1]) {
    await clock.seek(at);
    back[String(at)] = await foldOf(page, "path");
    backFoot[String(at)] = await footOf(page, "path");
  }
  await clock.release();
  await settle(page, 400);
  const openFoot = await footOf(page, "path");
  kit.check(
    `${label}: opening, the body stands where it was drawn on the turn's first frame, and nothing moves when the chosen options have flown home and Change has faded (the head at its open height from the first frame)`,
    Math.abs((backFoot["0"]?.bodyTop ?? 0) - drawnFoot.bodyTop) <= 0.5 &&
      Math.abs((backFoot["0"]?.card ?? 0) - drawnFoot.card) <= 0.5 &&
      Math.abs((backFoot["1"]?.bodyTop ?? 0) - openFoot.bodyTop) <= 0.5 &&
      Math.abs((backFoot["1"]?.card ?? 0) - openFoot.card) <= 0.5 &&
      // Change fades where it stood on the turn's curve, from the turn's
      // start; caught at ½ of its own fade up, it turns back from there
      // (CSS Transitions' reversing: half the length).
      backRuns.some(
        (run) =>
          run.type === "CSSTransition" &&
          run.name === "opacity" &&
          run.easing === CROSSFADE &&
          run.start !== null &&
          backRuns.some(
            (web) =>
              web.type === "WebAnimation" &&
              web.start !== null &&
              Math.abs(web.start - (run.start ?? 0)) <= 0.5
          )
      ),
    JSON.stringify({
      drawnFoot,
      backFoot,
      openFoot,
      runs: backRuns.map(said),
    })
  );
  const backFocus = await focusOf(page);
  const reopened = await pickedIn(page, "path");
  kit.check(
    `${label}: Change at ½ turns the fold back from the height drawn there, open over --dur-settle on --ease-crossfade, the head's chip closing back into its option on that clock, focus on the pick, which stands chosen`,
    !!back["0"] &&
      !!back["1"] &&
      Math.abs(back["0"].card - drawn.card) < 1.5 &&
      Math.abs(back["1"].body - open.body) < 1.5 &&
      backRuns.filter(
        (run) =>
          run.type === "WebAnimation" &&
          Math.abs(run.end - tokens.settle) < 1 &&
          run.easing === CROSSFADE
      ).length >= 3 &&
      backFocus.card === "path" &&
      backFocus.option === "direct" &&
      JSON.stringify(reopened.picked) === '["direct"]' &&
      !reopened.decided,
    JSON.stringify({
      drawn: drawn.body,
      open: open.body,
      back,
      runs: backRuns.map(said),
      backFocus,
      reopened,
    })
  );
  await pressOn(page.locator('#decision-path [data-option="direct"]'), view);
  await settle(page, 400);
  const kept = await pickedIn(page, "path");
  kit.check(
    `${label}: on the reopened card a press on its pick keeps it, the card open`,
    JSON.stringify(kept.picked) === '["direct"]' && !kept.decided && kept.next,
    JSON.stringify(kept)
  );
}

/**
 * 4. Played live: the count and Send's label morph as picks land, and
 * Continue folds each card at once, focus going on.
 */
async function liveSteps(
  kit: Kit,
  page: Page,
  clock: Clock,
  view: View,
  label: string,
  tokens: Tokens
) {
  const count = await morphLeg(
    page,
    clock,
    { id: "look", option: "card", view },
    "[data-slot=meter]"
  );
  kit.check(
    `${label}: the count's MorphText (L515) runs on its own clock, --dur-morph (${tokens.morph}ms) on ease-out, its digit rolling (at ½ in its slot) and its box holding the wider of the old and new words at 0, ½ and 1, landing on "2"`,
    count.runs.length > 0 &&
      count.faults.length === 0 &&
      count.runs.every(
        (run) => Math.abs(run.end - tokens.morph) < 1 && run.easing === OUT
      ) &&
      count.held &&
      count.rolled &&
      count.now.words === "2" &&
      !count.now.letters,
    JSON.stringify({ ...count, runs: count.runs.map(said) })
  );
  const look = await liveFold(page, "look", view);
  kit.check(
    `${label}: Continue played live folds its card in the press's own task, moves the scroll one way only, and focus lands on the next open card's first option`,
    look.foldAfter !== null &&
      look.foldAfter >= 0 &&
      look.foldAfter <= 50 &&
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
  const send = await morphLeg(
    page,
    clock,
    { id: "radius", option: "soft", view },
    "[data-send]"
  );
  kit.check(
    `${label}: Send's label morphs to what goes on that clock ("Send 2 picks" to "Send 3 picks"), its digit rolling and its box holding the wider words`,
    send.runs.length > 0 &&
      send.faults.length === 0 &&
      send.runs.every(
        (run) => Math.abs(run.end - tokens.morph) < 1 && run.easing === OUT
      ) &&
      send.held &&
      send.rolled &&
      send.was.words === "Send 2 picks" &&
      send.now.words === "Send 3 picks",
    JSON.stringify({ ...send, runs: send.runs.map(said) })
  );
  const radius = await liveFold(page, "radius", view);
  kit.check(
    `${label}: past the last card, focus goes to the first open card above it`,
    oneWay(radius.scrolls) &&
      radius.focus.card === "path" &&
      radius.focus.option === "direct",
    JSON.stringify(radius)
  );
  const last = await liveFold(page, "path", view);
  const path = await pickedIn(page, "path");
  kit.check(
    `${label}: Continue folds the reopened card back unchanged and, with no open card left, focus goes to Send`,
    oneWay(last.scrolls) &&
      last.focus.send &&
      path.decided &&
      JSON.stringify(path.picked) === '["direct"]',
    JSON.stringify({ last, path })
  );
}

async function leg(
  kit: Kit,
  url: string,
  view: View,
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
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 600);
  const clock = await Clock.on(page);
  const tokens = await tokensOf(page);
  await pickStep(kit, page, clock, view, label, tokens);
  const open = await continueStep(kit, page, clock, view, label, tokens);
  await changeStep(kit, page, clock, view, label, tokens, open);
  await liveSteps(kit, page, clock, view, label, tokens);
  // Every card decided: each decided line's Change, and Send, read a window
  // at a time (decision-embeds.ts `pageReach`): under a finger each
  // control's area reaches 44px (The 44 Touch Rule); at a desk 24px, drawn
  // so or through its hit area (The 24 Pointer Rule); nothing spills.
  const reach = await pageReach(page);
  const short = reach.controls.filter((one) =>
    view === "phone" ? !one.touch : !one.pointer
  );
  kit.check(
    `${label}: every card decided, every control reaches ${view === "phone" ? "44px under a finger" : "24px under a mouse"} and nothing spills (${reach.controls.length} controls: ${reach.controls.map((one) => `${one.name.slice(0, 40)} ${one.w}×${one.h}`).join(", ")})`,
    reach.controls.some((one) => one.name.includes("Change")) &&
      short.length === 0 &&
      reach.spills.length === 0,
    [...short.map((one) => one.line), ...reach.spills].join("\n    ")
  );
  kit.check(
    `${label}: the page reported no error`,
    errors.length === 0,
    errors.join(" | ")
  );
  await page.close();
}

/**
 * 5. From the keyboard: the arrows move focus and never pick; Space and a
 * digit pick, Enter continues, each in one frame; ⌘/Ctrl+Enter sends.
 */
async function keyLeg(
  kit: Kit,
  url: string,
  view: View,
  theme: (typeof LEGS)[number]["theme"],
  label: string
) {
  const keys = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
  await keys.goto(url, { waitUntil: "load" });
  await keys.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(keys, 600);
  const edge = await tokenColour(keys, "--brand-solid");
  await toOption(keys, "path", "direct");
  await keys.locator('#decision-path [data-option="direct"]').focus();
  const atRest = await pickedIn(keys, "path");
  await keys.keyboard.press("ArrowDown");
  const down = {
    focus: await focusOf(keys),
    card: await pickedIn(keys, "path"),
  };
  await keys.keyboard.press("ArrowUp");
  const up = { focus: await focusOf(keys), card: await pickedIn(keys, "path") };
  kit.check(
    `${label}: the arrows move focus among a card's options, one tab stop that follows focus, and pick nothing`,
    JSON.stringify(atRest.stops) === '["direct"]' &&
      down.focus.option === "docs" &&
      JSON.stringify(down.card.stops) === '["docs"]' &&
      up.focus.option === "direct" &&
      JSON.stringify(up.card.stops) === '["direct"]' &&
      down.card.picked.length === 0 &&
      up.card.picked.length === 0 &&
      !(down.card.decided || up.card.decided),
    JSON.stringify({ atRest, down, up })
  );
  await keys.keyboard.press("Enter");
  const none = await pickedIn(keys, "path");
  kit.check(
    `${label}: Enter on a card with no pick does nothing: nothing picked, the card open, no Continue`,
    none.picked.length === 0 && !none.decided && !none.next,
    JSON.stringify(none)
  );
  const keyOpen = await foldOf(keys, "path");
  await keys.keyboard.press(" ");
  const space = await nextFrameOf(keys, "path");
  const spaceCard = await pickedIn(keys, "path");
  const spaceSaid = await saidOf(keys);
  kit.check(
    `${label}: Space picks the focused option on the next frame, no animation under the card: chosen, the card open with Continue, and the live region says "Picked Straight to sign up"`,
    space.runs.length === 0 &&
      !space.decided &&
      space.edge === edge &&
      JSON.stringify(spaceCard.picked) === '["direct"]' &&
      spaceCard.next &&
      spaceSaid === "Picked Straight to sign up",
    JSON.stringify({ space, spaceCard, spaceSaid })
  );
  await keys.keyboard.press("2");
  const digit = await nextFrameOf(keys, "path");
  const digitCard = await pickedIn(keys, "path");
  const digitFocus = await focusOf(keys);
  const digitSaid = await saidOf(keys);
  kit.check(
    `${label}: the digit 2 moves the pick to the second option on the next frame, focus with it, no animation under the card, and the live region says "Picked Through the docs"`,
    digit.runs.length === 0 &&
      !digit.decided &&
      JSON.stringify(digitCard.picked) === '["docs"]' &&
      digitFocus.option === "docs" &&
      digitSaid === "Picked Through the docs",
    JSON.stringify({ digit, digitCard, digitFocus, digitSaid })
  );
  await keys.keyboard.press("Enter");
  const keyPick = await nextFrameOf(keys, "path");
  const keyFocus = await focusOf(keys);
  const keyCard = await pickedIn(keys, "path");
  const keySaid = await saidOf(keys);
  kit.check(
    `${label}: Enter continues on the next frame and picks nothing: no animation under the card, the card at its decided line, the scroll at the fold's landing, focus on the next open card's first option, and the live region says "Decided: Through the docs. 1 of 3 picked"`,
    keyPick.runs.length === 0 &&
      keyPick.decided &&
      keyPick.body < 0.5 &&
      keyPick.card < 120 &&
      Math.abs(keyPick.scroll - keyPick.target) <= 1 &&
      Math.abs(keyPick.scroll - keyOpen.scroll) > 20 &&
      JSON.stringify(keyCard.picked) === '["docs"]' &&
      keyFocus.card === "look" &&
      keyFocus.option === "card" &&
      keySaid === "Decided: Through the docs. 1 of 3 picked",
    JSON.stringify({ before: keyOpen.scroll, keyPick, keyFocus, keySaid })
  );
  // Focus in `look`: its digit picks there and nowhere else.
  await keys.keyboard.press("1");
  await settle(keys, 100);
  const lookCard = await pickedIn(keys, "look");
  const pathCard = await pickedIn(keys, "path");
  kit.check(
    `${label}: a digit picks only in the card focus is in`,
    JSON.stringify(lookCard.picked) === '["card"]' &&
      JSON.stringify(pathCard.picked) === '["docs"]',
    JSON.stringify({ lookCard, pathCard })
  );
  await keys.keyboard.press("Enter");
  await settle(keys, 100);
  await keys.locator("#decision-path [data-change]").focus();
  await keys.keyboard.press("Enter");
  const keyBack = await nextFrameOf(keys, "path");
  const keyBackFocus = await focusOf(keys);
  kit.check(
    `${label}: Enter on Change opens the card on the next frame, no animation under it, focus on its pick, chosen`,
    keyBack.runs.length === 0 &&
      !keyBack.decided &&
      Math.abs(keyBack.body - digit.body) < 1.5 &&
      keyBack.edge === edge &&
      keyBackFocus.card === "path" &&
      keyBackFocus.option === "docs",
    JSON.stringify({ open: digit.body, keyBack, keyBackFocus })
  );
  await keys.keyboard.press("Enter");
  const refold = await nextFrameOf(keys, "path");
  const refoldCard = await pickedIn(keys, "path");
  const refoldFocus = await focusOf(keys);
  kit.check(
    `${label}: Enter folds the reopened card back unchanged on the next frame, focus on the next open card's first option`,
    refold.runs.length === 0 &&
      refold.decided &&
      JSON.stringify(refoldCard.picked) === '["docs"]' &&
      refoldFocus.card === "radius" &&
      refoldFocus.option === "soft",
    JSON.stringify({ refold, refoldCard, refoldFocus })
  );
  const goes = await keys.evaluate(
    () =>
      document
        .querySelector("[data-send] [data-slot=morph-text]")
        ?.textContent?.trim() ?? ""
  );
  await keys.keyboard.press("Control+Enter");
  await settle(keys, 300);
  // Sent, Send runs the kit's pending (DESIGN.md L736, Buttons, Pending):
  // the spinner, then its check in its slot held for --dur-hold, its label
  // morphing to "Sent" (the X7 review's ruling: Send says it is done) and its
  // keycaps gone while what went still stands; no "Sent." line of words is
  // drawn beside it.
  const sent = await keys.evaluate(() => {
    const send = document.querySelector("[data-send]");
    return {
      check:
        send?.querySelector("[data-slot=tick]")?.getAttribute("data-on") ??
        null,
      label:
        send?.querySelector("[data-slot=morph-text]")?.textContent?.trim() ??
        "",
      keys: [...(send?.querySelectorAll("[data-slot=kbd]") ?? [])].length,
      words: document.querySelector("[data-slot=page-foot]")?.textContent ?? "",
    };
  });
  kit.check(
    `${label}: Ctrl+Enter sends from an option ("${goes}"): Send's pending ends on its check (L736), its label now "${sent.label}", ${sent.keys} keycaps, and no "Sent." line is drawn`,
    sent.check === "true" &&
      goes.startsWith("Send ") &&
      sent.label === "Sent" &&
      sent.keys === 0 &&
      !sent.words.includes("Sent."),
    JSON.stringify({ goes, ...sent })
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
    await pressOn(
      page.locator(`#decision-reach [data-option="${option}"]`),
      view
    );
    await settle(page, 300);
  }
  await toContinue(page, "reach");
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
    () => pressOn(continueOf(page, "reach"), view),
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
    `${label}: a several-pick card's Continue flies each chosen option from its own chip to its own place in the head, on the fold's one clock (--dur-settle on --ease-crossfade), each source hidden while its copy flies`,
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

/**
 * 8. The reader's scroll ends the ride (DESIGN.md L489, The Interruptible
 * Rule; L491-492): a pointer's Continue folds the card, and at ½ of its held
 * clock the reader scrolls 200px (a real wheel at 1440, a touch drag at 390,
 * through the DevTools input domain). Played on, the scroll stays where the
 * reader put it on every frame, and the fold and the chosen option's flight
 * still land.
 */
async function readerLeg(
  kit: Kit,
  url: string,
  view: (typeof LEGS)[number]["view"],
  theme: (typeof LEGS)[number]["theme"],
  label: string,
  how: "wheel" | "touch" | "scrollbar"
) {
  // The scrollbar's leg draws the page's scrollbars, as a desk's Chromium
  // does (headless hides them unless asked).
  const page = await kit.page(view, {
    theme,
    init: [CAWCO_BRIDGE],
    scrollbars: how === "scrollbar",
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 600);
  await pickIn(page, "path", "direct", view);
  await toContinue(page, "path");
  const clock = await Clock.on(page);
  await clock.catchRuns(
    () => pressOn(continueOf(page, "path"), view),
    "#decision-path"
  );
  await clock.seek(0.5);
  const half = await foldOf(page, "path");
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    const heard: string[] = [];
    (window as unknown as { kitGesture: string[] }).kitGesture = heard;
    for (const type of [
      "touchstart",
      "touchmove",
      "touchend",
      "wheel",
      "scroll",
      "pointerdown",
      "pointermove",
    ]) {
      addEventListener(type, () => heard.push(type), {
        capture: true,
        passive: true,
      });
    }
  });
  const x = Math.round(size.width / 2);
  const y = Math.round(size.height * 0.7);
  if (how === "scrollbar") {
    // The mouse on the root scrollbar's thumb, dragged down by what moves
    // the page 200px. The thumb is no element: its box is the scroller's
    // (the strip past the page's client width; its length and place the
    // view's share of the page).
    const bar = await page.evaluate(() => {
      const root = document.querySelector(
        "[data-slot=page-scroll]"
      ) as HTMLElement;
      const box = root.getBoundingClientRect();
      const strip = root.offsetWidth - root.clientWidth;
      const length =
        (root.clientHeight * root.clientHeight) / root.scrollHeight;
      const top = (root.scrollTop / root.scrollHeight) * root.clientHeight;
      return {
        x: box.left + root.clientWidth + strip / 2,
        y: box.top + top + length / 2,
        strip,
        per: root.clientHeight / root.scrollHeight,
      };
    });
    await page.mouse.move(bar.x, bar.y);
    await page.mouse.down();
    for (let step = 1; step <= 20; step += 1) {
      await page.mouse.move(bar.x, bar.y + (200 * bar.per * step) / 20);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  } else if (how === "touch") {
    // A finger dragging 200px up the screen, a move a frame: raw touch input
    // (the input domain's synthesized touch gesture pans nothing in this
    // emulation, even at rest: 817 → 817, where this drag goes 817 → 1019).
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 20; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y - step * 10 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } else {
    await cdp.send("Input.synthesizeScrollGesture", {
      x,
      y,
      yDistance: -200,
      gestureSourceType: "mouse",
      speed: 1200,
    });
  }
  await settle(page, 300);
  const gesture = [
    ...new Set(
      await page.evaluate(
        () => (window as unknown as { kitGesture: string[] }).kitGesture
      )
    ),
  ];
  const placed = await foldOf(page, "path");
  // Played on: every frame's scroll until the fold has landed.
  const played = page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const seen: number[] = [];
        const body = document.querySelector(
          "#decision-path [data-slot=decision-body]"
        );
        const step = () => {
          seen.push(
            document.querySelector("[data-slot=page-scroll]")?.scrollTop ?? 0
          );
          if ((body?.getAnimations().length ?? 0) === 0 && seen.length > 2) {
            done(seen);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      })
  );
  await clock.release();
  const frames = await played;
  await settle(page, 300);
  const landed = await foldOf(page, "path");
  const flight = await flightOf(page, "path", "direct");
  const moved = Math.abs(placed.scroll - half.scroll);
  const kept = frames.every((at) => Math.abs(at - placed.scroll) <= 1);
  kit.check(
    `${label}: the reader's ${{ wheel: "wheel", touch: "touch drag", scrollbar: "scrollbar drag (the mouse on its thumb)" }[how]} of 200px at ½ of the fold ends the ride: the scroll stays where they put it on every frame after, and the fold and the chosen option's flight still land`,
    moved >= 150 &&
      kept &&
      Math.abs(landed.scroll - placed.scroll) <= 1 &&
      landed.decided &&
      landed.body < 0.5 &&
      flight.transform === "none" &&
      restsInHead(flight),
    JSON.stringify({
      gesture,
      atHalf: half.scroll,
      afterReader: placed.scroll,
      moved,
      frames,
      landed: { scroll: landed.scroll, card: landed.card, body: landed.body },
      flight: {
        transform: flight.transform,
        copy: flight.copy,
        header: flight.header,
      },
    })
  );
  await page.close();
}

/** The page's scroll and the most it can scroll, on each of the next `count` frames. */
const footFrames = (page: Page, count: number) =>
  page.evaluate(
    (n) =>
      new Promise<{ most: number; scroll: number }[]>((done) => {
        const seen: { most: number; scroll: number }[] = [];
        const root = document.querySelector(
          "[data-slot=page-scroll]"
        ) as Element;
        const step = () => {
          seen.push({
            scroll: root.scrollTop,
            most: root.scrollHeight - root.clientHeight,
          });
          if (seen.length >= n) {
            done(seen);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count
  );

/**
 * 9. The reader at the page's foot while the fold clamps the scroll there
 * (L489, L491-492). `look` decided from the keyboard (no ride), the page at
 * its foot, a pointer's pick and Continue on the last card, `radius`: its ride climbs to
 * the first open card, `path`, at the top, further than the card shrinks.
 * Held at 0 (the ride at the foot), the reader wheels down (the page can go
 * no further; the wheel is still theirs); then the clock moves to ½, the
 * fold's shrink raises the page's foot and clamps the scroll to it, which
 * reads as the clamp. Played on, the scroll stays at the page's foot, the
 * reader's maximum, on every frame, and the fold and the flight still land.
 *
 * `gesture` turns the wheel as a mouse's scroll gesture (many events over
 * frames, the order of the clamp's frame left to the browser); `notch` turns
 * it once, one real wheel event: the page at its foot moves nothing for it,
 * so no scroll comes before the ride's next frame, and the wheel alone must
 * end the ride (the race forced, every run). `bar` presses the mouse on the
 * root scrollbar's thumb (the page's scrollbars drawn, as a desk's Chromium
 * draws them): at the foot a press on the thumb moves nothing either, so the
 * press alone must end the ride.
 */
async function clampLeg(
  kit: Kit,
  url: string,
  label: string,
  how: "gesture" | "notch" | "bar"
) {
  const page = await kit.page("desk", {
    theme: "light",
    init: [CAWCO_BRIDGE],
    scrollbars: how === "bar",
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 600);
  await page.locator('#decision-look [data-option="card"]').focus();
  await page.keyboard.press(" ");
  await page.keyboard.press("Enter");
  await settle(page, 400);
  const toFoot = async () => {
    await page.evaluate(() => {
      const scroller = document.querySelector(
        "[data-slot=page-scroll]"
      ) as Element;
      scroller.scrollTop = scroller.scrollHeight;
    });
    await settle(page, 300);
  };
  await toFoot();
  await page.locator('#decision-radius [data-option="soft"]').click();
  await settle(page, 400);
  await toFoot();
  const clock = await Clock.on(page);
  await clock.catchRuns(
    () => continueOf(page, "radius").click(),
    "#decision-radius"
  );
  const [atStart] = await footFrames(page, 2);
  // The clamp's frame: the reader's wheel and the fold's shrink land on one
  // frame. The wheel's first event moves the held fold to ½ (the runs under
  // the card, from the page, in that event), so the page's foot rises on
  // the frame the wheel scrolls to it, and the next scroll check finds both.
  // The notch's wheel moves nothing (its default held back, as the foot
  // holds it): the ride hears the wheel and no scroll at all. The bar's
  // press moves the fold in its pointerdown, as the wheel's first event does.
  await page.evaluate((by) => {
    if (by === "notch") {
      addEventListener("wheel", (event) => event.preventDefault(), {
        capture: true,
        passive: false,
      });
    }
    addEventListener(
      by === "bar" ? "pointerdown" : "wheel",
      () => {
        const card = document.getElementById("decision-radius");
        for (const run of card?.getAnimations({ subtree: true }) ?? []) {
          const end = Number(run.effect?.getComputedTiming().endTime ?? 0);
          run.currentTime = Math.min(end, 200);
        }
      },
      { capture: true, once: true, passive: true }
    );
  }, how);
  const cdp = await page.context().newCDPSession(page);
  // Every frame from before the wheel's first event, so the frame the
  // clamp lands on, and any the ride writes after it, are read.
  // The root scrollbar's thumb, read before the press: the strip past the
  // page's client width, its length and place the view's share of the page.
  const thumb = await page.evaluate(() => {
    const root = document.querySelector(
      "[data-slot=page-scroll]"
    ) as HTMLElement;
    const box = root.getBoundingClientRect();
    const length = (root.clientHeight * root.clientHeight) / root.scrollHeight;
    const top = (root.scrollTop / root.scrollHeight) * root.clientHeight;
    return {
      x:
        box.left + root.clientWidth + (root.offsetWidth - root.clientWidth) / 2,
      y: box.top + top + length / 2,
    };
  });
  const watched = footFrames(page, 40);
  if (how === "bar") {
    await page.mouse.move(thumb.x, thumb.y);
    await page.mouse.down();
  } else if (how === "notch") {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 720,
      y: 450,
      deltaX: 0,
      deltaY: 100,
    });
  } else {
    await cdp.send("Input.synthesizeScrollGesture", {
      x: 720,
      y: 450,
      yDistance: -400,
      gestureSourceType: "mouse",
      speed: 2400,
    });
  }
  const seen = await watched;
  if (how === "bar") {
    await page.mouse.up();
  }
  // From the frame the fold's shrink first shows (the page's foot rising).
  const shrunk = seen.findIndex((one) => one.most < (atStart?.most ?? 0) - 1);
  const held = shrunk < 0 ? [] : seen.slice(shrunk);
  const [afterReader] = held;
  const played = page.evaluate(
    () =>
      new Promise<{ most: number; scroll: number }[]>((done) => {
        const frames: { most: number; scroll: number }[] = [];
        const root = document.querySelector(
          "[data-slot=page-scroll]"
        ) as Element;
        const body = document.querySelector(
          "#decision-radius [data-slot=decision-body]"
        );
        const step = () => {
          frames.push({
            scroll: root.scrollTop,
            most: root.scrollHeight - root.clientHeight,
          });
          if ((body?.getAnimations().length ?? 0) === 0 && frames.length > 2) {
            done(frames);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      })
  );
  await clock.release();
  const after = await played;
  await settle(page, 300);
  const landed = await foldOf(page, "radius");
  const flight = await flightOf(page, "radius", "soft");
  const atFoot = (one: { most: number; scroll: number }) =>
    Math.abs(one.scroll - one.most) <= 1;
  kit.check(
    `${label}: the reader's ${{ gesture: "wheel (a scroll gesture)", notch: "wheel (one notch, which moves nothing at the foot: the wheel alone ends the ride)", bar: "press on the scrollbar's thumb (which moves nothing at the foot: the press alone ends the ride)" }[how]} at the page's foot as the fold's shrink clamps the scroll there ends the ride: the scroll stays at the page's foot on every frame after, and the fold and the flight still land`,
    !!atStart &&
      !!afterReader &&
      atFoot(afterReader) &&
      held.every(atFoot) &&
      after.every(atFoot) &&
      landed.decided &&
      landed.body < 0.5 &&
      flight.transform === "none",
    JSON.stringify({
      atStart,
      afterReader,
      held,
      after,
      landed: { scroll: landed.scroll, card: landed.card, body: landed.body },
      flight: { transform: flight.transform },
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
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(still, 600);
  const stillClock = await Clock.on(still);
  await toOption(still, "path", "direct");
  // The pick: its colour and Continue fade (colour and opacity, L517), and
  // the card's height lands with no tween.
  const pickRuns = await stillClock.catchRuns(
    () => pressOn(still.locator('#decision-path [data-option="direct"]'), view),
    "#decision-path"
  );
  await stillClock.seek(0.5);
  const footHalf = await footOf(still, "path");
  await stillClock.release();
  await settle(still, 400);
  const picked = await pickedIn(still, "path");
  const fade = await tokenMs(still, "--dur-fade");
  // Continue's fade is its foot's own entrance (motion/curves
  // `appearOnMount`), the one Web Animation: no height tween runs beside it.
  const webs = pickRuns.filter((run) => run.type === "WebAnimation");
  const footFade = webs.length === 1 ? webs[0] : undefined;
  kit.check(
    `${label} reduced motion: a pick's colour changes and Continue fades in where it stands over --dur-fade, with no height tween, and the card stays open`,
    !!footFade &&
      Math.abs(footFade.end - fade) < 1 &&
      footHalf.shown === 1 &&
      footHalf.opacity > 0 &&
      footHalf.opacity < 1 &&
      JSON.stringify(picked.picked) === '["direct"]' &&
      !picked.decided,
    JSON.stringify({ runs: pickRuns.map(said), footHalf, picked })
  );
  await toContinue(still, "path");
  const stillOpen = await foldOf(still, "path");
  const stillRuns = await stillClock.catchRuns(
    () => pressOn(continueOf(still, "path"), view),
    "#decision-path"
  );
  const faded: Record<string, Awaited<ReturnType<typeof foldOf>>> = {};
  for (const at of [0, 0.5]) {
    await stillClock.seek(at);
    faded[String(at)] = await foldOf(still, "path");
  }
  await stillClock.release();
  await still.waitForFunction(
    () =>
      document
        .querySelector("#decision-path [data-slot=decision-body]")
        ?.getAnimations().length === 0,
    undefined,
    { timeout: 5000 }
  );
  await settle(still, 200);
  const landed = await foldOf(still, "path");
  const stillFocus = await focusOf(still);
  kit.check(
    `${label} reduced motion: Continue's fold is opacity alone (no height tween, no padding run, no flight), the scroll still while it fades and placed at once where it lands, focus on the next card`,
    stillRuns.filter((run) => run.type === "WebAnimation").length === 1 &&
      !stillRuns.some((run) => run.name === "share-flight") &&
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
  // Change, a pointer's, with less motion: the head's chosen option and
  // Change fade where they stand over --dur-fade, then go; nothing flies.
  const headOf = () =>
    still.evaluate(() => {
      const card = document.getElementById("decision-path");
      const picks = card?.querySelector<HTMLElement>(
        "header [data-slot=decided]"
      );
      const change = card?.querySelector<HTMLElement>("header [data-change]");
      // The opacity drawn: its own and each wrapper's up to the head.
      const seen = (el: Element | null | undefined) => {
        if (!el) {
          return -1;
        }
        let o = 1;
        for (
          let at: Element | null = el;
          at && at.localName !== "header";
          at = at.parentElement
        ) {
          o *= Number(getComputedStyle(at).opacity);
        }
        return o;
      };
      return {
        picks: seen(picks),
        change: seen(change),
        decided: !!card?.hasAttribute("data-decided"),
      };
    });
  await still.evaluate(() =>
    document
      .querySelector("#decision-path [data-change]")
      ?.scrollIntoView({ block: "center" })
  );
  await settle(still, 200);
  const backRuns = await stillClock.catchRuns(
    () => pressOn(still.locator("#decision-path [data-change]"), view),
    "#decision-path header"
  );
  await stillClock.seek(0.5);
  const halfway = await headOf();
  await stillClock.release();
  await settle(still, 500);
  const gone = await headOf();
  kit.check(
    `${label} reduced motion: Change fades the head's chosen option and Change where they stand over --dur-fade, nothing flying, and they go once faded, the card open`,
    backRuns.filter(
      (run) =>
        run.type === "CSSTransition" &&
        run.name === "opacity" &&
        Math.abs(run.end - fade) < 1
    ).length >= 2 &&
      backRuns.every((run) => run.type !== "WebAnimation") &&
      halfway.picks > 0 &&
      halfway.picks < 1 &&
      halfway.change > 0 &&
      halfway.change < 1 &&
      !halfway.decided &&
      gone.picks === -1 &&
      gone.change === -1,
    JSON.stringify({ runs: backRuns.map(said), halfway, gone })
  );
  await still.close();
}

/**
 * The coral buttons drawn now: each button whose fill is the coral action
 * (`action-solid`, or `action-hover` under the mouse), shown (no ancestor at
 * opacity 0), named by what it is, and whether it stands in the window.
 */
const coralOf = (page: Page) =>
  page.evaluate(() => {
    const colour = (token: string) => {
      const probe = document.createElement("i");
      probe.style.backgroundColor = `var(${token})`;
      document.body.append(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    };
    const coral = new Set([colour("--action-solid"), colour("--action-hover")]);
    return [...document.querySelectorAll<HTMLElement>("button")]
      .filter(
        (one) =>
          coral.has(getComputedStyle(one).backgroundColor) &&
          one.checkVisibility({ opacityProperty: true })
      )
      .map((one) => {
        const at = one.getBoundingClientRect();
        const card =
          one.closest<HTMLElement>("[data-cawco-choice]")?.dataset
            .cawcoChoice ?? "";
        return {
          what: one.hasAttribute("data-send") ? "send" : `${card} continue`,
          // In view where it is seen: a card's in the cards' scroller, Send in the foot.
          inView: (() => {
            const seen = one
              .closest("[data-slot=page-scroll]")
              ?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
            return (
              at.bottom > seen.top && at.top < seen.bottom && at.height > 0
            );
          })(),
          // Its keycaps as drawn on the coral: their fill and ink.
          keys: [...one.querySelectorAll<HTMLElement>("[data-slot=kbd]")]
            .filter((key) => key.checkVisibility())
            .map((key) => {
              const s = getComputedStyle(key);
              return `${key.textContent?.trim() ?? ""} ${s.backgroundColor} on ${getComputedStyle(one).backgroundColor}, ink ${s.color}`;
            }),
        };
      });
  });

/**
 * Send as drawn: its fill, edge, ink, its highlight's stops, whether it
 * draws the highlight, and whether it is the node marked before.
 */
const sendOf = (page: Page) =>
  page.evaluate(() => {
    const send = document.querySelector<HTMLElement>("[data-send]");
    const marked = (window as unknown as { kitSend?: Element }).kitSend;
    const style = send ? getComputedStyle(send) : null;
    // The kit Button's one gradient layer: its stops are registered colours
    // (Tailwind's --tw-gradient-from and --tw-gradient-to), transparent on
    // the outline (quiet), action-surface's own on the primary.
    const top = style?.getPropertyValue("--tw-gradient-from").trim() ?? "";
    const bottom = style?.getPropertyValue("--tw-gradient-to").trim() ?? "";
    const clear = (colour: string) =>
      colour === "rgba(0, 0, 0, 0)" || colour === "#0000";
    return {
      fill: style?.backgroundColor ?? "",
      edge: style?.borderTopColor ?? "",
      ink: style?.color ?? "",
      top,
      bottom,
      highlight: style ? Number(!(clear(top) && clear(bottom))) : -1,
      same: !!send && send === marked,
      quiet: !!style && clear(top) && clear(bottom),
    };
  });

/**
 * Every run on Send and anything drawn in it (`getAnimations({ subtree:
 * true })`, its pseudo-elements among them), held: its property, length,
 * delay, curve and eased progress; and, read at that progress, what its
 * fill and highlight's stops should be on the way from `from` to `to`
 * (CSS Color 4: a colour animates in Oklab, premultiplied, as `color-mix(in
 * oklab, …)` mixes), beside what is drawn.
 */
const sendRunsOf = (
  page: Page,
  from: { bottom: string; fill: string; top: string },
  to: { bottom: string; fill: string; top: string }
) =>
  page.evaluate(
    ([a, b]) => {
      const send = document.querySelector<HTMLElement>("[data-send]");
      const runs = (send?.getAnimations({ subtree: true }) ?? []).map((run) => {
        const timing = run.effect?.getComputedTiming();
        return {
          name:
            (run as CSSTransition).transitionProperty ??
            (run as CSSAnimation).animationName ??
            run.id,
          pseudo: (run.effect as KeyframeEffect | null)?.pseudoElement ?? "",
          duration: Number(timing?.duration ?? 0),
          delay: timing?.delay ?? 0,
          easing: timing?.easing ?? "",
          progress: timing?.progress ?? null,
        };
      });
      const p = runs[0]?.progress ?? Number.NaN;
      const mix = (start: string, end: string) => {
        const probe = document.createElement("i");
        probe.style.color = `color-mix(in oklab, ${start}, ${end} ${p * 100}%)`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      };
      const style = send ? getComputedStyle(send) : null;
      return {
        runs,
        p,
        drawn: {
          fill: style?.backgroundColor ?? "",
          top: style?.getPropertyValue("--tw-gradient-from").trim() ?? "",
          bottom: style?.getPropertyValue("--tw-gradient-to").trim() ?? "",
        },
        expected: {
          fill: mix(a.fill, b.fill),
          top: mix(a.top, b.top),
          bottom: mix(a.bottom, b.bottom),
        },
      };
    },
    [from, to] as const
  );

/** Two colours' figures, each within `by` of the other's. */
const sameColour = (a: string, b: string, by = 0.004) => {
  const figures = (colour: string) =>
    [...colour.matchAll(/-?\d*\.?\d+(?:e-?\d+)?/g)].map((m) => Number(m[0]));
  const [x, y] = [figures(a), figures(b)];
  return (
    a.split("(")[0] === b.split("(")[0] &&
    x.length === y.length &&
    x.every((n, i) => Math.abs(n - (y[i] ?? Number.NaN)) <= by)
  );
};

/**
 * One coral action at a time, the next act (the owner's ruling): across
 * load, each pick, each Continue, the last Continue, a Change and its
 * Continue again, the coral buttons shown are never more than one, and the
 * one is the next act. Send turns coral as one element, the kit Button
 * changing variant: its fill, edge and ink crossing on one clock, the kit's
 * colour change (DESIGN.md, Buttons: "hover and colour changes take
 * 120ms", --dur-control on ease-out), read at 0, ½ and 1.
 */
async function coralLeg(
  kit: Kit,
  url: string,
  view: View,
  theme: (typeof LEGS)[number]["theme"],
  label: string
) {
  const page = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 600);
  const control = await tokenMs(page, "--dur-control");
  const steps: {
    coral: Awaited<ReturnType<typeof coralOf>>;
    next: string;
    step: string;
  }[] = [];
  const look = async (step: string, next: string) => {
    await settle(page, 600);
    steps.push({ step, next, coral: await coralOf(page) });
  };
  const proceed = async (id: string) => {
    await toContinue(page, id);
    await pressOn(continueOf(page, id), view);
  };
  await look("load", "");
  await pickIn(page, "path", "direct", view);
  await look("pick path", "path continue");
  await proceed("path");
  await look("Continue path", "");
  await pickIn(page, "look", "card", view);
  await look("pick look", "look continue");
  await proceed("look");
  await look("Continue look", "");
  await pickIn(page, "radius", "soft", view);
  await look("pick radius", "radius continue");
  // The last Continue: Send turns coral, caught on its clock.
  await toContinue(page, "radius");
  await page.evaluate(() => {
    (window as unknown as { kitSend?: Element | null }).kitSend =
      document.querySelector("[data-send]");
  });
  const before = await sendOf(page);
  const clock = await Clock.on(page);
  const runs = await clock.catchRuns(
    () => pressOn(continueOf(page, "radius"), view),
    "[data-slot=page-foot]"
  );
  const turn: Record<string, Awaited<ReturnType<typeof sendOf>>> = {};
  for (const at of [0, 0.5, 1]) {
    await clock.seek(at);
    turn[String(at)] = await sendOf(page);
  }
  await clock.seek(0.5);
  const held = await sendRunsOf(page, before, turn["1"] ?? before);
  await clock.release();
  await look("Continue radius (the last)", "send");
  await page.evaluate(() =>
    document
      .querySelector("#decision-path [data-change]")
      ?.scrollIntoView({ block: "center" })
  );
  await settle(page, 200);
  await pressOn(page.locator("#decision-path [data-change]"), view);
  await look("Change path", "path continue");
  await proceed("path");
  await look("Continue path again", "send");
  const after = await sendOf(page);

  const wrong = steps.filter(
    (one) =>
      one.coral.length > 1 ||
      (one.next === ""
        ? one.coral.length !== 0
        : one.coral[0]?.what !== one.next)
  );
  kit.check(
    `${label}: at every step (load, each pick, each Continue, the last Continue, a Change and its Continue again) at most one coral button shows, and it is the next act: the working card's Continue, else Send once no card stands open`,
    steps.length === 9 && wrong.length === 0,
    JSON.stringify({ wrong, steps })
  );
  // What a keycap draws on the coral: the kit Kbd's own look, which has no
  // form for a primary button's fill (the lane's kit-swap on ui/kbd).
  kit.note(
    `${label}: the keycaps on the coral: ${[...new Set(steps.flatMap((one) => one.coral.flatMap((button) => button.keys)))].join("; ")}`
  );
  const [h0, hHalf, h1] = [turn["0"], turn["0.5"], turn["1"]];
  kit.check(
    `${label}: Send turns coral as one element on one clock (--dur-control, ${control}ms, on ease-out, the kit Button's colour change): its fill, edge and ink cross, quiet at 0, between at ½, coral at 1 with its highlight, the same node throughout and after`,
    before.quiet &&
      runs.length >= 3 &&
      sameClock(runs).length === 0 &&
      runs.every(
        (run) => Math.abs(run.end - control) < 1 && run.easing === OUT
      ) &&
      !!h0 &&
      !!hHalf &&
      !!h1 &&
      // Held, the engine says a colour in oklab; at rest, in oklch.
      h0.fill !== h1.fill &&
      hHalf.fill !== h0.fill &&
      hHalf.fill !== h1.fill &&
      h1.highlight === 1 &&
      [h0, hHalf, h1].every((one) => one.same) &&
      !h1.quiet &&
      after.same &&
      !after.quiet,
    JSON.stringify({ before, runs: runs.map(said), turn, after })
  );
  // The variant switch as one thing (the kit Button's highlight is its one
  // gradient layer over the fill): every run on Send and in it, its fill,
  // edge, ink and both gradient stops, one start (the protocol's), one
  // length and one curve, at one eased progress; held at ½, the fill and
  // the highlight's stops stand that same share of the way to their ends.
  const names = held.runs.map((run) => run.name).sort();
  const onSend = runs.filter((run) =>
    ["--tw-gradient-from", "--tw-gradient-to", "background-color"].includes(
      run.name
    )
  );
  kit.check(
    `${label}: Send's switch from outline to primary is one clock on the kit Button: every run on it and in it (fill, edge, ink, the highlight's top and bottom stops) starts together over --dur-control on ease-out, and held at ½ the fill and the highlight stand the same eased share (${Math.round(held.p * 1000) / 1000}) of the way between their ends`,
    ["--tw-gradient-from", "--tw-gradient-to", "background-color"].every(
      (name) => names.includes(name)
    ) &&
      onSend.length === 3 &&
      sameClock(onSend).length === 0 &&
      sameClock(runs).length === 0 &&
      held.runs.every(
        (run) =>
          Math.abs(run.duration - control) < 1 &&
          run.delay === 0 &&
          run.easing === OUT &&
          run.progress !== null &&
          Math.abs(run.progress - held.p) < 1e-6
      ) &&
      held.p > 0 &&
      held.p < 1 &&
      !!h1 &&
      held.drawn.fill !== before.fill &&
      held.drawn.fill !== h1.fill &&
      held.drawn.top !== before.top &&
      held.drawn.top !== h1.top &&
      sameColour(held.drawn.fill, held.expected.fill) &&
      sameColour(held.drawn.top, held.expected.top) &&
      sameColour(held.drawn.bottom, held.expected.bottom),
    JSON.stringify({ runs: onSend.map(said), held, ends: { before, h1 } })
  );
  await page.close();
}

/**
 * The fold's frame cost: a pointer's Continue on the path card traced on
 * the page's main thread (DevTools timeline), each task in the fold's 400ms
 * with its layout, its style passes and its frame's other rendering (paint,
 * composite and the rest), ms. Held to the 60Hz frame (16.7ms).
 */
async function costLeg(
  kit: Kit,
  url: string,
  view: View,
  theme: (typeof LEGS)[number]["theme"],
  label: string
) {
  const page = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 600);
  await pickIn(page, "path", "direct", view);
  await toContinue(page, "path");
  const traced = await traceMain(
    page,
    async () => {
      await page.evaluate(() => performance.mark("fold"));
      await pressOn(continueOf(page, "path"), view);
      await settle(page, 700);
    },
    { passes: true }
  );
  const start = traced.marks.find((one) => one.name === "fold")?.at ?? 0;
  const frames = traced.tasks
    .filter((task) => task.at >= start && task.at <= start + 500_000)
    .map((task) => {
      const style = task.passes
        .filter((pass) => pass.name !== "Layout")
        .reduce((sum, pass) => sum + pass.ms, 0);
      const rendering = task.rendering.reduce((sum, [, ms]) => sum + ms, 0);
      return {
        layout: Math.round(task.layoutMs * 100) / 100,
        style: Math.round(style * 100) / 100,
        rendering: Math.round(rendering * 100) / 100,
        total: Math.round((task.end - task.at) / 10) / 100,
        top: task.rendering.slice(0, 3),
      };
    });
  const worst = Math.max(0, ...frames.map((one) => one.total));
  const median = (values: number[]) =>
    values.length
      ? values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
      : 0;
  kit.check(
    `${label}: the fold's frames, traced: ${frames.length} tasks over its 400ms, layout ${median(frames.map((one) => one.layout))}ms, style ${median(frames.map((one) => one.style))}ms, rendering (paint, composite and the rest) ${median(frames.map((one) => one.rendering))}ms at the median, the longest task ${worst}ms, under the 16.7ms frame`,
    frames.length > 0 && worst < 16.7,
    JSON.stringify(frames)
  );
  await page.close();
}

/**
 * 9. In WebKit, at the desk, with motion and with less: what a pick and its
 * Continue bring onto the card comes in by one run on itself, never a
 * @starting-style transition, which WebKit sometimes skips for an element
 * just added (bugs.webkit.org 275184). Continue's foot by its own animation
 * (motion/curves `appearOnMount`) over --dur-morph (--dur-fade with less
 * motion); Change, as the card moves to its decided line, by its own
 * opacity transition from its `data-entering` mark (`enterByStyle`) over
 * --dur-settle (--dur-fade); the decided chips' line, whose chips fly home
 * with motion, runs nothing of its own then and fades the same way over
 * --dur-fade with less motion.
 */
async function entranceLeg(kit: Kit, url: string, reduced: boolean) {
  const label = `WebKit 1440 ${reduced ? "reduced motion" : "with motion"}`;
  const page = await kit.page("desk", {
    engine: "webkit",
    theme: "light",
    init: [CAWCO_BRIDGE],
  });
  await page.emulateMedia({
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await page.addInitScript(recordRuns);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 600);
  await toOption(page, "path", "direct");
  await pressOn(page.locator('#decision-path [data-option="direct"]'), "desk");
  await page.waitForSelector("#decision-path [data-slot=decision-foot]");
  await settle(page, 600);
  const foot = await page.evaluate(runsOn, {
    selector: "#decision-path [data-slot=decision-foot]",
    pseudo: null,
  });
  await pressOn(page.locator("#decision-path [data-continue]"), "desk");
  await page.waitForSelector("#decision-path [data-slot=decided]");
  await settle(page, 900);
  const change = await page.evaluate(runsOn, {
    selector:
      "#decision-path [data-slot=decision-head] span:has(> [data-change])",
    pseudo: null,
  });
  const decided = await page.evaluate(runsOn, {
    selector: "#decision-path [data-slot=decided]",
    pseudo: null,
  });
  const [morph, settleMs, fade] = await Promise.all(
    ["--dur-morph", "--dur-settle", "--dur-fade"].map((token) =>
      page.evaluate(durOf, token)
    )
  );
  const footMs = reduced ? fade : morph;
  const changeMs = reduced ? fade : settleMs;
  kit.check(
    `9 ${label}: Continue's foot comes in by one animation on itself over ${reduced ? "--dur-fade" : "--dur-morph"} (${footMs}ms), never @starting-style`,
    foot.length === 1 && oneEntrance(foot[0]?.runs ?? [], footMs),
    JSON.stringify(foot)
  );
  // Change and the decided chips' line come in by their own opacity
  // transitions, which also carry them out (motion/curves `enterByStyle`):
  // one run on each, from its `data-entering` mark, which is gone.
  const byStyle = (seen: typeof change, ms: number) =>
    seen.length === 1 &&
    seen[0]?.runs.length === 1 &&
    seen[0]?.runs[0]?.kind === "CSSTransition" &&
    seen[0]?.runs[0]?.name === "opacity" &&
    Math.abs((seen[0]?.runs[0]?.duration ?? 0) - ms) < 1;
  const marked = await page.evaluate(
    () => document.querySelectorAll("#decision-path [data-entering]").length
  );
  kit.check(
    `9 ${label}: Change comes in by one run on itself as the card moves, its own opacity transition over ${reduced ? "--dur-fade" : "--dur-settle"} (${changeMs}ms) from its data-entering mark, never @starting-style`,
    byStyle(change, changeMs) && marked === 0,
    JSON.stringify({ change, marked })
  );
  kit.check(
    reduced
      ? `9 ${label}: the decided chips' line comes in by one run on itself, its own opacity transition over --dur-fade (${fade}ms) from its data-entering mark, never @starting-style`
      : `9 ${label}: the decided chips' line runs nothing of its own (its chips fly home), and no @starting-style`,
    reduced
      ? byStyle(decided, fade)
      : decided.length === 1 && (decided[0]?.runs.length ?? 1) === 0,
    JSON.stringify(decided)
  );
  await page.close();
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
      for (const reduced of [false, true]) {
        await entranceLeg(kit, stage.pageUrl(NAME, "light"), reduced);
      }
      for (const { view, theme, label } of LEGS) {
        const url = stage.pageUrl(NAME, theme);
        await leg(kit, url, view, theme, label);
        await costLeg(kit, url, view, theme, label);
        await coralLeg(kit, url, view, theme, label);
        await keyLeg(kit, url, view, theme, label);
        await stillLeg(kit, url, view, theme, label);
        await manyLeg(kit, stage.pageUrl(MANY, theme), view, theme, label);
        if (view === "phone") {
          await readerLeg(kit, url, view, theme, label, "touch");
        } else {
          await readerLeg(kit, url, view, theme, label, "wheel");
          await readerLeg(kit, url, view, theme, label, "scrollbar");
          await clampLeg(kit, url, label, "gesture");
          await clampLeg(kit, url, label, "notch");
          await clampLeg(kit, url, label, "bar");
        }
      }
    } finally {
      await stage.stop();
    }
  },
};

export default spec;
