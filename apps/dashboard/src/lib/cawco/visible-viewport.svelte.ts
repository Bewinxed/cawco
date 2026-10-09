/**
 * The part of the page the reader can see, and the field they are typing in
 * kept inside it. A software keyboard takes the bottom of the screen, and
 * the browsers a phone runs disagree about what that does to the page:
 * Safari shrinks only the visual viewport and pans it to the focused field;
 * Brave and Firefox for iOS shrink the layout viewport too
 * (brave/brave-browser#54999), while WebKit still reports a pan in
 * `visualViewport.offsetTop` that no longer fits inside it (WebKit bug
 * 311821). Each of their events moved a sheet and scrolled a field on its
 * own, so one keyboard opening moved the layout three or four times, and a
 * page whose scroller only became scrollable after the layout viewport
 * shrank left the field under the keyboard.
 *
 * So the page is measured in one place, once per frame. Every event that can
 * move the visible area (the visual viewport's resize and scroll, the
 * window's resize, focus arriving in a field, a scroller around the focused
 * field changing size) asks for the next frame; that frame reads the layout
 * viewport and the visual viewport together, keeps the visual viewport's top
 * inside the layout viewport, and publishes `visible`: where the visible
 * area starts and how tall it is. An open bottom sheet carries the two on
 * itself (ui/drawer/drawer-content), and app.css rests it on the keyboard
 * from them. On the root, every change restyled the whole page: 18ms a write
 * on a small page, 7ms on the sheet.
 *
 * Then, once the sheet is laid out at that size, the focused field is
 * scrolled into the visible area inside the boxes that scroll it. The window
 * itself is never scrolled here.
 *
 * Nor does WebKit scroll it. Focus that a tap gives a field lets WebKit pan
 * the window to it as the keyboard comes up, and in Brave that pan landed on
 * a layout the keyboard had already shrunk: the page jumped 290px and
 * snapped back a frame later. So a tap on a field focuses it first, with
 * `preventScroll`, which WebKit honours for the keyboard's reveal as well;
 * the tap itself goes on untouched, so iOS still places the caret, the loupe
 * and Paste where the finger was. Only a tap: a touch that moved or
 * scrolled focuses nothing, as iOS does. (WebKit still pans now and then
 * for a field the keyboard comes up over, and always for the first keyboard
 * a freshly launched browser raises: the scroll happens in its UI process,
 * and a script scrolling the window back the same frame changed nothing on
 * screen. WebKit bug 311821.)
 */
import { flushSync } from "svelte";

/**
 * The visible area, in CSS pixels from the layout viewport's top; a height
 * of 0 until it is measured.
 */
export const visible = $state({ top: 0, height: 0 });

/** Room kept between a revealed field and the visible area's edges. */
const MARGIN = 12;
/** How far a touch may travel and still be a tap, in CSS pixels. */
const TAP_SLOP = 10;
/** What a tap can land in that edits text. */
const EDITABLE = "input, textarea, [contenteditable]";
/** Inputs that raise no keyboard. */
const KEYLESS =
  /^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/;
const SCROLLS = /(auto|scroll)/;

const isField = (node: Element | null): node is HTMLElement =>
  node instanceof HTMLElement &&
  (node.isContentEditable ||
    node instanceof HTMLTextAreaElement ||
    (node instanceof HTMLInputElement && !KEYLESS.test(node.type)));

/** The boxes that scroll `node`, innermost first, the document's own left out. */
function scrollers(node: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (
    let parent = node.parentElement;
    parent && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    if (SCROLLS.test(getComputedStyle(parent).overflowY)) {
      found.push(parent);
    }
  }
  return found;
}

/**
 * Attachment for a footer stuck to the bottom of its scroller (`position:
 * sticky; bottom: 0`: a step's Back and Continue, an editor's Save): it
 * stays above a keyboard and keeps the field being typed in clear of itself.
 * Safari leaves the scroller's bottom under the keyboard, so the footer's
 * sticky offset becomes as much of the scroller as the keyboard covers;
 * Brave shrinks the layout, and there the offset stays 0. Only the scroller
 * is measured: the footer's own box, read the frame the layout changed,
 * still stood where it was stuck before, and a lift taken from it threw the
 * footer to the top.
 *
 * The fields scroll in `covers` (by default the footer's own scroller, which
 * it stands in), and that box's scroll-padding-bottom is how much of it the
 * footer stands over, so the browser's own focus scrolling, and `reveal`
 * here, stop above the footer. A footer below its fields' box (an editor's
 * commit row) stands over none of it until a keyboard lifts it.
 */
export function aboveKeyboard(covers?: () => HTMLElement | null | undefined) {
  return (node: HTMLElement): (() => void) => {
    const [box] = scrollers(node);
    // Where its CSS does not stick it (a wide screen), it is in the flow.
    if (
      !box ||
      visible.height === 0 ||
      getComputedStyle(node).position !== "sticky"
    ) {
      return () => undefined;
    }
    const fields = covers?.() ?? box;
    const inside = fields.contains(node);
    const bottom = visible.top + visible.height;
    const place = () => {
      const area = box.getBoundingClientRect();
      // Brave shrinks the layout viewport before the boxes in it are laid
      // out again: a scroller still reaching past it has not taken the
      // keyboard yet, and a lift taken from it threw the footer to the top.
      // The observer below places it once it has its new size.
      if (area.bottom > document.documentElement.clientHeight + 1) {
        return;
      }
      const lift = Math.max(0, Math.round(area.bottom - bottom));
      node.style.bottom = lift > 0 ? `${lift}px` : "";
      const over = standsOver(lift);
      fields.style.scrollPaddingBottom = over > 0 ? `${over}px` : "";
    };
    /** How much of the fields' box the footer stands over at this lift. */
    const standsOver = (lift: number): number => {
      if (inside) {
        return node.offsetHeight + lift;
      }
      if (lift === 0) {
        return 0;
      }
      // Lifted, its top is the visible area's bottom less its height.
      return Math.max(
        0,
        Math.round(
          fields.getBoundingClientRect().bottom - (bottom - node.offsetHeight)
        )
      );
    };
    // Placed a frame later, and again whenever the scroller takes a new size.
    // Safari's layout never moves, and there the lift comes a frame into the
    // keyboard's rise.
    const resized = new ResizeObserver(place);
    resized.observe(box);
    const frame = requestAnimationFrame(place);
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      node.style.bottom = "";
      fields.style.scrollPaddingBottom = "";
    };
  };
}

/** Keeps `visible` current and the focused field in it. Returns the cleanup. */
export function trackVisibleViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return () => undefined;
  }
  const root = document.documentElement;
  let frame = 0;
  /** The focused field's scrollers, watched while it has focus. */
  const resized = new ResizeObserver(() => request());
  let watched: HTMLElement | null = null;

  const measure = () => {
    frame = 0;
    const layout = root.clientHeight;
    const height = Math.min(viewport.height, layout);
    const top = Math.min(Math.max(viewport.offsetTop, 0), layout - height);
    if (top !== visible.top || height !== visible.height) {
      // The sheet takes its new place now, so the field is revealed in it.
      flushSync(() => {
        visible.top = top;
        visible.height = height;
      });
    }
    // A field's box is measured from where the window has scrolled to; iOS
    // counts its pan to a field as that scroll, so the visible area starts
    // at the visual viewport's page offset less the window's.
    const from = Math.min(
      Math.max(viewport.pageTop - window.scrollY, 0),
      layout - height
    );
    reveal(from, from + height);
  };

  /**
   * Scrolls the focused field into [from, to] inside the boxes that scroll
   * it, clear of each box's scroll-padding (a sticky footer's room).
   */
  const reveal = (from: number, to: number) => {
    const field = document.activeElement;
    if (!isField(field)) {
      return;
    }
    for (const box of scrollers(field)) {
      const area = box.getBoundingClientRect();
      const style = getComputedStyle(box);
      const upper =
        Math.max(
          area.top + (Number.parseFloat(style.scrollPaddingTop) || 0),
          from
        ) + MARGIN;
      const lower =
        Math.min(
          area.bottom - (Number.parseFloat(style.scrollPaddingBottom) || 0),
          to
        ) - MARGIN;
      const place = field.getBoundingClientRect();
      if (place.bottom > lower) {
        // A field taller than the area shows its top.
        box.scrollTop += Math.min(place.bottom - lower, place.top - upper);
      } else if (place.top < upper) {
        box.scrollTop -= upper - place.top;
      }
    }
  };

  const request = () => {
    frame ||= requestAnimationFrame(measure);
  };

  /** Focus moved: watch the new field's scrollers for size changes. */
  const follow = () => {
    const field = document.activeElement;
    const next = isField(field) ? field : null;
    if (next === watched) {
      return;
    }
    resized.disconnect();
    watched = next;
    if (next) {
      for (const box of scrollers(next)) {
        resized.observe(box);
      }
      request();
    }
  };

  /** Where the one finger on the screen came down; null for none or several. */
  let press: { x: number; y: number } | null = null;
  const touchStart = (event: TouchEvent) => {
    const [touch] = event.touches;
    press =
      event.touches.length === 1 && touch
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };
  /** A tap on a field that is not focused yet focuses it without a pan. */
  const touchEnd = (event: TouchEvent) => {
    const [touch] = event.changedTouches;
    const start = press;
    press = null;
    // A touch that travelled was a scroll or a drag, not a tap.
    if (!(start && touch)) {
      return;
    }
    if (
      Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP
    ) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const field =
      target?.closest(EDITABLE) ?? target?.closest("label")?.control ?? null;
    if (isField(field) && field !== document.activeElement) {
      field.focus({ preventScroll: true });
    }
  };

  measure();
  viewport.addEventListener("resize", request);
  viewport.addEventListener("scroll", request);
  window.addEventListener("resize", request);
  document.addEventListener("focusin", follow);
  document.addEventListener("focusout", follow);
  document.addEventListener("touchstart", touchStart, {
    capture: true,
    passive: true,
  });
  document.addEventListener("touchend", touchEnd, {
    capture: true,
    passive: true,
  });
  return () => {
    cancelAnimationFrame(frame);
    resized.disconnect();
    viewport.removeEventListener("resize", request);
    viewport.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
    document.removeEventListener("focusin", follow);
    document.removeEventListener("focusout", follow);
    document.removeEventListener("touchstart", touchStart, { capture: true });
    document.removeEventListener("touchend", touchEnd, { capture: true });
  };
}
