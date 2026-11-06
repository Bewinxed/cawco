/**
 * A bar item's count stands on its symbol's top trailing corner at any
 * width of count (DESIGN.md, the kit Badge's `corner` form; HIG, Tab bars):
 * a wide count grows away from the symbol, toward the trailing side, never
 * back across it and never past the top edge of the glass it stands in. The
 * design review caught Files' "100" centred over its folder and through the
 * capsule's top edge while a "4" sat on its corner.
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws bar-glass.stories.ts' counted stories as a Preview's frame
 * does (`by=embed`): counts 4, 42, 100 and 4812, at rest and on, the desk's
 * at 1440 and the phone's at 390. For each, the badge's leading edge stands
 * at or past its symbol's centre, and its top at or under its glass's top;
 * and the rendered checks' glyph-place rule, which holds every bar's count
 * to the same, reads nothing on them.
 *
 *   bun scripts/probe-kit/run.ts web bar-count
 */
import { STAGE_START_MS, startDecisionStage } from "../../decision-embeds";
import type { Spec } from "../../kit";
import { RenderedChecks } from "../../rendered-checks";

const FILE = "src/lib/components/ui/bar-glass/bar-glass.stories.ts";
const COUNTS = [4, 42, 100, 4812] as const;
/** What a measure may round to: under a device pixel. Ours. */
const SLACK = 0.5;

interface Read {
  count: string;
  /** The badge's leading edge less its symbol's centre, px (at or above 0 holds). */
  pastCentre: number;
  story: string;
  /** The badge's top less its glass's top, px (at or above 0 holds). */
  underGlass: number;
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
        const reads: Read[] = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              "[data-stage-drawing][data-cawco-story]"
            ),
          ].flatMap((drawing) => {
            const item = drawing.querySelector("[data-bar-item][data-counted]");
            const symbol = item?.querySelector(":scope > svg");
            const badge = item?.querySelector("[data-slot=num]");
            const glass = item?.closest("[data-glass]");
            if (!(item && symbol && badge && glass)) {
              return [];
            }
            const rtl = getComputedStyle(item).direction === "rtl";
            const s = symbol.getBoundingClientRect();
            const b = badge.getBoundingClientRect();
            const g = glass.getBoundingClientRect();
            const centre = s.left + s.width / 2;
            return [
              {
                story: drawing.getAttribute("data-cawco-story") ?? "",
                count: badge.textContent?.trim() ?? "",
                pastCentre: rtl ? centre - b.right : b.left - centre,
                underGlass: b.top - g.top,
              },
            ];
          })
        );
        const width = form === "desk" ? 1440 : 390;
        kit.check(
          `${width}: every counted story draws its item, symbol, badge and glass`,
          reads.length === stories.length,
          `${reads.length} of ${stories.length} read`
        );
        for (const one of reads) {
          const said = `"${one.count}": leading edge ${one.pastCentre.toFixed(1)}px past the symbol's centre, top ${one.underGlass.toFixed(1)}px under the glass's top`;
          kit.check(
            `${width} ${one.story}: the badge's leading edge never passes the symbol's centre`,
            one.pastCentre >= -SLACK,
            said
          );
          kit.check(
            `${width} ${one.story}: the badge's top stays inside the bar's glass`,
            one.underGlass >= -SLACK,
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
