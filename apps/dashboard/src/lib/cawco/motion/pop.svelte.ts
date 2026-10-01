/**
 * A floating surface an `{#if}` removes leaves the way the kit's surfaces
 * do (app.css `.kit-pop[data-state="closed"]`): back up toward the field it
 * hangs from, shrinking to the pop scale as it fades, at the exit tier. It
 * comes in by the stylesheet's own `@starting-style`, on
 * `data-state="open"`.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeDrawer, motionOk } from "./curves.svelte";

export function popOut(node: HTMLElement): TransitionConfig {
  if (!motionOk.current) {
    return { duration: dur("--dur-control"), css: (t) => `opacity: ${t}` };
  }
  const styles = getComputedStyle(node);
  const scale = Number.parseFloat(styles.getPropertyValue("--pop-scale"));
  const rise = Number.parseFloat(styles.getPropertyValue("--pop-rise"));
  return {
    duration: dur("--dur-exit"),
    easing: easeDrawer,
    css: (t) =>
      `opacity: ${t}; scale: ${scale + (1 - scale) * t}; translate: 0 ${(-(1 - t) * rise).toFixed(2)}px`,
  };
}
