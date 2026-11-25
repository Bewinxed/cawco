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
 * one 36px bar where the words stand 9px apart. Here each run of words is
 * left out of boneyard's walk and boned once per line it sets: from its
 * capitals' top down to its baseline, across the words it holds, clipped
 * where the run clips them (`truncate`). A run drawn on a surface of its
 * own (a pill of words) keeps that surface as a container bone under it.
 *
 * Installed on /dev/bones as `window.__BONEYARD_SNAPSHOT`, the function
 * boneyard's CLI calls on each `[data-boneyard]` fixture.
 */

import { FORM_CONTROLS } from "@cawco/core/pin-name";
import type { Bone, SkeletonResult, SnapshotConfig } from "boneyard-js";
import { snapshotBones } from "boneyard-js";

declare global {
  interface Window {
    __BONEYARD_SNAPSHOT?: typeof snapshotBones;
  }
}

/** What marks a run while boneyard walks past it. */
const RUN = "data-ink-run";

/** Elements boneyard bones as one box: their box is their ink. */
const BOXES: ReadonlySet<string> = new Set([
  "img",
  "svg",
  "video",
  "canvas",
  ...FORM_CONTROLS,
]);

export function snapshotInk(
  root: Element,
  name = "component",
  config?: SnapshotConfig
): SkeletonResult {
  const runs: Element[] = [];
  for (const child of root.children) {
    findRuns(child, config, runs);
  }
  for (const run of runs) {
    run.setAttribute(RUN, "");
  }
  try {
    const result = snapshotBones(root, name, {
      ...config,
      excludeSelectors: [...(config?.excludeSelectors ?? []), `[${RUN}]`],
    });
    const frame = root.getBoundingClientRect();
    for (const run of runs) {
      result.bones.push(...runBones(run, frame));
    }
    return result;
  } finally {
    for (const run of runs) {
      run.removeAttribute(RUN);
    }
  }
}

/** Walks as boneyard walks, and keeps each element that sets words. */
function findRuns(
  node: Element,
  config: SnapshotConfig | undefined,
  runs: Element[]
): void {
  if (!shown(node)) {
    return;
  }
  const tag = node.tagName.toLowerCase();
  if (
    BOXES.has(tag) ||
    config?.excludeTags?.includes(tag) ||
    config?.excludeSelectors?.some((selector) => node.matches(selector))
  ) {
    return;
  }
  if (isRun(node)) {
    runs.push(node);
    return;
  }
  for (const child of node.children) {
    findRuns(child, config, runs);
  }
}

/** It holds words, and nothing in it is laid out as a box of its own. */
function isRun(node: Element): boolean {
  if (!node.textContent?.trim()) {
    return false;
  }
  for (const inner of node.querySelectorAll("*")) {
    if (!shown(inner)) {
      continue;
    }
    const { display } = getComputedStyle(inner);
    if (
      BOXES.has(inner.tagName.toLowerCase()) ||
      (display !== "inline" && display !== "contents")
    ) {
      return false;
    }
  }
  return true;
}

function shown(node: Element): boolean {
  const style = getComputedStyle(node);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

interface Line {
  base: number;
  left: number;
  right: number;
  top: number;
}

/** One bone per line the run sets, from cap height to baseline. */
function runBones(run: Element, frame: DOMRect): Bone[] {
  const bones: Bone[] = [];
  const box = run.getBoundingClientRect();
  const style = getComputedStyle(run);
  if (surfaced(style)) {
    bones.push(bone(frame, box.left, box.top, box.right, box.bottom, true));
  }
  const clips = style.overflowX !== "visible";
  for (const line of inkLines(run)) {
    const left = clips ? Math.max(line.left, box.left) : line.left;
    const right = clips ? Math.min(line.right, box.right) : line.right;
    if (right - left >= 1) {
      bones.push(bone(frame, left, line.top, right, line.base, false));
    }
  }
  return bones;
}

/** The run's ink, line by line: its words' extent, capitals' top to baseline. */
function inkLines(run: Element): Line[] {
  const measure = document.createElement("canvas").getContext("2d");
  const lines = new Map<number, Line>();
  const texts = document.createTreeWalker(run, NodeFilter.SHOW_TEXT);
  for (let text = texts.nextNode(); text; text = texts.nextNode()) {
    const holder = text.parentElement;
    if (!(holder && text.textContent?.trim() && measure)) {
      continue;
    }
    const { fontStyle, fontWeight, fontSize, fontFamily } =
      getComputedStyle(holder);
    measure.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
    // A line fragment's rect is its content area, which starts the font's
    // ascent above its baseline; the capital H's ink is the cap height.
    const capital = measure.measureText("H");
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const fragment of range.getClientRects()) {
      if (fragment.width >= 1) {
        const base = fragment.top + capital.fontBoundingBoxAscent;
        const top = base - capital.actualBoundingBoxAscent;
        const key = Math.round(base);
        const line = lines.get(key);
        lines.set(key, {
          left: Math.min(line?.left ?? fragment.left, fragment.left),
          right: Math.max(line?.right ?? fragment.right, fragment.right),
          top: Math.min(line?.top ?? top, top),
          base: Math.max(line?.base ?? base, base),
        });
      }
    }
  }
  return [...lines.values()];
}

/** A surface boneyard bones as a container: a fill, an image, a rounded edge. */
function surfaced(style: CSSStyleDeclaration): boolean {
  const fill = style.backgroundColor;
  const edged =
    (Number.parseFloat(style.borderTopWidth) || 0) > 0 &&
    style.borderTopColor !== "rgba(0, 0, 0, 0)" &&
    (Number.parseFloat(style.borderTopLeftRadius) || 0) > 0;
  return (
    (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") ||
    style.backgroundImage !== "none" ||
    edged
  );
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
