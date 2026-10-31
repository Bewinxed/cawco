/** Each built-in kind's glyph; a kind he added wears one shared glyph. */
import type { Component } from "svelte";
import {
  IconBolt,
  IconFilter,
  IconLayersMinimal,
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
};

export const kindGlyph = (id: string): Component =>
  GLYPHS[id] ?? IconToolGeneric;
