/**
 * A floating surface an `{#if}` removes leaves the way the kit's surfaces
 * do (the kit's `floatingSurface` closed): back toward what it stands on,
 * shrinking to the pop scale as it fades, at the exit tier. It comes in by
 * the stylesheet's own `@starting-style`, on `data-state="open"`.
 *
 * `side` is the side of its anchor it stands on, as its `data-side` says,
 * and it goes back toward the anchor as the kit's `--kit-rise` does: one hung
 * under its field (`bottom`, the default) goes back up into it, one standing
 * over its row (`top`, the delegate tray's shelf) back down, one beside its
 * anchor (`right`, `left`: a comment's card beside its pill) back across.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeDrawer, motionOk } from "./curves.svelte";

export type PopSide = "bottom" | "top" | "right" | "left";

/** The unit step toward the anchor, x then y, for each side it stands on. */
const TOWARD: Record<PopSide, [number, number]> = {
  bottom: [0, -1],
  top: [0, 1],
  right: [-1, 0],
  left: [1, 0],
};

export function popOut(
  node: HTMLElement,
  { side = "bottom" }: { side?: PopSide } = {}
): TransitionConfig {
  if (!motionOk.current) {
    return { duration: dur("--dur-control"), css: (t) => `opacity: ${t}` };
  }
  const styles = getComputedStyle(node);
  const scale = Number.parseFloat(styles.getPropertyValue("--pop-scale"));
  const rise = Number.parseFloat(styles.getPropertyValue("--pop-rise"));
  const [x, y] = TOWARD[side];
  return {
    duration: dur("--dur-exit"),
    easing: easeDrawer,
    css: (t) =>
      `opacity: ${t}; scale: ${scale + (1 - scale) * t}; translate: ${(x * (1 - t) * rise).toFixed(2)}px ${(y * (1 - t) * rise).toFixed(2)}px`,
  };
}
