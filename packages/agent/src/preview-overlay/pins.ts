/**
 * The person's comments on a page, as their pins (Projects spec §5.7,
 * §5.10; core comments.ts; the artifact panel's surface brief, A pin's pill). A pin is a pill with a
 * tail corner: `--c-pin` tall, as wide as its number needs, three corners
 * round and the fourth, the tail, a 2px corner standing on the point the
 * person pressed; a point in the middle of a line of words stands at that
 * line's end instead, at its foot (before its first word where the line
 * runs to the page's edge), so the pill covers no word of it or of the line
 * above. It stands up-right of that point, up-left where the page's
 * edge leaves no room on the right, below where none is left above. Its
 * fill says where it stands: hollow while the session hasn't heard it (no
 * number yet while it is being written), filled once sent, recessed when
 * resolved, which is drawn only while its thread is open. A 2px raised ring
 * and the xs shadow lift it off the page; a pin reached by the keyboard (the
 * host's J and K, a row taken by keys) adds a second ring in the focus ink,
 * until a press; an open pin is marked by its open card, never by a ring
 * (DESIGN.md, The One Ring Rule); a dot on its top end says the agent is
 * working on it (the live dot, breathing) or has answered and the person
 * hasn't looked (the needs-you dot, echoing three loops, then still).
 *
 * Pins are drawn in an `<svg>` in the page's own document like the ink, so
 * they scroll with the page; a pin on the page as a whole stands at the
 * viewport's top-right corner, `--space-2` in, in a layer fixed to the
 * viewport. Pins whose pills meet stack: the newest in front, at most two
 * behind it, each a `--deck-step` ×2 further down-right; resting on the
 * stack fans them into a row `--space-1` apart.
 *
 * A pin on an element inside a same-origin frame (frames.ts) is drawn here
 * too, in the top document, at the element's box mapped through its frames;
 * so is one inside a scroll container of the page's own (a transcript),
 * drawn again as it scrolls. While a frame or a container has scrolled the
 * point out of view, its pill is not drawn.
 *
 * Every pin is placed again from its anchor whenever the page changes (core
 * `findAnchor`: source file:line, then selector, then text). A page's pin
 * whose element none of them finds for a while (absent.ts: a page drawing
 * a part of itself again has it back within it) goes to the moved tray
 * (`movedAt`) until its anchor finds its element again or the person places
 * it again. A pin on the page as a whole stands on its body (core
 * `wholePage`), whatever the page says now, and never goes there; nor does
 * one kept on a page-sized container (core `findAnchor`'s `page`), which
 * stands on the body again.
 *
 * The comment being written follows its element the same way: when the
 * page draws it again, its pill stands on the one its anchor, read at the
 * press, finds now (PinsDeps `redraft`).
 *
 * Resting on a pin chooses its element (the overlay's one target) and asks
 * the host for its peek; a press on it opens its thread in the host. The
 * host draws the composer, the thread and the peek; this tells it where the
 * open pin and the one being written stand as the page scrolls, and where
 * each pin's picture is cropped (`cropOf`).
 */

import { breathPhase } from "@cawco/core/breath";
import {
  bringInto,
  type Scroller,
  scrollersOf,
  scrollMoves,
} from "@cawco/core/bring-into-view";
import {
  type AnchorFound,
  changedAnchor,
  newId,
  type PageAnchor,
  type Pin,
  type PinnedElement,
  type PinState,
  pinUnsent,
  placeOf,
  placePin,
  readPins,
  goneOf as tombstonesOf,
  wholePage,
  wordsFollow,
  writePin,
} from "@cawco/core/comments";
import type { InkGroup } from "@cawco/core/ink";
import { pinName } from "@cawco/core/pin-name";
import {
  type ComputePositionReturn,
  computePosition,
  detectOverflow,
  flip,
  type Middleware,
  offset,
  type Placement,
  type Platform,
  platform,
  shift,
  type VirtualElement,
} from "@floating-ui/dom";
import { absences } from "./absent";
import { artifact, PLACED } from "./artifact";
import { type Box, clipOf, grow, meets, pageBox, rectOf } from "./frames";
import { fitToPage, footKept, insetFoot } from "./ink";
import { motionOk } from "./motion";
import { durationMs, type InkChrome } from "./radial";
import {
  bandsAt,
  type FootPad,
  inBands,
  innerScroller,
  liftUnder,
  padFoot,
  pageScrolls,
  unpadFoot,
} from "./scrollers";

const SVG = "http://www.w3.org/2000/svg";

/** The ring round a pill, then the focus ring round that, px. */
const RING = 2;
/** The radius of a pill's tail corner: `--radius-hair`. */
const TAIL_R = 2;
/** The longest text whose lines a pin's point is read against (`lineAt`), characters. Our call: a paragraph's, never a page's. */
const LINE_READ_MOST = 4000;
/** Room round a mark's crop, px. Our call. */
const CROP_PAD = 24;
/** How far a pin's crop reaches from the point it was made at, each way, px: a big element is cropped round the point. Our call. */
const PIN_REACH = { x: 960, y: 640 } as const;
/** How long a scroller's glide has before a pill it should have lifted is looked at again, ms: past the browsers' own, about 750ms at most. Our call. */
const GLIDE_MS = 1000;
/** How many pins of a stack stand behind its front one. */
const BEHIND = 2;
/** A finger's hit area round a pill, px. */
const FINGER = 44;
/** The loops a needs-you dot echoes before it stands still (DESIGN.md, Status dot). */
const ECHOES = 3;

/** What a comment being written stands on: an element and the point on it, or an ink group. */
export interface DraftTarget {
  el: Element;
  /** The stroke group whose Comment the person picked. */
  ink?: string;
  /** Its composer is closed with its words kept: the pill holds a draft, and a press opens it again. */
  parked?: boolean;
  /** Where on `el` the press landed: fractions of its box. */
  point?: { x: number; y: number };
}

/** The id a parked draft's pill answers to (`data-pin-id`): a press on it opens its composer again. */
const DRAFT_PIN = "draft";

export interface PinsDeps {
  /** What a page's mark stands on, read from `el` as it is now; at `point` on it (fractions of its box), where in the file viewer's file that is. */
  anchorOf: (el: Element, point?: { x: number; y: number }) => PageAnchor;
  /** A mark's anchor as this page may read it, `at` when the mark was made (page.ts `anchorToday`). */
  anchorToday: (anchor: PageAnchor, at: string) => PageAnchor;
  /** The page stands in the iPhone or Mac app, whose card opens a pin a tap writes (page.ts `appCommenting`, until tsk-59). */
  appCommenting: () => boolean;
  chrome: InkChrome;
  /** The radial's Comment on an ink group: a comment is written on it (the page's composer opens). */
  compose: (target: DraftTarget, elements: PinnedElement[] | string[]) => void;
  /** The overlay's description of `el`, its markup left out. */
  describe: (el: Element) => PinnedElement;
  /** A placed ink group's box in the page, px; null when it is not on the page. */
  groupBox: (id: string) => Box | null;
  /** Where a page's anchor stands now, and by what; null when nothing on the page matches it. */
  locate: (anchor: PageAnchor) => AnchorFound<Element> | null;
  /**
   * Pin `el`'s element chosen in the overlay (The One Target Rule), or none;
   * `lead`, whether it leads the pointer's in Comment mode (a pill rested
   * on, a pin stepped to), left out to keep the lead as it was.
   */
  outline: (el: Element | null, lead?: boolean) => void;
  post: (type: string, payload?: object) => void;
  /**
   * The comment being written, its element no longer in the page (the page
   * drew it again): its target on the element its anchor, read at the
   * press, finds now; null while none stands there.
   */
  redraft: () => DraftTarget | null;
  /** The parked draft's pill pressed: its composer opens again. */
  reopenDraft: () => void;
  /** Whether an anchor's frames lead to one still loading: not found yet, and not gone. */
  waiting: (anchor: PageAnchor) => boolean;
}

export interface Pins {
  /**
   * The apps' Comment-mode tap (page.ts `appCommenting`, until tsk-59): a
   * comment pinned on `el` where the viewport's `x`, `y` landed, its thread
   * empty, and its card opened in the app (`cawco:pin-open`, `made`). Its id.
   */
  commentAt: (el: Element, x: number, y: number) => string;
  /** What of the page's viewport the host's chrome covers now (`cawco:covered`, the viewport's px); none when nothing does. */
  cover: (boxes: Box[]) => void;
  /**
   * Where pin `id`'s picture is cropped, the page's px, and what it shows
   * (its look: a new one is drawn again), and the element it is cropped
   * round when it stands on one; null when it is not on the page.
   */
  cropOf: (id: string) => { box: Box; el: Element | null; look: string } | null;
  /** The comment being written stands here (its hollow pill, no number yet), or none. */
  draft: (target: DraftTarget | null) => void;
  /** Pins drawn again where their elements stand now: done once they are painted (Floating UI places them in a promise). */
  /** Drawn where their elements stand now; `following`, a scroller moved them and nothing else changed. */
  draw: (following?: boolean) => Promise<void>;
  /** The layer fixed to the viewport, where pins on the page as a whole stand. */
  fixed: SVGSVGElement;
  /** The pin the host focused (J, K, its row), outlined and brought into view out from under the host's chrome; or none. */
  /**
   * Pin `id` focused, and with `scroll` brought into view: in one step with
   * `instant` (a thread opening, whose card stands where the pill lands),
   * else a glide. `keyed`, it was reached by the keyboard: its pill wears
   * the focus ring until a press.
   */
  focus: (
    id: string | null,
    scroll: boolean,
    instant?: boolean,
    keyed?: boolean
  ) => void;
  /** The pin whose row in the host's list the pointer or the keyboard rests on, its element chosen; none gives the focused pin's back. */
  hover: (id: string | null) => void;
  /** After a re-publish or an HMR update: the open thread's pin, if it now stands under the host's chrome, brought out again. */
  keepClear: () => void;
  layer: SVGSVGElement;
  /** The pins the agent is working on (`live`) and those with an answer the person hasn't read (`unread`), each its dot. */
  marks: (live: Set<string>, unread: Set<string>) => void;
  /** Pin `id`'s thread opened in the host (`cawco:pin-open`) by a press on the page, the pin as this page holds it with it; `made`, for one the apps' tap just made. */
  open: (id: string, made?: boolean) => void;
  /** A comment on an ink group: its composer opens on it. */
  pinInk: (group: InkGroup, elements: PinnedElement[] | string[]) => void;
  /** Pin `id` placed again on `el` at the viewport's `x`, `y`: out of the moved tray. */
  placeAgain: (id: string, el: Element, x: number, y: number) => void;
  /** Where on `el`'s box the viewport's `x`, `y` lands, as fractions. */
  pointOn: (el: Element, x: number, y: number) => { x: number; y: number };
  /** Every pin shown on the page, or hidden (⇧C). */
  show: (shown: boolean) => void;
  /** The elements its pins, and the comment being written, stand on now. */
  standingOn: () => Iterable<Element | null>;
  /** The pin whose thread the host shows, whose place it hears as the page scrolls; or none. */
  track: (id: string | null) => void;
}

/** Whether the page's point `at` lies where `el`'s frames and scroll containers show it; always, where nothing clips it. */
const showsAt = (el: Element | null, at: [number, number]): boolean => {
  const clip = el ? clipOf(el) : null;
  if (!clip) {
    return true;
  }
  const x = at[0] - scrollX;
  const y = at[1] - scrollY;
  return x >= clip.left && x <= clip.right && y >= clip.top && y <= clip.bottom;
};

/** Whether any of the page's box lies where `el`'s frames and scroll containers show it; always, where nothing clips it. */
const showsAny = (el: Element | null, box: Box): boolean => {
  const clip = el ? clipOf(el) : null;
  return (
    !clip ||
    meets(
      { x: box.x - scrollX, y: box.y - scrollY, w: box.w, h: box.h },
      { x: clip.x, y: clip.y, w: clip.width, h: clip.height }
    )
  );
};

/**
 * Where a pin stands: the point its tail stands on in the page (or, on the
 * page as a whole, the viewport), its element, what it stands on in the
 * page's coordinates, and whether its frames show that point now (for a pin
 * on ink, any of its strokes).
 */
interface Standing {
  at: [number, number];
  /** What the pin stands on, in the page's coordinates: its element's box, or its ink's. */
  box: Box;
  el: Element | null;
  /** On the page as a whole: drawn at the viewport's top-right, fixed to it. */
  page: boolean;
  shown: boolean;
}

/**
 * What a pill is placed against, the page's px: the point it stands on, and
 * the line of words that point is on; what it stands on (its element's box,
 * or its ink's) and its element; on the page as a whole, the viewport's
 * corner. A pin on ink is always shown: its box is the ink's, drawn where
 * it stands.
 */
interface Spot {
  box: Box;
  el: Element | null;
  ink?: true;
  line: Box | null;
  page: boolean;
  point: [number, number];
}

/** A pill as placed: its box and tail, and the point its tail stands on, the page's px. */
interface Placed {
  at: [number, number];
  pill: Pill;
}

/** The corner a pill's tail is, standing on its point; none for a pin on the page as a whole. */
type Tail = "bottom-start" | "bottom-end" | "top-start" | "top-end" | "none";

/** One pill as drawn: its box (the page's px, or the viewport's on the page as a whole) and its tail. */
interface Pill {
  box: Box;
  tail: Tail;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** The page's edges a pill keeps off: its ring's width in from the document's (its top, not the viewport's, so a pill never turns over as the page scrolls). */
const EDGES = { padding: RING, rootBoundary: "document" } as const;

/** The corner of a pill standing on its point, by where Floating UI placed the pill round it. */
const TAILS: Partial<Record<Placement, Tail>> = {
  "top-start": "bottom-start",
  "top-end": "bottom-end",
  "bottom-start": "top-start",
  "bottom-end": "top-end",
  "right-end": "bottom-start",
  "left-end": "bottom-end",
};

/** A box of the page's px as Floating UI reads a reference: a virtual element, its box in the viewport now, through every frame it stands in (frames.ts `pageBox`). */
const pageReference = (box: Box): VirtualElement => ({
  getBoundingClientRect: () =>
    DOMRect.fromRect({
      x: box.x - scrollX,
      y: box.y - scrollY,
      width: box.w,
      height: box.h,
    }),
});

/** Whether the pill as `flip` left it fits on its side: with no room past a line's end nor before its start, it stands at its point instead. */
const roomOnSide: Middleware = {
  name: "room",
  async fn(state) {
    const overflow = await detectOverflow(state, EDGES);
    const side = state.placement.split("-")[0] as keyof typeof overflow;
    return { data: { fits: overflow[side] <= 0 } };
  },
};

/** The pill Floating UI placed, `w` by `h`, its tail, and the point its tail stands on. */
const placedAt = (
  { placement, x, y }: ComputePositionReturn,
  w: number,
  h: number
): Placed => {
  const tail = TAILS[placement] ?? "bottom-start";
  const right = tail.endsWith("end");
  const below = tail.startsWith("bottom");
  return {
    at: [right ? x + w : x, below ? y + h : y],
    pill: { box: { x, y, w, h }, tail },
  };
};

/** `box` with {@link CROP_PAD} round it. */
export const padded = (box: Box): Box => ({
  x: box.x - CROP_PAD,
  y: box.y - CROP_PAD,
  w: box.w + 2 * CROP_PAD,
  h: box.h + 2 * CROP_PAD,
});

/** A box's path with each corner's own radius (top-left, top-right, bottom-right, bottom-left), each held to half the box. */
const shapePath = (
  { x, y, w, h }: Box,
  [tl, tr, br, bl]: [number, number, number, number]
): string => {
  const most = Math.min(w, h) / 2;
  const [a, b, c, d] = [tl, tr, br, bl].map((r) => Math.min(r, most));
  return [
    `M${x + a},${y}`,
    `H${x + w - b}`,
    `A${b},${b} 0 0 1 ${x + w},${y + b}`,
    `V${y + h - c}`,
    `A${c},${c} 0 0 1 ${x + w - c},${y + h}`,
    `H${x + d}`,
    `A${d},${d} 0 0 1 ${x},${y + h - d}`,
    `V${y + a}`,
    `A${a},${a} 0 0 1 ${x + a},${y}`,
    "Z",
  ].join(" ");
};

/** A pill's corners: round but for its tail; `by` grows each with the box, so a ring round it stays concentric. */
const corners = (
  h: number,
  tail: Tail,
  by: number
): [number, number, number, number] => {
  const pill = h / 2 + by;
  const hair = TAIL_R + by;
  return [
    tail === "top-start" ? hair : pill,
    tail === "top-end" ? hair : pill,
    tail === "bottom-end" ? hair : pill,
    tail === "bottom-start" ? hair : pill,
  ];
};

/** A pin's pill as drawn: its `<g>`, its pin's id, its box and tail, and its number. */
interface DrawnPill {
  group: SVGGElement;
  id: string;
  number: number;
  pill: Pill;
}

/** The pills that meet, grouped: each group's pills meet one another, one by one. */
function meetingGroups(drawn: DrawnPill[]): DrawnPill[][] {
  const groups: DrawnPill[][] = [];
  for (const one of drawn) {
    const meeting = groups.filter((group) =>
      group.some((other) => meets(other.pill.box, one.pill.box))
    );
    for (const group of meeting) {
      groups.splice(groups.indexOf(group), 1);
    }
    groups.push([...meeting.flat(), one]);
  }
  return groups;
}

/**
 * `into` brought to hold `nodes`, in order: a node is moved only where it
 * stands elsewhere, so one drawn again where it stood never leaves the page
 * (a press that started on it lands on it); what else it held is taken out.
 */
function holdIn(into: Element, nodes: Element[]) {
  for (const [i, node] of nodes.entries()) {
    const at = into.children[i];
    if (at !== node) {
      into.insertBefore(node, at ?? null);
    }
  }
  while (into.children.length > nodes.length) {
    into.lastElementChild?.remove();
  }
}

/** Each stack's way of laying its pills, stacked or fanned, as its last draw made it. */
const lays = new WeakMap<SVGGElement, (fan: boolean) => void>();

/**
 * One stack of pills that meet, in its `holder`: the newest in front, at
 * most {@link BEHIND} behind it a `--deck-step` ×2 further down-right each,
 * the rest left out until it fans; resting on it fans every pill into a row
 * `--space-1` apart, over `--dur-control` where motion is welcome. Drawn
 * again while the pointer rests on it, it stays fanned.
 */
function drawStack(
  holder: SVGGElement,
  group: DrawnPill[],
  look: { deck: number; gap: number; motion: string }
) {
  // Newest first: the front pill is the highest number.
  const ordered = group.toSorted((a, b) => b.number - a.number);
  holder.setAttribute("data-pin-stack", String(ordered.length));
  holder.style.pointerEvents = "auto";
  const front = ordered[0].pill.box;
  let before = 0;
  const steps = ordered.map((one, k) => {
    const deck = Math.min(k, BEHIND) * look.deck * 2;
    const step = {
      one,
      k,
      // Where it stands stacked, and fanned, from where it was placed.
      stacked: {
        x: front.x + deck - one.pill.box.x,
        y: front.y + deck - one.pill.box.y,
      },
      fanned: {
        x: front.x + before - one.pill.box.x,
        y: front.y - one.pill.box.y,
      },
    };
    before += one.pill.box.w + look.gap;
    return step;
  });
  const lay = (fan: boolean) => {
    for (const { one, k, stacked, fanned } of steps) {
      const to = fan ? fanned : stacked;
      one.group.style.transform = `translate(${to.x}px, ${to.y}px)`;
      one.group.style.opacity = !fan && k > BEHIND ? "0" : "1";
      one.group.style.pointerEvents = !fan && k > 0 ? "none" : "auto";
    }
  };
  for (const { one } of steps) {
    one.group.style.transition = look.motion;
  }
  holdIn(
    holder,
    steps.toReversed().map(({ one }) => one.group)
  );
  if (!lays.has(holder)) {
    holder.addEventListener("pointerenter", () => lays.get(holder)?.(true));
    holder.addEventListener("pointerleave", () => lays.get(holder)?.(false));
  }
  lays.set(holder, lay);
  lay(holder.matches(":hover"));
}

/** Whether the page is under a finger now: a pill's hit area grows to {@link FINGER}. */
const coarse = () => matchMedia("(pointer: coarse)").matches;

/** A pill's hit area, clear of nothing it draws: 44px round it under a finger, its ring's width round it under a pointer. */
const hitArea = (box: Box): SVGRectElement => {
  const area = coarse()
    ? grow(box, Math.max(0, (FINGER - box.h) / 2))
    : grow(box, RING);
  const hit = document.createElementNS(SVG, "rect");
  hit.setAttribute("x", String(area.x));
  hit.setAttribute("y", String(area.y));
  hit.setAttribute("width", String(area.w));
  hit.setAttribute("height", String(area.h));
  hit.setAttribute("fill", "transparent");
  return hit;
};

export function startPins(deps: PinsDeps): Pins {
  const { chrome } = deps;
  const layer = document.createElementNS(SVG, "svg");
  layer.setAttribute("data-cawco-pins", "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:absolute;left:0;top:0;z-index:2147483646;overflow:visible;pointer-events:none;margin:0;padding:0;border:0";
  document.documentElement.append(layer);
  const fixed = document.createElementNS(SVG, "svg");
  fixed.setAttribute("data-cawco-pins-fixed", "");
  fixed.setAttribute("aria-hidden", "true");
  fixed.setAttribute("width", "0");
  fixed.setAttribute("height", "0");
  fixed.style.cssText =
    "position:fixed;left:0;top:0;z-index:2147483646;overflow:visible;pointer-events:none;margin:0;padding:0;border:0";
  document.documentElement.append(fixed);

  /** The page's pins as its doc holds them, each whole (core `readPins`). */
  const pinsMap = () => readPins(artifact.doc());
  /**
   * Pin `id`'s thread opened in the host, carrying the pin as this page
   * holds it: a host whose own doc doesn't hold it yet (it reaches the
   * host's only through the hub, and the page's link is down) draws the
   * thread from that, and writes its words through the page (`cawco:reply`).
   */
  const open = (id: string, made = false) => {
    if (id === DRAFT_PIN) {
      deps.reopenDraft();
      return;
    }
    const pin = pinsMap().get(id);
    deps.post("cawco:pin-open", {
      id,
      // Every open the page makes is a press: the field draws no ring.
      via: "pointer",
      // The apps' card takes a pin it just made back when dismissed unsaid (`cawco:withdraw`).
      ...(made ? { made: true } : {}),
      ...(pin ? { pin } : {}),
    });
  };
  const onPage = () => artifact.kind() !== "canvas";
  /**
   * A pin whose element is gone may be moved aside, and an anchor that reads
   * otherwise now is written again, only on a page the agent wrote or a sheet
   * of its components (re-read after each HMR update), once it has laid out,
   * and once what the device kept of the doc is in (artifact.ts `stored`):
   * the hub's embedded copy may still hold a pin the device deleted, and a
   * write of it would stand against that deletion.
   */
  const settled = () =>
    (artifact.kind() === "page" || artifact.kind() === "component") &&
    document.readyState !== "loading" &&
    artifact.stored();

  /** Each placed pin: where it stands, and its pill as drawn; drawn while its frames show it. */
  const placed = new Map<string, Standing & { pill?: Pill }>();
  /** The comment being written: where it stands, and its pill. */
  let drafted: (DraftTarget & { standing?: Standing; pill?: Pill }) | null =
    null;
  let focused: string | null = null;
  /** The focused pin was reached by the keyboard: its pill wears the focus ring, until a press. */
  let keyed = false;
  let tracked: string | null = null;
  let live = new Set<string>();
  let unread = new Set<string>();
  /** When each unread answer's dot began its echo (`performance.now()`): its three loops run from there. */
  const echoed = new Map<string, number>();
  /** What of the page's viewport the host's chrome covers (`cawco:covered`): a phone's card or rail. */
  let covered: Box[] = [];
  /**
   * Whose pill the room under the page's foot, or its scroll container's,
   * was made for ({@link giveRoom}): a pin's id, or {@link DRAFT_PIN} for the
   * comment being written; null while the page has its own scroll.
   */
  let insetFor: string | null = null;
  /** The room given under a scroll container's content (scrollers.ts `padFoot`), while it stands. */
  let footPad: FootPad | null = null;

  const anchoredEl = (pin: Pin): Element | null =>
    "selector" in pin.anchor ? (deps.locate(pin.anchor)?.el ?? null) : null;

  /** Whether `el` is its document's page as a whole. */
  const isPage = (el: Element | null) =>
    !!el &&
    (el === el.ownerDocument.body || el === el.ownerDocument.documentElement);

  /** Where `el` stands with a pin at `point` on it, the page's px: the point, and the line of words it is on. */
  const spotOn = (
    el: Element,
    point: { x: number; y: number } | undefined
  ): Spot => {
    const box = pageBox(el);
    if (isPage(el)) {
      return { box, el, line: null, page: true, point: [0, 0] };
    }
    const at = point ?? { x: 1, y: 0 };
    const pressed: [number, number] = [
      box.x + at.x * box.w,
      box.y + at.y * box.h,
    ];
    return { box, el, line: lineAt(el, pressed), page: false, point: pressed };
  };

  /**
   * The line of `el`'s words a point pressed in its middle is on, the
   * page's px: the pill stands past that line's end, or before its start
   * (`place`), never on the press itself, where it would stand over the
   * words of the line above and of its own. Floating UI's `inline` reads a
   * reference's lines, but of two or more that meet it takes the band of
   * the outermost, not the line under a point; so the line is read here
   * from the same `getClientRects`. Null where the point is on no line of
   * words (a picture, the padding, past a line's end). A long element's
   * lines are not read: past {@link LINE_READ_MOST} characters the press
   * stands where it was.
   */
  const lineAt = (el: Element, [px, py]: [number, number]): Box | null => {
    if (
      el.ownerDocument !== document ||
      (el.textContent?.length ?? 0) > LINE_READ_MOST
    ) {
      return null;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    const x = px - scrollX;
    const y = py - scrollY;
    const fragments = [...range.getClientRects()].filter(
      (r) => r.width > 0 && r.top <= y && r.bottom >= y
    );
    if (fragments.length === 0) {
      return null;
    }
    const right = Math.max(...fragments.map((r) => r.right));
    if (x >= right) {
      return null;
    }
    const left = Math.min(...fragments.map((r) => r.left));
    const top = Math.min(...fragments.map((r) => r.top));
    const bottom = Math.max(...fragments.map((r) => r.bottom));
    return {
      x: left + scrollX,
      y: top + scrollY,
      w: right - left,
      h: bottom - top,
    };
  };

  /** Where pin `pin` stands in the page now, or null when it is not on it. */
  const spotOf = (pin: Pin): Spot | null => {
    if (pin.ink) {
      const box = deps.groupBox(pin.ink);
      return box
        ? {
            box,
            el: anchoredEl(pin),
            ink: true,
            line: null,
            page: false,
            point: [box.x + box.w, box.y],
          }
        : null;
    }
    if (!("selector" in pin.anchor)) {
      return null;
    }
    if (wholePage(pin.anchor)) {
      const el = deps.locate(pin.anchor)?.el ?? document.body;
      return el ? spotOn(el, undefined) : null;
    }
    const found = deps.locate(pin.anchor);
    return found ? spotOn(found.el, pin.point) : null;
  };

  /**
   * The page's edges as one draw places its pills against them: Floating UI
   * reads them off the root for every middleware of every pill (the
   * document's scroll extent, its scroll and its scrollbar, and each
   * through the canvas's viewport getters), and every pill is placed
   * against the same root, its own `EDGES`, in one draw. Read once per draw
   * ({@link drawNow} lets the last draw's go).
   */
  let edges: ReturnType<Platform["getClippingRect"]> | null = null;

  /**
   * Where a pill `w` wide stands on its spot, placed by Floating UI
   * (`computePosition`) against a virtual reference in the page's px: past
   * its line's end, in the line's band (`right-end`), else before its start
   * (`left-end`); with room on neither side, or on no line, up-right of its
   * point (`top-start`), up-left where the page's width leaves no room on
   * the right, below where its top leaves none above (`flip`), held off the
   * page's edges (`shift`). Its tail is the corner standing on the point.
   * One on the page as a whole stands at the viewport's top-right corner,
   * `--space-2` in, with no tail: no reference to place it against.
   */
  const place = async (
    spot: Spot,
    w: number,
    paint: Paint
  ): Promise<Placed> => {
    const h = paint.height;
    if (spot.page) {
      const right = document.documentElement.clientWidth;
      return {
        at: [0, 0],
        pill: {
          box: { x: right - paint.inset - w, y: paint.inset, w, h },
          tail: "none",
        },
      };
    }
    // The pill is drawn in the layer at the page's origin, not laid out:
    // Floating UI reads the page's edges off its root, places the pill in
    // the page's px (offset from the window), is told its size, and lays it
    // left to right on every page.
    const root = document.documentElement;
    const sized: Platform = {
      ...platform,
      // Floating UI hands each call its cache as `this` (its `_c`).
      getClippingRect(asked) {
        edges ??= platform.getClippingRect.call(this, asked);
        return edges;
      },
      getDimensions: () => ({ width: w, height: h }),
      getOffsetParent: () => window,
      isRTL: () => false,
    };
    if (spot.line) {
      const onLine = await computePosition(pageReference(spot.line), root, {
        placement: "right-end",
        platform: sized,
        middleware: [
          offset(1),
          flip({
            ...EDGES,
            crossAxis: false,
            fallbackPlacements: ["left-end"],
          }),
          roomOnSide,
          shift(EDGES),
        ],
      });
      if (onLine.middlewareData.room?.fits) {
        return placedAt(onLine, w, h);
      }
    }
    const [px, py] = spot.point;
    const atPoint = await computePosition(
      pageReference({ x: px, y: py, w: 0, h: 0 }),
      root,
      {
        placement: "top-start",
        platform: sized,
        middleware: [
          flip({
            ...EDGES,
            fallbackPlacements: ["top-end", "bottom-start", "bottom-end"],
          }),
          shift(EDGES),
        ],
      }
    );
    return placedAt(atPoint, w, h);
  };

  /** Where a pill `w` wide stands on `spot` now: placed ({@link place}), and whether its frames show its point. */
  const standingAt = async (
    spot: Spot,
    w: number,
    paint: Paint
  ): Promise<Standing & { pill: Pill }> => {
    const { at, pill } = await place(spot, w, paint);
    return {
      at,
      box: spot.box,
      el: spot.el,
      page: spot.page,
      pill,
      shown:
        spot.page ||
        (spot.ink ? showsAny(spot.el, spot.box) : showsAt(spot.el, at)),
    };
  };

  /**
   * The anchors whose element is found under another selector or text now
   * (a revision moved or reworded it), to be written back so the next look
   * finds it by its selector; one that still reads as it was, or whose words
   * alone changed where its selector still finds it, is left alone (core
   * `changedAnchor`). A moved pin whose anchor finds its element again (the
   * page drew it back, a revision restored it) stands on the page again,
   * out of the moved tray. Each as it is to be written.
   */
  const liveWords = wordsFollow();
  const reanchor = (pins: Pin[]) => {
    const moves: Pin[] = [];
    for (const pin of pins) {
      if (
        !("selector" in pin.anchor) ||
        (pin.movedAt && pin.ink && !deps.groupBox(pin.ink))
      ) {
        continue;
      }
      const found = deps.locate(deps.anchorToday(pin.anchor, pin.at));
      // Where in a file it stands was read as it was made or placed again, and stands.
      const now = found && {
        ...deps.anchorOf(found.el),
        ...(pin.anchor.file ? { file: pin.anchor.file } : {}),
      };
      if (
        now &&
        (pin.movedAt ||
          changedAnchor(pin.anchor, now, found.by) ||
          liveWords(pin.id, pin.anchor, now, found.by))
      ) {
        const { movedAt: _moved, ...rest } = pin;
        moves.push({ ...rest, anchor: now });
      }
    }
    return moves;
  };

  /** The tokens a pill is painted with, read once per draw in one style pass: a token is the page's style, read there and then. */
  const paintOf = () => {
    const read = chrome.tokens({
      action: ["--action-solid"],
      onAction: ["--on-action"],
      raised: ["--surface-raised"],
      recessed: ["--surface-fill-strong"],
      strong: ["--ink-strong"],
      focus: ["--focus-ring"],
      shadow: ["--shadow-tint"],
      dot: ["--status-live-glyph"],
      attn: ["--status-attn-glyph"],
      font: ["--type-label", "font"],
      height: ["--c-pin", "width"],
      pad: ["--c-pin-pad", "width"],
      deck: ["--deck-step", "width"],
      gap: ["--space-1", "width"],
      inset: ["--space-2", "width"],
      dotSize: ["--status-dot-size", "width"],
      dotCut: ["--status-dot-cut", "width"],
      loop: ["--dur-loop", "transition-duration"],
      breath: ["--breath", "transition-duration"],
      breathFloor: ["--breath-floor", "opacity"],
      breathEase: ["--ease-in-out", "transition-timing-function"],
      control: ["--dur-control", "transition-duration"],
      ease: ["--ease-out", "transition-timing-function"],
    });
    return {
      action: read.action,
      onAction: read.onAction,
      raised: read.raised,
      recessed: read.recessed,
      strong: read.strong,
      focus: read.focus,
      shadow: read.shadow,
      dot: read.dot,
      attn: read.attn,
      font: read.font,
      height: Number.parseFloat(read.height) || 28,
      pad: Number.parseFloat(read.pad) || 8,
      deck: Number.parseFloat(read.deck) || 1.25,
      gap: Number.parseFloat(read.gap) || 4,
      inset: Number.parseFloat(read.inset) || 8,
      dotSize: Number.parseFloat(read.dotSize) || 6,
      dotCut: Number.parseFloat(read.dotCut) || 1.5,
      loop: durationMs(read.loop),
      breath: durationMs(read.breath),
      breathFloor: Number.parseFloat(read.breathFloor),
      breathEase: read.breathEase,
      control: durationMs(read.control),
      ease: read.ease,
    };
  };
  type Paint = ReturnType<typeof paintOf>;

  /** The figures' width in the pill's face, px. */
  let measure: CanvasRenderingContext2D | null = null;
  /**
   * A pill's width for `label`, as PinMark lays it out: its figures with
   * `--c-pin-pad` each side, never narrower than `--c-pin`, in every state
   * (a hollow pill's edge is drawn inside its box).
   */
  const pillWidth = (label: string, paint: Paint) => {
    measure ??= document.createElement("canvas").getContext("2d");
    if (!measure) {
      return paint.height;
    }
    measure.font = paint.font;
    // Tabular figures: every digit as wide as the widest.
    const digit = Math.max(
      ...[..."0123456789"].map((d) => measure?.measureText(d).width ?? 0)
    );
    return Math.max(paint.height, digit * label.length + 2 * paint.pad);
  };

  const stateOf = (pin: Pin | null): PinState => {
    if (!pin) {
      return "provisional";
    }
    if (pin.resolvedAt) {
      return "resolved";
    }
    return pinUnsent(pin) ? "unsent" : "sent";
  };

  const pathEl = (d: string, fill: string) => {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", fill);
    return path;
  };

  /**
   * One pill painted into its `<g>`, every part it held before replaced and
   * the group itself kept (a press on it lands whatever is drawn under it
   * meanwhile): `under` first (its hit area), then its focus ring when the
   * keyboard reached it, its raised ring with the xs shadow, its face by
   * state (the artifact panel's surface brief, A pin's pill), its number, its dot, and `over`.
   */
  const paintPill = (
    g: SVGGElement,
    pin: Pin | null,
    pill: Pill,
    paint: Paint,
    {
      under = [],
      over = [],
    }: { under?: SVGElement[]; over?: SVGElement[] } = {}
  ) => {
    const state = stateOf(pin);
    g.setAttribute("data-state", state);
    g.setAttribute("data-tail", pill.tail);
    const { box, tail } = pill;
    const parts: SVGElement[] = [...under];
    if (pin && keyed && pin.id === focused) {
      const focus = pathEl(
        shapePath(grow(box, 2 * RING), corners(box.h, tail, 2 * RING)),
        paint.focus
      );
      focus.setAttribute("data-focus-ring", "");
      parts.push(focus);
    }
    const ring = pathEl(
      shapePath(grow(box, RING), corners(box.h, tail, RING)),
      paint.raised
    );
    ring.style.filter = `drop-shadow(0 1px 1px ${paint.shadow})`;
    ring.setAttribute("data-ring", "");
    parts.push(ring);
    const faces: Record<PinState, { edge: string; face: string; ink: string }> =
      {
        provisional: { edge: paint.action, face: paint.raised, ink: "" },
        unsent: { edge: paint.action, face: paint.raised, ink: paint.action },
        sent: { edge: paint.action, face: paint.action, ink: paint.onAction },
        resolved: {
          edge: paint.recessed,
          face: paint.recessed,
          // Strong ink on the recessed face: the muted ink there reads
          // 3.9:1, under the 4.5:1 a figure needs.
          ink: paint.strong,
        },
      };
    const look = faces[state];
    const face = pathEl(shapePath(box, corners(box.h, tail, 0)), look.edge);
    // The pill's own box, its tail corner on the pressed point.
    face.setAttribute("data-face", "");
    parts.push(face);
    if (look.face !== look.edge) {
      // Hollow: a 2px edge in the action ink, the face raised inside it.
      parts.push(
        pathEl(
          shapePath(grow(box, -RING), corners(box.h, tail, -RING)),
          look.face
        )
      );
    }
    if (pin) {
      const number = document.createElementNS(SVG, "text");
      number.setAttribute("x", String(box.x + box.w / 2));
      number.setAttribute("y", String(box.y + box.h / 2));
      number.setAttribute("text-anchor", "middle");
      number.setAttribute("dominant-baseline", "central");
      number.setAttribute("fill", look.ink);
      number.style.font = paint.font;
      number.style.fontVariantNumeric = "tabular-nums";
      number.style.userSelect = "none";
      number.textContent = String(pin.number);
      parts.push(number);
    }
    if (pin && (live.has(pin.id) || unread.has(pin.id))) {
      parts.push(...dotOf(pin.id, box, paint));
    }
    parts.push(...over);
    g.replaceChildren(...parts);
  };

  /**
   * A pill's dot on its top end, cut round by `--status-dot-cut`: working,
   * the live dot, breathing; an answer unread, the needs-you dot with its
   * echo (DESIGN.md, Status dot).
   */
  const dotOf = (id: string, box: Box, paint: Paint): SVGElement[] => {
    const r = paint.dotSize / 2;
    const cx = box.x + box.w - 1;
    const cy = box.y + 1;
    const cut = document.createElementNS(SVG, "circle");
    cut.setAttribute("cx", String(cx));
    cut.setAttribute("cy", String(cy));
    cut.setAttribute("r", String(r + paint.dotCut));
    cut.setAttribute("fill", paint.raised);
    const working = live.has(id);
    const mark = document.createElementNS(SVG, "circle");
    mark.setAttribute("cx", String(cx));
    mark.setAttribute("cy", String(cy));
    mark.setAttribute("r", String(r));
    mark.setAttribute("fill", working ? paint.dot : paint.attn);
    mark.setAttribute("data-dot", working ? "live" : "unread");
    if (!working) {
      return [cut, mark, echoOf(id, cx, cy, r, paint)];
    }
    if (motionOk()) {
      // Live work breathes (DESIGN.md), on the one shared breath the
      // dashboard's live dot runs (its `breath` keyframes: down to the floor
      // half a breath in and back, each half on --ease-in-out), the owner's
      // pick: "One breath everywhere".
      const breath = mark.animate(
        [
          { opacity: 1, easing: paint.breathEase },
          { opacity: paint.breathFloor, easing: paint.breathEase },
          { opacity: 1 },
        ],
        { duration: paint.breath, iterations: Number.POSITIVE_INFINITY }
      );
      // On the one clock (core breath.ts): in step with the dashboard's
      // live dots and with this pill as it was drawn before, never from
      // its start.
      const now = Number(document.timeline.currentTime ?? performance.now());
      breath.startTime =
        now - breathPhase(performance.timeOrigin, now, paint.breath);
    }
    return [cut, mark];
  };

  /**
   * An unread answer's echo on its dot: a ring growing from it as it fades,
   * once a `--dur-loop`, three loops from when the answer was first drawn
   * unread and then still, however often the pill is drawn again in them.
   */
  const echoOf = (
    id: string,
    cx: number,
    cy: number,
    r: number,
    paint: Paint
  ): SVGCircleElement => {
    const ring = document.createElementNS(SVG, "circle");
    ring.setAttribute("cx", String(cx));
    ring.setAttribute("cy", String(cy));
    ring.setAttribute("r", String(r));
    ring.setAttribute("fill", paint.attn);
    ring.setAttribute("data-echo", "");
    ring.style.opacity = "0";
    ring.style.transformBox = "fill-box";
    ring.style.transformOrigin = "center";
    const now = performance.now();
    const started = echoed.get(id) ?? now;
    echoed.set(id, started);
    const spent = now - started;
    if (motionOk() && spent < paint.loop * ECHOES) {
      const echo = ring.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(2)", offset: 0.75 },
          { opacity: 0, transform: "scale(2)" },
        ],
        { duration: paint.loop, iterations: ECHOES, easing: paint.ease }
      );
      echo.currentTime = spent;
    }
    return ring;
  };

  /**
   * Each drawn pill's `<g>`, by its pin's id, kept from draw to draw while
   * its pin is drawn: a draw paints it again in place (`paintPill`), so a
   * press that started on it still lands on it, whatever is drawn under the
   * pointer between its pointerdown and its pointerup.
   */
  const pills = new Map<string, SVGGElement>();
  /** Each stack's `<g>`, by its pins' ids, kept while the same pills meet. */
  const stacks = new Map<string, SVGGElement>();
  /** The comment being written's pill, kept as its pins' are. */
  let draftPill: SVGGElement | null = null;

  /**
   * Pin `id`'s pill, pressable: made once, with what resting on it and
   * pressing it do read where it stands now ({@link placed}); resting on it
   * chooses its element and asks for its peek.
   */
  const pillOf = (id: string): SVGGElement => {
    const kept = pills.get(id);
    if (kept) {
      return kept;
    }
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("data-pin-id", id);
    g.style.pointerEvents = "auto";
    g.style.cursor = "pointer";
    g.addEventListener("pointerenter", () => {
      const where = placed.get(id);
      if (!where?.pill) {
        return;
      }
      const { box } = where.pill;
      deps.outline(where.el, true);
      const shown = where.page ? 0 : 1;
      deps.post("cawco:peek", {
        id,
        mark: {
          x: box.x - shown * scrollX,
          y: box.y - shown * scrollY,
          w: box.w,
          h: box.h,
        },
      });
    });
    g.addEventListener("pointerleave", () => {
      deps.outline(focused ? (placed.get(focused)?.el ?? null) : null, false);
      deps.post("cawco:peek", { id: null });
    });
    g.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deps.post("cawco:peek", { id: null });
      open(id);
    });
    pills.set(id, g);
    return g;
  };

  /** A pin's pill painted at `pill`, in its kept `<g>`. */
  const pinPill = (pin: Pin, pill: Pill, paint: Paint): SVGGElement => {
    const g = pillOf(pin.id);
    g.setAttribute("data-pin", String(pin.number));
    paintPill(g, pin, pill, paint, { under: [hitArea(pill.box)] });
    return g;
  };

  /**
   * Writes the pins found again by their source, text or the page, and moves
   * aside those no anchor finds; never one the doc holds deleted (core
   * `goneOf`), nor one gone from the doc since it was read. Written as the
   * overlay's own placing (artifact.ts `PLACED`): the draw that wrote it
   * has drawn it, so it draws nothing again here.
   */
  const settle = (moves: Pin[], missing: Pin[]) => {
    const pins = pinsMap();
    const buried = tombstonesOf(artifact.doc());
    const stillHeld = (pin: Pin) => pins.has(pin.id) && !buried.has(pin.id);
    const found = moves.filter(stillHeld);
    const aside = missing.filter(stillHeld);
    if (found.length === 0 && aside.length === 0) {
      return;
    }
    const at = new Date().toISOString();
    const doc = artifact.doc();
    doc.transact(() => {
      for (const pin of found) {
        placePin(doc, pin.id, placeOf(pin));
      }
      for (const pin of aside) {
        placePin(doc, pin.id, { ...placeOf(pin), movedAt: at });
      }
    }, PLACED);
  };

  /** Whether a pin no anchor finds is missing, not waiting on a frame still loading. */
  const goneFrom = (pin: Pin) =>
    !("selector" in pin.anchor && deps.waiting(pin.anchor));
  /** How long each pin has stood missing: one is gone only after a while, the page drawn again then. */
  const absent = absences(() => draw());

  /**
   * The pills that meet, stacked ({@link meetingGroups}, {@link drawStack}),
   * each stack in its kept `<g>`; a pill alone stands as itself, any look a
   * stack gave it taken off. What its layer holds, in order.
   */
  const stacked = (drawn: DrawnPill[], paint: Paint): SVGElement[] =>
    meetingGroups(drawn).map((group) => {
      if (group.length === 1) {
        const { style } = group[0].group;
        style.transform = "";
        style.opacity = "";
        style.transition = "";
        style.pointerEvents = "auto";
        return group[0].group;
      }
      const key = group
        .map((one) => one.id)
        .sort()
        .join(" ");
      let holder = stacks.get(key);
      if (!holder) {
        holder = document.createElementNS(SVG, "g");
        stacks.set(key, holder);
      }
      drawStack(holder, group, {
        deck: paint.deck,
        gap: paint.gap,
        motion: motionOk()
          ? `transform ${paint.control}ms ${paint.ease}, opacity ${paint.control}ms ${paint.ease}`
          : "",
      });
      return holder;
    });

  /**
   * Where each pin stands now, placed ({@link standingAt}); the pins no
   * anchor finds, apart. A resolved pin stands on the page only while its
   * thread is open.
   */
  const placeAll = async (all: Pin[], paint: Paint) => {
    const missing: Pin[] = [];
    const onIt = (pin: Pin) => !pin.resolvedAt || pin.id === tracked;
    const spots: { pin: Pin; spot: Spot }[] = [];
    for (const pin of all.filter((one) => !one.movedAt && onIt(one))) {
      const spot = spotOf(pin);
      if (spot) {
        spots.push({ pin, spot });
      } else {
        missing.push(pin);
      }
    }
    const standings = await Promise.all(
      spots.map(({ pin, spot }) =>
        standingAt(spot, pillWidth(String(pin.number), paint), paint)
      )
    );
    return {
      missing,
      standing: spots.map(({ pin }, i) => ({ pin, where: standings[i] })),
    };
  };

  /**
   * Each placed pin painted, a pill for each its frames show; answers those
   * drawn on the page and in the layer fixed to the viewport, and those
   * that are gone: no anchor finds them, no frame they stand in is loading,
   * and they have stood so for a while ({@link absences}).
   */
  const paintAll = (
    { missing, standing }: Awaited<ReturnType<typeof placeAll>>,
    paint: Paint
  ) => {
    const drawn: DrawnPill[] = [];
    const drawnFixed: DrawnPill[] = [];
    for (const { pin, where } of standing) {
      placed.set(pin.id, where);
      // A pin in a frame scrolled away from it stands hidden until the frame shows it again.
      if (where.shown) {
        (where.page ? drawnFixed : drawn).push({
          group: pinPill(pin, where.pill, paint),
          id: pin.id,
          pill: where.pill,
          number: pin.number,
        });
      }
    }
    return {
      layer: stacked(drawn, paint),
      fixed: stacked(drawnFixed, paint),
      gone: goneOf(missing),
    };
  };

  /**
   * Of the pins no anchor finds now, those gone: no frame they stand in
   * loading, and missing a while ({@link absences}). None where a pin is
   * never moved aside ({@link settled}: a preview of a session's app): its
   * absence is not timed, so no timer draws the page again for it.
   */
  const goneOf = (missing: Pin[]): Pin[] => {
    if (!settled()) {
      absent.keep([]);
      return [];
    }
    const waited = missing.filter(goneFrom);
    absent.keep(waited.map((pin) => pin.id));
    return waited.filter((pin) => absent.missed(pin.id));
  };

  /** Where the comment being written stands now: on its ink, or on its element (the one the page holds now); null where neither stands. */
  const draftSpot = (draft: DraftTarget): Spot | null => {
    if (draft.ink) {
      const box = deps.groupBox(draft.ink);
      return box
        ? {
            box,
            el: draft.el,
            ink: true,
            line: null,
            page: false,
            point: [box.x + box.w, box.y],
          }
        : null;
    }
    // The page drew its element again: the pill stands on the one there now.
    const now = draft.el.isConnected ? null : deps.redraft();
    if (now) {
      drafted = { ...now };
    }
    const el = now?.el ?? draft.el;
    return el.isConnected ? spotOn(el, (now ?? draft).point) : null;
  };

  /** The comment being written's kept `<g>`: a press on it, while it is parked, opens its composer again. */
  const draftPillOf = (): SVGGElement => {
    if (draftPill) {
      return draftPill;
    }
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("data-pin", "new");
    g.addEventListener("click", (event) => {
      if (!drafted?.parked) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      open(DRAFT_PIN);
    });
    draftPill = g;
    return g;
  };

  /**
   * The comment being written, painted as its hollow pill with no number in
   * its kept `<g>`; parked, an ellipsis in the action ink says it holds
   * words not yet sent, and one press (a finger's 44px) opens its composer
   * again with them (The Work Outlives Its Surface Rule). Null while it
   * stands nowhere; else its pill and whether it stands on the page as a
   * whole.
   */
  const drawDraft = (
    where: (Standing & { pill: Pill }) | null,
    paint: Paint
  ): { g: SVGGElement; page: boolean } | null => {
    if (!drafted) {
      return null;
    }
    if (!where) {
      drafted.standing = undefined;
      drafted.pill = undefined;
      return null;
    }
    const { pill } = where;
    drafted.standing = where;
    drafted.pill = pill;
    const g = draftPillOf();
    const parked = !!drafted.parked;
    g.toggleAttribute("data-parked", parked);
    if (parked) {
      g.setAttribute("data-pin-id", DRAFT_PIN);
    } else {
      g.removeAttribute("data-pin-id");
    }
    g.style.pointerEvents = parked ? "auto" : "";
    g.style.cursor = parked ? "pointer" : "";
    paintPill(
      g,
      null,
      pill,
      paint,
      parked
        ? { under: [hitArea(pill.box)], over: parkedMarks(pill, paint) }
        : {}
    );
    return { g, page: where.page };
  };

  /** A parked draft's name and its ellipsis, over its hollow pill. */
  const parkedMarks = (pill: Pill, paint: Paint): SVGElement[] => {
    const { box } = pill;
    const name = document.createElementNS(SVG, "title");
    name.textContent = "Draft comment, not sent";
    const dots = document.createElementNS(SVG, "text");
    dots.setAttribute("x", String(box.x + box.w / 2));
    dots.setAttribute("y", String(box.y + box.h / 2));
    dots.setAttribute("text-anchor", "middle");
    dots.setAttribute("dominant-baseline", "central");
    dots.setAttribute("fill", paint.action);
    dots.style.font = paint.font;
    dots.style.userSelect = "none";
    dots.textContent = "…";
    return [name, dots];
  };

  /** Where the comment being written stands now, placed; null where it stands nowhere. */
  const placeDraft = (paint: Paint) => {
    const spot = drafted && draftSpot(drafted);
    return spot ? standingAt(spot, paint.height, paint) : null;
  };

  /** Draws asked for so far: a draw placing its pills paints them only while no later one was asked for. */
  let draws = 0;
  /** The latest draw: done once it, or a draw asked for after it, has painted. */
  let lastDraw: Promise<void> = Promise.resolve();

  /**
   * The pins drawn where their elements stand now. Each pin's anchor is read
   * again first ({@link reanchor}), so a pin found again stands in this very
   * draw; what that and the pins gone write is written once the pills stand
   * ({@link settle}), as the overlay's own placing, which wakes no draw.
   * Every pill, stack and the draft keeps its node: each layer is brought to
   * hold what is drawn now, a node moved only where it stands elsewhere.
   * Floating UI places the pills (`computePosition`, which answers in a
   * promise); a draw a later one overtook while they were placed paints
   * nothing, and is done when that later one is.
   */
  function draw(following = false): Promise<void> {
    draws += 1;
    lastDraw = drawNow(draws, following);
    return lastDraw;
  }

  /** The paint of the last whole draw: a scroller moving the pills changes no token. */
  let painted: Paint | null = null;
  /**
   * The paint is read off the page's style, which forces its style and
   * layout there and then: a page with no pins is not made to pay for it.
   */
  const paintFor = (drawing: boolean, following: boolean) => {
    painted = drawing ? ((following ? painted : null) ?? paintOf()) : null;
    return painted;
  };

  async function drawNow(asked: number, following: boolean): Promise<void> {
    edges = null;
    if (!(onPage() && artifact.keeps())) {
      placed.clear();
      holdIn(layer, []);
      holdIn(fixed, []);
      forgetUnheld();
      fitToPage(layer, false);
      return;
    }
    const read = [...pinsMap().values()].sort((a, b) => a.number - b.number);
    // A scroller moved the page's elements and changed none of them: no
    // anchor reads otherwise, the page is no taller, and no token moved.
    const moves = !following && settled() ? reanchor(read) : [];
    const found = new Map(moves.map((pin) => [pin.id, pin]));
    const all = read.map((pin) => found.get(pin.id) ?? pin);
    const drawing = all.length > 0 || !!drafted;
    if (!following) {
      fitToPage(layer, drawing || footKept());
    }
    const paint = paintFor(drawing, following);
    const [pinsAt, draftAt] = paint
      ? await Promise.all([placeAll(all, paint), placeDraft(paint)])
      : [null, null];
    if (asked !== draws) {
      return lastDraw;
    }
    paintDrawn(moves, paint && pinsAt ? { draftAt, paint, pinsAt } : null);
  }

  /** What a draw placed, painted: each layer brought to hold its pills, the moved and gone written, the host told. */
  function paintDrawn(
    moves: Pin[],
    drawn: {
      draftAt: (Standing & { pill: Pill }) | null;
      paint: Paint;
      pinsAt: Awaited<ReturnType<typeof placeAll>>;
    } | null
  ) {
    placed.clear();
    let gone: Pin[] = [];
    const onLayer: SVGElement[] = [];
    const onFixed: SVGElement[] = [];
    if (drawn) {
      const { draftAt, paint, pinsAt } = drawn;
      const at = paintAll(pinsAt, paint);
      ({ gone } = at);
      onLayer.push(...at.layer);
      onFixed.push(...at.fixed);
      const draft = drawDraft(draftAt, paint);
      if (draft) {
        (draft.page ? onFixed : onLayer).push(draft.g);
      }
    }
    holdIn(layer, onLayer);
    holdIn(fixed, onFixed);
    forgetUnheld();
    if (settled()) {
      settle(moves, gone);
    }
    if (focused) {
      deps.outline(placed.get(focused)?.el ?? null);
    }
    tell();
  }

  /** The kept pills and stacks no layer holds now let go. */
  const forgetUnheld = () => {
    for (const [id, g] of pills) {
      if (!g.isConnected) {
        pills.delete(id);
      }
    }
    for (const [key, g] of stacks) {
      if (!g.isConnected) {
        stacks.delete(key);
      }
    }
    if (draftPill && !draftPill.isConnected) {
      draftPill = null;
    }
  };

  /** A pill's box in the viewport, px. */
  const shownBox = (where: Standing, pill: Pill): Box =>
    where.page
      ? pill.box
      : {
          x: pill.box.x - scrollX,
          y: pill.box.y - scrollY,
          w: pill.box.w,
          h: pill.box.h,
        };
  /** What a pin stands on, in the viewport, px. */
  const shownStanding = (where: Standing): Box => ({
    x: where.box.x - scrollX,
    y: where.box.y - scrollY,
    w: where.box.w,
    h: where.box.h,
  });

  /**
   * The open pin's pill in the viewport, and the box of what it stands on,
   * for the host's thread card, which stands beside the pill where it has
   * room. The comment being written, the same for its composer.
   */
  const tell = () => {
    if (tracked) {
      const where = placed.get(tracked);
      const shown = where?.shown && where.pill ? where : undefined;
      deps.post("cawco:pin-at", {
        id: tracked,
        ...(shown?.pill
          ? { mark: shownBox(shown, shown.pill), box: shownStanding(shown) }
          : {}),
      });
    }
    if (drafted?.standing && drafted.pill) {
      deps.post("cawco:compose-at", {
        mark: shownBox(drafted.standing, drafted.pill),
        box: shownStanding(drafted.standing),
      });
    }
  };
  let frame = 0;
  const onScroll = () => {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        tell();
        if (focused) {
          deps.outline(placed.get(focused)?.el ?? null);
        }
      });
    }
  };
  addEventListener("scroll", onScroll, { capture: true, passive: true });
  // A press ends keyboard focus: the focused pin's ring is taken off its
  // pill, every pill kept as it stands. Drawn again here, each pill was a
  // new node by the press's pointerup, so the browser sent its click to the
  // layer, and a press on a pill after a key had opened a thread opened
  // nothing.
  addEventListener(
    "pointerdown",
    () => {
      if (!keyed) {
        return;
      }
      keyed = false;
      for (const ring of [layer, fixed].flatMap((one) => [
        ...one.querySelectorAll("[data-focus-ring]"),
      ])) {
        ring.remove();
      }
    },
    { capture: true, passive: true }
  );
  // The viewport's width moves the pins on the page as a whole, and which side a pill's tail takes.
  addEventListener("resize", () => draw(), { passive: true });
  // Asking for less motion stops a live dot's breath at once, and asking
  // for it again starts it, in step (DESIGN.md, The Reduced Motion Rule).
  matchMedia("(prefers-reduced-motion: no-preference)").addEventListener(
    "change",
    () => draw()
  );

  /**
   * Pin `id` brought where the person sees it: inside the viewport and out
   * from under every box the host's chrome covers the page with (a phone's
   * card or rail), each scroller round it moved as little as lands it there
   * (scrollers.ts `bringInto`). A pin already standing there stays where the
   * person is looking.
   */
  const reveal = (id: string, instant = false) => {
    const where = placed.get(id);
    if (where && !where.page) {
      bringOut(where, id, instant);
    }
  };

  /**
   * A pill standing at `where`, `owner`'s (a pin's id, or {@link DRAFT_PIN}
   * for the comment being written), brought out as {@link reveal} says. One
   * no scroll can lift clear of what the host's chrome covers (a page or a
   * scroll container too short to scroll it there) is given room
   * ({@link giveRoom}), the covered height and the gap a lifted pill keeps
   * (scrollers.ts `liftUnder`), as iOS insets content above its keyboard,
   * and lifted into it; the room stays while `owner`'s pill is the one kept
   * clear ({@link staleInset}).
   */
  const bringOut = (
    where: Standing & { pill?: Pill },
    owner: string,
    instant = false
  ) => {
    const r = (where.pill?.box.h ?? 20) / 2;
    const x = where.at[0] - scrollX;
    const y = where.at[1] - scrollY;
    const clear = bandsAt(x, covered, r);
    if (where.shown && inBands(y, clear)) {
      return;
    }
    const chain = scrollersOf(where.el, rectOf);
    let landed = bringInto(chain, y, clear);
    const room = landed ? 0 : liftUnder(x, covered, r);
    if (room > 0 && giveRoom(chain, room, owner)) {
      landed = bringInto(chain, y, clear);
    }
    // Out from under nothing (nothing round it takes room): at least in the viewport.
    const moves = landed ?? bringInto(chain, y, bandsAt(x, [], r));
    if (moves) {
      const smooth = motionOk() && !instant;
      scrollMoves(moves, smooth ? "smooth" : "auto");
      if (smooth) {
        lookAfterGlide();
      }
    }
  };

  let glideLook: ReturnType<typeof setTimeout> | undefined;
  /**
   * A glide can stop short of where it was sent, and the pill then stands
   * under the sheet for good (WebKit, a short page: 43px short for 15 s): once
   * it has had its time, a pill still under is brought out in one step.
   */
  const lookAfterGlide = () => {
    clearTimeout(glideLook);
    glideLook = setTimeout(() => {
      lastDraw.then(
        () => bringOutUnder(true),
        () => bringOutUnder(true)
      );
    }, GLIDE_MS);
  };

  /**
   * Room `px` (the viewport's px) for `owner`'s pill, under the foot of what
   * the person scrolls to reach it: the page's, where the person scrolls the
   * page (the overlay's layers run past its scroll, ink.ts `insetFoot`);
   * else, as in an app's shell whose body is `overflow: hidden`, the pill's
   * own scroll container's (scrollers.ts `padFoot`), so the shell stays put
   * and its list scrolls further. Whether any was given: none where the page
   * holds its scroll and no container scrolls the pill.
   */
  const giveRoom = (chain: Scroller[], px: number, owner: string) => {
    const page = pageScrolls();
    const inner = page ? null : innerScroller(chain);
    if (!(page || inner)) {
      return false;
    }
    insetFor = owner;
    if (inner) {
      insetFoot(0);
      footPad = padFoot(inner.el, px / inner.scale, footPad);
    } else {
      if (footPad) {
        unpadFoot(footPad);
        footPad = null;
      }
      insetFoot(px);
    }
    fitToPage(layer, true);
    return true;
  };

  /**
   * Whether the room given for a pill is no longer needed: nothing covers
   * the page, or the pill it was made for is no longer the open thread's,
   * the stepped-to one's or the comment being written. Taken back here, the
   * container's style as it was; the caller draws, which fits the layers to
   * the page's own scroll.
   */
  const staleInset = () => {
    const kept =
      insetFor !== null &&
      covered.length > 0 &&
      (insetFor === tracked ||
        insetFor === focused ||
        (insetFor === DRAFT_PIN && !!drafted && !drafted.parked));
    if (insetFor === null || kept) {
      return false;
    }
    insetFor = null;
    insetFoot(0);
    if (footPad) {
      unpadFoot(footPad);
      footPad = null;
    }
    return true;
  };

  /**
   * The open thread's pin, and the comment being written, when its pill
   * stands under what the host's chrome covers (a phone's thread or composer
   * at the well's foot), brought out again.
   */
  const keepClear = () => {
    // Where they stand once the draw in hand has placed them.
    lastDraw.then(
      () => bringOutUnder(),
      () => bringOutUnder()
    );
  };
  const bringOutUnder = (instant = false) => {
    const under = (at: Standing, face: Pill) =>
      !at.page && covered.some((one) => meets(shownBox(at, face), one));
    const where = tracked ? placed.get(tracked) : undefined;
    if (tracked && where?.pill && under(where, where.pill)) {
      reveal(tracked, instant);
    }
    const draft = drafted?.parked ? undefined : drafted;
    if (draft?.standing && draft.pill && under(draft.standing, draft.pill)) {
      bringOut({ ...draft.standing, pill: draft.pill }, DRAFT_PIN, instant);
    }
  };

  /** A new pin written whole (its head, place and thread its own keys). */
  const write = (pin: Pin) => writePin(artifact.doc(), pin);
  /** The number a new pin takes: one past the highest; a deleted pin's is never reused while a higher one stands. */
  const nextNumber = () =>
    Math.max(0, ...[...pinsMap().values()].map((pin) => pin.number)) + 1;

  /** Where the viewport's `x`, `y` is on `el`'s box, as fractions; 0 along an extent it has none of (a body whose content is all fixed). */
  const pointOn = (el: Element, x: number, y: number) => {
    const box = pageBox(el);
    const along = (at: number, from: number, extent: number) =>
      extent > 0 ? round(Math.min(1, Math.max(0, (at - from) / extent))) : 0;
    return {
      x: along(x + scrollX, box.x, box.w),
      y: along(y + scrollY, box.y, box.h),
    };
  };

  /** A pin's element's box, within {@link PIN_REACH} of the point it stands at. */
  const roundPoint = (box: Box, at: [number, number]): Box => {
    const x = Math.max(box.x, at[0] - PIN_REACH.x);
    const y = Math.max(box.y, at[1] - PIN_REACH.y);
    return {
      x,
      y,
      w: Math.max(1, Math.min(box.x + box.w, at[0] + PIN_REACH.x) - x),
      h: Math.max(1, Math.min(box.y + box.h, at[1] + PIN_REACH.y) - y),
    };
  };

  /** The viewport as it stands, in the page's px: a pin on the page as a whole is pictured by what the person saw. */
  const viewport = (): Box => ({
    x: scrollX,
    y: scrollY,
    w: document.documentElement.clientWidth,
    h: innerHeight,
  });

  return {
    layer,
    fixed,
    draw,
    open,
    pointOn,
    cropOf: (id) => {
      const pin = pinsMap().get(id);
      const where = placed.get(id);
      if (!(pin && where)) {
        return null;
      }
      if (pin.ink) {
        const box = deps.groupBox(pin.ink);
        return box
          ? {
              box: padded(box),
              el: null,
              look: `ink:${pin.ink}:${JSON.stringify(box)}`,
            }
          : null;
      }
      if (where.page) {
        const box = viewport();
        return { box, el: null, look: `page:${JSON.stringify(box)}` };
      }
      if (!where.el) {
        return null;
      }
      const box = roundPoint(pageBox(where.el), where.at);
      return {
        box: padded(box),
        el: where.el,
        look: `pin:${JSON.stringify(box)}`,
      };
    },
    draft: (target) => {
      drafted = target ? { ...target } : null;
      staleInset();
      draw();
    },
    commentAt: (el, x, y) => {
      const point = pointOn(el, x, y);
      const pin: Pin = {
        id: newId(),
        number: nextNumber(),
        kind: "comment",
        anchor: deps.anchorOf(el, point),
        at: new Date().toISOString(),
        by: "person",
        elements: [deps.describe(el)],
        point,
        thread: [],
      };
      write({ ...pin, title: pinName(pin) });
      open(pin.id, true);
      return pin.id;
    },
    standingOn: () => [
      ...[...placed.values()].map(({ el }) => el),
      ...(drafted ? [drafted.el] : []),
    ],
    pinInk: (group, elements) => {
      // A comment is composed first, but the apps' radial Comment pins the
      // ink at once and opens its card (until tsk-59).
      if (!deps.appCommenting()) {
        const el =
          ("selector" in group.anchor ? deps.locate(group.anchor)?.el : null) ??
          document.body;
        deps.compose({ el, ink: group.id }, elements);
        return;
      }
      const pin: Pin = {
        id: newId(),
        number: nextNumber(),
        kind: "comment",
        anchor: group.anchor,
        at: new Date().toISOString(),
        by: "person",
        elements,
        ink: group.id,
        thread: [],
      };
      write({ ...pin, title: pinName(pin) });
      open(pin.id, true);
    },
    placeAgain: (id, el, x, y) => {
      const pin = pinsMap().get(id);
      if (!pin) {
        return;
      }
      // Its place alone: a resolve or a reply written meanwhile stands.
      const point = pointOn(el, x, y);
      placePin(artifact.doc(), id, {
        anchor: deps.anchorOf(el, point),
        elements: [deps.describe(el)],
        point,
      });
      open(id);
    },
    focus: (id, scroll, instant = false, byKey = false) => {
      const before = focused;
      const ringed = keyed;
      focused = id;
      keyed = byKey && id !== null;
      const stale = staleInset();
      const el: Element | null = id ? (placed.get(id)?.el ?? null) : null;
      if (scroll && id) {
        reveal(id, instant);
      }
      deps.outline(el, true);
      if (before !== id || ringed !== keyed || stale) {
        // Its pill takes, or gives back, the focus ring.
        draw();
      }
    },
    hover: (id) => {
      if (id) {
        deps.outline(placed.get(id)?.el ?? null, true);
      } else {
        deps.outline(focused ? (placed.get(focused)?.el ?? null) : null, false);
      }
    },
    cover: (boxes) => {
      covered = boxes;
      // Nothing covers the page now (the sheet closed): the room under its
      // foot is taken back, and the page has its own scroll again.
      if (staleInset()) {
        draw();
      }
      // What covers the page changed under an open thread (its card came to
      // a phone's foot, the rail opened there): its pin is brought out again.
      keepClear();
      tell();
    },
    keepClear,
    marks: (working, answered) => {
      const same = (a: Set<string>, b: Set<string>) =>
        a.size === b.size && [...a].every((one) => b.has(one));
      if (same(working, live) && same(answered, unread)) {
        return;
      }
      live = working;
      unread = answered;
      // An answer read is done echoing: a new one on that pin echoes afresh.
      for (const id of [...echoed.keys()]) {
        if (!unread.has(id) || live.has(id)) {
          echoed.delete(id);
        }
      }
      draw();
    },
    track: (id) => {
      const before = tracked;
      tracked = id;
      // A thread that closed or gave way to another takes back the room made for its pin.
      const stale = staleInset();
      if (before === id) {
        if (stale) {
          draw();
        }
        tell();
        return;
      }
      // Drawn again: the open pin takes its focus ring, and a resolved one
      // stands only while its thread is open. Its pills are put back under a
      // tap that may be landing, so the page waits a frame: iOS WebKit, seeing
      // new content as a tap lands, takes it for a hover and sends no click.
      requestAnimationFrame(() => draw());
    },
    show: (shown) => {
      layer.style.display = shown ? "" : "none";
      fixed.style.display = shown ? "" : "none";
      if (!shown) {
        deps.post("cawco:peek", { id: null });
      }
    },
  };
}
