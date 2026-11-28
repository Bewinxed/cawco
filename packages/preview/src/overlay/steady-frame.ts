/**
 * The next frame the window's size holds in. A window resized by a drag
 * (the panel's split moved over the design graph's stage) resizes on every
 * frame of it, and what the overlay reads after a resize (where each mark's
 * anchor finds its element, the layers sized to the page's scroll, the
 * page's foot bar) laid the whole page out ahead of the frame's own layout,
 * for marks the browser was moving by their anchors already. Read once the
 * size has held for a frame, it is read once per drag, on the layout the
 * drag left.
 *
 * Outside a resize it is the next frame, as `requestAnimationFrame` is.
 */

/** A resize came since the last frame looked. */
let resizedSince = false;
/** The frame asked for that looks; 0 while none is. */
let asked = 0;
/** What waits for a frame the size holds in, each once however often asked. */
const due = new Set<() => void>();

/** A frame looks: a resize came since the last one, so it waits a frame more; else what waits runs. */
const look = () => {
  if (resizedSince) {
    resizedSince = false;
    asked = requestAnimationFrame(look);
    return;
  }
  asked = 0;
  const now = [...due];
  due.clear();
  for (const run of now) {
    run();
  }
};

addEventListener(
  "resize",
  () => {
    resizedSince = true;
    if (!asked) {
      asked = requestAnimationFrame(look);
    }
  },
  { passive: true }
);

/** `run` in the next frame the window's size holds in: the next frame, unless the window is resizing. */
export function steadyFrame(run: () => void): void {
  due.add(run);
  if (!asked) {
    asked = requestAnimationFrame(look);
  }
}
