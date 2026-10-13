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
 * - `moved`: groups whose anchor no longer matches anything on the page,
 *   kept for the comments' "moved" tray.
 * - `pins`: numbered pins on the elements under a group (Annotate), or a
 *   pin with a thread (Comment).
 *
 * Every entry is a plain JSON value in its map.
 */
import type { PreviewElement } from "./index";

export const INK_LIMITS = {
  /** Points one stroke keeps. */
  pointsPerStroke: 2000,
  /** Groups an artifact keeps, placed and moved together. */
  groups: 200,
  /** Pins an artifact keeps. */
  pins: 200,
  /** Strokes one group keeps. Our call. */
  strokesPerGroup: 200,
} as const;

/** A point of a stroke: x and y as fractions of the anchor's box, and the pen's pressure. */
export type InkPoint = [x: number, y: number, pressure: number];

export interface InkStroke {
  at: string;
  points: InkPoint[];
}

/** What a group is drawn over: an element of the page, by its selector and source; or a canvas's element, by id. */
export type InkAnchor =
  | { selector: string; source: PreviewElement["source"] }
  | { element: string };

export interface InkGroup {
  anchor: InkAnchor;
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

/** An element under a pin's ink, as the overlay describes it, without its markup. */
export type PinnedElement = Omit<PreviewElement, "html">;

export interface InkPin {
  anchor: InkAnchor;
  at: string;
  /** The page's elements whose boxes the ink's box crosses; a canvas's, by id. */
  elements: PinnedElement[] | string[];
  id: string;
  /** The group the pin stands on. */
  ink: string;
  kind: "annotation" | "comment";
  /** In order of creation, per artifact, from 1. */
  number: number;
  sentAt?: string;
  /** A comment's replies, oldest first (slice 4b writes them). */
  thread?: unknown[];
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

/** Why a pin may not be kept; null when it may. */
export function inkPinProblem(value: unknown): string | null {
  if (
    !(
      isObject(value) &&
      typeof value.number === "number" &&
      (value.kind === "annotation" || value.kind === "comment") &&
      typeof value.ink === "string"
    )
  ) {
    return "A pin is an object with its number, kind and ink.";
  }
  return null;
}

/** Why an artifact's ink, moved groups and pins after a change may not be kept; null when they may. */
export function inkProblem(
  ink: [string, unknown][],
  moved: [string, unknown][],
  pins: [string, unknown][]
): string | null {
  if (ink.length + moved.length > INK_LIMITS.groups) {
    return `An artifact keeps at most ${INK_LIMITS.groups} stroke groups.`;
  }
  if (pins.length > INK_LIMITS.pins) {
    return `An artifact keeps at most ${INK_LIMITS.pins} pins.`;
  }
  for (const [, group] of [...ink, ...moved]) {
    const problem = inkGroupProblem(group);
    if (problem) {
      return problem;
    }
  }
  for (const [, pin] of pins) {
    const problem = inkPinProblem(pin);
    if (problem) {
      return problem;
    }
  }
  return null;
}
