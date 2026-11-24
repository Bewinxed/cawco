/**
 * A change of a status glyph (SessionStatus, StopTray): the
 * new glyph cross-fades over the old one at the control tier, coming up from
 * the pop scale; the old one only fades. With less motion, only the fade.
 * Its own module, so a component that swaps a glyph imports no session
 * state with it.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeElastic, easeInOut, motionOk } from "./curves.svelte";

/** The side a glyph comes from and goes to: the line's start or its end. */
export type GlyphSide = "start" | "end";

export interface GlyphParams {
  /** It comes into an empty cell, or leaves it empty. */
  alone?: boolean;
  /**
   * The two are one glyph changing (a button's spinner stopping and its
   * arc filling as a ring): they cross-fade where they stand.
   */
  inPlace?: boolean;
  /** Alone, the side it arrives from and leaves to (default: the start). */
  side?: GlyphSide;
}

/** How far out a glyph may stand and still be seen: half of itself. */
const SEEN_TO = 0.5;

const fade = (duration: number): TransitionConfig => ({
  duration,
  css: (t) => `opacity: ${t}`,
});

/** A side's x: -1 is left, 1 is right, mirrored in a right-to-left line. */
const xOf = (node: Element, side: GlyphSide) =>
  (side === "start" ? -1 : 1) *
  (getComputedStyle(node).direction === "rtl" ? -1 : 1);

/**
 * A glyph `share` of its width toward `x` from its place, at `clock` (its
 * fade's share of the clock: 1 shown, 0 gone).
 */
const at = (x: number, share: number, clock: number) => {
  if (!motionOk.current) {
    return `opacity: ${clock}`;
  }
  const opacity = Math.max(0, Math.min(clock, 1 - Math.abs(share) / SEEN_TO));
  return `opacity: ${opacity.toFixed(4)}; translate: ${(x * share * 100).toFixed(3)}% 0`;
};

/** Arriving from `x`. */
const arrive = (x: number, delay = 0): TransitionConfig => ({
  duration: dur("--duration-slow"),
  delay,
  css: (t) => at(x, 1 - easeElastic(t), t),
});

/** Leaving toward `x` (Svelte runs an outro's clock from 1 back to 0). */
const leave = (x: number): TransitionConfig => ({
  duration: dur("--duration-base"),
  css: (t) => at(x, easeInOut(1 - t), t),
});

export function glyphIn(
  node: Element,
  { alone = false, side = "start", inPlace = false }: GlyphParams = {}
): TransitionConfig {
  if (inPlace) {
    return fade(dur("--duration-base"));
  }
  if (alone) {
    return arrive(xOf(node, side));
  }
  return arrive(
    xOf(node, "start"),
    motionOk.current ? dur("--duration-fast") : 0
  );
}

export function glyphOut(
  node: Element,
  { alone = false, side = "start", inPlace = false }: GlyphParams = {}
): TransitionConfig {
  if (inPlace) {
    return fade(dur("--duration-base"));
  }
  return leave(xOf(node, alone ? side : "end"));
}
