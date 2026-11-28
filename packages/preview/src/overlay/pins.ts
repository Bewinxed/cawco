/**
 * The person's comments on a page, as their pins (Projects spec §5.7,
 * §5.10; core comments.ts; the artifact panel's surface brief, A pin's pill). A pin is a pill with a
 * tail corner: `--spacing-c-pin` tall, as wide as its number needs, three corners
 * round and the fourth, the tail, a 2px corner standing on the point the
 * person pressed on its element. It stands up and after that point, before
 * it where the viewport's edge leaves no room after, below where none is
 * left above. Its fill says where it stands: hollow while the session
 * hasn't heard it (no number yet while it is being written), filled once
 * sent, recessed when resolved, which is drawn only while its thread is
 * open. A 2px raised ring and the xs shadow lift it off the page; a pin
 * reached by the keyboard (the host's J and K, a row taken by keys) adds a
 * second ring in the focus ink, until a press; an open pin is marked by its
 * open card, never by a ring (DESIGN.md, The One Ring Rule); a dot on its
 * top end says the agent is working on it (the live dot, breathing) or has
 * answered and the person hasn't looked (the needs-you dot, echoing three
 * loops, then still).
 *
 * A pill stands on its element by CSS anchor positioning (anchor-names.ts):
 * the element takes the pill's anchor name, and the pill's tail corner
 * stands on the pressed point, written as percentages of the element's box
 * (`anchor(<percentage>)`), so the browser moves it with the element through
 * every scroll, the window's or a scroller's, every layout and every
 * resize, and no script of the overlay's runs for it. A pin on words stands
 * on the element round them. The pins on one element are one anchored row,
 * in their numbers' order, `--spacing-space-1` apart, so none covers
 * another. Near the viewport's edges the row tries the other sides of its
 * point (`@position-try`), its tail corner turned to the point where the
 * browser says which side it took (an anchored container query). A pill
 * whose element its scrollers have scrolled out of view is not drawn
 * (`position-visibility`). A pin on the page as a whole stands at the
 * viewport's top-right corner, `--spacing-space-2` in.
 *
 * A pin on an element inside a same-origin frame (frames.ts) stands in that
 * frame's document, anchored there, its pills' styles given that document
 * too ({@link PILL_SHEET}); a pin on ink stands past its group's top-right
 * corner, anchored to the element the group stands on. A browser whose
 * anchors don't follow their transforms (Firefox, Safari 26:
 * anchor-names.ts `anchorsFollowTransforms`) has each pill moved by the
 * distance its element's transforms move it, measured as the page changes.
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
  anchorRereader,
  madeAs,
  type PageAnchor,
  type PinnedElement,
  wholePage,
} from "@cawco/core/comments/anchor";
import type { MadeAway, Unplaced } from "@cawco/core/comments/made-view";
import {
  newId,
  type Pin,
  type PinState,
  pinUnsent,
  placeOf,
  placePin,
  readPins,
  goneOf as tombstonesOf,
  writePin,
} from "@cawco/core/comments/model";
import { pinName } from "@cawco/core/pin-name";
import { absences } from "./absent";
import {
  type Anchorable,
  anchorable,
  anchorName,
  anchorsFollowTransforms,
  nameOff,
  nameOn,
} from "./anchor-names";
import { artifact, PLACED } from "./artifact";
import { type Box, clipOf, meets, pageBox, rectOf } from "./frames";
import { fitToPage, footKept, insetFoot } from "./ink";
import { drawnHere } from "./made-view";
import { motionOk } from "./motion";
import type { DraftTarget, Pins } from "./pins-types";
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
import { steadyFrame } from "./steady-frame";

const SVG = "http://www.w3.org/2000/svg";

/** Room round a mark's crop, px. Our call. */
const CROP_PAD = 24;
/** How far a pin's crop reaches from the point it was made at, each way, px: a big element is cropped round the point. Our call. */
const PIN_REACH = { x: 960, y: 640 } as const;
/** How long a scroller's glide has before a pill it should have lifted is looked at again, ms: past the browsers' own, about 750ms at most. Our call. */
const GLIDE_MS = 1000;
/** The loops a needs-you dot echoes before it stands still (DESIGN.md, Status dot). */
const ECHOES = 3;

/** A pin's element found, but drawn in no box in this view (`drawnHere`): it stands nowhere here. */
const HIDDEN = Symbol("hidden");

/** The id a parked draft's pill answers to (`data-pin-id`): a press on it opens its composer again. */
const DRAFT_PIN = "draft";

/**
 * The pills' styles, given every document a pill stands in (the page's,
 * a same-origin frame's) in its layer, unlayered so the page's own rules
 * never outrank them, each element of theirs reset first (`all: initial`).
 * Each value a token gives is a custom property its layer carries
 * ({@link varsOf}); each row's point is its own (`--cawco-pin-x`,
 * `--cawco-pin-y`, percentages of its element's box from its start
 * sides). The ring is 2px (`--radius-hair` the tail's corner), the
 * finger's hit area 44px.
 */
const PILL_SHEET = `
cawco-pins {
  display: contents;

  &[hidden] {
    display: none;
  }
}

cawco-pin-group {
  all: initial;
  position: fixed;
  z-index: 2147483646;
  display: block flex;
  gap: var(--cawco-pin-gap);
  pointer-events: none;
  container-type: anchored;
  inset-inline-start: anchor(var(--cawco-pin-x));
  inset-block-end: anchor(var(--cawco-pin-y));
  position-try-fallbacks: --cawco-pin-up-start, --cawco-pin-down-end, --cawco-pin-down-start;
  position-visibility: anchors-visible;
  position-visibility: anchor-visible;

  &[data-page] {
    inset-inline-start: auto;
    inset-block-end: auto;
    inset-block-start: var(--cawco-pin-inset);
    inset-inline-end: var(--cawco-pin-inset);
    position-try-fallbacks: none;
    position-visibility: always;
  }
}

@position-try --cawco-pin-up-start {
  inset-inline-start: auto;
  inset-inline-end: anchor(var(--cawco-pin-x));
  inset-block-start: auto;
  inset-block-end: anchor(var(--cawco-pin-y));
}

@position-try --cawco-pin-down-end {
  inset-inline-start: anchor(var(--cawco-pin-x));
  inset-inline-end: auto;
  inset-block-start: anchor(var(--cawco-pin-y));
  inset-block-end: auto;
}

@position-try --cawco-pin-down-start {
  inset-inline-start: auto;
  inset-inline-end: anchor(var(--cawco-pin-x));
  inset-block-start: anchor(var(--cawco-pin-y));
  inset-block-end: auto;
}

cawco-pin {
  all: initial;
  position: relative;
  display: block grid;
  place-items: center;
  box-sizing: border-box;
  block-size: var(--cawco-pin-h);
  min-inline-size: var(--cawco-pin-h);
  padding-inline: calc(var(--cawco-pin-pad) - 2px);
  border: 2px solid var(--cawco-pin-edge);
  border-radius: calc(var(--cawco-pin-h) / 2);
  background: var(--cawco-pin-face);
  box-shadow:
    0 0 0 2px var(--cawco-pin-raised),
    0 1px 2px 2px var(--cawco-pin-shadow);
  color: var(--cawco-pin-ink);
  font: var(--cawco-pin-font);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
  pointer-events: auto;
  --cawco-pin-edge: var(--cawco-pin-action);
  --cawco-pin-face: var(--cawco-pin-raised);
  --cawco-pin-ink: var(--cawco-pin-action);

  &::before {
    content: "";
    position: absolute;
    inset: -4px;
  }

  @media (pointer: coarse) {
    &::before {
      inset: calc(-2px - max(0px, (44px - var(--cawco-pin-h)) / 2));
    }
  }

  &[data-state="sent"] {
    --cawco-pin-edge: var(--cawco-pin-action);
    --cawco-pin-face: var(--cawco-pin-action);
    --cawco-pin-ink: var(--cawco-pin-on-action);
  }

  &[data-state="resolved"] {
    --cawco-pin-edge: var(--cawco-pin-recessed);
    --cawco-pin-face: var(--cawco-pin-recessed);
    --cawco-pin-ink: var(--cawco-pin-strong);
  }

  &[data-keyed] {
    box-shadow:
      0 0 0 2px var(--cawco-pin-raised),
      0 1px 2px 2px var(--cawco-pin-shadow),
      0 0 0 4px var(--cawco-pin-focus);
  }

  &[data-draft]:not([data-parked]) {
    cursor: auto;
    pointer-events: none;
  }
}

cawco-pin-group:not([data-page]) > cawco-pin:first-child {
  border-end-start-radius: 2px;
}

@container anchored(fallback: --cawco-pin-up-start) {
  cawco-pin-group:not([data-page]) > cawco-pin {
    &:first-child {
      border-end-start-radius: calc(var(--cawco-pin-h) / 2);
    }

    &:last-child {
      border-end-end-radius: 2px;
    }
  }
}

@container anchored(fallback: --cawco-pin-down-end) {
  cawco-pin-group:not([data-page]) > cawco-pin:first-child {
    border-end-start-radius: calc(var(--cawco-pin-h) / 2);
    border-start-start-radius: 2px;
  }
}

@container anchored(fallback: --cawco-pin-down-start) {
  cawco-pin-group:not([data-page]) > cawco-pin {
    &:first-child {
      border-end-start-radius: calc(var(--cawco-pin-h) / 2);
    }

    &:last-child {
      border-start-end-radius: 2px;
    }
  }
}

cawco-pin-dot,
cawco-pin-echo {
  all: initial;
  position: absolute;
  inset-block-start: calc(-1px - var(--cawco-pin-dot-size) / 2);
  inset-inline-end: calc(-1px - var(--cawco-pin-dot-size) / 2);
  inline-size: var(--cawco-pin-dot-size);
  block-size: var(--cawco-pin-dot-size);
  border-radius: 50%;
  background: var(--cawco-pin-attn);
  pointer-events: none;
}

cawco-pin-dot {
  box-shadow: 0 0 0 var(--cawco-pin-dot-cut) var(--cawco-pin-raised);

  &[data-dot="live"] {
    background: var(--cawco-pin-dot);
  }
}

cawco-pin-echo {
  opacity: 0;
}

cawco-pin-probe {
  all: initial;
  position: fixed;
  inset: anchor(inside);
  visibility: hidden;
  pointer-events: none;
}
`;

/** Where a pin stands: its element, and the point on it its tail stands on (fractions of its box, from its left and top); on the page as a whole, the viewport's top-right corner. */
interface Spot {
  el: Element | null;
  /** The ink group it stands past, on the group's element. */
  ink?: string;
  page: boolean;
  point: { x: number; y: number };
}

/** A pin standing, and its pill. */
type Placed = Spot & { pill: HTMLElement };

/** One anchored row of pills: the element they stand on, the point the row's tail stands on, and its pills in order. */
interface Row {
  anchor: Anchorable;
  pills: HTMLElement[];
  point: { x: number; y: number };
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** `box` with {@link CROP_PAD} round it. */
export const padded = (box: Box): Box => ({
  x: box.x - CROP_PAD,
  y: box.y - CROP_PAD,
  w: box.w + 2 * CROP_PAD,
  h: box.h + 2 * CROP_PAD,
});

/** A viewport rect as a box. */
const boxOf = (rect: DOMRect): Box => ({
  x: rect.x,
  y: rect.y,
  w: rect.width,
  h: rect.height,
});

/** Where the page's point `at` lies on `box`, as fractions; 0 along an extent it has none of. */
const fractionsOn = (box: Box, [x, y]: [number, number]) => ({
  x: box.w > 0 ? (x - box.x) / box.w : 0,
  y: box.h > 0 ? (y - box.y) / box.h : 0,
});

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

/**
 * The element a pill on `el` anchors to, and the point on it: `el` itself,
 * or for a shape inside an `<svg>` (which lays out no box of its own to
 * anchor to), the outermost `<svg>` round it (the last of its SVG
 * ancestors), the point read on that.
 */
const anchorFor = (
  el: Element,
  point: { x: number; y: number }
): { anchor: Anchorable; point: { x: number; y: number } } | null => {
  let outer: Element = el;
  for (
    let up = el.namespaceURI === SVG ? el.parentElement : null;
    up?.namespaceURI === SVG;
    up = up.parentElement
  ) {
    outer = up;
  }
  if (!anchorable(outer, outer.ownerDocument)) {
    return null;
  }
  if (outer === el) {
    return { anchor: outer, point };
  }
  const box = pageBox(el);
  return {
    anchor: outer,
    point: fractionsOn(pageBox(outer), [
      box.x + point.x * box.w,
      box.y + point.y * box.h,
    ]),
  };
};

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
  /** A placed ink group's box in the page, px, and the element it stands on; null when it is not on the page. */
  groupAt: (id: string) => { box: Box; el: Element } | null;
  /** Where a page's anchor stands now, and by what; null when nothing on the page matches it. */
  locate: (anchor: PageAnchor) => AnchorFound<Element> | null;
  /**
   * Why this view can't judge the mark on `anchor` (made-view.ts
   * `madeAway`): it shows another story of the sheet, or draws the page
   * otherwise than the mark was made in; null where it draws the page as
   * made, and only then may it move the mark aside or anchor it again.
   */
  madeAway: (anchor: PageAnchor) => MadeAway | null;
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
  /** Whether this view shows the sheet's story the mark on `anchor` was made on (made-view.ts `showsStory`): a mark on another story stands nowhere here. */
  showsStory: (anchor: PageAnchor) => boolean;
  /** Whether an anchor's frames lead to one still loading: not found yet, and not gone. */
  waiting: (anchor: PageAnchor) => boolean;
}

export function startPins(deps: PinsDeps): Pins {
  const { chrome } = deps;
  /**
   * The room under the page's foot (ink.ts `fitToPage`): sized to the
   * page's scroll and past it while room is kept there, for a pill lifted
   * clear of the host's chrome ({@link giveRoom}) or the host's own foot
   * (`footKept`); folded away otherwise. The pills stand in no box of it.
   */
  const room = document.createElementNS(SVG, "svg");
  room.setAttribute("data-cawco-pins", "");
  room.setAttribute("aria-hidden", "true");
  room.style.cssText =
    "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;margin:0;padding:0;border:0";
  document.documentElement.append(room);

  /** Each document's layer of pills, made the first time a pill stands there ({@link layerIn}); this page's made now. */
  const layers = new Map<Document, HTMLElement>();
  /** Whether the pins are shown (⇧C hides them): a layer made later takes it too. */
  let shown = true;
  /**
   * The layer of pills in `doc`: its styles, then its rows. It stands after
   * the body, since a fixed box anchors only to what comes before it in the
   * tree (css-anchor-position-1 §3.2, "acceptable anchor element"), and is
   * the overlay's own (ink.ts `OVERLAY_OWN`), so what it writes is never
   * read as the page changing.
   */
  const layerIn = (doc: Document): HTMLElement => {
    let held = layers.get(doc);
    if (!held) {
      held = doc.createElement("cawco-pins");
      held.setAttribute("aria-hidden", "true");
      const sheet = doc.createElement("style");
      sheet.textContent = PILL_SHEET;
      held.append(sheet);
      held.hidden = !shown;
      layers.set(doc, held);
    }
    // Held in the root beside the body: the body comes after it only where
    // it was put there before the parser made the body.
    const { body } = doc;
    if (
      held.parentNode !== doc.documentElement ||
      (body?.parentNode === doc.documentElement &&
        held.compareDocumentPosition(body) === Node.DOCUMENT_POSITION_FOLLOWING)
    ) {
      doc.documentElement.append(held);
    }
    return held;
  };
  const layer = layerIn(document);

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
   * of its components (re-read after each HMR update), by the one view the
   * hub named to place its marks (artifact.ts `places`: two views of one
   * page each read it at their own width and wrote their own readings back
   * and forth), once it has laid out, and once what the device kept of the
   * doc is in (artifact.ts `stored`): the hub's embedded copy may still hold
   * a pin the device deleted, and a write of it would stand against that
   * deletion.
   */
  const settled = () => placing() && artifact.places() && artifact.stored();
  /** Whether this view draws the page as the mark on `anchor` was made (`deps.madeAway`). */
  const judges = (anchor: PageAnchor) => deps.madeAway(anchor) === null;
  /**
   * Whether this page's marks stand on its elements as the agent wrote
   * them: a page the agent wrote or a sheet of its components, laid out.
   * Every view of one reads which of its marks it doesn't draw, and why
   * ({@link unplacedOf}); the one view the hub names writes ({@link settled}).
   */
  const placing = () =>
    (artifact.kind() === "page" || artifact.kind() === "component") &&
    document.readyState !== "loading";

  /** Each pin standing on the page: where, and its pill. */
  const placed = new Map<string, Placed>();
  /** Each pin the last draw looked for, placed or not (`placedOn`). */
  let looked = new Set<string>();
  /** The comment being written: where it stands, and its pill. */
  let drafted: (DraftTarget & { spot?: Spot; pill?: HTMLElement }) | null =
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

  /** Where a pin at `point` on `el` (fractions of its box) stands; its top-right corner where it names none. */
  const spotOn = (
    el: Element,
    point: { x: number; y: number } | undefined
  ): Spot =>
    isPage(el)
      ? { el, page: true, point: { x: 0, y: 0 } }
      : { el, page: false, point: point ?? { x: 1, y: 0 } };

  /** Where a mark on ink group `ink` stands: past its box's top-right corner, on the element the group stands on; null where the group is not drawn. */
  const onInk = (ink: string): Spot | null => {
    const at = deps.groupAt(ink);
    if (!at) {
      return null;
    }
    return {
      el: at.el,
      ink,
      page: false,
      point: fractionsOn(pageBox(at.el), [at.box.x + at.box.w, at.box.y]),
    };
  };

  /** Where a pin on ink stands: past its group; hidden where its ink stands nowhere here and its element is drawn in no box; null where neither is found. */
  const inkSpotOf = (pin: Pin, ink: string): Spot | typeof HIDDEN | null => {
    const spot = onInk(ink);
    if (spot) {
      return spot;
    }
    const el = anchoredEl(pin);
    return el && !drawnHere(el) ? HIDDEN : null;
  };

  /** Where pin `pin` stands in the page now; HIDDEN where its element is found but drawn in no box here ({@link drawnHere}); null when it is not on it. */
  const spotOf = (pin: Pin): Spot | typeof HIDDEN | null => {
    if (pin.ink) {
      return inkSpotOf(pin, pin.ink);
    }
    if (!("selector" in pin.anchor && deps.showsStory(pin.anchor))) {
      return null;
    }
    if (wholePage(pin.anchor)) {
      const el = deps.locate(pin.anchor)?.el ?? document.body;
      return el ? spotOn(el, undefined) : null;
    }
    const found = deps.locate(pin.anchor);
    if (!found) {
      return null;
    }
    return drawnHere(found.el) ? spotOn(found.el, pin.point) : HIDDEN;
  };

  /** Where `spot`'s point is in the page now, px. */
  const pointOf = (spot: Spot): [number, number] => {
    const box = pageBox(spot.el ?? document.body);
    return [box.x + spot.point.x * box.w, box.y + spot.point.y * box.h];
  };
  /** Whether `spot`'s frames and scroll containers show it now: its point, or for a pin on ink any of its ink. */
  const showsNow = (spot: Spot): boolean => {
    if (spot.page) {
      return true;
    }
    const ink = spot.ink ? deps.groupAt(spot.ink) : null;
    return ink ? showsAny(spot.el, ink.box) : showsAt(spot.el, pointOf(spot));
  };
  /** A pill's box in the top viewport, px. */
  const pillBox = (pill: HTMLElement): Box => boxOf(rectOf(pill));
  /** What a pin stands on, in the top viewport, px: its ink's box, or its element's. */
  const standingBox = (spot: Spot): Box => {
    const ink = spot.ink ? deps.groupAt(spot.ink) : null;
    if (ink) {
      return {
        x: ink.box.x - scrollX,
        y: ink.box.y - scrollY,
        w: ink.box.w,
        h: ink.box.h,
      };
    }
    return boxOf(rectOf(spot.el ?? document.body));
  };

  /**
   * The anchors whose element stands otherwise in the page now (a revision
   * moved or reworded it), to be written back so the next look finds it by
   * its selector; one that still stands as it was, read by this view or any
   * other, is left alone (core `anchorRereader`). A moved pin whose anchor
   * finds its element again (the page drew it back, a revision restored it)
   * stands on the page again, out of the moved tray. Each as it is to be
   * written; none but those this view draws the page for as they were made
   * (`judges`): a phone's layout may lack a desk's element, and another
   * element reading its words would take the pin.
   */
  const reread = anchorRereader();
  const reanchor = (pins: Pin[]) => {
    const moves: Pin[] = [];
    for (const pin of pins) {
      if (
        !("selector" in pin.anchor) ||
        (pin.movedAt && pin.ink && !deps.groupAt(pin.ink)) ||
        !judges(pin.anchor)
      ) {
        continue;
      }
      const found = deps.locate(deps.anchorToday(pin.anchor, pin.at));
      if (!found) {
        continue;
      }
      const read = deps.anchorOf(found.el);
      const now = reread(pin.id, pin.anchor, read, found.by);
      const anchor = now ?? madeAs(pin.anchor, read);
      // A place is written only as this view reads it back: one it would
      // find nothing by stands missing on the next draw, is moved aside, is
      // found again here, and is written again, for ever.
      if ((now || pin.movedAt) && deps.locate(anchor)?.el === found.el) {
        const { movedAt: _moved, ...rest } = pin;
        moves.push({ ...rest, anchor });
      }
    }
    return moves;
  };

  /** The tokens a pill is painted with, read once per draw in one style pass: a token is the page's style, read there and then. */
  const paintOf = () => {
    const read = chrome.tokens({
      action: ["--color-action-solid"],
      onAction: ["--color-on-action"],
      raised: ["--color-surface-raised"],
      recessed: ["--color-surface-fill-strong"],
      strong: ["--color-ink-strong"],
      focus: ["--color-focus-ring"],
      shadow: ["--color-shadow-tint"],
      dot: ["--color-status-live-glyph"],
      attn: ["--color-status-attn-glyph"],
      font: ["--type-label", "font"],
      height: ["--spacing-c-pin", "width"],
      pad: ["--spacing-c-pin-pad", "width"],
      gap: ["--spacing-space-1", "width"],
      inset: ["--spacing-space-2", "width"],
      dotSize: ["--status-dot-size", "width"],
      dotCut: ["--status-dot-cut", "width"],
      loop: ["--duration-loop", "transition-duration"],
      breath: ["--duration-breath", "transition-duration"],
      breathFloor: ["--breath-floor", "opacity"],
      breathEase: ["--ease-in-out", "transition-timing-function"],
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
      gap: Number.parseFloat(read.gap) || 4,
      inset: Number.parseFloat(read.inset) || 8,
      dotSize: Number.parseFloat(read.dotSize) || 6,
      dotCut: Number.parseFloat(read.dotCut) || 1.5,
      loop: durationMs(read.loop),
      breath: durationMs(read.breath),
      breathFloor: Number.parseFloat(read.breathFloor),
      breathEase: read.breathEase,
      ease: read.ease,
    };
  };
  type Paint = ReturnType<typeof paintOf>;

  /** The custom properties a layer carries for {@link PILL_SHEET}: the tokens as the overlay reads them, which no page document holds. */
  const varsOf = (paint: Paint): string =>
    [
      ["action", paint.action],
      ["on-action", paint.onAction],
      ["raised", paint.raised],
      ["recessed", paint.recessed],
      ["strong", paint.strong],
      ["focus", paint.focus],
      ["shadow", paint.shadow],
      ["dot", paint.dot],
      ["attn", paint.attn],
      ["font", paint.font],
      ["h", `${paint.height}px`],
      ["pad", `${paint.pad}px`],
      ["gap", `${paint.gap}px`],
      ["inset", `${paint.inset}px`],
      ["dot-size", `${paint.dotSize}px`],
      ["dot-cut", `${paint.dotCut}px`],
    ]
      .map(([name, value]) => `--cawco-pin-${name}:${value}`)
      .join(";");
  /** What each layer's custom properties were last written as. */
  const layerVars = new WeakMap<HTMLElement, string>();
  /** `held`'s custom properties written, where they changed. */
  const paintLayer = (held: HTMLElement, paint: Paint) => {
    const vars = varsOf(paint);
    if (layerVars.get(held) !== vars) {
      layerVars.set(held, vars);
      held.style.cssText = vars;
    }
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

  /**
   * A pill's dot on its top end, cut round by `--status-dot-cut`: working,
   * the live dot, breathing; an answer unread, the needs-you dot with its
   * echo (DESIGN.md, Status dot).
   */
  const dotOf = (id: string, paint: Paint, doc: Document): Element[] => {
    const working = live.has(id);
    const mark = doc.createElement("cawco-pin-dot");
    mark.setAttribute("data-dot", working ? "live" : "unread");
    if (!working) {
      return [mark, echoOf(id, paint, doc)];
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
      const now = Number(doc.timeline.currentTime ?? performance.now());
      breath.startTime =
        now - breathPhase(performance.timeOrigin, now, paint.breath);
    }
    return [mark];
  };

  /**
   * An unread answer's echo on its dot: a ring growing from it as it fades,
   * once a `--duration-loop`, three loops from when the answer was first drawn
   * unread and then still, however often the pill is drawn again in them.
   */
  const echoOf = (id: string, paint: Paint, doc: Document): Element => {
    const ring = doc.createElement("cawco-pin-echo");
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
   * Each drawn pill, by its pin's id, kept from draw to draw while its pin
   * is drawn: a draw paints it again in place ({@link pinPill}), so a press
   * that started on it still lands on it, whatever is drawn under the
   * pointer between its pointerdown and its pointerup. Made in the document
   * its pin stands in, and made again there when its pin's element moves to
   * another (a frame's, or the page's), so its dot breathes on that
   * document's clock.
   */
  const pills = new Map<string, HTMLElement>();
  /** The comment being written's pill, kept as its pins' are. */
  let draftPill: HTMLElement | null = null;

  /**
   * Pin `id`'s pill, pressable: made once, with what resting on it and
   * pressing it do read where it stands now ({@link placed}); resting on it
   * chooses its element and asks for its peek.
   */
  const pillOf = (id: string, doc: Document): HTMLElement => {
    const kept = pills.get(id);
    if (kept?.ownerDocument === doc) {
      return kept;
    }
    kept?.remove();
    const pill = doc.createElement("cawco-pin");
    pill.setAttribute("data-pin-id", id);
    pill.addEventListener("pointerenter", () => {
      const where = placed.get(id);
      if (!where) {
        return;
      }
      deps.outline(where.el, true);
      // Where the open thread's card is told it stands (`tell`): the thread
      // the rest draws is the card a press keeps, standing where it will.
      deps.post("cawco:peek", {
        id,
        mark: pillBox(where.pill),
        box: standingBox(where),
      });
    });
    pill.addEventListener("pointerleave", () => {
      deps.outline(focused ? (placed.get(focused)?.el ?? null) : null, false);
      deps.post("cawco:peek", { id: null });
    });
    pill.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deps.post("cawco:peek", { id: null });
      open(id);
    });
    pills.set(id, pill);
    return pill;
  };

  /** What each kept pill was last painted from ({@link pinPill}). */
  const pillLooks = new WeakMap<HTMLElement, string>();

  /**
   * A pin's pill painted by state (the artifact panel's surface brief, A
   * pin's pill: its face, ring and inks are {@link PILL_SHEET}'s), its number
   * and its dot; one painted from the same look is left as it stands, so a
   * draw that changed nothing of it writes nothing to it.
   */
  const pinPill = (pin: Pin, paint: Paint, doc: Document): HTMLElement => {
    const pill = pillOf(pin.id, doc);
    const look = JSON.stringify([
      pin.number,
      stateOf(pin),
      keyed && pin.id === focused,
      live.has(pin.id),
      unread.has(pin.id),
      motionOk(),
      paint.breath,
      paint.breathFloor,
      paint.loop,
    ]);
    if (pillLooks.get(pill) === look) {
      return pill;
    }
    pillLooks.set(pill, look);
    pill.setAttribute("data-pin", String(pin.number));
    pill.setAttribute("data-state", stateOf(pin));
    pill.toggleAttribute("data-keyed", keyed && pin.id === focused);
    pill.replaceChildren(
      String(pin.number),
      ...(live.has(pin.id) || unread.has(pin.id)
        ? dotOf(pin.id, paint, doc)
        : [])
    );
    return pill;
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

  /**
   * Whether a pin no anchor finds is missing, not waiting on a frame still
   * loading, in a view that draws the page as the pin was made
   * (`judges`): one that draws it otherwise (another width, another
   * scheme, another story) can't tell the page losing the element from its
   * own layout leaving it out, and the pin stands where it was put.
   */
  const goneFrom = (pin: Pin) =>
    !(
      "selector" in pin.anchor &&
      (deps.waiting(pin.anchor) || !judges(pin.anchor))
    );
  /** How long each pin has stood missing: one is gone only after a while, the page drawn again then. */
  const absent = absences(() => draw());

  /**
   * Of the pins no anchor finds now, those gone: no frame they stand in
   * loading, this view drawing the page as each was made, and missing a
   * while ({@link absences}). Read in every view of the page ({@link
   * placing}), and written by the one the hub names ({@link settled}). None
   * where a pin is never moved aside (a preview of a session's app): its
   * absence is not timed, so no timer draws the page again for it.
   */
  const goneOf = (missing: Pin[]): Pin[] => {
    if (!placing()) {
      absent.keep([]);
      return [];
    }
    const waited = missing.filter(goneFrom);
    absent.keep(waited.map((pin) => pin.id));
    return waited.filter((pin) => absent.missed(pin.id));
  };

  /**
   * The pins this view doesn't draw on their element, and why, as this view
   * alone reads them (core comments made-view.ts `Unplaced`), in its order:
   * made where this view can't judge it (another story, or another width
   * or scheme: `deps.madeAway`), with where, whether or not it finds the
   * element; else found but drawn in no box here ({@link drawnHere}); else
   * gone from the page ({@link goneOf}). None outside a page the agent wrote
   * or a sheet ({@link placing}), and none waiting on a frame.
   */
  const unplacedOf = (
    gone: Pin[],
    hidden: Pin[],
    missing: Pin[]
  ): Record<string, Unplaced> => {
    const read: Record<string, Unplaced> = {};
    if (!placing()) {
      return read;
    }
    const goneIds = new Set(gone.map((pin) => pin.id));
    for (const pin of hidden) {
      read[pin.id] = whyOff(pin, "hidden") ?? { why: "hidden" };
    }
    for (const pin of missing) {
      const why = whyOff(pin, goneIds.has(pin.id) ? "gone" : null);
      if (why) {
        read[pin.id] = why;
      }
    }
    return read;
  };

  /**
   * Why `pin` stands off the page in this view: where it was made, asked
   * first, when this view can't judge it, found or not (`deps.madeAway`);
   * else `found`, what this view read of it; null while its frame loads.
   */
  const whyOff = (
    pin: Pin,
    found: "gone" | "hidden" | null
  ): Unplaced | null => {
    const anchor = "selector" in pin.anchor ? pin.anchor : null;
    if (anchor && deps.waiting(anchor)) {
      return null;
    }
    const away = anchor ? deps.madeAway(anchor) : null;
    return away ?? (found ? { why: found } : null);
  };

  /** What this view last said of the pins it doesn't draw; null before its first draw said anything. */
  let saidUnplaced: string | null = null;
  /**
   * The pins this view doesn't draw, and why, said to the host when they
   * change (`cawco:pins-unplaced`): its moved tray lists them beside those
   * the doc holds moved. A reading of this view's, written nowhere.
   */
  const sayUnplaced = (unplaced: Record<string, Unplaced>) => {
    const now = JSON.stringify(unplaced);
    if (now !== saidUnplaced) {
      saidUnplaced = now;
      deps.post("cawco:pins-unplaced", { pins: unplaced });
    }
  };

  /**
   * Where each pin stands now ({@link spotOf}); the pins no anchor finds,
   * and those found but drawn in no box here, apart. A resolved pin stands
   * on the page only while its thread is open.
   */
  const placeAll = (all: Pin[]) => {
    const missing: Pin[] = [];
    const hidden: Pin[] = [];
    const onIt = (pin: Pin) => !pin.resolvedAt || pin.id === tracked;
    const standing: { pin: Pin; spot: Spot }[] = [];
    for (const pin of all.filter((one) => !one.movedAt && onIt(one))) {
      const spot = spotOf(pin);
      if (spot === HIDDEN) {
        hidden.push(pin);
      } else if (spot) {
        standing.push({ pin, spot });
      } else {
        missing.push(pin);
      }
    }
    return { hidden, missing, standing };
  };

  /** Where the comment being written stands now: on its ink, or on its element (the one the page holds now); null where neither stands. */
  const draftSpot = (draft: DraftTarget): Spot | null => {
    if (draft.ink) {
      return onInk(draft.ink);
    }
    // The page drew its element again: the pill stands on the one there now.
    const now = draft.el.isConnected ? null : deps.redraft();
    if (now) {
      drafted = { ...now };
    }
    const el = now?.el ?? draft.el;
    return el.isConnected ? spotOn(el, (now ?? draft).point) : null;
  };

  /**
   * The comment being written, painted as its hollow pill with no number;
   * parked, an ellipsis in the action ink says it holds words not yet
   * sent, and one press (a finger's 44px) opens its composer again with
   * them (The Work Outlives Its Surface Rule). Made in `doc`, the document
   * it stands in. Null while it stands nowhere.
   */
  const drawDraft = (spot: Spot | null, doc: Document): HTMLElement | null => {
    if (!drafted) {
      return null;
    }
    drafted.spot = spot ?? undefined;
    if (!spot) {
      drafted.pill = undefined;
      return null;
    }
    if (draftPill?.ownerDocument !== doc) {
      draftPill?.remove();
      draftPill = doc.createElement("cawco-pin");
      draftPill.setAttribute("data-pin", "new");
      draftPill.setAttribute("data-draft", "");
      draftPill.setAttribute("data-state", "provisional");
      draftPill.addEventListener("click", (event) => {
        if (!drafted?.parked) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        open(DRAFT_PIN);
      });
    }
    const pill = draftPill;
    const parked = !!drafted.parked;
    pill.toggleAttribute("data-parked", parked);
    if (parked) {
      pill.setAttribute("data-pin-id", DRAFT_PIN);
      pill.title = "Draft comment, not sent";
    } else {
      pill.removeAttribute("data-pin-id");
      pill.removeAttribute("title");
    }
    pill.textContent = parked ? "…" : "";
    drafted.pill = pill;
    return pill;
  };

  /** The paint of the last whole draw: ink moving its pins changes no token. */
  let painted: Paint | null = null;
  /** What each pin's view judgement read at the last draw ({@link judgedNow}). */
  let judgedAt = "";
  /** Each pin's view judgement now (`deps.madeAway`): a resize that changes none draws nothing. */
  const judgedNow = () =>
    JSON.stringify(
      [...pinsMap().values()].map((pin) =>
        "selector" in pin.anchor ? deps.madeAway(pin.anchor) : null
      )
    );

  /** Each row's box on the page, by the element it stands on, and the anchor name that element takes for it. */
  const rows = new Map<Anchorable, { box: HTMLElement; name: string }>();
  /** The row of pills on the page as a whole, at the viewport's corner. */
  const pageRow = document.createElement("cawco-pin-group");
  pageRow.setAttribute("data-page", "");

  /** `row`'s box, made with its anchor name on its element where it had none, standing on its point. */
  const rowBox = (row: Row): HTMLElement => {
    let kept = rows.get(row.anchor);
    if (!kept) {
      const name = anchorName();
      nameOn(row.anchor, name);
      const box = row.anchor.ownerDocument.createElement("cawco-pin-group");
      box.style.setProperty("position-anchor", name);
      kept = { box, name };
      rows.set(row.anchor, kept);
    }
    const { box } = kept;
    const view = row.anchor.ownerDocument.defaultView ?? window;
    // A percentage in `anchor()` runs from the start side: the right in a right-to-left page.
    const rtl =
      view.getComputedStyle(row.anchor.ownerDocument.documentElement)
        .direction === "rtl";
    const x = `${round((rtl ? 1 - row.point.x : row.point.x) * 100)}%`;
    const y = `${round(row.point.y * 100)}%`;
    if (box.style.getPropertyValue("--cawco-pin-x") !== x) {
      box.style.setProperty("--cawco-pin-x", x);
    }
    if (box.style.getPropertyValue("--cawco-pin-y") !== y) {
      box.style.setProperty("--cawco-pin-y", y);
    }
    holdIn(box, row.pills);
    return box;
  };

  /** The rows no draw stands now let go: off the page, and their names off their elements. */
  const letGoRows = (standing: Set<Anchorable>) => {
    for (const [anchor, { box, name }] of rows) {
      if (!standing.has(anchor)) {
        box.remove();
        nameOff(anchor, name);
        rows.delete(anchor);
      }
    }
  };

  /**
   * In a browser whose anchors stand where their element is laid out, not
   * where its transforms draw it (anchor-names.ts
   * `anchorsFollowTransforms`), each row moved by as far as its element's
   * transforms move its point: a probe on each element reads where it is
   * laid out, all in one layout, beside where it is drawn. Every other
   * browser lays every row by CSS alone.
   */
  const followTransforms = (drawn: Row[]) => {
    if (drawn.length === 0 || anchorsFollowTransforms(layer)) {
      return;
    }
    const probes = drawn.flatMap((row) => {
      const kept = rows.get(row.anchor);
      if (!kept) {
        return [];
      }
      const probe = row.anchor.ownerDocument.createElement("cawco-pin-probe");
      probe.style.setProperty("position-anchor", kept.name);
      layerIn(row.anchor.ownerDocument).append(probe);
      return [{ box: kept.box, probe, row }];
    });
    const shifts = probes.map(({ probe, row }) => {
      const laid = probe.getBoundingClientRect();
      const drawnAt = row.anchor.getBoundingClientRect();
      const { x, y } = row.point;
      return {
        x: drawnAt.x + x * drawnAt.width - (laid.x + x * laid.width),
        y: drawnAt.y + y * drawnAt.height - (laid.y + y * laid.height),
      };
    });
    for (const [i, { box, probe }] of probes.entries()) {
      probe.remove();
      const { x, y } = shifts[i];
      const by = Math.abs(x) < 0.5 && Math.abs(y) < 0.5 ? "" : `${x}px ${y}px`;
      if (box.style.translate !== by) {
        box.style.translate = by;
      }
    }
  };

  /**
   * The pins drawn where their elements stand now. Each pin's anchor is read
   * again first ({@link reanchor}), so a pin found again stands in this very
   * draw; what that and the pins gone write is written once the pills stand
   * ({@link settle}), as the overlay's own placing, which wakes no draw.
   * The pins on one element stand in one row anchored to it, the comment
   * being written last; every pill and row keeps its node, each brought to
   * hold what is drawn now, a node moved only where it stands elsewhere.
   * Nothing here measures where a pill stands: CSS lays it on its element.
   * `following`: ink moved by a scroller and nothing else changed, so only
   * a pin standing on ink, which stands past where its ink is drawn, is read
   * again; with none, nothing is.
   */
  function draw(following = false): void {
    if (following && !standsOnInk()) {
      return;
    }
    if (!(onPage() && artifact.keeps())) {
      drawNothing();
      return;
    }
    const { all, moves } = pinsNow(following);
    looked = new Set(all.map((pin) => pin.id));
    if (!following) {
      fitToPage(room, insetFor !== null || footKept());
      judgedAt = judgedNow();
    }
    placed.clear();
    painted = all.length > 0 || drafted ? paintFor(following) : null;
    const gone = drawPills(all, painted);
    if (settled()) {
      settle(moves, gone);
    }
    if (focused) {
      deps.outline(placed.get(focused)?.el ?? null);
    }
    tell();
  }

  /**
   * Each pin, and the comment being written, drawn in its row; what this
   * view doesn't draw, and why, said to the host. The pins gone, for the
   * view the hub names to write. With nothing to paint, every row goes.
   */
  const drawPills = (all: Pin[], paint: Paint | null): Pin[] => {
    if (!paint) {
      layRows([], [], null);
      return [];
    }
    const { hidden, missing, standing } = placeAll(all);
    const laid = standAll(standing, paint);
    layRows(laid.rows, laid.onPageAsWhole, paint);
    const gone = goneOf(missing);
    sayUnplaced(unplacedOf(gone, [...hidden, ...laid.unanchored], missing));
    return gone;
  };

  /**
   * The doc's pins in their numbers' order, each whose element stands
   * otherwise now anchored again ({@link reanchor}), and those moves; none
   * read again when ink a scroller moved changed no element.
   */
  const pinsNow = (following: boolean) => {
    const read = [...pinsMap().values()].sort((a, b) => a.number - b.number);
    const moves = !following && settled() ? reanchor(read) : [];
    const found = new Map(moves.map((pin) => [pin.id, pin]));
    return { all: read.map((pin) => found.get(pin.id) ?? pin), moves };
  };

  /** The tokens read off the page's style, which forces its style there and then: kept from the last draw when only ink moved. */
  const paintFor = (following: boolean): Paint =>
    (following ? painted : null) ?? paintOf();

  /** Whether a pin, or the comment being written, stands on ink. */
  const standsOnInk = () =>
    [...placed.values(), ...(drafted?.spot ? [drafted.spot] : [])].some(
      (spot) => !!spot.ink
    );

  /** No pill on the page: each layer holds its styles alone, and every row's name is off its element. */
  const drawNothing = () => {
    placed.clear();
    looked = new Set();
    for (const held of layers.values()) {
      holdIn(held, held.firstElementChild ? [held.firstElementChild] : []);
    }
    letGoRows(new Set());
    forgetUnheld();
    fitToPage(room, false);
  };

  /**
   * Each standing pin's pill painted and put in its row, the pins on one
   * element in one row in their numbers' order, the comment being written
   * last; a pin on the page as a whole in the row at the viewport's
   * corner. The pins whose element no box can anchor to, apart.
   */
  const standAll = (standing: { pin: Pin; spot: Spot }[], paint: Paint) => {
    /** Each row by its element, in the order its first pill came. */
    const byAnchor = new Map<Anchorable, Row>();
    const onPageAsWhole: HTMLElement[] = [];
    const unanchored: Pin[] = [];
    /** Where a pill at `spot` goes: the document it stands in, and the row it joins; null where no box can anchor to its element. */
    const homeOf = (
      spot: Spot
    ): { doc: Document; join: (pill: HTMLElement) => void } | null => {
      if (spot.page) {
        return { doc: document, join: (pill) => onPageAsWhole.push(pill) };
      }
      const at = spot.el ? anchorFor(spot.el, spot.point) : null;
      if (!at) {
        return null;
      }
      return {
        doc: at.anchor.ownerDocument,
        join: (pill) => {
          const row = byAnchor.get(at.anchor) ?? {
            anchor: at.anchor,
            pills: [],
            point: at.point,
          };
          row.pills.push(pill);
          byAnchor.set(at.anchor, row);
        },
      };
    };
    for (const { pin, spot } of standing) {
      const home = homeOf(spot);
      if (home) {
        const pill = pinPill(pin, paint, home.doc);
        home.join(pill);
        placed.set(pin.id, { ...spot, pill });
      } else {
        unanchored.push(pin);
      }
    }
    const draftAt = drafted ? draftSpot(drafted) : null;
    const draftHome = draftAt ? homeOf(draftAt) : null;
    const draft = drawDraft(
      draftHome ? draftAt : null,
      draftHome?.doc ?? document
    );
    if (draft) {
      draftHome?.join(draft);
    }
    return { onPageAsWhole, rows: [...byAnchor.values()], unanchored };
  };

  /**
   * Each document's layer brought to hold its styles, painted with the
   * tokens, then its rows (this page's, the row on the page as a whole
   * too); the rows no draw stands let go, and each row moved by its
   * element's transforms where anchors don't follow them.
   */
  const layRows = (
    drawn: Row[],
    onPageAsWhole: HTMLElement[],
    paint: Paint | null
  ) => {
    const byLayer = new Map<HTMLElement, Element[]>();
    for (const doc of [...layers.keys()]) {
      if (doc.defaultView) {
        byLayer.set(layerIn(doc), []);
      } else {
        layers.delete(doc);
      }
    }
    for (const row of drawn) {
      const held = layerIn(row.anchor.ownerDocument);
      byLayer.set(held, [...(byLayer.get(held) ?? []), rowBox(row)]);
    }
    holdIn(pageRow, onPageAsWhole);
    if (onPageAsWhole.length > 0) {
      byLayer.get(layer)?.push(pageRow);
    }
    for (const [held, holds] of byLayer) {
      if (paint) {
        paintLayer(held, paint);
      }
      const sheet = held.firstElementChild;
      holdIn(held, sheet ? [sheet, ...holds] : holds);
    }
    letGoRows(new Set(drawn.map((row) => row.anchor)));
    forgetUnheld();
    followTransforms(drawn);
  };

  /** The kept pills no row holds now let go. */
  const forgetUnheld = () => {
    for (const [id, pill] of pills) {
      if (!pill.isConnected) {
        pills.delete(id);
      }
    }
    if (draftPill && !draftPill.isConnected) {
      draftPill = null;
    }
  };

  /**
   * The open pin's pill in the viewport, and the box of what it stands on,
   * for the host's thread card, which stands beside the pill where it has
   * room. The comment being written, the same for its composer. Read off
   * the pills where the browser laid them: nothing is drawn for it.
   */
  const tell = () => {
    if (tracked) {
      const where = placed.get(tracked);
      const shownNow = where && showsNow(where) ? where : undefined;
      deps.post("cawco:pin-at", {
        id: tracked,
        ...(shownNow
          ? { mark: pillBox(shownNow.pill), box: standingBox(shownNow) }
          : {}),
      });
    }
    if (drafted?.spot && drafted.pill) {
      deps.post("cawco:compose-at", {
        mark: pillBox(drafted.pill),
        box: standingBox(drafted.spot),
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
      for (const pill of pills.values()) {
        pill.removeAttribute("data-keyed");
        pillLooks.delete(pill);
      }
    },
    { capture: true, passive: true }
  );
  // The viewport's width crossed one of the page's breakpoints: which pins
  // this view judges, and why it draws none of the rest, may have changed.
  // Where each pill stands, CSS keeps. Judged once the window's size holds
  // (steady-frame.ts): on each frame of a drag, every pin was judged again.
  const judgeAgain = () => {
    if (judgedNow() !== judgedAt) {
      draw();
    }
  };
  addEventListener("resize", () => steadyFrame(judgeAgain), {
    passive: true,
  });
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
  const bringOut = (where: Placed, owner: string, instant = false) => {
    const r = (painted?.height ?? 20) / 2;
    const [px, py] = pointOf(where);
    const x = px - scrollX;
    const y = py - scrollY;
    const clear = bandsAt(x, covered, r);
    if (showsNow(where) && inBands(y, clear)) {
      return;
    }
    const chain = scrollersOf(where.el, rectOf);
    let landed = bringInto(chain, y, clear);
    const lift = landed ? 0 : liftUnder(x, covered, r);
    if (lift > 0 && giveRoom(chain, lift, owner)) {
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
    glideLook = setTimeout(() => bringOutUnder(true), GLIDE_MS);
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
    fitToPage(room, true);
    return true;
  };

  /**
   * Whether the room given for a pill is no longer needed: nothing covers
   * the page, or the pill it was made for is no longer the open thread's,
   * the stepped-to one's or the comment being written. Taken back here, the
   * container's style as it was; the caller draws, which fits the room to
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
  const keepClear = () => bringOutUnder();
  const bringOutUnder = (instant = false) => {
    const under = (at: Spot, pill: HTMLElement) =>
      !at.page && covered.some((one) => meets(pillBox(pill), one));
    const where = tracked ? placed.get(tracked) : undefined;
    if (tracked && where && under(where, where.pill)) {
      reveal(tracked, instant);
    }
    const draft = drafted?.parked ? undefined : drafted;
    if (draft?.spot && draft.pill && under(draft.spot, draft.pill)) {
      bringOut({ ...draft.spot, pill: draft.pill }, DRAFT_PIN, instant);
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
    room,
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
        const box = deps.groupAt(pin.ink)?.box;
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
      const box = roundPoint(pageBox(where.el), pointOf(where));
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
    anchored: () =>
      onPage() && artifact.keeps()
        ? [...pinsMap().values()].flatMap((pin) =>
            "selector" in pin.anchor
              ? [{ anchor: pin.anchor, on: placed.get(pin.id)?.el ?? null }]
              : []
          )
        : [],
    placedOn: (id) => {
      if (!looked.has(id)) {
        return null;
      }
      const el = placed.get(id)?.el ?? null;
      if (!el) {
        return { el: null };
      }
      return el.isConnected ? { el } : null;
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
      // Drawn again: a resolved pin stands only while its thread is open.
      // Its pills are put back under a tap that may be landing, so the page
      // waits a frame: iOS WebKit, seeing new content as a tap lands, takes
      // it for a hover and sends no click.
      requestAnimationFrame(() => draw());
    },
    show: (showing) => {
      shown = showing;
      for (const held of layers.values()) {
        held.hidden = !showing;
      }
      if (!showing) {
        deps.post("cawco:peek", { id: null });
      }
    },
  };
}
