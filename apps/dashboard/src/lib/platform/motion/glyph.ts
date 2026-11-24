/**
 * A change of a status glyph (SessionStatus, StopTray): the
 * new glyph cross-fades over the old one at the control tier, coming up from
 * the pop scale; the old one only fades. With less motion, only the fade.
 * Its own module, so a component that swaps a glyph imports no session
 * state with it.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeElastic, easeSpring, motionOk } from "./curves.svelte";

/** The arriving glyph comes from the start side, the leaving one goes to the end. */
const slide = (
  duration: number,
  easing: (t: number) => number,
  from: 1 | -1
): TransitionConfig => {
  const moving = motionOk.current;
  return {
    duration,
    easing,
    css: (t, u) =>
      moving
        ? `opacity: ${Math.min(1, t)}; translate: calc(var(--spacing-space-2) * ${(from * u).toFixed(4)}) 0`
        : `opacity: ${t}`,
  };
};

export function glyphIn(_node: Element): TransitionConfig {
  return slide(dur("--duration-slow"), easeElastic, -1);
}
export function glyphOut(_node: Element): TransitionConfig {
  return slide(dur("--duration-base"), easeSpring, 1);
}
