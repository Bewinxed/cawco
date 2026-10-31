/**
 * Bringing an element into view by the scrollers it stands in, along one axis
 * only. The platform's `scrollIntoView` moves every box round the element on
 * both axes, `overflow: hidden` ones too: the workspace's pane stack (which
 * then has to put itself back, gesture.svelte.ts) and, on a page with a foot
 * outside its scroller, the page's column off that foot's edges. No option of
 * it leaves an axis alone.
 *
 * What it gives that's worth keeping is kept: a scroller's `scroll-padding`
 * (what stands over its edges: a phone's views bar, `--reveal-foot`) and the
 * element's `scroll-margin` narrow where it lands.
 *
 * The preview overlay brings a mark in by its own scrollers.ts, through
 * same-origin frames; this is the dashboard's, which has none to go through.
 */

/** Overflows a person scrolls by. `hidden` and `clip` are held still on purpose. */
const SCROLLS = /^(auto|scroll|overlay)$/u;

/** A stretch along one axis of the viewport. */
interface Run {
  end: number;
  start: number;
}

/** A `scroll-padding` as px of a scroller `size` long: `auto` is none, a percentage is of the scroller. */
const padOf = (value: string, size: number) => {
  const px = Number.parseFloat(value) || 0;
  return value.endsWith("%") ? (px / 100) * size : px;
};

/** How far a scroller moves to stand `item` whole in `view` by the least it takes: nothing where it already does, or where it covers `view`. */
const leastTo = (item: Run, view: Run) => {
  const over = item.end - item.start > view.end - view.start;
  if (item.start < view.start && item.end <= view.end) {
    return over ? item.end - view.end : item.start - view.start;
  }
  if (item.end > view.end && item.start >= view.start) {
    return over ? item.start - view.start : item.end - view.end;
  }
  return 0;
};

/** The boxes that scroll `el` up and down, innermost first, its document's own last: nothing outside a fixed box moves it. */
function blockScrollers(el: Element): Element[] {
  const found: Element[] = [];
  const root = document.scrollingElement;
  for (let at: Element | null = el; at; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (at !== el && at !== root && SCROLLS.test(style.overflowY)) {
      found.push(at);
    }
    if (style.position === "fixed") {
      return found;
    }
  }
  return root ? [...found, root] : found;
}

/**
 * Up and down only. `third`: `el`'s top a third of the way down the first
 * scroller that can move it, as a pin is brought out (the overlay's
 * scrollers.ts); every scroller round that one moves by the least that shows
 * it. `nearest`: each by the least, for a row a key or a section walks to,
 * which a jump would lose the place of.
 */
export function bringIntoView(
  el: Element,
  {
    at = "nearest",
    behavior = "auto",
  }: { at?: "nearest" | "third"; behavior?: ScrollBehavior } = {}
) {
  const box = el.getBoundingClientRect();
  const own = getComputedStyle(el);
  let top = box.top - (Number.parseFloat(own.scrollMarginTop) || 0);
  let bottom = box.bottom + (Number.parseFloat(own.scrollMarginBottom) || 0);
  let placing = at === "third";
  const moves: [Element, number][] = [];
  // Read whole, then written: no write between two reads lays the page out.
  for (const scroller of blockScrollers(el)) {
    const room = scroller.scrollHeight - scroller.clientHeight;
    if (room <= 0) {
      continue;
    }
    const isRoot = scroller === document.scrollingElement;
    const edge = isRoot
      ? 0
      : scroller.getBoundingClientRect().top + scroller.clientTop;
    const style = getComputedStyle(scroller);
    const size = scroller.clientHeight;
    const view = {
      start: edge + padOf(style.scrollPaddingTop, size),
      end: edge + size - padOf(style.scrollPaddingBottom, size),
    };
    const want = placing
      ? top - (view.start + (view.end - view.start) / 3)
      : leastTo({ start: top, end: bottom }, view);
    placing = false;
    const by = Math.max(
      -scroller.scrollTop,
      Math.min(room - scroller.scrollTop, want)
    );
    if (Math.abs(by) >= 1) {
      moves.push([scroller, by]);
      top -= by;
      bottom -= by;
    }
  }
  for (const [scroller, by] of moves) {
    scroller.scrollBy({ top: by, behavior });
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
        { start: box.left, end: box.right },
        {
          start: edge + padOf(style.scrollPaddingLeft, size),
          end: edge + size - padOf(style.scrollPaddingRight, size),
        }
      );
      if (Math.abs(by) >= 1) {
        at.scrollBy({ left: by, behavior });
      }
      return;
    }
  }
}
