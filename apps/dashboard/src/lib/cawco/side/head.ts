/**
 * A side surface's head controls where the head lacks room for them all
 * (DESIGN.md, Artifact panel, canvas and ink: the head's priority rule, the
 * web's as the native app's): the name keeps its own width up to
 * {@link NAME_KEEPS}px, Close stands last, the rest stand by priority while
 * they fit, and the others go in head order into one More menu before Close.
 */
import type { Snippet } from "svelte";

/** One of the pane's controls: drawn in the head while it fits, else as More's entries. */
export interface HeadItem {
  /** The control as the head draws it. */
  bar: Snippet;
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

/**
 * The controls that stand in a head `room` px wide: all of them when they
 * fit beside what always stands (`kept`: the switch, the name's width and
 * Close), else by priority while they fit beside More (`more` wide), the
 * first that doesn't stopping the rest. `gap` is the head's own between any
 * two.
 */
export function standing(
  room: number,
  gap: number,
  kept: number[],
  more: number,
  items: { key: string; priority: number; width: number }[]
): Set<string> {
  const base = kept.reduce((sum, width) => sum + width + gap, -gap);
  const all = items.reduce((sum, one) => sum + one.width + gap, 0);
  if (base + all <= room) {
    return new Set(items.map((one) => one.key));
  }
  let used = base + gap + more;
  const shown = new Set<string>();
  for (const one of [...items].sort((a, b) => a.priority - b.priority)) {
    if (used + gap + one.width > room) {
      break;
    }
    used += gap + one.width;
    shown.add(one.key);
  }
  return shown;
}
