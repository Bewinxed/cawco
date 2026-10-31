/**
 * Bringing something into view by the scrollers it stands in, one axis at a
 * time: the dashboard's and the preview overlay's one way. The platform's
 * `scrollIntoView` moves every box round the element on both axes,
 * `overflow: hidden` ones too: the workspace's pane stack and, on a page with
 * a foot outside its scroller, the page's column off that foot's edges. No
 * option of it leaves an axis alone.
 *
 * What it gives that's worth keeping is kept: a scroller's `scroll-padding`
 * (what stands over its edges: a phone's views bar, `--reveal-foot`) and the
 * element's `scroll-margin` narrow where it lands. Same-origin frames are
 * gone through.
 */

/** A stretch of the viewport's height. */
export interface Band {
  bottom: number;
  top: number;
}

/**
 * What scrolls something up and down: an element whose content scrolls, the
 * part of the viewport it shows that content in less its `scroll-padding`,
 * whether that part is the top viewport's own, and how much a px of its scroll
 * moves what it holds in the viewport (a frame drawn smaller moves it less).
 */
export interface Scroller {
  el: Element;
  scale: number;
  top: boolean;
  view: Band;
}

/** The scrolls that move something, each scroller's by its own px, and where a point of it lands in the viewport. */
export interface Moves {
  at: number;
  by: [el: Element, top: number][];
}

/** Room kept between a mark and what covers the page, or a scroller's edge, px. Our call. */
export const CLEAR_GAP = 8;
/** Overflows a person scrolls by. `hidden` and `clip` are held still on purpose. */
const SCROLLS = /^(auto|scroll|overlay)$/u;

type RectOf = (el: Element) => DOMRect;
const ownRect: RectOf = (el) => el.getBoundingClientRect();

/** A `scroll-padding` as px of a scroller `size` long: `auto` is none, a percentage is of the scroller. */
const padOf = (value: string, size: number) => {
  const px = Number.parseFloat(value) || 0;
  return value.endsWith("%") ? (px / 100) * size : px;
};

/** How far a scroller moves to stand `item` whole in `view` by the least it takes: nothing where it already does, or where it covers `view`. */
const leastTo = (item: Band, view: Band) => {
  const over = item.bottom - item.top > view.bottom - view.top;
  if (item.top < view.top && item.bottom <= view.bottom) {
    return over ? item.bottom - view.bottom : item.top - view.top;
  }
  if (item.bottom > view.bottom && item.top >= view.top) {
    return over ? item.top - view.top : item.bottom - view.bottom;
  }
  return 0;
};

/** The frame `doc` stands in, where this document can read it; null at the top, or at another origin's edge. */
const frameOf = (doc: Document): Element | null => {
  if (doc === document) {
    return null;
  }
  try {
    return doc.defaultView?.frameElement ?? null;
  } catch {
    return null;
  }
};

/** `el` as a scroller: `box` is the part of the viewport it shows, its `scroll-padding` taken off. */
const scrollerAt = (
  el: Element,
  view: Window,
  box: Band,
  scale: number,
  top: boolean
): Scroller => {
  const style = view.getComputedStyle(el);
  const size = el.clientHeight;
  return {
    el,
    scale,
    top,
    view: {
      top: box.top + padOf(style.scrollPaddingTop, size) * scale,
      bottom: box.bottom - padOf(style.scrollPaddingBottom, size) * scale,
    },
  };
};

/** A box scrolled up and down inside its document, as a scroller. */
function containerAt(one: Element, view: Window, rectOf: RectOf): Scroller {
  const box = rectOf(one);
  const own = one.getBoundingClientRect().height;
  const scale = own > 0 ? box.height / own : 1;
  const top = box.top + one.clientTop * scale;
  return scrollerAt(
    one,
    view,
    { top, bottom: top + one.clientHeight * scale },
    scale,
    false
  );
}

/** The scroll containers from `at` up to its document's body, innermost first, `skip` not among them; and whether a fixed box stops them short. */
function containersFrom(
  at: Element | null,
  skip: Element | null,
  doc: Document,
  rectOf: RectOf
): { fixed: boolean; found: Scroller[] } {
  const view = doc.defaultView ?? window;
  const found: Scroller[] = [];
  for (
    let one = at;
    one && one !== doc.body && one !== doc.documentElement;
    one = one.parentElement
  ) {
    const style = view.getComputedStyle(one);
    if (
      one !== skip &&
      SCROLLS.test(style.overflowY) &&
      one.scrollHeight > one.clientHeight
    ) {
      found.push(containerAt(one, view, rectOf));
    }
    if (style.position === "fixed") {
      return { fixed: true, found };
    }
  }
  return { fixed: false, found };
}

/**
 * The scrollers round `el`, innermost first: its scroll containers, then its
 * document's own, out through each same-origin frame. Nothing outside a fixed
 * box moves what's in it. `rectOf`: a box in the top viewport, where `el` may
 * stand in a frame.
 */
export function scrollersOf(
  el: Element | null,
  rectOf: RectOf = ownRect
): Scroller[] {
  const chain: Scroller[] = [];
  let doc = el?.ownerDocument ?? document;
  let at: Element | null = el;
  for (;;) {
    const { fixed, found } = containersFrom(at, at, doc, rectOf);
    chain.push(...found);
    const root = doc.scrollingElement;
    const frame = frameOf(doc);
    const view = doc.defaultView ?? window;
    if (root && !fixed) {
      chain.push(
        frame
          ? { ...containerAt(frame, view, rectOf), el: root }
          : scrollerAt(
              root,
              view,
              { top: 0, bottom: view.innerHeight },
              1,
              true
            )
      );
    }
    if (!frame) {
      return chain;
    }
    doc = frame.ownerDocument;
    at = frame;
  }
}

/** `d`, how far something would move down in the viewport, as far as `scroller`'s scroll can take it. */
const inReach = ({ el, scale }: Scroller, d: number) =>
  Math.max(
    -(el.scrollHeight - el.clientHeight - el.scrollTop) * scale,
    Math.min(el.scrollTop * scale, d)
  );

/** The scrolls that move a mark at `y` toward `target`, innermost scroller first, each keeping the mark where it shows it. */
function toward(chain: Scroller[], y: number, target: number): Moves {
  let at = y;
  const by: Moves["by"] = [];
  for (const scroller of chain) {
    const want = target - at;
    if (Math.abs(want) < 1) {
      break;
    }
    const { el, scale, top, view } = scroller;
    const low = top ? Number.NEGATIVE_INFINITY : view.top + CLEAR_GAP - at;
    const high = top ? Number.POSITIVE_INFINITY : view.bottom - CLEAR_GAP - at;
    if (low > high) {
      continue;
    }
    const d = inReach(scroller, Math.max(low, Math.min(high, want)));
    if (Math.abs(d) >= 1) {
      by.push([el, -d / scale]);
      at += d;
    }
  }
  return { at, by };
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

/** The scrolls made: the top page's as `behavior` says, every inner one at once. */
export function scrollMoves(moves: Moves, behavior: ScrollBehavior) {
  for (const [el, top] of moves.by) {
    el.scrollBy({
      top,
      behavior: el === document.scrollingElement ? behavior : "auto",
    });
  }
}

/**
 * Up and down only. `third`: `el`'s top a third of the way down the first
 * scroller that can move it; every scroller round that one moves by the least
 * that shows it. `nearest`: each by the least, for a row a key or a section
 * walks to, which a jump would lose the place of.
 */
export function bringIntoView(
  el: Element,
  {
    at = "nearest",
    behavior = "auto",
  }: { at?: "nearest" | "third"; behavior?: ScrollBehavior } = {}
) {
  const own = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  let item: Band = {
    top: own.top - (Number.parseFloat(style.scrollMarginTop) || 0),
    bottom: own.bottom + (Number.parseFloat(style.scrollMarginBottom) || 0),
  };
  let placing = at === "third";
  const by: Moves["by"] = [];
  // Read whole, then written: no write between two reads lays the page out.
  for (const scroller of scrollersOf(el)) {
    if (scroller.el.scrollHeight <= scroller.el.clientHeight) {
      continue;
    }
    const { top: from, bottom: to } = scroller.view;
    const want = placing
      ? from + (to - from) / 3 - item.top
      : -leastTo(item, scroller.view);
    placing = false;
    const d = inReach(scroller, want);
    if (Math.abs(d) >= 1) {
      by.push([scroller.el, -d / scroller.scale]);
      item = { top: item.top + d, bottom: item.bottom + d };
    }
  }
  for (const [scroller, top] of by) {
    scroller.scrollBy({ top, behavior });
  }
}

/**
 * Sideways, in the one strip that scrolls `el` that way, by the least it
 * takes: a tab in its row of tabs. Nothing round the strip moves.
 */
export function bringIntoStrip(el: Element, behavior: ScrollBehavior = "auto") {
  for (let at = el.parentElement; at; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (SCROLLS.test(style.overflowX) && at.scrollWidth > at.clientWidth) {
      const box = el.getBoundingClientRect();
      const edge = at.getBoundingClientRect().left + at.clientLeft;
      const size = at.clientWidth;
      const by = leastTo(
        { top: box.left, bottom: box.right },
        {
          top: edge + padOf(style.scrollPaddingLeft, size),
          bottom: edge + size - padOf(style.scrollPaddingRight, size),
        }
      );
      if (Math.abs(by) >= 1) {
        at.scrollBy({ left: by, behavior });
      }
      return;
    }
  }
}
