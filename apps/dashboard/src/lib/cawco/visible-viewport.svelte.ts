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
 * itself is never scrolled here: the browser pans it, and a page that moved
 * it as well had the two chase each other.
 */
import { flushSync } from "svelte";

/**
 * The visible area, in CSS pixels from the layout viewport's top; a height
 * of 0 until it is measured.
 */
export const visible = $state({ top: 0, height: 0 });

/** Room kept between a revealed field and the visible area's edges. */
const MARGIN = 12;
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

  /** Scrolls the focused field into [from, to] inside the boxes that scroll it. */
  const reveal = (from: number, to: number) => {
    const field = document.activeElement;
    if (!isField(field)) {
      return;
    }
    for (const box of scrollers(field)) {
      const area = box.getBoundingClientRect();
      const upper = Math.max(area.top, from) + MARGIN;
      const lower = Math.min(area.bottom, to) - MARGIN;
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

  measure();
  viewport.addEventListener("resize", request);
  viewport.addEventListener("scroll", request);
  window.addEventListener("resize", request);
  document.addEventListener("focusin", follow);
  document.addEventListener("focusout", follow);
  return () => {
    cancelAnimationFrame(frame);
    resized.disconnect();
    viewport.removeEventListener("resize", request);
    viewport.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
    document.removeEventListener("focusin", follow);
    document.removeEventListener("focusout", follow);
  };
}
