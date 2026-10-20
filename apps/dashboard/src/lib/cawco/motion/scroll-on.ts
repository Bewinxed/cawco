/**
 * A scroll that rides another motion's clock: the scroller travels from where
 * it stands to `to` as `clock` (a Web Animations `Animation`, a fold's or a
 * tween's) goes, on its curve, so the two are one motion. Each frame reads how
 * far the clock has gone and writes the scroll from it, as the folder tab
 * strip rides its come-forward (fluid-tabs TabsList.svelte `progressOf`,
 * `scroll`, `step`): a clock paused or seeked (DevTools' Animation domain, a
 * gesture) moves the scroll with it. The clock landing puts the scroll at `to`;
 * the clock cancelled (the motion turned back) leaves the scroll where it
 * stands.
 *
 * With reduced motion nothing travels: the scroll is placed at `to` once the
 * clock lands, where the layout it was measured for stands (DESIGN.md, The
 * Reduced Motion Rule: "heights land at once").
 *
 * Any scroll the reader makes ends the ride where it stands (DESIGN.md, The
 * Interruptible Rule; The Stay In Context Rule: the reader stays where they
 * are), and the motion the ride was riding (a fold, a flight) runs on to its
 * end. The reader's own hands end it as they move, in the event, before the
 * ride's next write: a wheel turned or a key pressed (no key is filtered:
 * the reader at the keys is the reader taking the page), a press on the
 * scroller's own scrollbar (the strip of its box outside its client box),
 * and a finger or a pen pressed on the page and moving (for the first frames
 * of a drag the browser pans nothing, its touch slop, and a ride writing
 * then would move the page under the finger). A wheel, a key or a press on
 * the scrollbar may move no scroll at all (the page at its foot, or clamped
 * there by the shrink in the same frame), so they are never left for a
 * scroll check to find: the ride's next write would land first and its own
 * scroll would read as the ride's (decision-pick: the reader's wheel at the
 * foot, 564, then the ride's write to 371).
 * Every other source is found by its scroll: a `scroll` that finds the
 * scroller more than 1px from where the ride last put it (the subpixel
 * rounding allowed) was someone else's: middle-click autoscroll, find in
 * page, the browser's own scroll into view. The one move
 * that is not the reader's is the page clamping the scroll as what the ride
 * rides shrinks it (the scroller at the most it can scroll, short of the
 * ride's write): that the ride rides through. Heard passively, for as long as
 * the ride lasts.
 */
import { motionOk } from "./curves.svelte";

/** How far `clock` has gone, on its curve, 0 to 1. */
export const progressOf = (clock: Animation): number => {
  const timing = clock.effect?.getComputedTiming();
  if (Number(clock.currentTime ?? 0) >= Number(timing?.endTime ?? 0)) {
    return 1;
  }
  return timing?.progress ?? 0;
};

/** How far a reader's scroll may sit from the ride's write and still be the ride's: subpixel rounding. */
const ROUNDING = 1;

/**
 * Whether the viewport point `x`, `y` stands on `scroller`'s own scrollbars:
 * inside the box its scrollbars are drawn in and outside its client box.
 * The page's own scroller draws them in the viewport, its client box
 * starting past a scrollbar on the left (a right-to-left page's): where the
 * root's margin box stands once its scroll is taken back out. Any other
 * draws them inside its borders, its client box past its start border and a
 * start-side scrollbar (`clientLeft`, `clientTop`); a press on a border is
 * no press on a scrollbar.
 */
function onScrollbar(scroller: Element, x: number, y: number): boolean {
  const doc = scroller.ownerDocument;
  const view = doc.defaultView;
  if (!view) {
    return false;
  }
  const root =
    scroller === doc.scrollingElement || scroller === doc.documentElement;
  const edge = view.getComputedStyle(scroller);
  const px = (value: string) => Number.parseFloat(value) || 0;
  let box: DOMRect;
  let left: number;
  let top: number;
  if (root) {
    box = new DOMRect(0, 0, view.innerWidth, view.innerHeight);
    const strip = view.innerWidth - scroller.clientWidth;
    const start =
      scroller.getBoundingClientRect().left +
      view.scrollX -
      px(edge.marginLeft);
    left = Math.min(Math.max(start, 0), strip);
    top = 0;
  } else {
    const border = scroller.getBoundingClientRect();
    box = new DOMRect(
      border.left + px(edge.borderLeftWidth),
      border.top + px(edge.borderTopWidth),
      border.width - px(edge.borderLeftWidth) - px(edge.borderRightWidth),
      border.height - px(edge.borderTopWidth) - px(edge.borderBottomWidth)
    );
    left = border.left + scroller.clientLeft;
    top = border.top + scroller.clientTop;
  }
  const inBox =
    x >= box.left && x < box.right && y >= box.top && y < box.bottom;
  const inClient =
    x >= left &&
    x < left + scroller.clientWidth &&
    y >= top &&
    y < top + scroller.clientHeight;
  return inBox && !inClient;
}

/** Rides `scroller`'s block scroll to `to` on `clock`. Answers a stop. */
export function scrollOnClock(
  clock: Animation,
  scroller: Element,
  to: number
): () => void {
  const from = scroller.scrollTop;
  let frame = 0;
  let riding = true;
  /** Where the ride last put the scroll. */
  let put = from;
  // The page's own scroller is heard on its window; any other on itself.
  const doc = scroller.ownerDocument;
  const hears: EventTarget =
    scroller === doc.scrollingElement || scroller === doc.documentElement
      ? (doc.defaultView ?? scroller)
      : scroller;
  const listen = { capture: true, passive: true } as const;
  /** The ride ends where it stands, and stops listening. */
  function stop() {
    riding = false;
    cancelAnimationFrame(frame);
    hears.removeEventListener("scroll", scrolled, listen);
    hears.removeEventListener("pointermove", pressedMove, listen);
    hears.removeEventListener("pointerdown", pressedBar, listen);
    hears.removeEventListener("wheel", stop, listen);
    hears.removeEventListener("keydown", stop, listen);
  }
  /** A scroll the ride did not make, short of the shrink's clamp: the reader's, from here. */
  function scrolled() {
    const now = scroller.scrollTop;
    if (Math.abs(now - put) <= ROUNDING) {
      return;
    }
    const most = scroller.scrollHeight - scroller.clientHeight;
    const clamped = now < put && Math.abs(now - most) <= ROUNDING;
    if (!clamped) {
      stop();
    }
  }
  /** A finger or a pen pressed on the page and moving: the reader's drag, before it pans. */
  function pressedMove(event: Event) {
    const pointer = event as PointerEvent;
    if (pointer.pointerType !== "mouse" && pointer.buttons !== 0) {
      stop();
    }
  }
  /** A press on the scroller's own scrollbar: the reader's thumb or track, before it scrolls. */
  function pressedBar(event: Event) {
    const pointer = event as PointerEvent;
    if (onScrollbar(scroller, pointer.clientX, pointer.clientY)) {
      stop();
    }
  }
  hears.addEventListener("scroll", scrolled, listen);
  hears.addEventListener("pointermove", pressedMove, listen);
  hears.addEventListener("pointerdown", pressedBar, listen);
  hears.addEventListener("wheel", stop, listen);
  hears.addEventListener("keydown", stop, listen);
  clock.finished.then(() => {
    if (riding) {
      stop();
      scroller.scrollTop = to;
    }
  }, stop);
  if (!motionOk.current || from === to) {
    return stop;
  }
  const step = () => {
    if (!riding) {
      return;
    }
    put = from + (to - from) * progressOf(clock);
    scroller.scrollTop = put;
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return stop;
}
