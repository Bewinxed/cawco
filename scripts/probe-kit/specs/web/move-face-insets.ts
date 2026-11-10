/**
 * The Animation face's timeline is a plot, not a list of rows: the
 * uneven-inset rule (rendered-checks.ts, DESIGN.md's Row Grid Rule) reads
 * none of its lanes or its ruler, whose bars and figures stand where their
 * times put them. graph-stage's move legs (r501) reported it 290 times, 8
 * distinct ("div[data-slot=timeline] div[data-slot=clip] “Fill run 1”:
 * holds its children 30px from its left and 7px from its right, in ink").
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws MoveFace.stories.ts as a Preview's frame does (`by=embed`),
 * every state of the face at the room's own widths (each the canvas's
 * `width`, as a Preview naming it draws it): 400 beside a desk's stage, 800
 * beside a 2529 one and 680 in the drawer, on a desk's window (1440), and
 * 390 in the drawer on a phone's; the rendered checks read each, and
 * uneven-inset finds nothing.
 *
 *   bun scripts/probe-kit/run.ts web move-face-insets
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, STAGE_START_MS, startDecisionStage } from "../../decision-embeds";
import { RenderedChecks } from "../../rendered-checks";
import type { Spec } from "../../spec";

const FILE = "src/lib/cawco/graph/MoveFace.stories.ts";
/** Every story the states file exports, by its name. */
const STORIES = [
  ...readFileSync(join(APP, FILE), "utf8").matchAll(
    /^export const ([A-Z]\w*) =/gmu
  ),
].map((one) => one[1] as string);
/** Each window the face is read in, with the room's width in it (DesignGraph's room beside the stage, or its drawer). */
const ROOMS = [
  ["desk", 400],
  ["desk", 680],
  ["desk", 800],
  ["phone", 390],
] as const;

const spec: Spec = {
  name: "move-face-insets",
  group: "The probe kit's own rig",
  async run(kit) {
    const stage = await startDecisionStage(new Map(), {});
    try {
      const checks = new RenderedChecks(kit, "move-face-insets", {
        noImpeccable: "one rule read, the house's own code",
      });
      for (const [form, width] of ROOMS) {
        const page = await kit.page(form, { theme: "light" });
        await page.goto(
          `http://127.0.0.1:${stage.stagePort}/@cawco/canvas?file=${encodeURIComponent(FILE)}&by=embed&width=${width}${STORIES.map((one) => `&story=${one}`).join("")}`,
          { waitUntil: "load", timeout: STAGE_START_MS }
        );
        await page.waitForFunction(
          (stories) => {
            const statuses = [
              ...document.querySelectorAll(
                "[data-stage-drawing][data-cawco-story]"
              ),
            ];
            return (
              statuses.length === stories &&
              statuses.every(
                (one) => one.getAttribute("data-cawco-state") === "drawn"
              )
            );
          },
          STORIES.length,
          { timeout: STAGE_START_MS, polling: 250 }
        );
        const frames = await page
          .locator("[data-stage-drawing][data-cawco-story]")
          .count();
        const read = await checks.at(
          page,
          `${form}, the Animation face at ${width}`
        );
        const uneven = read.findings.filter(
          (one) => one.rule === "uneven-inset"
        );
        kit.check(
          `${form === "desk" ? 1440 : 390}, the room at ${width}: the Animation face's ${frames} states draw, and uneven-inset reads no lane or ruler`,
          frames > 0 && uneven.length === 0,
          uneven.length > 0
            ? `${uneven.length}: ${uneven
                .slice(0, 4)
                .map((one) => `${one.element}: ${one.measured}`)
                .join(" | ")}`
            : `${frames} states, 0 uneven-inset findings`
        );
        await page.close();
      }
    } finally {
      await stage.stop();
    }
  },
};
export default spec;
