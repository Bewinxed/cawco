/**
 * Caw's panel decision page (decisions/caw-panel/page.oui) as the owner
 * will see it, through the hub's decision host with no hub
 * (decision-embeds.ts): each Preview a live embed of its option's states
 * file (apps/dashboard/src/lib/cawco/project/caw-panel/), drawn by the
 * dashboard's own stage.
 *
 * At 1440×900 and 390×844, light and dark, each embed scrolled to as the
 * owner would, then read in its own frame:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. Every embed draws the stories its Preview names: each frame drawn,
 *    with words in it, shot where the person sees it (canvas-shots.ts
 *    `shootEmbedded`), and only those stories.
 * 3. The page never scrolls sideways.
 * 4. No console error, the page and its canvases.
 * 5. The page's own capture, taken window by window as the owner scrolls
 *    it (decision-embeds.ts `capturePage`), paints every embed: no embed's
 *    box is one flat colour (`blankEmbeds`).
 *
 * Writes each leg's whole page to
 * `.probe/decision-pages/caw-panel-{1440,390}-{light,dark}.png`, and
 * `caw-panel-manifest.json` beside them: each card's question and options,
 * and every check above with its output.
 *
 *   bun scripts/probe-kit/run.ts web caw-panel-capture
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  blankEmbeds,
  CAWCO_BRIDGE,
  capturePage,
  EMBED_FRAME,
  embedDrawFaults,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, SCALE, type Spec, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/decision-pages");
const NAME = "caw-panel";
const PROGRAM = readFileSync(
  join(ROOT, "decisions/caw-panel/page.oui"),
  "utf8"
);
const STATES = "src/lib/cawco/project/caw-panel";

/** Each option canvas's artifact id, as the program names it, and its states file. */
const FILES: Record<string, string> = {
  "33e17d68-3296-47d1-8c1c-3e0d282054d8": "HeadWho",
  "3f08b50a-76b4-4979-9390-42e0aacc1ecf": "HeadName",
  "61aff839-ed5e-4cdf-8447-a399b9b8edc8": "ResizeEdges",
  "56cd56c4-34ab-4fe4-9ead-f561a947d2c5": "ResizeCorner",
  "870d9878-9675-4e77-8af4-e74e0ff48b06": "ResizeMenu",
  "6750896d-df5a-4846-bb8d-a75c5f42a8b1": "BlockedStack",
  "52e4e7e5-846a-4729-84e7-85637a738128": "BlockedEdge",
  "e72b79f0-8685-4592-bc4c-ce4a0854f75d": "BlockedBeside",
  "d3b984b8-4781-44ba-8946-aecb574adec8": "NotWokenUnder",
  "cacf6b1b-9f55-4dc5-b1b3-881b8a4eeb46": "NotWokenCaw",
  "8c5a2f65-6841-4b4c-9528-01f0d28efc30": "SuggestRows",
  "a52dce62-26be-4ec3-9a01-f487e36d2b66": "SuggestChips",
  "52327db9-598b-4f8d-8aac-e0e934bb33b1": "FiledRows",
  "7c9085ce-4c22-4280-a5ea-bbbdd8801e54": "FiledCards",
  "1340cb12-10ef-4b4b-ad3a-01799d179f0f": "Pins",
};

const DECISION =
  /^(\w+) = Decision\("([^"]+)", "((?:[^"\\]|\\.)*)", \[([^\]]*)\]/;
const OPTION =
  /^(\w+) = Option\("([^"]+)", "((?:[^"\\]|\\.)*)"[^\n]*?, (true|false), /;
const PREVIEW = /^\w+ = Preview\("([0-9a-f-]+)"/;

/** Each card's question and its options, in the program's order. */
function cardsOf(program: string) {
  const lines = program.split("\n");
  const options = new Map<
    string,
    { id: string; label: string; recommended: boolean }
  >();
  for (const line of lines) {
    const found = OPTION.exec(line);
    if (found) {
      options.set(found[1], {
        id: found[2],
        label: found[3],
        recommended: found[4] === "true",
      });
    }
  }
  return lines.flatMap((line) => {
    const found = DECISION.exec(line);
    if (!found) {
      return [];
    }
    return [
      {
        id: found[2],
        question: found[3].replace(/\\"/g, '"'),
        options: found[4]
          .split(",")
          .map((one) => options.get(one.trim()))
          .filter((one) => one !== undefined),
      },
    ];
  });
}

const spec: Spec = {
  name: "caw-panel-capture",
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    const checks: {
      leg: string;
      ok: boolean;
      assertion: string;
      output: string;
    }[] = [];
    const check = (
      leg: string,
      assertion: string,
      ok: boolean,
      output: string
    ) => {
      checks.push({ leg, ok, assertion, output });
      kit.check(`${leg}: ${assertion}`, ok, output);
    };

    let refusal = "";
    try {
      checkProgram(PROGRAM);
    } catch (error) {
      refusal = (error as Error).message;
    }
    check(
      "program",
      "the hub's check keeps the program",
      refusal === "",
      refusal || "kept"
    );
    const previews = PROGRAM.split("\n").filter((line) =>
      PREVIEW.test(line)
    ).length;
    const files = Object.fromEntries(
      Object.entries(FILES).map(([id, file]) => [
        id,
        [`${STATES}/${file}.stories.ts`],
      ])
    );

    const stage = await startDecisionStage(new Map([[NAME, PROGRAM]]), files);
    const shots: string[] = [];
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const width = view === "desk" ? 1440 : 390;
          const leg = `${width === 1440 ? "1440×900" : "390×844"} ${theme}`;
          // With the overlay's bridge, as CawCo shows the page: picks live, no offline notice.
          const page = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
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
            { n: previews, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const { embeds, undrawn } = await readEmbeds(
            page,
            theme,
            join(OUT, "frames", `${width}-${theme}`)
          );
          const faults = [...embeds.flatMap(embedDrawFaults), ...undrawn];
          check(
            leg,
            `every embed (${embeds.length} of ${previews}) draws the stories its Preview names`,
            embeds.length === previews && faults.length === 0,
            faults.join(" | ") ||
              embeds
                .map(
                  (e) =>
                    `${e.file}: ${e.shots.map((one) => `${one.story} ${one.stats.width / SCALE}×${one.stats.height / SCALE}`).join(" + ")}`
                )
                .join("; ")
          );
          await page.evaluate(() => window.scrollTo(0, 0));
          const across = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
          }));
          check(
            leg,
            "the page never scrolls sideways",
            across.scroll <= across.client + 1,
            `scrollWidth ${across.scroll}, clientWidth ${across.client}`
          );
          check(
            leg,
            "no console errors, the page and its canvases",
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join(" | ") || "none"
          );
          // The whole page as the owner scrolls it, window by window (decision-embeds.ts
          // `capturePage`: a full-page shot draws a cross-origin embed past the first window blank).
          const shot = join(OUT, `${NAME}-${width}-${theme}.png`);
          const paints = await capturePage(page, shot);
          const blank = blankEmbeds(paints);
          check(
            leg,
            `the page's own capture paints every embed (${paints.length} of ${previews})`,
            paints.length === previews && blank.length === 0,
            blank.join(" | ") ||
              paints
                .map(
                  (one) =>
                    `${one.embed} at y ${one.rect.y}: ${Math.round(one.flat * 1000) / 10}% its commonest colour`
                )
                .join("; ")
          );
          shots.push(shot.slice(ROOT.length + 1));
          await page.close();
        }
      }
    } finally {
      await stage.stop();
    }
    writeFileSync(
      join(OUT, `${NAME}-manifest.json`),
      `${JSON.stringify(
        {
          page: "78a326ed-76cd-44b0-90c3-5e3261a17b56",
          revision: 4,
          program: "decisions/caw-panel/page.oui",
          shots,
          cards: cardsOf(PROGRAM),
          checks,
        },
        null,
        2
      )}\n`
    );
  },
};

export default spec;
