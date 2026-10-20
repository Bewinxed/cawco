/**
 * A ResizeObserver whose answer comes in the next frame's callbacks
 * (`requestAnimationFrame`): once, however many deliveries came before it,
 * with every target that changed since. The dashboard's one way to hear a
 * size change (lint: `new ResizeObserver` stands nowhere else unexempted).
 *
 * What an observer writes from its answer (state a template lays out, a
 * style) changes the layout. Written inside the delivery, it resized boxes
 * at a depth the delivery had already passed, and Chromium held their
 * notifications back and reported "ResizeObserver loop completed with
 * undelivered notifications" (the hub's dashboard errors). Written in the
 * next frame's callbacks, it lands before that frame's layout, and that
 * layout reports what it changed, once.
 *
 * A box's size as it mounts is read by its own code, synchronously, so the
 * first frame painted is laid out from it: only the changes after that wait
 * for the frame.
 *
 * `read`, when given, runs inside the delivery itself and only reads: the
 * layout there is the one the frame has just done, so a measure taken
 * there costs no layout of its own (fluid-tabs `rects`: measured in the next
 * frame instead, a streamed reply laid the page out again for each). What
 * it measured is written by `answer`, in the next frame.
 *
 * `request()` asks for the answer in the next frame with nothing resized:
 * the other things a site hears (a scroll, rows arriving, the window) share
 * its one frame.
 */
export interface FrameObserver {
  disconnect: () => void;
  observe: (target: Element, options?: ResizeObserverOptions) => void;
  /** The answer in the next frame, with nothing resized (`changed` empty unless something also was). */
  request: () => void;
  unobserve: (target: Element) => void;
}

export function frameObserver(
  answer: (changed: Element[]) => void,
  options: {
    /** Inside the delivery, reading only: what `answer` writes in the next frame. */
    read?: (entries: readonly ResizeObserverEntry[]) => void;
  } = {}
): FrameObserver {
  let frame = 0;
  const changed = new Set<Element>();
  const request = () => {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const targets = [...changed];
        changed.clear();
        answer(targets);
      });
    }
  };
  // biome-ignore lint/style/noRestrictedGlobals: the one ResizeObserver the rule allows, deferring every answer to the next frame
  const observer = new ResizeObserver((entries) => {
    options.read?.(entries);
    for (const entry of entries) {
      changed.add(entry.target);
    }
    request();
  });
  return {
    observe: (target, how) => observer.observe(target, how),
    request,
    unobserve: (target) => {
      observer.unobserve(target);
      changed.delete(target);
    },
    disconnect: () => {
      cancelAnimationFrame(frame);
      frame = 0;
      changed.clear();
      observer.disconnect();
    },
  };
}
