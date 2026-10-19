/**
 * A frame's scroller held on one row (the step a story opens), its top
 * just below the scroller's top edge fade (app.css `--fade-len`), so the
 * row's words stand in full ink, while what is in it lays out: the fold
 * opening, the sheet rising. The person's own scroll or press lets it go.
 */
import type { Attachment } from "svelte/attachments";

/** How long the hold follows the layout before it lets go. Our call: the fold's and the sheet's runs end well inside it. */
const HOLD_MS = 1500;
/** Past the fade's end: the row's top stands this far clear of it. */
const CLEAR = 4;

export function holdOn(id: string | undefined): Attachment<HTMLElement> {
  return (node) => {
    if (!id) {
      return;
    }
    const until = performance.now() + HOLD_MS;
    const fade =
      Number.parseFloat(
        getComputedStyle(node).getPropertyValue("--fade-len")
      ) || 0;
    let frame = 0;
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
      frame = performance.now() < until ? requestAnimationFrame(hold) : 0;
    };
    frame = requestAnimationFrame(hold);
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    node.addEventListener("wheel", stop, { once: true, passive: true });
    node.addEventListener("pointerdown", stop, { once: true });
    return () => {
      stop();
      node.removeEventListener("wheel", stop);
      node.removeEventListener("pointerdown", stop);
    };
  };
}
