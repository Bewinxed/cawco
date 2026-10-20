/**
 * A drawing that shows its whole plan (a decision page's drawing, where a
 * reader judges a frame and never scrolls it): its frame (`host`, `base` px
 * tall as the split or the sheet gives it) grows or shrinks by the
 * difference between where the scroller's content ends (its last box's
 * foot and the scroller's own bottom padding) and the scroller's height, so
 * every row stands in it and its foot closes on its last row: no row cut,
 * none left out, no paper under the last one. A frame cut short at a line
 * read as the whole plan with its last to-dos missing.
 *
 * The content's end is read, not `scrollHeight`: that is never less than
 * the scroller's own height, so a plan shorter than the frame stood over a
 * band of empty paper.
 *
 * Read again when what the scroller holds changes size or the fonts arrive,
 * each time from the frame's own height, never on a clock.
 */
import type { Attachment } from "svelte/attachments";
import { frameObserver } from "#lib/cawco/frame-observer.js";
import { drawnBox } from "#lib/cawco/motion/drawn.js";

/** How far past the scroller's height its content ends, in its own pixels: less than nothing where it ends short. */
function pastOf(node: HTMLElement): number {
  const last = node.lastElementChild;
  if (!last) {
    return 0;
  }
  const top = drawnBox(node).top + node.clientTop;
  const end =
    drawnBox(last).bottom -
    top +
    node.scrollTop +
    Number.parseFloat(getComputedStyle(node).paddingBottom);
  return end - node.clientHeight;
}

export function standWhole(
  host: () => HTMLElement | undefined,
  base: number
): Attachment<HTMLElement> {
  return (node) => {
    const fit = () => {
      const frameBox = host();
      if (!frameBox) {
        return;
      }
      frameBox.style.blockSize = `${base}px`;
      frameBox.style.blockSize = `${base + pastOf(node)}px`;
    };
    const sizes = frameObserver(fit);
    for (const held of node.children) {
      sizes.observe(held);
    }
    document.fonts.ready.then(sizes.request, sizes.request);
    sizes.request();
    return () => sizes.disconnect();
  };
}
