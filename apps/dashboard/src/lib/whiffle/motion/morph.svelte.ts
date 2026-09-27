/**
 * A container whose content changes size tweens to the new size instead of
 * jumping: when the content inside it reflows (a popover's list arrives, an
 * error line appears, a card switches what it shows), the container is held
 * at the size it is drawn at and animated to its new natural size on the
 * Web Animations API, 220ms on --ease-drawer. Attach to the container:
 * `{@attach morph()}`.
 *
 * What is observed is the content (the container's children), never the
 * container: the tween resizes the container, and an observer watching the
 * box it resizes would report its own animation back to itself. For the
 * tween's length the children hold their natural size (no flex shrink), so
 * the container clips them instead of squashing a scrolling list inside it.
 */
import { CURVE, motionOk } from "./curves.svelte";

export function morph({ width = false, ms = 220 } = {}) {
  return (node: HTMLElement) => {
    let natural = { w: node.offsetWidth, h: node.offsetHeight };
    let running: Animation | undefined;

    const tween = () => {
      // Where the box is drawn now (mid-tween, if one runs), then its new
      // natural size with no tween holding it.
      const drawn = node.getBoundingClientRect();
      running?.cancel();
      running = undefined;
      const next = { w: node.offsetWidth, h: node.offsetHeight };
      const moved =
        Math.abs(next.h - natural.h) > 0.5 ||
        (width && Math.abs(next.w - natural.w) > 0.5);
      natural = next;
      if (!(moved && motionOk.current) || drawn.height === 0 || next.h === 0) {
        return;
      }
      const frames: Keyframe[] = [
        { height: `${drawn.height}px`, overflow: "hidden" },
        { height: `${next.h}px`, overflow: "hidden" },
      ];
      if (width) {
        frames[0].width = `${drawn.width}px`;
        frames[1].width = `${next.w}px`;
      }
      const held = [...node.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement
      );
      for (const child of held) {
        child.style.flexShrink = "0";
      }
      const animation = node.animate(frames, {
        duration: ms,
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

    const sizes = new ResizeObserver(tween);
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
      tween();
    });
    children.observe(node, { childList: true });
    return () => {
      running?.cancel();
      sizes.disconnect();
      children.disconnect();
    };
  };
}
