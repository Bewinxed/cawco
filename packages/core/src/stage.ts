/**
 * Live components (Projects spec D29, `2026-10-16-live-components.md`): a
 * component exists once, as the project's real file, and its states file is
 * a CSF 3 story file beside it (`Who.stories.ts`). One stage per workspace's
 * Vite root runs the project's own dev toolchain inside the workspace's
 * boundary with CawCo's plugin added (agent `stage.ts`, `stage-host/`), and
 * serves the component canvas at {@link CANVAS_PATH}: every story mounted
 * live in every interaction state its CSS reaches; the hub shows it as a
 * `component` artifact through the workspace's port preview. These are the shapes every hop speaks: the
 * daemon's answer to {@link STAGE_ENSURE}, the {@link StageFrame} it sends on
 * each change, and the state the hub keeps in the sheet's doc (`meta.stage`).
 * A workspace preview's server ({@link ServeSpec}) runs on the same
 * supervision, and its preview's doc keeps its state the same way.
 */

/**
 * Where a stage serves a component canvas: `?file=<states file, from the
 * toolchain root>`, once per section, and `spec=<CanvasSpec JSON>`. Outside
 * the hub's own `/__cawco/`, after Vite's `/@vite/`.
 */
export const CANVAS_PATH = "/@cawco/canvas";

/**
 * A section as the canvas page has it before its module loads (the stage
 * reads it from the states file itself, no transform): its name in plain
 * words and its stories, so the page names the section and stands each
 * story's frame in its place while it draws.
 */
export interface SectionPlan {
  /** The states file's `title`, else its component's name, else its file's. */
  name: string;
  stories: { label: string | null; name: string; width: number | null }[];
}

/** A states file's `.stories.<ext>`. */
const STORIES_EXT = /\.stories\.[cm]?[jt]sx?$/;

/**
 * A section's name in plain words: its states file's `title` (its last
 * part: Storybook's `Kit/Badge` is a Badge in the Kit group), else the
 * component's name, else the file's without `.stories.<ext>`.
 */
export const sectionName = (
  title: string | null,
  component: string | null,
  file: string
): string =>
  title?.split("/").at(-1)?.trim() ||
  component ||
  (file.split("/").at(-1) ?? file).replace(STORIES_EXT, "");

/** The id of the canvas page's `<script type="application/json">` holding each states file's {@link SectionPlan}, by file. */
export const CANVAS_PLAN_ID = "cawco-plan";

/** Where a canvas page posts its {@link RenderReport} (`POST`), beside the page so a panel's preview reaches it. */
export const RENDERED_PATH = "/@cawco/rendered";

/** Where the daemon reads a canvas's newest {@link RenderReport} (`?file=…` per section), next to the stage. */
export const REPORT_PATH = "/__cawco/report";

/** The daemon's control method that draws a canvas in the machine's browser when no panel has (agent `stage-render.ts`). */
export const STAGE_RENDER = "stageRender";

/** How long a daemon's render of a canvas may take, page load to the last section's report, past the stage's own start. Ours: a screen's first load transforms its modules. */
export const STAGE_RENDER_MS = 90_000;

/** The states the canvas derives from a component's CSS, never authored: `rest` is the story as mounted. */
export type Interaction = "rest" | "hover" | "focus" | "pressed";
export const INTERACTIONS: readonly Interaction[] = [
  "rest",
  "hover",
  "focus",
  "pressed",
];

export type Scheme = "light" | "dark";

/** The width presets a frame takes when its story names no viewport of its own. Ours, DESIGN.md's breakpoints. */
export const FORMS = { phone: 390, tablet: 768, desk: 1280 } as const;
export type FormName = keyof typeof FORMS;

/** A story's form: a preset's name and width, or a width of its own (`custom`). */
export interface Form {
  name: FormName | "custom";
  width: number;
}

/**
 * What a browser drew of one frame: `unseen` until one drew it since its
 * file last changed; `unshown` when the page did not show it at its width (a
 * phone's canvas shows one frame at a time), so it is neither drawn nor
 * empty: `empty` is a frame shown that drew nothing.
 */
export type FrameState = "drawn" | "empty" | "failed" | "unseen" | "unshown";

/** Where a page's code threw, 1-based, the file from the toolchain root when it is the project's. */
export interface PageError {
  column: number | null;
  file: string | null;
  line: number | null;
  message: string;
}

/** One animation the engine ran, as `getAnimations()` reports it: ms, CSS easing. */
export interface AnimationRead {
  delay: number;
  duration: number;
  easing: string;
  kind: "transition" | "animation" | "web";
  /** Its CSS property, or its keyframes' properties, or its `@keyframes` name. */
  property: string;
  /** Since the move began, ms. */
  start: number;
  /** The element it ran on, as `tag.class` with its source when the dev build marks it. */
  target: string;
}

/** One element whose computed style changed between rest and a forced state. */
export interface StyleDelta {
  changed: Record<string, [string, string]>;
  selector: string;
  /** Its source, `file:line:column` from the toolchain root, when the dev build marks it. */
  source: string | null;
}

/** A component a frame drew: its name, its file and where it is used. */
export interface PartUse {
  /** Where it is called, `file:line:column`; null when it is the story's own. */
  at: string | null;
  file: string;
  name: string;
}

/** One frame: a story drawn at one point of interaction × scheme × width. */
export interface FrameRender {
  /** Its box on the canvas, unscaled. */
  box: { h: number; w: number; x: number; y: number };
  /** The forced state's computed-style delta from rest, the transitions it fired with it; rest has none. */
  delta?: { animations: AnimationRead[]; changed: StyleDelta[] };
  error?: PageError;
  form: string;
  interaction: Interaction;
  label: string | null;
  /** The component files whose elements it drew, each with its call site. */
  parts: PartUse[];
  scheme: Scheme;
  state: FrameState;
  story: string;
  /** Its first words, at most 80 characters. */
  text: string;
  width: number;
}

/** A flow move as a browser played it: the animations it fired, or why it did not run. */
export interface MoveRender {
  animations: AnimationRead[];
  error?: PageError;
  from: string;
  to: string;
}

/** One states file's section of a canvas, as a browser drew it. */
export interface SectionRender {
  file: string;
  frames: FrameRender[];
  /** The content hash of the states file and the components it mounts it was drawn from. */
  hash: string;
  moves: MoveRender[];
  /** Interaction selectors the canvas could not force (§7.1): their columns are not drawn. */
  notForced: string[];
  title: string;
}

/**
 * What a browser drew of a canvas: the page's own errors, each section
 * drawn, and the stories with no doc comment. Posted by the canvas page
 * itself to {@link RENDERED_PATH}; the stage keeps the newest per states
 * file and answers it at {@link REPORT_PATH}, every frame `unseen` once the
 * file or a component it mounts changed since.
 */
export interface RenderReport {
  at: string;
  by: "panel" | "stage";
  page: { errors: PageError[] };
  sections: SectionRender[];
  /** `File:Story` of each story with no doc comment: drawn by its export name alone. */
  unnamed: string[];
}

/** A layout edge an agent declares between two frames (by story, `file:Story` when the canvas has several sections). */
export interface CanvasEdge {
  from: string;
  label?: string;
  to: string;
}

/** A property dial an agent declares on a canvas: a CSS variable on every frame, or an arg re-rendered through `update`. */
export interface CanvasDial {
  kind: "number" | "color" | "select" | "toggle";
  label?: string;
  max?: number;
  min?: number;
  name: string;
  options?: string[];
  step?: number;
  target: { cssVar: string } | { arg: string };
  unit?: string;
}

/** The canvas page's address on its stage: each states file (from the toolchain root), slashes kept, and its spec. */
export const canvasPath = (files: string[], spec: CanvasSpec): string => {
  const query = files
    .map((file) => `file=${encodeURIComponent(file).replaceAll("%2F", "/")}`)
    .join("&");
  return `${CANVAS_PATH}?${query}&spec=${encodeURIComponent(JSON.stringify(spec))}`;
};

/** A canvas address's states files and spec, as {@link canvasPath} wrote them. */
export function canvasOf(path: string): { files: string[]; spec: CanvasSpec } {
  const query = new URL(path, "http://stage").searchParams;
  let spec: CanvasSpec = {};
  try {
    spec = JSON.parse(query.get("spec") ?? "{}") as CanvasSpec;
  } catch {
    spec = {};
  }
  return { files: query.getAll("file"), spec };
}

/** What a canvas page is told besides its files: the agent's edges and groups, its dials. */
export interface CanvasSpec {
  dials?: CanvasDial[];
  edges?: CanvasEdge[];
  /** Story → the parent story or section heading it groups under. */
  group?: Record<string, string>;
  name?: string;
}

/** The bounds a canvas spec keeps. Ours. */
export const CANVAS_SPEC_LIMITS = {
  dials: 24,
  edges: 100,
  files: 24,
  label: 80,
} as const;

/** Where the daemon reads a sheet's stories next to the stage; never through the hub. */
export const STORIES_PATH = "/__cawco/stories";

/** Where the daemon writes a story's args into its file (`POST`, a {@link SheetWrite}), next to the stage: under the hub's own prefix, so no preview reaches it. */
export const WRITE_PATH = "/__cawco/write";

/** Where the daemon reads a sheet's {@link SheetWeight} (`?file=<story file>`), next to the stage; under the hub's own prefix, so no preview reaches it. */
export const WEIGHT_PATH = "/__cawco/weight";

/**
 * What a sheet loads, read from the stage's Vite module graph from its story
 * file: the project's modules (its source and any package Vite serves file
 * by file) and Vite's prebundled deps apart, which the browser keeps by
 * their `?v=` address. `heaviest` is the story file's imports that bring
 * the most project code, each with all it brings that no earlier import
 * did: the import to cut. Vite transforms a module when a page asks for it,
 * so a sheet has a weight once a view has loaded it.
 */
export interface SheetWeight {
  /** The budget a component's states file keeps (the component-canvas skill's); a screen is judged against the page's ceiling instead. */
  budget: { bytes: number; modules: number };
  /** Project code: its modules and their transformed bytes. */
  bytes: number;
  /** Where to cut, one sentence: the import, or the seam in the component when it is the component's own; null under budget. */
  cut: string | null;
  deps: { bytes: number; modules: number };
  heaviest: SheetImport[];
  measuredAt: string;
  modules: number;
  /** Past the component budget. */
  over: boolean;
}

/** A component's states file's budget. The component-canvas skill's numbers. */
export const COMPONENT_BUDGET = { modules: 250, bytes: 1_000_000 } as const;

/** One of a story file's imports, as its sheet's weight names it. */
export interface SheetImport {
  /** The modules it imports directly that bring the most, each with all it brings: where its weight enters. */
  brings: { bytes: number; file: string; modules: number }[];
  bytes: number;
  /** The module it resolves to, from the toolchain root. */
  file: string;
  modules: number;
  /** As the story file writes it, like `#lib/cawco/client.svelte`. */
  specifier: string;
  /**
   * The modules under it where most of its weight enters, from the toolchain
   * root, each bringing at least half of the one before: a fixture's
   * `home/CawPanel.svelte`, then what that brings. Empty when it is its own
   * weight or spreads it evenly.
   */
  via: string[];
}

/** Where the daemon reads the stage's components (§6's discovery), next to the stage. */
export const COMPONENTS_PATH = "/__cawco/components";

/** The daemon's control method that writes a sheet's story file through its stage ({@link SheetWrite}). */
export const STAGE_WRITE = "stageWrite";

/** The daemon's control method that lists a toolchain root's components through its stage. */
export const STAGE_COMPONENTS = "stageComponents";

/** The stage's own answer that it serves; read every {@link STAGE_HEALTH_MS} by the daemon next to it. */
export const HEALTH_PATH = "/__cawco/health";

/** The daemon's control method that starts a workspace's stage or wakes it, and answers a sheet's stories. */
export const STAGE_ENSURE = "stageEnsure";

/**
 * A workspace preview's server: `command`, run by the workspace's stage
 * inside its boundary in `cwd` (from the clone's root), with `PORT` set to
 * `port`, which it serves on the boundary's loopback. Supervised as a sheet's
 * Vite is: up once the port answers, asked every {@link STAGE_HEALTH_MS},
 * started again {@link STAGE_RESTARTS} times, asleep after
 * {@link STAGE_IDLE_MS} with no viewer, stopped with its artifact and its
 * workspace. It never depends on the shell or session that asked for it.
 */
export interface ServeSpec {
  command: string;
  cwd: string;
  port: number;
}

/** The longest command a preview's server takes. Our bound. */
export const SERVE_COMMAND_LIMIT = 2000;

/** The daemon's control method that starts a workspace preview's server or wakes it ({@link ServeSpec}), answering its state. */
export const STAGE_SERVE = "stageServe";

/** The daemon's control method that stops a workspace preview's server: its last artifact went. */
export const STAGE_UNSERVE = "stageUnserve";

/** How long a stage has to answer once started. The spec's number. */
export const STAGE_READY_MS = 60_000;

/** How long a place's stage clone's git may take, each cut or step (agent `stage-clone.ts`). Ours: a one-commit fetch from the same disk. */
export const STAGE_CLONE_GIT_MS = 60_000;

/** How long a place's stage clone's install inside its boundary may take (agent `stage-clone.ts` `installAt`). Ours. */
export const STAGE_CLONE_INSTALL_MS = 180_000;

/** How long a place's stage clone may take before its stage starts (agent `stage-clone.ts`): its git, then its project's install (`installStage`). */
export const STAGE_CLONE_MS = STAGE_CLONE_GIT_MS + STAGE_CLONE_INSTALL_MS;

/** How often the daemon asks a running stage whether it serves. The spec's number. */
export const STAGE_HEALTH_MS = 15_000;

/** How long a stage runs with no viewer and no agent read before it sleeps. The spec's number. */
export const STAGE_IDLE_MS = 30 * 60_000;

/** Starts a failed stage gets before it stays in `error`. The spec's number. */
export const STAGE_RESTARTS = 3;

/**
 * The dev toolchains a stage runs (spec §2): the project's own Vite, or
 * Astro's or Nuxt's, each started by its programmatic API with the stage's
 * plugins added.
 */
export type StageToolchain = "vite" | "astro" | "nuxt";

/** The words for a project or component no stage shows: the owner's decision, an HTML page on the project's CSS (spec §10). */
export const AS_PAGE =
  "Show its components as an HTML page artifact (artifact_create kind page) that loads the project's built CSS.";

/** A CSF story file: `Who.stories.ts`, `Card.stories.tsx`, `Page.stories.js`. */
export const STORY_FILE = /\.stories\.[cm]?[jt]sx?$/;

/**
 * Where a stage is: `starting` its first start, `waking` a start after
 * sleep, `live` serving, `error` it could not start or failed its restarts,
 * `asleep` stopped for want of a viewer, started again on the next open.
 */
export type StageStatus = "starting" | "waking" | "live" | "error" | "asleep";

/**
 * A compile error the stage's Vite sent its pages, as the plugin keeps it
 * until the module compiles again: the module's file from the toolchain root,
 * 1-based line and column when Vite's payload has them, Vite's message and
 * code frame, and the story files that import the module, which the hub
 * files it under.
 */
export interface StageError {
  column: number | null;
  file: string;
  frame: string | null;
  line: number | null;
  message: string;
  /** The story files (from the toolchain root) whose sheet imports the module. */
  sheets: string[];
}

/**
 * One named export of a story file: a story, by its export's 1-based place,
 * with its `args` as the file writes them. A literal arg (a string, number,
 * boolean, null, or an array or object of those) is its value; any other
 * (a fixture import, a function) is in `code`, its source text, and the
 * inspector shows it read-only.
 */
export interface Story {
  args: Record<string, unknown>;
  /** Args whose value is code, not a literal: their source text. */
  code: Record<string, string>;
  column: number;
  /** The story's own component, from the toolchain root, when it names one apart from the meta's. */
  component: string | null;
  /** Its form, from `parameters.viewport` (the story's, else the meta's); null when it names none. */
  form: Form | null;
  /** The story its flow move starts from (`from`), when it declares one with a `play`. */
  from: string | null;
  /** Its doc comment in plain words, the frame's label; null when it has none (`unnamed`). */
  label: string | null;
  line: number;
  name: string;
  /** Whether it has a `play`: with `from`, a flow move. */
  play: boolean;
  /**
   * Why the inspector can't write this story's args, when it can't; null
   * when it can. `read` false: the story file builds it with code the
   * reader can't follow (an imported helper, a computed value), so
   * `component` and `args` say nothing of it, though it mounts all the same;
   * `reason` says "args not readable here" and why. `read` true: its
   * component and args were read through a spread or a local helper,
   * shared code that is edited in the file.
   */
  readOnly: { read: boolean; reason: string } | null;
}

/** What a story file's default export says every story shares: its args, and the component each mounts unless it names its own. */
export interface SheetMeta {
  args: Record<string, unknown>;
  code: Record<string, string>;
  /** The component, from the toolchain root; null when the meta names none the stage could resolve. */
  component: string | null;
  /** CSF's `title`, the section's path (`Settings/Pairing`); null when it has none. */
  title: string | null;
}

/**
 * A prop's type in Storybook's SBType names (`argTypes[name].type.name`),
 * which decides its control: `enum` the variant control, `boolean`,
 * `string` and `number` their fields, `slot` content that is a pin
 * (`Snippet`, `ReactNode`, a Vue slot), the rest read-only. A `token-*`
 * kind is a prop typed with one of the design system's generated token
 * types ({@link TOKEN_TYPES}): its options are the system's names.
 */
export type PropKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | TokenKind
  | "slot"
  | "function"
  | "object"
  | "array"
  | "other";

/** A prop whose type is a design system's colour, size or font names. */
export type TokenKind = "token-color" | "token-size" | "token-font";

/**
 * The type aliases a design system's generated `tokens.ts` exports (the
 * hub's design-tokens.ts `tokenTypes`), string-literal unions of its token
 * names by DTCG `$type`, and the kind docgen reads a prop typed with each as
 * (the owner, 2026-10-16: "a component that wants suggestions types its prop
 * with one"). Only a prop so typed is offered token names.
 */
export const TOKEN_TYPES = {
  TokenColor: "token-color",
  TokenSize: "token-size",
  TokenFont: "token-font",
} as const satisfies Record<string, TokenKind>;
export type TokenType = keyof typeof TOKEN_TYPES;

/**
 * One prop of a component as its framework's docgen reads it, in
 * Storybook's argTypes/PropertyMeta shape (spec §6): Svelte's by
 * svelte2tsx and TypeScript's checker, Vue's by vue-component-meta,
 * React's by react-docgen (react-docgen-typescript where a type is past
 * it).
 */
export interface PropMeta {
  /** Its default as the source writes it, like `"neutral"`; null when it has none. */
  defaultValue: string | null;
  description: string | null;
  name: string;
  /** An enum's values, or a token kind's names, in the order its type lists them. */
  options?: (string | number)[];
  required: boolean;
  type: { name: PropKind; raw: string };
}

/**
 * A component's props as the stage read them. `types` says how: `checked`
 * by the TypeScript checker or a docgen of its own, `jsdoc` from JSDoc
 * and PropTypes alone (the project has no TypeScript), `unknown` when
 * nothing could read them, with `note` saying why.
 */
export interface ComponentDoc {
  /** From the toolchain root. */
  file: string;
  name: string;
  note?: string;
  props: PropMeta[];
  types: "checked" | "jsdoc" | "unknown";
}

/** A sheet as its stage reads it: its stories, its meta, and the props of each component they mount. */
export interface SheetRead {
  components: ComponentDoc[];
  meta: SheetMeta;
  stories: Story[];
}

/**
 * A change to a story file through its stage: one story's `args` (`values`
 * set, `unset` dropped back to the meta's or the component's default), or a
 * story added (from args), duplicated, removed or moved. CawCo writes only
 * these (the owner, 2026-10-16); everything else in a sheet is a pin.
 */
export type SheetWrite =
  | {
      args: {
        story: string;
        unset?: string[];
        values: Record<string, unknown>;
      };
      file: string;
    }
  | { file: string; story: StoryOp };

/** A story export added, duplicated, removed, or moved before another (`before: null` to the end). */
export type StoryOp =
  | { add: string; args?: Record<string, unknown> }
  | { as: string; duplicate: string }
  | { remove: string }
  | { before: string | null; move: string };

/** What a write did: the story file's lines it changed (1-based, as written), and the sheet as it reads after. */
export interface SheetWritten {
  file: string;
  /** The project's formatter that shaped the changed statement, like "prettier 3.9.10"; null when the project has none. */
  formatted: string | null;
  lines: { from: number; to: number };
  sheet: SheetRead;
}

/** A component the stage found (§6's discovery): its name, its file, and the story files that show it. */
export interface Found {
  file: string;
  name: string;
  sheets: string[];
}

/**
 * What `design_map` asks the stage (component canvas §4): the components
 * under `dir` (from the toolchain root; omitted, its source folder), those
 * whose name holds `query`, or the one card of `component` (a file);
 * `limit` at a time from `cursor`, each a count line or (`detailed`) its
 * card.
 */
export interface DesignQuery {
  component?: string;
  cursor?: string;
  detailed?: boolean;
  dir?: string;
  limit?: number;
  query?: string;
  /** The panel's map, never the agent's: each card's frames in miniature, and each link's own counts, states files and frames. */
  thumbs?: boolean;
}

/** A design map's page bounds. The design's numbers. */
export const DESIGN_MAP_LIMITS = { limit: 50, max: 200 } as const;

/** A component's frames as a browser last drew them, in miniature: each one's box on its canvas and its state, from its canvas's top left. */
export interface DesignThumb {
  frames: { h: number; state: FrameState; w: number; x: number; y: number }[];
  /** The canvas the frames stand on: their union's extent. */
  h: number;
  w: number;
}

/** How many frames a thumbnail draws. Ours: a canvas's first rows read at a node's size; more is noise. */
export const THUMB_FRAMES = 48;

/** Where a component is used, or what it renders: the other component, and the call site when a draw saw it. */
export interface DesignLink {
  at: string | null;
  /** With `thumbs`: its own frames drawn, states, states files and thumbnail. */
  drawn?: number;
  file: string;
  name: string;
  states?: number;
  statesFiles?: string[];
  thumb?: DesignThumb | null;
}

/** A component in the library, as the map answers it: counts, or its card. */
export interface DesignCard {
  /** Frames a browser drew of its states (rest and forced), from the stage's reports. */
  drawn: number;
  file: string;
  madeOf: number | DesignLink[];
  /** Flow moves its states files declare (`from` + `play`), detailed only. */
  moves?: { from: string; to: string }[];
  name: string;
  /** Its props as docgen reads them, for one component's card only. */
  props?: PropMeta[];
  /** Stories across its states files. */
  states: number;
  /** Its states files, detailed only. */
  statesFiles?: string[];
  stories?: {
    drawn: boolean;
    interactions: Interaction[];
    label: string | null;
    name: string;
  }[];
  /** With `thumbs`: its frames in miniature; null before a browser drew them. */
  thumb?: DesignThumb | null;
  usedIn: number | DesignLink[];
}

/** One component on a canvas's map: what it is, where it is called, and its states as drawn. */
export interface CanvasMapNode {
  /** Where it is called from the canvas's component (made of) or where it calls it (used in); null when no draw saw it. */
  at: string | null;
  /** Frames a browser drew of its states. */
  drawn: number;
  file: string;
  name: string;
  /** Stories across its states files. */
  states: number;
  /** Its states files, from the toolchain root, as a canvas address names them; none, it has no canvas to draw live. */
  statesFiles: string[];
  /** Its frames as last drawn, in miniature; null before a browser drew them. */
  thumb: DesignThumb | null;
}

/** A component canvas's map (component canvas §3c): its component, what renders it above, what it renders below. */
export interface CanvasMap {
  center: CanvasMapNode;
  madeOf: CanvasMapNode[];
  usedIn: CanvasMapNode[];
}

/** A page of the design map. */
export interface DesignMap {
  components: DesignCard[];
  /** The folder the page covers, from the toolchain root. */
  dir: string;
  has_more: boolean;
  next_cursor: string | null;
  /** The toolchain root, from the clone's root. */
  root: string;
  /** What to do when the page was cut, one sentence. */
  steer?: string;
  total: number;
}

/** What every stage's state says: where it is, where it runs, why it failed when it did, the compile errors standing now. */
interface StageStateOf {
  at: string;
  /** Where it runs from the clone's root ("." for the root itself): a sheet's toolchain root, a server's `cwd`. */
  dir: string;
  errors: StageError[];
  /** Why it is in `error`, one sentence; none otherwise. */
  message?: string;
  status: StageStatus;
}

/** A sheet's stage: the project's own dev toolchain on its toolchain root. */
export interface SheetStageState extends StageStateOf {
  runs: "sheet";
  toolchain: StageToolchain;
}

/** A workspace preview's server: the command its preview names (`serve`). */
export interface ServerStageState extends StageStateOf {
  runs: "serve";
}

/**
 * A stage as the hub keeps it in each of its artifacts' docs (`meta.stage`),
 * as the daemon states it: a sheet's, with the toolchain it runs, or a
 * workspace preview's server's.
 */
export type StageState = SheetStageState | ServerStageState;

/** The daemon's word on each change of a stage: every artifact of the workspace's that previews its port hears it. */
export interface StageFrame {
  kind: "stage";
  /** The port it serves on, in the workspace's network: a sheet's stage's or a preview's server's. */
  port: number;
  state: StageState;
  workspace: string;
}

/**
 * The daemon's word that a place's stage clone (agent `stage-clone.ts`) is
 * cut and in step, sent on each use: the hub files it as a workspace of the
 * stage kind (schema `workspaces.stageFor`), which its retire sweep settles
 * once the place's stage sleeps.
 */
export interface StageCloneFrame {
  /** The clone's workspace id (core workspace-policy.ts `stageCloneId`). */
  id: string;
  kind: "stage-clone";
  /** The clone's root. */
  path: string;
  /** The place whose sheets' stage runs in it. */
  place: string;
  /** The repository root of the checkout it was cut from. */
  repoRoot: string;
  /** Its scratch dir, its commands' `TMPDIR`. */
  tmp: string;
}

/** The daemon's answer to {@link STAGE_ENSURE}: the stage's port, root and state, and the sheet as it reads. */
export interface StageOpened {
  /** The toolchain root, from the clone's root. */
  dir: string;
  /** The sheet's story file, from the toolchain root. */
  file: string;
  port: number;
  /** What a browser last drew of the canvas's states files, each `unseen` since its file or a component it mounts changed. */
  report: RenderReport;
  sheet: SheetRead;
  state: StageState;
  /** What the sheet loads; null until a view has loaded it. */
  weight: SheetWeight | null;
}

/**
 * What the canvas page tells the pane on each run and each props refresh
 * (`cawco:sheet`, through the overlay): the section in view, as the stage
 * read it.
 */
export interface SheetOnPage extends SheetRead {
  file: string;
}
