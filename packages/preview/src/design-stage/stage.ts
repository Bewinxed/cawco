/**
 * An HTML design's stage (core stage.ts `htmlDesignOf`): the page the design
 * graph frames for a component artifact whose pages the hub keeps, served on
 * the page's place at `/@cawco/canvas?file=…&spec=…` (preview-server
 * serve.ts `serveDesign`), the overlay in it as in every page the hub
 * serves. It answers the graph's messages as the live stage does (agent
 * stage-host canvas stage.ts; core stage-graph.ts), for what a page can be:
 *
 * - each page (`file`, a direction) is one state, `Page`, said as its sheet
 *   (`cawco:sheet`) with no props, so the graph has nothing to save into
 *   code and no move to play;
 * - a reach shows that page in the one frame this document holds, of this
 *   origin, so Comment mode points into it element by element and a pin
 *   anchors by selector there (overlay frames.ts);
 * - the view's width is the frame's: the page's viewport, its media queries
 *   and its `vw` answer it; a width wider than the room is scaled to stand
 *   whole (a transform the overlay maps its pins through), or drawn 1:1 with
 *   Actual size, the page scrolling across it;
 * - its scheme is the frame's `color-scheme`, which Firefox and WebKit give
 *   an embedded document as its preferred one (CSS Color Adjustment 1,
 *   "Opting Into a Preferred Color Scheme"); Chromium gives it the
 *   system's, so each `prefers-color-scheme` query of the page's own
 *   sheets is settled for the scheme too (core scheme-media.ts), and a page
 *   that draws dark has its root's `color-scheme` set to it, which its
 *   `light-dark()` and system colours follow;
 * - a `cssVar` dial is set on the page's root; its value as written is read
 *   off that root with no dial set on it.
 *
 * The frame is a device's screen: as wide as the width picked and as tall
 * as the stage below the panel's head; the page scrolls inside it.
 */

import { detach } from "@cawco/core/detach";
import { type MediaScheme, settledMedia } from "@cawco/core/scheme-media";
import type { SheetOnPage, Story } from "@cawco/core/stage";
import { canvasOf, FORMS } from "@cawco/core/stage";
import {
  type DialSet,
  STAGE_DIALS,
  STAGE_DIALS_WRITTEN,
  STAGE_LAID,
  STAGE_LOAD,
  STAGE_REACH,
  STAGE_REACHED,
  STAGE_ROOM,
  STAGE_SCROLLED,
  type StageLaid,
  type StageReach,
  type StageReached,
  stageDialsOf,
  stageLoadOf,
  stageReachOf,
  stageRoomOf,
} from "@cawco/core/stage-graph";

/** The one state each page is, by its export: shown by the page's own name (`display`). */
const PAGE_STORY = "Page";
/** The page's gutter beside the frame where the window has room for it, px: the live stage's (`--spacing-space-4`). */
const GUTTER = 16;
/** How far the page scrolls before the tools over the stage's foot step aside, px: the live stage's dead zone. */
const SCROLL_DEAD = 8;

/** What the hub wrote into the document for this stage: each page's name as the graph shows it. */
interface StageConfig {
  /** Each page's name, by its file: a direction's, or the design's title. */
  names: Record<string, string>;
}

/** The hub's JSON for this stage (serve.ts `designStage`), read as it wrote it. */
const config = ((): StageConfig => {
  const read: unknown = JSON.parse(
    document.getElementById("cawco-design")?.textContent ?? "{}"
  );
  const names =
    read && typeof read === "object" && "names" in read ? read.names : null;
  return {
    names: Object.fromEntries(
      Object.entries(names && typeof names === "object" ? names : {}).filter(
        (one): one is [string, string] => typeof one[1] === "string"
      )
    ),
  };
})();

const { files, spec } = canvasOf(location.pathname + location.search);
const cssDials = (spec.dials ?? []).flatMap((dial) =>
  "cssVar" in dial.target ? [{ ...dial, cssVar: dial.target.cssVar }] : []
);

/** Page `file`'s sheet: its one state, named as the page is, the design's name or its direction's. */
const sheetOf = (file: string): SheetOnPage => {
  const name = config.names[file] ?? null;
  const story: Story = {
    args: {},
    code: {},
    column: 0,
    component: null,
    display: name,
    form: null,
    formUnread: null,
    from: null,
    label: null,
    line: 0,
    name: PAGE_STORY,
    play: false,
    readOnly: null,
    records: null,
    tags: [],
  };
  return {
    file,
    components: [],
    meta: { args: {}, code: {}, component: null, title: name },
    stories: [story],
  };
};

/** A word to the graph, through the overlay, which posts each to the panel. */
const tell = (type: string, detail: object) =>
  dispatchEvent(new CustomEvent(type, { detail }));

// Every page's sheet, said now and to a panel that says hello later (the overlay's `cawco:hello`).
const said: Record<string, SheetOnPage> = Object.fromEntries(
  files.map((file) => [file, sheetOf(file)])
);
Reflect.set(window, "__cawcoSheetsOnPage", said);
for (const sheet of Object.values(said)) {
  tell("cawco:sheet", sheet);
}

/* --- The frame ------------------------------------------------------------ */

const holder = document.createElement("div");
holder.dataset.slot = "design-holder";
const frame = document.createElement("iframe");
frame.title = config.names[files[0] ?? ""] ?? "";
holder.append(frame);
document.body.append(holder);

/** The view the graph last set: its scheme, its width (none: the room's), whether a wider width is scaled to fit. */
const view: {
  fit: boolean;
  scheme: MediaScheme | null;
  width: number | null;
} = { fit: true, scheme: null, width: null };
/** The room the panel's head takes over the page's top, px. */
let room = 0;
/** The page the frame shows, by its file; null before the first reach. */
let shown: string | null = null;
/** The frame's page has loaded since it was last given one. */
let loaded = false;

/** The page's width for the frame: its own, inside any scrollbar. */
const across = () => document.documentElement.clientWidth;

function laid(): void {
  const width =
    view.width ?? Math.min(FORMS.desk, Math.max(0, across() - 2 * GUTTER));
  const scale =
    view.fit && view.width !== null && across() > 0 && width > across()
      ? across() / width
      : 1;
  const tall = Math.max(0, innerHeight - room);
  frame.style.width = `${width}px`;
  frame.style.height = `${tall / scale}px`;
  frame.style.transform = scale < 1 ? `scale(${scale})` : "";
  holder.style.width = `${width * scale}px`;
  holder.style.height = `${tall}px`;
  document.body.style.paddingTop = `${room}px`;
  const laidOut: StageLaid = {
    need: Math.ceil(width * scale + 2 * GUTTER + innerWidth - across()),
    tall: Math.ceil(tall),
    fit: null,
    scale,
  };
  tell(STAGE_LAID, laidOut);
}

/* --- The scheme ------------------------------------------------------------ */

/** Each rule's and element's media as the page wrote it, once a scheme was settled in it. */
const writtenMedia = new WeakMap<object, string>();
/** The page's own `color-scheme` on its root, as its style attribute says it, before the picked one stood there. */
let ownRootScheme: string | null = null;

const isMediaRule = (rule: CSSRule): rule is CSSMediaRule =>
  "conditionText" in rule && "media" in rule;
const isGroupingRule = (rule: CSSRule): rule is CSSGroupingRule =>
  "cssRules" in rule;
const isImportRule = (rule: CSSRule): rule is CSSImportRule =>
  "styleSheet" in rule && "href" in rule;

/** `now`, the media of `owner`, set to the page's own settled for `scheme` (none: as the page wrote it) through `set`. */
function settle(
  owner: object,
  now: string,
  scheme: MediaScheme | null,
  set: (media: string) => void
): void {
  const own = writtenMedia.get(owner) ?? now;
  const answered = scheme ? settledMedia(own, scheme) : null;
  if (answered === null && !writtenMedia.has(owner)) {
    return;
  }
  writtenMedia.set(owner, own);
  set(answered ?? own);
}

function settleRules(rules: CSSRuleList, scheme: MediaScheme | null): void {
  for (const rule of Array.from(rules)) {
    if (isMediaRule(rule)) {
      settle(rule, rule.media.mediaText, scheme, (media) => {
        rule.media.mediaText = media;
      });
    }
    if (isGroupingRule(rule)) {
      settleRules(rule.cssRules, scheme);
    }
    if (isImportRule(rule) && rule.styleSheet) {
      settleSheet(rule.styleSheet, scheme);
    }
  }
}

function settleSheet(sheet: CSSStyleSheet, scheme: MediaScheme | null): void {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    // Another origin's sheet keeps its rules as they are: its queries hear the frame's own scheme.
    return;
  }
  settleRules(rules, scheme);
}

/**
 * The frame's page drawn in `scheme`: each `prefers-color-scheme` query in
 * its sheets and on its style and link elements settled, and its root's
 * `color-scheme` that scheme where the page draws dark at all (its own
 * `color-scheme` names dark); a light-only page keeps the canvas its
 * colours were chosen on.
 */
function pageScheme(scheme: MediaScheme | null): void {
  const doc = loaded ? frame.contentDocument : null;
  if (!doc) {
    return;
  }
  for (const el of doc.querySelectorAll("style[media], link[media]")) {
    settle(el, el.getAttribute("media") ?? "", scheme, (media) =>
      el.setAttribute("media", media)
    );
  }
  for (const sheet of Array.from(doc.styleSheets)) {
    settleSheet(sheet, scheme);
  }
  const root = doc.documentElement;
  root.style.colorScheme = ownRootScheme ?? "";
  const own = doc.defaultView?.getComputedStyle(root).colorScheme ?? "";
  if (scheme && own.includes("dark")) {
    root.style.colorScheme = scheme;
  }
}

/**
 * The scheme the person picked, on the frame (the page's preferred one, in
 * Firefox and WebKit), in the page ({@link pageScheme}), and on the ground
 * round it, the body's: the overlay keeps the root in the panel's theme.
 */
function dress(): void {
  const scheme = view.scheme ?? "";
  frame.style.colorScheme = scheme;
  document.body.style.colorScheme = scheme;
  pageScheme(view.scheme);
}

/* --- The dials -------------------------------------------------------------- */

/** The values the graph last set, by dial name. */
let dialValues: Record<string, DialSet> = {};
/** The variables set on the page's root now. */
let setVars = new Map<string, string>();
/** The values as written, as last told the graph. */
let writtenSaid = "";

/** The frame's page's root, while it is loaded. */
const pageRoot = (): HTMLElement | null =>
  loaded ? (frame.contentDocument?.documentElement ?? null) : null;

/** Each `cssVar` dial's variable as the values set it, with its unit. */
const varsOf = (values: Record<string, DialSet>) => {
  const vars = new Map<string, string>();
  for (const dial of cssDials) {
    const value = values[dial.name];
    if (value !== undefined) {
      vars.set(
        dial.cssVar,
        typeof value === "number" ? `${value}${dial.unit ?? ""}` : String(value)
      );
    }
  }
  return vars;
};

/** A dial's value as the page writes it: a number's figure, a toggle's state, a colour's or option's words; null where it holds none. */
function writtenValue(
  kind: string,
  raw: string,
  unit: string | undefined
): DialSet | null {
  if (raw === "") {
    return kind === "action" ? 0 : null;
  }
  if (kind === "number" || kind === "action") {
    const figure = Number(
      (unit && raw.endsWith(unit) ? raw.slice(0, -unit.length) : raw).trim()
    );
    return Number.isFinite(figure) ? figure : null;
  }
  return kind === "toggle" ? raw === "true" || raw === "1" : raw;
}

/** The dials set on the page, and each one's value as written told the graph when it changed. */
function turn(): void {
  const root = pageRoot();
  if (!root) {
    return;
  }
  const vars = varsOf(dialValues);
  for (const name of setVars.keys()) {
    root.style.removeProperty(name);
  }
  const style = getComputedStyle(root);
  const written: Record<string, DialSet> = {};
  for (const dial of cssDials) {
    const value = writtenValue(
      dial.kind,
      style.getPropertyValue(dial.cssVar).trim(),
      dial.unit
    );
    if (value !== null) {
      written[dial.name] = value;
    }
  }
  for (const [name, value] of vars) {
    root.style.setProperty(name, value);
  }
  setVars = vars;
  const now = JSON.stringify(written);
  if (cssDials.length > 0 && now !== writtenSaid) {
    writtenSaid = now;
    tell(STAGE_DIALS_WRITTEN, { values: written });
  }
}

/* --- A reach: the page shown ------------------------------------------------ */

/** The newest reach: an older one still loading answers superseded. */
let latest = 0;
/** The page's last scroll, for the way it went. */
let lastY = 0;
let wentDown = false;

/** The frame's page heard: its scroll's way, and a press that closes the graph's open layers. */
function hearPage(): void {
  const page = frame.contentWindow;
  if (!page) {
    return;
  }
  lastY = page.scrollY;
  page.addEventListener(
    "scroll",
    () => {
      const y = page.scrollY;
      if (Math.abs(y - lastY) < SCROLL_DEAD) {
        return;
      }
      const down = y > lastY;
      lastY = y;
      if (down !== wentDown) {
        wentDown = down;
        tell(STAGE_SCROLLED, { down });
      }
    },
    { passive: true }
  );
  // A sheet the page adds later is drawn in the picked scheme too.
  const doc = frame.contentDocument;
  if (doc) {
    new MutationObserver((records) => {
      const sheets = records.some((record) =>
        Array.from(record.addedNodes).some(
          (node) => node.nodeName === "STYLE" || node.nodeName === "LINK"
        )
      );
      if (sheets) {
        pageScheme(view.scheme);
      }
    }).observe(doc, { childList: true, subtree: true });
  }
  // The overlay tells the panel of a press on this document; one on the page's is this document's too.
  page.addEventListener(
    "pointerdown",
    () => dispatchEvent(new PointerEvent("pointerdown")),
    { capture: true, passive: true }
  );
}

/** The frame showing page `file`, loaded: at once when it shows it already. */
function show(file: string): Promise<void> {
  if (shown === file && loaded) {
    return Promise.resolve();
  }
  shown = file;
  loaded = false;
  frame.title = config.names[file] ?? "";
  return new Promise((done) => {
    frame.addEventListener(
      "load",
      () => {
        loaded = true;
        ownRootScheme =
          frame.contentDocument?.documentElement.style.colorScheme || null;
        hearPage();
        pageScheme(view.scheme);
        turn();
        done();
      },
      { once: true }
    );
    frame.src = new URL(`../${file}`, location.href).href;
  });
}

async function reach(asked: StageReach): Promise<void> {
  latest = asked.ask;
  const answer: StageReached = { ask: asked.ask, move: null, on: asked.to };
  if (!files.includes(asked.to.file)) {
    tell(STAGE_REACHED, {
      ...answer,
      failed: {
        message: `No page ${asked.to.file} in this design.`,
        stack: "",
      },
    });
    return;
  }
  await show(asked.to.file);
  tell(
    STAGE_REACHED,
    asked.ask === latest ? answer : { ...answer, superseded: true as const }
  );
}

/* --- The graph's asks -------------------------------------------------------- */

/** What a word from the graph carries: the overlay hands each on as an event of its name (overlay page.ts `fromHost`). */
const detailOf = (event: Event): unknown =>
  event instanceof CustomEvent ? event.detail : null;

addEventListener(STAGE_REACH, (event) => {
  const asked = stageReachOf(detailOf(event));
  if (asked) {
    detach(reach(asked), "a design's reach");
  }
});
addEventListener(STAGE_LOAD, (event) => {
  const asked = stageLoadOf(detailOf(event));
  const sheet = asked ? said[asked.file] : undefined;
  if (sheet) {
    tell("cawco:sheet", sheet);
  }
});
addEventListener("cawco:canvas-view", (event) => {
  const set = detailOf(event);
  if (!(set && typeof set === "object")) {
    return;
  }
  const scheme = "scheme" in set ? set.scheme : undefined;
  if (scheme === "light" || scheme === "dark") {
    view.scheme = scheme;
  }
  if ("widths" in set) {
    const [width] = Array.isArray(set.widths) ? set.widths : [];
    view.width = typeof width === "number" && width > 0 ? width : null;
  }
  if ("fit" in set && typeof set.fit === "boolean") {
    view.fit = set.fit;
  }
  dress();
  laid();
});
addEventListener(STAGE_ROOM, (event) => {
  const asked = stageRoomOf(detailOf(event));
  if (asked) {
    room = asked.px;
    laid();
  }
});
addEventListener(STAGE_DIALS, (event) => {
  const asked = stageDialsOf(detailOf(event));
  if (asked) {
    dialValues = asked.values;
    turn();
  }
});
addEventListener("resize", laid);

laid();
