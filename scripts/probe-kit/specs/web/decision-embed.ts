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
 *    drawn, with words or a drawing in it.
 * 5. None of the canvas's working chrome is seen (band, crumb, foot, steps,
 *    section heads, labels, statuses).
 * 6. It posted its shape: the embed is as tall as what it draws, within
 *    2px, and as wide as its widest story. Each frame stands inside its
 *    width, at its start within 1px (the card's words start there too),
 *    every story at its own size, 1 CSS px per px: zoom 1, its drawn width
 *    its own, the 360px side card and the 1400px one alike, on a desk and
 *    under a finger; its words at 12px and up as drawn. A well narrower than
 *    its picture scrolls it sideways, under the house edge fade (DESIGN.md
 *    `kit-edge-fade`) at its full 40px on every width: read at the scroll's
 *    start, middle and end, a fade on each side where more is hidden and
 *    none at either end.
 * 7. A card's three media stand in one column, one under another from the
 *    same edge, each well hugging its picture inside the card.
 * 8. The page is as CawCo shows it: no offline notice, Send picks enabled,
 *    every option enabled with its keycap; every option DESIGN.md's option
 *    chip (30px and up, 8px radius, raised, its label on its keycap's line
 *    by The Mark Line Rule); at 390 the note and Send picks 44px tall
 *    (DESIGN.md, The 44 Touch Rule), and every control on the page reaching
 *    44px under a finger; at 1440 every control reaching 24px (The 24
 *    Pointer Rule); nothing spilling its box or past the window.
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
 *    under the phone's line), a pictured option alone on its last row
 *    spanning it; at 1440 and 1900 a card's two phone stories side by side
 *    at the house option gap from the row's start, never stretched apart;
 *    each pictured well hugging its picture, its frame the
 *    drawn story's width within 1px and the well never past its cell (on a
 *    phone, the screen); before any scroll every picture at the height
 *    its canvas says, below the fold too, the first as the rest; each story
 *    at 1:1 from its embed's start, its well scrolling it sideways under the
 *    house edge fade where the room is narrower; on a phone each well
 *    reaching the screen's edges; every question, why, line and cost at
 *    most 72ch; no page scroller or document scrolling sideways, and a
 *    well only where its picture is wider than it; the foot 59px at a desk, 67px
 *    under a finger on one row (122px where Send wraps under the count);
 *    and the foot's box meeting no card's words at six scroll positions top
 *    to bottom.
 * 13. The pictured page and its five canvases load with no console error,
 *    no response of 400 or more and no failed request, on the page or any
 *    frame; the page names the house icon, which answers 200 with an image;
 *    every form field on it and in its canvases has an id or a name (Chrome's
 *    "A form field element should have an id or name attribute": each
 *    card's note and its measuring twin), and so has every field of the
 *    kit's HTML page as the hub builds it, its note's kept out of the
 *    page's answers (`data-cawco-unkept`). A page whose Preview names an
 *    artifact the hub no longer has says so in one line in its well, with
 *    no frame, no console error and no failed request.
 * 14. Every option's media at its real size and whole (the owner: "the
 *    container for all of the things ur asking me to compare is so small
 *    that i'm not even able to compare"), on a page of two 390px phone
 *    designs, two 1440px desk designs, one tall page Preview, and five
 *    options of words, one of them a 40-word line, at 1440, 680 and 390, in
 *    Chromium and WebKit: each frame and every box round it unscaled (no
 *    transform, no scale, zoom 1) and as wide as its design, every story in
 *    it zoom 1 at its own width; the 390 pair side by side at 1440; the 1440
 *    pair one under another at every width, each at the card's full width;
 *    the tall page scrolling inside its frame, the edge fade at its foot
 *    while more is below and at its head once scrolled to its end; the page
 *    never scrolling sideways; no two cards, options or parts of an option
 *    meeting, and every option's words inside its cell.
 * 15. One Yjs per realm: a page served with the overlay, as the hub serves
 *    a decision page, whose three Previews embed canvases of a card that
 *    keeps its words in a Yjs doc and syncs it with y-protocols (the
 *    dashboard's comment rail, through y-websocket), each embed given the
 *    overlay as a machine's preview proxy gives it, in Chromium and WebKit:
 *    no console message on the page or any frame says "Yjs was already
 *    imported"; the overlay runs in every embed and brings no Yjs into its
 *    realm (preview-overlay doc-worker.ts), so each embed's one Yjs is the
 *    project's: every card draws on it, every member it imports there and
 *    Yjs's constructor checks holding; the decision page, which imports
 *    none, runs none. On the stage's own port (as the daemon draws), and on
 *    the dashboard's own stage, the same.
 * 16. An embed asks no origin for what it doesn't serve: a page of the
 *    dashboard's three connect asks (transcripts with their tool rows over
 *    the real composer), on the dashboard's own stage, in Chromium and
 *    WebKit: every canvas draws, no frame requests `/api/*`, and nothing
 *    logs a console error, answers 400 or more or fails.
 *
 *   bun scripts/probe-kit/run.ts web decision-embed
 *   bun scripts/probe-kit/run.ts web decision-embed --leg one-yjs   # 15 alone
 *   bun scripts/probe-kit/run.ts web decision-embed --leg loads-clean   # 13 alone
 *   bun scripts/probe-kit/run.ts web decision-embed --leg hubless   # 16 alone
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildDecisionPage } from "../../../../packages/hub/src/decision-page";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  APP,
  CAWCO_BRIDGE,
  EMBED_FRAME,
  type Embed,
  embedDrawFaults,
  idOf,
  pageReach,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, type Spec, settle, THEMES } from "../../kit";

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
 * Each media well on the page that scrolls its picture sideways (a picture
 * wider than the well, at its real size), under the house edge fade at the
 * start of its scroll, its middle and its end: the fades' lengths as drawn
 * (`--fade-start`, `--fade-end`), its mask, and the fade's own length. In
 * the page.
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
    caption: string;
    len: number;
  }[] = [];
  for (const stage of document.querySelectorAll<HTMLElement>(
    "[data-slot=media-stage][data-wide]"
  )) {
    stage.scrollIntoView({ block: "center" });
    const max = stage.scrollWidth - stage.clientWidth;
    const at: (typeof fades)[number]["at"] = [];
    for (const [place, left] of [
      ["start", 0],
      ["middle", Math.round(max / 2)],
      ["end", max],
    ] as const) {
      stage.scrollLeft = left;
      await next();
      const style = getComputedStyle(stage);
      at.push({
        end: Number.parseFloat(style.getPropertyValue("--fade-end")),
        left: stage.scrollLeft,
        mask: style.maskImage,
        place,
        start: Number.parseFloat(style.getPropertyValue("--fade-start")),
      });
    }
    stage.scrollLeft = 0;
    await next();
    fades.push({
      at,
      caption:
        stage
          .closest("figure")
          ?.querySelector("[data-slot=media-caption]")
          ?.textContent?.trim() ?? "",
      len: Number.parseFloat(
        getComputedStyle(stage).getPropertyValue("--fade-len")
      ),
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
  const card = document.querySelector<HTMLElement>("[data-slot=decision]");
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
    /** The widest picture on the page at its real size, as its well says it. */
    widest: Math.max(
      0,
      ...[...document.querySelectorAll<HTMLElement>("[data-slot=media]")].map(
        (one) => Number(one.dataset.picture ?? 0)
      )
    ),
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
      /** Drawn px per its own px: 1 at its natural size. */
      scale: Math.round(scale * 100) / 100,
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
      // Wider than its well: it scrolls sideways under the house edge fade.
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
          y: Math.round(r.top),
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
          // The well round it and the cell it stands in: a well hugs its picture, never past its cell.
          well: box(frame.closest("figure")).w,
          wellX: box(frame.closest("figure")).x,
          // The well's stage: it scrolls the picture sideways where it is narrower.
          stage: box(frame.closest("[data-slot=media-stage]")).w,
          stageWide:
            frame
              .closest("[data-slot=media-stage]")
              ?.hasAttribute("data-wide") ?? false,
          cell: box(
            frame.closest("[data-slot=option-cell], [data-slot=decision-media]")
          ).w,
        })),
      };
    }
  );
  const wells = [
    ...document.querySelectorAll<HTMLElement>("[data-slot=media-stage]"),
  ].map((stage) => ({
    caption:
      stage
        .closest("figure")
        ?.querySelector("[data-slot=media-caption]")
        ?.textContent?.trim() ?? "",
    over: stage.scrollWidth - stage.clientWidth,
    wide: stage.hasAttribute("data-wide"),
    faded: stage.classList.contains("kit-edge-fade"),
  }));
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

/** A page whose one Preview names an artifact the hub no longer has: its media names nothing at that id. */
const GONE_PAGE = "gone";
const GONE_ID = idOf("removed-card");
const GONE_PROGRAM = [
  `root = Decisions("Keep the card?", [keep])`,
  `keep = Decision("keep", "Does the card stay?", [stay, go], "It was pictured once.", [gone])`,
  `stay = Option("stay", "It stays", "Nothing moves.", true, [], "It stands where it stood.")`,
  `go = Option("go", "It goes", "The row is shorter.", false, [], "Its place is lost.")`,
  `gone = Preview("${GONE_ID}", "The card as it was")`,
].join("\n");

/**
 * Every form field of the document (an `input`, `select` or `textarea`)
 * with neither an id nor a name: what Chrome's "A form field element should
 * have an id or name attribute" counts. In the page or a frame.
 */
const unnamedFields = (): string[] =>
  [...document.querySelectorAll("input, select, textarea")]
    .filter((one) => !(one.id || one.getAttribute("name")))
    .map((one) => one.outerHTML.slice(0, 160));

/** Every console error, page error, response of 400 or more and failed request on `page` or any of its frames, from now on. */
function faultsOf(page: Page): string[] {
  const faults: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const at = message.location();
      faults.push(
        `console: ${message.text().slice(0, 200)} (${at.url}${at.lineNumber ? `:${at.lineNumber}` : ""})`
      );
    }
  });
  page.on("pageerror", (error) =>
    faults.push(`page error: ${error.message.slice(0, 200)}`)
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      faults.push(
        `${response.status()} ${response.request().method()} ${response.url()} (from ${response.frame().url()})`
      );
    }
  });
  page.on("requestfailed", (request) =>
    faults.push(
      `failed ${request.method()} ${request.url()}: ${request.failure()?.errorText ?? ""} (from ${request.frame().url()})`
    )
  );
  return faults;
}

/**
 * 13. A page loads clean: the pictured page (five component Previews) at
 * 1440 light logs no console error and answers no request with 400 or
 * more, on the page or any of its frames, and no request fails; it names
 * its icon (the house's, `/__cawco/decision/icon.png`), which answers 200
 * with an image, so a tab of its own asks for no `/favicon.ico`. Every form
 * field on it and in its canvases has an id or a name (each card's note,
 * and the twin its height is measured on). A page whose Preview names an
 * artifact the hub no longer has says so in its place, one line in its
 * well, with no console error and no failed request.
 */
async function loadsClean(
  kit: Kit,
  stage: Awaited<ReturnType<typeof startDecisionStage>>
): Promise<void> {
  const page = await kit.page("desk", { theme: "light", init: [CAWCO_BRIDGE] });
  const faults = faultsOf(page);
  await page.goto(stage.pageUrl(PICTURED_PAGE, "light"), { waitUntil: "load" });
  await picturesUnscrolled(kit, page, {
    leg: "1440px light, loading clean",
    pictured: true,
    view: "desk",
    w: 1440,
  });
  await settle(page, 1500);
  // The page names its icon and the icon answers: a browser asks a page
  // that names none for the origin's `/favicon.ico`, which a preview origin
  // doesn't serve (404 in the console, in no network list), and a headless
  // one never asks, so it is read here, not heard.
  const icon = await page.evaluate(async () => {
    const href = document
      .querySelector<HTMLLinkElement>('link[rel~="icon"]')
      ?.getAttribute("href");
    if (!href) {
      return { href: null, status: 0, type: "" };
    }
    const answer = await fetch(href, { cache: "no-store" });
    return {
      href,
      status: answer.status,
      type: answer.headers.get("content-type") ?? "",
    };
  });
  kit.check(
    `1440px light, ${PICTURED_PAGE}: the page names its icon and it answers (${icon.href ?? "no icon"}: ${icon.status} ${icon.type})`,
    !!icon.href && icon.status === 200 && icon.type.startsWith("image/"),
    JSON.stringify(icon)
  );
  kit.check(
    `1440px light, ${PICTURED_PAGE}: the page and its ${(await page.$$(EMBED_FRAME)).length} canvases load with no console error, no response of 400 or more and no failed request (${faults.length} found)`,
    faults.length === 0,
    [...new Set(faults)].slice(0, 12).join("\n    ")
  );
  const unnamed: string[] = [];
  let fields = 0;
  for (const frame of page.frames()) {
    fields += await frame.evaluate(
      () => document.querySelectorAll("input, select, textarea").length
    );
    const without = await frame.evaluate(unnamedFields);
    unnamed.push(...without.map((one) => `${frame.url()}: ${one}`));
  }
  kit.check(
    `1440px light, ${PICTURED_PAGE}: every one of its ${fields} form fields, on the page and in its canvases, has an id or a name (${unnamed.length} without)`,
    fields > 0 && unnamed.length === 0,
    unnamed.slice(0, 6).join("\n    ")
  );
  await page.close();

  // The kit's own page.html, as the hub builds a hand-written HTML page from it.
  const built = await buildDecisionPage(
    readFileSync(
      join(ROOT, "packages/hub/skills/decision-page/kit/page.html"),
      "utf8"
    ),
    {
      image: () => Promise.resolve(undefined),
      mockup: () => Promise.resolve(undefined),
    }
  );
  const kitPage = await kit.page("desk", { theme: "light" });
  if ("html" in built) {
    await kitPage.setContent(built.html, { waitUntil: "load" });
  }
  const kitFields = await kitPage.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea")].map((one) => ({
      id: one.id,
      unkept: one.hasAttribute("data-cawco-unkept"),
    }))
  );
  const kitUnnamed = await kitPage.evaluate(unnamedFields);
  kit.check(
    `1440px light, the kit's HTML page: every one of its ${kitFields.length} form fields has an id or a name (${kitUnnamed.length} without), its note's the card's (${kitFields.map((one) => one.id).join(", ")}), kept out of the page's answers`,
    "html" in built &&
      kitFields.length > 0 &&
      kitUnnamed.length === 0 &&
      kitFields.every((one) => one.unkept),
    "problem" in built
      ? built.problem
      : [JSON.stringify(kitFields), ...kitUnnamed].join("\n    ")
  );
  await kitPage.close();

  const gone = await kit.page("desk", { theme: "light", init: [CAWCO_BRIDGE] });
  const goneFaults = faultsOf(gone);
  await gone.goto(stage.pageUrl(GONE_PAGE, "light"), { waitUntil: "load" });
  await gone.waitForSelector("[data-slot=media-gone]");
  await settle(gone, 1500);
  const said = await gone.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-slot=media-gone]")].map(
      (one) => {
        const box = one.getBoundingClientRect();
        return {
          words: one.textContent?.trim() ?? "",
          w: Math.round(box.width),
          h: Math.round(box.height),
          frames: document.querySelectorAll("[data-slot=media] iframe").length,
        };
      }
    )
  );
  kit.check(
    `1440px light, ${GONE_PAGE}: a Preview of an artifact the hub no longer has says so in its place, one line in its well (${said.map((one) => `“${one.words}” ${one.w}×${one.h}px`).join(", ")}), no frame, no console error and no failed request (${goneFaults.length} found)`,
    said.length === 1 &&
      (said[0]?.words.length ?? 0) > 0 &&
      (said[0]?.h ?? 0) > 0 &&
      said[0]?.frames === 0 &&
      goneFaults.length === 0,
    [JSON.stringify(said), ...new Set(goneFaults)].join("\n    ")
  );
  await gone.close();
}

/** One leg of 12: a page at a width, under a mouse or a finger, in a scheme. */
interface WidthLeg {
  leg: string;
  pictured: boolean;
  view: "desk" | "phone";
  /** The panel's width, px. */
  w: number;
}

/** The chrome round a story at 1:1, px: the page's and the card's insets each side, a well's edge and inset each side, the gap between options. */
const CHROME = {
  gap: 11,
  well: 12,
  insets: { desk: 2 * (21 + 18), phone: 2 * (14 + 14) },
} as const;

/**
 * The page's column in a room of `room` px whose widest picture is
 * `widest` px (0: none): the largest step of pictures abreast at 1:1 the
 * room holds, never under 920, the room's whole width where not one fits;
 * 920 on a page with no pictures; never past the room.
 */
function columnFor(
  room: number,
  widest: number,
  view: "desk" | "phone"
): number {
  if (widest <= 0) {
    return Math.min(room, 920);
  }
  const insets = CHROME.insets[view];
  const pitch = widest + 2 * CHROME.well;
  const abreast = Math.floor(
    (room - insets + CHROME.gap) / (pitch + CHROME.gap)
  );
  const step =
    abreast > 0 ? abreast * (pitch + CHROME.gap) - CHROME.gap + insets : room;
  return Math.min(room, Math.max(920, step));
}

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
  // The column: on a pictured page the largest step of 640px stories abreast its room holds, never under 920, the room where none fits; else 920; never past its room.
  const want = columnFor(read.room, pictured ? DESK_STORY : 0, view);
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
    // A pictured option left alone on its last row spans it, on the first column's edge; none on a worded page.
    const alone = pictured && per > 1 && card.cells % per === 1;
    const last = card.cellW.at(-1) ?? 0;
    kit.check(
      `${leg}: card ${card.id}'s last option ${alone ? `stands alone on its row and spans it (${last}px of ${card.body}px)` : `keeps its column (${last}px)`}`,
      alone
        ? Math.abs(last - card.body) <= 0.5
        : card.cellW.every(
            (one) => Math.abs(one - (card.cellW[0] ?? 0)) <= 0.5
          ),
      JSON.stringify(card.cellW)
    );
  }
  // Words keep their measure: every question, why, line and cost at most 72ch.
  const long = read.texts.filter((one) => one.w > 72 * one.ch + 0.5);
  kit.check(
    `${leg}: every question, why, line and cost runs at most 72ch (${read.texts.length} runs, widest ${Math.max(...read.texts.map((one) => Math.round((one.w / one.ch) * 10) / 10))}ch)`,
    read.texts.length > 0 && long.length === 0,
    JSON.stringify(long)
  );
  // A well scrolls sideways only where its picture is wider than it, then under the house edge fade; never the page's scroller or the document.
  const astray = read.wells.filter(
    (one) => one.over > 0 !== one.wide || (one.wide && !one.faded)
  );
  kit.check(
    `${leg}: the page's scroller and the document never scroll sideways, and a well only where its picture is wider than it, under the edge fade (${
      read.wells
        .filter((one) => one.wide)
        .map((one) => `“${one.caption}” ${one.over}px`)
        .join(", ") || "none"
    })`,
    astray.length === 0 && read.scrollerOver <= 0 && read.docOver <= 0,
    JSON.stringify({
      astray,
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

/** At 1440 and 1900 the phone card's two pictures: side by side at the house option gap, from the row's start. */
function checkPhoneGap(
  kit: Kit,
  read: Awaited<ReturnType<typeof readWidths>>,
  { leg, view, w }: Pick<WidthLeg, "leg" | "view" | "w">
) {
  // Phone stories in a desk column stand side by side at the house option gap, packed from the row's start (the words' edge), never stretched apart.
  if (!(view === "desk" && w >= 1440)) {
    return;
  }
  const phone = read.cards.find((card) => card.id === "phone");
  const [first, second] = phone?.embeds ?? [];
  const gap =
    first && second
      ? Math.round((second.wellX - (first.wellX + first.well)) * 10) / 10
      : Number.NaN;
  const startGap =
    phone && first ? Math.round((first.wellX - phone.cardLeft) * 10) / 10 : 0;
  kit.check(
    `${leg}: the phone card's two pictures stand ${gap}px apart, the house option gap (${CHROME.gap}px), from the row's start (${startGap}px in from the card's edge, the words' ${phone ? Math.round((phone.wordsLeft - phone.cardLeft) * 10) / 10 : 0}px)`,
    Math.abs(gap - CHROME.gap) <= 1 &&
      !!phone &&
      !!first &&
      Math.abs(first.wellX - phone.wordsLeft) <= 1,
    JSON.stringify(phone?.embeds)
  );
}

/** Each option's picture: as tall as its canvas says, at 1:1 from its start where its room holds it, else zoomed to fit; on a phone its well at the screen's edges. */
async function checkPictures(
  kit: Kit,
  page: Page,
  read: Awaited<ReturnType<typeof readWidths>>,
  { leg, view, w }: WidthLeg
) {
  kit.check(`${leg}: the page reads as pictured`, read.pictured === true);
  checkPhoneGap(kit, read, { leg, view, w });
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
    const held = read.cards
      .flatMap((card) => card.embeds)
      .find((embed) => embed.caption === caption);
    if (!(inside && outer && one && held)) {
      kit.check(`${leg}: “${caption}” reads`, false);
      continue;
    }
    // The well hugs its picture: its inner box (the frame) the drawn story's width within 1px; the well never past its cell (on a phone, past it only as far as the screen's edges).
    const reach = view === "phone" ? read.viewport : held.cell;
    kit.check(
      `${leg}: “${caption}”'s well hugs its picture: the frame ${Math.round(outer.width * 10) / 10}px for ${one.story} drawn ${one.drawn}px, the well ${held.well}px in a ${held.cell}px cell`,
      Math.abs(outer.width - one.drawn) <= 1 && held.well <= reach + 0.5,
      JSON.stringify({ frame: outer.width, drawn: one.drawn, ...held })
    );
    // Always 1:1, from its start, its frame as wide as the story; where the well is narrower, the well scrolls it sideways.
    const own = BOARD_WIDTHS[one.story] ?? 0;
    kit.check(
      `${leg}: “${caption}” draws ${one.story} at 1:1 from its start (zoom ${one.zoom}, ${one.drawn}px of its own ${own}px at ${one.left}px), its frame ${Math.round(outer.width)}×${Math.round(outer.height)}px for a world of ${inside.world}px, its well's stage ${held.stage}px ${held.stageWide ? "scrolling it sideways" : "holding it whole"}`,
      inside.frames.length === 1 &&
        one.zoom === 1 &&
        Math.abs(one.drawn - own) <= 0.5 &&
        Math.abs(outer.width - own) <= 0.5 &&
        Math.abs(one.left) <= 0.5 &&
        one.over <= 0 &&
        inside.docOver <= 0 &&
        Math.abs(outer.height - inside.world) <= 2 &&
        held.stageWide === own > held.stage + 0.5,
      JSON.stringify({ inside, outer, held })
    );
    if (view === "phone") {
      kit.check(
        `${leg}: “${caption}”'s well reaches the screen's edges (${held.wellX}px to ${Math.round((held.wellX + held.well) * 10) / 10}px of ${read.viewport}px)`,
        Math.abs(held.wellX) <= 0.5 &&
          Math.abs(held.wellX + held.well - read.viewport) <= 0.5
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
          w,
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

// --- 14. Every option's media at its real size, whole ----------------------------

const REAL_PAGE = "real";
const LONG_ID = idOf("long-page");
/** The phone designs' and the desk designs' own widths. */
const DESK_WIDE = 1440;
/** A page artifact far taller than any window: it scrolls inside its frame. */
const LONG_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The long page</title>
<style>body{margin:0;font:16px system-ui}section{block-size:400px;padding:16px;box-sizing:border-box;border-block-end:1px solid #ccc}</style></head>
<body>${Array.from({ length: 8 }, (_, i) => `<section>Part ${i + 1} of 8</section>`).join("")}</body></html>`;
/** An option's line of 40 words. */
const FORTY_WORDS =
  "Every machine on one line with its sessions counted and its spend beside them so the person reads the whole fleet in one look and opens only the one that waits on them never every terminal in turn each morning before work.";
const REAL_PROGRAM = [
  `root = Decisions("Compare at real size", [phones, desks, long, five])`,
  `phones = Decision("phones", "Which board does a phone open on?", [pcalm, pdense], "Two phone designs, side by side.")`,
  `pcalm = Option("pcalm", "Calm on a phone", "Three lines.", true, [pcalmP], "The machines a scroll away.")`,
  `pdense = Option("pdense", "Dense on a phone", "Four lines.", false, [pdenseP], "Taller than a screen.")`,
  `pcalmP = Preview("${BOARD_ID}", "Calm on a phone", ["PhoneCalm"], ${PHONE_STORY})`,
  `pdenseP = Preview("${BOARD_ID}", "Dense on a phone", ["PhoneDense"], ${PHONE_STORY})`,
  `desks = Decision("desks", "Which board does a desk open on?", [dcalm, ddense], "Two desk designs, one under another.")`,
  `dcalm = Option("dcalm", "Calm on a desk", "One line per machine.", true, [dcalmP], "The figures a click away.")`,
  `ddense = Option("ddense", "Dense on a desk", "Every figure at once.", false, [ddenseP], "A wall of numbers.")`,
  `dcalmP = Preview("${BOARD_ID}", "Calm on a desk", ["DeskCalm"], ${DESK_WIDE})`,
  `ddenseP = Preview("${BOARD_ID}", "Dense on a desk", ["DeskDense"], ${DESK_WIDE})`,
  `long = Decision("long", "Does the long page read top to bottom?", [keep, cut], "One page, taller than any window.")`,
  `keep = Option("keep", "As it stands", "Eight parts, one after another.", true, [longP], "A long scroll.")`,
  `cut = Option("cut", "Cut to one screen", "The first part alone.", false, [], "The rest a click away.")`,
  `longP = Preview("${LONG_ID}", "The long page")`,
  `five = Decision("five", "Which line leads the board?", [f1, f2, f3, f4, f5], "Five ways to say it.")`,
  `f1 = Option("f1", "Machines", "${FORTY_WORDS}", true, [], "Long to read.")`,
  `f2 = Option("f2", "Sessions", "Sessions first.", false, [], "Machines lower.")`,
  `f3 = Option("f3", "Spend", "Spend first.", false, [], "Work lower.")`,
  `f4 = Option("f4", "Waiting", "What waits first.", false, [], "Quiet days look empty.")`,
  `f5 = Option("f5", "Mixed", "One of each.", false, [], "No order.")`,
].join("\n");
/** The widths the owner's panels stand at for item 14, desk ones under a mouse, the phone under a finger. */
const REAL_WIDTHS = [
  { w: 1440, view: "desk" },
  { w: 680, view: "desk" },
  { w: 390, view: "phone" },
] as const;

/**
 * Every frame on the page, every card and its options, from the engine:
 * each frame's caption, its card, its design's own width (its well's
 * `data-picture`), its drawn box, every box from it out to the page that
 * scales it (a transform, a scale, a zoom), and whether its well scrolls it
 * sideways; each card's box, its options' grid, each option cell and each
 * part of it; the page's scroller and the document's sideways overflow. In
 * the page.
 */
function readRealSize() {
  const round = (n: number) => Math.round(n * 10) / 10;
  const box = (el: Element | null | undefined) => {
    const b = el?.getBoundingClientRect();
    return b
      ? {
          x: round(b.left),
          y: round(b.top),
          w: round(b.width),
          h: round(b.height),
          right: round(b.right),
          bottom: round(b.bottom),
        }
      : { x: 0, y: 0, w: 0, h: 0, right: 0, bottom: 0 };
  };
  // The product of every computed `zoom` up its document: every engine
  // answers it (Safari lacks `currentCSSZoom` before 26.4).
  const zoomOf = (el: Element) => {
    let zoom = 1;
    for (let at: Element | null = el; at; at = at.parentElement) {
      const own = Number.parseFloat(getComputedStyle(at).zoom);
      if (own > 0) {
        zoom *= own;
      }
    }
    return zoom;
  };
  const frames = [
    ...document.querySelectorAll<HTMLIFrameElement>(
      "[data-slot=media] iframe[data-slot=embed]"
    ),
  ].map((frame) => {
    const figure = frame.closest<HTMLElement>("figure");
    const scaled: string[] = [];
    for (let at: Element | null = frame; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (
        style.transform !== "none" ||
        style.scale !== "none" ||
        zoomOf(at) !== 1
      ) {
        scaled.push(
          `${at.tagName.toLowerCase()}${at.getAttribute("data-slot") ? `[${at.getAttribute("data-slot")}]` : ""}: transform ${style.transform}, scale ${style.scale}, zoom ${zoomOf(at)}`
        );
      }
    }
    return {
      caption:
        figure
          ?.querySelector("[data-slot=media-caption]")
          ?.textContent?.trim() ?? "",
      card:
        frame
          .closest("[data-slot=decision]")
          ?.getAttribute("data-cawco-choice") ?? "",
      design: Number(figure?.dataset.picture ?? 0),
      ...box(frame),
      scaled,
      wide:
        frame.closest("[data-slot=media-stage]")?.hasAttribute("data-wide") ??
        false,
    };
  });
  const cards = [...document.querySelectorAll("[data-slot=decision]")].map(
    (card) => ({
      id: card.getAttribute("data-cawco-choice") ?? "",
      ...box(card),
      grid: box(card.querySelector("[data-slot=options]")),
      cells: [...card.querySelectorAll("[data-slot=option-cell]")].map(
        (cell) => ({
          ...box(cell),
          parts: [...cell.children].map((part) => ({
            part:
              part.getAttribute("data-slot") ??
              part.id.split("-").at(-1) ??
              part.tagName.toLowerCase(),
            ...box(part),
          })),
        })
      ),
    })
  );
  const scroller = document.querySelector<HTMLElement>(
    "[data-slot=page-scroll]"
  );
  return {
    frames,
    cards,
    scrollerOver: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
    docOver:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    window: { w: innerWidth, h: innerHeight },
  };
}

interface Box {
  bottom: number;
  right: number;
  x: number;
  y: number;
}
/** Two boxes share more than half a pixel each way. */
const meet = (a: Box, b: Box) =>
  Math.min(a.right, b.right) - Math.max(a.x, b.x) > 0.5 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 0.5;
/** Every pair of `boxes` that meets, named by `name`. */
const meetings = <T extends Box>(boxes: T[], name: (one: T) => string) =>
  boxes.flatMap((one, at) =>
    boxes
      .slice(at + 1)
      .filter((other) => meet(one, other))
      .map((other) => `${name(one)} meets ${name(other)}`)
  );

/** The tall page's frame, its inner scroll and its cue, read at its scroll's start and its end. */
async function readLong(page: Page) {
  const handle = await page.$(
    `${EMBED_FRAME}[data-cawco-artifact="${LONG_ID}"]`
  );
  const inner = await handle?.contentFrame();
  if (!(handle && inner)) {
    return null;
  }
  await handle.scrollIntoViewIfNeeded();
  const cue = () =>
    handle.evaluate((frame) => ({
      above: frame.hasAttribute("data-more-above"),
      below: frame.hasAttribute("data-more-below"),
      mask: getComputedStyle(frame).maskImage,
      h: Math.round(frame.getBoundingClientRect().height),
      cap: Number.parseFloat(getComputedStyle(frame).maxBlockSize),
    }));
  const scroll = () =>
    inner.evaluate(() => ({
      content: document.documentElement.scrollHeight,
      shown: innerHeight,
    }));
  const atStart = { ...(await cue()), ...(await scroll()) };
  await inner.evaluate(() =>
    scrollTo(0, document.documentElement.scrollHeight)
  );
  await settle(page, 300);
  const atEnd = await cue();
  await inner.evaluate(() => scrollTo(0, 0));
  return { atStart, atEnd };
}

/** The real-size page open at `w` on `engine`, every canvas on it reached as a person scrolls to it and drawn. */
async function openReal(
  kit: Kit,
  stage: Awaited<ReturnType<typeof startDecisionStage>>,
  engine: "chromium" | "webkit",
  { w, view }: (typeof REAL_WIDTHS)[number]
): Promise<Page> {
  const page = await kit.page(view, {
    engine,
    init: [CAWCO_BRIDGE],
    theme: "light",
  });
  await page.setViewportSize({
    width: w,
    height: view === "desk" ? 900 : 844,
  });
  await page.goto(stage.pageUrl(REAL_PAGE, "light"), { waitUntil: "load" });
  await page.waitForFunction(
    (selector) => document.querySelectorAll(selector).length === 5,
    EMBED_FRAME,
    { timeout: 60_000 }
  );
  for (const handle of await page.$$(CANVAS_FRAMES)) {
    await handle.scrollIntoViewIfNeeded();
    await (
      await handle.contentFrame()
    )
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
  await page
    .waitForFunction(
      (selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)].filter(
          (one) => one.dataset.shape === "drawn"
        ).length === 4,
      EMBED_FRAME,
      { timeout: 60_000, polling: 250 }
    )
    .catch(() => undefined);
  await settle(page, 600);
  return page;
}

/** The real-size page's four canvas frames: every Preview but the long page's. */
const CANVAS_FRAMES = `${EMBED_FRAME}:not([data-cawco-artifact="${LONG_ID}"])`;

/** Scale 1: nothing from a frame out to the page scales it, it is its design's width, and every story in a canvas is zoom 1 at its own width. */
async function checkScale(
  kit: Kit,
  page: Page,
  read: Awaited<ReturnType<typeof readRealSize>>,
  leg: string
) {
  const unreal = read.frames.filter(
    (one) =>
      one.scaled.length > 0 ||
      (one.design > 0 && Math.abs(one.w - one.design) > 0.5)
  );
  kit.check(
    `${leg}: every frame at scale 1, no transform, scale or zoom on it or round it, as wide as its design (${read.frames.map((one) => `“${one.caption}” ${one.w}px for ${one.design ? `${one.design}px` : "the well's"}${one.wide ? ", scrolling sideways in its well" : ""}`).join(", ")})`,
    read.frames.length === 5 && unreal.length === 0,
    JSON.stringify(unreal)
  );
  const stories: string[] = [];
  const faults: string[] = [];
  for (const handle of await page.$$(CANVAS_FRAMES)) {
    await handle.scrollIntoViewIfNeeded();
    const inside = await (
      await handle.contentFrame()
    )?.evaluate(readBoardFrames);
    for (const one of inside?.frames ?? []) {
      const own = one.story.startsWith("Desk") ? DESK_WIDE : PHONE_STORY;
      stories.push(`${one.story} ${one.drawn}px at zoom ${one.zoom}`);
      if (one.zoom !== 1 || Math.abs(one.drawn - own) > 0.5) {
        faults.push(
          `${one.story}: ${one.drawn}px at zoom ${one.zoom}, its own ${own}px`
        );
      }
    }
  }
  kit.check(
    `${leg}: every story in its canvas at zoom 1, its own width (${stories.join(", ")})`,
    stories.length === 4 && faults.length === 0,
    faults.join("\n    ")
  );
}

/** The 390 pair side by side at 1440; the 1440 pair one under another at every width, each at the card's full width. */
function checkPairs(
  kit: Kit,
  read: Awaited<ReturnType<typeof readRealSize>>,
  leg: string,
  w: number
) {
  const card = (id: string) => read.cards.find((one) => one.id === id);
  if (w === 1440) {
    const phones = card("phones");
    const [a, b] = phones?.cells ?? [];
    kit.check(
      `${leg}: the two ${PHONE_STORY}px designs sit side by side (${phones?.cells.map((one) => `${one.w}px at ${one.x},${one.y}`).join(" and ")})`,
      !!a && !!b && Math.abs(a.y - b.y) <= 0.5 && b.x >= a.right
    );
  }
  const desks = card("desks");
  const [first, second] = desks?.cells ?? [];
  kit.check(
    `${leg}: the two ${DESK_WIDE}px designs stand one under another, each at the card's full width (${desks?.cells.map((one) => `${one.w}px at ${one.x},${one.y}`).join(" and ")} in a ${desks?.grid.w}px grid)`,
    !!(first && second && desks) &&
      second.y >= first.bottom &&
      [first, second].every(
        (one) =>
          Math.abs(one.w - desks.grid.w) <= 0.5 &&
          Math.abs(one.x - desks.grid.x) <= 0.5
      )
  );
}

/** The page never scrolls sideways; no two cards, options or parts of an option meet, and every part stands inside its option. */
function checkWhole(
  kit: Kit,
  read: Awaited<ReturnType<typeof readRealSize>>,
  leg: string
) {
  kit.check(
    `${leg}: the page never scrolls sideways (its scroller ${read.scrollerOver}px, the document ${read.docOver}px past)`,
    read.scrollerOver <= 0 && read.docOver <= 0
  );
  const outside = (
    cell: (typeof read.cards)[number]["cells"][number],
    id: string
  ) =>
    cell.parts
      .filter(
        (part) =>
          part.x < cell.x - 0.5 ||
          part.right > cell.right + 0.5 ||
          part.bottom > cell.bottom + 0.5
      )
      .map(
        (part) =>
          `${id}'s ${part.part} ${part.x}–${part.right} past its cell ${cell.x}–${cell.right}`
      );
  const met = [
    ...meetings(read.cards, (one) => `card ${one.id}`),
    ...read.cards.flatMap((one) => [
      ...meetings(
        one.cells,
        (cell) => `${one.id}'s option at ${cell.x},${cell.y}`
      ),
      ...one.cells.flatMap((cell) => [
        ...meetings(cell.parts, (part) => `${one.id}'s ${part.part}`),
        ...outside(cell, one.id),
      ]),
    ]),
  ];
  kit.check(
    `${leg}: nothing overlaps: no two cards, options or parts of an option meet, and every part stands inside its option (${read.cards.map((one) => `${one.id} ${one.cells.length} options`).join(", ")})`,
    read.cards.length === 4 && met.length === 0,
    met.slice(0, 12).join("\n    ")
  );
}

/** 14. The real-size page at 1440, 680 and 390, in Chromium and WebKit. */
async function realSizeLegs(
  kit: Kit,
  stage: Awaited<ReturnType<typeof startDecisionStage>>
): Promise<void> {
  for (const engine of ["chromium", "webkit"] as const) {
    for (const at of REAL_WIDTHS) {
      const leg = `${engine} ${at.w}px, ${REAL_PAGE}`;
      const page = await openReal(kit, stage, engine, at);
      const read = await page.evaluate(readRealSize);
      await checkScale(kit, page, read, leg);
      checkPairs(kit, read, leg, at.w);
      const long = await readLong(page);
      kit.check(
        `${leg}: the long page scrolls inside its frame (${long?.atStart.content}px in a ${long?.atStart.shown}px frame, its cap ${long?.atStart.cap}px), the edge fade at its foot while more is below (${JSON.stringify(long?.atStart)}) and at its head once scrolled to its end (${JSON.stringify(long?.atEnd)})`,
        !!long &&
          long.atStart.content > long.atStart.shown + 1 &&
          long.atStart.h <= long.atStart.cap + 0.5 &&
          long.atStart.below &&
          !long.atStart.above &&
          long.atStart.mask !== "none" &&
          long.atEnd.above &&
          !long.atEnd.below &&
          long.atEnd.mask !== "none"
      );
      checkWhole(kit, read, leg);
      await page.close();
    }
  }
}

// --- 15. One Yjs per realm ----------------------------------------------------

const SHARED = "src/Shared.stories.js";
const SHARED_ID = idOf("shared-note");
const SHARED_PAIR_ID = idOf("shared-and-pinned");
const SHARED_PAGE = "shared";
/** What Yjs logs when a second copy of it loads into a realm (yjs src/index.js). */
const YJS_TWICE = /Yjs was already imported/;
/** Three Previews of a card that keeps its words in a Yjs doc: every story, one by name, and one beside a card that imports no Yjs. */
const SHARED_PROGRAM = [
  `root = Decisions("Shared notes", [shared])`,
  `shared = Decision("shared", "Which note card reads best?", [lone, reply], "Each card keeps its words in a shared document.", [every])`,
  `lone = Option("lone", "The note", "One line kept in the document.", true, [one], "Replies stand a click away.")`,
  `reply = Option("reply", "The reply", "A reply beside the pinned note.", false, [pair], "Two cards to read.")`,
  `every = Preview("${SHARED_ID}", "Every shared card")`,
  `one = Preview("${SHARED_ID}", "The note alone", ["Note"])`,
  `pair = Preview("${SHARED_PAIR_ID}", "The reply beside the pinned note", ["Reply", "Pinned"])`,
].join("\n");
/** `--leg one-yjs`: item 15 alone; `--leg loads-clean`: 13 alone; `--leg hubless`: 16 alone. */
const ONLY_LEG = process.argv.includes("--leg")
  ? process.argv[process.argv.indexOf("--leg") + 1]
  : undefined;

/**
 * What a realm ran of Yjs, read in it: whether a copy ran there (Yjs's own
 * word in the realm, `globalThis['__ $YJS$ __']`, which its module sets as
 * it loads, yjs src/index.js), whether the overlay runs there, and the Yjs
 * modules and overlay script it loaded.
 */
function realmYjs() {
  return {
    ran: (globalThis as Record<string, unknown>)["__ $YJS$ __"] === true,
    overlay: "cawcoArtifact" in window,
    loads: performance
      .getEntriesByType("resource")
      .map((one) => one.name)
      .filter(
        (name) => name.includes("yjs") || name.includes("__cawco/overlay")
      ),
  };
}

/**
 * Once every rest frame of a canvas has said how it drew, each shared card
 * it draws: whether its imports are there and Yjs's constructor checks
 * hold, and whether the overlay runs in its page; null until then. In the
 * canvas's page.
 */
function sharedMarks(): string[] | null {
  const rest = [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"]'
    ),
  ];
  const said = rest.every((one) =>
    ["drawn", "failed", "empty"].includes(
      one.querySelector<HTMLElement>(".cawco-frame-status")?.dataset.state ?? ""
    )
  );
  return rest.length > 0 && said
    ? [
        ...document.querySelectorAll<HTMLElement>(
          '.cawco-frame[data-cawco-interaction="rest"] [data-defined]'
        ),
      ].map(
        (one) =>
          `defined ${one.dataset.defined ?? ""}, overlay ${one.dataset.overlay ?? ""}`
      )
    : null;
}

/** Every console message on `page` or any of its frames that says Yjs loaded twice. */
const heardTwice = (page: Page): string[] => {
  const twice: string[] = [];
  page.on("console", (message) => {
    if (YJS_TWICE.test(message.text())) {
      twice.push(
        `[${message.type()}] ${message.text().slice(0, 160)} (${message.location().url})`
      );
    }
  });
  return twice;
};

/**
 * 15. The shared page in Chromium and WebKit: no realm logs a second Yjs;
 * the decision page runs none; each embed runs one, the project's, with the
 * overlay in it, every card drawing on it; on the stage's own port, the
 * same with no overlay.
 */
async function oneYjs(
  kit: Kit,
  stage: Awaited<ReturnType<typeof startDecisionStage>>
): Promise<void> {
  for (const engine of ["chromium", "webkit"] as const) {
    const leg = `${engine} 1440px light, ${SHARED_PAGE}`;
    const page = await kit.page("desk", { engine, theme: "light" });
    const twice = heardTwice(page);
    await page.goto(stage.pageUrl(SHARED_PAGE, "light"), { waitUntil: "load" });
    await page.waitForFunction(
      (selector) => document.querySelectorAll(selector).length === 3,
      EMBED_FRAME,
      { timeout: 60_000 }
    );
    const embeds: {
      caption: string;
      marks: string[] | null;
      realm: ReturnType<typeof realmYjs> | null;
    }[] = [];
    for (const handle of await page.$$(EMBED_FRAME)) {
      await handle.scrollIntoViewIfNeeded();
      const frame = await handle.contentFrame();
      const caption = await handle.evaluate(
        (el) =>
          el
            .closest("figure")
            ?.querySelector("[data-slot=media-caption]")
            ?.textContent?.trim() ?? ""
      );
      const marks = await frame
        ?.waitForFunction(sharedMarks, undefined, {
          timeout: STAGE_WAIT_MS,
          polling: 250,
        })
        .then(
          async (answer) => (await answer.jsonValue()) as string[],
          () => null
        );
      embeds.push({
        caption,
        marks: marks ?? null,
        realm: (await frame?.evaluate(realmYjs)) ?? null,
      });
    }
    await settle(page, 1000);
    const top = await page.evaluate(realmYjs);
    const said = embeds.map(
      ({ caption, marks, realm }) =>
        `“${caption}”: ${marks ? marks.join("; ") || "no shared card" : "nothing drawn"}; Yjs ran ${realm?.ran}, loaded ${realm?.loads.join(", ")}`
    );
    kit.check(
      `${leg}: no realm logs "Yjs was already imported", the page or its ${embeds.length} embeds (${twice.length} found)`,
      twice.length === 0,
      [...new Set(twice), ...said].join("\n    ")
    );
    kit.check(
      `${leg}: the decision page, which imports no Yjs, runs none, the overlay running there (Yjs ran ${top.ran}; overlay ${top.overlay}; loaded ${top.loads.join(", ")})`,
      !top.ran && top.overlay && top.loads.every((one) => !one.includes("yjs"))
    );
    kit.check(
      `${leg}: each embed runs one Yjs, the project's, the overlay in it bringing none, and every shared card draws on it with every member it imports there (${said.join("; ")})`,
      embeds.length === 3 &&
        embeds.every(
          ({ marks, realm }) =>
            !!realm?.ran &&
            realm.overlay &&
            !!marks &&
            marks.length > 0 &&
            marks.every((one) => one === "defined true, overlay true")
        ),
      said.join("\n    ")
    );
    await page.close();

    // The canvas on the stage's own port, as the daemon draws it (agent
    // stage-render.ts): no overlay, the project's own Yjs, once.
    const bare = await kit.page("desk", { engine, theme: "light" });
    const bareTwice = heardTwice(bare);
    await bare.goto(
      `http://127.0.0.1:${stage.stagePort}/@cawco/canvas?file=${encodeURIComponent(SHARED)}&by=stage`,
      { waitUntil: "load" }
    );
    const bareMarks = await bare
      .waitForFunction(sharedMarks, undefined, {
        timeout: STAGE_WAIT_MS,
        polling: 250,
      })
      .then(
        async (answer) => (await answer.jsonValue()) as string[],
        () => [] as string[]
      );
    await settle(bare, 1000);
    const bareRealm = await bare.evaluate(realmYjs);
    kit.check(
      `${engine}, the shared canvas on the stage's own port (as the daemon draws it): both cards draw on the project's own Yjs, run once, and nothing logs "Yjs was already imported" (cards ${bareMarks.join("; ") || "none drawn"}; Yjs ran ${bareRealm.ran}; ${bareTwice.length} found; loaded ${bareRealm.loads.join(", ")})`,
      bareMarks.length === 2 &&
        bareMarks.every((one) => one === "defined true, overlay false") &&
        bareRealm.ran &&
        bareTwice.length === 0,
      bareTwice.join("\n    ")
    );
    await bare.close();
  }
}

/** The dashboard's Needs you card: its sheet sends through artifact-doc.ts, which imports yjs, y-websocket and y-indexeddb. */
const NEEDS = "src/lib/cawco/home/NeedsCard.stories.ts";
const NEEDS_ID = idOf("needs-card");
const NEEDS_PAGE = "needs";
const NEEDS_PROGRAM = [
  `root = Decisions("The held post", [held])`,
  `held = Decision("held", "Does the held post read right?", [send, keep], "Its card is the dashboard's own.", [card])`,
  `send = Option("send", "Send it", "The post goes out as written.", true, [], "Nothing more is checked.")`,
  `keep = Option("keep", "Keep it held", "One more look first.", false, [], "The post waits a day.")`,
  `card = Preview("${NEEDS_ID}", "The Needs you card")`,
].join("\n");

/**
 * 15, on the dashboard's own stage (SvelteKit, its config's pre-bundling):
 * a decision page with the overlay embedding the Needs you card, whose
 * sheet imports the dashboard's artifact-doc.ts, in Chromium and WebKit;
 * no realm logs a second Yjs, the embed runs the dashboard's one Yjs with
 * the overlay in it, and the decision page runs none.
 */
async function oneYjsOnDashboard(kit: Kit): Promise<void> {
  const stage = await startDecisionStage(
    new Map([[NEEDS_PAGE, NEEDS_PROGRAM]]),
    { [NEEDS_ID]: [NEEDS] },
    { root: APP, kit: true },
    {},
    new Set([NEEDS_PAGE])
  );
  try {
    for (const engine of ["chromium", "webkit"] as const) {
      const leg = `${engine} 1440px light, the dashboard's ${NEEDS_PAGE} page`;
      const page = await kit.page("desk", { engine, theme: "light" });
      const twice = heardTwice(page);
      await page.goto(stage.pageUrl(NEEDS_PAGE, "light"), {
        waitUntil: "load",
      });
      const handle = await page.waitForSelector(EMBED_FRAME, {
        timeout: 60_000,
      });
      await handle.scrollIntoViewIfNeeded();
      const frame = await handle.contentFrame();
      const drawn = await frame
        ?.waitForFunction(
          () => {
            const rest = [
              ...document.querySelectorAll<HTMLElement>(
                '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status'
              ),
            ].map((one) => one.dataset.state ?? "");
            return rest.length > 0 && rest.every((one) => one === "drawn");
          },
          undefined,
          { timeout: STAGE_WAIT_MS * 2, polling: 250 }
        )
        .then(
          () => true,
          () => false
        );
      await settle(page, 1000);
      const realm = await frame?.evaluate(realmYjs);
      const top = await page.evaluate(realmYjs);
      kit.check(
        `${leg}: every card drawn, no realm logs "Yjs was already imported", the embed runs the dashboard's one Yjs with the overlay in it, and the decision page runs none (${twice.length} found; drawn ${drawn}; embed: Yjs ran ${realm?.ran}, overlay ${realm?.overlay}, loaded ${realm?.loads.join(", ")}; page: Yjs ran ${top.ran})`,
        drawn === true &&
          twice.length === 0 &&
          !!realm?.ran &&
          realm.overlay &&
          !top.ran,
        [...new Set(twice)].join("\n    ")
      );
      await page.close();
    }
  } finally {
    await stage.stop();
  }
}

/** The dashboard's connect asks: transcripts whose tool rows (ToolGroup) name each MCP server's site, over the real composer. */
const CONNECT = [
  "src/lib/cawco/transcript/ConnectAsk.stories.ts",
  "src/lib/cawco/transcript/ConnectCard.stories.ts",
  "src/lib/cawco/transcript/ConnectStrip.stories.ts",
] as const;
const CONNECT_IDS = CONNECT.map((_, i) => idOf(`connect-${i}`));
const CONNECT_PAGE = "connect";
const CONNECT_PROGRAM = [
  `root = Decisions("The connect ask", [ask])`,
  `ask = Decision("ask", "How should the agent ask for a sign-in?", [a, b, c], "Each is drawn by the dashboard's own components.")`,
  `a = Option("ask", "On the composer", "The ask grows out of it.", true, [pa], "It covers the composer.")`,
  `b = Option("card", "In the transcript", "A card where the agent asked.", false, [pb], "It can scroll away.")`,
  `c = Option("strip", "A strip", "One line on the composer.", false, [pc], "Little room for why.")`,
  `pa = Preview("${CONNECT_IDS[0]}", "On the composer", ["Asking", "Connected"])`,
  `pb = Preview("${CONNECT_IDS[1]}", "In the transcript", ["Asking", "Connected"])`,
  `pc = Preview("${CONNECT_IDS[2]}", "A strip", ["Asking", "Connected"])`,
].join("\n");
const API_PATH = /^\/api(?:\/|$)/;

/**
 * 16. An embed asks no origin for what it doesn't serve: a decision page
 * of the dashboard's three connect asks (each a transcript with its tool
 * rows over the real composer, under the stories' stand-in hub), on the
 * dashboard's own stage, in Chromium and WebKit: every canvas draws, no
 * frame requests `/api/*` of any origin (an embed's origin is a stage, which
 * serves components, not the hub's API), and the page and its frames log
 * no console error, answer no request with 400 or more and fail none.
 */
async function hublessOnDashboard(kit: Kit): Promise<void> {
  const stage = await startDecisionStage(
    new Map([[CONNECT_PAGE, CONNECT_PROGRAM]]),
    Object.fromEntries(CONNECT_IDS.map((id, i) => [id, [CONNECT[i]]])),
    { root: APP, kit: true }
  );
  try {
    for (const engine of ["chromium", "webkit"] as const) {
      const leg = `${engine} 1440px light, the dashboard's ${CONNECT_PAGE} page`;
      const page = await kit.page("desk", {
        engine,
        theme: "light",
        init: [CAWCO_BRIDGE],
      });
      const faults = faultsOf(page);
      const asked: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (API_PATH.test(url.pathname)) {
          asked.push(
            `${request.method()} ${url.href} (from ${request.frame().url()})`
          );
        }
      });
      await page.goto(stage.pageUrl(CONNECT_PAGE, "light"), {
        waitUntil: "load",
      });
      await page.waitForFunction(
        ({ n, selector }) => document.querySelectorAll(selector).length === n,
        { n: CONNECT.length, selector: EMBED_FRAME },
        { timeout: 60_000 }
      );
      const { embeds, undrawn } = await readEmbeds(page);
      await settle(page, 2000);
      const drawn = embeds.map(
        (one) =>
          `${one.file} ${one.frames.filter((f) => f.state === "drawn").length}/${one.frames.length}`
      );
      kit.check(
        `${leg}: its ${CONNECT.length} canvases draw every story they name (${drawn.join(", ")})`,
        undrawn.length === 0 &&
          embeds.length === CONNECT.length &&
          embeds.every(
            (one) =>
              one.frames.length === 2 &&
              one.frames.every((f) => f.state === "drawn")
          ),
        undrawn.join("\n    ")
      );
      kit.check(
        `${leg}: no frame asks any origin for /api/* (${asked.length} asked)`,
        asked.length === 0,
        [...new Set(asked)].slice(0, 12).join("\n    ")
      );
      kit.check(
        `${leg}: the page and its canvases log no console error, answer no request with 400 or more and fail none (${faults.length} found)`,
        faults.length === 0,
        [...new Set(faults)].slice(0, 12).join("\n    ")
      );
      await page.close();
    }
  } finally {
    await stage.stop();
  }
}

/** How long an embed of the shared page has to draw: its first load optimizes the fixture's dependencies. */
const STAGE_WAIT_MS = 120_000;

const spec: Spec = {
  name: "decision-embed",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every assertion in the order the spec's head lists them
  run: async (kit: Kit) => {
    for (const [name, program] of [
      [NAME, PROGRAM],
      [NAMED_PAGE, NAMED_PROGRAM],
      [PICTURED_PAGE, PICTURED_PROGRAM],
      [WORDED_PAGE, WORDED_PROGRAM],
      [REAL_PAGE, REAL_PROGRAM],
      [SHARED_PAGE, SHARED_PROGRAM],
      [GONE_PAGE, GONE_PROGRAM],
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
        [REAL_PAGE, REAL_PROGRAM],
        [SHARED_PAGE, SHARED_PROGRAM],
        [GONE_PAGE, GONE_PROGRAM],
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
        [SHARED_ID]: [SHARED],
        [SHARED_PAIR_ID]: [SHARED, NOTE],
      },
      { root: fixtureRoot(), kit: false },
      { [LONG_ID]: LONG_PAGE },
      new Set([SHARED_PAGE])
    );
    try {
      if (ONLY_LEG === "loads-clean") {
        await loadsClean(kit, stage);
        return;
      }
      if (ONLY_LEG === "one-yjs") {
        await oneYjs(kit, stage);
        await oneYjsOnDashboard(kit);
        return;
      }
      if (ONLY_LEG === "hubless") {
        await hublessOnDashboard(kit);
        return;
      }
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
          const reached = await readEmbeds(page);
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
          const back = await readEmbeds(page);
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

          // Then read again, the page as the person left it.
          const { embeds, undrawn } = await readEmbeds(page);
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
            `${leg}: every embed draws the stories its Preview names (${embeds.map((e) => `“${e.caption}” ${e.frames.map((f) => `${f.story} ${f.h}px`).join(" + ") || "none"}`).join("; ")})`,
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
          // Every story at its own size, never scaled: the side card's 360px and 1400px stories alike, its embed as wide as the widest.
          const sides = frames.filter(
            (f) => f.story === "Card" || f.story === "Wide"
          );
          const sizeFaults = sides.flatMap((f) => {
            const own = f.story === "Card" ? SIDE_W : WIDE_W;
            return f.zoom === 1 && Math.abs(f.w - own) <= 1
              ? []
              : [
                  `“${f.caption}” ${f.story}: ${f.w}px drawn at zoom ${f.zoom}, its own ${own}px`,
                ];
          });
          const sideEmbed = embeds.find((e) => e.caption === "The side card");
          kit.check(
            `${leg}: the side card's ${SIDE_W}px and ${WIDE_W}px stories each at their own size, zoom 1 (${sides.map((f) => `${f.story} ${f.w}px at zoom ${f.zoom}`).join(", ")}), its embed ${sideEmbed?.box.w}px wide, its widest story's`,
            sides.length === 2 &&
              sizeFaults.length === 0 &&
              !!sideEmbed &&
              Math.abs(sideEmbed.box.w - WIDE_W) <= 1,
            sizeFaults.join("\n    ")
          );
          // One embed at a time, scrolled to: a cross-origin frame off screen draws no frames.
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
          }
          const fades = await page.evaluate(readFades);
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
                  `“${f.caption}”: its fade ${f.len}px, the house's ${HOUSE_FADE}px`,
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
                    `“${f.caption}” at its ${one.place} (scrolled ${one.left}px): fades ${one.start}px and ${one.end}px, want ${want.start}px and ${want.end}px, mask ${one.mask.slice(0, 60)}`,
                  ]
                : [];
            }),
          ]);
          kit.check(
            `${leg}: a well that scrolls its picture sideways draws the house edge fade, ${HOUSE_FADE}px on every width, where more is hidden, none at either end (${fades.map((f) => `“${f.caption}”, ${f.len}px: ${f.at.map((one) => `${one.place} ${one.start}px|${one.end}px`).join(", ")}`).join("; ")})`,
            fades.length > 0 && fadeFaults.length === 0,
            fadeFaults.join("\n    ")
          );
          // Every story at its own size: its words as their own CSS says them, 12px and up.
          const small = frames.filter((f) => Math.round(f.type) < 12);
          kit.check(
            `${leg}: every embed's words readable as drawn, at their own size: 12px and up (smallest ${Math.min(...frames.map((f) => f.type))}px)`,
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
            `${leg}: the nine-node top-down chain is drawn as written at its natural size and fits its well, no scroll either way, centred in its well (${JSON.stringify(chain && { scale: chain.scale, smallest: chain.smallest, off: chain.off, scrolls: chain.scrolls })})`,
            !!chain &&
              chain.scale === 1 &&
              chain.scrolls[0] <= 0 &&
              chain.scrolls[1] <= 0 &&
              chain.off.every((o) => o <= 0.5)
          );
          kit.check(
            `${leg}: a diagram draws in the house's look: a node raised with the control's edge at 8px, its name in the label role in strong ink; an edge 1px in muted ink, its words in meta; a subgraph the recess with a hairline, its title in the label role, muted; at its natural size, centred in its well, or wider than it scrolling sideways under the edge fade (${JSON.stringify(staged && { scale: staged.scale, off: staged.off, scrolls: staged.scrolls, faded: staged.faded, node: staged.node, label: staged.label, edge: staged.edge, edgeWords: staged.edgeWords, cluster: staged.cluster, clusterTitle: staged.clusterTitle, want })})`,
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
              staged.scale === 1 &&
              (staged.scrolls[0] > 0
                ? staged.faded
                : staged.off.every((o) => o <= 0.5)) &&
              staged.scrolls[1] <= 0
          );
          const laid = await page.evaluate(readLayout);
          const inset = view === "desk" ? "21px" : "14px";
          const spread = (values: number[]) =>
            values.length ? Math.max(...values) - Math.min(...values) : 99;
          const column = columnFor(laid.page.room, laid.widest, view);
          kit.check(
            `${leg}: the page is one centred column ${column}px, its room's (${laid.page.room}px) at its widest picture's ${laid.widest}px pitch, ${inset} in, its groups 18px apart, on the recessed ground (${JSON.stringify(laid.page)})`,
            !!laid.page.box &&
              Math.abs(laid.page.box.w - column) <= 0.5 &&
              Math.abs(laid.page.box.x - (laid.page.room - column) / 2) <=
                0.5 &&
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
          // On a phone a well wider than the card reaches the screen's edges (`well-bleed`); every other stands on the card's edge.
          const edge = Math.min(
            ...(trio?.items ?? [])
              .filter((one) => one.w <= trio.show + 1)
              .map((one) => one.x)
          );
          const stacked =
            !!trio &&
            trio.items.map((one) => one.caption).join() === TRIO.join() &&
            trio.items.every(
              (one, at) =>
                (one.w <= trio.show + 1
                  ? Math.abs(one.x - edge) <= 1
                  : view === "phone" &&
                    Math.abs(one.x) <= 1 &&
                    Math.abs(one.x + one.w - laid.window.w) <= 1) &&
                (at === 0 || one.y > (trio.items[at - 1]?.y ?? 0))
            );
          kit.check(
            `${leg}: a card's three media stand in one column, one under another from the same edge, each well inside the card${view === "phone" ? " or reaching the screen's edges" : ""} (${trio ? `${trio.items.map((one) => `${one.w}px at ${one.x},${one.y}`).join(", ")} in ${trio.show}px` : "no card of three"})`,
            stacked,
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
            // opens read, then left empty it folds back as it was (no Done).
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
            await page.locator("#decision-ledger h2").first().click();
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
      await loadsClean(kit, stage);
      await realSizeLegs(kit, stage);
      await oneYjs(kit, stage);
      await oneYjsOnDashboard(kit);
      await hublessOnDashboard(kit);
    } finally {
      await stage.stop();
    }
  },
};

export default spec;
