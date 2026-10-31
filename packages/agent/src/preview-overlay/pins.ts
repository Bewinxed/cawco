/**
 * The person's comments on a page, as their pins (Projects spec §5.7,
 * §5.10; core comments.ts; DESIGN.md, A pin's pill). A pin is a pill with a
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
  writePin,
} from "@cawco/core/comments";
import type { InkGroup } from "@cawco/core/ink";
import { pinName } from "@cawco/core/pin-name";
import { absences } from "./absent";
import { artifact } from "./artifact";
import { type Box, clipOf, grow, meets, pageBox } from "./frames";
import { fitToPage, insetFoot } from "./ink";
import { motionOk } from "./motion";
import { durationMs, type InkChrome } from "./radial";
import {
  bandsAt,
  bringInto,
  type FootPad,
  inBands,
  innerScroller,
  liftUnder,
  padFoot,
  pageScrolls,
  scrollersOf,
  scrollMoves,
  unpadFoot,
} from "./scrollers";

const SVG = "http://www.w3.org/2000/svg";

/** The ring round a pill, then the focus ring round that, px. */
const RING = 2;
/** The radius of a pill's tail corner: `--radius-hair`. */
const TAIL_R = 2;
/** The longest text whose lines a pin's point is read against (`lineEnd`), characters. Our call: a paragraph's, never a page's. */
const LINE_READ_MOST = 4000;
/** The room a pill needs past its line's end to stand there, px: a three-figure pill and its rings. Our call. */
const PILL_ROOM = 44;
/** The room a pill needs before its line's start, px: a one- or two-figure pill and its ring, in a page's margin. Our call. */
const PILL_ROOM_START = 28;
/** Room round a mark's crop, px. Our call. */
const CROP_PAD = 24;
/** How far a pin's crop reaches from the point it was made at, each way, px: a big element is cropped round the point. Our call. */
const PIN_REACH = { x: 960, y: 640 } as const;
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
  /** What a page's mark stands on, read from `el` as it is now. */
  anchorOf: (el: Element) => PageAnchor;
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
  /** Pins drawn again where their elements stand now. */
  draw: () => void;
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
  /** A pin on an ink group: an annotation is written; a comment's composer opens on it. */
  pinInk: (
    group: InkGroup,
    kind: Pin["kind"],
    elements: PinnedElement[] | string[]
  ) => void;
  /** Pin `id` placed again on `el` at the viewport's `x`, `y`: out of the moved tray. */
  placeAgain: (id: string, el: Element, x: number, y: number) => void;
  /** Where on `el`'s box the viewport's `x`, `y` lands, as fractions. */
  pointOn: (el: Element, x: number, y: number) => { x: number; y: number };
  /** Every pin shown on the page, or hidden (⇧C). */
  show: (shown: boolean) => void;
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

/**
 * Where a pin stands: the point its tail stands on in the page (or, on the
 * page as a whole, the viewport), its element, what it stands on in the
 * page's coordinates, and whether its frames show that point now.
 */
interface Standing {
  at: [number, number];
  /** What the pin stands on, in the page's coordinates: its element's box, or its ink's. */
  box: Box;
  el: Element | null;
  /** On the page as a whole: drawn at the viewport's top-right, fixed to it. */
  page: boolean;
  shown: boolean;
  /** The pill stands up-left of its point (a mid-line press moved to its line's start): its tail on the point's right. */
  start?: boolean;
}

/** The corner a pill's tail is, standing on its point; none for a pin on the page as a whole. */
type Tail = "bottom-start" | "bottom-end" | "top-start" | "top-end" | "none";

/** One pill as drawn: its box (the page's px, or the viewport's on the page as a whole) and its tail. */
interface Pill {
  box: Box;
  tail: Tail;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

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

/** A pin's pill as drawn: its `<g>`, its box and tail, and its number. */
interface DrawnPill {
  group: SVGGElement;
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
 * One stack of pills that meet, in its own `<g>`: the newest in front, at
 * most {@link BEHIND} behind it a `--deck-step` ×2 further down-right each,
 * the rest left out until it fans; resting on it fans every pill into a row
 * `--space-1` apart, over `--dur-control` where motion is welcome.
 */
function drawStack(
  group: DrawnPill[],
  look: { deck: number; gap: number; motion: string }
): SVGGElement {
  // Newest first: the front pill is the highest number.
  const ordered = group.toSorted((a, b) => b.number - a.number);
  const holder = document.createElementNS(SVG, "g");
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
  for (const { one } of steps.toReversed()) {
    one.group.style.transition = look.motion;
    holder.append(one.group);
  }
  lay(false);
  holder.addEventListener("pointerenter", () => lay(true));
  holder.addEventListener("pointerleave", () => lay(false));
  return holder;
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

  /** Where `el` stands with a pin at `point` on it, the page's px. */
  const standingOn = (
    el: Element,
    point: { x: number; y: number } | undefined
  ): Standing => {
    const box = pageBox(el);
    if (isPage(el)) {
      return { at: [0, 0], box, el, page: true, shown: true };
    }
    const spot = point ?? { x: 1, y: 0 };
    const pressed: [number, number] = [
      box.x + spot.x * box.w,
      box.y + spot.y * box.h,
    ];
    const line = lineEnd(el, pressed);
    const at = line?.at ?? pressed;
    return {
      at,
      box,
      el,
      page: false,
      shown: showsAt(el, at),
      ...(line?.start ? { start: true } : {}),
    };
  };

  /**
   * A point pressed in the middle of a line of `el`'s words, moved to that
   * line's end, at its foot: the pill stands up-right of its point, so on
   * the press itself it would stand over the words of the line above and
   * of its own. At the line's end it stands in the line's own band past its
   * last word, covering none. Where the line runs to the page's edge and
   * leaves no room past it, it stands before the line's first word instead
   * (`start`: up-left of the point, in the margin the line starts after).
   * Null where the point is on no line of words (a picture, the padding,
   * past a line's end), or neither side of the line has a pill's room. A
   * long element's lines are not read: past {@link LINE_READ_MOST}
   * characters the press stands where it was.
   */
  const lineEnd = (
    el: Element,
    [px, py]: [number, number]
  ): { at: [number, number]; start: boolean } | null => {
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
    const left = Math.min(...fragments.map((r) => r.left));
    const bottom = Math.max(...fragments.map((r) => r.bottom));
    const room = document.documentElement.clientWidth - RING;
    if (x >= right) {
      return null;
    }
    if (right + PILL_ROOM <= room) {
      return { at: [right + scrollX + 1, bottom + scrollY], start: false };
    }
    if (left - PILL_ROOM_START >= 0) {
      return { at: [left + scrollX - 1, bottom + scrollY], start: true };
    }
    return null;
  };

  /** Where pin `pin` stands in the page now, or null when it is not on it. */
  const standing = (pin: Pin): Standing | null => {
    if (pin.ink) {
      const box = deps.groupBox(pin.ink);
      return box
        ? {
            at: [box.x + box.w, box.y],
            box,
            el: anchoredEl(pin),
            page: false,
            shown: true,
          }
        : null;
    }
    if (!("selector" in pin.anchor)) {
      return null;
    }
    if (wholePage(pin.anchor)) {
      const el = deps.locate(pin.anchor)?.el ?? document.body;
      return el ? standingOn(el, undefined) : null;
    }
    const found = deps.locate(pin.anchor);
    return found ? standingOn(found.el, pin.point) : null;
  };

  /**
   * The anchors whose element is found under another selector or text now
   * (a revision moved or reworded it), written back so the next look finds
   * it by its selector. One that still reads as it was is left alone: a
   * write here draws the pins again. A moved pin whose anchor finds its
   * element again (the page drew it back, a revision restored it) stands on
   * the page again, out of the moved tray.
   */
  const reanchor = (pins: Pin[]) => {
    const moves: Pin[] = [];
    for (const pin of pins) {
      if (!("selector" in pin.anchor) || (pin.movedAt && pin.ink)) {
        continue;
      }
      const found = deps.locate(pin.anchor);
      const now = found && deps.anchorOf(found.el);
      if (now && (pin.movedAt || changedAnchor(pin.anchor, now))) {
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
      muted: ["--ink-muted"],
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
      muted: read.muted,
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
  const pillWidth = (label: string, paint: Paint) => {
    if (label.length < 2) {
      return paint.height;
    }
    measure ??= document.createElement("canvas").getContext("2d");
    if (!measure) {
      return paint.height;
    }
    measure.font = paint.font;
    // Tabular figures: every digit as wide as the widest.
    const digit = Math.max(
      ...[..."0123456789"].map((d) => measure?.measureText(d).width ?? 0)
    );
    return Math.max(
      paint.height,
      Math.ceil(digit * label.length + 2 * paint.pad)
    );
  };

  /**
   * Where a pill `w` wide stands on its point `at` (the page's px): up-right
   * of it, its tail on the point; up-left where the page's width leaves no
   * room on the right; below where its top leaves none above. One on the
   * page as a whole stands at the viewport's top-right corner, `--space-2`
   * in, with no tail.
   */
  const pillAt = (where: Standing, w: number, paint: Paint): Pill => {
    const h = paint.height;
    if (where.page) {
      const right = document.documentElement.clientWidth;
      return {
        box: { x: right - paint.inset - w, y: paint.inset, w, h },
        tail: "none",
      };
    }
    const [px, py] = where.at;
    const edge = RING;
    const right = scrollX + document.documentElement.clientWidth - edge;
    const left = px + w <= right && !where.start ? px : px - w;
    const above = py - h >= edge;
    const top = above ? py - h : py;
    const fromRight = left !== px;
    let tail: Tail;
    if (above) {
      tail = fromRight ? "bottom-end" : "bottom-start";
    } else {
      tail = fromRight ? "top-end" : "top-start";
    }
    return { box: { x: Math.max(edge, left), y: top, w, h }, tail };
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
   * One pill drawn: its focus ring when the keyboard reached it, its raised ring
   * with the xs shadow, its face by state (DESIGN.md, A pin's pill), its
   * number, and its dot.
   */
  const pillShape = (
    pin: Pin | null,
    pill: Pill,
    paint: Paint
  ): SVGGElement => {
    const g = document.createElementNS(SVG, "g");
    const state = stateOf(pin);
    g.setAttribute("data-state", state);
    g.setAttribute("data-tail", pill.tail);
    const { box, tail } = pill;
    if (pin && keyed && pin.id === focused) {
      const focus = pathEl(
        shapePath(grow(box, 2 * RING), corners(box.h, tail, 2 * RING)),
        paint.focus
      );
      focus.setAttribute("data-focus-ring", "");
      g.append(focus);
    }
    const ring = pathEl(
      shapePath(grow(box, RING), corners(box.h, tail, RING)),
      paint.raised
    );
    ring.style.filter = `drop-shadow(0 1px 1px ${paint.shadow})`;
    ring.setAttribute("data-ring", "");
    g.append(ring);
    const faces: Record<PinState, { edge: string; face: string; ink: string }> =
      {
        provisional: { edge: paint.action, face: paint.raised, ink: "" },
        unsent: { edge: paint.action, face: paint.raised, ink: paint.action },
        sent: { edge: paint.action, face: paint.action, ink: paint.onAction },
        resolved: {
          edge: paint.recessed,
          face: paint.recessed,
          ink: paint.muted,
        },
      };
    const look = faces[state];
    const face = pathEl(shapePath(box, corners(box.h, tail, 0)), look.edge);
    // The pill's own box, its tail corner on the pressed point.
    face.setAttribute("data-face", "");
    g.append(face);
    if (look.face !== look.edge) {
      // Hollow: a 2px edge in the action ink, the face raised inside it.
      g.append(
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
      g.append(number);
    }
    if (pin && (live.has(pin.id) || unread.has(pin.id))) {
      g.append(...dotOf(pin.id, box, paint));
    }
    return g;
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

  /** A pin's pill, pressable, at `pill`; resting on it chooses its element and asks for its peek. */
  const pinPill = (
    pin: Pin,
    where: Standing,
    pill: Pill,
    paint: Paint
  ): SVGGElement => {
    const g = pillShape(pin, pill, paint);
    g.setAttribute("data-pin", String(pin.number));
    g.setAttribute("data-pin-id", pin.id);
    g.style.pointerEvents = "auto";
    g.style.cursor = "pointer";
    g.prepend(hitArea(pill.box));
    g.addEventListener("pointerenter", () => {
      deps.outline(where.el, true);
      const shown = where.page ? 0 : 1;
      deps.post("cawco:peek", {
        id: pin.id,
        mark: {
          x: pill.box.x - shown * scrollX,
          y: pill.box.y - shown * scrollY,
          w: pill.box.w,
          h: pill.box.h,
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
      open(pin.id);
    });
    return g;
  };

  /**
   * Writes the pins found again by their source, text or the page, and moves
   * aside those no anchor finds; never one the doc holds deleted (core
   * `goneOf`), nor one gone from the doc since it was read.
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
    });
  };

  /** Whether a pin no anchor finds is missing, not waiting on a frame still loading. */
  const goneFrom = (pin: Pin) =>
    !("selector" in pin.anchor && deps.waiting(pin.anchor));
  /** How long each pin has stood missing: one is gone only after a while, the page drawn again then. */
  const absent = absences(() => draw());

  /** Stacks the pills that meet ({@link meetingGroups}, {@link drawStack}). */
  const stack = (into: SVGSVGElement, drawn: DrawnPill[], paint: Paint) => {
    for (const group of meetingGroups(drawn)) {
      into.append(
        group.length === 1
          ? group[0].group
          : drawStack(group, {
              deck: paint.deck,
              gap: paint.gap,
              motion: motionOk()
                ? `transform ${paint.control}ms ${paint.ease}, opacity ${paint.control}ms ${paint.ease}`
                : "",
            })
      );
    }
  };

  /**
   * Places each pin on the page, drawing a pill for each its frames show;
   * answers those that are gone: no anchor finds them, no frame they stand
   * in is loading, and they have stood so for a while ({@link absences}).
   */
  const placeAll = (all: Pin[], paint: Paint): Pin[] => {
    const missing: Pin[] = [];
    // A resolved pin stands on the page only while its thread is open.
    const onIt = (pin: Pin) => !pin.resolvedAt || pin.id === tracked;
    const drawn: DrawnPill[] = [];
    const drawnFixed: DrawnPill[] = [];
    for (const pin of all.filter((one) => !one.movedAt && onIt(one))) {
      const where = standing(pin);
      if (!where) {
        missing.push(pin);
        continue;
      }
      const pill = pillAt(where, pillWidth(String(pin.number), paint), paint);
      placed.set(pin.id, { ...where, pill });
      // A pin in a frame scrolled away from it stands hidden until the frame shows it again.
      if (where.shown) {
        (where.page ? drawnFixed : drawn).push({
          group: pinPill(pin, where, pill, paint),
          pill,
          number: pin.number,
        });
      }
    }
    stack(layer, drawn, paint);
    stack(fixed, drawnFixed, paint);
    return goneOf(missing);
  };

  /** Of the pins no anchor finds now, those gone: no frame they stand in loading, and missing a while ({@link absences}). */
  const goneOf = (missing: Pin[]): Pin[] => {
    const waited = missing.filter(goneFrom);
    absent.keep(waited.map((pin) => pin.id));
    return waited.filter((pin) => absent.missed(pin.id));
  };

  /** The comment being written, drawn as its hollow pill with no number. */
  const drawDraft = (paint: Paint) => {
    if (!drafted) {
      return;
    }
    let where: Standing | null = null;
    if (drafted.ink) {
      const box = deps.groupBox(drafted.ink);
      where = box
        ? {
            at: [box.x + box.w, box.y],
            box,
            el: drafted.el,
            page: false,
            shown: true,
          }
        : null;
    } else {
      // The page drew its element again: the pill stands on the one there now.
      const now = drafted.el.isConnected ? null : deps.redraft();
      if (now) {
        drafted = { ...now };
      }
      if (drafted.el.isConnected) {
        where = standingOn(drafted.el, drafted.point);
      }
    }
    if (!where) {
      drafted.standing = undefined;
      drafted.pill = undefined;
      return;
    }
    const pill = pillAt(where, paint.height, paint);
    drafted.standing = where;
    drafted.pill = pill;
    const g = pillShape(null, pill, paint);
    g.setAttribute("data-pin", "new");
    if (drafted.parked) {
      parkedPill(g, pill, paint);
    }
    (where.page ? fixed : layer).append(g);
  };

  /**
   * A parked draft's pill (The Work Outlives Its Surface Rule): hollow at its
   * target as it stood while written, an ellipsis in the action ink saying
   * it holds words not yet sent, and one press (a finger's 44px) opens its
   * composer again with them.
   */
  const parkedPill = (g: SVGGElement, pill: Pill, paint: Paint) => {
    const { box } = pill;
    g.setAttribute("data-parked", "");
    g.setAttribute("data-pin-id", DRAFT_PIN);
    g.style.pointerEvents = "auto";
    g.style.cursor = "pointer";
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
    g.prepend(hitArea(box));
    g.append(name, dots);
    g.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      open(DRAFT_PIN);
    });
  };

  function draw() {
    for (const node of [...layer.children, ...fixed.children]) {
      node.remove();
    }
    placed.clear();
    if (!(onPage() && artifact.keeps())) {
      fitToPage(layer, false);
      return;
    }
    const all = [...pinsMap().values()].sort((a, b) => a.number - b.number);
    const drawing = all.length > 0 || !!drafted;
    fitToPage(layer, drawing);
    // The paint is read off the page's style, which forces its style and
    // layout there and then: a page with no pins is not made to pay for it.
    let gone: Pin[] = [];
    if (drawing) {
      const paint = paintOf();
      gone = placeAll(all, paint);
      drawDraft(paint);
    }
    if (settled()) {
      settle(reanchor(all), gone);
    }
    if (focused) {
      deps.outline(placed.get(focused)?.el ?? null);
    }
    tell();
  }

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
  // A press ends keyboard focus: the focused pin's ring goes.
  addEventListener(
    "pointerdown",
    () => {
      if (keyed) {
        keyed = false;
        draw();
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
    const chain = scrollersOf(where.el);
    let landed = bringInto(chain, y, clear);
    const room = landed ? 0 : liftUnder(x, covered, r);
    if (room > 0 && giveRoom(chain, room, owner)) {
      landed = bringInto(chain, y, clear);
    }
    // Out from under nothing (nothing round it takes room): at least in the viewport.
    const moves = landed ?? bringInto(chain, y, bandsAt(x, [], r));
    if (moves) {
      scrollMoves(moves, motionOk() && !instant ? "smooth" : "auto");
    }
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
  const giveRoom = (
    chain: ReturnType<typeof scrollersOf>,
    px: number,
    owner: string
  ) => {
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
    const under = (at: Standing, face: Pill) =>
      !at.page && covered.some((one) => meets(shownBox(at, face), one));
    const where = tracked ? placed.get(tracked) : undefined;
    if (tracked && where?.pill && under(where, where.pill)) {
      reveal(tracked);
    }
    const draft = drafted?.parked ? undefined : drafted;
    if (draft?.standing && draft.pill && under(draft.standing, draft.pill)) {
      bringOut({ ...draft.standing, pill: draft.pill }, DRAFT_PIN);
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
      const pin: Pin = {
        id: newId(),
        number: nextNumber(),
        kind: "comment",
        anchor: deps.anchorOf(el),
        at: new Date().toISOString(),
        by: "person",
        elements: [deps.describe(el)],
        point: pointOn(el, x, y),
        thread: [],
      };
      write({ ...pin, title: pinName(pin) });
      open(pin.id, true);
      return pin.id;
    },
    pinInk: (group, kind, elements) => {
      // A comment is composed first, but the apps' radial Comment pins the
      // ink at once and opens its card (until tsk-59).
      if (kind === "comment" && !deps.appCommenting()) {
        const el =
          ("selector" in group.anchor ? deps.locate(group.anchor)?.el : null) ??
          document.body;
        deps.compose({ el, ink: group.id }, elements);
        return;
      }
      const pin: Pin = {
        id: newId(),
        number: nextNumber(),
        kind,
        anchor: group.anchor,
        at: new Date().toISOString(),
        by: "person",
        elements,
        ink: group.id,
        thread: [],
      };
      if (kind !== "comment") {
        write(pin);
        return;
      }
      write({ ...pin, title: pinName(pin) });
      open(pin.id, true);
    },
    placeAgain: (id, el, x, y) => {
      const pin = pinsMap().get(id);
      if (!pin) {
        return;
      }
      // Its place alone: a resolve or a reply written meanwhile stands.
      placePin(artifact.doc(), id, {
        anchor: deps.anchorOf(el),
        elements: [deps.describe(el)],
        point: pointOn(el, x, y),
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
      requestAnimationFrame(draw);
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
