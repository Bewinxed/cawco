/**
 * What the canvas page shares between its parts: the page itself (`Page`),
 * what a mode answers it with (`Mode`), and the shapes both stand on
 * (sections, columns, views, mounted stories). The runtime (runtime.ts)
 * makes the page and hands it to the mode (stage.ts); both read these
 * shapes from here, so neither imports the other.
 */

import {
  type AnimationRead,
  type CanvasGraph,
  type CanvasSpec,
  type FramePictureRead,
  type FrameRender,
  type Interaction,
  type MoveRender,
  type PageError,
  type PageReport,
  type Scheme,
  SECTION_WRITTEN,
  type SectionPlan,
  type SectionSheet,
  type SheetOnPage,
  type StageErrorKind,
  type Story,
  type SweepAt,
} from "@cawco/core/stage";
import { shellWords } from "@cawco/core/words/shell";
import type { deltaOf } from "./measure";
import type { PageStyle } from "./page-style";
import type { PseudoState, Rewrite } from "./pseudo";

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

interface Adapter {
  mountStory: (
    target: HTMLElement,
    spec: MountSpec,
    failed: (error: unknown) => void
  ) => Mounted;
}

/** A story's play function, called with the page's context for it. */
export type PlayFn = (context: object) => Promise<void> | void;

/** A story's or a meta's CSF object as the page reads it (Storybook's CSF 3): each field kept as the page can use it, any other dropped. */
export interface Csf {
  args?: object;
  /** Run once before the story's frames draw, as its section loads: what it writes into the modules it imports is its frame's own (host.ts `cawcoStandIns`). */
  beforeEach?: (context: object) => unknown;
  component?: unknown;
  decorators?: unknown[];
  from?: unknown;
  name?: string;
  parameters?: object;
  play?: PlayFn;
  render?: unknown;
  title?: string;
}

/** `value` as an object, or undefined where it is none. */
export const objectOf = (value: unknown): object | undefined =>
  typeof value === "object" && value !== null ? value : undefined;

/**
 * What a states file exports for a story or its meta, read as CSF: an
 * object, or a function story (its `render`, beside any field written on
 * it); null for any other export. A field of the wrong kind is left out.
 */
export function readCsf(value: unknown): Csf | null {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return null;
  }
  const fields: Record<string, unknown> = {
    ...(typeof value === "function" ? { render: value } : {}),
    ...Object.fromEntries(Object.entries(value)),
  };
  const { beforeEach, decorators, name, play, title } = fields;
  return {
    args: objectOf(fields.args),
    // The project's function, called on the export it is written on.
    beforeEach:
      typeof beforeEach === "function"
        ? (context) => Reflect.apply(beforeEach, value, [context])
        : undefined,
    component: fields.component,
    decorators: Array.isArray(decorators) ? decorators : undefined,
    from: fields.from,
    name: typeof name === "string" ? name : undefined,
    parameters: objectOf(fields.parameters),
    // The project's function, called on the export it is written on.
    play:
      typeof play === "function"
        ? (context) => Reflect.apply(play, value, [context])
        : undefined,
    render: fields.render,
    title: typeof title === "string" ? title : undefined,
  };
}

/** The page's one element the canvas draws in (the stage's page carries it). */
export function canvasOf(): HTMLElement {
  const canvas = document.getElementById("cawco-canvas");
  if (!canvas) {
    throw new Error("[cawco] the page has no #cawco-canvas");
  }
  return canvas;
}

/** A states file's module as the stage serves it (`cawco:sheet/<file>.js`). */
export interface SectionModule {
  /** Each story that holds modules of its own, its own copy of the states file, by its export's name: what it mounts from. */
  FRAMES?: Record<string, Record<string, unknown>>;
  module: Record<string, unknown>;
  SHEET: SectionSheet;
}

/** The states file story `name` of `mod` mounts from: its own copy where it holds modules of its own, else the page's. */
export const moduleOf = (
  mod: SectionModule | undefined,
  name: string
): Record<string, unknown> => mod?.FRAMES?.[name] ?? mod?.module ?? {};

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

/** The class a probe's body carries while its values are read: nothing in it moves (page-style.ts PAGE_CSS). */
export const HELD = "cawco-held";

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
export const nextTask = () =>
  new Promise<void>((done) => {
    tasksDue.push(done);
    tasks.port2.postMessage(null);
  });

/** The pane says it is away (core `CANVAS_AWAY`): its frames are held (runtime.ts `holdWhileAway`). */
let away = false;
/** Whether the pane is away: its frames are held. */
export const paneAway = () => away;
/** Whether no frame comes now: the tab is out of sight (the browser draws none), or the pane is away (its frames held). */
const frameless = () => document.visibilityState === "hidden" || away;
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
/** The pane said it is away, or back: a pane gone away ends every wait on a frame. */
export const setPaneAway = (said: boolean) => {
  away = said;
  framesStopped();
};

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

/** Vite's error as its server sends it to pages (`prepareError`): its message, the module's id and its place. */
interface ViteError {
  frame?: string;
  id?: string;
  loc?: { column?: number; file?: string; line?: number };
  message: string;
  pluginCode?: string;
}

declare global {
  interface Window {
    __cawcoCanvas?: CanvasState;
    __cawcoErrors?: { at: number; error: unknown }[];
    /** The count of the page's preloads (host.ts `serveCanvas`). */
    __cawcoGraph?: CanvasGraph;
    __cawcoSheetChosen?: string | null;
    /** Each section's sheet as last told the pane, by its file: the overlay tells a pane that says hello late every one. */
    __cawcoSheetsOnPage?: Record<string, SheetOnPage>;
    /** The overlay's bridge into the artifact's doc, when a panel shows the page. */
    cawco?: Bridge;
  }
  /** The window events of the stage's HMR: its client module (host.ts) dispatches each as Vite's `import.meta.hot` hears it. */
  interface WindowEventMap {
    "cawco:after-update": CustomEvent<null>;
    "cawco:section": CustomEvent<SectionModule>;
    "cawco:stage-error": CustomEvent<ViteError | undefined>;
    "cawco:updates": CustomEvent<string[]>;
    [SECTION_WRITTEN]: CustomEvent<string>;
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
  csfOf: (mod: Record<string, unknown>, name: string) => Csf | null;
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
   * and none while the person acted in the last `PERSON_QUIET_MS` (runtime.ts), so
   * a reveal heard is scrolled before the sweep takes the main thread again:
   * a probe pass of a sheet's thirty forms held a reveal behind it for half
   * a second on a loaded host, and its scroll for 700 ms more.
   */
  turn: () => Promise<void>;
  readonly view: View;
  widthOf: (story: Story, slot: WidthSlot) => number | null;
}
