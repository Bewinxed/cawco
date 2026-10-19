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
 * (g) A pick folds its card to one line ("Decided: Astro", Change), its body
 *     and the turned-down option hidden, focus on Change; in light and dark,
 *     Change reopens it with focus on the pick and the hub's picks the same
 *     as before, and Done folds it again. At 390 under a finger Change's hit
 *     area reaches 44px; at 320 a several-pick card of three long unbroken
 *     labels folds inside its card. A click inside an option's embed
 *     reaches the embed and picks nothing.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { PNG } from "pngjs";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const PANE =
  ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"])';
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
  image: string;
  mockup: string;
  site: string;
}) => `root = Decisions("Shape the launch", [stack, host, later], "Three choices before the launch page is built.")
stack = Decision("stack", "Which stack does the launch page use?", [svelte, astro], "Today: the landing is plain HTML.", [shot, flow])
svelte = Option("svelte", "SvelteKit", "The dashboard's own stack.", true)
astro = Option("astro", "Astro", "Content first, islands where needed.", false, [seq])
host = Decision("host", "Where does the page run?", [hub, edge], "It ships with the hub today.", [sketch, tune], ["stack"])
hub = Option("hub", "The hub", "Nothing new to run.")
edge = Option("edge", "An edge host", "Closer to readers.", false, [motion], "One more host to run.")
later = Section("Later", [plan])
plan = Decision("plan", "When does the plan ship?", [now, after], "The waitlist opens with it.", [gantt, status, site], ["host"])
site = Preview("${ids.site}", "The site as it runs")
status = Row([Text("Ships with the waitlist", "meta"), Badge("Planned", "attn")])
now = Option("now", "With the page")
after = Option("after", "A week after")
shot = Image("${ids.image}", "The landing as it stands: a title and one button", "Today's landing")
flow = Diagram("flowchart LR\\nVisit[Visit] --> Read[Read] --> Join[Sign up]", "The reader's path")
seq = Diagram("sequenceDiagram\\nReader->>Hub: open the page\\nHub-->>Reader: the page, live")
gantt = Diagram("gantt\\ntitle Launch\\ndateFormat YYYY-MM-DD\\nsection Build\\nPage :a1, 2026-10-20, 5d\\nShip :after a1, 2d", "The plan")
sketch = Canvas("${ids.canvas}", "The rough layout")
motion = Preview("${ids.mockup}", "How it moves")
tune = Dials("Card", {radius: [12, 0, 32], accent: "#e65d46"})`;

/** A revision that puts a decision ahead of every other. */
const INSERT = `root = Decisions("Shape the launch", [audience, stack, host, later], "Three choices before the launch page is built.")
audience = Decision("audience", "Who is the page for?", [teams, solo], "Today: no one in particular.")
teams = Option("teams", "Teams")
solo = Option("solo", "Solo builders")`;

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
  ink: Record<string, { anchor?: { selector?: string } }>;
  pins: Record<
    string,
    { anchor: { selector: string; text?: string }; number: number }
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

/** A card's fold as the frame draws it: its mark, its line, its button, what of it shows, and where focus is. */
const foldOf = (frame: Frame, id: string) =>
  frame.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    const shows = (selector: string) =>
      !!root?.querySelector<HTMLElement>(selector)?.checkVisibility();
    const active = document.activeElement as HTMLElement | null;
    return {
      decided: !!root?.hasAttribute("data-decided"),
      line: root?.querySelector("header .dp-state")?.textContent?.trim() ?? "",
      button: root?.querySelector(".dp-change")?.textContent?.trim() ?? "",
      // The body lays out as part of the card (display: contents): its options' grid shows it.
      body: shows(".dp-opts"),
      options: [...(root?.querySelectorAll<HTMLElement>("[data-option]") ?? [])]
        .filter((one) => one.checkVisibility())
        .map((one) => one.dataset.option ?? ""),
      marked: [
        ...(root?.querySelectorAll<HTMLElement>("[data-cawco-picked]") ?? []),
      ].map((one) => one.dataset.option ?? ""),
      height: Math.round(root?.getBoundingClientRect().height ?? 0),
      focus: {
        option: active?.dataset.option ?? "",
        button: active?.classList.contains("dp-change")
          ? (active.textContent?.trim() ?? "")
          : "",
        inCard: !!(active && root?.contains(active)),
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
const unfold = async (page: Page, frame: Frame, id: string) => {
  if ((await foldOf(frame, id)).decided) {
    await tapIn(page, frame, `#decision-${id} .dp-change`);
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
      return (await countIn(frame, "article.dp-card")) === cards ? frame : null;
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
      diagrams: [...document.querySelectorAll(".draw svg.pele")].map(
        (svg) => svg.getAttribute("class") ?? ""
      ),
      canvas: !!canvas?.contentDocument?.querySelector(".excalidraw canvas"),
      preview: preview?.contentDocument?.body?.textContent?.trim() ?? "",
      dials: document.querySelectorAll(".dialkit-root .dialkit-panel").length,
      faces: [...document.fonts]
        .filter((face) => face.status === "loaded")
        .map((face) => face.family),
      row: (() => {
        const row = document.querySelector("#decision-plan .stack");
        const words = row?.querySelector(".text");
        const badge = row?.querySelector(".badge");
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
      opens: [...document.querySelectorAll("figure.diagram")].map(
        (figure) => !!figure.querySelector("button.open")
      ),
      theme: document.documentElement.dataset.theme ?? "",
      site:
        document.querySelector<HTMLIFrameElement>(
          "#decision-plan iframe.screen"
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
    probe.style.color = "var(--surface-page)";
    document.body.append(probe);
    const surface = getComputedStyle(probe).color;
    probe.style.color = "var(--ink-strong)";
    const ink = getComputedStyle(probe).color;
    probe.remove();
    const node = document.querySelector(
      ".draw svg.pele .pele-node :is(rect, path, polygon)"
    );
    const label = document.querySelector(
      ".draw svg.pele .pele-label, .draw svg.pele text"
    );
    return {
      surface,
      ink,
      fill: node ? getComputedStyle(node).fill : "",
      text: label ? getComputedStyle(label).fill : "",
    };
  });

/** A tap at the middle of `selector` in the frame, by the page's mouse. */
const tapIn = async (page: Page, frame: Frame, selector: string) => {
  const target = frame.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error(`${selector} has no box in the frame`);
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return box;
};

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
  kit: Kit;
  page: string;
  program: string;
  projectId: string;
  read: () => Promise<{ pageHash: string; state: Doc["state"] }>;
  said: string[];
  writer: string;
}

/** The fleet up, a project, its writer, the desk on the writer's session. */
const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
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
  return { base, desk, fleet, projectId, said, writer };
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
  const mockup = await make<{ id: string }>({
    kind: "page",
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
    name: "launch-site",
    port: server.port,
    machine: MACHINE,
  });
  const program = programOf({
    canvas: canvas.id,
    mockup: mockup.id,
    image,
    site: site.id,
  });
  const made = await make<{ decisions?: string[]; id: string }>({
    kind: "page",
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
    page: made.id,
    program,
    read: () =>
      fleet.api<{ pageHash: string; state: Doc["state"] }>(
        `/api/instances/${writer}/artifacts/${made.id}`
      ),
    said,
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
    `(a) ${leg}: three cards, the picture loaded, three diagrams, the canvas live, the mockup live, the DialKit panel up, in the host's theme`,
    media.image === 64 &&
      media.diagrams.length === 3 &&
      media.canvas &&
      media.preview.includes("slides") &&
      media.dials === 1 &&
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
  const sweep = await overflowIn(frame);
  kit.check(
    `(a) ${leg}: the overflow sweep finds nothing past the frame's width`,
    sweep.count === 0 && sweep.scroll <= 0,
    JSON.stringify(sweep)
  );
  const types = media.diagrams.map(typeOf);
  const ink = await diagramInk(frame);
  kit.check(
    `(d) ${leg}: a flowchart, a sequence diagram and a Gantt chart drawn by Pele, its nodes on surface-page and its words in ink-strong`,
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
  await tapIn(desk, frame, '[data-option="astro"]');
  const picked = await until(
    "the pick on the hub",
    on.read,
    (r) => (r.state.stack?.options ?? []).includes("astro"),
    10_000
  ).catch(() => null);
  const first = sha256(kept(on.program));
  const folded = await until(
    "the stack card folded",
    () => foldOf(frame, "stack"),
    (fold) => fold.decided && !fold.body,
    10_000
  ).catch(() => null);
  kit.check(
    "(g) a pick folds its card to one line, Decided: Astro and Change, its body and the turned-down option hidden, focus on Change",
    !!folded &&
      folded.line === "Decided: Astro" &&
      folded.button === "Change" &&
      folded.options.length === 0 &&
      folded.focus.button === "Change",
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
  await tapIn(desk, frame, "#decision-stack h2");
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
  await options.scrollIntoViewIfNeeded();
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
    "(b) an ink loop round the host card's hub option anchors inside that card",
    await inCard(frame, group?.anchor?.selector, "host"),
    JSON.stringify(group?.anchor)
  );
  await desk.keyboard.press("Escape");
  await mode(desk, frame, "V");
  return first;
};

/** (g) An option's media is live: a click inside the edge option's embed reaches the embed and picks nothing. */
const embedLeg = async (on: On, frame: Frame) => {
  const { desk, kit } = on;
  await mode(desk, frame, "V");
  await tapIn(desk, frame, "#decision-host .dp-optmedia iframe");
  const heard = await until(
    "the embed heard the click",
    () =>
      frame.evaluate(() => ({
        clicked:
          document.querySelector<HTMLIFrameElement>(
            "#decision-host .dp-optmedia iframe"
          )?.contentDocument?.body?.dataset.clicked ?? "",
        marked: document
          .querySelector('[data-option="edge"]')
          ?.hasAttribute("data-cawco-picked"),
        inPick: !!document.querySelector(
          '[data-option="edge"] iframe, [data-option] .dp-optmedia'
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
      first: document.querySelector("article.dp-card")?.id,
      astro: astro?.hasAttribute("data-cawco-picked"),
      pressed: astro?.getAttribute("aria-pressed"),
      stack: stack && { top: stack.top, bottom: stack.bottom },
      disc: disc && { x: disc.x + disc.width / 2, y: disc.y + disc.height / 2 },
    };
  });
  kit.check(
    "(b) after the insert the new card leads, the pin stands on the stack card, and astro is still marked picked",
    placed.first === "decision-audience" &&
      placed.astro === true &&
      placed.pressed === "true" &&
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
  await tapIn(desk, after, '[data-option="hub"]');
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
    (g) => g.nodes === 4,
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
    { kind: "page", name: "budget", html: HTML_PAGE }
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
  if (html) {
    await tapIn(desk, html, '[data-option="soft"]');
    await html.locator('input[name="budget"]').fill("60");
  }
  const operated = await until(
    "the HTML page's pick and value on the hub",
    () =>
      fleet.api<{ state: Doc["state"] }>(
        `/api/instances/${writer}/artifacts/${budget.id}`
      ),
    (r) =>
      (r.state.mode?.options ?? []).includes("soft") &&
      String(r.state.budget?.value) === "60",
    20_000
  ).catch(() => null);
  const listed = await fleet.api<{
    pages: { cards: number; name: string; picked: number }[];
  }>(`/api/projects/${projectId}/decisions`);
  const row = listed.pages.find((one) => one.name === "budget");
  kit.check(
    "(f) an HTML page's option pick and range value are kept, and the tab reads its card from the built page",
    !!operated && row?.cards === 1 && row.picked === 1,
    JSON.stringify({ state: operated?.state, row })
  );
};

/** (g) in one theme: a picked card opens with Change and folds with Done, the hub's picks untouched. */
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
  await tapIn(shown, frame, "#decision-stack .dp-change");
  const opened = await until(
    `${theme}: the stack card open again`,
    () => foldOf(frame, "stack"),
    (fold) => !fold.decided && fold.body,
    10_000
  ).catch(() => null);
  const after = (await on.read()).state.stack;
  kit.check(
    `(g) ${theme}: a card loads folded; Change opens it, both options showing, astro still marked, focus on astro`,
    !!loaded?.decided &&
      loaded.line === "Decided: Astro" &&
      !!opened &&
      JSON.stringify(opened.options.toSorted()) ===
        JSON.stringify(["astro", "svelte"]) &&
      JSON.stringify(opened.marked) === '["astro"]' &&
      opened.button === "Done" &&
      opened.focus.option === "astro" &&
      opened.height > (loaded?.height ?? 0),
    JSON.stringify({ loaded, opened })
  );
  kit.check(
    `(g) ${theme}: the hub's picks read the same after the fold and Change`,
    !!before && JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify({ before, after })
  );
  await tapIn(shown, frame, "#decision-stack .dp-change");
  const again = await until(
    `${theme}: the stack card folded by Done`,
    () => foldOf(frame, "stack"),
    (fold) => fold.decided,
    10_000
  ).catch(() => null);
  kit.check(
    `(g) ${theme}: Done folds it again, focus on Change`,
    !!again &&
      again.line === "Decided: Astro" &&
      !again.body &&
      again.focus.button === "Change",
    JSON.stringify(again)
  );
  await shown.close();
};

/** (g) on a phone: Change's 44px hit area at 390, and a long several-pick fold inside its card at 320. */
const reachLeg = async (on: On) => {
  const { fleet, kit, writer } = on;
  await fleet.api(`/api/instances/${writer}/artifacts`, {
    kind: "page",
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
      const change = card?.querySelector<HTMLElement>(".dp-change");
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
        line: card?.querySelector("header .dp-state")?.textContent ?? "",
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
    "(g) 320: a fold of three long unbroken labels stays inside its card, Change on it",
    !!narrow.card &&
      !!narrow.box &&
      narrow.line.includes("Theweeklynewsletter") &&
      narrow.card.scroll <= narrow.card.client &&
      narrow.box.right <= narrow.card.right,
    JSON.stringify(narrow)
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
  // The page's foot holds the DialKit panel, floating: the button goes to the view's top, clear of it.
  await back
    .locator("#decision-stack figure.diagram button.open")
    .first()
    .evaluate((button) => button.scrollIntoView({ block: "start" }));
  await tapIn(desk, back, "#decision-stack figure.diagram button.open");
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
    () => quickFrame.locator("#decision-plan iframe.screen").count(),
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
    () => heldFrame.locator("#decision-plan iframe.screen").count(),
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
  const frame = await frameWith(desk, 4);
  const canvasId = await frame
    .locator('iframe[src*="/__cawco/canvas/"]')
    .getAttribute("src")
    .then((src) => src?.split("/")[3] ?? "");
  await unfold(desk, frame, "host");
  await tapIn(desk, frame, "#decision-host figure button.open");
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
  await insertAhead(on, first);
  for (const theme of ["light", "dark"] as const) {
    await foldLeg(on, theme);
  }
  await waitChecks(on);
  await graphChecks(on);
  await makeTasks(on);
  await htmlPage(on);
  await reachLeg(on);
  await openToDraw(on);
  await openAsCanvas(on);
  kit.check(
    "the pages said no error",
    on.said.length === 0,
    on.said.slice(0, 6).join(" | ") || "none"
  );
};

const spec: Spec = { name: "decision-pages", run };
export default spec;
