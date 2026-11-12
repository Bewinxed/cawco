/**
 * A change of a status glyph (SessionStatus, StopTray, StopTrayPick): the
 * new glyph cross-fades over the old one at the control tier, coming up from
 * the pop scale; the old one only fades. With less motion, only the fade.
 * Its own module, so a component that swaps a glyph imports no session
 * state with it.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeOut, motionOk, popScale } from "./curves.svelte";

export function glyphIn(_node: Element): TransitionConfig {
  const scale = motionOk.current ? popScale() : 1;
  return {
    duration: dur("--duration-control"),
    easing: easeOut,
    css: (t) => `opacity: ${t}; scale: ${scale + (1 - scale) * t}`,
  };
}
export function glyphOut(_node: Element): TransitionConfig {
  return {
    duration: dur("--duration-control"),
    easing: easeOut,
    css: (t) => `opacity: ${t}`,
  };
}
