/**
 * A bar item's count stands on its symbol's top trailing corner at any
 * width of count (DESIGN.md, the kit Badge's `corner` form; HIG, Tab bars):
 * a wide count grows away from the symbol, toward the trailing side, never
 * back across it, lifted half the glass's inset past the item's top so it
 * clears its trailing neighbour's glyph. The design review caught Files'
 * "100" centred over its folder while a "4" sat on its corner.
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws bar-glass.stories.ts' counted stories as a Preview's frame
 * does (`by=embed`): counts 4, 42, 100 and 4812, at rest and on, the desk's
 * at 1440 and the phone's at 390. For each, the badge's leading edge stands
 * at or past its symbol's centre, and it lies on no more of its trailing
 * neighbour's glyph ink than a one-figure count standing where it stands
 * (as wide as it is tall, from the same leading edge; shapes' fill and
 * stroke sampled every half pixel, as glyph-place samples them); and the
 * rendered checks' glyph-place rule, which holds every bar's count to the
 * same, reads nothing on them.
 *
 *   bun scripts/probe-kit/run.ts web bar-count
 */
import { STAGE_START_MS, startDecisionStage } from "../../decision-embeds";
import { RenderedChecks } from "../../rendered-checks";
import type { Spec } from "../../spec";

const FILE = "src/lib/components/ui/bar-glass/bar-glass.stories.ts";
const COUNTS = [4, 42, 100, 4812] as const;
/** What a measure may round to: under a device pixel. Ours. */
const SLACK = 0.5;

interface Read {
  count: string;
  /** The share of its trailing neighbour's glyph ink under the badge. */
  neighbour: number;
  /** The share of that ink under a one-figure count standing there. */
  oneFigure: number;
  /** The share of its own glyph's ink under the badge. */
  own: number;
  /** The badge's leading edge less its symbol's centre, px (at or above 0 holds). */
  pastCentre: number;
  story: string;
}

const spec: Spec = {
  name: "bar-count",
  group: "The probe kit's own rig",
  async run(kit) {
    const stage = await startDecisionStage(new Map(), {});
    try {
      const checks = new RenderedChecks(kit, "bar-count", {
        noImpeccable: "one rule read, the house's own code",
      });
      for (const form of ["desk", "phone"] as const) {
        const stories = COUNTS.flatMap((n) =>
          form === "desk"
            ? [`Counted${n}`, `Counted${n}On`]
            : [`Counted${n}Phone`, `Counted${n}OnPhone`]
        );
        const page = await kit.page(form, { theme: "light" });
        await page.goto(
          `http://127.0.0.1:${stage.stagePort}/@cawco/canvas?file=${encodeURIComponent(FILE)}&by=embed${stories.map((one) => `&story=${one}`).join("")}`,
          { waitUntil: "load", timeout: STAGE_START_MS }
        );
        await page.waitForFunction(
          (want) => {
            const drawn = [
              ...document.querySelectorAll(
                "[data-stage-drawing][data-cawco-story]"
              ),
            ];
            return (
              drawn.length === want &&
              drawn.every(
                (one) => one.getAttribute("data-cawco-state") === "drawn"
              )
            );
          },
          stories.length,
          { timeout: STAGE_START_MS, polling: 250 }
        );
        await page.evaluate(() => document.fonts.ready);
        const reads: Read[] = await page.evaluate(() => {
          const seen = (v: string) => Number.parseFloat(v || "1") > 0.1;
          /** The shapes of `drawn` that draw: filled or stroked, seen. */
          const shapesOf = (drawn: Element) =>
            [
              ...drawn.querySelectorAll<SVGGeometryElement>(
                "path, circle, rect, ellipse, line, polyline, polygon"
              ),
            ].flatMap((shape) => {
              const st = getComputedStyle(shape);
              const m = shape.getScreenCTM()?.inverse();
              const filled = st.fill !== "none" && seen(st.fillOpacity);
              const stroked = st.stroke !== "none" && seen(st.strokeOpacity);
              return m && seen(st.opacity) && (filled || stroked)
                ? [{ shape, m, filled, stroked }]
                : [];
            });
          /** The share of `drawn`'s ink under `r`, sampled every half pixel. */
          const inkUnder = (drawn: Element, r: DOMRect): number => {
            const shapes = shapesOf(drawn);
            const inks = (x: number, y: number) =>
              shapes.some(({ shape, m, filled, stroked }) => {
                const p = new DOMPoint(x, y).matrixTransform(m);
                return (
                  (filled && shape.isPointInFill(p)) ||
                  (stroked && shape.isPointInStroke(p))
                );
              });
            const g = drawn.getBoundingClientRect();
            const points: [number, number][] = [];
            for (let y = g.top + 0.25; y < g.bottom; y += 0.5) {
              for (let x = g.left + 0.25; x < g.right; x += 0.5) {
                points.push([x, y]);
              }
            }
            const inked = points.filter(([x, y]) => inks(x, y));
            const covered = inked.filter(
              ([x, y]) =>
                x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
            ).length;
            return inked.length > 0 ? covered / inked.length : 0;
          };
          return [
            ...document.querySelectorAll(
              "[data-stage-drawing][data-cawco-story]"
            ),
          ].flatMap((drawing) => {
            const item = drawing.querySelector("[data-bar-item][data-counted]");
            const symbol = item?.querySelector(":scope > svg");
            const badge = item?.querySelector("[data-slot=num]");
            const next =
              item?.nextElementSibling?.querySelector(":scope > svg");
            if (!(item && symbol && badge && next)) {
              return [];
            }
            const rtl = getComputedStyle(item).direction === "rtl";
            const s = symbol.getBoundingClientRect();
            const b = badge.getBoundingClientRect();
            const centre = s.left + s.width / 2;
            const one = rtl
              ? new DOMRect(b.right - b.height, b.top, b.height, b.height)
              : new DOMRect(b.left, b.top, b.height, b.height);
            return [
              {
                story: drawing.getAttribute("data-cawco-story") ?? "",
                count: badge.textContent?.trim() ?? "",
                pastCentre: rtl ? centre - b.right : b.left - centre,
                own: inkUnder(symbol, b),
                neighbour: inkUnder(next, b),
                oneFigure: inkUnder(next, one),
              },
            ];
          });
        });
        const width = form === "desk" ? 1440 : 390;
        kit.check(
          `${width}: every counted story draws its item, symbol, badge and trailing neighbour`,
          reads.length === stories.length,
          `${reads.length} of ${stories.length} read`
        );
        for (const one of reads) {
          const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
          const said = `"${one.count}": leading edge ${one.pastCentre.toFixed(1)}px past the symbol's centre; on ${pct(one.own)} of its glyph's ink, ${pct(one.neighbour)} of its neighbour's (a one-figure count there: ${pct(one.oneFigure)})`;
          kit.check(
            `${width} ${one.story}: the badge's leading edge never passes the symbol's centre`,
            one.pastCentre >= -SLACK,
            said
          );
          kit.check(
            `${width} ${one.story}: the badge covers no more of its neighbour's glyph than a one-figure count`,
            one.neighbour <= one.oneFigure + 0.005,
            said
          );
        }
        const read = await checks.at(page, `${form}, the counted bar items`);
        const placed = read.findings.filter(
          (one) => one.rule === "glyph-place"
        );
        kit.check(
          `${width}: glyph-place reads nothing on the counted bar items`,
          placed.length === 0,
          placed.length > 0
            ? placed.map((one) => `${one.element}: ${one.measured}`).join(" | ")
            : "0 glyph-place findings"
        );
        await page.close();
      }
    } finally {
      await stage.stop();
    }
  },
};
export default spec;
