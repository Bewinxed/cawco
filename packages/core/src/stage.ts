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
 */

/** Where a stage serves a sheet: `?file=<story file, from the Vite root>`. Outside the hub's own `/__cawco/`, after Vite's `/@vite/`. */
export const SHEET_PATH = "/@cawco/sheet";

/** Where the daemon reads a sheet's stories next to the stage; never through the hub. */
export const STORIES_PATH = "/__cawco/stories";

/** The stage's own answer that it serves; read every {@link STAGE_HEALTH_MS} by the daemon next to it. */
export const HEALTH_PATH = "/__cawco/health";

/** The daemon's control method that starts a workspace's stage or wakes it, and answers a sheet's stories. */
export const STAGE_ENSURE = "stageEnsure";

/** How long a stage has to answer once started. The spec's number. */
export const STAGE_READY_MS = 60_000;

/** How often the daemon asks a running stage whether it serves. The spec's number. */
export const STAGE_HEALTH_MS = 15_000;

/** How long a stage runs with no viewer and no agent read before it sleeps. The spec's number. */
export const STAGE_IDLE_MS = 30 * 60_000;

/** Starts a failed stage gets before it stays in `error`. The spec's number. */
export const STAGE_RESTARTS = 3;

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

/** One named export of a story file: a story, by its export's 1-based place. */
export interface Story {
  column: number;
  line: number;
  name: string;
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

/** The daemon's word on each change of a stage: every sheet of the workspace's that root hears it. */
export interface StageFrame {
  kind: "stage";
  state: StageState;
  workspace: string;
}

/** The daemon's answer to {@link STAGE_ENSURE}: the stage's port, root and state, and the sheet's stories. */
export interface StageOpened {
  /** The Vite root, from the clone's root. */
  dir: string;
  /** The sheet's story file, from the Vite root. */
  file: string;
  port: number;
  state: StageState;
  stories: Story[];
}
