/**
 * Ink on any artifact (Projects spec §5.10, D27): what the overlay keeps in
 * an artifact's doc when a pen draws over it, and the bounds the hub keeps
 * it within (hub artifacts/sync.ts).
 *
 * - `ink`: stroke groups by id. A group is the strokes made within two
 *   breaths of each other whose boxes touch, anchored to the deepest element
 *   containing its box, its points kept as fractions of that element's box,
 *   so a reflow, a resize or a re-publish carries the ink with the element.
 *   On a canvas the ink is the canvas's own freedraw, and a group names it.
 * - `moved`: groups whose anchor no longer matches anything on the page
 *   (core comments.ts `findAnchor`), kept for the moved tray.
 *
 * The pins on a group (Annotate, Comment) are core comments.ts's.
 *
 * Every entry is a plain JSON value in its map.
 */
import type { Anchor } from "./comments";

export const INK_LIMITS = {
  /** Points one stroke keeps. */
  pointsPerStroke: 2000,
  /** Groups an artifact keeps, placed and moved together. */
  groups: 200,
  /** Strokes one group keeps. Our call. */
  strokesPerGroup: 200,
} as const;

/** A point of a stroke: x and y as fractions of the anchor's box, and the pen's pressure. */
export type InkPoint = [x: number, y: number, pressure: number];

export interface InkStroke {
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
  /** Marked a picture, bound to nothing (Illustrate). */
  illustration?: true;
  /** Where the group stood in the page when it was drawn, px. */
  page: { x: number; y: number; w: number; h: number };
  sentAt?: string;
  strokes: InkStroke[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Why a group may not be kept; null when it may. */
export function inkGroupProblem(value: unknown): string | null {
  if (!(isObject(value) && Array.isArray(value.strokes))) {
    return "A stroke group is an object with its strokes.";
  }
  if (value.strokes.length > INK_LIMITS.strokesPerGroup) {
    return `A stroke group keeps at most ${INK_LIMITS.strokesPerGroup} strokes.`;
  }
  for (const stroke of value.strokes) {
    if (!(isObject(stroke) && Array.isArray(stroke.points))) {
      return "A stroke is an object with its points.";
    }
    if (stroke.points.length > INK_LIMITS.pointsPerStroke) {
      return `A stroke keeps at most ${INK_LIMITS.pointsPerStroke} points.`;
    }
  }
  return null;
}

/** Why an artifact's ink and moved groups after a change may not be kept; null when they may. */
export function inkProblem(
  ink: [string, unknown][],
  moved: [string, unknown][]
): string | null {
  if (ink.length + moved.length > INK_LIMITS.groups) {
    return `An artifact keeps at most ${INK_LIMITS.groups} stroke groups.`;
  }
  for (const [, group] of [...ink, ...moved]) {
    const problem = inkGroupProblem(group);
    if (problem) {
      return problem;
    }
  }
  return null;
}
