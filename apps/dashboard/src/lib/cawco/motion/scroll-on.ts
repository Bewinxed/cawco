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
 * end. One rule finds it: a `scroll` that finds the scroller more than 1px
 * from where the ride last put it (the subpixel rounding allowed) was someone
 * else's. That is every source alike: a wheel, a finger's pan, the keys, the
 * scrollbar, middle-click autoscroll, find in page, the browser's own scroll
 * into view. Each comes to the next frame's scroll steps, before the ride's
 * next write, so the ride never writes over it. The one move that is not the
 * reader's is the page clamping the scroll as what the ride rides shrinks it
 * (the scroller at the most it can scroll, short of the ride's write): that
 * the ride rides through, unless the reader turned the wheel or pressed a
 * key since the last check. A reader sent to the page's foot on the frame the
 * shrink clamps there reads as that clamp, and the ride's next write would
 * pull them back up (from the foot at 810 to 511, a card near the foot, in
 * decision-pick). No key is filtered: it
 * counts only at the clamp, where the page stands at its foot anyway, and
 * ending the ride there leaves the reader where they are while the fold
 * still lands. And a finger pressed on the page and moving ends
 * the ride as it starts to move: for the first frames of a drag the browser
 * pans nothing (its touch slop), and a ride writing then would move the page
 * under the finger. Heard passively, for as long as the ride lasts.
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
  /** The reader turned the wheel or pressed a key since the last scroll check. */
  let acted = false;
  /** The ride ends where it stands, and stops listening. */
  function stop() {
    riding = false;
    cancelAnimationFrame(frame);
    hears.removeEventListener("scroll", scrolled, listen);
    hears.removeEventListener("pointermove", pressedMove, listen);
    hears.removeEventListener("wheel", readerActs, listen);
    hears.removeEventListener("keydown", readerActs, listen);
  }
  /** A scroll the ride did not make: the reader's, from here. */
  function scrolled() {
    const now = scroller.scrollTop;
    const byReader = acted;
    acted = false;
    if (Math.abs(now - put) <= ROUNDING) {
      return;
    }
    const most = scroller.scrollHeight - scroller.clientHeight;
    const clamped = now < put && Math.abs(now - most) <= ROUNDING;
    if (!clamped || byReader) {
      stop();
    }
  }
  /** The wheel or a key: read at the next scroll check, where only the clamp asks. */
  function readerActs() {
    acted = true;
  }
  /** A finger or a pen pressed on the page and moving: the reader's drag, before it pans. */
  function pressedMove(event: Event) {
    const pointer = event as PointerEvent;
    if (pointer.pointerType !== "mouse" && pointer.buttons !== 0) {
      stop();
    }
  }
  hears.addEventListener("scroll", scrolled, listen);
  hears.addEventListener("pointermove", pressedMove, listen);
  hears.addEventListener("wheel", readerActs, listen);
  hears.addEventListener("keydown", readerActs, listen);
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
