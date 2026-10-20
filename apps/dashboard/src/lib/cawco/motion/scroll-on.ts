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
 * The reader's own scroll ends the ride where it stands (DESIGN.md, The
 * Interruptible Rule; The Stay In Context Rule: the reader stays where they
 * are): a wheel, a finger or pen dragging (a touch moving, or a pressed touch
 * or pen pointer moving), or a scroll key (the arrows, Page Up and
 * Down, Home, End, Space) pressed anywhere but a field or a control that takes
 * that key. The motion the ride was riding (a fold, a flight) runs on to its
 * end; only the scroll is the reader's from then on. Heard passively, for as
 * long as the ride lasts.
 */
import { motionOk } from "./curves.svelte";

/** The keys that scroll a page when nothing in it takes them. */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

/** What takes a key itself: typing anywhere, Space on a control it presses, the arrows inside a widget that moves by them. */
const FIELDS =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
const PRESSED_BY_SPACE =
  "button, summary, [role='button'], [role='checkbox'], [role='switch'], [role='radio'], [role='option'], [role='menuitem'], [role='tab']";
const MOVED_BY_ARROWS =
  "[role='slider'], [role='spinbutton'], [role='radiogroup'], [role='listbox'], [role='menu'], [role='menubar'], [role='tablist'], [role='tree'], [role='grid']";

/** Whether `event` scrolls the page: a scroll key that nothing under it takes. */
const scrollsByKey = (event: KeyboardEvent): boolean => {
  if (!SCROLL_KEYS.has(event.key)) {
    return false;
  }
  const at = event.target instanceof Element ? event.target : null;
  if (!at) {
    return true;
  }
  if (at.closest(FIELDS)) {
    return false;
  }
  if (event.key === " " && at.closest(PRESSED_BY_SPACE)) {
    return false;
  }
  return !(event.key.startsWith("Arrow") && at.closest(MOVED_BY_ARROWS));
};

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
  // The page's own scroller hears the reader on its window; any other on itself.
  const doc = scroller.ownerDocument;
  const hears: EventTarget =
    scroller === doc.scrollingElement || scroller === doc.documentElement
      ? (doc.defaultView ?? scroller)
      : scroller;
  const listen = { capture: true, passive: true } as const;
  // A finger's drag shows first as a pressed touch pointer moving (before
  // the browser takes it to pan, which may send no touchmove at all), so a
  // touch or pen pointermove while pressed is the reader's scroll too.
  const READER = ["wheel", "touchmove", "pointermove", "keydown"] as const;
  /** The ride ends where it stands, and stops listening. */
  function stop() {
    riding = false;
    cancelAnimationFrame(frame);
    for (const type of READER) {
      hears.removeEventListener(type, readerScrolls, listen);
    }
  }
  /** The reader scrolls: the scroll is theirs from here. */
  function readerScrolls(event: Event) {
    if (event instanceof KeyboardEvent && !scrollsByKey(event)) {
      return;
    }
    if (
      event instanceof PointerEvent &&
      (event.pointerType === "mouse" || event.buttons === 0)
    ) {
      return;
    }
    stop();
  }
  for (const type of READER) {
    hears.addEventListener(type, readerScrolls, listen);
  }
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
