/**
 * Ink on any artifact (Projects spec §5.10, D27; the artifact panel's surface brief, Artifact panel,
 * canvas and ink: "Ink on any artifact"). A pen inks at once, in every mode
 * of the pane; a finger and a mouse ink in its Draw mode alone (in Comment
 * they pin, in Interact they are the page's).
 *
 * The ink is an `<svg>` in the page's own document, at its origin and as big
 * as its scroll, so it scrolls with the page and never shifts; what stands past
 * that (a group on content an inner scroller holds below the page's foot) it
 * hides, or it would give the page a scroll of its own. It takes the pointer
 * only while a stroke is down. Strokes are Pointer Events, a pen's
 * or, in Draw, the main button's or a first finger's (`freehand`): their
 * coalesced events are the points (WebKit hands UIKit's coalesced touches,
 * WebKit PR 31329), their predicted events the live tail, drawn and never
 * kept, with the pen's pressure (a mouse's or a finger's middle one). Each is
 * drawn as perfect-freehand's outline (MIT, pinned at 1.2.3) in
 * `brand-solid`, 2.5px at middle pressure, thinner by less, never under 1px.
 *
 * While a stroke is down only its pointer data is read: no layout, no hit
 * test. When it lifts, what it marks is read once ({@link marksOf}): a loop
 * marks the elements it encloses, a line the ones it crosses, each found by
 * the browser's hit test at points inside the loop or along the line, then
 * taken out to the largest of its ancestors the stroke still encloses. The
 * smallest such set is the group's `over`; never the root or the body, nor a
 * container as big as the page, while anything else stands under it.
 *
 * A stroke group is the strokes made within two breaths of each other whose
 * boxes touch. It is anchored to the element holding what it marks (core
 * ink.ts) and kept in the doc's `ink` as fractions of that element's box, so
 * it is drawn again from the element's box wherever the element stands now:
 * on load, on a resize, when the element itself resizes, when the page's
 * content changes round it or a transition ends, when a scroller moves the
 * element, after a re-publish; and never while nothing changes. Its paths
 * are drawn once, from the element's origin, and kept: a scroller only moves
 * them ({@link Ink.follow}), reading every group's place before writing any,
 * so a frame of a scroller lays the page out once however many groups stand
 * (a 12,660-element decision page at a phone's CPU: 33 layouts a frame with 30
 * groups, its frames at 84 ms, each path outlined again in each).
 *
 * So what it stands on moves with what the stroke covers. The body stands
 * still in a page whose scroller is inside it (a decision page's first row),
 * and a scroller stands still over what it scrolls: a stroke over no content
 * in one stands on the content nearest it ({@link contentNear}), and a stroke
 * over a frame of another origin on the element its embed names there
 * ({@link reachIn}), so the frame's own scroll carries it too.
 * The element is found as a pin's is (core comments.ts `findAnchor`); a
 * page's group whose element stands missing for a while (absent.ts) goes to
 * `moved`. Its pins are pins.ts's.
 *
 * On a canvas the pen draws the canvas's own freedraw (Excalidraw), so this
 * layer stays off; the canvas's page tells the overlay where a stroke ended
 * (`cawco:stroke-end`) and the icon and its picks run on that element.
 */
import {
  type AnchorFound,
  changedAnchor,
  type PageAnchor,
  type PinnedElement,
  wordsFollow,
} from "@cawco/core/comments/anchor";
import { buryPin, newId, type Pin, readPins } from "@cawco/core/comments/model";
import type { DocMap } from "@cawco/core/doc-maps";
import { INK_LIMITS, type InkGroup, type InkPoint } from "@cawco/core/ink";
import { boxOf } from "@cawco/core/shapes";
import { getStroke } from "perfect-freehand";
import { absences } from "./absent";
import { artifact, PLACED } from "./artifact";
import { STAND_INS } from "./embeds";
import {
  type Box,
  clipOf,
  framesOf,
  frameWindows,
  grow,
  isFrame,
  meets,
  pageBox,
  rectOf,
  sizesIn,
} from "./frames";
import type { Pins } from "./pins";
import type { InkChrome, Pick } from "./radial";
import { scrollerRound, scrollsContent } from "./scrollers";

const SVG = "http://www.w3.org/2000/svg";

/**
 * perfect-freehand's outline: `size` is the width at middle pressure
 * (2.5px, Ink on any artifact); `thinning` 0.6 makes it 1px at none and 4px at full.
 */
const STROKE = {
  size: 2.5,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.4,
  simulatePressure: false,
  last: true,
} as const;

/** Elements a group names it marks, at most (core `INK_LIMITS`). */
const MARKED_MAX = INK_LIMITS.elementsPerGroup;
/** A stroke whose ends come this close, as a share of its box's longer side, is a loop. Our call. */
const LOOP_GAP = 0.35;
/** A loop's box is at least this big each way, px; a smaller one is a line or a tap. Our call. */
const LOOP_MIN = 24;
/** Points a loop's inside is hit-tested at, at most, on a grid: 16 by 16. Our call. */
const LOOP_GRID = 16;
/** Points a line is hit-tested at along itself, at most. Our call. */
const LINE_SAMPLES = 48;
/** Points a group asks the embeds under it about: no more than a frame holds unanswered (embeds.ts `ASKING_MOST`), so none overtakes another. */
const EMBED_ASKS = 8;
/** The grid a loop's inside is asked of an embed on: 3 by 3. Our call. */
const EMBED_GRID = 3;
/** How far past a loop's box an element may stand and still be enclosed, px. Our call. */
const ENCLOSE_SLACK = 8;
/** How far either side of a line an element may reach and still be crossed whole, px: about a line of text. Our call. */
const LINE_REACH = 24;
/** A container of the marked elements anchors them while its box is at most this many times their reach's. Our call. */
const CONTAINER_MOST = 2;
/** A pen's pressure when it reports none (a pen that does not measure it). */
const NO_PRESSURE = 0.5;
/** The pen's eraser in Pointer Events: its `button`, and its bit in `buttons`. */
const ERASER_BUTTON = 5;
const ERASER_BUTTONS = 32;
/** How far round its point the eraser reaches, px: the point and four around it. Our call. */
const REACH = [
  [0, 0],
  [4, 0],
  [-4, 0],
  [0, 4],
  [0, -4],
] as const;
/** How far apart two strokes' boxes may read and still touch, px. Our call: more than the kept fractions' rounding, less than a stroke's width. */
const TOUCH_SLACK = 1;
/** A stroke the eraser has crossed, until it lifts. Our call. */
const ERASING_OPACITY = "0.3";

/** A point in the page, px, with its pressure. */
type Point = [x: number, y: number, pressure: number];

/** What strokes mark: the element they stand on, whether on the words it scrolls itself (core `scrolled`), the elements they mark. */
interface Marks {
  anchor: Element;
  onOwnScroll: boolean;
  over: Element[];
}

/** A group as it stands now: read in one pass, then written. */
interface Stand {
  /** What is shown of it, in the page's px; null where nothing clips it. */
  clip: Box | null;
  el: Element;
  group: InkGroup;
  /** The box its fractions are of, in the page's px. */
  under: Box;
}

/** A group's nodes in the layer. */
interface DrawnGroup {
  clip: SVGRectElement | null;
  g: SVGGElement;
  /** What its paths were drawn at: its element's size, the ink's colour. */
  look: string;
  moved: SVGGElement;
  /** Its strokes' box from its element's origin, px. */
  own: Box;
  strokes: InkGroup["strokes"] | null;
}

/** The page's points in the viewport as it is scrolled now. */
const viewOf = (points: [number, number][]): [number, number][] =>
  points.map(([x, y]) => [x - scrollX, y - scrollY]);

/** What the overlay lends the ink: its own describers, the pins, the host's chrome. */
export interface InkDeps {
  /** What a page's mark stands on, read from `el` as it is now. */
  anchorOf: (el: Element) => PageAnchor;
  /** A mark's anchor as this page may read it, `at` when the mark was made (page.ts `anchorToday`). */
  anchorToday: (anchor: PageAnchor, at: string) => PageAnchor;
  chrome: InkChrome;
  describe: (el: Element) => PinnedElement;
  /** The deepest element at each of the viewport's points, inside same-origin frames; one hit test pass. */
  elementsAt: (points: [x: number, y: number][]) => (Element | null)[];
  /** What the embed in frame `el` names at the viewport's `x`, `y`, as its stand-in; the frame for its page as a whole; null when it was overtaken. Null at once for any other element. */
  embedAt: (
    el: Element,
    x: number,
    y: number
  ) => Promise<Element | null> | null;
  /** A group's stroke has just been kept (its id): the page draws its picture now, once. */
  ended: (id: string) => void;
  /** Whether a press that is not a pen's inks: the pane's Draw mode, on the overlay's own layer. */
  freehand: (event: PointerEvent) => boolean;
  /** What holds a stand-in, innermost first, as its embed says, then its frame; none for any other element. */
  inEmbed: (el: Element) => Element[];
  /** Where a page's anchor stands now, and by what; null when nothing on the page matches it. */
  locate: (anchor: PageAnchor) => AnchorFound<Element> | null;
  /** Whether `el` is the page's own box rather than content on it. */
  pageSized: (el: Element) => boolean;
  /** The pins, drawn after the ink each time it is drawn. */
  pins: () => Pins;
  /** Whether an anchor's frames lead to one still loading: not found yet, and not gone. */
  waiting: (anchor: PageAnchor) => boolean;
}

export interface Ink {
  /** The doc's ink changed, or the doc was replaced: drawn again. */
  changed: () => void;
  /** A scroller moved them: every group, and its pins, stands where its element is now, nothing else read. */
  follow: () => void;
  /** A placed group's box in the page, px; null when it is not on the page. */
  groupBox: (id: string) => Box | null;
  /** The svg the ink is drawn in: a re-publish keeps it (overlay `kept`). */
  layer: SVGSVGElement;
  /** Draw every group again where its element stands now (after a morph). */
  replace: () => void;
  /** The elements its groups stand on now. */
  standingOn: () => Iterable<Element | null>;
}

/** `el`'s parent, out of its frame's document into the frame itself at the frame's root. */
const outward = (el: Element): Element | null =>
  el.parentElement ?? framesOf(el).at(-1) ?? null;

/** A viewport point's distance from a box. */
const distanceTo = (r: DOMRect, x: number, y: number) =>
  Math.hypot(
    Math.max(r.left - x, 0, x - r.right),
    Math.max(r.top - y, 0, y - r.bottom)
  );

/** The content nearest the viewport's `x`, `y` inside `el`: down through what is only the page's box; null when it holds none. */
export const contentNearIn = (
  el: Element,
  x: number,
  y: number,
  pageSized: (one: Element) => boolean
): Element | null => {
  let at = nearestChild(el, x, y);
  while (at && pageSized(at)) {
    at = nearestChild(at, x, y);
  }
  return at;
};

/** The child of `el` with a box nearest the viewport's `x`, `y`, the overlay's own left out; null when it has none. */
const nearestChild = (el: Element, x: number, y: number): Element | null => {
  let nearest: Element | null = null;
  let least = Number.POSITIVE_INFINITY;
  for (const child of el.children) {
    const r = rectOf(child);
    if (r.width > 0 && r.height > 0 && !child.closest(OVERLAY_OWN)) {
      const far = distanceTo(r, x, y);
      if (far < least) {
        nearest = child;
        least = far;
      }
    }
  }
  return nearest;
};

/** The box around a stroke's points, at least 1 px each way. */
const strokeBox = (points: Point[]): Box => {
  const { x, y, width, height } = boxOf(points);
  return { x, y, w: Math.max(1, width), h: Math.max(1, height) };
};

const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
};

/**
 * Whether two boxes touch. Within `TOUCH_SLACK`: a placed group's box is read
 * back from fractions rounded to four places, a tenth of a px on a wide
 * element, so strokes drawn end to end stood apart in 19 of 30 tries and split
 * into two groups.
 */
const touches = (a: Box, b: Box) => meets(grow(a, TOUCH_SLACK), b);

const contains = (outer: Box, inner: Box, slack = 1) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.w <= outer.x + outer.w + slack &&
  inner.y + inner.h <= outer.y + outer.h + slack;

const round = (n: number) => Math.round(n * 10_000) / 10_000;

const area = (box: Box) => Math.max(1, box.w) * Math.max(1, box.h);

/** Whether a stroke is a loop: its box big enough both ways, its ends close against its longer side. */
const isLoop = (points: Point[], box: Box): boolean => {
  const [first] = points;
  const end = points.at(-1);
  return (
    !!first &&
    !!end &&
    box.w >= LOOP_MIN &&
    box.h >= LOOP_MIN &&
    Math.hypot(first[0] - end[0], first[1] - end[1]) <=
      LOOP_GAP * Math.max(box.w, box.h)
  );
};

/** Whether the page's point lies inside the loop `ring` closed end to start (even–odd). */
const insideLoop = (ring: Point[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] as Point;
    const [xj, yj] = ring[j] as Point;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

/** At most `most` of `items`, evenly spaced. */
const every = <T>(items: T[], most: number): T[] => {
  const step = Math.max(1, Math.ceil(items.length / most));
  return items.filter((_, index) => index % step === 0);
};

/** Where a stroke is hit-tested, the page's px: a loop's inside on a grid, a line along itself. */
const samplesOf = (
  points: Point[],
  box: Box,
  loop: boolean,
  grid = LOOP_GRID,
  line = LINE_SAMPLES
): [number, number][] => {
  if (!loop) {
    return every(points, line).map(([x, y]) => [x, y]);
  }
  const ring = every(points, 200);
  const inside: [number, number][] = [];
  for (let i = 0; i < grid; i += 1) {
    for (let j = 0; j < grid; j += 1) {
      const x = box.x + ((i + 0.5) * box.w) / grid;
      const y = box.y + ((j + 0.5) * box.h) / grid;
      if (insideLoop(ring, x, y)) {
        inside.push([x, y]);
      }
    }
  }
  return inside;
};

const inOrder = (els: Element[]) =>
  els.sort((a, b) =>
    // biome-ignore lint/suspicious/noBitwiseOperators: compareDocumentPosition answers a bitmask
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );

/** An inline element (a bold word, a code span) as the block it stands in: what a line across words marks. */
const blockOf = (el: Element): Element => {
  let at = el;
  while (
    at.parentElement &&
    (at.ownerDocument.defaultView ?? window)
      .getComputedStyle(at)
      .display.startsWith("inline")
  ) {
    at = at.parentElement;
  }
  return at;
};

/** perfect-freehand's outline as a closed path of quadratic curves through its points' midpoints. */
const pathOf = (points: Point[]): string => {
  const outline = getStroke(points, STROKE);
  if (outline.length < 2) {
    return "";
  }
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(outline[0][0])} ${f(outline[0][1])} Q`;
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += ` ${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
  });
  return `${d} Z`;
};

/** The overlay's layers that hold a mark now (a stroke, a disc), each as its own draw said. */
const holding = new Set<SVGSVGElement>();

/**
 * The overlay's own elements in the page: its host, its ink, pin and change
 * layers (the pins' fixed layer among them), and its stand-ins over frames
 * of another origin (embeds.ts). What changes in them is never the page's:
 * a pill painted in the fixed layer, read as the page's, placed every mark
 * again on the next frame, which painted the pill again, every frame.
 */
export const OVERLAY_OWN = `cawco-overlay, svg[data-cawco-ink], svg[data-cawco-pins], svg[data-cawco-pins-fixed], svg[data-cawco-changes], [${STAND_INS}]`;
/** Whether `node` is the overlay's own or stands in it (a node of a frame's document included). */
export const ownNode = (node: Node | null): boolean => {
  const el =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node?.parentElement ?? null);
  return !!el?.closest(OVERLAY_OWN);
};
/** Every change a mark's element may move by: nodes, attributes, words, anywhere in the document. */
const MOVES: MutationObserverInit = {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
};

/** The room kept under the page's foot, px ({@link insetFoot}). */
let footRoom = 0;
/** The room the host keeps under the page's foot, px ({@link keepFoot}): what its chrome floats over the page's foot. */
let keptRoom = 0;

/**
 * The overlay's layers at the page's origin, each holding a mark as big as
 * the page's scroll, and each holding none folded away. `layer`, about to
 * be drawn, says whether it `holds` a mark. The scroll is read with every
 * layer folded away first: a layer stands in the scroll it measures, so
 * read as it is, one sized for a taller layout (the page before it reflowed
 * wider) would hold the page at that height for good. While no layer holds
 * a mark nothing is read: reading the scroll lays the whole page out there
 * and then, before the browser would (a page of 300 sections: 50 ms of its
 * style and layout as it opened, preview-bound 12), for nothing to draw.
 * Each runs past the page's foot by the room {@link insetFoot} keeps there.
 */
export const fitToPage = (layer: SVGSVGElement, holds: boolean) => {
  if (holds) {
    holding.add(layer);
  } else {
    holding.delete(layer);
  }
  const layers = document.querySelectorAll<SVGSVGElement>(
    "svg[data-cawco-ink], svg[data-cawco-pins]"
  );
  for (const one of layers) {
    one.setAttribute("width", "0");
    one.setAttribute("height", "0");
  }
  if (holding.size === 0) {
    return;
  }
  const root = document.documentElement;
  const width = String(
    Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0)
  );
  const height = String(
    Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0) +
      Math.max(footRoom, keptRoom)
  );
  for (const one of holding) {
    one.setAttribute("width", width);
    one.setAttribute("height", height);
  }
};

/**
 * Room under the page's foot, as iOS insets a scroll view's content above
 * its keyboard: the layers run `px` past the page's scroll, so the page
 * scrolls that much further and a pin the host's chrome covers there can be
 * lifted clear of it (pins.ts `bringOut`); 0 gives the page its own scroll
 * back. The page's own layout is never touched. Takes hold at the next
 * {@link fitToPage}.
 */
export const insetFoot = (px: number) => {
  footRoom = Math.max(0, px);
};

/**
 * Room the host keeps under the page's foot while its chrome floats over it
 * (`cawco:foot-room`: Changed since you looked at the well's foot), as iOS
 * insets a scroll view under a floating bottom bar, so the page's last line
 * scrolls clear of it; 0 when nothing floats there. The page's own layout is
 * never touched. Takes hold at the next {@link fitToPage}.
 */
export const keepFoot = (px: number) => {
  keptRoom = Math.max(0, px);
};

/** Whether the host keeps room under the page's foot: the layer then holds the page's height with no pin on it. */
export const footKept = () => keptRoom > 0;

/** A pen's pressure, or the middle one where it reports none; a mouse's and a finger's are always the middle one. */
const pressureOf = (event: PointerEvent) =>
  event.pointerType === "pen" && event.pressure > 0
    ? event.pressure
    : NO_PRESSURE;

export function startInk(deps: InkDeps): Ink {
  const { chrome } = deps;

  /** What holds `el`, innermost first: out of an embed by what it names, then parents and frames. */
  const holdersOf = (el: Element): Element[] => {
    const held = deps.inEmbed(el);
    const holders = [...held];
    for (let at = outward(held.at(-1) ?? el); at; at = outward(at)) {
      holders.push(at);
    }
    return holders;
  };
  /** Whether `holder` holds `el`, a stand-in held by what its embed names too. */
  const holds = (holder: Element, el: Element) =>
    holder !== el && (holder.contains(el) || deps.inEmbed(el).includes(holder));
  /** The elements none of the others holds, in document order. */
  const outermost = (els: Element[]) =>
    inOrder(els.filter((el) => !els.some((o) => holds(o, el))));
  /** The elements that hold none of the others, in document order. */
  const innermost = (els: Element[]) =>
    inOrder(els.filter((el) => !els.some((o) => holds(el, o))));
  /** The nearest element holding every one of `els`, through the frames and embeds they stand in; null when none does. */
  const containerOf = ([first, ...rest]: Element[]): Element | null =>
    (first ? [first, ...holdersOf(first)] : []).find((holder) =>
      rest.every(
        (el) =>
          holder === el || holder.contains(el) || holdersOf(el).includes(holder)
      )
    ) ?? null;
  const contentNear = (el: Element, x: number, y: number) =>
    contentNearIn(el, x, y, deps.pageSized);
  /** What a stroke at the viewport's `x`, `y` stands on where it lands on a scroller's own box: what the scroller scrolls, there. */
  const onContent = (el: Element, x: number, y: number): Element =>
    scrollsContent(el) ? (contentNear(el, x, y) ?? el) : el;

  const layer = document.createElementNS(SVG, "svg");
  layer.setAttribute("data-cawco-ink", "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:absolute;left:0;top:0;z-index:2147483646;overflow:hidden;pointer-events:none;margin:0;padding:0;border:0";
  document.documentElement.append(layer);

  const onCanvas = () => artifact.kind() === "canvas";
  /** Whether a pen inks here now: a page with a doc to keep it. */
  const inks = () => !onCanvas() && artifact.keeps();
  const maps = () => {
    const doc = artifact.doc();
    return {
      doc,
      ink: doc.getMap("ink") as DocMap<InkGroup>,
      moved: doc.getMap("moved") as DocMap<InkGroup>,
      pins: readPins(doc),
    };
  };

  /** Each placed group: its box in the page, the element it stands on, the box its paths were drawn from. */
  const placed = new Map<string, { anchor: Element; box: Box; under: Box }>();
  /** Each group's nodes, kept while it stands and redrawn only when what they show changes. */
  const drawn = new Map<string, DrawnGroup>();
  /** Each clipped group's clip in the page, px: the part of it that is drawn. */
  const clips = new Map<string, Box>();
  /**
   * The elements groups stand on, each watched for its size from the draw
   * that first places a group on it until no group stands on it. Never
   * watched again on each draw: a ResizeObserver reports once whenever
   * `observe()` starts, and that report drawing again would draw every frame.
   * An element in a same-origin frame is watched from its own window
   * (frames.ts `sizesIn`).
   */
  const watched = new Set<Element>();
  /** Watches the elements newly stood on, and lets go of those no group stands on now. */
  const watchAnchors = (standing: Set<Element>) => {
    for (const el of watched) {
      if (!standing.has(el)) {
        sizesIn(el.ownerDocument, later)?.unobserve(el);
        watched.delete(el);
      }
    }
    for (const el of standing) {
      if (!watched.has(el)) {
        sizesIn(el.ownerDocument, later)?.observe(el);
        watched.add(el);
      }
    }
  };

  /**
   * What moves an element without resizing it or the page: content put in
   * or taken out round it, a class, a style or words changed. While any
   * mark stands (`holding`), every change to the page and to each
   * same-origin frame's document but the overlay's own places the marks
   * again on the next frame; with none, nothing is watched.
   */
  const moves = new MutationObserver((records) => {
    if (records.some((record) => !ownNode(record.target))) {
      later();
    }
  });
  let watchingMoves = false;
  const watchMoves = () => {
    if (holding.size === 0) {
      if (watchingMoves) {
        moves.disconnect();
        watchingMoves = false;
      }
      return;
    }
    for (const doc of [
      document,
      ...frameWindows(document).map((view) => view.document),
    ]) {
      moves.observe(doc, MOVES);
    }
    watchingMoves = true;
  };
  // A transition or an animation ended: what it moved stands where it ends.
  const settledMotion = (event: Event) => {
    if (holding.size > 0 && !ownNode(event.target as Node | null)) {
      later();
    }
  };
  document.addEventListener("transitionend", settledMotion, { capture: true });
  document.addEventListener("animationend", settledMotion, { capture: true });

  // --- drawing --------------------------------------------------------------

  let drawing: { id: number; points: Point[]; path: SVGPathElement } | null =
    null;
  /** The group the last stroke joined, and when, for the next stroke's two breaths. */
  let last: { id: string; at: number } | null = null;

  const add = (event: PointerEvent) => {
    drawing?.points.push([
      event.clientX + scrollX,
      event.clientY + scrollY,
      pressureOf(event),
    ]);
  };
  const drawLive = (predicted: PointerEvent[] = []) => {
    if (!drawing) {
      return;
    }
    const tail: Point[] = predicted.map((event) => [
      event.clientX + scrollX,
      event.clientY + scrollY,
      pressureOf(event),
    ]);
    drawing.path.setAttribute("d", pathOf([...drawing.points, ...tail]));
  };

  const release = () => {
    layer.style.pointerEvents = "none";
    layer.style.touchAction = "";
  };

  /** The pen's eraser (Pointer Events: button 5, buttons bit 32): it removes the whole strokes it crosses. */
  const isEraser = (event: PointerEvent) =>
    event.button === ERASER_BUTTON ||
    // biome-ignore lint/suspicious/noBitwiseOperators: `buttons` is a bitmask
    (event.buttons & ERASER_BUTTONS) !== 0;
  /** The eraser down: the strokes it has crossed so far, by group. */
  let erasing: { id: number; hits: Map<string, Set<number>> } | null = null;
  /** The eraser at a point: each stroke whose outline lies within its reach is crossed, and drawn faint until it lifts. */
  const rub = (event: PointerEvent) => {
    if (!erasing) {
      return;
    }
    const x = event.clientX + scrollX;
    const y = event.clientY + scrollY;
    for (const path of layer.querySelectorAll<SVGPathElement>(
      "path[data-stroke]"
    )) {
      const group = path
        .closest("[data-ink-group]")
        ?.getAttribute("data-ink-group");
      const under = group ? placed.get(group)?.under : null;
      // A path is drawn from its element's origin.
      const crossed =
        !!under &&
        REACH.some(([dx, dy]) =>
          path.isPointInFill(new DOMPoint(x + dx - under.x, y + dy - under.y))
        );
      if (!(crossed && group)) {
        continue;
      }
      // A stroke clipped away where the eraser is stands unseen there, and is not rubbed out.
      const clip = clips.get(group);
      if (clip && !contains(clip, { x, y, w: 0, h: 0 }, 0)) {
        continue;
      }
      const hit = erasing.hits.get(group) ?? new Set<number>();
      hit.add(Number(path.getAttribute("data-stroke")));
      erasing.hits.set(group, hit);
      path.style.opacity = ERASING_OPACITY;
    }
  };
  /** The eraser lifts: the strokes it crossed go; a group left with none goes with its pins. */
  const erase = (hits: Map<string, Set<number>>) => {
    const { doc, ink, pins } = maps();
    const at = new Date().toISOString();
    doc.transact(() => {
      for (const [id, crossed] of hits) {
        const group = ink.get(id);
        if (!group) {
          continue;
        }
        const left = strokesInPage(group).filter(
          (_, index) => !crossed.has(index)
        );
        if (left.length > 0) {
          const kept = regroup(group, left, at);
          ink.set(id, {
            ...kept,
            ...(group.sentAt ? { sentAt: group.sentAt } : {}),
          });
          reachIn(id);
          continue;
        }
        ink.delete(id);
        for (const pin of [...pins.values()].filter((one) => one.ink === id)) {
          buryPin(doc, pin.id, at);
        }
      }
    });
    draw();
  };

  window.addEventListener(
    "pointerdown",
    (event) => {
      const pen = event.pointerType === "pen";
      if (!(pen || deps.freehand(event))) {
        return;
      }
      // The next stroke starts: the last one's icon leaves (on a canvas too).
      chrome.hideIcon();
      if (!inks()) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      layer.style.pointerEvents = "auto";
      layer.style.touchAction = "none";
      // The stroke is drawn in the layer: it stands as big as the page while it is down.
      fitToPage(layer, true);
      try {
        layer.setPointerCapture(event.pointerId);
      } catch {
        // A pointer the page has already let go of: its moves still reach the window.
      }
      if (pen && isEraser(event)) {
        erasing = { id: event.pointerId, hits: new Map() };
        rub(event);
        return;
      }
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("data-live", "");
      path.setAttribute("fill", chrome.token("--brand-solid"));
      layer.append(path);
      drawing = { id: event.pointerId, points: [], path };
      add(event);
      drawLive();
    },
    { capture: true }
  );
  /** A move's points: its coalesced ones, or the move itself where the browser gives none (an untrusted event). */
  const pointsOf = (event: PointerEvent) => {
    const coalesced = event.getCoalescedEvents?.() ?? [];
    return coalesced.length > 0 ? coalesced : [event];
  };
  window.addEventListener(
    "pointermove",
    (event) => {
      if (erasing?.id === event.pointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        for (const one of pointsOf(event)) {
          rub(one);
        }
        return;
      }
      if (drawing?.id !== event.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      for (const one of pointsOf(event)) {
        add(one);
      }
      drawLive(event.getPredictedEvents?.() ?? []);
    },
    { capture: true }
  );
  const lifted = (event: PointerEvent) => {
    if (erasing?.id === event.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const { hits } = erasing;
      erasing = null;
      release();
      if (event.type === "pointerup") {
        erase(hits);
      } else {
        for (const path of layer.querySelectorAll<SVGPathElement>(
          "path[data-stroke]"
        )) {
          path.style.removeProperty("opacity");
        }
      }
      return;
    }
    if (drawing?.id !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const { points, path } = drawing;
    drawing = null;
    path.remove();
    release();
    if (event.type === "pointerup" && points.length > 0) {
      commit(points);
    }
  };
  window.addEventListener("pointerup", lifted, { capture: true });
  window.addEventListener("pointercancel", lifted, { capture: true });
  // WebKit pans the page under a stylus unless its touch is refused; a finger's stays the page's.
  const stylus = (event: TouchEvent) => {
    if (
      inks() &&
      [...event.changedTouches].some(
        (touch) =>
          (touch as Touch & { touchType?: string }).touchType === "stylus"
      )
    ) {
      event.preventDefault();
    }
  };
  document.addEventListener("touchstart", stylus, {
    capture: true,
    passive: false,
  });
  document.addEventListener("touchmove", stylus, {
    capture: true,
    passive: false,
  });

  /**
   * What strokes mark, read once as they lift (the page's px): for each, the
   * browser's hit test at points inside a loop, or along a line; each hit
   * the stroke encloses is taken out to its largest ancestor it still
   * encloses. `over` is the outermost of those, in document order, or, when
   * a stroke encloses nothing, the elements it crosses (an inline one as the
   * block it stands in); the element under the centre when there are none.
   * The anchor is their nearest container while it is not much bigger than
   * what the strokes reach, else the first of them.
   */
  /** One stroke's hits, each sorted into what it encloses (taken out as far as it still does) and what it crosses; its reach. */
  const hitsOf = (
    points: Point[],
    named: Element[],
    boxed: (el: Element) => Box,
    into: { crossed: Set<Element>; enclosed: Set<Element> }
  ): Box => {
    const box = strokeBox(points);
    const loop = isLoop(points, box);
    const reach = grow(box, loop ? ENCLOSE_SLACK : LINE_REACH);
    const encloses = (el: Element) =>
      !deps.pageSized(el) && contains(reach, boxed(el), 0);
    const hits = hitsAt(viewOf(samplesOf(points, box, loop)), named);
    for (const [hit, [x, y]] of hits) {
      if (deps.pageSized(hit)) {
        continue;
      }
      if (encloses(hit)) {
        into.enclosed.add(takenOut(hit, encloses));
      } else {
        into.crossed.add(onContent(hit, x, y));
      }
    }
    return reach;
  };

  /** The elements at the viewport's points, each with the first it was hit at; `named`, what an embed named, among them. */
  const hitsAt = (views: [number, number][], named: Element[]) => {
    const hits = new Map<Element, [number, number]>(
      named.map((el) => [el, [0, 0]])
    );
    for (const [index, hit] of deps.elementsAt(views).entries()) {
      if (hit && !hits.has(hit)) {
        hits.set(hit, views[index] as [number, number]);
      }
    }
    return hits;
  };

  /** `el` taken out to the largest of what holds it that `encloses` still holds true of. */
  const takenOut = (el: Element, encloses: (one: Element) => boolean) => {
    const holders = holdersOf(el);
    const past = holders.findIndex((up) => !encloses(up));
    return (past === -1 ? holders.at(-1) : holders[past - 1]) ?? el;
  };

  const marksOf = (strokes: Point[][], named: Element[][]): Marks | null => {
    const boxes = new Map<Element, Box>();
    const boxed = (el: Element) => {
      const known = boxes.get(el);
      if (known) {
        return known;
      }
      const box = pageBox(el);
      boxes.set(el, box);
      return box;
    };
    const enclosed = new Set<Element>();
    const crossed = new Set<Element>();
    const reaches = strokes.map((points, index) =>
      hitsOf(points, named[index] ?? [], boxed, { crossed, enclosed })
    );
    const over =
      enclosed.size > 0
        ? outermost([...enclosed])
        : innermost([...new Set([...crossed].map(blockOf))]);
    const reach =
      reaches.length > 0 ? reaches.reduce(union) : strokeBox(strokes.flat());
    if (over.length === 0) {
      const x = reach.x + reach.w / 2 - scrollX;
      const y = reach.y + reach.h / 2 - scrollY;
      const [centre] = deps.elementsAt([[x, y]]);
      if (!centre) {
        return null;
      }
      const el = overNothing(centre, x, y);
      return { anchor: el, onOwnScroll: scrollsContent(el), over: [el] };
    }
    const marked = over.slice(0, MARKED_MAX);
    const first = marked[0] as Element;
    const common = marked.length > 1 ? containerOf(marked) : null;
    const anchor =
      common &&
      movesWith(common, first) &&
      !deps.pageSized(common) &&
      area(boxed(common)) <= CONTAINER_MOST * area(reach)
        ? common
        : first;
    return {
      anchor,
      onOwnScroll: !enclosed.has(anchor) && scrollsContent(anchor),
      over: marked,
    };
  };

  /**
   * What a stroke over no content stands on, `hit` being what is at its
   * centre: the content nearest it in the scroller holding `hit`; the page
   * as a whole, its document's body (core `wholePage`), only where no scroller
   * holds it, the body then moving with what the stroke covers. The scroller
   * itself where it holds no element to stand on.
   */
  const overNothing = (hit: Element, x: number, y: number): Element => {
    if (!deps.pageSized(hit)) {
      return onContent(hit, x, y);
    }
    const scroller = scrollerRound(hit);
    return scroller
      ? (contentNear(scroller, x, y) ?? scroller)
      : hit.ownerDocument.body;
  };

  /** Whether the container `holder` moves with `el` as `el`'s document and scroller scroll: nothing that scrolls stands between them. */
  const movesWith = (holder: Element, el: Element): boolean => {
    const scroller = scrollerRound(el);
    return (
      holder.ownerDocument === el.ownerDocument &&
      (!scroller || (holder !== scroller && scroller.contains(holder)))
    );
  };

  /** Why a stroke may not be kept (DESIGN.md's error formula), or null: the bounds the hub keeps. */
  const refusal = (
    points: Point[],
    open: InkGroup | undefined
  ): string | null => {
    if (points.length > INK_LIMITS.pointsPerStroke) {
      return `This stroke has more than ${INK_LIMITS.pointsPerStroke.toLocaleString()} points, so it wasn't kept. Draw it as two strokes.`;
    }
    const { ink, moved } = maps();
    if (!open && ink.size + moved.size >= INK_LIMITS.groups) {
      return `This artifact keeps ${INK_LIMITS.groups} stroke groups, so this stroke wasn't kept. Erase a group, then draw again.`;
    }
    if (open && open.strokes.length >= INK_LIMITS.strokesPerGroup) {
      return `This group keeps ${INK_LIMITS.strokesPerGroup} strokes, so this stroke wasn't kept. Start a new group away from it.`;
    }
    return null;
  };

  /** The group `open` with `points` added (a new one when there is none). */
  const groupOf = (
    open: InkGroup | undefined,
    points: Point[],
    at: string
  ): InkGroup =>
    // The group's strokes in the page: the open group's as it is drawn now, and this one.
    regroup(open, [...(open ? strokesInPage(open) : []), { points, at }], at);

  /** A group of `strokes` (the page's px), anchored and kept as fractions of its element's box; `open`'s id, time and mark kept. */
  const regroup = (
    open: InkGroup | undefined,
    strokes: { at: string; points: Point[] }[],
    at: string,
    named: Element[][] = []
  ): InkGroup => {
    const all = strokes.map((one) => one.points);
    const groupBox = all.map(strokeBox).reduce(union);
    const { anchor, onOwnScroll, over } =
      marksOf(all, named) ?? marksKept(open);
    const ab = pageBox(anchor);
    const fraction = (p: Point): InkPoint => [
      round((p[0] - ab.x) / ab.w),
      round((p[1] - ab.y) / ab.h),
      round(p[2]),
    ];
    return {
      id: open?.id ?? newId(),
      anchor: deps.anchorOf(anchor),
      box: {
        x: round((groupBox.x - ab.x) / ab.w),
        y: round((groupBox.y - ab.y) / ab.h),
        w: round(groupBox.w / ab.w),
        h: round(groupBox.h / ab.h),
      },
      page: {
        x: Math.round(groupBox.x),
        y: Math.round(groupBox.y),
        w: Math.round(groupBox.w),
        h: Math.round(groupBox.h),
      },
      strokes: strokes.map((stroke) => ({
        points: stroke.points.map(fraction),
        at: stroke.at,
      })),
      at: open?.at ?? at,
      over: over.map(deps.anchorOf),
      ...(open?.illustration ? { illustration: true as const } : {}),
      ...(onOwnScroll
        ? { scrolled: { x: anchor.scrollLeft, y: anchor.scrollTop } }
        : {}),
    };
  };

  /**
   * What `open` marks as it stands, for strokes the viewport shows none of
   * (the eraser left only what is scrolled out of it), which no hit test can
   * read; the body for one that stands nowhere.
   */
  const marksKept = (open: InkGroup | undefined): Marks => {
    const anchor = (open && elementOf(open)) ?? document.body;
    const over = (open?.over ?? [])
      .map((one) => deps.locate(one)?.el ?? null)
      .filter((el): el is Element => el !== null);
    return {
      anchor,
      onOwnScroll: !!open?.scrolled,
      over: over.length > 0 ? over : [anchor],
    };
  };

  /**
   * A group over a frame of another origin stands on what its embed names
   * under it, once it has answered: only the embed can read that, a message
   * away, so the group is kept on the frame at its lift and moves onto the
   * elements when the answers come, unless its strokes have changed since.
   * A frame whose overlay does not answer stays the group's anchor.
   */
  const reachIn = (id: string) => {
    const group = maps().ink.get(id);
    if (!group) {
      return;
    }
    const strokes = strokesInPage(group).map((one) => one.points);
    const asks = strokes.flatMap((points, index) => {
      const box = strokeBox(points);
      const loop = isLoop(points, box);
      const views = viewOf(
        samplesOf(points, box, loop, EMBED_GRID, EMBED_ASKS)
      );
      return deps
        .elementsAt(views)
        .flatMap((hit, at) =>
          isFrame(hit)
            ? [{ hit, index, point: views[at] as [number, number] }]
            : []
        );
    });
    const answers = every(asks, EMBED_ASKS).flatMap(({ hit, index, point }) => {
      const answer = deps.embedAt(hit, point[0], point[1]);
      return answer ? [answer.then((el) => ({ el, index }))] : [];
    });
    if (answers.length === 0) {
      return;
    }
    Promise.all(answers).then((named) => {
      const inside = strokes.map((_, index) =>
        named.flatMap((one) =>
          one.index === index && one.el && deps.inEmbed(one.el).length > 0
            ? [one.el]
            : []
        )
      );
      const { doc, ink } = maps();
      const now = ink.get(id);
      if (
        !now ||
        now.strokes.length !== group.strokes.length ||
        inside.every((els) => els.length === 0)
      ) {
        return;
      }
      const moved = regroup(now, strokesInPage(now), now.at, inside);
      doc.transact(
        () =>
          ink.set(id, {
            ...moved,
            ...(now.sentAt ? { sentAt: now.sentAt } : {}),
          }),
        PLACED
      );
      draw();
    });
  };

  /** A finished stroke joins the group it touches within two breaths, or starts one; the icon comes to its end. */
  const commit = (points: Point[]) => {
    const end = points.at(-1) as Point;
    const now = Date.now();
    const { doc, ink } = maps();
    const recent =
      last && now - last.at <= 2 * chrome.ms("--breath")
        ? ink.get(last.id)
        : undefined;
    const recentBox = recent ? placed.get(recent.id)?.box : undefined;
    const open =
      recent && recentBox && touches(recentBox, strokeBox(points))
        ? recent
        : undefined;
    const refused = refusal(points, open);
    if (refused) {
      chrome.say(refused, end[0] - scrollX, end[1] - scrollY);
      return;
    }
    const group = groupOf(open, points, new Date(now).toISOString());
    doc.transact(() => ink.set(group.id, group));
    last = { id: group.id, at: now };
    deps.ended(group.id);
    reachIn(group.id);
    chrome.showIcon(end[0] - scrollX, end[1] - scrollY, (choice) =>
      act(group.id, choice)
    );
  };

  // --- placing --------------------------------------------------------------

  /** A group's element now (core `findAnchor`'s order); null when nothing matches. */
  const elementOf = (group: InkGroup): Element | null =>
    "selector" in group.anchor ? (deps.locate(group.anchor)?.el ?? null) : null;

  /** A group's strokes where its element stands now, in the page's px. */
  const strokesInPage = (group: InkGroup) => {
    const el = elementOf(group);
    const ab = el ? boxUnder(el, group) : null;
    return group.strokes.map((stroke) => ({
      at: stroke.at,
      points: stroke.points.map(([fx, fy, p]): Point =>
        ab ? [ab.x + fx * ab.w, ab.y + fy * ab.h, p] : [0, 0, p]
      ),
    }));
  };

  /** The box a group's fractions are of: its element's, moved by what the element has scrolled since, for words it scrolls itself. */
  const boxUnder = (el: Element, { scrolled }: InkGroup): Box => {
    const box = pageBox(el);
    if (!scrolled) {
      return box;
    }
    const own = el.getBoundingClientRect();
    const sx = own.width > 0 ? box.w / own.width : 1;
    const sy = own.height > 0 ? box.h / own.height : 1;
    return {
      ...box,
      x: box.x - (el.scrollLeft - scrolled.x) * sx,
      y: box.y - (el.scrollTop - scrolled.y) * sy,
    };
  };

  let frame = 0;
  /** Placed again on the next frame: whatever moved this frame, once. */
  function later() {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    }
  }

  /** Whether a group whose element is gone may be moved aside now: a page the agent wrote, or a sheet of its components, laid out. */
  const settled = () =>
    (artifact.kind() === "page" || artifact.kind() === "component") &&
    document.readyState !== "loading";

  /** Whether a group no anchor finds is missing, not waiting on a frame still loading. */
  const goneFrom = (group: InkGroup) =>
    !("selector" in group.anchor && deps.waiting(group.anchor));
  /** How long each group has stood missing: one is gone only after a while, drawn again then. */
  const absent = absences(() => draw());

  /**
   * Of the groups no anchor finds now, those gone: missing for a while, not
   * for one read of a page drawing itself again (absent.ts). Timed only
   * where a group is moved aside ({@link settled}), so no timer draws a
   * preview again for a group it never moves.
   */
  const goneOf = (located: { el: Element | null; group: InkGroup }[]) => {
    const missing = settled()
      ? located.filter(({ group, el }) => !el && goneFrom(group))
      : [];
    const gone = missing
      .filter(({ group }) => absent.missed(group.id))
      .map(({ group }) => group);
    absent.keep(missing.map(({ group }) => group.id));
    return gone;
  };

  function draw() {
    placed.clear();
    clips.clear();
    if (onCanvas()) {
      forgetDrawn(new Set());
      watchAnchors(new Set());
      watchMoves();
      return;
    }
    const { ink } = maps();
    const groups = [...ink.values()];
    fitToPage(
      layer,
      groups.length > 0 || layer.querySelector("[data-live]") !== null
    );
    // Read only for a group to draw: a token is the page's style, read there and then.
    const brand = groups.length > 0 ? chrome.token("--brand-solid") : "";
    const located = groups.map((group) => {
      const found =
        "selector" in group.anchor
          ? deps.locate(deps.anchorToday(group.anchor, group.at))
          : null;
      return { group, el: found?.el ?? null, by: found?.by ?? "selector" };
    });
    const gone = goneOf(located);
    const found: InkGroup[] = [];
    const standing = new Set<Element>();
    const stands: Stand[] = [];
    for (const { group, el, by } of located) {
      if (!el) {
        continue;
      }
      const reread = rereadOn(group, el, by);
      if (reread) {
        found.push(reread);
      }
      stands.push(standOf(group, el));
      standing.add(el);
    }
    forgetDrawn(new Set(stands.map((stand) => stand.group.id)));
    for (const stand of stands) {
      paintGroup(stand, brand);
      placeGroup(stand);
    }
    watchAnchors(standing);
    if (settled()) {
      settleGroups(found, gone);
      bringBackMoved();
    }
    deps.pins().draw();
    watchMoves();
  }

  /**
   * The group anchored again on `el` when `el` now reads otherwise than its
   * anchor (moved, renamed, reworded); null when it reads as it was, since
   * a write draws the ink again.
   */
  const liveWords = wordsFollow();
  function rereadOn(
    group: InkGroup,
    el: Element,
    by: AnchorFound<Element>["by"]
  ): InkGroup | null {
    const now = deps.anchorOf(el);
    return "selector" in group.anchor &&
      (changedAnchor(group.anchor, now, by) ||
        liveWords(group.id, group.anchor, now, by))
      ? { ...group, anchor: now }
      : null;
  }

  /**
   * Where a group stands now, read and nothing written: its element's box,
   * and what `el`'s frames and scroll containers show of it (frames.ts
   * `clipOf`), as its pins are: a stroke a transcript has scrolled under its
   * edge is not drawn over what stands there.
   */
  function standOf(group: InkGroup, el: Element): Stand {
    // Words its element has scrolled are held to its box; unscrolled, a stroke past it stands as it was drawn.
    const moved =
      !!group.scrolled &&
      (el.scrollLeft !== group.scrolled.x || el.scrollTop !== group.scrolled.y);
    const shown = clipOf(el, moved);
    return {
      clip: shown
        ? {
            x: shown.x + scrollX,
            y: shown.y + scrollY,
            w: shown.width,
            h: shown.height,
          }
        : null,
      el,
      group,
      under: boxUnder(el, group),
    };
  }

  /** A group's nodes: the outer one takes its clip in the page's px, the inner its place, so the clip stays where it is as the strokes move. */
  const nodesOf = (id: string): DrawnGroup => {
    const known = drawn.get(id);
    if (known) {
      return known;
    }
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("data-ink-group", id);
    const moved = document.createElementNS(SVG, "g");
    g.append(moved);
    layer.append(g);
    const made: DrawnGroup = {
      clip: null,
      g,
      look: "",
      moved,
      own: { x: 0, y: 0, w: 1, h: 1 },
      strokes: null,
    };
    drawn.set(id, made);
    return made;
  };

  /** A group's paths, from its element's origin, drawn again only when its strokes, its element's size or the ink's colour changed. */
  function paintGroup({ group, under }: Stand, brand: string) {
    const nodes = nodesOf(group.id);
    const look = `${under.w} ${under.h} ${brand}`;
    if (nodes.strokes === group.strokes && nodes.look === look) {
      return;
    }
    const strokes = group.strokes.map((stroke) =>
      stroke.points.map(([fx, fy, p]): Point => [fx * under.w, fy * under.h, p])
    );
    nodes.moved.replaceChildren(
      ...strokes.map((points, index) => {
        const path = document.createElementNS(SVG, "path");
        path.setAttribute("data-stroke", String(index));
        path.setAttribute("d", pathOf(points));
        path.setAttribute("fill", brand);
        return path;
      })
    );
    nodes.own = strokes.map(strokeBox).reduce(union);
    nodes.strokes = group.strokes;
    nodes.look = look;
  }

  /** A group's nodes moved to where it stands, writing only what moved. */
  function placeGroup({ clip, el, group, under }: Stand) {
    const nodes = nodesOf(group.id);
    const at = `translate(${under.x} ${under.y})`;
    if (nodes.moved.getAttribute("transform") !== at) {
      nodes.moved.setAttribute("transform", at);
    }
    clipGroup(group.id, nodes, clip);
    const { own } = nodes;
    placed.set(group.id, {
      anchor: el,
      box: { ...own, x: own.x + under.x, y: own.y + under.y },
      under,
    });
  }

  /** A group's clip, in the page's px; none where nothing clips its element. */
  function clipGroup(id: string, nodes: DrawnGroup, box: Box | null) {
    if (!box) {
      if (nodes.clip) {
        nodes.clip.parentElement?.remove();
        nodes.clip = null;
        nodes.g.removeAttribute("clip-path");
      }
      clips.delete(id);
      return;
    }
    if (!nodes.clip) {
      const clip = document.createElementNS(SVG, "clipPath");
      clip.id = `cawco-ink-clip-${id}`;
      nodes.clip = document.createElementNS(SVG, "rect");
      clip.append(nodes.clip);
      layer.append(clip);
      nodes.g.setAttribute("clip-path", `url(#${clip.id})`);
    }
    for (const [name, value] of [
      ["x", box.x],
      ["y", box.y],
      ["width", box.w],
      ["height", box.h],
    ] as const) {
      if (nodes.clip.getAttribute(name) !== String(value)) {
        nodes.clip.setAttribute(name, String(value));
      }
    }
    clips.set(id, box);
  }

  /** The nodes of the groups no longer standing let go. */
  function forgetDrawn(standing: Set<string>) {
    for (const [id, nodes] of drawn) {
      if (!standing.has(id)) {
        nodes.clip?.parentElement?.remove();
        nodes.g.remove();
        drawn.delete(id);
      }
    }
  }

  /** Every group moved to where its element stands now; all read before any is written. */
  function follow() {
    const { ink } = maps();
    const stands: Stand[] = [];
    for (const [id, { anchor }] of placed) {
      const group = ink.get(id);
      if (!(group && anchor.isConnected)) {
        draw();
        return;
      }
      stands.push(standOf(group, anchor));
    }
    for (const stand of stands) {
      placeGroup(stand);
    }
    deps.pins().draw(true);
  }

  /**
   * The groups moved aside for words that changed where they stood, on the
   * page they were drawn on: each back on its element (core `findAnchor`'s
   * `place`). Any other moved group stays where the person can place it.
   */
  function bringBackMoved() {
    const { doc, ink, moved } = maps();
    const back = [...moved.values()].filter(
      (group) =>
        "selector" in group.anchor &&
        deps.locate(deps.anchorToday(group.anchor, group.at))?.by === "place"
    );
    if (back.length === 0) {
      return;
    }
    doc.transact(() => {
      for (const group of back) {
        moved.delete(group.id);
        ink.set(group.id, {
          ...group,
          anchor: deps.anchorToday(group.anchor as PageAnchor, group.at),
        });
      }
    }, PLACED);
    later();
  }

  /** Writes the groups found again by their source or text, and moves aside those no anchor finds. */
  function settleGroups(found: InkGroup[], gone: InkGroup[]) {
    if (found.length === 0 && gone.length === 0) {
      return;
    }
    const { doc, ink, moved } = maps();
    // The overlay's own placing: this draw has drawn it (artifact.ts `PLACED`).
    doc.transact(() => {
      for (const group of found) {
        ink.set(group.id, group);
      }
      for (const group of gone) {
        ink.delete(group.id);
        moved.set(group.id, group);
      }
    }, PLACED);
  }

  // --- picks ----------------------------------------------------------------

  /** The elements a group marks, as they stand now, each described alone (never its subtree). */
  const elementsUnder = (id: string): PinnedElement[] => {
    const group = maps().ink.get(id);
    const at = placed.get(id);
    if (!(group && at?.anchor)) {
      return [];
    }
    const marked = (group.over ?? [])
      .map((anchor) => deps.locate(anchor)?.el ?? null)
      .filter((el): el is Element => el !== null);
    return (marked.length > 0 ? marked : [at.anchor])
      .slice(0, MARKED_MAX)
      .map(deps.describe);
  };

  /** What a pick does to the group `id`. */
  function act(id: string, choice: Pick, under?: string[]) {
    const { doc, ink, pins } = maps();
    const group = ink.get(id);
    if (!group) {
      return;
    }
    const pinAs = (kind: Pin["kind"]) =>
      deps.pins().pinInk(group, kind, under ?? elementsUnder(id));
    const picks: Record<Pick, () => void> = {
      annotate: () => pinAs("annotation"),
      comment: () => pinAs("comment"),
      illustrate: () => ink.set(id, { ...group, illustration: true }),
      erase: () => {
        ink.delete(id);
        const at = new Date().toISOString();
        for (const pin of [...pins.values()].filter((one) => one.ink === id)) {
          buryPin(doc, pin.id, at);
        }
      },
    };
    doc.transact(picks[choice]);
    if (choice === "erase" && under) {
      // A canvas's ink is its own element: the canvas's page removes it.
      window.dispatchEvent(new CustomEvent("cawco:erase", { detail: { id } }));
    }
  }

  // A canvas's freedraw ended under a pen: the icon at its end, its picks on that element.
  window.addEventListener("cawco:stroke-end", (event) => {
    const detail = (event as CustomEvent).detail as {
      id: string;
      x: number;
      y: number;
      box: Box;
      under: string[];
    } | null;
    if (!(onCanvas() && artifact.keeps() && detail?.id)) {
      return;
    }
    const { doc, ink, moved } = maps();
    if (!ink.has(detail.id) && ink.size + moved.size >= INK_LIMITS.groups) {
      chrome.say(
        `This canvas keeps ${INK_LIMITS.groups} stroke groups, so this stroke has no options. Erase a group, then draw again.`,
        detail.x,
        detail.y
      );
      return;
    }
    const at = new Date().toISOString();
    doc.transact(() =>
      ink.set(detail.id, {
        id: detail.id,
        anchor: { element: detail.id },
        box: { x: 0, y: 0, w: 1, h: 1 },
        page: detail.box,
        strokes: [],
        at,
      })
    );
    chrome.showIcon(detail.x, detail.y, (choice) =>
      act(detail.id, choice, detail.under)
    );
  });

  /** The doc's ink changed (here, elsewhere, or a new doc): drawn again. */
  const changed = () => draw();
  // The window resizes or the page grows: every group stands where its element is now.
  addEventListener("resize", later);
  sizesIn(document, later)?.observe(document.documentElement);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", changed, { once: true });
  } else {
    queueMicrotask(changed);
  }

  return {
    layer,
    replace: () => draw(),
    follow,
    groupBox: (id) => placed.get(id)?.box ?? null,
    standingOn: () => [...placed.values()].map(({ anchor }) => anchor),
    changed,
  };
}
