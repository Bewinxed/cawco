/**
 * A floating surface an `{#if}` removes leaves the way the kit's surfaces
 * do (the kit's `floatingSurface` closed): back toward what it stands on,
 * shrinking to the pop scale as it fades, at the exit tier. It comes in by
 * the stylesheet's own `@starting-style`, on `data-state="open"`.
 *
 * `side` is the side of its anchor it stands on, as its `data-side` says:
 * one hung under its field (`bottom`, the default) goes back up into it,
 * one standing over its row (`top`, the delegate tray's shelf) back down.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeDrawer, motionOk } from "./curves.svelte";

export function popOut(
  node: HTMLElement,
  { side = "bottom" }: { side?: "bottom" | "top" } = {}
): TransitionConfig {
  if (!motionOk.current) {
    return { duration: dur("--dur-control"), css: (t) => `opacity: ${t}` };
  }
  const styles = getComputedStyle(node);
  const scale = Number.parseFloat(styles.getPropertyValue("--pop-scale"));
  const rise = Number.parseFloat(styles.getPropertyValue("--pop-rise"));
  const toward = side === "top" ? 1 : -1;
  return {
    duration: dur("--dur-exit"),
    easing: easeDrawer,
    css: (t) =>
      `opacity: ${t}; scale: ${scale + (1 - scale) * t}; translate: 0 ${(toward * (1 - t) * rise).toFixed(2)}px`,
  };
}
