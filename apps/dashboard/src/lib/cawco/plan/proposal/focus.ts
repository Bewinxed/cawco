/**
 * A frame's scroller held on one row (the step a story opens), its top a
 * little under the scroller's, while what is in it lays out: the fold
 * opening, the sheet rising. The person's own scroll or press lets it go.
 */
import type { Attachment } from "svelte/attachments";

/** How long the hold follows the layout before it lets go. Our call: the fold's and the sheet's runs end well inside it. */
const HOLD_MS = 1500;

export function holdOn(id: string | undefined): Attachment<HTMLElement> {
  return (node) => {
    if (!id) {
      return;
    }
    const until = performance.now() + HOLD_MS;
    let frame = 0;
    const hold = () => {
      const row = node.querySelector<HTMLElement>(
        `[data-row="${CSS.escape(id)}"]`
      );
      if (row) {
        node.scrollTop +=
          row.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          8;
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
