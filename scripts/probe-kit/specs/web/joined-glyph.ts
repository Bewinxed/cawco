/**
 * Connect a machine's joined row (join/JoinedRow): its status glyph is a
 * status mark, so it is Solar's solid bold cut in every state, never
 * duotone (DESIGN.md, The Solar Duotone Rule; The failure mark and the
 * blocked mark): no layer of the glyph is drawn below full opacity, and its
 * ink holds 3:1 or more on the row's recess in both schemes. The inner mark
 * is the recess itself, knocked out of the disc, so it holds the same ratio.
 *
 * Every state that draws a glyph, on the real dialog (the /motion/
 * mac-readiness bench). The glyph's computed fill and the row's computed
 * background are rasterised through a canvas to the sRGB the page draws.
 *
 *   bun scripts/probe-kit/run.ts web joined-glyph
 */
import type { Kit, Spec } from "../../kit";
import { open, settle, THEMES } from "../../kit";

/** The bench's states that draw a glyph (checking draws the spinner). */
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

interface Drawn {
  ink: { fill: string; rgb: number[] };
  /** Any layer drawn below full opacity: a duotone's half disc. */
  layered: boolean;
  recess: { color: string; rgb: number[] };
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
        const drawn = await page.evaluate((row): Drawn | null => {
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
          const path = svg?.querySelector("path");
          if (!(root && svg && path)) {
            return null;
          }
          const { backgroundColor: recess } = getComputedStyle(root);
          const { fill } = getComputedStyle(path);
          return {
            layered: [...svg.querySelectorAll("*")].some(
              (el) => Number(getComputedStyle(el).opacity) < 1
            ),
            ink: { fill, rgb: rgb(fill) },
            recess: { color: recess, rgb: rgb(recess) },
          };
        }, ROW);
        if (!drawn) {
          pass = false;
          rows.push({ state, missing: "row or glyph" });
          continue;
        }
        const { ink, recess, layered } = drawn;
        const inkOnRecess = ratio(ink.rgb, recess.rgb);
        const opaque = recess.rgb[3] === 255;
        pass &&= opaque && !layered && inkOnRecess >= 3;
        rows.push({
          state,
          recess: recess.color,
          ink: ink.fill,
          layered,
          inkOnRecess: r2(inkOnRecess),
        });
      }
      kit.check(
        `${theme}: every joined-row glyph is solid (no layer below full opacity) and its ink holds 3:1 or more on the recess`,
        pass,
        `\n${rows.map((row) => `    ${JSON.stringify(row)}`).join("\n")}`
      );
    }
  },
};

export default spec;
