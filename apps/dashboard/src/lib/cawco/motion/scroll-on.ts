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

/** Rides `scroller`'s block scroll to `to` on `clock`. Answers a stop. */
export function scrollOnClock(
  clock: Animation,
  scroller: Element,
  to: number
): () => void {
  const from = scroller.scrollTop;
  let frame = 0;
  let riding = true;
  const stop = () => {
    riding = false;
    cancelAnimationFrame(frame);
  };
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
    scroller.scrollTop = from + (to - from) * progressOf(clock);
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return stop;
}
