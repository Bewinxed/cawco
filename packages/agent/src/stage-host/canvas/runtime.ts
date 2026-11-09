/**
 * The component canvas page (component canvas §2–3): the page a stage serves
 * at `CANVAS_PATH`, in the project's own page and CSS. What every page of it
 * shares lives here: each states file's section and its module (loaded,
 * failed, loaded again as it is edited), the CSS rewritten so a forced
 * interaction and a frame's width reach the project's rules, the rig off
 * screen where each story's states are probed and its moves played, the
 * render report posted to the stage (the one source every tool answers
 * from) and the sheet told to the pane's inspector.
 *
 * What a page draws, the stage draws (stage.ts), every story as a
 * drawing: for a person's panel and the stage's own render (`by=panel`,
 * the default, and `by=stage`) the one live instance of the state the
 * panel keeps, the design graph's stage; for a decision page's Preview and
 * the panel map's live card (`by=embed`, `by=map`) each story it names, a
 * drawing in a column.
 *
 * The stage's entry module hands {@link boot} the framework's adapter
 * (`mountStory`, answering `unmount` and `update`) and how to load each
 * section; everything else is read from the page's URL: `file` per
 * section, `spec` (core `CanvasSpec`), and `scheme`, `width`, `motion`,
 * `fit` and `by`; and from the plan the stage writes into the page (core
 * `SectionPlan`): each section's name and its stories, so a section names
 * itself before its module loads.
 */

import { readWithin } from "@cawco/core/bounded";
import {
  type AnimationRead,
  awaySaid,
  CANVAS_PLAN_ID,
  type CanvasDial,
  type CanvasSpec,
  canvasSpecOf,
  FORMS,
  type FormName,
  type FramePictureRead,
  type FrameRender,
  type Interaction,
  type MoveRender,
  type PageError,
  type PageReport,
  type PageSection,
  type PostedReport,
  RENDER_STATE_PARAM,
  type Scheme,
  SECTION_MISSING,
  SECTION_WRITTEN,
  type SectionPlan,
  type SectionSheet,
  type SheetOnPage,
  type SheetRead,
  type StageErrorKind,
  type Story,
  type SweepAt,
  screenHeight,
  sectionName,
  sectionPlansOf,
  sweptFiles,
} from "@cawco/core/stage";
import {
  STAGE_COMPARE,
  STAGE_LET_GO,
  STAGE_PAUSE,
  STAGE_PLAY,
  STAGE_REACH,
  STAGE_RETIME,
  STAGE_REVEAL,
  STAGE_RING,
  STAGE_SEEK,
} from "@cawco/core/stage-graph";
import { queriesIn, userEventIn } from "@cawco/core/stage-play";
import { shellWords } from "@cawco/core/words/shell";
import { holdFocusInFrame } from "./held-focus";
import {
  deltaOf,
  firedBetween,
  fromRoot,
  type Motion,
  motionOf,
  namedOf,
  pageError,
  readAnimation,
  snapshot,
  valuesOf,
} from "./measure";
import { PageStyle } from "./page-style";
import {
  allClass,
  emptyReach,
  forceMotion,
  type PseudoState,
  type Rewrite,
  rewriteSheet,
} from "./pseudo";
import { onPageScheme, pageScheme } from "./scheme";
import { bootStage } from "./stage";
import {
  frameWidths,
  SCREEN_VH,
  SCREEN_VW,
  splitWidth,
  WIDTH_CONTAINER,
} from "./width";

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
  module: Record<string, unknown>;
  SHEET: SectionSheet;
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
export interface SectionFailure {
  error: PageError;
  frame: string | null;
  kind: StageErrorKind;
}

/** Each failure's line, the error formula's what happened and what it means: the stage's words stand under Show details. */
export const FAILED_LINE: Record<
  SectionFailure["kind"],
  (name: string) => string
> = {
  missing: (name) =>
    `${name}'s states file isn't there yet, so none of its stories are drawn.`,
  compile: (name) =>
    `${name} doesn't compile, so none of its stories are drawn.`,
  page: (name) => `${name} didn't load, so none of its stories are drawn.`,
};

/** The house's disclosure (dashboard RowFault) over `text`: Show details, its words saying what a press does. */
export function detailsOf(text: string): HTMLDetailsElement {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = shellWords.showDetails;
  details.addEventListener("toggle", () => {
    summary.textContent = details.open
      ? shellWords.hideDetails
      : shellWords.showDetails;
  });
  const words = document.createElement("pre");
  words.textContent = text;
  details.append(summary, words);
  return details;
}

/** How long a section's failed import waits for the stage's words. Our call: Vite sends them before it answers the request. */
const STAGE_SAYS_MS = 1000;

export interface BootOptions {
  adapter: Adapter;
  /** The house faces' `@font-face` rules (Figtree, JetBrains Mono), their files served beside the canvas. */
  faces: string;
  /** A section's module; `fresh`, past whatever the browser kept of an import of it that failed. */
  load: (file: string, fresh?: boolean) => Promise<SectionModule>;
  /**
   * The project's preview file (Storybook's `.storybook/preview.*`, host.ts
   * `previewFile`): its `decorators` wrap every story outside the meta's,
   * as the app's root wraps its whole tree, and its `parameters` stand
   * under each story's. None where the project has none.
   */
  preview: { decorators?: unknown; parameters?: unknown };
  /** The toolchain root, absolute: dev paths are made relative to it. */
  root: string;
  /** CawCo's tokens (DESIGN.md), `:root` scoped by the page's style to its own (page-style.ts). */
  tokens: string;
}

/** The pseudo-classes each forced interaction puts on a body. */
export const FORCED: Record<Exclude<Interaction, "rest">, PseudoState[]> = {
  hover: ["hover"],
  focus: ["focus", "focus-visible", "focus-within"],
  pressed: ["active", "hover"],
};
/** The pseudo-class whose rules decide whether an interaction is reached. */
const DECIDES: Record<Exclude<Interaction, "rest">, PseudoState[]> = {
  hover: ["hover"],
  focus: ["focus", "focus-visible", "focus-within"],
  pressed: ["active"],
};
/** The class a probe's body carries while its values are read: nothing in it moves (page-style.ts PAGE_CSS). */
export const HELD = "cawco-held";
const FOCUSABLE =
  'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';

/** How long a move may play before it is read as stuck. Ours. */
const PLAY_LIMIT_MS = 6000;
/** How long a move's animations are waited on after its play ends. Ours. */
const SETTLE_LIMIT_MS = 3000;
/** The quiet after the last change before a report is posted. Ours. */
const REPORT_QUIET_MS = 200;

export type WidthSlot = number | "own";

export interface View {
  /** The stage: a width picked wider than the page's room is scaled to fit it; off, it is drawn 1:1 and the page scrolls across it. */
  fit: boolean;
  motion: "on" | "reduce";
  /** `page`: drawn in the page's own scheme. */
  scheme: Scheme | "both" | "page";
  /** Null: each story at its own form (or its content's width). */
  widths: number[] | null;
}

/** Where a story is drawn: its forced interaction, its scheme and its width. */
export interface Column {
  interaction: Interaction;
  scheme: Scheme | "page";
  width: WidthSlot;
}

/** A story's interaction reading, from its off-screen probe. */
export interface Probe {
  delta: Map<
    Interaction,
    { animations: AnimationRead[]; changed: ReturnType<typeof deltaOf> }
  >;
}

/** One states file's section of the page, whatever the page draws of it. */
export interface Section {
  /** Why its module didn't load; null while it hasn't failed. */
  failure: SectionFailure | null;
  file: string;
  /** The interactions each story reaches, by story. */
  interactions: Map<string, Interaction[]>;
  loaded: boolean;
  loading?: Promise<void>;
  mod?: SectionModule;
  moves: MoveRender[];
  /** Its name in plain words: its states file's title, else its component's, else its file's. */
  name: string;
  probes: Map<string, Probe>;
  /** Its interactions, probes and moves read since it was last shown: one pass at a time in the rig. */
  settling?: Promise<void>;
}

/** Which page this is: a person's panel or the stage's render (the stage's one drawing), a decision page's Preview or the map's live card (its column of drawings). */
export type PageBy = "panel" | "stage" | "embed" | "map";

/** A section module's address as an HMR update names it: `/@id/__x00__cawco:sheet/<the states file, encoded>.js`. */
const SECTION_PATH = /cawco:sheet\/([^?]+)\.js(?:\?|$)/u;

/** The states file (from the toolchain root) an update's module path is the section of; null for any other module. */
const sectionOfPath = (path: string): string | null => {
  const encoded = path.match(SECTION_PATH)?.[1];
  return encoded ? decodeURIComponent(encoded) : null;
};

/** The callbacks waiting for {@link nextTask}'s message, in order. */
const tasksDue: (() => void)[] = [];
const tasks = new MessageChannel();
tasks.port1.onmessage = () => tasksDue.shift()?.();
/**
 * The next task: the page draws and answers between two. A message's task,
 * never a timer's: a hidden tab wakes its timers once a second (Chromium's
 * background throttling), a chain of them once a minute after five
 * (intensive throttling), and a read takes several tasks for each story,
 * so a canvas in a tab out of sight read its sheet for minutes, or never.
 */
const nextTask = () =>
  new Promise<void>((done) => {
    tasksDue.push(done);
    tasks.port2.postMessage(null);
  });

/**
 * How long the rig's work stands aside after the person acts on the page
 * (a reach, a reveal, Compare, the move's play or scrub, a dial, the
 * view): his act is answered and its scroll or motion runs before the
 * report's next step takes the main thread. Ours: a second, past a smooth
 * scroll's run.
 */
const PERSON_QUIET_MS = 1000;
/**
 * The words the panel sends for the person's acts (core stage-graph.ts, the
 * inspector's). The view and the dials are acts only where they change
 * what the page draws ({@link boot}'s `setView`, `applyDials`): the design
 * graph says both again to every page it loads, and each held the first
 * read a second after the load.
 */
const PERSON_ACTS = [
  STAGE_REACH,
  STAGE_REVEAL,
  STAGE_COMPARE,
  STAGE_PLAY,
  STAGE_PAUSE,
  STAGE_SEEK,
  STAGE_LET_GO,
  STAGE_RETIME,
  STAGE_RING,
  "cawco:story-args",
];

/**
 * The pane says it is away (core `CANVAS_AWAY`): its frames are held
 * ({@link holdWhileAway}).
 */
let paneAway = false;
/** Whether no frame comes now: the tab is out of sight (the browser draws none), or the pane is away (its frames held). */
const frameless = () => document.visibilityState === "hidden" || paneAway;
/** Each {@link frameTick} waiting on a frame, ended once frames stop coming. */
const framesAwaited = new Set<() => void>();
/** Frames stopped coming: whoever waits on one goes on without it. */
const framesStopped = () => {
  if (frameless()) {
    for (const go of framesAwaited) {
      go();
    }
  }
};
addEventListener("visibilitychange", framesStopped);

/**
 * Two frames on: what was mounted has drawn and its first frames' work is
 * done. Where no frame comes (a tab out of sight, a pane away) nothing is
 * drawn to wait for, so it is the next task: a read waiting on a frame
 * there never ended, and the report a session reads waited with it.
 */
export const frameTick = () =>
  new Promise<void>((done) => {
    let ended = false;
    const go = () => {
      if (!ended) {
        ended = true;
        framesAwaited.delete(go);
        done();
      }
    };
    if (frameless()) {
      nextTask().then(go);
      return;
    }
    framesAwaited.add(go);
    requestAnimationFrame(() => requestAnimationFrame(go));
  });

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
    fit: params.get("fit") !== "0",
  };
}

/** Each states file's plan as the stage wrote it into the page; none when the page has no plan. */
const planOfPage = (): Record<string, SectionPlan> => {
  try {
    return sectionPlansOf(
      JSON.parse(document.getElementById(CANVAS_PLAN_ID)?.textContent ?? "{}")
    );
  } catch {
    return {};
  }
};

const specOf = (params: URLSearchParams): CanvasSpec => {
  try {
    return canvasSpecOf(JSON.parse(params.get("spec") ?? "{}"));
  } catch {
    return {};
  }
};

const byOf = (params: URLSearchParams): PageBy => {
  const by = params.get("by");
  return by === "stage" || by === "embed" || by === "map" ? by : "panel";
};

/** The canvas's state, for the stage's daemon render and the probe kit. */
export interface CanvasState {
  /** The sections the stage's sweep has read and posted, in order (a render answers the others as undrawn). */
  drawn: string[];
  files: string[];
  /**
   * The stage's room the window lacks to hold state `key`'s drawing whole
   * at 1:1, {0, 0} when it does; null when the stage doesn't stand at it.
   * None on a column's page.
   */
  lacks?: (key: string) => { h: number; w: number } | null;
  loaded: () => string[];
  /** State `key`'s drawing as it stands, for its picture; null when the stage doesn't stand at it. None on a column's page. */
  picture?: (key: string) => FramePictureRead | null;
  /**
   * The stage brought to state `key` for its picture: mounted afresh at
   * rest, its interaction forced on the drawing; answers the room the
   * window still lacks for it (`lacks`). None on a column's page.
   */
  pose?: (key: string) => Promise<{ h: number; w: number } | null>;
  report: PageReport | null;
  reports: number;
  /** Whether state `key`'s drawing is settled: fonts loaded, no finite animation running in it. None on a column's page. */
  settled?: (key: string) => boolean;
  setView: (next: Partial<View>) => void;
  /**
   * The state of story `name` (`Story`, or `file:Story` where two states
   * files name one story alike) in interaction `interaction`, for its
   * picture: its key once its section has drawn; or why there is none, in
   * words. None on a column's page.
   */
  stateNamed?: (
    name: string,
    interaction?: Interaction
  ) => Promise<{ key: string } | { refused: string }>;
  /** The section the stage's sweep is on, and its step; null before it starts and once it has swept. */
  sweepAt: SweepAt | null;
  /** The sections the sweep takes, in order: a stage's render asked for one state, that state's alone (core `sweptFiles`); else every one. */
  sweeps: string[];
  /** Every section the sweep takes drawn once: a stage's render reads the stage's report then. */
  swept: boolean;
  view: View;
}

declare global {
  interface Window {
    __cawcoCanvas?: CanvasState;
    __cawcoErrors?: { at: number; error: unknown }[];
    __cawcoSheetChosen?: string | null;
    /** Each section's sheet as last told the pane, by its file: the overlay tells a pane that says hello late every one. */
    __cawcoSheetsOnPage?: Record<string, SheetOnPage>;
  }
}

/** The overlay's bridge into the artifact's doc (preview overlay/page.ts `cawco`), when a panel shows the page. */
export interface Bridge {
  on: (
    event: "picks",
    listener: (picks: Record<string, { value?: unknown }>) => void
  ) => () => void;
  set: (key: string, value: unknown) => Promise<void>;
}
export const bridge = (): Bridge | undefined =>
  (window as unknown as { cawco?: Bridge }).cawco;

/**
 * Every animation-frame callback the page asks for (the canvas's own and
 * each story's) held while the page holding it says its pane is away (core
 * `CANVAS_AWAY`), and asked for once it is back: WebKit runs a frame's rAF
 * at full rate under a pane `content-visibility: hidden` puts away, and
 * nothing in the frame can tell it is skipped. A held callback is the one
 * the page asked for, run on the next frame it is seen: what a person sees
 * is the same.
 *
 * And the canvas at rest while nobody can see it: its root marked
 * `data-offscreen` while its pane is away or none of its frame stands in
 * the top page's view (the implicit root of an observer in a frame), which
 * holds a dashboard canvas's loops as the dashboard holds its own scrolled
 * out of view (its design.css: `:where([data-offscreen]) .loops` paused;
 * motion/rest.ts). WebKit renders every frame of the page it shares a
 * process with, whatever stands in view: a decision page of 33 Previews,
 * untouched, held its web process at 23% of a core, its frames' loops (9
 * spinners and skeleton pulses, all in frames scrolled away) the only
 * thing running (canvas-cost `page`, its census), and at 2% held here
 * (56,310 ms of CPU over 240 s, then 5,130); Chromium draws no
 * cross-origin frame out of view.
 */
function holdWhileAway(): void {
  const ask = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  let unseen = false;
  const rest = () =>
    document.documentElement.toggleAttribute(
      "data-offscreen",
      paneAway || unseen
    );
  new IntersectionObserver(([entry]) => {
    unseen = !entry?.isIntersecting;
    rest();
  }).observe(document.documentElement);
  /** Callbacks asked for while away, by the id the page was given (negative: none the browser gives). */
  const held = new Map<number, FrameRequestCallback>();
  /** A held callback asked for once back: the browser's id for it, by the page's. */
  const asked = new Map<number, number>();
  let last = 0;
  window.requestAnimationFrame = (callback) => {
    if (!paneAway) {
      return ask(callback);
    }
    last -= 1;
    held.set(last, callback);
    return last;
  };
  window.cancelAnimationFrame = (id) => {
    if (held.delete(id)) {
      return;
    }
    const real = asked.get(id);
    asked.delete(id);
    cancel(real ?? id);
  };
  addEventListener("message", (event) => {
    const said =
      event.source === window.parent ? awaySaid(event.data) : undefined;
    if (said === undefined) {
      return;
    }
    paneAway = said;
    rest();
    if (paneAway) {
      framesStopped();
      return;
    }
    for (const [id, callback] of held) {
      asked.set(
        id,
        ask((time) => {
          asked.delete(id);
          callback(time);
        })
      );
    }
    held.clear();
  });
}

/**
 * What a mode (the stage's one drawing, or its column of drawings)
 * answers the page's shared work with: the frames its report says, what it
 * does as a section is shown, fails, is restyled or overridden, and what it
 * holds mounted.
 */
export interface Mode {
  /** The bodies mounted where the person sees them, each with its story: the dials reach every one. */
  bodies: () => Iterable<{
    body: HTMLElement;
    mounted: Mounted | undefined;
    /** The args its story is written with, no dial's in them: what an `arg` dial goes back to. */
    written?: Record<string, unknown>;
  }>;
  /** The states files this page is still drawing for its report: a report says them, never their half-read frames. */
  drawing: () => string[];
  /** A section's module didn't load: it says why in its own place. */
  failed: (section: Section, failure: SectionFailure) => void;
  /** A section's frames as its report says them; null while it has not been read: a report leaves it out, so the stage keeps what an earlier draw saw of it. */
  framesOf: (section: Section) => FrameRender[] | null;
  /** The width script asking `matchMedia` between mounts is answered at; null for the page's own. */
  mediaWidth: () => number | null;
  /** The inspector set or let go story `story`'s args in `section`. */
  overridden: (section: Section, story: string) => void;
  /** The page's scheme turned, or the view did: what draws in it is dressed again. */
  redressed: () => void;
  /** A report was read: what the mode draws from it. */
  reported: (report: PageReport) => void;
  /** The project's sheets changed: what reads them reads again. */
  restyled: () => void;
  /** The inspector's story, or none. */
  selected: (story: string | null) => void;
  /** A section's module loaded (or loaded again as it was edited): its stories are to be drawn. */
  shown: (section: Section) => void;
  /** Vite sent an update (any page's, this page's or not): what the mode lays out is laid out again. A section an edit reaches is read again as it is shown. */
  updated: () => void;
}

/** What the page shares with its mode: its sections, its rig, mounting, probing, playing, reporting. */
export interface Page {
  /** The agent's dials as the panel set them, by name (core `StageDials`): each on every body. */
  applyDials: (values: Record<string, unknown>) => void;
  /** The args a story mounts with: the meta's, its own, the pane's live ones, then the dials'. */
  argsOf: (section: Section, name: string) => Record<string, unknown>;
  /** A frame of no width of its own that drew at its body's floor: its failure, in words. */
  atFloor: (
    story: Story,
    slot: WidthSlot,
    body: HTMLElement
  ) => PageError | null;
  readonly base: string;
  readonly by: PageBy;
  /** A story's CSF object (a function story is its `render`). */
  csfOf: (
    mod: Record<string, unknown>,
    name: string
  ) => Record<string, unknown> | null;
  /** A body dressed as a story drawn in `column` is: its scheme, width, forced state and the dials' variables. */
  dressBody: (
    body: HTMLElement,
    column: Column,
    story: Story,
    fills: boolean
  ) => void;
  /** The card a section whose module didn't load says it in. */
  failedCard: (section: Section, failure: SectionFailure) => HTMLElement;
  readonly files: string[];
  /** Whether story `story` of `section` is drawn as tall as its screen. */
  fills: (section: Section, story: string) => boolean;
  /** Story `rest` drawn in `body` has a width and no height of its own: from now on it is drawn as tall as its screen. */
  fillsScreen: (section: Section, story: Story, body: HTMLElement) => boolean;
  /** A story's own width in a column: its form's, or the column's. */
  formWords: (story: Story, slot: WidthSlot) => string;
  heard: (error: unknown) => void;
  /** A report soon, once the page has been quiet a moment. */
  later: () => void;
  loadSection: (section: Section) => Promise<void>;
  mountInto: (
    body: HTMLElement,
    section: Section,
    name: string,
    args: Record<string, unknown>,
    into: { error?: PageError }
  ) => Mounted | undefined;
  readonly options: BootOptions;
  /** The args a story is written with: as `argsOf`, no dial's in them. */
  ownArgsOf: (section: Section, name: string) => Record<string, unknown>;
  readonly plans: Record<string, SectionPlan>;
  /** Every move of a section played in the rig: what each fires, for the report. */
  playAll: (section: Section, sweep?: (to: string) => void) => Promise<void>;
  post: () => Promise<void>;
  /** A story mounted in the rig probed in each interaction it reaches (`atState`: the body read in each state, held), its reading. */
  probe: (
    body: HTMLElement,
    reached: Exclude<Interaction, "rest">[],
    atState: (interaction: Exclude<Interaction, "rest">) => void
  ) => Promise<Probe>;
  quietly: (promise: Promise<unknown>) => void;
  /** The interactions a story drawn in `body` reaches: each whose CSS rules match an element in it. */
  reachedIn: (body: HTMLElement) => Interaction[];
  readonly rewrite: Rewrite;
  rewriteAll: () => void;
  /** Off screen: where a story's states are probed and its moves played, never seen. */
  readonly rig: HTMLElement;
  readonly root: string;
  /** The section's sheet told to the pane's inspector. */
  said: (section: Section) => Promise<void>;
  schemeOf: (column: Column) => Scheme;
  sectionOf: (file: string) => Section | undefined;
  readonly sections: Section[];
  sizeBody: (body: HTMLElement, width: number | null, fills?: boolean) => void;
  readonly spec: CanvasSpec;
  readonly state: CanvasState;
  /** The page's own sheet: a mode's rules, its duration tokens. */
  readonly style: PageStyle;
  /**
   * The rig's next step's turn (the report's sweep): a task of its own,
   * and none while the person acted in the last {@link PERSON_QUIET_MS}, so
   * a reveal heard is scrolled before the sweep takes the main thread again:
   * a probe pass of a sheet's thirty forms held a reveal behind it for half
   * a second on a loaded host, and its scroll for 700 ms more.
   */
  turn: () => Promise<void>;
  readonly view: View;
  widthOf: (story: Story, slot: WidthSlot) => number | null;
}

/** The dials' values as they set the page: each `cssVar` dial's variable with its unit, each `arg` dial's arg; a dial with no value sets nothing. */
function dialSetOf(
  dials: readonly CanvasDial[],
  values: Record<string, unknown>
): { args: Record<string, unknown>; vars: Map<string, string> } {
  const vars = new Map<string, string>();
  const args: Record<string, unknown> = {};
  for (const dial of dials) {
    const value = values[dial.name];
    if (value === undefined) {
      continue;
    }
    if ("cssVar" in dial.target) {
      vars.set(
        dial.target.cssVar,
        typeof value === "number" ? `${value}${dial.unit ?? ""}` : String(value)
      );
    } else {
      args[dial.target.arg] = value;
    }
  }
  return { vars, args };
}

export function boot(options: BootOptions): void {
  holdFocusInFrame();
  holdWhileAway();
  const { adapter, root } = options;
  const params = new URLSearchParams(location.search);
  const files = params.getAll("file");
  const spec = specOf(params);
  const by = byOf(params);
  const view = viewOf(params);
  const base = location.pathname.slice(
    0,
    Math.max(0, location.pathname.lastIndexOf("/@cawco/"))
  );
  const rewrite: Rewrite = { reach: emptyReach(), refused: new Set() };
  const pageErrors: PageError[] = [];
  const sections: Section[] = [];
  const overrides = new Map<string, Record<string, unknown>>();
  let reportTimer: ReturnType<typeof setTimeout> | undefined;
  /** Each section's newest ask of its whole sheet, by its file (`said`). */
  const sheetAsks = new Map<string, number>();
  let reports = 0;
  /** The mode, made once what it is handed stands. */
  let mode: Mode | null = null;
  const embed = by === "embed";

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
  /** A sheet the canvas writes for itself (its page style, the width probe): it answers the window. */
  const canvasOwned = (sheet: CSSStyleSheet) => {
    const node = sheet.ownerNode;
    return (
      node instanceof HTMLElement &&
      ["cawcoCanvas", "cawcoProbe"].some((key) => key in node.dataset)
    );
  };
  const rewriteAll = () => {
    for (const sheet of sheetsNow()) {
      // Width first: the state rewrite then reaches the rules inside the containers it makes.
      if (!canvasOwned(sheet)) {
        frameWidths(sheet, rewrite.refused);
      }
      // An embed draws each story at rest only: no state is forced in it,
      // so its sheets' state rules stay as written.
      if (!embed) {
        rewriteSheet(sheet, rewrite);
      }
      // A sheet comes as the browser answers motion: only with motion reduced has it a condition to rewrite (setView rewrites and puts back every sheet's as the motion turns).
      if (view.motion === "reduce") {
        forceMotion(sheet, view.motion);
      }
    }
  };
  /** The project's page background and ink, as its body's rules write them: each body draws on them under its own scheme. */
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
  /** A change that only adds an embed's module preloads on its turn (host.ts `graphPreloads`): it brings no sheet, so nothing is rewritten. */
  const preloadsOnly = (changes: MutationRecord[]) =>
    changes.every(
      (change) =>
        change.type === "childList" &&
        change.removedNodes.length === 0 &&
        [...change.addedNodes].every(
          (node) =>
            node instanceof HTMLLinkElement && node.rel === "modulepreload"
        )
    );
  new MutationObserver((changes) => {
    if (rewriting || preloadsOnly(changes)) {
      return;
    }
    rewriting = true;
    queueMicrotask(() => {
      rewriting = false;
      rewriteAll();
      pageGround = null;
      mode?.restyled();
    });
  }).observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  // A stylesheet's link loaded: its rules are rewritten. A module's
  // preload (host.ts `graphPreloads`, one a module of the canvas's graph)
  // loads no sheet, and each of a 665-module graph's would walk every rule
  // of every sheet again.
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLLinkElement && event.target.sheet) {
        rewriteAll();
      }
    },
    true
  );
  rewriteAll();

  /* --- Script that asks matchMedia: reduced motion, and the drawing's width */

  const media = window.matchMedia.bind(window);
  /** The width of the body whose story mounts now: undefined between mounts, null for a body without one. */
  let mounting: number | null | undefined;
  /**
   * Where the engine answers a width condition at a given width: a hidden
   * container (`cawco-probe`) set to that width, a rule per condition
   * marking its child, so every syntax a container query takes (ranges,
   * `and`, `or`) answers as the project's CSS does.
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
  /**
   * Each condition's answer at a width, by `<its rule>@<width>`: a width
   * condition answers alike at one width every time, and each answer read
   * restyled and laid out the page (a component's `MediaQuery` asks at
   * every mount: 88 ms of a 14-story sheet's read).
   */
  const answers = new Map<string, boolean>();
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
    const key = `${at}@${width}`;
    const known = answers.get(key);
    if (known !== undefined) {
      return known;
    }
    probeBox.style.inlineSize = `${width}px`;
    probeMark.dataset.q = String(at);
    const holds =
      getComputedStyle(probeMark).getPropertyValue("--cawco-q").trim() === "1";
    answers.set(key, holds);
    return holds;
  };

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
    // A body's story asks at its body's width while it mounts; between mounts, at the width the mode says; else the window's, as a body without one answers its CSS.
    const asked = mounting;
    const widthNow = () =>
      (asked === undefined ? (mode?.mediaWidth() ?? null) : asked) ??
      document.documentElement.getBoundingClientRect().width;
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
    sections.push({
      file,
      name: plans[file]?.name ?? sectionName(null, null, file),
      failure: null,
      interactions: new Map(),
      loaded: false,
      moves: [],
      probes: new Map(),
    });
  }
  const sectionOf = (file: string) => sections.find((one) => one.file === file);

  /** The card a section whose module didn't load says so in: the error formula's line, then its error and where it threw under Show details. */
  function failedCard(section: Section, failure: SectionFailure): HTMLElement {
    const { error, frame, kind } = failure;
    const failed = document.createElement("div");
    failed.className = "cawco-section-failed cawco-ui";
    failed.dataset.cawcoFile = section.file;
    failed.setAttribute("role", "alert");
    const line = document.createElement("p");
    line.className = "cawco-section-failed-line";
    line.textContent = FAILED_LINE[kind](section.name);
    const details = detailsOf(error.message);
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
    return failed;
  }

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

  /** A column's scheme: its own, or the page's (scheme.ts: the host's theme, else the system's). */
  const schemeOf = (column: Column): Scheme =>
    column.scheme === "page" ? pageScheme() : column.scheme;

  /** The args a story mounts with: the meta's, its own, the pane's live ones, then the dials'. */
  const ownArgsOf = (
    section: Section,
    name: string
  ): Record<string, unknown> => {
    const mod = section.mod?.module ?? {};
    const meta = (mod.default ?? {}) as Record<string, unknown>;
    const csf = csfOf(mod, name);
    return {
      ...((meta.args ?? {}) as object),
      ...((csf?.args ?? {}) as object),
      ...(overrides.get(`${section.file}|${name}`) ?? {}),
    };
  };
  const argsOf = (section: Section, name: string): Record<string, unknown> => ({
    ...ownArgsOf(section, name),
    ...dialArgs,
  });

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
          ...((options.preview.parameters ?? {}) as object),
          ...((meta.parameters ?? {}) as object),
          ...((csf.parameters ?? {}) as object),
        },
        argTypes: {},
        globals: {},
        viewMode: "story",
      },
      component: csf.component ?? meta.component,
      render: csf.render ?? meta.render,
      // The story's innermost, then the meta's, then the preview file's, as Storybook nests them.
      decorators: [
        ...((csf.decorators ?? []) as unknown[]),
        ...((meta.decorators ?? []) as unknown[]),
        ...(Array.isArray(options.preview.decorators)
          ? options.preview.decorators
          : []),
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
    // What the story's script asks of matchMedia while it mounts, its body answers.
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
   * A body at `width`: that width, the container its width rules answer,
   * and its screen (width.ts `SCREEN_VW`, `SCREEN_VH`: the device's at that
   * width, core `screenHeight`), which its viewport lengths answer; `fills`:
   * as tall as that screen, for a story with no height of its own
   * ({@link fillsScreen}). None of them with no width: the page's.
   */
  function sizeBody(
    body: HTMLElement,
    width: number | null,
    fills = false
  ): void {
    body.style.width = width === null ? "" : `${width}px`;
    body.style.container =
      width === null ? "" : `${WIDTH_CONTAINER} / inline-size`;
    const screen = width === null ? null : { w: width, h: screenHeight(width) };
    body.style.setProperty(SCREEN_VW, screen ? `${screen.w / 100}px` : "");
    body.style.setProperty(SCREEN_VH, screen ? `${screen.h / 100}px` : "");
    body.style.blockSize = screen && fills ? `${screen.h}px` : "";
  }

  /**
   * The stories, by `file|story`, drawn as tall as their screen: each has a
   * width and no height of its own. An app laid out to fill its window
   * (`height: 100%` down from its root, its parts placed absolutely or
   * fixed) stands 0 tall in a body whose height is its content's, so it
   * drew at the body's floor, and no picture of it could be taken. It
   * fills the screen its width names instead, as it fills a window.
   */
  const screenFilled = new Set<string>();
  const fillKey = (file: string, story: string) => `${file}|${story}`;
  /** Whether a body holds nothing with a height: its content measured with the body's floor let go. */
  const heightless = (body: HTMLElement): boolean => {
    const { blockSize, minBlockSize } = body.style;
    body.style.blockSize = "";
    body.style.minBlockSize = "0px";
    const height = body.offsetHeight;
    body.style.blockSize = blockSize;
    body.style.minBlockSize = minBlockSize;
    return height === 0;
  };
  /** Story `story` drawn as tall as its screen from now on when, drawn in `body`, it has a width and no height of its own; whether it now is. */
  const fillsScreen = (
    section: Section,
    story: Story,
    body: HTMLElement
  ): boolean => {
    const key = fillKey(section.file, story.name);
    const width = Number.parseFloat(body.style.width);
    if (screenFilled.has(key) || !Number.isFinite(width) || !heightless(body)) {
      return false;
    }
    screenFilled.add(key);
    return true;
  };

  /** A body dressed as a story drawn in `column` is: its scheme, width, forced state and the dials' variables. */
  function dressBody(
    body: HTMLElement,
    column: Column,
    story: Story,
    fills: boolean
  ): void {
    const scheme = schemeOf(column);
    const ground = groundOf();
    body.style.colorScheme = scheme;
    body.dataset.theme = scheme;
    body.classList.toggle("dark", scheme === "dark");
    body.style.backgroundColor = ground.background;
    body.style.color = ground.color;
    sizeBody(body, widthOf(story, column.width), fills);
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
    for (const value of dialVars) {
      body.style.setProperty(value[0], value[1]);
    }
  }

  /** The interactions a story drawn in `body` reaches: each whose CSS rules match an element in it. */
  function reachedIn(body: HTMLElement): Interaction[] {
    const found: Interaction[] = ["rest"];
    for (const interaction of ["hover", "focus", "pressed"] as const) {
      const hit = DECIDES[interaction].some((pseudo) =>
        [...rewrite.reach[pseudo]].some((selector) => {
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
              (pseudo === "focus-within" && el.querySelector(FOCUSABLE))
          );
        })
      );
      if (hit) {
        found.push(interaction);
      }
    }
    return found;
  }

  /**
   * A body that drew at its floor (its `min-inline-size`) with no width of
   * its own: the story gave it none, and its content measures nothing (a
   * size container), so it shrank to the floor and reads as a sliver. Said
   * as its failure, in words; no width is put in its place. Null when it
   * stands at a width of its own or past the floor.
   */
  function atFloor(
    story: Story,
    slot: WidthSlot,
    body: HTMLElement
  ): PageError | null {
    if (widthOf(story, slot) !== null) {
      return null;
    }
    const width = body.offsetWidth;
    const floor = Number.parseFloat(getComputedStyle(body).minInlineSize) || 0;
    return floor > 0 && width <= floor + 0.5
      ? {
          message: `drawn ${Math.round(width)}px wide: the story has no width of its own; give it a viewport or a width`,
          file: null,
          line: null,
          column: null,
        }
      : null;
  }

  /** Loads a section's states file; the mode draws its stories. */
  function loadSection(section: Section): Promise<void> {
    section.loading ??= (async () => {
      const since = performance.now();
      try {
        section.mod = await options.load(section.file, !!section.failure);
      } catch (error) {
        heard(error);
        section.failure = await loadFailure(error, since);
        mode?.failed(section, section.failure);
        later();
        section.loading = undefined;
        return;
      }
      show(section);
    })();
    return section.loading;
  }

  /** A section's module, loaded: what every mode reads of it, then the mode's drawing. */
  function show(section: Section): void {
    const mod = section.mod as SectionModule;
    // Its stories measured afresh as they mount (`fillsScreen`): an edit may have given one a height of its own.
    for (const story of mod.SHEET.stories) {
      screenFilled.delete(fillKey(section.file, story.name));
    }
    section.loaded = true;
    section.failure = null;
    section.name = sectionName(
      mod.SHEET.meta.title,
      section.name,
      section.file
    );
    for (const story of mod.SHEET.stories) {
      if (!section.interactions.has(story.name)) {
        section.interactions.set(story.name, ["rest"]);
      }
    }
    mode?.shown(section);
    quietly(said(section));
    later();
  }

  /* --- Probes: each story's states read off screen ----------------------- */

  /** The person's last act on the page (performance.now()). */
  let actedAt = Number.NEGATIVE_INFINITY;
  /** The person acted on the page now: the rig's next step stands aside ({@link turn}). */
  const acted = () => {
    actedAt = performance.now();
  };
  for (const type of PERSON_ACTS) {
    addEventListener(type, acted);
  }
  async function turn(): Promise<void> {
    await nextTask();
    for (
      let left = PERSON_QUIET_MS - (performance.now() - actedAt);
      left > 0;
      left = PERSON_QUIET_MS - (performance.now() - actedAt)
    ) {
      await new Promise<void>((done) => setTimeout(done, left));
    }
  }

  /** A probe step run as one task, named for the page's timeline (`cawco probe`, its interaction and phase in its detail). */
  function probePhase<T>(
    interaction: Interaction,
    phase: string,
    run: () => T
  ): T {
    const start = performance.now();
    try {
      return run();
    } finally {
      performance.measure("cawco probe", {
        start,
        end: performance.now(),
        detail: { interaction, phase },
      });
    }
  }

  /** `interaction` forced on `body`, or let go. */
  const forced = (
    body: HTMLElement,
    interaction: Exclude<Interaction, "rest">,
    on: boolean
  ) => {
    for (const state of FORCED[interaction]) {
      body.classList.toggle(allClass(state), on);
    }
  };

  /**
   * A story mounted in `body`, standing at rest, probed in each interaction
   * it reaches, read from computed style alone (measure.ts `motionOf`,
   * `firedBetween`): the delta each state makes, and the transitions and
   * keyframes it fires. `atState` reads the body in each state as the
   * state's values are read, its frame for the report. The engine's
   * animation list is never asked: Chromium's `getAnimations` costs as
   * many animations as the page holds, whatever it is asked on (a body,
   * one element or the document took 1,038 ms each with 10,000 looping
   * elsewhere on the page, 9 ms with 1,000), and a person's panel of the
   * pairing canvas held 10,869, the heavy probe canvas 32,400. So a probe
   * costs its own story's elements, whatever the page around it holds.
   *
   * Each style the body takes costs a restyle of every element in it,
   * through the project's whole sheet (the dashboard's 5,455 rules: 6 ms
   * for a 151-element body), so each is taken once and read whole, a task
   * of its own: at rest, the keyframes it names; each state forced, the
   * motion it declares (the hold let go only within the task, so what it
   * would run never starts); then held still (`cawco-held`, PAGE_CSS: no
   * keyframes, no transitions, so each read is the base style, never a
   * frame of a loop or a transition on its way), its values at rest, then
   * each state's values and frame. Of the values, a transition's
   * properties are read only where it runs (a duration past 0): every
   * element declares `all 0s`, and reading all it names read every
   * watched property twice more on every element.
   */
  async function probe(
    body: HTMLElement,
    reached: Exclude<Interaction, "rest">[],
    atState: (interaction: Exclude<Interaction, "rest">) => void
  ): Promise<Probe> {
    const read: Probe = { delta: new Map() };
    if (reached.length === 0) {
      return read;
    }
    const named = probePhase("rest", "motion at rest", () => namedOf(body));
    body.classList.add(HELD);
    try {
      const motions = new Map<Interaction, Motion>();
      for (const interaction of reached) {
        await turn();
        motions.set(
          interaction,
          probePhase(interaction, "motion forced", () => {
            body.classList.remove(HELD);
            forced(body, interaction, true);
            const motion = motionOf(body);
            forced(body, interaction, false);
            body.classList.add(HELD);
            return motion;
          })
        );
      }
      await turn();
      const before = probePhase("rest", "values at rest", () => ({
        watched: snapshot(body),
        moved: valuesOf(...motions.values()),
      }));
      for (const interaction of reached) {
        await turn();
        probePhase(interaction, "values forced", () => {
          const motion = motions.get(interaction) as Motion;
          forced(body, interaction, true);
          try {
            read.delta.set(interaction, {
              animations: firedBetween(
                named,
                motion,
                before.moved,
                valuesOf(motion)
              ),
              changed: deltaOf(before.watched, snapshot(body), root),
            });
            atState(interaction);
          } finally {
            forced(body, interaction, false);
          }
        });
      }
    } finally {
      body.classList.remove(HELD);
    }
    return read;
  }

  /* --- Moves: `from` + `play` ------------------------------------------ */

  /** Stories of a section that declare a flow move: `from` and a `play`. */
  const movesOf = (section: Section): { from: string; to: string }[] =>
    (section.mod?.SHEET.stories ?? [])
      .filter((one) => one.play && one.from)
      .map((one) => ({ from: one.from as string, to: one.name }));

  /** Plays move `to` (from its `from`) in `body`: mounted from the start story's args, then its `play`; every animation it fired, read as it started. */
  async function playIn(
    section: Section,
    to: string,
    body: HTMLElement
  ): Promise<{ mounted: Mounted | undefined; move: MoveRender }> {
    const mod = section.mod?.module ?? {};
    const csf = csfOf(mod, to) ?? {};
    const from = String(
      csf.from ??
        section.mod?.SHEET.stories.find((one) => one.name === to)?.from ??
        ""
    );
    const move: MoveRender = { from, to, animations: [] };
    if (!(from && typeof csf.play === "function")) {
      move.error = {
        message: `${to} has no from and play to move by.`,
        file: null,
        line: null,
        column: null,
      };
      return { mounted: undefined, move };
    }
    const into: { error?: PageError } = {};
    const args = argsOf(section, from);
    const mounted = mountInto(body, section, from, args, into);
    await frameTick();
    const seen = new Set<Animation>();
    const reads: AnimationRead[] = [];
    const t0 = document.timeline.currentTime as number;
    let watching = true;
    /** Every animation running in the body that was not seen yet, read as it started. */
    const look = () => {
      for (const one of body.getAnimations({ subtree: true })) {
        if (!seen.has(one)) {
          seen.add(one);
          reads.push(readAnimation(one, t0));
        }
      }
    };
    const watch = () => {
      look();
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
      // The motion it started, played out (or the wait's end): each run's
      // end awaited, never a frame polled, so a page no frame comes to (a
      // tab out of sight, where the timeline stands still) waits once to
      // the end and does not spin; a run one of them starts as it ends is
      // seen on the frame after.
      look();
      const end = performance.now() + SETTLE_LIMIT_MS;
      for (
        let running = [...seen].filter((one) => one.playState === "running");
        running.length > 0 && performance.now() < end;
        running = [...seen].filter((one) => one.playState === "running")
      ) {
        await readWithin(Math.max(0, end - performance.now()), () =>
          Promise.all(running.map((one) => one.finished.catch(() => null)))
        );
        await frameTick();
        look();
      }
    } catch (error) {
      move.error = pageError(error, root, base);
    } finally {
      watching = false;
    }
    if (into.error && !move.error) {
      move.error = into.error;
    }
    move.animations = reads;
    return { mounted, move };
  }

  /** Every move of a section played off screen: what each fires, for the report. `sweep` hears each as it starts. */
  async function playAll(
    section: Section,
    sweep?: (to: string) => void
  ): Promise<void> {
    const moves: MoveRender[] = [];
    for (const { to } of movesOf(section)) {
      await turn();
      const body = document.createElement("div");
      body.className = "cawco-frame-body";
      const story = section.mod?.SHEET.stories.find((one) => one.name === to);
      sizeBody(
        body,
        story ? widthOf(story, "own") : null,
        screenFilled.has(fillKey(section.file, to))
      );
      rig.append(body);
      let mounted: Mounted | undefined;
      try {
        sweep?.(to);
        const played = await playIn(section, to, body);
        ({ mounted } = played);
        moves.push(played.move);
      } finally {
        mounted?.unmount();
        body.remove();
      }
    }
    section.moves = moves;
    later();
  }

  /* --- What the page says: the sheet for the inspector, the report -------- */

  /**
   * The section's whole sheet, its components' props too, read from the
   * stage (core `SHEET_PATH`) once it has drawn, and told the pane (the
   * inspector, the design graph's model): its module carries none, so no
   * draw waits on docgen. A page no pane reads (a map's card, a Preview's
   * embed) asks for none. An answer older than the section's newest ask is
   * let go.
   */
  async function said(section: Section): Promise<void> {
    // No pane reads a stage's render, a map's card or a Preview's embed: none asks for the sheet's docgen.
    if (!section.mod || by !== "panel") {
      return;
    }
    const asked = (sheetAsks.get(section.file) ?? 0) + 1;
    sheetAsks.set(section.file, asked);
    // Beside the page, as its report is posted (core `SHEET_PATH`).
    const at = new URL("sheet", location.href);
    at.search = new URLSearchParams({ file: section.file }).toString();
    let read: SheetRead;
    try {
      const answer = await fetch(at);
      if (!answer.ok) {
        return;
      }
      read = (await answer.json()) as SheetRead;
    } catch {
      // The stage is away: the next load of the section asks again.
      return;
    }
    if (sheetAsks.get(section.file) !== asked) {
      return;
    }
    const sheet: SheetOnPage = { ...read, file: section.file };
    window.__cawcoSheetsOnPage = {
      ...window.__cawcoSheetsOnPage,
      [section.file]: sheet,
    };
    dispatchEvent(new CustomEvent("cawco:sheet", { detail: sheet }));
  }

  function later(): void {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => quietly(post()), REPORT_QUIET_MS);
  }

  function reportNow(): PageReport & Pick<PostedReport, "drawing"> {
    // A section loaded and not read yet, or read again now, posts nothing but its file under `drawing`: an empty or half-read one would stand over what an earlier draw saw of it.
    const drawing = mode?.drawing() ?? [];
    const drawn: PageSection[] = sections.flatMap((section) => {
      const frames =
        section.loaded && !drawing.includes(section.file)
          ? mode?.framesOf(section)
          : null;
      return section.mod && frames
        ? [
            {
              file: section.file,
              title: section.mod.SHEET.meta.title ?? section.file,
              frames,
              moves: section.moves,
              notForced: [...rewrite.refused].slice(0, 20),
            },
          ]
        : [];
    });
    const unnamed = sections.flatMap((section) =>
      (section.mod?.SHEET.stories ?? [])
        .filter((story) => !story.label)
        .map((story) => `${section.file}:${story.name}`)
    );
    return {
      by: by === "stage" ? "stage" : "panel",
      at: new Date().toISOString(),
      page: { errors: [...pageErrors] },
      sections: drawn,
      unnamed,
      drawing,
    };
  }

  async function post(): Promise<void> {
    const report = reportNow();
    mode?.reported(report);
    try {
      // A Preview's embed and a map's card never post: the report stays the panel's own page's, or the stage's render's.
      if (!(by === "map" || embed)) {
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
    state.report = report;
    state.reports = reports;
  }

  /* --- Dials: CSS variables on every body, or args through update -------- */

  /**
   * The agent's dials as the panel turned them (core `StageDials`), the
   * whole set each time: a `cssVar` dial's value with its unit on every
   * body, an `arg` dial's through each body's `update`; a dial the set no
   * longer holds goes back to as written (its variable unset, its arg the
   * story's own).
   */
  let dialVars = new Map<string, string>();
  let dialArgs: Record<string, unknown> = {};
  const applyDials = (values: Record<string, unknown>) => {
    const { vars, args } = dialSetOf(spec.dials ?? [], values);
    const unset = [...dialVars.keys()].filter((name) => !vars.has(name));
    const back = Object.keys(dialArgs).filter((name) => !(name in args));
    const argsChanged = JSON.stringify(args) !== JSON.stringify(dialArgs);
    // The set the page draws already: nothing to set, and no act of the person's.
    if (
      !argsChanged &&
      JSON.stringify([...vars]) === JSON.stringify([...dialVars])
    ) {
      return;
    }
    acted();
    dialVars = vars;
    dialArgs = args;
    for (const { body, mounted, written } of mode?.bodies() ?? []) {
      for (const name of unset) {
        body.style.removeProperty(name);
      }
      for (const [name, value] of dialVars) {
        body.style.setProperty(name, value);
      }
      if (argsChanged) {
        mounted?.update({
          ...Object.fromEntries(back.map((name) => [name, written?.[name]])),
          ...args,
        });
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
      if (!(
        story && section.mod?.SHEET.stories.some((one) => one.name === story)
      )) {
        continue;
      }
      const key = `${section.file}|${story}`;
      if (args && typeof args === "object") {
        overrides.set(key, args);
      } else {
        overrides.delete(key);
      }
      mode?.overridden(section, story);
    }
    dispatchEvent(new CustomEvent("cawco:hmr"));
    later();
  });
  // The pane's mode, as the overlay hears it (preview overlay/page.ts
  // `mode`): in Comment mode what the page marks of its own stays quiet,
  // since the comment target's tint is the one mark.
  window.addEventListener("cawco:mode", (event) => {
    const paneMode = (event as CustomEvent<{ mode?: unknown }>).detail?.mode;
    document.documentElement.toggleAttribute(
      "data-cawco-commenting",
      paneMode === "comment"
    );
  });
  window.addEventListener("cawco:story-select", (event) => {
    const story = (event as CustomEvent<{ story?: unknown }>).detail?.story;
    const chosen = typeof story === "string" ? story : null;
    window.__cawcoSheetChosen = chosen;
    mode?.selected(chosen);
  });
  /** The view as it draws: the page's scheme as the scheme it stands in now. */
  const drawnView = () =>
    JSON.stringify({
      ...view,
      scheme: view.scheme === "page" ? pageScheme() : view.scheme,
    });
  /**
   * The pane's view: scheme, widths, motion. A view that draws as the page
   * already does redresses nothing and reads nothing again: the design
   * graph says its view to every page it loads (DesignGraph's view effect,
   * on `link.loads`), its scheme the dashboard's, which the page drew in
   * already as its own (`page`), so every load read every section twice,
   * the second read straight after the first.
   */
  const setView = (next: Partial<View>) => {
    const was = drawnView();
    const motionWas = view.motion;
    Object.assign(view, {
      ...(next.scheme ? { scheme: next.scheme } : {}),
      ...("widths" in next ? { widths: next.widths ?? null } : {}),
      ...(next.motion ? { motion: next.motion } : {}),
      ...(typeof next.fit === "boolean" ? { fit: next.fit } : {}),
    });
    if (drawnView() === was) {
      return;
    }
    acted();
    if (view.motion !== motionWas) {
      for (const sheet of sheetsNow()) {
        forceMotion(sheet, view.motion);
      }
    }
    mode?.redressed();
    later();
  };
  window.addEventListener("cawco:canvas-view", (event) => {
    setView((event as CustomEvent<Partial<View>>).detail ?? {});
  });

  /* --- HMR ------------------------------------------------------------- */

  window.addEventListener("cawco:section", (event) => {
    const mod = (event as CustomEvent<SectionModule>).detail;
    const section = sectionOf(mod?.SHEET.file ?? "");
    if (!section) {
      return;
    }
    section.mod = mod;
    section.interactions.clear();
    section.probes.clear();
    show(section);
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
    mode?.updated();
    dispatchEvent(new CustomEvent("cawco:hmr"));
    later();
  });

  /* --- The page's own style ----------------------------------------------- */

  const style = new PageStyle({
    tokens: options.tokens,
    faces: options.faces,
  });

  // The page's scheme turned (the host's theme, or the system's): every body drawn in it follows.
  onPageScheme(() => {
    mode?.redressed();
    later();
  });

  const state: CanvasState = {
    files,
    view,
    report: null,
    reports: 0,
    swept: false,
    sweeps:
      by === "stage"
        ? sweptFiles(files, plans, params.get(RENDER_STATE_PARAM))
        : files,
    sweepAt: null,
    drawn: [],
    setView,
    loaded: () => sections.filter((one) => one.loaded).map((one) => one.file),
  };
  const page: Page = {
    applyDials,
    base,
    by,
    files,
    options,
    plans,
    rewrite,
    rig,
    root,
    sections,
    spec,
    state,
    style,
    view,
    argsOf,
    atFloor,
    csfOf,
    dressBody,
    failedCard,
    fills: (section, story) => screenFilled.has(fillKey(section.file, story)),
    fillsScreen,
    formWords,
    heard,
    later,
    loadSection,
    mountInto,
    ownArgsOf,
    playAll,
    post,
    probe,
    quietly,
    reachedIn,
    rewriteAll,
    said,
    schemeOf,
    sectionOf,
    sizeBody,
    turn,
    widthOf,
  };
  window.__cawcoCanvas = state;
  mode = bootStage(page);
}

const BODY_RULE = /(^|,)\s*(body|html|:root)\s*(,|$)/u;
const REDUCED_QUERY = /prefers-reduced-motion/u;
