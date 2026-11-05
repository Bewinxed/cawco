/**
 * An area's mark on its row and its page: its glyph and colour from a
 * stage's vocabulary (core `AreaLook`, tasks/stage-look.ts), else the area's
 * folder in the Areas section's hue.
 */
import type { AreaLook } from "@cawco/core/areas";
import type { Component } from "svelte";
import { IconToolFiles } from "#lib/icons.js";
import { STAGE_GLYPHS, STAGE_HUES } from "../tasks/stage-look";

export const areaMark = (
  look: AreaLook,
  sectionHue: string
): { glyph: Component; hue: string } => ({
  glyph: look.icon ? STAGE_GLYPHS[look.icon] : IconToolFiles,
  hue: look.color ? STAGE_HUES[look.color] : sectionHue,
});

/** A look write as the store keeps it: an empty value is none. */
export const lookPatch = (patch: {
  color?: AreaLook["color"] | undefined;
  icon?: AreaLook["icon"] | undefined;
}): Partial<AreaLook> =>
  "icon" in patch
    ? { icon: patch.icon ?? null }
    : { color: patch.color ?? null };
