/**
 * A container whose content changes size tweens to the new size instead of
 * jumping: when the content inside it reflows (a popover's list arrives, an
 * error line appears, a card switches what it shows), the container is held
 * at the size it had and animated to the new one on the Web Animations API,
 * 220ms on --ease-drawer. Attach to the container: `{@attach morph()}`.
 *
 * While a tween runs, the sizes the container reports are the tween's own,
 * so they are ignored; when it ends, the container's natural size is read
 * again and, if the content moved on meanwhile, it tweens on from there.
 */
import { CURVE, reduced } from "./curves.svelte";

interface Size {
  h: number;
  w: number;
}

export function morph({ width = false, ms = 220 } = {}) {
  return (node: HTMLElement) => {
    const measure = (): Size => ({ w: node.offsetWidth, h: node.offsetHeight });
    let target = measure();
    let running: Animation | undefined;

    const differs = (a: Size, b: Size) =>
      Math.abs(a.h - b.h) > 0.5 || (width && Math.abs(a.w - b.w) > 0.5);

    const tween = (from: Size, to: Size) => {
      if (reduced.current || from.h === 0 || to.h === 0) {
        return;
      }
      const frames: Keyframe[] = [
        { height: `${from.h}px`, overflow: "hidden" },
        { height: `${to.h}px`, overflow: "hidden" },
      ];
      if (width) {
        frames[0].width = `${from.w}px`;
        frames[1].width = `${to.w}px`;
      }
      const animation = node.animate(frames, {
        duration: ms,
        easing: CURVE.drawer,
      });
      running = animation;
      const settle = () => {
        if (running !== animation) {
          return;
        }
        running = undefined;
        const now = measure();
        if (differs(now, target)) {
          const from_ = target;
          target = now;
          tween(from_, now);
        }
      };
      animation.finished.then(settle, settle);
    };

    const sizes = new ResizeObserver(() => {
      if (running) {
        return;
      }
      const next = measure();
      if (!differs(next, target)) {
        return;
      }
      const from = target;
      target = next;
      tween(from, next);
    });
    sizes.observe(node);
    return () => {
      running?.cancel();
      sizes.disconnect();
    };
  };
}
