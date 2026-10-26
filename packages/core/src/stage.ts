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

import type { PreviewDown } from "./index";

/**
 * The frameworks a stage mounts a component with: what the daemon hands its
 * host (agent stage.ts, `CAWCO_STAGE_FRAMEWORK`), each with its own adapter
 * there (stage-host host.ts).
 */
export type StageFramework = "svelte" | "vue" | "react" | "solid" | "preact";

/**
 * Where a stage serves a component canvas: `?file=<states file, from the
 * toolchain root>`, once per section, and `spec=<CanvasSpec JSON>`. Outside
 * the hub's own `/__cawco/`, after Vite's `/@vite/`.
 */
export const CANVAS_PATH = "/@cawco/canvas";

/**
 * Where a stage serves a canvas page's modules, at its generation:
 * `/@cawco/m/<key>/<the module's own address>` (stage-host host.ts
 * `serveKeyed`). A page's stack names a module there; its place in the
 * project is the address after the key.
 */
export const MODULES_PATH = "/@cawco/m/";

/** A keyed module's address as its own: `/@cawco/m/<key>/src/A.svelte` is `/src/A.svelte`; any other as it is. */
export const unkeyedPath = (path: string): string => {
  if (!path.startsWith(MODULES_PATH)) {
    return path;
  }
  const cut = path.indexOf("/", MODULES_PATH.length);
  return cut === -1 ? path : path.slice(cut);
};

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
const STORIES_EXT = /\.stories\.[cm]?[jt]sx?$/u;

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

/**
 * A canvas page embedded in a decision page's Preview (`by=embed`, and a
 * `story` per story it shows): the message it posts to the page holding it,
 * `{ type, height }` in CSS px, so its frame is as tall as its frames.
 */
export const CANVAS_EMBED_SIZE = "cawco:embed-size";

/**
 * Any page framed by another (a decision page's Preview of a page, a dev
 * server's or a folder's preview): the message its overlay posts to the
 * page holding it, `{ type, least }`, the least font size its shown words
 * are set at in CSS px, told again when it changes. The Preview scales the
 * design down no further than stands those words at 10px.
 */
export const EMBED_WORDS = "cawco:embed-words";

/**
 * A canvas embed's module graph, before it fetches any of it: the message
 * it posts to the page holding it as its page is read, `{ type, urls }`,
 * each module's absolute address. It fetches nothing of it until the page
 * answers {@link CANVAS_EMBED_GO}, and loads its stories on
 * {@link CANVAS_EMBED_READY} (dashboard decisions host embed-turns.ts: a
 * page's embeds fetch together, each module asked of the network once).
 */
export const CANVAS_EMBED_GRAPH = "cawco:embed-graph";

/** The page's answer to {@link CANVAS_EMBED_GRAPH}, `{ type, urls }`: the embed's share of its graph, the modules it fetches now (absolute addresses; none where others fetch them all). */
export const CANVAS_EMBED_GO = "cawco:embed-go";

/** The page's word once every module of an embed's graph has arrived in one of its frames, `{ type, urls }`: the rest of its graph, which it loads from the cache, then its stories. */
export const CANVAS_EMBED_READY = "cawco:embed-ready";

/**
 * A canvas embed's share of its graph has arrived (every `modulepreload` of
 * it answered; on a page of its own, its whole graph), the message it posts
 * to the page holding it, `{ type }`: those modules are the page's now, so
 * another embed asking for them asks the network for none (dashboard
 * decisions host embed-turns.ts).
 */
export const CANVAS_EMBED_FETCHED = "cawco:embed-fetched";

/**
 * A canvas frame's pane put away (`away: true`) or brought back
 * (`away: false`), `{ type, away }`: the message the page holding the frame
 * posts it, from the dashboard's own pane-away path (motion/rest.ts
 * `holdSkipped`), relayed by a decision page to its Previews. A canvas holds
 * its stories' animation-frame callbacks while away (agent canvas runtime):
 * WebKit runs a frame's rAF at full rate under a `content-visibility:
 * hidden` pane (1,245 a 20 s, where Chromium runs none), and nothing in
 * the frame can tell it is skipped.
 */
export const CANVAS_AWAY = "cawco:away";

/** Whether a {@link CANVAS_AWAY} message says the pane is away; undefined for any other message. */
export const awaySaid = (data: unknown): boolean | undefined => {
  const said = data as { away?: unknown; type?: unknown } | null;
  return said?.type === CANVAS_AWAY ? said.away === true : undefined;
};

/** The canvas page's count of its preloads (stage-host host.ts `serveCanvas`), read by the runtime. */
export interface CanvasGraph {
  /** Its share's preloads: the whole graph on a page of its own, the page's {@link CANVAS_EMBED_GO} in a Preview (unknown until then). */
  asked: number;
  done: number;
  /** Settles once the page may load its stories: at once on a page of its own, on {@link CANVAS_EMBED_READY} in a Preview. */
  go: Promise<void>;
  whole: boolean;
}
/** The event the canvas page dispatches once every preload of its graph answered. */
export const CANVAS_GRAPH_FETCHED = "cawco:graph-fetched";

/** A canvas embed's shape as it said it (`CANVAS_EMBED_SIZE`), CSS px: its height, and its widest story's width (null where none says one). */
export interface EmbedShape {
  h: number;
  w: number | null;
}

/**
 * A component canvas's shapes as a decision page's media carries them, so a
 * Preview's skeleton stands at its picture's own shape from its first paint
 * (dashboard decisions host Preview.svelte):
 * - `said`: what an embed of it said, by the stories its Preview names
 *   ({@link storiesKey}), as a Preview heard it and told beside its page
 *   (`/__cawco/page/<page>/shape`);
 * - `drawn`: each story's rest frame as the stage's render report has it,
 *   for a Preview no embed has said yet.
 */
export interface CanvasShapes {
  drawn: Record<string, { h: number; w: number }>;
  said: Record<string, EmbedShape>;
}

/** The key of a Preview's stories, in the order it names them; empty for every story. */
export const storiesKey = (stories: readonly string[]): string =>
  stories.join("|");

/** Whether `value` is a shape an embed could say: a height past 0 and a width past 0 or none, finite, within reason. Ours: 20,000 px. */
export const isEmbedShape = (value: unknown): value is EmbedShape => {
  const one = value as { h?: unknown; w?: unknown } | null;
  const px = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 20_000;
  return !!one && px(one.h) && (one.w === null || px(one.w));
};

/**
 * A component canvas's address (`embed`, as the hub answers it in a
 * decision page's media) drawn as a Preview: `by=embed`, a `story` per name
 * in `stories` (none: every story).
 */
export const canvasEmbedUrl = (
  embed: string,
  stories: readonly string[]
): string => {
  const url = new URL(embed);
  url.searchParams.set("by", "embed");
  url.searchParams.delete("story");
  for (const one of stories) {
    url.searchParams.append("story", one);
  }
  return url.href;
};

/** The id of the canvas page's `<script type="application/json">` holding each states file's {@link SectionPlan}, by file. */
export const CANVAS_PLAN_ID = "cawco-plan";

/** Where a canvas page posts its {@link RenderReport} (`POST`), beside the page so a panel's preview reaches it. */
export const RENDERED_PATH = "/@cawco/rendered";

/**
 * Where a canvas page reads a states file's whole {@link SheetRead}, its
 * components' props too (`?file=…`), beside the page as {@link RENDERED_PATH}
 * is: once it has drawn, for the pane's inspector. A section's module
 * carries only its {@link SectionSheet}, so no draw waits on docgen.
 */
export const SHEET_PATH = "/@cawco/sheet";

/** Where the daemon reads a canvas's newest {@link RenderReport} (`?file=…` per section), next to the stage. */
export const REPORT_PATH = "/__cawco/report";

/** The daemon's control method that draws a canvas in the machine's browser when no panel has (agent `stage-render.ts`). */
export const STAGE_RENDER = "stageRender";

/** How long a daemon's render of a canvas may take, page load to the last section's report, past the stage's own start. Ours: a screen's first load transforms its modules. */
export const STAGE_RENDER_MS = 90_000;

/** The {@link Interaction}s, in the order the canvas draws them. */
export const INTERACTIONS = ["rest", "hover", "focus", "pressed"] as const;
/** The states the canvas derives from a component's CSS, never authored: `rest` is the story as mounted. */
export type Interaction = (typeof INTERACTIONS)[number];

/** `value` as one of the {@link INTERACTIONS}, or undefined when it is none. */
export const interactionOf = (value: unknown): Interaction | undefined =>
  INTERACTIONS.find((one) => one === value);

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
type FrameState = "drawn" | "empty" | "failed" | "unseen" | "unshown";

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
  /** The content hash of the states file and every file of the project's its frames are drawn from, as they stood when the stage kept the report: an edit since the draw loads the section again, which draws and reports again. */
  hash: string;
  moves: MoveRender[];
  /** What the canvas could not draw as asked: interaction selectors it could not force (§7.1), whose columns are not drawn, and width media it leaves to the window (canvas width.ts), which a frame's width does not answer. */
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

/** A section whose module the page could not load, with the browser's own error for it. */
export interface SectionUnloaded {
  error: PageError;
  /** Its states file, from the toolchain root. */
  file: string;
}

/**
 * What a canvas page posts to {@link RENDERED_PATH}: its report, and each
 * section whose module didn't load in the page, which posts no section of
 * its own. The stage keeps each as that section's `page` problem.
 */
export interface PostedReport extends PageReport {
  unloaded: SectionUnloaded[];
}

/** A section as its page drew it: the stage stamps its content hash as it keeps it ({@link SectionRender} `hash`). */
export type PageSection = Omit<SectionRender, "hash">;

/** A report as the canvas page reads it of itself, before the stage keeps it: its sections unstamped ({@link PageSection}). */
export interface PageReport extends Omit<RenderReport, "sections"> {
  sections: PageSection[];
}

/**
 * The stage's answer at {@link REPORT_PATH}: the report, and every problem
 * the stage host keeps as of answering (a states file the ask named and
 * found missing among them), which the daemon keeps as the stage's
 * `errors` before it states the stage.
 */
export interface ReportAnswer extends RenderReport {
  errors: StageError[];
}

/**
 * A frame's body as it stands on its canvas's page, read for its picture:
 * what the canvas answers (stage-host canvas runtime.ts `picture`) and the
 * agent's frame-picture.ts holds a picture to.
 */
export interface FramePictureRead {
  /** Its own border-box size from layout, CSS px, unrounded and before any transform. */
  own: { h: number; w: number };
  /** Its box on the page, CSS px. */
  rect: { h: number; w: number; x: number; y: number };
  /** Device pixels per CSS px. */
  scale: number;
  /** Where the canvas stands, in words, for a refusal. */
  view: string;
  /** Whether it stands whole in the canvas and the window. */
  whole: boolean;
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
    spec = canvasSpecOf(JSON.parse(query.get("spec") ?? "{}"));
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

/*
 * Reading back what this module wrote into a page or an address, without a
 * schema library: the dashboard and the canvas page load this module, and a
 * page carries no validator of its own. Each reads a value as the JSON it was
 * written as, and keeps what is that shape.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const numberOf = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;
const textsOf = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((one) => typeof one === "string")
    ? value
    : undefined;
/** The keys of `value` that are present, each as it reads. */
const present = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, one]) => one !== undefined)
  ) as Partial<T>;
const DIAL_KINDS: readonly CanvasDial["kind"][] = [
  "number",
  "color",
  "select",
  "toggle",
];

const dialOf = (value: unknown): CanvasDial | undefined => {
  if (!isRecord(value)) {
    return;
  }
  const kind = DIAL_KINDS.find((one) => one === value.kind);
  const name = textOf(value.name);
  const target = isRecord(value.target) ? value.target : undefined;
  const cssVar = textOf(target?.cssVar);
  const arg = textOf(target?.arg);
  if (!(kind && name && (cssVar || arg))) {
    return;
  }
  return {
    kind,
    name,
    target: cssVar ? { cssVar } : { arg: arg ?? "" },
    ...present({
      label: textOf(value.label),
      max: numberOf(value.max),
      min: numberOf(value.min),
      options: textsOf(value.options),
      step: numberOf(value.step),
      unit: textOf(value.unit),
    }),
  };
};

const edgeOf = (value: unknown): CanvasEdge | undefined => {
  if (!isRecord(value)) {
    return;
  }
  const from = textOf(value.from);
  const to = textOf(value.to);
  return from && to
    ? { from, to, ...present({ label: textOf(value.label) }) }
    : undefined;
};

/** `value`, the JSON a {@link CanvasSpec} was written as, read back: what of it is a spec's. */
export const canvasSpecOf = (value: unknown): CanvasSpec => {
  if (!isRecord(value)) {
    return {};
  }
  const group = isRecord(value.group)
    ? Object.fromEntries(
        Object.entries(value.group).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      )
    : undefined;
  return present({
    dials: Array.isArray(value.dials)
      ? value.dials.flatMap((one) => dialOf(one) ?? [])
      : undefined,
    edges: Array.isArray(value.edges)
      ? value.edges.flatMap((one) => edgeOf(one) ?? [])
      : undefined,
    group,
    name: textOf(value.name),
  });
};

/** `value`, the JSON the stage wrote each states file's {@link SectionPlan} as, read back by file. */
export const sectionPlansOf = (value: unknown): Record<string, SectionPlan> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([file, plan]) => {
          if (!(isRecord(plan) && Array.isArray(plan.stories))) {
            return [];
          }
          const name = textOf(plan.name);
          const stories = plan.stories.flatMap((story) => {
            const storyName = isRecord(story) ? textOf(story.name) : undefined;
            return isRecord(story) && storyName
              ? [
                  {
                    label: textOf(story.label) ?? null,
                    name: storyName,
                    width: numberOf(story.width) ?? null,
                  },
                ]
              : [];
          });
          return name === undefined ? [] : [[file, { name, stories }]];
        })
      )
    : {};

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

/**
 * The code a stage's refusal of a section carries when its states file isn't
 * there (Vite's `pluginCode`, which it sends the page with the error): the
 * canvas says the file isn't there yet, not that it doesn't compile.
 */
export const SECTION_MISSING = "cawco-section-missing";

/**
 * The stage's word to its pages (Vite's `hot.send`, a custom event) that a
 * states file a section found missing is written now, with its file from
 * the toolchain root: the page loads that section again. Vite has no module
 * of it to update, its load having failed.
 */
export const SECTION_WRITTEN = "cawco:section-written";

/** A CSF story file: `Who.stories.ts`, `Card.stories.tsx`, `Page.stories.js`. */
export const STORY_FILE = /\.stories\.[cm]?[jt]sx?$/u;

/**
 * Where a stage is: `starting` its first start, `waking` a start after
 * sleep, `live` serving, `error` it could not start or failed its restarts,
 * `asleep` stopped for want of a viewer, started again on the next open.
 */
export type StageStatus = "starting" | "waking" | "live" | "error" | "asleep";

/**
 * What a canvas's section can't draw for, as the stage host keeps it until
 * it clears: the canvas page's own failure kinds (stage-host canvas
 * runtime.ts `SectionFailure`). `missing`: the states file isn't there,
 * cleared once it is written. `compile`: a module the stage couldn't
 * compile, cleared once it compiles again. `page`: its module didn't load
 * in the page (an import that names an export its module lacks, a throw as
 * it ran), as the page posted it ({@link PostedReport} `unloaded`), cleared
 * once a page loads it or its section module is served again.
 */
export type StageErrorKind = "missing" | "compile" | "page";

/**
 * A section's problem as the stage host keeps it (its kind), and the doc's
 * `meta.stage.errors` carries it to the panel and the agent's read alike:
 * the file from the toolchain root (a missing states file, or the module
 * that doesn't compile), 1-based line and column when Vite's payload has
 * them, the stage's words (a missing file's) or Vite's message and code
 * frame, and the states files whose section it stops, which the hub files
 * it under.
 */
export interface StageError {
  column: number | null;
  file: string;
  frame: string | null;
  /** Always sent; optional on the wire, so an app built from this reads a hub from before it. */
  kind?: StageErrorKind;
  line: number | null;
  message: string;
  /** The states files (from the toolchain root) whose section it stops: a missing one itself, else each whose sheet imports the module. */
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
interface SheetMeta {
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

/**
 * The hub's word that a canvas's stage couldn't be reached by its last read
 * (the doc's `meta.unreached`, which the panel and the agent's read both
 * say): the hop that failed, in the preview proxy's kinds; why, in the hub's
 * words; and since when, the first read that failed since one that reached
 * it. A read that reaches the stage, or the daemon's next word of it, takes
 * it away.
 */
export interface StageUnreached {
  down: PreviewDown;
  since: string;
  why: string;
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
interface SheetStageState extends StageStateOf {
  runs: "sheet";
  toolchain: StageToolchain;
}

/** A workspace preview's server: the command its preview names (`serve`). */
interface ServerStageState extends StageStateOf {
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

/** A states file's sheet as its section's module carries it: its stories and meta, no props (those are read at {@link SHEET_PATH}). */
export type SectionSheet = Omit<SheetOnPage, "components">;
