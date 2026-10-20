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
 * At 390 the one frame wider than a phone's card (after Wide panel, 560)
 * scrolls sideways, under the house edge fade where more is hidden.
 *
 * Writes each leg's page as `capturePage` cuts it (decision-embeds.ts: one
 * file, or numbered sections between cards, each under the hub's 1 MiB) to
 * `.probe/decision-pages/caw-panel-{1440,390}-{light,dark}[-N].png`, and
 * `caw-panel-manifest.json` beside them: each card's question and options,
 * and every check above with its output. The run writes them into a
 * staging folder and swaps them in at its end, replacing only this page's
 * files: the folder holds every decision page's captures, and the last
 * run's stand until this one's are whole.
 *
 *   bun scripts/probe-kit/run.ts web caw-panel-capture
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import type { Page } from "playwright-core";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  blankEmbeds,
  CAWCO_BRIDGE,
  captureFaults,
  capturePage,
  EMBED_FRAME,
  type Embed,
  embedDrawFaults,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, SCALE, type Spec, THEMES } from "../../kit";

/** Every decision page's captures: a folder this spec shares with the others. */
const OUT = join(ROOT, ".probe/decision-pages");
const NAME = "caw-panel";
/**
 * This run's capture files and manifest until it ends: the last run's stay in OUT
 * meanwhile, and only this page's files there are replaced (publish).
 */
const NEXT = join(OUT, `.${NAME}-next`);
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
/**
 * The resize card's size past the rest one (after Wide panel, 560): wider
 * than a phone's card can hold with legible words, so at 390 it scrolls
 * sideways in its frame, under the house edge fade, its caption saying so;
 * at 1440 it stands whole like every other frame.
 */
const WIDER_THAN_A_PHONE = new Set(["Wide"]);
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
function frameChecks(embeds: Embed[], say: Say, narrow: boolean): void {
  const wide = embeds.flatMap((e) =>
    e.frames
      .filter((f) => f.wide && !(narrow && WIDER_THAN_A_PHONE.has(f.story)))
      .map(
        (f) =>
          `“${e.caption}”: ${f.w}px drawn, scrolls ${f.scrolls}px at ${f.zoom}× (its words ${f.type}px)`
      )
  );
  say(
    narrow
      ? `every frame stands whole in its card, the desk sizes wider than a phone (${[...WIDER_THAN_A_PHONE].join(", ")}) aside: they scroll sideways, their captions saying their width`
      : "every frame stands whole in its card: none scrolls sideways",
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
 * Each frame of the embed that scrolls its story sideways, read at the
 * start of its scroll: the house edge fade's lengths there (`--fade-start`,
 * `--fade-end`) and its mask. In the embed's page.
 */
function startFades() {
  return [
    ...document.querySelectorAll<HTMLElement>(".cawco-frame[data-cawco-wide]"),
  ].map((frame) => {
    frame.scrollLeft = 0;
    const style = getComputedStyle(frame);
    return {
      story: frame.dataset.cawcoStory ?? "",
      start: Number.parseFloat(style.getPropertyValue("--fade-start")) || 0,
      end: Number.parseFloat(style.getPropertyValue("--fade-end")) || 0,
      mask: style.maskImage,
    };
  });
}

/** Every frame that scrolls sideways draws the house edge fade on the side where more is hidden (at its start, the end side) and none at its start. */
async function wideFades(page: Page, say: Say): Promise<void> {
  const fades: ReturnType<typeof startFades> = [];
  for (const handle of await page.$$(EMBED_FRAME)) {
    await handle.scrollIntoViewIfNeeded();
    fades.push(
      ...((await (await handle.contentFrame())?.evaluate(startFades)) ?? [])
    );
  }
  const bare = fades.filter(
    (one) => one.end <= 0 || one.start !== 0 || one.mask === "none"
  );
  say(
    `each frame that scrolls sideways (${fades.length}) draws the house edge fade where more is hidden`,
    bare.length === 0,
    fades
      .map(
        (one) =>
          `${one.story}: fades ${one.start}px at its start, ${one.end}px at its end, mask ${one.mask === "none" ? "none" : "drawn"}`
      )
      .join("; ") || "none scrolls"
  );
}

/**
 * This run's files into OUT: this page's files from the last run out
 * (`caw-panel-*`), this run's in, every other page's captures left as
 * they are.
 */
function publish(): void {
  for (const old of readdirSync(OUT)) {
    if (old.startsWith(`${NAME}-`)) {
      rmSync(join(OUT, old));
    }
  }
  for (const made of readdirSync(NEXT)) {
    renameSync(join(NEXT, made), join(OUT, made));
  }
  rmSync(NEXT, { recursive: true, force: true });
}

const spec: Spec = {
  name: "caw-panel-capture",
  run: async (kit: Kit) => {
    // Only this page's own: its staging and its frames (OUT holds every page's captures).
    rmSync(NEXT, { recursive: true, force: true });
    rmSync(join(OUT, "frames", NAME), { recursive: true, force: true });
    mkdirSync(NEXT, { recursive: true });
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
            join(OUT, "frames", NAME, `${width}-${theme}`)
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
          frameChecks(embeds, say, width < 1440);
          await suggestionRows(page, say);
          await wideFades(page, say);
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
          const shot = join(NEXT, `${NAME}-${width}-${theme}.png`);
          const capture = await capturePage(page, shot);
          const { paints } = capture;
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
          const captured = captureFaults(capture);
          check(
            leg,
            "the capture is files a delegate can hand over, each under 1 MiB, cut between cards, its whole picture pixel for pixel",
            capture.files.length > 0 && captured.length === 0,
            captured.join(" | ") ||
              capture.files
                .map(
                  (one) =>
                    `${basename(one.path)} ${Math.round(one.bytes / 1024)} KiB, rows ${one.rows.from}–${one.rows.to}`
                )
                .join(", ")
          );
          // Where each stands once the run publishes them.
          shots.push(
            ...capture.files.map((one) =>
              join(OUT, basename(one.path)).slice(ROOT.length + 1)
            )
          );
          await page.close();
        }
      }
    } finally {
      await stage.stop();
    }
    writeFileSync(
      join(NEXT, `${NAME}-manifest.json`),
      `${JSON.stringify(
        {
          page: "78a326ed-76cd-44b0-90c3-5e3261a17b56",
          revision: 10,
          program: "decisions/caw-panel/page.oui",
          shots,
          cards: cardsOf(PROGRAM),
          checks,
        },
        null,
        2
      )}\n`
    );
    publish();
  },
};

export default spec;
