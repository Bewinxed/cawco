/** What an artifact's preview shows and why it can't: its source, the failures its page names, and the daemon's preview verbs. */

/**
 * A preview's start page: a path on the previewed server, one leading slash
 * (never `//host`, which would leave it), no whitespace.
 */
export const PREVIEW_START_PATH = /^\/(?!\/)\S*$/u;

/**
 * What an artifact shows (Projects spec §5.10): a dev server or a folder on
 * the session's machine (a preview), or a page the hub built and keeps under
 * its data dir at `artifacts/<id>/` and serves itself, named by the page's
 * name. A dev server or folder may name `path`, the page inside it the
 * preview opens at (`/motion/updates`); the root when absent.
 */
export type PreviewSource =
  | {
      port: number;
      path?: string;
      /**
       * A sheet's: the workspace's stage serves the port (core `stage.ts`),
       * its toolchain root `dir` from the clone's root and the sheet's story file
       * `file` from that root. A request for it wakes the stage when it sleeps.
       */
      stage?: { dir: string; file: string };
      /**
       * A workspace preview's server (core `stage.ts` {@link ServeSpec}): the
       * command the workspace's stage runs and keeps up on `port`, in `cwd`
       * from the clone's root. A request for it wakes it when it sleeps.
       */
      serve?: { command: string; cwd: string };
      /** The workspace whose dev server it is: it runs in that workspace's own network. */
      workspace?: string;
    }
  | { dir: string; path?: string }
  | { page: string };

/** Every reason a preview's page can say it can't be drawn ({@link PreviewDown}). */
export const PREVIEW_DOWNS = [
  "server",
  "machine",
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
 * away. `workspace`: the port is a workspace's, and no boundary of that
 * workspace runs, so nothing in its network can answer. `reach`: the
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
export const PREVIEW_START = "previewStart";
export const PREVIEW_STOP = "previewStop";
/** The daemon's control method that weighs a folder preview's folder on its machine (core preview-proxy `folderWeight`). */
export const PREVIEW_WEIGHT = "previewWeight";
/**
 * The daemon's control method that reads whether folder previews' folders
 * are still on its machine: a `realpath` and a `stat` each, no listener and
 * no process. Answers, per folder in the order asked, core preview-proxy
 * `folderGone`'s words for one that isn't there, or null.
 */
export const PREVIEW_FOLDERS = "previewFolders";
