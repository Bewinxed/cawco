/**
 * A decision page's Previews of component canvases, drawn as CawCo shows
 * the page (through the overlay's bridge, decision-embeds.ts `CAWCO_BRIDGE`)
 * by the hub's decision host with no hub, on the stage of this spec's own
 * fixture (fixtures/decision-embed):
 * - the first card embeds two states files, a ledger of six 480px months
 *   and the note under it, which stands past three heights of the embed's
 *   frame (runtime.ts UNMOUNT_MARGIN, where the far observer puts a section
 *   to sleep); its Recommended option embeds the note's one story by name
 *   (`Preview(…, ["Pinned"])`), and its other option two months against
 *   the file's order (`Preview(…, ["March", "January"])`);
 * - the second card holds three Previews: the side card at 360px (wider
 *   than a card's media on a phone) and at 1400px (wider than any card),
 *   the note, and the ledger's first month; one option embeds a sheet
 *   whose surface is its ::before (as the kit's drawer-content.svelte).
 *
 * At 1440×900 and 390×844, light and dark:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. Each embed is the canvas `by=embed`, with a `story` for each its
 *    Preview names.
 * 3. Its sections stay awake, the far one too: read as the person reaches
 *    each embed by scrolling the page (nothing inside it moved), and again
 *    after the page is scrolled away and back, every states file it holds
 *    is loaded and every story it shows a drawn frame with a box.
 * 4. It draws the stories its Preview names, in the order it names them
 *    (every story, in its file's order, when it names none): each frame
 *    drawn, with words in it, shot where the person sees it (canvas-shots.ts
 *    `shootEmbedded`): nothing over it, not one colour, its pixels its DOM's
 *    paint, a pseudo-element's surface included.
 * 5. None of the canvas's working chrome is seen (band, crumb, foot, steps,
 *    section heads, labels, statuses).
 * 6. It posted its height: the embed is as tall as what it draws, within
 *    2px. Each frame stands inside its width, centred in it within 1px; one
 *    narrower than the embed at its own width, one wider scaled down to fit
 *    (CSS zoom) and never reflowed: its drawn width its own times its zoom.
 *    Its words at 12px or more as drawn, 10px where it is scaled; one that
 *    would scale its words under 10px to fit stops at 10px and scrolls
 *    sideways in its frame, the frame inside the embed, under the house
 *    edge fade (DESIGN.md `kit-edge-fade`) at its full 40px on every
 *    width: read at the scroll's start, middle and end, a fade on each side
 *    where more is hidden and none at either end.
 * 7. A card's three media stand in one column, each at the card's full
 *    width.
 * 8. The page is as CawCo shows it: no offline notice, Send picks enabled,
 *    every option enabled with its keycap; every option DESIGN.md's option
 *    chip (30px and up, 8px radius, raised, its label on its keycap's line
 *    by The Mark Line Rule); at 390 the note and Send picks 44px tall
 *    (DESIGN.md, The 44 Touch Rule).
 * 9. The page's own capture, stacked from the window at each scroll
 *    (decision-embeds.ts `capturePage`), paints every embed: no embed's box
 *    in it is one flat colour. Its files are what a delegate can hand
 *    over: each RGB and at most the hub's 1 MiB (FOLDER_FILE_LIMIT), cut at
 *    gaps between cards (or between a card's blocks) where one file can't
 *    hold the page, none starting inside a block of words or a picture; read
 *    back and stacked they are the picture, pixel for pixel.
 * 9b. A frame is drawn as its own width says (canvas width.ts): the page
 *    head named for a phone (390px) stacks under its 640px switch and the
 *    one named for a desk (1440px) stands in a row, whatever the window of
 *    the embed holding it (the phone's at the card's full width, past 640px
 *    on a desk; the desk's in an option, narrower); its script reads the
 *    same from matchMedia, as it mounts and after.
 * 9c. A frame is its story's viewport to a floating layer too (canvas
 *    viewport.ts): a phone's bar with its end-aligned menu open, at a
 *    card's full width (an 854px window on a desk), has the menu inside
 *    the 390px frame, shifted in from its start as a phone's window would.
 * 10. No console error.
 *
 *   bun scripts/probe-kit/run.ts web decision-embed
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import { FOLDER_FILE_LIMIT } from "../../../../packages/hub/src/project-folder";
import {
  blankEmbeds,
  CAWCO_BRIDGE,
  captureFaults,
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
const HEAD = "src/Head.stories.js";
const MENU = "src/Menu.stories.js";
const SHEET = "src/Sheet.stories.js";
const BOOK_ID = idOf("ledger-and-note");
const NOTE_ID = idOf("note-alone");
const SIDE_ID = idOf("side-card");
const HEAD_ID = idOf("page-head");
const MENU_ID = idOf("bar-menu");
const MONTH_ID = idOf("ledger-month");
const SHEET_ID = idOf("sheet");
/** The side card's own widths (its stories' viewports). */
const SIDE_W = 360;
const WIDE_W = 1400;

const MONTHS = ["January", "February", "March", "April", "May", "June"];
/** The house edge fade's length (DESIGN.md, edge-fade.css): an embed's fade is it on every width. */
const HOUSE_FADE = 40;

/**
 * Each open menu this embed draws: its frame's left and right and the
 * menu's, page px, and the window's width. In the embed's page.
 */
function readMenus() {
  return [...document.querySelectorAll<HTMLElement>(".cawco-frame")].flatMap(
    (frame) => {
      const body = frame.querySelector(".cawco-frame-body");
      const menu = frame.querySelector(".menu");
      if (!(body && menu)) {
        return [];
      }
      const box = body.getBoundingClientRect();
      const at = menu.getBoundingClientRect();
      const round = (n: number) => Math.round(n * 10) / 10;
      return [
        {
          story: frame.dataset.cawcoStory ?? "",
          frame: [round(box.left), round(box.right)],
          menu: [round(at.left), round(at.right)],
          window: document.documentElement.getBoundingClientRect().width,
        },
      ];
    }
  );
}

/**
 * Each page head this embed draws, as its frame's width says: its layout
 * (the `@media (max-width: 639px)` rule's flex direction), what its script
 * read from matchMedia as it mounted, and what matchMedia says in the
 * embed's page now. In the embed's page.
 */
function readHeads() {
  return [...document.querySelectorAll<HTMLElement>(".cawco-frame")].flatMap(
    (frame) => {
      const head = frame.querySelector<HTMLElement>(".head");
      return head
        ? [
            {
              story: frame.dataset.cawcoStory ?? "",
              direction: getComputedStyle(head).flexDirection,
              mounted: head.dataset.narrow ?? "",
              asked: matchMedia("(max-width: 639px)").matches,
            },
          ]
        : [];
    }
  );
}

/**
 * What this embed paints beside a frame narrower than it: the first opaque
 * background out from the element in the gutter at the frame's middle,
 * resolved to sRGB, and what it is; null where no frame leaves a gutter. In
 * the embed's page.
 */
function readGround() {
  const rgba = (colour: string) => {
    const ink = document.createElement("canvas").getContext("2d");
    if (!ink) {
      return [];
    }
    ink.fillStyle = colour;
    ink.fillRect(0, 0, 1, 1);
    return [...ink.getImageData(0, 0, 1, 1).data];
  };
  const frame = [...document.querySelectorAll(".cawco-frame")]
    .map((one) => one.getBoundingClientRect())
    .find((r) => r.width > 0 && r.left >= 4);
  if (!frame) {
    return null;
  }
  const y = Math.min(frame.top + frame.height / 2, innerHeight / 2);
  for (
    let at = document.elementFromPoint(frame.left / 2, y);
    at;
    at = at.parentElement
  ) {
    const paint = rgba(getComputedStyle(at).backgroundColor);
    if (paint[3] === 255) {
      return {
        by: `${at.tagName.toLowerCase()}${[...at.classList].map((c) => `.${c}`).join("")}`,
        rgb: paint.slice(0, 3).join(","),
      };
    }
  }
  return { by: "nothing", rgb: "" };
}

/**
 * Each frame in this embed that scrolls its story sideways, under the house
 * edge fade at the start of its scroll, its middle and its end: the fades'
 * lengths as drawn (`--fade-start`, `--fade-end`), its mask, and the
 * fade's own length. In the embed's page.
 */
async function readFades() {
  const next = () =>
    new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
  const fades: {
    at: {
      end: number;
      left: number;
      mask: string;
      place: string;
      start: number;
    }[];
    len: number;
    story: string;
  }[] = [];
  for (const frame of document.querySelectorAll<HTMLElement>(
    ".cawco-frame[data-cawco-wide]"
  )) {
    const max = frame.scrollWidth - frame.clientWidth;
    const at: (typeof fades)[number]["at"] = [];
    for (const [place, left] of [
      ["start", 0],
      ["middle", Math.round(max / 2)],
      ["end", max],
    ] as const) {
      frame.scrollLeft = left;
      await next();
      const style = getComputedStyle(frame);
      at.push({
        end: Number.parseFloat(style.getPropertyValue("--fade-end")),
        left: frame.scrollLeft,
        mask: style.maskImage,
        place,
        start: Number.parseFloat(style.getPropertyValue("--fade-start")),
      });
    }
    frame.scrollLeft = 0;
    await next();
    fades.push({
      at,
      len: Number.parseFloat(
        getComputedStyle(frame).getPropertyValue("--fade-len")
      ),
      story: frame.dataset.cawcoStory ?? "",
    });
  }
  return fades;
}

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
  "The side card": { files: [SIDE], stories: [], shows: ["Card", "Wide"] },
  "The head on a phone": {
    files: [HEAD],
    stories: ["Phone"],
    shows: ["Phone"],
  },
  "The head on a desk": { files: [HEAD], stories: ["Desk"], shows: ["Desk"] },
  "The bar's menu on a phone": {
    files: [MENU],
    stories: ["Phone"],
    shows: ["Phone"],
  },
  "The note": { files: [NOTE], stories: ["Pinned"], shows: ["Pinned"] },
  "January's lines": {
    files: [LEDGER],
    stories: ["January"],
    shows: ["January"],
  },
  // Named against the file's order: drawn in the order named.
  "March, then January": {
    files: [LEDGER],
    stories: ["March", "January"],
    shows: ["March", "January"],
  },
  "The sheet": { files: [SHEET], stories: [], shows: ["Drawer"] },
};
/** The second card's three media, by caption. */
const TRIO = ["The side card", "The note", "January's lines"];

const PROGRAM = [
  `root = Decisions("The spend ledger", [ledger, side, head, bar])`,
  `ledger = Decision("ledger", "Where does the pinned note stand?", [under, alone], "The ledger is long; the note is what a person acts on.", [book])`,
  `under = Option("under", "Under the ledger", "The note after every line.", false, [order], "A person scrolls past sixty lines to reach it.")`,
  `alone = Option("alone", "On its own", "The note in a card of its own.", true, [note], "The ledger loses its summary line.")`,
  `book = Preview("${BOOK_ID}", "The ledger and its note")`,
  `note = Preview("${NOTE_ID}", "The note alone", ["Pinned"])`,
  `side = Decision("side", "Which goes beside the ledger?", [card, pin], "Three ways, each at the card's full width.", [card1, pin1, month1])`,
  `card = Option("card", "The side card", "The week's spend in its own card.", true, [], "It takes 360px beside the ledger.")`,
  `pin = Option("pin", "The note", "Only the pinned note.", false, [sheet], "The week's spend is a click away.")`,
  `card1 = Preview("${SIDE_ID}", "The side card")`,
  `pin1 = Preview("${NOTE_ID}", "The note", ["Pinned"])`,
  `month1 = Preview("${MONTH_ID}", "January's lines", ["January"])`,
  `order = Preview("${MONTH_ID}", "March, then January", ["March", "January"])`,
  `sheet = Preview("${SHEET_ID}", "The sheet")`,
  `head = Decision("head", "Which head does the page open with?", [stack, row], "The phone's head in an embed wider than 640px, the desk's in one narrower.", [headPhone])`,
  `stack = Option("stack", "Stacked on a phone", "Title over its tools under 640px.", true, [], "Two lines on a phone.")`,
  `row = Option("row", "One row everywhere", "Title and tools side by side.", false, [headDesk], "Tools cut short on a phone.")`,
  `headPhone = Preview("${HEAD_ID}", "The head on a phone", ["Phone"])`,
  `headDesk = Preview("${HEAD_ID}", "The head on a desk", ["Desk"])`,
  `bar = Decision("bar", "Where does the bar's menu open?", [below, aside], "A phone's bar, its menu open, at the card's full width.", [menuPhone])`,
  `below = Option("below", "Under the ⋯", "End-aligned under it.", true, [], "It covers the first line.")`,
  `aside = Option("aside", "Beside the bar", "Off to its end.", false, [], "It runs off a phone's edge.")`,
  `menuPhone = Preview("${MENU_ID}", "The bar's menu on a phone", ["Phone"])`,
].join("\n");

/** The fixture copied to scratch and installed once: the project the stage draws. */
function fixtureRoot(): string {
  mkdirSync(SCRATCH, { recursive: true });
  cpSync(FIXTURE, SCRATCH, { recursive: true });
  // Every run: a dependency the fixture gains reaches a copy installed before it.
  const install = Bun.spawnSync(["bun", "install"], { cwd: SCRATCH });
  if (install.exitCode !== 0) {
    throw new Error(
      `bun install in ${SCRATCH} failed: ${install.stderr.toString().slice(0, 400)}`
    );
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
    options: options.map((one) => {
      const style = getComputedStyle(one);
      const cap = one.querySelector(".dp-kc")?.getBoundingClientRect();
      const words = one.querySelector<HTMLElement>("b > :not(.dp-kc)");
      const at = words?.getBoundingClientRect();
      const card = one.closest(".dp-card");
      return {
        option: one.dataset.option ?? "",
        disabled: one.disabled,
        keycap: tall(one.querySelector(".dp-kc")),
        h: tall(one),
        radius: style.borderTopLeftRadius,
        // The raised surface the card stands on (DESIGN.md: the option chip is raised).
        raised:
          !!card &&
          style.backgroundColor === getComputedStyle(card).backgroundColor,
        trim: words ? getComputedStyle(words).textBoxTrim : "none",
        // The label's x-height middle (its trimmed box's) against the keycap's middle.
        off:
          cap && at
            ? Math.round(
                Math.abs(cap.top + cap.height / 2 - (at.top + at.height / 2)) *
                  100
              ) / 100
            : 99,
      };
    }),
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
        [HEAD_ID]: [HEAD],
        [MENU_ID]: [MENU],
        [MONTH_ID]: [LEDGER],
        [SHEET_ID]: [SHEET],
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
          const wides = frames.filter((f) => f.story === "Wide");
          const wideFaults = wides.flatMap((f) => {
            const own = Math.round(WIDE_W * f.zoom);
            return [
              ...(Math.abs(f.w - own) > 1
                ? [
                    `${f.w}px drawn at zoom ${f.zoom}, its own ${WIDE_W}px would draw ${own}px`,
                  ]
                : []),
              ...(f.type < 9.9 || f.type > 10.1
                ? [`its words at ${f.type}px, not stopped at 10px`]
                : []),
              ...(f.wide && f.scrollable && f.scrolls > 0
                ? []
                : [
                    `its frame doesn't scroll sideways (wide ${f.wide}, overflow-x scrolls ${f.scrollable}, ${f.scrolls}px past)`,
                  ]),
            ].map((fault) => `“${f.caption}” Wide: ${fault}`);
          });
          kit.check(
            `${leg}: the ${WIDE_W}px side card scales only as far as 10px words, then scrolls sideways in its frame (${wides.map((f) => `${f.w}px at zoom ${f.zoom}, its words at ${f.type}px, ${f.scrolls}px to scroll`).join(", ")})`,
            wides.length > 0 && wideFaults.length === 0,
            wideFaults.join("\n    ")
          );
          // The wide story's frame scrolls under the house edge fade: on the side where more is hidden, none at either end.
          // One embed at a time, scrolled to: a cross-origin frame off screen draws no frames.
          const fades: Awaited<ReturnType<typeof readFades>> = [];
          const heads: Awaited<ReturnType<typeof readHeads>> = [];
          const menus: Awaited<ReturnType<typeof readMenus>> = [];
          const grounds: {
            caption: string;
            embed: string;
            host: string;
            by: string;
          }[] = [];
          for (const handle of await page.$$(EMBED_FRAME)) {
            await handle.scrollIntoViewIfNeeded();
            heads.push(
              ...((await (await handle.contentFrame())?.evaluate(readHeads)) ??
                [])
            );
            menus.push(
              ...((await (await handle.contentFrame())?.evaluate(readMenus)) ??
                [])
            );
            // Beside a narrow story the embed shows the surface the page draws its Preview on, not a gutter of its own.
            const ground = await (
              await handle.contentFrame()
            )?.evaluate(readGround);
            if (ground) {
              const host = await handle.evaluate((frame) => {
                const ink = document.createElement("canvas").getContext("2d");
                if (!ink) {
                  return "";
                }
                ink.fillStyle = getComputedStyle(frame).backgroundColor;
                ink.fillRect(0, 0, 1, 1);
                return [...ink.getImageData(0, 0, 1, 1).data]
                  .slice(0, 3)
                  .join(",");
              });
              grounds.push({
                caption:
                  (await handle.evaluate(
                    (frame) =>
                      frame.closest("figure")?.querySelector("figcaption")
                        ?.textContent ?? ""
                  )) || "",
                embed: ground.rgb,
                host,
                by: ground.by,
              });
            }
            fades.push(
              ...((await (await handle.contentFrame())?.evaluate(readFades)) ??
                [])
            );
          }
          // A frame is drawn as its own width says: the phone head stacks, the desk head stands in a row, whatever the embed's window.
          const headFaults = heads.flatMap((one) => {
            const narrow = one.story === "Phone";
            const want = narrow ? "column" : "row";
            return one.direction === want &&
              one.mounted === String(narrow) &&
              one.asked === narrow
              ? []
              : [
                  `${one.story}: its CSS lays it as a ${one.direction}, want ${want}; matchMedia('(max-width: 639px)') said ${one.mounted} as it mounted and says ${one.asked} now, want ${narrow}`,
                ];
          });
          kit.check(
            `${leg}: a frame is drawn as its own width says, its CSS and its script alike (${heads.map((one) => `${one.story}: ${one.direction}, matchMedia ${one.mounted} mounting, ${one.asked} now`).join("; ")})`,
            heads.length === 2 && headFaults.length === 0,
            headFaults.join("\n    ")
          );
          // A frame is its story's viewport to a floating layer too: the open menu stands inside it, shifted in as the window would shift it.
          const strayMenus = menus.filter(
            (one) =>
              one.menu[0] < one.frame[0] - 0.5 ||
              one.menu[1] > one.frame[1] + 0.5
          );
          kit.check(
            `${leg}: a menu opened in a frame stands inside it (${menus.map((one) => `${one.story}: the menu ${one.menu.join("–")} in the frame ${one.frame.join("–")}, a ${one.window}px window`).join("; ")})`,
            menus.length === 1 && strayMenus.length === 0,
            JSON.stringify(strayMenus)
          );
          const unlike = grounds.filter((one) => one.embed !== one.host);
          kit.check(
            `${leg}: beside a narrow story each embed shows the surface its Preview stands on, no gutter of its own (${grounds.map((one) => `“${one.caption}” ${one.embed} by ${one.by}, the Preview ${one.host}`).join("; ")})`,
            grounds.length > 0 && unlike.length === 0,
            JSON.stringify(unlike)
          );
          const fadeFaults = fades.flatMap((f) => [
            ...(f.len === HOUSE_FADE
              ? []
              : [
                  `${f.story}: its fade ${f.len}px, the house's ${HOUSE_FADE}px`,
                ]),
            ...f.at.flatMap((one) => {
              const want = {
                start: one.place === "start" ? 0 : HOUSE_FADE,
                end: one.place === "end" ? 0 : HOUSE_FADE,
              };
              return Math.abs(one.start - want.start) > 0.5 ||
                Math.abs(one.end - want.end) > 0.5 ||
                one.mask === "none"
                ? [
                    `${f.story} at its ${one.place} (scrolled ${one.left}px): fades ${one.start}px and ${one.end}px, want ${want.start}px and ${want.end}px, mask ${one.mask.slice(0, 60)}`,
                  ]
                : [];
            }),
          ]);
          kit.check(
            `${leg}: a frame that scrolls sideways draws the house edge fade, ${HOUSE_FADE}px on every width, where more is hidden, none at either end (${fades.map((f) => `${f.story}, ${f.len}px: ${f.at.map((one) => `${one.place} ${one.start}px|${one.end}px`).join(", ")}`).join("; ")})`,
            fades.length === frames.filter((f) => f.wide).length &&
              fades.length > 0 &&
              fadeFaults.length === 0,
            fadeFaults.join("\n    ")
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
          const offRecipe = said.options.filter(
            (one) =>
              one.h < 30 ||
              one.radius !== "8px" ||
              !one.raised ||
              one.trim !== "trim-both" ||
              one.off > 0.5
          );
          kit.check(
            `${leg}: every option is DESIGN.md's option chip: 30px and up, 8px radius, raised, its label's x-height middle on its keycap's (${said.options.map((one) => `${one.option} ${one.h}px ${one.radius}, ${one.off}px off`).join(", ")})`,
            said.options.length > 0 && offRecipe.length === 0,
            JSON.stringify(offRecipe)
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

          const capture = await capturePage(
            page,
            join(
              OUT,
              `${NAME}-${view === "desk" ? "1440" : "390"}-${theme}.png`
            )
          );
          const { paints } = capture;
          const captured = captureFaults(capture);
          kit.check(
            `${leg}: the page's capture is files a delegate can hand over, each RGB and at most ${FOLDER_FILE_LIMIT / 1024 / 1024} MiB, its whole picture pixel for pixel (${capture.files.map((one) => `${basename(one.path)} ${(one.bytes / 1024).toFixed(0)} KiB, rows ${one.rows.from}–${one.rows.to}`).join(", ")}; ${capture.picture.width}×${capture.picture.height})`,
            capture.files.length > 0 && captured.length === 0,
            captured.join("\n    ")
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
