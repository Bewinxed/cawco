/**
 * Height that grows open and folds shut, on the Web Animations API: a
 * disclosure's content, a panel that opens under a control. It animates from
 * the height the element is drawn at right now, so a toggle caught mid-flight
 * turns back from where it is; open, the element is left at its natural
 * height, so content that arrives later is never clipped to a measurement.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeOut, motionOk } from "./curves.svelte";

export interface FoldOptions {
  easing: string;
  /** Fade the content with the height. */
  fade?: boolean;
  /** A gap the folded element gives back to its column (px). */
  gap?: number;
  ms: number;
}

const running = new WeakMap<HTMLElement, Animation>();
/** Layouts whose gap an unfolding child brings with it. */
const STACKS = /flex|grid/;

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
  // Clipped from the first measurement to the last frame: a clipped box holds
  // its children's margins, so the start, the end and every frame between are
  // read in the same geometry.
  node.style.overflow = "hidden";
  const start = from ?? drawn(node);
  const startOpacity = fade ? Number(getComputedStyle(node).opacity) : 1;
  const startGap = gap
    ? Number.parseFloat(getComputedStyle(node).marginBottom)
    : 0;
  running.get(node)?.cancel();
  running.delete(node);
  node.style.height = "";
  node.style.marginBottom = "";
  node.style.opacity = "";
  const end = open ? node.offsetHeight : 0;
  const settle = () => {
    running.delete(node);
    if (open) {
      node.style.overflow = "";
    } else {
      // Written again: the clip set at the start may have been dropped by a
      // `style` rewrite, and a shut box that does not clip lets its first
      // child's margin through.
      node.style.overflow = "hidden";
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
  const still = !motionOk.current;
  if (still && !fade) {
    settle();
    return;
  }
  // The clip rides in the keyframes as well as the inline style: a component
  // that rewrites its `style` attribute mid-fold (bits-ui's Collapsible, when
  // it publishes its size) drops the inline one, and an unclipped fold paints
  // its whole body over the rows below while its box is still growing.
  const from_: Keyframe = { overflow: "hidden" };
  const to: Keyframe = { overflow: "hidden" };
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

/**
 * The same fold for content an `{#if}` mounts and unmounts, as a Svelte
 * transition: `in:unfold` grows it from nothing to its measured height
 * (--dur-pop), `out:unfold` folds it back (--dur-exit), fading with the height, so
 * what sits below slides instead of jumping. In a column with a gap, the
 * gap it brings folds with it. `ms` overrides the length (0: no motion).
 * With reduced motion, a fade in place.
 */
export function unfold(
  node: HTMLElement,
  { ms }: { ms?: number } = {},
  { direction }: { direction?: "in" | "out" | "both" } = {}
): TransitionConfig {
  if (!motionOk.current) {
    return { duration: dur("--dur-control"), css: (t) => `opacity: ${t}` };
  }
  const { height } = node.getBoundingClientRect();
  const styles = getComputedStyle(node);
  // Padding and borders fold with the height: a box cannot be drawn shorter
  // than them, so left alone they would pop in and out at the ends.
  const edges = [
    "padding-top",
    "padding-bottom",
    "border-top-width",
    "border-bottom-width",
  ].map((edge) => [edge, Number.parseFloat(styles.getPropertyValue(edge))]);
  const { parentElement: parent } = node;
  const column =
    parent !== null &&
    parent.childElementCount > 1 &&
    STACKS.test(getComputedStyle(parent).display)
      ? Number.parseFloat(getComputedStyle(parent).rowGap) || 0
      : 0;
  return {
    duration: ms ?? dur(direction === "out" ? "--dur-exit" : "--dur-pop"),
    easing: easeOut,
    css: (t) =>
      [
        "overflow: hidden",
        `height: ${(t * height).toFixed(2)}px`,
        ...edges.map(
          ([edge, px]) => `${edge}: ${(t * Number(px)).toFixed(2)}px`
        ),
        `margin-block-end: ${((t - 1) * column).toFixed(2)}px`,
        `opacity: ${t}`,
      ].join("; "),
  };
}
