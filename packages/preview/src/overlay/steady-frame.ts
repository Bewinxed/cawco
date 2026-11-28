/**
 * The next frame the window's size holds in. A window resized by a drag
 * (the panel's split moved over the design graph's stage) resizes on every
 * step of it, and what the overlay reads after a resize (where each mark's
 * anchor finds its element, the change rings' stops, the layers sized to
 * the page's scroll, the page's foot bar) lays the whole page out, for
 * marks the browser was moving by their anchors already. Read once the
 * size holds, it is read once per drag, on the layout the drag left.
 *
 * A split's drag is said by the host (`cawco:resizing`, {@link setResizing}):
 * what waits runs in the frame after it ends, and never while it lasts. The
 * dashboard lays a drag's widths out 40 to 240 ms apart, so a frame or two
 * with no resize stood between its steps, and each ran what waited
 * mid-drag. A resize the host says nothing of (the browser's own window
 * dragged) holds what waits until {@link SETTLE_MS} pass with no resize.
 *
 * Outside a resize it is the next frame, as `requestAnimationFrame` is.
 */

/**
 * How long the window's size holds before a resize the host said nothing of
 * is over, ms.
 */
// @limit measured: the gaps between a split drag's widths in the frame, 40 to 240 ms (cawco:session/ff6be1dd-64d2-46f3-8c61-802e2e51ce50); past most of them, under a pause a person sees
const SETTLE_MS = 150;

/** The host says a split's drag is moving the window's size. */
let holding = false;
/** The host just said the drag ended: what waits runs in the next frame, a resize that drag laid out landing in it included. */
let ending = false;
/** The timer that ends a resize the host said nothing of; 0 while none runs. */
let settling = 0;
/** The frame asked for that runs what waits; 0 while none is. */
let asked = 0;
/** What waits for a frame the size holds in, each once however often asked. */
const due = new Set<() => void>();

/** What waits runs, in the frame asked for. */
const flush = () => {
  asked = 0;
  ending = false;
  const now = [...due];
  due.clear();
  for (const run of now) {
    run();
  }
};

/** The next frame asked for, unless the size is moving or something waits for none. */
const ask = () => {
  if (holding || settling || asked || due.size === 0) {
    return;
  }
  asked = requestAnimationFrame(flush);
};

/** The frame asked for given back: the size moved again before it came. */
const giveBack = () => {
  cancelAnimationFrame(asked);
  asked = 0;
};

addEventListener(
  "resize",
  () => {
    if (holding || ending) {
      return;
    }
    giveBack();
    clearTimeout(settling);
    settling = window.setTimeout(() => {
      settling = 0;
      ask();
    }, SETTLE_MS);
  },
  { passive: true }
);

/** The host's split drag began (`active`) or ended: while it lasts nothing waiting runs; ended, it runs in the next frame, with no wait for {@link SETTLE_MS}. */
export function setResizing(active: boolean): void {
  if (active === holding) {
    return;
  }
  holding = active;
  clearTimeout(settling);
  settling = 0;
  giveBack();
  ending = !active;
  if (ending) {
    // Asked whatever waits: the frame is what ends `ending`.
    asked = requestAnimationFrame(flush);
  }
}

/** `run` in the next frame the window's size holds in: the next frame, unless the window is resizing. */
export function steadyFrame(run: () => void): void {
  due.add(run);
  ask();
}
