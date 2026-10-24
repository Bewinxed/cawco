import { frameObserver } from "#lib/cawco/frame-observer.js";

/**
 * Whether an element is rendered at all, and the moment that changes.
 *
 * Content an ancestor skips (`content-visibility: hidden`: the home board
 * put away under a conversation) has no layout to read, and reading one
 * lays it out. `checkVisibility()` says so: it is false when "the element is
 * not being rendered because the element or an ancestor element sets the
 * content-visibility property to hidden"
 * (https://developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility).
 * The platform's event for skipped content, `contentvisibilityautostatechange`,
 * fires only for `content-visibility: auto`, and a skipped subtree fires no
 * ResizeObserver; an IntersectionObserver reports it as not intersecting and
 * reports it again the frame it is rendered (measured in WebKit and
 * Chromium). Not intersecting, the element counts as skipped only when
 * `checkVisibility()` agrees: one merely scrolled out of view is still laid
 * out.
 *
 * The element is taken as rendered until an observer says otherwise, and
 * nothing is read as it mounts: `checkVisibility()` there styled and laid out
 * the page between the writes of the flush that mounted it (a turn's Working
 * tab arriving in the rail, its list read so five times in one frame). Its
 * first answer comes from the observers. A ResizeObserver reports a box a
 * frame has laid out at a size (`first`), inside that frame; the
 * IntersectionObserver's first entry comes in a task after it painted. Not
 * intersecting, that first entry is rendered when the frame laid the box out
 * (it was reported) and skipped when it did not: a box an ancestor skips, or
 * one with no box at all, is laid out at no size and reported by no
 * ResizeObserver, and `checkVisibility()` is false for both. A later report
 * says it is rendered at a size, or not at all (none: `display: none`). Only a later edge, not intersecting,
 * asks `checkVisibility()`: rendered and scrolled out of view, or skipped
 * since, which no ResizeObserver tells apart.
 *
 * `change` hears each edge: the first only when it is not rendered.
 */
export function watchRendered(
  node: Element,
  change: (rendered: boolean) => void
): { stop: () => void } {
  let rendered = true;
  /** A frame has laid it out at a size since it was observed (a ResizeObserver report). */
  let laidOut = false;
  let first = true;
  const turn = (now: boolean) => {
    if (now !== rendered) {
      rendered = now;
      change(now);
    }
  };
  /** Whether its last report was of a box at a size (none: `display: none`, or nothing in it). */
  let sizedNow = false;
  const sized = frameObserver(() => turn(sizedNow), {
    read: (entries) => {
      for (const entry of entries) {
        const [box] = entry.borderBoxSize;
        sizedNow = !!box && (box.inlineSize > 0 || box.blockSize > 0);
      }
    },
    first: () => {
      laidOut = sizedNow;
      return () => {
        if (laidOut) {
          turn(true);
        }
      };
    },
  });
  sized.observe(node);
  const shown = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      first = false;
      turn(true);
      return;
    }
    if (first) {
      first = false;
      turn(laidOut);
      return;
    }
    turn(node.checkVisibility());
  });
  shown.observe(node);
  return {
    stop: () => {
      shown.disconnect();
      sized.disconnect();
    },
  };
}
