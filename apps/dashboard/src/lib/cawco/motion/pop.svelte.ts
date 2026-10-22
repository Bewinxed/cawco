/**
 * A floating surface comes and goes the way the kit's surfaces do
 * (`floatingSurface`): out of what it stands on, growing from the pop scale
 * as it fades in (`popIn`, the pop tier on the drawer curve), and back into
 * it as it fades out (`popOut`, the exit tier). One Web Animation each way,
 * so its open and its close each run on one clock. With reduced motion,
 * only the fade.
 *
 * Every floating surface's entrance is `popIn`, never the stylesheet's
 * `@starting-style`: WebKit sometimes runs no starting-style transition for
 * an element just added to the page (bugs.webkit.org 275184, comment 8:
 * "transitions are sometimes not applied when adding elements", Safari
 * 18.4), and the surface popped in whole. The kit's contents (popover,
 * dropdown and context menus and their submenus, select) put it on the
 * element they draw, global, since bits-ui's presence opens them through
 * blocks nested in theirs. A surface that leaves by `popOut` too takes the
 * kit's `motion: "hang"` look and no `data-state`, so no CSS transition of
 * its own outranks it; the kit's own contents still leave by `data-closed`.
 *
 * `side` is the side of its anchor it stands on: its `data-side` (bits-ui
 * sets it on every content) unless given. It comes in from toward that
 * anchor, by --pop-rise: from above when it stands under (`bottom`, the
 * default), from below over (`top`), from its anchor's side beside it.
 * `hangs`: a card that hangs (HangCard) draws its own motion (motion/hang),
 * which with reduced motion runs nothing: only that fade is this one's.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeDrawer, motionOk } from "./curves.svelte";

type Side = "bottom" | "top" | "left" | "right";

interface Pop {
  hangs?: boolean;
  side?: Side;
}

/** Which way it travels toward its anchor, per side it stands on. */
const TOWARD: Record<Side, [number, number]> = {
  bottom: [0, -1],
  top: [0, 1],
  left: [1, 0],
  right: [-1, 0],
};

const sideOf = (node: HTMLElement, side: Side | undefined): Side => {
  const said = side ?? node.dataset.side;
  return said && said in TOWARD ? (said as Side) : "bottom";
};

/** The surface at `t` of its way out of its anchor: 0 at the anchor, 1 standing. */
function drawnAt(node: HTMLElement, side: Side) {
  const styles = getComputedStyle(node);
  const scale = Number.parseFloat(styles.getPropertyValue("--pop-scale"));
  const rise = Number.parseFloat(styles.getPropertyValue("--pop-rise"));
  const [dx, dy] = TOWARD[side];
  return (t: number) =>
    `opacity: ${t}; scale: ${scale + (1 - scale) * t}; translate: ${(dx * (1 - t) * rise).toFixed(2)}px ${(dy * (1 - t) * rise).toFixed(2)}px`;
}

const fade = (): TransitionConfig => ({
  duration: dur("--dur-control"),
  css: (t) => `opacity: ${t}`,
});

export function popIn(
  node: HTMLElement,
  { side, hangs = false }: Pop = {}
): TransitionConfig {
  if (!motionOk.current) {
    return fade();
  }
  if (hangs) {
    return { duration: 0 };
  }
  return {
    duration: dur("--dur-pop"),
    easing: easeDrawer,
    css: drawnAt(node, sideOf(node, side)),
  };
}

export function popOut(
  node: HTMLElement,
  { side }: Pop = {}
): TransitionConfig {
  if (!motionOk.current) {
    return fade();
  }
  return {
    duration: dur("--dur-exit"),
    easing: easeDrawer,
    css: drawnAt(node, sideOf(node, side)),
  };
}
