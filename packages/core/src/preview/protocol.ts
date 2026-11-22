/** What an artifact's preview shows and why it can't: its source, the failures its page names, and the daemon's preview verbs. */

/**
 * A preview's start page: a path on the previewed server, one leading slash
 * (never `//host`, which would leave it), no whitespace.
 */
export const PREVIEW_START_PATH = /^\/(?!\/)\S*$/u;

/**
 * What an artifact shows (Projects spec §5.10): a dev server on the
 * session's machine, a folder of files the hub keeps (each a preview), or a
 * page the hub built and keeps under its data dir at `artifacts/<id>/` and
 * serves itself, named by the page's name. A dev server or folder may name
 * `path`, the page inside it the preview opens at (`/motion/updates`); the
 * root when absent.
 */
export type PreviewSource =
  | {
      port: number;
      path?: string;
      /**
       * A sheet's: the workspace's stage serves the port (core `stage.ts`),
       * its toolchain root `dir` from the clone's root and the sheet's story file
       * `file` from that root. A request for it wakes the stage when it sleeps.
       * The person is served the workspace's stage live: every save reaches
       * the open panel through Vite's HMR.
       */
      stage?: { dir: string; file: string };
      /**
       * A preview's server (core `stage.ts` {@link ServeSpec}): the command
       * the stage of `workspace` runs and keeps up on `port`, in `cwd` from
       * its tree's root. A request for it wakes it when it sleeps. Every
       * port preview made since 2026-11-22 names it; one without it is a
       * port its session kept up by hand, which nothing starts again. The
       * person is served that one server live, as its author runs it: an
       * edit to its tree reaches the open preview through the dev server's
       * own reload (the owner's pick on 2026-11-22, "The agent's live
       * app").
       */
      serve?: { command: string; cwd: string };
      /**
       * The workspace whose dev server it is, or for a session in no
       * workspace the place it is staged from (core workspace-id.ts
       * `place`): a sheet's over its session's folder, a served preview's
       * over its app's folder's repository, or that folder in none (hub
       * artifact-events.ts `placeFor`). It runs in that tree's own network:
       * a workspace's clone, or a place's stage clone kept in step with its
       * folder (agent stage-clone.ts).
       */
      workspace?: string;
    }
  | {
      /**
       * A folder preview's: the folder its files were read from on the
       * row's machine, at its create or its last `artifact_update`. The hub
       * keeps those files with the artifact (hub artifacts/preview-folder.ts,
       * `artifacts/<id>/folder/`) and serves them itself, as they are, on
       * the artifact's own origin: they outlive the agent's folder, and an
       * update writes them over in place (the owner's pick on 2026-11-20,
       * "one way of serving").
       */
      dir: string;
      path?: string;
    }
  | { page: string };

/** Every reason a preview's page can say it can't be drawn ({@link PreviewDown}). */
export const PREVIEW_DOWNS = [
  "server",
  "machine",
  "hub",
  "workspace",
  "reach",
  "closed",
  "gone",
  "error",
  "crashed",
] as const;
/**
 * A preview whose page nothing serves: the hop that did not answer, as the
 * proxy's own page names it in a `<meta name="cawco-preview-down">` (core
 * `preview-proxy` `downResponse`), so the pane beside the conversation can
 * draw what happened instead of the proxy's page. `server`: the dev server
 * on the session's machine is not answering its port, or the server CawCo
 * runs for it (a sheet's stage, a served preview's command) didn't start,
 * the stage's words for why in {@link PREVIEW_WHY_META}. `machine`: the
 * machine's preview listener is not answering the hub, or the machine is
 * away. `hub`: the hub's own preview server could not reach the hub for
 * what only the hub answers (an entry, an artifact's doc and its Send, a
 * page's store), so nothing on the session's machine is at fault.
 * `workspace`: the port is a workspace's, and no boundary of that workspace
 * runs, so nothing in its network can answer. `reach`: the
 * machine could not open the way to the server (its listener did not start,
 * or the bridge into the workspace's network did not open); the page names
 * why in {@link PREVIEW_WHY_META}. `closed`: the session shows no preview
 * now (it was closed, or the session ended). `gone`: the workspace that
 * served it is not on its machine any more (archived, discarded), so this
 * version of it can't be shown again; only its session making it again
 * brings it back. `error`: every hop answered, and the page's server
 * answered its load with an error status and nothing the browser can draw
 * (a route that isn't there any more answering an empty 404, a plain-text
 * 500); an HTML error page is the page, served as one: the machine's listener
 * answers the load with its own page in place of the server's (agent
 * preview.ts), the status and the error's first line as its why
 * (`errorLineOf`), never the browser's own error face. `crashed`: the page
 * loaded, but a script of its threw before its load and it shows nothing:
 * its overlay names it, the thrown message as its why (@cawco/preview
 * overlay embeds.ts `tellDrawn`).
 */
export type PreviewDown = (typeof PREVIEW_DOWNS)[number];

/**
 * The hops the hub knows are down from its own records, before any frame
 * loads (hub preview-unavailable.ts): the preview's machine away or paused
 * (`machine`), an unrecorded port preview's workspace retired, so nothing
 * runs its server (`workspace`), the artifact no longer held (`closed`), and
 * a version that can't come back (`gone`: its workspace retired with nothing
 * to cut it again from, or a folder preview's files lost). Every other hop
 * is the proxy's to say, from a frame's load.
 */
export const HUB_DOWNS = [
  "machine",
  "workspace",
  "closed",
  "gone",
] as const satisfies readonly PreviewDown[];
export type HubDown = (typeof HUB_DOWNS)[number];

/**
 * Why the hub knows a preview can't be shown now ({@link HUB_DOWNS}), on
 * every record a surface frames it from (core frames.ts `PreviewFrame`, a
 * decision page's media `DecisionMedia`): the surface draws it (dashboard
 * FrameDown.svelte, core words `downState`) and loads no frame. Absent from
 * a record while the hub knows nothing in its way; the record is told again
 * as that moves.
 */
export interface PreviewUnavailable {
  down: HubDown;
  /** The machine that serves it, by its label: `downState`'s machine name (`named`). Absent where the hub has no name for it. */
  machine?: string;
  /** The hub's own words for why: `gone`'s reason line, any other's Show details. */
  why: string | null;
}

/** A machine's refusal of a preview's start that names the hop that is down: its kind travels beside its words (core frames.ts `ControlRefusal`). */
export class PreviewStartDown extends Error {
  readonly down: PreviewDown;
  constructor(down: PreviewDown, message: string) {
    super(message);
    this.down = down;
  }
}
export const PREVIEW_DOWN_META = "cawco-preview-down";
/** The machine's own words for a `reach` or `server` failure, on the proxy's page beside {@link PREVIEW_DOWN_META}. */
export const PREVIEW_WHY_META = "cawco-preview-why";

/**
 * Why a view could not put an artifact on screen, as it tells the hub
 * (`POST /api/instances/:id/artifacts/:artifact/shown`): a hop that did not
 * answer ({@link PreviewDown}), or `page`: something answered, but with no
 * page the panel can show (no CawCo overlay said it was ready).
 */
export const SHOWN_FAILURES = [...PREVIEW_DOWNS, "page"] as const;
export type ShownFailure = (typeof SHOWN_FAILURES)[number];

export interface PreviewElement {
  classes: string[];
  html: string;
  id: string;
  page: { x: number; y: number };
  rect: { x: number; y: number; width: number; height: number };
  selector: string;
  source: {
    file: string | null;
    line: number | null;
    column: number | null;
    framework: "svelte" | "code-inspector" | "react" | "vue";
    of: "self" | `ancestor:${string}`;
    component?: string;
  } | null;
  styles: Record<
    | "color"
    | "backgroundColor"
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "lineHeight"
    | "display"
    | "position"
    | "padding"
    | "margin"
    | "borderRadius",
    string
  >;
  tag: string;
  text: string;
  url: string;
}
/** What a folder preview loads at most: its files, their bytes, and of those its JavaScript's and its WebAssembly's; and its start page's desk captures (core `deskCaptures`), weighed by the hub from the files it keeps (hub artifacts/preview-folder.ts `folderWeight`). */
export interface FolderWeight {
  bytes: number;
  /** `<img>` on the start page whose file is wider than `DESK_CAPTURE_WIDTH`. */
  captures: number;
  files: number;
  js: number;
  wasm: number;
}

/** What {@link PREVIEW_START} answers: the port the preview's server listens on, on its machine. */
export interface PreviewStarted {
  port: number;
}

export const PREVIEW_START = "previewStart";
export const PREVIEW_STOP = "previewStop";

/** What {@link PREVIEW_STOP} is asked: the start it ends, by the hub's name for it and, for that one start alone, its token. */
export interface PreviewStopArgs {
  instanceId: string;
  token?: string;
}
