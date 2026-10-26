/**
 * Identity mark helpers — maps a session to its Quiet Ledger item mark: an
 * identity HUE (1–8, stable per project/path) carrying a per-session SPRITE.
 * Mirrors the marks in mocks/v2-fleet.html (the lead column of every board row).
 */
import type { Component } from "svelte";
import {
  IconBolt,
  IconBook,
  IconBox,
  IconFire,
  IconGhost,
  IconGlobe,
  IconLab,
  IconLeaf,
  IconPalette,
  IconPlanet,
  IconRocket,
  IconSparkles,
} from "#lib/icons.js";

export type MarkHue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * A curated set of Solar bold-duotone identity sprites. Enough distinct faces
 * that a mark is told apart by SHAPE, not only by hue (which repeats every 8) —
 * this is what stops nine sessions reading as the same hexagon in nine colours.
 */
const SESSION_SPRITES: Component[] = [
  IconGhost,
  IconRocket,
  IconBox,
  IconGlobe,
  IconBook,
  IconLab,
  IconBolt,
  IconLeaf,
  IconPlanet,
  IconFire,
  IconPalette,
  IconSparkles,
];

/**
 * A stable Solar duotone sprite for a session, keyed to the same seed as the hue
 * but on a different mixing constant so shape and colour vary independently — a
 * session's mark is a unique (sprite × hue) pair, not just a recoloured square.
 */
export function sessionSprite(seed: string | null | undefined): Component {
  const s = seed ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: `| 0` truncates to a 32-bit int, matching the hash's C-style overflow
    h = (h * 37 + s.charCodeAt(i)) | 0;
  }
  return SESSION_SPRITES[Math.abs(h) % SESSION_SPRITES.length];
}

/** A stable 1–8 hue from any seed string (project path, machine id). */
export function markHue(seed: string | null | undefined): MarkHue {
  const s = seed ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: `| 0` truncates to a 32-bit int, matching the hash's C-style overflow
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return ((Math.abs(h) % 8) + 1) as MarkHue;
}
