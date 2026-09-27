/**
 * Height that grows open and folds shut, on the Web Animations API: a
 * disclosure's content, a panel that opens under a control. It animates from
 * the height the element is drawn at right now, so a toggle caught mid-flight
 * turns back from where it is; open, the element is left at its natural
 * height, so content that arrives later is never clipped to a measurement.
 */
import { reduced } from "./curves.svelte";

export interface FoldOptions {
  easing: string;
  /** Fade the content with the height. */
  fade?: boolean;
  /** A gap the folded element gives back to its column (px). */
  gap?: number;
  ms: number;
}

const running = new WeakMap<HTMLElement, Animation>();

/** The drawn height now, including a fold in flight. */
const drawn = (node: HTMLElement) => node.getBoundingClientRect().height;

/**
 * Move `node` to `open`. `from` overrides the starting height (a node just
 * mounted opening from nothing). Resolves when the fold settles.
 */
export function fold(
  node: HTMLElement,
  open: boolean,
  { ms, easing, fade = false, gap = 0 }: FoldOptions,
  from?: number
): Animation | undefined {
  const start = from ?? drawn(node);
  const startOpacity = fade ? Number(getComputedStyle(node).opacity) : 1;
  const startGap = gap
    ? Number.parseFloat(getComputedStyle(node).marginBottom)
    : 0;
  running.get(node)?.cancel();
  running.delete(node);
  node.style.overflow = "hidden";
  node.style.height = "";
  node.style.marginBottom = "";
  node.style.opacity = "";
  const end = open ? node.offsetHeight : 0;
  const settle = () => {
    running.delete(node);
    if (open) {
      node.style.overflow = "";
    } else {
      node.style.height = "0px";
      if (gap) {
        node.style.marginBottom = `${-gap}px`;
      }
      if (fade) {
        node.style.opacity = "0";
      }
    }
  };
  // Reduced motion is stillness, not an instant swap: the height lands at
  // once and only a fade, where there is one, still runs.
  const still = reduced.current;
  if (still && !fade) {
    settle();
    return;
  }
  const from_: Keyframe = {};
  const to: Keyframe = {};
  if (!still) {
    from_.height = `${start}px`;
    to.height = `${end}px`;
    if (gap) {
      from_.marginBottom = `${startGap}px`;
      to.marginBottom = open ? "0px" : `${-gap}px`;
    }
  }
  if (fade) {
    from_.opacity = startOpacity;
    to.opacity = open ? 1 : 0;
  }
  const animation = node.animate([from_, to], {
    duration: ms,
    easing,
    fill: "forwards",
  });
  running.set(node, animation);
  animation.finished.then(
    () => {
      if (running.get(node) === animation) {
        settle();
        animation.cancel();
      }
    },
    () => {
      /* superseded by the next fold, which owns the node now */
    }
  );
  return animation;
}

/**
 * Hold an always-mounted element folded shut or open from a boolean: an
 * attachment (`{@attach folds(() => open, options)}`). The first state lands
 * without motion; every change after it folds.
 */
export function folds(open: () => boolean, options: FoldOptions) {
  return (node: HTMLElement) => {
    let first = true;
    $effect(() => {
      const next = open();
      if (first) {
        first = false;
        if (!next) {
          node.style.overflow = "hidden";
          node.style.height = "0px";
          if (options.gap) {
            node.style.marginBottom = `${-options.gap}px`;
          }
          if (options.fade) {
            node.style.opacity = "0";
          }
        }
        return;
      }
      fold(node, next, options);
    });
  };
}
