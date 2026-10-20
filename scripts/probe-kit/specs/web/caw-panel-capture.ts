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
 * 4. No console error, the page and its canvases, the hub's reads a
 *    hub-less stage answers 500 aside (caw-panel-page.ts `hubRead`).
 * 5. The page's own capture, taken window by window as the owner scrolls
 *    it (decision-embeds.ts `capturePage`), paints every embed: no embed's
 *    box is one flat colour (`blankEmbeds`).
 *
 * Also: every frame stands whole in its card (none scrolls sideways), each
 * Preview's caption says Desk or Phone, and each suggestion row on the new
 * thread is as wide as its words up to its column.
 *
 * Writes each leg's page as `capturePage` cuts it (decision-embeds.ts: one
 * file, or numbered sections between cards, each under the hub's 1 MiB) to
 * `.probe/decision-pages/caw-panel-{1440,390}-{light,dark}[-N].png`, and
 * `caw-panel-manifest.json` beside them: each card's question and options,
 * and every check above with its output. The run writes them into a
 * staging folder and swaps them in at its end, only when every check
 * held, replacing only this page's files: the folder holds every decision
 * page's captures, and the last good run's stand until a run passes
 * whole (a failed run's stay in the staging folder).
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
import { hubRead } from "../caw-panel-page";

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
  "dda87ce1-9038-440b-9e85-2d93e8f973f3": "OnePanel",
  "30cb56ef-1fd3-4f80-9aad-d36f63774198": "TodayThree",
  "d71cf33b-e77c-4885-b559-abfe4f9fc81b": "ComposerStays",
  "9d40f1b8-b066-464b-8792-f8217058efa8": "ComposerGoes",
  "71f13514-f17e-4d8d-9dc1-44dbfa8bb0ee": "HeadNamed",
  "88d46a90-ac87-4d49-a75a-d85bdf9ac738": "HeadOffscreen",
  "280e3aa4-1924-4424-a8e9-51b2e5b10bbd": "States",
};

const DECISION =
  /^(\w+) = Decision\("([^"]+)", "((?:[^"\\]|\\.)*)", \[([^\]]*)\]/;
const OPTION =
  /^(\w+) = Option\("([^"]+)", "((?:[^"\\]|\\.)*)"[^\n]*?, (true|false), /;
const PREVIEW = /^\w+ = Preview\("([0-9a-f-]+)"/;
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

/** Every frame stands whole in its card (none scrolls sideways), and each Preview's caption says Desk or Phone. */
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
      (e) => e.named.length === 0 || !FORM.test(e.caption.split(" · ")[1])
    )
    .map((e) => `“${e.caption}” shows ${e.named.join(", ")}`);
  say(
    "each Preview names its stories, its caption saying Desk or Phone",
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
    const column = row.closest<HTMLElement>("[data-slot=empty]") as HTMLElement;
    const action = row.closest<HTMLElement>(
      "[data-slot=empty] > div[data-box]"
    );
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
  const rows: ReturnType<typeof rowWidths> = [];
  for (const handle of await page.$$(EMBED_FRAME)) {
    const src = (await handle.getAttribute("src")) ?? "";
    if (src.includes("States")) {
      rows.push(
        ...((await (await handle.contentFrame())?.evaluate(rowWidths)) ?? [])
      );
    }
  }
  const off = rows.filter(
    (r) =>
      Math.abs(r.action - r.column) > 1 ||
      Math.abs(r.drawn - Math.min(r.words, r.list)) > 1
  );
  say(
    "each suggestion row on the new thread is as wide as its words, up to the column's width",
    rows.length > 0 && off.length === 0,
    (off.length ? off : rows)
      .map(
        (r) =>
          `row ${r.drawn} (words ${r.words}), list ${r.list}, action ${r.action} of column ${r.column}`
      )
      .join("; ") || "no rows"
  );
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
          /** The hub's reads the stage can't answer (it has no hub), each once. */
          const hubless = new Set<string>();
          page.on("console", (message) => {
            if (message.type() !== "error") {
              return;
            }
            const hub = hubRead(message.text(), message.location().url);
            if (hub) {
              hubless.add(hub);
            } else {
              errors.push(message.text().slice(0, 240));
            }
          });
          page.on("pageerror", (error) =>
            errors.push(error.message.slice(0, 240))
          );
          await page.goto(stage.pageUrl(NAME, theme), { waitUntil: "load" });
          await page.waitForSelector("[data-slot=decision]", {
            timeout: 30_000,
          });
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
          frameChecks(embeds, say);
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
            "no console errors, the page and its canvases, the hub's reads a hub-less stage can't answer aside",
            errors.length === 0,
            `${[...new Set(errors)].slice(0, 12).join(" | ") || "none"}; set aside: ${[...hubless].join(", ") || "none"}`
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
          // The program in the branch, not yet sent to the live page.
          published: false,
          program: "decisions/caw-panel/page.oui",
          shots,
          cards: cardsOf(PROGRAM),
          checks,
        },
        null,
        2
      )}\n`
    );
    // Only a run whose every check held replaces the last good set; a
    // failed one leaves it standing, and its own files in the staging
    // folder to read.
    if (checks.every((one) => one.ok)) {
      publish();
    }
  },
};

export default spec;
