/**
 * A drawing that shows its whole plan (a decision page's drawing, where a
 * reader judges a frame and never scrolls it): its frame (`host`, `base` px
 * tall as the split or the sheet gives it) grows or shrinks by what its
 * scroller holds past it, so every row stands in it and its foot closes
 * where the plan ends: no row cut, none left out, no blank paper under the
 * last one. A frame cut short at a line still read as the whole plan with
 * its last to-dos missing.
 *
 * Read again when what the scroller holds changes size or the fonts arrive,
 * each time from the frame's own height, never on a clock.
 */
import type { Attachment } from "svelte/attachments";
import { frameObserver } from "#lib/cawco/frame-observer.js";

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
      const past = node.scrollHeight - node.clientHeight;
      frameBox.style.blockSize = `${base + past}px`;
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
