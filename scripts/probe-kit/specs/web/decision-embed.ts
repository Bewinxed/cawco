/**
 * A decision page's Preview of a component canvas draws the component
 * alone, through the hub's decision host with no hub (decision-embeds.ts):
 * a page whose card embeds StatTile's states file (every story) and whose
 * Recommended option embeds one of its stories (`Preview(…, ["Live"])`).
 *
 * At 1440×900 and 390×844, light and dark, each embed scrolled to as the
 * person would, then the page scrolled away and back, read in its own frame:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. The embed is the canvas `by=embed`, with a `story` for each its Preview
 *    names.
 * 3. It draws the stories its Preview names (every story when it names
 *    none): each frame drawn, with words in it, shot where the person sees
 *    it (canvas-shots.ts `shootEmbedded`): nothing over it, not one colour,
 *    its pixels its DOM's paint.
 * 4. Its section stays awake: the states file loaded, every frame drawn.
 * 5. None of the canvas's working chrome is seen (band, crumb, foot, steps,
 *    section heads, labels, statuses).
 * 6. It posted its height: the embed is as tall as what it draws, within
 *    2px, its words at 12px or more and every frame inside its width.
 * 7. No console error.
 *
 *   bun scripts/probe-kit/run.ts web decision-embed
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  EMBED_FRAME,
  embedDrawFaults,
  idOf,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, SCALE, type Spec, settle, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/decision-embed");
const NAME = "stat-tile";
const FILE = "src/lib/cawco/StatTile.stories.ts";
const TILE = idOf("stat-tile");

/** Each Preview's caption, and the stories it names (none: every story the file has). */
const PREVIEWS = { "Every story": [], "Live alone": ["Live"] } as const;

const PROGRAM = [
  `root = Decisions("The usage tile", [tile])`,
  `tile = Decision("tile", "Which figure heads the Usage page?", [spend, live], "The budget is what a person checks first.", [every])`,
  `spend = Option("spend", "Spend today", "The budget's figure at rest.", false, [], "No live status of its own.")`,
  `live = Option("live", "Running", "A figure in the live status's ink.", true, [alone], "Its ink draws the eye from the budget.")`,
  `every = Preview("${TILE}", "Every story")`,
  `alone = Preview("${TILE}", "Live alone", ["Live"])`,
].join("\n");

const spec: Spec = {
  name: "decision-embed",
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });

    let refusal = "";
    try {
      checkProgram(PROGRAM);
    } catch (error) {
      refusal = (error as Error).message;
    }
    kit.check("the hub's check keeps the program", refusal === "", refusal);

    const stage = await startDecisionStage(new Map([[NAME, PROGRAM]]), {
      [TILE]: FILE,
    });
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
          const page = await kit.page(view, { theme });
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text().slice(0, 240));
            }
          });
          page.on("pageerror", (error) =>
            errors.push(error.message.slice(0, 240))
          );
          await page.goto(stage.pageUrl(NAME, theme), { waitUntil: "load" });
          await page.waitForSelector(".dp-card", { timeout: 30_000 });
          const count = Object.keys(PREVIEWS).length;
          await page.waitForFunction(
            ({ n, selector }) =>
              document.querySelectorAll(selector).length === n,
            { n: count, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const first = await readEmbeds(
            page,
            theme,
            join(OUT, `${view}-${theme}`)
          );
          // Away and back, as the person scrolls the page: an embed's section stays awake.
          await page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight)
          );
          await settle(page, 600);
          await page.evaluate(() => window.scrollTo(0, 0));
          await settle(page, 600);
          const { embeds, undrawn } = await readEmbeds(
            page,
            theme,
            join(OUT, `${view}-${theme}-again`)
          );
          undrawn.unshift(...first.undrawn);

          const wanted = (caption: string): readonly string[] =>
            PREVIEWS[caption as keyof typeof PREVIEWS] ?? [];
          const addressed = embeds.flatMap((e) => {
            const url = new URL(e.src);
            const story = url.searchParams.getAll("story");
            return url.searchParams.get("by") === "embed" &&
              story.join() === wanted(e.caption).join()
              ? []
              : [
                  `“${e.caption}”: by=${url.searchParams.get("by")}, story=${story.join(",") || "none"}`,
                ];
          });
          kit.check(
            `${leg}: each Preview opens the canvas by=embed with the stories it names`,
            embeds.length === count && addressed.length === 0,
            addressed.join("\n    ") || `${embeds.length} of ${count} embeds`
          );
          const drawnFaults = [
            ...embeds.flatMap((e) =>
              embedDrawFaults({
                ...e,
                named: [...wanted(e.caption)],
              })
            ),
            ...undrawn,
          ];
          kit.check(
            `${leg}: every embed draws the stories its Preview names (${embeds.map((e) => `“${e.caption}” ${e.shots.map((shot) => `${shot.story} ${shot.stats.width / SCALE}×${shot.stats.height / SCALE} (${shot.stats.matched} points its paint)`).join(" + ") || "none"}`).join("; ")})`,
            embeds.length === count && drawnFaults.length === 0,
            drawnFaults.join("\n    ")
          );
          const asleep = embeds.flatMap((e) => [
            ...(e.loaded.includes(FILE)
              ? []
              : [
                  `“${e.caption}”: ${FILE} not loaded (loaded: ${e.loaded.join(", ") || "none"})`,
                ]),
            ...e.frames
              .filter((f) => f.state !== "drawn")
              .map(
                (f) => `“${e.caption}” ${f.story}: ${f.state || "no state"}`
              ),
          ]);
          kit.check(
            `${leg}: every embed's section stays awake, scrolled away and back`,
            embeds.length === count && asleep.length === 0,
            asleep.join("\n    ")
          );
          const chromeSeen = embeds.flatMap((e) =>
            e.chrome.map((part) => `“${e.caption}”: ${part}`)
          );
          kit.check(
            `${leg}: no embed shows the canvas's working chrome`,
            chromeSeen.length === 0,
            chromeSeen.slice(0, 12).join("\n    ")
          );
          const sizeFaults = embeds.flatMap((e) => [
            ...e.frames
              .filter((f) => f.type < 12)
              .map(
                (f) => `“${e.caption}” ${f.story}: its words at ${f.type}px`
              ),
            ...e.frames
              .filter((f) => f.right > e.width + 1)
              .map(
                (f) =>
                  `“${e.caption}” ${f.story}: ${f.right - e.width}px past the embed`
              ),
            ...(Math.abs(e.box.h - e.tall) > 2
              ? [`“${e.caption}”: ${e.box.h}px tall, drawing ${e.tall}px`]
              : []),
          ]);
          kit.check(
            `${leg}: every embed as tall as it draws, its words readable inside its width (${embeds.map((e) => `“${e.caption}” ${e.box.w}×${e.box.h} drawing ${e.tall}`).join(", ")})`,
            embeds.length === count && sizeFaults.length === 0,
            sizeFaults.join("\n    ")
          );
          kit.check(
            `${leg}: no console errors, the page and its canvases`,
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join("\n    ")
          );
          await page.screenshot({
            path: join(OUT, `${NAME}-${view}-${theme}.png`),
            fullPage: true,
            animations: "disabled",
          });
        }
      }
    } finally {
      await stage.stop();
    }
  },
};

export default spec;
