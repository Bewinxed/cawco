/**
 * Live components (Projects spec D29, `2026-10-16-live-components.md`): a
 * component exists once, as the project's real file, and a sheet is a CSF 3
 * story file beside it (`Who.stories.ts`). One stage per workspace's Vite
 * root runs the project's own dev toolchain inside the workspace's boundary
 * with CawCo's plugin added (agent `stage.ts`, `stage-host/`), and serves the
 * sheet at {@link SHEET_PATH}; the hub shows it as a `sheet` artifact through
 * the workspace's port preview. These are the shapes every hop speaks: the
 * daemon's answer to {@link STAGE_ENSURE}, the {@link StageFrame} it sends on
 * each change, and the state the hub keeps in the sheet's doc (`meta.stage`).
 * A workspace preview's server ({@link ServeSpec}) runs on the same
 * supervision, and its preview's doc keeps its state the same way.
 */

/** Where a stage serves a sheet: `?file=<story file, from the Vite root>`. Outside the hub's own `/__cawco/`, after Vite's `/@vite/`. */
export const SHEET_PATH = "/@cawco/sheet";

/** Where the daemon reads a sheet's stories next to the stage; never through the hub. */
export const STORIES_PATH = "/__cawco/stories";

/** Where the daemon writes a story's args into its file (`POST`, a {@link SheetWrite}), next to the stage: under the hub's own prefix, so no preview reaches it. */
export const WRITE_PATH = "/__cawco/write";

/** Where the daemon reads the stage's components (§6's discovery), next to the stage. */
export const COMPONENTS_PATH = "/__cawco/components";

/** The daemon's control method that writes a sheet's story file through its stage ({@link SheetWrite}). */
export const STAGE_WRITE = "stageWrite";

/** The daemon's control method that lists a Vite root's components through its stage. */
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
 * until the module compiles again: the module's file from the Vite root,
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
  /** The story files (from the Vite root) whose sheet imports the module. */
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
  /** The story's own component, from the Vite root, when it names one apart from the meta's. */
  component: string | null;
  line: number;
  name: string;
}

/** What a story file's default export says every story shares: its args, and the component each mounts unless it names its own. */
export interface SheetMeta {
  args: Record<string, unknown>;
  code: Record<string, string>;
  /** The component, from the Vite root; null when the meta names none the stage could resolve. */
  component: string | null;
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
  /** From the Vite root. */
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
 * A stage as the hub keeps it in each of its sheets' docs (`meta.stage`):
 * where it is, the Vite root it runs (from the clone's root), why it failed
 * when it did, and the compile errors standing now.
 */
export interface StageState {
  at: string;
  /** The Vite root, from the clone's root ("." for the root itself). */
  dir: string;
  errors: StageError[];
  /** Why it is in `error`, one sentence; none otherwise. */
  message?: string;
  status: StageStatus;
}

/** The daemon's word on each change of a stage: every artifact of the workspace's that previews its port hears it. */
export interface StageFrame {
  kind: "stage";
  /** The port it serves on, in the workspace's network: a sheet's stage's or a preview's server's. */
  port: number;
  state: StageState;
  workspace: string;
}

/** The daemon's answer to {@link STAGE_ENSURE}: the stage's port, root and state, and the sheet as it reads. */
export interface StageOpened {
  /** The Vite root, from the clone's root. */
  dir: string;
  /** The sheet's story file, from the Vite root. */
  file: string;
  port: number;
  sheet: SheetRead;
  state: StageState;
}

/**
 * What the sheet's page tells the pane on each run and each props refresh
 * (`cawco:sheet`, through the overlay): the sheet as the stage read it.
 */
export interface SheetOnPage extends SheetRead {
  file: string;
}
