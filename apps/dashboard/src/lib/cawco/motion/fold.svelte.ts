/**
 * Height that grows open and folds shut, on the Web Animations API: a
 * disclosure's content, a panel that opens under a control. It animates from
 * the height the element is drawn at right now, so a toggle caught mid-flight
 * turns back from where it is; open, the element is left at its natural
 * height, so content that arrives later is never clipped to a measurement.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, ease, easeOut, motionOk } from "./curves.svelte";
import { reflowsFrom, reread } from "./rows.svelte";

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
 * A fold moves everything after it with no change to the DOM, and a
 * `reflow` around it places rows only when the DOM changes: its picture of
 * where each row stands would stay the one from before the fold, and its
 * next change would slide every row after the fold from there, a jump back
 * and a second slide. When the fold ends, every `reflow` around it reads
 * the rows where they now stand.
 */
function rereadOnEnd(node: HTMLElement): void {
  // Found now, while it is in the page: a fold out may end detached.
  const around = reflowsFrom(node.parentElement);
  const ended = () => reread(around);
  node.addEventListener("introend", ended, { once: true });
  node.addEventListener("outroend", ended, { once: true });
}

/**
 * A row an `unfold` is moving: the geometry it is bound for, open, and the
 * clock it moves on. A `morph` around it (motion/morph) reads its box with
 * every such row at its end, open or gone, and tweens on the row's clock.
 * Without that, the morph read whatever frame of the fold it caught: Svelte
 * writes an intro's first frame in a microtask of its own
 * (svelte/internal/client/dom/elements/transitions.js), whose order against
 * the morph's MutationObserver microtask is not fixed. Read at that first
 * frame (the row shut) or an outro's (the row still open), the morph held
 * its box at a size the fold then left, and snapped it to the real one when
 * its tween ended: a dialog jumped by the row's height.
 */
export interface Unfolding {
  easing: string;
  /** Its edges open: padding and border widths (px). */
  edges: [string, number][];
  /** Its border-box height open (px). */
  height: number;
  /** Its block-end margin open (px). */
  margin: number;
  ms: number;
}

/**
 * Every row an `unfold` is moving now. Leaving or arriving is read at the
 * time of asking (`leaving`): a bidirectional transition turned back keeps
 * the options it was made with, and with them this entry.
 */
export const unfolding = new Map<HTMLElement, Unfolding>();

/** Svelte makes a row inert for as long as it is on its way out. */
export const leaving = (node: HTMLElement) => node.inert;

/**
 * The same fold for content an `{#if}` mounts and unmounts, as a Svelte
 * transition: `in:unfold` grows it from nothing to its measured height
 * (--dur-pop), `out:unfold` folds it back (--dur-exit), fading with the height, so
 * what sits below slides instead of jumping. In a column with a gap, the
 * gap it brings folds with it. `ms` overrides the length (0: no motion).
 * With reduced motion, a fade in place. A tree's rows open and fold on
 * their own primitive (motion/branch).
 */
export function unfold(
  node: HTMLElement,
  { ms }: { ms?: number } = {},
  { direction }: { direction?: "in" | "out" | "both" } = {}
): TransitionConfig {
  rereadOnEnd(node);
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
  const duration = ms ?? dur(direction === "out" ? "--dur-exit" : "--dur-pop");
  unfolding.set(node, {
    height,
    edges: edges as [string, number][],
    margin: Number.parseFloat(styles.marginBlockEnd) || 0,
    ms: duration,
    easing: ease("--ease-out"),
  });
  const ended = () => unfolding.delete(node);
  node.addEventListener("introend", ended, { once: true });
  node.addEventListener("outroend", ended, { once: true });
  return {
    duration,
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
