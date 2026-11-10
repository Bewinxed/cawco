/**
 * A finder row's title and its meta line never overlap, whatever the
 * title's length. On a phone the title wraps to three lines
 * (`group-data-phone/row:line-clamp-3`), and the row's grid gave its first
 * row only `--icon-lg`, so lines two and three drew over the meta line
 * (Jump's long session titles, a command for a name).
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws FindRow.stories.ts as a Preview's frame does (`by=embed`),
 * every story at 390 in Safari's engine; in each, the title's last line box ends at or above
 * the meta line's first, the long titles do take three lines, and the
 * title's box is its lines' height: on a phone the title is a line clamp's
 * -webkit-box, which the mark line's trim does not reach, so the padding
 * that stands in for the trim (`mark-text`) would make every row 13px
 * taller.
 *
 *   bun scripts/probe-kit/run.ts web find-row-wrap
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, STAGE_START_MS, startDecisionStage } from "../../decision-embeds";
import type { Spec } from "../../spec";

const FILE = "src/lib/cawco/find/FindRow.stories.ts";
/** Every story the states file exports, by its name. */
const STORIES = [
  ...readFileSync(join(APP, FILE), "utf8").matchAll(
    /^export const ([A-Z]\w*) =/gmu
  ),
].map((one) => one[1] as string);
/** The stories whose title wraps to three lines at 390. */
const LONG = new Set(["LongCommand", "LongTitleWithMoment"]);

interface Read {
  /** The meta line's top less the title's last line's bottom, px: negative is an overlap. */
  clear: number;
  /** The title's box over its lines' height: 1 when nothing pads it. */
  fill: number;
  lines: number;
  story: string;
}

const spec: Spec = {
  name: "find-row-wrap",
  group: "iPhone Safari",
  async run(kit) {
    const stage = await startDecisionStage(new Map(), {});
    try {
      const page = await kit.page("phone", {
        engine: "webkit",
        theme: "light",
      });
      await page.goto(
        `http://127.0.0.1:${stage.stagePort}/@cawco/canvas?file=${encodeURIComponent(FILE)}&by=embed${STORIES.map((one) => `&story=${one}`).join("")}`,
        { waitUntil: "load", timeout: STAGE_START_MS }
      );
      await page.waitForFunction(
        (stories) => {
          const drawn = [
            ...document.querySelectorAll(
              "[data-stage-drawing][data-cawco-story]"
            ),
          ];
          return (
            drawn.length === stories &&
            drawn.every(
              (one) => one.getAttribute("data-cawco-state") === "drawn"
            )
          );
        },
        STORIES.length,
        { timeout: STAGE_START_MS, polling: 250 }
      );
      await page.evaluate(() => document.fonts.ready);
      const reads = await page.evaluate((): Read[] =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "[data-stage-drawing][data-cawco-story]"
          ),
        ].map((drawing) => {
          const story = drawing.getAttribute("data-cawco-story") ?? "";
          const row = drawing.querySelector("[data-find-row]");
          const title = row?.querySelector('[data-slot="title"]');
          const meta = row?.querySelector('[data-slot="meta"]');
          if (!(title && meta)) {
            return { story, clear: Number.NaN, fill: Number.NaN, lines: 0 };
          }
          // The title's own line boxes: the last one drawn is its foot.
          const range = document.createRange();
          range.selectNodeContents(title);
          const boxes = [...range.getClientRects()].filter(
            (box) => box.height > 0
          );
          const tops = new Set(boxes.map((box) => Math.round(box.top)));
          const foot = Math.max(...boxes.map((box) => box.bottom));
          // Clamped lines past the third are clipped, not drawn: the
          // title's own box bounds what shows.
          const shown = Math.min(foot, title.getBoundingClientRect().bottom);
          const line = Number.parseFloat(getComputedStyle(title).lineHeight);
          return {
            story,
            clear: meta.getBoundingClientRect().top - shown,
            fill:
              title.getBoundingClientRect().height /
              (line * Math.min(tops.size, 3)),
            lines: tops.size,
          };
        })
      );
      for (const read of reads) {
        const long = LONG.has(read.story);
        kit.check(
          `390, ${read.story}: the title's last line stands clear of the meta line${long ? ", over three lines" : ""}, its box no taller than its lines`,
          read.clear >= -0.5 &&
            (!long || read.lines >= 3) &&
            Math.abs(read.fill - 1) < 0.05,
          `${read.lines} title line(s), its box ${read.fill.toFixed(2)}× their height, meta ${read.clear.toFixed(1)}px under the title's foot`
        );
      }
      kit.check(
        `390: every story drew a row (${STORIES.join(", ")})`,
        reads.length === STORIES.length,
        `${reads.length} of ${STORIES.length}`
      );
      await page.close();
    } finally {
      await stage.stop();
    }
  },
};
export default spec;
