/**
 * A side surface's head controls where the head lacks room for them all
 * (DESIGN.md, Artifact panel, canvas and ink: the head's priority rule, the
 * web's as the native app's): the name keeps its own width up to
 * {@link NAME_KEEPS}px, Close stands last, the rest stand by priority while
 * they fit, a control with a one-button form (the mode) taking it before it
 * would go, and the others go in head order into one More menu before Close.
 */
import type { Snippet } from "svelte";

/** One of the pane's controls: drawn in the head while it fits, else as More's entries. */
export interface HeadItem {
  /** The control as the head draws it. */
  bar: Snippet;
  /** Its one-button form, taken where the head has no room for `bar` and before it would go to More (the mode's chosen glyph opening the three). */
  compact?: Snippet;
  /** Said on More while this stands in it (Comments' open count). */
  count?: number;
  /** More rules it off from its neighbours: a group of entries (the mode, the canvas view). */
  group?: boolean;
  key: string;
  /** The same control as More's entries. */
  menu: Snippet;
  /** Its place in {@link HEAD_PRIORITY}: the lower stands while the higher goes to More. */
  priority: number;
}

/** The order the controls give up the head, first kept first (Send picks, the mode, Comments, Expand, Reload, Inspect, the canvas view, Undock, Open in new tab, New canvas). */
export const HEAD_PRIORITY = {
  send: 1,
  mode: 2,
  comments: 3,
  expand: 4,
  reload: 5,
  inspect: 6,
  view: 7,
  undock: 8,
  open: 9,
  create: 10,
} as const;

/** The name keeps its own width up to this, in px, before any control stands. */
export const NAME_KEEPS = 120;

/** How a control stands in the head: whole, or in its one-button form. */
export type Standing = "whole" | "compact";

/**
 * The controls that stand in a head `room` px wide, and how: all of them
 * whole when they fit beside what always stands (`kept`: the switch, the
 * name's width and Close), else by priority beside More (`more` wide), each
 * whole where it fits, else in its one-button form (`compact` wide) where
 * that fits, the first that fits neither way stopping the rest. `gap` is
 * the head's own between any two.
 */
export function standing(
  room: number,
  gap: number,
  kept: number[],
  more: number,
  items: { compact?: number; key: string; priority: number; width: number }[]
): Map<string, Standing> {
  const base = kept.reduce((sum, width) => sum + width + gap, -gap);
  const all = items.reduce((sum, one) => sum + one.width + gap, 0);
  if (base + all <= room) {
    return new Map(items.map((one) => [one.key, "whole"]));
  }
  let used = base + gap + more;
  const shown = new Map<string, Standing>();
  for (const one of [...items].sort((a, b) => a.priority - b.priority)) {
    if (used + gap + one.width <= room) {
      used += gap + one.width;
      shown.set(one.key, "whole");
    } else if (one.compact !== undefined && used + gap + one.compact <= room) {
      used += gap + one.compact;
      shown.set(one.key, "compact");
    } else {
      break;
    }
  }
  return shown;
}
