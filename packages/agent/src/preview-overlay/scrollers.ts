/**
 * Where a mark may stand (pins.ts `reveal`): out from under the boxes the
 * host's chrome covers the page with, as Figma's comments list opens a comment
 * with its pin and its card both on the part of the canvas the list leaves
 * free. A page only scrolls up and down, so what is free is read at the mark's
 * x: the viewport's height less every covered box over that x, in bands. The
 * scrollers bring it there (core bring-into-view.ts `bringInto`). Where none
 * can, room is given under the foot of what the person scrolls
 * ({@link liftUnder}, {@link padFoot}; pins.ts `giveRoom`).
 */
import {
  type Band,
  CLEAR_GAP,
  type Scroller,
} from "@cawco/core/bring-into-view";

/** A box in the viewport, px. */
export interface ViewBox {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** The stretches of the viewport's height a disc of radius `r` at the viewport's `x` stands clear of every `covered` box in. */
export function bandsAt(x: number, covered: ViewBox[], r: number): Band[] {
  let bands: Band[] = [
    { top: r + CLEAR_GAP, bottom: innerHeight - r - CLEAR_GAP },
  ];
  for (const box of covered) {
    if (x + r + CLEAR_GAP <= box.x || x - r - CLEAR_GAP >= box.x + box.w) {
      continue;
    }
    const above = box.y - r - CLEAR_GAP;
    const below = box.y + box.h + r + CLEAR_GAP;
    bands = bands
      .flatMap((band) => [
        { top: band.top, bottom: Math.min(band.bottom, above) },
        { top: Math.max(band.top, below), bottom: band.bottom },
      ])
      .filter((band) => band.bottom >= band.top);
  }
  return bands;
}

/**
 * The room a disc of radius `r` at the viewport's `x` needs under the page's
 * foot to scroll clear of every `covered` box over that x: from the highest
 * one's top to the viewport's foot, and the gap a lifted mark keeps; 0 when
 * none stands over it.
 */
export function liftUnder(x: number, covered: ViewBox[], r: number): number {
  const over = covered.filter(
    (box) => x + r + CLEAR_GAP > box.x && x - r - CLEAR_GAP < box.x + box.w
  );
  if (over.length === 0) {
    return 0;
  }
  const top = Math.min(...over.map((box) => box.y));
  return Math.ceil(innerHeight - top + r + CLEAR_GAP);
}

/** Overflows that keep the person from scrolling a box (a script still can). */
const HELD = /^(hidden|clip)$/u;

/**
 * Whether the person scrolls the top page: its root's overflow, or the
 * body's where the root's is `visible` (CSS Overflow 3 carries the body's up
 * to the viewport then), holds no scroll back. An app's shell whose body is
 * `overflow: hidden` scrolls only inside it.
 */
export function pageScrolls(): boolean {
  const root = getComputedStyle(document.documentElement).overflowY;
  if (root !== "visible") {
    return !HELD.test(root);
  }
  return !(
    document.body && HELD.test(getComputedStyle(document.body).overflowY)
  );
}

/** The innermost scroll container round a mark in `chain` (core `scrollersOf`), none a document's own; null when it has none. */
export function innerScroller(
  chain: Scroller[]
): { el: HTMLElement; scale: number } | null {
  const found = chain.find(
    ({ el }) => el !== el.ownerDocument.scrollingElement && "style" in el
  );
  return found ? { el: found.el as HTMLElement, scale: found.scale } : null;
}

/**
 * Room given under a scroll container's content, kept to be taken back:
 * its bottom padding as computed before, its `style` attribute as it was,
 * its inline bottom padding and priority, and the attribute as written.
 */
export interface FootPad {
  el: HTMLElement;
  inline: string;
  own: string;
  priority: string;
  style: string | null;
  wrote: string;
}

/**
 * Room `px` (the container's own px) under scroll container `el`'s content:
 * its bottom padding grown inline, important so no rule of the page's
 * holds it back. Padding over a spacer the overlay would put in as its last
 * child: such a child takes `:last-child` from the page's own last child
 * (a list's last border, prose's last margin), and in a grid or a row of
 * flex items stands beside the content rather than under it; a scroll
 * container's bottom padding is under the content in every layout, and
 * moves nothing inside it. `held`, the room given before: grown or shrunk
 * in place on the same container, taken back from another first.
 */
export function padFoot(
  el: HTMLElement,
  px: number,
  held: FootPad | null
): FootPad {
  const kept = held?.el === el ? held : null;
  if (held && !kept) {
    unpadFoot(held);
  }
  const first = kept ?? {
    inline: el.style.getPropertyValue("padding-bottom"),
    own: getComputedStyle(el).paddingBottom,
    priority: el.style.getPropertyPriority("padding-bottom"),
    style: el.getAttribute("style"),
  };
  el.style.setProperty(
    "padding-bottom",
    `calc(${first.own} + ${Math.ceil(px)}px)`,
    "important"
  );
  return { ...first, el, wrote: el.getAttribute("style") ?? "" };
}

/**
 * The room {@link padFoot} gave taken back: the `style` attribute as it
 * was, to the byte, while nothing else has written it since; else only the
 * bottom padding put back, so what the page wrote meanwhile stands.
 */
export function unpadFoot(pad: FootPad) {
  const { el } = pad;
  if ((el.getAttribute("style") ?? "") === pad.wrote) {
    if (pad.style === null) {
      el.removeAttribute("style");
    } else {
      el.setAttribute("style", pad.style);
    }
    return;
  }
  if (pad.inline) {
    el.style.setProperty("padding-bottom", pad.inline, pad.priority);
  } else {
    el.style.removeProperty("padding-bottom");
  }
}

export const inBands = (y: number, bands: Band[]) =>
  bands.some((band) => y >= band.top && y <= band.bottom);
