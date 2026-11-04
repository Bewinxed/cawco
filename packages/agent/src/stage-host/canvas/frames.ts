/**
 * The frames grid (component canvas §2): what a decision page's Preview
 * (`by=embed`) and the panel map's live card (`by=map`) draw of a canvas.
 * Every story of each states file is mounted live as a frame, in every
 * interaction state the CSS reaches (pseudo.ts) for the card, at rest only
 * for a Preview, at the view's schemes and widths; frames stand in
 * sections. A card's world is fitted to its card by one transform; a
 * Preview's frames stand one under another in the page's own flow.
 *
 * A Preview (`by=embed`) draws only the stories `story` names (every story
 * when it names none), at rest, each at its own size (1 CSS px per px,
 * never scaled), with none of the canvas's own words; it never posts, and
 * tells the page holding it how tall it stands and how wide its widest
 * story is (`cawco:embed-size`, `sayShape`), so the frame is that wide and
 * that tall. A map's card never posts either, so the report stays the
 * panel's own page's.
 */

import { readWithin } from "@cawco/core/bounded";
import {
  CANVAS_EMBED_FAILED,
  CANVAS_EMBED_FETCHED,
  CANVAS_EMBED_SEEN,
  CANVAS_EMBED_SIZE,
  CANVAS_GRAPH_FETCHED,
  type CanvasGraph,
  type FrameRender,
  INTERACTIONS,
  type Interaction,
  type PageError,
  type SectionPlan,
  type Story,
} from "@cawco/core/stage";
import { drew, firstWords, partsOf } from "./measure";
import {
  type Column,
  FAILED_LINE,
  frameTick,
  type Mode,
  type Mounted,
  type Page,
  type Section,
  type WidthSlot,
} from "./runtime";
import { frameAsViewport } from "./viewport";

/** One frame: a story drawn at one interaction, scheme and width. */
interface Frame {
  body: HTMLElement;
  column: Column;
  el: HTMLElement;
  error?: PageError;
  key: string;
  label: HTMLElement;
  mounted?: Mounted;
  section: Framed;
  story: Story;
}

/** A section as the grid draws it: its element, head and grid, its frames, and what stands for them until they draw. */
interface Framed extends Section {
  el: HTMLElement;
  frames: Map<string, Frame>;
  grid: HTMLElement;
  head: HTMLElement;
  /** What stands for its frames until they draw: the line saying what it waits for and each story's frame on its way, or why it didn't load. */
  standIns: HTMLElement[];
}

/** The most of a story's error an embed's failure carries (`CANVAS_EMBED_FAILED`): its Preview says it on one line. Our call. */
const EMBED_WHY_MAX = 200;
/** How far past the view a section loads, and past which a loaded one is taken down (viewports). Ours. */
const LOAD_MARGIN = 1;
const UNMOUNT_MARGIN = 3;
/** Where the world stands from the canvas's corner when fitted. */
const WORLD_INSET = { x: 24, y: 16 };
/** The fitted world's least zoom. */
const ZOOM_MIN = 0.1;
/** `file:Story`: the colon before the story's name. */
const LAST_COLON = /:(?=[^:]+$)/u;
/** The space between an ARIA id reference list's ids. */
const WHITESPACE = /\s+/u;
/**
 * The edges' gutter, on DESIGN.md's spacing ladder: a lane's first stands
 * 18px out from the frames, each next one 7px further, its corners turn on
 * a 7px radius, the labels stand 7px clear of the lanes, a line (16px, the
 * meta role's) apart where two would meet.
 */
const EDGE_OUT = 18;
const EDGE_LANE = 7;
const EDGE_TURN = 7;
const EDGE_LABEL_GAP = 7;
const EDGE_LABEL_LINE = 16;
/**
 * How far clear of a frame's side an edge starts and its arrow's tip ends,
 * px: the move's 2px stroke and its arrow (the marker's tip 1.6px past the
 * path's end) never stand on the frame.
 */
const EDGE_CLEAR = 4;

/** The frames grid's own rules: the world, its sections, frames and edges; a Preview's frames in the page's flow. */
const FRAMES_CSS = `
/* The page is the well the frames stand in (surface-well): each frame's own page reads raised on it. */
html.cawco-frames-page, html.cawco-frames-page body { margin: 0; block-size: 100%; overflow: hidden; background: var(--surface-well); }
.cawco-canvas { position: fixed; inset: 0; overflow: hidden; touch-action: none; background: var(--surface-well); }
/* The width a frame without one answers its story's width conditions at (canvas width.ts): the canvas's own. A frame with a
   width answers its own body's. */
.cawco-canvas { container: cawco-width / inline-size; }
.cawco-world { position: absolute; inset-block-start: 0; inset-inline-start: 0; transform-origin: 0 0; display: flex; flex-direction: column;
  gap: var(--space-8); padding-block-end: 160px; will-change: transform; --cawco-gutter: 0px; padding-inline-start: var(--cawco-gutter); }
.cawco-section { display: flex; flex-direction: column; gap: var(--space-3); min-block-size: 120px; }
.cawco-section[data-cawco-asleep] .cawco-grid { display: none; }
/* A section's head: its name in plain words in the title role, its file in small print under it, and while it is on its way
   the status line beside the name, on the title's row, so its going moves nothing. */
.cawco-section-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-1) var(--space-3);
  padding-block-end: var(--space-1); border-block-end: 1px solid var(--border-well); }
.cawco-section-title { grid-column: 1; font: var(--type-title); color: var(--ink-strong); text-wrap: balance; }
.cawco-section-file { grid-column: 1 / -1; display: flex; contain: inline-size; white-space: nowrap; font: var(--type-meta); color: var(--ink-muted); }
.cawco-section-file-folder { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
.cawco-section-file-name { flex-shrink: 0; max-inline-size: 100%; overflow: hidden; text-overflow: ellipsis; }
.cawco-section-status { grid-column: 2; grid-row: 1; align-self: baseline; margin: 0; font: var(--type-meta); color: var(--ink-muted); }
.cawco-stand-in { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); }
.cawco-stand-in > .cawco-frame-words { padding: var(--space-row) var(--space-1); }
.cawco-grid { display: grid; grid-auto-columns: max-content; gap: var(--space-6) var(--space-6); align-items: start; justify-content: start; }
.cawco-colhead { font: var(--type-meta); color: var(--ink-muted); text-transform: none; }
.cawco-frame { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); min-inline-size: 0; position: relative; }
.cawco-frame-label { all: unset; box-sizing: border-box; display: grid; gap: var(--space-row); max-inline-size: 360px; border-radius: var(--radius-xs);
  padding: var(--space-row) var(--space-1); }
.cawco-frame-words { font: var(--type-label); color: var(--ink-strong); overflow-wrap: anywhere; }
.cawco-frame-small { font: var(--type-meta); color: var(--ink-muted); overflow-wrap: anywhere; }
.cawco-frame-label[data-cawco-unnamed] .cawco-frame-words { font: var(--type-meta); color: var(--ink-muted); }
.cawco-frame-status { font: var(--type-meta); color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.cawco-frame-status[data-state="failed"] { color: var(--status-fail-ink); }
.cawco-edges { position: absolute; inset: 0; inline-size: 1px; block-size: 1px; overflow: visible; pointer-events: none; z-index: 1; }
.cawco-edge { fill: none; stroke: var(--ink-muted); stroke-width: 1.5; }
.cawco-edge-move { stroke: var(--brand-solid); stroke-width: 2; }
.cawco-edge-group { stroke-dasharray: 3 4; }
.cawco-edges marker path { fill: context-stroke; }
.cawco-edge-label { font: var(--type-meta); fill: var(--ink-muted); paint-order: stroke; stroke: var(--surface-well); stroke-width: 4px; }
.cawco-edge-label[data-cawco-move] { fill: var(--brand-ink); }
/* A decision page's Preview (by=embed): its frames alone, one under another in the page's own flow, each at its own
   size from the embed's start, never scaled; the page holding it makes its frame as tall and as wide as its widest story
   (CANVAS_EMBED_SIZE, sayShape) and scrolls it sideways where its room is narrower, and a wheel or a finger on it scrolls
   that page. A section that didn't load still says so; one holding none of the stories the embed names takes no place
   (data-cawco-none), and a named story no section holds is said once, in the embed's own place (unnamedInEmbed). */
html.cawco-embed, html.cawco-embed body { block-size: auto; overflow-x: hidden; overflow-y: auto; }
/* An embed is no well: around a frame narrower than it stands the surface the decision page draws its Preview on. */
html.cawco-embed, html.cawco-embed body, html.cawco-embed .cawco-canvas { background: var(--surface-page); }
html.cawco-embed .cawco-canvas { position: static; inset: auto; overflow: visible; touch-action: auto; }
html.cawco-embed .cawco-world { position: static; inline-size: 100%; gap: var(--space-3); padding: 0; will-change: auto; }
html.cawco-embed .cawco-section { min-block-size: 0; gap: var(--space-3); }
html.cawco-embed .cawco-section[data-cawco-none] { display: none; }
html.cawco-embed :is(.cawco-section-head, .cawco-colhead, .cawco-frame-label, .cawco-frame-status, .cawco-edges, .cawco-stand-in > .cawco-frame-words) { display: none; }
html.cawco-embed .cawco-grid { display: flex; flex-direction: column; align-items: start; gap: var(--space-3); }
html.cawco-embed .cawco-frame { gap: 0; min-inline-size: 0; }
html.cawco-embed .cawco-stand-in-body { max-inline-size: 100%; }
`;

/** A frame's key: its file, story and column. */
const frameKey = (file: string, story: string, column: Column): string =>
  `${file}|${story}|${column.interaction}|${column.scheme}|${column.width}`;

/**
 * A section's head: its name in plain words in the title role, over its file
 * in small print on one row inside the head, its middle let go first so its
 * file's own name stays; the whole path on hover.
 */
const headOf = (head: HTMLElement, file: string, name: string): void => {
  const named = document.createElement("span");
  named.className = "cawco-section-title";
  named.textContent = name;
  const path = document.createElement("span");
  path.className = "cawco-section-file";
  path.title = file;
  const cut = file.lastIndexOf("/") + 1;
  const folder = document.createElement("span");
  folder.className = "cawco-section-file-folder";
  folder.textContent = file.slice(0, cut);
  const own = document.createElement("span");
  own.className = "cawco-section-file-name";
  own.textContent = file.slice(cut);
  path.append(folder, own);
  head.replaceChildren(named, path);
};

export function bootFrames(page: Page): Mode {
  const { chrome, plans, root, spec, view } = page;
  const embed = page.by === "embed";
  const card = page.by === "map";
  const params = new URLSearchParams(location.search);
  const named = new Set(params.getAll("story"));
  chrome.style(FRAMES_CSS);
  document.documentElement.classList.add("cawco-frames-page");
  document.documentElement.classList.toggle("cawco-embed", embed);
  const canvas = document.getElementById("cawco-canvas") as HTMLElement;
  const world = document.createElement("div");
  world.className = "cawco-world";
  const edges = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  edges.classList.add("cawco-edges", "cawco-ui");
  world.append(edges);
  canvas.append(world);

  const sections: Framed[] = page.sections.map((section) => {
    const el = document.createElement("section");
    el.className = "cawco-section";
    el.dataset.cawcoFile = section.file;
    el.dataset.cawcoChoice = section.file;
    const head = document.createElement("header");
    head.className = "cawco-section-head cawco-ui";
    headOf(head, section.file, section.name);
    const grid = document.createElement("div");
    grid.className = "cawco-grid";
    el.append(head, grid);
    world.append(el);
    return Object.assign(section, {
      el,
      head,
      grid,
      frames: new Map<string, Frame>(),
      standIns: [],
    });
  });
  /** The grid's own of a section the page made: every one is, from boot. */
  const framed = (section: Section): Framed =>
    sections.find((one) => one === section) as Framed;

  /* --- Floating layers: the frame they open from is their viewport (viewport.ts) */

  /** The frame last pressed or focused in, where a menu or a popover opens from. */
  let touched: Frame | null = null;
  /** Each frame by its body: an element in a body is that frame's. */
  const frameOfBody = new WeakMap<Element, Frame>();
  /** Whether `frame` stands drawn with a width of its own: its story's viewport. */
  const isWidthFrame = (frame: Frame | null | undefined): frame is Frame =>
    !!frame &&
    frame.el.isConnected &&
    page.widthOf(frame.story, frame.column.width) !== null;
  /** The frame with a width of its own that `el` stands in; null for one in no frame (the rig's probes) or in one of no width. */
  const widthFrameOf = (el: Element): Frame | null => {
    const body = el.closest(".cawco-frame-body");
    const frame = body ? frameOfBody.get(body) : undefined;
    return isWidthFrame(frame) ? frame : null;
  };
  /** The one frame drawn with a width of its own; null for none or several. */
  const soleWidthFrame = (): Frame | null => {
    let sole: Frame | null = null;
    for (const section of sections) {
      for (const frame of section.frames.values()) {
        if (isWidthFrame(frame)) {
          if (sole) {
            return null;
          }
          sole = frame;
        }
      }
    }
    return sole;
  };
  /** The person has pressed, typed or scrolled here: a focus from then on is theirs. */
  let acted = false;
  const touchedIn = (event: Event) => {
    touched =
      event.target instanceof Element ? widthFrameOf(event.target) : null;
  };
  document.addEventListener("pointerdown", touchedIn, true);
  document.addEventListener(
    "focusin",
    (event) => {
      if (acted) {
        touchedIn(event);
      }
    },
    true
  );
  for (const input of ["pointerdown", "keydown", "wheel"] as const) {
    document.addEventListener(
      input,
      () => {
        acted = true;
      },
      { capture: true, passive: true }
    );
  }
  /** The ids a floating layer holds: its own and its parts' (a menu's content inside its positioned wrapper). */
  const idsIn = (layer: Element): string[] =>
    [layer, ...layer.querySelectorAll("[id]")]
      .map((one) => one.id)
      .filter(Boolean);

  /*
   * The world's triggers, kept as the world changes: each id an
   * `aria-controls` or `aria-describedby` in it names, with the elements
   * naming it, and the elements standing `aria-expanded="true"`. Script
   * reads the viewport many times a placement (floating-ui's
   * `getViewportRect`, for every open layer, on every scroll, resize and
   * mount near it), and each read asks for its layer's frame: searched
   * across every frame's elements, a read cost the whole page, and a
   * canvas's reads grew with its frames, so the cost grew as their square
   * (who-decides-member-settings' 187 frames: 4,611 reads took 66 s of the
   * stage's render, the last section's one frame of probes 22 s). Read off
   * this index, a read costs its layer's own ids.
   */
  const NAMING = ["aria-controls", "aria-describedby"] as const;
  const TRIGGERS = "[aria-controls],[aria-describedby],[aria-expanded]";
  /** Each id the world's triggers name, and the elements naming it. */
  const naming = new Map<string, Set<Element>>();
  /** What each indexed element named as it was indexed: what its drop takes out. */
  const namedBy = new WeakMap<Element, string[]>();
  /** The world's elements standing `aria-expanded="true"`. */
  const expanded = new Set<Element>();
  const namesOf = (el: Element, attribute: string): string[] =>
    (el.getAttribute(attribute) ?? "").split(WHITESPACE).filter(Boolean);
  const dropTrigger = (el: Element) => {
    expanded.delete(el);
    for (const id of namedBy.get(el) ?? []) {
      const set = naming.get(id);
      set?.delete(el);
      if (set?.size === 0) {
        naming.delete(id);
      }
    }
    namedBy.delete(el);
  };
  const indexTrigger = (el: Element) => {
    dropTrigger(el);
    const ids = NAMING.flatMap((attribute) => namesOf(el, attribute));
    for (const id of ids) {
      const set = naming.get(id) ?? new Set<Element>();
      set.add(el);
      naming.set(id, set);
    }
    if (ids.length > 0) {
      namedBy.set(el, ids);
    }
    if (el.getAttribute("aria-expanded") === "true") {
      expanded.add(el);
    }
  };
  const eachTrigger = (nodes: NodeList, run: (el: Element) => void) => {
    for (const node of nodes) {
      if (node instanceof Element) {
        run(node);
        for (const el of node.querySelectorAll(TRIGGERS)) {
          run(el);
        }
      }
    }
  };
  const readTriggers = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.type === "attributes") {
        indexTrigger(record.target as Element);
      } else {
        eachTrigger(record.removedNodes, dropTrigger);
        eachTrigger(record.addedNodes, indexTrigger);
      }
    }
  };
  const triggerWatch = new MutationObserver(readTriggers);
  triggerWatch.observe(world, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...NAMING, "aria-expanded"],
  });
  /** The index as the world stands now: the changes not yet delivered read first. */
  const triggersNow = () => readTriggers(triggerWatch.takeRecords());

  /**
   * The frame a floating layer belongs to: the one it stands in, or the one
   * holding the trigger that names it (`aria-controls`, a menu's or a
   * popover's; `aria-describedby`, a tooltip's), as a layer portalled out
   * of its frame (bits-ui's Portal, to the body) is named. None for an
   * element holding frames (the body, the canvas) or standing among them
   * outside a story (a section's head), which is no layer.
   */
  const layerFrame = (layer: Element | null): Frame | null => {
    if (!layer?.isConnected) {
      return null;
    }
    if (layer.closest(".cawco-frame-body")) {
      return widthFrameOf(layer);
    }
    if (layer.contains(world) || world.contains(layer)) {
      return null;
    }
    return triggerFrame(layer);
  };
  /** The frame holding a trigger that names one of `layer`'s ids; null for none. */
  const triggerFrame = (layer: Element): Frame | null => {
    triggersNow();
    for (const id of idsIn(layer)) {
      for (const el of naming.get(id) ?? []) {
        const frame = el.isConnected ? widthFrameOf(el) : null;
        if (frame) {
          return frame;
        }
      }
    }
    return null;
  };
  /**
   * The frame script asks the viewport of when no layer of a frame asks:
   * the one frame with a trigger open in it (`aria-expanded`), else the
   * frame last pressed or focused in, else the one frame with a width; none
   * (the window's own) where that names no one frame.
   */
  const askedFrame = (): Frame | null => {
    triggersNow();
    const open = new Set<Frame>();
    for (const el of expanded) {
      const frame = el.isConnected ? widthFrameOf(el) : null;
      if (frame) {
        open.add(frame);
      }
    }
    if (open.size === 1) {
      return open.values().next().value ?? null;
    }
    if (isWidthFrame(touched) && (open.size === 0 || open.has(touched))) {
      return touched;
    }
    return open.size === 0 ? soleWidthFrame() : null;
  };
  // Each layer asks at its own frame, the one it stands in or its trigger's.
  frameAsViewport(
    (layer) =>
      (layerFrame(layer) ?? askedFrame())?.body.getBoundingClientRect() ?? null
  );

  /* --- What stands for a section until it draws --------------------------- */

  /**
   * A section on its way: one line saying what it waits for, its columns'
   * heads, and each planned story's frame as a skeleton in the cell its
   * frame takes (its label, then a block at its width), so the frames land
   * where they stood. All of it is seen only once the wait has lasted the
   * grace (`cawco-waiting`, PAGE_CSS; DESIGN.md's Real Wait Rule); before
   * it, nothing.
   */
  function standIn(section: Framed, stories: SectionPlan["stories"]): void {
    const status = document.createElement("p");
    status.className = "cawco-section-status cawco-waiting cawco-ui";
    status.setAttribute("role", "status");
    status.textContent =
      stories.length > 0
        ? `Drawing ${stories.length} ${stories.length === 1 ? "story" : "stories"}`
        : "Drawing its stories";
    heads(section);
    const columns = columnsOfSection(section);
    const frames = stories.flatMap((story, row) =>
      columns.map((column, at) => {
        const one = document.createElement("div");
        one.className = "cawco-stand-in cawco-waiting cawco-ui";
        one.setAttribute("aria-hidden", "true");
        one.style.gridRow = String(row + 2);
        one.style.gridColumn = String(at + 1);
        const words = document.createElement("span");
        words.className = "cawco-frame-words";
        words.textContent = story.label ?? story.name;
        const body = document.createElement("div");
        body.className = "cawco-stand-in-body";
        const width = column.width === "own" ? story.width : column.width;
        if (width !== null) {
          body.style.inlineSize = `${width}px`;
        }
        one.append(words, body);
        return one;
      })
    );
    const columnHeads = [
      ...section.grid.querySelectorAll<HTMLElement>(":scope > .cawco-colhead"),
    ];
    for (const head of columnHeads) {
      head.classList.add("cawco-waiting");
    }
    // In the head's title row, beside the name: when it goes, nothing under it moves.
    section.head.append(status);
    section.grid.append(...frames);
    section.standIns = [status, ...columnHeads, ...frames];
  }

  /** What stood for a section's frames taken away: they drew, or it says why not. */
  const clearStandIns = (section: Framed) => {
    for (const one of section.standIns) {
      one.remove();
    }
    section.standIns = [];
  };

  /**
   * The skeleton's reveal (DESIGN.md Skeleton; transitions.dev Skeleton
   * loader and reveal), one keyframe pair each way: opacity with a cross-blur
   * of --skeleton-reveal-blur, over --dur-skeleton-reveal on --ease-crossfade.
   * None with reduced motion.
   */
  function revealOf(): { blur: string; ease: string; ms: number } | null {
    if (!matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      return null;
    }
    const tokens = getComputedStyle(document.documentElement);
    return {
      blur: tokens.getPropertyValue("--skeleton-reveal-blur").trim(),
      ease: tokens.getPropertyValue("--ease-crossfade").trim(),
      ms: chrome.duration("--dur-skeleton-reveal", 400),
    };
  }

  /**
   * A section's stand-ins taken away as its frames come, in the skeleton's
   * reveal: each stand-in frame stays in its cell (`held`, answered here),
   * and `revealed` fades it out into the blur, taking it away once gone,
   * while each frame drawn since comes out of the blur in the same cell on
   * the same clock. The status line and the rest go at once, as everything
   * does with reduced motion, and in an embed: the page holding it shows
   * its own skeleton until it draws and reveals the frame (dashboard
   * decisions host Preview.svelte).
   */
  function holdStandIns(section: Framed): HTMLElement[] {
    const kept =
      !embed && revealOf()
        ? section.standIns.filter((one) =>
            one.classList.contains("cawco-stand-in")
          )
        : [];
    section.standIns = section.standIns.filter((one) => !kept.includes(one));
    clearStandIns(section);
    return kept;
  }

  /** `going` (from {@link holdStandIns}) going and `drawn` coming, in the reveal. */
  function revealed(going: HTMLElement[], drawn: HTMLElement[]): void {
    const look = embed ? null : revealOf();
    // A stand-in still unseen (inside the wait's grace) has nothing to reveal.
    const seen = going.map((one) => Number(getComputedStyle(one).opacity));
    if (!look || seen.every((opacity) => opacity === 0)) {
      for (const one of going) {
        one.remove();
      }
      return;
    }
    const standing = { opacity: 1, filter: "blur(0px)" };
    const away = { opacity: 0, filter: `blur(${look.blur})` };
    const timing = { duration: look.ms, easing: look.ease };
    going.forEach((one, at) => {
      const out = one.animate([{ ...standing, opacity: seen[at] ?? 1 }, away], {
        ...timing,
        fill: "forwards",
      });
      const done = () => one.remove();
      out.finished.then(done, done);
    });
    for (const el of drawn) {
      el.animate([away, standing], timing);
    }
  }

  /* --- The grid ----------------------------------------------------------- */

  /**
   * The stories of `all` the page draws: an embed's the ones it names, in
   * the order it names them (a Preview's `stories`), a card's every one, in
   * its file's order.
   */
  const toDraw = <One extends { name: string }>(all: readonly One[]): One[] =>
    named.size === 0
      ? [...all]
      : [...named].flatMap((name) => all.filter((one) => one.name === name));

  /** The stories a section draws, in the order `toDraw` gives. */
  const storiesOf = (section: Framed): Story[] =>
    toDraw(section.mod?.SHEET.stories ?? []);

  /** The columns a section's stories take, from the view. */
  const slotsOf = (): { scheme: Column["scheme"]; width: WidthSlot }[] => {
    let schemes: Column["scheme"][] = [
      view.scheme === "both" ? "light" : view.scheme,
    ];
    if (view.scheme === "both" || view.all) {
      schemes = ["light", "dark"];
    }
    let widths: WidthSlot[] = view.widths ?? ["own"];
    if (view.all) {
      widths = [390, 768, 1280];
    }
    return widths.flatMap((width) =>
      schemes.map((scheme) => ({ scheme, width }))
    );
  };

  /**
   * A frame's small line: its story's name where the label above it says
   * other words (an unnamed story's label says "Unnamed"), its form, its
   * scheme when the frames show both, and its state past rest.
   */
  const smallOf = (story: Story, column: Column): string => {
    const bits = [page.formWords(story, column.width)];
    if (story.label !== story.name) {
      bits.unshift(story.name);
    }
    if (column.scheme !== "page" && (view.scheme === "both" || view.all)) {
      bits.push(column.scheme);
    }
    if (column.interaction !== "rest") {
      bits.push(column.interaction);
    }
    return bits.join(" · ");
  };

  /** One frame's element: its label over its body, in the section's grid. */
  function frameFor(section: Framed, story: Story, column: Column): Frame {
    const key = frameKey(section.file, story.name, column);
    const had = section.frames.get(key);
    if (had) {
      return had;
    }
    const el = document.createElement("section");
    el.className = "cawco-frame";
    el.dataset.cawcoStory = story.name;
    el.dataset.cawcoFile = section.file;
    el.dataset.cawcoKey = key;
    el.dataset.cawcoInteraction = column.interaction;
    el.dataset.cawcoScheme = column.scheme;
    el.dataset.cawcoWidth = String(column.width);
    el.dataset.cawcoSource = `${section.file}:${story.line}:${story.column}`;
    const label = document.createElement("div");
    label.className = "cawco-frame-label cawco-ui";
    const words = document.createElement("span");
    words.className = "cawco-frame-words";
    words.textContent = story.label ?? "Unnamed";
    const small = document.createElement("span");
    small.className = "cawco-frame-small";
    small.textContent = smallOf(story, column);
    label.append(words, small);
    if (!story.label) {
      label.dataset.cawcoUnnamed = "";
    }
    const body = document.createElement("div");
    body.className = "cawco-frame-body";
    const status = document.createElement("div");
    status.className = "cawco-frame-status cawco-ui";
    el.append(label, body, status);
    const frame: Frame = { key, el, label, body, column, section, story };
    section.frames.set(key, frame);
    frameOfBody.set(body, frame);
    placeFrame(frame);
    return frame;
  }

  /** The grid place of a frame: its story's row, its column's place among the section's columns. */
  function placeFrame(frame: Frame): void {
    const { section } = frame;
    const stories = storiesOf(section);
    const row = stories.findIndex((one) => one.name === frame.story.name) + 2;
    const columns = columnsOfSection(section);
    const at =
      columns.findIndex(
        (one) =>
          one.interaction === frame.column.interaction &&
          one.scheme === frame.column.scheme &&
          one.width === frame.column.width
      ) + 1;
    frame.el.style.gridRow = String(row);
    frame.el.style.gridColumn = String(Math.max(1, at));
    if (!frame.el.isConnected) {
      section.grid.append(frame.el);
    }
  }

  /** Every column the section's stories reach, in the grid's order: interactions within each scheme and width. */
  function columnsOfSection(section: Framed): Column[] {
    const reached = new Set<Interaction>(["rest"]);
    for (const list of section.interactions.values()) {
      for (const one of list) {
        reached.add(one);
      }
    }
    return slotsOf().flatMap((slot) =>
      INTERACTIONS.filter((one) => reached.has(one)).map((interaction) => ({
        interaction,
        ...slot,
      }))
    );
  }

  /** The column heads of a section's grid. */
  function heads(section: Framed): void {
    for (const old of section.grid.querySelectorAll(
      ":scope > .cawco-colhead"
    )) {
      old.remove();
    }
    columnsOfSection(section).forEach((column, at) => {
      const head = document.createElement("div");
      head.className = "cawco-colhead cawco-ui";
      const bits: string[] = [column.interaction];
      if (column.width !== "own") {
        bits.unshift(page.formWords({ form: null } as Story, column.width));
      }
      if (column.scheme !== "page" && (view.scheme === "both" || view.all)) {
        bits.push(column.scheme);
      }
      head.textContent = bits.join(" · ");
      head.style.gridRow = "1";
      head.style.gridColumn = String(at + 1);
      section.grid.prepend(head);
    });
  }

  /** The frame's body dressed for its column: its scheme, width and forced state. */
  const dress = (frame: Frame) =>
    page.dressBody(
      frame.body,
      frame.column,
      frame.story,
      page.fills(frame.section, frame.story.name)
    );

  /** A frame's story mounted afresh. */
  function mountFrame(frame: Frame): void {
    frame.mounted?.unmount();
    frame.mounted = undefined;
    frame.body.replaceChildren();
    dress(frame);
    frame.mounted = page.mountInto(
      frame.body,
      frame.section,
      frame.story.name,
      page.argsOf(frame.section, frame.story.name),
      frame
    );
    sayShape();
  }

  /**
   * Each story's columns, from its rest frame: frames made for each, frames
   * of columns it no longer reaches taken down, and the section probed
   * again. Answers whether the columns changed, and so it probed.
   */
  async function columnsFor(section: Framed): Promise<boolean> {
    // An embed shows each story at rest only.
    if (!section.mod || embed) {
      return false;
    }
    // The frames mounted just now draw first: what a person sees comes before what the canvas reads.
    await frameTick();
    page.rewriteAll();
    let changed = false;
    for (const story of section.mod?.SHEET.stories ?? []) {
      changed = reachOf(section, story) || changed;
    }
    if (!changed) {
      return false;
    }
    syncFrames(section);
    await page.probeAll(section);
    page.later();
    return true;
  }

  /**
   * The interactions story `story` reaches, read off its rest frame: its
   * frames drawn as tall as its screen first where it has a width and no
   * height of its own. Answers whether they changed.
   */
  function reachOf(section: Framed, story: Story): boolean {
    const rest = [...section.frames.values()].find(
      (one) =>
        one.story.name === story.name && one.column.interaction === "rest"
    );
    if (!rest) {
      return false;
    }
    if (page.fillsScreen(section, story, rest.body)) {
      for (const frame of section.frames.values()) {
        if (frame.story.name === story.name) {
          dress(frame);
        }
      }
    }
    const reached = page.reachedIn(rest.body);
    const before = section.interactions.get(story.name)?.join() ?? "";
    if (before === reached.join()) {
      return false;
    }
    section.interactions.set(story.name, reached);
    return true;
  }

  /** The section's frames as its stories and columns say: new ones mounted, gone ones taken down. */
  function syncFrames(section: Framed): void {
    const stories = storiesOf(section);
    const wanted = new Set<string>();
    for (const story of stories) {
      const reached = section.interactions.get(story.name) ?? ["rest"];
      for (const slot of slotsOf()) {
        for (const interaction of reached) {
          const column = { interaction, ...slot };
          const key = frameKey(section.file, story.name, column);
          wanted.add(key);
          const had = section.frames.get(key);
          const frame = frameFor(section, story, column);
          frame.story = story;
          if (had) {
            placeFrame(frame);
          } else {
            mountFrame(frame);
          }
        }
      }
    }
    for (const [key, frame] of section.frames) {
      if (!wanted.has(key)) {
        frame.mounted?.unmount();
        frame.el.remove();
        section.frames.delete(key);
      }
    }
    // An embed's section holding none of the stories it draws takes no place in it (FRAMES_CSS `data-cawco-none`).
    section.el.toggleAttribute(
      "data-cawco-none",
      embed && !!section.mod && stories.length === 0
    );
    heads(section);
  }

  /** A section's stories mounted from its module: rest first, then the columns its CSS reaches. */
  function shown(one: Section): void {
    const section = framed(one);
    // Drawn anew from its module: what stood of the last one goes.
    for (const frame of section.frames.values()) {
      frame.mounted?.unmount();
      frame.el.remove();
    }
    section.frames.clear();
    const going = holdStandIns(section);
    headOf(section.head, section.file, section.name);
    delete section.el.dataset.cawcoAsleep;
    syncFrames(section);
    revealed(
      going,
      [...section.frames.values()].map((frame) => frame.el)
    );
    if (embed) {
      // Mounted afresh: the next shape said is its stories' at rest.
      atRest = true;
      unnamedInEmbed();
      sayShape();
    } else {
      page.quietly(settle(section));
    }
  }

  /** A section's columns, probes and moves read once it is shown, one after another, never two passes at once in the rig. */
  function settle(section: Framed): Promise<void> {
    section.settling = (async () => {
      if (!(await columnsFor(section))) {
        await page.probeAll(section);
      }
      await page.playAll(section);
      drawEdges();
    })();
    return section.settling;
  }

  /** A section whose module didn't load: it says so in its own place, its error and where it threw under Show details, never a blank canvas. */
  function failed(one: Section, failure: Parameters<Mode["failed"]>[1]): void {
    const section = framed(one);
    clearStandIns(section);
    const says = page.failedCard(section, failure);
    section.head.after(says);
    section.standIns = [says];
    sayShape();
  }

  /** The line saying which stories an embed names that no states file of its canvas has; none while every one is held. */
  let unnamedLine: HTMLElement | null = null;

  /**
   * An embed's named stories that no section holds, said once in the
   * embed's own place, in words, after every section has loaded: a story
   * is the canvas's, from whichever states file holds it. While a section
   * is still on its way, or failed (it says why in its own place), nothing
   * is said: its stories are not known.
   */
  function unnamedInEmbed(): void {
    unnamedLine?.remove();
    unnamedLine = null;
    if (sections.some((one) => !one.loaded || one.failure)) {
      return;
    }
    const have = new Set(
      sections.flatMap(
        (one) => one.mod?.SHEET.stories.map((story) => story.name) ?? []
      )
    );
    const missing = [...named].filter((name) => !have.has(name));
    if (missing.length === 0) {
      return;
    }
    unnamedLine = document.createElement("p");
    unnamedLine.className = "cawco-section-failed-line cawco-ui";
    unnamedLine.setAttribute("role", "alert");
    unnamedLine.textContent = `${spec.name ?? "This canvas"} has no ${missing.length === 1 ? "story" : "stories"} named ${missing.join(", ")}.`;
    world.prepend(unnamedLine);
  }

  /** Takes a far section's frames down; its module stays. */
  function sleepSection(section: Framed): void {
    if (!section.loaded) {
      return;
    }
    const box = section.el.getBoundingClientRect();
    section.el.style.minHeight = `${box.height / zoom.z}px`;
    for (const frame of section.frames.values()) {
      frame.mounted?.unmount();
      frame.el.remove();
    }
    section.frames.clear();
    section.loaded = false;
    section.loading = undefined;
    section.el.dataset.cawcoAsleep = "";
  }

  /* --- An embed's shape, said to the page holding it ---------------------- */

  /**
   * The page holding an embed hears its whole graph arrived (core
   * `CANVAS_EMBED_FETCHED`), once its page's preloads have all answered,
   * before it is evaluated and drawn: its modules are the page's now, and
   * the budget they held is free for the embeds still waiting (dashboard
   * decisions host embed-turns.ts). Every page the stage serves carries its
   * graph (host.ts `closureOf`).
   */
  function tellGraphFetched(): void {
    const graph = (window as unknown as { __cawcoGraph: CanvasGraph })
      .__cawcoGraph;
    const tell = () =>
      window.parent.postMessage({ type: CANVAS_EMBED_FETCHED }, "*");
    if (graph.whole) {
      tell();
    } else {
      addEventListener(CANVAS_GRAPH_FETCHED, tell, { once: true });
    }
  }

  let saidShape = "";
  /**
   * Whether the next shape said is its stories' at rest: the first said
   * since they mounted, before the person pressed or typed in the embed. The
   * page holding it keeps only that one for the next Preview's first paint
   * (`rest`, dashboard decisions host Preview.svelte `tellShape`): a list
   * opened or closed changes the live frame, never what the next load holds.
   */
  let atRest = true;
  if (embed) {
    for (const input of ["pointerdown", "keydown"] as const) {
      document.addEventListener(
        input,
        () => {
          atRest = false;
        },
        true
      );
    }
  }
  /** A measure of the embed's shape waits on its world to settle ({@link settledHeight}): the calls meanwhile are answered by it. */
  let shaping = false;
  /**
   * The page holding an embed (a decision page's Preview) makes its frame
   * this tall and, where a story says its own width, as wide as the widest
   * (null where none does): every frame at its own size, 1 CSS px per px,
   * never scaled, the frames whole, no inner scroll; the page holding it
   * scrolls it where its room is narrower. Said whenever it changes: from
   * the world's resize observer and as its sections draw, each time only
   * once the world has settled ({@link settledHeight}), so the first height
   * it says is its last.
   *
   * Said once every section has drawn or says why it didn't, never of its
   * stand-ins: the page holding it ends this embed's turn at its shape
   * where it said no graph arrived (dashboard decisions host
   * embed-turns.ts), and a shape said at boot, 0.6 s in with no frame
   * drawn, let the next start while this one still fetched its graph; a
   * page of 33 such Previews had ten say "didn't load".
   *
   * An embed that can't draw what its Preview names says why instead, at
   * once (`CANVAS_EMBED_FAILED`, {@link embedFailure}): a shape of nothing
   * drawn stood in its Preview as an empty box.
   */
  function sayShape(): void {
    if (
      !embed ||
      sections.some((section) => !(section.loaded || section.failure))
    ) {
      return;
    }
    const why = embedFailure();
    if (why !== null) {
      if (saidShape !== `failed ${why}`) {
        saidShape = `failed ${why}`;
        window.parent.postMessage({ type: CANVAS_EMBED_FAILED, why }, "*");
      }
      return;
    }
    if (shaping) {
      return;
    }
    shaping = true;
    page.quietly(
      settledHeight().then((height) => {
        shaping = false;
        // A story that threw meanwhile said why from its own call.
        if (embedFailure() === null) {
          postShape(height);
        }
      })
    );
  }

  /** The shape `height` tall said to the page holding the embed, unless it is the one said last. */
  function postShape(height: number): void {
    const widths = sections.flatMap((section) =>
      [...section.frames.values()].flatMap(
        (frame) => page.widthOf(frame.story, frame.column.width) ?? []
      )
    );
    const width = widths.length > 0 ? Math.max(...widths) : null;
    const shape = `${width} ${height}`;
    if (shape === saidShape) {
      return;
    }
    saidShape = shape;
    window.parent.postMessage(
      { type: CANVAS_EMBED_SIZE, height, width, rest: atRest },
      "*"
    );
    atRest = false;
  }

  /**
   * When the page holding the embed said its box stood in its view
   * (`CANVAS_EMBED_SEEN`), by `performance.now()`; null until then, and
   * `seenOnce` settles then.
   */
  let seenAt: number | null = null;
  let heardSeen: () => void = () => undefined;
  const seenOnce = new Promise<void>((done) => {
    heardSeen = done;
  });
  if (embed) {
    addEventListener("message", (event) => {
      if (
        event.source === window.parent &&
        (event.data as { type?: unknown } | null)?.type === CANVAS_EMBED_SEEN
      ) {
        seenAt ??= performance.now();
        heardSeen();
      }
    });
  }

  /** The page's animations running now that end: a story's transitions (a Svelte `in:`/`out:`, a fold), never a loop. */
  const ending = (): Animation[] =>
    document
      .getAnimations()
      .filter(
        (run) =>
          run.playState === "running" &&
          Number.isFinite(Number(run.effect?.getComputedTiming().endTime))
      );

  /**
   * The world's height once it has settled: the faces loaded, every
   * animation that ends ended, and the height the same across a frame. A
   * story mounted lays itself out over its first frames: it measures itself
   * in a frame's callbacks or its observers (the dashboard's frameObserver),
   * and what that changes runs its transitions on the Web Animations API,
   * an outro's element taken away only as it finishes. A browser runs all
   * of that only in a frame's rendering steps, which a cross-origin frame
   * off the page's screen is not given (Chromium throttles it) until it is
   * scrolled to, while its height read here lays it out whatever: read
   * there, a who-decides roster said 829, 1263, 985 and 960 off the page's
   * screen, 3 transitions mid-flight, and 795 once scrolled to, every
   * Preview under it moving 165px. Here an embed off the page's screen says
   * its shape once it has its frames, and the page holding it stands its
   * skeleton at the shape it last said until then. Once its box has stood
   * in that page's view (`CANVAS_EMBED_SEEN`), it waits on its animations at
   * most {@link longMotionMs}, then says the height that held across a
   * frame: it never fails for animating.
   */
  async function settledHeight(): Promise<number> {
    const longest = longMotionMs();
    for (;;) {
      const settling = () =>
        Promise.allSettled([
          document.fonts.ready,
          ...ending().map((run) => run.finished),
        ]);
      // Unseen, until they end or its box is seen; seen, until they end or the long motion's time is up: measured after either way.
      await (seenAt === null
        ? Promise.race([settling(), seenOnce])
        : readWithin(
            Math.max(0, seenAt + longest - performance.now()),
            settling
          ));
      const before = Math.ceil(world.offsetHeight);
      await frameTick();
      const height = Math.ceil(world.offsetHeight);
      if (!(height === before && document.fonts.status === "loaded")) {
        continue;
      }
      if (ending().length === 0) {
        return height;
      }
      if (seenAt !== null && performance.now() - seenAt >= longest) {
        console.warn(
          `[cawco] ${drawnStories().join(", ")} still animating ${longest} ms after coming into view: its height is said as it held across a frame, ${height}px.`
        );
        return height;
      }
    }
  }

  /** The stories the embed draws, by name, each once. */
  const drawnStories = (): string[] => [
    ...new Set(
      sections.flatMap((section) =>
        storiesOf(section).map((story) => story.name)
      )
    ),
  ];

  /**
   * How long an embed in view waits on its stories' animations before it
   * says its height anyway ({@link settledHeight}): the house's longest
   * motion that ends, `--dur-goo-settle`. A story that starts one animation
   * after another (a ticker, a carousel) never settles, and its Preview
   * would otherwise say it didn't load: the height that held across a frame
   * is said, and the canvas warns, naming its stories.
   */
  function longMotionMs(): number {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--dur-goo-settle")
      .trim();
    return value.endsWith("ms")
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
  }

  /**
   * Why an embed can't draw what its Preview names, in plain words; null
   * while it draws: a story of it that threw as it mounted, or, with no
   * story of it drawn, a states file that didn't load (its section's line).
   */
  function embedFailure(): string | null {
    const frames = sections.flatMap((section) => [...section.frames.values()]);
    const threw = frames.find((frame) => frame.error);
    if (threw?.error) {
      const first = threw.error.message.split("\n")[0]?.trim() ?? "";
      const words =
        first.length > EMBED_WHY_MAX
          ? `${first.slice(0, EMBED_WHY_MAX - 1)}…`
          : first;
      return `its story ${threw.story.name} threw as it mounted${words ? `: ${words}` : "."}`;
    }
    const failedOne = sections.find((section) => section.failure);
    if (frames.length === 0 && failedOne?.failure) {
      return FAILED_LINE[failedOne.failure.kind](failedOne.name);
    }
    return null;
  }

  /* --- Loading: sections near the card's view; every one for an embed ---- */

  /** Whether a section stands within a viewport of the canvas's view. */
  const nearView = (section: Framed): boolean => {
    const box = section.el.getBoundingClientRect();
    const bounds = canvas.getBoundingClientRect();
    const mx = bounds.width * LOAD_MARGIN;
    const my = bounds.height * LOAD_MARGIN;
    return (
      box.bottom >= bounds.top - my &&
      box.top <= bounds.bottom + my &&
      box.right >= bounds.left - mx &&
      box.left <= bounds.right + mx
    );
  };
  let pumping = false;
  /**
   * Loads the sections near the view, in the file's order: one only once
   * every section before it stands at its drawn height (a section not yet
   * drawn is a short placeholder, which would put the next one in view
   * before its time). An embed loads every one, in order.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one walk of the sections, in order, for a card's view and for an embed's every section alike
  const pump = async () => {
    if (pumping) {
      return;
    }
    pumping = true;
    try {
      // An embed's stories wait until the page holding it says its whole graph is in the renderer (host.ts `graphPreloads`, core `CANVAS_EMBED_READY`): imported before, they would ask the network again for modules another frame is still fetching.
      if (embed) {
        await (window as unknown as { __cawcoGraph: CanvasGraph }).__cawcoGraph
          .go;
      }
      for (const section of sections) {
        if (section.loaded) {
          continue;
        }
        // A section taken down keeps its drawn height; one never drawn is a placeholder, past which nothing is judged yet.
        const asleep = section.el.dataset.cawcoAsleep !== undefined;
        if (!(embed || nearView(section))) {
          if (asleep) {
            continue;
          }
          break;
        }
        await page.loadSection(section);
        // An embed draws every section, judging no view, and says its shape only once all have drawn (`sayShape`), so until then its frame is 0px tall and gets no rendering steps: it waits on no frame.
        if (!embed) {
          await frameTick();
        }
      }
    } finally {
      pumping = false;
    }
  };
  if (card) {
    const near = new IntersectionObserver(
      () => page.quietly(pump()),
      // The canvas is the root: it clips its world, so a margin on the page's own viewport would never reach past its fold.
      {
        root: canvas,
        rootMargin: `${LOAD_MARGIN * 100}% ${LOAD_MARGIN * 100}%`,
      }
    );
    const far = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const section = sections.find((one) => one.el === entry.target);
          if (section && !entry.isIntersecting) {
            sleepSection(section);
          }
        }
      },
      {
        root: canvas,
        rootMargin: `${UNMOUNT_MARGIN * 100}% ${UNMOUNT_MARGIN * 100}%`,
      }
    );
    for (const section of sections) {
      near.observe(section.el);
      far.observe(section.el);
    }
  }

  /* --- The report's frames ------------------------------------------------- */

  /** An element's box in the world's own coordinates, before the world's transform: its layout offsets up to the world. */
  const worldBox = (el: HTMLElement) => {
    let x = 0;
    let y = 0;
    for (
      let at: HTMLElement | null = el;
      at && at !== world;
      at = at.offsetParent as HTMLElement | null
    ) {
      x += at.offsetLeft;
      y += at.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };

  /** A frame as it drew, its box read from layout in the world's own pixels, never from the screen: the same whatever the zoom. */
  function frameRender(frame: Frame): FrameRender {
    const at = worldBox(frame.el);
    const box = {
      x: at.x + frame.body.offsetLeft,
      y: at.y + frame.body.offsetTop,
      w: frame.body.offsetWidth,
      h: frame.body.offsetHeight,
    };
    let state: FrameRender["state"] = "empty";
    let { error } = frame;
    if (error) {
      state = "failed";
    } else if (frame.column.width === "own" && frame.story.formUnread) {
      // Its own width is one the stage can't read: drawn at none, it would pass for drawn at a width it never asked for.
      error = {
        message: frame.story.formUnread,
        file: null,
        line: null,
        column: null,
      };
      state = "failed";
    } else if (drew(frame.body)) {
      error =
        page.atFloor(frame.story, frame.column.width, frame.body) ?? undefined;
      state = error ? "failed" : "drawn";
    }
    const probeRead = frame.section.probes
      .get(frame.story.name)
      ?.delta.get(frame.column.interaction);
    return {
      story: frame.story.name,
      label: frame.story.label,
      form: page.formWords(frame.story, frame.column.width),
      interaction: frame.column.interaction,
      scheme: page.schemeOf(frame.column),
      width: box.w,
      state,
      box,
      text: firstWords(frame.body),
      parts: partsOf(frame.body, root),
      ...(error ? { error } : {}),
      ...(frame.column.interaction === "rest" || !probeRead
        ? {}
        : { delta: probeRead }),
    };
  }

  /** Each frame's status line, from the report: written only when it changes, as each write repaints the frame's layer. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each frame's status line from one report, its words by its state
  function statuses(report: Parameters<Mode["reported"]>[0]): void {
    for (const section of sections) {
      const drawn = report.sections.find((one) => one.file === section.file);
      for (const frame of section.frames.values()) {
        const read = drawn?.frames.find(
          (one) =>
            one.story === frame.story.name &&
            one.interaction === frame.column.interaction &&
            frame.key.endsWith(`|${frame.column.scheme}|${frame.column.width}`)
        );
        const status = frame.el.querySelector<HTMLElement>(
          ".cawco-frame-status"
        );
        if (status && read) {
          status.dataset.state = read.state;
          const words =
            read.state === "failed"
              ? `failed: ${read.error?.message ?? ""}${read.error?.file ? ` at ${read.error.file}:${read.error.line}:${read.error.column}` : ""}`
              : `${read.state} ${read.box.w}×${read.box.h}`;
          if (status.textContent !== words) {
            status.textContent = words;
          }
        }
      }
    }
  }

  /* --- The card's world, fitted to its view ------------------------------- */

  const zoom = { x: WORLD_INSET.x, y: WORLD_INSET.y, z: 1 };
  const place = () => {
    // An embed stands in the page's own flow: it never moves.
    world.style.transform = embed
      ? ""
      : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})`;
  };
  /** Zoom to the content's width, never past 1. */
  const fit = () => {
    const box = canvas.getBoundingClientRect();
    const width = world.scrollWidth || box.width;
    zoom.z = Math.max(ZOOM_MIN, Math.min(1, (box.width - 48) / width));
    zoom.x = WORLD_INSET.x;
    zoom.y = WORLD_INSET.y;
    place();
  };

  /* --- Edges: moves always, the agent's own when it sent them ---------- */

  /** The rest frame (first column) of a story, named `Story` or `file:Story`. */
  const restFrame = (name: string, file?: string): HTMLElement | null => {
    const [inFile, story] =
      name.includes(":") && !file
        ? (name.split(LAST_COLON) as [string, string])
        : [file, name];
    for (const section of sections) {
      if (inFile && section.file !== inFile) {
        continue;
      }
      for (const frame of section.frames.values()) {
        if (frame.story.name === story && frame.column.interaction === "rest") {
          return frame.el;
        }
      }
    }
    return null;
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: gathers the three kinds of edge and draws each from one frame's box side to the other's in one pass
  function drawEdges(): void {
    const lines: {
      from: HTMLElement;
      to: HTMLElement;
      label: string;
      kind: "move" | "edge" | "group";
    }[] = [];
    for (const section of sections) {
      for (const story of section.mod?.SHEET.stories ?? []) {
        if (!(story.play && story.from)) {
          continue;
        }
        const from = restFrame(story.from, section.file);
        const to = restFrame(story.name, section.file);
        if (from && to) {
          const fired = section.moves.find((one) => one.to === story.name);
          lines.push({
            from,
            to,
            kind: "move",
            // The arrow is the edge's own marker: the words name the two ends.
            label: fired
              ? `${story.from} to ${story.name} · ${fired.animations.length} animation${fired.animations.length === 1 ? "" : "s"}`
              : `${story.from} to ${story.name}`,
          });
        }
      }
    }
    for (const edge of spec.edges ?? []) {
      const from = restFrame(edge.from);
      const to = restFrame(edge.to);
      if (from && to) {
        lines.push({ from, to, kind: "edge", label: edge.label ?? "" });
      }
    }
    for (const [child, parent] of Object.entries(spec.group ?? {})) {
      const from = restFrame(parent);
      const to = restFrame(child);
      if (from && to) {
        lines.push({ from, to, kind: "group", label: "" });
      }
    }
    // An end not drawn has no box: no edge is drawn to it.
    const drawn = lines.filter((line) =>
      [line.from, line.to].every((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })
    );
    // None to draw and none drawn: nothing is written, so nothing in the world repaints.
    if (drawn.length === 0 && edges.childElementCount === 1) {
      return;
    }
    edges.replaceChildren();
    edges.innerHTML = `<defs><marker id="cawco-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>`;
    // Every edge joins two stories' rest frames, and a rest frame stands in
    // its section's first column: so every edge runs in the world's left
    // gutter, out of its frame's left side, along a lane of its own and into
    // the other's, crossing no frame whatever the grid; its label stands in
    // the gutter too, left of every lane. The labels' widths set the gutter.
    const svg = "http://www.w3.org/2000/svg";
    const texts = drawn.map((line) => {
      if (!line.label) {
        return null;
      }
      const text = document.createElementNS(svg, "text");
      text.classList.add("cawco-edge-label");
      text.setAttribute("text-anchor", "end");
      text.textContent = line.label;
      if (line.kind === "move") {
        text.dataset.cawcoMove = "";
      }
      edges.append(text);
      return text;
    });
    const widest = Math.max(
      0,
      ...texts.map((text) => text?.getComputedTextLength() ?? 0)
    );
    const lanesWide =
      drawn.length > 0 ? EDGE_OUT + EDGE_LANE * (drawn.length - 1) : 0;
    const gutter =
      drawn.length > 0
        ? Math.ceil(lanesWide + (widest > 0 ? EDGE_LABEL_GAP * 2 + widest : 0))
        : 0;
    world.style.setProperty("--cawco-gutter", `${gutter}px`);
    const origin = world.getBoundingClientRect();
    const local = (rect: DOMRect) => ({
      x: (rect.x - origin.x) / zoom.z,
      y: (rect.y - origin.y) / zoom.z,
      w: rect.width / zoom.z,
      h: rect.height / zoom.z,
    });
    const labelsEnd = gutter - lanesWide - EDGE_LABEL_GAP;
    let below = Number.NEGATIVE_INFINITY;
    const placed = drawn
      .map((line, lane) => {
        const a = local(line.from.getBoundingClientRect());
        const b = local(line.to.getBoundingClientRect());
        return { line, lane, a, b, words: texts[lane] ?? null };
      })
      .sort((one, two) => (one.a.y + one.b.y) / 2 - (two.a.y + two.b.y) / 2);
    for (const { line, lane, a, b, words } of placed) {
      const x = gutter - EDGE_OUT - EDGE_LANE * lane;
      const fromY = a.y + a.h / 2;
      const toY = b.y + b.h / 2;
      const turn = Math.min(EDGE_TURN, Math.abs(toY - fromY) / 2);
      const down = toY >= fromY ? 1 : -1;
      const path = document.createElementNS(svg, "path");
      path.setAttribute(
        "d",
        [
          `M${a.x - EDGE_CLEAR} ${fromY}`,
          `H${x + turn}`,
          `Q${x} ${fromY} ${x} ${fromY + down * turn}`,
          `V${toY - down * turn}`,
          `Q${x} ${toY} ${x + turn} ${toY}`,
          `H${b.x - EDGE_CLEAR}`,
        ].join(" ")
      );
      path.classList.add("cawco-edge", `cawco-edge-${line.kind}`);
      if (line.kind !== "group") {
        path.setAttribute("marker-end", "url(#cawco-arrow)");
      }
      edges.append(path);
      if (words) {
        // At its lane's middle, below the label above it where two would meet.
        const y = Math.max((fromY + toY) / 2 + 4, below + EDGE_LABEL_LINE);
        below = y;
        words.setAttribute("x", String(labelsEnd));
        words.setAttribute("y", String(y));
      }
    }
  }

  window.addEventListener("resize", () => drawEdges());
  new ResizeObserver(() => {
    drawEdges();
    page.later();
    sayShape();
  }).observe(world);

  // Each section stands in its place until it draws; its load waits on the observer's first callback (a card's) or starts now (an embed's).
  for (const section of sections) {
    standIn(section, toDraw(plans[section.file]?.stories ?? []));
  }
  if (embed) {
    tellGraphFetched();
    // Its stories load now, not on the observer's first callback: a frame off the page's screen gets no rendering steps until it is scrolled to, and its module is fetched and mounted meanwhile.
    page.quietly(pump());
  }
  place();

  return {
    bodies: () =>
      sections.flatMap((section) =>
        [...section.frames.values()].map((frame) => ({
          body: frame.body,
          mounted: frame.mounted,
        }))
      ),
    framesOf: (section) =>
      [...framed(section).frames.values()].map(frameRender),
    mediaWidth: () => {
      // Asked between mounts: at the one width every frame drawn has.
      const widths = new Set<number | null>();
      for (const section of sections) {
        for (const frame of section.frames.values()) {
          widths.add(page.widthOf(frame.story, frame.column.width));
        }
      }
      const [only] = widths;
      return (
        (widths.size === 1 && only !== undefined ? only : null) ??
        canvas.clientWidth
      );
    },
    overridden: (section, story) => {
      for (const frame of framed(section).frames.values()) {
        if (frame.story.name === story) {
          mountFrame(frame);
        }
      }
    },
    shown,
    failed,
    reported: (report) => {
      statuses(report);
      drawEdges();
      if (card) {
        fit();
      }
    },
    restyled: () => {
      for (const section of sections) {
        if (section.loaded) {
          page.quietly(columnsFor(section));
        }
      }
    },
    updated: () => {
      for (const section of sections) {
        if (section.loaded) {
          page.quietly(columnsFor(section));
        }
      }
    },
    redressed: () => {
      for (const section of sections) {
        if (!section.loaded) {
          continue;
        }
        syncFrames(section);
        for (const frame of section.frames.values()) {
          dress(frame);
          const small = frame.label.querySelector(".cawco-frame-small");
          if (small) {
            small.textContent = smallOf(frame.story, frame.column);
          }
        }
      }
    },
    selected: () => undefined,
  };
}
