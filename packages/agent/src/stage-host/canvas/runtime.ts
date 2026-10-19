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
  CANVAS_PLAN_ID,
  type CanvasSpec,
  FORMS,
  type FormName,
  type FrameRender,
  type Interaction,
  type MoveRender,
  type PageError,
  type RenderReport,
  type Scheme,
  type SectionPlan,
  type SectionRender,
  type SheetOnPage,
  type Story,
  sectionName,
} from "@cawco/core/stage";
import { Chrome } from "./chrome";
import {
  deltaOf,
  drew,
  firstWords,
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

export interface BootOptions {
  adapter: Adapter;
  /** The house faces' `@font-face` rules (Figtree, JetBrains Mono), their files served beside the canvas. */
  faces: string;
  /** How to load each section's module, by its states file. */
  load: (file: string) => Promise<SectionModule>;
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

/**
 * An animation a forced state fired, put at its end so the next state reads
 * from rest. One that never ends (a spinner's loop) has no end to put it
 * at: `finish()` throws on it ("Cannot finish Animation with an infinite
 * target effect end"), so it is left running.
 */
const settleRun = (run: Animation): void => {
  if (Number.isFinite(run.effect?.getComputedTiming().endTime ?? 0)) {
    run.finish();
  }
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

/** A section's head: its name in plain words in the title role, over its file in small print. */
const headOf = (head: HTMLElement, file: string, name: string): void => {
  const named = document.createElement("span");
  named.className = "cawco-section-title";
  named.textContent = name;
  const path = document.createElement("span");
  path.className = "cawco-section-file";
  path.textContent = file;
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
  frames: () => { key: string; story: string; interaction: Interaction }[];
  go: (key: string) => void;
  loaded: () => string[];
  playMove: (file: string, to: string) => Promise<MoveRender | null>;
  report: RenderReport | null;
  reports: number;
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
  const rewriteAll = () => {
    for (const sheet of sheetsNow()) {
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

  /* --- Reduced motion for script that asks matchMedia ------------------- */

  const media = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => {
    if (view.motion === "reduce" && REDUCED_QUERY.test(query)) {
      const reduce = query.includes("reduce");
      return {
        ...media(query),
        matches: reduce,
        media: query,
      } as MediaQueryList;
    }
    return media(query);
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
   * A section whose module didn't load: it says so in its own place, its
   * error and where it threw under Show details, never a blank canvas.
   */
  function failedSection(section: Section, error: PageError): void {
    clearStandIns(section);
    const failed = document.createElement("div");
    failed.className = "cawco-section-failed cawco-ui";
    failed.setAttribute("role", "alert");
    const line = document.createElement("p");
    line.className = "cawco-section-failed-line";
    line.textContent = `${section.name} didn't load, so none of its stories are drawn.`;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Show details";
    // The house's disclosure (dashboard RowFault): its words say what a press does.
    details.addEventListener("toggle", () => {
      summary.textContent = details.open ? "Hide details" : "Show details";
    });
    const words = document.createElement("pre");
    words.textContent = error.file
      ? `${error.message}\n${error.file}:${error.line ?? 1}:${error.column ?? 1}`
      : error.message;
    details.append(summary, words);
    failed.append(line, details);
    section.head.after(failed);
    section.standIns = [failed];
  }

  const sectionOf = (file: string) => sections.find((one) => one.file === file);

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
    const stories = section.mod?.SHEET.stories ?? [];
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
    try {
      return adapter.mountStory(body, specFor(section, name, args), (error) => {
        into.error = pageError(error, root, base);
        later();
      });
    } catch (error) {
      into.error = pageError(error, root, base);
      console.error(`[cawco] story ${name} did not mount:`, error);
    }
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
    const width = widthOf(story, column.width);
    body.style.width = width === null ? "" : `${width}px`;
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
    if (!section.mod) {
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
    const stories = section.mod?.SHEET.stories ?? [];
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
    heads(section);
    chrome.outline();
  }

  /** Loads a section's states file and mounts its stories. */
  function loadSection(section: Section): Promise<void> {
    section.loading ??= (async () => {
      try {
        section.mod = await options.load(section.file);
      } catch (error) {
        heard(error);
        failedSection(section, pageError(error, root, base));
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
    clearStandIns(section);
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
    said(section);
    quietly(
      columnsFor(section).then(() => {
        quietly(probeAll(section));
        quietly(playAll(section));
      })
    );
    later();
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
    if (!sweeping) {
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

  /** One story mounted in the rig, each of its interactions forced and released: the delta and the transitions each fires. */
  async function probe(
    section: Section,
    story: Story,
    reached: Interaction[]
  ): Promise<Probe> {
    const body = document.createElement("div");
    body.className = "cawco-frame-body";
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
        const before = snapshot(body);
        const t0 = document.timeline.currentTime as number;
        for (const state of FORCED[interaction]) {
          body.classList.add(allClass(state));
        }
        // biome-ignore lint/performance/noAwaitInLoops: each state read alone
        await frameTick();
        const fired = body.getAnimations({ subtree: true });
        const animations = fired.map((one) => readAnimation(one, t0));
        for (const one of fired) {
          settleRun(one);
        }
        const changed = deltaOf(before, snapshot(body), root);
        for (const state of FORCED[interaction]) {
          body.classList.remove(allClass(state));
        }
        await frameTick();
        for (const one of body.getAnimations({ subtree: true })) {
          settleRun(one);
        }
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
      if (!card) {
        await fetch(new URL("rendered", location.href), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(report),
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
    world.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})`;
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
    if (event.button !== 0 && event.button !== 1) {
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
  let held: { key: string; el: HTMLElement } | null = null;
  const holding = new ResizeObserver(() => {
    if (held?.el.isConnected) {
      show(held.key, held.el, false);
    }
  });
  const letGo = () => {
    held = null;
    holding.disconnect();
  };

  /** Places the world so frame `el` stands in the middle of the view, from its world box alone: the same at any moment for the same frame and view. */
  const show = (key: string, el: HTMLElement, animate: boolean) => {
    const from = world.style.transform;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const own = worldBox(el);
    if (chrome.phone()) {
      // One frame at a time, as wide as the screen lets it be, never past its own size.
      zoom.z = Math.max(
        ZOOM_MIN,
        Math.min(1, (width - 24) / Math.max(1, own.w))
      );
    }
    // On a phone the frame stands alone in its section: it is shown with its section's head, which names its sheet.
    const headEl = chrome.phone()
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
      world.animate(
        [{ transform: from }, { transform: world.style.transform }],
        {
          duration: chrome.duration("--dur-panel", 280),
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        }
      );
    }
    chrome.current(key);
    // On a phone the frame shown changed: its edges are drawn again, to frames now drawn only.
    drawEdges();
  };

  /** Brings a frame to the middle of the view, and holds it there until the person moves the view. */
  const go = (key: string) => {
    const el = world.querySelector<HTMLElement>(
      `[data-cawco-key="${CSS.escape(key)}"]`
    );
    if (!el) {
      return;
    }
    letGo();
    show(key, el, true);
    held = { key, el };
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
          `M${a.x} ${fromY}`,
          `H${x + turn}`,
          `Q${x} ${fromY} ${x} ${fromY + down * turn}`,
          `V${toY - down * turn}`,
          `Q${x} ${toY} ${x + turn} ${toY}`,
          `H${b.x}`,
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
  }).observe(world);

  const canvasState: CanvasState = {
    files,
    view,
    report: null,
    reports: 0,
    swept: false,
    go,
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
    standIn(section, plans[section.file]?.stories ?? []);
  }
  window.__cawcoCanvas = canvasState;
  if (card) {
    chrome.asCard();
  }
  zoom.x = WORLD_INSET.x;
  zoom.y = WORLD_INSET.y;
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
const BODY_RULE = /(^|,)\s*(body|html|:root)\s*(,|$)/;
const REDUCED_QUERY = /prefers-reduced-motion/;
