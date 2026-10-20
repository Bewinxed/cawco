/**
 * A frame's scroller held on one row (the step a story opens), its top
 * just below the scroller's top edge fade (app.css `--fade-len`), so the
 * row's words stand in full ink. It stands there from the first frame and
 * again each time what the scroller holds changes size (the fold opening,
 * the fonts arriving), never on a clock, so a frame is where it will stay
 * once its runs end. The person's own scroll, press or key lets it go.
 */
import type { Attachment } from "svelte/attachments";

/** Past the fade's end: the row's top stands this far clear of it. */
const CLEAR = 4;
const LET_GO = ["wheel", "pointerdown", "keydown"] as const;

export function holdOn(id: string | undefined): Attachment<HTMLElement> {
  return (node) => {
    if (!id) {
      return;
    }
    const fade =
      Number.parseFloat(
        getComputedStyle(node).getPropertyValue("--fade-len")
      ) || 0;
    const hold = () => {
      const row = node.querySelector<HTMLElement>(
        `[data-row="${CSS.escape(id)}"]`
      );
      if (row) {
        // In layout pixels: a canvas or a zoomed page draws the box scaled.
        const box = node.getBoundingClientRect();
        const scale = box.height / (node.offsetHeight || box.height || 1);
        node.scrollTop +=
          (row.getBoundingClientRect().top - box.top) / scale - fade - CLEAR;
      }
    };
    const sizes = new ResizeObserver(hold);
    for (const held of node.children) {
      sizes.observe(held);
    }
    const first = requestAnimationFrame(hold);
    const stop = () => {
      sizes.disconnect();
      cancelAnimationFrame(first);
      for (const kind of LET_GO) {
        node.removeEventListener(kind, stop);
      }
    };
    for (const kind of LET_GO) {
      node.addEventListener(kind, stop, { once: true, passive: true });
    }
    return stop;
  };
}
