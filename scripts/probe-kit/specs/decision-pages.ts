/**
 * Decision pages as OpenUI programs (Projects spec §5.8, the owner's picks
 * of 2026-10-18), on a scratch fleet (real hub, agent and sessiond; the
 * writer a Claude Code session against the mock model, its artifacts made
 * through the hub's artifact routes as artifact_create makes them) and the
 * built dashboard. Read from the engine: the panel frame's DOM and computed
 * styles, the page's doc (`window.cawcoArtifact.doc`) and the hub's reads.
 *
 *   bun scripts/probe-kit/run.ts decision-pages
 *   DECISION_PAGES=a PROBE_ENGINE=webkit bun scripts/probe-kit/run.ts decision-pages
 *
 * (a) A page of three decisions (one in a Section) and every media piece
 *     built (Image, Diagram, Canvas, Preview, Dials) draws in the panel's
 *     frame, in light and dark, at 390 and 1440: its cards, each piece
 *     there and loaded, and an overflow sweep that finds nothing past the
 *     frame's width; every control reaching 44px under a finger at 390
 *     (The 44 Touch Rule) and 24px under a mouse at 1440 (The 24 Pointer
 *     Rule); every DialKit value field in the meta role, tabular Figtree.
 * (b) A pick writes `state.<id>` with the program's hash; a Comment pin and
 *     an ink stroke anchor by the card's id; a revision (statements) that
 *     puts a decision ahead keeps the pin on its card, the ink on its
 *     options and the pick marked, and the next pick carries the new hash.
 * (c) The graph is derived: a card per decision, an edge per `after`, a
 *     frame per Section; a drag's place is kept in the page's state under
 *     `graph.places` and survives a revision; the Decisions tab's graph
 *     draws its cards and edges; the page live in the tab stands its Send
 *     picks bar above the docked composer and the foot fade's dissolve,
 *     no fade layer over the bar's box.
 * (d) A flowchart, a sequence diagram and a Gantt chart draw as Pele SVG on
 *     the house tokens in both themes; "Open as canvas" stands under the
 *     two types the converter draws as elements, never the Gantt, and opens
 *     a canvas in the panel.
 * (e) Make tasks reads the cards from the program and asks its session to
 *     file tasks carrying `decided: <page>#<card>`; a task filed so lands on
 *     its card in the record.
 * (f) An HTML decision page (a pick the person operates: a range) still
 *     works: its option's pick and its range's value are kept, and the
 *     Decisions tab reads its card from the built page.
 * (g) A press picks and the card stays open: the option marked, every
 *     option showing, no Continue, Change, Clear or fold (the owner: "The
 *     done and continue are useless buttons that break the flow of how this
 *     form should work"; a picked card "Stays open"); in light and dark, a
 *     picked card loads open with its pick marked and the hub's picks the
 *     same. A finger's tap on the artifact's own route picks and the card
 *     stays open; a tap on the chosen option clears it, and a tap on another
 *     moves the pick. At 320 a several-pick card of three long unbroken
 *     labels, all picked, stays inside its card. A click inside an option's
 *     embed reaches the embed and picks nothing.
 * (h) Draw and Comment land where the person makes them over an option's
 *     live embed: a loop that crosses into the embed keeps every move made
 *     inside it, and marks an element inside the embed; a Comment tap inside
 *     the embed anchors to the element under it there.
 * (i) Nothing published takes the hub down: a page whose option embeds a
 *     live preview, then a second and a third published right after it;
 *     the hub's pid stays, /health answers throughout, every page draws, and
 *     the hub's log holds no FOREIGN KEY line.
 * (j) The page's hero holds its title as an `h1` and no paragraph after it:
 *     the ask heads the panel, so the hero says nothing twice.
 * (k) A program whose option has no cost, whose card recommends two and
 *     whose card recommends none is refused on create, 422, every reason at
 *     once ("The program has 3 problems:"); the same cards as a revision of
 *     a kept page are refused alike and change nothing; a program with every
 *     cost, one recommended and a why per card is kept.
 * (l) Every page draws in the house faces: in a program's page and an HTML
 *     page, `document.fonts.check('500 13px "Figtree Variable"')` holds and
 *     the hero's heading measures as Figtree, not as the fallback stack.
 *     Figtree is served whole, so a program whose option's label holds
 *     "A → B" is kept and its → measures as Figtree's, not the fallback's;
 *     a label holding ✓ or ⌘ (Figtree lacks them, JetBrains Mono holds
 *     them) or ⎘ (neither face holds it) is refused, 422, naming its card,
 *     its string and the character, and the same program in words is kept.
 * (m) Every card shows the advisor's view, each option's trade-off and what
 *     picking it builds: the why reads "Recommended: <its label>. <why>";
 *     options whose program gives `builds` draw a Builds line in their card
 *     under the Costs line, on one row across the options, read in each
 *     pick's description; picked and decided, its record keeps each
 *     option's builds and its log.md says what the pick costs and builds;
 *     the same card without `builds` draws none, its cells the chip, line
 *     and cost rows alone.
 * (o) A reply arriving, as the desk (1440) and the phone (390) draw it,
 *     after a loop of ink the session hears and after a plain message from
 *     elsewhere: every frame from the first change to the transcript's rows
 *     less 500ms to the last plus 500ms. On Chromium, at 4x CPU throttle
 *     with a trace of that window, no layout is forced from a mount's sites
 *     (a helper's computed position read as it attached, the rendered check
 *     as it mounted, a folder tab's first measure, a session row's trailing
 *     width: `MOUNT_SITES`; the tabs' places measured ahead of the frame's
 *     layout) and no frame runs past 250ms; on WebKit and
 *     Firefox, which have no CPU throttle and no trace here, the frames are
 *     read and said.
 * (n) Interact and Draw, ten presses over the page's ink and comments, the
 *     first the moment a fresh loop of ink is drawn, while its picture is
 *     made: each reaches the page's mode under 300ms, no frame in the desk
 *     or the page waits 200ms (Chromium's long tasks, and on WebKit, which
 *     reports none, the gap between two frames), no animation a switch
 *     started is left going, and once the presses are done nothing runs
 *     on: no frame asked for, no animation.
 * (p) A page shows its delegation tree's artifacts as its own: the writer's
 *     page whose Canvas and Preview name its delegate's canvas and dev
 *     server preview publishes and draws both (the canvas's box in its doc,
 *     the dev server live on its embed origin); a page naming the canvas of
 *     a session outside the tree is refused, 422, with today's words.
 * (q) A delegate's page in its parent's panel is the parent's to read,
 *     comment on and send (one rule, the hub's `sees`): its Comments rail
 *     reads, a comment from the rail is in the delegate's comment_read, the
 *     delegate's reply draws in the rail, and the page's own Send and the
 *     dashboard's Send on the parent's session each reach the page (the
 *     delegate's artifact_read holds the picks, the delegate is told); a
 *     session outside the tree is refused the Send and the doc socket with
 *     today's words. With the rail's foot sheet open (a 507px pane at the
 *     desk, and 390), on Chromium and WebKit, the page's frame ends where the
 *     sheet begins, Send's box is clear of the sheet's, and a press at its
 *     centre sends. The page's thumbnail from the parent's panel is kept; an
 *     outsider's is refused with today's words.
 * (r) A dozen Previews of one heavy component canvas on one page all draw,
 *     in Chromium and in WebKit: the dashboard's own stage (decision-embeds.ts
 *     `startDecisionStage`, no fleet) drawing the Needs you card's states
 *     file, the canvas drawn once on the stage first, as a canvas the person
 *     was shown is (its modules then preloaded by every embed), each engine
 *     in a fresh context (nothing cached), each answer of the embed origin
 *     held {@link HEAVY_HOLD_MS} as the hops to a stage hold it. Every
 *     Preview stands at its drawn shape, none says "didn't load", and every
 *     story it names has a rest frame with a box past 0 by 0; and the page
 *     loaded them one at a time, each embed given its address only once the
 *     one before it had mounted its stories. The page is six cards tall, and
 *     scrolled to its middle the moment its last card stands: no picture out
 *     of view gets its turn while one in view still waits. Sampled every 50
 *     ms, a picture not yet drawn is never an empty box: its skeleton stands
 *     with a box, pulsing, and a take of one story stands as tall as its
 *     story, within 2px (on 2026-10-24 the owner's project-screens picture
 *     "In Review, its agent asking you" stood as an empty dark box while it
 *     waited its turn). On 2026-10-24 the owner's
 *     pairing page of twelve such Previews drew two: Chromium fails a
 *     renderer's requests past 2,700 in flight
 *     (`net::ERR_INSUFFICIENT_RESOURCES`), and the twelve asked for some
 *     7,500 modules at once; a page's canvases now load one at a time
 *     (dashboard decisions host embed-turns.ts), and an embed says its shape,
 *     which ends its turn, only once it drew (canvas runtime.ts `sayShape`;
 *     said at boot, 11 of these twelve began before the one before them
 *     drew, and caw-panel's 33 had ten say "didn't load").
 *
 *   DECISION_PAGES=embeds bun scripts/probe-kit/run.ts decision-pages
 *
 *     runs (r) alone, with no fleet.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Frame, Locator, Page } from "playwright-core";
import { PNG } from "pngjs";
import { readWithin } from "../../../packages/core/src/bounded";
import { HOUSE_FACES } from "../../../packages/core/src/house-faces";
import { markerTag } from "../../../packages/core/src/injected";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { commentWords } from "../../../packages/core/src/words/comments";
import { decisionsWords } from "../../../packages/core/src/words/decisions";
import type { CommentRead } from "../../../packages/hub/src/artifacts/service";
import { checkProgram } from "../../../packages/hub/src/decision-program";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  APP,
  CAWCO_BRIDGE,
  EMBED_FRAME,
  idOf,
  pageReach,
  STAGE_START_MS,
  startDecisionStage,
} from "../decision-embeds";
import {
  type Kit,
  type KitFleet,
  open,
  pressAt,
  pressIn,
  type Spec,
  settle,
} from "../kit";
import { pagePins } from "../pins";

const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
const NAME = "launch";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

/** sha256, hex: a page's hash as the overlay and the hub name it. */
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** The program as the hub keeps it: trimmed, one newline at its end. */
const kept = (program: string) => `${program.trim()}\n`;

const programOf = (ids: {
  canvas: string;
  tall: string;
  image: string;
  mockup: string;
  site: string;
}) => `root = Decisions("Shape the launch", [stack, host, later])
stack = Decision("stack", "Which stack does the launch page use?", [svelte, astro], "Today: the landing is plain HTML.", [shot, flow])
svelte = Option("svelte", "SvelteKit", "The dashboard's own stack.", true, [], "Heavier than the plain page it replaces.")
astro = Option("astro", "Astro", "Content first, islands where needed.", false, [seq], "A second stack to keep up.")
host = Decision("host", "Where does the page run?", [hub, edge], "It ships with the hub today.", [sketch, tallSketch, tune], ["stack"])
hub = Option("hub", "The hub", "Nothing new to run.", true, [], "Readers far from the hub wait longer.")
edge = Option("edge", "An edge host", "Closer to readers.", false, [motion], "One more host to run.")
later = Section("Later", [plan])
plan = Decision("plan", "When does the plan ship?", [now, after], "The waitlist opens with it.", [gantt, status, site], ["host"])
site = Preview("${ids.site}", "The site as it runs")
status = Row([Text("Ships with the waitlist", "meta"), Badge("Planned", "attn")])
now = Option("now", "With the page", "The waitlist opens with it.", true, [], "The page waits for the plan.")
after = Option("after", "A week after", "The page ships first.", false, [], "The waitlist opens without it.")
shot = Image("${ids.image}", "The landing as it stands: a title and one button", "Today's landing")
flow = Diagram("flowchart LR\\nVisit[Visit] --> Read[Read] --> Join[Sign up]", "The reader's path")
seq = Diagram("sequenceDiagram\\nReader->>Hub: open the page\\nHub-->>Reader: the page, live")
gantt = Diagram("gantt\\ntitle Launch\\ndateFormat YYYY-MM-DD\\nsection Build\\nPage :a1, 2026-10-20, 5d\\nShip :after a1, 2d", "The plan")
sketch = Canvas("${ids.canvas}", "The rough layout")
tallSketch = Canvas("${ids.tall}", "The steps, top to bottom")
motion = Preview("${ids.mockup}", "How it moves")
tune = Dials("Card", {radius: [12, 0, 32], accent: "#e65d46"})`;

/** A revision that puts a decision ahead of every other. */
const INSERT = `root = Decisions("Shape the launch", [audience, stack, host, later])
audience = Decision("audience", "Who is the page for?", [teams, solo], "Teams run the most machines.")
teams = Option("teams", "Teams", "Each seat a person.", true, [], "Solo builders read past it.")
solo = Option("solo", "Solo builders", "One person, many machines.", false, [], "Teams look elsewhere.")`;

/** A revision that rewords one decision. */
const REWORD = `host = Decision("host", "Where does the launch page run?", [hub, edge], "It ships with the hub today.", [sketch, tune], ["stack"])`;

const MOCKUP = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Motion</title>
<style>body{margin:0;font:16px system-ui}.box{margin:16px;padding:16px;border-radius:12px;background:#eee}
@media (prefers-reduced-motion:no-preference){.box{animation:slide 4s ease-out infinite}}
@keyframes slide{50%{transform:translateX(24px)}}</style></head>
<body><div class="box">A card that slides in</div>
<script>addEventListener("click", () => { document.body.dataset.clicked = "yes"; });</script></body></html>`;

/** An HTML decision page whose pick the person operates: a range, beside one card. */
const HTML_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Budget</title><style>{{KIT_CSS}}</style></head>
<body><main class="dp">
<header class="dp-hero"><div><h1>Set the budget</h1><p>Drag to the month's spend.</p></div></header>
<article class="dp-card" id="mode"><header><h2>How is spend capped?</h2><span class="dp-state" data-dp-state="mode">Not picked</span></header>
<div class="dp-opts" data-cawco-choice="mode" role="group" aria-label="How is spend capped?">
<button class="dp-opt" type="button" data-option="hard"><b>A hard cap</b><span>Work stops at it.</span></button>
<button class="dp-opt" type="button" data-option="soft"><b>A soft cap</b><span>You hear of it.</span></button>
</div>
<label>Monthly budget<input type="range" name="budget" min="0" max="100" value="20"></label>
</article></main><script>{{KIT_JS}}</script></body></html>`;

interface Doc {
  ink: Record<
    string,
    {
      anchor?: { frames?: string[]; selector?: string };
      over?: { frames?: string[]; selector: string }[];
      strokes?: { points: [number, number, number][] }[];
    }
  >;
  pins: Record<
    string,
    {
      anchor: { frames?: string[]; selector: string; text?: string };
      number: number;
    }
  >;
  state: Record<
    string,
    { options: string[]; pageHash: string; value: unknown }
  >;
}

const docOf = async (frame: Frame): Promise<Doc> => {
  const maps = await frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: { getMap: (name: string) => { toJSON: () => unknown } };
        };
      }
    ).cawcoArtifact;
    return {
      ink: doc.getMap("ink").toJSON(),
      state: doc.getMap("state").toJSON(),
    } as Omit<Doc, "pins">;
  });
  return { ...maps, pins: (await pagePins(frame)) as Doc["pins"] };
};

/** A press in Comment opens the comment's composer; its words, then Comment, write the pin (DESIGN.md, Placing a comment). */
const writeComment = async (desk: Page, words: string) => {
  const composer = desk.locator('[data-slot="pin-composer"]');
  await composer.waitFor({ timeout: 5000 });
  await composer.getByRole("combobox").fill(words);
  await composer.getByRole("button", { name: "Comment", exact: true }).click();
  await composer
    .waitFor({ state: "detached", timeout: 8000 })
    .catch(() => undefined);
};

/** A several-pick card of three long unbroken labels, picked whole: the folded line at its longest. */
const REACH_PAGE = `root = Decisions("Plan the reach", [reach])
reach = Decision("reach", "Which channels carry the launch?", [mail, feed, talk], "All three reach a different reader.", [], [], true)
mail = Option("mail", "Theweeklynewsletterthatgoestoeverysubscriber", "Readers who signed up.", true, [], "A week's wait.")
feed = Option("feed", "Thecompanyblogfeedandeverysyndicatedmirror", "Readers who follow us.", false, [], "Slow to spread.")
talk = Option("talk", "Thecommunityforumsannouncementsthreadpinned", "Readers who build with us.", false, [], "Needs replies.")`;

/** One card at 320: an option with a long unbroken label, a cost line and a live embed beside a plain one. */
const FIT_LABEL = "Anedgehostthatsitsclosertoeveryreaderonearthandneversleeps";
const FIT_COST =
  "One more host to run, and a second bill every month from its provider.";
const fitPage = (mockup: string) => `root = Decisions("Fit the phone", [fit])
fit = Decision("fit", "Which host carries the launch?", [wide, plain], "One card on the narrowest phone.")
wide = Option("wide", "${FIT_LABEL}", "Closer to readers.", true, [embed], "${FIT_COST}")
plain = Option("plain", "The hub", "Nothing new to run.", false, [], "Readers far from the hub wait longer.")
embed = Preview("${mockup}", "How it moves")`;

/** A card as the frame draws it: whether it stands open (every option showing, nothing folded), any of the old flow's controls, its options showing and marked, and where focus is. */
const cardOf = (frame: Frame, id: string) =>
  frame.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    const seen = (el: Element | null | undefined) =>
      !!el?.checkVisibility({ opacityProperty: true });
    const all = [
      ...(root?.querySelectorAll<HTMLElement>("[data-option]") ?? []),
    ];
    const active = document.activeElement as HTMLElement | null;
    return {
      open:
        all.length > 0 &&
        all.every(seen) &&
        !root?.hasAttribute("data-decided"),
      old: [
        ...(root?.querySelectorAll(
          "[data-continue], [data-clear], [data-change], [data-slot=decided], [data-slot=decision-foot]"
        ) ?? []),
      ].length,
      options: all.filter(seen).map((one) => one.dataset.option ?? ""),
      marked: [
        ...(root?.querySelectorAll<HTMLElement>("[data-cawco-picked]") ?? []),
      ].map((one) => one.dataset.option ?? ""),
      height: Math.round(root?.getBoundingClientRect().height ?? 0),
      focus: active?.dataset.option ?? "",
    };
  }, id);

/** Whether `selector` names an element inside the card `id`, on the page as drawn. */
const inCard = (frame: Frame, selector: string | undefined, id: string) =>
  frame.evaluate(
    ([named, card]) =>
      !!named && !!document.querySelector(named)?.closest(`#decision-${card}`),
    [selector ?? "", id] as const
  );

/** The frame `selector` names on `page`, once it is there; null until then. */
const frameAt = async (page: Page, selector: string): Promise<Frame | null> => {
  const handle = await page
    .locator(selector)
    .first()
    .elementHandle()
    .catch(() => null);
  return (await handle?.contentFrame()) ?? null;
};

/** How many of `selector` a frame holds; 0 while it is not there. */
const countIn = async (frame: Frame | null, selector: string) =>
  (await frame
    ?.locator(selector)
    .count()
    .catch(() => 0)) ?? 0;

/** The panel's frame once its page draws `cards` decision cards. */
const frameWith = async (page: Page, cards: number): Promise<Frame> =>
  (await until(
    `the panel's frame drawing ${cards} cards`,
    async () => {
      const frame = await frameAt(page, FRAME);
      return (await countIn(frame, "article[data-slot=decision]")) === cards
        ? frame
        : null;
    },
    Boolean,
    60_000
  )) as Frame;

/** What the sweep finds past the frame's width: elements whose box leaves it, outside a box that scrolls or clips its own. */
const overflowIn = (frame: Frame) =>
  frame.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = (el: Element): boolean => {
      for (let at = el.parentElement; at; at = at.parentElement) {
        const x = getComputedStyle(at).overflowX;
        if (x === "auto" || x === "scroll" || x === "hidden" || x === "clip") {
          return true;
        }
      }
      return false;
    };
    const past = [...document.body.querySelectorAll("*")].filter((el) => {
      if (
        el.closest("cawco-overlay, svg[data-cawco-ink], svg[data-cawco-pins]")
      ) {
        return false;
      }
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.right > width + 1 && !clipped(el);
    });
    return {
      scroll: document.documentElement.scrollWidth - width,
      past: past.slice(0, 6).map((el) => `${el.localName}.${el.className}`),
      count: past.length,
    };
  });

/**
 * Each Canvas piece's frame against its drawing (a canvas is its own box at
 * its real size, zoom 1): its box, its well's room and whether its well
 * scrolls it sideways, and the drawing's own bounds read from the canvas's doc
 * in its frame, padded by its fitted view's 32px as the canvas host pads them
 * (canvas-host scene.ts `sceneBox`).
 */
const canvasBoxes = (frame: Frame) =>
  frame.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLIFrameElement>(
        'iframe[src*="/__cawco/canvas/"]'
      ),
    ].map((el) => {
      const stage = el.closest("[data-slot=media-stage]");
      const s = stage?.getBoundingClientRect();
      const f = el.getBoundingClientRect();
      let scene: { width: number; height: number } | null = null;
      try {
        // The canvas host's own replica of the doc (canvas-host replica.ts).
        const doc = (
          el.contentWindow as unknown as {
            cawcoCanvasDoc?: {
              getArray: (name: string) => {
                toArray: () => { get: (key: string) => unknown }[];
              };
            };
          } | null
        )?.cawcoCanvasDoc;
        const els = (doc?.getArray("elements").toArray() ?? [])
          .map(
            (one) =>
              one.get("el") as {
                height: number;
                isDeleted?: boolean;
                width: number;
                x: number;
                y: number;
              }
          )
          .filter((one) => one && !one.isDeleted);
        if (els.length > 0) {
          const left = Math.min(...els.map((one) => one.x));
          const top = Math.min(...els.map((one) => one.y));
          const right = Math.max(...els.map((one) => one.x + one.width));
          const bottom = Math.max(...els.map((one) => one.y + one.height));
          scene = { width: right - left, height: bottom - top };
        }
      } catch {
        scene = null;
      }
      return {
        caption:
          el
            .closest("figure")
            ?.querySelector("[data-slot=media-caption]")
            ?.textContent?.trim() ?? "",
        box: { w: f.width, h: f.height },
        room: s?.width ?? 0,
        wide: stage?.hasAttribute("data-wide") ?? false,
        picture: stage?.closest("figure")?.getAttribute("data-picture") ?? null,
        off: s ? Math.abs(s.left + s.width / 2 - (f.left + f.width / 2)) : 99,
        scene,
      };
    })
  );

/** Each media piece as the frame draws it. */
const mediaIn = (frame: Frame) =>
  frame.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>("figure img");
    if (img && !img.complete) {
      await new Promise((resolve) =>
        img.addEventListener("load", resolve, { once: true })
      );
    }
    const canvas = document.querySelector<HTMLIFrameElement>(
      'iframe[src*="/__cawco/canvas/"]'
    );
    const preview = document.querySelector<HTMLIFrameElement>(
      'iframe[src*="/__cawco/page/"]'
    );
    return {
      image: img?.naturalWidth ?? 0,
      diagrams: [
        ...document.querySelectorAll("[data-slot=diagram] svg.pele"),
      ].map((svg) => svg.getAttribute("class") ?? ""),
      canvas: !!canvas?.contentDocument?.querySelector(".excalidraw canvas"),
      preview: preview?.contentDocument?.body?.textContent?.trim() ?? "",
      dials: document.querySelectorAll(".dialkit-root .dialkit-panel").length,
      // Each DialKit panel stands in its card, in a well (decisions/host
      // Dials.svelte), and nothing of DialKit's floats over the page.
      dialsInline: [
        ...document.querySelectorAll<HTMLElement>(".dialkit-root"),
      ].every(
        (root) =>
          !!root.closest("[data-slot=decision] [data-slot=media]") &&
          [root, ...root.querySelectorAll<HTMLElement>("*")].every(
            (el) => getComputedStyle(el).position !== "fixed"
          )
      ),
      // Each DialKit value field in the meta role, tabular Figtree (host.css):
      // its face, size and figures as drawn, beside the size it should be:
      // the meta role's, or for an <input> the house's field floor where
      // that holds (design.css `@layer overrides`: under `max-phone`, below
      // theme.css's 640px `--breakpoint-phone`, or a coarse pointer).
      dialValues: (() => {
        // Each token resolved to px on a probe in the page.
        const px = (token: string) => {
          const probe = document.createElement("span");
          probe.style.fontSize = `var(${token})`;
          document.body.append(probe);
          const size = Number.parseFloat(getComputedStyle(probe).fontSize);
          probe.remove();
          return size;
        };
        const meta = px("--text-meta");
        const floor = px("--text-field-floor");
        const floored =
          matchMedia("(width < 640px)").matches ||
          matchMedia("(pointer: coarse)").matches;
        return [
          ...document.querySelectorAll<HTMLElement>(
            ".dialkit-root :is(.dialkit-slider-value, .dialkit-slider-input, .dialkit-pad-value, .dialkit-color-value, .dialkit-color-css-input)"
          ),
        ].map((el) => {
          const s = getComputedStyle(el);
          return {
            field: el.className.split(" ")[0] ?? "",
            face: s.fontFamily.split(",")[0]?.trim() ?? "",
            size: s.fontSize,
            want: `${el.localName === "input" && floored ? Math.max(meta, floor) : meta}px`,
            figures: s.fontVariantNumeric,
          };
        });
      })(),
      faces: [...document.fonts]
        .filter((face) => face.status === "loaded")
        .map((face) => face.family),
      row: (() => {
        const row = document.querySelector("#decision-plan [data-slot=stack]");
        const words = row?.querySelector("[data-slot=text]");
        const badge = row?.querySelector("[data-slot=badge]");
        const rowStyle = row ? getComputedStyle(row) : null;
        const probe = document.createElement("span");
        probe.style.columnGap = "var(--space-3)";
        probe.style.display = "flex";
        document.body.append(probe);
        const space = getComputedStyle(probe).columnGap;
        probe.remove();
        return {
          space,
          display: rowStyle?.display,
          direction: rowStyle?.flexDirection,
          wrap: rowStyle?.flexWrap,
          gap: rowStyle?.columnGap,
          font: words ? getComputedStyle(words).fontFamily : "",
          badge: badge ? getComputedStyle(badge).backgroundColor : "",
        };
      })(),
      opens: [
        ...document.querySelectorAll(
          "[data-slot=media]:has([data-slot=diagram])"
        ),
      ].map((figure) => !!figure.querySelector("[data-open-canvas]")),
      theme: document.documentElement.dataset.theme ?? "",
      site:
        document.querySelector<HTMLIFrameElement>(
          "#decision-plan iframe[data-shape=screen]"
        )?.src ?? "",
    };
  });

/** The words of the frame at `src` inside the page: an embedded preview on an origin of its own. */
const wordsAt = async (page: Page, src: string): Promise<string> => {
  if (!src) {
    return "";
  }
  const { origin } = new URL(src);
  const frame = page.frames().find((one) => one.url().startsWith(origin));
  return frame
    ? ((await frame
        .locator("h1")
        .textContent({ timeout: 2000 })
        .catch(() => "")) ?? "")
    : "";
};

/** A node's fill against the house token it is drawn in, in the frame's theme now. */
const diagramInk = (frame: Frame) =>
  frame.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--surface-raised)";
    document.body.append(probe);
    const surface = getComputedStyle(probe).color;
    probe.style.color = "var(--ink-strong)";
    const ink = getComputedStyle(probe).color;
    probe.remove();
    const node = document.querySelector(
      "[data-slot=diagram] svg.pele .pele-node :is(rect, path, polygon)"
    );
    const label = document.querySelector(
      "[data-slot=diagram] svg.pele .pele-label, [data-slot=diagram] svg.pele text"
    );
    return {
      surface,
      ink,
      fill: node ? getComputedStyle(node).fill : "",
      text: label ? getComputedStyle(label).fill : "",
    };
  });

/** The pane's mode by its head's segment (V, C, D), once the page has heard it. */
const mode = async (page: Page, frame: Frame, key: "V" | "C" | "D") => {
  const want = { V: "", C: "comment", D: "draw" }[key];
  const modeNow = () =>
    frame.evaluate(() => {
      const layer = document
        .querySelector("cawco-overlay")
        ?.shadowRoot?.querySelector(".layer");
      if (layer?.classList.contains("comment")) {
        return "comment";
      }
      return layer?.classList.contains("draw") ? "draw" : "";
    });
  // Already in it (an Escape out of Draw or Comment is Interact again): no
  // press, which a segment already chosen takes as nothing.
  if ((await modeNow()) !== want) {
    await page
      .locator(`${PANE} [role='tab'][aria-keyshortcuts='${key}']`)
      .click();
  }
  await until(`the page's mode ${key}`, modeNow, (now) => now === want, 5000);
};

const DIAGRAM_TYPES = ["flowchart", "sequence", "gantt"] as const;
/** A Pele root's diagram type, from its class (`pele pele-flowchart`). */
const typeOf = (classes: string) =>
  DIAGRAM_TYPES.find((type) => classes.includes(`pele-${type}`));

/** What every proof shares: the fleet, the writer, the desk's page and what the pages said. */
interface On {
  base: string;
  desk: Page;
  fleet: KitFleet;
  /** The hub's process, as the fleet launched it. */
  hub: ReturnType<KitFleet["launch"]>;
  kit: Kit;
  mockup: string;
  page: string;
  program: string;
  projectId: string;
  read: () => Promise<{ pageHash: string; state: Doc["state"] }>;
  said: string[];
  /** The dev server's preview artifact, which the pages embed. */
  site: string;
  writer: string;
}

/** The fleet up, a project, its writer, the desk on the writer's session. */
const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  const hub = fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const dir = join(fleet.sandbox, "launch-site");
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Launch",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", "Shape the launch", dir, {
    projectId,
  });
  const desk = await kit.page("desk", { theme: "light" });
  const said: string[] = [];
  desk.on("pageerror", (error) => said.push(String(error)));
  await open(desk, `${base}/session/${writer}`, '[data-slot="pane"]');
  return { base, desk, fleet, hub, projectId, said, writer };
};

/**
 * The media's artifacts (a canvas drawn from Mermaid on the panel's screen,
 * an HTML mockup, a picture on the machine), then the decision page over
 * them, published from its program.
 */
const publish = async (
  kit: Kit,
  up: Awaited<ReturnType<typeof standUp>>
): Promise<On> => {
  const { desk, fleet, said, writer } = up;
  const make = <T>(body: object) =>
    fleet.api<T>(`/api/instances/${writer}/artifacts`, body);
  // Empty first: its host page loads in the panel (the hub bundles it on the
  // first ask), then its Mermaid is drawn on that screen.
  const canvas = await make<{ id: string }>({
    kind: "canvas",
    does: "draw",
    ask: "Draw on this canvas",
    name: "launch-sketch",
  });
  await until(
    "the canvas's screen in the panel",
    async () =>
      countIn(
        await frameAt(desk, 'iframe[title="Canvas"]'),
        ".excalidraw canvas"
      ),
    (count) => count > 0,
    120_000
  );
  const drew = await fetch(
    `${fleet.base}/api/instances/${writer}/artifacts/${canvas.id}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mermaid: "flowchart LR\nHero --> Proof --> Join",
      }),
    }
  );
  kit.check(
    "the canvas is drawn from Mermaid on its screen",
    drew.ok,
    (await drew.text()).slice(0, 300)
  );
  // A second drawing of the other shape: taller than it is wide, drawn once
  // its screen is up in the panel, as the first.
  const tall = await make<{ id: string }>({
    kind: "canvas",
    does: "draw",
    ask: "Draw the steps",
    name: "launch-steps",
  });
  await until(
    "the tall canvas's screen in the panel",
    async () =>
      countIn(
        await frameAt(desk, 'iframe[title="Canvas"]'),
        ".excalidraw canvas"
      ),
    (count) => count > 0,
    120_000
  );
  const drewTall = await fetch(
    `${fleet.base}/api/instances/${writer}/artifacts/${tall.id}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mermaid: "flowchart TD\nWrite --> Check --> Merge --> Ship",
      }),
    }
  );
  kit.check(
    "the tall canvas is drawn from Mermaid",
    drewTall.ok,
    (await drewTall.text()).slice(0, 300)
  );
  const mockup = await make<{ id: string }>({
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "launch-motion",
    html: MOCKUP,
  });
  const pictures = join(fleet.sandbox, "pictures");
  mkdirSync(pictures, { recursive: true });
  const png = new PNG({ width: 64, height: 40 });
  png.data.fill(200);
  const image = join(pictures, "landing.png");
  writeFileSync(image, PNG.sync.write(png));
  // A dev server on the machine's host, shown as a preview of its port.
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        "<!doctype html><html><body><h1>The live site</h1></body></html>",
        { headers: { "content-type": "text/html" } }
      ),
  });
  const site = await make<{ id: string }>({
    kind: "preview",
    does: "try",
    ask: "Try this page and say whether it works",
    name: "launch-site",
    port: server.port,
    machine: MACHINE,
  });
  const program = programOf({
    canvas: canvas.id,
    tall: tall.id,
    mockup: mockup.id,
    image,
    site: site.id,
  });
  const made = await make<{ decisions?: string[]; id: string }>({
    kind: "page",
    does: "pick",
    ask: "Pick one option on each card",
    name: NAME,
    program,
  });
  kit.check(
    "the page publishes from its program, naming its decisions",
    JSON.stringify(made.decisions) ===
      JSON.stringify(["stack", "host", "plan"]),
    JSON.stringify(made)
  );
  return {
    ...up,
    kit,
    mockup: mockup.id,
    page: made.id,
    program,
    read: () =>
      fleet.api<{ pageHash: string; state: Doc["state"] }>(
        `/api/instances/${writer}/artifacts/${made.id}`
      ),
    said,
    site: site.id,
  };
};

/** (a) and (d) at one width and theme: every piece, no overflow, Pele on the tokens. */
const mediaLeg = async (
  on: On,
  view: "desk" | "phone",
  theme: "light" | "dark"
) => {
  const { kit } = on;
  const leg = `${view === "desk" ? 1440 : 390} ${theme}`;
  const shown = await kit.page(view, { theme });
  shown.on("pageerror", (error) =>
    on.said.push(
      `${leg}: ${String(error)} ${error.stack?.split("\n").slice(1, 4).join(" ")}`
    )
  );
  await open(shown, `${on.base}/session/${on.writer}`, '[data-slot="pane"]');
  const frame = await frameWith(shown, 3).catch(() => null);
  if (!frame) {
    kit.check(
      `(a) ${leg}: the page draws its three cards in the panel's frame`,
      false,
      "no frame with 3 cards"
    );
    await shown.close();
    return;
  }
  await until(
    `${leg}: every piece drawn`,
    () => mediaIn(frame),
    (m) =>
      m.image > 0 &&
      m.diagrams.length === 3 &&
      m.canvas &&
      m.preview.includes("slides") &&
      m.dials > 0 &&
      m.faces.length > 0,
    30_000
  ).catch(() => undefined);
  await settle(shown, 400);
  const media = await mediaIn(frame);
  // The frame the canvas's own fit fills at zoom 1: the drawing and its
  // fitted view's 32px margin each side (canvas-host scene.ts `sceneBox`).
  const fitted = (one: Awaited<ReturnType<typeof canvasBoxes>>[number]) => {
    if (!one.scene) {
      return null;
    }
    const m = 32;
    return { w: one.scene.width + 2 * m, h: one.scene.height + 2 * m };
  };
  // Read once each canvas's frame has taken its drawing's size: the canvas
  // says its size once its scene is drawn, and the frame stands at its
  // placeholder until then.
  const canvases = await until(
    `${leg}: each canvas sized from its drawing`,
    () => canvasBoxes(frame),
    (all) =>
      all.length === 2 &&
      all.every((one) => {
        const want = fitted(one);
        return (
          !!want &&
          Math.abs(one.box.w - want.w) <= 1 &&
          Math.abs(one.box.h - want.h) <= 1 &&
          one.wide === one.box.w > one.room + 0.5
        );
      }),
    30_000
  ).catch(() => canvasBoxes(frame));
  const shapes = canvases.map((one) => ({ ...one, want: fitted(one) }));
  kit.check(
    `(a) ${leg}: each canvas is its drawing's own box at its real size, centred in its well or, wider than it, scrolling sideways in it, a wide one and a tall one (${shapes.map((one) => `“${one.caption}” ${Math.round(one.box.w)}×${Math.round(one.box.h)}, its drawing ${one.scene ? `${Math.round(one.scene.width)}×${Math.round(one.scene.height)}` : "unread"}`).join("; ")})`,
    shapes.length === 2 &&
      shapes.some((one) => one.box.w > one.box.h) &&
      shapes.some((one) => one.box.h > one.box.w) &&
      shapes.every(
        (one) =>
          !!one.want &&
          Math.abs(one.box.w - one.want.w) <= 1 &&
          Math.abs(one.box.h - one.want.h) <= 1 &&
          one.wide === one.box.w > one.room + 0.5 &&
          (one.wide || one.off <= 0.5)
      ),
    JSON.stringify(shapes)
  );
  const site = await until(
    `${leg}: the dev server live in the plan card`,
    () => wordsAt(shown, media.site),
    (words) => words === "The live site",
    30_000
  ).catch(() => "");
  kit.check(
    `(a) ${leg}: Preview shows a dev server's preview live, on an origin of its own`,
    site === "The live site" &&
      new URL(media.site || "http://x").port !== new URL(frame.url()).port,
    JSON.stringify({
      src: media.site,
      site,
      frames: shown.frames().map((one) => one.url().slice(0, 80)),
      hub:
        site === "The live site"
          ? ""
          : (await on.fleet.logs("hub"))
              .split("\n")
              .filter(
                (line) => line.includes("embed-") || line.includes("[preview]")
              )
              .slice(-6)
              .join(" | "),
    })
  );
  kit.check(
    `(a) ${leg}: three cards, the picture loaded, three diagrams, the canvas live, the mockup live, the DialKit panel up in its card's well with nothing fixed over the page, in the host's theme`,
    media.image === 64 &&
      media.diagrams.length === 3 &&
      media.canvas &&
      media.preview.includes("slides") &&
      media.dials === 1 &&
      media.dialsInline &&
      media.theme === theme,
    JSON.stringify(media)
  );
  kit.check(
    `(a) ${leg}: every DialKit value field in the meta role, tabular Figtree, never DialKit's Geist Mono, a field at the house's 16px floor where it holds (${media.dialValues.map((one) => `${one.field} ${one.face} ${one.size} of ${one.want} ${one.figures}`).join(", ")})`,
    media.dialValues.length > 0 &&
      media.dialValues.every(
        (one) =>
          one.face.includes("Figtree") &&
          one.size === one.want &&
          one.figures === "tabular-nums"
      ),
    JSON.stringify(media.dialValues)
  );
  kit.check(
    `(a) ${leg}: the house faces loaded in the page, and a Row of Text and a Badge drawn on the host's own styles`,
    media.faces.some((family) => family.includes("Figtree")) &&
      media.row.display === "flex" &&
      media.row.direction === "row" &&
      media.row.wrap === "wrap" &&
      media.row.gap === media.row.space &&
      media.row.font.includes("Figtree") &&
      media.row.badge !== "" &&
      media.row.badge !== "rgba(0, 0, 0, 0)",
    JSON.stringify({ faces: media.faces, row: media.row })
  );
  const hero = await frame.evaluate(() => {
    const head = document.querySelector("[data-slot=page-head]");
    return {
      h1: head?.querySelector("h1")?.textContent ?? null,
      after: head?.querySelectorAll("h1 ~ p, h1 ~ * p").length ?? -1,
      paragraphs: head?.querySelectorAll("p").length ?? -1,
    };
  });
  kit.check(
    `(j) ${leg}: the hero has its h1 and no p after it`,
    hero.h1 === "Shape the launch" && hero.after === 0 && hero.paragraphs === 0,
    JSON.stringify(hero)
  );
  const sweep = await overflowIn(frame);
  kit.check(
    `(a) ${leg}: the overflow sweep finds nothing past the frame's width`,
    sweep.count === 0 && sweep.scroll <= 0,
    JSON.stringify(sweep)
  );
  const types = media.diagrams.map(typeOf);
  const ink = await diagramInk(frame);
  kit.check(
    `(d) ${leg}: a flowchart, a sequence diagram and a Gantt chart drawn by Pele, its nodes raised on surface-raised (DESIGN.md: content sits raised on its well) and its words in ink-strong`,
    JSON.stringify(types.toSorted()) ===
      JSON.stringify(["flowchart", "gantt", "sequence"]) &&
      ink.fill === ink.surface &&
      ink.text === ink.ink,
    `${JSON.stringify(media.diagrams)} ${JSON.stringify(ink)}`
  );
  kit.check(
    `(d) ${leg}: Open as canvas under the flowchart and the sequence diagram, never the Gantt`,
    JSON.stringify(types.map((type, at) => [type, media.opens[at]])) ===
      JSON.stringify([
        ["flowchart", true],
        ["sequence", true],
        ["gantt", false],
      ]),
    JSON.stringify({ diagrams: media.diagrams, opens: media.opens })
  );
  // Every control of the page in the panel's frame, each piece's own
  // (Open as canvas, Open to draw, the Dials controls) among them, a window
  // at a time (decision-embeds.ts `pageReach`): under a finger each one's
  // area reaches 44px (The 44 Touch Rule); at a desk 24px, drawn so or
  // through its hit area (The 24 Pointer Rule); nothing spills.
  const reach = await pageReach(frame);
  const short = reach.controls.filter((one) =>
    view === "phone" ? !one.touch : !one.pointer
  );
  kit.check(
    `(a) ${leg}: every control reaches ${view === "phone" ? "44px under a finger" : "24px under a mouse"} and nothing spills (${reach.controls.length} controls: ${reach.controls.map((one) => `${one.name.slice(0, 40)} ${one.w}×${one.h}`).join(", ")})`,
    reach.controls.some((one) => one.name.includes("Open to draw")) &&
      short.length === 0 &&
      reach.spills.length === 0,
    [...short.map((one) => one.line), ...reach.spills].join("\n    ")
  );
  await shown.close();
};

/** The moves a loop is drawn by: its press and four sides of 20 steps each. */
const LOOP_MOVES = 81;

/** A loop drawn by the mouse round `box` (the screen's px), outside it by 8px. */
const loopRound = async (
  frame: Frame,
  box: { height: number; width: number; x: number; y: number }
) => {
  const page = frame.page();
  await pressAt(frame, { x: box.x - 8, y: box.y - 8 }, { how: "down" });
  for (const [x, y] of [
    [box.x + box.width + 8, box.y - 8],
    [box.x + box.width + 8, box.y + box.height + 8],
    [box.x - 8, box.y + box.height + 8],
    [box.x - 8, box.y + 4],
  ] as const) {
    await page.mouse.move(x, y, { steps: 20 });
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
};

/** (b) before the revision: a pick with the program's hash, a pin and a loop of ink by card id. */
const marks = async (on: On, frame: Frame) => {
  const { desk, kit } = on;
  await mode(desk, frame, "V");
  await pressIn(frame, '[data-option="astro"] >> nth=0');
  const picked = await until(
    "the pick on the hub",
    on.read,
    (r) => (r.state.stack?.options ?? []).includes("astro"),
    10_000
  ).catch(() => null);
  const first = sha256(kept(on.program));
  const chosen = await until(
    "the stack card holding astro",
    () => cardOf(frame, "stack"),
    (card) => JSON.stringify(card.marked) === '["astro"]',
    10_000
  ).catch(() => null);
  kit.check(
    "(g) a press picks: astro marked, the card open with both options showing, no Continue, Change, Clear or fold",
    !!chosen &&
      chosen.open &&
      chosen.old === 0 &&
      JSON.stringify([...chosen.options].sort()) === '["astro","svelte"]',
    JSON.stringify(chosen)
  );
  kit.check(
    "(b) a pick writes state.stack with the program's hash",
    !!picked &&
      JSON.stringify(picked.state.stack?.options) === '["astro"]' &&
      picked.state.stack?.pageHash === first &&
      picked.pageHash === first,
    JSON.stringify(
      picked && { stack: picked.state.stack, pageHash: picked.pageHash, first }
    )
  );

  await mode(desk, frame, "C");
  await pressIn(frame, "#decision-stack h2 >> nth=0");
  await writeComment(desk, "This stack, not the other.");
  const pinned = await until(
    "pin 1 in the doc, with its words",
    () => docOf(frame),
    (d) =>
      Object.values(d.pins).some(
        (one) =>
          one.number === 1 &&
          ((one as { thread?: unknown[] }).thread ?? []).length > 0
      ),
    10_000
  ).catch(() => null);
  const pin =
    pinned && Object.values(pinned.pins).find((one) => one.number === 1);
  kit.check(
    "(b) a Comment pin on the stack card anchors by the card's id",
    !!pin?.anchor.selector.includes("#decision-stack"),
    JSON.stringify(pin?.anchor)
  );
  await desk.keyboard.press("Escape");

  await mode(desk, frame, "D");
  // Round the hub's chip: a stroke over the edge option's live embed is the embed's (its frame takes the pointer).
  const options = frame.locator('#decision-host [data-option="hub"]');
  // The chip stands as tall as its cell (the edge option's embed beside it): at the pane's top, so the whole loop is drawn on the page.
  await toPaneTop(options);
  await settle(desk, 300);
  const box = await options.boundingBox();
  if (box) {
    await loopRound(frame, box);
  }
  const inked = await until(
    "the ink group in the doc",
    () => docOf(frame),
    (d) => Object.keys(d.ink).length > 0,
    10_000
  ).catch(() => null);
  const [group] = inked ? Object.values(inked.ink) : [];
  kit.check(
    "(b) an ink loop round the host card's hub option keeps every move and anchors inside that card",
    (group?.strokes?.[0]?.points.length ?? 0) >= LOOP_MOVES &&
      (await inCard(frame, group?.anchor?.selector, "host")),
    JSON.stringify({
      anchor: group?.anchor,
      loop: box,
      points: (group?.strokes ?? []).map((one) => one.points.length),
      over: (group?.over ?? []).map((one) => one.selector),
    })
  );
  await desk.keyboard.press("Escape");
  await mode(desk, frame, "V");
  return first;
};

/** (g) An option's media is live: a click inside the edge option's embed reaches the embed and picks nothing. */
const embedLeg = async (on: On, frame: Frame) => {
  const { desk, kit } = on;
  await mode(desk, frame, "V");
  // An embed out of view gets no animation frames, and pressIn waits on two.
  await frame.locator(EMBED).first().scrollIntoViewIfNeeded();
  await pressIn(frame.frameLocator(EMBED).first(), "body");
  const heard = await until(
    "the embed heard the click",
    () =>
      frame.evaluate(() => ({
        clicked:
          document.querySelector<HTMLIFrameElement>(
            "#decision-host [data-slot=option-media] iframe"
          )?.contentDocument?.body?.dataset.clicked ?? "",
        marked: document
          .querySelector('[data-option="edge"]')
          ?.hasAttribute("data-cawco-picked"),
        inPick: !!document.querySelector(
          '[data-option="edge"] iframe, [data-option] [data-slot=option-media]'
        ),
      })),
    (seen) => seen.clicked === "yes",
    10_000
  ).catch(() => null);
  await settle(desk, 600);
  const { state } = await on.read();
  kit.check(
    "(g) a click inside an option's embed reaches the embed and picks nothing: no pick on the card, the option unmarked, the embed outside the pick",
    heard?.clicked === "yes" &&
      heard.marked === false &&
      !heard.inPick &&
      (state.host?.options ?? []).length === 0,
    JSON.stringify({ heard, host: state.host ?? null })
  );
};

/** The edge option's live embed, in the panel's frame. */
const EMBED = "#decision-host [data-slot=option-media] iframe";

/** What a page anchor names, as `[frames, selector]`, resolved in the panel's frame: its box in that frame's viewport, whether it stands in a frame, and its class. */
interface Named {
  frames?: string[];
  selector: string;
}
const resolveIn = (frame: Frame, anchors: Named[]) =>
  frame.evaluate((all) => {
    const resolve = ({ frames = [], selector }: Named) => {
      let doc: Document | null = document;
      let dx = 0;
      let dy = 0;
      for (const one of frames) {
        const holder: HTMLIFrameElement | null =
          doc?.querySelector<HTMLIFrameElement>(one) ?? null;
        if (!holder) {
          return null;
        }
        const r = holder.getBoundingClientRect();
        dx += r.left + holder.clientLeft;
        dy += r.top + holder.clientTop;
        doc = holder.contentDocument;
      }
      const el = doc?.querySelector(selector);
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        x: r.left + dx,
        y: r.top + dy,
        w: r.width,
        h: r.height,
        inFrame: frames.length > 0,
        className: el.className,
      };
    };
    return all.map(resolve);
  }, anchors);

/**
 * `target` at the top of the page's viewport, 40px down: all of it inside
 * the pane (a stroke past the pane's edge is the dashboard's, never the
 * page's) and clear of the Dials panel, which floats at the viewport's foot
 * over whatever is there.
 */
const toPaneTop = (target: Locator) =>
  target.evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    // Back 40px in what scrolls the page: a decision page's cards scroll in its first row.
    (
      el.closest("[data-slot=page-scroll]") ?? document.documentElement
    ).scrollBy(0, -40);
  });

/** What the page shows topmost at the middle of `box` (the desk's px), seen through the overlay. */
const topAt = async (
  desk: Page,
  frame: Frame,
  box: { height: number; width: number; x: number; y: number }
) => {
  const panel = await desk.locator(FRAME).first().boundingBox();
  if (!panel) {
    return null;
  }
  return frame.evaluate(
    ([x, y]) => {
      const hit = document
        .elementsFromPoint(x, y)
        .find(
          (el) =>
            !el.closest(
              "cawco-overlay, svg[data-cawco-ink], svg[data-cawco-pins]"
            )
        );
      return hit ? `${hit.localName}.${hit.classList[0] ?? ""}` : null;
    },
    [box.x + box.width / 2 - panel.x, box.y + box.height / 2 - panel.y] as const
  );
};

/**
 * (h) Draw over an option's live embed: a loop that starts above the edge
 * option's embed and rounds the box inside it keeps every move made over the
 * embed, and marks the box inside it.
 */
const drawOverEmbed = async (on: On, frame: Frame) => {
  const { desk, kit } = on;
  await mode(desk, frame, "D");
  // The mockup's box slides while motion is allowed: held still, the stroke's points read back against the box it was drawn round.
  await desk.emulateMedia({ reducedMotion: "reduce" });
  const embed = frame.locator(EMBED).first();
  await toPaneTop(embed);
  await settle(desk, 300);
  const outer = await embed.boundingBox({ timeout: 10_000 });
  const inner = await frame
    .frameLocator(EMBED)
    .locator(".box")
    .first()
    .boundingBox({ timeout: 10_000 });
  const before = Object.keys((await docOf(frame)).ink);
  if (!(outer && inner)) {
    kit.check("(h) the edge option's embed is on the page", false, "no box");
    await desk.emulateMedia({ reducedMotion: null });
    return;
  }
  // From 16px above the embed's top edge, round its box, back to the start: each move sent alone.
  const top = outer.y - 16;
  const corners: [number, number][] = [
    [inner.x - 8, top],
    [inner.x + inner.width + 8, top],
    [inner.x + inner.width + 8, inner.y + inner.height + 8],
    [inner.x - 8, inner.y + inner.height + 8],
    [inner.x - 8, top + 4],
  ];
  const sent: [number, number][] = [];
  let [from] = corners as [[number, number]];
  for (const to of corners.slice(1)) {
    for (let i = 1; i <= 20; i += 1) {
      sent.push([
        from[0] + ((to[0] - from[0]) * i) / 20,
        from[1] + ((to[1] - from[1]) * i) / 20,
      ]);
    }
    from = to;
  }
  const [start] = corners as [[number, number]];
  await pressAt(frame, { x: start[0], y: start[1] }, { how: "down" });
  for (const [x, y] of sent) {
    await desk.mouse.move(x, y);
  }
  await desk.mouse.up();
  const over = (x: number, y: number) =>
    x >= outer.x &&
    x <= outer.x + outer.width &&
    y >= outer.y &&
    y <= outer.y + outer.height;
  const sentOver = sent.filter(([x, y]) => over(x, y)).length;
  const inked = await until(
    "the loop over the embed in the doc",
    () => docOf(frame),
    (d) => Object.keys(d.ink).some((id) => !before.includes(id)),
    10_000
  ).catch(() => null);
  const group = inked
    ? Object.entries(inked.ink).find(([id]) => !before.includes(id))?.[1]
    : undefined;
  const anchor = group?.anchor as Named | undefined;
  const marked = (group?.over ?? []) as Named[];
  const [at, ...overs] = await resolveIn(frame, [
    anchor ?? { frames: [], selector: ":not(*)" },
    ...marked.map((one) => ({
      frames: one.frames ?? [],
      selector: one.selector,
    })),
  ]);
  // The stroke's points back in the panel frame's viewport, then into the desk's px by the panel frame's own place.
  const panel = await desk.locator(FRAME).first().boundingBox();
  const points = (group?.strokes ?? []).flatMap((stroke) => stroke.points);
  const keptOver =
    at && panel
      ? points.filter(([fx, fy]) =>
          over(panel.x + at.x + fx * at.w, panel.y + at.y + fy * at.h)
        ).length
      : 0;
  const insideMarked = overs.filter(
    (one) => one?.inFrame && String(one.className).includes("box")
  ).length;
  kit.check(
    "(h) a Draw loop that crosses into an option's live embed keeps every move made over it, and marks the box inside the embed",
    sentOver > 0 && keptOver >= sentOver && insideMarked > 0,
    JSON.stringify({
      sent: sent.length + 1,
      kept: points.length,
      sentOver,
      keptOver,
      top: await topAt(desk, frame, inner),
      over: marked,
    })
  );
  await desk.emulateMedia({ reducedMotion: null });
  await desk.keyboard.press("Escape");
  await mode(desk, frame, "V");
};

/** (h) Comment over an option's live embed: a tap on the box inside it pins to that box, through its frame. */
const commentInEmbed = async (on: On, frame: Frame) => {
  const { desk, kit } = on;
  await mode(desk, frame, "C");
  // The mockup's box slides while motion is allowed, and a click waits for it to hold still.
  await desk.emulateMedia({ reducedMotion: "reduce" });
  const embed = frame.locator(EMBED).first();
  await toPaneTop(embed);
  await settle(desk, 300);
  const box = await frame
    .frameLocator(EMBED)
    .locator(".box")
    .first()
    .boundingBox({ timeout: 10_000 });
  const before = Object.keys((await docOf(frame)).pins);
  if (!box) {
    kit.check("(h) the edge option's embed is on the page", false, "no box");
    await desk.emulateMedia({ reducedMotion: null });
    return;
  }
  // In Comment mode the page's overlay takes the press over the embed and
  // asks the embed's overlay what stands at the point (preview-overlay
  // embeds.ts); the dashboard around the page must still leave it open.
  await pressIn(frame.frameLocator(EMBED).first(), ".box >> nth=0", {
    through: "cawco-overlay",
  });
  await desk.emulateMedia({ reducedMotion: null });
  await writeComment(desk, "This box, inside the embed.");
  const pinned = await until(
    "a pin inside the embed in the doc",
    () => docOf(frame),
    (d) => Object.keys(d.pins).some((id) => !before.includes(id)),
    10_000
  ).catch(() => null);
  const pin = pinned
    ? Object.entries(pinned.pins).find(([id]) => !before.includes(id))?.[1]
    : undefined;
  const anchor = pin?.anchor as Named | undefined;
  const [at] = anchor
    ? await resolveIn(frame, [
        { frames: anchor.frames ?? [], selector: anchor.selector },
      ])
    : [null];
  kit.check(
    "(h) a Comment tap inside an option's live embed anchors to the element under it there: the box, through the embed's frame",
    !!at?.inFrame && String(at.className).includes("box"),
    JSON.stringify({
      anchor: pin?.anchor ?? null,
      top: await topAt(desk, frame, box),
    })
  );
  await desk.keyboard.press("Escape");
  await mode(desk, frame, "V");
};

/**
 * What a document did around one mode switch, read in it: the longest wait
 * between two of its frames from the press on (its thread or its renderer
 * busy: WebKit reports no long tasks), its long tasks where the engine
 * reports them (Chromium), and, over a quiet window once the switch is done,
 * the frames its own code asked for and what still animates in it.
 */
interface SwitchWatch {
  /** Frames the document's own code asked for in the quiet window. */
  asked: number;
  /** The longest gap between two frames from the press until the quiet window, ms. */
  gap: number;
  /** Long tasks (Chromium's `longtask` entries) from the press on, ms each. */
  long: number[];
  /** What animates at the quiet window's end on the document's clock and began before the window or never ends, by its target and its name. */
  running: string[];
}

interface SwitchState {
  asked: number;
  counting: boolean;
  frames: number[];
  long: number[];
  own: (callback: FrameRequestCallback) => number;
  quietAt: number;
  timing: boolean;
}

/**
 * Starts the watch in this document: its frames timed on the engine's own
 * clock by a frame callback of the watch's own (named `switchTick`, which
 * the count leaves out), and every other `requestAnimationFrame` counted
 * once the quiet window opens.
 */
const watchSwitch = () => {
  const w = window as unknown as {
    __switch?: SwitchState;
    requestAnimationFrame: typeof requestAnimationFrame;
  };
  if (!w.__switch) {
    const own = window.requestAnimationFrame.bind(window);
    const made: SwitchState = {
      asked: 0,
      counting: false,
      frames: [],
      long: [],
      own,
      quietAt: 0,
      timing: false,
    };
    w.__switch = made;
    // The browser driver's own frame callbacks (on WebKit, its scripts run
    // from `web-inspector://`) are none of the page's.
    w.requestAnimationFrame = (callback) => {
      if (
        made.counting &&
        callback.name !== "switchTick" &&
        !(new Error("who asks").stack ?? "").includes("web-inspector://")
      ) {
        made.asked += 1;
      }
      return own(callback);
    };
    try {
      new PerformanceObserver((list) => {
        if (made.timing) {
          for (const entry of list.getEntries()) {
            made.long.push(Math.round(entry.duration));
          }
        }
      }).observe({ type: "longtask" });
    } catch {
      // No long tasks in this engine (WebKit): the frames' gaps say it.
    }
  }
  const state = w.__switch;
  state.frames = [performance.now()];
  state.long = [];
  state.asked = 0;
  state.counting = false;
  state.timing = true;
  const switchTick = (now: number) => {
    if (!state.timing) {
      return;
    }
    state.frames.push(now);
    state.own(switchTick);
  };
  state.own(switchTick);
};

/** The quiet window opens: the frame clock stops, and the page's own asks are counted from here. */
const quietSwitch = () => {
  const state = (window as unknown as { __switch: SwitchState }).__switch;
  state.timing = false;
  state.asked = 0;
  state.counting = true;
  state.quietAt = performance.now();
};

/**
 * The watch read at the quiet window's end. `scope`, in the desk, is the
 * pane the switch draws in: a run outside it (the rail's marks, the
 * transcript's indicator) is the reply the fresh loop sets off, on its own
 * clock whenever the session takes it, which no switch starts.
 */
const readSwitch = (scope: string | null): SwitchWatch => {
  const state = (window as unknown as { __switch: SwitchState }).__switch;
  state.counting = false;
  let gap = 0;
  for (let at = 1; at < state.frames.length; at += 1) {
    gap = Math.max(gap, state.frames[at] - state.frames[at - 1]);
  }
  const named = (target: unknown) => {
    const el = target as Element | null;
    if (!el) {
      return "?";
    }
    const { host } = el.getRootNode() as ShadowRoot;
    const slot = el.getAttribute("data-slot");
    return `${host ? `${host.localName}>>` : ""}${el.localName}${slot ? `[${slot}]` : ""}`;
  };
  const shadows = [...document.querySelectorAll("*")]
    .map((el) => el.shadowRoot)
    .filter((root): root is ShadowRoot => !!root);
  const all = new Set([
    ...document.getAnimations(),
    ...shadows.flatMap((root) => root.getAnimations()),
  ]);
  // On the document's clock (a scroll-driven run's timeline has a `source`,
  // and moves only as its scroller does), in `scope`, and either never
  // ending or begun before the window: a run the switch left going.
  const running = [...all]
    .filter((one) => {
      const target = (one.effect as KeyframeEffect | null)?.target;
      if (
        one.playState !== "running" ||
        (one.timeline && "source" in one.timeline) ||
        (scope && !target?.closest(scope))
      ) {
        return false;
      }
      const timing = one.effect?.getComputedTiming();
      const began = typeof one.startTime === "number" ? one.startTime : 0;
      return (
        timing?.endTime === Number.POSITIVE_INFINITY || began < state.quietAt
      );
    })
    .map((one) => {
      const name =
        (one as CSSAnimation).animationName ??
        (one as CSSTransition).transitionProperty ??
        one.id;
      return `${named((one.effect as KeyframeEffect | null)?.target)} ${name || "(script)"}`;
    });
  return {
    asked: state.asked,
    gap: Math.round(gap),
    long: state.long,
    running,
  };
};

/** When the overlay's layer is in `want` (Draw's `draw`, Interact's none), on the shared clock (`timeOrigin + now`); NaN after 5s. */
const modeAt = (frame: Frame, want: string) =>
  frame.evaluate(
    (wanted) =>
      new Promise<number>((done) => {
        const layer = document
          .querySelector("cawco-overlay")
          ?.shadowRoot?.querySelector(".layer");
        const there = () => {
          if (layer?.classList.contains("comment")) {
            return wanted === "comment";
          }
          return (layer?.classList.contains("draw") ? "draw" : "") === wanted;
        };
        const at = () => performance.timeOrigin + performance.now();
        if (there()) {
          done(at());
          return;
        }
        const seen = new MutationObserver(() => {
          if (there()) {
            seen.disconnect();
            done(at());
          }
        });
        if (layer) {
          seen.observe(layer, { attributes: true, attributeFilter: ["class"] });
        }
        setTimeout(() => {
          seen.disconnect();
          done(Number.NaN);
        }, 5000);
      }),
    want
  );

/** Chromium's counters for one renderer (DevTools `Performance.getMetrics`): layouts, style recalcs, and the time in tasks, layout and style, ms. */
const metricsOf = async (cdp: CDPSession | null) => {
  if (!cdp) {
    return null;
  }
  const { metrics } = (await cdp.send("Performance.getMetrics")) as {
    metrics: { name: string; value: number }[];
  };
  const of = (name: string) =>
    metrics.find((one) => one.name === name)?.value ?? 0;
  return {
    layouts: of("LayoutCount"),
    styles: of("RecalcStyleCount"),
    task: of("TaskDuration") * 1000,
    layout: of("LayoutDuration") * 1000,
    style: of("RecalcStyleDuration") * 1000,
  };
};

type Metrics = NonNullable<Awaited<ReturnType<typeof metricsOf>>>;
const metricsSince = (a: Metrics | null, b: Metrics | null) =>
  a && b
    ? {
        layouts: b.layouts - a.layouts,
        styles: b.styles - a.styles,
        task: Math.round(b.task - a.task),
        layout: Math.round(b.layout - a.layout),
        style: Math.round(b.style - a.style),
      }
    : null;
const countsOf = (m: ReturnType<typeof metricsSince>) =>
  m
    ? ` ${m.styles} styles ${m.layouts} layouts, task ${m.task}ms (style ${m.style}, layout ${m.layout})`
    : "";

/** How long a switch may take from the press to the page's mode, ms. */
const SWITCH_MS = 300;
/** The longest a frame may wait in a switch, ms: the long task's bound. */
const SWITCH_TASK_MS = 200;
/** The quiet window after a switch in which nothing the switch started may still run, ms. */
const SWITCH_QUIET_MS = 500;

/** The two documents a switch is read in, and Chromium's counters for each (none on WebKit). */
interface SwitchSides {
  cdp: { desk: CDPSession | null; frame: CDPSession | null };
  desk: Page;
  frame: Frame;
}

/** Both documents' counters now. */
const metricsNow = async ({ cdp }: SwitchSides) => ({
  desk: await metricsOf(cdp.desk),
  frame: await metricsOf(cdp.frame),
});

/**
 * One press of the mode's segment `key`, read in the desk and the page:
 * its row (when the mode was reached, the longest frame, Chromium's counts
 * of the work and of what came in the quiet window after) and, when it
 * broke a bound, why.
 */
const pressOnce = async (
  sides: SwitchSides,
  key: "V" | "D",
  turn: number
): Promise<{ fail: string | null; row: string }> => {
  const { desk, frame } = sides;
  // Its place read without waiting for it to stand still: a segment that
  // never settles is what this leg reads, never a wait it stalls in.
  const segment = await desk
    .locator(`${PANE} [role='tab'][aria-keyshortcuts='${key}']`)
    .boundingBox();
  await desk.evaluate(watchSwitch);
  await frame.evaluate(watchSwitch);
  const before = await metricsNow(sides);
  const pressed = await desk.evaluate(
    () => performance.timeOrigin + performance.now()
  );
  const reached = modeAt(frame, key === "D" ? "draw" : "");
  if (segment) {
    await desk.mouse.click(
      segment.x + segment.width / 2,
      segment.y + segment.height / 2
    );
  }
  const took = Math.round((await reached) - pressed);
  await desk.waitForTimeout(SWITCH_MS);
  await desk.evaluate(quietSwitch);
  await frame.evaluate(quietSwitch);
  const switched = await metricsNow(sides);
  await desk.waitForTimeout(SWITCH_QUIET_MS);
  const quiet = await metricsNow(sides);
  const seen = {
    desk: await desk.evaluate(readSwitch, PANE),
    frame: await frame.evaluate(readSwitch, null),
  };
  const longest = Math.max(
    seen.desk.gap,
    seen.frame.gap,
    ...seen.desk.long,
    ...seen.frame.long
  );
  const still = [
    ...seen.desk.running.map((one) => `desk ${one}`),
    ...seen.frame.running.map((one) => `page ${one}`),
  ];
  const said = Number.isNaN(took) ? "never" : `${took}ms`;
  const long = (watch: SwitchWatch) =>
    watch.long.length > 0 ? ` long ${watch.long.join("/")}` : "";
  const row = `${turn} ${key} ${said}, longest frame ${longest}ms; desk${countsOf(metricsSince(before.desk, switched.desk))}${long(seen.desk)}; page${countsOf(metricsSince(before.frame, switched.frame))}${long(seen.frame)}; after: ${seen.desk.asked}/${seen.frame.asked} frames asked, ${still.length} running${countsOf(metricsSince(switched.desk, quiet.desk))}`;
  const broke =
    Number.isNaN(took) ||
    took >= SWITCH_MS ||
    longest >= SWITCH_TASK_MS ||
    still.length > 0;
  return {
    row,
    fail: broke
      ? `${turn} ${key}: ${said}, longest frame ${longest}ms, still ${still.join(", ") || "none"}`
      : null,
  };
};

/**
 * (n) Interact and Draw, ten presses, over a page holding ink and comments
 * as the legs above leave it, the first pressed the moment a fresh loop of
 * ink is drawn, while its picture is made (the mark's picture runs on the
 * page's thread, on WebKit the dashboard's too): each press reaches the
 * page's mode within 300ms, no frame in the desk or the page waits 200ms or
 * more, no animation is left going half a second on, and once the presses
 * are done nothing runs on: no frame asked for, no animation.
 */
const switchLeg = async (on: On, frame: Frame) => {
  const { desk, kit } = on;
  const engine = desk.context().browser()?.browserType().name() ?? "?";
  const chromium = engine === "chromium";
  const sides: SwitchSides = {
    desk,
    frame,
    cdp: {
      desk: chromium ? await desk.context().newCDPSession(desk) : null,
      frame: chromium
        ? await desk
            .context()
            .newCDPSession(frame)
            .catch(() => null)
        : null,
    },
  };
  await sides.cdp.desk?.send("Performance.enable");
  await sides.cdp.frame?.send("Performance.enable");
  await mode(desk, frame, "D");
  const option = frame.locator('#decision-host [data-option="hub"]');
  await toPaneTop(option);
  await settle(desk, 300);
  const box = await option.boundingBox();
  if (box) {
    await loopRound(frame, box);
  }
  const rows: string[] = [];
  const fails: string[] = [];
  for (let turn = 1; turn <= 10; turn += 1) {
    const { row, fail } = await pressOnce(
      sides,
      turn % 2 === 1 ? "V" : "D",
      turn
    );
    rows.push(row);
    if (fail) {
      fails.push(fail);
    }
  }
  // Once the presses are done, a loop the switches started would still be
  // going: a window as long as the last ten switches' each, and nothing in
  // it. (Inside the run, the desk's own answer to the fresh loop, its rows
  // laid out again as they come, may fall in a switch's window: that is
  // the mark's, not the switch's.)
  await settle(desk, SWITCH_MS);
  await desk.evaluate(watchSwitch);
  await frame.evaluate(watchSwitch);
  await desk.evaluate(quietSwitch);
  await frame.evaluate(quietSwitch);
  await desk.waitForTimeout(2 * SWITCH_QUIET_MS);
  const rest = {
    desk: await desk.evaluate(readSwitch, PANE),
    frame: await frame.evaluate(readSwitch, null),
  };
  const resting = [
    ...rest.desk.running.map((one) => `desk ${one}`),
    ...rest.frame.running.map((one) => `page ${one}`),
  ];
  rows.push(
    `then ${2 * SWITCH_QUIET_MS}ms at rest: ${rest.desk.asked}/${rest.frame.asked} frames asked, ${resting.length} running`
  );
  if (rest.desk.asked + rest.frame.asked > 0 || resting.length > 0) {
    fails.push(
      `at rest: frames asked ${rest.desk.asked}/${rest.frame.asked}, still ${resting.join(", ") || "none"}`
    );
  }
  kit.check(
    `(n) ${engine}: ten presses between Interact and Draw over the page's ink and comments, the first as a fresh loop's picture is made, each reach the page's mode under ${SWITCH_MS}ms with no frame waiting ${SWITCH_TASK_MS}ms and no animation left going, and nothing runs on after them (${rows.join(" | ")})`,
    fails.length === 0,
    fails.join("\n    ")
  );
  await sides.cdp.desk?.detach();
  await sides.cdp.frame?.detach();
  await mode(desk, frame, "V");
};

/**
 * A turn's frames in one document: every frame's start (the engine's own
 * frame clock, `requestAnimationFrame`), and when the transcript's rows
 * changed (marked `turn-rows` for a trace to find).
 */
const watchTurn = () => {
  const w = window as unknown as {
    __turn?: {
      frames: number[];
      on: boolean;
      rows: number[];
      stop: () => void;
    };
  };
  const own = window.requestAnimationFrame.bind(window);
  const state: {
    frames: number[];
    on: boolean;
    rows: number[];
    stop: () => void;
  } = {
    frames: [],
    on: true,
    rows: [],
    stop: () => undefined,
  };
  w.__turn = state;
  const turnTick = (now: number) => {
    if (state.on) {
      state.frames.push(now);
      own(turnTick);
    }
  };
  own(turnTick);
  const listing = document.querySelector("[data-slot=listing]");
  const seen = new MutationObserver((records) => {
    if (records.some((record) => record.type === "childList")) {
      state.rows.push(performance.now());
      performance.mark("turn-rows");
    }
  });
  if (listing) {
    seen.observe(listing, { childList: true, subtree: true });
  }
  state.stop = () => {
    state.on = false;
    seen.disconnect();
  };
  performance.mark("turn-start");
  return performance.now();
};

const readTurn = () => {
  const state = (
    window as unknown as {
      __turn: { frames: number[]; rows: number[]; stop: () => void };
    }
  ).__turn;
  state.stop();
  return { frames: state.frames, rows: state.rows };
};

/** A reply window's frames: how many, how many over 16.7ms and 33ms (on headless Chromium's 16.67ms grid, past 17.2 and 33.4), the longest. */
const framesIn = (frames: number[], from: number, to: number) => {
  const spans: number[] = [];
  for (let at = 1; at < frames.length; at += 1) {
    if (frames[at] >= from && frames[at] <= to) {
      spans.push(frames[at] - frames[at - 1]);
    }
  }
  return {
    n: spans.length,
    over16: spans.filter((span) => span > 17.2).length,
    over33: spans.filter((span) => span > 33.4).length,
    longest: Math.round(Math.max(0, ...spans) * 10) / 10,
  };
};

/**
 * The sites a mount forced layout from, by what their call says in any build
 * (property names and strings survive minifying): a helper's computed
 * position read as it attached (`highlight`, `reflow`: now the sheet's
 * default, design.css), the rendered check as it mounted (utils/rendered
 * `checkVisibility`: now its observers' first answers), a folder tab's first
 * measure (TabItem, its `--flare`: now its size observer's first report) and
 * a session row's trailing column read for its width (SessionRow
 * `getComputedStyle(...).inlineSize`: now its observer's own entries), and
 * the tabs' places measured in the frame's callbacks, ahead of its layout
 * (fluid-tabs `rects`, its `offsetParent` walk: now its size observer's
 * first report). That last is the walk forced from anywhere but a
 * ResizeObserver's delivery (`DELIVERY`): measured there, it reads the
 * frame's own layout, and a tab arriving is measured there.
 */
const MOUNT_SITES: [string, RegExp][] = [
  ["position read at attach", /\.position\s*===\s*["'`]static["'`]/],
  ["checkVisibility", /\.checkVisibility\(/],
  ["folder tab measure", /["'`]--flare["'`]/],
  ["row trail width", /\)\.inlineSize/],
];
/** fluid-tabs `rects`' measure: each tab skipped when it has no box. */
const TAB_PLACES = /\.offsetParent\s*===\s*null\s*\)\s*continue/;
/** A frame of a stack inside frame-observer's ResizeObserver callback. */
const DELIVERY = /new ResizeObserver\(/;

/** The longest a frame of a reply may take at 4x CPU throttle on Chromium, ms. */
const TURN_FRAME_MS = 250;

/** What a long frame spent its time on, from a trace: script, the layout and style it forced, the frame's own, and painting. */
const TASKS = new Set([
  "FunctionCall",
  "EventDispatch",
  "TimerFire",
  "FireAnimationFrame",
  "RunMicrotasks",
  "HandlePostMessage",
]);
const PAINTS = new Set([
  "Paint",
  "PrePaint",
  "Layerize",
  "Commit",
  "RasterTask",
]);

interface TraceEvent {
  args?: {
    beginData?: {
      stackTrace?: {
        columnNumber: number;
        functionName: string;
        lineNumber: number;
        url: string;
      }[];
    };
  };
  dur?: number;
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
}

/** Each script's text by its URL, for what a stack frame's line and column say. */
const scripts = new Map<string, Promise<string[]>>();
const lineOf = (url: string, line: number) => {
  let text = scripts.get(url);
  if (!text) {
    text = fetch(url)
      .then((response) => response.text())
      .then((body) => body.split("\n"))
      .catch(() => [] as string[]);
    scripts.set(url, text);
  }
  // A trace's stack frames count lines and columns from 1.
  return text.then((lines) => lines[line - 1] ?? "");
};

/** Total duration of `events`, ms, rounded. */
const durationOf = (events: TraceEvent[]) =>
  Math.round(
    events.reduce((total, event) => total + (event.dur ?? 0), 0) / 1000
  );

type StackFrame = NonNullable<
  NonNullable<NonNullable<TraceEvent["args"]>["beginData"]>["stackTrace"]
>[number];

/** Whether a forced layout's stack runs inside a ResizeObserver's delivery (`DELIVERY`). */
const delivered = async (stack: StackFrame[]) => {
  for (const frame of stack) {
    if (frame.url.startsWith("http")) {
      const source = await lineOf(frame.url, frame.lineNumber);
      const column = frame.columnNumber - 1;
      if (DELIVERY.test(source.slice(Math.max(0, column - 80), column))) {
        return true;
      }
    }
  }
  return false;
};

/** A layout or style recalc script forced: one with the stack that asked for it. */
const forcedBy = (event: TraceEvent) =>
  (event.name === "Layout" || event.name === "UpdateLayoutTree") &&
  (event.args?.beginData?.stackTrace?.length ?? 0) > 0;

/**
 * Every layout script forced in a window, by its call's place and what the
 * call says there, and each of `MOUNT_SITES` among them.
 */
const forcedSites = async (events: TraceEvent[]) => {
  const sites = new Map<string, { count: number; ms: number }>();
  const mount: string[] = [];
  for (const event of events.filter(forcedBy)) {
    const stack = event.args?.beginData?.stackTrace ?? [];
    const top = stack.find((frame) => frame.url.startsWith("http")) ?? stack[0];
    const source = await lineOf(top.url, top.lineNumber);
    const column = top.columnNumber - 1;
    const at = source.slice(Math.max(0, column - 80), column + 160);
    const file = top.url.split("/").pop();
    const site = MOUNT_SITES.find(([, token]) => token.test(at))?.[0];
    if (site) {
      mount.push(`${event.name} ${site} (${file}:${top.columnNumber})`);
    } else if (TAB_PLACES.test(at) && !(await delivered(stack))) {
      mount.push(
        `${event.name} tabs measured ahead of the frame's layout (${file}:${top.columnNumber})`
      );
    }
    const key = `${event.name} ${file}:${top.columnNumber} "${at.slice(70, 110).replace(SPACES_RUN, " ")}"`;
    const held = sites.get(key) ?? { count: 0, ms: 0 };
    held.count += 1;
    held.ms += (event.dur ?? 0) / 1000;
    sites.set(key, held);
  }
  return {
    mount,
    sites: [...sites]
      .sort((a, b) => b[1].ms - a[1].ms)
      .map(([key, one]) => `${one.count}x ${Math.round(one.ms)}ms ${key}`),
  };
};
const SPACES_RUN = /\s+/g;

/** What one frame spent its time on: script (its outermost tasks), the layout and style it forced, the frame's own, painting. */
const frameSpent = (events: TraceEvent[], span: number) => {
  const outermost = events.filter(
    (event) =>
      TASKS.has(event.name) &&
      !events.some(
        (other) =>
          other !== event &&
          TASKS.has(other.name) &&
          other.tid === event.tid &&
          other.ts <= event.ts &&
          other.ts + (other.dur ?? 0) >= event.ts + (event.dur ?? 0)
      )
  );
  const layouts = events.filter(
    (event) => event.name === "Layout" || event.name === "UpdateLayoutTree"
  );
  return `${Math.round(span)}ms: script ${durationOf(outermost)}ms (of it forced layout and style ${durationOf(layouts.filter(forcedBy))}ms), the frame's own layout and style ${durationOf(layouts.filter((event) => !forcedBy(event)))}ms, painting ${durationOf(events.filter((event) => PAINTS.has(event.name)))}ms`;
};

/**
 * A reply's trace read: the document's window from its first row change less
 * 500ms to its last plus 500ms (`turn-rows` marks), its layout and style
 * time, the layouts script forced and where from, and each frame over 33ms.
 */
const readTrace = async (
  traced: TraceEvent[],
  frames: number[],
  t0: number,
  window: { from: number; to: number }
) => {
  const pid = traced.find((event) => event.name === "turn-start")?.pid;
  const start =
    traced.find((event) => event.name === "turn-start" && event.pid === pid)
      ?.ts ?? 0;
  const traceAt = (at: number) => start + (at - t0) * 1000;
  const lo = traceAt(window.from);
  const hi = traceAt(window.to);
  const inWindow = traced.filter(
    (event) =>
      event.pid === pid && event.ts >= lo && event.ts <= hi && event.ph === "X"
  );
  const longFrames: string[] = [];
  for (let at = 1; at < frames.length; at += 1) {
    const span = frames[at] - frames[at - 1];
    if (span > 33.4 && frames[at] >= window.from && frames[at] <= window.to) {
      const a = traceAt(frames[at - 1]);
      const b = traceAt(frames[at]);
      const inFrame = inWindow.filter((event) => event.ts >= a && event.ts < b);
      // What the frame's script forced, and from where: the first read
      // after a write pays for the layout every write before it asked for.
      const { sites } = await forcedSites(inFrame);
      longFrames.push(
        `${frameSpent(inFrame, span)}${sites.length > 0 ? ` [forced from ${sites.slice(0, 5).join("; ")}]` : ""}`
      );
    }
  }
  const forced = await forcedSites(inWindow);
  return {
    layout: durationOf(inWindow.filter((event) => event.name === "Layout")),
    style: durationOf(
      inWindow.filter((event) => event.name === "UpdateLayoutTree")
    ),
    forced: durationOf(inWindow.filter(forcedBy)),
    longFrames,
    ...forced,
  };
};

/**
 * One reply in `page`, set off by `trigger`: its frames, and on Chromium, at
 * 4x CPU throttle with a trace of the window, what it spent them on
 * (`readTrace`).
 */
const turnOnce = async (
  page: Page,
  trigger: () => Promise<void>,
  chromium: boolean
) => {
  const cdp = chromium ? await page.context().newCDPSession(page) : null;
  const traced: TraceEvent[] = [];
  if (cdp) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    // The protocol's own type says each event is strings; a trace event's
    // numbers and stacks are what it carries.
    cdp.on("Tracing.dataCollected", (event) => {
      traced.push(...(event.value as unknown as TraceEvent[]));
    });
    await cdp.send("Tracing.start", {
      categories:
        "devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack",
      transferMode: "ReportEvents",
    });
  }
  const t0 = await page.evaluate(watchTurn);
  await trigger();
  await page.waitForTimeout(7000);
  const got = await page.evaluate(readTurn);
  const rows = got.rows.filter((at) => at > t0);
  const window = {
    from: rows.length > 0 ? rows[0] - 500 : t0,
    to: rows.length > 0 ? (rows.at(-1) as number) + 500 : t0,
  };
  const frames = framesIn(got.frames, window.from, window.to);
  if (!cdp) {
    return { frames, rows: rows.length, trace: null };
  }
  const done = new Promise((resolve) =>
    cdp.once("Tracing.tracingComplete", resolve)
  );
  await cdp.send("Tracing.end");
  await done;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await cdp.detach();
  return {
    frames,
    rows: rows.length,
    trace: await readTrace(traced, got.frames, t0, window),
  };
};

/**
 * (o) A reply arriving, as the desk and the phone draw it: a loop of ink
 * the session hears, and a plain message from elsewhere. Every frame is
 * read from the first change to the transcript's rows less 500ms to the
 * last plus 500ms; on Chromium at 4x CPU throttle, with a trace of that
 * window. No layout is forced from a mount's sites (`MOUNT_SITES`), and no
 * frame there runs past `TURN_FRAME_MS`.
 */
const turnLeg = async (on: On, frame: Frame) => {
  const { desk, kit } = on;
  const engine = desk.context().browser()?.browserType().name() ?? "?";
  const chromium = engine === "chromium";
  const inkLoop = async () => {
    await mode(desk, frame, "D");
    const option = frame.locator('#decision-host [data-option="hub"]');
    await toPaneTop(option);
    const box = await option.boundingBox();
    if (box) {
      await loopRound(frame, box);
    }
    await mode(desk, frame, "V");
  };
  const plain = async () => {
    await on.fleet.send(on.writer, "A plain message from elsewhere.");
  };
  const phone = await kit.page("phone", { theme: "light" });
  await open(phone, `${on.base}/session/${on.writer}`, '[data-slot="pane"]');
  await settle(phone, 3000);
  const runs: [string, Page, () => Promise<void>][] = [
    ["desk ink loop", desk, inkLoop],
    ["desk plain arrival", desk, plain],
    ["phone ink loop", phone, inkLoop],
    ["phone plain arrival", phone, plain],
  ];
  for (const [label, page, trigger] of runs) {
    await settle(page, 2000);
    const read = await turnOnce(page, trigger, chromium);
    const { frames: f, trace: t } = read;
    const said = `${read.rows} row changes; ${f.n} frames, ${f.over16} over 16.7ms, ${f.over33} over 33ms, longest ${f.longest}ms`;
    if (!t) {
      // No CPU throttle and no trace outside Chromium: the frames alone.
      kit.check(
        `(o) ${engine} ${label}: a reply's frames, unthrottled (${said})`,
        read.rows > 0 && f.n > 0
      );
      continue;
    }
    kit.check(
      `(o) ${engine} ${label} at 4x CPU throttle: no layout forced from a mount's sites, and no frame past ${TURN_FRAME_MS}ms (${said}; Layout ${t.layout}ms, UpdateLayoutTree ${t.style}ms, forced in script ${t.forced}ms; long frames: ${t.longFrames.join(" | ") || "none"}; forced from: ${t.sites.slice(0, 6).join(" | ")})`,
      read.rows > 0 && t.mount.length === 0 && f.longest <= TURN_FRAME_MS,
      [...t.mount, ...t.sites].join("\n    ")
    );
  }
  await phone.close();
};

/** (b) the revision that puts a decision ahead: marks stay on their cards, the hash moves. */
const insertAhead = async (on: On, first: string) => {
  const { desk, fleet, kit } = on;
  const revised = await fleet.api<{
    decisions: string[];
    moved: { added: string[]; removed: string[] };
    pageHash: string;
    statements: { added: string[]; replaced: string[]; removed: string[] };
  }>(`/api/instances/${on.writer}/artifacts/${on.page}/statements`, {
    statements: INSERT,
  });
  kit.check(
    "(b) a revision answers what it changed: the new decision and its statements, the root rewritten",
    JSON.stringify(revised.moved) ===
      JSON.stringify({ added: ["audience"], removed: [] }) &&
      revised.statements.added.includes("audience") &&
      revised.statements.replaced.includes("root") &&
      revised.decisions[0] === "audience",
    JSON.stringify(revised)
  );
  const after = await frameWith(desk, 4);
  await settle(desk, 600);
  // The stack card's question in view, where the pin stands: a pin stands
  // drawn only where its element is seen (pins.ts, clipped to the scroll
  // containers round it), and the page's cards scroll in its first row. An
  // open card runs taller than the window, so its question, not its middle.
  await after
    .locator("#decision-stack h2")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settle(desk, 400);
  const placed = await after.evaluate(() => {
    const stack = document
      .querySelector("#decision-stack")
      ?.getBoundingClientRect();
    const disc = document
      .querySelector('svg[data-cawco-pins] g[data-pin="1"] [data-face]')
      ?.getBoundingClientRect();
    const astro = document.querySelector('[data-option="astro"]');
    return {
      first: document.querySelector("article[data-slot=decision]")?.id,
      astro: astro?.hasAttribute("data-cawco-picked"),
      // A program's option is its group's radio: its pick is aria-checked,
      // and the overlay writes no aria-pressed on it (preview-overlay page.ts
      // \`reflect\`).
      checked: astro?.getAttribute("aria-checked"),
      pressed: astro?.getAttribute("aria-pressed"),
      stack: stack && { top: stack.top, bottom: stack.bottom },
      disc: disc && { x: disc.x + disc.width / 2, y: disc.y + disc.height / 2 },
    };
  });
  kit.check(
    "(b) after the insert the new card leads, the pin stands on the stack card, and astro is still marked picked (aria-checked, no aria-pressed on a radio)",
    placed.first === "decision-audience" &&
      placed.astro === true &&
      placed.checked === "true" &&
      placed.pressed === null &&
      !!placed.stack &&
      !!placed.disc &&
      placed.disc.y >= placed.stack.top - 16 &&
      placed.disc.y <= placed.stack.bottom + 16,
    JSON.stringify(placed)
  );
  const doc = await docOf(after);
  const pinAfter = Object.values(doc.pins).find((one) => one.number === 1);
  const [inkAfter] = Object.values(doc.ink);
  kit.check(
    "(b) the pin's and the ink's anchors still name their own cards",
    !!pinAfter?.anchor.selector.includes("#decision-stack") &&
      (await inCard(after, inkAfter?.anchor?.selector, "host")),
    JSON.stringify({ pin: pinAfter?.anchor, ink: inkAfter?.anchor })
  );
  await pressIn(after, '[data-option="hub"] >> nth=0');
  const hostPick = await until(
    "the second pick on the hub",
    on.read,
    (r) => (r.state.host?.options ?? []).includes("hub"),
    10_000
  ).catch(() => null);
  kit.check(
    "(b) the page hash moved with the program, and the next pick carries it",
    !!hostPick &&
      hostPick.pageHash === revised.pageHash &&
      revised.pageHash !== first &&
      hostPick.state.host?.pageHash === revised.pageHash,
    JSON.stringify({
      meta: hostPick?.pageHash,
      revised: revised.pageHash,
      first,
      host: hostPick?.state.host,
    })
  );
};

interface GraphRead {
  cards: { id: string; x: number; y: number }[];
  edges: [string, string][];
  groups: { cards: string[]; id: string; name: string }[];
}

/** (c) the derived graph, a drag kept through a revision, the tab's graph. */
const graphChecks = async (on: On) => {
  const { fleet, kit, projectId } = on;
  const graphOf = () =>
    fleet.api<GraphRead>(`/api/projects/${projectId}/decisions/graph`);
  const graph = await graphOf();
  kit.check(
    "(c) the graph is derived: a card per decision, an edge per after, a frame for the Section",
    JSON.stringify(graph.cards.map((each) => each.id).toSorted()) ===
      JSON.stringify([
        "launch#audience",
        "launch#host",
        "launch#plan",
        "launch#stack",
      ]) &&
      JSON.stringify(graph.edges.toSorted()) ===
        JSON.stringify([
          ["launch#host", "launch#plan"],
          ["launch#stack", "launch#host"],
        ]) &&
      JSON.stringify(graph.groups) ===
        JSON.stringify([
          { id: "launch#later", name: "Later", cards: ["launch#plan"] },
        ]),
    JSON.stringify(graph)
  );
  const placed = await fetch(
    `${fleet.base}/api/projects/${projectId}/decisions/graph`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ places: [{ id: "launch#host", x: 640, y: 320 }] }),
    }
  );
  await fleet.api(
    `/api/instances/${on.writer}/artifacts/${on.page}/statements`,
    {
      statements: REWORD,
    }
  );
  const moved = (await graphOf()).cards.find(
    (each) => each.id === "launch#host"
  );
  const places = (await on.read()).state["graph.places"]?.value as
    Record<string, { x: number; y: number }> | undefined;
  kit.check(
    "(c) a drag is kept in the page's state under graph.places and stands after a revision",
    placed.ok && moved?.x === 640 && moved.y === 320 && places?.host?.x === 640,
    JSON.stringify({ status: placed.status, moved, places })
  );
  const tab = await kit.page("desk", { theme: "light" });
  await open(
    tab,
    `${on.base}/project/${projectId}?view=decisions`,
    '[data-slot="decisions"]'
  );
  await tab.getByRole("radio", { name: "Graph" }).click();
  const drawn = await until(
    "the tab's graph",
    () =>
      tab.evaluate(() => ({
        nodes: document.querySelectorAll(".svelte-flow__node-decision").length,
        edges: document.querySelectorAll(".svelte-flow__edge").length,
        frames: document.querySelectorAll(".svelte-flow__node-frame").length,
      })),
    (g) => g.nodes === 4 && g.edges === 2 && g.frames === 1,
    20_000
  ).catch(() => null);
  kit.check(
    "(c) the Decisions tab's graph draws the derived cards, edges and Section frame",
    drawn?.nodes === 4 && drawn.edges === 2 && drawn.frames === 1,
    JSON.stringify(drawn)
  );
  // The page live in the tab: its Send picks bar stands above the docked
  // composer and above the foot fade's dissolve over it (FootFade), so no
  // layer of the fade is drawn over the bar's box.
  await open(
    tab,
    `${on.base}/project/${projectId}?view=decisions&page=${NAME}`,
    "[data-slot=page-view] iframe"
  );
  const live = tab.frameLocator("[data-slot=page-view] iframe");
  await live.locator("[data-slot=page-foot]").waitFor({ timeout: 30_000 });
  await settle(tab, 600);
  const barAt = await live.locator("[data-slot=page-foot]").boundingBox();
  const barBox = barAt && {
    x: barAt.x,
    y: barAt.y,
    w: barAt.width,
    h: barAt.height,
  };
  const layers = await tab.evaluate(() => {
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    const view = document.querySelector("[data-slot=page-view]");
    return {
      fade: box(view?.querySelector(":scope > [data-standing]") ?? null),
      dock: box(view?.querySelector("[data-slot=dock]") ?? null),
    };
  });
  const meets = (
    a: { h: number; w: number; x: number; y: number } | null,
    b: { h: number; w: number; x: number; y: number } | null
  ) =>
    !!a &&
    !!b &&
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
  kit.check(
    `(c) the live page's Send picks bar stands above the dock and the foot fade: no fade layer over its box (the bar ${barBox ? `${Math.round(barBox.y)}–${Math.round(barBox.y + barBox.h)}px` : "missing"}, the fade from ${layers.fade ? Math.round(layers.fade.y) : "none"}px, the dock from ${layers.dock ? Math.round(layers.dock.y) : "none"}px)`,
    !!barBox &&
      !!layers.fade &&
      !!layers.dock &&
      !meets(barBox, layers.fade) &&
      !meets(barBox, layers.dock),
    JSON.stringify({ bar: barBox, ...layers })
  );
  await tab.close();
};

interface RecordRead {
  record: {
    cards: { chosen: string[]; id: string; tasks: string[] }[];
  } | null;
}

/** (e) Make tasks over the program's cards; a task filed back lands on its card. */
const makeTasks = async (on: On) => {
  const { fleet, kit, projectId } = on;
  const made = await fleet.api<RecordRead>(
    `/api/projects/${projectId}/decisions/${NAME}/tasks`,
    {}
  );
  const asked = await until(
    "the ask to make tasks",
    () =>
      fleet
        .query<{ body: string }>(
          "SELECT body FROM sent_messages WHERE instance_id = ?",
          on.writer
        )
        .map((each) => each.body)
        .join("\n"),
    (body) => body.includes(decisionsWords.makeTasks),
    30_000
  ).catch(() => "");
  const cards = made.record?.cards ?? [];
  kit.check(
    "(e) Make tasks records the program's cards with the picks, and asks for tasks carrying decided: launch#<card>",
    JSON.stringify(cards.map((each) => each.id)) ===
      JSON.stringify(["audience", "stack", "host", "plan"]) &&
      JSON.stringify(cards.find((each) => each.id === "stack")?.chosen) ===
        '["astro"]' &&
      asked.includes(`decided: \\"${NAME}#<card id>\\"`),
    `${JSON.stringify(cards)} ${asked.slice(0, 400)}`
  );
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${projectId}/tasks`,
    { title: "Build the page on Astro", fields: { decided: `${NAME}#stack` } }
  );
  const filed = await until(
    "the task on its card",
    () => fleet.api<RecordRead>(`/api/projects/${projectId}/decisions/${NAME}`),
    (r) =>
      !!r.record?.cards
        .find((each) => each.id === "stack")
        ?.tasks.includes(task.id),
    20_000
  ).catch(() => null);
  kit.check(
    "(e) a task filed with decided: launch#stack lands on the stack card in the record",
    !!filed,
    JSON.stringify(filed?.record?.cards)
  );
};

/** (f) an HTML page whose pick the person operates. */
const htmlPage = async (on: On) => {
  const { desk, fleet, kit, projectId, writer } = on;
  const budget = await fleet.api<{ id: string }>(
    `/api/instances/${writer}/artifacts`,
    {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: "budget",
      html: HTML_PAGE,
    }
  );
  const html = await until(
    "the HTML page in the panel",
    async () => {
      const frame = await frameAt(desk, FRAME);
      return (await countIn(frame, '[data-cawco-choice="mode"]')) > 0
        ? frame
        : null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  /** The hub's read of the page: its pick and value once both landed, else null. */
  const onHub = async () => {
    const read = await fleet.api<{ state: Doc["state"] }>(
      `/api/instances/${writer}/artifacts/${budget.id}`
    );
    return (read.state.mode?.options ?? []).includes("soft") &&
      String(read.state.budget?.value) === "60"
      ? read
      : null;
  };
  /** One try: the pick and value made in the frame the pane shows now, then a short look on the hub. */
  const pickNow = async () => {
    const now = await frameAt(desk, FRAME);
    if (now && (await countIn(now, '[data-cawco-choice="mode"]')) > 0) {
      try {
        await pressIn(now, '[data-option="soft"] >> nth=0');
        await now.locator('input[name="budget"]').fill("60");
      } catch {
        // The frame went mid-try: the next try finds the one that stayed.
      }
    }
    try {
      return await until("the pick on the hub", onHub, Boolean, 3000);
    } catch {
      return null;
    }
  };
  // A pick made in a frame the pane is swapping out never lands: the frame
  // that stays is found again and picked in until the hub holds both.
  let operated: Awaited<ReturnType<typeof onHub>> = null;
  if (html) {
    try {
      operated = await until(
        "the HTML page's pick and value on the hub",
        pickNow,
        Boolean,
        30_000
      );
    } catch {
      operated = null;
    }
  }
  const listed = await fleet.api<{
    pages: { cards: number; name: string; picked: number }[];
  }>(`/api/projects/${projectId}/decisions`);
  const row = listed.pages.find((one) => one.name === "budget");
  kit.check(
    "(f) an HTML page's option pick and range value are kept, and the tab reads its card from the built page",
    !!operated && row?.cards === 1 && row.picked === 1,
    JSON.stringify({
      frame: html ? html.url().slice(0, 80) : null,
      hub:
        operated?.state ??
        (
          await fleet.api<{ state: Doc["state"] }>(
            `/api/instances/${writer}/artifacts/${budget.id}`
          )
        ).state,
      row,
    })
  );
};

/** (g) in one theme: a picked card loads open with its pick marked, the hub's picks untouched. */
const foldLeg = async (on: On, theme: "light" | "dark") => {
  const { kit } = on;
  const shown = await kit.page("desk", { theme });
  await open(shown, `${on.base}/session/${on.writer}`, '[data-slot="pane"]');
  const frame = await frameWith(shown, 4);
  const before = (await on.read()).state.stack;
  const loaded = await until(
    `${theme}: the stack card loaded with astro marked`,
    () => cardOf(frame, "stack"),
    (card) => JSON.stringify(card.marked) === '["astro"]',
    10_000
  ).catch(() => null);
  await settle(shown, 800);
  const after = (await on.read()).state.stack;
  kit.check(
    `(g) ${theme}: a picked card loads open, both options showing, astro marked, no Continue, Change or fold; the hub's picks the same`,
    !!loaded &&
      loaded.open &&
      loaded.old === 0 &&
      JSON.stringify([...loaded.options].sort()) === '["astro","svelte"]' &&
      !!before &&
      JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify({ loaded, before, after })
  );
  await shown.close();
};

/** (g) at 320 under a finger: a several-pick card of three long unbroken labels, all picked, stays inside its card and open. */
const reachLeg = async (on: On) => {
  const { fleet, kit, writer } = on;
  await fleet.api(`/api/instances/${writer}/artifacts`, {
    kind: "page",
    does: "pick",
    ask: "Pick one option on each card",
    name: "reach",
    program: REACH_PAGE,
  });
  const phone = await kit.page("phone", { theme: "light" });
  await open(phone, `${on.base}/session/${writer}`, '[data-slot="pane"]');
  const frame = await until(
    "the reach page in the phone's panel",
    async () => {
      const at = await frameAt(phone, FRAME);
      return (await countIn(at, "#decision-reach")) > 0 ? at : null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  if (!frame) {
    kit.check("(g) the reach page draws on the phone", false, "no frame");
    await phone.close();
    return;
  }
  await frame.evaluate(() =>
    (
      window as unknown as {
        cawco: { choose: (id: string, options: string[]) => Promise<void> };
      }
    ).cawco.choose("reach", ["mail", "feed", "talk"])
  );
  await until(
    "the reach card holding all three",
    () => cardOf(frame, "reach"),
    (now) => now.marked.length === 3,
    10_000
  ).catch(() => undefined);
  await phone.setViewportSize({ width: 320, height: 844 });
  await settle(phone, 400);
  const narrow = await frame.evaluate(() => {
    const card = document.getElementById("decision-reach");
    const box = card?.getBoundingClientRect();
    return {
      scroll: card?.scrollWidth ?? 0,
      client: card?.clientWidth ?? 0,
      right: box?.right ?? 0,
      chipsRight: Math.max(
        0,
        ...[...(card?.querySelectorAll("[data-option]") ?? [])].map(
          (one) => one.getBoundingClientRect().right
        )
      ),
    };
  });
  const card = await cardOf(frame, "reach");
  kit.check(
    "(g) 320: a several-pick card of three long unbroken labels, all picked, stays open and inside its card",
    card.open &&
      card.old === 0 &&
      card.marked.length === 3 &&
      narrow.chipsRight > 0 &&
      narrow.chipsRight <= narrow.right &&
      narrow.scroll <= narrow.client,
    JSON.stringify({ card, narrow })
  );
  await phone.close();
};

/** An option's pick as the accessibility tree has it: its role and name (Playwright's aria snapshot) and its description (aria-describedby resolved). */
const pickRead = async (frame: Frame, option: string) => {
  const pick = frame.locator(`[data-option="${option}"]`);
  return {
    aria: (await pick.ariaSnapshot()).split("\n")[0] ?? "",
    description: await pick.evaluate((button) =>
      (button.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
    ),
  };
};

/**
 * (g) 320, in one theme: an option with a cost line, a long unbroken label
 * and a live embed fits its card; its pick is named by its label alone and
 * described by its line, its cost and Recommended.
 */
const fitLeg = async (on: On, theme: "light" | "dark") => {
  const { kit, writer } = on;
  const phone = await kit.page("phone", { theme });
  await phone.setViewportSize({ width: 320, height: 844 });
  await open(phone, `${on.base}/session/${writer}`, '[data-slot="pane"]');
  const frame = await until(
    `320 ${theme}: the fit page in the panel`,
    async () => {
      const at = await frameAt(phone, FRAME);
      return (await countIn(at, "#decision-fit")) > 0 ? at : null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  if (!frame) {
    kit.check(`(g) 320 ${theme}: the fit page draws`, false, "no frame");
    await phone.close();
    return;
  }
  await until(
    `320 ${theme}: the option's embed live`,
    () =>
      frame.evaluate(
        () =>
          document.querySelector<HTMLIFrameElement>(
            "#decision-fit [data-slot=option-media] iframe"
          )?.contentDocument?.body?.textContent ?? ""
      ),
    (words) => words.includes("slides"),
    30_000
  ).catch(() => "");
  await settle(phone, 600);
  const fit = await frame.evaluate(() => {
    const card = document.getElementById("decision-fit");
    const root = document.documentElement;
    const cardBox = card?.getBoundingClientRect();
    const embed = card
      ?.querySelector("[data-slot=option-media] iframe")
      ?.getBoundingClientRect();
    const cost = card?.querySelector<HTMLElement>(
      '[data-option-for="wide"][id$="-cost"]'
    );
    const line = cost
      ? Number.parseFloat(getComputedStyle(cost).lineHeight)
      : 0;
    const box = (b: DOMRect | undefined) =>
      b && {
        left: Math.round(b.left),
        right: Math.round(b.right),
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
      };
    return {
      width: root.clientWidth,
      frame: { scroll: root.scrollWidth, client: root.clientWidth },
      card: card && { scroll: card.scrollWidth, client: card.clientWidth },
      cardBox: box(cardBox),
      embed: box(embed),
      cost: cost && {
        height: Math.round(cost.getBoundingClientRect().height),
        line,
        lines: Math.round(cost.getBoundingClientRect().height / line),
      },
    };
  });
  kit.check(
    `(g) 320 ${theme}: an option with a cost, a long unbroken label and a live embed fits: card and frame scroll no wider than they are, the embed inside the card, the cost line wrapped`,
    phone.viewportSize()?.width === 320 &&
      fit.frame.scroll === fit.frame.client &&
      !!fit.card &&
      fit.card.scroll === fit.card.client &&
      !!fit.cardBox &&
      !!fit.embed &&
      fit.embed.left >= fit.cardBox.left &&
      fit.embed.right <= fit.cardBox.right &&
      fit.embed.top >= fit.cardBox.top &&
      fit.embed.bottom <= fit.cardBox.bottom &&
      !!fit.cost &&
      fit.cost.lines >= 2,
    JSON.stringify(fit)
  );
  const wide = await pickRead(frame, "wide");
  const plain = await pickRead(frame, "plain");
  // A program's option is its group's radio (ui/option-group).
  const named = await frame
    .getByRole("radio", { name: FIT_LABEL, exact: true })
    .count();
  kit.check(
    `(g) 320 ${theme}: a pick is named by its label alone (a radio of its card's group), its line, cost and Recommended its description`,
    named === 1 &&
      wide.aria.startsWith(`- radio "${FIT_LABEL}"`) &&
      wide.description ===
        `${decisionsWords.gets("Closer to readers.")} ${decisionsWords.costs(FIT_COST)} ${decisionsWords.recommended}` &&
      plain.aria.startsWith('- radio "The hub"') &&
      plain.description ===
        `${decisionsWords.gets("Nothing new to run.")} ${decisionsWords.costs("Readers far from the hub wait longer.")}`,
    JSON.stringify({ named, wide, plain })
  );
  await phone.close();
};

/** One card whose options say what picking each means building, beside the same card without it (the owner, 10-23: "what needs to be built for each"). */
const TRAY_WHY = "A tray keeps the board still while a machine joins.";
const TRAY_OPTIONS = [
  {
    id: "board",
    label: "On the board",
    line: "Machines appear where they run.",
    cost: "The board shifts as one joins.",
    builds: "Nothing: today's behaviour.",
    recommended: false,
    current: true,
  },
  {
    id: "tray",
    label: "In a tray",
    line: "One place for every new machine.",
    cost: "One more surface to learn.",
    builds: "A new tray component and an onboarding step.",
    recommended: true,
    current: false,
  },
] as const;
/** The tray card as a page: each option's `builds` given, or none (the program as it was before `builds` came in). */
const trayPage = (name: string, builds: boolean) => {
  const options = TRAY_OPTIONS.map(
    (option) =>
      `${option.id} = Option("${option.id}", "${option.label}", "${option.line}", ${option.recommended}, [], "${option.cost}"${builds ? `, ${option.current}, "${option.builds}"` : ""})`
  );
  return `root = Decisions("Plan the tray", [${name}])
${name} = Decision("${name}", "Where do new machines show up?", [board, tray], "${TRAY_WHY}")
${options.join("\n")}`;
};

/** A card as drawn: its advice line, and each option's parts by their ids (line, cost, builds), with their boxes and the rows its cell spans. */
const partsOf = (frame: Frame, card: string) =>
  frame.evaluate((id) => {
    const root = document.getElementById(`decision-${id}`);
    const box = (el: Element | null) => {
      const b = el?.getBoundingClientRect();
      return b
        ? {
            top: Math.round(b.top),
            bottom: Math.round(b.bottom),
            left: Math.round(b.left),
            right: Math.round(b.right),
          }
        : null;
    };
    const options = [
      ...(root?.querySelectorAll<HTMLElement>("[data-option]") ?? []),
    ].map((chip) => {
      const option = chip.dataset.option ?? "";
      const part = (which: string) =>
        document.getElementById(`option-${id}--${option}-${which}`);
      const cell = chip.closest<HTMLElement>("[data-slot=option-cell]");
      return {
        option,
        line: part("line")?.textContent?.trim() ?? null,
        cost: part("cost")?.textContent?.trim() ?? null,
        builds: part("builds")?.textContent?.trim() ?? null,
        costBox: box(part("cost")),
        buildsBox: box(part("builds")),
        rows: cell ? getComputedStyle(cell).gridRowEnd : "",
      };
    });
    return {
      why: root?.querySelector("[data-slot=why]")?.textContent?.trim() ?? "",
      card: box(root),
      buildsLines: root?.querySelectorAll('[id$="-builds"]').length ?? 0,
      options,
    };
  }, card);

/**
 * (m) The advisor's view and what each option builds (the owner, 10-23: "i
 * don't know what the advisor's opinion are on these picks and what's the
 * tradeoff and what needs to be built for each"). A card whose options carry
 * `builds` draws each option's Builds line in its own card, under its Costs
 * line, every builds line on one row across the options, and a pick's
 * description reads its Gets, Costs and Builds; the why reads as the
 * recommendation, naming the recommended option by its label. The same card
 * without `builds` (the program as written before it came in) draws no
 * builds line and its cells span the chip, line and cost rows alone, its
 * Gets and Costs and its advice as the other's.
 */
const buildsLeg = async (on: On) => {
  const { fleet, kit, writer } = on;
  const desk = await kit.page("desk", { theme: "light" });
  const recommended = TRAY_OPTIONS.find((option) => option.recommended);
  const advice = decisionsWords.advice(recommended?.label ?? "", TRAY_WHY);
  const gets = (option: (typeof TRAY_OPTIONS)[number]) =>
    decisionsWords.gets(option.line);
  const costs = (option: (typeof TRAY_OPTIONS)[number]) =>
    decisionsWords.costs(option.cost);
  for (const builds of [true, false]) {
    const name = builds ? "builds" : "nobuilds";
    const leg = builds ? "with builds" : "without builds";
    const made = await fleet.api<{ id: string }>(
      `/api/instances/${writer}/artifacts`,
      {
        kind: "page",
        does: "pick",
        ask: "Pick where new machines show up",
        name,
        program: trayPage(name, builds),
      }
    );
    await desk.goto(`${on.base}/artifact/${made.id}`, {
      waitUntil: "domcontentloaded",
    });
    const frame = await until(
      `(m) the ${name} page's host frame`,
      async () => {
        for (const one of desk.frames()) {
          if ((await countIn(one, `#decision-${name} [data-option]`)) === 2) {
            return one;
          }
        }
        return null;
      },
      Boolean,
      60_000
    ).catch(() => null);
    if (!frame) {
      kit.check(`(m) ${leg}: the page draws`, false, "no frame");
      continue;
    }
    await settle(desk, 400);
    const parts = await partsOf(frame, name);
    const described = await Promise.all(
      TRAY_OPTIONS.map((option) => pickRead(frame, option.id))
    );
    kit.check(
      `(m) ${leg}: the why reads as the recommendation, naming the recommended option ("${advice}")`,
      parts.why === advice,
      JSON.stringify({ why: parts.why })
    );
    const each = TRAY_OPTIONS.map((option, at) => ({
      option,
      drawn: parts.options.find((one) => one.option === option.id),
      description: described[at]?.description ?? "",
    }));
    if (builds) {
      const inside = (
        b: { left: number; right: number; top: number; bottom: number } | null
      ) =>
        !!b &&
        !!parts.card &&
        b.left >= parts.card.left &&
        b.right <= parts.card.right &&
        b.top >= parts.card.top &&
        b.bottom <= parts.card.bottom;
      kit.check(
        `(m) ${leg}: each option's Builds line is in its card, under its Costs line, its Gets and Costs labelled, and the builds lines share a row`,
        parts.buildsLines === 2 &&
          each.every(
            ({ option, drawn }) =>
              !!drawn &&
              drawn.builds === decisionsWords.builds(option.builds) &&
              drawn.line === gets(option) &&
              drawn.cost === costs(option) &&
              inside(drawn.buildsBox) &&
              !!drawn.costBox &&
              !!drawn.buildsBox &&
              drawn.buildsBox.top >= drawn.costBox.bottom
          ) &&
          new Set(parts.options.map((one) => one.buildsBox?.top)).size === 1,
        JSON.stringify(parts)
      );
      kit.check(
        `(m) ${leg}: a pick's description reads its Gets, Costs and Builds, then its badge`,
        each.every(
          ({ option, description }) =>
            description ===
            [
              gets(option),
              costs(option),
              decisionsWords.builds(option.builds),
              option.recommended
                ? decisionsWords.recommended
                : decisionsWords.current,
            ].join(" ")
        ),
        JSON.stringify(each.map(({ description }) => description))
      );
      // Decided: the record keeps each option's builds, and log.md says
      // what the pick costs and builds.
      await frame.locator(`#decision-${name} [data-option=tray]`).click();
      await until(
        "(m) the tray pick on the hub",
        async () =>
          (
            await fleet.api<{ state: Doc["state"] }>(
              `/api/instances/${writer}/artifacts/${made.id}`
            )
          ).state[name]?.options ?? [],
        (options) => options.includes("tray"),
        20_000
      ).catch(() => undefined);
      const decided = await fleet.api<{
        record: {
          cards: {
            options: { builds?: string; cost: string; id: string }[];
          }[];
        } | null;
      }>(`/api/projects/${on.projectId}/decisions/${name}/tasks`, {});
      const log = await fleet
        .api<{ content: string }>(
          `/api/projects/${on.projectId}/folder/file?path=${encodeURIComponent(`decisions/${name}/log.md`)}`
        )
        .then((file) => file.content)
        .catch((error: unknown) => String(error));
      const [board, tray] = TRAY_OPTIONS;
      kit.check(
        "(m) decided, the record keeps each option's builds, and log.md says what the pick costs and builds, each line with its own ending and no doubled period",
        TRAY_OPTIONS.every(
          (option) =>
            decided.record?.cards[0]?.options.find(
              (one) => one.id === option.id
            )?.builds === option.builds
        ) &&
          log.includes(`- ${decisionsWords.costs(tray.cost)}`) &&
          log.includes(`- ${decisionsWords.builds(tray.builds)}`) &&
          // Each line keeps its own ending: the option turned down closes
          // its sentence with its line's one period, and nothing doubles one.
          log.includes(`${board.label} — ${board.line}\n`) &&
          !log.includes(".."),
        `${JSON.stringify(decided.record?.cards[0]?.options)} | ${log}`
      );
    } else {
      kit.check(
        `(m) ${leg}: no builds line, each cell spans its chip, line and cost rows alone, its Gets and Costs as with builds, and its description as before builds came in`,
        parts.buildsLines === 0 &&
          each.every(
            ({ option, drawn, description }) =>
              !!drawn &&
              drawn.builds === null &&
              drawn.line === gets(option) &&
              drawn.cost === costs(option) &&
              drawn.rows === "span 3" &&
              description ===
                [
                  gets(option),
                  costs(option),
                  ...(option.recommended ? [decisionsWords.recommended] : []),
                ].join(" ")
          ),
        JSON.stringify({ parts, described: each.map((one) => one.description) })
      );
    }
  }
  await desk.close();
};

/** (d) Open as canvas: the flowchart becomes a canvas in the session's panel. */
const openAsCanvas = async (on: On) => {
  const { desk, fleet, kit, writer } = on;
  await fleet
    .api(`/api/instances/${writer}/artifacts/${on.page}/show`, {})
    .catch(() => undefined);
  const back = await frameWith(desk, 4).catch(() => null);
  if (!back) {
    kit.check("(d) the decision page is back in the panel", false, "no frame");
    return;
  }
  await settle(desk, 300);
  // The page's foot holds the DialKit panel, floating: the button goes to the view's top, clear of it.
  await back
    .locator("#decision-stack [data-open-canvas]")
    .first()
    .evaluate((button) => button.scrollIntoView({ block: "start" }));
  await pressIn(back, "#decision-stack [data-open-canvas] >> nth=0");
  const opened = await until(
    "the diagram's canvas",
    () =>
      fleet.api<{ kind: string; name: string }[]>(
        `/api/instances/${writer}/artifacts`
      ),
    (list) =>
      list.some(
        (one) => one.kind === "canvas" && one.name.startsWith(`${NAME}-`)
      ),
    30_000
  ).catch(() => []);
  kit.check(
    "(d) Open as canvas makes the flowchart a canvas in the session's panel",
    opened.some((one) => one.kind === "canvas" && one.name === `${NAME}-flow`),
    JSON.stringify(opened)
  );
};

/** A Dials panel's values in the frame's DialKit store, by its name; null while it has none. */
const panelValues = (frame: Frame, name: string) =>
  frame.evaluate((panelName) => {
    const store = (
      window as unknown as {
        DialKit?: {
          DialStore: {
            getPanels: (kind: string) => { id: string; name: string }[];
            getValues: (id: string) => Record<string, unknown>;
          };
        };
      }
    ).DialKit?.DialStore;
    const panel = store
      ?.getPanels("panel")
      .find((one) => one.name === panelName);
    return panel && store ? store.getValues(panel.id) : null;
  }, name);

/**
 * Dials: a value set in DialKit's panel reaches the hub under dials by panel
 * name and path (the kit's dials.js, as an HTML page's), and after a reload
 * the panel starts from the hub's value.
 */
const dialChecks = async (on: On, frame: Frame) => {
  const { desk, kit } = on;
  await frame.evaluate(() => {
    const store = (
      window as unknown as {
        DialKit: {
          DialStore: {
            getPanels: (kind: string) => { id: string; name: string }[];
            updateValues: (id: string, values: object) => void;
          };
        };
      }
    ).DialKit.DialStore;
    const panel = store.getPanels("panel").find((one) => one.name === "Card");
    if (panel) {
      store.updateValues(panel.id, { radius: 20 });
    }
  });
  const tuned = await until(
    "the dial's value on the hub",
    on.read,
    (r) =>
      (r.state.dials?.value as Record<string, Record<string, unknown>> | null)
        ?.Card?.radius === 20,
    10_000
  ).catch(() => null);
  await desk.reload({ waitUntil: "domcontentloaded" });
  const again = await frameWith(desk, 3);
  const restored = await until(
    "the panel restored from the hub after a reload",
    () => panelValues(again, "Card"),
    (values) => values?.radius === 20,
    20_000
  ).catch(() => null);
  kit.check(
    "Dials: a value set in DialKit's panel reaches the hub as dials.Card.radius, and comes back from the hub after a reload",
    !!tuned && restored?.radius === 20,
    JSON.stringify({ hub: tuned?.state.dials, restored })
  );
  return again;
};

/** The Preview's status lines the plan card's embed said, as a page recorded them from its first paint. */
const RECORD_STATUS = () => {
  const seen: string[] = [];
  (window as unknown as { kitStatusSeen: string[] }).kitStatusSeen = seen;
  new MutationObserver(() => {
    for (const line of document.querySelectorAll(
      '#decision-plan p[role="status"]'
    )) {
      const words = line.textContent?.trim() ?? "";
      if (words && !seen.includes(words)) {
        seen.push(words);
      }
    }
  }).observe(document, { childList: true, subtree: true, characterData: true });
};

/**
 * The Real Wait Rule on Preview's embed: an origin that answers within
 * `--dur-wait-grace` shows the frame and no line; one whose ping is held past
 * it says "Opening the preview launch-site…" until it answers.
 */
const waitChecks = async (on: On) => {
  const { base, kit, writer } = on;
  const quick = await kit.page("desk", {
    theme: "light",
    init: [RECORD_STATUS],
  });
  await open(quick, `${base}/session/${writer}`, '[data-slot="pane"]');
  const quickFrame = await frameWith(quick, 4);
  await until(
    "the embed framed",
    () =>
      quickFrame.locator("#decision-plan iframe[data-shape=screen]").count(),
    (count) => count > 0,
    30_000
  ).catch(() => 0);
  const quickSaw = await quickFrame.evaluate(
    () =>
      (window as unknown as { kitStatusSeen?: string[] }).kitStatusSeen ?? []
  );
  kit.check(
    "Preview: an embed that answers within --dur-wait-grace shows its frame and no wait line",
    quickSaw.length === 0,
    JSON.stringify(quickSaw)
  );
  await quick.close();

  const held = await kit.page("desk", {
    theme: "light",
    init: [RECORD_STATUS],
  });
  await held.route("**/__cawco/ping", async (route) => {
    const at = new URL(route.request().url());
    if (at.port !== "" && route.request().frame() !== held.mainFrame()) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    await route.continue();
  });
  await open(held, `${base}/session/${writer}`, '[data-slot="pane"]');
  const heldFrame = await frameWith(held, 4);
  await until(
    "the embed framed after its held ping",
    () => heldFrame.locator("#decision-plan iframe[data-shape=screen]").count(),
    (count) => count > 0,
    30_000
  ).catch(() => 0);
  const heldSaw = await heldFrame.evaluate(
    () =>
      (window as unknown as { kitStatusSeen?: string[] }).kitStatusSeen ?? []
  );
  const lineNow = await heldFrame
    .locator('#decision-plan p[role="status"]')
    .textContent();
  kit.check(
    "Preview: an embed whose ping is held past --dur-wait-grace says it is opening, then shows its frame and clears the line",
    heldSaw.includes("Opening the preview launch-site…") &&
      (lineNow ?? "").trim() === "",
    JSON.stringify({ saw: heldSaw, now: lineNow })
  );
  await held.close();
};

/** What stood of the host card and its Open to draw, and why it read hidden: said when it never stood in view. */
const hostCardRead = async (desk: Page, selector: string): Promise<string> => {
  try {
    const now = await frameWith(desk, 4);
    const stood = await now.evaluate((sel) => {
      const card = document.querySelector("#decision-host");
      const button = document.querySelector<HTMLElement>(sel);
      return {
        card: card
          ? `${card.getAttribute("data-state") ?? ""} ${card.getAttribute("aria-expanded") ?? ""} ${Math.round(card.getBoundingClientRect().height)}px`
          : "none",
        open: button
          ? `${button.localName} visible ${button.checkVisibility()} ${Math.round(button.getBoundingClientRect().height)}px`
          : "none",
      };
    }, selector);
    return JSON.stringify(stood);
  } catch (error) {
    return String(error);
  }
};

/** Canvas: Open to draw brings the canvas to the front of the panel. */
const openToDraw = async (on: On) => {
  const { desk, fleet, kit } = on;
  await fleet
    .api(`/api/instances/${on.writer}/artifacts/${on.page}/show`, {})
    .catch(() => undefined);
  // The show draws the page at a new revision: the pane swaps its frame.
  // Found again until its Open to draw stands in view.
  const OPEN =
    "#decision-host [data-slot=media] :is([data-open-canvas], [data-open-draw])";
  let frame: Frame;
  try {
    frame = (await until(
      "the host card open, its Open to draw in view",
      async () => {
        const now = await frameWith(desk, 4);
        const shows = await now
          .evaluate(
            (selector) =>
              !!document
                .querySelector<HTMLElement>(selector)
                ?.checkVisibility(),
            OPEN
          )
          .catch(() => false);
        return shows ? now : null;
      },
      Boolean,
      30_000
    )) as Frame;
  } catch (error) {
    throw new Error(`${String(error)} (${await hostCardRead(desk, OPEN)})`, {
      cause: error,
    });
  }
  const canvasId = await frame
    .locator('iframe[src*="/__cawco/canvas/"]')
    .getAttribute("src")
    .then((src) => src?.split("/")[3] ?? "");
  await pressIn(frame, `${OPEN} >> nth=0`);
  const shown = await until(
    "the canvas at the front of the panel",
    () => fleet.api<{ shown: boolean }>(`/api/artifacts/${canvasId}`),
    (read) => read.shown,
    20_000
  ).catch(() => null);
  kit.check(
    "Canvas: Open to draw brings the canvas to the front of the session's panel",
    !!shown?.shown,
    JSON.stringify({ canvasId, shown })
  );
  await fleet
    .api(`/api/instances/${on.writer}/artifacts/${on.page}/show`, {})
    .catch(() => undefined);
};

/** A page whose option embeds the dev server's preview, live. */
const embedPage = (site: string) => `root = Decisions("Pick the host", [where])
where = Decision("where", "Where does the site run?", [here, there], "It runs on the machine today.")
here = Option("here", "Here", "As it runs now.", true, [live], "Nothing new to try.")
there = Option("there", "Elsewhere", "Somewhere new.", false, [], "A move to make first.")
live = Preview("${site}", "The site as it runs")`;

/** A page of one card whose options show `sketch` (a Canvas) and `live` (a Preview). */
const treePage = (
  sketch: string,
  live: string
) => `root = Decisions("Pick the delegate's look", [look])
look = Decision("look", "Which look does the page take?", [drawn, running], "The delegate made both.", [sketch])
drawn = Option("drawn", "As drawn", "The delegate's sketch.", true, [], "Not yet built.")
running = Option("running", "As it runs", "The delegate's dev server.", false, [live], "Built in a hurry.")
sketch = Canvas("${sketch}", "The delegate's sketch")
live = Preview("${live}", "The delegate's site")`;

/** What the delegate's dev server says. */
const TREE_SITE = "The delegate's site";

/**
 * (p) A decision page shows its delegation tree's artifacts as its own: a
 * delegate of the writer (spawned with `parent`, in the same project) makes
 * a canvas with a box drawn on it and a preview of its own dev server, and
 * the writer's page whose Canvas and Preview name them publishes and draws
 * them in the writer's panel: the canvas's frame on the page's origin with
 * the delegate's box in its doc, and the dev server live on its embed
 * origin, as a Preview of a component canvas is. A canvas of a session of
 * the project outside the tree is still refused, 422, with today's words.
 */
const treeMediaLeg = async (on: On) => {
  const { base, fleet, kit, projectId, writer } = on;
  const dir = join(fleet.sandbox, "launch-site");
  const delegate = await fleet.spawn("claude", "Launch delegate", dir, {
    projectId,
    parent: { instanceId: writer },
  });
  const outsider = await fleet.spawn("claude", "Launch outsider", dir, {
    projectId,
  });
  const made = (who: string) => (body: object) =>
    fleet.api<{ id: string }>(`/api/instances/${who}/artifacts`, body);
  // The delegate's canvas, empty first, then drawn once its screen is up in
  // the delegate's own panel, as `publish` draws the writer's.
  const own = await kit.page("desk", { theme: "light" });
  await open(own, `${base}/session/${delegate}`, '[data-slot="pane"]');
  const sketch = await made(delegate)({
    kind: "canvas",
    does: "draw",
    ask: "Draw over this sketch",
    name: "delegate-sketch",
  });
  await until(
    "the delegate's canvas screen in its panel",
    async () =>
      countIn(
        await frameAt(own, 'iframe[title="Canvas"]'),
        ".excalidraw canvas"
      ),
    (count) => count > 0,
    120_000
  );
  const box = await fetch(
    `${fleet.base}/api/instances/${delegate}/artifacts/${sketch.id}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        elements: [
          {
            type: "rectangle",
            id: "delegate-box",
            x: 0,
            y: 0,
            width: 200,
            height: 80,
            label: { text: "Delegate box" },
          },
        ],
      }),
    }
  );
  kit.check(
    "(p) the delegate's canvas is drawn on its own screen",
    box.ok,
    (await box.text()).slice(0, 300)
  );
  await own.close();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><html><body><h1>${TREE_SITE}</h1></body></html>`,
        { headers: { "content-type": "text/html" } }
      ),
  });
  const site = await made(delegate)({
    kind: "preview",
    does: "try",
    ask: "Try this page and say whether it works",
    name: "delegate-site",
    port: server.port,
    machine: MACHINE,
  });
  const page = await made(writer)({
    kind: "page",
    does: "pick",
    ask: "Pick the delegate's look",
    name: "delegate-look",
    program: treePage(sketch.id, site.id),
  }).then(
    (answer) => answer,
    (error: Error) => ({ id: "", said: error.message })
  );
  const rows = fleet.query<{ id: string; instance_id: string }>(
    "SELECT id, instance_id FROM artifacts WHERE id IN (?, ?)",
    sketch.id,
    site.id
  );
  kit.check(
    "(p) the writer's page whose Canvas and Preview name its delegate's canvas and preview publishes, and both stay the delegate's",
    !!page.id &&
      rows.length === 2 &&
      rows.every((row) => row.instance_id === delegate),
    JSON.stringify({ page, rows })
  );
  if (!page.id) {
    server.stop(true);
    return;
  }
  const shown = await kit.page("desk", { theme: "light" });
  shown.on("pageerror", (error) => on.said.push(`(p): ${String(error)}`));
  await open(shown, `${base}/session/${writer}`, '[data-slot="pane"]');
  const frame = await until(
    "the delegate's page in the writer's panel",
    async () => {
      const at = await frameAt(shown, FRAME);
      return (await countIn(at, "#decision-look")) > 0 ? at : null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  if (!frame) {
    kit.check("(p) the page draws in the writer's panel", false, "no frame");
    await shown.close();
    server.stop(true);
    return;
  }
  const drawnIn = () =>
    frame.evaluate(
      ([id, siteId]) => {
        const canvas = document.querySelector<HTMLIFrameElement>(
          `iframe[src*="/__cawco/canvas/${id}/"]`
        );
        const doc = (
          canvas?.contentWindow as unknown as {
            cawcoCanvasDoc?: {
              getArray: (name: string) => {
                toArray: () => { get: (key: string) => unknown }[];
              };
            };
          } | null
        )?.cawcoCanvasDoc;
        return {
          canvas:
            !!canvas?.contentDocument?.querySelector(".excalidraw canvas"),
          elements: (doc?.getArray("elements").toArray() ?? []).map(
            (one) => (one.get("el") as { id?: string } | undefined)?.id ?? ""
          ),
          site:
            document.querySelector<HTMLIFrameElement>(
              `#decision-look iframe[data-cawco-artifact="${siteId}"]`
            )?.src ?? "",
          gone: document.querySelectorAll(
            "#decision-look [data-slot=media-gone]"
          ).length,
        };
      },
      [sketch.id, site.id] as const
    );
  const drawn = await until(
    "the delegate's canvas drawn in the page",
    drawnIn,
    (seen) => seen.canvas && seen.elements.includes("delegate-box"),
    30_000
  ).catch(drawnIn);
  kit.check(
    "(p) the delegate's canvas is drawn in the writer's page, on the page's origin, its box in the canvas's doc",
    drawn.canvas && drawn.elements.includes("delegate-box"),
    JSON.stringify(drawn)
  );
  // An embed out of view gets no animation frames: the option's in view.
  await frame
    .locator('#decision-look [data-option="running"]')
    .scrollIntoViewIfNeeded();
  const live = await until(
    "the delegate's dev server live in the page",
    async () => wordsAt(shown, (await drawnIn()).site),
    (words) => words === TREE_SITE,
    30_000
  ).catch(() => "");
  const after = await drawnIn();
  kit.check(
    "(p) the delegate's preview is live in the writer's page, on an origin of its own",
    live === TREE_SITE &&
      after.gone === 0 &&
      new URL(after.site || "http://x").port !== new URL(frame.url()).port,
    JSON.stringify({ live, src: after.site, gone: after.gone })
  );
  await shown.close();
  server.stop(true);

  const theirs = await made(outsider)({
    kind: "canvas",
    does: "draw",
    ask: "Draw on this canvas",
    name: "outsider-sketch",
  });
  const refused = await made(writer)({
    kind: "page",
    does: "pick",
    ask: "Pick the outsider's look",
    name: "outsider-look",
    program: treePage(theirs.id, site.id),
  }).then(
    (answer) => `kept ${JSON.stringify(answer)}`,
    (error: Error) => error.message
  );
  kit.check(
    "(p) a page naming the canvas of a session outside the tree is refused, 422, with today's words",
    refused.includes(
      `: 422 ${artifactToolWords.noMediaArtifact("Canvas", theirs.id)}`
    ),
    refused.slice(0, 400)
  );
};

/** A delegate's page of two cards, for its parent's panel to pick and send. */
const DELEGATE_PLAN = `root = Decisions("Pick the delegate's plan", [shape, pace])
shape = Decision("shape", "Which shape does the plan take?", [lean, broad], "The delegate weighed both.")
lean = Option("lean", "Lean", "One screen first.", true, [], "Less to show at once.")
broad = Option("broad", "Broad", "Every screen at once.", false, [], "A longer wait.")
pace = Decision("pace", "How fast does it ship?", [soon, later], "The delegate weighed both.")
soon = Option("soon", "This week", "Out by Friday.", true, [], "Fewer checks.")
later = Option("later", "Next month", "Out in four weeks.", false, [], "The wait.")`;

/** The person's words on the delegate's page, from the parent's rail. */
const RAIL_WORDS = "From the parent's panel: say more about the lean shape.";
/** The delegate's answer to them. */
const DELEGATE_REPLY = "The delegate: lean means the board alone.";
/** The head of the notice that tells a session its artifact `id` has new responses (core injected.ts `artifactResponsesNotice`): its marker, cut before its other fields. */
const noticeOf = (id: string) =>
  markerTag("artifact-responses", { id }).slice(0, -"]\n".length);
/** The refusal a panel of a session outside the tree hears. */
const NO_SUCH_ARTIFACT = "This session has no such artifact.";

/** More's Comments entry, its count after it. */
const COMMENTS_ITEM = /^Comments/;
/** The Comments rail opened from the panel's head: its Comments, else More's Comments where the head has no room for it. */
const railOpen = async (page: Page) => {
  const toggle = page.locator(`${PANE} button[data-slot="comments"]`).first();
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  } else {
    await page.locator(`${PANE} [data-slot="more"]`).first().click();
    await page.getByRole("menuitem", { name: COMMENTS_ITEM }).click();
  }
  await page
    .locator('[data-slot="comment-rail"]')
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);
};

/**
 * (q) A delegate's page in its parent's panel is the parent's to read,
 * comment on and send: the delegate (spawned with `parent`) publishes a
 * page, the parent's `artifact_show` puts it in the parent's panel, and its
 * Comments rail reads; a comment written from the rail is in the delegate's
 * comment_read, and the delegate's reply draws in the parent's rail. A pick
 * sent by the page's own Send, and a pick sent by the dashboard's Send on the
 * parent's session (the panel head's, Needs you's), each reach the page:
 * the delegate's artifact_read holds them and the delegate is told its page
 * has new responses. A session of the project outside the tree is refused
 * the page's doc socket and its Send, with today's words.
 */
const panelOfTreeLeg = async (on: On) => {
  const { base, fleet, kit, projectId, writer } = on;
  const dir = join(fleet.sandbox, "launch-site");
  const delegate = await fleet.spawn("claude", "Plan delegate", dir, {
    projectId,
    parent: { instanceId: writer },
  });
  const outsider = await fleet.spawn("claude", "Plan outsider", dir, {
    projectId,
  });
  const made = await fleet.api<{ id: string }>(
    `/api/instances/${delegate}/artifacts`,
    {
      kind: "page",
      does: "pick",
      ask: "Pick the delegate's plan",
      name: "delegate-plan",
      program: DELEGATE_PLAN,
    }
  );
  const shown = await kit.page("desk", { theme: "light" });
  shown.on("pageerror", (error) => on.said.push(`(q): ${String(error)}`));
  await open(shown, `${base}/session/${writer}`, '[data-slot="pane"]');
  await fleet.api(`/api/instances/${writer}/artifacts/${made.id}/show`, {});
  const frame = await until(
    "the delegate's page in the parent's panel",
    async () => {
      const at = await frameAt(shown, FRAME);
      return (await countIn(at, "#decision-shape")) > 0 ? at : null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  if (!frame) {
    kit.check(
      "(q) the delegate's page draws in the parent's panel",
      false,
      "no frame"
    );
    await shown.close();
    return;
  }

  // The rail, from the head's Comments: read, never refused.
  await railOpen(shown);
  const rail = shown.locator('[data-slot="comment-rail"]');
  const railState = (): Promise<{ read: boolean; failed: string | null }> =>
    rail
      .evaluate((list) => ({
        read: !!list.querySelector('[data-slot="pin-list-read"]'),
        failed:
          list.querySelector("[data-pin-list-failed]")?.textContent?.trim() ??
          null,
      }))
      .catch(() => ({ read: false, failed: "no rail" }));
  const railRead = await until(
    "the parent's rail read",
    railState,
    (seen) => seen.read || seen.failed !== null,
    20_000
  ).catch(railState);
  kit.check(
    "(q) the Comments rail in the parent's panel reads the delegate's page",
    railRead.read && railRead.failed === null,
    JSON.stringify(railRead)
  );

  // A comment on the whole page, from the rail's own button.
  await rail.getByRole("button", { name: commentWords.onWholePage }).click();
  const composer = shown.locator('[data-slot="pin-composer"]');
  await composer.waitFor({ timeout: 10_000 }).catch(() => undefined);
  await composer.getByRole("combobox").fill(RAIL_WORDS);
  await shown.keyboard.press("Enter");
  await composer
    .waitFor({ state: "detached", timeout: 8000 })
    .catch(() => undefined);
  const delegatePins = async () =>
    (
      await fleet.api<CommentRead>(
        `/api/instances/${delegate}/artifacts/comments?artifact=${made.id}&filter=all`
      )
    ).artifacts.find((one) => one.id === made.id)?.pins ?? [];
  const pinned = await until(
    "the rail's comment in the delegate's comment_read",
    async () =>
      (await delegatePins()).find((pin) => pin.thread[0]?.text === RAIL_WORDS),
    Boolean,
    20_000
  ).catch(() => undefined);
  kit.check(
    "(q) a comment written from the parent's rail is in the delegate's comment_read",
    !!pinned,
    JSON.stringify(
      (await delegatePins()).map((pin) => pin.thread.map((one) => one.text))
    ).slice(0, 400)
  );
  if (pinned) {
    const replied = await fetch(
      `${fleet.base}/api/instances/${delegate}/artifacts/comments/${pinned.id}/reply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: DELEGATE_REPLY }),
      }
    );
    const backLine = () =>
      rail
        .locator('[data-line="back"]')
        .allTextContents()
        .then((lines) => lines.join(" | "));
    const drawn = await until(
      "the delegate's reply in the parent's rail",
      backLine,
      (lines) => lines.includes(DELEGATE_REPLY),
      20_000
    ).catch(backLine);
    kit.check(
      "(q) the delegate's reply draws in the parent's rail",
      replied.ok && drawn.includes(DELEGATE_REPLY),
      `${replied.status}: ${drawn.slice(0, 300)}`
    );
  }

  const delegateRead = () =>
    fleet.api<{ state: Doc["state"] }>(
      `/api/instances/${delegate}/artifacts/${made.id}`
    );
  const notices = () =>
    fleet
      .query<{ body: string }>(
        "SELECT body FROM sent_messages WHERE instance_id = ?",
        delegate
      )
      .filter((each) => each.body.includes(noticeOf(made.id))).length;

  // The page's own Send, pressed with the rail open: in a pane under 640px
  // (this desk's split is 507px) the rail is the well's foot sheet, and the
  // page's frame ends where it begins, so Send stands clear of it.
  const told = { count: 0 };
  const sendClear = async (page: Page, inFrame: Frame, label: string) => {
    const engine = page.context().browser()?.browserType().name() ?? "?";
    const sheetBox = page.locator('[data-slot="rail-sheet"]');
    await sheetBox.waitFor({ timeout: 10_000 }).catch(() => undefined);
    await settle(page, 400);
    const boxes = await page.evaluate((at) => {
      const box = (el: Element | null | undefined) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      };
      return {
        frame: box(document.querySelector(at)),
        sheet: box(document.querySelector('[data-slot="rail-sheet"]')),
      };
    }, FRAME);
    // The page's own box, read by the engine across the frame's origin.
    const sendBox = await inFrame
      .locator("[data-send]")
      .boundingBox({ timeout: 5000 })
      .catch(() => null);
    const read = {
      ...boxes,
      send: sendBox
        ? { x: sendBox.x, y: sendBox.y, w: sendBox.width, h: sendBox.height }
        : null,
    };
    const { frame: framed, send, sheet } = read;
    const clear =
      !!send &&
      !!sheet &&
      !!framed &&
      (send.y + send.h <= sheet.y + 0.5 ||
        send.x + send.w <= sheet.x ||
        send.x >= sheet.x + sheet.w) &&
      framed.y + framed.h <= sheet.y + 0.5;
    // A new pick, so Send has something to send, then a press at its centre.
    const next =
      ((await delegateRead()).state.shape?.options ?? [])[0] === "lean"
        ? "broad"
        : "lean";
    await mode(page, inFrame, "V");
    await pressIn(inFrame, `[data-option="${next}"] >> nth=0`);
    await until(
      `the ${next} pick on the hub`,
      delegateRead,
      (held) => (held.state.shape?.options ?? []).includes(next),
      10_000
    ).catch(() => null);
    const pressed = await pressIn(inFrame, "[data-send]").then(
      () => "pressed",
      (error: Error) => error.message.split("\n")[0] ?? "refused"
    );
    const want = told.count + 1;
    const now = await until(
      "the delegate told of the page's own Send",
      async () => notices(),
      (count) => count >= want,
      20_000
    ).catch(notices);
    told.count = now;
    const after = await delegateRead();
    kit.check(
      `(q) ${engine} ${label}: with the Comments rail's foot sheet open, the page's frame ends where the sheet begins, Send's box clear of the sheet's, and a press at Send's centre sends: the delegate's artifact_read holds the pick and the delegate is told`,
      clear &&
        pressed === "pressed" &&
        now >= want &&
        JSON.stringify(after.state.shape?.options) === JSON.stringify([next]),
      JSON.stringify({ ...read, pressed, told: now, picked: after.state.shape })
    );
  };
  await sendClear(shown, frame, "desk (507px pane)");
  for (const [engine, view] of [
    ["chromium", "phone"],
    ["webkit", "desk"],
    ["webkit", "phone"],
  ] as const) {
    const page = await kit.page(view, { engine, theme: "light" });
    page.on("pageerror", (error) =>
      on.said.push(`(q) ${engine} ${view}: ${String(error)}`)
    );
    await open(page, `${base}/session/${writer}`, '[data-slot="pane"]');
    const inFrame = await until(
      `the delegate's page in the parent's panel, ${engine} ${view}`,
      async () => {
        const at = await frameAt(page, FRAME);
        return (await countIn(at, "#decision-shape")) > 0 ? at : null;
      },
      Boolean,
      60_000
    ).catch(() => null);
    if (inFrame) {
      await railOpen(page);
      await sendClear(
        page,
        inFrame,
        view === "phone" ? "phone (390)" : "desk (507px pane)"
      );
    } else {
      kit.check(
        `(q) ${engine} ${view}: the delegate's page in the parent's panel`,
        false,
        "no frame"
      );
    }
    await page.close();
  }

  // A pick sent by the dashboard's Send on the parent's session.
  await pressIn(frame, '[data-option="soon"] >> nth=0');
  await until(
    "the soon pick on the hub",
    delegateRead,
    (read) => (read.state.pace?.options ?? []).includes("soon"),
    10_000
  ).catch(() => null);
  const postSend = (instance: string) =>
    shown.evaluate(
      async ([who, id]) => {
        const response = await fetch(
          `/api/instances/${who}/artifacts/${id}/send`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ control: "panel-head" }),
          }
        );
        return { status: response.status, text: await response.text() };
      },
      [instance, made.id] as const
    );
  const shapeNow = (await delegateRead()).state.shape?.options;
  const panelSend = await postSend(writer);
  const panelTold = await until(
    "the delegate told of the parent's Send",
    async () => notices(),
    (count) => count > told.count,
    20_000
  ).catch(notices);
  const afterPanel = await delegateRead();
  kit.check(
    "(q) the dashboard's Send on the parent's session reaches the page: 200, the delegate's artifact_read holds both picks and the delegate is told again",
    panelSend.status === 200 &&
      panelTold > told.count &&
      JSON.stringify(afterPanel.state.shape?.options) ===
        JSON.stringify(shapeNow) &&
      JSON.stringify(afterPanel.state.pace?.options) === '["soon"]',
    JSON.stringify({
      panelSend: { ...panelSend, text: panelSend.text.slice(0, 200) },
      panelTold,
      state: afterPanel.state,
    })
  );

  // A session outside the tree: its Send and its doc socket refused.
  const outsiderSend = await postSend(outsider);
  const outsiderSocket = await readWithin(10_000, () =>
    shown.evaluate(
      ([who, id]) =>
        new Promise<{ code: number; reason: string }>((resolve) => {
          const socket = new WebSocket(
            `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/artifact/${who}/${id}`
          );
          socket.addEventListener("close", (event) =>
            resolve({ code: event.code, reason: event.reason })
          );
        }),
      [outsider, made.id] as const
    )
  );
  const closed =
    outsiderSocket.kind === "answered" ? outsiderSocket.value : null;
  kit.check(
    "(q) a session outside the tree is refused the page's Send (404) and its doc socket (4404), with today's words",
    outsiderSend.status === 404 &&
      outsiderSend.text === NO_SUCH_ARTIFACT &&
      closed?.code === 4404 &&
      closed.reason === NO_SUCH_ARTIFACT,
    JSON.stringify({ outsiderSend, outsiderSocket })
  );

  // The screen's thumbnail, kept from the parent's panel as the pane keeps
  // one; an outsider's refused with today's words.
  const picture = new PNG({ width: 4, height: 4 });
  picture.data.fill(200);
  const png = PNG.sync.write(picture).toString("base64");
  const putThumbnail = (instance: string) =>
    shown.evaluate(
      async ([who, id, light]) => {
        const response = await fetch(
          `/api/instances/${who}/artifacts/${id}/thumbnail`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ light, dark: null, single: true }),
          }
        );
        return { status: response.status, text: await response.text() };
      },
      [instance, made.id, png] as const
    );
  const thumbKept = await putThumbnail(writer);
  const served = await fetch(
    `${fleet.base}/api/artifacts/${made.id}/thumbnail/light`
  );
  const servedPng = served.ok
    ? Buffer.from(await served.arrayBuffer()).toString("base64")
    : `${served.status}`;
  kit.check(
    "(q) a thumbnail from the parent's panel is kept: 200, and the page's thumbnail is that picture",
    thumbKept.status === 200 && servedPng === png,
    JSON.stringify({ thumbKept, served: served.status })
  );
  const outsiderThumbnail = await putThumbnail(outsider);
  kit.check(
    "(q) a session outside the tree is refused the page's thumbnail, 404, with today's words",
    outsiderThumbnail.status === 404 &&
      outsiderThumbnail.text === artifactToolWords.noArtifact(made.id),
    JSON.stringify(outsiderThumbnail)
  );
  await shown.close();
};

/** What the crash leg's fresh dev server says. */
const FRESH_SITE = "The fresh site";

/** A page of one plain decision, card `card`. */
const plainPage = (
  card: string,
  ask: string
) => `root = Decisions("${ask}", [${card}])
${card} = Decision("${card}", "${ask}", [yes, no], "Nothing is set yet.")
yes = Option("yes", "Yes", "It is set.", true, [], "One more thing to keep.")
no = Option("no", "No", "It stays unset.", false, [], "Nothing changes.")`;

/**
 * (i) Nothing published takes the hub down: a page whose option embeds a
 * live preview no page embedded before, drawn in the panel (which starts the
 * embed's origin), then a second page right after it, then a third. The
 * hub's process stays the one the fleet started, `/health` answers every 100 ms throughout, each page
 * draws (the first with its embed live), and the hub's log holds no FOREIGN
 * KEY line: an embed's key read as a session's once bound it a session port,
 * whose row the database refused, and that throw in the board's publish
 * timer ended the hub.
 */
const burstLeg = async (on: On) => {
  const { desk, fleet, hub, kit, writer } = on;
  const { pid } = hub;
  const misses: string[] = [];
  let polls = 0;
  const watching: { on: boolean } = { on: true };
  /** One read of `/health`: whether it answered ok within 2 s. */
  const healthy = async () => {
    try {
      const read = await readWithin(2000, (signal) =>
        fetch(`${fleet.base}/health`, { signal })
      );
      return read.kind === "answered" && read.value.ok;
    } catch {
      return false;
    }
  };
  const watch = (async () => {
    while (watching.on) {
      polls += 1;
      if (!(await healthy())) {
        misses.push(new Date().toISOString());
      }
      await Bun.sleep(100);
    }
  })();
  const make = (name: string, program: string) =>
    fleet.api<{ id: string }>(`/api/instances/${writer}/artifacts`, {
      kind: "page",
      does: "pick",
      ask: "Pick one option on each card",
      name,
      program,
    });
  /** The page's card `card` in the desk's panel; null when it never draws. */
  const cardIn = (card: string) =>
    until(
      `#decision-${card} in the panel`,
      async () => {
        const frame = await frameAt(desk, FRAME);
        return (await countIn(frame, `#decision-${card}`)) > 0 ? frame : null;
      },
      Boolean,
      30_000
    ).catch(() => null);
  /** The embed's source in the first page's card, once its page has it. */
  const embedOf = (frame: Frame) => {
    const src = async () => {
      try {
        return await frame
          .locator("#decision-where iframe[data-shape=screen]")
          .first()
          .getAttribute("src", { timeout: 1000 });
      } catch {
        return null;
      }
    };
    return until("the option's embed framed", src, Boolean, 30_000).catch(
      () => null
    );
  };

  // A dev server no page has embedded yet: its embed's key is new to the
  // hub, so the first read of it comes after this page draws. The launch
  // site's key was read long before, by the legs above.
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><html><body><h1>${FRESH_SITE}</h1></body></html>`,
        { headers: { "content-type": "text/html" } }
      ),
  });
  const fresh = await fleet.api<{ id: string }>(
    `/api/instances/${writer}/artifacts`,
    {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name: "fresh-site",
      port: server.port,
      machine: MACHINE,
    }
  );
  const first = await make("host-pick", embedPage(fresh.id)).catch(
    (error: unknown) => ({ id: "", error: String(error) })
  );
  const firstFrame = await cardIn("where");
  const framed = firstFrame ? await embedOf(firstFrame) : null;
  // Right after the embed's origin started: the next publishes.
  const second = await make(
    "second-pick",
    plainPage("tone", "Which tone?")
  ).catch((error: unknown) => ({ id: "", error: String(error) }));
  const third = await make(
    "third-pick",
    plainPage("size", "Which size?")
  ).catch((error: unknown) => ({ id: "", error: String(error) }));
  const thirdDrew = !!(await cardIn("size"));
  // Each page drawn again from the panel, the first with its embed live.
  const shows = async (id: string, card: string) => {
    await fleet
      .api(`/api/instances/${writer}/artifacts/${id}/show`, {})
      .catch(() => undefined);
    return cardIn(card);
  };
  const again = first.id ? await shows(first.id, "where") : null;
  const src = again ? await embedOf(again) : null;
  const live = src
    ? await until(
        "the first page's embed live",
        () => wordsAt(desk, src),
        (words) => words === FRESH_SITE,
        30_000
      ).catch(() => "")
    : "";
  const secondDrew = second.id ? !!(await shows(second.id, "tone")) : false;
  watching.on = false;
  await watch;
  const log = await fleet.logs("hub");
  const foreignKey = log
    .split("\n")
    .filter((line) => line.includes("FOREIGN KEY"));
  const alive = hub.exitCode === null && hub.pid === pid;
  kit.check(
    "(i) the hub outlives three pages published in a row, the first embedding a live preview: its process the same, /health answering throughout",
    alive && misses.length === 0 && polls > 0,
    JSON.stringify({
      pid,
      exitCode: hub.exitCode,
      signal: hub.signalCode,
      polls,
      missed: misses.length,
      firstMiss: misses[0] ?? null,
    })
  );
  kit.check(
    "(i) every page draws: the first with its option's embed live, the second, the third",
    !!framed && live === FRESH_SITE && secondDrew && thirdDrew,
    JSON.stringify({
      first,
      second,
      third,
      framed,
      live,
      secondDrew,
      thirdDrew,
    })
  );
  kit.check(
    "(i) the hub's log holds no FOREIGN KEY line",
    foreignKey.length === 0,
    foreignKey.slice(0, 4).join(" | ") || "none"
  );
  server.stop(true);
};

/** Cards that break the interview's shape: a cost missing, two recommended, none recommended. */
const UNSHAPED = `ship = Decision("ship", "When does it ship?", [soon, slow], "Soon reads as ready.")
soon = Option("soon", "Soon", "Out this week.", true, [], "")
slow = Option("slow", "Later", "Out next month.", true, [], "A month of waiting.")
tone = Decision("tone", "How does it sound?", [calm, loud], "")
calm = Option("calm", "Calm", "Short sentences.", false, [], "Easy to miss.")
loud = Option("loud", "Loud", "Big claims.", false, [], "Hard to trust.")`;
const SHAPED = `root = Decisions("Shape the release", [name])
name = Decision("name", "What is the release called?", [plain, coined], "A plain name needs no explaining.")
plain = Option("plain", "Release 2", "Says what it is.", true, [], "Forgettable.")
coined = Option("coined", "Kestrel", "Memorable.", false, [], "Needs a line to explain it.")`;

/** (k) Check 6: a program out of the interview's shape is refused on create and on revision, every reason at once. */
const interviewShape = async (on: On) => {
  const { fleet, kit, writer } = on;
  const at = `/api/instances/${writer}/artifacts`;
  const wanted = [
    'Decision "ship", option "soon" has no cost: say what picking it costs them, in one line.',
    'Decision "ship" recommends 2 options: mark exactly one.',
    'Decision "tone" recommends nothing: mark exactly one option recommended, and say why in the decision\'s why.',
  ];
  const said = (error: Error) => error.message;
  const created = await fleet
    .api(at, {
      kind: "page",
      name: "unshaped",
      does: "pick",
      ask: "Pick when it ships and how it sounds",
      program: `root = Decisions("Shape the release", [ship, tone])\n${UNSHAPED}`,
    })
    .then((answer) => `kept ${JSON.stringify(answer)}`, said);
  kit.check(
    "(k) a program with a cost missing, two recommended and none recommended is refused on create, 422, all three at once",
    created.includes(": 422 The program has 3 problems:") &&
      wanted.every((line) => created.includes(line)),
    created.slice(0, 600)
  );
  const stored = await fleet
    .api<{ id: string }>(at, {
      kind: "page",
      name: "shaped",
      does: "pick",
      ask: "Pick what the release is called",
      program: SHAPED,
    })
    .then((answer) => answer, said);
  kit.check(
    "(k) a program with every cost, one recommended and a why per card is kept",
    typeof stored !== "string" && !!stored.id,
    JSON.stringify(stored)
  );
  if (typeof stored === "string") {
    return;
  }
  const before = await fleet.api<{ pageHash: string }>(`${at}/${stored.id}`);
  const revised = await fleet
    .api(`${at}/${stored.id}/statements`, {
      statements: `root = Decisions("Shape the release", [name, ship, tone])\n${UNSHAPED}`,
    })
    .then((answer) => `kept ${JSON.stringify(answer)}`, said);
  const after = await fleet.api<{ pageHash: string }>(`${at}/${stored.id}`);
  kit.check(
    "(k) the same cards as a revision of the kept page are refused, all three at once, and the page is unchanged",
    revised.includes(" 422 The program has 3 problems:") &&
      wanted.every((line) => revised.includes(line)) &&
      after.pageHash === before.pageHash,
    `${revised.slice(0, 600)}; hash ${before.pageHash} → ${after.pageHash}`
  );
};

/**
 * (l) What the house faces come to in `frame`: whether Figtree is loaded,
 * and the hero heading's width as drawn, as Figtree alone and as the
 * fallback stack alone (its family list without Figtree), each a copy of
 * the heading laid out on one line.
 */
const facesIn = (frame: Frame) =>
  frame.evaluate(async () => {
    const font = '500 13px "Figtree Variable"';
    await document.fonts.load(font);
    await document.fonts.ready;
    const heading = document.querySelector("h1");
    if (!heading) {
      return null;
    }
    const family = getComputedStyle(heading).fontFamily;
    const widthIn = (stack: string | null) => {
      const copy = heading.cloneNode(true) as HTMLElement;
      copy.style.cssText =
        "position:absolute;visibility:hidden;inset-inline-start:0;width:auto;max-width:none;white-space:nowrap;display:inline-block";
      if (stack !== null) {
        copy.style.fontFamily = stack;
      }
      heading.parentElement?.append(copy);
      const { width } = copy.getBoundingClientRect();
      copy.remove();
      return Math.round(width * 100) / 100;
    };
    const fallback = family
      .split(",")
      .map((name) => name.trim())
      .filter((name) => !name.includes("Figtree"))
      .join(", ");
    return {
      check: document.fonts.check(font),
      family,
      heading: heading.textContent?.trim() ?? "",
      drawn: widthIn(null),
      figtree: widthIn('"Figtree Variable"'),
      fallback: widthIn(fallback),
      loaded: [...document.fonts]
        .filter((face) => face.status === "loaded")
        // Gecko gives a face's family quoted (`"Figtree Variable"`), Blink
        // and WebKit bare: the name, whichever.
        .map(
          (face) =>
            `${face.family.replace(/^"|"$/g, "")} ${face.unicodeRange.slice(0, 14)}`
        ),
    };
  });

/** (l) In `frame`, a page of kind `which`: Figtree loaded, and its heading at Figtree's metrics. */
const facesLeg = async (on: On, frame: Frame, which: string) => {
  const read = await facesIn(frame);
  on.kit.check(
    `(l) ${which}: Figtree is loaded, document.fonts.check('500 13px "Figtree Variable"') holds, and its heading measures as Figtree, not the fallback`,
    !!read &&
      read.check &&
      read.loaded.some((face) => face.startsWith("Figtree Variable")) &&
      Math.abs(read.drawn - read.figtree) < 0.5 &&
      Math.abs(read.drawn - read.fallback) > 1,
    JSON.stringify(read)
  );
};

/** The house's sans face, by the family name its stylesheet gives it. */
const HOUSE_SANS = HOUSE_FACES.find((face) => face.role === "sans")?.family;

/** (l) A page whose option's label holds `label`. */
const glyphPage = (
  label: string
) => `root = Decisions("Attach the brief", [attach])
attach = Decision("attach", "How does a brief take a file?", [clip, drop], "Most briefs carry one file.")
clip = Option("clip", "${label}", "A button beside the brief.", true, [], "One more control in the row.")
drop = Option("drop", "Drop it in", "Drag the file onto the brief.", false, [], "Nothing shows it can be done.")`;

/**
 * (l) How `glyph`, standing in the clip option's label in `frame`, is drawn:
 * its advance there (a box of its own in the label; a Range over the
 * label's own glyph, kept beside it, is whole pixels in WebKit), beside its width on a canvas in
 * the label's font as Figtree alone and as the label's fallback stack
 * alone; and, as the measure's control, ✓ (which Figtree lacks) on the
 * canvas in Figtree-then-fallback and in the fallback alone.
 */
const glyphIn = (frame: Frame, glyph: string) =>
  frame.evaluate(async (char) => {
    const label = [
      ...document.querySelectorAll('#decision-attach [data-option="clip"] *'),
    ].find((el) =>
      [...el.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && node.textContent?.includes(char)
      )
    );
    const text = [...(label?.childNodes ?? [])].find((node) =>
      node.textContent?.includes(char)
    );
    if (!(label && text?.textContent)) {
      return null;
    }
    const style = getComputedStyle(label);
    const fallback = style.fontFamily
      .split(",")
      .map((name) => name.trim())
      .filter((name) => !name.includes("Figtree"))
      .join(", ");
    const lead = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}`;
    await document.fonts.load(`${lead} "Figtree Variable"`, char);
    await document.fonts.ready;
    const range = document.createRange();
    const from = text.textContent.indexOf(char);
    range.setStart(text, from);
    range.setEnd(text, from + char.length);
    // The glyph's advance as the label draws it: a box of its own in the
    // label, whose width is layout's (WebKit snaps a text Range's box out to
    // whole pixels, Blink does not).
    const alone = document.createElement("span");
    alone.textContent = char;
    label.append(alone);
    const advance = alone.getBoundingClientRect().width;
    alone.remove();
    const context = document.createElement("canvas").getContext("2d");
    const width = (family: string, what: string) => {
      if (!context) {
        return -1;
      }
      context.font = `${lead} ${family}`;
      return Math.round(context.measureText(what).width * 100) / 100;
    };
    return {
      family: style.fontFamily,
      spacing:
        style.letterSpacing === "normal"
          ? 0
          : Number.parseFloat(style.letterSpacing),
      label: text.textContent.trim(),
      check: document.fonts.check(`${lead} "Figtree Variable"`, char),
      range: Math.round(range.getBoundingClientRect().width * 100) / 100,
      drawn: Math.round(advance * 100) / 100,
      figtree: width('"Figtree Variable"', char),
      fallback: width(fallback, char),
      control: {
        houseFirst: width(`"Figtree Variable", ${fallback}`, "✓"),
        fallback: width(fallback, "✓"),
      },
    };
  }, glyph);

/**
 * (l) What the house face draws is kept and drawn in it; what it lacks is
 * refused, naming its card, its string and the character. Figtree draws →
 * (its full file serves, not only the web's latin subsets); it lacks ✓ and
 * ⌘, which JetBrains Mono holds but a program's words are never set in, and
 * ⎘, which neither face holds.
 */
const glyphLeg = async (on: On) => {
  const { fleet, kit, writer } = on;
  const at = `/api/instances/${writer}/artifacts`;
  const create = (label: string) =>
    fleet
      .api<{ id: string }>(at, {
        kind: "page",
        name: "attach",
        does: "pick",
        ask: "Pick how a brief takes a file",
        program: glyphPage(label),
      })
      .then(
        (answer) => ({ id: answer.id, said: `kept ${JSON.stringify(answer)}` }),
        (error: Error) => ({ id: "", said: error.message })
      );
  const fault = (label: string, char: string) =>
    `Decision "attach", option "clip": its label “${label}” holds ${char}, which Figtree Variable, the page's face, doesn't draw: it would show as an empty box or in another face.`;
  for (const [label, char, why] of [
    ["✓ Done", "✓ (U+2713)", "Figtree lacks it; JetBrains Mono holds it"],
    ["⌘K to open", "⌘ (U+2318)", "Figtree lacks it; JetBrains Mono holds it"],
    ["⎘ Attach a file", "⎘ (U+2398)", "neither house face holds it"],
  ] as const) {
    const refused = await create(label);
    kit.check(
      `(l) a program whose option label holds ${char} (${why}) is refused, 422, naming its card, its string and the character`,
      refused.said.includes(": 422 ") &&
        refused.said.includes(fault(label, char)),
      refused.said.slice(0, 600)
    );
  }
  const inWords = await create("Attach a file");
  kit.check(
    "(l) the same program with the icon named in words is kept",
    inWords.said.startsWith("kept ") && !!inWords.id,
    inWords.said.slice(0, 300)
  );
  const arrow = await create("Ship A → B");
  kit.check(
    '(l) a program whose option label holds "A → B" is kept',
    arrow.said.startsWith("kept ") && !!arrow.id,
    arrow.said.slice(0, 300)
  );
  if (!arrow.id) {
    return;
  }
  const page = await kit.page("desk", { theme: "light" });
  await page.goto(`${on.base}/artifact/${arrow.id}`, {
    waitUntil: "domcontentloaded",
  });
  const frame = await until(
    "the arrow page's host frame",
    async () => {
      for (const one of page.frames()) {
        if ((await countIn(one, '#decision-attach [data-option="clip"]')) > 0) {
          return one;
        }
      }
      return null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  const read = frame ? await glyphIn(frame, "→") : null;
  kit.check(
    "(l) its → is drawn in Figtree: the label's face is Figtree, document.fonts.check holds for →, the glyph as drawn measures as Figtree's on a canvas and not as the fallback's, and the measure tells a glyph Figtree lacks (✓ falls through to the fallback)",
    !!read &&
      // The family's first name, however the engine writes it out: Blink
      // quotes a name with a space ("Figtree Variable"), WebKit does not.
      read.family.split(",")[0]?.trim().replace(/^"|"$/g, "") === HOUSE_SANS &&
      read.check &&
      Math.abs(read.drawn - read.figtree - read.spacing) < 0.5 &&
      Math.abs(read.figtree - read.fallback) > 0.5 &&
      Math.abs(read.control.houseFirst - read.control.fallback) < 0.01,
    JSON.stringify(read)
  );
  await page.close();
};

/** A page of two cards, the first tall, for a finger's pick on the artifact's own route. */
const TAP_STEPS = Array.from(
  { length: 9 },
  (_, i) => `S${i}[Step ${i + 1}]`
).join(" --> ");
const TAP_PAGE = `root = Decisions("Tap to pick", [tall, second])
tall = Decision("tall", "Which flow does a review take?", [skim, stages], "The flow sets how long a review runs.", [flow])
skim = Option("skim", "One pass", "Read it once, merge.", false, [], "Misses what a second look finds.")
stages = Option("stages", "Three stages: skim, read, merge", "A pass for each.", true, [], "Takes longer.")
flow = Diagram("flowchart TD\\n${TAP_STEPS}", "The flow")
second = Decision("second", "Who merges?", [author, lead], "Someone owns the merge.")
author = Option("author", "The author", "Who wrote it.", true, [], "Marks their own work.")
lead = Option("lead", "The lead", "One gate.", false, [], "A queue at the lead.")`;

/**
 * (g) A finger's pick on the phone, on the artifact's own route (the live
 * dashboard's `/artifact/<id>`): a real tap (`locator.tap()`, touch input in
 * a touch context) on an option picks it and the card stays open; a tap on
 * it again clears it, and a tap on another moves the pick.
 * Every press event the tap makes is heard at the window, first, and at the
 * option, with whether it was cancelled, so a tap that never picks says
 * where it went.
 */
const tapLeg = async (on: On) => {
  const { fleet, kit, writer } = on;
  const made = await fleet.api<{ id: string }>(
    `/api/instances/${writer}/artifacts`,
    {
      kind: "page",
      does: "pick",
      ask: "Pick one option on each card",
      name: "tap",
      program: TAP_PAGE,
    }
  );
  const phone = await kit.page("phone", { theme: "dark" });
  await phone.goto(`${on.base}/artifact/${made.id}`, {
    waitUntil: "domcontentloaded",
  });
  const frame = await until(
    "the tap page's host frame",
    async () => {
      for (const one of phone.frames()) {
        if ((await countIn(one, "#decision-tall")) > 0) {
          return one;
        }
      }
      return null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  if (!frame) {
    kit.check("(g) the tap page draws on the phone", false, "no frame");
    await phone.close();
    return;
  }
  await settle(phone, 600);
  await frame.evaluate(() => {
    const heard: string[] = [];
    (window as unknown as { kitHeard: string[] }).kitHeard = heard;
    const option = document.querySelector(
      '#decision-tall [data-option="stages"]'
    );
    option?.scrollIntoView({ block: "center" });
    for (const type of [
      "pointerdown",
      "touchstart",
      "pointerup",
      "touchend",
      "mousedown",
      "mouseup",
      "click",
    ]) {
      addEventListener(
        type,
        (event) => {
          // Read after every capture listener on the window has run.
          queueMicrotask(() =>
            heard.push(
              `${type}@window${event.defaultPrevented ? " (cancelled)" : ""}`
            )
          );
        },
        { capture: true }
      );
      option?.addEventListener(type, (event) =>
        heard.push(
          `${type}@option${event.defaultPrevented ? " (cancelled)" : ""}`
        )
      );
    }
  });
  await settle(phone, 400);
  // A real finger's touch lands where the option is drawn: its centre, hit
  // tested by the page.
  const under = await frame.evaluate(() => {
    const option = document.querySelector<HTMLElement>(
      '#decision-tall [data-option="stages"]'
    );
    const box = option?.getBoundingClientRect();
    if (!(option && box)) {
      return null;
    }
    const at = document.elementsFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    );
    return {
      top: at[0]?.closest("[data-option]")?.getAttribute("data-option") ?? "",
      stack: at
        .slice(0, 4)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
    };
  });
  await pressIn(frame, '#decision-tall [data-option="stages"]', { tap: true });
  const tapped = await until(
    "the tall card holding the tap's pick",
    () => cardOf(frame, "tall"),
    (card) => JSON.stringify(card.marked) === '["stages"]',
    5000
  ).catch(() => null);
  const heard = await frame.evaluate(
    () => (window as unknown as { kitHeard: string[] }).kitHeard
  );
  kit.check(
    "(g) 390 dark, a finger: a tap on an option on the artifact's own route picks it and the card stays open, no Continue, Change or fold",
    under?.top === "stages" && !!tapped && tapped.open && tapped.old === 0,
    JSON.stringify({ under, tapped, heard })
  );
  // A tap on the chosen option clears it (the overlay's pick, preview-overlay
  // pick.ts), for a finger as for a mouse; a tap on another moves the pick.
  await settle(phone, 600);
  await pressIn(frame, '#decision-tall [data-option="stages"]', { tap: true });
  const cleared = await until(
    "the tall card's pick cleared by a tap",
    () => cardOf(frame, "tall"),
    (card) => card.marked.length === 0,
    5000
  ).catch(() => null);
  await pressIn(frame, '#decision-tall [data-option="skim"]', { tap: true });
  const moved = await until(
    "the tall card's pick moved by a tap",
    () => cardOf(frame, "tall"),
    (card) => JSON.stringify(card.marked) === '["skim"]',
    5000
  ).catch(() => null);
  kit.check(
    "(g) 390 dark, a finger: a tap on the chosen option clears it, and a tap on another picks it, the card open throughout",
    !!cleared && cleared.open && !!moved && moved.open && moved.old === 0,
    JSON.stringify({ cleared, moved })
  );
  await phone.close();
};

/** (r)'s canvas: the dashboard's Needs you card, whose sheet brings the dashboard's artifact doc, Yjs and its icons. */
const HEAVY = "src/lib/cawco/home/NeedsCard.stories.ts";
const HEAVY_ID = idOf("heavy-needs");
const HEAVY_PAGE = "dozen";
/** How long (r)'s embed origin holds each answer: the hops between the owner's browser and a stage hold a request in flight, where a loopback answers it at once. Ours. */
const HEAVY_HOLD_MS = 20;
/** The stories each of (r)'s twelve Previews names, as a page shows a canvas's takes beside each other. */
const HEAVY_TAKES = [
  ["Issue"],
  ["Comment"],
  ["GitLab"],
  ["LongNames"],
  ["LongNamesNarrow"],
  ["Budget"],
  ["Issue", "Comment"],
  ["GitLab", "Budget"],
  ["LongNames", "Issue"],
  ["Comment", "GitLab"],
  ["Budget", "LongNamesNarrow"],
  ["Issue", "GitLab", "Budget"],
] as const;
const previewOf = (take: readonly string[], at: number) =>
  `p${at} = Preview("${HEAVY_ID}", "Take ${at + 1}", [${take.map((one) => `"${one}"`).join(", ")}])`;
/** The cards of (r)'s page: six, two options each, a Preview in each option, so the page stands taller than its view and its middle has cards above and below. */
const HEAVY_CARDS = ["t0", "t1", "t2", "t3", "t4", "t5"] as const;
/** Six cards of two options, a Preview each: twelve embeds of one canvas on one page. */
const HEAVY_PROGRAM = [
  `root = Decisions("Twelve takes of one card", [${HEAVY_CARDS.join(", ")}])`,
  ...HEAVY_CARDS.flatMap((card, at) => [
    `${card} = Decision("${card}", "Which take of the card reads right, ${at + 1} of 6?", [${card}a, ${card}b], "Each option shows a take of the same card.")`,
    `${card}a = Option("${card}a", "Take ${at * 2 + 1}", "This take of the card.", true, [p${at * 2}], "The other take.")`,
    `${card}b = Option("${card}b", "Take ${at * 2 + 2}", "That take of the card.", false, [p${at * 2 + 1}], "The first take.")`,
  ]),
  ...HEAVY_TAKES.map(previewOf),
].join("\n");

/** What an embed drew, read in its own frame: its failure line, and each rest frame's story and box. */
function dozenRead() {
  return {
    failed:
      document.querySelector(".cawco-section-failed")?.textContent?.trim() ??
      null,
    frames: [
      ...document.querySelectorAll<HTMLElement>(
        '.cawco-frame[data-cawco-interaction="rest"]'
      ),
    ].map((frame) => {
      const box = frame
        .querySelector(".cawco-frame-body")
        ?.getBoundingClientRect();
      return {
        story: frame.dataset.cawcoStory ?? "",
        w: Math.round(box?.width ?? 0),
        h: Math.round(box?.height ?? 0),
      };
    }),
  };
}

/**
 * (r)'s clock, in every frame of the page: the decision page stamps each
 * iframe with when it got its address (`data-kit-src-at`); an embed keeps
 * when its stories stood mounted, its states file's whole graph fetched
 * (a rest frame in its grid, runtime.ts `showSection`), or its section said
 * it failed (`__kitDrewAt`). Wall-clock ms, one clock across the frames.
 * Each frame's own status says drawn a report later, past this.
 */
function dozenClock(): void {
  const own = window as unknown as { __kitDrewAt?: number };
  if (location.pathname.includes("/@cawco/canvas")) {
    const mark = () => {
      const done =
        document.querySelector(".cawco-section-failed") !== null ||
        document.querySelector(
          '.cawco-frame[data-cawco-interaction="rest"]'
        ) !== null;
      if (done && own.__kitDrewAt === undefined) {
        own.__kitDrewAt = Date.now();
      }
    };
    new MutationObserver(mark).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    return;
  }
  const kit = window as unknown as { __kitScrolled?: number };
  const wells = () => [
    ...document.querySelectorAll<HTMLElement>("[data-slot=media]"),
  ];
  /** The page's own scroller (Decisions.svelte `page-scroll`): its cards scroll in it, not in the window. */
  const scroller = () =>
    document.querySelector<HTMLElement>("[data-slot=page-scroll]");
  const inView = (el: Element) => {
    const box = el.getBoundingClientRect();
    const view = scroller()?.getBoundingClientRect();
    return (
      box.bottom > (view?.top ?? 0) &&
      box.top < (view?.bottom ?? window.innerHeight)
    );
  };
  const embedOf = (well: Element) =>
    well.querySelector<HTMLIFrameElement>("iframe[data-slot=embed]");
  const stamp = (el: Node) => {
    if (
      el instanceof HTMLIFrameElement &&
      el.getAttribute("src") &&
      !el.dataset.kitSrcAt
    ) {
      el.dataset.kitSrcAt = String(Date.now());
      // Where its picture stood as it got its turn, and how many in view still waited for theirs.
      const well = el.closest("[data-slot=media]");
      el.dataset.kitInView = well && inView(well) ? "1" : "0";
      el.dataset.kitWaitingInView = String(
        wells().filter((one) => one !== well && inView(one) && !embedOf(one))
          .length
      );
    }
  };
  // The page scrolled to its middle the moment its last card stands, before any Preview has its turn.
  const scrollToMiddle = () => {
    const last = document.getElementById("decision-t5");
    if (kit.__kitScrolled !== undefined || !last) {
      return;
    }
    const page = scroller();
    if (!page) {
      return;
    }
    page.scrollTop = (page.scrollHeight - page.clientHeight) / 2;
    kit.__kitScrolled = page.scrollTop;
  };
  new MutationObserver((changes) => {
    scrollToMiddle();
    for (const change of changes) {
      stamp(change.target);
      for (const added of change.addedNodes) {
        stamp(added);
        if (added instanceof Element) {
          for (const inner of added.querySelectorAll("iframe")) {
            stamp(inner);
          }
        }
      }
    }
  }).observe(document, {
    attributeFilter: ["src"],
    attributes: true,
    childList: true,
    subtree: true,
  });
}

/**
 * (r)'s look at the waits, on the decision page: every 50 ms until each
 * picture stands drawn, a well holds its drawn frame or its skeleton with a
 * box, pulsing (`kit-skeleton-pulse` running); anything else is an empty
 * box, kept with what the well held (`__kitWait`).
 */
function dozenWaits(): void {
  if (location.pathname.includes("/@cawco/canvas")) {
    return;
  }
  const wells = () => [
    ...document.querySelectorAll<HTMLElement>("[data-slot=media]"),
  ];
  const embedOf = (well: Element) =>
    well.querySelector<HTMLIFrameElement>("iframe[data-slot=embed]");
  // Every 50 ms until each picture stands drawn: a well holds its drawn frame, or its pulsing skeleton with a box; anything else is an empty box.
  const wait = { empty: [] as string[], samples: 0, skeletons: 0, still: 0 };
  (window as unknown as { __kitWait?: typeof wait }).__kitWait = wait;
  /** What a well holds now: its drawn frame, its skeleton (pulsing or still), or what stands in an empty box. */
  const holds = (well: Element): "drawn" | "pulse" | "still" | string => {
    const frame = embedOf(well);
    if (frame?.dataset.drawn !== undefined && frame.dataset.shape === "drawn") {
      return "drawn";
    }
    const skeleton = well.querySelector<HTMLElement>(
      "[data-slot=embed-wait] [data-slot=skeleton]"
    );
    const box = skeleton?.getBoundingClientRect();
    if (!(skeleton && box && box.width > 0 && box.height > 0)) {
      const held = frame
        ? `frame ${frame.dataset.shape}, ${frame.dataset.drawn === undefined ? "not loaded" : "loaded"}`
        : "no frame";
      const stood = skeleton
        ? `skeleton ${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}`
        : "no skeleton";
      return `${held}, ${stood}`;
    }
    return skeleton
      .getAnimations()
      .some(
        (one) =>
          one instanceof CSSAnimation &&
          one.animationName === "kit-skeleton-pulse" &&
          one.playState === "running"
      )
      ? "pulse"
      : "still";
  };
  const sample = setInterval(() => {
    const all = wells();
    if (all.length === 0) {
      return;
    }
    let waitingNow = 0;
    all.forEach((well, at) => {
      const now = holds(well);
      if (now === "drawn") {
        return;
      }
      waitingNow += 1;
      wait.samples += 1;
      if (now === "pulse" || now === "still") {
        wait.skeletons += 1;
        wait.still += now === "still" ? 1 : 0;
      } else if (wait.empty.length < 8) {
        wait.empty.push(`picture ${at + 1}: ${now}`);
      }
    });
    if (waitingNow === 0) {
      clearInterval(sample);
    }
  }, 50);
}

/** One embed of (r)'s page, as its Preview named it and as it drew. */
interface DozenEmbed {
  /** When its frame got its address, and when it mounted its stories (`dozenClock`). */
  at: number;
  drew: number | null;
  /** Its picture stood in view as it got its turn, and how many in view still waited for theirs then. */
  inView: boolean;
  named: string[];
  read: ReturnType<typeof dozenRead> | null;
  take: string;
  /** Its frame's height on the page, px: the shape it said. */
  tall: number;
  waitingInView: number;
}

/** Each embed on the page open in `page`, read in its own frame. */
async function dozenEmbeds(page: Page): Promise<DozenEmbed[]> {
  const embeds: DozenEmbed[] = [];
  for (const handle of await page.$$(EMBED_FRAME)) {
    const named = new URL(
      (await handle.getAttribute("src")) ?? "http://x/"
    ).searchParams.getAll("story");
    const frame = await handle.contentFrame();
    embeds.push({
      named,
      take: named.join("+"),
      at: Number(await handle.getAttribute("data-kit-src-at")),
      inView: (await handle.getAttribute("data-kit-in-view")) === "1",
      waitingInView: Number(
        await handle.getAttribute("data-kit-waiting-in-view")
      ),
      read: frame ? await frame.evaluate(dozenRead) : null,
      tall: Math.round((await handle.boundingBox())?.height ?? 0),
      drew:
        (await frame?.evaluate(
          () => (window as unknown as { __kitDrewAt?: number }).__kitDrewAt
        )) ?? null,
    });
  }
  return embeds;
}

/** What an embed shows that is not its Preview's stories drawn: its failure line, another set of stories, a frame without a box. */
const dozenFaults = (one: DozenEmbed): string[] => {
  if (!one.read) {
    return [`${one.take}: no frame`];
  }
  const stories = one.read.frames.map((frame) => frame.story);
  return [
    ...(one.read.failed ? [`${one.take}: ${one.read.failed}`] : []),
    ...(stories.join() === one.named.join()
      ? []
      : [
          `${one.take}: draws ${stories.join(", ") || "nothing"} of ${one.named.join(", ")}`,
        ]),
    ...one.read.frames
      .filter((frame) => frame.w <= 0 || frame.h <= 0)
      .map((frame) => `${one.take}/${frame.story}: ${frame.w}×${frame.h}`),
  ];
};

/** Each embed that got its address before the one given its address before it had mounted its stories. */
const dozenOverlaps = (order: DozenEmbed[]): string[] =>
  order.flatMap((one, at) => {
    const before = order[at - 1];
    if (!before || (before.drew !== null && one.at >= before.drew)) {
      return [];
    }
    return [
      before.drew === null
        ? `${one.take} began with ${before.take} never drawn`
        : `${one.take} began ${before.drew - one.at} ms before ${before.take} drew`,
    ];
  });

/**
 * (r)'s canvas drawn on the stage's own port, twice, as a canvas the person
 * was shown: the stage then preloads its whole graph into every embed of it
 * (stage-host host.ts `preloadsOf`). Answers how many modules the second
 * open preloaded.
 */
async function warmDozen(kit: Kit, stagePort: number): Promise<number> {
  let preloads = 0;
  for (const _ of [1, 2]) {
    const first = await kit.page("desk", { theme: "light" });
    await first.goto(
      `http://127.0.0.1:${stagePort}/@cawco/canvas?file=${encodeURIComponent(HEAVY)}&by=embed&story=Issue`,
      { waitUntil: "load" }
    );
    await first
      .waitForFunction(
        () =>
          document.querySelector(
            '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status[data-state="drawn"]'
          ) !== null,
        undefined,
        { timeout: STAGE_START_MS, polling: 250 }
      )
      .catch(() => undefined);
    preloads = await first.evaluate(
      () => document.querySelectorAll('link[rel="modulepreload"]').length
    );
    await first.close();
  }
  return preloads;
}

/** (r) on one engine: the page of twelve opened fresh, each embed read once all stand at their shape. */
async function dozenOn(
  kit: Kit,
  engine: "chromium" | "webkit",
  pageUrl: string,
  preloads: number
): Promise<void> {
  const leg = `(r) ${engine}, 1440 light, twelve Previews of ${HEAVY.split("/").at(-1)}`;
  const page = await kit.page("desk", {
    engine,
    theme: "light",
    init: [CAWCO_BRIDGE, dozenClock, dozenWaits],
  });
  const started = Date.now();
  await page.goto(pageUrl, { waitUntil: "load" });
  const shaped = await until(
    `${leg}: every Preview at its drawn shape`,
    () =>
      page.evaluate(
        (selector) =>
          [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (one) => one.dataset.shape === "drawn"
          ).length,
        EMBED_FRAME
      ),
    (count) => count === HEAVY_TAKES.length,
    STAGE_START_MS
  ).catch(() => -1);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const embeds = await dozenEmbeds(page);
  const faults = embeds.flatMap(dozenFaults);
  kit.check(
    `${leg}: all ${HEAVY_TAKES.length} at their drawn shape (${shaped === -1 ? "not all" : shaped} in ${seconds} s, ${preloads} modules preloaded each), none failed, every story it names drawn with a box`,
    shaped === HEAVY_TAKES.length &&
      embeds.length === HEAVY_TAKES.length &&
      faults.length === 0,
    [
      ...faults,
      ...embeds.map(
        (one) =>
          `${one.take} ${(one.read?.frames ?? []).map((frame) => `${frame.w}×${frame.h}`).join(" ")}`
      ),
    ].join("\n    ")
  );
  // One at a time: each embed got its address only once the one before it had mounted its stories (Preview's turn, ended by the embed's shape, said once it drew).
  const order = [...embeds].sort((a, b) => a.at - b.at);
  const overlaps = dozenOverlaps(order);
  kit.check(
    `${leg}: the page loads its canvases one at a time, each once the one before it drew (${overlaps.length} began early)`,
    embeds.length === HEAVY_TAKES.length &&
      embeds.every((one) => one.at > 0) &&
      overlaps.length === 0,
    [
      ...overlaps,
      ...order.map(
        (one) =>
          `${one.take}: address at +${one.at - started} ms, drew at ${one.drew === null ? "never" : `+${one.drew - started} ms`}`
      ),
    ].join("\n    ")
  );
  // A take of one story stands exactly as tall as that story: nothing under it, wherever on the page it drew.
  const ones = embeds.filter((one) => one.named.length === 1);
  const off = ones.filter(
    (one) => Math.abs(one.tall - (one.read?.frames[0]?.h ?? 0)) > 2
  );
  kit.check(
    `${leg}: each take of one story stands as tall as its story, within 2px (${ones.length - off.length} of ${ones.length})`,
    ones.length > 0 && off.length === 0,
    ones
      .map(
        (one) =>
          `${one.take}: its frame ${one.tall}px, its story ${one.read?.frames[0]?.h ?? 0}px`
      )
      .join("\n    ")
  );
  await waitAndViewChecks(kit, leg, page, order);
  await page.close();
}

/**
 * (r)'s waits as the page held them: every sample of a picture not yet
 * drawn stood its skeleton with a box, pulsing; and, the page scrolled to its
 * middle before any turn, no picture out of view got its turn while one in
 * view still waited.
 */
async function waitAndViewChecks(
  kit: Kit,
  leg: string,
  page: Page,
  order: DozenEmbed[]
): Promise<void> {
  const wait = await page.evaluate(() => {
    const held = window as unknown as {
      __kitScrolled?: number;
      __kitWait?: {
        empty: string[];
        samples: number;
        skeletons: number;
        still: number;
      };
    };
    return { scrolled: held.__kitScrolled ?? null, ...held.__kitWait };
  });
  kit.check(
    `${leg}: a picture waiting its turn or loading is never an empty box: its skeleton stands with a box, pulsing (${wait.samples ?? 0} samples of a picture not yet drawn, ${wait.skeletons ?? 0} its skeleton, ${wait.empty?.length ?? 0} empty, ${wait.still ?? 0} still)`,
    (wait.samples ?? 0) > 0 &&
      (wait.empty?.length ?? 1) === 0 &&
      wait.skeletons === wait.samples &&
      wait.still === 0,
    (wait.empty ?? []).join("\n    ") || "none empty"
  );
  const early = order.filter((one) => !one.inView && one.waitingInView > 0);
  const seen = order.filter((one) => one.inView).length;
  kit.check(
    `${leg}: scrolled to the page's middle (${wait.scrolled ?? "not scrolled"} px), the pictures in view get their turn before those above and below (${seen} in view as their turn came, ${order.length - seen} out of it; ${early.length} out of view went ahead of one in view)`,
    wait.scrolled !== null &&
      (wait.scrolled ?? 0) > 0 &&
      seen > 0 &&
      seen < order.length &&
      early.length === 0,
    order
      .map(
        (one) =>
          `${one.take}: ${one.inView ? "in view" : "out of view"}, ${one.waitingInView} in view still waiting`
      )
      .join("\n    ")
  );
}

/** (r): a dozen Previews of one heavy canvas on one page, each drawn whole, in Chromium and WebKit. */
async function dozenLeg(kit: Kit): Promise<void> {
  let refusal = "";
  try {
    checkProgram(HEAVY_PROGRAM);
  } catch (error) {
    refusal = (error as Error).message;
  }
  kit.check(
    "(r) the hub's check keeps the page of twelve Previews",
    refusal === "",
    refusal
  );
  const stage = await startDecisionStage(
    new Map([[HEAVY_PAGE, HEAVY_PROGRAM]]),
    { [HEAVY_ID]: [HEAVY] },
    { root: APP, kit: true },
    {},
    new Set(),
    HEAVY_HOLD_MS
  );
  try {
    const preloads = await warmDozen(kit, stage.stagePort);
    for (const engine of ["chromium", "webkit"] as const) {
      await dozenOn(kit, engine, stage.pageUrl(HEAVY_PAGE, "light"), preloads);
    }
  } finally {
    await stage.stop();
  }
}

const run = async (kit: Kit) => {
  // `DECISION_PAGES=embeds`: (r) alone, which stands no fleet.
  if (process.env.DECISION_PAGES === "embeds") {
    await dozenLeg(kit);
    return;
  }
  const on = await publish(kit, await standUp(kit));
  for (const view of ["desk", "phone"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await mediaLeg(on, view, theme);
    }
  }
  // `DECISION_PAGES=a`: (a) and (d) alone, as `PROBE_ENGINE` runs them on
  // each engine.
  if (process.env.DECISION_PAGES === "a") {
    return;
  }
  await facesLeg(on, await frameWith(on.desk, 3), "a program's page");
  await dialChecks(on, await frameWith(on.desk, 3));
  await embedLeg(on, await frameWith(on.desk, 3));
  const first = await marks(on, await frameWith(on.desk, 3));
  await drawOverEmbed(on, await frameWith(on.desk, 3));
  await commentInEmbed(on, await frameWith(on.desk, 3));
  await switchLeg(on, await frameWith(on.desk, 3));
  await turnLeg(on, await frameWith(on.desk, 3));
  await insertAhead(on, first);
  for (const theme of ["light", "dark"] as const) {
    await foldLeg(on, theme);
  }
  await waitChecks(on);
  await graphChecks(on);
  await makeTasks(on);
  await htmlPage(on);
  const html = await until(
    "the HTML page in the panel",
    async () => {
      const frame = await frameAt(on.desk, FRAME);
      return (await countIn(frame, '[data-cawco-choice="mode"]')) > 0
        ? frame
        : null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  if (html) {
    await facesLeg(on, html, "an HTML page");
  } else {
    on.kit.check("(l) an HTML page: its frame in the panel", false, "none");
  }
  await reachLeg(on);
  await tapLeg(on);
  await on.fleet.api(`/api/instances/${on.writer}/artifacts`, {
    kind: "page",
    does: "pick",
    ask: "Pick one option on each card",
    name: "fit",
    program: fitPage(on.mockup),
  });
  for (const theme of ["light", "dark"] as const) {
    await fitLeg(on, theme);
  }
  await buildsLeg(on);
  await openToDraw(on);
  await openAsCanvas(on);
  // Last: their pages take the panel's front and join the project's graph, which (c) counts.
  await interviewShape(on);
  await glyphLeg(on);
  await burstLeg(on);
  await treeMediaLeg(on);
  await panelOfTreeLeg(on);
  await dozenLeg(kit);
  kit.check(
    "the pages said no error",
    on.said.length === 0,
    on.said.slice(0, 6).join(" | ") || "none"
  );
};

const spec: Spec = { name: "decision-pages", run };
export default spec;
