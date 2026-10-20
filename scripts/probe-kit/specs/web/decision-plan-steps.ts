/**
 * The plan-steps decision page (apps/dashboard plan/proposal/page.oui) as
 * the owner sees it, through the hub's decision host with no hub
 * (decision-embeds.ts): its program as written, each Preview the live
 * canvas of its way's states file.
 *
 * At 1440×900 and 390×844, light and dark, each embed scrolled to as the
 * owner would, read in its own frame:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. Every embed draws the stories its Preview names: each frame drawn,
 *    with words in it, shot where the owner sees it (canvas-shots.ts).
 * 3. No console error, the page's or its canvases'.
 * 4. Nothing scrolls the page sideways.
 * 5. The page's own capture paints every embed: the whole page pictured
 *    window by window as the person scrolls it (decision-embeds.ts
 *    `capturePage`), no embed's box one colour in it.
 *
 * The page draws as CawCo shows it, through the overlay's bridge
 * (`CAWCO_BRIDGE`). Each leg's picture goes to .probe/decision-pages, beside
 * a manifest of its card (question, options, recommended), what each embed
 * drew, and every check with its output.
 *
 *   bun scripts/probe-kit/run.ts web decision-plan-steps
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  APP,
  blankEmbeds,
  CAWCO_BRIDGE,
  capturePage,
  EMBED_FRAME,
  embedDrawFaults,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, type Spec, settle, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/decision-pages");
const SHOTS = join(OUT, "plan-steps-frames");
const NAME = "plan-steps";
const PROPOSAL = "src/lib/cawco/plan/proposal";
const PROGRAM = readFileSync(join(APP, PROPOSAL, "page.oui"), "utf8");

/** Each way's canvas, by the artifact id its Preview names, and the states file it draws. */
const CANVASES: Record<string, readonly string[]> = {
  "0d0429d6-606f-48fa-89cf-dfbb05968c65": [`${PROPOSAL}/OneList.stories.ts`],
  "02d5597b-58da-4157-be36-8806f1278d1d": [`${PROPOSAL}/Lanes.stories.ts`],
  "b8f93d08-75a2-4323-8ca8-11f50c8f662c": [`${PROPOSAL}/CrewFirst.stories.ts`],
};

/** A Preview as the program writes it: `Preview("id", "caption", ["A", "B"])`. */
const PREVIEW = /Preview\("([^"]+)",\s*"([^"]*)",\s*\[([^\]]*)\]\)/g;

/** Each Preview's caption and the stories it names, as the program writes them. */
const named = new Map(
  [...PROGRAM.matchAll(PREVIEW)].map(([, , caption = "", stories = ""]) => [
    caption,
    [...stories.matchAll(/"([^"]+)"/g)].map((one) => one[1] ?? ""),
  ])
);

interface Checked {
  check: string;
  output: string;
  passed: boolean;
}

const spec: Spec = {
  name: "decision-plan-steps",
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(SHOTS, { recursive: true });
    const checks: Checked[] = [];
    const check = (name: string, passed: boolean, output: string) => {
      checks.push({ check: name, passed, output });
      kit.check(name, passed, output);
    };

    let refusal = "";
    try {
      checkProgram(PROGRAM);
    } catch (error) {
      refusal = (error as Error).message;
    }
    check(
      "the hub's check keeps the program",
      refusal === "",
      refusal || "kept"
    );

    const stage = await startDecisionStage(
      new Map([[NAME, PROGRAM]]),
      CANVASES
    );
    const legs: Record<string, unknown> = {};
    let cards: unknown = [];
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const size = view === "desk" ? "1440" : "390";
          const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
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
            { n: named.size, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const { embeds, undrawn } = await readEmbeds(
            page,
            theme,
            join(SHOTS, `${size}-${theme}`)
          );

          const faults = [
            ...embeds.flatMap((e) =>
              embedDrawFaults({ ...e, named: named.get(e.caption) ?? [] })
            ),
            ...undrawn,
          ];
          check(
            `${leg}: every embed draws the stories its Preview names (${embeds.map((e) => `“${e.caption}” ${e.frames.map((f) => `${f.story} ${f.state}`).join(" + ") || "none"}`).join("; ")})`,
            embeds.length === named.size && faults.length === 0,
            faults.join("\n    ") ||
              `${embeds.length} of ${named.size} embeds, each its named stories drawn`
          );
          check(
            `${leg}: no console errors, the page and its canvases`,
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join("\n    ") || "none"
          );
          await page.evaluate(() => window.scrollTo(0, 0));
          await settle(page, 600);
          const sideways = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            view: innerWidth,
          }));
          check(
            `${leg}: nothing scrolls the page sideways (${sideways.scroll} wide in ${sideways.view})`,
            sideways.scroll <= sideways.view,
            `${sideways.scroll}px of content in a ${sideways.view}px view`
          );

          cards = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>(".dp-card")].map(
              (card) => ({
                question: card.querySelector("h2")?.textContent?.trim() ?? "",
                why: card.querySelector(".dp-why")?.textContent?.trim() ?? "",
                options: [
                  ...card.querySelectorAll<HTMLElement>("[data-option]"),
                ].map((option) => ({
                  id: option.dataset.option ?? "",
                  text: option.innerText.replace(/\s+/g, " ").trim(),
                  recommended: option.querySelector(".dp-tag") !== null,
                })),
              })
            )
          );
          legs[leg] = embeds.map((e) => ({
            caption: e.caption,
            named: named.get(e.caption) ?? [],
            box: e.box,
            tall: e.tall,
            frames: e.frames,
          }));
          const paints = await capturePage(
            page,
            join(OUT, `${NAME}-${size}-${theme}.png`)
          );
          const blank = blankEmbeds(paints);
          check(
            `${leg}: the page's own capture paints every embed (${paints.map((one) => `“${one.embed}” ${Math.round(one.flat * 1000) / 10}% its commonest colour`).join(", ")})`,
            paints.length === named.size && blank.length === 0,
            blank.join("\n    ") ||
              `${paints.length} of ${named.size} embeds painted`
          );
          await page.close();
        }
      }
    } finally {
      await stage.stop();
    }
    writeFileSync(
      join(OUT, `${NAME}-manifest.json`),
      `${JSON.stringify({ page: NAME, cards, embeds: legs, checks }, null, 2)}\n`
    );
  },
};

export default spec;
