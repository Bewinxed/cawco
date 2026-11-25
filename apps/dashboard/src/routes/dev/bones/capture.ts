/**
 * The capture `bun run bones` (scripts/bones.ts) runs on /dev/bones, in the
 * browser, under one viewport at a time: each piece drawn by its fixture in
 * a box whose width it sweeps, one px at a time, read at every width with
 * boneyard's snapshot (ink-bones.ts). It answers, per piece:
 *
 * - its layers: the widths where its layout holds, a new one wherever a
 *   bone appears or goes, changes kind, or stops moving on one line in the
 *   box's width (a line wraps, a truncated word stops growing), each with
 *   its captures at both ends;
 * - per layer, each run of words: its line step, and what one more and one
 *   fewer line moved (the run's words grown or cut until it sets one more
 *   or one fewer line, read again, and put back);
 * - per layer, a list's two rows (`data-bones-row`), whose first is the row
 *   the skeleton repeats;
 * - its natural width, in a box that does not narrow it;
 * - a digest of every width's layout, so the script can tell whether two
 *   viewports draw it alike.
 */

import { normalizeBone } from "boneyard-js";
import type {
  Bone,
  Capture,
  Growth,
  LayerModel,
  ListModel,
  RunModel,
} from "#lib/components/ui/skeleton/bones/draw.js";
import { inkLines } from "#lib/components/ui/skeleton/bones/ink.js";
import { type RunBones, snapshotRuns } from "./ink-bones.js";

/** What the capture answers for one piece under one viewport. */
export interface PieceCapture {
  breakpoints: Record<string, Capture>;
  /** One layout digest per swept width, narrowest first. */
  digests: string[];
  layers: LayerModel[];
  natural: number;
}

declare global {
  interface Window {
    __bonesCapture?: (from: number, to: number) => Record<string, PieceCapture>;
  }
}

/** Within this many px of the line through a layer's ends, a coordinate keeps the layer: boneyard rounds tops and heights to whole px, so a line read at its two rounded ends stands up to 1px off its rounded middle. */
const TOLERANCE = 1;
/** How many words a run may be grown or cut by to set one more or one fewer line. */
const MOST_WORDS = 400;
const SPACES = /\s+/u;
/** A run's last word and the spaces around it. */
const LAST_WORD = /\s*\S+\s*$/u;

interface Shot {
  bones: Bone[];
  height: number;
  runs: RunBones[];
  width: number;
}

function shot(target: Element, name: string): Shot {
  const { result, runs } = snapshotRuns(target, name);
  return {
    width: result.width,
    height: result.height,
    runs,
    bones: result.bones.map((any) => {
      const b = normalizeBone(any);
      const bone: Bone = [b.x, b.y, b.w, b.h, b.r];
      if (b.c) {
        bone.push(true);
      }
      return bone;
    }),
  };
}

/** A bone's box in px. */
const px = (b: Bone, width: number): [number, number, number, number] => [
  (b[0] * width) / 100,
  b[1],
  (b[2] * width) / 100,
  b[3],
];

/** The layout's structure: what a layer holds the same at every width. */
const structure = (s: Shot): string =>
  s.bones.map((b) => `${b[4]}${b[5] ? "c" : ""}`).join(",");

/** Whether `mid` lies within the tolerance of the line from `p` to `q`, at `t` along it. */
const near = (p: number, q: number, mid: number, t: number): boolean =>
  Math.abs(p + (q - p) * t - mid) <= TOLERANCE;

/** Every coordinate of `mid`'s bones lies on the line from `one`'s to `two`'s. */
function between(one: Shot, two: Shot, mid: Shot): boolean {
  const span = two.width - one.width;
  const t = span === 0 ? 0 : (mid.width - one.width) / span;
  if (!near(one.height, two.height, mid.height, t)) {
    return false;
  }
  return one.bones.every((p, i) => {
    const q = two.bones[i];
    const m = mid.bones[i];
    if (!(q && m)) {
      return false;
    }
    const pp = px(p, one.width);
    const qq = px(q, two.width);
    const mm = px(m, mid.width);
    return pp.every((c, k) => near(c, qq[k] ?? c, mm[k] ?? c, t));
  });
}

/** Every coordinate of every sample between `a` and `b` lies on their line. */
function collinear(samples: Shot[], a: number, b: number): boolean {
  const one = samples[a];
  const two = samples[b];
  if (!(one && two)) {
    return false;
  }
  return samples.slice(a + 1, b).every((mid) => between(one, two, mid));
}

/** The sweep cut into layers: [first index, last index]. */
function layersOf(samples: Shot[]): [number, number][] {
  const out: [number, number][] = [];
  let start = 0;
  for (let j = 1; j <= samples.length; j += 1) {
    const next = samples[j];
    const head = samples[start];
    const keeps =
      next &&
      head &&
      structure(next) === structure(head) &&
      collinear(samples, start, j);
    if (!keeps) {
      out.push([start, j - 1]);
      start = j;
    }
  }
  return out;
}

function textsOf(run: Element): Text[] {
  const texts: Text[] = [];
  const walker = document.createTreeWalker(run, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t instanceof Text && t.data.trim()) {
      texts.push(t);
    }
  }
  return texts;
}

/**
 * Sets the run to `want` lines by growing its last words or cutting them,
 * a word at a time; answers how to put it back, or null where no number of
 * words sets it so (a truncated line, a word longer than its box).
 */
function setLines(run: Element, want: number): (() => void) | null {
  const texts = textsOf(run);
  const kept = texts.map((t) => t.data);
  const restore = () => {
    texts.forEach((t, k) => {
      t.data = kept[k] ?? t.data;
    });
  };
  const words = (run.textContent ?? "").trim().split(SPACES);
  let count = inkLines(run).length;
  for (let k = 0; k < MOST_WORDS && count !== want; k += 1) {
    if (count < want) {
      const last = texts.at(-1);
      if (!last) {
        break;
      }
      last.data += ` ${words[k % words.length]}`;
    } else {
      const last = texts.findLast((t) => t.data.trim());
      if (!last) {
        break;
      }
      last.data = last.data.replace(LAST_WORD, "");
    }
    count = inkLines(run).length;
  }
  if (count !== want) {
    restore();
    return null;
  }
  return restore;
}

/** Each list row's box, relative to the piece. */
function rowsOf(target: Element): [number, number][] {
  const { top } = target.getBoundingClientRect();
  return [...target.querySelectorAll("[data-bones-row]")].map((row) => {
    const r = row.getBoundingClientRect();
    return [r.top - top, r.bottom - top];
  });
}

interface Fixture {
  box: HTMLElement;
  name: string;
  target: Element;
}

/** What one more or one fewer line in run `k` moved, at the layer's two widths. */
function growth(
  fixture: Fixture,
  k: number,
  by: 1 | -1,
  base: Shot,
  ends: [number, number]
): Growth | undefined {
  const { box, name, target } = fixture;
  const run = base.runs[k];
  if (!run) {
    return undefined;
  }
  const want = run.count + by;
  if (want < 1) {
    return undefined;
  }
  const lines: [number, number][][] = [];
  let moved: Growth | undefined;
  for (const [n, width] of ends.entries()) {
    box.style.width = `${width}px`;
    const before = n === 0 ? base : shot(target, name);
    const rowsBefore = rowsOf(target);
    const here = before.runs[k];
    if (!here) {
      return undefined;
    }
    const restore = setLines(here.run, want);
    if (!restore) {
      return undefined;
    }
    const after = shot(target, name);
    const rowsAfter = rowsOf(target);
    restore();
    if (after.bones.length !== before.bones.length + by) {
      return undefined;
    }
    lines.push(
      after.bones
        .slice(here.first, here.first + want)
        .map((b) => [(b[0] * after.width) / 100, (b[2] * after.width) / 100])
    );
    if (n === 0) {
      const moves: [number, number, number][] = [];
      before.bones.forEach((b, i) => {
        if (i >= here.first && i < here.first + here.count) {
          return;
        }
        const j = i < here.first ? i : i + by;
        const a = after.bones[j];
        if (a && (a[1] !== b[1] || a[3] !== b[3])) {
          moves.push([i, a[1] - b[1], a[3] - b[3]]);
        }
      });
      moved = { dH: after.height - before.height, moves, lines: [] };
      const [r1, r2] = rowsBefore;
      const [s1, s2] = rowsAfter;
      if (r1 && r2 && s1 && s2) {
        moved.rows = [
          s1[0] - r1[0],
          s1[1] - s1[0] - (r1[1] - r1[0]),
          s2[0] - r2[0],
          s2[1] - s2[0] - (r2[1] - r2[0]),
        ];
      }
    }
  }
  const [one, two] = lines;
  if (!(moved && one)) {
    return undefined;
  }
  moved.lines = one.map((l, i) => {
    const end = two?.[i] ?? l;
    return [l[0], l[1], end[0], end[1]];
  });
  return moved;
}

function pitchOf(run: Element): number {
  const style = getComputedStyle(run);
  const line = Number.parseFloat(style.lineHeight);
  return Number.isFinite(line) ? line : Number.parseFloat(style.fontSize) * 1.2;
}

function listOf(target: Element, base: Shot): ListModel | undefined {
  const rows = rowsOf(target);
  const [r1, r2] = rows;
  if (rows.length !== 2 || !(r1 && r2)) {
    return undefined;
  }
  const within = (row: [number, number]) =>
    base.bones
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b[1] >= row[0] - 0.5 && b[1] + b[3] <= row[1] + 0.5)
      .map(({ i }) => i);
  return { rows: [r1, r2], row: within(r1), second: within(r2) };
}

/** Where each bone stands up and down: what a wrap moves, beside the structure. */
const rows = (s: Shot): string =>
  `${structure(s)}|${s.height}|${s.bones.map((b) => `${b[1]},${b[3]}`).join(";")}`;

/** Chrome lays boxes out in 64ths of a px (LayoutUnit). */
const LAYOUT_UNIT = 1 / 64;

/**
 * The box width, to a 64th of a px, where the layout read at `below` px
 * gives way to the one at `above` (a line wraps at its words' own width,
 * which is no whole px).
 */
function threshold(fixture: Fixture, below: number, above: number): number {
  const { box, name, target } = fixture;
  box.style.width = `${below}px`;
  const was = rows(shot(target, name));
  let lo = below;
  let hi = above;
  while (hi - lo > LAYOUT_UNIT) {
    const mid = (lo + hi) / 2;
    box.style.width = `${mid}px`;
    if (rows(shot(target, name)) === was) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

function capturePiece(
  fixture: Fixture,
  samples: Shot[]
): Omit<PieceCapture, "natural"> {
  const { box, name, target } = fixture;
  const breakpoints: Record<string, Capture> = {};
  const layers: LayerModel[] = [];
  let before: [Shot, Shot] | null = null;
  for (const [a, b] of layersOf(samples)) {
    const one = samples[a];
    const two = samples[b];
    if (!(one && two)) {
      continue;
    }
    // Where the layer before held its rows still and this one moves them,
    // the change is a wrap: found to the sub-px it happens at. A change in
    // a layer whose rows move with the width (a picture held at its ratio)
    // or one that moves nothing up or down (a word stops being cut) has no
    // such point, and starts at its first whole px.
    const wraps =
      before !== null &&
      rows(before[0]) === rows(before[1]) &&
      rows(before[1]) !== rows(one);
    const at =
      wraps && before ? threshold(fixture, before[1].width, one.width) : null;
    before = [one, two];
    breakpoints[one.width] = {
      width: one.width,
      height: one.height,
      bones: one.bones,
    };
    breakpoints[two.width] = {
      width: two.width,
      height: two.height,
      bones: two.bones,
    };
    box.style.width = `${one.width}px`;
    const base = shot(target, name);
    const list = listOf(target, base);
    const ends: [number, number] = [one.width, two.width];
    const runs: RunModel[] = base.runs.map((run, k) => {
      const model: RunModel = {
        first: run.first,
        count: run.count,
        pitch: pitchOf(run.run),
      };
      const more = growth(fixture, k, 1, base, ends);
      if (more) {
        model.more = more;
      }
      box.style.width = `${one.width}px`;
      const less = growth(fixture, k, -1, base, ends);
      if (less) {
        model.less = less;
      }
      box.style.width = `${one.width}px`;
      return model;
    });
    layers.push({
      ...(at === null || at === one.width ? {} : { at }),
      from: one.width,
      to: two.width,
      runs,
      ...(list ? { list } : {}),
    });
  }
  const digests = samples.map((s) =>
    JSON.stringify([
      s.height,
      s.bones.map((b) => px(b, s.width).map(Math.round)),
    ])
  );
  return { breakpoints, layers, digests };
}

/** Sweeps every piece on the page from `from` to `to` px of box width. */
function capture(from: number, to: number): Record<string, PieceCapture> {
  const fixtures: Fixture[] = [
    ...document.querySelectorAll<HTMLElement>("[data-bones-piece]"),
  ].flatMap((box) => {
    const target = box.firstElementChild;
    const name = box.dataset.bonesPiece;
    return target && name ? [{ box, name, target }] : [];
  });
  const samples = new Map<string, Shot[]>(fixtures.map((f) => [f.name, []]));
  for (let width = from; width <= to; width += 1) {
    for (const f of fixtures) {
      f.box.style.width = `${width}px`;
    }
    for (const f of fixtures) {
      samples.get(f.name)?.push(shot(f.target, f.name));
    }
  }
  const out: Record<string, PieceCapture> = {};
  for (const f of fixtures) {
    const captured = capturePiece(f, samples.get(f.name) ?? []);
    f.box.style.width = "max-content";
    const natural =
      Math.round(f.target.getBoundingClientRect().width / LAYOUT_UNIT) *
      LAYOUT_UNIT;
    f.box.style.width = "";
    out[f.name] = { ...captured, natural };
  }
  return out;
}

export function installCapture(): void {
  window.__bonesCapture = capture;
}
