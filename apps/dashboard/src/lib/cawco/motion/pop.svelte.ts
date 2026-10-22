/**
 * A floating surface an `{#if}` adds and removes comes and goes the way the
 * kit's surfaces do (`floatingSurface`): out of what it stands on, growing
 * from the pop scale as it fades in (`popIn`, the pop tier on the drawer
 * curve), and back into it as it fades out (`popOut`, the exit tier). One
 * Web Animation each way, so its open and its close each run on one clock.
 *
 * The entrance is this transition, never the stylesheet's `@starting-style`:
 * WebKit sometimes runs no starting-style transition for an element just
 * added to the page (bugs.webkit.org 275184, comment 8: "transitions are
 * sometimes not applied when adding elements", Safari 18.4), and the
 * surface popped in whole. A surface that uses these takes the kit's
 * `motion: "hang"` look and no `data-state="open"`, so no CSS transition of
 * its own outranks them.
 *
 * `side` is the side of its anchor it stands on, as its `data-side` says:
 * one hung under its field (`bottom`, the default) rises up into it and
 * comes down out of it; one standing over its row (`top`, the delegate
 * tray's shelf, the plan, the `/` menu) the other way.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeDrawer, motionOk } from "./curves.svelte";

interface Side {
  side?: "bottom" | "top";
}

/** The surface's travel: the pop scale it grows from, and its rise toward what it stands on. */
function travel(node: HTMLElement, side: Side["side"]) {
  const styles = getComputedStyle(node);
  return {
    scale: Number.parseFloat(styles.getPropertyValue("--pop-scale")),
    rise:
      Number.parseFloat(styles.getPropertyValue("--pop-rise")) *
      (side === "top" ? 1 : -1),
  };
}

const at = (t: number, scale: number, rise: number) =>
  `opacity: ${t}; scale: ${scale + (1 - scale) * t}; translate: 0 ${((1 - t) * rise).toFixed(2)}px`;

export function popIn(
  node: HTMLElement,
  { side = "bottom" }: Side = {}
): TransitionConfig {
  if (!motionOk.current) {
    return { duration: dur("--dur-control"), css: (t) => `opacity: ${t}` };
  }
  const { scale, rise } = travel(node, side);
  return {
    duration: dur("--dur-pop"),
    easing: easeDrawer,
    css: (t) => at(t, scale, rise),
  };
}

export function popOut(
  node: HTMLElement,
  { side = "bottom" }: Side = {}
): TransitionConfig {
  if (!motionOk.current) {
    return { duration: dur("--dur-control"), css: (t) => `opacity: ${t}` };
  }
  const { scale, rise } = travel(node, side);
  return {
    duration: dur("--dur-exit"),
    easing: easeDrawer,
    css: (t) => at(t, scale, rise),
  };
}
