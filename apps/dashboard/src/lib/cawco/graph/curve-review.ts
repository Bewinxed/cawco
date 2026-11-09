/**
 * The Curve chip's list as CurveDrawn draws it (CurveChoices): the design
 * system's curves with their glyphs, then Spring, then the agent's curve,
 * the house ease-out chosen.
 */

import { graphWords as words } from "@cawco/core/words/graph";
import { ease } from "#lib/platform/motion/curves.svelte.js";
import { browser } from "$app/env";
import { curveGlyph, springEasing, springOf } from "./motion";

const HOUSE = [
  "--ease-out",
  "--ease-in-out",
  "--ease-drawer",
  "--ease-crossfade",
  "--ease-goo",
  "linear",
] as const;

const glyphOf = (token: (typeof HOUSE)[number]): string | null => {
  if (!browser) {
    return null;
  }
  return curveGlyph(token === "linear" ? "linear" : ease(token));
};

/** The list the Curve chip opens, the house ease-out chosen. */
export const curveList = {
  options: [
    ...HOUSE.map((token) => ({
      value: token,
      name: words.curves[token] ?? token,
      glyph: glyphOf(token),
    })),
    {
      value: "spring",
      name: words.spring,
      glyph: curveGlyph(springEasing(springOf(0.5, 0.45)).easing),
    },
    { value: "written", name: words.agentsCurve, glyph: null },
  ],
  value: "--ease-out",
  spring: null,
  onpick: () => undefined,
};

/** The house ease-out's four numbers, the curve the drawn option bends from. */
export const EASE_OUT_POINTS = [0.23, 1, 0.32, 1];
