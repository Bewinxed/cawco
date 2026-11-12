/**
 * A stage's look on the board (stages.md `color:` and `icon:`, hub
 * stages.ts): its glyph by the plain word stages.md names it by, from the
 * house's Solar set (DESIGN.md, The Solar Duotone Rule), and its colour, a
 * section hue (DESIGN.md, Identity). Both records are total over core's
 * lists, so a word added there is a type error here until it has its glyph.
 */
import type { StageColor, StageIcon, StageKind } from "@cawco/core/views";
import type { Component } from "svelte";
import {
  IconArchive,
  IconBolt,
  IconBook,
  IconCalendar,
  IconChat,
  IconClock,
  IconDocuments,
  IconDollar,
  IconEye,
  IconGlobe,
  IconGraphUp,
  IconHourglass,
  IconLab,
  IconListCheck,
  IconMapPoint,
  IconPalette,
  IconPen,
  IconPhone,
  IconPin,
  IconRocket,
  IconSearch,
  IconSend,
  IconSparkles,
  IconSuccess,
  IconToolCode,
  IconTrash,
  IconUser,
} from "#lib/icons.js";

export const STAGE_GLYPHS: Record<StageIcon, Component> = {
  inbox: IconDocuments,
  idea: IconSparkles,
  search: IconSearch,
  pen: IconPen,
  chat: IconChat,
  eye: IconEye,
  clock: IconClock,
  hourglass: IconHourglass,
  calendar: IconCalendar,
  send: IconSend,
  rocket: IconRocket,
  code: IconToolCode,
  palette: IconPalette,
  graph: IconGraphUp,
  user: IconUser,
  globe: IconGlobe,
  book: IconBook,
  pin: IconPin,
  bolt: IconBolt,
  list: IconListCheck,
  lab: IconLab,
  map: IconMapPoint,
  phone: IconPhone,
  money: IconDollar,
  done: IconSuccess,
  archive: IconArchive,
  trash: IconTrash,
};

/** Each colour's section hue token; a stage with none takes the muted ink. */
export const STAGE_HUES: Record<StageColor, string> = {
  cyan: "var(--color-hue-cyan-500)",
  amber: "var(--color-hue-amber-500)",
  orange: "var(--color-hue-orange-500)",
  green: "var(--color-hue-green-500)",
};

/**
 * The glyph a stage with no look of its own stands with, by its kind, in
 * the muted ink: every stage keeps its mark's slot, so every name stands on
 * one edge, a stage just added among the rest. (A `you` stage draws the
 * Needs-you glyph whatever its look.)
 */
const KIND_GLYPHS: Record<StageKind, StageIcon> = {
  todo: "inbox",
  active: "bolt",
  waiting: "hourglass",
  you: "user",
  done: "done",
  dropped: "trash",
};

/** A stage's glyph and its ink: its own look, else its kind's glyph in the muted ink. */
export function markOf(stage: {
  color?: StageColor;
  icon?: StageIcon;
  kind: StageKind;
}): { glyph: Component; hue: string } {
  return {
    glyph: STAGE_GLYPHS[stage.icon ?? KIND_GLYPHS[stage.kind]],
    hue:
      stage.color && stage.icon
        ? STAGE_HUES[stage.color]
        : "var(--color-ink-muted)",
  };
}
