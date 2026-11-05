/**
 * How the prototype's panes, sheets and drawers come and go (DESIGN.md,
 * Motion grammar): a sheet slides its whole size on the drawer curve, in
 * over `--dur-panel`, out faster over `--dur-exit`, from the side it stands
 * on; a scrim fades. With reduced motion everything only fades.
 */
import type { TransitionConfig } from "svelte/transition";
import {
  dur,
  easeDrawer,
  easeOut,
  motionOk,
} from "#lib/cawco/motion/curves.svelte.js";

export type Side = "end" | "start" | "bottom";

/** The share of its own size it travels, per side: x then y, in percent. */
const AWAY: Record<Side, [number, number]> = {
  end: [100, 0],
  start: [-100, 0],
  bottom: [0, 100],
};

function travel(side: Side, token: "--dur-panel" | "--dur-exit") {
  if (!motionOk.current) {
    return {
      duration: dur("--dur-control"),
      css: (t: number) => `opacity: ${t}`,
    };
  }
  const [x, y] = AWAY[side];
  return {
    duration: dur(token),
    easing: easeDrawer,
    css: (t: number) =>
      `translate: ${((1 - t) * x).toFixed(2)}% ${((1 - t) * y).toFixed(2)}%`,
  };
}

/** A sheet or pane arriving from its side. */
export function sheetIn(
  _node: Element,
  { side = "end" }: { side?: Side } = {}
): TransitionConfig {
  return travel(side, "--dur-panel");
}

/** A sheet or pane leaving the way it came, faster. */
export function sheetOut(
  _node: Element,
  { side = "end" }: { side?: Side } = {}
): TransitionConfig {
  return travel(side, "--dur-exit");
}

/** The scrim behind a drawer or sheet. */
export function scrimFade(
  _node: Element,
  { leaving = false }: { leaving?: boolean } = {}
): TransitionConfig {
  return {
    duration: dur(leaving ? "--dur-exit" : "--dur-panel"),
    easing: easeOut,
    css: (t: number) => `opacity: ${t}`,
  };
}
