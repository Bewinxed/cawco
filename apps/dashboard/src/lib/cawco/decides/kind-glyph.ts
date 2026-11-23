/** Each built-in kind's glyph; a kind he added wears one shared glyph. */
import type { Component } from "svelte";
import {
  IconBolt,
  IconFilter,
  IconLayersMinimal,
  IconListCheck,
  IconPalette,
  IconSettings,
  IconShield,
  IconToolGeneric,
} from "#lib/icons.js";

const GLYPHS: Record<string, Component> = {
  look: IconPalette,
  behaviour: IconBolt,
  scope: IconFilter,
  approach: IconLayersMinimal,
  rules: IconShield,
  tools: IconSettings,
  // Marking tasks done (the project's work path folds its review setting into the roster as this kind).
  done: IconListCheck,
};

export const kindGlyph = (id: string): Component =>
  GLYPHS[id] ?? IconToolGeneric;
