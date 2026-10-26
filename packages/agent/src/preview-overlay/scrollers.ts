/**
 * Bringing a mark where the person sees it (pins.ts `reveal`): out from
 * under the boxes the host's chrome covers the page with, as Figma's
 * comments list opens a comment with its pin and its card both on the part
 * of the canvas the list leaves free. A page only scrolls up and down, so
 * what is free is read at the mark's x: the viewport's height less every
 * covered box over that x, in bands. The mark is moved there by the
 * scrollers round it, innermost first (a scroll container, a same-origin
 * frame's document, the page), each moving it as far as it can while it
 * still shows it, and only as far as the band needs. Where none can, room
 * is given under the foot of what the person scrolls ({@link liftUnder},
 * {@link padFoot}; pins.ts `giveRoom`).
 */
import { type FrameElement, isFrame, rectOf } from "./frames";

/** A box in the viewport, px. */
export interface ViewBox {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** Room kept between a mark and what covers the page, or the viewport's edge, px. Our call. */
const CLEAR_GAP = 8;
/** Overflows a container scrolls by. */
const SCROLLS = /^(auto|scroll|overlay)$/u;

/** A stretch of the viewport's height a mark may stand in. */
interface Band {
  bottom: number;
  top: number;
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

/** The innermost scroll container round a mark in `chain` ({@link scrollersOf}), none a document's own; null when it has none. */
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

/**
 * What scrolls a mark up and down: an element whose content scrolls, the
 * part of the viewport that shows what it holds (null for the top page's
 * own, the viewport itself), and how much a px of its scroll moves the mark
 * in the viewport (a frame drawn smaller moves it less).
 */
interface Scroller {
  clip: Band | null;
  el: Element;
  scale: number;
}

/** How much a px of `el`'s document moves in the top viewport: 1, or the scale its frames are drawn at. */
const scaleOf = (el: Element) => {
  const own = el.getBoundingClientRect().height;
  return own > 0 ? rectOf(el).height / own : 1;
};

/** The band of the viewport `el` shows its content in. */
const clipOfBox = (el: Element): Band => {
  const box = rectOf(el);
  return { top: box.top, bottom: box.bottom };
};

/** The same-origin frame `doc` stands in, inside the overlay's own document; null for that document's own. */
const frameOf = (doc: Document): FrameElement | null => {
  if (doc === document) {
    return null;
  }
  try {
    const frame = doc.defaultView?.frameElement ?? null;
    return isFrame(frame) ? frame : null;
  } catch {
    return null;
  }
};

/** The scroll containers from `at` up to its document's body, innermost first. */
function containersFrom(at: Element | null, doc: Document): Scroller[] {
  const view = doc.defaultView ?? window;
  const found: Scroller[] = [];
  for (
    let el = at;
    el && el !== doc.body && el !== doc.documentElement;
    el = el.parentElement
  ) {
    if (
      SCROLLS.test(view.getComputedStyle(el).overflowY) &&
      el.scrollHeight > el.clientHeight
    ) {
      found.push({ el, clip: clipOfBox(el), scale: scaleOf(el) });
    }
  }
  return found;
}

/** The scrollers round `el`, innermost first: its scroll containers, each same-origin frame's document out to the top page's. */
export function scrollersOf(el: Element | null): Scroller[] {
  const chain: Scroller[] = [];
  let doc = el?.ownerDocument ?? document;
  let at: Element | null = el?.parentElement ?? null;
  for (;;) {
    chain.push(...containersFrom(at, doc));
    const root = doc.scrollingElement;
    const frame = frameOf(doc);
    if (!frame) {
      if (root) {
        chain.push({ el: root, clip: null, scale: 1 });
      }
      return chain;
    }
    if (root) {
      chain.push({ el: root, clip: clipOfBox(frame), scale: scaleOf(root) });
    }
    doc = frame.ownerDocument;
    at = frame.parentElement;
  }
}

/** The scrolls that move a mark, each scroller's by its own px, and where the mark lands in the viewport. */
interface Moves {
  at: number;
  by: [el: Element, top: number][];
}

/**
 * The scrolls that bring a mark at the viewport's `y` into one of `bands`,
 * the nearest the mark can reach, a third of the way down it as the page
 * was always brought to a mark; null when no scroll can.
 */
export function bringInto(
  chain: Scroller[],
  y: number,
  bands: Band[]
): Moves | null {
  let best: Moves | null = null;
  for (const band of bands) {
    const target = band.top + (band.bottom - band.top) / 3;
    const moves = toward(chain, y, target);
    if (
      moves.at >= band.top - 1 &&
      moves.at <= band.bottom + 1 &&
      (!best || Math.abs(moves.at - y) < Math.abs(best.at - y))
    ) {
      best = moves;
    }
  }
  return best;
}

/** The scrolls that move a mark at `y` toward `target`, innermost scroller first, each keeping the mark where it shows it. */
function toward(chain: Scroller[], y: number, target: number): Moves {
  let at = y;
  const by: Moves["by"] = [];
  for (const { el, clip, scale } of chain) {
    const want = target - at;
    if (Math.abs(want) < 1) {
      break;
    }
    // The mark moves down `d` as the scroller's top falls `d / scale`.
    let low = -(el.scrollHeight - el.clientHeight - el.scrollTop) * scale;
    let high = el.scrollTop * scale;
    if (clip) {
      low = Math.max(low, clip.top + CLEAR_GAP - at);
      high = Math.min(high, clip.bottom - CLEAR_GAP - at);
    }
    if (low > high) {
      continue;
    }
    const d = Math.max(low, Math.min(high, want));
    if (Math.abs(d) >= 1) {
      by.push([el, -d / scale]);
      at += d;
    }
  }
  return { at, by };
}

/** The scrolls made: the top page's as `behavior` says, every inner one at once. */
export function scrollMoves(moves: Moves, behavior: ScrollBehavior) {
  for (const [el, top] of moves.by) {
    el.scrollBy({
      top,
      behavior: el === document.scrollingElement ? behavior : "auto",
    });
  }
}
