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
 * Also: every frame stands whole in its card (none scrolls sideways), each
 * frame is its own Preview captioned Desk or Phone, and each suggestion
 * row is as wide as its words up to its column.
 *
 * Writes each leg's page in tiles a window tall, each under 1 MiB, to
 * `.probe/decision-pages/caw-panel-{1440,390}-{light,dark}-NN.png`, and
 * `caw-panel-manifest.json` beside them: each card's question and options,
 * and every check above with its output.
 *
 *   bun scripts/probe-kit/run.ts web caw-panel-capture
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  blankEmbeds,
  CAWCO_BRIDGE,
  capturePage,
  EMBED_FRAME,
  type Embed,
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
  "d3b984b8-4781-44ba-8946-aecb574adec8": "NotWokenUnder",
  "cacf6b1b-9f55-4dc5-b1b3-881b8a4eeb46": "NotWokenCaw",
  "8c5a2f65-6841-4b4c-9528-01f0d28efc30": "SuggestRows",
  "a52dce62-26be-4ec3-9a01-f487e36d2b66": "SuggestChips",
  "52327db9-598b-4f8d-8aac-e0e934bb33b1": "FiledRows",
  "7c9085ce-4c22-4280-a5ea-bbbdd8801e54": "FiledCards",
};

const DECISION =
  /^(\w+) = Decision\("([^"]+)", "((?:[^"\\]|\\.)*)", \[([^\]]*)\]/;
const OPTION =
  /^(\w+) = Option\("([^"]+)", "((?:[^"\\]|\\.)*)"[^\n]*?, (true|false), /;
const PREVIEW = /^\w+ = Preview\("([0-9a-f-]+)"/;
/** The most a capture tile may weigh: a picture a reader opens whole. */
const MIB = 1024 * 1024;
/** A frame's caption names its form after the option's label: "Cards · Desk". */
const FORM = /^(Desk|Phone)\b/;

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

/** One leg's check: what it asserts, whether it holds, and the output that shows it. */
type Say = (assertion: string, ok: boolean, output: string) => void;

/** Every frame stands whole in its card (none scrolls sideways), and each is its own Preview captioned Desk or Phone. */
function frameChecks(embeds: Embed[], say: Say): void {
  const wide = embeds.flatMap((e) =>
    e.frames
      .filter((f) => f.wide)
      .map(
        (f) =>
          `“${e.caption}”: ${f.w}px drawn, scrolls ${f.scrolls}px at ${f.zoom}× (its words ${f.type}px)`
      )
  );
  say(
    "every frame stands whole in its card: none scrolls sideways",
    wide.length === 0,
    wide.join(" | ") ||
      embeds
        .map(
          (e) => `${e.caption} ${e.frames.map((f) => `${f.zoom}×`).join(" ")}`
        )
        .join("; ")
  );
  const unnamed = embeds
    .filter(
      (e) => e.named.length !== 1 || !FORM.test(e.caption.split(" · ")[1])
    )
    .map((e) => `“${e.caption}” shows ${e.named.join(", ")}`);
  say(
    "each frame is its own Preview, its caption saying Desk or Phone",
    unnamed.length === 0,
    unnamed.join(" | ") || embeds.map((e) => e.caption).join("; ")
  );
}

/** Each suggestion row's width, the words' own, its list's, and its empty state's action row and column, read in its frame. */
function rowWidths() {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] [data-slot="starter"]'
    ),
  ].map((row) => {
    const column = row.closest<HTMLElement>(".kit-empty") as HTMLElement;
    const action = row.closest<HTMLElement>(".kit-empty-action");
    const list = row.closest<HTMLElement>("ul");
    const drawn = row.getBoundingClientRect().width;
    const { inlineSize, maxInlineSize } = row.style;
    row.style.inlineSize = "max-content";
    row.style.maxInlineSize = "none";
    const words = row.getBoundingClientRect().width;
    row.style.inlineSize = inlineSize;
    row.style.maxInlineSize = maxInlineSize;
    const pad = getComputedStyle(column);
    return {
      drawn: Math.round(drawn),
      words: Math.round(words),
      list: Math.round(list?.getBoundingClientRect().width ?? 0),
      action: Math.round(action?.getBoundingClientRect().width ?? 0),
      column: Math.round(
        column.getBoundingClientRect().width -
          Number.parseFloat(pad.paddingInlineStart) -
          Number.parseFloat(pad.paddingInlineEnd)
      ),
    };
  });
}

/**
 * The suggestion rows, read in their own frame: the empty state's action
 * row as wide as its column, each row as wide as its words up to that
 * width (StarterCards `rows`).
 */
async function suggestionRows(page: Page, say: Say): Promise<void> {
  for (const handle of await page.$$(EMBED_FRAME)) {
    const src = (await handle.getAttribute("src")) ?? "";
    if (!src.includes("SuggestRows")) {
      continue;
    }
    const rows =
      (await (await handle.contentFrame())?.evaluate(rowWidths)) ?? [];
    const off = rows.filter(
      (r) =>
        Math.abs(r.action - r.column) > 1 ||
        Math.abs(r.drawn - Math.min(r.words, r.list)) > 1
    );
    say(
      "each suggestion row is as wide as its words, up to the column's width",
      rows.length > 0 && off.length === 0,
      (off.length ? off : rows)
        .map(
          (r) =>
            `row ${r.drawn} (words ${r.words}), list ${r.list}, action ${r.action} of column ${r.column}`
        )
        .join("; ") || "no rows"
    );
  }
}

/**
 * The page's capture in tiles a window tall, top to bottom, each a picture
 * a reader opens whole (the capture itself is several MiB), the capture
 * removed. Answers the tiles' paths from the repo's root.
 */
async function tileCapture(
  page: Page,
  shot: string,
  leg: string,
  say: Say
): Promise<string[]> {
  const whole = PNG.sync.read(readFileSync(shot));
  const step = Math.round(
    (await page.evaluate(() => innerHeight * devicePixelRatio)) || 1
  );
  const tiles: { bytes: number; path: string }[] = [];
  for (let top = 0; top < whole.height; top += step) {
    const rows = Math.min(step, whole.height - top);
    const tile = new PNG({ width: whole.width, height: rows });
    PNG.bitblt(whole, tile, 0, top, whole.width, rows, 0, 0);
    const path = join(
      OUT,
      `${NAME}-${leg}-${String(tiles.length + 1).padStart(2, "0")}.png`
    );
    const bytes = PNG.sync.write(tile, { colorType: 2, deflateLevel: 9 });
    writeFileSync(path, bytes);
    tiles.push({ path, bytes: bytes.length });
  }
  rmSync(shot);
  const heavy = tiles.filter((one) => one.bytes >= MIB);
  say(
    `the capture in ${tiles.length} tiles a window tall, each under 1 MiB`,
    tiles.length > 0 && heavy.length === 0,
    tiles
      .map(
        (one) =>
          `${one.path.split("/").at(-1)} ${Math.round(one.bytes / 1024)} KiB`
      )
      .join(", ")
  );
  return tiles.map((one) => one.path.slice(ROOT.length + 1));
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
          const say: Say = (assertion, ok, output) =>
            check(leg, assertion, ok, output);
          frameChecks(embeds, say);
          await suggestionRows(page, say);
          await page.evaluate(() => window.scrollTo(0, 0));
          const across = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
            tall: document.documentElement.scrollHeight,
          }));
          check(
            leg,
            "the page never scrolls sideways",
            across.scroll <= across.client + 1,
            `scrollWidth ${across.scroll}, clientWidth ${across.client}; the page ${across.tall}px tall`
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
          const tiles = await tileCapture(page, shot, `${width}-${theme}`, say);
          shots.push(...tiles);
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
          revision: 7,
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
