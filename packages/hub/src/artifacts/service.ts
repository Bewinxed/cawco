/**
 * Artifacts (Projects spec §5.10): what the six tools and the panel do to
 * them. A session makes an artifact with `artifact_create`, changes it with
 * `artifact_update`, reads it with `artifact_read`, brings it to the front
 * of its panel with `artifact_show`, in a project keeps it in the
 * project's folder with `artifact_promote`, and removes one it superseded
 * with `artifact_delete`; the person's picks, notes and values
 * live in the artifact's doc (docs.ts). They are never the person's words in
 * the session: when the person sends their picks, the session hears that the
 * artifact has new responses ({@link ArtifactServiceDeps.signal}) and reads
 * them itself with `artifact_read`. The person's pins, replies, resolves and
 * ink go by themselves: once they have been quiet {@link MARKS_QUIET_MS},
 * the burst is delivered as one message carrying them
 * ({@link ArtifactServiceDeps.deliverMarks}).
 */
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import {
  type AgentRow,
  ARTIFACT_NAME,
  type ArtifactChoices,
  type ArtifactDoes,
  type ArtifactHit,
  type ArtifactKind,
  type ArtifactPromotion,
  type ArtifactSummary,
  type ArtifactThumbnail,
  ASK_BANNED,
  ASK_PATHLIKE,
  artifactCommentsNotice,
  artifactErrorsNotice,
  artifactSavesNotice,
  type ChoiceEntry,
  choiceEntryProblem,
  DESK_CAPTURE_WIDTH,
  DESK_CAPTURES_PER_PAGE,
  type InstanceRow,
  machineLabel,
  noteText,
  type PreviewAddress,
  type PreviewSource,
  type ShownFailure,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import {
  CANVAS_LIMITS,
  canvasOutline,
  excalidrawFile,
  NO_SCREEN,
} from "@cawco/core/canvas";
import { dataUrlBytes, deskCaptures } from "@cawco/core/captures";
import {
  COMMENT_LIMITS,
  inkSection,
  type MarkPictures,
  type Pin,
  pinDelivery,
  pinHeard,
  pinReady,
  pinSaid,
  pinUnsent,
  type SendBody,
  type ThreadEntry,
} from "@cawco/core/comments";
import {
  type DecisionCard,
  type GraphLinks,
  type GraphPlace,
  PLACES_KEY,
  pickOf,
} from "@cawco/core/decisions";
import {
  excerptOf,
  field,
  KIND_WORDS,
  matchOf,
  parse,
} from "@cawco/core/find-match";
import type { InkGroup } from "@cawco/core/ink";
import { type FolderWeight, pageHash } from "@cawco/core/preview-proxy";
import {
  type CanvasDial,
  type CanvasEdge,
  type CanvasMap,
  type CanvasMapNode,
  type CanvasSpec,
  canvasOf,
  canvasPath,
  type DesignLink,
  type DesignMap,
  type DesignQuery,
  type RenderReport,
  type ServeSpec,
  type SheetRead,
  type SheetWeight,
  type SheetWrite,
  type SheetWritten,
  type StageError,
  type StageFrame,
  type StageOpened,
  type StageState,
  type StoryOp,
} from "@cawco/core/stage";
import { writeStateFileSync } from "@cawco/core/state-file";
import { applyPatch, type Operation } from "rfc6902";
import type { Doc, YMapEvent } from "yjs";
import type { ArtifactRow, ArtifactsDb } from "../db/artifacts";
import {
  type BuiltProgram,
  mergeProgram,
  PROGRAM_FILE,
  ProgramRefusal,
  readKept,
  type StatementChange,
} from "../decision-program";
import type { AskedArtifact } from "../design-verify";
import { sessionLabel } from "../labels";
import type { HubLifetimeShape, HubTimer } from "../lifetime";
import {
  changeFolderFiles,
  FolderRefusal,
  folderFileNames,
  folderPath,
} from "../project-folder";
import {
  canvasEntries,
  convertOnScreen,
  deleteElements,
  screenJoined,
} from "./canvas";
import {
  type CanvasInput,
  COMPONENT_EXAMPLE,
  CREATE_SHAPE,
  canvasProblem,
  errorsSaid,
  movesSaid,
  READ_HINT,
  renderSaid,
  type StateAsk,
  specOf,
  stateSaid,
  storiesSaid,
  unseen,
  weightSaid,
} from "./component";
import type { ArtifactDocs } from "./docs";
import { picturePath, thumbnailPath } from "./sync";

export class ArtifactRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 422 | 503 | 504;
  constructor(
    status: 400 | 403 | 404 | 409 | 413 | 422 | 503 | 504,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.status = status;
  }
}

/** A program the hub can't keep, refused as the artifact's (decision-program.ts). */
const refusedProgram = (error: ProgramRefusal): ArtifactRefusal =>
  new ArtifactRefusal(error.status, error.message, { cause: error });

/** Statements lang-core could not merge into the program: nothing was changed. */
const unmerged = (error: unknown): ArtifactRefusal =>
  new ArtifactRefusal(
    422,
    `The statements did not merge: ${error instanceof Error ? error.message : String(error)}. Nothing was changed.`,
    { cause: error }
  );

/**
 * What a create or a re-create names: a page from `html` or `dir`, a
 * preview of `port` or `dir` on `machine`, opened at `path`, or a canvas
 * drawn from skeleton `elements` or `mermaid`; each kind's fields only.
 */
export interface ArtifactInput {
  /**
   * The panel head's one line under its name: what the person does here,
   * in their words (core `ASK_LIMIT`). Every create names it but the
   * person's own composer canvas (`draft`), which asks them nothing.
   */
  ask?: string | undefined;
  /** A component canvas's dials: a CSS variable on every frame, or an arg. */
  dials?: CanvasDial[] | undefined;
  dir?: string | undefined;
  /** What the person does on it (core `ARTIFACT_DOES`); named with `ask`. */
  does?: ArtifactDoes | undefined;
  /**
   * A canvas the person opened in the composer (a pen's swipe, Draw, ⌘⇧D,
   * the panel's +): always a new one, `meta.draft` until its first send,
   * and not shown in the panel by being made.
   */
  draft?: boolean | undefined;
  /** A component canvas's layout edges between frames, by story. */
  edges?: CanvasEdge[] | undefined;
  /** A canvas's skeleton elements (Excalidraw's `convertToExcalidrawElements`). */
  elements?: SkeletonElement[] | undefined;
  /** A component canvas's states file (or files, one section each), from the session's clone's root or absolute. */
  file?: string | string[] | undefined;
  /** A component canvas's groups: story → the parent story or heading it stands under. */
  group?: Record<string, string> | undefined;
  html?: string | undefined;
  /** A browser artifact is the hub's alone (browsers.ts): no session makes one. */
  kind: Exclude<ArtifactKind, "browser">;
  machine?: string | undefined;
  /** A canvas's Mermaid diagram. */
  mermaid?: string | undefined;
  name: string;
  path?: string | undefined;
  port?: number | undefined;
  /** A decision page's OpenUI Lang program over the decision library (decision-program.ts). */
  program?: string | undefined;
  /**
   * What serves a workspace's port (core `ServeSpec`): the command the
   * workspace's stage runs and keeps up on `port`, in `cwd` from the clone's
   * root. A preview of a port in a workspace names it.
   */
  serve?: { command: string; cwd?: string | undefined } | undefined;
  /**
   * `parent`: a delegate hands it to its parent, readied and not opened.
   * The parent owns it (its panel, its list, the person's picks and pins on
   * it), is told once per hand-off and opens it itself with artifact_show;
   * the delegate stays its maker ({@link ArtifactRow.madeBy}).
   */
  to?: "parent" | undefined;
  /**
   * The workspace whose dev server a port is: the caller's own, or one of its
   * delegates'. Omitted, the caller's own when it runs in one, unless
   * `machine` names the host the port is on.
   */
  workspace?: string | undefined;
}

/** What says where an artifact is served from, before it has a row or with one. */
type Placed = Pick<ArtifactRow, "kind" | "machineId" | "name" | "source">;

/** The hub machine's headless screen on one canvas ({@link ArtifactServiceDeps.screen}). */
export interface CanvasScreen {
  /** Keeps it open through another write. */
  hold: () => void;
  /** Lets it go. */
  release: () => void;
}

/** Whose panel a create puts the artifact in (`owner`), and whose call it was (`maker`): one session, or a delegate and its parent. */
interface Making {
  maker: InstanceRow;
  owner: InstanceRow;
}

/** A skeleton element as the agent writes it: a type, an optional id, and Excalidraw's own fields. */
export type SkeletonElement = { id?: string; type: string } & Record<
  string,
  unknown
>;

/** What `artifact_update` changes on a canvas: exactly one of these. */
export type CanvasChange =
  { elements: SkeletonElement[] } | { delete: string[] } | { mermaid: string };

/**
 * What `artifact_update` changes on a page: exactly one of these. A
 * decision page's `statements` are merged into its program by name.
 */
export type PageChange =
  { html: string } | { patch: Operation[] } | { statements: string };

/** What `artifact_update` and the inspector's Save change on a sheet: one story's args, or one story op. */
export type SheetChange =
  | {
      args: {
        story: string;
        unset?: string[];
        values: Record<string, unknown>;
      };
    }
  | { story: StoryOp };

/** The fields each kind takes, and what its refusal says it takes. */
const KIND_FIELDS = {
  page: { fields: ["program", "html", "dir"], takes: "program, html or dir" },
  preview: {
    fields: ["port", "dir", "path", "machine", "workspace", "serve"],
    takes: "port or dir",
  },
  canvas: { fields: ["elements", "mermaid"], takes: "elements or mermaid" },
  component: { fields: ["file"], takes: "file" },
} as const;

const INPUT_FIELDS = [
  "program",
  "html",
  "file",
  "dir",
  "port",
  "path",
  "machine",
  "workspace",
  "serve",
  "elements",
  "mermaid",
] as const;

const strayFields = (input: ArtifactInput): string | null => {
  const own: readonly string[] = KIND_FIELDS[input.kind].fields;
  const stray = INPUT_FIELDS.filter(
    (key) => input[key] !== undefined && !own.includes(key)
  );
  if (stray.length === 0) {
    return null;
  }
  return `A ${input.kind} takes ${KIND_FIELDS[input.kind].takes}; ${stray.join(", ")} ${stray.length === 1 ? "is" : "are"} not for a ${input.kind}.`;
};

/** Why a preview's fields do not go together, or nothing. */
const previewProblem = (input: ArtifactInput): string | null => {
  if ((input.port === undefined) === (input.dir === undefined)) {
    return "A preview takes exactly one of port or dir.";
  }
  if (input.port === undefined && input.workspace !== undefined) {
    return "workspace goes with a port, not a dir.";
  }
  if (input.machine !== undefined && input.workspace !== undefined) {
    return "A workspace's port is on the workspace's machine: pass workspace for a workspace's server, or machine for a port on that machine's host.";
  }
  if (input.serve !== undefined && input.port === undefined) {
    return "serve goes with the port it serves on, not a dir.";
  }
  if (input.serve !== undefined && input.machine !== undefined) {
    return "serve runs in a workspace, and machine names a port on a machine's host outside one: pass serve with your workspace's port.";
  }
  return null;
};

/** Why an ask can't head the panel (checks 1 and 2): words the person never uses, or a file or path; null when it can. */
export const askProblem = (ask: string): string | null => {
  if (ASK_BANNED.test(ask)) {
    return 'The ask reaches the person: say what they do (pick, pin, try, draw) and to what, without "tap" or "poke".';
  }
  if (ASK_PATHLIKE.test(ask)) {
    return "The ask is in the person's words: no file, path or id in it. Name the thing as they call it.";
  }
  return null;
};

/** Why this kind can't deliver what `does` promises (checks 3, 4 and 4b), before anything is built; null when it can. */
const doesProblem = (
  input: ArtifactInput,
  does: ArtifactDoes
): string | null => {
  const { kind } = input;
  if (does === "pick" && kind !== "page") {
    return `A pick happens on a decision page: kind "page" with a program holding one Decision per question (decision-page skill). This ${kind} is an option's media: embed it with Canvas or Preview inside the Option.`;
  }
  const program = input.program !== undefined;
  if (
    does === "try" &&
    (kind === "component" || kind === "canvas" || (kind === "page" && program))
  ) {
    return `A try is a flow the person runs: a preview opened at its path, or a page with fields. A ${kind}${program ? " program" : ""} is judged or picked on, not tried.`;
  }
  if (does === "draw" && kind !== "canvas") {
    return 'A drawing is a canvas: kind "canvas", with elements, mermaid or nothing.';
  }
  return null;
};

/** A choice in a page's HTML: a kit choice, or a field the person fills. */
const HTML_CHOICE = /data-cawco-choice=|<(input|select|textarea)[^>]*\sname=/i;

/** Check 3b: a page for picking that holds no choice, once built. */
const NO_CHOICE =
  "A page for picking holds a choice: a Decision in its program, or a data-cawco-choice in its HTML. This one holds none.";

/** Check 5: a page for judging or picking that is a catalogue of desk captures. */
const capturesRefused = (n: number): string =>
  `${n} captures wider than ${DESK_CAPTURE_WIDTH}px on one page draw at a fraction of their size in the panel. Show one state at a time: a component canvas of the real component (does "judge"), or a decision page whose options embed them (does "pick").`;

/**
 * Why a preview of a workspace's port with nothing named to serve it is
 * refused: a server the agent starts in its own shell ends with that shell,
 * the command or the session, and the person is left with a dead preview.
 */
const NOT_SERVED =
  'A preview of a port in a workspace names what serves it: serve: { command, cwd }, like { "command": "bun run dev --port 5195", "cwd": "apps/web" }. CawCo runs it in the workspace and keeps it up for as long as the preview and the workspace last; a server started in your own shell ends with it.';

/** An entry as `artifact_read` answers it. */
type ReadEntry = ChoiceEntry & { earlierRevision?: true };

export interface ArtifactRead {
  /** A canvas's elements the person changed since `since` (or since your last read). */
  changed?: string[];
  /** A canvas's elements you replaced that the person had changed since your last read: "<id> changed under you". */
  changedUnderYou?: string[];
  /** Elements an update deleted, and the ids it named that the canvas does not hold. */
  deleted?: string[];
  /** A canvas the person opened in the composer and has not sent yet. */
  draft?: boolean;
  /** A sheet's write: the story file, from the clone's root, the 1-based lines it changed, and the formatter that shaped them. */
  edit?: {
    file: string;
    formatted?: string | null;
    lines: { from: number; to: number };
  };
  /** Your change waits as this next version: your parent had opened the artifact, and their panel keeps the version they opened until they call artifact_show. */
  held?: string;
  id: string;
  kind: ArtifactKind;
  missing?: string[];
  name: string;
  /** A canvas, as you read it: one line per element (core `canvasOutline`). */
  outline?: string;
  pageHash: string | null;
  /** When the canvas's latest picture was drawn; null when it has none. */
  pictureAt?: string | null;
  /** A canvas's latest picture, base64 PNG, when asked (`png: true`); null when it has none yet. */
  png?: string | null;
  /** A decision page's program as the hub keeps it, on a read without `since`: re-emit a statement from it to revise one. */
  program?: string;
  /** Keys that changed since `since` and are no longer there. */
  removed?: string[];
  revision: number;
  sentAt: string | null;
  /** What the page's `cawco.send(text)` sent with the person's last send. */
  sentText?: string;
  /** The cursor for the next read's `since`. */
  seq: number;
  /** A sheet as its stage reads it: its stories with their args, its meta, and each component's props. */
  sheet?: SheetRead;
  /** A sheet's stage: its status, and the compile errors standing in the modules the sheet imports. A served preview's: its server's status, and why it is in `error`. */
  stage?: StageState;
  /** Every key, or with `since` only those changed after it. */
  state: Record<string, ReadEntry>;
  /** A component canvas's design system round, as `verify: true` asked it: what the ask did. */
  verify?: string;
  /** What a sheet loads, from its stage's module graph; null until a view has loaded it. */
  weight?: SheetWeight | null;
  /** A port preview's workspace, whose dev server it is. */
  workspace?: string;
  /** The element ids an update wrote. */
  wrote?: string[];
}

/**
 * What a decision page's program leaves broken on the person's picks and
 * the project's graph, for its writer to put back or tell the person.
 * Each list only when it has something.
 */
export interface GraphBroken {
  /** Decisions it lacks (taken out, or never written) that another page comes after, with the `page#card`s that do: no edge is drawn for them. */
  after?: Record<string, string[]>;
  /** Options taken out that the person picked, by decision: the pick is kept, and its card says the option is gone. */
  options?: Record<string, string[]>;
  /** Decisions taken out that the person picked: the pick is kept, on no card. */
  picked?: string[];
  /** Its `after`s naming no decision of the project's: no edge is drawn for them. */
  unlinked?: string[];
}

/**
 * What a decision page's revision (`statements`) answers: what it changed,
 * not the page. The person's picks are read with `artifact_read`.
 */
export interface Revised {
  /** What it left broken on the picks and the graph; absent when nothing. */
  broken?: GraphBroken;
  /** Its decisions now, by id, in page order. */
  decisions: string[];
  /** Components the library does not have, dropped and never drawn. */
  dropped?: string[];
  /** Your change waits as this next version: your parent had opened the artifact, and their panel keeps the version they opened until they call artifact_show. */
  held?: string;
  id: string;
  /** Decisions the revision added or took out, by id; a removed one's pick is kept. */
  moved: { added: string[]; removed: string[] };
  pageHash: string;
  revision: number;
  /** Statements by name: new, rewritten, and dropped because nothing reaches them. */
  statements: StatementChange;
}

/** A decision page's choice, as the kit marks it (`data-cawco-choice="<id>"`). */
const CHOICE_ATTRIBUTE = /\bdata-cawco-choice="([^"]+)"/g;

/** One artifact as `artifact_list` answers it. */
export interface ArtifactStatus {
  /** Its line in the panel's head. */
  ask: string;
  /** What the person does on it. */
  does: ArtifactDoes;
  id: string;
  kind: ArtifactKind;
  /** The delegate that put it in this session's panel, when another session made it. */
  madeBy?: string;
  name: string;
  /** Whether the person has had its latest revision on screen. */
  opened: boolean;
  /** A decision page's choices: how many it asks, how many are picked, how many picks are not sent yet. */
  picks?: { asked: number; made: number; unsent: number };
  /** Picks the person sent that the session has not read. */
  picksAwaiting: number;
  /** Pins the person left open. */
  pins: number;
  /** The person pressed Send since your last change (a revision, or a new ask). */
  sent: boolean;
  /** The session that made it, when it is not the caller's own (a lead reading its project's). */
  session?: string;
  /** Whether its session's panel shows it now. */
  shown: boolean;
  /** The person's changes (picks, notes, drawn elements) since the session last read it. */
  unread: number;
  updatedAt: string;
  /** Whose move it is: the person's (shown and not opened since it changed, or a decision page's picks not made or not sent), the session's (sent picks, a canvas's changes unread, or handed to it or changed by a delegate and not opened yet). */
  waitingOn: ("person" | "session")[];
}

export interface Created {
  /** What a decision page's program left broken on the picks and the graph; absent when nothing. */
  broken?: GraphBroken;
  /** A decision page's decisions, by id, in page order. */
  decisions?: string[];
  /** Components a decision page's program names that the library does not have: dropped, never drawn. */
  dropped?: string[];
  /** A component canvas's compile errors, from the modules its states files import. */
  errors?: ReturnType<typeof errorsSaid>;
  /** Your change waits as this next version: your parent had opened the artifact, and their panel keeps the version they opened until they call artifact_show. */
  held?: string;
  /** A component canvas's next reads, one line. */
  hint?: string;
  /** Host mode's `name[:port]` beside `origin`: a bridge for readers before it (core `PreviewAddress`). */
  host?: string;
  id: string;
  kind: ArtifactKind;
  /** A component canvas's flow moves, each with the animations it fired. */
  moves?: ReturnType<typeof movesSaid>;
  name: string;
  /** A canvas made with nothing to draw says so. */
  note?: string;
  /** Whether a view the person is looking at has it on screen ({@link Opened}). */
  opened: boolean;
  /**
   * A draft canvas's: its session's preview origin (core `PreviewAddress`),
   * where a client loads the canvas at `/__cawco/canvas/<id>/`: its port on
   * the hub's host, and (host mode) a whole origin of its own too, which a
   * client picks by where it reached the hub (core `previewRoute`).
   */
  origin?: string;
  /** A canvas's outline once drawn (core `canvasOutline`). */
  outline?: string;
  port?: number;
  /** What a browser drew of a component canvas (the panel's, else the daemon's): each frame's state, and what it loads. */
  render?: ReturnType<typeof renderSaid> & {
    weight: ReturnType<typeof weightSaid>;
  };
  /** Its live document on the hub's preview listener. */
  route: string;
  /** A sheet as its stage reads it: its stories with their args, its meta, and each component's props. */
  sheet?: SheetRead;
  /** A sheet's stage, or a served preview's server, as it stands once started. */
  stage?: StageState;
  /** A draft canvas's origin on the tailnet name while the hub serves HTTPS there (core `PreviewAddress`). */
  tailnet?: PreviewAddress["tailnet"];
  /** A folder preview's: what it loads at most, from its folder's files. */
  weight?: FolderWeight;
  /** Why it is not on screen, one sentence; only with `opened: false`. */
  why?: string;
  /** The element ids a canvas's create wrote. */
  wrote?: string[];
}

/**
 * Whether a view the person is looking at has the artifact on screen: a
 * dashboard tab (or the app) showing the session heard the open frame,
 * mounted the pane and loaded the page, and said so ({@link Artifacts.shown})
 * within {@link SHOWN_WAIT_MS}; else why not, in one sentence.
 */
export type Opened = { opened: true } | { opened: false; why: string };

/** How long a show waits for a view to say it has the artifact on screen. The spec's number. */
export const SHOWN_WAIT_MS = 10_000;

/** No view of the session said it showed the artifact in time. WORDS.md's error formula. */
export const NO_VIEW =
  "No open dashboard is showing this session. The artifact is in the session's panel and opens when one is.";

/** Why a `to: "parent"` create opened nothing: the parent opens it. */
const HELD =
  "Handed to your parent, not opened: it opens in their panel when they call artifact_show.";

/** Why a maker's change opened nothing: the parent had opened the artifact, so the change waits as its next version ({@link holdNext}). */
const HELD_NEXT =
  "Your parent opened it, so this change waits as its next version: their panel keeps the version they opened until they call artifact_show.";

/** The doc meta key of an artifact handed to its parent and not opened since (service `handOver`). */
const HANDED = "handed";

/** A view's word that it has (or could not load) the artifact at `revision` (`POST …/artifacts/:artifact/shown`). */
export interface ShownAck {
  /** Which view: a dashboard tab's id, or the app's. */
  client: string;
  /** Why the page didn't load; only with `ok: false`. */
  error?: ShownFailure | undefined;
  ok: boolean;
  /** The open frame's revision the view loaded. */
  revision: string;
}

/**
 * What `comment_read` answers: each of the session's artifacts with pins
 * that match, the page's address the person last marked it at, and the time to
 * pass as the next `since`. A pin on ink carries the ink's box in the page.
 */
export interface CommentRead {
  artifacts: {
    /** The page's address the person last marked it at; its own route before any delivery. */
    address: string;
    id: string;
    kind: ArtifactKind;
    name: string;
    pins: (Pin & { inkBox?: InkGroup["page"] })[];
  }[];
  at: string;
}

/** A canvas's export: the `.excalidraw` file, its outline and its latest picture. */
export interface CanvasExport {
  file: ReturnType<typeof excalidrawFile>;
  /** Host mode's `name[:port]` beside `origin`: a bridge for readers before it (core `PreviewAddress`). */
  host?: string;
  /** Its session's preview origin, where the canvas's page stands (`Created.port` / `origin`). */
  origin?: string;
  outline: string;
  /** Base64 PNG; null until a screen has drawn one. */
  png: string | null;
  port?: number;
}

/** What `artifact_promote` answers: the project folder's commit, and the folder it wrote. */
export interface Promoted {
  commit: string;
  /** `artifacts/<name>/`, from the project folder's root. */
  path: string;
}

const PAGE_HIDDEN = /<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;
const PAGE_TAG = /<[^>]+>/g;
const PAGE_ENTITY = /&(amp|lt|gt|quot|#39|apos|nbsp);/g;
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};
const PAGE_SPACES = /\s+/g;

/** The words a page's reader sees: its HTML less scripts, styles and tags, its common entities read. */
export const pageText = (html: string): string =>
  html
    .replace(PAGE_HIDDEN, " ")
    .replace(PAGE_TAG, " ")
    .replace(PAGE_ENTITY, (_, name: string) => ENTITIES[name] ?? " ")
    .replace(PAGE_SPACES, " ")
    .trim();

/** A PNG's pixels, from its header's IHDR chunk; null when it is too short to say. */
export const pngSize = (
  png: Uint8Array
): { width: number; height: number } | null => {
  if (png.length < 24) {
    return null;
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

/** A thumbnail's most bytes in each scheme: the pane's capture of a page, as `previewPng` takes it. */
export const THUMBNAIL_BYTES = 3 * 1024 * 1024;

/** A promote from a session outside a project. WORDS.md's error formula. */
export const NO_PROJECT =
  "This session belongs to no project, so there is nowhere to promote to.";

/**
 * Every file a promote may write into `artifacts/<name>/`: one of these an
 * earlier promote wrote and this one does not (a picture since cleared) is
 * taken out in the same commit.
 */
const PROMOTED_FILES = [
  "artifact.json",
  "index.html",
  "state.json",
  "canvas.excalidraw",
  "outline.md",
  "preview.json",
  "pins.json",
  "ink.json",
  "picture.png",
] as const;
type PromotedFile = (typeof PROMOTED_FILES)[number];

/** `artifacts/<name>`, inside the project folder; refused for a name that would leave it. */
const promotedFolder = (name: string): string => {
  const folder = `artifacts/${name}`;
  if (!ARTIFACT_NAME.test(name) || folderPath(folder) !== folder) {
    throw new ArtifactRefusal(
      400,
      `${JSON.stringify(name)} would not stay inside artifacts/: a name is lowercase letters, digits and dashes.`
    );
  }
  return folder;
};

const TRAILING_DOT = /\.$/;

/** A promote git refused, in WORDS.md's error formula: what failed, and git's reason. */
const notCommitted = (name: string, error: FolderRefusal): ArtifactRefusal =>
  new ArtifactRefusal(
    error.status === 413 || error.status === 409 ? error.status : 503,
    `${name} could not be committed: ${error.message.replace(TRAILING_DOT, "")}.`,
    { cause: error }
  );

/** A promoted file's text: JSON, two-space indented, ending on a newline, as a repository keeps it. */
const promotedJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

const routeOf = (id: string) => `/__cawco/artifact/${id}`;

/** The doc's `state`, read as entries. */
const stateOf = (doc: Doc): Record<string, ChoiceEntry> =>
  doc.getMap("state").toJSON() as Record<string, ChoiceEntry>;

const metaOf = (doc: Doc) => {
  const meta = doc.getMap("meta");
  return {
    pageHash: (meta.get("pageHash") as string | null | undefined) ?? null,
    sentAt: (meta.get("sentAt") as string | null | undefined) ?? null,
  };
};

/** The words a page's `cawco.send(text)` sent with the person's last send; none when it sent none. */
const sentTextOf = (doc: Doc): string | null =>
  (doc.getMap("meta").get("sentText") as string | null | undefined) ?? null;

/** The page hash the newest entry was made on: a preview's, which the hub never built. */
const newestHash = (state: Record<string, ChoiceEntry>): string | null =>
  Object.values(state).sort((a, b) => b.at.localeCompare(a.at))[0]?.pageHash ??
  null;

const named = (row: Pick<ArtifactRow, "kind" | "name">) =>
  `the ${row.kind} "${row.name}"`;

/** The machine a hostname, its label or its id names. */
const machineNamed = (
  machines: Pick<AgentRow, "machineId" | "hostname">[],
  nameOrId: string
): string | undefined =>
  machines.find(
    (machine) =>
      machine.machineId === nameOrId ||
      machine.hostname === nameOrId ||
      machineLabel(machine.hostname) === nameOrId
  )?.machineId;

/**
 * The entries a patched `state` (`after`) makes of `before`: each changed key
 * whole, the fields the agent left out filled in (no note, no value, the
 * page it was made on), stamped `at`; refused whole at the first one out of
 * the bridge's bounds.
 */
const patchedEntries = (
  before: Record<string, ChoiceEntry>,
  after: Record<string, unknown>,
  hash: string,
  at: string
): Record<string, ChoiceEntry> => {
  const next: Record<string, ChoiceEntry> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(value) === JSON.stringify(before[key])) {
      continue;
    }
    const given = (value ?? {}) as Partial<ChoiceEntry>;
    const entry: ChoiceEntry = {
      options: given.options ?? [],
      note: noteText(given.note),
      value: given.value ?? null,
      pageHash: given.pageHash ?? before[key]?.pageHash ?? hash,
      at,
    };
    const problem = choiceEntryProblem(key, entry);
    if (problem) {
      throw new ArtifactRefusal(422, `${problem} Nothing was changed.`);
    }
    next[key] = entry;
  }
  return next;
};

/** What `artifact_update` answers for a component canvas's write: nothing past the story it wrote (component canvas §4, G2). */
export interface ComponentWritten {
  file: string;
  /** The project's formatter that shaped the lines, like "prettier 3.9.10"; null when the project has none. */
  formatted: string | null;
  lines: { from: number; to: number };
  render: ReturnType<typeof renderSaid>["frames"] | "unseen";
  story: { args: Record<string, unknown>; name: string } | null;
}

/** The story a story op names. */
const storyOfOp = (op: StoryOp): string | null => {
  if ("add" in op) {
    return op.add;
  }
  if ("duplicate" in op) {
    return op.as;
  }
  return "move" in op ? op.move : null;
};

/** How long a canvas just shown waits for the panel's page to draw it, and how often it looks. Ours: the page posts within a second of loading. */
const PANEL_DRAW_MS = 4000;
const PANEL_DRAW_POLL_MS = 500;

/** What `artifact_read` asks of a component canvas beyond its picks (component canvas §4). */
export interface ComponentReadAsk {
  /** `story`: one story's args and code too. */
  detail?: "summary" | "story";
  /** A picture: of `state`'s frame, else the canvas, drawn by the daemon. */
  png?: boolean;
  /** Draw it now on the daemon's Chromium and answer that report. */
  render?: boolean;
  /** One frame's delta from rest, its transitions and parts. */
  state?: StateAsk;
  story?: string;
  /** Ask the design system's verifier for a round on it; its findings come as a message. */
  verify?: boolean;
}

/** A sheet's place on its workspace's stage (core `PreviewSource`); null for any other artifact. */
const sheetOf = (
  row: ArtifactRow
): {
  dir: string;
  file: string;
  /** Every states file of the canvas, from the clone's root: a section each. */
  files: string[];
  spec: CanvasSpec;
  workspace: string;
} | null => {
  if (!(
    row.kind === "component" &&
    "port" in row.source &&
    row.source.stage &&
    row.source.workspace
  )) {
    return null;
  }
  const { stage } = row.source;
  const { files, spec } = canvasOf(row.source.path ?? "");
  return {
    ...stage,
    files: (files.length > 0 ? files : [stage.file]).map((one) =>
      join(stage.dir, one)
    ),
    spec,
    workspace: row.source.workspace,
  };
};

/** A workspace preview's server (core `ServeSpec`): its workspace and port; null for any other artifact. */
const servedOf = (
  row: Pick<ArtifactRow, "kind" | "source">
): { port: number; workspace: string } | null =>
  row.kind === "preview" &&
  "port" in row.source &&
  row.source.serve &&
  row.source.workspace
    ? { port: row.source.port, workspace: row.source.workspace }
    : null;

/** A workspace port's source: refused without what serves it ({@link NOT_SERVED}). */
const servedSource = (
  input: ArtifactInput,
  workspace: string
): PreviewSource => {
  if (!input.serve) {
    throw new ArtifactRefusal(400, NOT_SERVED);
  }
  return {
    port: input.port as number,
    ...(input.path === undefined ? {} : { path: input.path }),
    workspace,
    serve: {
      command: input.serve.command.trim(),
      cwd: input.serve.cwd?.trim() || ".",
    },
  };
};

/** A compile error as a delivery has heard it: the same error again is not news. */
const errorKey = (error: StageError): string =>
  `${error.file}:${error.line}:${error.column}:${error.message}`;

/** One compile error's part of a delivery: where, what Vite said, and its code frame. */
const errorSection = (error: StageError): string => {
  const at = `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}`;
  return [
    `## Compile error at ${at}`,
    `- ${error.message.split("\n")[0]}`,
    ...(error.frame ? ["```", error.frame, "```"] : []),
  ].join("\n");
};

/**
 * Who moved a session's panel: the person (a press in the panel, the artifact
 * menu, a pin's link, a page's Open to draw), or the agent through its tools.
 */
export type PanelHand = "person" | "agent";

/** What `artifact_delete` and the panel's Remove answer: what the session's panel shows now, or null for nothing. */
export interface Removed {
  showing: { id: string; kind: ArtifactKind; name: string } | null;
}

/**
 * How long the person's marks on an artifact (pins, replies, resolves, ink)
 * stay quiet before they go to the session: since the last one. A batch of
 * pins is written a pin every few seconds (a tap, a sentence, the next tap),
 * so 10 s of nothing reads as the batch done without leaving the session
 * waiting long for it. Our call.
 */
export const MARKS_QUIET_MS = 10_000;

/**
 * The longest a burst waits from its first mark: someone pinning steadily
 * for a minute is not held back past it. Our call.
 */
export const MARKS_LONGEST_MS = 60_000;

/** What a delivery of the person's marks carries: the words and the pictures. */
export interface MarksDelivery {
  images: { data: string; mediaType: string }[];
  /** The comments notice (core `artifactCommentsNotice`), its sections the marks themselves. */
  text: string;
}

/** Whether someone took a delivery of the marks; why not, when no one did. */
export type MarksOutcome = { ok: true } | { ok: false; reason: string };

/**
 * Where a stage runs: a session's own workspace (a sheet being made), or
 * the workspace a sheet was made in (every use after), whichever session's
 * panel it is in.
 */
export type StageAt = { session: InstanceRow } | { workspace: string };

/**
 * What a page is built from: a decision page's `program` (with the folder
 * its relative Image files are in, when it has one), inline `html`, a work
 * folder's page.oui or page.html (`dir`), or the project folder's
 * `decisions/<name>/`.
 */
export type PageFrom =
  | { program: string; dir?: string | undefined }
  | { html: string }
  | { dir: string }
  | { folder: true };

export interface ArtifactServiceDeps {
  /** Closes session `instanceId`'s panel: it shows nothing, and every view of it hears so. */
  close: (instanceId: string) => Promise<void>;
  db: ArtifactsDb;
  /**
   * Whether `workspaceId` holds a work item of the session's delegates: one it
   * delegated, or one of a project it leads (as `stop_delegate` decides).
   */
  delegatesIn: (instance: InstanceRow, workspaceId: string) => boolean;
  /**
   * Delivers the person's marks on `artifact` to the session that made it,
   * waking it as their own words do; to the project's Caw when that session
   * takes no input any more (server.ts `deliverMarks`).
   */
  deliverMarks: (
    instance: InstanceRow,
    artifact: ArtifactRow,
    delivery: MarksDelivery
  ) => Promise<MarksOutcome>;
  docs: ArtifactDocs;
  /** Whether a session has ended: it takes no input now, so its marks go to its project's Caw. */
  ended: (instance: InstanceRow) => boolean;
  /** What a folder preview of `dir` loads, weighed on machine `machineId`, and the desk captures on its start page at `path` (agent preview.ts `previewWeight`). Throws an {@link ArtifactRefusal} saying why it can't. */
  folderWeight: (
    machineId: string,
    dir: string,
    path: string | undefined
  ) => Promise<FolderWeight>;
  /**
   * What decision page `name` drawn with `cards` does to its project's
   * graph (decisions.ts `linksOf`): its `after`s naming no decision, and
   * its decisions other pages come after. Said to its writer.
   */
  graphLinks: (
    projectId: string,
    name: string,
    cards: DecisionCard[]
  ) => Promise<GraphLinks>;
  /**
   * Tells `parent` once that its delegate `maker` handed it `artifact`, not
   * opened, or changed it while its panel shows it, the change held as
   * `next` (core `artifactHandedNotice`), on the channel the person's picks
   * take (server.ts `handArtifactUp`).
   */
  handedUp: (
    parent: InstanceRow,
    maker: InstanceRow,
    artifact: ArtifactRow,
    next?: ArtifactRow
  ) => Promise<void>;
  instance: (id: string) => InstanceRow | undefined;
  /**
   * Page `name`'s source kept in `instance`'s project folder at
   * `decisions/<name>/`, as a build with `keep` keeps it: a held next
   * version's, once its parent opens it. Why not, when the folder refuses.
   */
  keepPage: (
    instance: InstanceRow,
    name: string,
    page: { html: string; program?: string }
  ) => Promise<
    { refused: string; status: ArtifactRefusal["status"] } | undefined
  >;
  /**
   * The projects session `instance` leads (their Caw): an ended writer's
   * marks are routed to him, and he answers them in their pins' threads.
   * He also reads every page of his project, so a page whose session ended
   * or is gone is his to act on (Projects spec §5.8, decisions.ts).
   */
  ledProjects: (instance: InstanceRow) => string[];
  /** The hub's lifetime: the marks' delivery and the shown acks' keep run on it. */
  lifetime: HubLifetimeShape;
  /**
   * The session's panel is listed: the browser it uses gets its artifact
   * there, made the first time (browsers.ts `listed`).
   */
  listing: (instance: InstanceRow) => void;
  /** The machines the hub knows. */
  machines: () => Pick<AgentRow, "machineId" | "hostname">[];
  /**
   * Publishes `artifact` to its session's panel at a fresh revision (the open
   * frame every view of the session hears); why not, when its server could
   * not be started. Whether a view put it on screen is that view's word
   * ({@link Artifacts.shown}). One the person opened is kept as what they
   * have in front ({@link ArtifactServiceDeps.personShown}).
   */
  open: (
    artifact: ArtifactRow,
    by: PanelHand
  ) => Promise<{ ok: true; revision: string } | { error: string; ok: false }>;
  /** The workspace a session runs in, by id; undefined outside one. */
  ownWorkspace: (instance: InstanceRow) => string | undefined;
  /**
   * A page's HTML built as the decision-page skill builds one: from inline
   * `html`, from `dir`'s page.html on the session's machine, or (neither) from
   * `decisions/<name>/page.html` in the session's project folder; written to
   * `decisions/<name>/` too when the session is in a project and `keep`.
   */
  page: (
    instance: InstanceRow,
    name: string,
    from: PageFrom,
    keep: boolean
  ) => Promise<
    | { html: string; program?: BuiltProgram }
    | { refused: string; status: ArtifactRefusal["status"] }
  >;
  /**
   * The artifact the person last opened in session `instanceId`'s panel
   * themselves, kept until the panel closes; undefined when they opened none
   * since. An agent's show never changes it.
   */
  personShown: (instanceId: string) => string | undefined;
  /**
   * Session `instanceId`'s preview origin (preview.ts), its listener started
   * when it has none; throws a refusal when every port is taken.
   */
  previewAddress: (instanceId: string) => PreviewAddress;
  /**
   * A preview no panel shows, loaded once through a listener of its own on
   * machine `machineId` as a pane's load would be, then let go: null when
   * its page answered, else the hop that didn't and the machine's words for
   * it. A preview handed to a parent is checked so before it reaches them.
   */
  reachable: (
    machineId: string,
    source: Exclude<PreviewSource, { page: string }>
  ) => Promise<{ failure: ShownFailure; why: string | null } | null>;
  /**
   * Every view of session `instanceId`'s panel hears its artifacts again on
   * the frame it follows (the panel's open frame, unchanged otherwise); none
   * when the panel shows nothing.
   */
  relist: (instanceId: string) => void;
  /**
   * An artifact was taken out: a preview it was no longer holds the
   * workspace it showed (work-items.ts `settleShown`).
   */
  removed?: (row: ArtifactRow) => void;
  /** Where artifacts' files are kept: a page's `<root>/<id>/index.html`, a canvas's `<root>/<id>/picture.png`. */
  root: string;
  /**
   * Canvas `artifact`'s host page opened in the Chromium of the hub's own
   * machine (agent canvas-screen.ts), told it is that canvas, its doc at
   * `sync`, where it joins the doc as a screen: what holds it on through a
   * write, and what lets it go. Throws an {@link ArtifactRefusal} saying why
   * when none can open.
   */
  screen: (artifact: ArtifactRow, sync: string) => Promise<CanvasScreen>;
  /**
   * What a send applies before the session hears it (setup.ts
   * `applySetupPicks`); a refusal throws and nothing is sent.
   */
  sending: (
    instance: InstanceRow,
    artifact: ArtifactRow,
    state: Record<string, ChoiceEntry>
  ) => Promise<void>;
  /**
   * A workspace preview's server (agent stage.ts `ensureServed`), started or
   * woken on the workspace's machine and waited on until its port answers:
   * its state. Throws an {@link ArtifactRefusal} saying why it didn't start.
   */
  serve: (
    machineId: string,
    workspace: string,
    serve: ServeSpec
  ) => Promise<StageState>;
  /** The artifact a session's panel shows now, if any. */
  showing: (instanceId: string) => string | undefined;
  /**
   * Tells the session the person sent their picks on `artifact`, which it
   * reads from `since` with `artifact_read` (core `artifactResponsesNotice`).
   * One the session has not read yet for the same artifact is superseded,
   * not added to: the session hears once, from the earliest `since` it was
   * not told of.
   */
  signal: (
    instance: InstanceRow,
    artifact: ArtifactRow,
    responses: { since: number }
  ) => Promise<void>;
  /**
   * The stage story file `file` runs on in a workspace (agent stage.ts
   * `ensureStage`), started or woken there and waited on: its port, root and
   * state, the sheet's stories, with the workspace and its machine. Throws
   * an {@link ArtifactRefusal} saying why it can't run.
   */
  stage: (
    at: StageAt,
    file: string,
    files?: string[]
  ) => Promise<{ machineId: string; opened: StageOpened; workspace: string }>;
  /** The design map of session `instance`'s workspace (agent stage.ts `stageComponents`): its components, paged, or one's card. */
  stageComponents: (at: StageAt, ask: DesignQuery) => Promise<DesignMap>;
  stageRender: (
    at: StageAt,
    ask: { files: string[]; png?: boolean; spec?: CanvasSpec; state?: StateAsk }
  ) => Promise<{ png?: string; report: RenderReport }>;
  /**
   * A write to a sheet's story file in its workspace, made by its stage
   * (agent stage.ts `writeSheet`): the lines it changed and the sheet after.
   * Throws an {@link ArtifactRefusal} saying why it can't.
   */
  stageWrite: (at: StageAt, write: SheetWrite) => Promise<SheetWritten>;
  /** Stops the server on `port` of workspace `workspace` (agent stage.ts `stopServed`): no artifact previews it any more. Never throws. */
  unserve: (machineId: string, workspace: string, port: number) => void;
  /**
   * A component canvas drawn by its workspace's daemon in the machine's own
   * Chromium (agent stage.ts `renderStage`): the stage's report once every
   * section drew, and a picture when asked.
   */
  /**
   * A design system round asked of a component canvas in a chat (hub
   * design-verify.ts `ask`): its verdict goes to `requester`. Answers what
   * the ask did, one sentence.
   */
  verify: (requester: InstanceRow, artifact: AskedArtifact) => Promise<string>;
  /** The workspaces an id or its prefix names, each with the machine it is on. */
  workspaces: (needle: string) => { id: string; machineId: string }[];
}

export const createArtifacts = (deps: ArtifactServiceDeps) => {
  const { db, docs } = deps;

  /**
   * Each artifact's kept thumbnail (`<root>/<id>/thumbnail.json` beside its
   * PNGs), read from its file once and kept here as it changes.
   */
  const thumbnails = new Map<string, ArtifactThumbnail | null>();
  const keptThumbnail = (id: string): ArtifactThumbnail | null => {
    if (!thumbnails.has(id)) {
      let kept: ArtifactThumbnail | null = null;
      try {
        kept = JSON.parse(
          readFileSync(thumbnailPath(deps.root, id, "json"), "utf8")
        ) as ArtifactThumbnail;
      } catch {
        kept = null;
      }
      thumbnails.set(id, kept);
    }
    return thumbnails.get(id) ?? null;
  };
  /** Each canvas's picture's size, by the moment it was drawn. */
  const pictureSizes = new Map<
    string,
    { at: string; width: number; height: number }
  >();
  /** A canvas's own picture, else the thumbnail a screen took. */
  const thumbnailOf = (row: ArtifactRow): ArtifactThumbnail | null => {
    if (row.kind !== "canvas") {
      return keptThumbnail(row.id);
    }
    const at = docs.doc(row.id).getMap("meta").get("pictureAt");
    if (typeof at !== "string") {
      return null;
    }
    let size = pictureSizes.get(row.id);
    if (size?.at !== at) {
      const png = pictureBytes(row.id);
      const read = png ? pngSize(png) : null;
      if (!read) {
        return null;
      }
      size = { at, ...read };
      pictureSizes.set(row.id, size);
    }
    return { at, single: true, width: size.width, height: size.height };
  };

  /**
   * Whether the person pressed Send since the session last changed it: the
   * doc's `meta.sentAt` newer than its `meta.revisedAt`, which every revision
   * and every new ask moves ({@link stampMeta}, {@link askNow}).
   */
  const sentOf = (row: ArtifactRow): boolean => {
    const meta = docs.doc(row.id).getMap("meta");
    const sentAt = meta.get("sentAt") as string | null | undefined;
    const revisedAt = meta.get("revisedAt") as string | undefined;
    return !!sentAt && (!revisedAt || sentAt > revisedAt);
  };

  const summaryOf = (row: ArtifactRow): ArtifactSummary => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    does: row.does,
    ask: row.ask,
    sent: sentOf(row),
    waiting: waitingOnPerson(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    shownAt: row.shownAt?.toISOString() ?? null,
    promoted:
      (docs.doc(row.id).getMap("meta").get("promoted") as
        ArtifactPromotion | undefined) ?? null,
    thumbnail: thumbnailOf(row),
  });

  /**
   * The words on an artifact's page, for Files' search: a page's text (its
   * HTML less its scripts, styles and tags), a canvas's outline; a preview
   * or a component has none of its own. Read once per change of the row.
   */
  const wordsKept = new Map<string, { at: number; words: string }>();
  const wordsOnPage = (row: ArtifactRow): string => {
    const at = row.updatedAt.getTime();
    const kept = wordsKept.get(row.id);
    if (kept?.at === at) {
      return kept.words;
    }
    let words = "";
    if (row.kind === "page") {
      try {
        words = pageText(
          readFileSync(join(deps.root, row.id, "index.html"), "utf8")
        );
      } catch {
        words = "";
      }
    } else if (row.kind === "canvas") {
      words = canvasOutline(
        canvasEntries(docs, row.id).map((entry) => entry.el)
      );
    }
    wordsKept.set(row.id, { at, words });
    return words;
  };

  const sessionOf = (id: string): InstanceRow => {
    const row = deps.instance(id);
    if (!row) {
      throw new ArtifactRefusal(404, "Session not found.");
    }
    return row;
  };

  /** The session's artifact `id`; refused when it is another session's or not there. */
  const own = (instance: InstanceRow, id: string): ArtifactRow => {
    const row = db.get(id);
    if (!row || row.instanceId !== instance.id) {
      throw new ArtifactRefusal(404, `This session has no artifact ${id}.`);
    }
    return row;
  };

  /**
   * Artifact `id`, when the session owns it or made it: a delegate goes on
   * updating and reading what it handed to its parent.
   */
  const ownedOrMade = (instance: InstanceRow, id: string): ArtifactRow => {
    const row = db.get(id);
    if (row?.madeBy === instance.id) {
      return row;
    }
    return own(instance, id);
  };

  /**
   * Page `id` of the session's own project, whoever wrote it: a later
   * session there, or its Caw, reads its program and revises it (a link is
   * an `after` on the dependent decision, Projects spec §5.8). Undefined for
   * a page of no project, another project's, or a held next version.
   */
  const projectPage = (
    instance: InstanceRow,
    id: string
  ): ArtifactRow | undefined => {
    const row = db.get(id);
    return row?.kind === "page" &&
      row.heldFor === null &&
      row.projectId !== null &&
      row.projectId === instance.projectId
      ? row
      : undefined;
  };

  /**
   * Whether the session's read of `row` counts as its owner's: the owner's
   * own, and a lead's of his project's pages, always have. Its maker's, and
   * another session's of the project, leave the owner's unread.
   */
  const readsForOwner = (instance: InstanceRow, row: ArtifactRow): boolean =>
    row.instanceId === instance.id ||
    (row.madeBy !== instance.id &&
      (answerable(instance).some((one) => one.id === row.id) ||
        ledPage(instance, row.id) !== undefined));

  /**
   * What an `artifact_read` of `id` reads: with no id, the session's
   * newest; one it made, else one it may read ({@link readable}). Its maker
   * reads what it changed: the next version held for its parent.
   */
  const readTarget = (
    instance: InstanceRow,
    id: string | undefined
  ): ArtifactRow => {
    const handed = id === undefined ? undefined : db.get(id);
    let row: ArtifactRow | undefined = handed;
    if (id === undefined) {
      [row] = db.ofInstance(instance.id);
    } else if (handed?.madeBy !== instance.id) {
      row = readable(instance, id);
    }
    if (!row) {
      throw new ArtifactRefusal(404, "This session has made no artifact yet.");
    }
    if (row.instanceId !== instance.id && row.madeBy === instance.id) {
      return db.heldOf(row.id) ?? row;
    }
    return row;
  };

  /** A decision page's program, for a whole read: a revision re-emits a statement of it. Nothing for any other artifact. */
  const programRead = (row: ArtifactRow): { program?: string } => {
    const program = programOf(row);
    return program === undefined ? {} : { program };
  };

  /** The session's newest artifact the panel can show: a draft canvas still in the composer is not one. */
  const nextNewest = (instance: InstanceRow): ArtifactRow | undefined =>
    db
      .ofInstance(instance.id)
      .find((other) => docs.doc(other.id).getMap("meta").get("draft") !== true);

  /** What the person last opened in the session's panel themselves, while the session still has it. */
  const personHad = (instance: InstanceRow): ArtifactRow | undefined => {
    const id = deps.personShown(instance.id);
    const row = id === undefined ? undefined : db.get(id);
    return row?.instanceId === instance.id ? row : undefined;
  };

  /**
   * Whose panel a create puts the artifact in: the caller's own, or with
   * `to: "parent"` the session that started it; refused for a session with
   * no parent, or one whose parent is gone.
   */
  const ownerFor = (maker: InstanceRow, input: ArtifactInput): InstanceRow => {
    if (input.to !== "parent") {
      return maker;
    }
    if (input.draft) {
      throw new ArtifactRefusal(
        400,
        "A draft canvas is the person's own: it goes to no parent."
      );
    }
    const parentId = maker.parentInstanceId;
    if (!parentId) {
      throw new ArtifactRefusal(
        409,
        'This session has no parent to put an artifact in front of: leave out to: "parent".'
      );
    }
    const parent = deps.instance(parentId);
    if (!parent) {
      throw new ArtifactRefusal(
        404,
        `Your parent session ${parentId.slice(0, 8)} is gone, so nothing was put in its panel.`
      );
    }
    return parent;
  };

  /**
   * Whether a create hands the artifact to its owner: a delegate's
   * `to: "parent"`, readied but never shown by the create, so the parent
   * reviews each revision its delegate makes before the person sees it.
   */
  const handing = ({ owner, maker }: Making): boolean => owner.id !== maker.id;

  /** Whether an artifact waits on its parent unopened ({@link handOver}). */
  const isHanded = (row: ArtifactRow): boolean =>
    docs.doc(row.id).getMap("meta").get(HANDED) === true;

  /**
   * Whether a maker's change to its parent's artifact `row` is held as its
   * next version ({@link holdNext}): once the parent (or the person) has
   * opened it, so it is no longer waiting on the parent as handed, every
   * change its maker makes waits for the parent's artifact_show, whether the
   * panel shows it now or the person can open it from the panel's list. Not
   * the owner's own change, nor a sheet's (its stage serves the workspace's
   * files live).
   */
  const holdsChange = (maker: InstanceRow, row: ArtifactRow): boolean =>
    row.instanceId !== maker.id &&
    row.kind !== "component" &&
    (db.heldOf(row.id) !== undefined || !isHanded(row));

  /**
   * Where a maker's change to its parent's artifact `row` goes when it
   * {@link holdsChange}: its next version, a hidden row of its own (`heldFor`)
   * made from it whole (its doc forked, its files copied), which no list
   * holds and nothing shows, so what the panel shows stays. One already held
   * takes every change after. `fresh` when this call made it; null when the
   * change is not held.
   */
  const holdNext = (
    maker: InstanceRow,
    row: ArtifactRow
  ): { fresh: boolean; next: ArtifactRow } | null => {
    if (!holdsChange(maker, row)) {
      return null;
    }
    const holding = db.heldOf(row.id);
    if (holding) {
      return { fresh: false, next: holding };
    }
    const now = new Date();
    const next = db.create({
      ...row,
      id: crypto.randomUUID(),
      heldFor: row.id,
      madeBy: maker.id,
      seq: 0,
      deliveredSeq: 0,
      readSeq: 0,
      openedRevision: null,
      createdAt: now,
      updatedAt: now,
      shownAt: null,
    });
    const folder = join(deps.root, row.id);
    if (existsSync(folder)) {
      cpSync(folder, join(deps.root, next.id), { recursive: true });
    }
    docs.fork(row.id, next.id);
    // Nothing shows it: a canvas's writes are drawn on the headless screen (draw).
    docs.transact(next.id, "hub", (doc) =>
      doc.getMap("meta").set(HANDED, true)
    );
    return { fresh: true, next };
  };

  /**
   * A change held as `held.next`, made by `ready`: the parent hears of it
   * once, when this change began the hold; a fresh one whose change threw
   * is let go, so nothing of it reaches them.
   */
  const heldOver = async (
    { maker, owner }: Making,
    row: ArtifactRow,
    holding: { fresh: boolean; next: ArtifactRow },
    ready: (() => Promise<void>) | undefined
  ): Promise<void> => {
    try {
      await ready?.();
    } catch (error) {
      if (holding.fresh) {
        discard(holding.next);
      }
      throw error;
    }
    if (holding.fresh) {
      await deps.handedUp(owner, maker, row, holding.next);
    }
  };

  /**
   * An update by artifact `row`'s owner or maker (`change`, given where it
   * goes): the maker's, while the parent's panel shows it, goes to its next
   * version ({@link holdNext}); anyone else's to the artifact itself.
   */
  const changedBy = async <T>(
    instance: InstanceRow,
    row: ArtifactRow,
    change: (target: ArtifactRow) => Promise<T>
  ): Promise<T> => {
    const holding = holdNext(instance, row);
    const owner = deps.instance(row.instanceId);
    if (!(holding && owner)) {
      return await change(row);
    }
    let result: T | undefined;
    await heldOver({ maker: instance, owner }, row, holding, async () => {
      result = await change(holding.next);
    });
    return result as T;
  };

  /** What an answer names of `row`: its artifact's id, and for a held next version its own as `held`. */
  const heldId = (row: ArtifactRow): { held?: string; id: string } =>
    row.heldFor === null ? { id: row.id } : { id: row.heldFor, held: row.id };

  /**
   * A create's show, and what readies the artifact after it (`ready`, a
   * canvas's drawing). The session's own artifact is shown in its panel,
   * then readied there. One handed to its parent ({@link handing}) is
   * marked {@link HANDED} and not shown, until the parent's own show opens
   * it; it is readied unopened, and only then is the parent told, once per
   * hand-off: when it wasn't waiting on them already, or came from another
   * delegate than the one it was waiting from. A `ready` that throws tells
   * the parent nothing and leaves its mark as it was. A re-create of one the
   * parent's panel shows is held (`held`, {@link heldOver}).
   */
  const handOver = async (
    making: Making,
    before: ArtifactRow | undefined,
    row: ArtifactRow,
    ready?: () => Promise<void>,
    holding?: { fresh: boolean; next: ArtifactRow } | null
  ): ReturnType<typeof show> => {
    if (!handing(making)) {
      const shown = await show(row, "agent");
      await ready?.();
      return shown;
    }
    if (holding && before) {
      await heldOver(making, before, holding, ready);
      return { opened: false, started: true, why: HELD_NEXT };
    }
    const was = isHanded(row);
    const waiting = was && before?.madeBy === making.maker.id;
    const meta = docs.doc(row.id).getMap("meta");
    docs.transact(row.id, "hub", () => meta.set(HANDED, true));
    try {
      await ready?.();
    } catch (error) {
      if (!was) {
        docs.transact(row.id, "hub", () => meta.delete(HANDED));
      }
      throw error;
    }
    if (!waiting) {
      await deps.handedUp(making.owner, making.maker, row);
    }
    return { opened: false, started: true, why: HELD };
  };

  /**
   * The artifacts whose pins a session answers: its own, and, for a
   * project's lead (Caw), those of every session of the project he leads,
   * whose ended writer's marks come to him. No other session's.
   */
  const answerable = (instance: InstanceRow): ArtifactRow[] => [
    ...db.ofInstance(instance.id),
    ...deps
      .ledProjects(instance)
      .flatMap((projectId) =>
        db
          .ofProject(projectId)
          .filter(
            (row) =>
              row.instanceId !== instance.id &&
              deps.instance(row.instanceId)?.projectId === projectId
          )
      ),
  ];

  /** Page `id`, when it belongs to a project `instance` leads. */
  const ledPage = (
    instance: InstanceRow,
    id: string
  ): ArtifactRow | undefined => {
    const row = db.get(id);
    return row?.kind === "page" &&
      row.projectId &&
      deps.ledProjects(instance).includes(row.projectId)
      ? row
      : undefined;
  };

  /**
   * Artifact `id`, when the session answers its pins ({@link answerable}),
   * or when it is a page of a project the session leads or works in
   * ({@link projectPage}), whatever became of its writer; refused when
   * none. A held next version is read by whoever
   * reads its artifact: the parent reviews what its maker changed.
   */
  const readable = (instance: InstanceRow, id: string): ArtifactRow => {
    const next = db.get(id);
    if (next?.heldFor) {
      readable(instance, next.heldFor);
      return next;
    }
    const row =
      answerable(instance).find((one) => one.id === id) ??
      ledPage(instance, id) ??
      projectPage(instance, id);
    if (!row) {
      throw new ArtifactRefusal(404, `This session has no artifact ${id}.`);
    }
    return row;
  };

  /**
   * Whether the session is the one the artifact's marks go to: its writer,
   * or its project's lead once the writer has ended. What it reads of them
   * counts as heard.
   */
  const takes = (instance: InstanceRow, row: ArtifactRow): boolean => {
    if (row.instanceId === instance.id) {
      return true;
    }
    const writer = deps.instance(row.instanceId);
    return !!writer && deps.ended(writer);
  };

  /**
   * The pins a `comment_read` answered, stamped heard as they were read
   * (core `pinHeard`): what the person writes after it still goes out.
   */
  const readHeard = (id: string, answered: Pin[], at: string) => {
    const owed = answered.filter(pinUnsent);
    if (owed.length === 0) {
      return;
    }
    docs.transact(id, "hub", (live) => {
      const pins = live.getMap("pins");
      for (const pin of owed) {
        const now = pins.get(pin.id) as Pin | undefined;
        if (now) {
          pins.set(pin.id, pinHeard(now, pin, at));
        }
      }
    });
  };

  /** Pin `pinId` on an artifact the session answers ({@link answerable}), and that artifact; refused when none holds it. */
  const pinOf = (
    instance: InstanceRow,
    pinId: string
  ): { pin: Pin; row: ArtifactRow } => {
    for (const row of answerable(instance)) {
      const pin = docs.doc(row.id).getMap("pins").get(pinId) as Pin | undefined;
      if (pin) {
        return { pin, row };
      }
    }
    throw new ArtifactRefusal(
      404,
      `No artifact of this session holds pin ${pinId}. comment_read lists its pins with their ids.`
    );
  };

  /**
   * The one way an artifact goes: its live doc let go and every socket on it
   * ended, its row taken out (its log, and so its pins and comments, and a
   * panel's shown row with it: schema.ts's cascades), and its files (a
   * page's HTML, a picture). A promoted copy in the project's folder is the
   * project's and stays. A next version held for it goes first.
   */
  const discard = (row: ArtifactRow) => {
    const next = db.heldOf(row.id);
    if (next) {
      discard(next);
    }
    letGoHeadless(row.id);
    docs.drop(row.id);
    db.remove(row.id);
    rmSync(join(deps.root, row.id), { recursive: true, force: true });
    deps.removed?.(row);
    releaseServed(row);
  };

  /**
   * The parent opens what its maker changed: artifact `row`'s held next
   * version merged in (its doc's changes beside the person's since, its
   * files, its source and revision), then let go. The views on `row` hear
   * it as they hear any change.
   */
  const promote = async (
    row: ArtifactRow,
    next: ArtifactRow
  ): Promise<ArtifactRow> => {
    const folder = join(deps.root, row.id);
    const nextFolder = join(deps.root, next.id);
    const html = join(nextFolder, "index.html");
    const maker = next.madeBy ? deps.instance(next.madeBy) : undefined;
    if (row.kind === "page" && maker && existsSync(html)) {
      // Its project's folder takes it now, as a build that isn't held does; one it refuses opens nothing.
      const program = join(nextFolder, PROGRAM_FILE);
      const refused = await deps.keepPage(maker, row.name, {
        html: readFileSync(html, "utf8"),
        ...(existsSync(program)
          ? { program: readFileSync(program, "utf8") }
          : {}),
      });
      if (refused) {
        throw new ArtifactRefusal(refused.status, refused.refused);
      }
    }
    letGoHeadless(next.id);
    if (existsSync(nextFolder)) {
      // A page's files are its revision's alone (writePage).
      rmSync(join(folder, "files"), { recursive: true, force: true });
      rmSync(join(folder, PROGRAM_FILE), { force: true });
      cpSync(nextFolder, folder, { recursive: true, force: true });
    }
    docs.merge(next.id, row.id, "agent");
    const promoted = db.update(row.id, {
      madeBy: next.madeBy,
      machineId: next.machineId,
      source: next.source,
      revision: next.revision,
      updatedAt: new Date(),
    }) as ArtifactRow;
    discard(next);
    // A server the next version moved off is let go once nothing shows it.
    keepServed(promoted, row, undefined);
    return promoted;
  };

  /**
   * A workspace preview's server, up before anything shows it (core
   * `ServeSpec`): its state. One that can't start is the refusal, and nothing
   * is kept. None for any other source.
   */
  const serveFirst = (
    source: PreviewSource,
    machineId: string | null
  ): Promise<StageState | undefined> =>
    "port" in source && source.serve && source.workspace && machineId
      ? deps.serve(machineId, source.workspace, {
          ...source.serve,
          port: source.port,
        })
      : Promise.resolve(undefined);

  /**
   * A served preview's state kept in its doc; and, re-made on another port or
   * workspace, the server it showed `before` let go once nothing else shows it.
   */
  const keepServed = (
    row: ArtifactRow,
    before: ArtifactRow | undefined,
    stage: StageState | undefined
  ) => {
    if (stage) {
      writeStage(row, stage);
    }
    const was = before ? servedOf(before) : null;
    const now = servedOf(row);
    if (
      before &&
      was &&
      (was.port !== now?.port || was.workspace !== now?.workspace)
    ) {
      releaseServed(before);
    }
  };

  /**
   * The server `row` previewed (core `ServeSpec`) is stopped once no other
   * artifact previews that port of its workspace: its life is its artifacts'.
   */
  const releaseServed = (row: Placed & { id?: string }) => {
    const served = servedOf(row);
    if (!(served && row.machineId)) {
      return;
    }
    const still = db
      .previewing({
        id: served.workspace,
        machineId: row.machineId,
        path: "//",
      })
      .some(
        (other) => other.id !== row.id && servedOf(other)?.port === served.port
      );
    if (!still) {
      deps.unserve(row.machineId, served.workspace, served.port);
    }
  };

  /**
   * A page's files in its folder: its HTML, and a decision page's program
   * and the files its Images show (an earlier revision's go first); an HTML
   * page keeps no program.
   */
  const writePage = (id: string, html: string, program?: BuiltProgram) => {
    const folder = join(deps.root, id);
    rmSync(join(folder, "files"), { recursive: true, force: true });
    rmSync(join(folder, PROGRAM_FILE), { force: true });
    writeStateFileSync(join(folder, "index.html"), html);
    if (program) {
      writeStateFileSync(join(folder, PROGRAM_FILE), program.program);
      for (const file of program.files) {
        writeStateFileSync(join(folder, file.path), file.bytes);
      }
    }
  };

  /** A decision page's program as the hub keeps it; undefined for an HTML page or any other artifact. */
  const programOf = (row: ArtifactRow): string | undefined => {
    const file = join(deps.root, row.id, PROGRAM_FILE);
    return row.kind === "page" && existsSync(file)
      ? readFileSync(file, "utf8")
      : undefined;
  };

  /**
   * The artifacts a program's Canvas and Preview pieces name, each one of
   * the panel owner's of the kind it shows: refused, every reason at once,
   * when one is not.
   */
  const mediaHeld = (owner: InstanceRow, program: BuiltProgram) => {
    const problems = program.read.artifacts.flatMap(({ component, id }) => {
      const held = db.get(id);
      const kinds: ArtifactKind[] =
        component === "Canvas" ? ["canvas"] : ["page", "preview", "component"];
      if (!held || held.instanceId !== owner.id) {
        return [
          `${component}("${id}"): this session's panel has no artifact ${id}.`,
        ];
      }
      return kinds.includes(held.kind)
        ? []
        : [
            `${component}("${id}") is ${named(held)}: a ${component} shows ${component === "Canvas" ? "a canvas" : "a page, a preview or a sheet"}.`,
          ];
    });
    if (problems.length > 0) {
      throw new ArtifactRefusal(
        422,
        problems.length === 1
          ? (problems[0] ?? "")
          : `The program has ${problems.length} problems:\n- ${problems.join("\n- ")}`
      );
    }
  };

  /**
   * Writes the doc's meta for the artifact as the hub keeps it: what the
   * person does there and its ask, which every open view's head reads, and
   * when the session last changed it (`revisedAt`), which a Send answers.
   */
  const stampMeta = (row: ArtifactRow, hash: string | null) => {
    docs.transact(row.id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      meta.set("kind", row.kind);
      meta.set("name", row.name);
      meta.set("does", row.does);
      meta.set("ask", row.ask);
      meta.set("revision", row.revision);
      meta.set("revisedAt", new Date().toISOString());
      if (hash !== null) {
        meta.set("pageHash", hash);
      }
    });
  };

  /** A new ask in the doc, as a revision is: every open view's head morphs to it, and a Send before it is answered. */
  const askNow = (id: string, ask: string) => {
    docs.transact(id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      meta.set("ask", ask);
      meta.set("revisedAt", new Date().toISOString());
    });
  };

  /** A page's hash: its program's for a decision page, else its HTML's; none for anything else. */
  const pageHashOf = (
    html: string | null,
    program: BuiltProgram | undefined
  ): string | null => {
    if (program) {
      return pageHash(program.program);
    }
    return html === null ? null : pageHash(html);
  };

  /**
   * Where a decision page's relative Image files are read on a revision:
   * the work folder it was published from (`dir`), kept in its doc's meta;
   * none for one published inline or from the project's folder.
   */
  const keepProgramDir = (
    row: ArtifactRow,
    program: BuiltProgram | undefined,
    dir: string | undefined
  ) => {
    if (!program) {
      return;
    }
    docs.transact(row.id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      if (dir === undefined) {
        meta.delete("programDir");
      } else {
        meta.set("programDir", dir);
      }
    });
  };

  /**
   * A page's next revision, for new HTML. A view joined to it morphs to the
   * new HTML in place, so the person has that revision on screen without a
   * new show.
   */
  const nextRevision = (row: ArtifactRow) => ({
    revision: row.revision + 1,
    updatedAt: new Date(),
    ...(docs.viewers(row.id) > 0 ? { openedRevision: row.revision + 1 } : {}),
  });

  /**
   * A page or preview as the session reads it, which counts as its read
   * when `ownersRead`: its owner's. A maker's read leaves the owner's unread.
   */
  const read = (
    row: ArtifactRow,
    since?: number,
    ownersRead = true
  ): ArtifactRead => {
    if (ownersRead) {
      db.update(row.id, { readSeq: row.seq });
    }
    const doc = docs.doc(row.id);
    const state = stateOf(doc);
    const meta = metaOf(doc);
    const sentText = sentTextOf(doc);
    const current = meta.pageHash ?? newestHash(state);
    const changed =
      since === undefined
        ? null
        : new Set(db.changes(row.id, { after: since }).map(({ key }) => key));
    const keys = Object.keys(state).filter(
      (key) => !changed || changed.has(key)
    );
    const removed = changed
      ? [...changed].filter((key) => !(key in state))
      : [];
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      revision: row.revision,
      pageHash: meta.pageHash,
      sentAt: meta.sentAt,
      seq: row.seq,
      state: Object.fromEntries(
        keys.map((key) => [
          key,
          {
            ...state[key],
            // Kept before notes were trimmed where they are written.
            note: noteText(state[key].note),
            ...(current && state[key].pageHash !== current
              ? { earlierRevision: true as const }
              : {}),
          },
        ])
      ),
      ...(removed.length > 0 ? { removed } : {}),
      ...(sentText ? { sentText } : {}),
      ...("workspace" in row.source && row.source.workspace
        ? { workspace: row.source.workspace }
        : {}),
      ...(servedOf(row) && doc.getMap("meta").get("stage")
        ? { stage: doc.getMap("meta").get("stage") as StageState }
        : {}),
    };
  };

  /**
   * The source a preview input names, on the machine that serves it: a
   * workspace's port on the workspace's machine, in its network; a port or a
   * folder on the machine `machine` names, else the session's.
   */
  const previewSource = (
    instance: InstanceRow,
    input: ArtifactInput
  ): { machineId: string; source: PreviewSource } => {
    const problem = previewProblem(input);
    if (problem) {
      throw new ArtifactRefusal(400, problem);
    }
    const at = input.path === undefined ? {} : { path: input.path };
    // A machine named is its host's port; else the port is in the workspace
    // named, or the session's own.
    const workspace =
      input.port === undefined || input.machine !== undefined
        ? undefined
        : workspaceFor(instance, input.workspace);
    if (workspace) {
      return {
        machineId: workspace.machineId,
        source: servedSource(input, workspace.id),
      };
    }
    if (input.serve) {
      throw new ArtifactRefusal(
        400,
        "serve runs in a workspace, and this session runs in none: show a server on this machine's host by its port alone, which you keep running."
      );
    }
    const machineId =
      input.machine === undefined
        ? instance.machineId
        : machineNamed(deps.machines(), input.machine);
    if (!machineId) {
      throw new ArtifactRefusal(
        404,
        `No machine named ${input.machine} is known to this hub.`
      );
    }
    return {
      machineId,
      source:
        input.port === undefined
          ? { dir: input.dir as string, ...at }
          : { port: input.port, ...at },
    };
  };

  /**
   * The workspace a port preview's server runs in, with its machine: the one
   * named, which must be the session's own or one of its delegates', else the
   * session's own; none for a session outside a workspace that names none.
   */
  const workspaceFor = (
    instance: InstanceRow,
    needle: string | undefined
  ): { id: string; machineId: string } | undefined => {
    const mine = deps.ownWorkspace(instance);
    const asked = needle ?? mine;
    if (asked === undefined) {
      return;
    }
    const found = deps.workspaces(asked);
    if (found.length !== 1) {
      throw new ArtifactRefusal(
        404,
        found.length === 0
          ? `No workspace ${asked} on this hub.`
          : `${asked} names ${found.length} workspaces; pass the full workspace id.`
      );
    }
    const [workspace] = found;
    if (workspace.id !== mine && !deps.delegatesIn(instance, workspace.id)) {
      throw new ArtifactRefusal(
        403,
        `"${needle}" is not your delegate's workspace — you can only preview your own workspace or your delegates'.`
      );
    }
    return workspace;
  };

  /**
   * A page built from what a create names: its HTML, and a decision page's
   * program, the artifacts its media show checked against `owner`'s panel.
   */
  const pageBuilt = async (
    instance: InstanceRow,
    input: Pick<ArtifactInput, "name" | "html" | "dir" | "program">,
    owner: InstanceRow,
    keep: boolean
  ): Promise<{ html: string; program?: BuiltProgram }> => {
    const given = [input.program, input.html, input.dir].filter(
      (one) => one !== undefined
    ).length;
    if (given > 1) {
      throw new ArtifactRefusal(
        400,
        "A page takes one of program, html or dir."
      );
    }
    if (given === 0 && !instance.projectId) {
      throw new ArtifactRefusal(
        400,
        "A page takes program (a decision page, decision-page skill), html, or dir with your work folder."
      );
    }
    let from: PageFrom = { folder: true };
    if (input.program !== undefined) {
      from = { program: input.program };
    } else if (input.html !== undefined) {
      from = { html: input.html };
    } else if (input.dir !== undefined) {
      from = { dir: input.dir };
    }
    const page = await built(instance, input.name, from, keep);
    if (page.program) {
      mediaHeld(owner, page.program);
    }
    return page;
  };

  /** Refuses new HTML for what takes none: an artifact that is no page, or a decision page written as a program. */
  const takesHtml = (row: ArtifactRow): void => {
    if (row.kind !== "page") {
      throw new ArtifactRefusal(
        409,
        `${row.name} is a ${row.kind}: only a page takes new HTML.`
      );
    }
    if (programOf(row) !== undefined) {
      throw new ArtifactRefusal(
        409,
        `${row.name} is a decision page written as a program: revise it with statements.`
      );
    }
  };

  /** What a create answers of a decision page: its decisions, and the components it dropped. */
  const programAnswer = (
    program: BuiltProgram | undefined
  ): Pick<Created, "decisions" | "dropped"> => {
    if (!program) {
      return {};
    }
    return {
      decisions: program.read.cards.map((card) => card.id),
      ...(program.dropped.length > 0 ? { dropped: program.dropped } : {}),
    };
  };

  /**
   * What decision page `name` drawn with `cards` leaves broken, for its
   * writer: the person's picks (artifact `id`'s state, none for a new page)
   * on a decision or option it no longer has, and in a project the `after`s
   * naming no decision and the decisions it lacks that other pages come
   * after. Undefined when nothing is.
   */
  const brokenBy = async (
    page: { id: string | undefined; name: string; projectId: string | null },
    cards: DecisionCard[]
  ): Promise<GraphBroken | undefined> => {
    const state = page.id ? stateOf(docs.doc(page.id)) : {};
    const has = (id: string) => cards.some((card) => card.id === id);
    const picked = Object.entries(state)
      .filter(
        ([key, entry]) =>
          key !== PLACES_KEY && !has(key) && (entry.options ?? []).length > 0
      )
      .map(([key]) => key);
    const options = Object.fromEntries(
      cards.flatMap((card) => {
        const { gone } = pickOf(card, state[card.id]);
        return gone.length > 0 ? [[card.id, gone] as const] : [];
      })
    );
    const links = page.projectId
      ? await deps.graphLinks(page.projectId, page.name, cards)
      : { unlinked: [], dependents: {} };
    const after = Object.fromEntries(
      Object.entries(links.dependents).filter(([id]) => !has(id))
    );
    const broken: GraphBroken = {
      ...(picked.length > 0 ? { picked } : {}),
      ...(Object.keys(options).length > 0 ? { options } : {}),
      ...(Object.keys(after).length > 0 ? { after } : {}),
      ...(links.unlinked.length > 0 ? { unlinked: links.unlinked } : {}),
    };
    return Object.keys(broken).length > 0 ? broken : undefined;
  };

  /**
   * A create's page built, and what its program leaves broken on the picks
   * of the page it replaces and on the project's graph. A re-create held
   * for the parent is kept in its project's folder when they open it.
   */
  const createdPage = async (
    { maker, owner }: Making,
    input: ArtifactInput
  ): Promise<{
    broken: GraphBroken | undefined;
    html: string;
    program?: BuiltProgram;
  }> => {
    const was = db.byName(owner.id, "page", input.name);
    const page = await pageBuilt(
      maker,
      input,
      owner,
      !(was && holdsChange(maker, was))
    );
    const broken = page.program
      ? await brokenBy(
          { id: was?.id, name: input.name, projectId: owner.projectId ?? null },
          page.program.read.cards
        )
      : undefined;
    return { ...page, broken };
  };

  /**
   * `deps.page`'s build, its refusal (and a program's) thrown as the
   * artifact's; kept in the project's folder unless it is a held next
   * version's (`keep` false), which {@link promote} keeps there.
   */
  const built = async (
    instance: InstanceRow,
    name: string,
    from: PageFrom,
    keep = true
  ): Promise<{ html: string; program?: BuiltProgram }> => {
    let page: Awaited<ReturnType<ArtifactServiceDeps["page"]>>;
    try {
      page = await deps.page(instance, name, from, keep);
    } catch (error) {
      throw error instanceof ProgramRefusal ? refusedProgram(error) : error;
    }
    if ("refused" in page) {
      throw new ArtifactRefusal(page.status, page.refused);
    }
    return page;
  };

  /*
   * A view's word that it has an artifact on screen. Each show publishes a
   * fresh revision and waits for a view to say it loaded that revision; a
   * word that came before the wait began (a fast page) is kept here for it.
   */
  const heard = new Map<string, ShownAck>();
  const waiting = new Map<string, (ack: ShownAck) => void>();
  const shownKey = (id: string, revision: string) => `${id}:${revision}`;

  /** The first view's word on `revision` of artifact `id`, within {@link SHOWN_WAIT_MS}. */
  const shownBy = (
    id: string,
    revision: string
  ): Promise<Bounded<ShownAck>> => {
    const key = shownKey(id, revision);
    const early = heard.get(key);
    if (early) {
      heard.delete(key);
      return Promise.resolve({ kind: "answered", value: early });
    }
    return readWithin(
      SHOWN_WAIT_MS,
      (signal) =>
        new Promise<ShownAck>((done) => {
          waiting.set(key, (ack) => {
            waiting.delete(key);
            done(ack);
          });
          signal.addEventListener("abort", () => waiting.delete(key), {
            once: true,
          });
        })
    );
  };

  /** Why a view could not load the artifact, in WORDS.md's error formula: what failed, and why. */
  const notLoaded = (row: Placed, failure: ShownFailure): string => {
    const { source } = row;
    const machine = machineOf(row);
    const subject =
      "port" in source
        ? `The server on port ${source.port} ${source.workspace ? `in workspace ${source.workspace.slice(0, 8)}` : `on ${machine}`}`
        : `${named(row)[0]?.toUpperCase()}${named(row).slice(1)}`;
    switch (failure) {
      case "server":
        return `${subject} did not answer: nothing is listening on that port.`;
      case "workspace":
        return `${subject} did not answer: the workspace isn't running.`;
      case "machine":
        return `${subject} did not answer: ${machine} isn't connected to the hub.`;
      case "reach":
        return `${subject} did not answer: ${machine} couldn't open the way to it.`;
      case "closed":
        return `${subject} did not show: the panel was closed or showed something else first.`;
      case "page":
        break;
    }
    return `${subject} answered, but not with a page the panel can show.`;
  };
  const machineOf = (row: Pick<ArtifactRow, "machineId">): string => {
    const machine = deps
      .machines()
      .find((one) => one.machineId === row.machineId);
    return machine ? machineLabel(machine.hostname) : "its machine";
  };

  /**
   * Publishes the artifact to its session's panel and waits for a view to
   * have it on screen; `started` is false when its server could not even be
   * started, and nothing was published.
   */
  const show = async (
    row: ArtifactRow,
    by: PanelHand
  ): Promise<
    | { opened: true; started: true }
    | { opened: false; started: boolean; why: string }
  > => {
    const published = await deps.open(row, by);
    if (!published.ok) {
      return { opened: false, why: published.error, started: false };
    }
    const meta = docs.doc(row.id).getMap("meta");
    if (meta.get(HANDED) === true) {
      docs.transact(row.id, "hub", () => meta.delete(HANDED));
    }
    const shown = await shownBy(row.id, published.revision);
    let ack: ShownAck;
    switch (shown.kind) {
      case "answered":
        ack = shown.value;
        break;
      case "unanswered":
        // Not known yet, not failed: it is in the panel and opens when a dashboard does.
        return { opened: false, why: NO_VIEW, started: true };
      default: {
        const unhandled: never = shown;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    if (!ack.ok) {
      return {
        opened: false,
        why: notLoaded(row, ack.error ?? "page"),
        started: true,
      };
    }
    db.update(row.id, { shownAt: new Date() });
    return { opened: true, started: true };
  };
  /** A show's answer, as the tools and the panel's Show give it. */
  const openedOf = (shown: Opened): Opened =>
    shown.opened ? { opened: true } : { opened: false, why: shown.why };

  /*
   * A canvas (Projects spec §5.10, D24–D25). Its `deliveredSeq` is the seq
   * the session last read it at (a canvas delivers no picks): what "changed
   * since your last read" and "changed under you" are measured from.
   */

  /** The canvas's latest picture as base64; null until a screen drew one. */
  const pictureOf = (id: string): string | null =>
    pictureBytes(id)?.toString("base64") ?? null;

  /** The artifact's latest picture's bytes: a canvas's, or a page's from its last send; null when it has none. */
  const pictureBytes = (id: string): Buffer | null => {
    try {
      return readFileSync(picturePath(deps.root, id));
    } catch {
      return null;
    }
  };

  /**
   * A delivered page's latest picture of the person's ink (the crop of the
   * last stroke group that went) becomes a page's or preview's picture, as a
   * canvas keeps its own; `artifact_promote` writes it.
   */
  const keepInkPicture = (row: ArtifactRow, png: string | null) => {
    if (!png || row.kind === "canvas") {
      return;
    }
    writeStateFileSync(
      picturePath(deps.root, row.id),
      Buffer.from(png, "base64")
    );
  };

  /*
   * The person's marks (pins, replies, resolves, ink) go by themselves
   * (core comments.ts). Each person's write on an artifact's `pins` or `ink`
   * (docs.ts `onMarks`) pushes its delivery back to {@link MARKS_QUIET_MS}
   * from now, never past {@link MARKS_LONGEST_MS} from the burst's first.
   * The page posts its pictures of the marks it just made beside the doc
   * (sync.ts `artifactPictures`); they wait here for the delivery.
   */
  const bursts = new Map<string, { first: number; timer: HubTimer }>();
  const held = new Map<
    string,
    { pictures: Map<string, string>; url?: string }
  >();
  const delivering = new Set<string>();
  const marked = (id: string) => {
    const now = Date.now();
    const burst = bursts.get(id);
    deps.lifetime.cancel(burst?.timer);
    const first = burst?.first ?? now;
    const wait = Math.max(
      0,
      Math.min(MARKS_QUIET_MS, first + MARKS_LONGEST_MS - now)
    );
    bursts.set(id, {
      first,
      timer: deps.lifetime.after(wait, () => {
        bursts.delete(id);
        // One delivery at a time: what is still owed when it ends goes next.
        if (delivering.has(id)) {
          marked(id);
          return;
        }
        delivering.add(id);
        deliverMarks(id)
          .catch((error: unknown) => {
            console.warn(
              `[artifacts] ${id}: the person's marks were not delivered: ${error instanceof Error ? error.message : String(error)}`
            );
          })
          .finally(() => delivering.delete(id));
      }),
    });
  };
  docs.onMarks(marked);

  /**
   * What of the person's marks on an artifact's doc the session has not
   * heard: each pin ready to go (core `pinReady`), by number, and each
   * stroke group no pin stands on; with every group, moved ones too, by id.
   */
  const marksOwed = (doc: Doc) => {
    const pins = Object.values(
      doc.getMap("pins").toJSON() as Record<string, Pin>
    );
    const pinned = new Set(pins.map((pin) => pin.ink));
    const ink = doc.getMap("ink").toJSON() as Record<string, InkGroup>;
    return {
      pins,
      owed: pins
        .filter((pin) => pinUnsent(pin) && pinReady(pin))
        .sort((a, b) => a.number - b.number),
      loose: Object.values(ink).filter(
        (group) => !(group.sentAt || pinned.has(group.id))
      ),
      groups: {
        ...(doc.getMap("moved").toJSON() as Record<string, InkGroup>),
        ...ink,
      },
    };
  };

  /**
   * What a delivery carried, stamped heard once someone took it: each pin as
   * it stands now, its entries that went stamped when unchanged and `heard`
   * what went (core `pinHeard`), so what the person wrote while it was on
   * its way stays owed; each stroke group that went, when it still stands as
   * it went; and the address they were made at.
   */
  const stampDelivered = (
    id: string,
    sent: Pin[],
    strokes: InkGroup[],
    url: string
  ) => {
    const at = new Date().toISOString();
    const went = new Map(strokes.map((group) => [group.id, group]));
    docs.transact(id, "hub", (live) => {
      const livePins = live.getMap("pins");
      for (const pin of sent) {
        const now = livePins.get(pin.id) as Pin | undefined;
        if (now) {
          livePins.set(pin.id, pinHeard(now, pin, at));
        }
      }
      const ink = live.getMap("ink");
      const groups = ink.toJSON() as Record<string, InkGroup>;
      for (const group of Object.values(groups)) {
        const was = went.get(group.id);
        const unchanged =
          !!was &&
          JSON.stringify(was.strokes) === JSON.stringify(group.strokes);
        if (unchanged && !group.sentAt) {
          ink.set(group.id, { ...group, sentAt: at });
        }
      }
      live.getMap("meta").set("sentUrl", url);
    });
  };

  /**
   * What went is let go of the held pictures, and what is gone from the doc;
   * a pin not ready yet keeps its own for its delivery.
   */
  const letGoPictures = (id: string, went: string[], standing: Set<string>) => {
    const kept = held.get(id);
    if (!kept) {
      return;
    }
    const gone = new Set(went);
    for (const mark of kept.pictures.keys()) {
      if (gone.has(mark) || !standing.has(mark)) {
        kept.pictures.delete(mark);
      }
    }
    if (kept.pictures.size === 0) {
      held.delete(id);
    }
  };

  /**
   * Delivers what of the person's marks on artifact `id` the session has
   * not heard ({@link marksOwed}), as one message: each pin as its section
   * or its one resolve line, each loose stroke group, with the page's
   * pictures of them. Once someone took it they are stamped heard
   * ({@link stampDelivered}); when no one did, they stay owed, the next mark
   * or the hub's resume delivering them again, and the person reads why in
   * the writer's transcript (server.ts `deliverArtifactMarks`). Nothing
   * owed, nothing goes.
   */
  const deliverMarks = async (id: string) => {
    const row = db.get(id);
    const instance = row ? deps.instance(row.instanceId) : undefined;
    if (!(row && instance)) {
      held.delete(id);
      return;
    }
    const doc = docs.doc(id);
    const { pins, owed, loose, groups } = marksOwed(doc);
    const errors = errorsOwed(row, doc);
    const saves = savesOwed(row, doc);
    if (
      owed.length === 0 &&
      loose.length === 0 &&
      errors.length === 0 &&
      saves.length === 0
    ) {
      return;
    }
    const kept = held.get(id);
    const url =
      kept?.url ??
      (doc.getMap("meta").get("sentUrl") as string | null | undefined) ??
      routeOf(id);
    // A canvas's loose ink is in its own picture; a page's each in the crop the page drew round it.
    const canvas = row.kind === "canvas" ? pictureOf(id) : null;
    const pictureOfGroup = (group: InkGroup) =>
      row.kind === "canvas" ? null : (kept?.pictures.get(group.id) ?? null);
    const images = [
      ...(canvas && loose.length > 0 ? [canvas] : []),
      ...loose.flatMap((group) => pictureOfGroup(group) ?? []),
      ...owed.flatMap((pin) => kept?.pictures.get(pin.id) ?? []),
    ]
      .slice(0, COMMENT_LIMITS.pictures)
      .map((data) => ({ mediaType: "image/png", data }));
    const marks = [
      ...owed.map((pin) =>
        pinDelivery(pin, {
          url,
          ...(pin.ink && groups[pin.ink] ? { ink: groups[pin.ink].page } : {}),
        })
      ),
      ...loose.map((group) =>
        inkSection(group, {
          url,
          picture: !!canvas || pictureOfGroup(group) !== null,
        })
      ),
    ];
    // A sheet's saves and compile errors go on the person's marks' own channel.
    const text = marksText(row, marks, errors, saves);
    const outcome = await deps.deliverMarks(instance, row, { text, images });
    if (!outcome.ok) {
      console.warn(
        `[artifacts] ${id}: the person's marks reached no one, and stay owed: ${outcome.reason}`
      );
      return;
    }
    stampDelivered(
      id,
      owed,
      [
        ...loose,
        ...owed.flatMap((pin) =>
          pin.ink && groups[pin.ink] ? [groups[pin.ink]] : []
        ),
      ],
      url
    );
    errorsHeard(id, errors);
    savesHeard(id, saves);
    keepInkPicture(
      row,
      loose.map(pictureOfGroup).findLast((png) => png !== null) ?? null
    );
    letGoPictures(
      id,
      [...owed.map((pin) => pin.id), ...loose.map((group) => group.id)],
      new Set([...pins.map((pin) => pin.id), ...Object.keys(groups)])
    );
  };

  /** A canvas's `.excalidraw` file and its outline, as the doc holds them now. */
  const canvasFile = (id: string) => {
    const elements = canvasEntries(docs, id).map((entry) => entry.el);
    return {
      file: excalidrawFile(
        elements,
        docs.doc(id).getMap("files").toJSON() as Record<string, unknown>
      ),
      outline: canvasOutline(elements),
    };
  };

  /** What `artifacts/<name>/` holds for the artifact now, by file name. */
  const promotedFiles = (
    instance: InstanceRow,
    row: ArtifactRow,
    at: string
  ): Partial<Record<PromotedFile, string | Uint8Array>> => {
    const doc = docs.doc(row.id);
    const files: Partial<Record<PromotedFile, string | Uint8Array>> = {
      "artifact.json": promotedJson({
        kind: row.kind,
        name: row.name,
        id: row.id,
        promotedAt: at,
        session: instance.id,
      }),
      "pins.json": promotedJson(doc.getMap("pins").toJSON()),
      "ink.json": promotedJson(doc.getMap("ink").toJSON()),
    };
    if (row.kind === "page") {
      files["index.html"] = readFileSync(join(deps.root, row.id, "index.html"));
      files["state.json"] = promotedJson(stateOf(doc));
    } else if (row.kind === "canvas") {
      const { file, outline } = canvasFile(row.id);
      files["canvas.excalidraw"] = promotedJson(file);
      files["outline.md"] = outline ? `${outline}\n` : "";
    } else {
      files["preview.json"] = promotedJson({
        ...row.source,
        machine: machineOf(row),
      });
    }
    const picture = pictureBytes(row.id);
    if (picture) {
      files["picture.png"] = picture;
    }
    return files;
  };

  /** The elements the person changed after `since` that the canvas still holds. */
  const personChangedAfter = (
    row: ArtifactRow,
    since: number,
    present: Set<string>
  ): string[] =>
    db
      .changes(row.id, { after: since, by: "person" })
      .map(({ key }) => key)
      .filter((id) => present.has(id));

  /** A canvas as the session reads it, which counts as its read when `ownersRead`: its owner's. */
  const readCanvas = (
    row: ArtifactRow,
    since?: number,
    png = false,
    ownersRead = true
  ): ArtifactRead => {
    const entries = canvasEntries(docs, row.id);
    const present = new Set(entries.map((entry) => entry.el.id));
    const meta = docs.doc(row.id).getMap("meta");
    if (ownersRead) {
      db.update(row.id, { deliveredSeq: row.seq, readSeq: row.seq });
    }
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      revision: row.revision,
      pageHash: null,
      sentAt: null,
      seq: row.seq,
      state: {},
      outline: canvasOutline(entries.map((entry) => entry.el)),
      changed: personChangedAfter(row, since ?? row.deliveredSeq, present),
      pictureAt: (meta.get("pictureAt") as string | null | undefined) ?? null,
      draft: meta.get("draft") === true,
      ...(png ? { png: pictureOf(row.id) } : {}),
    };
  };

  /**
   * The hub machine's screen on each canvas handed to its parent and not
   * opened ({@link isHanded}), by artifact: opened by the first write that
   * finds no screen joined, kept while any write on it runs (`writing`), and
   * let go once a picture has followed the last of them (the page posts one
   * after a quiet 2 s), or `screenHoldMs` after it. `joined` answers once its
   * page has joined the canvas's doc; `settle` stops a let-go that waits.
   */
  const headless = new Map<
    string,
    { joined: Promise<CanvasScreen>; settle?: () => void; writing: number }
  >();

  /**
   * The canvas's headless screen, opened when it has none and held on when
   * it has: a write on it counted, any let-go that waited called off.
   */
  const headlessScreen = (row: ArtifactRow) => {
    let screen = headless.get(row.id);
    if (screen) {
      screen.joined.then(
        (one) => one.hold(),
        () => undefined
      );
    } else {
      const joined = deps.screen(row, routeOf(row.id)).then(async (one) => {
        if (await screenJoined(docs, row.id, CANVAS_LIMITS.convertMs)) {
          return one;
        }
        one.release();
        throw new ArtifactRefusal(
          504,
          `The canvas ${row.name} wasn't drawn: the hub's machine opened it, but its page didn't join the canvas within ${Math.round(CANVAS_LIMITS.convertMs / 1000)} s.`
        );
      });
      const opened = { joined, writing: 0 };
      headless.set(row.id, opened);
      joined.catch(() => {
        if (headless.get(row.id) === opened) {
          headless.delete(row.id);
        }
      });
      screen = opened;
    }
    screen.settle?.();
    screen.writing += 1;
    return screen;
  };

  /** The canvas's headless screen let go now, if it has one. */
  const letGoHeadless = (id: string) => {
    const screen = headless.get(id);
    if (!screen) {
      return;
    }
    screen.settle?.();
    headless.delete(id);
    screen.joined.then(
      (one) => one.release(),
      () => undefined
    );
  };

  /** A write on the headless screen done: the last one lets it go once a picture follows it, or `screenHoldMs` on. */
  const wroteHeadless = (id: string) => {
    const screen = headless.get(id);
    if (!screen) {
      return;
    }
    screen.writing -= 1;
    if (screen.writing > 0) {
      return;
    }
    const meta = docs.doc(id).getMap("meta");
    const pictured = (event: YMapEvent<unknown>) => {
      if (event.keysChanged.has("pictureAt")) {
        letGoHeadless(id);
      }
    };
    const timer = setTimeout(
      () => letGoHeadless(id),
      CANVAS_LIMITS.screenHoldMs
    );
    meta.observe(pictured);
    screen.settle = () => {
      clearTimeout(timer);
      meta.unobserve(pictured);
      screen.settle = undefined;
    };
  };

  /**
   * What a canvas's create or update draws: skeleton elements or Mermaid,
   * converted on a screen; the ids written. A canvas handed to its parent
   * and not opened is drawn on the hub machine's headless screen
   * ({@link headlessScreen}), so the parent reads it before anyone sees it.
   */
  const draw = async (
    row: ArtifactRow,
    change: { elements: SkeletonElement[] } | { mermaid: string }
  ): Promise<string[]> => {
    if ("elements" in change) {
      if (change.elements.length > CANVAS_LIMITS.elementsPerCall) {
        throw new ArtifactRefusal(
          413,
          `One call writes at most ${CANVAS_LIMITS.elementsPerCall} elements; send the rest in another.`
        );
      }
    } else if (change.mermaid.length > CANVAS_LIMITS.mermaid) {
      throw new ArtifactRefusal(
        413,
        `Mermaid is at most ${CANVAS_LIMITS.mermaid} characters; split the diagram.`
      );
    }
    const convert = () =>
      "elements" in change
        ? convertOnScreen(docs, row.id, "elements", {
            elements: change.elements,
          })
        : convertOnScreen(docs, row.id, "mermaid", {
            mermaid: change.mermaid,
          });
    if (!(
      isHanded(row) &&
      (headless.has(row.id) || docs.screens(row.id) === 0)
    )) {
      return await convert();
    }
    try {
      await headlessScreen(row).joined;
      return await convert();
    } finally {
      wroteHeadless(row.id);
    }
  };

  /**
   * The person's own canvas, opened in the composer: always a new artifact,
   * named `name`, or `name-2`, `name-3`… when the session has that one,
   * marked `draft` until its first send, and not shown in the panel.
   */
  const createDraft = (
    instance: InstanceRow,
    input: ArtifactInput
  ): Created => {
    if (input.elements !== undefined || input.mermaid !== undefined) {
      throw new ArtifactRefusal(
        400,
        "A draft canvas starts empty: it takes no elements or mermaid."
      );
    }
    const { name } = input;
    let free = name;
    for (let n = 2; db.byName(instance.id, "canvas", free); n += 1) {
      free = `${name.slice(0, 63 - String(n).length - 1)}-${n}`;
    }
    const now = new Date();
    const row = db.create({
      id: crypto.randomUUID(),
      instanceId: instance.id,
      madeBy: instance.id,
      heldFor: null,
      projectId: instance.projectId ?? null,
      kind: "canvas",
      name: free,
      // The person's own canvas: nothing is asked of them on it.
      does: "draw",
      ask: "",
      machineId: null,
      source: { page: free },
      revision: 1,
      seq: 0,
      deliveredSeq: 0,
      readSeq: 0,
      openedRevision: null,
      createdAt: now,
      updatedAt: now,
      shownAt: null,
    });
    stampMeta(row, null);
    docs.transact(row.id, "hub", (doc) =>
      doc.getMap("meta").set("draft", true)
    );
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      route: routeOf(row.id),
      opened: false,
      why: "It stands in the composer until it is docked.",
      ...deps.previewAddress(instance.id),
    };
  };

  /**
   * The owner's canvas of that name, its maker now `maker` and its ask the
   * input's, or a new one; and what was there. A maker's re-create of one
   * its parent opened goes to its next version (`holding`, {@link holdNext}).
   */
  const canvasPlaced = (
    { owner, maker }: Making,
    input: ArtifactInput
  ): {
    before: ArtifactRow | undefined;
    holding: ReturnType<typeof holdNext>;
    row: ArtifactRow;
  } => {
    const now = new Date();
    const before = db.byName(owner.id, "canvas", input.name);
    const asked = askedOf(input);
    const holding = before ? holdNext(maker, before) : null;
    const target = holding?.next ?? before;
    const row =
      (target &&
        db.update(target.id, { madeBy: maker.id, ...asked, updatedAt: now })) ??
      db.create({
        id: crypto.randomUUID(),
        instanceId: owner.id,
        madeBy: maker.id,
        heldFor: null,
        projectId: owner.projectId ?? null,
        kind: "canvas",
        name: input.name,
        ...asked,
        machineId: null,
        // The hub serves it, as it serves a page.
        source: { page: input.name },
        revision: 1,
        seq: 0,
        deliveredSeq: 0,
        readSeq: 0,
        openedRevision: null,
        createdAt: now,
        updatedAt: now,
        shownAt: null,
      });
    return { before, holding, row };
  };

  /** What a canvas's create draws: its elements, its Mermaid, or nothing. */
  const drawingOf = ({
    elements,
    mermaid,
  }: ArtifactInput):
    { elements: SkeletonElement[] } | { mermaid: string } | null => {
    if (elements !== undefined) {
      return { elements };
    }
    return mermaid === undefined ? null : { mermaid };
  };

  /**
   * A create's drawing on canvas `row`: on its panel's screen once one
   * joins, or, handed up, on its headless screen ({@link draw}); the ids
   * written.
   */
  const drawnOn = async (
    row: ArtifactRow,
    change: { elements: SkeletonElement[] } | { mermaid: string }
  ): Promise<string[]> => {
    if (!(
      isHanded(row) ||
      (await screenJoined(docs, row.id, CANVAS_LIMITS.convertMs))
    )) {
      throw new ArtifactRefusal(
        503,
        `The canvas ${row.name} is made (id ${row.id}) and empty. ${NO_SCREEN}`
      );
    }
    return await draw(row, change);
  };

  /**
   * A handed canvas that couldn't be readied, refused: one the parent
   * never had is not kept, so nothing of it reaches them.
   */
  const unhanded = (
    before: ArtifactRow | undefined,
    row: ArtifactRow,
    error: ArtifactRefusal
  ): ArtifactRefusal => {
    if (!before) {
      discard(row);
    }
    return new ArtifactRefusal(
      error.status,
      `${error.message} ${before ? "Your parent wasn't told." : "Nothing was handed to your parent."}`,
      { cause: error }
    );
  };

  /**
   * Makes a canvas in `owner`'s panel (or opens the one of that name) and
   * shows it, or hands it to its parent unopened ({@link handOver}); with
   * elements or Mermaid, draws them ({@link drawnOn}) before the parent
   * hears of it. `maker` is whose call it was.
   */
  const createCanvas = async (
    making: Making,
    input: ArtifactInput
  ): Promise<Created> => {
    if (input.elements !== undefined && input.mermaid !== undefined) {
      throw new ArtifactRefusal(
        400,
        "A canvas takes elements or mermaid, not both."
      );
    }
    const { before, holding, row } = canvasPlaced(making, input);
    stampMeta(row, null);
    const change = drawingOf(input);
    let wrote: string[] | undefined;
    let shown: Opened;
    try {
      shown = openedOf(
        await handOver(
          making,
          before,
          row,
          change
            ? async () => {
                wrote = await drawnOn(row, change);
              }
            : undefined,
          holding
        )
      );
    } catch (error) {
      throw handing(making) && error instanceof ArtifactRefusal
        ? unhanded(before, row, error)
        : error;
    }
    // Its outline as it stands, read as the owner's read only when the owner made it.
    const { outline } = readCanvas(
      db.get(row.id) as ArtifactRow,
      undefined,
      false,
      making.owner.id === making.maker.id
    );
    const said = heldId(row);
    const made = {
      ...said,
      kind: row.kind,
      name: row.name,
      route: routeOf(said.id),
      ...shown,
      outline,
    };
    if (wrote) {
      return { ...made, wrote };
    }
    return outline
      ? made
      : {
          ...made,
          note: "The canvas is empty. Draw on it with artifact_update (elements or mermaid), or wait for the person to draw.",
        };
  };

  /** A canvas's change: elements added or replaced by id, ids deleted, or Mermaid appended; read after as `ownersRead` says. */
  const updateCanvas = async (
    row: ArtifactRow,
    change: CanvasChange,
    ownersRead: boolean
  ): Promise<ArtifactRead> => {
    if ("delete" in change) {
      if (change.delete.length > CANVAS_LIMITS.deletePerCall) {
        throw new ArtifactRefusal(
          413,
          `One call deletes at most ${CANVAS_LIMITS.deletePerCall} elements.`
        );
      }
      const { deleted, missing } = deleteElements(docs, row.id, change.delete);
      return {
        ...readCanvas(
          db.get(row.id) as ArtifactRow,
          undefined,
          false,
          ownersRead
        ),
        deleted,
        ...(missing.length > 0 ? { missing } : {}),
      };
    }
    // Replacing what the person changed since the session last read it.
    const present = new Set(
      canvasEntries(docs, row.id).map((entry) => entry.el.id)
    );
    const underYou =
      "elements" in change
        ? personChangedAfter(row, row.deliveredSeq, present).filter((id) =>
            change.elements.some((element) => element.id === id)
          )
        : [];
    const wrote = await draw(row, change);
    return {
      ...readCanvas(
        db.get(row.id) as ArtifactRow,
        undefined,
        false,
        ownersRead
      ),
      wrote,
      ...(underYou.length > 0
        ? { changedUnderYou: underYou.map((id) => `${id} changed under you`) }
        : {}),
    };
  };

  /*
   * A sheet (live components, core stage.ts): a story file's stories,
   * mounted by its workspace's stage, shown through the workspace's port
   * preview of it. The stage's state is kept in the sheet's doc
   * (`meta.stage`), its compile errors those of the modules the sheet
   * imports, so the panel and the overlay read it as the person sees it;
   * the errors the session has not heard go with the person's marks
   * ({@link deliverMarks}), heard ones kept in `meta.errorsHeard`.
   */

  /** The stage's state as sheet `row` has it: only the errors in the modules it imports. */
  const sheetState = (row: ArtifactRow, state: StageState): StageState => {
    const file = sheetOf(row)?.file;
    return {
      ...state,
      errors: state.errors.filter((error) =>
        file ? error.sheets.includes(file) : false
      ),
    };
  };

  /**
   * Keeps the stage's state (and the sheet as it reads, when read) in the
   * artifact's doc, and the session's preview frame, when it shows the
   * artifact, published again with it at the same revision: a panel with no
   * doc of its own (the app's) hears each change there, as the dashboard's
   * pane hears it in the doc.
   */
  const writeStage = (
    row: ArtifactRow,
    state: StageState,
    sheet?: SheetRead
  ) => {
    stageWritten(row, state, sheet);
    if (deps.showing(row.instanceId) === row.id) {
      deps.relist(row.instanceId);
    }
  };
  const stageWritten = (
    row: ArtifactRow,
    state: StageState,
    sheet?: SheetRead
  ) =>
    docs.transact(row.id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      const mine = sheetState(row, state);
      meta.set("stage", mine);
      if (sheet) {
        meta.set("sheet", sheet);
      }
      // Compiles again: an error that comes back later is news again.
      if (mine.errors.length === 0) {
        meta.delete("errorsHeard");
      }
    });

  /** The sheet's compile errors the session has not heard. */
  const errorsOwed = (row: ArtifactRow, doc: Doc): StageError[] => {
    if (row.kind !== "component") {
      return [];
    }
    const meta = doc.getMap("meta");
    const stage = meta.get("stage") as StageState | undefined;
    const already = new Set(
      (meta.get("errorsHeard") as string[] | undefined) ?? []
    );
    return (stage?.errors ?? []).filter(
      (error) => !already.has(errorKey(error))
    );
  };

  /** A delivery carried these compile errors: the session has heard them. */
  const errorsHeard = (id: string, errors: StageError[]) => {
    if (errors.length === 0) {
      return;
    }
    docs.transact(id, "hub", (live) => {
      const meta = live.getMap("meta");
      const already = (meta.get("errorsHeard") as string[] | undefined) ?? [];
      meta.set("errorsHeard", [
        ...new Set([...already, ...errors.map(errorKey)]),
      ]);
    });
  };

  /** What the person saved from a sheet's inspector that the session has not heard: one section each. */
  const savesOwed = (row: ArtifactRow, doc: Doc): string[] =>
    row.kind === "component"
      ? ((doc.getMap("meta").get("saves") as string[] | undefined) ?? [])
      : [];

  /** A delivery carried these saves: the session has heard them. */
  const savesHeard = (id: string, saves: string[]) => {
    if (saves.length === 0) {
      return;
    }
    docs.transact(id, "hub", (live) => {
      const meta = live.getMap("meta");
      const now = (meta.get("saves") as string[] | undefined) ?? [];
      const left = now.filter((one) => !saves.includes(one));
      if (left.length > 0) {
        meta.set("saves", left);
      } else {
        meta.delete("saves");
      }
    });
  };

  /**
   * A delivery's words: the person's marks under the comments notice, a
   * sheet's saves and compile errors with them; with no mark, the saves
   * under their own notice, errors with them; else the errors alone.
   */
  const marksText = (
    row: ArtifactRow,
    marks: string[],
    errors: StageError[],
    saves: string[]
  ): string => {
    if (marks.length > 0) {
      return artifactCommentsNotice(row, [
        ...marks,
        ...saves,
        ...errors.map(errorSection),
      ]);
    }
    return saves.length > 0
      ? artifactSavesNotice(row, [...saves, ...errors.map(errorSection)])
      : artifactErrorsNotice(row, errors.map(errorSection));
  };

  /** One write as the session reads of it: where, and what. */
  const saveSection = (change: SheetChange, edit: SheetWritten): string => {
    const at = `${edit.file}:${edit.lines.from}${edit.lines.to === edit.lines.from ? "" : `-${edit.lines.to}`}`;
    if ("args" in change) {
      const set = Object.entries(change.args.values).map(
        ([key, value]) => `${key}: ${JSON.stringify(value)}`
      );
      const unset = (change.args.unset ?? []).map((key) => `${key} dropped`);
      return `## Saved at ${at}\n- ${change.args.story}'s args: ${[...set, ...unset].join(", ")}`;
    }
    const op = change.story;
    let did: string;
    if ("add" in op) {
      did = `story ${op.add} added`;
    } else if ("duplicate" in op) {
      did = `${op.duplicate} duplicated as ${op.as}`;
    } else if ("remove" in op) {
      did = `story ${op.remove} removed`;
    } else {
      did = `${op.move} moved ${op.before === null ? "to the end" : `before ${op.before}`}`;
    }
    return `## Saved at ${at}\n- ${did}`;
  };

  /**
   * A write to sheet `row`'s story file by the stage of the workspace it was
   * made in: one story's args, or a story added, duplicated, removed or
   * moved. The sheet's doc keeps the sheet as it reads after; the person's
   * write is owed to the sheet's owner on the marks' channel, since it
   * changed a file in that workspace. A write is its owner's read when
   * `ownersRead`.
   */
  const writeSheet = async (
    row: ArtifactRow,
    change: SheetChange,
    by: "agent" | "person",
    ownersRead = true
  ): Promise<ArtifactRead> => {
    const sheet = sheetOf(row);
    if (!sheet) {
      throw new ArtifactRefusal(
        409,
        `${row.name} is a ${row.kind}: args and story are for a sheet.`
      );
    }
    const file = join(sheet.dir, sheet.file);
    const edit = await deps.stageWrite(
      { workspace: sheet.workspace },
      "args" in change
        ? { file, args: change.args }
        : { file, story: change.story }
    );
    docs.transact(row.id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      meta.set("sheet", edit.sheet);
      if (by === "person") {
        const owed = (meta.get("saves") as string[] | undefined) ?? [];
        meta.set("saves", [...owed, saveSection(change, edit)]);
      }
    });
    if (by === "person") {
      marked(row.id);
    }
    return {
      ...read(db.get(row.id) as ArtifactRow, undefined, ownersRead),
      sheet: edit.sheet,
      edit: { file: edit.file, lines: edit.lines, formatted: edit.formatted },
    };
  };

  /**
   * The agent's write as `artifact_update` answers it (component canvas
   * §4): the file, the lines written, the formatter that shaped them, the
   * story with its args after, and its frames once a browser drew them again
   * (a panel's page redraws within a second), else `unseen`.
   */
  const componentWritten = async (
    row: ArtifactRow,
    change: SheetChange,
    written: ArtifactRead
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the story the write named, then its frames as the panel redraws them, bounded by a short wait
  ): Promise<ComponentWritten> => {
    const name = "args" in change ? change.args.story : storyOfOp(change.story);
    const story = written.sheet?.stories.find((one) => one.name === name);
    const sheet = sheetOf(row);
    let frames: ComponentWritten["render"] = "unseen";
    if (sheet && name && !("story" in change && "remove" in change.story)) {
      const at: StageAt = { workspace: sheet.workspace };
      const deadline = Date.now() + PANEL_DRAW_MS;
      for (;;) {
        const { report } =
          // biome-ignore lint/performance/noAwaitInLoops: the panel redraws as Vite's HMR lands; one read at a time until it has
          (await deps.stage(at, sheet.files[0] as string, sheet.files)).opened;
        if (!unseen(report, name)) {
          frames = renderSaid(report).frames.filter(
            (one) => one.story === name
          );
          break;
        }
        if (Date.now() > deadline) {
          break;
        }
        await Bun.sleep(PANEL_DRAW_POLL_MS);
      }
    }
    return {
      file: written.edit?.file ?? "",
      lines: written.edit?.lines ?? { from: 0, to: 0 },
      formatted: written.edit?.formatted ?? null,
      story: story ? { name: story.name, args: story.args } : null,
      render: frames,
    };
  };

  /**
   * The report of a canvas just shown or written: the panel's, once its page
   * has drawn (it posts within a second of loading), else the daemon's own
   * draw in the machine's Chromium. A canvas is never answered `unseen` when
   * a browser could have drawn it.
   */
  const drawnReport = async (
    at: StageAt,
    files: string[],
    spec: CanvasSpec,
    opened: StageOpened,
    shownNow: boolean,
    story?: string
  ): Promise<RenderReport> => {
    let { report } = opened;
    const deadline = Date.now() + PANEL_DRAW_MS;
    while (shownNow && unseen(report, story) && Date.now() < deadline) {
      // biome-ignore lint/performance/noAwaitInLoops: the panel's page posts its report as it draws; one read at a time until it has
      await Bun.sleep(PANEL_DRAW_POLL_MS);
      ({ report } = (await deps.stage(at, files[0] as string, files)).opened);
    }
    return unseen(report, story)
      ? (await deps.stageRender(at, { files, spec })).report
      : report;
  };

  /**
   * Makes a component canvas in `owner`'s panel (or opens the one of that
   * name) on the stage of its maker's workspace, shows it, and answers what
   * a browser drew of it: the panel's draw, else the daemon's.
   */
  const createSheet = async (
    making: Making,
    input: ArtifactInput
  ): Promise<Created> => {
    const { owner, maker } = making;
    const asked = input.file === undefined ? [] : [input.file].flat();
    if (asked.length === 0) {
      throw new ArtifactRefusal(
        400,
        `A component canvas takes file: its states file, the .stories.ts beside the component (or a list, one section each). Example: ${COMPONENT_EXAMPLE}.`
      );
    }
    const problem = canvasProblem(input);
    if (problem) {
      throw new ArtifactRefusal(400, problem);
    }
    const at: StageAt = { session: maker };
    const { machineId, opened, workspace } = await deps.stage(
      at,
      asked[0] as string,
      asked
    );
    const spec = specOf(input.name, input);
    const files = opened.report.sections.map((one) => one.file);
    const source: PreviewSource = {
      port: opened.port,
      path: canvasPath(files, spec),
      workspace,
      stage: { dir: opened.dir, file: opened.file },
    };
    const now = new Date();
    const before = db.byName(owner.id, "component", input.name);
    const row = before
      ? (db.update(before.id, {
          source,
          machineId,
          madeBy: maker.id,
          ...askedOf(input),
          revision: before.revision + 1,
          updatedAt: now,
        }) as ArtifactRow)
      : db.create({
          id: crypto.randomUUID(),
          instanceId: owner.id,
          madeBy: maker.id,
          heldFor: null,
          projectId: owner.projectId ?? null,
          kind: "component",
          name: input.name,
          ...askedOf(input),
          machineId,
          source,
          revision: 1,
          seq: 0,
          deliveredSeq: 0,
          readSeq: 0,
          openedRevision: null,
          createdAt: now,
          updatedAt: now,
          shownAt: null,
        });
    stampMeta(row, null);
    writeStage(row, opened.state, opened.sheet);
    const shown = await handOver(making, before, row);
    if (!(shown.started || before)) {
      discard(row);
      throw new ArtifactRefusal(503, shown.why);
    }
    const owned = sheetOf(row);
    const report = await drawnReport(
      { workspace },
      owned?.files ?? asked,
      spec,
      opened,
      openedOf(shown).opened
    );
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      route: routeOf(row.id),
      ...openedOf(shown),
      stage: { ...sheetState(row, opened.state), errors: [] },
      render: { ...renderSaid(report), weight: weightSaid(opened.weight) },
      moves: movesSaid(report),
      errors: errorsSaid(sheetState(row, opened.state).errors),
      hint: READ_HINT,
    };
  };

  /**
   * A component canvas as the session reads it (component canvas §4): its
   * picks and pins, its stage, what a browser drew (each frame's state), its
   * moves, its stories with the interactions they reach, the person's dials
   * and tuned motion; on asking, one story's args and code, one frame's
   * computed-style delta, a fresh draw on the daemon, a picture. Read
   * afresh on the workspace it was made in: a use that keeps the stage
   * awake. A stage that can't be reached is read as the doc last had it,
   * `error` with why. Its owner's read when `ownersRead`.
   */
  const readSheet = async (
    row: ArtifactRow,
    since?: number,
    ownersRead = true,
    ask: ComponentReadAsk = {}
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a canvas's read joins its stage, its report, the person's picks and each optional ask in one answer
  ): Promise<ArtifactRead> => {
    const sheet = sheetOf(row);
    let failure: string | null = null;
    let opened: StageOpened | undefined;
    let report: RenderReport | undefined;
    let png: string | undefined;
    if (sheet) {
      const at: StageAt = { workspace: sheet.workspace };
      try {
        ({ opened } = await deps.stage(
          at,
          sheet.files[0] as string,
          sheet.files
        ));
        writeStage(row, opened.state, opened.sheet);
        ({ report } = opened);
        if (ask.render || ask.png) {
          const drawn = await deps.stageRender(at, {
            files: sheet.files,
            spec: sheet.spec,
            ...(ask.state ? { state: ask.state } : {}),
            ...(ask.png ? { png: true } : {}),
          });
          ({ report, png } = drawn);
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    }
    const meta = docs.doc(row.id).getMap("meta");
    const stage = meta.get("stage") as StageState | undefined;
    const sheetNow = meta.get("sheet") as SheetRead | undefined;
    const base = read(row, since, ownersRead);
    const {
      dials,
      tuned,
      layout: _layout,
      ...picks
    }: Record<string, ReadEntry | undefined> = base.state;
    const story = ask.story
      ? sheetNow?.stories.find((one) => one.name === ask.story)
      : undefined;
    if (ask.story && !story) {
      throw new ArtifactRefusal(
        404,
        `${row.name} has no story ${ask.story}; its stories are ${sheetNow?.stories.map((one) => one.name).join(", ") || "none"}.`
      );
    }
    return {
      ...base,
      state: picks,
      ...(stage
        ? {
            stage: failure
              ? {
                  ...stage,
                  status: "error" as const,
                  message: failure,
                  errors: [],
                }
              : { ...stage, errors: [] },
          }
        : {}),
      errors: errorsSaid(stage?.errors ?? []),
      ...(report
        ? {
            render: renderSaid(report),
            moves: movesSaid(report),
            stories: storiesSaid(sheetNow, report),
            ...(ask.state ? { frame: stateSaid(report, ask.state) } : {}),
          }
        : {}),
      ...(opened ? { weight: opened.weight } : {}),
      ...(dials === undefined ? {} : { dials: dials.value }),
      ...(tuned === undefined ? {} : { tuned: tuned.value }),
      ...(story && ask.detail === "story"
        ? {
            story: {
              name: story.name,
              args: story.args,
              code: story.code,
              meta: { args: sheetNow?.meta.args, code: sheetNow?.meta.code },
            },
          }
        : {}),
      ...(ask.png ? { png: png ?? null } : {}),
      hint: READ_HINT,
    } as ArtifactRead;
  };

  /** A design system round on component canvas `row`, asked by `requester`: what the ask did. */
  const askVerify = (
    requester: InstanceRow,
    row: ArtifactRow
  ): Promise<string> => {
    const sheet = sheetOf(row);
    if (!sheet) {
      return Promise.reject(
        new ArtifactRefusal(
          409,
          `${row.name} is a ${row.kind}: verify is a component canvas's.`
        )
      );
    }
    return deps.verify(requester, {
      id: row.id,
      kind: row.kind,
      name: row.name,
      projectId: row.projectId,
      workspaceId: sheet.workspace,
      files: sheet.files,
    });
  };

  /**
   * Whether a built page or a weighed folder holds what its `does` promises
   * (checks 3b and 5): a page for picking holds a choice, and a page or
   * folder for judging or picking is no catalogue of desk captures.
   */
  const deliversItsAsk = async (
    input: Pick<ArtifactInput, "does">,
    made: {
      html: string | null;
      program: BuiltProgram | undefined;
      weight: FolderWeight | undefined;
    }
  ): Promise<void> => {
    const { html, program, weight } = made;
    if (input.does === "pick") {
      const holds = program
        ? program.read.cards.length > 0
        : HTML_CHOICE.test(html ?? "");
      if (!holds) {
        throw new ArtifactRefusal(400, NO_CHOICE);
      }
    }
    if (!(input.does === "judge" || input.does === "pick")) {
      return;
    }
    let captures = weight?.captures ?? 0;
    if (html !== null && !program) {
      captures = await deskCaptures(html, dataUrlBytes);
    }
    if (captures > DESK_CAPTURES_PER_PAGE) {
      throw new ArtifactRefusal(400, capturesRefused(captures));
    }
  };

  /**
   * Checks 1 to 4b, before anything is built or started: a create says what
   * the person does there, in their words, on a kind that can deliver it.
   * The person's own composer canvas (`draft`) asks them nothing.
   */
  const asksFirst = (input: ArtifactInput): void => {
    if (input.draft) {
      return;
    }
    const { does, ask } = askedOf(input);
    const problem = askProblem(ask) ?? doesProblem(input, does);
    if (problem) {
      throw new ArtifactRefusal(400, problem);
    }
  };

  /** What a create names the person does there and its ask, as its row keeps them; refused with the tool's shape when it names neither. */
  const askedOf = (
    input: Pick<ArtifactInput, "does" | "ask">
  ): { ask: string; does: ArtifactDoes } => {
    if (input.does === undefined || input.ask === undefined) {
      throw new ArtifactRefusal(422, CREATE_SHAPE);
    }
    return { does: input.does, ask: input.ask };
  };

  /** A canvas (or the composer's draft) and a sheet are each made their own way; a page or preview is null here, made by `create` itself. */
  const madeOwnWay = (
    making: Making,
    input: ArtifactInput
  ): Promise<Created> | null => {
    if (input.kind === "canvas") {
      return input.draft
        ? Promise.resolve(createDraft(making.owner, input))
        : createCanvas(making, input);
    }
    return input.kind === "component" ? createSheet(making, input) : null;
  };

  /**
   * A decision page's choices: its program's decisions with their cards,
   * or the choice ids its HTML declares; empty for any other page.
   */
  const choicesAsked = (
    row: ArtifactRow
  ): { card?: DecisionCard; id: string }[] => {
    if (row.kind !== "page") {
      return [];
    }
    const program = programOf(row);
    if (program !== undefined) {
      return readKept(program).cards.map((card) => ({ id: card.id, card }));
    }
    let html: string;
    try {
      html = readFileSync(join(deps.root, row.id, "index.html"), "utf8");
    } catch {
      return [];
    }
    return [
      ...new Set([...html.matchAll(CHOICE_ATTRIBUTE)].map((match) => match[1])),
    ].map((id) => ({ id }));
  };

  /**
   * A page or preview put in the owner's panel: the one of that kind and
   * name it has, its source moved and its revision with it, or a new one;
   * the maker becomes its maker either way. A maker's re-create of one the
   * parent's panel shows goes to its next version (`held`,
   * {@link holdNext}). Answers it, and what was there.
   */
  const placed = (
    { owner, maker }: Making,
    input: Pick<ArtifactInput, "kind" | "name" | "does" | "ask">,
    at: { machineId: string | null; source: PreviewSource }
  ): {
    before: ArtifactRow | undefined;
    holding: ReturnType<typeof holdNext>;
    row: ArtifactRow;
  } => {
    const now = new Date();
    const before = db.byName(owner.id, input.kind, input.name);
    const asked = askedOf(input);
    if (before) {
      const holding = holdNext(maker, before);
      const target = holding?.next ?? before;
      const row = db.update(target.id, {
        ...at,
        ...asked,
        madeBy: maker.id,
        revision: target.revision + 1,
        updatedAt: now,
      }) as ArtifactRow;
      return { before, holding, row };
    }
    const row = db.create({
      id: crypto.randomUUID(),
      instanceId: owner.id,
      madeBy: maker.id,
      heldFor: null,
      projectId: owner.projectId ?? null,
      kind: input.kind,
      name: input.name,
      ...asked,
      ...at,
      revision: 1,
      seq: 0,
      deliveredSeq: 0,
      readSeq: 0,
      openedRevision: null,
      createdAt: now,
      updatedAt: now,
      shownAt: null,
    });
    return { before, holding: null, row };
  };

  /**
   * A preview handed to a parent, loaded first: no panel loads it to say it
   * failed, so one that doesn't answer is refused here, its served server let
   * go, and it never reaches the parent. Nothing for a page.
   */
  const answersFirst = async (at: Placed): Promise<void> => {
    const { kind, machineId, source } = at;
    if (!(kind === "preview" && machineId) || "page" in source) {
      return;
    }
    const down = await deps.reachable(machineId, source);
    if (!down) {
      return;
    }
    releaseServed(at);
    throw new ArtifactRefusal(
      503,
      `${notLoaded(at, down.failure)}${down.why ? ` (${down.why})` : ""} It wasn't handed to your parent.`
    );
  };

  /** The delegate that put it in its owner's panel, as `artifact_list` names it; nothing when the owner made it. */
  const handedBy = (row: ArtifactRow): { madeBy?: string } =>
    row.madeBy && row.madeBy !== row.instanceId ? { madeBy: row.madeBy } : {};

  /** Whether the person has something to do on it now, as `artifact_list` reads it for its owner. */
  const waitingOnPerson = (row: ArtifactRow): boolean => {
    const owner = deps.instance(row.instanceId);
    return !!owner && statusOf(owner, row).waitingOn.includes("person");
  };

  /** An answer about a held next version, said as its artifact's: that one's id, and the next version's as `held`. */
  const heldAnswer = <T extends { held?: string; id: string }>(
    answer: T
  ): T => {
    const row = db.get(answer.id);
    return row?.heldFor ? { ...answer, ...heldId(row) } : answer;
  };

  /**
   * New HTML for page `row` (its revision moves and every open view morphs
   * to it, its state kept), or a JSON Patch (RFC 6902) over its `state`
   * applied as one transaction; its read after, as `ownersRead` says.
   */
  const pageChanged = async (
    instance: InstanceRow,
    row: ArtifactRow,
    change: Exclude<PageChange, { statements: string }>,
    ownersRead: boolean
  ): Promise<ArtifactRead> => {
    if ("html" in change) {
      takesHtml(row);
      const { html } = await built(
        instance,
        row.name,
        { html: change.html },
        row.heldFor === null
      );
      const moved = db.update(row.id, nextRevision(row)) as ArtifactRow;
      writePage(moved.id, html);
      // Every page open on it hears the new revision in the doc and morphs
      // in place (the overlay); nothing reloads.
      stampMeta(moved, pageHash(html));
      return read(moved, undefined, ownersRead);
    }
    const doc = docs.doc(row.id);
    const before = stateOf(doc);
    const after = structuredClone(before) as Record<string, unknown>;
    const errors = applyPatch(after, change.patch);
    const failed = errors.findIndex((error) => error !== null);
    if (failed !== -1) {
      throw new ArtifactRefusal(
        422,
        `Operation ${failed} of the patch failed: ${errors[failed]?.message ?? "it does not apply"}. Nothing was changed.`
      );
    }
    const next = patchedEntries(
      before,
      after,
      metaOf(doc).pageHash ?? newestHash(before) ?? "0".repeat(64),
      new Date().toISOString()
    );
    const gone = Object.keys(before).filter((key) => !(key in after));
    docs.transact(row.id, "agent", (live) => {
      const state = live.getMap("state");
      for (const [key, entry] of Object.entries(next)) {
        state.set(key, entry);
      }
      for (const key of gone) {
        state.delete(key);
      }
    });
    return read(db.get(row.id) as ArtifactRow, undefined, ownersRead);
  };

  /** Decision page `row`'s program `existing` revised as `merged`, built, checked and written; what changed. */
  const programRevised = async (
    instance: InstanceRow,
    row: ArtifactRow,
    existing: string,
    merged: ReturnType<typeof mergeProgram>
  ): Promise<Revised> => {
    // Said before anything is written: the merged program's cards against the person's picks and the project's pages.
    const broken = await brokenBy(row, readKept(merged.merged).cards);
    const dir = docs.doc(row.id).getMap("meta").get("programDir");
    const page = await built(
      instance,
      row.name,
      {
        program: merged.merged,
        dir: typeof dir === "string" ? dir : undefined,
      },
      row.heldFor === null
    );
    const program = page.program as BuiltProgram;
    mediaHeld(deps.instance(row.instanceId) ?? instance, program);
    const before = new Set(readKept(existing).cards.map((card) => card.id));
    const after = program.read.cards.map((card) => card.id);
    const moved = db.update(row.id, nextRevision(row)) as ArtifactRow;
    writePage(moved.id, page.html, program);
    const hash = pageHash(program.program);
    stampMeta(moved, hash);
    return {
      id: moved.id,
      revision: moved.revision,
      pageHash: hash,
      statements: merged.change,
      decisions: after,
      moved: {
        added: after.filter((card) => !before.has(card)),
        removed: [...before].filter((card) => !after.includes(card)),
      },
      ...(program.dropped.length > 0 ? { dropped: program.dropped } : {}),
      ...(broken ? { broken } : {}),
    };
  };

  /** One artifact as `artifact_list` answers it, read for `caller`. */
  const statusOf = (caller: InstanceRow, row: ArtifactRow): ArtifactStatus => {
    const doc = docs.doc(row.id);
    const state = stateOf(doc);
    const { sentAt } = metaOf(doc);
    const unread = db.changes(row.id, { after: row.readSeq, by: "person" });
    const picksAwaiting = unread.filter(
      ({ key, seq }) => key in state && seq <= row.deliveredSeq
    ).length;
    const pins = Object.values(
      doc.getMap("pins").toJSON() as Record<string, Pin>
    ).filter((pin) => !pin.resolvedAt).length;
    const asked = choicesAsked(row);
    const picks =
      asked.length > 0
        ? {
            asked: asked.length,
            // A program's pick counts while its card still offers every option of it.
            made: asked.filter(({ card, id }) =>
              card ? pickOf(card, state[id]).picked : id in state
            ).length,
            unsent: Object.entries(state).filter(
              ([key, entry]) =>
                key !== PLACES_KEY && (!sentAt || entry.at > sentAt)
            ).length,
          }
        : undefined;
    const shown = deps.showing(row.instanceId) === row.id;
    const opened = row.openedRevision === row.revision;
    const draft = doc.getMap("meta").get("draft") === true;
    // Handed up and not opened, or a maker's change held for the parent to open.
    const handed =
      doc.getMap("meta").get(HANDED) === true ||
      db.heldOf(row.id) !== undefined;
    const waitingOn: ArtifactStatus["waitingOn"] = [];
    if (
      !draft &&
      ((shown && !opened) ||
        (picks && (picks.made < picks.asked || picks.unsent > 0)))
    ) {
      waitingOn.push("person");
    }
    if (
      !draft &&
      (handed ||
        picksAwaiting > 0 ||
        (row.kind === "canvas" && unread.length > 0))
    ) {
      waitingOn.push("session");
    }
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      does: row.does,
      ask: row.ask,
      ...(row.instanceId === caller.id ? {} : { session: row.instanceId }),
      ...handedBy(row),
      shown,
      opened,
      sent: sentOf(row),
      updatedAt: row.updatedAt.toISOString(),
      pins,
      unread: unread.length,
      picksAwaiting,
      ...(picks ? { picks } : {}),
      waitingOn,
    };
  };

  return {
    list: (instanceId: string): ArtifactSummary[] => {
      const instance = sessionOf(instanceId);
      deps.listing(instance);
      return db.ofInstance(instance.id).map(summaryOf);
    },

    /**
     * Files' search over the session's artifacts, by the find engine's own
     * matcher (find-names `matchOf`, what Find and the composer's finder
     * answer with): every word must match the name, the kind words, or the
     * words on its page, at the transcript's lower weight. Best match first,
     * then newest; a page that matched by its words brings the words round
     * the first hit (`excerptOf`).
     */
    search: (instanceId: string, q: string): ArtifactHit[] => {
      const query = parse(q);
      const rows = db.ofInstance(sessionOf(instanceId).id);
      if (query.tokens.length === 0) {
        return rows.map((row) => ({ id: row.id, excerpt: null }));
      }
      return rows
        .flatMap((row) => {
          const words = wordsOnPage(row);
          const match = matchOf(
            {
              asked: new Set([...KIND_WORDS.artifact, ...KIND_WORDS[row.kind]]),
              fields: [
                ...field("title", row.name),
                ...field("transcript", words),
              ],
            },
            query
          );
          if (match.score <= 0) {
            return [];
          }
          const excerpt =
            match.fields.includes("transcript") && query.words.length > 0
              ? excerptOf(words, query.words)
              : null;
          return [{ row, score: match.score, excerpt }];
        })
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.row.createdAt.getTime() - a.row.createdAt.getTime()
        )
        .map(({ row, excerpt }) => ({ id: row.id, excerpt }));
    },

    /**
     * A screen's thumbnail of a page or preview (the dashboard's pane takes
     * one per revision): kept beside the artifact's files, the latest only,
     * and named by the list from then on. A canvas keeps its own picture.
     */
    keepThumbnail: (
      instanceId: string,
      id: string,
      shot: {
        light: Uint8Array | null;
        dark: Uint8Array | null;
        single: boolean;
      }
    ): ArtifactThumbnail => {
      const row = own(sessionOf(instanceId), id);
      if (row.kind === "canvas") {
        throw new ArtifactRefusal(
          409,
          `${row.name} is a canvas: it keeps its own picture.`
        );
      }
      const light = shot.light ?? (shot.single ? null : shot.dark);
      const size = light ? pngSize(light) : null;
      if (!(light && size)) {
        throw new ArtifactRefusal(422, "A thumbnail needs a picture.");
      }
      writeStateFileSync(thumbnailPath(deps.root, id, "light"), light);
      if (shot.single || !shot.dark) {
        rmSync(thumbnailPath(deps.root, id, "dark"), { force: true });
      } else {
        writeStateFileSync(thumbnailPath(deps.root, id, "dark"), shot.dark);
      }
      const kept: ArtifactThumbnail = {
        at: new Date().toISOString(),
        single: shot.single || !shot.dark,
        ...size,
      };
      writeStateFileSync(
        thumbnailPath(deps.root, id, "json"),
        JSON.stringify(kept)
      );
      thumbnails.set(id, kept);
      return kept;
    },

    /** An artifact's latest picture in `scheme` (a single page's one picture in both), or null. */
    thumbnailFile: (id: string, scheme: "light" | "dark"): Buffer | null => {
      const row = db.get(id);
      if (!row) {
        throw new ArtifactRefusal(404, `No artifact ${id} on this hub.`);
      }
      if (row.kind === "canvas") {
        return pictureBytes(id);
      }
      const kept = keptThumbnail(id);
      if (!kept) {
        return null;
      }
      try {
        return readFileSync(
          thumbnailPath(deps.root, id, kept.single ? "light" : scheme)
        );
      } catch {
        return null;
      }
    },

    /**
     * `artifact_list`: the session's artifacts (a project's lead also gets
     * every session's of its project), newest first, each with whose move it
     * is; `waiting` keeps those where it is somebody's.
     */
    status: (instanceId: string, waitingOnly = false): ArtifactStatus[] => {
      const instance = sessionOf(instanceId);
      const rows = answerable(instance).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      const all = rows.map((row) => statusOf(instance, row));
      return waitingOnly ? all.filter((one) => one.waitingOn.length > 0) : all;
    },

    /**
     * An artifact by id with the session that made it, and whether that
     * session's panel shows it now: what its own tab opens on.
     */
    find: (
      id: string
    ): ArtifactSummary & { instanceId: string; shown: boolean } => {
      const row = db.get(id);
      if (!row) {
        throw new ArtifactRefusal(404, `No artifact ${id} on this hub.`);
      }
      return {
        ...summaryOf(row),
        instanceId: row.instanceId,
        shown: deps.showing(row.instanceId) === row.id,
      };
    },

    /**
     * Makes an artifact and shows it in the session's panel; with
     * `to: "parent"` readies it for its parent ({@link ownerFor}) unopened,
     * the parent told once and opening it itself ({@link handOver}).
     * A preview handed so is loaded first ({@link ArtifactServiceDeps.reachable}),
     * and one that doesn't answer is refused, nothing kept. A page or preview the panel's owner already has under
     * the same kind and name is replaced in place: its doc, and so every
     * pick, stays, and the caller becomes its maker. What it is made from (a
     * page's folder, a preview's workspace, a sheet's stage) is the caller's.
     */
    create: async (
      instanceId: string,
      input: ArtifactInput
    ): Promise<Created> => {
      const instance = sessionOf(instanceId);
      if (!ARTIFACT_NAME.test(input.name)) {
        throw new ArtifactRefusal(
          400,
          "A name is lowercase letters, digits and dashes, like onboarding, at most 63 characters."
        );
      }
      const stray = strayFields(input);
      if (stray) {
        throw new ArtifactRefusal(400, stray);
      }
      asksFirst(input);
      const making: Making = {
        maker: instance,
        owner: ownerFor(instance, input),
      };
      const ownWay = madeOwnWay(making, input);
      if (ownWay !== null) {
        return await ownWay;
      }
      let source: PreviewSource = { page: input.name };
      let machineId: string | null = null;
      let html: string | null = null;
      let program: BuiltProgram | undefined;
      let broken: GraphBroken | undefined;
      if (input.kind === "page") {
        ({ html, program, broken } = await createdPage(making, input));
      } else {
        ({ machineId, source } = previewSource(instance, input));
      }
      const weight =
        "dir" in source && machineId
          ? await deps.folderWeight(machineId, source.dir, source.path)
          : undefined;
      await deliversItsAsk(input, { html, program, weight });
      const stage = await serveFirst(source, machineId);
      if (handing(making)) {
        await answersFirst({
          kind: input.kind,
          name: input.name,
          machineId,
          source,
        });
      }
      const { before, holding, row } = placed(making, input, {
        source,
        machineId,
      });
      if (html !== null) {
        writePage(row.id, html, program);
      }
      stampMeta(row, pageHashOf(html, program));
      keepProgramDir(row, program, input.dir);
      // A held next version leaves the server its artifact shows up until it is opened (promote).
      keepServed(row, holding ? undefined : before, stage);
      const shown = await handOver(making, before, row, undefined, holding);
      if (!(shown.started || before) && input.kind === "preview") {
        // A preview nothing could start shows nothing: it is not kept. One
        // whose server did not answer stays in the panel, its failure on it.
        discard(row);
        throw new ArtifactRefusal(503, shown.why);
      }
      const said = heldId(row);
      return {
        ...said,
        kind: row.kind,
        name: row.name,
        route: routeOf(said.id),
        ...openedOf(shown),
        ...(stage ? { stage } : {}),
        ...(weight ? { weight } : {}),
        ...programAnswer(program),
        ...(broken ? { broken } : {}),
      };
    },

    /**
     * New HTML for a page (its revision moves and every open view morphs to
     * it, its state kept), or a JSON Patch (RFC 6902) over its `state` applied as one
     * transaction; the state after the change. A canvas's elements, deletes
     * or Mermaid; its outline after the change. Its owner's or its maker's
     * to call ({@link ownedOrMade}); what it answers is the owner's read only.
     */
    update: async (
      instanceId: string,
      id: string,
      change: Exclude<PageChange, { statements: string }> | CanvasChange
    ): Promise<ArtifactRead> => {
      const instance = sessionOf(instanceId);
      const found = ownedOrMade(instance, id);
      const ownersRead = found.instanceId === instance.id;
      const forCanvas = !("html" in change || "patch" in change);
      if (forCanvas !== (found.kind === "canvas")) {
        throw new ArtifactRefusal(
          409,
          found.kind === "canvas"
            ? `${found.name} is a canvas: it takes elements, delete or mermaid.`
            : `${found.name} is a ${found.kind}: elements, delete and mermaid are for a canvas.`
        );
      }
      const answer = await changedBy(instance, found, (row) =>
        "html" in change || "patch" in change
          ? pageChanged(instance, row, change, ownersRead)
          : updateCanvas(row, change, ownersRead)
      );
      return heldAnswer(answer);
    },

    /**
     * A decision page's revision: `statements` merged into its program by
     * name (decision-program.ts `mergeProgram`), built and checked as a
     * create's is, then every open view draws the new program in place, its
     * picks, notes and pins kept by id. Answers what changed, not the page.
     * Its owner's, its maker's, or any session's of its project
     * ({@link projectPage}), Caw's included: a later session links its
     * decisions by revising one statement. Its maker's, while the parent's
     * panel shows it, waits as its next version ({@link changedBy}); another
     * session's of the project lands on the page itself, or joins the next
     * version waiting for the parent, so opening that keeps it. Each merges
     * into the program of the row it lands on.
     */
    revise: async (
      instanceId: string,
      id: string,
      statements: string
    ): Promise<Revised> => {
      const instance = sessionOf(instanceId);
      const asked = db.get(id);
      const peer =
        asked &&
        asked.instanceId !== instance.id &&
        asked.madeBy !== instance.id
          ? projectPage(instance, id)
          : undefined;
      const found = peer ?? ownedOrMade(instance, id);
      if (programOf(found) === undefined) {
        throw new ArtifactRefusal(
          409,
          found.kind === "page"
            ? `${found.name} is an HTML page: revise it with html.`
            : `${named(found)} takes no statements: they revise a decision page's program.`
        );
      }
      const revisedOn = (row: ArtifactRow): Promise<Revised> => {
        // A next version is made from its artifact whole (holdNext), so it holds a program.
        const existing = programOf(row) as string;
        let merged: ReturnType<typeof mergeProgram>;
        try {
          merged = mergeProgram(existing, statements);
        } catch (error) {
          throw unmerged(error);
        }
        return programRevised(instance, row, existing, merged);
      };
      if (peer) {
        return heldAnswer(await revisedOn(db.heldOf(peer.id) ?? peer));
      }
      return heldAnswer(await changedBy(instance, found, revisedOn));
    },

    /**
     * A decision page's program and what its media show now, for the page
     * the hub serves (preview.ts `servePage`): the hash its overlay carries,
     * and each artifact its Canvas and Preview pieces name, null once the hub
     * no longer holds it. Null for any other page.
     */
    programServed: (
      id: string
    ): {
      hash: string;
      media: Record<string, { kind: ArtifactKind; name: string } | null>;
    } | null => {
      const row = db.get(id);
      const program = row ? programOf(row) : undefined;
      if (program === undefined) {
        return null;
      }
      const media: Record<string, { kind: ArtifactKind; name: string } | null> =
        {};
      for (const { id: shown } of readKept(program).artifacts) {
        const shownRow = db.get(shown);
        media[shown] =
          shownRow && shownRow.instanceId === row?.instanceId
            ? { kind: shownRow.kind, name: shownRow.name }
            : null;
      }
      return { hash: pageHash(program), media };
    },

    /**
     * The person's places of a decision page's cards on the project's graph
     * (decisions.ts `place`), kept in its state under `graph.places` by card
     * id, so a revision keeps them as it keeps picks. The hub's write: the
     * page's session hears nothing of it.
     */
    keepPlaces: (id: string, places: Record<string, GraphPlace>): void => {
      const doc = docs.doc(id);
      const entry: ChoiceEntry = {
        options: [],
        note: "",
        value: places,
        pageHash:
          metaOf(doc).pageHash ?? newestHash(stateOf(doc)) ?? "0".repeat(64),
        at: new Date().toISOString(),
      };
      const problem = choiceEntryProblem(PLACES_KEY, entry);
      if (problem) {
        throw new ArtifactRefusal(
          413,
          `The graph's places were not kept: ${problem}`
        );
      }
      docs.transact(id, "hub", (live) =>
        live.getMap("state").set(PLACES_KEY, entry)
      );
    },

    /** A decision page's program as the hub keeps it; undefined for an HTML page, any other artifact, or none. */
    program: (id: string): string | undefined => {
      const row = db.get(id);
      return row ? programOf(row) : undefined;
    },

    /**
     * The state, meta and sentAt; a canvas's outline and what the person
     * changed, with its picture when `png`; with no id, the session's
     * newest artifact. Its maker reads one it handed to its parent too,
     * which leaves the parent's unread as it was.
     */
    read: async (
      instanceId: string,
      id?: string,
      since?: number,
      png = false,
      ask: ComponentReadAsk = {}
    ): Promise<ArtifactRead> => {
      const instance = sessionOf(instanceId);
      const row = readTarget(instance, id);
      const ownersRead = readsForOwner(instance, row);
      if (row.kind === "canvas") {
        return heldAnswer(readCanvas(row, since, png, ownersRead));
      }
      if (row.kind !== "component") {
        return heldAnswer({
          ...read(row, since, ownersRead),
          ...(since === undefined ? programRead(row) : {}),
        });
      }
      const answer = await readSheet(row, since, ownersRead, {
        ...ask,
        png: png || ask.png,
      });
      return ask.verify
        ? { ...answer, verify: await askVerify(instance, row) }
        : answer;
    },

    /** `artifact_update` of a sheet by its owner or its maker: one story's args, or one story op, written by its stage. */
    sheetUpdate: async (
      instanceId: string,
      id: string,
      change: SheetChange
    ): Promise<ComponentWritten> => {
      const instance = sessionOf(instanceId);
      const row = ownedOrMade(instance, id);
      const written = await writeSheet(
        row,
        change,
        "agent",
        row.instanceId === instance.id
      );
      return componentWritten(row, change, written);
    },

    /**
     * `artifact_update` of a component canvas's edges, groups or dials: its
     * page's address changes, so the panel draws it again at the next
     * revision. Answers what changed and the canvas's new spec.
     */
    canvasUpdate: async (
      instanceId: string,
      id: string,
      input: CanvasInput
    ): Promise<{ id: string; revision: number; spec: CanvasSpec }> => {
      const instance = sessionOf(instanceId);
      const row = ownedOrMade(instance, id);
      const sheet = sheetOf(row);
      if (!(sheet && "port" in row.source)) {
        throw new ArtifactRefusal(
          409,
          `${row.name} is a ${row.kind}: edges, group and dials are a component canvas's.`
        );
      }
      const problem = canvasProblem(input);
      if (problem) {
        throw new ArtifactRefusal(400, problem);
      }
      const spec = specOf(row.name, {
        edges: input.edges ?? sheet.spec.edges,
        group: input.group ?? sheet.spec.group,
        dials: input.dials ?? sheet.spec.dials,
      });
      const { files } = canvasOf(row.source.path ?? "");
      const next = db.update(row.id, {
        source: { ...row.source, path: canvasPath(files, spec) },
        revision: row.revision + 1,
        updatedAt: new Date(),
      }) as ArtifactRow;
      stampMeta(next, null);
      if (deps.showing(next.instanceId) === next.id) {
        await show(next, "agent");
      }
      return { id: next.id, revision: next.revision, spec };
    },

    /**
     * `artifact_update` with `ask`, for any kind: the head's line changes in
     * every open view (it reads the doc's `meta.ask`), and the person's
     * last Send is answered, so the head asks again.
     */
    askUpdate: (
      instanceId: string,
      id: string,
      ask: string
    ): { ask: string; id: string } => {
      const row = ownedOrMade(sessionOf(instanceId), id);
      const problem = askProblem(ask);
      if (problem) {
        throw new ArtifactRefusal(400, problem);
      }
      db.update(row.id, { ask, updatedAt: new Date() });
      askNow(row.id, ask);
      // Every view of the panel hears the frame again with the new ask; nothing reloads.
      deps.relist(row.instanceId);
      return { id: row.id, ask };
    },

    /**
     * The person's Save in a sheet's inspector, or its story buttons: the
     * same write as the session's `artifact_update`, owed to the session.
     */
    sheetWrite: (
      instanceId: string,
      id: string,
      change: SheetChange
    ): Promise<ArtifactRead> =>
      writeSheet(own(sessionOf(instanceId), id), change, "person"),

    /** The panel's Verify on a component canvas: a round asked for its session, whose verdict reaches that session. */
    verifyFor: (instanceId: string, id: string): Promise<string> => {
      const session = sessionOf(instanceId);
      return askVerify(session, own(session, id));
    },

    /** `design_map`: the session's workspace's components, paged, or one component's card (agent stage.ts `stageComponents`). */
    designMap: (instanceId: string, ask: DesignQuery): Promise<DesignMap> =>
      deps.stageComponents({ session: sessionOf(instanceId) }, ask),

    /**
     * A component canvas's map for its panel: the component its states file
     * mounts, with what renders it (used in) and what it renders (made of),
     * each with its states, frames drawn, states files and frames in
     * miniature, read on the workspace its stage runs in.
     */
    mapOf: async (instanceId: string, id: string): Promise<CanvasMap> => {
      const row = own(sessionOf(instanceId), id);
      const sheet = sheetOf(row);
      const component = (
        docs.doc(row.id).getMap("meta").get("sheet") as SheetRead | undefined
      )?.meta.component;
      if (!(sheet && component)) {
        throw new ArtifactRefusal(
          409,
          sheet
            ? `${row.name}'s states file names no component the stage resolved, so it has no map.`
            : `${row.name} is a ${row.kind}: a map is a component canvas's.`
        );
      }
      const [card] = (
        await deps.stageComponents(
          { workspace: sheet.workspace },
          {
            dir: sheet.dir,
            component: join(sheet.dir, component),
            thumbs: true,
          }
        )
      ).components;
      if (!card) {
        throw new ArtifactRefusal(
          409,
          `${component} is no component the stage maps.`
        );
      }
      // States files as a canvas address names them: from the toolchain root.
      const ownFiles = (files: string[] | undefined) =>
        (files ?? []).map((file) => relative(sheet.dir, file));
      const node = (link: DesignLink): CanvasMapNode => ({
        name: link.name,
        file: link.file,
        at: link.at,
        states: link.states ?? 0,
        drawn: link.drawn ?? 0,
        statesFiles: ownFiles(link.statesFiles),
        thumb: link.thumb ?? null,
      });
      return {
        center: {
          name: card.name,
          file: card.file,
          at: null,
          states: card.states,
          drawn: card.drawn,
          statesFiles: ownFiles(card.statesFiles),
          thumb: card.thumb ?? null,
        },
        usedIn: Array.isArray(card.usedIn) ? card.usedIn.map(node) : [],
        madeOf: Array.isArray(card.madeOf) ? card.madeOf.map(node) : [],
      };
    },

    /**
     * The artifact's doc as a person's view reads it (the dashboard pane's
     * `viewOf`, artifact-doc.ts): its picks, and when they were last sent.
     * For the app's panel, which holds no doc of its own (a sheet's stage
     * reaches it on the preview frame). It is no read of the session's: its
     * read cursor stays, and a sheet's stage is neither woken nor waited on.
     */
    viewOf: (
      instanceId: string,
      id: string
    ): {
      choices: Record<string, ChoiceEntry>;
      sentAt: string | null;
    } => {
      const row = readable(sessionOf(instanceId), id);
      const doc = docs.doc(row.id);
      return {
        choices: stateOf(doc),
        sentAt:
          (doc.getMap("meta").get("sentAt") as string | undefined) ?? null,
      };
    },

    /**
     * A sheet's stage or a workspace preview's server as its doc keeps it,
     * for its preview frame (core `PreviewFrame.stage`); null for any other
     * artifact.
     */
    stageFor: (id: string): StageState | null => {
      const row = db.get(id);
      return row && (row.kind === "component" || servedOf(row))
        ? ((docs.doc(row.id).getMap("meta").get("stage") as
            StageState | undefined) ?? null)
        : null;
    },

    /**
     * A workspace's stage changed (the daemon's {@link StageFrame}): each
     * sheet and each served preview of the workspace on that stage's port
     * keeps its state, and a sheet with a compile error its session has not
     * heard has its delivery scheduled.
     */
    staged: (machineId: string, frame: StageFrame): void => {
      // A port preview naming the workspace; no folder matches "//".
      const rows = db.previewing({
        id: frame.workspace,
        machineId,
        path: "//",
      });
      for (const row of rows) {
        const port = sheetOf(row) || servedOf(row) ? row.source : null;
        if (!(port && "port" in port && port.port === frame.port)) {
          continue;
        }
        writeStage(row, frame.state);
        if (errorsOwed(row, docs.doc(row.id)).length > 0) {
          marked(row.id);
        }
      }
    },

    /** A canvas's `.excalidraw` file, its outline and its latest picture: what a send carries. */
    export: (id: string): CanvasExport => {
      const row = db.get(id);
      if (!row) {
        throw new ArtifactRefusal(404, `No artifact ${id} on this hub.`);
      }
      if (row.kind !== "canvas") {
        throw new ArtifactRefusal(
          409,
          `${row.name} is a ${row.kind}: only a canvas exports.`
        );
      }
      return {
        ...canvasFile(id),
        png: pictureOf(id),
        ...deps.previewAddress(row.instanceId),
      };
    },

    /**
     * Writes the artifact into its session's project folder at
     * `artifacts/<name>/` as one commit by the session, so it outlives the
     * session and reaches every checkout of the project; a promote again
     * commits it as it stands then over the same folder. Stamps the doc's
     * `meta.promoted`. Refused outside a project, and when git refuses.
     */
    promote: async (instanceId: string, id: string): Promise<Promoted> => {
      const instance = sessionOf(instanceId);
      const row = own(instance, id);
      const { projectId } = instance;
      if (!projectId) {
        throw new ArtifactRefusal(409, NO_PROJECT);
      }
      const folder = promotedFolder(row.name);
      const at = new Date().toISOString();
      const files = promotedFiles(instance, row, at);
      let commit: string;
      try {
        const there = new Set(await folderFileNames(projectId, folder));
        ({ sha: commit } = await changeFolderFiles(
          projectId,
          {
            writes: Object.entries(files).map(([name, content]) => ({
              path: `${folder}/${name}`,
              content,
            })),
            deletes: PROMOTED_FILES.filter(
              (name) => !(name in files) && there.has(name)
            ).map((name) => `${folder}/${name}`),
          },
          {
            author: { name: sessionLabel(instance).name },
            message: `Promote ${row.kind} ${row.name} from session ${instance.id.slice(0, 8)}`,
          }
        ));
      } catch (error) {
        if (!(error instanceof FolderRefusal)) {
          throw error;
        }
        throw notCommitted(row.name, error);
      }
      const promoted: ArtifactPromotion = { commit, at };
      docs.transact(row.id, "hub", (doc) =>
        doc.getMap("meta").set("promoted", promoted)
      );
      return { commit, path: `${folder}/` };
    },

    /** A draft canvas went out with a send: it is the session's to hold now. */
    sent: (instanceId: string, id: string): { draft: false } => {
      const row = own(sessionOf(instanceId), id);
      if (row.kind !== "canvas") {
        throw new ArtifactRefusal(
          409,
          `${row.name} is a ${row.kind}: only a canvas is sent from the composer.`
        );
      }
      docs.transact(row.id, "hub", (doc) =>
        doc.getMap("meta").set("draft", false)
      );
      return { draft: false };
    },

    /**
     * Brings an artifact to the front of its owner's panel and waits for a
     * view to have it on screen ({@link Opened}); a refusal when its server
     * could not be started. Its owner's to call, or the person's: what they
     * open is what the panel goes back to when the agent takes away
     * something it showed over it. A delegate that handed it up is refused:
     * its parent's panel changes only when the parent opens it. The owner's
     * show of one with a held next version (or of that version, by its id)
     * opens the next version ({@link promote}); the person's shows what the
     * panel has.
     */
    show: async (
      instanceId: string,
      id: string,
      by: PanelHand
    ): Promise<Opened> => {
      const instance = sessionOf(instanceId);
      const found = ownedOrMade(instance, id);
      let row = found.heldFor === null ? found : db.get(found.heldFor);
      if (!row) {
        throw new ArtifactRefusal(404, `This session has no artifact ${id}.`);
      }
      if (row.instanceId !== instance.id) {
        throw new ArtifactRefusal(
          409,
          `${named(row)[0]?.toUpperCase()}${named(row).slice(1)} is your parent's: it opens in their panel when they call artifact_show.`
        );
      }
      const next = by === "agent" ? db.heldOf(row.id) : undefined;
      if (next) {
        row = await promote(row, next);
      }
      const shown = await show(row, by);
      if (!shown.started) {
        throw new ArtifactRefusal(503, shown.why);
      }
      return openedOf(shown);
    },

    /**
     * Removes one of the session's artifacts (`artifact_delete`, the panel's
     * Remove); every view hears it on the frames it already follows. When
     * its panel showed it:
     * - the person's Remove shows the session's next newest artifact (a draft
     *   canvas still in the composer is not one), as closing a tab does;
     * - the agent's delete puts back what the person had in front before it
     *   ({@link ArtifactServiceDeps.personShown}), or closes the panel: an
     *   agent taking something away never brings a different artifact
     *   forward as if it wanted the person there.
     * Answers what the panel shows after.
     */
    remove: async (
      instanceId: string,
      id: string,
      by: PanelHand
    ): Promise<Removed> => {
      const instance = sessionOf(instanceId);
      const row = own(instance, id);
      const wasShown = deps.showing(instance.id) === row.id;
      discard(row);
      if (!wasShown) {
        deps.relist(instance.id);
        const shown = deps.showing(instance.id);
        const now = shown === undefined ? undefined : db.get(shown);
        return {
          showing: now ? { id: now.id, kind: now.kind, name: now.name } : null,
        };
      }
      const next = by === "person" ? nextNewest(instance) : personHad(instance);
      if (next && (await deps.open(next, by)).ok) {
        return { showing: { id: next.id, kind: next.kind, name: next.name } };
      }
      await deps.close(instance.id);
      return { showing: null };
    },

    /**
     * A view's word that it has (or could not load) the artifact at the
     * revision it was opened at: the show waiting on that revision answers
     * from it. A word on a revision no show waits for is kept for one that
     * starts waiting (a fast page answers before the publish returns).
     */
    shown: (instanceId: string, id: string, ack: ShownAck): { heard: true } => {
      const row = own(sessionOf(instanceId), id);
      if (ack.ok) {
        db.update(row.id, { openedRevision: row.revision });
      }
      const key = shownKey(row.id, ack.revision);
      const waiter = waiting.get(key);
      if (waiter) {
        waiter(ack);
      } else if (!heard.has(key)) {
        heard.set(key, ack);
        // Kept as long as a show could still come to wait for it.
        deps.lifetime.after(SHOWN_WAIT_MS, () => heard.delete(key));
      }
      return { heard: true };
    },

    /**
     * The pins on the session's artifacts (one, or all of them), with their
     * threads and anchors: `open` (unresolved), `resolved`, or `all`; with
     * `since`, only pins with something newer than it. Read by the session
     * itself (`bySession`, its comment_read tool), what it reads counts as
     * heard; the person's own reads of them (the app's pane) never do, or
     * every pin the app showed would be stamped heard and never delivered.
     */
    commentRead: (
      instanceId: string,
      query: {
        artifact?: string | undefined;
        bySession: boolean;
        filter: "open" | "resolved" | "all";
        since?: string | undefined;
      }
    ): CommentRead => {
      const instance = sessionOf(instanceId);
      const rows =
        query.artifact === undefined
          ? db.ofInstance(instance.id)
          : [readable(instance, query.artifact)];
      const readAt = new Date().toISOString();
      const newest = (pin: Pin) =>
        [pin.resolvedAt, pin.movedAt, ...pin.thread.map((entry) => entry.at)]
          .filter((at): at is string => !!at)
          .reduce((a, b) => (b > a ? b : a), pin.at);
      const artifacts = rows.flatMap((row) => {
        const doc = docs.doc(row.id);
        const groups = {
          ...(doc.getMap("moved").toJSON() as Record<string, InkGroup>),
          ...(doc.getMap("ink").toJSON() as Record<string, InkGroup>),
        };
        const pins = Object.values(
          doc.getMap("pins").toJSON() as Record<string, Pin>
        )
          .filter((pin) =>
            query.filter === "all"
              ? true
              : (query.filter === "resolved") === !!pin.resolvedAt
          )
          .filter((pin) => !query.since || newest(pin) > query.since)
          .sort((a, b) => a.number - b.number);
        if (query.bySession && takes(instance, row)) {
          readHeard(row.id, pins, readAt);
        }
        const answered = pins.map((pin) => {
          const inkBox = pin.ink ? groups[pin.ink]?.page : undefined;
          return inkBox ? { ...pin, inkBox } : pin;
        });
        const address =
          (doc.getMap("meta").get("sentUrl") as string | null | undefined) ??
          routeOf(row.id);
        return answered.length > 0
          ? [
              {
                id: row.id,
                kind: row.kind,
                name: row.name,
                address,
                pins: answered,
              },
            ]
          : [];
      });
      return { artifacts, at: readAt };
    },

    /** The agent answers a pin: an entry in its thread, by the agent, shown at once wherever the artifact is open. */
    commentReply: (
      instanceId: string,
      pinId: string,
      text: string,
      files?: string[]
    ): { entry: ThreadEntry; number: number; pin: string } => {
      const { row, pin } = pinOf(sessionOf(instanceId), pinId);
      if (pin.thread.length >= COMMENT_LIMITS.entries) {
        throw new ArtifactRefusal(
          409,
          `Pin ${pin.number}'s thread holds ${COMMENT_LIMITS.entries} entries, so this reply wasn't kept. Resolve the pin, or answer in the conversation.`
        );
      }
      const entry: ThreadEntry = {
        id: crypto.randomUUID(),
        by: "agent",
        text,
        at: new Date().toISOString(),
        ...(files && files.length > 0 ? { files } : {}),
      };
      // An answer means everything before it was heard (core `pinHeard`).
      const before = pinHeard(pin, pin, entry.at);
      docs.transact(row.id, "hub", (doc) =>
        doc
          .getMap("pins")
          .set(pin.id, { ...before, thread: [...before.thread, entry] })
      );
      return { pin: pin.id, number: pin.number, entry };
    },

    /** The agent resolves a pin, with a last reply when given; the person can reopen it. */
    commentResolve: (
      instanceId: string,
      pinId: string,
      text?: string
    ): { number: number; pin: string; resolvedAt: string } => {
      const { row, pin } = pinOf(sessionOf(instanceId), pinId);
      const at = new Date().toISOString();
      const thread = text
        ? [
            ...pin.thread,
            {
              id: crypto.randomUUID(),
              by: "agent" as const,
              text,
              at,
            },
          ].slice(-COMMENT_LIMITS.entries)
        : pin.thread;
      const resolved: Pin = { ...pin, thread, resolvedAt: at };
      // The agent's own resolve is not the person's to tell it of.
      docs.transact(row.id, "hub", (doc) =>
        doc.getMap("pins").set(pin.id, {
          ...resolved,
          ...(pin.heard === undefined ? {} : { heard: pinSaid(resolved) }),
        })
      );
      return { pin: pin.id, number: pin.number, resolvedAt: at };
    },

    /**
     * The page's pictures of the marks the person just made there (core
     * `MarkPictures`), each a crop round one mark, by the pin's or the
     * stroke group's id: the next delivery carries the ones it delivers. A
     * later post replaces a mark's picture.
     */
    pictures: (
      instanceId: string,
      id: string,
      body: MarkPictures
    ): { held: number } => {
      const row = own(sessionOf(instanceId), id);
      const kept: { pictures: Map<string, string>; url?: string } = held.get(
        row.id
      ) ?? { pictures: new Map() };
      for (const picture of body.pictures) {
        kept.pictures.set(picture.mark, picture.png);
      }
      if (body.url) {
        kept.url = body.url;
      }
      held.set(row.id, kept);
      return { held: kept.pictures.size };
    },

    /**
     * After a restart: each artifact changed within the last day has its
     * delivery scheduled again, so marks written just before the hub went
     * down still go (nothing owed, nothing goes). A day, our call: a hub down
     * longer than that has a person who has moved on from those marks.
     */
    resumeMarks: (): void => {
      for (const row of db.touchedSince(new Date(Date.now() - 86_400_000))) {
        marked(row.id);
      }
    },

    /**
     * The person sends their picks, by the page's `cawco.send` (a decision
     * page's "Send picks"): what the send applies first (`sending`), then
     * the session hears that the artifact has new responses since the last
     * it was told of ({@link ArtifactServiceDeps.signal}); the page's words
     * are kept as `sentText` for `artifact_read`. Pins and ink are not sent:
     * they go by themselves ({@link MARKS_QUIET_MS}).
     */
    send: async (
      instanceId: string,
      id: string,
      body: SendBody
    ): Promise<ArtifactChoices> => {
      const instance = sessionOf(instanceId);
      const row = own(instance, id);
      const doc = docs.doc(row.id);
      const state = stateOf(doc);
      const { sentAt } = metaOf(doc);
      const picked = Object.values(state).some(
        (entry) => !sentAt || entry.at > sentAt
      );
      if (!(picked || body.text)) {
        throw new ArtifactRefusal(
          409,
          "Nothing new to send: every pick here has gone to the session."
        );
      }
      if (picked) {
        await deps.sending(instance, row, state);
      }
      await deps.signal(instance, row, { since: row.deliveredSeq });
      const at = new Date().toISOString();
      docs.transact(row.id, "hub", (live) => {
        const meta = live.getMap("meta");
        meta.set("sentAt", at);
        meta.set("sentText", body.text || null);
      });
      db.update(row.id, { deliveredSeq: (db.get(row.id) as ArtifactRow).seq });
      return { choices: state, ...metaOf(doc) };
    },
  };
};

export type Artifacts = ReturnType<typeof createArtifacts>;
