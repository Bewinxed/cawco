/**
 * Connect a machine's joined card (join/StatusCard, joined): its readiness
 * glyph reads as a mark on a disc in both schemes. Each Solar duotone glyph
 * is two layers in one ink, the disc (the layer with an `opacity`) and the
 * strokes over it. Three ratios hold 3:1 or more: the strokes on the
 * surface under the card, the disc on that surface, and the strokes on the
 * disc. At 0.81 the disc held 3:1 on the recess, but the strokes on it fell
 * to 1.79:1 by day and 1.47:1 at night, so the glyph read as a solid circle.
 *
 * Every state that draws a glyph, on the real dialog (the /motion/
 * mac-readiness bench). Each layer's computed fill and opacity and the
 * computed background of the first opaque surface under the card (the
 * dialog's raised body) are rasterised through a canvas to the sRGB the
 * page draws; the disc is its fill at its opacity over that surface.
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

const ROW = '[data-slot="status-card"][data-readiness]';
const GLYPH = "[data-joined-glyph] svg";

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
          `${ROW}[data-readiness="${state}"] ${GLYPH}`
        );
        await settle(page);
        const layers = await page.evaluate(
          ([row, glyph]): Layers | null => {
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
            // Inside the joined card the one readiness glyph is its slot.
            const svg = root?.querySelector(glyph);
            const disc = svg?.querySelector("[opacity]");
            const stroke = [...(svg?.querySelectorAll("path") ?? [])].find(
              (path) => !path.closest("[opacity]")
            );
            if (!(root && disc && stroke)) {
              return null;
            }
            // The surface the card stands on: the first opaque background under it.
            let under: Element | null = root;
            while (
              under &&
              rgb(getComputedStyle(under).backgroundColor)[3] !== 255
            ) {
              under = under.parentElement;
            }
            const recess = under
              ? getComputedStyle(under).backgroundColor
              : "rgb(0, 0, 0)";
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
          },
          [ROW, GLYPH] as const
        );
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
        `${theme}: every joined card's readiness glyph is a mark on a disc: its strokes 3:1 or more on the surface under the card, its disc (fill at its opacity over that surface) 3:1 or more on it, and its strokes 3:1 or more on the disc`,
        pass,
        `\n${rows.map((row) => `    ${JSON.stringify(row)}`).join("\n")}`
      );
    }
  },
};

export default spec;
