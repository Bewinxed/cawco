/**
 * Ink: the pixel readers for what drawing alone decides (a contrast ratio, a
 * seam's stroke, a glow, a colour as composited), lifted from the proofs
 * they served. A capture is decoded once, here (pngjs), and every reading of
 * it is plain arithmetic. Anything the engine can say (a box, an opacity, a
 * computed colour) is read from the engine instead (geom.ts, anim.ts).
 */
import type { Page } from "playwright-core";
import { PNG } from "pngjs";

export type Rgb = [number, number, number];

/** A capture's pixels: RGBA in device px, and where its top-left stands in css px. */
export interface Raster {
  data: Buffer;
  height: number;
  scale: number;
  width: number;
  x: number;
  y: number;
}

/** Captures the viewport (or `clip`, css px) as the screen draws it, animations as they stand. */
export async function capture(
  page: Page,
  clip?: { height: number; width: number; x: number; y: number }
): Promise<Raster> {
  const png = PNG.sync.read(
    await page.screenshot({ clip, animations: "allow", caret: "hide" })
  );
  const cssWidth = clip?.width ?? page.viewportSize()?.width ?? png.width;
  return {
    data: png.data,
    width: png.width,
    height: png.height,
    scale: png.width / cssWidth,
    x: clip?.x ?? 0,
    y: clip?.y ?? 0,
  };
}

/** The pixel at device px (x, y), clamped into the capture. */
export function px(r: Raster, x: number, y: number): Rgb {
  const cx = Math.min(r.width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(r.height - 1, Math.max(0, Math.round(y)));
  const k = (cy * r.width + cx) * 4;
  return [r.data[k] ?? 0, r.data[k + 1] ?? 0, r.data[k + 2] ?? 0];
}

/** Device px for a page css x, and y. */
export const dx = (r: Raster, cssX: number): number => (cssX - r.x) * r.scale;
export const dy = (r: Raster, cssY: number): number => (cssY - r.y) * r.scale;

/** The pixel at page css px (x, y). */
export const at = (r: Raster, x: number, y: number): Rgb =>
  px(r, dx(r, x), dy(r, y));

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance. */
export const luminance = ([r, g, b]: Rgb): number =>
  0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** CIE76 ΔE in Lab (D65) between two sRGB colours. */
export function deltaE(a: Rgb, b: Rgb): number {
  const lab = ([r, g, bl]: Rgb): Rgb => {
    const [R, G, B] = [lin(r), lin(g), lin(bl)];
    const x = (0.412_456_4 * R + 0.357_576_1 * G + 0.180_437_5 * B) / 0.950_47;
    const y = 0.212_672_9 * R + 0.715_152_2 * G + 0.072_175 * B;
    const z = (0.019_333_9 * R + 0.119_192 * G + 0.950_304_1 * B) / 1.088_83;
    const f = (t: number) =>
      t > 216 / 24_389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** How far two colours stand apart, the channels' differences summed (0 to 765). */
export const off = (a: Rgb, b: Rgb): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** The ink one capture has over another at device px (x, y): 0 to 765. */
export const inkOver = (p: Raster, q: Raster, x: number, y: number): number =>
  off(px(p, x, y), px(q, x, y));

/** Computed CSS colours as the browser composites them over black: rgb 0 to 255. */
export function colours(page: Page, css: string[]): Promise<Rgb[]> {
  return page.evaluate((list) => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    return list.map((one) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = one;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b] as [number, number, number];
    });
  }, css);
}

/** A run of device pixels along a row unlike both fills beside it: one stroke as drawn. */
export interface Stroke {
  /** Where it peaks, css px. */
  at: number;
  /** Device pixels at half its peak or more: one 1.5px stroke is 3 to 4. */
  core: number;
  peak: number;
  /** Its separate highs: two strokes touching still dip between them. */
  peaks: number;
  vsA: number;
  vsB: number;
}

/** The highs of a profile parted by a dip of 0.15 or more under the lower of two. */
function peaksOf(profile: number[]): number {
  const last = profile.length - 1;
  const highs = profile.flatMap((v, k) => {
    const up = k === 0 || v >= (profile[k - 1] ?? 0);
    const down = k === last || v > (profile[k + 1] ?? 0);
    return up && down ? [k] : [];
  });
  let count = Math.min(1, highs.length);
  for (let j = 1; j < highs.length; j += 1) {
    const a = highs[j - 1] as number;
    const b = highs[j] as number;
    const dip = Math.min(...profile.slice(a, b + 1));
    const lower = Math.min(profile[a] ?? 0, profile[b] ?? 0);
    count += lower - dip >= 0.15 ? 1 : 0;
  }
  return count;
}

/**
 * The strokes across css [from, to] along row css y: runs of device pixels
 * unlike both `a` (the fill before) and `b` (the fill after) by 1.15:1 or
 * more, one pixel like the fills inside a run not ending it; each with its
 * peak contrast against the nearer fill.
 */
export function strokes(
  r: Raster,
  from: number,
  to: number,
  y: number,
  a: Rgb,
  b: Rgb
): Stroke[] {
  const runs: (Stroke & { profile: number[] })[] = [];
  let current: (Stroke & { profile: number[] }) | null = null;
  let gapRun = 0;
  const row = dy(r, y);
  for (let x = Math.floor(dx(r, from)); x <= Math.ceil(dx(r, to)); x += 1) {
    const c = px(r, x, row);
    const vsA = contrast(c, a);
    const vsB = contrast(c, b);
    const d = Math.min(vsA, vsB);
    const ink = d >= 1.15;
    gapRun = ink ? 0 : gapRun + 1;
    if (gapRun > 1) {
      current = null;
    }
    if (!ink) {
      continue;
    }
    if (!current) {
      current = {
        at: 0,
        core: 0,
        peak: 0,
        peaks: 0,
        vsA: 0,
        vsB: 0,
        profile: [],
      };
      runs.push(current);
    }
    current.profile.push(d);
    if (d > current.peak) {
      Object.assign(current, { peak: d, vsA, vsB, at: x / r.scale + r.x });
    }
  }
  return runs.map(({ profile, ...run }) => {
    const half = 1 + (run.peak - 1) / 2;
    return {
      ...run,
      core: profile.filter((v) => v >= half).length,
      peaks: peaksOf(profile),
    };
  });
}

/** The sizes of an ink mask's 8-connected pieces, `w` by `h`. */
export function pieces(mask: Uint8Array, w: number, h: number): number[] {
  const seen = new Uint8Array(w * h);
  const sizes: number[] = [];
  for (let s = 0; s < w * h; s += 1) {
    if (!mask[s] || seen[s]) {
      continue;
    }
    let size = 0;
    const queue = [s];
    seen[s] = 1;
    while (queue.length > 0) {
      const p = queue.pop() as number;
      size += 1;
      const x = p % w;
      const y = (p - x) / w;
      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          const q = ny * w + nx;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[q] && !seen[q]) {
            seen[q] = 1;
            queue.push(q);
          }
        }
      }
    }
    sizes.push(size);
  }
  return sizes;
}

/**
 * Where a control's ink stands in css px, its leftmost and past its rightmost
 * painted column, read inside `region`: a pixel is painted where it stands
 * off `surface` by a third of the strongest difference there (an antialiased
 * fringe counts alike on every control), or by 12 at all where the
 * control's fill is its ink.
 */
export function inkSpan(
  r: Raster,
  region: { bottom: number; left: number; right: number; top: number },
  surface: Rgb,
  filled: boolean
): { left: number; right: number } | null {
  const all: { x: number; d: number }[] = [];
  for (
    let y = Math.floor(dy(r, region.top));
    y < Math.ceil(dy(r, region.bottom));
    y += 1
  ) {
    for (
      let x = Math.floor(dx(r, region.left));
      x < Math.floor(dx(r, region.right));
      x += 1
    ) {
      all.push({ x, d: off(px(r, x, y), surface) });
    }
  }
  const strongest = Math.max(0, ...all.map((one) => one.d));
  const cut = filled ? 12 : Math.max(24, strongest / 3);
  const painted = all.filter((one) => one.d >= cut).map((one) => one.x);
  if (painted.length === 0) {
    return null;
  }
  return {
    left: Math.min(...painted) / r.scale + r.x,
    right: (Math.max(...painted) + 1) / r.scale + r.x,
  };
}

/**
 * Words as painted: the strongest contrast any pixel in `box` reaches
 * against the box's ground (its commonest colour). For thin strokes that is
 * what the eye gets.
 */
export function peakContrast(
  r: Raster,
  box: { bottom: number; left: number; right: number; top: number }
): number {
  const counts = new Map<string, { rgb: Rgb; n: number }>();
  for (
    let y = Math.floor(dy(r, box.top));
    y < Math.ceil(dy(r, box.bottom));
    y += 1
  ) {
    for (
      let x = Math.floor(dx(r, box.left));
      x < Math.floor(dx(r, box.right));
      x += 1
    ) {
      const rgb = px(r, x, y);
      const key = rgb.join(",");
      const known = counts.get(key);
      if (known) {
        known.n += 1;
      } else {
        counts.set(key, { rgb, n: 1 });
      }
    }
  }
  const all = [...counts.values()];
  if (all.length === 0) {
    return 1;
  }
  const ground = all.reduce((p, q) => (q.n > p.n ? q : p)).rgb;
  return Math.max(...all.map((one) => contrast(one.rgb, ground)));
}
