/**
 * Connect a machine's joined row (join/JoinedRow): its status glyph reads as
 * a mark on a disc in both schemes. Each Solar duotone glyph is two layers in
 * one ink, the disc (the layer with an `opacity`) and the strokes over it.
 * Three ratios hold 3:1 or more: the strokes on the recess, the disc on the
 * recess, and the strokes on the disc. At 0.81 the disc held 3:1 on the
 * recess, but the strokes on it fell to 1.79:1 by day and 1.47:1 at night,
 * so the glyph read as a solid circle.
 *
 * Every state that draws a glyph, on the real dialog (the /motion/
 * mac-readiness bench). Each layer's computed fill and opacity and the row's
 * computed background are rasterised through a canvas to the sRGB the page
 * draws; the disc is its fill at its opacity over the recess.
 *
 *   bun scripts/probe-kit/run.ts web joined-glyph
 */
import type { Kit, Spec } from "../../kit";
import { open, settle, THEMES } from "../../kit";

/** The bench's states that draw a duotone glyph (checking draws the spinner). */
const STATES = [
  "not-mac",
  "ready",
  "allow",
  "said-no",
  "xcode-terms",
  "locked",
  "offline",
  "no-xcode",
] as const;

const ROW = '[role="status"][data-readiness]';

interface Layers {
  disc: { fill: string; opacity: number; rgb: number[] };
  recess: { color: string; rgb: number[] };
  strokes: { fill: string; rgb: number[] };
}

/** The relative luminance's contrast ratio (WCAG 2) of two sRGB colours. */
function ratio(a: number[], b: number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (p: number[]) =>
    0.2126 * lin(p[0] ?? 0) + 0.7152 * lin(p[1] ?? 0) + 0.0722 * lin(p[2] ?? 0);
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const spec: Spec = {
  name: "joined-glyph",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    for (const theme of THEMES) {
      // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time, each on its own page
      const page = await kit.page("desk", { theme });
      const rows: Record<string, unknown>[] = [];
      let pass = true;
      for (const state of STATES) {
        // biome-ignore lint/performance/noAwaitInLoops: one state at a time on one page
        await open(
          page,
          `${bench}/motion/mac-readiness?state=${state}`,
          `${ROW}[data-readiness="${state}"] [data-slot="glyph"] svg`
        );
        await settle(page);
        const layers = await page.evaluate((row): Layers | null => {
          const rgb = (value: string) => {
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            const pen = canvas.getContext("2d");
            if (!pen) {
              return [];
            }
            pen.fillStyle = value;
            pen.fillRect(0, 0, 1, 1);
            return [...pen.getImageData(0, 0, 1, 1).data];
          };
          const root = document.querySelector(row);
          // Inside the joined row the one glyph is JoinedRow's slot.
          const svg = root?.querySelector('[data-slot="glyph"] svg');
          const disc = svg?.querySelector("[opacity]");
          const stroke = [...(svg?.querySelectorAll("path") ?? [])].find(
            (path) => !path.closest("[opacity]")
          );
          if (!(root && disc && stroke)) {
            return null;
          }
          const recess = getComputedStyle(root).backgroundColor;
          const discStyle = getComputedStyle(disc);
          const strokeFill = getComputedStyle(stroke).fill;
          return {
            recess: { color: recess, rgb: rgb(recess) },
            disc: {
              fill: discStyle.fill,
              opacity: Number(discStyle.opacity),
              rgb: rgb(discStyle.fill),
            },
            strokes: { fill: strokeFill, rgb: rgb(strokeFill) },
          };
        }, ROW);
        if (!layers) {
          pass = false;
          rows.push({ state, missing: "row, disc or strokes" });
          continue;
        }
        const { recess, disc, strokes } = layers;
        const drawn = disc.rgb.map(
          (c, i) => disc.opacity * c + (1 - disc.opacity) * (recess.rgb[i] ?? 0)
        );
        const strokesOnRecess = ratio(strokes.rgb, recess.rgb);
        const discOnRecess = ratio(drawn, recess.rgb);
        const strokesOnDisc = ratio(strokes.rgb, drawn);
        const opaque = recess.rgb[3] === 255;
        pass &&=
          opaque &&
          strokesOnRecess >= 3 &&
          discOnRecess >= 3 &&
          strokesOnDisc >= 3;
        rows.push({
          state,
          recess: recess.color,
          strokes: strokes.fill,
          disc: `${disc.fill} @ ${disc.opacity}`,
          strokesOnRecess: r2(strokesOnRecess),
          discOnRecess: r2(discOnRecess),
          strokesOnDisc: r2(strokesOnDisc),
        });
      }
      kit.check(
        `${theme}: every joined-row glyph is a mark on a disc: its strokes 3:1 or more on the recess, its disc (fill at its opacity over the recess) 3:1 or more on the recess, and its strokes 3:1 or more on the disc`,
        pass,
        `\n${rows.map((row) => `    ${JSON.stringify(row)}`).join("\n")}`
      );
    }
  },
};

export default spec;
