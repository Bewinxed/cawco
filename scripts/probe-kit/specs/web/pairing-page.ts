/**
 * The pairing decision page (apps/dashboard/src/lib/cawco/pairing/preview/
 * page.oui) drawn as the owner sees it, with no hub (decision-embeds.ts):
 * the hub's decision host around the program, and each Preview the pairing
 * sheet's component canvas (Pairing.stories.ts) drawn live by the
 * dashboard's own stage, `by=embed` with the stories its Preview names.
 *
 * At 1440×900 and 390×844, light and dark, each embed scrolled to as the
 * owner would:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. There is one embed for each Preview, each naming the stories its
 *    Preview names.
 * 3. Each draws those stories and only those (decision-embeds.ts
 *    `embedDrawFaults`): every frame drawn with words in it, its pixels its
 *    DOM's paint, nothing over it.
 * 4. No embed shows the canvas's working chrome, each is as tall as what it
 *    draws, and no console error.
 *
 *   bun scripts/probe-kit/run.ts web pairing-page
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  EMBED_FRAME,
  embedDrawFaults,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, type Spec, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/pairing-page");
const NAME = "pairing-page";
const DIR = "apps/dashboard/src/lib/cawco/pairing";
const FILE = "src/lib/cawco/pairing/Pairing.stories.ts";
const PROGRAM = readFileSync(join(ROOT, DIR, "preview/page.oui"), "utf8");
const PREVIEW = /Preview\("([0-9a-f-]+)", "[^"]*", \[([^\]]*)\]\)/g;
/** The canvas each Preview embeds, and the stories each names, as the program writes them. */
const previews = [...PROGRAM.matchAll(PREVIEW)].map((m) => ({
  id: m[1] as string,
  stories: (m[2] as string).split(",").map((one) => one.trim().slice(1, -1)),
}));
const CANVAS = previews[0]?.id ?? "";

const key = (stories: readonly string[]) => stories.join(",");
/** The Previews' story lists, sorted: the page draws them in its own order. */
const WANTED = previews.map((one) => key(one.stories)).sort();

const spec: Spec = {
  name: "pairing-page",
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });

    let refusal = "";
    try {
      checkProgram(PROGRAM);
    } catch (error) {
      refusal = (error as Error).message;
    }
    kit.check(
      `the hub's check keeps the program (${previews.length} Previews of one canvas)`,
      refusal === "" &&
        previews.length > 0 &&
        previews.every((one) => one.id === CANVAS),
      refusal
    );

    const stage = await startDecisionStage(new Map([[NAME, PROGRAM]]), {
      [CANVAS]: FILE,
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
          await page.waitForFunction(
            ({ n, selector }) =>
              document.querySelectorAll(selector).length === n,
            { n: previews.length, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const { embeds, undrawn } = await readEmbeds(
            page,
            theme,
            join(OUT, `${view}-${theme}`)
          );
          const seen = embeds
            .map((e) => {
              const url = new URL(e.src);
              return url.searchParams.get("by") === "embed"
                ? key(url.searchParams.getAll("story"))
                : `not an embed: ${e.src}`;
            })
            .sort();
          kit.check(
            `${leg}: one embed a Preview, each naming its Preview's stories (${embeds.length} of ${previews.length})`,
            key(seen) === key(WANTED),
            `seen ${seen.join(" | ")}\nwanted ${WANTED.join(" | ")}`
          );
          const faults = [...embeds.flatMap(embedDrawFaults), ...undrawn];
          kit.check(
            `${leg}: every embed draws its stories (${embeds.map((e) => `${e.shots.map((shot) => shot.story).join("+")}`).join("; ")})`,
            embeds.length === previews.length && faults.length === 0,
            faults.slice(0, 12).join("\n    ")
          );
          const chrome = embeds.flatMap((e) => e.chrome);
          const tall = embeds.filter((e) => Math.abs(e.box.h - e.tall) > 2);
          kit.check(
            `${leg}: no canvas chrome, every embed as tall as it draws, no console error`,
            chrome.length === 0 && tall.length === 0 && errors.length === 0,
            [
              ...chrome,
              ...tall.map((e) => `${e.caption}: ${e.box.h}px of ${e.tall}`),
              ...new Set(errors),
            ]
              .slice(0, 12)
              .join("\n    ")
          );
          await page.close();
        }
      }
    } finally {
      await stage.stop();
    }
  },
};

export default spec;
