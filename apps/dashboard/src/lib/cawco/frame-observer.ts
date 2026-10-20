/**
 * A ResizeObserver whose answer comes in the next frame's callbacks
 * (`requestAnimationFrame`): once, however many deliveries came before it,
 * with every target that changed since.
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
 */
export interface FrameObserver {
  disconnect: () => void;
  observe: (target: Element) => void;
  unobserve: (target: Element) => void;
}

export function frameObserver(
  answer: (changed: Element[]) => void
): FrameObserver {
  let frame = 0;
  const changed = new Set<Element>();
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      changed.add(entry.target);
    }
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const targets = [...changed];
        changed.clear();
        answer(targets);
      });
    }
  });
  return {
    observe: (target) => observer.observe(target),
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
