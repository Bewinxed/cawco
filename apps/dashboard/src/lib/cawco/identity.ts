/**
 * Project identity color — every folder/project owns a stable hue that
 * follows it across the rail, tabs, board cards, and peek pane, so the eye
 * binds work to color before reading a single word.
 *
 * The hue is hashed from the folder's cwd (registered projects hash their
 * cwd too, so renaming a project keeps its color). Ten hues, tuned to stay
 * clear of the reserved state hues' *roles*: identity renders as glyph ink
 * — never as a status dot.
 *
 * Usage: set `--identity-h` to `folderPrefs.hue(cwd)` on the element
 * (`style:--identity-h={…}`; on a component, `style="--identity-h: {…}"`) —
 * `folder-prefs.svelte.ts` lets a hand-picked hue win over the hash — then
 * color through the `identity-ink` utility in app.css, which reads
 * `--identity-h` and tunes lightness per appearance.
 */

import { fnv1a } from "@cawco/core/fnv1a";

/** Ten identity hues (oklch). No hue below 40: a red folder reads as alarm. */
export const HUES = [55, 85, 115, 145, 175, 205, 235, 265, 295, 330] as const;

export function identityHue(key: string): number {
  return HUES[fnv1a(key) % HUES.length];
}
