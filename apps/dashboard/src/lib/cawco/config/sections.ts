import {
  CONFIG_GROUPS,
  CONFIG_SECTIONS,
  type ConfigSectionDefinition,
  type ConfigSlug,
} from "@cawco/core";
import type { Component } from "svelte";
import {
  IconAccounts,
  IconBolt,
  IconBook,
  IconCpu,
  IconDollar,
  IconDownload,
  IconExternal,
  IconHook,
  IconPhone,
  IconRules,
  IconSubagent,
  IconTerminal,
  IconToolMcp,
} from "#lib/icons.js";

/**
 * One entry of the Configure rail: core's definition (CONFIG_SECTIONS, which
 * the native app reads too), its Solar glyph as the component that draws
 * it, and its hue token as the colour it is.
 */
export interface ConfigSection extends Omit<
  ConfigSectionDefinition,
  "hue" | "icon"
> {
  hue: string;
  icon: Component;
}

export type SectionSlug = ConfigSlug;

/**
 * The component for each Solar name a section is drawn with. A name the
 * definition gains that is not here throws as this module loads, so every
 * page says so at once rather than one rail row drawing nothing.
 */
const GLYPHS: Record<string, Component> = {
  "shield-check-bold-duotone": IconRules,
  "routing-2-bold-duotone": IconHook,
  "users-group-rounded-bold-duotone": IconAccounts,
  "branching-paths-down-bold-duotone": IconSubagent,
  "code-square-bold-duotone": IconTerminal,
  "plug-circle-bold-duotone": IconToolMcp,
  "bolt-bold-duotone": IconBolt,
  "book-bold-duotone": IconBook,
  "cpu-bold-duotone": IconCpu,
  "dollar-bold-duotone": IconDollar,
  "smartphone-bold-duotone": IconPhone,
  "square-top-down-bold-duotone": IconExternal,
  "download-bold-duotone": IconDownload,
};

const glyphOf = (icon: string): Component => {
  const glyph = GLYPHS[icon];
  if (!glyph) {
    throw new Error(`no rail glyph for the Solar icon ${icon}`);
  }
  return glyph;
};

export const SECTIONS: ConfigSection[] = CONFIG_SECTIONS.map((section) => ({
  ...section,
  icon: glyphOf(section.icon),
  hue: `var(--${section.hue})`,
}));

export const sectionOf = (slug: SectionSlug): ConfigSection =>
  SECTIONS.find((section) => section.slug === slug) as ConfigSection;

/** The rail's groups, in order, each with its sections. */
export const GROUPS = CONFIG_GROUPS.map((group) => ({
  group,
  sections: SECTIONS.filter((section) => section.group === group),
}));

/** Where the Configure sidebar link goes: the section last opened. */
export const LAST_KEY = "cawco.config.last";
