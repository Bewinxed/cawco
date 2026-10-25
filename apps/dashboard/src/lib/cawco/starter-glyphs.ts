import type { Component } from "svelte";
import type { SVGAttributes } from "svelte/elements";
import type { StarterGlyph } from "#lib/cawco/project-tasks.js";
import {
  IconAccounts,
  IconAsk,
  IconBug,
  IconCalendar,
  IconChat,
  IconClock,
  IconColumns,
  IconDocument,
  IconGlobe,
  IconLayers,
  IconMic,
  IconPalette,
  IconPen,
  IconRenew,
  IconRocket,
  IconRulerPen,
  IconSearch,
  IconSend,
  IconSort,
  IconStars,
  IconTaskList,
  IconWindow,
} from "#lib/icons.js";

/**
 * Each kind of work a starter names (the hub's `STARTER_GLYPHS`), as its
 * Solar duotone glyph: each one a mark on its half-ink body (The Solar
 * Duotone Rule), never strokes alone beside a filled one.
 */
export const GLYPHS: Record<
  StarterGlyph,
  Component<SVGAttributes<SVGSVGElement>>
> = {
  brief: IconDocument,
  bug: IconBug,
  calendar: IconCalendar,
  draft: IconPen,
  explore: IconLayers,
  grill: IconAsk,
  ideas: IconStars,
  mail: IconSend,
  palette: IconPalette,
  people: IconAccounts,
  refresh: IconRenew,
  reply: IconChat,
  rocket: IconRocket,
  routine: IconClock,
  screen: IconWindow,
  search: IconSearch,
  site: IconGlobe,
  stages: IconColumns,
  system: IconRulerPen,
  tasks: IconTaskList,
  triage: IconSort,
  voice: IconMic,
};
