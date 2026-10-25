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
 * - "needs you" said once per kind on each width: in words once (the
 *   head's filter on a desk, the Needs-you lane's head on a phone, which
 *   leads both forks), and as the spark band on a desk or the view bar's
 *   chip on a phone; no control inside an
 *   anchor; the permission's card answers with Deny then Approve, the
 *   question's with Answer;
 * - Caw's column: his name and ✕ in the head with no mark, the asks first
 *   with their acts, a brand-solid rule, then his notes each led by his
 *   mark; a first thread on the empty recipe (Caw on the axis, words at the
 *   start, three starters), its composer with no card of its own;
 * - while an ask stands the verdict is outline (no coral but Ask Caw's, or
 *   none where Ask Caw is out of view); answered, Approve takes the coral;
 *   Send back's note unfolds where Approve stood and Send back stays put;
 * - from 640 to 900 the board's list runs two-up, its columns fork shows two
 *   columns, and the starters stand two-up; under 640, one-up;
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
 * - the top bar's glass stands whole 4px in on a desk; on a phone it hangs
 *   from Caw's tucked tab: flush and square at the screen's trailing edge
 *   with no edge drawn there, a whole pill at its leading side, none of it
 *   off screen;
 * - the open pane's card runs on under its verdict bar beneath the house
 *   edge fade (40px, a phone's 16px) with nothing of it below the bar; at
 *   the card's foot that fade is gone and the scroller's head fades;
 * - Caw's calm loops (the Working glyph's breath, his running note's dot)
 *   run only while something waits on him: at rest nothing moves, and once
 *   the last ask is answered each finishes the breath it is in and settles
 *   at full ink;
 * - each block Caw heads hugs what it holds (a line's drawn reach, wrapped
 *   words' own box, a control's box), so his axis is its own;
 * - the sweep: no box cut at the side of what clips it or the screen (the
 *   board alone runs sideways), no two runs of words drawn over each other
 *   where they show; its total at 390, 680 and 1440 is zero;
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
const STATES = ["rest", "waiting", "open", "empty", "fault", "first"] as const;
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
  layout = "list",
  scheme = "light"
): Promise<void> => {
  await page.goto(
    `${origin}/frame.html?state=${state}&layout=${layout}&scheme=${scheme}`
  );
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

/**
 * Caw's body centre against the composition's axis: read from his still in
 * the page, as the stills were centred. His body is the largest shape his
 * opaque pixels (alpha 128 and over) make, 8-connected, so a detached mark
 * (a sparkle, a held card standing apart) is left out; its centre is the
 * alpha-weighted mean of its columns, scaled from the still to his box.
 * Also his box's centre against his block's, and the block's against the
 * page column's.
 */
const cawAxis = (page: Page) =>
  page.evaluate(async () => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it runs in the page as one function; the flood fill is its body
    const bodyCentre = async (img: HTMLImageElement): Promise<number> => {
      await img.decode();
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const pen = canvas.getContext("2d");
      if (!pen) {
        return Number.NaN;
      }
      pen.drawImage(img, 0, 0);
      const { data } = pen.getImageData(0, 0, w, h);
      const alpha = (i: number) => data[i * 4 + 3];
      const seen = new Uint8Array(w * h);
      let best: number[] = [];
      for (let start = 0; start < w * h; start += 1) {
        if (seen[start] || alpha(start) < 128) {
          continue;
        }
        const shape: number[] = [];
        const queue = [start];
        seen[start] = 1;
        while (queue.length > 0) {
          const i = queue.pop() as number;
          shape.push(i);
          const x = i % w;
          const y = (i - x) / w;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = x + dx;
              const ny = y + dy;
              const j = ny * w + nx;
              if (
                nx >= 0 &&
                nx < w &&
                ny >= 0 &&
                ny < h &&
                !seen[j] &&
                alpha(j) >= 128
              ) {
                seen[j] = 1;
                queue.push(j);
              }
            }
          }
        }
        if (shape.length > best.length) {
          best = shape;
        }
      }
      let mass = 0;
      let moment = 0;
      for (const i of best) {
        mass += alpha(i);
        moment += ((i % w) + 0.5) * alpha(i);
      }
      return moment / mass;
    };
    const centre = (box: DOMRect) => box.left + box.width / 2;
    /** The composition he heads: the page's column, or Caw's column's. */
    const axisOf = (caw: Element): number => {
      const field = (caw.closest(".caw-col") ??
        document.querySelector("#page")) as HTMLElement;
      const frame = field.getBoundingClientRect();
      const pad = getComputedStyle(field);
      return (
        (frame.left +
          Number.parseFloat(pad.paddingLeft) +
          frame.right -
          Number.parseFloat(pad.paddingRight)) /
        2
      );
    };
    const cawImages = [
      ...document.querySelectorAll<HTMLImageElement>(
        ".caw-hero, .caw-fault, .caw-first"
      ),
    ].filter((caw) => caw.getBoundingClientRect().width > 0);
    return await Promise.all(
      cawImages.map(async (caw) => {
        const drawn = caw.getBoundingClientRect();
        const bodyX = await bodyCentre(caw);
        return {
          who: caw.className,
          caw: centre(drawn),
          body: drawn.left + (bodyX / caw.naturalWidth) * drawn.width,
          block: centre(
            (caw.parentElement as HTMLElement).getBoundingClientRect()
          ),
          column: axisOf(caw),
        };
      })
    );
  });

/**
 * Every run of words in view and its contrast against what is drawn under
 * it: its ink over the fills of its own box and every box behind it, down to
 * the first opaque one, a background image counted as its first colour (the
 * coral action's gradient). Large words (24px, or 18.66px at 500 and over)
 * need 3:1, the rest 4.5:1 (WCAG 2.2, 1.4.3). The lowest is reported.
 */
const contrasts = (page: Page) =>
  page.evaluate(() => {
    const pen = document.createElement("canvas").getContext("2d");
    const rgba = (colour: string): number[] => {
      if (!pen) {
        return [0, 0, 0, 0];
      }
      pen.clearRect(0, 0, 1, 1);
      pen.fillStyle = "rgba(0, 0, 0, 0)";
      pen.fillStyle = colour;
      pen.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: number[], back: number[]) => {
      const [, , , a] = top;
      return [0, 1, 2].map((c) => top[c] * a + back[c] * (1 - a)).concat([1]);
    };
    const firstColour = (image: string): string | null => {
      const found = image.indexOf("gradient(");
      if (found < 0) {
        return null;
      }
      const rest = image.slice(found + "gradient(".length);
      const [start] = ["rgb", "oklch", "oklab", "color", "lab", "lch"]
        .map((name) => rest.indexOf(`${name}(`))
        .filter((at) => at >= 0)
        .sort((x, y) => x - y);
      if (start === undefined) {
        return null;
      }
      const close = rest.indexOf(")", start);
      return rest.slice(start, close + 1);
    };
    const ground = (element: Element): number[] => {
      const layers: number[][] = [];
      for (let at: Element | null = element; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        const image = firstColour(style.backgroundImage);
        if (image) {
          layers.push(rgba(image));
        }
        const fill = rgba(style.backgroundColor);
        if (fill[3] > 0) {
          layers.push(fill);
        }
        if (layers.some((layer) => layer[3] >= 1)) {
          break;
        }
      }
      let base = [255, 255, 255, 1];
      for (const layer of layers.reverse()) {
        base = over(layer, base);
      }
      return base;
    };
    const lum = ([r, g, b]: number[]) => {
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const runs = [...document.querySelectorAll("body *")].filter((element) => {
      if (
        element.closest(
          "[aria-hidden='true'], .visually-hidden, svg, textarea"
        ) ||
        ![...element.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()
        )
      ) {
        return false;
      }
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth &&
        style.visibility === "visible" &&
        style.opacity === "1"
      );
    });
    let lowest = { ratio: Number.POSITIVE_INFINITY, what: "", need: 4.5 };
    const under: string[] = [];
    for (const element of runs) {
      const style = getComputedStyle(element);
      const back = ground(element);
      const ink = over(rgba(style.color), back);
      const [hi, lo] = [lum(ink), lum(back)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = Number.parseFloat(style.fontSize);
      const large =
        size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 500);
      const need = large ? 3 : 4.5;
      const what = `${element.localName}.${[...element.classList].join(".")} “${(element.textContent ?? "").trim().slice(0, 24)}”`;
      if (ratio < need) {
        under.push(`${what} ${ratio.toFixed(2)}`);
      }
      if (ratio / need < lowest.ratio / lowest.need) {
        lowest = { ratio, what, need };
      }
    }
    return { count: runs.length, lowest, under };
  });

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
    [1, 1],
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

/** Whether an ask stands open in view, and whether Ask Caw is in view. */
const askInView = (page: Page) =>
  page.evaluate(() => {
    const inView = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.right > 0 &&
        box.left < innerWidth &&
        box.top < innerHeight &&
        getComputedStyle(element).visibility === "visible"
      );
    };
    return {
      ask: [...document.querySelectorAll(".ask-sec:not(.is-answered)")].some(
        inView
      ),
      askCaw: [...document.querySelectorAll('[data-act="ask-caw"]')].some(
        inView
      ),
    };
  });

/** Runs of words naming "needs you" in view, the spark bands and the phone's chip. */
const needsSaid = (page: Page) =>
  page.evaluate(() => {
    const inView = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.right > 0 &&
        box.left < innerWidth &&
        box.top < innerHeight &&
        getComputedStyle(element).visibility === "visible"
      );
    };
    const said = [...document.querySelectorAll("body *")].filter(
      (element) =>
        !element.closest(".visually-hidden, [aria-hidden='true'], svg") &&
        [...element.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            /* "need you" or "needs you", in any case */
            ["need you", "needs you"].some((phrase) =>
              (node.textContent ?? "").toLowerCase().includes(phrase)
            )
        ) &&
        inView(element)
    );
    return {
      words: said.map((element) => (element.textContent ?? "").trim()),
      bands: [...document.querySelectorAll(".card[data-needs]")].filter(inView)
        .length,
      chip: [...document.querySelectorAll(".viewbar-needs")].some(inView),
      nested: document.querySelectorAll(
        "a button, a a, a input, button button, button a"
      ).length,
    };
  });

/** The acts on the two cards waiting on him: the pair's order and gap, and Answer. */
const cardAnswers = (page: Page) =>
  page.evaluate(() => {
    const pair = [
      ...document.querySelectorAll('.card[data-id="tsk-19"] [data-card-perm]'),
    ];
    const [deny, approve] = pair.map((button) =>
      button.getBoundingClientRect()
    );
    return {
      order: pair.map((button) => (button.textContent ?? "").trim()),
      gap: deny && approve ? approve.left - deny.right : Number.NaN,
      answer: Boolean(
        document.querySelector('.card[data-id="tsk-16"] [data-card-answer]')
      ),
    };
  });

/** Caw's column as drawn: its head, its asks, the rule, his notes, a first thread. */
const cawColumn = (page: Page) =>
  page.evaluate(() => {
    const col = document.querySelector(".caw-col") as HTMLElement;
    const shown = (element: Element | null) =>
      Boolean(element && element.getBoundingClientRect().height > 0);
    const rule = document.querySelector('[data-slot="caw-rule"]');
    const rows = [...document.querySelectorAll(".need-row")];
    const notes = [...document.querySelectorAll(".thread .msg-caw")];
    const thread = document.querySelector('[data-slot="thread"]');
    const composer = document.querySelector(".composer-caw");
    const first = document.querySelector('[data-slot="caw-first"]');
    return {
      open: shown(col),
      headMark: Boolean(col.querySelector(".caw-col-head img")),
      head: (col.querySelector(".caw-col-name")?.textContent ?? "").trim(),
      rows: rows.length,
      rowActs: rows.filter((row) =>
        row.querySelector("[data-card-answer], [data-card-perm]")
      ).length,
      rule: shown(rule)
        ? getComputedStyle(rule as Element).backgroundColor
        : "",
      ruleAfterRows:
        !(rule && thread) ||
        rows.every(
          (row) =>
            row.getBoundingClientRect().bottom <=
            rule.getBoundingClientRect().top + 0.5
        ),
      notes: notes.length,
      notesLed: notes.filter(
        (note) =>
          note.firstElementChild?.classList.contains("caw-mark") ?? false
      ).length,
      first: shown(first),
      starters: document.querySelectorAll(".caw-starter").length,
      align: [
        ...document.querySelectorAll(".caw-start-title, .caw-start-line"),
      ].map((words) => getComputedStyle(words).textAlign),
      composerShadow: composer ? getComputedStyle(composer).boxShadow : "",
    };
  });

/** How many columns of cards stand side by side: distinct left edges in a group, and columns whole in the board. */
const across = (page: Page) =>
  page.evaluate(() => {
    const lefts = (selector: string) =>
      new Set(
        [...document.querySelectorAll(selector)]
          .slice(0, 6)
          .map((element) => Math.round(element.getBoundingClientRect().left))
          .filter((left) => left > -1)
      ).size;
    const board = document.querySelector(".board") as HTMLElement | null;
    const frame = board?.getBoundingClientRect();
    const whole = frame
      ? [...document.querySelectorAll(".board > .col")].filter((col) => {
          const box = col.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.left >= frame.left - 0.5 &&
            box.right <= frame.right + 0.5
          );
        }).length
      : 0;
    return {
      cards: lefts('.col[data-col="ready"] .card'),
      columns: whole,
      starters: lefts(".starter"),
    };
  });

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
        ".empty-title, .empty-line, .fault-what, .fault-why, .caw-start-title, .caw-start-line"
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

/**
 * The top bar's glass: how far in from the screen's trailing edge, its
 * leading and trailing corners and edges, and whether any of it is off
 * screen. On a phone it hangs from Caw's tucked tab (DESIGN.md, Caw's
 * panel): its trailing side is the screen's edge, square, with no edge drawn.
 */
const glassShape = (page: Page) =>
  page.evaluate(() => {
    const glass = document.querySelector(".glass") as HTMLElement;
    const box = glass.getBoundingClientRect();
    const style = getComputedStyle(glass);
    const view = document.documentElement.clientWidth;
    const px = (value: string) => Number.parseFloat(value);
    return {
      inset: view - box.right,
      off: Math.max(-box.left, box.right - view, 0),
      half: box.height / 2,
      leadEdge: px(style.borderLeftWidth),
      trailEdge: px(style.borderRightWidth),
      lead: [px(style.borderTopLeftRadius), px(style.borderBottomLeftRadius)],
      trail: [
        px(style.borderTopRightRadius),
        px(style.borderBottomRightRadius),
      ],
    };
  });

/**
 * The pane's scroller at its verdict bar: whether the card runs on under
 * the bar, the fade drawn over its top edge then (its opacity, length and
 * paint), and how much of the card shows below the bar.
 */
const verdictFade = (page: Page) =>
  page.evaluate(() => {
    const scroll = document.querySelector(".pane-scroll") as HTMLElement | null;
    const bar = document.querySelector('[data-slot="decision"]');
    if (!(scroll && bar)) {
      return null;
    }
    const card = bar.closest(".pcard") as HTMLElement;
    const fade = getComputedStyle(bar, "::before");
    const barBox = bar.getBoundingClientRect();
    const view = scroll.getBoundingClientRect();
    return {
      under: card.getBoundingClientRect().bottom - barBox.bottom > 1.5,
      opacity: Number(fade.opacity),
      length: Number.parseFloat(fade.height),
      paint: fade.backgroundImage,
      below:
        Math.min(view.bottom, card.getBoundingClientRect().bottom) -
        barBox.bottom,
      startMask: getComputedStyle(scroll).maskImage,
      scrollTop: scroll.scrollTop,
    };
  });

/** Every animation running in the page, by name, and how many glyphs breathe. */
const runningNow = (page: Page) =>
  page.evaluate(() => {
    const { needs } = (
      window as unknown as {
        preview: { state: { needs: Record<string, unknown> } };
      }
    ).preview.state;
    const running = document
      .getAnimations()
      .filter((animation) => animation.playState === "running");
    return {
      running: running.map(
        (animation) =>
          `${animation.id || (animation as CSSAnimation).animationName || "transition"}×${animation.effect?.getComputedTiming().iterations}`
      ),
      breaths: running.filter(
        (animation) =>
          animation.id === "breath" &&
          animation.effect?.getComputedTiming().iterations ===
            Number.POSITIVE_INFINITY
      ).length,
      breathers: document.querySelectorAll(".breathe").length,
      attend: Object.keys(needs).length > 0,
    };
  });

/**
 * Each block Caw heads (the empty project's, the failure's, a first
 * thread's): its box against the reach of what it holds besides him (the
 * words' drawn lines, the boxes of its controls). The block hugs that
 * reach, so his axis is its axis.
 */
const cawHug = (page: Page) =>
  page.evaluate(() => {
    const draws = (element: Element): boolean => {
      const style = getComputedStyle(element);
      return (
        element.matches("button, form, textarea, input, a") ||
        style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        style.boxShadow !== "none" ||
        Number.parseFloat(style.borderTopWidth) > 0
      );
    };
    const reach = (
      element: Element
    ): { left: number; right: number; lines: number }[] => {
      const box = element.getBoundingClientRect();
      if (
        box.width === 0 ||
        getComputedStyle(element).visibility !== "visible"
      ) {
        return [];
      }
      // A control or a drawn box reaches its own edges.
      if (draws(element)) {
        return [{ left: box.left, right: box.right, lines: 1 }];
      }
      const worded = [...element.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()
      );
      if (worded) {
        // One line reaches as far as it is drawn; words that wrap reach
        // the measure they wrap in (their own box).
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = [...range.getClientRects()].filter(
          (rect) => rect.width > 0
        );
        const lines = new Set(rects.map((rect) => Math.round(rect.top))).size;
        return lines > 1
          ? [{ left: box.left, right: box.right, lines }]
          : [
              {
                left: Math.min(...rects.map((rect) => rect.left)),
                right: Math.max(...rects.map((rect) => rect.right)),
                lines,
              },
            ];
      }
      return [...element.children].flatMap(reach);
    };
    return [
      ...document.querySelectorAll<HTMLImageElement>(
        ".caw-hero, .caw-fault, .caw-first"
      ),
    ]
      .filter((caw) => caw.getBoundingClientRect().width > 0)
      .map((caw) => {
        const block = caw.parentElement as HTMLElement;
        const box = block.getBoundingClientRect();
        const held = [...block.children]
          .filter((kid) => kid !== caw)
          .flatMap(reach);
        return {
          who: caw.className,
          left: Math.min(...held.map((each) => each.left)) - box.left,
          right: box.right - Math.max(...held.map((each) => each.right)),
          width: box.width,
        };
      });
  });

/**
 * The page-wide sweep, on what is drawn where it shows: every box cut by
 * the box that clips it, or the screen, at its sides (the board alone runs
 * sideways by design, its edges faded, and a truncating line ends in its
 * ellipsis), and every two runs of words drawn over each other. A run is
 * read where it shows: inside every box that clips it, and clear of a
 * layer standing over it (a sheet, a pinned bar).
 */
const sweep = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    interface Rect {
      bottom: number;
      left: number;
      right: number;
      top: number;
    }
    const shown = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.visibility === "visible" &&
        !element.closest(".visually-hidden, .sprite")
      );
    };
    const clips = (element: Element): boolean => {
      const style = getComputedStyle(element);
      return style.overflowX !== "visible" || style.overflowY !== "visible";
    };
    const inner = (element: Element): Rect => {
      const box = element.getBoundingClientRect();
      const left = box.left + element.clientLeft;
      const top = box.top + element.clientTop;
      return {
        left,
        top,
        right: left + element.clientWidth,
        bottom: top + element.clientHeight,
      };
    };
    const meet = (a: Rect, b: Rect): Rect => ({
      left: Math.max(a.left, b.left),
      top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right),
      bottom: Math.min(a.bottom, b.bottom),
    });
    const screen: Rect = {
      left: 0,
      top: 0,
      right: document.documentElement.clientWidth,
      bottom: innerHeight,
    };
    const name = (element: Element) =>
      `${element.localName}.${[...element.classList].join(".")} “${(element.textContent ?? "").trim().slice(0, 20)}”`;
    const all = [...document.querySelectorAll(".app *")].filter(shown);

    /** The nearest box that clips this one, or none (the screen). */
    const clipperOf = (element: Element): Element | null => {
      let at = element.parentElement;
      while (at && at !== document.body && !clips(at)) {
        at = at.parentElement;
      }
      return at && at !== document.body ? at : null;
    };
    /** A clip by design: the board's sideways run, a truncating line's ellipsis or clamp. */
    const meant = (host: Element): boolean => {
      const style = getComputedStyle(host);
      return (
        host.matches(".board") ||
        style.textOverflow === "ellipsis" ||
        style.getPropertyValue("-webkit-line-clamp") !== "none"
      );
    };
    const cut = all.flatMap((element) => {
      const host = clipperOf(element);
      if (host && meant(host)) {
        return [];
      }
      const edge = host ? inner(host) : screen;
      const box = element.getBoundingClientRect();
      const over = Math.max(edge.left - box.left, box.right - edge.right);
      return over > 0.5
        ? [
            `${name(element)} is cut ${over.toFixed(1)}px at the side of ${host ? name(host) : "the screen"}`,
          ]
        : [];
    });

    /** What of a box shows: inside every box that clips it and the screen. */
    const showing = (element: Element): Rect => {
      let rect: Rect = element.getBoundingClientRect();
      for (let at = clipperOf(element); at; at = clipperOf(at)) {
        rect = meet(rect, inner(at));
      }
      return meet(rect, screen);
    };
    const layers = all.filter(
      (element) =>
        element.matches(".pane, .caw-col, .decision, .col-head") &&
        ["absolute", "fixed", "sticky"].includes(
          getComputedStyle(element).position
        )
    );
    /** A layer as wide as the run cuts it at its own top or foot. */
    const trim = (rect: Rect, over: Rect): Rect => {
      if (over.top <= rect.top + 0.5 && over.bottom > rect.top) {
        return { ...rect, top: Math.max(rect.top, over.bottom) };
      }
      if (over.bottom >= rect.bottom - 0.5 && over.top < rect.bottom) {
        return { ...rect, bottom: Math.min(rect.bottom, over.top) };
      }
      return rect;
    };
    const holds = (over: Rect, rect: Rect): boolean => {
      const x = (rect.left + rect.right) / 2;
      const y = (rect.top + rect.bottom) / 2;
      return x > over.left && x < over.right && y > over.top && y < over.bottom;
    };
    /** One layer over a run: as wide as it, it cuts it; over its middle, it hides it. */
    const under = (rect: Rect, over: Rect): Rect | null => {
      if (over.left <= rect.left + 0.5 && over.right >= rect.right - 0.5) {
        return trim(rect, over);
      }
      return holds(over, rect) ? null : rect;
    };
    const some = (rect: Rect | null): Rect | null =>
      rect && rect.right - rect.left > 0.5 && rect.bottom - rect.top > 0.5
        ? rect
        : null;
    /** What of a run shows clear of every layer standing over it. */
    const clear = (element: Element, rect: Rect): Rect | null => {
      let left: Rect | null = rect;
      for (const layer of layers) {
        if (left && !(layer.contains(element) || element.contains(layer))) {
          left = under(left, layer.getBoundingClientRect());
        }
      }
      return some(left);
    };
    /** A run at no opacity (a label's other wording, held in its cell) draws nothing. */
    const inked = (element: Element): boolean => {
      for (let at: Element | null = element; at; at = at.parentElement) {
        if (Number(getComputedStyle(at).opacity) === 0) {
          return false;
        }
      }
      return true;
    };
    const runs = all
      .filter(
        (element) =>
          inked(element) &&
          [...element.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE &&
              (node.textContent ?? "").trim()
          )
      )
      .flatMap((element) => {
        const rect = clear(element, showing(element));
        return rect ? [{ element, rect }] : [];
      });
    const covers: string[] = [];
    runs.forEach((one, i) => {
      for (const other of runs.slice(i + 1)) {
        if (
          one.element.contains(other.element) ||
          other.element.contains(one.element)
        ) {
          continue;
        }
        const both = meet(one.rect, other.rect);
        const w = both.right - both.left;
        const h = both.bottom - both.top;
        if (w > 0.5 && h > 0.5) {
          covers.push(
            `${name(one.element)} and ${name(other.element)} drawn over each other (${w.toFixed(1)}×${h.toFixed(1)})`
          );
        }
      }
    });
    return [...cut, ...covers];
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

/** The sweep's faults over every state read, by the width read at. */
const sweepTotals = new Map<number, number>();

/**
 * The open pane's verdict bar: while the card runs on under it, the house
 * edge fade (40px, a phone's 16px) stands over its top and nothing of the
 * card shows below it; scrolled to the card's foot the fade is gone, and
 * the scroller's head fades instead. The scroll is put back as found.
 */
const checkVerdictFade = async (
  kit: Kit,
  page: Page,
  where: string
): Promise<void> => {
  const length = (page.viewportSize()?.width ?? 0) < 640 ? 16 : 40;
  const top = await verdictFade(page);
  const scrollTo = (to: "end" | "start") =>
    page.evaluate((end) => {
      const scroll = document.querySelector(".pane-scroll") as HTMLElement;
      scroll.scrollTop = end === "end" ? scroll.scrollHeight : 0;
    }, to);
  await scrollTo("end");
  await still(page);
  const foot = await verdictFade(page);
  await scrollTo("start");
  await still(page);
  const back = await verdictFade(page);
  kit.check(
    `${where}: the card runs on under the verdict bar beneath the house edge fade, and none of it shows below the bar`,
    Boolean(
      top?.under &&
      top.opacity === 1 &&
      Math.abs(top.length - length) <= 0.5 &&
      top.paint.includes("gradient") &&
      top.below <= 0.5
    ),
    top
      ? `under ${top.under}, fade ${top.opacity} × ${top.length}px (${top.paint.slice(0, 40)}), ${top.below.toFixed(1)}px of card below the bar`
      : "no verdict bar"
  );
  kit.check(
    `${where}: at the card's foot the bar's fade is gone and the scroller's head fades; back at the top, its head is sharp`,
    Boolean(
      foot &&
      back &&
      !foot.under &&
      foot.opacity === 0 &&
      foot.startMask.includes("gradient") &&
      back.under &&
      back.opacity === 1 &&
      back.startMask === "none"
    ),
    `foot: under ${foot?.under}, fade ${foot?.opacity}, head ${foot?.startMask.slice(0, 30)}; top again: fade ${back?.opacity}, head ${back?.startMask.slice(0, 30)}`
  );
};

/**
 * Both asks answered from the board: each breathing glyph finishes the
 * breath it is in (still running, now finite) and settles at full ink, and
 * then nothing runs.
 */
const checkSettle = async (
  kit: Kit,
  page: Page,
  origin: string,
  where: string
): Promise<void> => {
  await openFrame(page, origin, "waiting");
  await page.click('.card[data-id="tsk-19"] [data-card-perm="approve"]');
  await still(page);
  await page.click('.card[data-id="tsk-16"] [data-card-answer]');
  await still(page);
  await page.click('.chip[data-answer="Correct them in place"]');
  const finishing = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.id === "breath")
      .map((animation) => ({
        state: animation.playState,
        iterations: Number(animation.effect?.getComputedTiming().iterations),
      }))
  );
  await page.waitForFunction(
    () =>
      !document.getAnimations().some((animation) => animation.id === "breath"),
    null,
    { timeout: 5000 }
  );
  await still(page);
  const after = await runningNow(page);
  const ink = await page.evaluate(() =>
    [...document.querySelectorAll(".breathe")].map((glyph) =>
      Number(getComputedStyle(glyph).opacity)
    )
  );
  kit.check(
    `${where}: answered, each breath finishes the one it is in and settles at full ink, then nothing runs`,
    finishing.length > 0 &&
      finishing.every(
        ({ iterations, state }) =>
          state === "running" && Number.isFinite(iterations)
      ) &&
      after.running.length === 0 &&
      ink.every((opacity) => opacity === 1),
    `as the last ask was answered: ${finishing.map(({ iterations, state }) => `${state} for ${iterations}`).join(", ") || "no breath"}; then ${after.running.join(", ") || "nothing running"}, ink ${ink.join(", ")}`
  );
};

/** The glass whole, the loops at rest, Caw's blocks hugging what they hold, and the sweep, in one state. */
const checkFixes = async (
  kit: Kit,
  page: Page,
  where: string
): Promise<void> => {
  const glass = await glassShape(page);
  const tucked = (page.viewportSize()?.width ?? 0) < 901;
  const shape = `${glass.inset.toFixed(1)}px in, ${glass.off.toFixed(1)}px off screen; leading corners ${glass.lead.join("/")}px, edge ${glass.leadEdge}px; trailing corners ${glass.trail.join("/")}px, edge ${glass.trailEdge}px`;
  kit.check(
    tucked
      ? `${where}: Caw's glass hangs from his tucked tab: flush and square at the screen's edge with no edge drawn there, a whole pill at its leading side, none of it off screen`
      : `${where}: the top bar's glass stands whole, 4px in from the trailing edge`,
    tucked
      ? Math.abs(glass.inset) <= 0.5 &&
          glass.off <= 0.5 &&
          glass.trail.every((radius) => radius === 0) &&
          glass.trailEdge === 0 &&
          glass.leadEdge >= 1 &&
          glass.lead.every((radius) => Math.abs(radius - glass.half) <= 0.5)
      : glass.inset >= 3.5 &&
          glass.off === 0 &&
          glass.trailEdge >= 1 &&
          new Set([...glass.lead, ...glass.trail]).size === 1,
    shape
  );
  const motion = await runningNow(page);
  kit.check(
    motion.attend
      ? `${where}: while something waits on him, his calm loops breathe, and only they run`
      : `${where}: at rest nothing moves, the Working glyph's breath included`,
    motion.attend
      ? motion.breaths === motion.breathers &&
          motion.running.length === motion.breaths
      : motion.running.length === 0,
    `${motion.running.join(", ") || "nothing running"}; ${motion.breathers} breathing glyph(s)`
  );
  for (const hug of await cawHug(page)) {
    kit.check(
      `${where}: ${hug.who}'s block hugs what he heads, so his axis is its own`,
      hug.left <= 0.5 && hug.right <= 0.5,
      `what he heads reaches ${hug.left.toFixed(1)}px and ${hug.right.toFixed(1)}px short of the ${hug.width.toFixed(1)}px block's edges`
    );
  }
  const swept = await sweep(page);
  const width = page.viewportSize()?.width ?? 0;
  sweepTotals.set(width, (sweepTotals.get(width) ?? 0) + swept.length);
  kit.check(
    `${where}: the sweep finds nothing past the screen and no words over words`,
    swept.length === 0,
    swept.slice(0, 6).join("; ")
  );
};

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
  const standing = await askInView(page);
  const asking = standing.ask && !standing.askCaw;
  kit.check(
    asking
      ? `${where}: no coral while the ask stands and Ask Caw is out of view`
      : `${where}: exactly one coral-filled control in view`,
    acts.length === (asking ? 0 : 1),
    acts.join(", ") || "none"
  );
  await checkNeeds(kit, page, where, state);
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
      `${where}: Caw's body stands on the axis`,
      Math.abs(axis.body - axis.column) <= 1 &&
        Math.abs(axis.caw - axis.block) <= 1 &&
        Math.abs(axis.block - axis.column) <= 1,
      `his body ${axis.body.toFixed(2)}, his box ${axis.caw.toFixed(2)}, his block ${axis.block.toFixed(2)}, the page column ${axis.column.toFixed(2)}`
    );
  }
  if (state === "empty" || state === "fault" || state === "first") {
    const centred = (await blockAlign(page)).filter(
      ({ align }) => !["start", "left"].includes(align)
    );
    kit.check(
      `${where}: the block's words start at its edge`,
      centred.length === 0,
      centred.map(({ align, what }) => `${what} ${align}`).join(", ")
    );
  }
  const ink = await contrasts(page);
  kit.check(
    `${where}: every run of words in view holds its contrast`,
    ink.under.length === 0,
    `${ink.count} runs; lowest ${ink.lowest.ratio.toFixed(2)}:1 against ${ink.lowest.need}:1, ${ink.lowest.what}${ink.under.length > 0 ? `; under: ${ink.under.slice(0, 6).join("; ")}` : ""}`
  );
  const fade = await edgeFade(page);
  kit.check(
    `${where}: the board fades at an edge with more past it`,
    fade.faded,
    fade.detail
  );
  await checkFixes(kit, page, where);
  if (state === "open") {
    await checkVerdictFade(kit, page, where);
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

/** "Needs you" once per kind, the cards' acts, and the 640–900 band, in one state. */
const checkNeeds = async (
  kit: Kit,
  page: Page,
  where: string,
  state: string
): Promise<void> => {
  const said = await needsSaid(page);
  kit.check(
    `${where}: no control stands inside an anchor`,
    said.nested === 0,
    `${said.nested}`
  );
  if (state === "waiting") {
    await checkWaiting(kit, page, where, said);
  }
  await checkBand(kit, page, where, state);
};

/** The waiting state: "needs you" once per kind, and each card's own act. */
const checkWaiting = async (
  kit: Kit,
  page: Page,
  where: string,
  said: Awaited<ReturnType<typeof needsSaid>>
): Promise<void> => {
  const desk = (page.viewportSize()?.width ?? 0) >= 901;
  // Under the drawer's line the Needs-you lane leads both forks: its head says it, the chip again.
  kit.check(
    `${where}: "needs you" said once in words, and once as ${desk ? "the spark band" : "the view bar's chip"}`,
    said.words.length === 1 && (desk ? said.bands > 0 : said.chip),
    `${said.words.join(" | ") || "no words"}; ${said.bands} band(s), chip ${said.chip}`
  );
  const answers = await cardAnswers(page);
  const coarse = await page.evaluate(
    () => matchMedia("(pointer: coarse)").matches
  );
  const gap = coarse ? 14 : 7;
  kit.check(
    `${where}: the permission's card answers Deny then Approve, ${gap}px apart, the question's with Answer`,
    answers.order.join(",") === "Deny,Approve" &&
      Math.abs(answers.gap - gap) <= 0.5 &&
      answers.answer,
    `${answers.order.join(", ")}, ${answers.gap.toFixed(1)}px apart, Answer ${answers.answer}`
  );
};

/** The board and the starters two-up from 640 to 900, one-up under 640. */
const checkBand = async (
  kit: Kit,
  page: Page,
  where: string,
  state: string
): Promise<void> => {
  const width = page.viewportSize()?.width ?? 0;
  if (width >= 640 && width < 901 && ["rest", "empty"].includes(state)) {
    const two = await across(page);
    const columns = page.url().includes("layout=columns");
    kit.check(
      `${where}: two-up between 640 and 900`,
      state === "empty"
        ? two.starters === 2
        : (columns ? two.columns : two.cards) === 2,
      `cards ${two.cards} across, ${two.columns} columns whole, starters ${two.starters} across`
    );
  }
  if (width < 640 && state === "rest" && !page.url().includes("columns")) {
    const one = await across(page);
    kit.check(`${where}: one-up under 640`, one.cards === 1, `${one.cards}`);
  }
};

/** Caw's column at rest on a live project (asks, rule, notes) or a first thread. */
const checkCaw = async (
  kit: Kit,
  page: Page,
  where: string,
  first: boolean
): Promise<void> => {
  const caw = await cawColumn(page);
  kit.check(
    `${where}: Caw's column heads with his name and ✕, no mark`,
    caw.open && !caw.headMark && caw.head === "Caw",
    `open ${caw.open}, mark ${caw.headMark}, head “${caw.head}”`
  );
  kit.check(
    `${where}: no card of its own round the column's composer`,
    caw.composerShadow === "none",
    caw.composerShadow
  );
  if (first) {
    kit.check(
      `${where}: a first thread on the empty recipe, three starters, words at the start`,
      caw.first &&
        caw.starters === 3 &&
        caw.align.every((align) => ["start", "left"].includes(align)),
      `first ${caw.first}, ${caw.starters} starters, ${caw.align.join(", ")}`
    );
    return;
  }
  kit.check(
    `${where}: the asks first with their acts, a brand-solid rule, then his notes led by his mark`,
    caw.rows === 2 &&
      caw.rowActs === 2 &&
      caw.rule !== "" &&
      caw.ruleAfterRows &&
      caw.notes >= 3 &&
      caw.notesLed === caw.notes,
    `${caw.rows} asks (${caw.rowActs} with acts), rule ${caw.rule || "none"}, ${caw.notes} notes (${caw.notesLed} led)`
  );
};

/** While an ask stands the verdict is outline; answered, Approve is coral; Send back's note unfolds where Approve stood. */
const checkDecision = async (
  kit: Kit,
  page: Page,
  where: string
): Promise<void> => {
  const isCoral = (selector: string) =>
    page.evaluate(
      (s) => document.querySelector(s)?.classList.contains("primary") ?? false,
      selector
    );
  const boxOf = (selector: string) =>
    page.evaluate((s) => {
      const box = document.querySelector(s)?.getBoundingClientRect();
      return box ? { left: box.left, top: box.top } : null;
    }, selector);
  const standing =
    (await isCoral('[data-act="approve"]')) ||
    (await isCoral('[data-act="send-back"]'));
  await page.click('.chip[data-answer="Correct them in place"]');
  await still(page);
  const answered = await isCoral('[data-act="approve"]');
  kit.check(
    `${where}: the verdict is outline while the ask stands, and Approve takes the coral once it's answered`,
    !standing && answered,
    `standing coral ${standing}, answered coral ${answered}`
  );
  const approveAt = await boxOf('[data-act="approve"]');
  const before = await boxOf('[data-act="send-back"]');
  await page.click('[data-act="send-back"]');
  await still(page);
  const after = await boxOf('[data-act="send-back-go"]');
  const note = await boxOf(".note-cell");
  const coral = await isCoral('[data-act="send-back-go"]');
  const gone = (await boxOf('[data-act="approve"]')) === null;
  kit.check(
    `${where}: Send back stays put and takes the coral; its note stands where Approve stood`,
    Boolean(
      before &&
      after &&
      note &&
      approveAt &&
      Math.abs(before.left - after.left) <= 0.5 &&
      Math.abs(before.top - after.top) <= 0.5 &&
      Math.abs(note.left - approveAt.left) <= 0.5
    ) &&
      coral &&
      gone,
    `Send back ${before?.left.toFixed(1)} → ${after?.left.toFixed(1)}, note at ${note?.left.toFixed(1)} where Approve stood at ${approveAt?.left.toFixed(1)}, coral ${coral}, Approve gone ${gone}`
  );
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

/** Caw's column opened on a live project and on a first thread, and the pane's decision. */
const checkFlows = async (
  kit: Kit,
  page: Page,
  origin: string,
  where: string
): Promise<void> => {
  await openFrame(page, origin, "waiting");
  const ask = (await page.$$('[data-act="ask-caw"]')).filter(Boolean);
  for (const button of ask) {
    if (await button.isVisible()) {
      await button.click();
      break;
    }
  }
  await still(page);
  await checkCaw(kit, page, `${where} Caw's column`, false);
  await checkState(kit, page, `${where} Caw's column`, "caw");
  await openFrame(page, origin, "first");
  await checkCaw(kit, page, `${where} first thread`, true);
  await openFrame(page, origin, "open");
  await checkDecision(kit, page, `${where} the pane's decision`);
  await checkSettle(kit, page, origin, `${where} the asks answered`);
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
      for (const state of ["waiting", "empty", "fault", "open", "first"]) {
        await openFrame(page, origin, state, "list", "dark");
        await checkState(kit, page, `${engine} ${size} ${state}, Night`, state);
      }
      await checkFlows(kit, page, origin, `${engine} ${size}`);
      await openFrame(page, origin, "rest", "list", "dark");
      if (size === "desk") {
        await page.click('[data-act="dropped"]');
        await still(page);
        await checkState(
          kit,
          page,
          `${engine} ${size} rest, Dropped open, Night`,
          "rest"
        );
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
    for (const width of [390, 680, 1440]) {
      kit.check(
        `the sweep at ${width} totals zero over both engines, every state, Day and Night`,
        sweepTotals.get(width) === 0,
        `${sweepTotals.get(width) ?? "no reading"}`
      );
    }
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
