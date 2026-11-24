/**
 * A change of a status glyph (SessionStatus, StopTray): the
 * new glyph cross-fades over the old one at the control tier, coming up from
 * the pop scale; the old one only fades. With less motion, only the fade.
 * Its own module, so a component that swaps a glyph imports no session
 * state with it.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeOut, motionOk } from "./curves.svelte";

/** The scale a glyph grows from and shrinks to. */
const SWAP_SCALE = 0.25;
/** The blur it comes out of and goes into, px. */
const SWAP_BLUR = 4;

const swap = (duration: number): TransitionConfig => {
  const moving = motionOk.current;
  const blur = SWAP_BLUR;
  return {
    duration,
    easing: easeOut,
    css: (t) =>
      moving
        ? `opacity: ${t}; scale: ${SWAP_SCALE + (1 - SWAP_SCALE) * t}; filter: blur(${((1 - t) * blur).toFixed(3)}px)`
        : `opacity: ${t}`,
  };
};

export function glyphIn(_node: Element): TransitionConfig {
  return swap(dur("--duration-slow"));
}
export function glyphOut(_node: Element): TransitionConfig {
  return swap(dur("--duration-base"));
}
