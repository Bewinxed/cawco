/**
 * The component canvas (component canvas §2–3): the page a stage serves at
 * `CANVAS_PATH`, in the project's own page and CSS. Every story of each
 * states file is mounted live as a frame, in every interaction state the
 * CSS reaches (pseudo.ts), at the canvas's schemes and widths; frames stand
 * in sections, a section per states file loaded only when it comes into
 * view; the world pans and zooms by one transform. After each draw the page
 * measures every frame and posts a render report to the stage, the one
 * source every tool answers from.
 *
 * The stage's entry module hands {@link boot} the framework's adapter
 * (`mountStory`, answering `unmount` and `update`) and how to load each
 * section; everything else is read from the page's URL: `file` per
 * section, `spec` (core `CanvasSpec`), and `scheme`, `width`, `motion`,
 * `all` and `by`; and from the plan the stage writes into the page (core
 * `SectionPlan`): each section's name and its stories, so a section names
 * itself and stands its frames in their places before its module loads.
 */

import { readWithin } from "@cawco/core/bounded";
import {
  type AnimationRead,
  CANVAS_EMBED_SIZE,
  CANVAS_PLAN_ID,
  type CanvasSpec,
  FORMS,
  type FormName,
  type FramePictureRead,
  type FrameRender,
  type Interaction,
  type MoveRender,
  type PageError,
  type PostedReport,
  type RenderReport,
  type Scheme,
  SECTION_MISSING,
  SECTION_WRITTEN,
  type SectionPlan,
  type SectionRender,
  type SheetOnPage,
  type Story,
  sectionName,
} from "@cawco/core/stage";
import { shellWords } from "@cawco/core/words/shell";
import { Chrome } from "./chrome";
import {
  deltaOf,
  drew,
  firstWords,
  fromRoot,
  pageError,
  partsOf,
  readAnimation,
  snapshot,
} from "./measure";
import { queriesIn, userEventIn } from "./play";
import {
  allClass,
  emptyReach,
  forceMotion,
  type PseudoState,
  type Rewrite,
  rewriteSheet,
} from "./pseudo";
import { onPageScheme, pageScheme } from "./scheme";
import { frameAsViewport, windowHeight, windowWidth } from "./viewport";
import { frameWidths, splitWidth, WIDTH_CONTAINER } from "./width";

/** What the adapter is handed for one story (Storybook's `decorateStory` inputs). */
export interface MountSpec {
  args: Record<string, unknown>;
  component: unknown;
  context: Record<string, unknown>;
  decorators: unknown[];
  render: unknown;
}

/** A mounted story: taken down, or its props changed in place. */
export interface Mounted {
  unmount: () => void;
  update: (next: Record<string, unknown>) => void;
}

export interface Adapter {
  mountStory: (
    target: HTMLElement,
    spec: MountSpec,
    failed: (error: unknown) => void
  ) => Mounted;
}

/** A states file's module as the stage serves it (`cawco:sheet/<file>.js`). */
export interface SectionModule {
  HASH: string;
  module: Record<string, unknown>;
  SHEET: SheetOnPage;
}

/** Vite's error as its server sends it to pages (`prepareError`): its message, the module's id and its place. */
interface ViteError {
  frame?: string;
  id?: string;
  loc?: { column?: number; file?: string; line?: number };
  message: string;
  pluginCode?: string;
}

/**
 * Why a section didn't load: its states file isn't there (`missing`), the
 * stage couldn't compile a module it imports (`compile`, with Vite's code
 * frame when it sent one), or its code threw in the page (`page`).
 */
interface SectionFailure {
  error: PageError;
  frame: string | null;
  kind: "missing" | "compile" | "page";
}

/** Each failure's line, the error formula's what happened and what it means: the stage's words stand under Show details. */
const FAILED_LINE: Record<SectionFailure["kind"], (name: string) => string> = {
  missing: (name) =>
    `${name}'s states file isn't there yet, so none of its stories are drawn.`,
  compile: (name) =>
    `${name} doesn't compile, so none of its stories are drawn.`,
  page: (name) => `${name} didn't load, so none of its stories are drawn.`,
};

/** How long a section's failed import waits for the stage's words. Our call: Vite sends them before it answers the request. */
const STAGE_SAYS_MS = 1000;

export interface BootOptions {
  adapter: Adapter;
  /** The house faces' `@font-face` rules (Figtree, JetBrains Mono), their files served beside the canvas. */
  faces: string;
  /** How to load each section's module, by its states file. */
  /** A section's module; `fresh`, past whatever the browser kept of an import of it that failed. */
  load: (file: string, fresh?: boolean) => Promise<SectionModule>;
  /** The toolchain root, absolute: dev paths are made relative to it. */
  root: string;
  /** CawCo's tokens (DESIGN.md), `:root` scoped by the chrome to its own. */
  tokens: string;
}

/** The pseudo-classes each forced interaction puts on a frame. */
const FORCED: Record<Exclude<Interaction, "rest">, PseudoState[]> = {
  hover: ["hover"],
  focus: ["focus", "focus-visible", "focus-within"],
  pressed: ["active", "hover"],
};
/** The pseudo-class whose rules decide whether an interaction has a column. */
const DECIDES: Record<Exclude<Interaction, "rest">, PseudoState[]> = {
  hover: ["hover"],
  focus: ["focus", "focus-visible", "focus-within"],
  pressed: ["active"],
};
const FOCUSABLE =
  'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';

/** How long a move may play before it is read as stuck. Ours. */
const PLAY_LIMIT_MS = 6000;
/** How long a move's animations are waited on after its play ends. Ours. */
const SETTLE_LIMIT_MS = 3000;
/** How far past the view a section loads, and past which a loaded one is taken down (viewports). Ours. */
const LOAD_MARGIN = 1;
const UNMOUNT_MARGIN = 3;
/** How many sections a stage's render keeps mounted as it sweeps. Ours: a whole canvas's picture holds a few. */
const SWEEP_KEPT = 3;
/** The quiet after the last change before a report is posted. Ours. */
const REPORT_QUIET_MS = 200;

export type WidthSlot = number | "own";

export interface View {
  /** Every scheme and every preset width, as more columns. */
  all: boolean;
  motion: "on" | "reduce";
  /** `page`: the frames take the page's own scheme. */
  scheme: Scheme | "both" | "page";
  /** Null: each story at its own form (or its content's width). */
  widths: number[] | null;
}

export interface Column {
  interaction: Interaction;
  scheme: Scheme | "page";
  width: WidthSlot;
}

export interface Frame {
  body: HTMLElement;
  column: Column;
  el: HTMLElement;
  error?: PageError;
  key: string;
  label: HTMLElement;
  mounted?: Mounted;
  section: Section;
  story: Story;
}

/** A story's interaction reading, from its off-screen probe. */
interface Probe {
  delta: Map<
    Interaction,
    { animations: AnimationRead[]; changed: ReturnType<typeof deltaOf> }
  >;
}

export interface Section {
  el: HTMLElement;
  /** Why its module didn't load, which it says where its frames would stand; null while it hasn't failed. */
  failure: SectionFailure | null;
  file: string;
  frames: Map<string, Frame>;
  grid: HTMLElement;
  head: HTMLElement;
  /** The interactions each story reaches, by story. */
  interactions: Map<string, Interaction[]>;
  loaded: boolean;
  loading?: Promise<void>;
  mod?: SectionModule;
  moves: MoveRender[];
  /** Its name in plain words: its states file's title, else its component's, else its file's. */
  name: string;
  probes: Map<string, Probe>;
  /** What stands for its frames until they draw: the line saying what it waits for and each story's frame on its way, or why it didn't load. */
  standIns: HTMLElement[];
}

/** A section module's address as an HMR update names it: `/@id/__x00__cawco:sheet/<the states file, encoded>.js`. */
const SECTION_PATH = /cawco:sheet\/([^?]+)\.js(?:\?|$)/;

/** The states file (from the toolchain root) an update's module path is the section of; null for any other module. */
const sectionOfPath = (path: string): string | null => {
  const encoded = path.match(SECTION_PATH)?.[1];
  return encoded ? decodeURIComponent(encoded) : null;
};

const frameTick = () =>
  new Promise<void>((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done()))
  );

/** The view the page's URL asks for. */
function viewOf(params: URLSearchParams): View {
  const scheme = params.get("scheme");
  const width = params.get("width");
  const widths = width
    ? width
        .split(",")
        .map(Number)
        .filter((one) => one > 0)
    : [];
  return {
    scheme:
      scheme === "light" || scheme === "dark" || scheme === "both"
        ? scheme
        : "page",
    widths: widths.length > 0 ? widths : null,
    motion: params.get("motion") === "reduce" ? "reduce" : "on",
    all: params.get("all") === "1",
  };
}

/**
 * A section's head: its name in plain words in the title role, over its file
 * in small print on one row inside the head (PAGE_CSS), its middle let go
 * first so its file's own name stays; the whole path on hover.
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

/** Each states file's plan as the stage wrote it into the page; none when the page has no plan. */
const planOfPage = (): Record<string, SectionPlan> => {
  try {
    return JSON.parse(
      document.getElementById(CANVAS_PLAN_ID)?.textContent ?? "{}"
    ) as Record<string, SectionPlan>;
  } catch {
    return {};
  }
};

const specOf = (params: URLSearchParams): CanvasSpec => {
  try {
    return JSON.parse(params.get("spec") ?? "{}") as CanvasSpec;
  } catch {
    return {};
  }
};

/** A frame's key: its file, story and column. */
export const frameKey = (file: string, story: string, column: Column): string =>
  `${file}|${story}|${column.interaction}|${column.scheme}|${column.width}`;

/** The canvas's state, for the stage's daemon render and the probe kit. */
export interface CanvasState {
  files: string[];
  /**
   * The frame of story `name` (`Story`, or `file:Story` where two states
   * files name one story alike) in state `interaction`, for its picture:
   * its key, its section woken when the stage's sweep took it down; or why
   * there is none, in words.
   */
  frameNamed: (
    name: string,
    interaction?: Interaction
  ) => Promise<{ key: string } | { refused: string }>;
  frames: () => { key: string; story: string; interaction: Interaction }[];
  go: (key: string) => void;
  /**
   * For a picture of frame `key`: how much wider and taller the window must
   * be for the canvas to hold it whole at its own size, {0, 0} when it does;
   * null when no such frame is drawn. On a phone, read after `pose`: a frame
   * not shown there has no box.
   */
  lacks: (key: string) => { h: number; w: number } | null;
  loaded: () => string[];
  /** Frame `key`'s body as it stands, for its picture; null when no such frame is drawn. */
  picture: (key: string) => FramePictureRead | null;
  playMove: (file: string, to: string) => Promise<MoveRender | null>;
  /**
   * Frame `key` placed for its picture: at its own size (zoom 1) whatever
   * the window's width, a phone's included, in the middle of the canvas,
   * at once, and held there as its box or the canvas changes. Answers the
   * room the window still lacks for it (`lacks`), read once it is shown.
   */
  pose: (key: string) => { h: number; w: number } | null;
  report: RenderReport | null;
  reports: number;
  /** Whether frame `key` is settled: fonts loaded, no finite animation on it, in it or on what holds it still running. */
  settled: (key: string) => boolean;
  setView: (next: Partial<View>) => void;
  /** Every section drawn once: a stage's render reads the stage's report then. */
  swept: boolean;
  view: View;
  world: () => { x: number; y: number; z: number };
}

declare global {
  interface Window {
    __cawcoCanvas?: CanvasState;
    __cawcoErrors?: { at: number; error: unknown }[];
    __cawcoSheetChosen?: string | null;
    __cawcoSheetOnPage?: SheetOnPage;
  }
}

/** The overlay's bridge into the artifact's doc (preview-overlay page.ts `cawco`), when a panel shows the page. */
export interface Bridge {
  on: (
    event: "picks",
    listener: (picks: Record<string, { value?: unknown }>) => void
  ) => () => void;
  set: (key: string, value: unknown) => Promise<void>;
}
export const bridge = (): Bridge | undefined =>
  (window as unknown as { cawco?: Bridge }).cawco;

export function boot(options: BootOptions): void {
  const { adapter, root } = options;
  const params = new URLSearchParams(location.search);
  const files = params.getAll("file");
  const spec = specOf(params);
  const by = params.get("by") === "stage" ? "stage" : "panel";
  /**
   * The panel map's live card (`by=map`): a second page of a canvas that
   * draws its frames fitted to the card and never posts, so the report
   * stays the panel's own page's (chrome `asCard`).
   */
  const card = params.get("by") === "map";
  /**
   * A decision page's Preview (`by=embed`): a second page of a canvas that
   * draws only the stories `story` names (every story when it names none),
   * at rest, one under another in the page's own flow, each at its own size
   * (1 CSS px per px, never scaled), with none of the canvas's chrome; it
   * never posts, and tells the page holding it how tall it stands and how
   * wide its widest story is (`cawco:embed-size`, `sayShape`), so the frame
   * is that wide and that tall.
   */
  const embed = params.get("by") === "embed";
  const named = new Set(params.getAll("story"));
  const view = viewOf(params);
  const base = location.pathname.slice(
    0,
    Math.max(0, location.pathname.lastIndexOf("/@cawco/"))
  );
  const rewrite: Rewrite = { reach: emptyReach(), refused: new Set() };
  const pageErrors: PageError[] = [];
  const sections: Section[] = [];
  const overrides = new Map<string, Record<string, unknown>>();
  let chosen = window.__cawcoSheetChosen ?? null;
  let reportTimer: ReturnType<typeof setTimeout> | undefined;
  let reports = 0;
  /** The person's drags, by frame key, from the artifact's doc. */
  let moved: Record<string, [number, number]> = {};

  document.documentElement.classList.add("cawco-canvas-page");
  document.documentElement.classList.toggle("cawco-embed", embed);
  const canvas = document.getElementById("cawco-canvas") as HTMLElement;
  const world = document.createElement("div");
  world.className = "cawco-world";
  const edges = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  edges.classList.add("cawco-edges", "cawco-ui");
  world.append(edges);
  canvas.append(world);
  /** Off screen: where a story's states are probed and its moves played, never seen. */
  const rig = document.createElement("div");
  rig.className = "cawco-rig";
  rig.setAttribute("aria-hidden", "true");
  document.body.append(rig);

  /* --- The page's own errors, from before the module ran ---------------- */

  const heard = (error: unknown) => {
    pageErrors.push(pageError(error, root, base));
    if (pageErrors.length > 20) {
      pageErrors.shift();
    }
    later();
  };
  /*
   * What the stage said of a module it couldn't serve: Vite's error, which
   * its server sends every page as it answers that request 500 (its
   * `logError`), here as the entry's `cawco:stage-error`. The browser's own
   * error for the failed import names only the URL ("Failed to fetch
   * dynamically imported module"), so a section that didn't load says the
   * stage's words.
   */
  let stageSaid: { at: number; failure: SectionFailure } | null = null;
  const stageHeard = new Set<() => void>();
  window.addEventListener("cawco:stage-error", (event) => {
    const err = (event as CustomEvent<ViteError | undefined>).detail;
    if (!err?.message) {
      return;
    }
    const at = (err.loc?.file ?? err.id ?? "").split("?")[0] ?? "";
    const own = at.startsWith(`${root}/`);
    stageSaid = {
      at: performance.now(),
      failure: {
        kind: err.pluginCode === SECTION_MISSING ? "missing" : "compile",
        frame: err.frame?.trim() || null,
        error: {
          message: err.message.trim(),
          file: own ? fromRoot(at, root) : null,
          line: own ? (err.loc?.line ?? null) : null,
          // Vite's (Rollup's) column is 0-based.
          column:
            own && typeof err.loc?.column === "number"
              ? err.loc.column + 1
              : null,
        },
      },
    };
    for (const done of stageHeard) {
      done();
    }
  });
  const saidSince = (since: number): SectionFailure | null =>
    stageSaid && stageSaid.at >= since ? stageSaid.failure : null;
  /** Why a section's import that began at `since` failed: the stage's words heard since, or within {@link STAGE_SAYS_MS}; else the page's own error. */
  async function loadFailure(
    error: unknown,
    since: number
  ): Promise<SectionFailure> {
    if (!saidSince(since)) {
      await new Promise<void>((done) => {
        const finish = () => {
          clearTimeout(timer);
          stageHeard.delete(finish);
          done();
        };
        const timer = setTimeout(finish, STAGE_SAYS_MS);
        stageHeard.add(finish);
      });
    }
    return (
      saidSince(since) ?? {
        kind: "page",
        frame: null,
        error: pageError(error, root, base),
      }
    );
  }
  /** A promise the page does not wait on: what it throws is a page error, never lost. */
  const quietly = (promise: Promise<unknown>) => {
    promise.catch(heard);
  };
  for (const one of window.__cawcoErrors ?? []) {
    heard(one.error);
  }
  window.__cawcoErrors = undefined;
  window.addEventListener("error", (event) =>
    heard(event.error ?? event.message)
  );
  window.addEventListener("unhandledrejection", (event) => heard(event.reason));

  /* --- The CSS: interaction states and motion, rewritten as sheets come -- */

  const sheetsNow = (): CSSStyleSheet[] => [
    ...document.styleSheets,
    ...document.adoptedStyleSheets,
  ];
  /** A sheet the canvas writes for itself (its page style, DialKit's, the width probe): it answers the window. */
  const canvasOwned = (sheet: CSSStyleSheet) => {
    const node = sheet.ownerNode;
    return (
      node instanceof HTMLElement &&
      ["cawcoCanvas", "cawcoDialkit", "cawcoProbe"].some(
        (key) => key in node.dataset
      )
    );
  };
  const rewriteAll = () => {
    for (const sheet of sheetsNow()) {
      // Width first: the state rewrite then reaches the rules inside the containers it makes.
      if (!canvasOwned(sheet)) {
        frameWidths(sheet, rewrite.refused);
      }
      rewriteSheet(sheet, rewrite);
      forceMotion(sheet, view.motion);
    }
  };
  /** The project's page background and ink, as its body's rules write them: each frame draws on them under its own scheme. */
  let pageGround: { background: string; color: string } | null = null;
  const groundOf = () => {
    if (pageGround) {
      return pageGround;
    }
    let background = "";
    let color = "";
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && BODY_RULE.test(rule.selectorText)) {
          background =
            rule.style.getPropertyValue("background-color") ||
            rule.style.getPropertyValue("background") ||
            background;
          color = rule.style.getPropertyValue("color") || color;
        } else if ("cssRules" in rule && !(rule instanceof CSSStyleRule)) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of sheetsNow()) {
      try {
        visit(sheet.cssRules);
      } catch {
        // cross-origin: not read
      }
    }
    pageGround = {
      background: background || "Canvas",
      color: color || "CanvasText",
    };
    return pageGround;
  };
  let rewriting = false;
  new MutationObserver(() => {
    if (rewriting) {
      return;
    }
    rewriting = true;
    queueMicrotask(() => {
      rewriting = false;
      rewriteAll();
      pageGround = null;
      for (const section of sections) {
        if (section.loaded) {
          quietly(columnsFor(section));
        }
      }
    });
  }).observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLLinkElement) {
        rewriteAll();
      }
    },
    true
  );
  rewriteAll();

  /* --- Script that asks matchMedia: reduced motion, and the frame's width */

  const media = window.matchMedia.bind(window);
  /** The width of the frame whose story mounts now: undefined between mounts, null for a frame without one. */
  let mounting: number | null | undefined;
  /** The one width every frame drawn has, null where they differ or one has none. */
  const sharedWidth = (): number | null => {
    const widths = new Set<number | null>();
    for (const section of sections) {
      for (const frame of section.frames.values()) {
        widths.add(widthOf(frame.story, frame.column.width));
      }
    }
    const [only] = widths;
    return widths.size === 1 && only !== undefined ? only : null;
  };
  /**
   * Where the engine answers a width condition at a given width: a hidden
   * container (`cawco-probe`) set to that width, a rule per condition
   * marking its child, so every syntax a container query takes (ranges,
   * `and`, `or`) answers as the frame's CSS does.
   */
  const probeStyle = document.createElement("style");
  probeStyle.dataset.cawcoProbe = "";
  document.head.append(probeStyle);
  const probeBox = document.createElement("div");
  probeBox.dataset.cawcoProbe = "";
  probeBox.setAttribute("aria-hidden", "true");
  probeBox.style.cssText =
    "position: absolute; inset-block-start: 0; inset-inline-start: -100000px; block-size: 0; overflow: hidden; visibility: hidden; pointer-events: none; container: cawco-probe / inline-size;";
  const probeMark = document.createElement("i");
  probeBox.append(probeMark);
  document.body.append(probeBox);
  const conditions = new Map<string, number | null>();
  /** Whether `condition` holds in a container `width` px wide; null where the engine takes no such condition. */
  const holdsAt = (condition: string, width: number): boolean | null => {
    let at = conditions.get(condition);
    if (at === undefined) {
      const { sheet } = probeStyle;
      at = sheet?.cssRules.length ?? null;
      try {
        sheet?.insertRule(
          `@container cawco-probe ${condition} { [data-cawco-probe] > i[data-q="${at}"] { --cawco-q: 1; } }`,
          at ?? 0
        );
      } catch {
        at = null;
      }
      conditions.set(condition, at);
    }
    if (at === null) {
      return null;
    }
    probeBox.style.inlineSize = `${width}px`;
    probeMark.dataset.q = String(at);
    return (
      getComputedStyle(probeMark).getPropertyValue("--cawco-q").trim() === "1"
    );
  };
  /* --- Floating layers: the frame they open from is their viewport (viewport.ts) */

  /** The frame last pressed or focused in, where a menu or a popover opens from. */
  let touched: Frame | null = null;
  /** The frames with a width of their own, drawn now: each is its story's viewport. */
  const widthFrames = (): Frame[] =>
    sections.flatMap((section) =>
      [...section.frames.values()].filter(
        (frame) =>
          frame.el.isConnected &&
          widthOf(frame.story, frame.column.width) !== null
      )
    );
  const touchedIn = (event: Event) => {
    const body =
      event.target instanceof Element
        ? event.target.closest(".cawco-frame-body")
        : null;
    touched = widthFrames().find((frame) => frame.body === body) ?? null;
  };
  document.addEventListener("pointerdown", touchedIn, true);
  document.addEventListener("focusin", touchedIn, true);
  /** The ids a floating layer holds: its own and its parts' (a menu's content inside its positioned wrapper). */
  const idsIn = (layer: Element): string[] =>
    [layer, ...layer.querySelectorAll("[id]")]
      .map((one) => one.id)
      .filter(Boolean);
  /**
   * The frame a floating layer belongs to: the one it stands in, or the one
   * holding the trigger that names it (`aria-controls`, a menu's or a
   * popover's; `aria-describedby`, a tooltip's), as a layer portalled out
   * of its frame (bits-ui's Portal, to the body) is named. None for an
   * element holding frames (the body, the canvas), which is no layer.
   */
  const layerFrame = (layer: Element | null): Frame | null => {
    if (!layer?.isConnected) {
      return null;
    }
    const frames = widthFrames();
    if (frames.some((frame) => layer.contains(frame.body))) {
      return null;
    }
    const inside = frames.find((frame) => frame.body.contains(layer));
    if (inside) {
      return inside;
    }
    const names = idsIn(layer).map((id) => {
      const quoted = CSS.escape(id);
      return `[aria-controls~="${quoted}"], [aria-describedby~="${quoted}"]`;
    });
    return names.length === 0
      ? null
      : (frames.find((frame) => frame.body.querySelector(names.join(", "))) ??
          null);
  };
  /**
   * The frame script asks the viewport of when no layer of a frame asks:
   * the one frame with a trigger open in it (`aria-expanded`), else the
   * frame last pressed or focused in, else the one frame with a width; none
   * (the window's own) where that names no one frame.
   */
  const askedFrame = (): Frame | null => {
    const frames = widthFrames();
    const open = frames.filter((frame) =>
      frame.body.querySelector('[aria-expanded="true"]')
    );
    if (open.length === 1) {
      return open[0] ?? null;
    }
    if (touched && (open.length === 0 ? frames : open).includes(touched)) {
      return touched;
    }
    return open.length === 0 && frames.length === 1
      ? (frames[0] ?? null)
      : null;
  };
  /** Each layer that asked at a frame, and that frame: the layers a shown frame brings into sight. */
  const layersAt = new Map<Element, Frame>();
  /** Layers brought into sight as they opened: where the person moves the view after that is theirs. */
  const sighted = new WeakSet<Element>();
  /** A layer stands open: it, or the content it positions, says so (bits-ui's `data-state`). */
  const standsOpen = (layer: Element) =>
    layer.isConnected &&
    (layer.matches('[data-state="open"]') ||
      layer.querySelector(':scope > [data-state="open"]') !== null);
  /**
   * A frame's layer collides with the frame's own box (viewport.ts), so a
   * frame the window cuts could place it where nobody sees it (a 1440
   * frame in a 1440 window, the canvas's edge past the window's). The
   * canvas moves the frame, never the layer: an open layer standing past
   * what the person sees across is brought in by its overflow, the canvas's
   * world panned. An embed is as wide as its widest frame (`sayShape`), so
   * its layers stand where they open; the page holding it scrolls it. False
   * while it is not open and placed, so it is asked again.
   */
  const reveal = (layer: Element): boolean => {
    const box = layer.getBoundingClientRect();
    if (!standsOpen(layer) || box.width === 0) {
      return false;
    }
    if (embed) {
      return true;
    }
    /** What the person sees across: the canvas, cut by the window. */
    const seen = canvas.getBoundingClientRect();
    const from = Math.max(0, seen.left);
    const to = Math.min(windowWidth(), seen.right);
    let over = 0;
    if (box.left < from) {
      over = box.left - from;
    } else if (box.right > to) {
      over = Math.min(box.right - to, box.left - from);
    }
    if (Math.abs(over) < 0.5) {
      return true;
    }
    letGo();
    zoom.x -= over;
    place();
    return true;
  };
  /** A layer as it opens, once placed (the frame after it asks): in sight, once. */
  const keepInSight = (layer: Element, frame: Frame) => {
    layersAt.set(layer, frame);
    if (sighted.has(layer)) {
      return;
    }
    sighted.add(layer);
    requestAnimationFrame(() => {
      if (!reveal(layer)) {
        sighted.delete(layer);
      }
    });
  };
  /** A frame the canvas shows: its open layers in sight with it. */
  const revealLayersOf = (el: HTMLElement) => {
    for (const [layer, frame] of layersAt) {
      if (!layer.isConnected) {
        layersAt.delete(layer);
      } else if (frame.el === el) {
        reveal(layer);
      }
    }
  };
  // Each layer asks at its own frame, the one it stands in or its trigger's.
  frameAsViewport((layer) => {
    const own = layerFrame(layer);
    if (own && layer) {
      keepInSight(layer, own);
    }
    return (own ?? askedFrame())?.body.getBoundingClientRect() ?? null;
  });

  window.matchMedia = (query: string) => {
    if (view.motion === "reduce" && REDUCED_QUERY.test(query)) {
      const reduce = query.includes("reduce");
      return {
        ...media(query),
        matches: reduce,
        media: query,
      } as MediaQueryList;
    }
    const split = splitWidth(query);
    if (split.kind !== "frame") {
      return media(query);
    }
    // A frame's story asks at its frame's width; asked between mounts, at the one width every frame has; else the canvas's, as a frame without one answers its CSS.
    const asked = mounting;
    const widthNow = () =>
      (asked === undefined ? sharedWidth() : asked) ?? canvas.clientWidth;
    // What the window still answers (a media type, a hover), and where its changes are heard.
    const rest = media(split.media || query);
    return {
      get matches() {
        const held = holdsAt(split.container, widthNow());
        return held === null
          ? media(query).matches
          : held && (!split.media || rest.matches);
      },
      media: query,
      onchange: null,
      addEventListener: rest.addEventListener.bind(rest),
      removeEventListener: rest.removeEventListener.bind(rest),
      addListener: rest.addListener.bind(rest),
      removeListener: rest.removeListener.bind(rest),
      dispatchEvent: rest.dispatchEvent.bind(rest),
    } as MediaQueryList;
  };

  /* --- Sections ----------------------------------------------------------- */

  const plans = planOfPage();
  for (const file of files) {
    const plan = plans[file];
    const name = plan?.name ?? sectionName(null, null, file);
    const el = document.createElement("section");
    el.className = "cawco-section";
    el.dataset.cawcoFile = file;
    // The overlay's picks: each story's label is an option of its states file.
    el.dataset.cawcoChoice = file;
    const head = document.createElement("header");
    head.className = "cawco-section-head cawco-ui";
    headOf(head, file, name);
    const grid = document.createElement("div");
    grid.className = "cawco-grid";
    el.append(head, grid);
    world.append(el);
    const section: Section = {
      file,
      el,
      head,
      grid,
      name,
      standIns: [],
      failure: null,
      frames: new Map(),
      interactions: new Map(),
      loaded: false,
      moves: [],
      probes: new Map(),
    };
    sections.push(section);
  }

  /**
   * A section on its way: one line saying what it waits for, its columns'
   * heads, and each planned story's frame as a skeleton in the cell its
   * frame takes (its label, then a block at its width), so the frames land
   * where they stood. All of it is seen only once the wait has lasted the
   * grace (`cawco-waiting`, PAGE_CSS; DESIGN.md's Real Wait Rule); before
   * it, nothing. Run once the columns' rules below are defined.
   */
  function standIn(section: Section, stories: SectionPlan["stories"]): void {
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

  /** What stood for a section's frames, taken away: they drew, or it says why not. */
  const clearStandIns = (section: Section) => {
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
    if (!media("(prefers-reduced-motion: no-preference)").matches) {
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
   * does with reduced motion.
   */
  function holdStandIns(section: Section): HTMLElement[] {
    const kept = revealOf()
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
    const look = revealOf();
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

  /**
   * A section whose module didn't load: it says so in its own place, its
   * error and where it threw under Show details, never a blank canvas.
   */
  function failedSection(section: Section, failure: SectionFailure): void {
    const { error, frame, kind } = failure;
    clearStandIns(section);
    const failed = document.createElement("div");
    failed.className = "cawco-section-failed cawco-ui";
    failed.setAttribute("role", "alert");
    const line = document.createElement("p");
    line.className = "cawco-section-failed-line";
    line.textContent = FAILED_LINE[kind](section.name);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = shellWords.showDetails;
    // The house's disclosure (dashboard RowFault): its words say what a press does.
    details.addEventListener("toggle", () => {
      summary.textContent = details.open
        ? shellWords.hideDetails
        : shellWords.showDetails;
    });
    const words = document.createElement("pre");
    words.textContent = error.message;
    details.append(summary, words);
    if (error.file) {
      // Its place on one line: the path gives way inside, its line and column never.
      const at = `:${error.line ?? 1}:${error.column ?? 1}`;
      const place = document.createElement("p");
      place.className = "cawco-section-failed-place";
      place.title = `${error.file}${at}`;
      const path = document.createElement("span");
      path.textContent = error.file;
      const lineColumn = document.createElement("span");
      lineColumn.textContent = at;
      place.append(path, lineColumn);
      details.append(place);
    }
    if (frame) {
      const code = document.createElement("pre");
      code.className = "cawco-section-failed-frame";
      code.textContent = frame;
      details.append(code);
    }
    failed.append(line, details);
    section.head.after(failed);
    section.standIns = [failed];
    section.failure = failure;
    sayShape();
    later();
  }

  const sectionOf = (file: string) => sections.find((one) => one.file === file);

  /**
   * The stories of `all` the page draws: an embed's the ones it names, in
   * the order it names them (a Preview's `stories`), any other page's every
   * one, in its file's order.
   */
  const toDraw = <One extends { name: string }>(all: readonly One[]): One[] =>
    named.size === 0
      ? [...all]
      : [...named].flatMap((name) => all.filter((one) => one.name === name));

  /** The stories a section draws, in the order `toDraw` gives. */
  const storiesOf = (section: Section): Story[] =>
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

  const widthOf = (story: Story, slot: WidthSlot): number | null =>
    slot === "own" ? (story.form?.width ?? null) : slot;

  const formWords = (story: Story, slot: WidthSlot): string => {
    const width = widthOf(story, slot);
    if (width === null) {
      return "fit";
    }
    const preset = (Object.keys(FORMS) as FormName[]).find(
      (one) => FORMS[one] === width
    );
    return `${preset ?? "width"} ${width}`;
  };

  /** A frame's scheme: its column's, or the page's own (scheme.ts: the host's theme, else the system's). */
  const schemeOf = (column: Column): Scheme =>
    column.scheme === "page" ? pageScheme() : column.scheme;

  /**
   * A frame's small line: its story's name where the label above it says
   * other words (an unnamed story's label says "Unnamed"), its form, its
   * scheme when the frames show both, and its state past rest.
   */
  const smallOf = (story: Story, column: Column): string => {
    const bits = [formWords(story, column.width)];
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

  /** One frame's element: its label (a pick of its story) over its body, in the section's grid. */
  function frameFor(section: Section, story: Story, column: Column): Frame {
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
    const label = document.createElement("button");
    label.type = "button";
    label.className = "cawco-frame-label cawco-ui";
    label.dataset.option = story.name;
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
    const offset = moved[frame.key];
    frame.el.style.translate = offset ? `${offset[0]}px ${offset[1]}px` : "";
    if (!frame.el.isConnected) {
      section.grid.append(frame.el);
    }
  }

  /** Every column the section's stories reach, in the grid's order: interactions within each scheme and width. */
  function columnsOfSection(section: Section): Column[] {
    const reached = new Set<Interaction>(["rest"]);
    for (const list of section.interactions.values()) {
      for (const one of list) {
        reached.add(one);
      }
    }
    return slotsOf().flatMap((slot) =>
      (["rest", "hover", "focus", "pressed"] as Interaction[])
        .filter((one) => reached.has(one))
        .map((interaction) => ({ interaction, ...slot }))
    );
  }

  /** The column heads of a section's grid. */
  function heads(section: Section): void {
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
        bits.unshift(formWords({ form: null } as Story, column.width));
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

  /** The args a story mounts with: the meta's, its own, then the pane's live ones. */
  const argsOf = (section: Section, name: string): Record<string, unknown> => {
    const mod = section.mod?.module ?? {};
    const meta = (mod.default ?? {}) as Record<string, unknown>;
    const csf = csfOf(mod, name);
    return {
      ...((meta.args ?? {}) as object),
      ...((csf?.args ?? {}) as object),
      ...(overrides.get(`${section.file}|${name}`) ?? {}),
    };
  };

  /** A story's CSF object (a function story is its `render`). */
  const csfOf = (
    mod: Record<string, unknown>,
    name: string
  ): Record<string, unknown> | null => {
    const value = mod[name];
    if (!value) {
      return null;
    }
    return typeof value === "function"
      ? { render: value, ...(value as unknown as Record<string, unknown>) }
      : (value as Record<string, unknown>);
  };

  /** What the adapter mounts for story `name` of `section`, with `args`. */
  function specFor(
    section: Section,
    name: string,
    args: Record<string, unknown>
  ): MountSpec {
    const mod = section.mod?.module ?? {};
    const meta = (mod.default ?? {}) as Record<string, unknown>;
    const csf = csfOf(mod, name) ?? {};
    return {
      args,
      context: {
        args,
        id: name,
        name: (csf.name ?? name) as string,
        title: (meta.title ?? section.file) as string,
        parameters: {
          ...((meta.parameters ?? {}) as object),
          ...((csf.parameters ?? {}) as object),
        },
        argTypes: {},
        globals: {},
        viewMode: "story",
      },
      component: csf.component ?? meta.component,
      render: csf.render ?? meta.render,
      decorators: [
        ...((csf.decorators ?? []) as unknown[]),
        ...((meta.decorators ?? []) as unknown[]),
      ],
    };
  }

  /** Mounts one story into `body`, its failure kept on `into`. */
  function mountInto(
    body: HTMLElement,
    section: Section,
    name: string,
    args: Record<string, unknown>,
    into: { error?: PageError }
  ): Mounted | undefined {
    into.error = undefined;
    const was = mounting;
    // What the story's script asks of matchMedia while it mounts, its frame answers.
    const width = Number.parseFloat(body.style.width);
    mounting = Number.isFinite(width) ? width : null;
    try {
      return adapter.mountStory(body, specFor(section, name, args), (error) => {
        into.error = pageError(error, root, base);
        later();
      });
    } catch (error) {
      into.error = pageError(error, root, base);
      console.error(`[cawco] story ${name} did not mount:`, error);
    } finally {
      mounting = was;
    }
  }

  /**
   * A frame body at a story's width: its width, and the width container its
   * story's width conditions answer to (width.ts). A body without one shrinks
   * to its story, so it can be no container: it answers the canvas.
   */
  function sizeBody(body: HTMLElement, width: number | null): void {
    body.style.width = width === null ? "" : `${width}px`;
    body.style.container =
      width === null ? "" : `${WIDTH_CONTAINER} / inline-size`;
  }

  let saidShape = "";
  /**
   * The page holding an embed (a decision page's Preview) makes its frame
   * this tall and, where a story says its own width, as wide as the widest
   * (null where none does): every frame at its own size, 1 CSS px per px,
   * never scaled, the frames whole, no inner scroll; the page holding it
   * scrolls it where its room is narrower. Said whenever it changes: from
   * the world's resize observer while the frame is on the page's screen,
   * and as its sections draw. A cross-origin frame off the page's screen
   * gets no rendering steps until it is scrolled to, so no observer
   * delivery: said only from there, nine of ten Previews of one canvas below
   * the fold stood in a 16:10 box at 252px beside the first at its own
   * 760px. Its height read here lays it out, rendering steps or none.
   */
  function sayShape(): void {
    if (!embed) {
      return;
    }
    const height = Math.ceil(world.offsetHeight);
    const widths = sections.flatMap((section) =>
      [...section.frames.values()].flatMap(
        (frame) => widthOf(frame.story, frame.column.width) ?? []
      )
    );
    const width = widths.length > 0 ? Math.max(...widths) : null;
    const shape = `${width} ${height}`;
    if (shape === saidShape) {
      return;
    }
    saidShape = shape;
    window.parent.postMessage({ type: CANVAS_EMBED_SIZE, height, width }, "*");
  }

  /** The frame's body set for its column: its scheme, width and forced state. */
  function dress(frame: Frame): void {
    const { body, column, story } = frame;
    const scheme = schemeOf(column);
    const ground = groundOf();
    body.style.colorScheme = scheme;
    body.dataset.theme = scheme;
    body.classList.toggle("dark", scheme === "dark");
    body.style.backgroundColor = ground.background;
    body.style.color = ground.color;
    sizeBody(body, widthOf(story, column.width));
    for (const states of Object.values(FORCED)) {
      for (const state of states) {
        body.classList.remove(allClass(state));
      }
    }
    if (column.interaction !== "rest") {
      for (const state of FORCED[column.interaction]) {
        body.classList.add(allClass(state));
      }
    }
    frame.el.toggleAttribute("data-cawco-selected", chosen === story.name);
    frame.el.toggleAttribute(
      "data-cawco-edited",
      overrides.has(`${frame.section.file}|${story.name}`)
    );
    for (const value of dialVars) {
      body.style.setProperty(value[0], value[1]);
    }
  }

  function mountFrame(frame: Frame): void {
    frame.mounted?.unmount();
    frame.mounted = undefined;
    frame.body.replaceChildren();
    dress(frame);
    frame.mounted = mountInto(
      frame.body,
      frame.section,
      frame.story.name,
      { ...argsOf(frame.section, frame.story.name), ...dialArgs },
      frame
    );
  }

  /** The interactions a story's rest frame reaches: each whose CSS rules match an element in it. */
  function reachedIn(body: HTMLElement): Interaction[] {
    const found: Interaction[] = ["rest"];
    for (const interaction of ["hover", "focus", "pressed"] as const) {
      const hit = DECIDES[interaction].some((state) =>
        [...rewrite.reach[state]].some((selector) => {
          let els: Element[];
          try {
            els = [...body.querySelectorAll(selector)];
          } catch {
            return false;
          }
          if (interaction !== "focus") {
            return els.length > 0;
          }
          return els.some(
            (el) =>
              el.matches(FOCUSABLE) ||
              (state === "focus-within" && el.querySelector(FOCUSABLE))
          );
        })
      );
      if (hit) {
        found.push(interaction);
      }
    }
    return found;
  }

  /** Each story's columns, from its rest frame: frames made for each, frames of columns it no longer reaches taken down. */
  async function columnsFor(section: Section): Promise<void> {
    // An embed shows each story at rest only.
    if (!section.mod || embed) {
      return;
    }
    await frameTick();
    rewriteAll();
    let changed = false;
    for (const story of section.mod.SHEET.stories) {
      const rest = [...section.frames.values()].find(
        (one) =>
          one.story.name === story.name && one.column.interaction === "rest"
      );
      if (!rest) {
        continue;
      }
      const reached = reachedIn(rest.body);
      const before = section.interactions.get(story.name)?.join() ?? "";
      if (before !== reached.join()) {
        section.interactions.set(story.name, reached);
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    syncFrames(section);
    await probeAll(section);
    later();
  }

  /** The section's frames as its stories and columns say: new ones mounted, gone ones taken down. */
  function syncFrames(section: Section): void {
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
    // An embed's section holding none of the stories it draws takes no place in it (PAGE_CSS `data-cawco-none`).
    section.el.toggleAttribute(
      "data-cawco-none",
      embed && !!section.mod && stories.length === 0
    );
    heads(section);
    chrome.outline();
  }

  /** Loads a section's states file and mounts its stories. */
  function loadSection(section: Section): Promise<void> {
    section.loading ??= (async () => {
      const since = performance.now();
      try {
        section.mod = await options.load(section.file, !!section.failure);
      } catch (error) {
        heard(error);
        failedSection(section, await loadFailure(error, since));
        section.loading = undefined;
        return;
      }
      showSection(section);
    })();
    return section.loading;
  }

  /** A section's stories mounted from its module: rest first, then the columns its CSS reaches. */
  function showSection(section: Section): void {
    const mod = section.mod as SectionModule;
    section.loaded = true;
    section.failure = null;
    const had = new Set(section.frames.values());
    const going = holdStandIns(section);
    section.name = sectionName(
      mod.SHEET.meta.title,
      section.name,
      section.file
    );
    headOf(section.head, section.file, section.name);
    delete section.el.dataset.cawcoAsleep;
    for (const story of mod.SHEET.stories) {
      if (!section.interactions.has(story.name)) {
        section.interactions.set(story.name, ["rest"]);
      }
    }
    syncFrames(section);
    revealed(
      going,
      [...section.frames.values()]
        .filter((frame) => !had.has(frame))
        .map((frame) => frame.el)
    );
    said(section);
    if (embed) {
      unnamedInEmbed();
      sayShape();
      // Once what the stories mounted has settled (their own effects, the faces).
      setTimeout(sayShape);
      document.fonts.ready.then(sayShape, () => undefined);
    } else {
      quietly(
        columnsFor(section).then(() => {
          quietly(probeAll(section));
          quietly(playAll(section));
        })
      );
    }
    later();
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

  /** Takes a far section's frames down; its module and its last report stay. */
  function sleepSection(section: Section): void {
    if (!section.loaded || movePlaying === section) {
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

  /** Whether a section stands within a viewport of the canvas's view. */
  const nearView = (section: Section): boolean => {
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
   * before its time).
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one walk of the sections, in order, for a person's view and for the stage's sweep alike
  const pump = async () => {
    if (pumping) {
      return;
    }
    pumping = true;
    try {
      for (const section of sections) {
        if (section.loaded) {
          continue;
        }
        // A section taken down keeps its drawn height; one never drawn is a placeholder, past which nothing is judged yet.
        const asleep = section.el.dataset.cawcoAsleep !== undefined;
        if (!(sweeping || nearView(section))) {
          if (asleep) {
            continue;
          }
          break;
        }
        // biome-ignore lint/performance/noAwaitInLoops: each section laid out before the next is judged
        await loadSection(section);
        await frameTick();
        if (sweeping) {
          await settled(section);
        }
      }
      if (sweeping) {
        canvasState.swept = true;
      }
    } finally {
      pumping = false;
    }
  };
  /**
   * The stage's own render draws every section in turn, view or not, each
   * reported before the next, at most {@link SWEEP_KEPT} kept mounted: the
   * stage keeps each section's report, so one taken down is still said.
   */
  const sweeping = by === "stage";
  const settled = async (section: Section) => {
    // Its columns, probes and moves, then its report.
    await columnsFor(section);
    await probeAll(section);
    await playAll(section);
    await post();
    const mounted = sections.filter((one) => one.loaded);
    for (const one of mounted.slice(0, -SWEEP_KEPT)) {
      sleepSection(one);
    }
  };
  const near = new IntersectionObserver(
    () => quietly(pump()),
    // The canvas is the root: it clips its world, so a margin on the page's own viewport would never reach past its fold.
    { root: canvas, rootMargin: `${LOAD_MARGIN * 100}% ${LOAD_MARGIN * 100}%` }
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
    // An embed never sleeps a section: its page scrolls it in and out of
    // view, and nothing would wake it (pump passes a section asleep).
    if (!(sweeping || embed)) {
      far.observe(section.el);
    }
  }

  /* --- Probes: each story's states read off screen ----------------------- */

  async function probeAll(section: Section): Promise<void> {
    for (const story of section.mod?.SHEET.stories ?? []) {
      const reached = (section.interactions.get(story.name) ?? []).filter(
        (one) => one !== "rest"
      );
      if (reached.length === 0) {
        section.probes.delete(story.name);
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one probe in the rig at a time
      section.probes.set(story.name, await probe(section, story, reached));
    }
    later();
  }

  /**
   * An animation brought to its end: `finish()` throws on one that never
   * ends (an `infinite` loop, a working dot's pulse; Web Animations,
   * "finishing an animation": an infinite effect end is an
   * InvalidStateError), and the throw ended the whole sweep, so a loop is
   * cancelled instead.
   */
  const land = (one: Animation): void => {
    if (one.effect?.getComputedTiming().endTime === Number.POSITIVE_INFINITY) {
      one.cancel();
    } else {
      one.finish();
    }
  };
  /** Every animation in `body` landed: what it has fired so far, played to its end or, a loop, cancelled. */
  const landAll = (body: HTMLElement): void => {
    for (const one of body.getAnimations({ subtree: true })) {
      land(one);
    }
  };

  /** One story mounted in the rig, each of its interactions forced and released: the delta and the transitions each fires. */
  async function probe(
    section: Section,
    story: Story,
    reached: Interaction[]
  ): Promise<Probe> {
    const body = document.createElement("div");
    body.className = "cawco-frame-body";
    sizeBody(body, widthOf(story, "own"));
    rig.append(body);
    const fake: { error?: PageError } = {};
    const mounted = mountInto(
      body,
      section,
      story.name,
      argsOf(section, story.name),
      fake
    );
    const result: Probe = { delta: new Map() };
    try {
      await frameTick();
      for (const interaction of reached) {
        if (interaction === "rest") {
          continue;
        }
        // What runs at rest landed first (a loop cancelled), so both snapshots read the base style, never a frame of a loop.
        landAll(body);
        const before = snapshot(body);
        const t0 = document.timeline.currentTime as number;
        for (const state of FORCED[interaction]) {
          body.classList.add(allClass(state));
        }
        // biome-ignore lint/performance/noAwaitInLoops: each state read alone
        await frameTick();
        const animations = body
          .getAnimations({ subtree: true })
          .map((one) => readAnimation(one, t0));
        landAll(body);
        const changed = deltaOf(before, snapshot(body), root);
        for (const state of FORCED[interaction]) {
          body.classList.remove(allClass(state));
        }
        await frameTick();
        landAll(body);
        result.delta.set(interaction, { animations, changed });
      }
    } finally {
      mounted?.unmount();
      body.remove();
    }
    return result;
  }

  /* --- Moves: `from` + `play` ------------------------------------------ */

  /** Stories of a section that declare a flow move: `from` and a `play`. */
  const movesOf = (section: Section): { from: string; to: string }[] =>
    (section.mod?.SHEET.stories ?? [])
      .filter((one) => one.play && one.from)
      .map((one) => ({ from: one.from as string, to: one.name }));

  let movePlaying: Section | null = null;

  interface Played {
    move: MoveRender;
    records: {
      animation: Animation;
      keyframes: Keyframe[];
      read: AnimationRead;
      target: Element | null;
    }[];
  }

  /** Plays move `to` (from its `from`) in `body`: mounted from the start story's args, then its `play`; every animation it fired, read as it started. */
  async function playIn(
    section: Section,
    to: string,
    body: HTMLElement
  ): Promise<Played> {
    const mod = section.mod?.module ?? {};
    const csf = csfOf(mod, to) ?? {};
    const from = String(
      csf.from ??
        section.mod?.SHEET.stories.find((one) => one.name === to)?.from ??
        ""
    );
    const move: MoveRender = { from, to, animations: [] };
    const records: Played["records"] = [];
    if (!(from && typeof csf.play === "function")) {
      move.error = {
        message: `${to} has no from and play to move by.`,
        file: null,
        line: null,
        column: null,
      };
      return { move, records };
    }
    const into: { error?: PageError } = {};
    const args = argsOf(section, from);
    const mounted = mountInto(body, section, from, args, into);
    await frameTick();
    const seen = new Set<Animation>();
    const t0 = document.timeline.currentTime as number;
    let watching = true;
    const watch = () => {
      for (const one of body.getAnimations({ subtree: true })) {
        if (!seen.has(one)) {
          seen.add(one);
          const effect = one.effect as KeyframeEffect | null;
          records.push({
            animation: one,
            keyframes: effect?.getKeyframes() ?? [],
            read: readAnimation(one, t0),
            target: effect?.target ?? null,
          });
        }
      }
      if (watching) {
        requestAnimationFrame(watch);
      }
    };
    requestAnimationFrame(watch);
    let current = { ...args };
    try {
      const played = await readWithin(PLAY_LIMIT_MS, () =>
        (csf.play as (context: object) => Promise<void>)({
          args: current,
          canvasElement: body,
          canvas: queriesIn(body),
          userEvent: userEventIn(body),
          step: async (_name: string, run: () => Promise<void>) => await run(),
          update: async (next: Record<string, unknown>) => {
            current = { ...current, ...next };
            mounted?.update(next);
            await frameTick();
          },
        })
      );
      if (played.kind === "unanswered") {
        throw new Error(`${to}'s play ran past ${PLAY_LIMIT_MS / 1000} s.`);
      }
      // The motion it started, played out (or the wait's end).
      const end = performance.now() + SETTLE_LIMIT_MS;
      while (
        performance.now() < end &&
        [...seen].some((one) => one.playState === "running")
      ) {
        // biome-ignore lint/performance/noAwaitInLoops: waiting on the engine's clock
        await frameTick();
      }
    } catch (error) {
      move.error = pageError(error, root, base);
    } finally {
      watching = false;
    }
    if (into.error && !move.error) {
      move.error = into.error;
    }
    move.animations = records.map((one) => one.read);
    (body as HTMLElement & { __cawcoMounted?: Mounted }).__cawcoMounted =
      mounted;
    return { move, records };
  }

  /** Every move of a section played off screen: what each fires, for the report. */
  async function playAll(section: Section): Promise<void> {
    const moves: MoveRender[] = [];
    for (const { to } of movesOf(section)) {
      const body = document.createElement("div");
      body.className = "cawco-frame-body";
      const story = storiesOf(section).find((one) => one.name === to);
      sizeBody(body, story ? widthOf(story, "own") : null);
      rig.append(body);
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one move in the rig at a time
        moves.push((await playIn(section, to, body)).move);
      } finally {
        (
          body as HTMLElement & { __cawcoMounted?: Mounted }
        ).__cawcoMounted?.unmount();
        body.remove();
      }
    }
    section.moves = moves;
    drawEdges();
    later();
  }

  /**
   * A move played where the person sees it, in its destination's rest frame,
   * then held for the timeline: each animation it fired made again, paused,
   * on its own element with its own keyframes, so the timeline's playhead
   * seeks what the engine ran and its tuned timing previews live.
   */
  async function playVisible(
    file: string,
    to: string
  ): Promise<{
    move: MoveRender;
    replays: { animation: Animation | null; read: AnimationRead }[];
  } | null> {
    const section = sectionOf(file);
    if (!section?.mod) {
      return null;
    }
    const frame = [...section.frames.values()].find(
      (one) => one.story.name === to && one.column.interaction === "rest"
    );
    if (!frame) {
      return null;
    }
    movePlaying = section;
    frame.mounted?.unmount();
    frame.mounted = undefined;
    frame.body.replaceChildren();
    dress(frame);
    const played = await playIn(section, to, frame.body);
    frame.mounted = (
      frame.body as HTMLElement & { __cawcoMounted?: Mounted }
    ).__cawcoMounted;
    // Each animation again, paused, where its element still stands; an
    // outro's element is gone once the move ends, so its clip is tuned
    // without a preview.
    const replays = played.records.map((one) => {
      if (!(one.target?.isConnected && one.keyframes.length > 0)) {
        return { animation: null, read: one.read };
      }
      const animation = one.target.animate(one.keyframes, {
        duration: one.read.duration,
        delay: one.read.start + one.read.delay,
        easing: one.read.easing,
        fill: "both",
      });
      animation.pause();
      animation.currentTime = 0;
      return { animation, read: one.read };
    });
    const kept = section.moves.findIndex((one) => one.to === to);
    if (kept === -1) {
      section.moves.push(played.move);
    } else {
      section.moves[kept] = played.move;
    }
    later();
    return { move: played.move, replays };
  }

  /* --- What the page says: the sheet for the inspector, the report -------- */

  function said(section: Section): void {
    if (!section.mod) {
      return;
    }
    const sheet = { ...section.mod.SHEET, file: section.file };
    window.__cawcoSheetOnPage = sheet;
    dispatchEvent(new CustomEvent("cawco:sheet", { detail: sheet }));
  }

  function later(): void {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => quietly(post()), REPORT_QUIET_MS);
  }

  /**
   * A frame that drew at its body's floor (its `min-inline-size`) with no
   * width of its own: the story gave it none, and its content measures
   * nothing (a size container), so it shrank to the floor and reads as a
   * sliver. Said as the frame's failure, in words; no width is put in its
   * place. Null when it stands at a width of its own or past the floor.
   */
  function atFloor(frame: Frame, box: DOMRect): PageError | null {
    if (widthOf(frame.story, frame.column.width) !== null) {
      return null;
    }
    const floor =
      Number.parseFloat(getComputedStyle(frame.body).minInlineSize) || 0;
    const width = box.width / zoom.z;
    return floor > 0 && width <= floor + 0.5
      ? {
          message: `drawn ${Math.round(width)}px wide: the story has no width of its own; give it a viewport or a width`,
          file: null,
          line: null,
          column: null,
        }
      : null;
  }

  function frameRender(frame: Frame): FrameRender {
    const box = frame.body.getBoundingClientRect();
    const origin = world.getBoundingClientRect();
    let state: FrameRender["state"] = "empty";
    let { error } = frame;
    if (error) {
      state = "failed";
    } else if (frame.el.getClientRects().length === 0) {
      // Not on screen at this width (a phone shows one frame at a time): it has not drawn nothing, it is not shown.
      state = "unshown";
    } else if (drew(frame.body)) {
      error = atFloor(frame, box) ?? undefined;
      state = error ? "failed" : "drawn";
    }
    const probeRead = frame.section.probes
      .get(frame.story.name)
      ?.delta.get(frame.column.interaction);
    return {
      story: frame.story.name,
      label: frame.story.label,
      form: formWords(frame.story, frame.column.width),
      interaction: frame.column.interaction,
      scheme: schemeOf(frame.column),
      width: Math.round(box.width / zoom.z),
      state,
      box: {
        x: Math.round((box.x - origin.x) / zoom.z),
        y: Math.round((box.y - origin.y) / zoom.z),
        w: Math.round(box.width / zoom.z),
        h: Math.round(box.height / zoom.z),
      },
      text: firstWords(frame.body),
      parts: partsOf(frame.body, root),
      ...(error ? { error } : {}),
      ...(frame.column.interaction === "rest" || !probeRead
        ? {}
        : { delta: probeRead }),
    };
  }

  function reportNow(): RenderReport {
    const drawn: SectionRender[] = sections
      .filter((one) => one.loaded && one.mod)
      .map((section) => ({
        file: section.file,
        title: section.mod?.SHEET.meta.title ?? section.file,
        hash: section.mod?.HASH ?? "",
        frames: [...section.frames.values()].map(frameRender),
        moves: section.moves,
        notForced: [...rewrite.refused].slice(0, 20),
      }));
    const unnamed = sections.flatMap((section) =>
      (section.mod?.SHEET.stories ?? [])
        .filter((story) => !story.label)
        .map((story) => `${section.file}:${story.name}`)
    );
    return {
      by,
      at: new Date().toISOString(),
      page: { errors: [...pageErrors] },
      sections: drawn,
      unnamed,
    };
  }

  async function post(): Promise<void> {
    const report = reportNow();
    chrome.counts(report);
    drawEdges();
    if (card) {
      fit();
    }
    try {
      if (!(card || embed)) {
        // A section whose module the page couldn't load posts no section: its error goes as the stage's, which knows only what it served.
        const posted: PostedReport = {
          ...report,
          unloaded: sections.flatMap((section) =>
            section.failure?.kind === "page"
              ? [{ file: section.file, error: section.failure.error }]
              : []
          ),
        };
        await fetch(new URL("rendered", location.href), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(posted),
        });
      }
    } catch {
      // The stage is away: the next draw posts again.
    }
    reports += 1;
    canvasState.report = report;
    canvasState.reports = reports;
  }

  /* --- Pan and zoom: one transform -------------------------------------- */

  const zoom = { x: 0, y: 0, z: 1 };
  const place = () => {
    // An embed stands in the page's own flow: it never pans or zooms.
    world.style.transform = embed
      ? ""
      : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})`;
    chrome.where();
  };
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 4;
  const zoomAt = (z: number, px: number, py: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    zoom.x = px - ((px - zoom.x) * next) / zoom.z;
    zoom.y = py - ((py - zoom.y) * next) / zoom.z;
    zoom.z = next;
    place();
  };
  canvas.addEventListener(
    "wheel",
    (event) => {
      // An embed's wheel scrolls the page holding it.
      if (embed) {
        return;
      }
      event.preventDefault();
      letGo();
      if (event.ctrlKey || event.metaKey) {
        // The world's translate is the canvas's own: the pointer measured from the canvas's corner, which stands under the head.
        const box = canvas.getBoundingClientRect();
        zoomAt(
          zoom.z * Math.exp(-event.deltaY * 0.01),
          event.clientX - box.x,
          event.clientY - box.y
        );
      } else {
        zoom.x -= event.shiftKey ? event.deltaY : event.deltaX;
        zoom.y -= event.shiftKey ? 0 : event.deltaY;
        place();
      }
    },
    { passive: false }
  );
  // The browser scrolls a clipped box to bring a focused or clicked element
  // into view; the canvas turns that scroll into its own pan, so the
  // transform stays the one place a frame stands.
  canvas.addEventListener("scroll", () => {
    if (canvas.scrollTop === 0 && canvas.scrollLeft === 0) {
      return;
    }
    letGo();
    zoom.x -= canvas.scrollLeft;
    zoom.y -= canvas.scrollTop;
    canvas.scrollTop = 0;
    canvas.scrollLeft = 0;
    place();
  });
  /** A drag on the canvas's ground pans; on a frame's label it moves the frame (past a few px, else it picks). */
  let drag: {
    key?: string;
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
    id: number;
  } | null = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (embed || (event.button !== 0 && event.button !== 1)) {
      return;
    }
    const label = (event.target as Element).closest?.(".cawco-frame-label");
    const ground =
      event.target === canvas ||
      event.target === world ||
      (event.target as Element).classList?.contains("cawco-grid") ||
      (event.target as Element).classList?.contains("cawco-section");
    if (!(label || ground || event.button === 1)) {
      return;
    }
    const key = label?.closest<HTMLElement>(".cawco-frame")?.dataset.cawcoKey;
    const was = key ? (moved[key] ?? [0, 0]) : [zoom.x, zoom.y];
    drag = {
      key,
      x: event.clientX,
      y: event.clientY,
      ox: was[0] as number,
      oy: was[1] as number,
      moved: false,
      id: event.pointerId,
    };
  });
  window.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) {
      return;
    }
    if (!drag.moved) {
      canvas.setPointerCapture?.(event.pointerId);
    }
    drag.moved = true;
    if (drag.key) {
      moved[drag.key] = [drag.ox + dx / zoom.z, drag.oy + dy / zoom.z];
      const el = world.querySelector<HTMLElement>(
        `[data-cawco-key="${CSS.escape(drag.key)}"]`
      );
      if (el) {
        el.style.translate = `${moved[drag.key]?.[0]}px ${moved[drag.key]?.[1]}px`;
      }
      drawEdges();
    } else {
      letGo();
      zoom.x = drag.ox + dx;
      zoom.y = drag.oy + dy;
      place();
    }
  });
  window.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    if (drag.moved && drag.key) {
      keepLayout();
      // The drag was no pick.
      window.addEventListener("click", (click) => click.stopPropagation(), {
        capture: true,
        once: true,
      });
    }
    drag = null;
  });

  let layoutTimer: ReturnType<typeof setTimeout> | undefined;
  /** The person's drags go into the artifact's doc, never the project. */
  const keepLayout = () => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      bridge()
        ?.set("layout", moved)
        .catch(() => undefined);
      later();
    }, 400);
  };
  const resetLayout = () => {
    moved = {};
    for (const section of sections) {
      for (const frame of section.frames.values()) {
        frame.el.style.translate = "";
      }
    }
    keepLayout();
    drawEdges();
  };

  /**
   * An element's box in the world's own coordinates, before the world's
   * transform: its layout offsets up to the world, and a frame's drag
   * (`translate`). Unlike a screen rect it is the same whatever the world's
   * transform is now, or is animating through.
   */
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
    const dragged = moved[el.dataset.cawcoKey ?? ""] ?? [0, 0];
    return {
      x: x + dragged[0],
      y: y + dragged[1],
      w: el.offsetWidth,
      h: el.offsetHeight,
    };
  };

  /**
   * The frame `go` last showed while the view is still where it put it; the
   * person's own pan or zoom lets it go. While it is held, it is shown again
   * as its box changes (its component mounting, the faces arriving, the
   * scheme re-dressing it), so where it stands never depends on when.
   */
  let held: { key: string; el: HTMLElement; own: boolean } | null = null;
  /** The world's move to the frame `show` last animated to, while it runs. */
  let flight: Animation | null = null;
  const holding = new ResizeObserver(() => {
    if (held?.el.isConnected) {
      show(held.key, held.el, false, held.own);
    }
  });
  const letGo = () => {
    held = null;
    holding.disconnect();
  };

  /**
   * Places the world so frame `el` stands in the middle of the view, from
   * its world box alone: the same at any moment for the same frame and view.
   * `ownSize`: at zoom 1 and without its section's head, as its picture is
   * taken, whatever the window's width.
   */
  const show = (
    key: string,
    el: HTMLElement,
    animate: boolean,
    ownSize = false
  ) => {
    // Marked current first: on a phone that is what shows the frame and its
    // section (chrome.ts PAGE_CSS hides the rest), and so what gives it the
    // box it is placed by.
    chrome.current(key);
    // Where the world stands now, a flight still going included; that
    // flight ends here, or it would draw its stale end over this placement.
    const from = getComputedStyle(world).transform;
    flight?.cancel();
    flight = null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const own = worldBox(el);
    if (ownSize) {
      zoom.z = 1;
    } else if (chrome.phone()) {
      // One frame at a time, as wide as the screen lets it be, never past its own size.
      zoom.z = Math.max(
        ZOOM_MIN,
        Math.min(1, (width - 24) / Math.max(1, own.w))
      );
    }
    // On a phone the frame stands alone in its section: it is shown with its section's head, which names its sheet.
    const headEl =
      chrome.phone() && !ownSize
        ? el
            .closest(".cawco-section")
            ?.querySelector<HTMLElement>(".cawco-section-head")
        : null;
    const top = headEl ? Math.min(worldBox(headEl).y, own.y) : own.y;
    const box = { x: own.x, y: top, w: own.w, h: own.y + own.h - top };
    zoom.x = width / 2 - (box.x + box.w / 2) * zoom.z;
    zoom.y =
      Math.min(height / 2, WORLD_INSET.y + (box.h * zoom.z) / 2) -
      (box.y + box.h / 2) * zoom.z;
    place();
    if (animate && !media("(prefers-reduced-motion: reduce)").matches) {
      flight = world.animate(
        [{ transform: from }, { transform: world.style.transform }],
        {
          duration: chrome.duration("--dur-panel", 280),
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        }
      );
    }
    // On a phone the frame shown changed: its edges are drawn again, to frames now drawn only.
    drawEdges();
    // Its open layers in sight with it, once the view stands where it goes;
    // a frame posed for its picture stays where its pose puts it.
    const landed = () =>
      requestAnimationFrame(() => {
        if (el.isConnected) {
          revealLayersOf(el);
        }
      });
    if (ownSize) {
      return;
    }
    if (flight) {
      flight.finished.then(landed, () => undefined);
    } else {
      landed();
    }
  };

  /** The drawn frame element of `key`. */
  const frameEl = (key: string) =>
    world.querySelector<HTMLElement>(`[data-cawco-key="${CSS.escape(key)}"]`);

  /** Brings a frame to the middle of the view, and holds it there until the person moves the view; `own`: at its own size, for its picture. */
  const go = (key: string, own = false) => {
    const el = frameEl(key);
    if (!el) {
      return;
    }
    // A frame posed for its picture stays posed when it is shown again: the
    // chrome shows its current frame anew as the window resizes or its
    // outline is rebuilt (chrome.ts `layout`, `outline`), which on a phone's
    // width would zoom it to fit under the picture being taken. Only the
    // person's own pan or zoom (`letGo`), or another frame, ends a pose.
    const posed = own || (held?.own === true && held.key === key);
    letGo();
    show(key, el, !posed, posed);
    held = { key, el, own: posed };
    holding.observe(el);
    // The canvas resizing (a dock taking its room, the pane resized) shows it again too.
    holding.observe(canvas);
    const headEl = el
      .closest(".cawco-section")
      ?.querySelector<HTMLElement>(".cawco-section-head");
    if (headEl) {
      holding.observe(headEl);
    }
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
      file?: string;
      story?: string;
    }[] = [];
    for (const section of sections) {
      for (const move of movesOf(section)) {
        const from = restFrame(move.from, section.file);
        const to = restFrame(move.to, section.file);
        if (from && to) {
          const fired = section.moves.find((one) => one.to === move.to);
          lines.push({
            from,
            to,
            kind: "move",
            // The arrow is the edge's own marker: the words name the two ends.
            label: fired
              ? `${move.from} to ${move.to} · ${fired.animations.length} animation${fired.animations.length === 1 ? "" : "s"}`
              : `${move.from} to ${move.to}`,
            file: section.file,
            story: move.to,
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
    edges.replaceChildren();
    edges.innerHTML = `<defs><marker id="cawco-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>`;
    // An end not drawn (a phone shows one frame) has no box: no edge is drawn to it.
    const drawn = lines.filter((line) =>
      [line.from, line.to].every((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })
    );
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
        text.dataset.cawcoMove = `${line.file}|${line.story}`;
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
      path.dataset.cawcoFrom = line.from.dataset.cawcoKey ?? "";
      path.dataset.cawcoTo = line.to.dataset.cawcoKey ?? "";
      if (line.kind === "move") {
        path.dataset.cawcoMove = `${line.file}|${line.story}`;
        const title = document.createElementNS(svg, "title");
        title.textContent = `${line.label}: open its timeline`;
        path.append(title);
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
  edges.addEventListener("click", (event) => {
    const move = (event.target as Element)
      .closest?.("[data-cawco-move]")
      ?.getAttribute("data-cawco-move");
    if (move) {
      const [file, to] = move.split("|") as [string, string];
      quietly(chrome.openMove(file, to));
    }
  });

  /* --- Dials: CSS variables on every frame, or args through update -------- */

  const dialVars = new Map<string, string>();
  let dialArgs: Record<string, unknown> = {};
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a dial is a CSS variable on every frame or an arg through every frame's update, said in one pass
  const applyDials = (values: Record<string, unknown>) => {
    const args: Record<string, unknown> = {};
    for (const dial of spec.dials ?? []) {
      const value = values[dial.name];
      if (value === undefined) {
        continue;
      }
      if ("cssVar" in dial.target) {
        dialVars.set(dial.target.cssVar, `${String(value)}${dial.unit ?? ""}`);
      } else {
        args[dial.target.arg] = value;
      }
    }
    const argsChanged = JSON.stringify(args) !== JSON.stringify(dialArgs);
    dialArgs = args;
    for (const section of sections) {
      for (const frame of section.frames.values()) {
        for (const [name, value] of dialVars) {
          frame.body.style.setProperty(name, value);
        }
        if (argsChanged && Object.keys(args).length > 0) {
          frame.mounted?.update(args);
        }
      }
    }
    later();
  };

  /* --- The pane's words, through the overlay ----------------------------- */

  window.addEventListener("cawco:story-args", (event) => {
    const { story, args } =
      (
        event as CustomEvent<{
          args?: Record<string, unknown> | null;
          story?: string;
        }>
      ).detail ?? {};
    for (const section of sections) {
      if (!section.mod?.SHEET.stories.some((one) => one.name === story)) {
        continue;
      }
      const key = `${section.file}|${story}`;
      if (args && typeof args === "object") {
        overrides.set(key, args);
      } else {
        overrides.delete(key);
      }
      for (const frame of section.frames.values()) {
        if (frame.story.name === story) {
          mountFrame(frame);
        }
      }
    }
    dispatchEvent(new CustomEvent("cawco:hmr"));
    later();
  });
  // The pane's mode, as the overlay hears it (preview-overlay page.ts
  // `mode`): in Comment mode the frame in view keeps no fill of its own on
  // its label (chrome.ts), since the comment target's tint is the one mark.
  window.addEventListener("cawco:mode", (event) => {
    const mode = (event as CustomEvent<{ mode?: unknown }>).detail?.mode;
    document.documentElement.toggleAttribute(
      "data-cawco-commenting",
      mode === "comment"
    );
  });
  window.addEventListener("cawco:story-select", (event) => {
    const story = (event as CustomEvent<{ story?: unknown }>).detail?.story;
    chosen = typeof story === "string" ? story : null;
    window.__cawcoSheetChosen = chosen;
    for (const section of sections) {
      for (const frame of section.frames.values()) {
        frame.el.toggleAttribute(
          "data-cawco-selected",
          frame.story.name === chosen
        );
      }
    }
  });
  /** The pane's toggles: scheme, widths, motion, all permutations, zoom. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the pane's five toggles, each re-dressing the frames it changes
  const setView = (next: Partial<View> & { zoom?: number | "fit" }) => {
    const motionWas = view.motion;
    Object.assign(view, {
      ...(next.scheme ? { scheme: next.scheme } : {}),
      ...("widths" in next ? { widths: next.widths ?? null } : {}),
      ...(next.motion ? { motion: next.motion } : {}),
      ...(typeof next.all === "boolean" ? { all: next.all } : {}),
    });
    if (view.motion !== motionWas) {
      for (const sheet of sheetsNow()) {
        forceMotion(sheet, view.motion);
      }
    }
    for (const section of sections) {
      if (section.loaded) {
        syncFrames(section);
        for (const frame of section.frames.values()) {
          dress(frame);
          const label = frame.label.querySelector(".cawco-frame-small");
          if (label) {
            label.textContent = smallOf(frame.story, frame.column);
          }
        }
      }
    }
    if (next.zoom === "fit") {
      letGo();
      fit();
    } else if (typeof next.zoom === "number") {
      letGo();
      zoomAt(next.zoom, canvas.clientWidth / 2, canvas.clientHeight / 2);
    }
    chrome.view(view);
    later();
  };
  window.addEventListener("cawco:canvas-view", (event) => {
    setView(
      (event as CustomEvent<Partial<View> & { zoom?: number | "fit" }>)
        .detail ?? {}
    );
  });
  window.addEventListener("cawco:canvas-go", (event) => {
    const key = (event as CustomEvent<{ key?: string }>).detail?.key;
    if (key) {
      go(key);
    }
  });

  /** Zoom to the content's width, never past 1. */
  const fit = () => {
    const box = canvas.getBoundingClientRect();
    const width = world.scrollWidth || box.width;
    zoom.z = Math.max(ZOOM_MIN, Math.min(1, (box.width - 48) / width));
    zoom.x = WORLD_INSET.x;
    zoom.y = WORLD_INSET.y;
    place();
  };

  /* --- HMR ------------------------------------------------------------- */

  window.addEventListener("cawco:section", (event) => {
    const mod = (event as CustomEvent<SectionModule>).detail;
    const section = sectionOf(mod?.SHEET.file ?? "");
    if (!section) {
      return;
    }
    section.mod = mod;
    for (const frame of section.frames.values()) {
      frame.mounted?.unmount();
      frame.el.remove();
    }
    section.frames.clear();
    section.interactions.clear();
    section.probes.clear();
    showSection(section);
    dispatchEvent(new CustomEvent("cawco:hmr"));
  });
  // A states file it found missing is written: its section loads again, with no reload of the canvas.
  window.addEventListener(SECTION_WRITTEN, (event) => {
    const section = sectionOf((event as CustomEvent<string>).detail ?? "");
    if (!section || section.loaded || section.loading) {
      return;
    }
    quietly(
      loadSection(section).then(() => {
        dispatchEvent(new CustomEvent("cawco:hmr"));
      })
    );
  });
  /*
   * A section that failed to load, named in an update Vite sends (a file
   * its graph imports changed: Vite's propagation reaches its section's
   * module, which accepts itself), loads again. Its module never ran, so it
   * accepted nothing in this page, and Vite's client passes the update by
   * (`fetchUpdate`: no module of that path in `hotModulesMap`). The browser
   * keeps every module it fetched by its address, the failed one too ("If
   * moduleMap[(url, moduleType)] is a module script, run onComplete given
   * moduleMap[(url, moduleType)]", html.spec.whatwg.org fetch a single
   * module script), so the section is asked for at a fresh `?t=`, and Vite
   * writes each import of a module the change reached with that module's
   * HMR stamp (`depModule.lastHMRTimestamp > 0`: `?t=`; an HMR invalidation
   * stamps the changed module and every importer up to the one accepting
   * it): only that section's graph is fetched again, at new addresses, never
   * the page.
   */
  window.addEventListener("cawco:updates", (event) => {
    const updated = new Set(
      ((event as CustomEvent<string[]>).detail ?? []).map(sectionOfPath)
    );
    for (const section of sections) {
      if (section.failure && !section.loading && updated.has(section.file)) {
        quietly(
          loadSection(section).then(() => {
            dispatchEvent(new CustomEvent("cawco:hmr"));
          })
        );
      }
    }
  });
  window.addEventListener("cawco:after-update", () => {
    for (const section of sections) {
      if (section.loaded) {
        quietly(columnsFor(section));
      }
    }
    dispatchEvent(new CustomEvent("cawco:hmr"));
    later();
  });

  /* --- The chrome: what the canvas says about itself ------------------- */

  const chrome = new Chrome({
    canvas,
    spec,
    tokens: options.tokens,
    faces: options.faces,
    view,
    sections: () => sections,
    go,
    resetLayout,
    setView,
    playVisible,
    applyDials,
    world: () => zoom,
  });

  // The page's scheme turned (the host's theme, or the system's): every frame drawn in it, and the chrome's DialKit, follow.
  onPageScheme((scheme) => {
    for (const section of sections) {
      for (const frame of section.frames.values()) {
        if (frame.column.scheme === "page") {
          dress(frame);
        }
      }
    }
    chrome.scheme(scheme);
    later();
  });

  bridge()?.on("picks", (picks) => {
    const layout = picks.layout?.value;
    if (layout && typeof layout === "object" && !drag) {
      moved = layout as Record<string, [number, number]>;
      for (const section of sections) {
        for (const frame of section.frames.values()) {
          placeFrame(frame);
        }
      }
      drawEdges();
    }
  });

  window.addEventListener("resize", () => {
    chrome.layout();
    drawEdges();
  });
  new ResizeObserver(() => {
    drawEdges();
    later();
    sayShape();
  }).observe(world);

  /* --- Pictures: a frame posed, settled and read for its picture --------- */

  /**
   * How much wider and taller the window must be for the canvas to hold
   * frame `key` whole at its own size, {0, 0} when it does; null when no
   * such frame is drawn. Read once the frame is shown: on a phone a frame
   * not shown has no box.
   */
  const lacksFor = (key: string) => {
    const el = frameEl(key);
    return el
      ? {
          w: Math.max(
            0,
            Math.ceil(el.offsetWidth + 2 * WORLD_INSET.x - canvas.clientWidth)
          ),
          h: Math.max(
            0,
            Math.ceil(el.offsetHeight + 2 * WORLD_INSET.y - canvas.clientHeight)
          ),
        }
      : null;
  };

  /**
   * The frame of story `name` (`Story`, or `file:Story` where two states
   * files name one story alike) in state `interaction`, for its picture:
   * its key, its section woken first when the stage's sweep took it down
   * (`sleepSection`); or why there is none, in words.
   */
  const frameNamed = async (
    name: string,
    interaction: Interaction = "rest"
  ): Promise<{ key: string } | { refused: string }> => {
    const [inFile, storyName] = name.includes(":")
      ? (name.split(LAST_COLON) as [string, string])
      : [undefined, name];
    const holders = sections.filter(
      (one) =>
        (inFile === undefined || one.file === inFile) &&
        one.mod?.SHEET.stories.some((each) => each.name === storyName)
    );
    const [section] = holders;
    if (!section) {
      return {
        refused: `No states file of this canvas has a story ${name}: ${sections.map((one) => `${one.file} has ${one.mod?.SHEET.stories.map((each) => each.name).join(", ") || "none drawn yet"}`).join("; ")}.`,
      };
    }
    if (holders.length > 1) {
      return {
        refused: `${storyName} is a story of ${holders.length} states files here: name one, ${holders.map((one) => `${one.file}:${storyName}`).join(" or ")}.`,
      };
    }
    if (!section.loaded) {
      await loadSection(section);
    }
    if (!section.loaded) {
      return {
        refused: `${section.file} did not load: the canvas's report says why.`,
      };
    }
    await columnsFor(section);
    await frameTick();
    const frame = [...section.frames.values()].find(
      (one) =>
        one.story.name === storyName && one.column.interaction === interaction
    );
    return frame
      ? { key: frame.key }
      : {
          refused: `${name} has no ${interaction} frame: its states are ${(section.interactions.get(storyName) ?? ["rest"]).join(", ")}.`,
        };
  };

  /** Whether frame `key` is settled: fonts loaded, and no finite animation running on it, in it (its open shadow roots too) or on what holds it (the world's flight to it). */
  const settledFor = (key: string): boolean => {
    const el = frameEl(key);
    if (!el || document.fonts.status !== "loaded") {
      return false;
    }
    const running = document.getAnimations().filter((run) => {
      const target = (run.effect as KeyframeEffect | null)?.target;
      return !!target && (target.contains(el) || el.contains(target));
    });
    const trees: (Element | ShadowRoot)[] = [el];
    for (let tree = trees.pop(); tree; tree = trees.pop()) {
      for (const one of tree.querySelectorAll("*")) {
        if (one.shadowRoot) {
          running.push(...one.shadowRoot.getAnimations());
          trees.push(one.shadowRoot);
        }
      }
    }
    return !running.some(
      (run) =>
        run.playState === "running" &&
        Number.isFinite(Number(run.effect?.getComputedTiming().endTime ?? 0))
    );
  };

  /** Frame `key`'s body as it stands on the page, for its picture: its rect, its own CSS size, the device's scale, whether it stands whole in the canvas, and the view in words. */
  const pictureOf = (key: string): FramePictureRead | null => {
    const body = frameEl(key)?.querySelector<HTMLElement>(
      ":scope > .cawco-frame-body"
    );
    if (!body) {
      return null;
    }
    const rect = body.getBoundingClientRect();
    const room = canvas.getBoundingClientRect();
    // Its border box as layout sizes it, unrounded (offsetWidth rounds) and
    // untouched by any transform: what its picture is held to.
    const style = getComputedStyle(body);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const content = style.boxSizing === "border-box";
    const own = {
      w:
        px(style.width) +
        (content
          ? 0
          : px(style.paddingLeft) +
            px(style.paddingRight) +
            px(style.borderLeftWidth) +
            px(style.borderRightWidth)),
      h:
        px(style.height) +
        (content
          ? 0
          : px(style.paddingTop) +
            px(style.paddingBottom) +
            px(style.borderTopWidth) +
            px(style.borderBottomWidth)),
    };
    return {
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      own,
      scale: devicePixelRatio,
      whole:
        rect.left >= Math.max(0, room.left) - 0.5 &&
        rect.top >= Math.max(0, room.top) - 0.5 &&
        rect.right <= Math.min(windowWidth(), room.right) + 0.5 &&
        rect.bottom <= Math.min(windowHeight(), room.bottom) + 0.5,
      view: `the world at zoom ${zoom.z} in a ${Math.round(room.width)}×${Math.round(room.height)} canvas, a ${windowWidth()}×${windowHeight()} window${chrome.phone() ? " (a phone's)" : ""}`,
    };
  };

  const canvasState: CanvasState = {
    files,
    view,
    report: null,
    reports: 0,
    swept: false,
    go: (key) => go(key),
    pose: (key) => {
      go(key, true);
      return lacksFor(key);
    },
    lacks: (key) => lacksFor(key),
    frameNamed,
    settled: settledFor,
    picture: pictureOf,
    setView,
    loaded: () => sections.filter((one) => one.loaded).map((one) => one.file),
    frames: () =>
      sections.flatMap((section) =>
        [...section.frames.values()].map((frame) => ({
          key: frame.key,
          story: frame.story.name,
          interaction: frame.column.interaction,
        }))
      ),
    playMove: async (file, to) => (await playVisible(file, to))?.move ?? null,
    world: () => ({ ...zoom }),
  };
  // Each section stands in its place until it draws, now every column's rule is defined; its load waits on the observer's first callback.
  for (const section of sections) {
    standIn(section, toDraw(plans[section.file]?.stories ?? []));
  }
  window.__cawcoCanvas = canvasState;
  if (card) {
    chrome.asCard();
  }
  if (embed) {
    chrome.asEmbed();
    // Its stories load now, not on the observer's first callback: a frame off the page's screen gets no rendering steps until it is scrolled to, and its module is fetched and mounted meanwhile.
    quietly(pump());
  } else {
    zoom.x = WORLD_INSET.x;
    zoom.y = WORLD_INSET.y;
  }
  place();
  chrome.layout();
}

/**
 * Where the world stands from the canvas's corner when fitted, and the
 * least a frame shown by `go` keeps from its top. The canvas begins under
 * the head (chrome.ts PAGE_CSS), so this is room from the head's foot.
 */
const WORLD_INSET = { x: 24, y: 16 };

/** `file:Story`: the colon before the story's name. */
const LAST_COLON = /:(?=[^:]+$)/;
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
 * path's end) never stand on the frame, so a frame's picture, taken by its
 * own rect, holds none of the canvas's lines (a review read the tip at
 * every frame's left edge as a stray speck).
 */
const EDGE_CLEAR = 4;
const BODY_RULE = /(^|,)\s*(body|html|:root)\s*(,|$)/;
const REDUCED_QUERY = /prefers-reduced-motion/;
