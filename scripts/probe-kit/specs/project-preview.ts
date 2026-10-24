/**
 * The project page's design preview (design-previews/project), read from
 * the engine. The folder is served as it is, and its page is read at 390,
 * 680 and 1440 on Chromium and WebKit, in every state the preview offers
 * (at rest, waiting on him, the task pane open, an empty project, a read
 * failure) and both phone forks (the grouped list, the columns sideways).
 *
 *   bun scripts/probe-kit/run.ts project-preview
 *
 * Asserted:
 * - boxes: the page never scrolls sideways; inside the head, the bar, the
 *   view bar, every card, the pane's rows and the empty and failed blocks,
 *   no part spills out of its parent or covers a sibling;
 * - Caw, where he stands outside a row (the empty project's hero, the
 *   fault), has his centre on his block's within 1px, and the block's on
 *   the page column's;
 * - each card's lines match the grammar for its stage (the title at most
 *   two, the stage's one fact, a third line only for Working and Review,
 *   none on a card waiting on him);
 * - the pane holds at most two cards before its tabs;
 * - one act per view: exactly one coral-filled control in view, in every
 *   state at every width (Ask Caw, Approve, the empty project's Send, Retry);
 * - no glyph stands in a box of its own: a glyph whose parent draws a
 *   border or a fill shares that box with words (a labelled control or
 *   tile); an icon alone has no container, controls included;
 * - no box overlaps another, the Dropped rail and the columns included, and
 *   a board scrolled sideways never cuts a column at its leading edge;
 * - the empty project's starters share one height;
 * - interface text starts at its column's edge (the empty and failed
 *   blocks' title and lines), while Caw keeps the composition's axis;
 * - the pane's tab strip stands directly over its panel, and the panel
 *   shows whole above the composer;
 * - a board with more past an edge wears the house edge fade there (the
 *   pane or Caw's column narrowing it, the Dropped column opened);
 * - the preview page shows one frame at a time where both can't be read
 *   (under 1100px), at a scale of 0.9 or more for the Phone and 1 for the
 *   Desk, which pans; both frames side by side or stacked above that;
 * - every named motion, held on the DevTools clock and sought to 0, ¼, ½,
 *   ¾ and 1 of its own length, moves the whole way on its own curve: each
 *   reading strictly between its ends, and within 0.06 of where the run's
 *   easing puts it (no hold, no jump);
 * - no console error on any page.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one state at a time
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import {
  type Kit,
  type MotionRun,
  readMotion,
  type Spec,
  type View,
} from "../kit";

const FOLDER = normalize(
  join(import.meta.dir, "..", "..", "..", "design-previews", "project")
);
const STATES = ["rest", "waiting", "open", "empty", "fault"] as const;
const SIZES: View[] = ["desk", "narrowDesk", "phone"];
const ENGINES = ["chromium", "webkit"] as const;
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** The house curves (DESIGN.md, Motion grammar) and the skeleton's cross-fade. */
const HOUSE_CURVES = [
  "cubic-bezier(0.23, 1, 0.32, 1)",
  "cubic-bezier(0.77, 0, 0.175, 1)",
  "cubic-bezier(0.32, 0.72, 0, 1)",
  "cubic-bezier(0.42, 0, 0.58, 1)",
];

const serve = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(join(FOLDER, path === "/" ? "index.html" : path));
      if (!file.startsWith(FOLDER)) {
        return new Response(null, { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response(null, { status: 404 });
    },
  });

/** Every console error and uncaught error a page says, by where it was said. */
const errors: string[] = [];
const listen = (page: Page, where: string): void => {
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`${where}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`${where}: ${error.message}`);
  });
};

/** Waits until the frame is drawn and nothing named moves in it. */
const still = async (page: Page): Promise<void> => {
  await page.waitForSelector("html[data-ready]");
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done(null)))
      )
  );
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          Number(animation.effect?.getComputedTiming().iterations ?? 1) > 1
      )
  );
};

const openFrame = async (
  page: Page,
  origin: string,
  state: string,
  layout = "list"
): Promise<void> => {
  await page.goto(`${origin}/frame.html?state=${state}&layout=${layout}`);
  await still(page);
};

/* ---------- Boxes ---------- */

const PARENTS = [
  ".board",
  ".col",
  ".col-cards",
  ".bar",
  ".glass",
  ".head",
  ".head-words",
  ".head-acts",
  ".col-head",
  ".card",
  ".card-meta",
  ".card-third",
  ".viewbar",
  ".pane-top",
  ".pane-facts",
  ".pcard",
  ".chips",
  ".decision",
  ".ptabs",
  ".starters",
  ".starter",
  ".composer",
  ".fault-ways",
  ".empty",
  ".fault",
  ".caw-col-head",
  ".prow",
  ".review-who",
  ".attachments",
];

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
interface Group {
  kids: { box: Box; name: string }[];
  outer: Box;
  selector: string;
}

/**
 * Each shown parent's box and its shown children's, in flow: a box placed
 * out of flow (absolute, fixed) or pinned over what scrolls under it
 * (sticky: the review's decision) is drawn over its neighbours by design.
 */
const groupsOf = (page: Page) =>
  page.evaluate((parents) => {
    // On the board a pinned box (the Dropped rail) stands among the
    // columns, so it is held to them like any other.
    const inFlow = (element: Element, pinned = false): boolean => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const out = pinned
        ? ["absolute", "fixed"]
        : ["absolute", "fixed", "sticky"];
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.visibility !== "hidden" &&
        !out.includes(style.position)
      );
    };
    const plain = (element: Element) => {
      const { bottom, left, right, top } = element.getBoundingClientRect();
      return { bottom, left, right, top };
    };
    const root = document.documentElement;
    const groups = parents.flatMap((selector) =>
      [...document.querySelectorAll(selector)]
        .filter((parent) => inFlow(parent))
        .map((parent) => ({
          selector,
          outer: plain(parent),
          kids: [...parent.children]
            .filter((kid) => inFlow(kid, selector === ".board"))
            .map((kid) => ({
              name: `${kid.localName}.${[...kid.classList].join(".")}`,
              box: plain(kid),
            })),
        }))
    );
    return { groups, wide: root.scrollWidth, view: root.clientWidth };
  }, PARENTS);

/** Scrollers, whose children run past their box by design: overlaps only. */
const SCROLLERS = new Set([".board"]);

const spills = ({ kids, outer, selector }: Group): string[] =>
  SCROLLERS.has(selector)
    ? []
    : kids.flatMap(({ box, name }) => {
        const over = Math.max(outer.left - box.left, box.right - outer.right);
        return over > 0.5
          ? [`${name} spills out of ${selector} by ${over.toFixed(1)}px`]
          : [];
      });

const overlaps = ({ kids, selector }: Group): string[] =>
  kids.flatMap((one, i) =>
    kids.slice(i + 1).flatMap((other) => {
      const w =
        Math.min(one.box.right, other.box.right) -
        Math.max(one.box.left, other.box.left);
      const h =
        Math.min(one.box.bottom, other.box.bottom) -
        Math.max(one.box.top, other.box.top);
      return w > 0.5 && h > 0.5
        ? [
            `${one.name} and ${other.name} overlap in ${selector} (${w.toFixed(1)}×${h.toFixed(1)})`,
          ]
        : [];
    })
  );

/** Spills, overlaps and sideways scroll, each said with what and by how much. */
const boxFaults = async (page: Page): Promise<string[]> => {
  const { groups, view, wide } = await groupsOf(page);
  return [
    ...(wide > view + 1
      ? [`the page scrolls sideways: ${wide} > ${view}`]
      : []),
    ...groups.flatMap((group) => [...spills(group), ...overlaps(group)]),
  ];
};

/**
 * A board scrolled sideways shows each column it reaches from its start: a
 * column cut at the leading edge (its words broken mid-word) is a fault; one
 * running past the trailing edge is the hint that more lies there.
 */
const cutColumns = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const board = document.querySelector<HTMLElement>(".board");
    if (!board || board.hidden || board.scrollWidth <= board.clientWidth) {
      return [];
    }
    const edge =
      board.getBoundingClientRect().left +
      Number.parseFloat(getComputedStyle(board).paddingLeft);
    return [...board.children].flatMap((col) => {
      const box = col.getBoundingClientRect();
      return box.width > 0 && box.right > edge + 0.5 && box.left < edge - 0.5
        ? [
            `${col.className} ${(col as HTMLElement).dataset.col ?? ""} starts ${(edge - box.left).toFixed(1)}px before the board's edge`,
          ]
        : [];
    });
  });

/**
 * Every control in view filled with the coral action: its background, or
 * any colour of its background image, at a coral hue (20 to 50 degrees in
 * OKLCH) with a chroma of 0.1 or more (the status tints sit under it).
 */
const coralFills = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d");
    const coral = (colour: string): boolean => {
      if (!canvas) {
        return false;
      }
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = "rgba(0, 0, 0, 0)";
      canvas.fillStyle = colour;
      canvas.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
      if (a < 200) {
        return false;
      }
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const [R, G, B] = [lin(r), lin(g), lin(b)];
      const l = Math.cbrt(
        0.412_221_470_8 * R + 0.536_332_536_3 * G + 0.051_445_992_9 * B
      );
      const m = Math.cbrt(
        0.211_903_498_2 * R + 0.680_699_545_1 * G + 0.107_396_956_6 * B
      );
      const s = Math.cbrt(
        0.088_302_461_9 * R + 0.281_718_837_6 * G + 0.629_978_700_5 * B
      );
      const A = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
      const Bb = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
      const chroma = Math.hypot(A, Bb);
      const hue = (Math.atan2(Bb, A) * 180) / Math.PI;
      return chroma >= 0.1 && hue >= 20 && hue <= 50;
    };
    const colours = (style: CSSStyleDeclaration): string[] => [
      style.backgroundColor,
      ...(style.backgroundImage.match(
        /(?:rgba?|oklch|oklab|lab|lch|color)\([^()]*\)/g
      ) ?? []),
    ];
    const inView = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.right > 0 &&
        box.bottom > 0 &&
        box.left < innerWidth &&
        box.top < innerHeight &&
        getComputedStyle(element).visibility === "visible"
      );
    };
    return [...document.querySelectorAll("button, a, [role='button'], label")]
      .filter(inView)
      .filter((control) => colours(getComputedStyle(control)).some(coral))
      .map(
        (control) =>
          (control.textContent?.trim() || control.getAttribute("aria-label")) ??
          control.localName
      );
  });

/**
 * Each glyph in view standing in a box of its own: its parent draws a
 * border, a fill other than what lies behind it, or a background image, and
 * holds no words of its own beside the glyph.
 */
const boxedGlyphs = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const clear = (colour: string) =>
      colour === "transparent" ||
      colour.endsWith("/ 0)") ||
      colour.endsWith(", 0)");
    const behind = (element: Element): string => {
      for (let at = element.parentElement; at; at = at.parentElement) {
        const fill = getComputedStyle(at).backgroundColor;
        if (!clear(fill)) {
          return fill;
        }
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const draws = (box: Element): boolean => {
      const style = getComputedStyle(box);
      const edged = ["Top", "Right", "Bottom", "Left"].some(
        (side) =>
          Number.parseFloat(
            style.getPropertyValue(`border-${side.toLowerCase()}-width`)
          ) > 0 &&
          !clear(style.getPropertyValue(`border-${side.toLowerCase()}-color`))
      );
      const filled =
        !clear(style.backgroundColor) && style.backgroundColor !== behind(box);
      return edged || filled || style.backgroundImage !== "none";
    };
    return [...document.querySelectorAll("svg.glyph")].flatMap((glyph) => {
      const box = glyph.parentElement;
      const shown = glyph.getBoundingClientRect();
      if (
        !box ||
        shown.width === 0 ||
        getComputedStyle(glyph).visibility !== "visible"
      ) {
        return [];
      }
      const words = [...box.childNodes].some(
        (node) => node !== glyph && (node.textContent ?? "").trim() !== ""
      );
      return draws(box) && !words
        ? [
            `${box.localName}.${[...box.classList].join(".")} (${box.getAttribute("aria-label") ?? ""})`,
          ]
        : [];
    });
  });

/**
 * The empty project's starters: each one's height, and how far its words'
 * middle stands from its box's (a one-line starter in a two-line row leaves
 * no blank foot when its words are centred).
 */
const starterBoxes = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".starter")]
      .filter((starter) => starter.getBoundingClientRect().height > 0)
      .map((starter) => {
        const box = starter.getBoundingClientRect();
        const words = starter.querySelector("span")?.getBoundingClientRect();
        const middle = (b: DOMRect) => b.top + b.height / 2;
        return {
          height: box.height,
          off: words ? Math.abs(middle(words) - middle(box)) : Number.NaN,
        };
      })
  );

/** Caw's centre against his block's, and the block's against the page column's. */
const cawAxis = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".caw-hero, .caw-fault")]
      .filter((caw) => caw.getBoundingClientRect().width > 0)
      .map((caw) => {
        const centre = (box: DOMRect) => box.left + box.width / 2;
        const block = caw.parentElement as HTMLElement;
        const field = document.querySelector("#page") as HTMLElement;
        const pageBox = field.getBoundingClientRect();
        const pad = getComputedStyle(field);
        const column =
          (pageBox.left +
            Number.parseFloat(pad.paddingLeft) +
            pageBox.right -
            Number.parseFloat(pad.paddingRight)) /
          2;
        return {
          who: caw.className,
          caw: centre(caw.getBoundingClientRect()),
          block: centre(block.getBoundingClientRect()),
          column,
        };
      })
  );

/** Each card's lines: its title's, its stage fact's and its third line's. */
const cardLines = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".card[data-id]")]
      .filter((card) => card.getBoundingClientRect().height > 0)
      .map((card) => {
        // The lines its words are drawn on inside its own box: a clamp's
        // hidden lines are laid out below it, and a run trimmed to its
        // x-height band (the mark line) keeps every line it draws.
        const lines = (element: Element | null): number => {
          if (!element) {
            return 0;
          }
          const box = element.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element);
          const tops = new Set<number>();
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.top < box.bottom - 1) {
              tops.add(Math.round(rect.top));
            }
          }
          return tops.size;
        };
        return {
          id: card.dataset.id ?? "",
          stage: card.dataset.stage ?? "",
          needs: card.hasAttribute("data-needs"),
          title: lines(card.querySelector(".card-title")),
          meta: lines(card.querySelector(".card-meta > .words")),
          third: lines(card.querySelector(".card-third > .words")),
        };
      })
  );

const GRAMMAR: Record<string, [number, number][]> = {
  // [min, max] of the stage fact's lines, then of the third line's.
  needs: [
    [1, 2],
    [0, 0],
  ],
  ready: [
    [0, 1],
    [0, 0],
  ],
  working: [
    [1, 1],
    [1, 1],
  ],
  review: [
    [1, 1],
    [1, 1],
  ],
  done: [
    [1, 1],
    [0, 0],
  ],
  dropped: [
    [1, 1],
    [0, 0],
  ],
};

const offGrammar = (cards: Awaited<ReturnType<typeof cardLines>>): string[] =>
  cards.flatMap((card) => {
    const [[metaMin, metaMax], [thirdMin, thirdMax]] =
      GRAMMAR[card.needs ? "needs" : card.stage] ?? GRAMMAR.ready;
    const ok =
      card.title >= 1 &&
      card.title <= 2 &&
      card.meta >= metaMin &&
      card.meta <= metaMax &&
      card.third >= thirdMin &&
      card.third <= thirdMax;
    return ok
      ? []
      : [
          `${card.id} (${card.needs ? "needs you" : card.stage}): title ${card.title}, fact ${card.meta}, third ${card.third}`,
        ];
  });

/** The cards in the pane's region above its tab strip. */
const cardsBeforeTabs = (page: Page): Promise<number> =>
  page.evaluate(() =>
    document.querySelector(".pane-tabs .ptabs")
      ? document.querySelectorAll(".pane-scroll > .pcard").length
      : -1
  );

/** Where the pane's strip, its panel and its composer stand. */
const paneParts = (page: Page) =>
  page.evaluate(() => {
    const box = (selector: string) => {
      const found = document.querySelector(selector)?.getBoundingClientRect();
      return found ? { top: found.top, bottom: found.bottom } : null;
    };
    return {
      strip: box(".pane-tabs .ptabs"),
      panel: box('.pane-tabs [data-slot="panel"]'),
      foot: box(".pane-foot"),
      view: innerHeight,
    };
  });

const paneFaults = (parts: Awaited<ReturnType<typeof paneParts>>): string[] => {
  const { foot, panel, strip, view } = parts;
  if (!(strip && panel && foot)) {
    return ["the pane has no tab strip, panel or composer"];
  }
  return [
    ...(panel.top - strip.bottom > 11.5 || panel.top < strip.bottom - 0.5
      ? [
          `the panel starts ${(panel.top - strip.bottom).toFixed(1)}px from its strip`,
        ]
      : []),
    ...(panel.bottom > foot.top + 0.5
      ? [
          `the panel runs ${(panel.bottom - foot.top).toFixed(1)}px under the composer`,
        ]
      : []),
    ...(strip.bottom > view ? ["the strip stands below the screen"] : []),
  ];
};

/** The words of the empty and failed blocks and how each is aligned. */
const blockAlign = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".empty-title, .empty-line, .fault-what, .fault-why"
      ),
    ]
      .filter((words) => words.getBoundingClientRect().width > 0)
      .map((words) => ({
        what: words.className,
        align: getComputedStyle(words).textAlign,
      }))
  );

/** Whether a board with more past an edge wears the edge fade on that edge. */
const edgeFade = (page: Page) =>
  page.evaluate(() => {
    const board = document.querySelector<HTMLElement>(".board");
    if (!board || board.hidden) {
      return { more: false, faded: true, detail: "no board" };
    }
    const past = board.scrollWidth - board.clientWidth;
    const start = past > 1 && board.scrollLeft > 1;
    const end = past > 1 && board.scrollLeft < past - 1;
    const mask = getComputedStyle(board).maskImage;
    const stops = mask.includes("gradient");
    return {
      more: start || end,
      faded: !(start || end) || stops,
      detail: `${Math.round(past)}px past, at ${Math.round(board.scrollLeft)}; mask ${mask.slice(0, 60)}`,
    };
  });

/** The preview page's frames: which show, and at what scale. */
const shownFrames = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".frame")]
      .filter((frame) => getComputedStyle(frame).display !== "none")
      .map((frame) => ({
        frame: frame.dataset.frame ?? "",
        scale: Number(
          getComputedStyle(frame.querySelector(".screen") as Element)
            .getPropertyValue("--s")
            .trim() || "1"
        ),
      }))
  );

/* ---------- Motion ---------- */

/** The keyword curves as their cubic-bezier (WebKit names ease-in-out by its keyword). */
const KEYWORDS: Record<string, string> = {
  ease: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  "ease-in-out": "cubic-bezier(0.42, 0, 0.58, 1)",
  "ease-out": "cubic-bezier(0, 0, 0.58, 1)",
  linear: "cubic-bezier(0, 0, 1, 1)",
};
const curveOf = (easing: string): string => KEYWORDS[easing] ?? easing;

/** A CSS cubic-bezier's progress at time fraction `x`. */
const bezier = (curve: string, x: number): number => {
  const numbers = curveOf(curve)
    .match(/-?[\d.]+/g)
    ?.map(Number);
  if (numbers?.length !== 4) {
    return x;
  }
  const [x1, y1, x2, y2] = numbers;
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < x) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return at(y1, y2, (lo + hi) / 2);
};

/**
 * One value read at each fraction of a run's own length: it moves the whole
 * way (each reading strictly between its ends) and keeps to the run's curve
 * within 0.06 of the change (no hold, no jump).
 */
const continuous = (
  values: number[],
  held: MotionRun | undefined
): { ok: boolean; detail: string } => {
  const [first = 0] = values;
  const last = values.at(-1) ?? first;
  const change = last - first;
  const progress = values.map((value) => (value - first) / (change || 1));
  const expected = FRACTIONS.map((x) => bezier(held?.easing ?? "", x));
  const between = progress.slice(1, -1).every((p) => p > 0.001 && p < 0.999);
  const onCurve = progress.every((p, i) => Math.abs(p - expected[i]) <= 0.06);
  return {
    ok: Math.abs(change) > 0.01 && between && onCurve,
    detail: `${values.map((value) => value.toFixed(2)).join(" → ")} (progress ${progress
      .map((p) => p.toFixed(2))
      .join(
        ", "
      )}; ${held?.easing ?? "no run"} gives ${expected.map((p) => p.toFixed(2)).join(", ")})`,
  };
};

interface Motion {
  /** Names of runs that must start, each with its token duration. */
  expect: [string, number][];
  /** The run whose length the fractions are of, and whose curve the reading follows. */
  of: string;
  read: (page: Page) => Promise<number>;
}

const readOne = async (
  kit: Kit,
  page: Page,
  name: string,
  action: () => Promise<unknown>,
  motion: Motion
): Promise<void> => {
  const held = await readMotion(page, action, "body", {
    fractions: FRACTIONS,
    of: motion.of,
    read: () => motion.read(page),
  });
  for (const [run, duration] of motion.expect) {
    const found = held.runs.find((each) => each.name === run);
    kit.check(
      `${name}: “${run}” runs ${duration}ms on a house curve`,
      Boolean(
        found &&
        Math.abs(found.end - found.delay - duration) < 1 &&
        HOUSE_CURVES.includes(curveOf(found.easing))
      ),
      found
        ? `${found.end - found.delay}ms, ${found.easing}`
        : `runs: ${held.runs.map((each) => each.name).join(", ")}`
    );
  }
  // Sought to 1 a run is at its end and leaves the page's runs, so it lands
  // where the page then rests: the reading at rest is the reading at 1.
  await still(page);
  const rest = await motion.read(page);
  const atOne = held.at.at(-1)?.value ?? Number.NaN;
  kit.check(
    `${name}: “${motion.of}” lands where the page then rests`,
    Number.isNaN(rest) ? Number.isFinite(atOne) : Math.abs(rest - atOne) <= 0.5,
    `at 1 ${atOne.toFixed(2)}, at rest ${Number.isNaN(rest) ? "gone (a copy in flight, or a surface put away)" : rest.toFixed(2)}`
  );
  const run = held.runs.find((each) => each.name === motion.of);
  const { ok, detail } = continuous(
    held.at.map((reading) => reading.value),
    run
  );
  kit.check(
    `${name}: “${motion.of}” moves continuously at 0, ¼, ½, ¾, 1`,
    ok,
    detail
  );
};

/** A box's edge; NaN once it is gone (removed, or hidden). */
const edgeOf = (selector: string, edge: "top" | "left") => (page: Page) =>
  page.evaluate(
    ([s, e]) => {
      const box = document.querySelector(s)?.getBoundingClientRect();
      return box && box.width + box.height > 0
        ? box[e as "top" | "left"]
        : Number.NaN;
    },
    [selector, edge]
  );
const topOf = (selector: string) => edgeOf(selector, "top");
const leftOf = (selector: string) => edgeOf(selector, "left");
const opacityOf = (selector: string) => (page: Page) =>
  page.evaluate((s) => {
    const element = document.querySelector(s);
    return element ? Number(getComputedStyle(element).opacity) : Number.NaN;
  }, selector);
const heightOf = (selector: string) => (page: Page) =>
  page.evaluate(
    (s) =>
      document.querySelector(s)?.getBoundingClientRect().height ?? Number.NaN,
    selector
  );

const motions = async (
  kit: Kit,
  origin: string,
  engine: (typeof ENGINES)[number]
): Promise<void> => {
  const desk = await kit.page("desk", { engine });
  listen(desk, `motion ${engine} desk`);
  await openFrame(desk, origin, "rest");
  const manual = () =>
    desk.evaluate(() => {
      (
        window as unknown as { preview: { state: { auto: boolean } } }
      ).preview.state.auto = false;
    });
  await manual();
  const setState = (page: Page, state: string) => () =>
    page.evaluate((s) => {
      (
        window as unknown as { preview: { setState: (x: string) => void } }
      ).preview.setState(s);
    }, state);

  await readOne(
    kit,
    desk,
    `${engine} waiting on him`,
    setState(desk, "waiting"),
    {
      of: "needs-reflow",
      expect: [
        ["needs-reflow", 280],
        ["band-tint", 280],
        ["needs-morph", 180],
        ["arc-in", 280],
      ],
      read: topOf('.card[data-id="tsk-16"]'),
    }
  );
  await readOne(kit, desk, `${engine} the pane opens`, setState(desk, "open"), {
    of: "title-flight",
    expect: [
      ["title-flight", 280],
      ["pane-in", 280],
    ],
    read: leftOf("body > .pane-title"),
  });
  await readOne(
    kit,
    desk,
    `${engine} an answer chip`,
    () => desk.click('.chip[data-answer="Correct them in place"]'),
    {
      of: "card-settle",
      expect: [
        ["card-settle", 280],
        ["band-fade", 280],
        ["ask-fold", 160],
        ["needs-morph", 180],
        ["arc-out", 280],
      ],
      read: topOf('.card[data-id="tsk-16"]'),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} the answered ask folds`,
    () => desk.click('[data-act="approve"]'),
    {
      of: "card-land",
      expect: [
        ["card-land", 280],
        ["review-fold", 160],
        ["pill-morph", 180],
      ],
      read: leftOf('.card[data-id="tsk-16"]'),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} a tab`,
    () => desk.click('.ptab[data-tab="task"]'),
    {
      of: "translate",
      expect: [
        ["translate", 160],
        ["panel-in", 160],
      ],
      read: leftOf(".ptabs-thumb"),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} the ⋯ menu`,
    () => desk.click('[data-act="more"]'),
    {
      of: "opacity",
      expect: [["opacity", 260]],
      read: opacityOf(".pop"),
    }
  );
  await desk.keyboard.press("Escape");

  await setState(desk, "empty")();
  await still(desk);
  await readOne(
    kit,
    desk,
    `${engine} a suggestion`,
    () => desk.click(".starter"),
    {
      of: "draft-in",
      expect: [["draft-in", 120]],
      read: opacityOf('[data-slot="hero-field"]'),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} Send from the empty project`,
    () => desk.click(".composer-hero .composer-send"),
    {
      of: "field-flight",
      expect: [
        ["field-flight", 280],
        ["caw-col-in", 280],
        ["caw-leave", 200],
        ["empty-out", 200],
        ["board-reveal", 400],
        ["thread-arrive", 260],
      ],
      read: topOf("body > .composer"),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} the filed tasks arrive`,
    () =>
      desk.evaluate(() => {
        (
          window as unknown as { preview: { fileTasks: () => void } }
        ).preview.fileTasks();
      }),
    {
      of: "filed-arrive",
      expect: [["filed-arrive", 260]],
      read: opacityOf('.card[data-id="tw-1"]'),
    }
  );

  await setState(desk, "fault")();
  await still(desk);
  await desk.click('[data-act="retry"]');
  await readOne(
    kit,
    desk,
    `${engine} the hub answers a Retry`,
    () =>
      desk.evaluate(() => {
        (
          window as unknown as { preview: { hubAnswers: () => void } }
        ).preview.hubAnswers();
      }),
    {
      of: "board-reveal",
      expect: [
        ["board-reveal", 400],
        ["fault-out", 200],
      ],
      read: opacityOf('[data-slot="board"]'),
    }
  );
  await setState(desk, "fault")();
  await still(desk);
  await readOne(
    kit,
    desk,
    `${engine} Show details`,
    () => desk.click('[data-act="details"]'),
    {
      of: "details-unfold",
      expect: [["details-unfold", 260]],
      read: heightOf(".fault-details"),
    }
  );

  const phone = await kit.page("phone", { engine });
  listen(phone, `motion ${engine} phone`);
  await openFrame(phone, origin, "waiting");
  await readOne(
    kit,
    phone,
    `${engine} the phone's pane pushes in`,
    setState(phone, "open"),
    {
      of: "pane-push",
      expect: [
        ["pane-push", 280],
        ["page-fall", 280],
      ],
      read: leftOf('[data-slot="pane"]'),
    }
  );
  await readOne(
    kit,
    phone,
    `${engine} the phone's pane goes back`,
    () => phone.click('[data-act="close-pane"]'),
    {
      of: "pane-pop",
      expect: [
        ["pane-pop", 260],
        ["page-back", 260],
      ],
      read: leftOf('[data-slot="pane"]'),
    }
  );
};

/* ---------- The run ---------- */

/** One state of the frame, at one size on one engine: its boxes, its cards, Caw and the pane. */
const checkState = async (
  kit: Kit,
  page: Page,
  where: string,
  state: string
): Promise<void> => {
  const faults = [...(await boxFaults(page)), ...(await cutColumns(page))];
  kit.check(
    `${where}: nothing spills or overlaps, and no column is cut at the board's edge`,
    faults.length === 0,
    faults.slice(0, 6).join("; ")
  );
  const acts = await coralFills(page);
  kit.check(
    `${where}: exactly one coral-filled control in view`,
    acts.length === 1,
    acts.join(", ") || "none"
  );
  const boxed = await boxedGlyphs(page);
  kit.check(
    `${where}: no glyph stands in a box of its own`,
    boxed.length === 0,
    boxed.slice(0, 6).join("; ")
  );
  if (state === "empty") {
    const starters = await starterBoxes(page);
    const heights = starters.map((starter) => starter.height);
    kit.check(
      `${where}: the starters share one height, their words centred in it`,
      starters.length === 4 &&
        Math.max(...heights) - Math.min(...heights) <= 0.5 &&
        starters.every((starter) => starter.off <= 1),
      starters
        .map(
          (starter) =>
            `${starter.height.toFixed(1)} (words ${starter.off.toFixed(1)}px off centre)`
        )
        .join(", ")
    );
  }
  const off = offGrammar(await cardLines(page));
  kit.check(
    `${where}: every card keeps its stage's grammar`,
    off.length === 0,
    off.slice(0, 6).join("; ")
  );
  for (const axis of await cawAxis(page)) {
    kit.check(
      `${where}: Caw stands on the axis`,
      Math.abs(axis.caw - axis.block) <= 1 &&
        Math.abs(axis.block - axis.column) <= 1,
      `Caw ${axis.caw.toFixed(2)}, his block ${axis.block.toFixed(2)}, the page column ${axis.column.toFixed(2)}`
    );
  }
  if (state === "empty" || state === "fault") {
    const centred = (await blockAlign(page)).filter(
      ({ align }) => !["start", "left"].includes(align)
    );
    kit.check(
      `${where}: the block's words start at its edge`,
      centred.length === 0,
      centred.map(({ align, what }) => `${what} ${align}`).join(", ")
    );
  }
  const fade = await edgeFade(page);
  kit.check(
    `${where}: the board fades at an edge with more past it`,
    fade.faded,
    fade.detail
  );
  if (state === "open") {
    const pane = paneFaults(await paneParts(page));
    kit.check(
      `${where}: the tab strip stands over its whole panel`,
      pane.length === 0,
      pane.join("; ")
    );
    const count = await cardsBeforeTabs(page);
    kit.check(
      `${where}: the pane shows at most two cards before its tabs`,
      count >= 1 && count <= 2,
      `${count}`
    );
  }
};

/** Every state and fork the size shows (the columns fork under the drawer's line only). */
const LEGS = (size: View): [string, string][] =>
  size === "desk"
    ? STATES.map((state) => [state, "list"])
    : [
        ...STATES.map((state): [string, string] => [state, "list"]),
        ["rest", "columns"],
        ["waiting", "columns"],
      ];

/** The preview page itself at one size: which frames show and whether it holds them. */
const checkShell = async (
  kit: Kit,
  page: Page,
  where: string
): Promise<void> => {
  const frames = await shownFrames(page);
  const narrow = (page.viewportSize()?.width ?? 0) < 1100;
  kit.check(
    `${where}: the preview shows ${narrow ? "one frame, readable" : "both frames"}`,
    narrow
      ? frames.length === 1 &&
          frames.every(
            ({ frame, scale }) => scale >= (frame === "desk" ? 1 : 0.9)
          )
      : frames.length === 2,
    frames
      .map(({ frame, scale }) => `${frame} at ${scale.toFixed(2)}`)
      .join(", ")
  );
  const shell = await boxFaults(page);
  kit.check(
    `${where}: the preview page holds its frames`,
    shell.length === 0,
    shell.join("; ")
  );
};

const boxes = async (kit: Kit, origin: string): Promise<void> => {
  for (const engine of ENGINES) {
    for (const size of SIZES) {
      const page = await kit.page(size, { engine });
      listen(page, `${engine} ${size}`);
      await page.goto(`${origin}/index.html`);
      await page.waitForFunction(() => document.fonts.status === "loaded");
      await checkShell(kit, page, `${engine} ${size}`);
      for (const [state, layout] of LEGS(size)) {
        await openFrame(page, origin, state, layout);
        await checkState(
          kit,
          page,
          `${engine} ${size} ${state}${layout === "columns" ? " (columns)" : ""}`,
          state
        );
      }
      if (size === "desk") {
        await openFrame(page, origin, "rest");
        await page.click('[data-act="dropped"]');
        await still(page);
        await checkState(
          kit,
          page,
          `${engine} ${size} rest, Dropped open`,
          "rest"
        );
      }
    }
  }
};

const probe = async (kit: Kit): Promise<void> => {
  const server = serve();
  const origin = `http://127.0.0.1:${server.port}`;
  try {
    await boxes(kit, origin);
    for (const engine of ENGINES) {
      await motions(kit, origin, engine);
    }
    kit.check(
      "no page said a console error",
      errors.length === 0,
      errors.slice(0, 8).join("; ")
    );
  } finally {
    server.stop(true);
  }
};

const spec: Spec = { name: "project-preview", run: probe };
export default spec;
