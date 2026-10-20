/**
 * Decision pages as OpenUI programs (Projects spec §5.8, the owner's picks
 * of 2026-10-18), on a scratch fleet (real hub, agent and sessiond; the
 * writer a Claude Code session against the mock model, its artifacts made
 * through the hub's artifact routes as artifact_create makes them) and the
 * built dashboard. Read from the engine: the panel frame's DOM and computed
 * styles, the page's doc (`window.cawcoArtifact.doc`) and the hub's reads.
 *
 *   bun scripts/probe-kit/run.ts decision-pages
 *
 * (a) A page of three decisions (one in a Section) and every media piece
 *     built (Image, Diagram, Canvas, Preview, Dials) draws in the panel's
 *     frame, in light and dark, at 390 and 1440: its cards, each piece
 *     there and loaded, and an overflow sweep that finds nothing past the
 *     frame's width.
 * (b) A pick writes `state.<id>` with the program's hash; a Comment pin and
 *     an ink stroke anchor by the card's id; a revision (statements) that
 *     puts a decision ahead keeps the pin on its card, the ink on its
 *     options and the pick marked, and the next pick carries the new hash.
 * (c) The graph is derived: a card per decision, an edge per `after`, a
 *     frame per Section; a drag's place is kept in the page's state under
 *     `graph.places` and survives a revision; the Decisions tab's graph
 *     draws its cards and edges.
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
 * (g) A pick selects and the card stays open with Continue; Continue folds
 *     it to one line (the chosen option's chip, named "Decided: Astro", and
 *     Change), its body and the turned-down option folded away, focus on
 *     the next open card's first option, or Send with none left; in light
 *     and dark, Change reopens it with focus on the pick and the hub's
 *     picks the same as before, and Continue folds it again. A finger's tap
 *     on the artifact's own route picks and Continue folds; a tap on the
 *     chosen option of a reopened card keeps it. At 390 under a finger Change's hit
 *     area reaches 44px; at 320 a several-pick card of three long unbroken
 *     labels folds inside its card. A click inside an option's embed
 *     reaches the embed and picks nothing.
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
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Locator, Page } from "playwright-core";
import { PNG } from "pngjs";
import { readWithin } from "../../../packages/core/src/bounded";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  open,
  pressIn,
  type Spec,
  settle,
} from "../kit";

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

const docOf = (frame: Frame): Promise<Doc> =>
  frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: { getMap: (name: string) => { toJSON: () => unknown } };
        };
      }
    ).cawcoArtifact;
    return {
      ink: doc.getMap("ink").toJSON(),
      pins: doc.getMap("pins").toJSON(),
      state: doc.getMap("state").toJSON(),
    } as Doc;
  });

const SAVE_PIN = /^(Comment|Reply|Send)$/;

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

/** A card's fold as the frame draws it: its mark, its line, its button, what of it shows, and where focus is. */
const foldOf = (frame: Frame, id: string) =>
  frame.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    // A folded body stands at no height and no opacity (motion/fold), so
    // what shows is read with its opacity.
    const seen = (el: Element | null | undefined) =>
      !!el?.checkVisibility({ opacityProperty: true });
    const active = document.activeElement as HTMLElement | null;
    const holder = active?.closest<HTMLElement>("[data-cawco-choice]");
    return {
      decided: !!root?.hasAttribute("data-decided"),
      // A decided card's line is its chosen options, named "Decided: …" for
      // a screen reader; an open card's head is its question alone.
      line:
        root
          ?.querySelector("header [data-slot=decided]")
          ?.getAttribute("aria-label") ?? "",
      chips: [
        ...(root?.querySelectorAll<HTMLElement>("header [data-pick]") ?? []),
      ].map((one) => one.dataset.pick ?? ""),
      // Change as it stands: one fading out of an opening card is leaving.
      button:
        root
          ?.querySelector("[data-leaves]:not([data-leaving]) [data-change]")
          ?.textContent?.trim() ?? "",
      next: !!root?.querySelector("[data-continue]"),
      body: seen(root?.querySelector("[data-slot=options]")),
      options: [...(root?.querySelectorAll<HTMLElement>("[data-option]") ?? [])]
        .filter(seen)
        .map((one) => one.dataset.option ?? ""),
      marked: [
        ...(root?.querySelectorAll<HTMLElement>("[data-cawco-picked]") ?? []),
      ].map((one) => one.dataset.option ?? ""),
      height: Math.round(root?.getBoundingClientRect().height ?? 0),
      focus: {
        option: active?.dataset.option ?? "",
        button: active?.hasAttribute("data-change")
          ? (active.textContent?.trim() ?? "")
          : "",
        inCard: !!(active && root?.contains(active)),
        // Where a fold the person made sends focus: the next open card's
        // first option, or Send with none left.
        onward:
          !!active &&
          (active.matches("[data-send]") ||
            (!!holder &&
              holder !== root &&
              !holder.hasAttribute("data-decided") &&
              holder.querySelector("[data-option]") === active)),
      },
    };
  }, id);

/** Whether `selector` names an element inside the card `id`, on the page as drawn. */
const inCard = (frame: Frame, selector: string | undefined, id: string) =>
  frame.evaluate(
    ([named, card]) =>
      !!named && !!document.querySelector(named)?.closest(`#decision-${card}`),
    [selector ?? "", id] as const
  );

/** A card folded by a pick opened again with Change, so its media can be reached. */
const unfold = async (_page: Page, frame: Frame, id: string) => {
  if ((await foldOf(frame, id)).decided) {
    await pressIn(frame, `#decision-${id} [data-change] >> nth=0`);
  }
};

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
 * Each Canvas piece's frame against its drawing (DESIGN.md item 12: "a
 * canvas is its own box, width-fitted, capped at 80vb"): its box, its well's
 * room and the cap, and the drawing's own bounds read from the canvas's doc
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
        const doc = (
          el.contentWindow as unknown as {
            cawcoArtifact?: {
              doc: {
                getArray: (name: string) => {
                  toArray: () => { get: (key: string) => unknown }[];
                };
              };
            };
          }
        )?.cawcoArtifact?.doc;
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
        cap: Number.parseFloat(getComputedStyle(el).maxBlockSize),
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
  await page
    .locator(`${PANE} [role='tab'][aria-keyshortcuts='${key}']`)
    .click();
  const want = { V: "", C: "comment", D: "draw" }[key];
  await until(
    `the page's mode ${key}`,
    () =>
      frame.evaluate(() => {
        const layer = document
          .querySelector("cawco-overlay")
          ?.shadowRoot?.querySelector(".layer");
        if (layer?.classList.contains("comment")) {
          return "comment";
        }
        return layer?.classList.contains("draw") ? "draw" : "";
      }),
    (now) => now === want,
    5000
  );
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
  const canvases = await until(
    `${leg}: each canvas sized from its drawing`,
    () => canvasBoxes(frame),
    (all) =>
      all.length === 2 && all.every((one) => one.box.h > 0 && !!one.scene),
    30_000
  ).catch(() => canvasBoxes(frame));
  // The frame the canvas's own fit fills: the drawing at the room's width
  // less its 32px each side, the margin round it; past the cap, the cap's
  // height and the width it allows.
  const fitted = (one: (typeof canvases)[number]) => {
    if (!one.scene) {
      return null;
    }
    const m = 32;
    const tall =
      2 * m + (one.scene.height * (one.room - 2 * m)) / one.scene.width;
    return tall <= one.cap
      ? { w: one.room, h: tall }
      : {
          w: 2 * m + (one.scene.width * (one.cap - 2 * m)) / one.scene.height,
          h: one.cap,
        };
  };
  const shapes = canvases.map((one) => ({ ...one, want: fitted(one) }));
  kit.check(
    `(a) ${leg}: each canvas is its drawing's own box, width-fitted under the 80vb cap and centred in its well, a wide one and a tall one (${shapes.map((one) => `“${one.caption}” ${Math.round(one.box.w)}×${Math.round(one.box.h)}, its drawing ${one.scene ? `${Math.round(one.scene.width)}×${Math.round(one.scene.height)}` : "unread"}`).join("; ")})`,
    shapes.length === 2 &&
      shapes.some((one) => one.box.w > one.box.h) &&
      shapes.some((one) => one.box.h > one.box.w) &&
      shapes.every(
        (one) =>
          !!one.want &&
          Math.abs(one.box.w - one.want.w) <= 1 &&
          Math.abs(one.box.h - one.want.h) <= 1 &&
          one.box.h <= one.cap + 0.5 &&
          one.off <= 0.5
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
  await shown.close();
};

/** The moves a loop is drawn by: its press and four sides of 20 steps each. */
const LOOP_MOVES = 81;

/** A loop drawn by the mouse round `box` (the screen's px), outside it by 8px. */
const loopRound = async (
  page: Page,
  box: { height: number; width: number; x: number; y: number }
) => {
  await page.mouse.move(box.x - 8, box.y - 8);
  await page.mouse.down();
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
    "the stack card holding astro, open with Continue",
    () => foldOf(frame, "stack"),
    (fold) => fold.next && JSON.stringify(fold.marked) === '["astro"]',
    10_000
  ).catch(() => null);
  kit.check(
    "(g) a pick selects: astro marked, the card open with Continue, never folded",
    !!chosen && !chosen.decided && chosen.body,
    JSON.stringify(chosen)
  );
  await pressIn(frame, "#decision-stack [data-continue] >> nth=0");
  const folded = await until(
    "the stack card folded",
    () => foldOf(frame, "stack"),
    (fold) => fold.decided && !fold.body,
    10_000
  ).catch(() => null);
  kit.check(
    "(g) Continue folds its card to one line, the chosen option's chip (named Decided: Astro) and Change, its body and the turned-down option hidden, focus on the next open card's first option or Send",
    !!folded &&
      folded.line === "Decided: Astro" &&
      JSON.stringify(folded.chips) === '["astro"]' &&
      folded.button === "Change" &&
      folded.options.length === 0 &&
      folded.focus.onward,
    JSON.stringify(folded)
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
  const pinned = await until(
    "pin 1 in the doc",
    () => docOf(frame),
    (d) => Object.values(d.pins).some((one) => one.number === 1),
    10_000
  ).catch(() => null);
  const pin =
    pinned && Object.values(pinned.pins).find((one) => one.number === 1);
  kit.check(
    "(b) a Comment pin on the stack card anchors by the card's id",
    !!pin?.anchor.selector.includes("#decision-stack"),
    JSON.stringify(pin?.anchor)
  );
  // A pin with words stays when its card closes; an empty one is withdrawn.
  const card = desk.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.getByRole("textbox").fill("This stack, not the other.");
  await card.getByRole("button", { name: SAVE_PIN }).first().click();
  await until(
    "pin 1's words in its thread",
    () => docOf(frame),
    (d) =>
      (
        (
          Object.values(d.pins).find((one) => one.number === 1) as
            { thread?: unknown[] } | undefined
        )?.thread ?? []
      ).length > 0,
    10_000
  ).catch(() => undefined);
  await desk.keyboard.press("Escape");

  await mode(desk, frame, "D");
  // Round the hub's chip: a stroke over the edge option's live embed is the embed's (its frame takes the pointer).
  const options = frame.locator('#decision-host [data-option="hub"]');
  // The chip stands as tall as its cell (the edge option's embed beside it): at the pane's top, so the whole loop is drawn on the page.
  await toPaneTop(options);
  await settle(desk, 300);
  const box = await options.boundingBox();
  if (box) {
    await loopRound(desk, box);
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
    scrollBy(0, -40);
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
  await desk.mouse.move(start[0], start[1]);
  await desk.mouse.down();
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
  await pressIn(frame.frameLocator(EMBED).first(), ".box >> nth=0");
  await desk.emulateMedia({ reducedMotion: null });
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
  // The pin has no words: closing its card withdraws it.
  await desk.keyboard.press("Escape");
  await desk.keyboard.press("Escape");
  await mode(desk, frame, "V");
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
  const placed = await after.evaluate(() => {
    const stack = document
      .querySelector("#decision-stack")
      ?.getBoundingClientRect();
    const disc = document
      .querySelector('svg[data-cawco-pins] g[data-pin="1"] circle')
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
    (body) => body.includes("Make tasks"),
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

/** (g) in one theme: a picked card opens with Change and folds with Continue, the hub's picks untouched. */
const foldLeg = async (on: On, theme: "light" | "dark") => {
  const { kit } = on;
  const shown = await kit.page("desk", { theme });
  await open(shown, `${on.base}/session/${on.writer}`, '[data-slot="pane"]');
  const frame = await frameWith(shown, 4);
  const before = (await on.read()).state.stack;
  const loaded = await until(
    `${theme}: the stack card folded on load`,
    () => foldOf(frame, "stack"),
    (fold) => fold.decided,
    10_000
  ).catch(() => null);
  // The page's media are still loading in: the tap waits for the layout to stand still.
  await settle(shown, 800);
  await pressIn(frame, "#decision-stack [data-change] >> nth=0");
  const opened = await until(
    `${theme}: the stack card open again`,
    () => foldOf(frame, "stack"),
    (fold) => !fold.decided && fold.body,
    10_000
  ).catch(() => null);
  const after = (await on.read()).state.stack;
  kit.check(
    `(g) ${theme}: a card loads folded; Change opens it, both options showing, astro still marked, Continue standing, focus on astro`,
    !!loaded?.decided &&
      loaded.line === "Decided: Astro" &&
      !!opened &&
      JSON.stringify(opened.options.toSorted()) ===
        JSON.stringify(["astro", "svelte"]) &&
      JSON.stringify(opened.marked) === '["astro"]' &&
      opened.next &&
      opened.focus.option === "astro" &&
      opened.height > (loaded?.height ?? 0),
    JSON.stringify({ loaded, opened })
  );
  kit.check(
    `(g) ${theme}: the hub's picks read the same after the fold and Change`,
    !!before && JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify({ before, after })
  );
  await pressIn(frame, "#decision-stack [data-continue] >> nth=0");
  const again = await until(
    `${theme}: the stack card folded by Continue`,
    () => foldOf(frame, "stack"),
    (fold) => fold.decided && !fold.body,
    10_000
  ).catch(() => null);
  kit.check(
    `(g) ${theme}: Continue folds it again, focus on the next open card's first option or Send`,
    !!again &&
      again.line === "Decided: Astro" &&
      !again.body &&
      again.focus.onward,
    JSON.stringify(again)
  );
  await shown.close();
};

/** (g) on a phone: Change's 44px hit area at 390, and a long several-pick fold inside its card at 320. */
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
    "the reach card folded",
    () => foldOf(frame, "reach"),
    (fold) => fold.decided,
    10_000
  ).catch(() => undefined);
  const reach = () =>
    frame.evaluate(() => {
      const card = document.getElementById("decision-reach");
      const change = card?.querySelector<HTMLElement>("[data-change]");
      const box = change?.getBoundingClientRect();
      const hit = change ? getComputedStyle(change, "::after") : null;
      const px = (value: string | undefined) => Number.parseFloat(value ?? "0");
      const cardBox = card?.getBoundingClientRect();
      return {
        width: document.documentElement.clientWidth,
        coarse: matchMedia("(pointer: coarse)").matches,
        box: box && { w: box.width, h: box.height, right: box.right },
        hit: hit && { w: px(hit.width), h: px(hit.height) },
        card: card && {
          scroll: card.scrollWidth,
          client: card.clientWidth,
          right: cardBox?.right ?? 0,
        },
        line:
          card
            ?.querySelector("header [data-slot=decided]")
            ?.getAttribute("aria-label") ?? "",
        chipsRight: Math.max(
          0,
          ...[...(card?.querySelectorAll("header [data-pick]") ?? [])].map(
            (one) => one.getBoundingClientRect().right
          )
        ),
      };
    });
  const wide = await reach();
  kit.check(
    "(g) 390 under a finger: Change's hit area reaches 44px each way, its drawn box smaller",
    wide.coarse &&
      !!wide.box &&
      !!wide.hit &&
      wide.hit.w >= 44 &&
      wide.hit.h >= 44 &&
      wide.box.h < 44,
    JSON.stringify(wide)
  );
  await phone.setViewportSize({ width: 320, height: 844 });
  await settle(phone, 400);
  const narrow = await reach();
  kit.check(
    "(g) 320: a fold of three long unbroken labels stays inside its card, its chosen chips and Change on it",
    !!narrow.card &&
      !!narrow.box &&
      narrow.line.includes("Theweeklynewsletter") &&
      narrow.chipsRight > 0 &&
      narrow.chipsRight <= narrow.card.right &&
      narrow.card.scroll <= narrow.card.client &&
      narrow.box.right <= narrow.card.right,
    JSON.stringify(narrow)
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
      wide.description === `Closer to readers. Cost: ${FIT_COST} Recommended` &&
      plain.aria.startsWith('- radio "The hub"') &&
      plain.description ===
        "Nothing new to run. Cost: Readers far from the hub wait longer.",
    JSON.stringify({ named, wide, plain })
  );
  await phone.close();
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
  await unfold(desk, back, "stack");
  // The tap lands where the button stands once the card has opened and the
  // layout stopped moving: measured mid-unfold, it lands beside it.
  await until(
    "the stack card open",
    () => foldOf(back, "stack"),
    (fold) => !fold.decided,
    10_000
  ).catch(() => null);
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

/** Canvas: Open to draw brings the canvas to the front of the panel. */
const openToDraw = async (on: On) => {
  const { desk, fleet, kit } = on;
  await fleet
    .api(`/api/instances/${on.writer}/artifacts/${on.page}/show`, {})
    .catch(() => undefined);
  // The show draws the page at a new revision: the pane swaps its frame, and
  // a card unfolded in the frame on its way out is folded in the one that
  // stays. Found again and opened until its Open to draw stands in view.
  const OPEN =
    "#decision-host [data-slot=media] :is([data-open-canvas], [data-open-draw])";
  const frame = (await until(
    "the host card open, its Open to draw in view",
    async () => {
      const now = await frameWith(desk, 4);
      await unfold(desk, now, "host").catch(() => undefined);
      const shows = await now
        .evaluate(
          (selector) =>
            !!document.querySelector<HTMLElement>(selector)?.checkVisibility(),
          OPEN
        )
        .catch(() => false);
      return shows ? now : null;
    },
    Boolean,
    30_000
  )) as Frame;
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
 * Continue folds it with the pointer's flow, the chosen option standing in
 * the head and focus going on to the next open card.
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
  await frame.locator('#decision-tall [data-option="stages"]').tap();
  const tapped = await until(
    "the tall card holding the tap's pick",
    () => foldOf(frame, "tall"),
    (fold) => fold.next && JSON.stringify(fold.marked) === '["stages"]',
    5000
  ).catch(() => null);
  const heard = await frame.evaluate(
    () => (window as unknown as { kitHeard: string[] }).kitHeard
  );
  kit.check(
    "(g) 390 dark, a finger: a tap on an option on the artifact's own route picks it and the card stays open, Continue standing in it",
    under?.top === "stages" && !!tapped && !tapped.decided && tapped.body,
    JSON.stringify({ under, tapped, heard })
  );
  await frame.locator("#decision-tall [data-continue]").tap();
  const folded = await until(
    "the tall card folded by Continue",
    () => foldOf(frame, "tall"),
    (fold) => fold.decided && !fold.body,
    5000
  ).catch(() => null);
  kit.check(
    "(g) 390 dark, a finger: a tap on Continue folds the card, the chosen option in the head (named Decided: …), focus on the next open card's first option",
    !!folded &&
      folded.line === "Decided: Three stages: skim, read, merge" &&
      JSON.stringify(folded.chips) === '["stages"]' &&
      folded.focus.onward,
    JSON.stringify(folded)
  );

  // The card opened again by Change keeps its pick, and a tap on the
  // chosen option keeps it (the overlay's pick, preview-overlay pick.ts: a
  // one-pick choice is never let go), for a finger as for a mouse.
  await frame.locator("#decision-tall [data-change]").tap();
  await until(
    "the tall card open again",
    () => foldOf(frame, "tall"),
    (fold) => !fold.decided && fold.body,
    5000
  ).catch(() => null);
  await settle(phone, 600);
  const reopened = await foldOf(frame, "tall");
  await frame.locator('#decision-tall [data-option="stages"]').tap();
  await settle(phone, 600);
  const stayed = await foldOf(frame, "tall");
  kit.check(
    "(g) 390 dark, a finger: on a card opened again by Change, a tap on its chosen option keeps it: still marked, the card open with Continue",
    JSON.stringify(reopened.marked) === '["stages"]' &&
      reopened.next &&
      JSON.stringify(stayed.marked) === '["stages"]' &&
      !stayed.decided &&
      stayed.next,
    JSON.stringify({ reopened, stayed })
  );
  await frame.locator('#decision-tall [data-option="skim"]').tap();
  const moved = await until(
    "the tall card's pick moved by a tap",
    () => foldOf(frame, "tall"),
    (fold) => JSON.stringify(fold.marked) === '["skim"]',
    5000
  ).catch(() => null);
  await frame.locator("#decision-tall [data-continue]").tap();
  const other = await until(
    "the tall card folded again by Continue",
    () => foldOf(frame, "tall"),
    (fold) => fold.decided && !fold.body,
    5000
  ).catch(() => null);
  kit.check(
    "(g) 390 dark, a finger: a tap on another option moves the pick, the card open; Continue folds it, the chip in the head, focus on the next open card's first option",
    !!moved &&
      !moved.decided &&
      !!other &&
      other.line === "Decided: One pass" &&
      JSON.stringify(other.chips) === '["skim"]' &&
      other.focus.onward,
    JSON.stringify({ moved, other })
  );
  await phone.close();
};

const run = async (kit: Kit) => {
  const on = await publish(kit, await standUp(kit));
  for (const view of ["desk", "phone"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await mediaLeg(on, view, theme);
    }
  }
  await dialChecks(on, await frameWith(on.desk, 3));
  await embedLeg(on, await frameWith(on.desk, 3));
  const first = await marks(on, await frameWith(on.desk, 3));
  await drawOverEmbed(on, await frameWith(on.desk, 3));
  await commentInEmbed(on, await frameWith(on.desk, 3));
  await insertAhead(on, first);
  for (const theme of ["light", "dark"] as const) {
    await foldLeg(on, theme);
  }
  await waitChecks(on);
  await graphChecks(on);
  await makeTasks(on);
  await htmlPage(on);
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
  await openToDraw(on);
  await openAsCanvas(on);
  // Last: their pages take the panel's front and join the project's graph, which (c) counts.
  await interviewShape(on);
  await burstLeg(on);
  kit.check(
    "the pages said no error",
    on.said.length === 0,
    on.said.slice(0, 6).join(" | ") || "none"
  );
};

const spec: Spec = { name: "decision-pages", run };
export default spec;
