/**
 * A container whose content changes size tweens to the new size instead of
 * jumping: when the content inside it changes (a popover's list arrives, an
 * error line appears, a card switches what it shows), the container is held
 * at the size it is drawn at and animated to its new natural size on the
 * Web Animations API, over --dur-morph on --ease-drawer. Attach to the container:
 * `{@attach morph()}`.
 *
 * The tween starts before the frame is laid out, never from a
 * ResizeObserver callback. A change to the content is heard by a
 * MutationObserver (nodes in or out, text, a class or `hidden`/`open`/
 * `data-state` turning anywhere inside), whose callback is a microtask
 * after the script that made it, so the new natural size is read and the
 * tween's first frame set before layout: the container is laid out at the
 * size it was drawn at, and nothing around it ever sees the new size first.
 * Started from a ResizeObserver callback instead, after layout had already
 * reported the new size to every observer, the tween's first frame resized
 * the container back inside that delivery. Whatever watches an ancestor (the
 * floating wrapper bits-ui hands floating-ui's `autoUpdate`, a morph around
 * this one) was then resized at a depth the delivery had already passed,
 * and the browser reported a ResizeObserver loop.
 *
 * The one ResizeObserver here watches the container itself and only reads:
 * the size it was laid out at, the size a tween starts from. A size change
 * nothing in the content made (the column narrows and text rewraps, an
 * image or a font arrives, a child's own transition) is laid out as it
 * comes: the container follows it frame by frame, with no tween of its own.
 *
 * For the tween's length the children hold their natural size (no flex
 * shrink, and their block size), so the container clips them instead of
 * squashing a scrolling list inside it, and a child sized by the container
 * (`height: 100%`, a Command list's root) does not follow the tween.
 *
 * Every container changed in one turn of the event loop is measured
 * together: the sizes drawn now, then (tweens in flight cancelled, their
 * children let go) the natural sizes, then the tweens written. That is two
 * layouts for any number of them.
 *
 * `rows`: what changes inside is a `reflow`'s rows (a run's steps opening
 * a result under one, motion/branch), so the container's edge moves with
 * them: at their batch's pace (motion/rows `atTravel`), from the frame it
 * starts on, held at its drawn size until then. What sits under the container moves with its edge, and
 * the rows inside are never cut by it.
 */
import { CURVE, dur, ease, motionOk } from "./curves.svelte";
import { heldToTravel } from "./rows.svelte";

interface Size {
  h: number;
  w: number;
}

/** A container's natural size and its children's block sizes in it. */
interface Natural {
  children: { child: HTMLElement; blockSize: number }[];
  size: Size;
}

/** One attached container, as the shared measure sees it. */
interface Box {
  /** The size it is drawn at, or null before it was first laid out. */
  drawn: () => Size | null;
  /** Its natural size now, read with nothing holding it. */
  natural: () => Natural;
  /** Lets go of the tween in flight and the children it held. */
  stop: () => void;
  /** Tweens from `from` to its natural size, its children held at theirs. */
  tween: (from: Size, to: Natural) => void;
}

/** The content mutations that can change a container's natural size. */
const CHANGES: MutationObserverInit = {
  childList: true,
  characterData: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "hidden", "open", "data-state"],
};

/** Containers whose content changed since the last measure. */
const changed = new Set<Box>();

/**
 * Reads every changed container's drawn size, then its natural size, then
 * writes the tweens: no write between two reads, so the two reads lay the
 * page out once each.
 */
function measure() {
  const boxes = [...changed];
  changed.clear();
  const from = boxes.map((box) => box.drawn());
  for (const box of boxes) {
    box.stop();
  }
  const to = boxes.map((box) => box.natural());
  boxes.forEach((box, at) => {
    const start = from[at];
    if (start) {
      box.tween(start, to[at]);
    }
  });
}

export function morph({
  width = false,
  ms,
  rows = false,
}: {
  width?: boolean;
  ms?: number;
  rows?: boolean;
} = {}) {
  return (node: HTMLElement) => {
    /**
     * The size it was last laid out at, from the ResizeObserver: unknown
     * until its first delivery, which comes after the frame's layout. Read
     * when it was attached, it laid the page out in the middle of whatever
     * task mounted it — every diff a scrolling transcript mounted paid a
     * forced layout.
     */
    let laid: Size | null = null;
    let running: Animation | undefined;
    /** Gives the children of the tween in flight back their own sizes. */
    let release: (() => void) | undefined;

    /**
     * Its laid-out size. Following rows, to the subpixel: they stand at
     * fractional places, and a box rounded to whole pixels cut the last of
     * them by the difference while it slid.
     */
    const sizeNow = (): Size => {
      if (rows) {
        const box = node.getBoundingClientRect();
        return { w: box.width, h: box.height };
      }
      return { w: node.offsetWidth, h: node.offsetHeight };
    };

    /**
     * The tween itself: its own curve, or the rows' (`rows`), at their
     * batch's pace over the `distance` its edge moves.
     */
    const play = (frames: Keyframe[], distance: number): Animation =>
      rows
        ? heldToTravel(
            node.animate(frames, {
              duration: dur("--dur-panel"),
              easing: ease("--ease-in-out"),
            }),
            distance
          )
        : node.animate(frames, {
            duration: ms ?? dur("--dur-morph"),
            easing: CURVE.drawer,
          });

    /** How far its edge moves: down, or across too (`width`). */
    const moves = (from: Size, to: Size) =>
      Math.max(Math.abs(to.h - from.h), width ? Math.abs(to.w - from.w) : 0);

    const box: Box = {
      // In flight, where the tween has it right now; else where layout last
      // put it, since the content has already changed under it.
      drawn: () => (running ? sizeNow() : laid),
      natural: () => ({
        size: sizeNow(),
        children: [...node.children]
          .filter((child): child is HTMLElement => child instanceof HTMLElement)
          .map((child) => ({
            child,
            blockSize: child.getBoundingClientRect().height,
          })),
      }),
      stop: () => {
        running?.cancel();
        running = undefined;
        release?.();
        release = undefined;
      },
      tween: (from, { size: to, children }) => {
        const moved =
          Math.abs(to.h - from.h) > 0.5 ||
          (width && Math.abs(to.w - from.w) > 0.5);
        if (!(moved && motionOk.current) || from.h === 0 || to.h === 0) {
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
        const held = children.map(({ child, blockSize }) => ({
          child,
          blockSize,
          was: child.style.blockSize,
          shrink: child.style.flexShrink,
        }));
        for (const { child, blockSize } of held) {
          child.style.flexShrink = "0";
          child.style.blockSize = `${blockSize}px`;
        }
        const animation = play(frames, moves(from, to));
        running = animation;
        const letGo = () => {
          for (const { child, was, shrink } of held) {
            child.style.flexShrink = shrink;
            child.style.blockSize = was;
          }
        };
        release = letGo;
        // A tween cancelled by the next one has been let go by `stop`.
        const done = () => {
          if (running === animation) {
            running = undefined;
            release = undefined;
            letGo();
          }
        };
        animation.finished.then(done, done);
      },
    };

    // Reads only: what it was laid out at, for the next tween to start from.
    const laidOut = new ResizeObserver(([entry]) => {
      const [border] = entry.borderBoxSize;
      laid = rows
        ? { w: border.inlineSize, h: border.blockSize }
        : { w: Math.round(border.inlineSize), h: Math.round(border.blockSize) };
    });
    laidOut.observe(node, { box: "border-box" });

    const content = new MutationObserver(() => {
      if (changed.size === 0) {
        queueMicrotask(measure);
      }
      changed.add(box);
    });
    content.observe(node, CHANGES);

    return () => {
      box.stop();
      changed.delete(box);
      laidOut.disconnect();
      content.disconnect();
    };
  };
}
