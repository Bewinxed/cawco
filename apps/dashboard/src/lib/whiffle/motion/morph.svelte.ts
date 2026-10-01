/**
 * A container whose content changes size tweens to the new size instead of
 * jumping: when the content inside it reflows (a popover's list arrives, an
 * error line appears, a card switches what it shows), the container is held
 * at the size it is drawn at and animated to its new natural size on the
 * Web Animations API, over --dur-morph on --ease-drawer. Attach to the container:
 * `{@attach morph()}`.
 *
 * What is observed is the content (the container's children), never the
 * container: the tween resizes the container, and an observer watching the
 * box it resizes would report its own animation back to itself. For the
 * tween's length the children hold their natural size (no flex shrink), so
 * the container clips them instead of squashing a scrolling list inside it.
 */
import { CURVE, dur, motionOk } from "./curves.svelte";

export function morph({
  width = false,
  ms,
}: {
  width?: boolean;
  ms?: number;
} = {}) {
  return (node: HTMLElement) => {
    /**
     * The size the container last settled at: unknown until the observer's
     * first delivery, which comes after the frame's layout. Read when it was
     * attached, it laid the page out in the middle of whatever task mounted
     * it — every diff a scrolling transcript mounted paid a forced layout.
     */
    let natural: { w: number; h: number } | null = null;
    let running: Animation | undefined;

    const tween = (settled: { w: number; h: number }) => {
      // The size to start from: where a tween in flight has the box right
      // now, else the size it last settled at (layout already holds the new
      // one by the time an observer hears of the change).
      const drawn = running ? node.getBoundingClientRect() : null;
      const from = drawn ? { w: drawn.width, h: drawn.height } : settled;
      running?.cancel();
      running = undefined;
      const next = { w: node.offsetWidth, h: node.offsetHeight };
      const moved =
        Math.abs(next.h - from.h) > 0.5 ||
        (width && Math.abs(next.w - from.w) > 0.5);
      natural = next;
      if (!(moved && motionOk.current) || from.h === 0 || next.h === 0) {
        return;
      }
      const frames: Keyframe[] = [
        { height: `${from.h}px`, overflow: "hidden" },
        { height: `${next.h}px`, overflow: "hidden" },
      ];
      if (width) {
        frames[0].width = `${from.w}px`;
        frames[1].width = `${next.w}px`;
      }
      const held = [...node.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement
      );
      for (const child of held) {
        child.style.flexShrink = "0";
      }
      const animation = node.animate(frames, {
        duration: ms ?? dur("--dur-morph"),
        easing: CURVE.drawer,
      });
      running = animation;
      const done = () => {
        for (const child of held) {
          child.style.flexShrink = "";
        }
        if (running === animation) {
          running = undefined;
        }
      };
      animation.finished.then(done, done);
    };

    const sizes = new ResizeObserver(() => {
      if (natural === null) {
        natural = { w: node.offsetWidth, h: node.offsetHeight };
      } else {
        tween(natural);
      }
    });
    const watchChildren = () => {
      sizes.disconnect();
      for (const child of node.children) {
        sizes.observe(child);
      }
    };
    watchChildren();
    // Content added or removed: a new child to watch, and a new size.
    const children = new MutationObserver(() => {
      watchChildren();
      // Before the first delivery there is no size to tween from: the
      // observer's first delivery takes it.
      if (natural !== null) {
        tween(natural);
      }
    });
    children.observe(node, { childList: true });
    return () => {
      running?.cancel();
      sizes.disconnect();
      children.disconnect();
    };
  };
}
