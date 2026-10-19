/**
 * A side surface's head controls where the head lacks room for them all
 * (DESIGN.md, Artifact panel, canvas and ink: the head's priority rule, the
 * web's as the native app's): the name keeps its own width up to
 * {@link NAME_KEEPS}px, Close stands last, the rest stand by priority while
 * they fit, each in its narrowest form (the mode as its one button), any
 * with no room going in head order into one More menu before Close; the
 * mode takes its three segments back when the room left holds them.
 */
import type { Snippet } from "svelte";

/** One of the pane's controls: drawn in the head while it fits, else as More's entries. */
export interface HeadItem {
  /** The control as the head draws it. */
  bar: Snippet;
  /** Its one-button form (the mode's chosen glyph opening the three): its narrowest, taken first, `bar` once the room left holds it. */
  compact?: Snippet;
  /** Its count, said on More while this stands in it and the count is above 0 (Comments' open pins), under the name `of` gives it. */
  count?: { n: number; of: string };
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

interface Sized {
  compact?: number;
  key: string;
  priority: number;
  width: number;
}

/**
 * The controls that stand in a head `room` px wide, and how. All of them
 * whole when they fit beside what always stands (`kept`: the switch, the
 * name's width and Close). Else, beside More (`more` wide), by priority,
 * each in its narrowest form (the mode as its one button) where it fits, a
 * control with no room skipped and the lower ones still placed; then a
 * control standing in its one-button form takes its whole form back where
 * the room left holds the difference. Priority decides which stand, and
 * form only after, so a wider head stands every control a narrower one
 * does. `gap` is the head's own between any two.
 */
export function standing(
  room: number,
  gap: number,
  kept: number[],
  more: number,
  items: Sized[]
): Map<string, Standing> {
  const base = kept.reduce((sum, width) => sum + width + gap, -gap);
  const all = items.reduce((sum, one) => sum + one.width + gap, 0);
  if (base + all <= room) {
    return new Map(items.map((one) => [one.key, "whole"]));
  }
  const ranked = [...items].sort((a, b) => a.priority - b.priority);
  let left = room - (base + gap + more);
  const shown = new Map<string, Standing>();
  for (const one of ranked) {
    const narrowest = Math.min(one.width, one.compact ?? one.width);
    if (gap + narrowest > left) {
      continue;
    }
    left -= gap + narrowest;
    shown.set(one.key, narrowest < one.width ? "compact" : "whole");
  }
  for (const one of ranked) {
    const back = one.width - (one.compact ?? one.width);
    if (shown.get(one.key) === "compact" && back <= left) {
      left -= back;
      shown.set(one.key, "whole");
    }
  }
  return shown;
}
