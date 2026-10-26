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
function px(r: Raster, x: number, y: number): Rgb {
  const cx = Math.min(r.width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(r.height - 1, Math.max(0, Math.round(y)));
  const k = (cy * r.width + cx) * 4;
  return [r.data[k] ?? 0, r.data[k + 1] ?? 0, r.data[k + 2] ?? 0];
}

/** Device px for a page css x, and y. */
const dx = (r: Raster, cssX: number): number => (cssX - r.x) * r.scale;
const dy = (r: Raster, cssY: number): number => (cssY - r.y) * r.scale;

/** The pixel at page css px (x, y). */
export const at = (r: Raster, x: number, y: number): Rgb =>
  px(r, dx(r, x), dy(r, y));

/** How far two colours stand apart, the channels' differences summed (0 to 765). */
export const off = (a: Rgb, b: Rgb): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

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
