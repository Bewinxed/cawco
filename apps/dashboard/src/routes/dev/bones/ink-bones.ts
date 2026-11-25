/**
 * The capture's measure: boneyard's `snapshotBones`, with every run of words
 * boned at its ink instead of at its box.
 *
 * boneyard bones each leaf at `getBoundingClientRect()`, its border box. For
 * an element of words that box is its line boxes: the whole line height
 * (the leading above the capitals and below the baseline included) and, for
 * a block, the whole width of its column. Lines set solid, as the type roles
 * set them (`type-label` 14px on a 20px line, `type-meta` 12px on 16px, no
 * gap between), give boxes that touch, so a row's name and its meta were
 * one 36px bar where the words stand 9px apart. Here each run of words
 * (skeleton/bones/ink.ts) is left out of boneyard's walk and boned once per
 * line it sets: from its capitals' top down to its baseline, across the
 * words it holds, clipped where the run clips them (`truncate`). A run drawn
 * on a surface of its own (a pill of words) keeps that surface as a
 * container bone under it.
 *
 * The capture on /dev/bones (capture.ts) reads every piece with it, and
 * learns from it which bones are which run's lines.
 */

import type { Bone, SkeletonResult, SnapshotConfig } from "boneyard-js";
import { snapshotBones } from "boneyard-js";
import {
  findRuns,
  inkLines,
  surfaced,
} from "#lib/components/ui/skeleton/bones/ink.js";

/** What marks a run while boneyard walks past it. */
const RUN = "data-ink-run";

/** Where one run's line bones stand in the result's bones. */
export interface RunBones {
  /** How many lines it sets. */
  count: number;
  /** Its first line's index in `bones`. */
  first: number;
  /** The run's element. */
  run: Element;
}

/** The snapshot, and where each run's lines stand in it. */
export function snapshotRuns(
  root: Element,
  name = "component",
  config?: SnapshotConfig
): { result: SkeletonResult; runs: RunBones[] } {
  const runs = findRuns(root, config);
  for (const run of runs) {
    run.setAttribute(RUN, "");
  }
  try {
    const result = snapshotBones(root, name, {
      ...config,
      excludeSelectors: [...(config?.excludeSelectors ?? []), `[${RUN}]`],
    });
    const frame = root.getBoundingClientRect();
    const placed: RunBones[] = [];
    for (const run of runs) {
      const { surface, lines } = runBones(run, frame);
      if (surface) {
        result.bones.push(surface);
      }
      placed.push({ run, first: result.bones.length, count: lines.length });
      result.bones.push(...lines);
    }
    return { result, runs: placed };
  } finally {
    for (const run of runs) {
      run.removeAttribute(RUN);
    }
  }
}

/** The run's surface, when it has one, and one bone per line it sets. */
function runBones(
  run: Element,
  frame: DOMRect
): { surface: Bone | null; lines: Bone[] } {
  const box = run.getBoundingClientRect();
  const style = getComputedStyle(run);
  const surface = surfaced(style)
    ? bone(frame, box.left, box.top, box.right, box.bottom, true)
    : null;
  const clips = style.overflowX !== "visible";
  const lines: Bone[] = [];
  for (const line of inkLines(run)) {
    const left = clips ? Math.max(line.left, box.left) : line.left;
    const right = clips ? Math.min(line.right, box.right) : line.right;
    if (right - left >= 1) {
      lines.push(bone(frame, left, line.top, right, line.base, false));
    }
  }
  return { surface, lines };
}

/** A bone in boneyard's units: x and width in % of the frame, y and height in px. */
function bone(
  frame: DOMRect,
  left: number,
  top: number,
  right: number,
  bottom: number,
  container: boolean
): Bone {
  const { width } = frame;
  return {
    x: width > 0 ? +(((left - frame.left) / width) * 100).toFixed(4) : 0,
    y: Math.round(top - frame.top),
    w: width > 0 ? +(((right - left) / width) * 100).toFixed(4) : 0,
    h: Math.max(1, Math.round(bottom - top)),
    r: 8,
    ...(container ? { c: true } : {}),
  };
}
