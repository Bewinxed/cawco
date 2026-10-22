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
 *    2px. Each frame stands inside its width, at its start within 1px (the
 *    card's words start there too); one narrower than the embed at its own
 *    width, one wider scaled down to fit (CSS zoom) and never reflowed: its
 *    drawn width its own times its zoom. On a desk its words at 12px or
 *    more as drawn, scaled or not; one that would scale its words under
 *    12px to fit stops at 12px and scrolls sideways in its frame, the frame
 *    inside the embed, under the house edge fade (DESIGN.md
 *    `kit-edge-fade`) at its full 40px on every width: read at the scroll's
 *    start, middle and end, a fade on each side where more is hidden and
 *    none at either end. Under a finger every story fits whole, no floor,
 *    and none scrolls sideways.
 * 7. A card's three media stand in one column, each at the card's full
 *    width.
 * 8. The page is as CawCo shows it: no offline notice, Send picks enabled,
 *    every option enabled with its keycap; every option DESIGN.md's option
 *    chip (30px and up, 8px radius, raised, its label on its keycap's line
 *    by The Mark Line Rule); at 390 the note and Send picks 44px tall
 *    (DESIGN.md, The 44 Touch Rule), and every control on the page reaching
 *    44px under a finger; at 1440 every control reaching 24px (The 24
 *    Pointer Rule); nothing spilling its box or past the window.
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
 *    viewport.ts), each layer its own frame's: a bar at 390, 320 and 480px
 *    in one embed at a card's full width (an 832px window on a desk), each
 *    with its end-aligned menu open, untouched and portalled to the page's
 *    body, has each menu inside its own frame, shifted in from its start
 *    as a window that wide would.
 * 10. No console error.
 * 11. An embed of a canvas of two states files (the ledger and the note)
 *    naming stories draws exactly those, from whichever file holds them,
 *    at 1440×900 and 390×844, light and dark, on a page of its own: one
 *    from each file (`["January", "Pinned"]`) draws both frames, in that
 *    order, with no alert; one from the note alone (`["Pinned"]`) draws it
 *    with no alert, the ledger's section 0px tall; one neither file holds
 *    (`["Nowhere"]`) draws no frame and says so once, naming it, the alert
 *    seen inside the embed's width and the embed as tall as it, every
 *    section 0px tall. No section head is seen in any of them.
 * 12. A pictured page sizes to its pictures (Preview's `width`), on a card
 *    of three options each a 640px story and a card of two each a 390px
 *    story, all five Previews of one canvas, and the same cards in words
 *    alone, at 1900, 1440, 1100, 820 and 640 under a mouse with a desk's
 *    scrollbars and 390 and 320 under a finger, light and dark: the column
 *    the largest of 742, 1417 or 2092px its room holds, never under 920
 *    and never past its room (a worded page 920); each card's options per
 *    row on their stories' pitch (190px on a worded page; one per row
 *    under the phone's line); before any scroll every picture at the height
 *    its canvas says, below the fold too, the first as the rest; each story
 *    at 1:1 from its embed's start where its room holds it, else zoomed to
 *    fit with no sideways scroll; on a phone each well reaching the screen's
 *    edges; every question, why, line and cost at most 72ch; no well, page
 *    scroller or document scrolling sideways; the foot 59px at a desk, 67px
 *    under a finger on one row (122px where Send wraps under the count);
 *    and the foot's box meeting no card's words at six scroll positions top
 *    to bottom.
 *
 *   bun scripts/probe-kit/run.ts web decision-embed
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import type { Page } from "playwright-core";
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
  pageReach,
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
/** The bar's stories, each its menu open and untouched: three frames of three widths in one embed. */
const MENUS = ["Phone", "Small", "Half"];
const MONTH_ID = idOf("ledger-month");
const SHEET_ID = idOf("sheet");
/** The side card's own widths (its stories' viewports). */
const SIDE_W = 360;
const WIDE_W = 1400;

const MONTHS = ["January", "February", "March", "April", "May", "June"];
/** The house edge fade's length (DESIGN.md, edge-fade.css): an embed's fade is it on every width. */
const HOUSE_FADE = 40;

/**
 * Each open menu this embed draws, found by the trigger in its frame that
 * names it (`aria-controls`; the menu stands in the page's body, as a
 * Portal puts it): its frame's left and right and the menu's, page px, and
 * the window's width. In the embed's page.
 */
function readMenus() {
  return [...document.querySelectorAll<HTMLElement>(".cawco-frame")].flatMap(
    (frame) => {
      const body = frame.querySelector(".cawco-frame-body");
      const named = body
        ?.querySelector(".more[aria-controls]")
        ?.getAttribute("aria-controls");
      const menu = named ? document.getElementById(named) : null;
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
 * background out from the element in the gutter past the frame's end, at its middle,
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
  // The world's box, never the window's: the canvas answers a story's own width for the window's (canvas width.ts).
  const room =
    document.querySelector(".cawco-world")?.getBoundingClientRect().right ?? 0;
  const frame = [...document.querySelectorAll(".cawco-frame")]
    .map((one) => one.getBoundingClientRect())
    .find((r) => r.width > 0 && r.right <= room - 4);
  if (!frame) {
    return null;
  }
  const y = Math.min(frame.top + frame.height / 2, innerHeight / 2);
  for (
    let at = document.elementFromPoint((frame.right + room) / 2, y);
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
  "The bar's menus, open": {
    files: [MENU],
    stories: MENUS,
    shows: MENUS,
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
/** The test page's nine-node top-down chain (the owner's "i have to scroll down to read it"). */
const CHAIN = Array.from({ length: 9 }, (_, i) => `S${i}[Step ${i + 1}]`).join(
  " --> "
);
/** The second card's three media, by caption. */
const TRIO = ["The side card", "The note", "January's lines"];

const PROGRAM = [
  `root = Decisions("The spend ledger", [ledger, side, head, bar, chain])`,
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
  `bar = Decision("bar", "Where does the bar's menu open?", [below, aside], "A bar at three widths, each with its menu open, at the card's full width.", [menuPhone])`,
  `below = Option("below", "Under the more button", "End-aligned under it.", true, [], "It covers the first line.")`,
  `aside = Option("aside", "Beside the bar", "Off to its end.", false, [], "It runs off a phone's edge.")`,
  `menuPhone = Preview("${MENU_ID}", "The bar's menus, open", ["Phone", "Small", "Half"])`,
  `chain = Decision("chain", "How does a release go out?", [steps, batch], "Each step is a person's own check.", [chainFlow, stageFlow])`,
  `steps = Option("steps", "Step by step", "Nine checks, one after another.", true, [], "Slower on a busy week.")`,
  `batch = Option("batch", "In one batch", "One check for the lot.", false, [], "A fault hides among the rest.")`,
  `chainFlow = Diagram("flowchart TD\\n${CHAIN}", "Nine steps down")`,
  `stageFlow = Diagram("flowchart LR\\nsubgraph Build\\nWrite[Write] -->|then| Check[Check]\\nend\\nCheck --> Ship[Ship]", "With a stage")`,
].join("\n");

/** The page of item 11: Previews of the two-file canvas naming stories, by caption, with the frames each draws and the story it says no file has. */
const NAMED_PAGE = "named";
const NAMED: Record<
  string,
  { missing: readonly string[]; shows: readonly string[] }
> = {
  "January and the note": { shows: ["January", "Pinned"], missing: [] },
  "The note from both files": { shows: ["Pinned"], missing: [] },
  "A story neither has": { shows: [], missing: ["Nowhere"] },
};
const NAMED_PROGRAM = [
  `root = Decisions("Named stories", [lines])`,
  `lines = Decision("lines", "Which lines stand by the note?", [both, one, none], "Stories of two states files in one embed.", [both1])`,
  `both = Option("both", "A month and the note", "January, then the pinned note.", true, [], "Two files' stories in one embed.")`,
  `one = Option("one", "The note alone", "Only the pinned note.", false, [one1], "The ledger draws nothing.")`,
  `none = Option("none", "A story neither has", "Named, never written.", false, [none1], "It draws nothing.")`,
  `both1 = Preview("${BOOK_ID}", "January and the note", ["January", "Pinned"])`,
  `one1 = Preview("${BOOK_ID}", "The note from both files", ["Pinned"])`,
  `none1 = Preview("${BOOK_ID}", "A story neither has", ["Nowhere"])`,
].join("\n");

/**
 * What an embed of several states files shows once each has loaded: its
 * rest frames by story, with their state; every alert's words; and each
 * section's file, how many frames it holds, its box's height and how many
 * of its heads are seen. In the embed's page.
 */
function readNamed() {
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  return {
    loaded: window.__cawcoCanvas?.loaded() ?? [],
    frames: [
      ...document.querySelectorAll<HTMLElement>(
        '.cawco-frame[data-cawco-interaction="rest"]'
      ),
    ].map((frame) => ({
      story: frame.dataset.cawcoStory ?? "",
      state:
        frame.querySelector<HTMLElement>(".cawco-frame-status")?.dataset
          .state ?? "",
    })),
    alerts: [...document.querySelectorAll("[role=alert]")].map(
      (one) => one.textContent?.trim() ?? ""
    ),
    /** Each alert's box against the embed's own width: where it stands, seen and inside it. */
    placed: [...document.querySelectorAll("[role=alert]")].map((one) => {
      const r = one.getBoundingClientRect();
      const round = (n: number) => Math.round(n * 10) / 10;
      return {
        left: round(r.left),
        right: round(r.right),
        h: round(r.height),
        width: round(document.documentElement.getBoundingClientRect().width),
        overflows: one.scrollWidth > one.clientWidth + 0.5,
      };
    }),
    sections: [...document.querySelectorAll<HTMLElement>(".cawco-section")].map(
      (section) => ({
        file: section.dataset.cawcoFile ?? "",
        frames: section.querySelectorAll(".cawco-frame").length,
        h: Math.round(section.getBoundingClientRect().height * 10) / 10,
        heads: [...section.querySelectorAll(".cawco-section-head")].filter(seen)
          .length,
      })
    ),
  };
}

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

/**
 * The page's frame, its first open card, its options' first row, a media
 * well and the sticky foot, from the engine, each beside the token it
 * should be (resolved on a probe element in the page itself).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a reader page.evaluate sends whole (it runs in the page and can import nothing)
function readLayout() {
  const probe = document.createElement("i");
  document.body.append(probe);
  const token = (property: string, value: string) => {
    probe.style.setProperty(property, value);
    const read = getComputedStyle(probe).getPropertyValue(property);
    probe.style.removeProperty(property);
    return read;
  };
  const tokens = {
    recess: token("background-color", "var(--surface-recess)"),
    raised: token("background-color", "var(--surface-raised)"),
    well: token("background-color", "var(--surface-well)"),
    wellEdge: token("border-top-color", "var(--border-well)"),
    tile: token("box-shadow", "var(--shadow-tile)"),
  };
  probe.remove();
  const at = (el: Element | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r
      ? {
          x: Math.round(r.left * 10) / 10,
          y: Math.round(r.top * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        }
      : null;
  };
  const main = document.querySelector<HTMLElement>("[data-slot=page-column]");
  const scroller = document.querySelector<HTMLElement>(
    "[data-slot=page-scroll]"
  );
  const card = document.querySelector<HTMLElement>(
    "[data-slot=decision]:not([data-decided])"
  );
  const cells = [...(card?.querySelectorAll("[data-slot=option-cell]") ?? [])];
  const first = cells[0]?.getBoundingClientRect().top ?? 0;
  const row = cells.filter(
    (cell) => Math.abs(cell.getBoundingClientRect().top - first) < 1
  );
  const tops = (selector: string) =>
    row.map(
      (cell) =>
        Math.round(
          (cell.querySelector(selector)?.getBoundingClientRect().top ?? -1) * 10
        ) / 10
    );
  const well = document.querySelector<HTMLElement>("[data-slot=media]");
  const stage = well?.querySelector("[data-slot=media-stage]");
  const piece = stage?.firstElementChild;
  const foot = document.querySelector<HTMLElement>("[data-slot=page-foot]");
  const footAt = at(foot);
  const send = document.querySelector<HTMLElement>("[data-send]");
  const sendAt = send?.getBoundingClientRect();
  const hit = sendAt
    ? document.elementFromPoint(
        sendAt.left + sendAt.width / 2,
        sendAt.top + sendAt.height / 2
      )
    : null;
  const ms = main ? getComputedStyle(main) : null;
  const cs = card ? getComputedStyle(card) : null;
  const ws = well ? getComputedStyle(well) : null;
  const centre = (box: ReturnType<typeof at>) =>
    box ? box.x + box.w / 2 : Number.NaN;
  return {
    tokens,
    window: { w: innerWidth, h: innerHeight },
    page: {
      box: at(main),
      // The room the column is centred in: the scroller's, its scrollbar's gutter kept.
      room: scroller?.clientWidth ?? 0,
      inset: ms ? [ms.paddingLeft, ms.paddingRight] : [],
      gap: ms?.rowGap ?? "",
      ground: getComputedStyle(document.body).backgroundColor,
    },
    card: {
      radius: cs?.borderTopLeftRadius ?? "",
      border: cs?.borderTopWidth ?? "",
      pad: cs ? [cs.paddingTop, cs.paddingLeft] : [],
      fill: cs?.backgroundColor ?? "",
      // Tailwind's shadow utility stands its ring and inset layers, empty,
      // before the token's own: the drawn layers are the token's.
      shadow: (cs?.boxShadow ?? "").replaceAll(
        "rgba(0, 0, 0, 0) 0px 0px 0px 0px, ",
        ""
      ),
    },
    row: {
      cells: row.length,
      chips: tops("[data-option]"),
      lines: tops('[id$="-line"]'),
      chipH: row.map(
        (cell) =>
          Math.round(
            (cell.querySelector("[data-option]")?.getBoundingClientRect()
              .height ?? 0) * 10
          ) / 10
      ),
    },
    well: {
      radius: ws?.borderTopLeftRadius ?? "",
      edge: ws?.borderTopColor ?? "",
      pad: ws?.paddingTop ?? "",
      fill: ws?.backgroundColor ?? "",
      off:
        Math.round(Math.abs(centre(at(stage)) - centre(at(piece))) * 10) / 10,
    },
    foot: {
      position: foot ? getComputedStyle(foot).position : "",
      bottom: footAt ? footAt.y + footAt.h : 0,
      top: footAt?.y ?? 0,
      width: footAt?.w ?? 0,
      page: scroller?.scrollHeight ?? 0,
      shown: scroller ? scroller.getBoundingClientRect().bottom : 0,
      send: !!(hit && send?.contains(hit)),
    },
  };
}

/**
 * The release card's two diagrams from the engine: each one's box in its
 * well's stage, its smallest words as drawn, whether its well scrolls, and
 * each element kind's paint beside the token it should be (DESIGN.md: a node
 * raised with a control's edge and the 8px of an item in a surface, its name
 * in the label role in strong ink; an edge 1px in muted ink, its words in
 * meta; a subgraph the recess with a hairline, its title in the label role,
 * muted).
 */
function readDiagrams() {
  const probe = document.createElement("i");
  document.body.append(probe);
  const token = (property: string, value: string) => {
    probe.style.setProperty(property, value);
    const read = getComputedStyle(probe).getPropertyValue(property);
    probe.style.removeProperty(property);
    return read;
  };
  const want = {
    raised: token("fill", "var(--surface-raised)"),
    recess: token("fill", "var(--surface-recess)"),
    control: token("stroke", "var(--border-control)"),
    hairline: token("stroke", "var(--border-hairline)"),
    strong: token("fill", "var(--ink-strong)"),
    muted: token("fill", "var(--ink-muted)"),
    mutedLine: token("stroke", "var(--ink-muted)"),
    face: token("font-family", "var(--font-sans)"),
  };
  probe.remove();
  const card = document.getElementById("decision-chain");
  const wells = [...(card?.querySelectorAll("[data-slot=media]") ?? [])];
  const one = (well: Element) => {
    const stage = well.querySelector<HTMLElement>("[data-slot=media-stage]");
    const svg = well.querySelector<SVGSVGElement>("[data-slot=diagram] svg");
    const s = stage?.getBoundingClientRect();
    const d = svg?.getBoundingClientRect();
    const scale =
      svg && d ? d.width / (svg.viewBox.baseVal.width || d.width) : 0;
    const sizes = [...(svg?.querySelectorAll("text") ?? [])].map(
      (word) => Number.parseFloat(getComputedStyle(word).fontSize) * scale
    );
    const paint = (selector: string) => {
      const el = svg?.querySelector(selector);
      if (!el) {
        return null;
      }
      const style = getComputedStyle(el);
      return {
        fill: style.fill,
        stroke: style.stroke,
        width: style.strokeWidth,
        rx: style.getPropertyValue("rx"),
        size: style.fontSize,
        weight: style.fontWeight,
        face: style.fontFamily,
      };
    };
    return {
      caption:
        well.querySelector("[data-slot=media-caption]")?.textContent?.trim() ??
        "",
      smallest: Math.round(Math.min(...sizes) * 100) / 100,
      off:
        s && d
          ? [
              Math.round(
                Math.abs(s.left + s.width / 2 - (d.left + d.width / 2)) * 10
              ) / 10,
              Math.round(
                Math.abs(s.top + s.height / 2 - (d.top + d.height / 2)) * 10
              ) / 10,
            ]
          : [99, 99],
      // Too wide for its well at its words' floor: it scrolls sideways under
      // the house edge fade.
      faded:
        !!stage?.classList.contains("kit-edge-fade") &&
        getComputedStyle(stage).overflowX === "auto",
      scrolls: [
        (stage?.scrollWidth ?? 0) - (stage?.clientWidth ?? 0),
        (well as HTMLElement).scrollHeight - (well as HTMLElement).clientHeight,
      ],
      node: paint(".pele-node :is(rect, path, polygon)"),
      label: paint(".pele-node .pele-label, .pele-node text"),
      edge: paint(".pele-edge path"),
      edgeWords: paint(".pele-edge-label text, text.pele-edge-label"),
      cluster: paint(".pele-cluster > :is(rect, path)"),
      clusterTitle: paint(".pele-cluster-label text, text.pele-cluster-label"),
    };
  };
  return { want, wells: wells.map(one) };
}

/** The page's own controls and its media's columns, from the engine. */
function readPage() {
  const tall = (el: Element | null) =>
    el ? Math.round(el.getBoundingClientRect().height) : 0;
  const send = document.querySelector<HTMLButtonElement>("[data-send]");
  const options = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-option]"),
  ];
  const trio = [...document.querySelectorAll("[data-slot=decision]")]
    .map((card) => card.querySelector("[data-slot=decision-media]"))
    .filter((show): show is Element => !!show && show.children.length === 3)
    .map((show) => ({
      show: Math.round(show.getBoundingClientRect().width),
      items: [...show.children].map((one) => {
        const r = one.getBoundingClientRect();
        return {
          caption:
            one
              .querySelector("[data-slot=media-caption]")
              ?.textContent?.trim() ?? "",
          x: Math.round(r.left),
          w: Math.round(r.width),
        };
      }),
    }));
  return {
    offline:
      document
        .querySelector("[data-slot=decision-page] [data-slot=alert]")
        ?.textContent?.trim() ?? "",
    send: { h: tall(send), disabled: send?.disabled ?? true },
    // "Add a note", the note's control a finger meets first: its 44px area (touch-hit's ::after).
    noteAdd: (() => {
      const add = document.querySelector("[data-slot=note] button");
      return add
        ? Math.round(
            Number.parseFloat(getComputedStyle(add, "::after").height) ||
              add.getBoundingClientRect().height
          )
        : 0;
    })(),
    options: options.map((one) => {
      const style = getComputedStyle(one);
      const cap = one.querySelector("[data-slot=kbd]")?.getBoundingClientRect();
      const words = one.querySelector<HTMLElement>("[data-slot=option-label]");
      const at = words?.getBoundingClientRect();
      const card = one.closest("[data-slot=decision]");
      return {
        option: one.dataset.option ?? "",
        disabled: one.disabled,
        keycap: tall(one.querySelector("[data-slot=kbd]")),
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

// --- 12. Pictured pages sized to their pictures --------------------------------

const BOARD = "src/Board.stories.js";
const BOARD_ID = idOf("board-looks");
/** The board's desk stories' and phone stories' own widths (their viewports). */
const DESK_STORY = 640;
const PHONE_STORY = 390;
const PICTURED_PAGE = "pictured";
const WORDED_PAGE = "worded";
const LONG_QUESTION =
  "Which board does the fleet open on, now that every machine reports its sessions, its spend and what is waiting on you, in one place a person reads at a glance each morning?";
const LONG_LINE =
  "Every machine on one line, its sessions counted and its spend beside them, so the person reads the whole fleet in one look and opens only the one that waits on them, never every terminal in turn.";
const LONG_COST =
  "The figures a person checks once a week stand a click away, behind the machine's own line, and a newcomer has to learn where each one went before they trust the board with a morning.";
/** The pictured page: a card of three options each a 640px story, and a card of two options each a 390px story; five Previews of one canvas. */
const PICTURED_PROGRAM = [
  `root = Decisions("Pick the board's look", [look, phone])`,
  `look = Decision("look", "${LONG_QUESTION}", [calm, dense, split], "Calm keeps the morning short.")`,
  `calm = Option("calm", "Calm", "${LONG_LINE}", true, [calmP], "${LONG_COST}")`,
  `dense = Option("dense", "Dense", "Every figure at once.", false, [denseP], "A wall of numbers.")`,
  `split = Option("split", "Split", "Needs on the left, the rest on the right.", false, [splitP], "Two places to look.")`,
  `calmP = Preview("${BOARD_ID}", "Calm", ["Calm"], ${DESK_STORY})`,
  `denseP = Preview("${BOARD_ID}", "Dense", ["Dense"], ${DESK_STORY})`,
  `splitP = Preview("${BOARD_ID}", "Split", ["Split"], ${DESK_STORY})`,
  `phone = Decision("phone", "Which board does a phone open on?", [pcalm, pdense], "Calm fits a phone's first screen.")`,
  `pcalm = Option("pcalm", "Calm on a phone", "Three lines.", true, [pcalmP], "The machines a scroll away.")`,
  `pdense = Option("pdense", "Dense on a phone", "Four lines.", false, [pdenseP], "Taller than a screen.")`,
  `pcalmP = Preview("${BOARD_ID}", "Calm on a phone", ["PhoneCalm"], ${PHONE_STORY})`,
  `pdenseP = Preview("${BOARD_ID}", "Dense on a phone", ["PhoneDense"], ${PHONE_STORY})`,
].join("\n");
/** The same cards in words alone: a page with no pictures keeps its 920px column and its 190px options. */
const WORDED_PROGRAM = [
  `root = Decisions("Pick the board's look", [look, phone])`,
  `look = Decision("look", "${LONG_QUESTION}", [calm, dense, split], "Calm keeps the morning short.")`,
  `calm = Option("calm", "Calm", "${LONG_LINE}", true, [], "${LONG_COST}")`,
  `dense = Option("dense", "Dense", "Every figure at once.", false, [], "A wall of numbers.")`,
  `split = Option("split", "Split", "Needs on the left, the rest on the right.", false, [], "Two places to look.")`,
  `phone = Decision("phone", "Which board does a phone open on?", [pcalm, pdense], "Calm fits a phone's first screen.")`,
  `pcalm = Option("pcalm", "Calm on a phone", "Three lines.", true, [], "The machines a scroll away.")`,
  `pdense = Option("pdense", "Dense on a phone", "Four lines.", false, [], "Taller than a screen.")`,
].join("\n");
/** Each story's own width, by name. */
const BOARD_WIDTHS: Record<string, number> = {
  Calm: DESK_STORY,
  Dense: DESK_STORY,
  Split: DESK_STORY,
  PhoneCalm: PHONE_STORY,
  PhoneDense: PHONE_STORY,
};
/**
 * The panel widths the owner's panels stand at, desk ones under a mouse
 * with a desk's scrollbars, the phones under a finger; 640 the narrowest a
 * desk's story zooms in with no sideways scroll, 320 the narrowest phone,
 * where the foot's count and Send stand on two rows.
 */
const WIDTHS = [
  { w: 1900, view: "desk" },
  { w: 1440, view: "desk" },
  { w: 1100, view: "desk" },
  { w: 820, view: "desk" },
  { w: 640, view: "desk" },
  { w: 390, view: "phone" },
  { w: 320, view: "phone" },
] as const;

/**
 * The page's column, its room and every card's options, from the engine:
 * the column's width and the scroller's client width; per card, how many
 * option cells stand on its first row, its body's width and each option
 * embed's box and shape; every text run's width beside its own `ch`; every
 * well's stage, the page's scroller and the document scrolling sideways or
 * not; the foot's height and its count bar's width. In the page.
 */
function readWidths() {
  const box = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    return r
      ? {
          x: Math.round(r.x * 10) / 10,
          y: Math.round(r.y * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        }
      : { x: 0, y: 0, w: 0, h: 0 };
  };
  const scroller = document.querySelector<HTMLElement>(
    "[data-slot=page-scroll]"
  );
  const column = document.querySelector("[data-slot=page-column]");
  const foot = document.querySelector("[data-slot=page-foot]");
  const chOf = (el: Element) => {
    const probe = document.createElement("span");
    probe.textContent = "0".repeat(20);
    probe.style.font = getComputedStyle(el).font;
    probe.style.position = "absolute";
    probe.style.whiteSpace = "pre";
    document.body.append(probe);
    const ch = probe.getBoundingClientRect().width / 20;
    probe.remove();
    return ch;
  };
  const texts = [
    ...document.querySelectorAll(
      "[data-slot=decision] h2, [data-slot=why], label[id$='-line'], label[id$='-cost']"
    ),
  ].map((el) => ({
    text: (el.textContent ?? "").trim().slice(0, 32),
    w: box(el).w,
    ch: Math.round(chOf(el) * 100) / 100,
  }));
  const cards = [...document.querySelectorAll("[data-slot=decision]")].map(
    (card) => {
      const cells = [...card.querySelectorAll("[data-slot=option-cell]")];
      const tops = cells.map((cell) => Math.round(box(cell).y));
      const first = Math.min(...tops);
      const words = [
        ...card.querySelectorAll(
          "h2, [data-slot=why], label, [data-slot=option-label]"
        ),
      ].map((el) => box(el).x);
      return {
        id: card.getAttribute("data-cawco-choice") ?? "",
        cells: cells.length,
        perRow: tops.filter((top) => top === first).length,
        body: box(card.querySelector("[data-slot=decision-body]")).w,
        cellW: cells.map((cell) => box(cell).w),
        wordsLeft: Math.min(...words),
        cardLeft: box(card).x,
        embeds: [
          ...card.querySelectorAll<HTMLIFrameElement>(
            "[data-slot=media] iframe[data-slot=embed]"
          ),
        ].map((frame) => ({
          caption:
            frame
              .closest("figure")
              ?.querySelector("[data-slot=media-caption]")
              ?.textContent?.trim() ?? "",
          shape: frame.dataset.shape ?? "",
          ...box(frame),
        })),
      };
    }
  );
  const wells = [
    ...document.querySelectorAll<HTMLElement>("[data-slot=media-stage]"),
  ].map((stage) => stage.scrollWidth - stage.clientWidth);
  const bar = document.querySelector("[data-slot=meter-bar]");
  return {
    column: box(column).w,
    room: scroller?.clientWidth ?? 0,
    pictured: document
      .querySelector("[data-slot=decision-page]")
      ?.hasAttribute("data-pictured"),
    scrollerOver: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
    docOver:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    wells,
    texts,
    cards,
    foot: box(foot).h,
    // Two rows when Send stands under the count, not beside it.
    footRows:
      box(foot?.querySelector("[data-send]") ?? null).y >=
      box(foot?.querySelector("[data-slot=meter]") ?? null).y +
        box(foot?.querySelector("[data-slot=meter]") ?? null).h -
        0.5
        ? 2
        : 1,
    bar: box(bar).w,
    viewport: innerWidth,
  };
}

/** An embed's frames, from the engine: each story's zoom, its start in the embed, its width as drawn and any sideways scroll; the world's height. In the embed's page. */
function readBoardFrames() {
  return {
    frames: [
      ...document.querySelectorAll<HTMLElement>(
        '.cawco-frame[data-cawco-interaction="rest"]'
      ),
    ].map((frame) => {
      const body = frame.querySelector<HTMLElement>(".cawco-frame-body");
      const zoom = Number.parseFloat(body ? getComputedStyle(body).zoom : "1");
      return {
        story: frame.dataset.cawcoStory ?? "",
        zoom: Math.round((Number.isFinite(zoom) ? zoom : 1) * 1000) / 1000,
        left: Math.round(frame.getBoundingClientRect().left * 10) / 10,
        drawn: Math.round((body?.getBoundingClientRect().width ?? 0) * 10) / 10,
        over: frame.scrollWidth - frame.clientWidth,
        wide: frame.hasAttribute("data-cawco-wide"),
      };
    }),
    // The world's box, never the document's: the canvas answers a story's own width for the window's (canvas width.ts).
    docOver:
      (document.querySelector<HTMLElement>(".cawco-world")?.scrollWidth ?? 0) -
      (document.querySelector<HTMLElement>(".cawco-world")?.clientWidth ?? 0),
    world: Math.ceil(
      document.querySelector<HTMLElement>(".cawco-world")?.offsetHeight ?? 0
    ),
    room: document.querySelector<HTMLElement>(".cawco-world")?.clientWidth ?? 0,
  };
}

/**
 * The foot against every card's words at six scroll positions, top to
 * bottom: each text box's part the scroller shows, met with the foot's box.
 * What meets, by its words, with the position. In the page.
 */
async function footOverWords() {
  const scroller = document.querySelector<HTMLElement>(
    "[data-slot=page-scroll]"
  );
  const foot = document.querySelector("[data-slot=page-foot]");
  if (!(scroller && foot)) {
    return ["no scroller or no foot"];
  }
  const met: string[] = [];
  const most = scroller.scrollHeight - scroller.clientHeight;
  for (let at = 0; at < 6; at += 1) {
    scroller.scrollTop = (most * at) / 5;
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
    const seen = scroller.getBoundingClientRect();
    const f = foot.getBoundingClientRect();
    for (const el of document.querySelectorAll(
      "[data-slot=decision] :is(h2, p, label, [data-slot=option-label], figcaption, button)"
    )) {
      const r = el.getBoundingClientRect();
      const top = Math.max(r.top, seen.top);
      const bottom = Math.min(r.bottom, seen.bottom);
      if (bottom - top <= 0.5 || r.width === 0) {
        continue;
      }
      const left = Math.max(r.left, f.left);
      const right = Math.min(r.right, f.right);
      const over = Math.min(bottom, f.bottom) - Math.max(top, f.top);
      if (right - left > 0.5 && over > 0.5) {
        met.push(
          `${at}/5: “${(el.textContent ?? "").trim().slice(0, 24)}” ${Math.round(over)}px under the foot`
        );
      }
    }
  }
  scroller.scrollTop = 0;
  return met;
}

/**
 * What is wrong with the 1400px side card as an embed draws it: never
 * reflowed (its drawn width its own times its zoom); on a desk scaled only
 * as far as 12px words, then scrolling sideways in its frame; under a
 * finger fitted whole, no floor, no sideways scroll.
 */
function wideFaultsOf(
  f: {
    caption: string;
    past: number;
    scrollable: boolean;
    scrolls: number;
    type: number;
    w: number;
    wide: boolean;
    zoom: number;
  },
  view: "desk" | "phone"
): string[] {
  const faults: string[] = [];
  const own = Math.round(WIDE_W * f.zoom);
  if (Math.abs(f.w - own) > 1) {
    faults.push(
      `${f.w}px drawn at zoom ${f.zoom}, its own ${WIDE_W}px would draw ${own}px`
    );
  }
  if (view === "desk") {
    if (Math.round(f.type) !== 12) {
      faults.push(`its words at ${f.type}px, not stopped at 12px`);
    }
    if (!(f.wide && f.scrollable && f.scrolls > 0)) {
      faults.push(
        `its frame doesn't scroll sideways (wide ${f.wide}, overflow-x scrolls ${f.scrollable}, ${f.scrolls}px past)`
      );
    }
  } else if (f.wide || f.scrolls > 0 || f.past > 1) {
    faults.push(
      `it scrolls sideways (wide ${f.wide}, ${f.scrolls}px past), not fitted whole`
    );
  }
  return faults.map((fault) => `“${f.caption}” Wide: ${fault}`);
}

/** One leg of 12: a page at a width, under a mouse or a finger, in a scheme. */
interface WidthLeg {
  leg: string;
  pictured: boolean;
  view: "desk" | "phone";
}

/** The chrome round a story at 1:1, px: the page's and the card's insets each side, a well's edge and inset each side, the gap between options. */
const CHROME = {
  gap: 11,
  well: 12,
  insets: { desk: 2 * (21 + 18), phone: 2 * (14 + 14) },
} as const;

/**
 * Before the page is scrolled, every picture stands at the height its
 * canvas says, the ones below the fold too: one rule for every Preview of
 * a canvas, the first as the rest. Then each reached as a person scrolls
 * to it, its frames drawn.
 */
async function picturesUnscrolled(kit: Kit, page: Page, { leg }: WidthLeg) {
  await page.waitForFunction(
    (selector) => document.querySelectorAll(selector).length === 5,
    EMBED_FRAME,
    { timeout: 60_000 }
  );
  const allDrawn = (timeout: number) =>
    page
      .waitForFunction(
        (selector) =>
          [...document.querySelectorAll<HTMLIFrameElement>(selector)].every(
            (one) => one.dataset.shape === "drawn"
          ),
        EMBED_FRAME,
        { timeout, polling: 250 }
      )
      .then(
        () => true,
        () => false
      );
  const unscrolled = await allDrawn(60_000);
  const shapes = await page.$$eval(EMBED_FRAME, (frames) =>
    frames.map(
      (one) =>
        `${one.dataset.shape} ${Math.round(one.getBoundingClientRect().height)}px at ${Math.round(one.getBoundingClientRect().top)}px`
    )
  );
  kit.check(
    `${leg}: before any scroll, all 5 pictures stand at the height their canvas says, below the fold too (${shapes.join(", ")})`,
    unscrolled
  );
  for (const handle of await page.$$(EMBED_FRAME)) {
    await handle.scrollIntoViewIfNeeded();
    const frame = await handle.contentFrame();
    await frame
      ?.waitForFunction(
        () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status'
            ),
          ].some((one) => one.dataset.state === "drawn"),
        undefined,
        { timeout: 120_000, polling: 250 }
      )
      .catch(() => undefined);
  }
  await allDrawn(30_000);
}

/** The column, each card's options per row, the words' measure, nothing scrolling sideways. */
function checkLayout(
  kit: Kit,
  read: Awaited<ReturnType<typeof readWidths>>,
  { leg, pictured, view }: WidthLeg
) {
  const { gap, well } = CHROME;
  const insets = CHROME.insets[view];
  // The column: on a pictured page the largest step of 640px stories abreast its room holds, never under 920; else 920; never past its room.
  const pitch = DESK_STORY + 2 * well;
  const abreast = Math.floor((read.room - insets + gap) / (pitch + gap));
  const step = abreast > 0 ? abreast * (pitch + gap) - gap + insets : 0;
  const want = Math.min(read.room, pictured ? Math.max(920, step) : 920);
  kit.check(
    `${leg}: the column is ${want}px (its room ${read.room}px; got ${read.column}px)`,
    Math.abs(read.column - want) <= 0.5,
    JSON.stringify({ column: read.column, room: read.room })
  );
  // Options per row: on their stories' pitch on a pictured page (one per row under the phone's line), at 190px each on a worded one.
  for (const card of read.cards) {
    const story = card.id === "phone" ? PHONE_STORY : DESK_STORY;
    const least = pictured ? story + 2 * well : 190;
    const fits =
      pictured && view === "phone"
        ? 1
        : Math.max(1, Math.floor((card.body + gap) / (least + gap)));
    const per = Math.min(card.cells, fits);
    kit.check(
      `${leg}: card ${card.id} stands ${per} option${per === 1 ? "" : "s"} to its first row (its body ${card.body}px; got ${card.perRow})`,
      card.perRow === per,
      JSON.stringify(card)
    );
  }
  // Words keep their measure: every question, why, line and cost at most 72ch.
  const long = read.texts.filter((one) => one.w > 72 * one.ch + 0.5);
  kit.check(
    `${leg}: every question, why, line and cost runs at most 72ch (${read.texts.length} runs, widest ${Math.max(...read.texts.map((one) => Math.round((one.w / one.ch) * 10) / 10))}ch)`,
    read.texts.length > 0 && long.length === 0,
    JSON.stringify(long)
  );
  kit.check(
    `${leg}: nothing scrolls sideways: no well's stage, not the page's scroller, not the document`,
    read.wells.every((over) => over <= 0) &&
      read.scrollerOver <= 0 &&
      read.docOver <= 0,
    JSON.stringify({
      wells: read.wells,
      scroller: read.scrollerOver,
      doc: read.docOver,
    })
  );
}

/** The foot's height on its rows, and its box against every card's words at six scroll positions. */
async function checkFoot(
  kit: Kit,
  page: Page,
  read: Awaited<ReturnType<typeof readWidths>>,
  { leg, view }: WidthLeg
) {
  // One row at a desk, 59px; under a finger 67px on one row (its count's bar giving way first: 320px holds it at 66px), 122px where Send wraps under the count.
  let want = 59;
  if (view === "phone") {
    want = read.footRows > 1 ? 122 : 67;
  }
  kit.check(
    `${leg}: the foot is ${want}px on ${read.footRows} row${read.footRows === 1 ? "" : "s"} (got ${read.foot}px, the count's bar ${read.bar}px)`,
    Math.abs(read.foot - want) <= 0.5,
    JSON.stringify({ foot: read.foot, rows: read.footRows, bar: read.bar })
  );
  const met = await page.evaluate(footOverWords);
  kit.check(
    `${leg}: the foot's box meets no card's words at six scroll positions, top to bottom`,
    met.length === 0,
    met.slice(0, 8).join("\n    ")
  );
}

/** Each option's picture: as tall as its canvas says, at 1:1 from its start where its room holds it, else zoomed to fit; on a phone its well at the screen's edges. */
async function checkPictures(
  kit: Kit,
  page: Page,
  read: Awaited<ReturnType<typeof readWidths>>,
  { leg, view }: WidthLeg
) {
  kit.check(`${leg}: the page reads as pictured`, read.pictured === true);
  for (const card of read.cards) {
    kit.check(
      `${leg}: card ${card.id}'s ${card.embeds.length} option pictures each stand at the height their canvas says (${card.embeds.map((one) => `${one.caption} ${one.shape} ${one.h}px`).join(", ")})`,
      card.embeds.length === card.cells &&
        card.embeds.every((one) => one.shape === "drawn"),
      JSON.stringify(card.embeds)
    );
  }
  for (const handle of await page.$$(EMBED_FRAME)) {
    await handle.scrollIntoViewIfNeeded();
    const inside = await (
      await handle.contentFrame()
    )?.evaluate(readBoardFrames);
    const outer = await handle.boundingBox();
    const caption = await handle.evaluate(
      (el) =>
        el
          .closest("figure")
          ?.querySelector("[data-slot=media-caption]")
          ?.textContent?.trim() ?? ""
    );
    const [one] = inside?.frames ?? [];
    if (!(inside && outer && one)) {
      kit.check(`${leg}: “${caption}” reads`, false);
      continue;
    }
    // 1:1 where the room holds the story; else zoomed to fit, with no floor on a phone.
    const scale = Math.min(1, inside.room / (BOARD_WIDTHS[one.story] ?? 1));
    kit.check(
      `${leg}: “${caption}” draws ${one.story} at ${scale === 1 ? "1:1" : `${Math.round(scale * 1000) / 1000}`} from its start (zoom ${one.zoom}, ${one.drawn}px of ${inside.room}px at ${one.left}px), with no sideways scroll, its frame ${Math.round(outer.height)}px for a world of ${inside.world}px`,
      inside.frames.length === 1 &&
        Math.abs(one.zoom - scale) <= 0.002 &&
        Math.abs(one.left) <= 0.5 &&
        one.over <= 0 &&
        !one.wide &&
        inside.docOver <= 0 &&
        Math.abs(outer.height - inside.world) <= 2,
      JSON.stringify({ inside, outer })
    );
    if (view === "phone") {
      kit.check(
        `${leg}: “${caption}”'s well reaches the screen's edges (${Math.round(outer.x)}px to ${Math.round(outer.x + outer.width)}px of ${read.viewport}px)`,
        Math.abs(outer.x) <= 0.5 &&
          Math.abs(outer.x + outer.width - read.viewport) <= 0.5
      );
    }
  }
}

/** 12. The pictured page and the worded one at the owner's panel widths, light and dark. */
async function widthLegs(
  kit: Kit,
  stage: Awaited<ReturnType<typeof startDecisionStage>>
): Promise<void> {
  for (const { w, view } of WIDTHS) {
    for (const theme of THEMES) {
      for (const name of [PICTURED_PAGE, WORDED_PAGE]) {
        const at: WidthLeg = {
          leg: `${w}px ${theme}, ${name}`,
          pictured: name === PICTURED_PAGE,
          view,
        };
        const page = await kit.page(view, {
          theme,
          init: [CAWCO_BRIDGE],
          scrollbars: view === "desk",
        });
        await page.setViewportSize({
          width: w,
          height: view === "desk" ? 900 : 844,
        });
        await page.goto(stage.pageUrl(name, theme), { waitUntil: "load" });
        await page.waitForSelector("[data-slot=decision]", {
          timeout: 30_000,
        });
        if (at.pictured) {
          await picturesUnscrolled(kit, page, at);
        }
        await settle(page, 600);
        const read = await page.evaluate(readWidths);
        checkLayout(kit, read, at);
        await checkFoot(kit, page, read, at);
        if (at.pictured) {
          await checkPictures(kit, page, read, at);
        }
        await page.close();
      }
    }
  }
}

const spec: Spec = {
  name: "decision-embed",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every assertion in the order the spec's head lists them
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });

    for (const [name, program] of [
      [NAME, PROGRAM],
      [NAMED_PAGE, NAMED_PROGRAM],
      [PICTURED_PAGE, PICTURED_PROGRAM],
      [WORDED_PAGE, WORDED_PROGRAM],
    ] as const) {
      let refusal = "";
      try {
        checkProgram(program);
      } catch (error) {
        refusal = (error as Error).message;
      }
      kit.check(
        `the hub's check keeps the ${name} program`,
        refusal === "",
        refusal
      );
    }

    const stage = await startDecisionStage(
      new Map([
        [NAME, PROGRAM],
        [NAMED_PAGE, NAMED_PROGRAM],
        [PICTURED_PAGE, PICTURED_PROGRAM],
        [WORDED_PAGE, WORDED_PROGRAM],
      ]),
      {
        [BOOK_ID]: [LEDGER, NOTE],
        [NOTE_ID]: [NOTE],
        [SIDE_ID]: [SIDE],
        [HEAD_ID]: [HEAD],
        [MENU_ID]: [MENU],
        [MONTH_ID]: [LEDGER],
        [SHEET_ID]: [SHEET],
        [BOARD_ID]: [BOARD],
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
          await page.waitForSelector("[data-slot=decision]", {
            timeout: 30_000,
          });
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
          await page.evaluate(() => {
            const scroller = document.querySelector(
              "[data-slot=page-scroll]"
            ) as HTMLElement;
            scroller.scrollTop = scroller.scrollHeight;
          });
          await settle(page, 600);
          await page.evaluate(() => {
            (
              document.querySelector("[data-slot=page-scroll]") as HTMLElement
            ).scrollTop = 0;
          });
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
            ...(Math.abs(f.left) > 1
              ? [
                  `“${f.caption}” ${f.story}: ${f.left}px in from the embed's start, not at it`,
                ]
              : []),
          ]);
          kit.check(
            `${leg}: every frame inside its embed and at its start, where the card's words start (${frames.map((f) => `${f.story} ${f.w}px at ${f.left}`).join(", ")})`,
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
          const wideFaults = wides.flatMap((f) => wideFaultsOf(f, view));
          kit.check(
            view === "desk"
              ? `${leg}: the ${WIDE_W}px side card scales only as far as 12px words, then scrolls sideways in its frame (${wides.map((f) => `${f.w}px at zoom ${f.zoom}, its words at ${f.type}px, ${f.scrolls}px to scroll`).join(", ")})`
              : `${leg}: under a finger the ${WIDE_W}px side card is fitted whole, no floor, no sideways scroll (${wides.map((f) => `${f.w}px at zoom ${f.zoom}, its words at ${f.type}px`).join(", ")})`,
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
                      frame
                        .closest("figure")
                        ?.querySelector("[data-slot=media-caption]")
                        ?.textContent?.trim() ?? ""
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
            `${leg}: each menu open in a frame, untouched, stands inside its own frame (${menus.map((one) => `${one.story}: the menu ${one.menu.join("–")} in the frame ${one.frame.join("–")}, a ${one.window}px window`).join("; ")})`,
            menus.length === MENUS.length && strayMenus.length === 0,
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
            view === "desk"
              ? `${leg}: a frame that scrolls sideways draws the house edge fade, ${HOUSE_FADE}px on every width, where more is hidden, none at either end (${fades.map((f) => `${f.story}, ${f.len}px: ${f.at.map((one) => `${one.place} ${one.start}px|${one.end}px`).join(", ")}`).join("; ")})`
              : `${leg}: under a finger no frame scrolls sideways, so none draws an edge fade`,
            fades.length === frames.filter((f) => f.wide).length &&
              (view === "desk" ? fades.length > 0 : fades.length === 0) &&
              fadeFaults.length === 0,
            fadeFaults.join("\n    ")
          );
          // A desk's words stand at 12px as the reader sees them (rounded to the pixel), scaled or not; a phone's at 12px where drawn at 1:1, its scaled stories fitted whole.
          const small = frames.filter(
            (f) => Math.round(f.type) < 12 && (view === "desk" || f.zoom >= 1)
          );
          kit.check(
            `${leg}: every embed's words readable as drawn: 12px and up${view === "desk" ? ", scaled or not" : " at 1:1, a scaled story fitted whole"} (smallest ${Math.min(...frames.map((f) => f.type))}px)`,
            small.length === 0,
            small
              .map(
                (f) =>
                  `“${f.caption}” ${f.story}: its words at ${f.type}px (zoom ${f.zoom})`
              )
              .join("\n    ")
          );

          const drawn = await page.evaluate(readDiagrams);
          const chain = drawn.wells.find(
            (w) => w.caption === "Nine steps down"
          );
          const staged = drawn.wells.find((w) => w.caption === "With a stage");
          const { want } = drawn;
          kit.check(
            `${leg}: the nine-node top-down chain is drawn as written and fits its well, its smallest words ${chain?.smallest}px (10px and up), no scroll either way, centred in its well (${JSON.stringify(chain && { smallest: chain.smallest, off: chain.off, scrolls: chain.scrolls })})`,
            !!chain &&
              chain.smallest >= 9.95 &&
              chain.scrolls[0] <= 0 &&
              chain.scrolls[1] <= 0 &&
              chain.off.every((o) => o <= 0.5)
          );
          kit.check(
            `${leg}: a diagram draws in the house's look: a node raised with the control's edge at 8px, its name in the label role in strong ink; an edge 1px in muted ink, its words in meta; a subgraph the recess with a hairline, its title in the label role, muted; centred in its well, or past its words' 10px floor scrolling sideways under the edge fade (${JSON.stringify(staged && { off: staged.off, scrolls: staged.scrolls, faded: staged.faded, smallest: staged.smallest, node: staged.node, label: staged.label, edge: staged.edge, edgeWords: staged.edgeWords, cluster: staged.cluster, clusterTitle: staged.clusterTitle, want })})`,
            !!staged?.node &&
              staged.node.fill === want.raised &&
              staged.node.stroke === want.control &&
              staged.node.rx === "8px" &&
              !!staged.label &&
              staged.label.fill === want.strong &&
              staged.label.size === "13px" &&
              staged.label.weight === "500" &&
              staged.label.face === want.face &&
              !!staged.edge &&
              staged.edge.stroke === want.mutedLine &&
              staged.edge.width === "1px" &&
              !!staged.edgeWords &&
              staged.edgeWords.size === "12px" &&
              staged.edgeWords.fill === want.muted &&
              !!staged.cluster &&
              staged.cluster.fill === want.recess &&
              staged.cluster.stroke === want.hairline &&
              !!staged.clusterTitle &&
              staged.clusterTitle.size === "13px" &&
              staged.clusterTitle.weight === "500" &&
              staged.clusterTitle.fill === want.muted &&
              (staged.scrolls[0] > 0
                ? staged.faded && staged.smallest >= 9.95
                : staged.off.every((o) => o <= 0.5)) &&
              staged.scrolls[1] <= 0
          );
          const laid = await page.evaluate(readLayout);
          const inset = view === "desk" ? "21px" : "14px";
          const spread = (values: number[]) =>
            values.length ? Math.max(...values) - Math.min(...values) : 99;
          kit.check(
            `${leg}: the page is one centred column ${view === "desk" ? "920px at most" : "the window wide"} (no Preview says its stories' width), ${inset} in, its groups 18px apart, on the recessed ground (${JSON.stringify(laid.page)})`,
            !!laid.page.box &&
              (view === "desk"
                ? laid.page.box.w === 920 &&
                  laid.page.box.x === (laid.page.room - 920) / 2
                : laid.page.box.w === laid.window.w) &&
              laid.page.inset.every((one) => one === inset) &&
              laid.page.gap === "18px" &&
              laid.page.ground === laid.tokens.recess
          );
          kit.check(
            `${leg}: a card is raised at the panel radius with the tile shadow and no border, ${view === "desk" ? "18px" : "14px"} in (${JSON.stringify(laid.card)})`,
            laid.card.radius === "16px" &&
              laid.card.border === "0px" &&
              laid.card.fill === laid.tokens.raised &&
              laid.card.shadow === laid.tokens.tile &&
              laid.card.pad.every(
                (one) => one === (view === "desk" ? "18px" : "14px")
              )
          );
          kit.check(
            `${leg}: the options side by side start their chips and their lines on one line, each chip 30px (${JSON.stringify(laid.row)})`,
            laid.row.cells >= (view === "desk" ? 2 : 1) &&
              spread(laid.row.chips) <= 0.5 &&
              spread(laid.row.lines) <= 0.5 &&
              laid.row.chipH.every((h) => Math.abs(h - 30) <= 0.5)
          );
          kit.check(
            `${leg}: a media well is the content well (radius 7, the well's edge, 11px in, the well's ground), its piece centred in it within half a pixel (${JSON.stringify(laid.well)})`,
            laid.well.radius === "7px" &&
              laid.well.edge === laid.tokens.wellEdge &&
              laid.well.pad === "11px" &&
              laid.well.fill === laid.tokens.well &&
              laid.well.off <= 0.5
          );
          kit.check(
            `${leg}: the foot stands in its own row at the window's foot, the window's full width, under the cards' scroller (their ${laid.foot.page}px scrolling above it), Send unobscured where it stands (${JSON.stringify(laid.foot)})`,
            laid.foot.position === "static" &&
              laid.foot.page > laid.window.h &&
              Math.abs(laid.foot.bottom - laid.window.h) <= 0.5 &&
              Math.abs(laid.foot.width - laid.window.w) <= 0.5 &&
              Math.abs(laid.foot.shown - laid.foot.top) <= 0.5 &&
              laid.foot.send
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
            // The note as a finger opens it: "Add a note" pressed, the field it
            // opens read, then Done folds it back as it was.
            await page
              .locator("#decision-ledger [data-slot=note] button")
              .first()
              .click();
            await settle(page, 600);
            const field = await page.evaluate(() =>
              Math.round(
                document
                  .querySelector("#decision-ledger [data-slot=note] textarea")
                  ?.getBoundingClientRect().height ?? 0
              )
            );
            await page
              .locator("#decision-ledger [data-slot=note] button", {
                hasText: "Done",
              })
              .click();
            await settle(page, 600);
            kit.check(
              `${leg}: under a finger "Add a note" reaches ${said.noteAdd}px, the note it opens stands ${field}px tall and Send picks ${said.send.h}px, 44px and up`,
              said.noteAdd >= 44 && field >= 44 && said.send.h >= 44
            );
          }
          // Every control on the page, a window at a time (decision-embeds.ts
          // `pageReach`): under a finger each one's area reaches 44px (The 44
          // Touch Rule); at a desk 24px, drawn so or through its hit area
          // (The 24 Pointer Rule); on neither does anything spill its box or
          // stand past the window.
          const reach = await pageReach(page);
          const short = reach.controls.filter((one) =>
            view === "phone" ? !one.touch : !one.pointer
          );
          kit.check(
            `${leg}: every control reaches ${view === "phone" ? "44px under a finger" : "24px under a mouse"} and nothing spills (${reach.controls.length} controls: ${reach.controls.map((one) => `${one.name.slice(0, 40)} ${one.w}×${one.h}`).join(", ")})`,
            reach.controls.length > 0 &&
              short.length === 0 &&
              reach.spills.length === 0,
            [...short.map((one) => one.line), ...reach.spills].join("\n    ")
          );

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

      // 11. A canvas of two states files, embedded naming stories: each drawn from whichever file holds it.
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}, named stories`;
          const page = await kit.page(view, {
            theme,
            init: [CAWCO_BRIDGE],
          });
          await page.goto(stage.pageUrl(NAMED_PAGE, theme), {
            waitUntil: "load",
          });
          const count = Object.keys(NAMED).length;
          await page.waitForFunction(
            ({ n, selector }) =>
              document.querySelectorAll(selector).length === n,
            { n: count, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          for (const handle of await page.$$(EMBED_FRAME)) {
            await handle.scrollIntoViewIfNeeded();
            const caption = await handle.evaluate(
              (el) =>
                el
                  .closest("figure")
                  ?.querySelector("[data-slot=media-caption]")
                  ?.textContent?.trim() ?? ""
            );
            const want = NAMED[caption] ?? { shows: [], missing: [] };
            const frame = await handle.contentFrame();
            // Every section loaded and every frame it draws said (drawn, failed or empty).
            const ready = await frame
              ?.waitForFunction(
                ({ files, shows }) => {
                  const rest = [
                    ...document.querySelectorAll<HTMLElement>(
                      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status'
                    ),
                  ].map((one) => one.dataset.state ?? "");
                  return (
                    (window.__cawcoCanvas?.loaded().length ?? 0) === files &&
                    rest.length === shows &&
                    rest.every((one) =>
                      ["drawn", "failed", "empty"].includes(one)
                    )
                  );
                },
                { files: 2, shows: want.shows.length },
                { timeout: 120_000, polling: 250 }
              )
              .then(
                () => true,
                () => false
              );
            await settle(page, 600);
            const read = await frame?.evaluate(readNamed);
            if (!(ready && read)) {
              kit.check(
                `${leg}: “${caption}” loads both states files and draws ${want.shows.join(", ") || "nothing"}`,
                false,
                JSON.stringify(read ?? "no frame")
              );
              continue;
            }
            const drew = read.frames
              .filter((one) => one.state === "drawn")
              .map((one) => one.story);
            const empty = read.sections.filter((one) => one.frames === 0);
            const heads = read.sections.reduce((n, one) => n + one.heads, 0);
            const said = read.alerts.filter((one) =>
              want.missing.every((name) => one.includes(name))
            );
            // An alert is seen where the embed stands: a box of its own, inside the embed's width, its words wrapped in it, the embed as tall as it.
            const tall = Math.round((await handle.boundingBox())?.height ?? 0);
            const misplaced = read.placed.filter(
              (one) =>
                one.h <= 0 ||
                one.left < -0.5 ||
                one.right > one.width + 0.5 ||
                one.overflows ||
                tall + 0.5 < one.h
            );
            kit.check(
              `${leg}: “${caption}” draws ${want.shows.join(", ") || "no frame"} from ${read.loaded.length} states files, ${want.missing.length ? `one alert naming ${want.missing.join(", ")}, inside the embed` : "no alert"}, every section holding nothing 0px tall, no section head seen (frames ${read.frames.map((one) => `${one.story} ${one.state}`).join(", ") || "none"}; alerts ${read.alerts.length}${read.alerts.length ? ` “${read.alerts.join("” “")}” at ${read.placed.map((one) => `${one.left}–${one.right} of ${one.width}px, ${one.h}px tall`).join(", ")}` : ""}; the embed ${tall}px tall; sections ${read.sections.map((one) => `${one.file.split("/").at(-1)} ${one.frames} frames ${one.h}px`).join(", ")})`,
              drew.join() === want.shows.join() &&
                read.frames.length === want.shows.length &&
                read.alerts.length === want.missing.length &&
                said.length === read.alerts.length &&
                misplaced.length === 0 &&
                empty.every((one) => one.h === 0) &&
                heads === 0,
              JSON.stringify(read)
            );
          }
        }
      }
      await widthLegs(kit, stage);
    } finally {
      await stage.stop();
    }
  },
};

export default spec;
