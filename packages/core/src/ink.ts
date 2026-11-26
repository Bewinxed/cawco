/**
 * Ink on any artifact (Projects spec §5.10, D27): what the overlay keeps in
 * an artifact's doc when a pen draws over it, and the bounds the hub keeps
 * it within (hub artifacts/sync.ts).
 *
 * - `ink`: stroke groups by id. A group is the strokes made within two
 *   breaths of each other whose boxes touch. It marks the elements it
 *   encloses (a loop) or crosses (a line), `over`; it is anchored to the one
 *   of them that holds the rest (their nearest container when it is not much
 *   bigger than the marks), else to the first, its points kept as fractions
 *   of that element's box, so a reflow, a resize or a re-publish carries the
 *   ink with the element. An element that keeps its place while what it holds
 *   scrolls is never the anchor of a stroke on that content: the content is;
 *   only one with no elements inside (a `pre`, a `textarea`) is, with its
 *   scroll kept (`scrolled`).
 *   On a canvas the ink is the canvas's own freedraw, and a group names it.
 * - `moved`: groups whose anchor no longer matches anything on the page
 *   (core comments.ts `findAnchor`), kept for the moved tray.
 *
 * A group reaches the session only through a Comment on it, a pin of core
 * comments.ts's: one no comment stands on stays on the page, never
 * delivered (the owner's pick, 2026-11-11: "Only when you comment on it").
 *
 * Every entry is a plain JSON value in its map.
 */

import type { Anchor, PageAnchor } from "./comments/anchor";
import { FILE_SPOT_PROBLEM, fileSpotProblem } from "./comments/validate";

/** A point of a stroke: x and y as fractions of the anchor's box, and the pen's pressure. */
export type InkPoint = [x: number, y: number, pressure: number];

interface InkStroke {
  at: string;
  points: InkPoint[];
}

export interface InkGroup {
  /** What it is drawn over: an element of the page, or a canvas's element. */
  anchor: Anchor;
  at: string;
  /** The group's box, as fractions of the anchor's box. */
  box: { x: number; y: number; w: number; h: number };
  id: string;
  /** On a page: the elements it marks, in document order; `anchor` is one of them or their container. */
  over?: PageAnchor[];
  /** Where the group stood in the page when it was drawn, px. */
  page: { x: number; y: number; w: number; h: number };
  /** On the words the anchor itself scrolls: the anchor's scroll its points were read at, px; they move by what it has scrolled since. */
  scrolled?: { x: number; y: number };
  sentAt?: string;
  strokes: InkStroke[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Why a group may not be kept; null when it may. */
function inkGroupProblem(value: unknown): string | null {
  if (!(isObject(value) && Array.isArray(value.strokes))) {
    return "A stroke group is an object with its strokes.";
  }
  if (value.over !== undefined && !Array.isArray(value.over)) {
    return "A stroke group names the elements it marks as a list.";
  }
  if (isObject(value.anchor) && fileSpotProblem(value.anchor)) {
    return FILE_SPOT_PROBLEM;
  }
  for (const stroke of value.strokes) {
    if (!(isObject(stroke) && Array.isArray(stroke.points))) {
      return "A stroke is an object with its points.";
    }
  }
  return null;
}

/**
 * Why an artifact's ink and moved groups after a person's change may not be
 * kept; null when they may: `changed`, each group it wrote. A group it
 * left stood within these checks already.
 */
export function inkProblem(changed: Iterable<unknown>): string | null {
  for (const group of changed) {
    const problem = inkGroupProblem(group);
    if (problem) {
      return problem;
    }
  }
  return null;
}
