/**
 * A decision page's Previews of component canvases, drawn as CawCo shows
 * the page (through the overlay's bridge, decision-embeds.ts `CAWCO_BRIDGE`)
 * by the hub's decision host with no hub, on the stage of this spec's own
 * fixture (fixtures/decision-embed):
 * - the first card embeds two states files, a ledger of six 480px months
 *   and the note under it, which stands past three heights of the embed's
 *   frame (runtime.ts UNMOUNT_MARGIN, where the far observer puts a section
 *   to sleep), and its Recommended option embeds the note's one story by
 *   name (`Preview(…, ["Pinned"])`);
 * - the second card holds three Previews: a 360px side card (wider than a
 *   card's media on a phone), the note, and the ledger's first month.
 *
 * At 1440×900 and 390×844, light and dark:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. Each embed is the canvas `by=embed`, with a `story` for each its
 *    Preview names.
 * 3. Its sections stay awake, the far one too: read as the person reaches
 *    each embed by scrolling the page (nothing inside it moved), and again
 *    after the page is scrolled away and back, every states file it holds
 *    is loaded and every story it shows a drawn frame with a box.
 * 4. It draws the stories its Preview names (every story when it names
 *    none): each frame drawn, with words in it, shot where the person sees
 *    it (canvas-shots.ts `shootEmbedded`): nothing over it, not one colour,
 *    its pixels its DOM's paint.
 * 5. None of the canvas's working chrome is seen (band, crumb, foot, steps,
 *    section heads, labels, statuses).
 * 6. It posted its height: the embed is as tall as what it draws, within
 *    2px. Each frame stands inside its width, centred in it within 1px; one
 *    narrower than the embed at its own width, one wider scaled down to fit
 *    (CSS zoom) and never reflowed: its drawn width its own times its zoom.
 *    Its words at 12px or more as drawn, 10px where it is scaled.
 * 7. A card's three media stand in one column, each at the card's full
 *    width.
 * 8. The page is as CawCo shows it: no offline notice, Send picks enabled,
 *    every option enabled with its keycap; at 390 the note and Send picks
 *    44px tall (DESIGN.md, The 44 Touch Rule).
 * 9. The page's own capture, stacked from the window at each scroll
 *    (decision-embeds.ts `capturePage`), paints every embed: no embed's box
 *    in it is one flat colour.
 * 10. No console error.
 *
 *   bun scripts/probe-kit/run.ts web decision-embed
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  blankEmbeds,
  CAWCO_BRIDGE,
  capturePage,
  EMBED_FRAME,
  type Embed,
  embedDrawFaults,
  idOf,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, SCALE, type Spec, settle, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/decision-embed");
const FIXTURE = join(ROOT, "scripts/probe-kit/fixtures/decision-embed");
const SCRATCH = join(process.env.TMPDIR ?? "/tmp", "decision-embed");
const NAME = "ledger";
const LEDGER = "src/Ledger.stories.js";
const NOTE = "src/Note.stories.js";
const SIDE = "src/Side.stories.js";
const BOOK_ID = idOf("ledger-and-note");
const NOTE_ID = idOf("note-alone");
const SIDE_ID = idOf("side-card");
const MONTH_ID = idOf("ledger-month");
/** The side card's own width (its story's viewport). */
const SIDE_W = 360;

const MONTHS = ["January", "February", "March", "April", "May", "June"];

/** Each Preview, by its caption: the states files its canvas holds, the stories it names (none: every story they have) and the stories it shows. */
const PREVIEWS: Record<
  string,
  {
    files: readonly string[];
    shows: readonly string[];
    stories: readonly string[];
  }
> = {
  "The ledger and its note": {
    files: [LEDGER, NOTE],
    stories: [],
    shows: [...MONTHS, "Pinned"],
  },
  "The note alone": { files: [NOTE], stories: ["Pinned"], shows: ["Pinned"] },
  "The side card": { files: [SIDE], stories: [], shows: ["Card"] },
  "The note": { files: [NOTE], stories: ["Pinned"], shows: ["Pinned"] },
  "January's lines": {
    files: [LEDGER],
    stories: ["January"],
    shows: ["January"],
  },
};
/** The second card's three media, by caption. */
const TRIO = ["The side card", "The note", "January's lines"];

const PROGRAM = [
  `root = Decisions("The spend ledger", [ledger, side])`,
  `ledger = Decision("ledger", "Where does the pinned note stand?", [under, alone], "The ledger is long; the note is what a person acts on.", [book])`,
  `under = Option("under", "Under the ledger", "The note after every line.", false, [], "A person scrolls past sixty lines to reach it.")`,
  `alone = Option("alone", "On its own", "The note in a card of its own.", true, [note], "The ledger loses its summary line.")`,
  `book = Preview("${BOOK_ID}", "The ledger and its note")`,
  `note = Preview("${NOTE_ID}", "The note alone", ["Pinned"])`,
  `side = Decision("side", "Which goes beside the ledger?", [card, pin], "Three ways, each at the card's full width.", [card1, pin1, month1])`,
  `card = Option("card", "The side card", "The week's spend in its own card.", true, [], "It takes 360px beside the ledger.")`,
  `pin = Option("pin", "The note", "Only the pinned note.", false, [], "The week's spend is a click away.")`,
  `card1 = Preview("${SIDE_ID}", "The side card")`,
  `pin1 = Preview("${NOTE_ID}", "The note", ["Pinned"])`,
  `month1 = Preview("${MONTH_ID}", "January's lines", ["January"])`,
].join("\n");

/** The fixture copied to scratch and installed once: the project the stage draws. */
function fixtureRoot(): string {
  mkdirSync(SCRATCH, { recursive: true });
  cpSync(FIXTURE, SCRATCH, { recursive: true });
  if (!existsSync(join(SCRATCH, "node_modules"))) {
    const install = Bun.spawnSync(["bun", "install"], { cwd: SCRATCH });
    if (install.exitCode !== 0) {
      throw new Error(
        `bun install in ${SCRATCH} failed: ${install.stderr.toString().slice(0, 400)}`
      );
    }
  }
  return SCRATCH;
}

/** The page's own controls and its media's columns, from the engine. */
function readPage() {
  const tall = (el: Element | null) =>
    el ? Math.round(el.getBoundingClientRect().height) : 0;
  const send = document.querySelector<HTMLButtonElement>(".dp-send");
  const options = [...document.querySelectorAll<HTMLButtonElement>(".dp-opt")];
  const trio = [...document.querySelectorAll(".dp-card")]
    .map((card) => card.querySelector(".dp-show"))
    .filter((show): show is Element => !!show && show.children.length === 3)
    .map((show) => ({
      show: Math.round(show.getBoundingClientRect().width),
      items: [...show.children].map((one) => {
        const r = one.getBoundingClientRect();
        return {
          caption: one.querySelector("figcaption")?.textContent?.trim() ?? "",
          x: Math.round(r.left),
          w: Math.round(r.width),
        };
      }),
    }));
  return {
    offline: document.querySelector(".dp-offline")?.textContent?.trim() ?? "",
    send: { h: tall(send), disabled: send?.disabled ?? true },
    note: Math.min(
      ...[...document.querySelectorAll(".dp-note textarea")].map(tall)
    ),
    options: options.map((one) => ({
      option: one.dataset.option ?? "",
      disabled: one.disabled,
      keycap: tall(one.querySelector(".dp-kc")),
    })),
    trio,
  };
}

const spec: Spec = {
  name: "decision-embed",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every assertion in the order the spec's head lists them
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

    const stage = await startDecisionStage(
      new Map([[NAME, PROGRAM]]),
      {
        [BOOK_ID]: [LEDGER, NOTE],
        [NOTE_ID]: [NOTE],
        [SIDE_ID]: [SIDE],
        [MONTH_ID]: [LEDGER],
      },
      { root: fixtureRoot(), kit: false }
    );
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
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
          const count = Object.keys(PREVIEWS).length;
          await page.waitForFunction(
            ({ n, selector }) =>
              document.querySelectorAll(selector).length === n,
            { n: count, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const wanted = (caption: string) =>
            PREVIEWS[caption] ?? { files: [], shows: [], stories: [] };

          // Reached by scrolling the page alone, then scrolled away and back: nothing inside an embed moved yet.
          const reached = await readEmbeds(page, theme, null);
          await page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight)
          );
          await settle(page, 600);
          await page.evaluate(() => window.scrollTo(0, 0));
          await settle(page, 600);
          const back = await readEmbeds(page, theme, null);
          const asleep = [...reached.embeds, ...back.embeds].flatMap((e) => [
            ...wanted(e.caption)
              .files.filter((file) => !e.loaded.includes(file))
              .map(
                (file) =>
                  `“${e.caption}”: ${file} not loaded (loaded: ${e.loaded.join(", ") || "none"})`
              ),
            // Every story it shows stands drawn with a box: a sleeping section's frames are taken down.
            ...wanted(e.caption).shows.flatMap((story) => {
              const frame = e.frames.find((f) => f.story === story);
              return frame && frame.state === "drawn" && frame.h >= 8
                ? []
                : [
                    `“${e.caption}” ${story}: ${frame ? `${frame.state || "no state"}, ${frame.h}px tall` : "no frame drawn"}`,
                  ];
            }),
          ]);
          kit.check(
            `${leg}: every embed's sections stay awake, the far one too, reached by the page's scroll and scrolled away and back (${back.embeds.map((e) => `“${e.caption}” ${e.loaded.length} of ${wanted(e.caption).files.length} loaded`).join(", ")})`,
            reached.embeds.length === count &&
              back.embeds.length === count &&
              asleep.length === 0,
            [...new Set(asleep)].join("\n    ")
          );

          // Then each frame shot where the person sees it, and the embed read again.
          const { embeds, undrawn } = await readEmbeds(
            page,
            theme,
            join(OUT, `${view}-${theme}`)
          );
          undrawn.unshift(...reached.undrawn, ...back.undrawn);
          const addressed = embeds.flatMap((e) => {
            const url = new URL(e.src);
            const story = url.searchParams.getAll("story");
            return url.searchParams.get("by") === "embed" &&
              story.join() === wanted(e.caption).stories.join()
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
                named: [...wanted(e.caption).stories],
              })
            ),
            ...new Set(undrawn),
          ];
          kit.check(
            `${leg}: every embed draws the stories its Preview names (${embeds.map((e) => `“${e.caption}” ${e.shots.map((shot) => `${shot.story} ${shot.stats.width / SCALE}×${shot.stats.height / SCALE} (${shot.stats.matched} points its paint)`).join(" + ") || "none"}`).join("; ")})`,
            embeds.length === count && drawnFaults.length === 0,
            drawnFaults.join("\n    ")
          );
          const chromeSeen = embeds.flatMap((e) =>
            e.chrome.map((part) => `“${e.caption}”: ${part}`)
          );
          kit.check(
            `${leg}: no embed shows the canvas's working chrome`,
            chromeSeen.length === 0,
            chromeSeen.slice(0, 12).join("\n    ")
          );
          kit.check(
            `${leg}: every embed as tall as it draws (${embeds.map((e) => `“${e.caption}” ${e.box.w}×${e.box.h} drawing ${e.tall}`).join(", ")})`,
            embeds.length === count &&
              embeds.every((e) => Math.abs(e.box.h - e.tall) <= 2),
            embeds
              .filter((e) => Math.abs(e.box.h - e.tall) > 2)
              .map(
                (e) => `“${e.caption}”: ${e.box.h}px tall, drawing ${e.tall}px`
              )
              .join("\n    ")
          );
          const framed = (e: Embed) =>
            e.frames.map((f) => ({
              ...f,
              caption: e.caption,
              gap: Math.abs(f.left - (e.width - f.right)),
              past: f.right - e.width,
            }));
          const frames = embeds.flatMap(framed);
          const placeFaults = frames.flatMap((f) => [
            ...(f.past > 1
              ? [`“${f.caption}” ${f.story}: ${f.past}px past the embed`]
              : []),
            ...(f.gap > 1
              ? [
                  `“${f.caption}” ${f.story}: ${f.left}px before and ${f.left + f.gap}px after it, not centred`,
                ]
              : []),
          ]);
          kit.check(
            `${leg}: every frame inside its embed and centred in it (${frames.map((f) => `${f.story} ${f.w}px at ${f.left}`).join(", ")})`,
            frames.length > 0 && placeFaults.length === 0,
            placeFaults.join("\n    ")
          );
          const sides = frames.filter((f) => f.story === "Card");
          const fitFaults = sides.flatMap((f) => {
            const own = Math.round(SIDE_W * f.zoom);
            return Math.abs(f.w - own) <= 1
              ? []
              : [
                  `“${f.caption}” Card: ${f.w}px drawn at zoom ${f.zoom}, its own ${SIDE_W}px would draw ${own}px`,
                ];
          });
          const scaled = sides.filter((f) => f.zoom < 1);
          kit.check(
            `${leg}: the ${SIDE_W}px side card is never reflowed: drawn at its own width times its zoom (${sides.map((f) => `${f.w}px at zoom ${f.zoom}, its words at ${f.type}px`).join(", ")})${view === "phone" ? ", scaled to fit the phone's card" : ", at its own size on the desk"}`,
            sides.length > 0 &&
              fitFaults.length === 0 &&
              (view === "phone"
                ? scaled.length === sides.length
                : scaled.length === 0),
            fitFaults.join("\n    ")
          );
          const small = frames.filter((f) => f.type < (f.zoom < 1 ? 10 : 12));
          kit.check(
            `${leg}: every embed's words readable as drawn: 12px and up, 10px where scaled (smallest ${Math.min(...frames.map((f) => f.type))}px)`,
            small.length === 0,
            small
              .map(
                (f) =>
                  `“${f.caption}” ${f.story}: its words at ${f.type}px (zoom ${f.zoom})`
              )
              .join("\n    ")
          );

          const said = await page.evaluate(readPage);
          const [trio] = said.trio;
          const column =
            !!trio &&
            trio.items.map((one) => one.caption).join() === TRIO.join() &&
            trio.items.every(
              (one) =>
                Math.abs(one.w - trio.show) <= 1 &&
                Math.abs(one.x - (trio.items[0]?.x ?? 0)) <= 1
            );
          kit.check(
            `${leg}: a card's three media stand in one column, each at the card's full width (${trio ? `${trio.items.map((one) => `${one.w}px at ${one.x}`).join(", ")} in ${trio.show}px` : "no card of three"})`,
            column,
            JSON.stringify(said.trio)
          );
          const closed = said.options.filter(
            (one) => one.disabled || one.keycap === 0
          );
          kit.check(
            `${leg}: the page as CawCo shows it: no offline notice, Send picks enabled, every option live with its keycap (${said.options.length} options)`,
            said.offline === "" &&
              !said.send.disabled &&
              said.options.length > 0 &&
              closed.length === 0,
            [said.offline, JSON.stringify(closed)]
              .filter(Boolean)
              .join("\n    ")
          );
          if (view === "phone") {
            kit.check(
              `${leg}: under a finger the note ${said.note}px and Send picks ${said.send.h}px tall, 44px and up`,
              said.note >= 44 && said.send.h >= 44
            );
          }

          const paints = await capturePage(
            page,
            join(
              OUT,
              `${NAME}-${view === "desk" ? "1440" : "390"}-${theme}.png`
            )
          );
          const blank = blankEmbeds(paints);
          kit.check(
            `${leg}: the page's own capture paints every embed (${paints.map((one) => `“${one.embed}” ${Math.round(one.flat * 1000) / 10}% its commonest colour`).join(", ")})`,
            paints.length === count && blank.length === 0,
            blank.join("\n    ")
          );
          kit.check(
            `${leg}: no console errors, the page and its canvases`,
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join("\n    ")
          );
        }
      }
    } finally {
      await stage.stop();
    }
  },
};

export default spec;
