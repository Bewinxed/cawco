/**
 * A piece's skeleton as drawable layers: a pure function of its captured
 * bones, the shape the slot last showed, and the slot's key, so the server
 * and the browser draw the same markup (no clock, no Math.random).
 *
 * The capture (`bun run bones`, scripts/bones.ts) holds each piece at every
 * box width where its layout changes, under a phone and a desk viewport: a
 * layer from one width to the next, captured at both ends. Here, per layer:
 *
 * - each bone's left, top, width and height are a line in the box's width,
 *   `calc(a·cqi + b px)`, through the layer's two captures, so a part of
 *   fixed size, a part anchored to the right and a picture held at its
 *   ratio all stand where the piece will draw them anywhere in the layer;
 * - each run of words is set to the lines the slot last showed, moving what
 *   the capture saw move when that run gained or lost a line;
 * - a list is its first row's bones repeated by the row count, the list's
 *   own frame grown by each row past the captured two;
 * - each bone takes its kind (the piece's own outline, a shape it holds, a
 *   content outline, words, a mark, a picture's well) and its place in
 *   reading order, and marks, wells and words their seeded drawing.
 */

/** boneyard's compact bone: x % of the box, y px, width %, height px, radius, a container. */
export type Bone = [number, number, number, number, number | string, true?];

/** One capture of the piece at one box width. */
export interface Capture {
  bones: Bone[];
  height: number;
  width: number;
}

/** What one more (or one fewer) line in a run moved, measured at the layer's first width. */
export interface Growth {
  /** The piece's height change. */
  dH: number;
  /** The run's own lines in that state: [x, w] px at the layer's first width, then at its last. */
  lines: [number, number, number, number][];
  /** Every other bone that moved: [index, dy, dh]. */
  moves: [number, number, number][];
  /** A list's first and second row boxes: [dy, dh, dy, dh]. */
  rows?: [number, number, number, number];
}

/** A run of words in a layer's captures. */
export interface RunModel {
  /** How many lines it sets in the capture. */
  count: number;
  /** Its first line's index in the captures' bones. */
  first: number;
  /** One fewer line, where it sets more than one. */
  less?: Growth;
  /** One more line, where it can set one. */
  more?: Growth;
  /** Its line step, px. */
  pitch: number;
}

/** A list captured with two rows of the same data. */
export interface ListModel {
  /** Row one's bones. */
  row: number[];
  /** Row one's and row two's boxes at the layer's first width: [top, bottom], px. */
  rows: [[number, number], [number, number]];
  /** Row two's bones. */
  second: number[];
}

/** One layout of the piece: the box widths it holds from and to. */
export interface LayerModel {
  /** The box width it starts at where that is no whole px (a line wraps at its words' own width). */
  at?: number;
  from: number;
  list?: ListModel;
  runs: RunModel[];
  to: number;
}

/** The captures taken under one viewport: the layouts a media query picks between. */
export interface CaptureSet {
  breakpoints: Record<string, Capture>;
  layers: LayerModel[];
  /** The media query it holds under; null for every other viewport. */
  media: string | null;
}

/** A piece's capture, as scripts/bones.ts writes it. */
export interface PieceBones {
  /** The piece's own width where nothing narrows it, px. */
  natural: number;
  sets: CaptureSet[];
}

/** The shape a slot was last seen in. */
export interface SkeletonShape {
  /** A list's row count. */
  count?: number;
  /** Each run's line count (a list's: one row's). */
  lines?: number[];
}

type Kind = "frame" | "shape" | "outline" | "words" | "mark" | "well";

/** One drawn bone. */
export interface Item {
  /** Its step in the hand-over: the outline first, then rows, left to right. */
  at: number;
  /** Words: the glyph row. */
  glyphs?: string;
  /** Its geometry as CSS lengths in the box's width. */
  h: string;
  /** Its height at the layer's first width, px: a glyph row's size. */
  hpx: number;
  /** A mark: the line icon drawn. */
  icon?: string;
  kind: Kind;
  /** A well: the pattern drawn. */
  pattern?: string;
  /** Its corner radius, px, or a circle. */
  r: number | "circle";
  w: string;
  x: string;
  y: string;
}

/** One layer drawn: shown from `at` px of box width up to the next, under its set's media. */
interface Layer {
  /** The box width it starts at. */
  at: number;
  /** Its first captured width, its key. */
  from: number;
  /** Its height as a CSS length in the box's width. */
  height: string;
  items: Item[];
  /** Its capture set's index. */
  set: number;
}

export interface Drawing {
  layers: Layer[];
  /** Each capture set's media query, by index. */
  media: (string | null)[];
  natural: number;
}

const ICONS = [
  "folder",
  "document",
  "chip",
  "person",
  "globe",
  "tesseract",
  "terminal",
  "key",
] as const;

const PATTERNS = [
  "plus",
  "hatch",
  "waves",
  "honeycomb",
  "rings",
  "chevron",
  "grid",
] as const;

/** Braille's dotted cells, U+2801 to U+28FF: a word's stand-in. */
const GLYPH_FIRST = 0x28_01;
const GLYPH_COUNT = 0xff;
/** A word's glyph step as a share of its ink height: about one per character. */
const GLYPH_STEP = 0.72;
/** Up to this many px on its longer side, a bone with no container is a mark. */
const MARK_MAX = 24;
/** Over this many px on its shorter side, a bone with no container is a picture's well. */
const WELL_MIN = 40;

/** A length in the box's width W: `a`·W + `b`, px. */
interface Fit {
  a: number;
  b: number;
}

/** A bone in fitted geometry. */
interface Fitted {
  /** A container: drawn as a shape or the piece's outline. */
  c: boolean;
  h: Fit;
  r: number | "circle";
  /** Row one or two of a captured list, or neither. */
  row: 0 | 1 | 2;
  /** One line of a run of words. */
  words: boolean;
  w: Fit;
  x: Fit;
  y: Fit;
}

/** FNV-1a over the key, then mulberry32: one seeded stream per key. */
function stream(key: string): () => number {
  let h = 2_166_136_261;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16_777_619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const at = (f: Fit, width: number): number => f.a * width + f.b;
const shift = (f: Fit, by: number): Fit => ({ a: f.a, b: f.b + by });

/** A line through two captures; a layer captured at one width stands still. */
function fit(p1: number, w1: number, p2: number, w2: number): Fit {
  if (w1 === w2) {
    return { a: 0, b: p1 };
  }
  const a = (p2 - p1) / (w2 - w1);
  return { a, b: p1 - a * w1 };
}

const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** A fitted length as CSS in the box's width (the bones' own container). */
function css(f: Fit): string {
  const share = round(f.a * 100, 4);
  const px = round(f.b, 2);
  if (share === 0) {
    return `${px}px`;
  }
  if (px === 0) {
    return `${share}cqi`;
  }
  return `calc(${share}cqi ${px < 0 ? "-" : "+"} ${Math.abs(px)}px)`;
}

function fitted(layer: LayerModel, set: CaptureSet): Fitted[] {
  const one = set.breakpoints[layer.from];
  const two = set.breakpoints[layer.to] ?? one;
  if (!(one && two)) {
    return [];
  }
  const words = new Set<number>();
  for (const run of layer.runs) {
    for (let k = 0; k < run.count; k++) {
      words.add(run.first + k);
    }
  }
  const row1 = new Set(layer.list?.row);
  const row2 = new Set(layer.list?.second);
  const px = (pct: number, width: number) => (pct * width) / 100;
  return one.bones.map((bone, i) => {
    const [x, y, w, h, r, c] = bone;
    const end = two.bones[i] ?? bone;
    return {
      x: fit(px(x, one.width), one.width, px(end[0], two.width), two.width),
      w: fit(px(w, one.width), one.width, px(end[2], two.width), two.width),
      y: fit(y, one.width, end[1], two.width),
      h: fit(h, one.width, end[3], two.width),
      r: r === "50%" ? "circle" : Math.min(Number(r) || 0, h / 2),
      c: c === true,
      words: words.has(i),
      row: row1.has(i) ? 1 : row2.has(i) ? 2 : 0,
    };
  });
}

type Rows = [[number, number], [number, number]];

/**
 * Each run set to the lines the slot last showed. `lines` holds one count
 * per run, or, in a list, one row's counts, set in both captured rows.
 */
function reshape(
  bones: Fitted[],
  layer: LayerModel,
  set: CaptureSet,
  lines: number[] | undefined
): { bones: Fitted[]; dH: number; rows: Rows | null } {
  const list = layer.list?.rows;
  const rows: Rows | null = list
    ? [
        [list[0][0], list[0][1]],
        [list[1][0], list[1][1]],
      ]
    : null;
  const runs = layer.runs;
  const perRow = layer.list ? runs.length / 2 : runs.length;
  const one = set.breakpoints[layer.from];
  const two = set.breakpoints[layer.to] ?? one;
  if (
    !(lines && one && two) ||
    lines.length !== perRow ||
    !Number.isInteger(perRow)
  ) {
    return { bones, dH: 0, rows };
  }
  const out = bones.map((b) => ({ ...b }));
  let dH = 0;
  // First every move, so a run under another that grew stands where that
  // one pushed it; then each run's lines, from its first line's new place.
  const grown: { run: RunModel; want: number; growth: Growth }[] = [];
  runs.forEach((run, k) => {
    const want = lines[k % perRow] ?? run.count;
    const growth =
      want > run.count ? run.more : want < run.count ? run.less : undefined;
    if (want === run.count || !growth || want < 1) {
      return;
    }
    const steps = Math.abs(want - run.count);
    for (const [i, dy, dh] of growth.moves) {
      const b = out[i];
      if (b) {
        b.y = shift(b.y, dy * steps);
        b.h = shift(b.h, dh * steps);
      }
    }
    if (rows && growth.rows) {
      const [dy1, dh1, dy2, dh2] = growth.rows;
      rows[0][0] += dy1 * steps;
      rows[0][1] += (dy1 + dh1) * steps;
      rows[1][0] += dy2 * steps;
      rows[1][1] += (dy2 + dh2) * steps;
    }
    dH += growth.dH * steps;
    grown.push({ run, want, growth });
  });
  /** Each run's new lines, by its first line's index. */
  const placed = new Map<number, Fitted[]>();
  for (const { run, want, growth } of grown) {
    const first = out[run.first];
    if (!first) {
      continue;
    }
    // The lines of the measured state: every one but its last is a whole
    // line, repeated as often as the run is set taller; its last ends it.
    const shapes = growth.lines;
    const last = shapes.length - 1;
    const made: Fitted[] = [];
    for (let n = 0; n < want; n++) {
      const g =
        shapes[n === want - 1 ? last : Math.min(n, Math.max(0, last - 1))];
      if (g) {
        made.push({
          ...first,
          x: fit(g[0], one.width, g[2], two.width),
          w: fit(g[1], one.width, g[3], two.width),
          y: shift(first.y, n * run.pitch),
          words: true,
        });
      }
    }
    placed.set(run.first, made);
  }
  const skip = new Set<number>();
  for (const { run } of grown) {
    for (let k = 0; k < run.count; k++) {
      skip.add(run.first + k);
    }
  }
  const result: Fitted[] = [];
  out.forEach((b, i) => {
    const made = placed.get(i);
    if (made) {
      result.push(...made);
    }
    if (!skip.has(i)) {
      result.push(b);
    }
  });
  return { bones: result, dH, rows };
}

/** A list of `n` rows: row one's bones repeated at the rows' pitch. */
function expand(
  bones: Fitted[],
  rows: Rows,
  n: number,
  width: number
): { bones: Fitted[]; dH: number } {
  const pitch = rows[1][0] - rows[0][0];
  const extra = (n - 2) * pitch;
  const out: Fitted[] = [];
  for (const b of bones) {
    if (b.row === 0) {
      const top = at(b.y, width);
      const bottom = top + at(b.h, width);
      const spans = top <= rows[0][0] + 0.5 && bottom >= rows[1][1] - 0.5;
      const below = top >= rows[1][1] - 0.5;
      out.push({
        ...b,
        h: spans ? shift(b.h, extra) : b.h,
        y: below ? shift(b.y, extra) : b.y,
      });
    }
  }
  const row = bones.filter((b) => b.row === 1);
  for (let k = 0; k < n; k++) {
    for (const b of row) {
      out.push({ ...b, y: shift(b.y, k * pitch) });
    }
  }
  return { bones: out, dH: extra };
}

/** A box's edges, px. */
interface Box {
  b: number;
  l: number;
  r: number;
  t: number;
}

const boxOf = (b: Fitted, width: number): Box => {
  const l = at(b.x, width);
  const t = at(b.y, width);
  return { l, t, r: l + at(b.w, width), b: t + at(b.h, width) };
};

function kindOf(b: Fitted, depth: number, box: Box): Kind {
  if (b.c) {
    return depth === 0 ? "frame" : "shape";
  }
  if (b.words) {
    return "words";
  }
  const w = box.r - box.l;
  const h = box.b - box.t;
  if (b.r === "circle" || Math.max(w, h) <= MARK_MAX) {
    return "mark";
  }
  if (Math.min(w, h) > WELL_MIN) {
    return "well";
  }
  return "outline";
}

/** How many containers hold each bone (of two the same, the later holds). */
function depths(bones: Fitted[], boxes: Box[]): number[] {
  const e = 0.5;
  const same = (p: Box, q: Box) =>
    Math.abs(p.l - q.l) < e &&
    Math.abs(p.r - q.r) < e &&
    Math.abs(p.t - q.t) < e &&
    Math.abs(p.b - q.b) < e;
  return boxes.map((inner, i) => {
    let n = 0;
    boxes.forEach((outer, j) => {
      const holds =
        j !== i &&
        bones[j]?.c === true &&
        outer.l <= inner.l + e &&
        outer.t <= inner.t + e &&
        outer.r >= inner.r - e &&
        outer.b >= inner.b - e &&
        !(same(outer, inner) && j > i);
      n += holds ? 1 : 0;
    });
    return n;
  });
}

/**
 * Reading order: the piece's outlines first (`first`), then row by row, a
 * row being what stands beside the first thing on it; each row starts one
 * step after the last, and each thing in it one step after the one to its
 * left.
 */
function readingSteps(boxes: Box[], first: boolean[]): number[] {
  const steps = new Array<number>(boxes.length).fill(0);
  const rest = boxes
    .map((box, i) => ({ box, i }))
    .filter((it) => !first[it.i])
    .sort((p, q) => p.box.t - q.box.t || p.box.l - q.box.l);
  let row = 0;
  let bottom = Number.NEGATIVE_INFINITY;
  let band: typeof rest = [];
  const flush = () => {
    band
      .sort((p, q) => p.box.l - q.box.l || p.box.t - q.box.t)
      .forEach((it, k) => {
        steps[it.i] = row + 1 + k;
      });
    row += 1;
    band = [];
  };
  for (const it of rest) {
    if (band.length && it.box.t >= bottom) {
      flush();
    }
    if (!band.length) {
      bottom = it.box.b;
    }
    band.push(it);
  }
  if (band.length) {
    flush();
  }
  return steps;
}

function glyphRow(random: () => number, width: number, h: number): string {
  const n = Math.max(2, Math.floor(width / (GLYPH_STEP * h)));
  let s = "";
  for (let k = 0; k < n; k++) {
    s += String.fromCharCode(GLYPH_FIRST + Math.floor(random() * GLYPH_COUNT));
  }
  return s;
}

function drawLayer(
  layer: LayerModel,
  set: CaptureSet,
  index: number,
  shape: SkeletonShape,
  slot: string
): Layer | null {
  const one = set.breakpoints[layer.from];
  const two = set.breakpoints[layer.to] ?? one;
  if (!(one && two)) {
    return null;
  }
  const width = one.width;
  const shaped = reshape(fitted(layer, set), layer, set, shape.lines);
  let bones = shaped.bones;
  let height = shift(
    fit(one.height, one.width, two.height, two.width),
    shaped.dH
  );
  if (layer.list && shaped.rows && shape.count !== undefined) {
    const listed = expand(bones, shaped.rows, Math.max(0, shape.count), width);
    bones = listed.bones;
    height = shift(height, listed.dH);
  }
  const boxes = bones.map((b) => boxOf(b, width));
  const deep = depths(bones, boxes);
  const kinds = bones.map((b, i) =>
    kindOf(b, deep[i] ?? 0, boxes[i] ?? { l: 0, t: 0, r: 0, b: 0 })
  );
  const steps = readingSteps(
    boxes,
    kinds.map((k) => k === "frame")
  );
  // Seeds follow reading order, so a layer drawn for another width picks
  // the same mark for the same place.
  const counts: Record<string, number> = {};
  const next = (kind: string) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return stream(`${slot}|${kind}|${counts[kind]}`);
  };
  const byStep = bones
    .map((_, i) => i)
    .sort((p, q) => (steps[p] ?? 0) - (steps[q] ?? 0) || p - q);
  const items: Item[] = [];
  for (const i of byStep) {
    const b = bones[i];
    const kind = kinds[i];
    if (!(b && kind)) {
      continue;
    }
    const hpx = at(b.h, width);
    // A mark is drawn as a square its bone's height, centred on the bone.
    const x =
      kind === "mark"
        ? { a: b.x.a + (b.w.a - b.h.a) / 2, b: b.x.b + (b.w.b - b.h.b) / 2 }
        : b.x;
    const w = kind === "mark" ? b.h : b.w;
    const item: Item = {
      kind,
      at: steps[i] ?? 0,
      x: css(x),
      y: css(b.y),
      w: css(w),
      h: css(b.h),
      hpx,
      r: b.r,
    };
    if (kind === "mark") {
      item.icon = ICONS[Math.floor(next("mark")() * ICONS.length)];
    } else if (kind === "well") {
      item.pattern = PATTERNS[Math.floor(next("well")() * PATTERNS.length)];
    } else if (kind === "words") {
      item.glyphs = glyphRow(next("words"), at(b.w, two.width), hpx);
    }
    items.push(item);
  }
  return {
    at: layer.at ?? layer.from,
    from: layer.from,
    set: index,
    height: css(height),
    items,
  };
}

/** The piece drawn in the slot's shape, one layer per layout it captured. */
export function draw(
  piece: PieceBones,
  shape: SkeletonShape,
  slot: string
): Drawing {
  const layers: Layer[] = [];
  piece.sets.forEach((set, k) => {
    for (const layer of set.layers) {
      const drawn = drawLayer(layer, set, k, shape, slot);
      if (drawn) {
        layers.push(drawn);
      }
    }
  });
  layers.sort((p, q) => p.set - q.set || p.from - q.from);
  return {
    layers,
    media: piece.sets.map((set) => set.media),
    natural: piece.natural,
  };
}

/** Whether any of its layouts is a list's. */
export const isList = (piece: PieceBones): boolean =>
  piece.sets.some((set) => set.layers.some((layer) => layer.list));

/** How many runs of words one of its rows (or the piece) sets. */
export function runsPerRow(piece: PieceBones): number {
  const layer = piece.sets[0]?.layers[0];
  if (!layer) {
    return 0;
  }
  return layer.list ? layer.runs.length / 2 : layer.runs.length;
}

/**
 * The sheet that shows one layer, as the `<style>` element the skeleton
 * draws before its layers: under each set's media, the narrowest of its
 * layers by default, then each from its own first width up, by a container
 * query on the layers' box. The set with no media holds wherever no other
 * set's does. Each width is the capture's, known only at run time, which no
 * class Tailwind compiles can say
 * (tailwindcss.com/docs/detecting-classes-in-source-files#dynamic-class-names).
 */
export function layerStyle(key: string, drawing: Drawing): string {
  const base = `[data-bones="${key}"]>[data-from]`;
  const others = drawing.media.filter((m): m is string => m !== null);
  let sheet = `${base}{display:none}`;
  drawing.media.forEach((media, set) => {
    const layers = drawing.layers.filter((l) => l.set === set);
    const first = layers[0];
    if (!first) {
      return;
    }
    const of = (l: Layer) => `${base}[data-set="${set}"][data-from="${l.from}"]`;
    let rules = `${of(first)}{display:block}`;
    for (let k = 1; k < layers.length; k++) {
      const prev = layers[k - 1];
      const layer = layers[k];
      if (prev && layer) {
        rules += `@container (min-width:${layer.at}px){${of(prev)}{display:none}${of(layer)}{display:block}}`;
      }
    }
    const when =
      media ??
      (others.length
        ? `not (${others.map((other) => `(${other})`).join(" or ")})`
        : null);
    sheet += when ? `@media ${when}{${rules}}` : rules;
  });
  return `<style>${sheet}</style>`;
}
