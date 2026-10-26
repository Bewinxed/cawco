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
 * ink go to the session by themselves once quiet {@link COMMENTS_QUIET_MS},
 * as one message ({@link ArtifactServiceDeps.deliverMarks}); a sheet's
 * saves and compile errors go the same way once quiet {@link MARKS_QUIET_MS}.
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import {
  type AgentRow,
  ARTIFACT_NAME,
  type ArtifactChoices,
  type ArtifactDoes,
  type ArtifactHit,
  type ArtifactKind,
  type ArtifactNeedsRead,
  type ArtifactPending,
  type ArtifactPromotion,
  type ArtifactSummary,
  type ArtifactThumbnail,
  ASK_BANNED,
  ASK_PATHLIKE,
  artifactCommentsNotice,
  artifactErrorsNotice,
  artifactLink,
  artifactSavesNotice,
  artifactToolWords,
  type ChoiceEntry,
  changeLink,
  choiceEntryProblem,
  DESK_CAPTURE_WIDTH,
  DESK_CAPTURES_PER_PAGE,
  decisionLink,
  fileHash,
  type InstanceRow,
  machineLabel,
  noteText,
  type PlanStep,
  type PlanWait,
  type PreviewAddress,
  type PreviewSource,
  pinLink,
  type SendAttachment,
  type ShownFailure,
  sessionLink,
  stepWaitsOnArtifact,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import {
  CANVAS_LIMITS,
  type CanvasEntry,
  canvasOutline,
  excalidrawFile,
  NO_SCREEN,
} from "@cawco/core/canvas";
import { dataUrlBytes, deskCaptures } from "@cawco/core/captures";
import {
  ACTIVITY_LIMIT,
  type ArtifactChanges,
  activityLines,
  activityOf,
  answerChanges,
  answeredLines,
  askedAgainLine,
  bindChanges,
  type Carried,
  CHANGES_LIMIT,
  type ChangedItem,
  COMMENT_LIMITS,
  type CommentAttachment,
  carryChanges,
  inkSection,
  type MarkPictures,
  newAnswer,
  type Pin,
  pinAsks,
  pinDelivery,
  pinReady,
  pinSaid,
  pinStandsOn,
  pinUnsent,
  readPin,
  readPins,
  SEND_CONTROLS,
  type SendBody,
  seeChanges,
  seenOf,
  seePin,
  stampHeard,
  type ThreadEntry,
  unheardEntries,
  writeDelivery,
  writeEntry,
  writeResolve,
  wroteLine,
} from "@cawco/core/comments";
import {
  type AfterLinks,
  type DecisionCard,
  pickMade,
  pickOf,
  picksMade,
} from "@cawco/core/decisions";
import {
  excerptOf,
  field,
  KIND_WORDS,
  matchOf,
  parse,
} from "@cawco/core/find-match";
import type { InkGroup } from "@cawco/core/ink";
import { pinName } from "@cawco/core/pin-name";
import { type FolderWeight, pageHash } from "@cawco/core/preview-proxy";
import {
  type CanvasDial,
  type CanvasEdge,
  type CanvasMap,
  type CanvasMapNode,
  type CanvasShapes,
  type CanvasSpec,
  canvasOf,
  canvasPath,
  type DesignLink,
  type DesignMap,
  type DesignQuery,
  type EmbedShape,
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
  type StageUnreached,
  type StoryOp,
} from "@cawco/core/stage";
import { writeStateFileSync } from "@cawco/core/state-file";
import { DAY_MS } from "@cawco/core/time";
import { applyPatch, type Operation } from "rfc6902";
import type { Doc, YMapEvent } from "yjs";
import type { ArtifactRow, ArtifactsDb } from "../db/artifacts";
import {
  type ArtifactNamed,
  type BuiltProgram,
  mergeProgram,
  PROGRAM_FILE,
  ProgramRefusal,
  readKept,
  type StatementChange,
} from "../decision-program";
import type { AskedArtifact } from "../design-verify";
import { byHandle, HANDLE_MIN } from "../handles";
import { sessionLabel } from "../labels";
import type { HubLifetimeShape, HubTimer } from "../lifetime";
import { storedFilePath } from "../media";
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
import { heldPictures } from "./held-pictures";
import {
  type ArtifactAsked,
  type ArtifactFacts,
  type ArtifactSessions,
  mayWait,
  movedOn,
  needOf,
  noticeOf,
  pendingOf,
} from "./needs";
import {
  bytesHash,
  cardChanges,
  cssEscape,
  htmlChanges,
  pictureChanges,
  sceneChanges,
} from "./page-changes";
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

/** A page's files as they stood before a revision wrote the next: its HTML, a decision page's program, and its pictures' fingerprints by address. */
interface PageWas {
  files: ReadonlyMap<string, string>;
  html: string;
  program?: string;
}

/**
 * Pin `pin`'s link on artifact `artifact`, labelled by what it stands on
 * (core pin-name.ts): what the agent names it by to the person, drawn as
 * the pin's chip (core references.ts).
 */
const linkOfPin = (artifact: string, pin: Pin): string =>
  pinLink(artifact, pin.number, pinName(pin));

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
    return artifactToolWords.askInTheirWords;
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
const HTML_CHOICE = /data-cawco-choice=|<(input|select|textarea)[^>]*\sname=/iu;

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

/** The session a handed file is written for, and the machine of the workspace it is written into. */
export interface HandedReceiver {
  machineId: string;
  session: InstanceRow;
}

/**
 * One file of an artifact handed to another session (hub handed-inputs.ts):
 * its bytes, or, for a preview's pass, the bytes made for the session it is
 * handed to once that session stands, in the workspace it reads them in.
 */
export interface HandedArtifactFile {
  bytes: Buffer | ((receiver: HandedReceiver) => Promise<Buffer>);
  name: string;
}

/** A value as a JSON file a session reads. */
const jsonFile = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

/** A whole artifact id, which needs no resolving. */
const WHOLE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** An entry as `artifact_read` answers it. */
type ReadEntry = ChoiceEntry & { earlierRevision?: true };

/**
 * One choice a page asks the person (a decision page's question, or a
 * `data-cawco-choice` an HTML page declares), as they answered it: not yet
 * (`open`, perhaps with a note), with options (`picked`), picked then
 * unpicked (`cleared`), or with an option a revision took out (`gone`).
 * `earlierRevision`: answered on a revision before the one shown now.
 */
export type DecisionAnswer = {
  id: string;
  /** Its question; a choice an HTML page declares has none. */
  question?: string;
} & (
  | { answer: "open"; note?: string }
  | {
      answer: "picked";
      at: string;
      earlierRevision?: true;
      note?: string;
      options: { id: string; label?: string }[];
    }
  | { answer: "cleared"; at: string; earlierRevision?: true; note?: string }
  | {
      answer: "gone";
      at: string;
      earlierRevision?: true;
      gone: string[];
      note?: string;
      options: string[];
    }
);

export interface ArtifactRead {
  /** A canvas's elements the person changed since `since` (or since your last read). */
  changed?: string[];
  /** A canvas's elements you replaced that the person had changed since your last read: "<id> changed under you". */
  changedUnderYou?: string[];
  /** A page's choices in page order, each answered or not ({@link DecisionAnswer}); on every read of a page that asks any. */
  decisions?: DecisionAnswer[];
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
  /** What this update changed on the page, each by its link (`[label](cawco:change/<artifact>/<anchor>)`): what the agent names each to the person by. */
  marked?: string[];
  missing?: string[];
  name: string;
  /** A canvas, as you read it: one line per element (core `canvasOutline`). */
  outline?: string;
  /** A built page's hash, which each pick records; null for a preview (the hub never built it) and a canvas. Wire-pinned: installable app builds decode it. */
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
  /** When the person last pressed Send; null before they have (and on a canvas, which has no Send). */
  sentAt: string | null;
  /** What the page's `cawco.send(text)` sent with the person's last send. */
  sentText?: string;
  /** The cursor for the next read's `since`. */
  seq: number;
  /** A sheet as its stage reads it: its stories with their args, its meta, and each component's props. */
  sheet?: SheetRead;
  /** A sheet's stage: its status, and the compile errors standing in the modules the sheet imports. A served preview's: its server's status, and why it is in `error`. */
  stage?: StageState;
  /** Every key, or with `since` only those changed after it; a canvas's is empty. */
  state: Record<string, ReadEntry>;
  /** A component canvas's stage the read couldn't reach: which hop, why, and since when; `stage` is then the doc's last word of it. */
  unreached?: StageUnreached;
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
 * the project's links between pages, for its writer to put back or tell
 * the person.
 * Each list only when it has something.
 */
export interface PageBroken {
  /** Decisions it lacks (taken out, or never written) that another page comes after, with the `page#card`s that do: no link is made for them. */
  after?: Record<string, string[]>;
  /** Options taken out that the person picked, by decision: the pick is kept, and its card says the option is gone. */
  options?: Record<string, string[]>;
  /** Decisions taken out that the person picked: the pick is kept, on no card. */
  picked?: string[];
  /** Its `after`s naming no decision of the project's: no link is made for them. */
  unlinked?: string[];
}

/**
 * What a decision page's revision (`statements`) answers: what it changed,
 * not the page. The person's picks are read with `artifact_read`.
 */
export interface Revised {
  /** What it left broken on the picks and the links; absent when nothing. */
  broken?: PageBroken;
  /** The cards it put in or rewrote, each by its link (`[question](cawco:decision/<artifact>/<card>)`), by id. */
  cards: Record<string, string>;
  /** Its decisions now, by id, in page order. */
  decisions: string[];
  /** Components the library does not have, dropped and never drawn. */
  dropped?: string[];
  /** Your change waits as this next version: your parent had opened the artifact, and their panel keeps the version they opened until they call artifact_show. */
  held?: string;
  id: string;
  /** What it changed on the page, each by its link (`[label](cawco:change/<artifact>/<anchor>)`). */
  marked?: string[];
  /** Decisions the revision added or took out, by id; a removed one's pick is kept. */
  moved: { added: string[]; removed: string[] };
  pageHash: string;
  revision: number;
  /** Statements by name: new, rewritten, and dropped because nothing reaches them. */
  statements: StatementChange;
}

/** A decision page's choice, as the kit marks it (`data-cawco-choice="<id>"`). */
const CHOICE_ATTRIBUTE = /\bdata-cawco-choice="([^"]+)"/gu;

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
  /** That delegate's link, `[title](cawco:session/<id>)`, what the agent names it by. */
  madeByLink?: string;
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
  /** That session's link, what the agent names it by. */
  sessionLink?: string;
  /** Whether its session's panel shows it now. */
  shown: boolean;
  /** The person's changes (picks, notes, drawn elements) since the session last read it. */
  unread: number;
  updatedAt: string;
  /** Whose move it is: the person's (what Needs you lists it for: never opened, picks not made, marks not sent, an answer not looked at, its ask not retired), the session's (sent picks, a canvas's changes unread, or handed to it or changed by a delegate and not opened yet). */
  waitingOn: ("person" | "session")[];
}

export interface Created {
  /** What a decision page's program left broken on the picks and the links; absent when nothing. */
  broken?: PageBroken;
  /** A decision page's cards' links, by id (`[question](cawco:decision/<artifact>/<card>)`): what the agent names each by. */
  cards?: Record<string, string>;
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
  /** Its link, `[name](cawco:artifact/<id>)`: what the agent names it by to the person. */
  link?: string;
  /** Made again under its name: what it changed, each by its link (`[label](cawco:change/<artifact>/<anchor>)`). */
  marked?: string[];
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

/** What `artifact_show` answers: {@link Opened}, with the artifact's link, `[name](cawco:artifact/<id>)`, which the agent names it by and its tool row draws. */
export type Shown =
  { link: string; opened: true } | { link: string; opened: false; why: string };

/**
 * What `artifact_browse` answers: the address the session's own browser
 * loads, an entry that sets the session's pass, and when that pass stops
 * opening (ISO).
 */
export interface Browsed {
  expiresAt: string;
  url: string;
}

/** How long a show waits for a view to say it has the artifact on screen. The spec's number. */
export const SHOWN_WAIT_MS = 10_000;

/** No view of the session said it showed the artifact in time. WORDS.md's error formula. */
export const NO_VIEW =
  "No open dashboard is showing this session. The artifact is in the session's panel and opens when one is.";

/** Why a `to: "parent"` create opened nothing: the parent opens it. */
const HELD = artifactToolWords.handedToParent;

/** Why a maker's change opened nothing: the parent had opened the artifact, so the change waits as its next version ({@link holdNext}). */
const HELD_NEXT = artifactToolWords.heldAsNext;

/** The doc meta key of an artifact handed to its parent and not opened since (service `handOver`). */
const HANDED = "handed";

/** The doc meta key of a preview whose folder its machine said is gone at its last start, with the daemon's words (service `sourceSeen`). */
const SOURCE_GONE = "sourceGone";

/** The doc meta key of an option's media whose decision page went: the page's id (service `discard`). */
const MEDIA_OF = "mediaOf";

/** A Not now's notice id (core `notNowId`): the artifact, and the raise it put away. */
const NOT_NOW = /^artifact-not-now:([0-9a-f-]{36}):(\d+)$/u;

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
    /** Its link, `[name](cawco:artifact/<id>)`: what the agent names it by to the person. */
    link: string;
    name: string;
    /** Each with its link, `[label](cawco:pin/<artifact>/<number>)`. */
    pins: (Pin & { inkBox?: InkGroup["page"]; link: string })[];
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

const PAGE_HIDDEN = /<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/giu;
const PAGE_TAG = /<[^>]+>/gu;
const PAGE_ENTITY = /&(amp|lt|gt|quot|#39|apos|nbsp);/gu;
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};
const PAGE_SPACES = /\s+/gu;

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

const TRAILING_DOT = /\.$/u;

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

/**
 * What the person still owes on one decision page a build names (work-items
 * `buildsFrom`): its cards with no pick, and its cards with an open pin,
 * each card one the build names (every card, when it names the page whole).
 */
export interface PageOwed {
  artifactId: string;
  cards: {
    id: string;
    /** Its open pins, by number. */
    pins: number[];
    question: string;
    unpicked: boolean;
  }[];
  /** The page's title, else its name. */
  title: string;
}

/**
 * Whether `pin` stands on decision card `choice`: its selector starts at the
 * card's own identity (Decision.svelte's `id="decision-<id>"`, its note's
 * ids under it, or `data-cawco-choice`), as the overlay names an element
 * inside the card (agent preview-overlay page.ts `selectorOf`).
 */
const pinOnChoice = (pin: Pin, choice: string): boolean => {
  if (!("selector" in pin.anchor)) {
    return false;
  }
  const { selector } = pin.anchor;
  const id = cssEscape(choice);
  return [
    `#decision-${id}`,
    `#decision-${id}-note`,
    `#decision-${id}-note-label`,
    `[data-cawco-choice="${id}"]`,
  ].some((own) => selector === own || selector.startsWith(`${own} `));
};

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

/** How the person answered one choice a page asks ({@link DecisionAnswer}), from its entry in the doc's state. */
const answerOf = (
  asked: { card?: DecisionCard; id: string },
  entry: ChoiceEntry | undefined,
  current: string | null
): DecisionAnswer => {
  const { card, id } = asked;
  const question = card ? { question: card.question } : {};
  if (!entry) {
    return { id, ...question, answer: "open" };
  }
  const said = {
    at: entry.at,
    ...(current && entry.pageHash !== current
      ? { earlierRevision: true as const }
      : {}),
    ...(noteText(entry.note) ? { note: noteText(entry.note) as string } : {}),
  };
  if (entry.options.length === 0) {
    // A note with no pick is still open; a pick taken back, cleared.
    return said.note
      ? { id, ...question, answer: "open", note: said.note }
      : { id, ...question, answer: "cleared", ...said };
  }
  // Picked by the one rule every count reads (core `pickMade`); else a pick on options a revision took out.
  if (!pickMade(card, entry)) {
    return {
      id,
      ...question,
      answer: "gone",
      options: entry.options,
      gone: card ? pickOf(card, entry).gone : [],
      ...said,
    };
  }
  return {
    id,
    ...question,
    answer: "picked",
    options: entry.options.map((option) => {
      const label = card?.options.find((one) => one.id === option)?.label;
      return label ? { id: option, label } : { id: option };
    }),
    ...said,
  };
};

/** The person's picks and notes written since their last send: what Send sends of the page's choices. */
const unsentChoices = (
  state: Record<string, ChoiceEntry>,
  sentAt: string | null
): number =>
  Object.values(state).filter((entry) => !sentAt || entry.at > sentAt).length;

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

/** A section's problem as a delivery has heard it: the same one again is not news. */
const errorKey = (error: StageError): string =>
  `${error.kind}:${error.file}:${error.line}:${error.column}:${error.message}`;

/** Each problem's heading in a delivery, by its kind, before its place. */
const ERROR_HEADING: Record<NonNullable<StageError["kind"]>, string> = {
  missing: "States file missing:",
  compile: "Compile error at",
  page: "Didn't load at",
};

/** One section's problem in a delivery: what and where, the stage's or Vite's words, and its code frame. */
const errorSection = (error: StageError): string => {
  const at = `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}`;
  return [
    `## ${ERROR_HEADING[error.kind ?? "compile"]} ${at}`,
    `- ${error.message.split("\n")[0]}`,
    ...(error.frame ? ["```", error.frame, "```"] : []),
  ].join("\n");
};

/**
 * Who moved a session's panel: the person (a press in the panel, the artifact
 * menu, a pin's link, a page's Open to draw), or the agent through its tools.
 */
export type PanelHand = "person" | "agent";

/** What `artifact_delete` and the panel's Remove answer: the artifact removed, and what the session's panel shows now, or null for nothing. */
export interface Removed {
  /** The artifact the call named, as it was resolved before it went. */
  removed: { id: string; kind: ArtifactKind; name: string };
  showing: { id: string; kind: ArtifactKind; name: string } | null;
}

/** A sentence's closing full stop, for one folded into another. */
const FINAL_STOP = /\.$/u;

/**
 * How one stored attachment rides a delivery: a picture as an image block
 * while the message has room (core `COMMENT_LIMITS.pictures`, each at most
 * `pictureChars`), past that as a file; a text folded in; anything else a
 * file the session's machine keeps.
 */
function carryOne(
  one: CommentAttachment,
  bytes: Buffer,
  images: { data: string; mediaType: string }[]
): { attachment?: SendAttachment; carried: Carried } {
  if (one.kind === "image" && images.length < COMMENT_LIMITS.pictures) {
    const data = bytes.toString("base64");
    if (data.length <= COMMENT_LIMITS.pictureChars) {
      images.push({ data, mediaType: one.mediaType });
      return { carried: { picture: images.length } };
    }
  }
  if (one.kind === "text") {
    return {
      carried: { as: "text" },
      attachment: {
        kind: "text",
        name: one.name,
        content: bytes.toString("utf8"),
      },
    };
  }
  return {
    carried: { as: "file" },
    attachment: {
      kind: "file",
      name: one.name,
      mediaType: one.mediaType,
      ref: one.ref,
      size: one.size,
    },
  };
}

/**
 * How long a sheet's saves and compile errors stay quiet before they go to
 * the session: since the last one. A burst of saves is a few seconds
 * apart, so 10 s of nothing reads as the burst done without leaving the
 * session waiting long for it. Our call.
 */
export const MARKS_QUIET_MS = 10_000;

/**
 * How long the person's comments, replies, resolves and ink stay quiet
 * before they go to the session, since their last one: the owner's pick,
 * "Go by themselves" (2026-10-23), a few seconds after they're written. Past
 * the page's own pause before it posts their pictures (preview-overlay
 * page.ts `PICTURES_AFTER_MS`, 1.5 s), so the delivery carries them. 3 s,
 * our call.
 */
export const COMMENTS_QUIET_MS = 3000;

/**
 * The longest a burst waits from its first mark: someone pinning steadily
 * for a minute is not held back past it. Our call.
 */
export const MARKS_LONGEST_MS = 60_000;

/** What a delivery of the person's marks carries: the words, the pictures, and the texts and files their comments attach. */
export interface MarksDelivery {
  /** The texts folded in and the files the session's machine keeps (core attachments.ts), as a send carries them. */
  attachments: SendAttachment[];
  images: { data: string; mediaType: string }[];
  /** The comments notice (core `artifactCommentsNotice`), its sections the marks themselves. */
  text: string;
}

/** The person's marks as the journal names them: each pin by number and id, then the loose stroke groups' count. */
const marksNamed = (pins: Pin[], strokes: number): string =>
  [
    ...(pins.length > 0
      ? [
          `${pins.length === 1 ? "pin" : "pins"} ${pins.map((pin) => `${pin.number} (${pin.id})`).join(", ")}`,
        ]
      : []),
    ...(strokes > 0
      ? [`${strokes} ${strokes === 1 ? "stroke group" : "stroke groups"}`]
      : []),
  ].join(" and ") || "no marks";

/** Whether someone took a delivery of the marks; why not, when no one did. */
export type MarksOutcome = { ok: true } | { ok: false; reason: string };

/** Artifact `row` as the journal names it: its id, kind and name. */
const labelOf = (row: Pick<ArtifactRow, "id" | "kind" | "name">): string =>
  `${row.id} (${row.kind} "${row.name}")`;

/**
 * A step of a show that takes longer than this is said in the journal. Our
 * call: on a scratch fleet the open read 1-83 ms and the publish 0-3 ms, and
 * a live show spent 8.9 s outside its wait for a view, which the journal
 * named nowhere.
 */
export const SLOW_SHOW_STEP_MS = 300;

/** One step of a show: its open, its machine's listener reached, its frame published, or its wait for a view. */
export type ShowStep = "open" | "reach" | "publish" | "shown wait";

/**
 * Runs step `step` of a show of `artifact` in session `panel`'s panel, and
 * says it in the journal when it took longer than {@link SLOW_SHOW_STEP_MS},
 * with the step, the artifact and the time. `counts` leaves out an outcome
 * whose own answer says why it took long: a wait no view answered is the
 * known "no dashboard is showing this session", which the show answers.
 */
export const timedShowStep = async <T>(
  step: ShowStep,
  artifact: Pick<ArtifactRow, "id" | "kind" | "name">,
  panel: string | null,
  run: () => T | Promise<T>,
  counts: (value: T) => boolean = () => true
): Promise<T> => {
  const started = performance.now();
  const value = await run();
  const ms = Math.round(performance.now() - started);
  if (ms > SLOW_SHOW_STEP_MS && counts(value)) {
    console.warn(
      artifactToolWords.showStepSlow(labelOf(artifact), step, ms, panel)
    );
  }
  return value;
};

/** The person's marks on artifact `row` found no session holding it: the journal says they stay owed. */
const sayNoHolder = (row: ArtifactRow, owed: number) => {
  if (owed > 0) {
    console.warn(artifactToolWords.marksUnheld(labelOf(row)));
  }
};

/**
 * One page Send in the journal: which route took it and which control the
 * sender named, then what it carried, or why it was refused. The owner,
 * after a Send no one could trace: "make every page send log one line
 * naming its route and control".
 */
const saySend = (
  row: ArtifactRow,
  body: SendBody,
  route: string,
  outcome: string
) =>
  console.log(
    artifactToolWords.pageSent(
      labelOf(row),
      body.control
        ? SEND_CONTROLS[body.control]
        : artifactToolWords.sendUnnamed,
      route,
      outcome
    )
  );

/** One delivery of artifact `row`'s marks in the journal: what it carried, for which session, and whether someone took it. */
const sayDelivery = (
  row: ArtifactRow,
  instance: InstanceRow,
  went: {
    errors: number;
    outcome: MarksOutcome;
    pins: Pin[];
    retry: boolean;
    saves: number;
    strokes: number;
  }
) => {
  const carried = [
    marksNamed(went.pins, went.strokes),
    ...(went.errors > 0 ? [`${went.errors} compile error(s)`] : []),
    ...(went.saves > 0 ? [`${went.saves} save(s)`] : []),
  ].join(", ");
  if (went.outcome.ok) {
    console.log(
      artifactToolWords.marksDelivered(
        labelOf(row),
        carried,
        instance.id,
        went.retry
      )
    );
  } else {
    console.warn(
      artifactToolWords.marksOwed(
        `${labelOf(row)} (${carried}, for session ${instance.id})`,
        went.outcome.reason
      )
    );
  }
};

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
  /** The notice ids the person acknowledged (hub notices.ts): Not now's among them. */
  acknowledged: () => readonly string[];
  /**
   * What decision page `name` drawn with `cards` does to its project's
   * links (decisions.ts `linksOf`): its `after`s naming no decision, and
   * its decisions other pages come after. Said to its writer.
   */
  afterLinks: (
    projectId: string,
    name: string,
    cards: DecisionCard[]
  ) => Promise<AfterLinks>;
  /** The Caw thread a project's lead's turn answers now (caw.ts `askThread`); none for any other session. */
  askThread: (instance: InstanceRow) => string | undefined;
  /**
   * Where session `instance`'s own browser opens artifact `row`, which it
   * may read (`artifact_browse`, server.ts `browseAt`): its address, behind
   * a one-time entry and a pass of the session's own in host mode.
   */
  browse: (instance: InstanceRow, row: ArtifactRow) => Browsed;
  /** Nothing on the artifact waits on the person: no step of the session waits on it whole (plans.ts `clearArtifactWait`). */
  clearArtifactWait: (instanceId: string, artifactId: string) => void;
  /** Closes session `instanceId`'s panel: it shows nothing, and every view of it hears so. */
  close: (instanceId: string) => void;
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
  /**
   * Page `name`'s source taken out of project `projectId`'s folder
   * (`decisions/<name>/page.oui` or its built `index.html`) in one commit by
   * `instance`: a project's page lives as long as it. Why not, when the
   * folder refuses.
   */
  dropPage: (
    instance: InstanceRow,
    projectId: string,
    name: string
  ) => Promise<
    { refused: string; status: ArtifactRefusal["status"] } | undefined
  >;
  /** Whether a session has ended: it takes no input now, so its marks go to its parent, else its project's Caw. */
  ended: (instance: InstanceRow) => boolean;
  /**
   * Whether a session's asks are over for good (Needs you's rule 4): it
   * finished, its workspace was archived or moved on, its conversation is
   * gone, or nothing can give it a turn again. A machine away is not.
   */
  finished: (instance: InstanceRow) => boolean;
  /** What a folder preview of `dir` loads, weighed on machine `machineId`, and the desk captures on its start page at `path` (agent preview.ts `previewWeight`). Throws an {@link ArtifactRefusal} saying why it can't. */
  folderWeight: (
    machineId: string,
    dir: string,
    path: string | undefined
  ) => Promise<FolderWeight>;
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
  /** The rows of `ids` the hub holds, in one read. */
  instances: (ids: string[]) => InstanceRow[];
  /**
   * Whether the session's work item ended (done, failed or cancelled),
   * whatever its workspace's state: the sessions up its delegation tree may
   * then delete what it wrote ({@link Artifacts.remove}). False for a session
   * with no item, and while its item is live (a reopened one included).
   */
  itemEnded: (instance: InstanceRow) => boolean;
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
  /** The person looked at artifact `id` (a view's word that it had it on screen): its push is over. */
  looked: (id: string) => void;
  /** The machines the hub knows. */
  machines: () => Pick<AgentRow, "machineId" | "hostname">[];
  /**
   * Something an artifact's Needs-you item is read from moved (its row, its
   * ask, the person's look): the lane is read again and every screen told.
   */
  needsMoved: () => void;
  /**
   * Publishes `artifact` to session `panel`'s panel (its own session's
   * unless named: another session of its delegation tree shows it in its
   * own) at a fresh revision (the open frame every view of that session
   * hears); why not, when its server could not be started. Whether a view
   * put it on screen is that view's word ({@link Artifacts.shown}).
   */
  open: (
    artifact: ArtifactRow,
    panel?: string | null
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
    keep: boolean,
    /** The artifact a program's Canvas or Preview names, whole (`whole`). */
    artifact: ArtifactNamed
  ) => Promise<
    | { html: string; program?: BuiltProgram }
    | { refused: string; status: ArtifactRefusal["status"] }
  >;
  /**
   * The agent's reply `text` on a pin of artifact `artifactId` asks the
   * person something (`comment_reply`'s `asks`): its push, grouped per
   * artifact (push.ts `pinAsked`).
   */
  pinAsked: (artifactId: string, text: string) => void;
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
   * an {@link ArtifactRefusal} saying why it can't run, and, `opening` a
   * canvas, naming a states file that isn't written.
   */
  stage: (
    at: StageAt,
    file: string,
    files?: string[],
    opening?: boolean
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
  /** The session's plan steps: what a wait on its artifacts stands on (plans.ts `steps`). */
  steps: (instanceId: string) => PlanStep[];
  /**
   * Whether a session can no longer act, ever: no one, its parent and the
   * person included, can give it a turn again. Its item ended and its
   * workspace was discarded or retired past cutting again, or a newer item
   * holds that workspace, or the session itself ended for good (continued
   * into another, its conversation gone). What it wrote is then deleted by
   * the sessions up its delegation tree ({@link Artifacts.remove}), as it is
   * once its work item ended ({@link ArtifactServiceDeps.itemEnded}).
   */
  stranded: (instance: InstanceRow) => boolean;
  /**
   * Every session of `instance`'s delegation tree (delegation-tree.ts
   * `treeSessions`): each reads, never changes, the others' artifacts of
   * its project; one up a writer whose work item ended deletes that
   * writer's ({@link ArtifactServiceDeps.stranded}).
   */
  tree: (instance: InstanceRow) => Set<string>;
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
  /** The session's current step waits on the artifact; the step that does, or null (plans.ts `waitOn`). */
  waitOn: (instanceId: string, artifactId: string) => string | null;
  /**
   * Why a browser in a workspace on machine `machineId` cannot open `url`,
   * or null when it can (server.ts, core boundary-reach.ts
   * `workspaceReach`): a Linux workspace's boundary reaches public hosts
   * only; a Mac's dials as its host does.
   */
  workspaceReach: (url: string, machineId: string) => Promise<string | null>;
  /** The workspaces an id or its prefix names, each with the machine it is on. */
  workspaces: (needle: string) => { id: string; machineId: string }[];
}

export const createArtifacts = (deps: ArtifactServiceDeps) => {
  const { db, docs } = deps;

  /** The session whose panel holds `row`; none for a project's page whose session is gone (schema.ts `artifacts.instanceId`). */
  const holder = (row: ArtifactRow): InstanceRow | undefined =>
    row.instanceId === null ? undefined : deps.instance(row.instanceId);

  /**
   * What a create of `kind` and `name` in `owner`'s panel lands on: in a
   * project, its page of that name whoever wrote it (a project's page is the
   * project's by its name, db/artifacts.ts `projectPage`); else the owner's
   * own of that kind and name.
   */
  const namedFor = (
    owner: InstanceRow,
    kind: ArtifactRow["kind"],
    name: string
  ): ArtifactRow | undefined =>
    (kind === "page" && owner.projectId
      ? db.projectPage(owner.projectId, name)
      : undefined) ?? db.byName(owner.id, kind, name);

  /**
   * The session a project's page moved from, when another's create took it
   * (placed): its panel lets it go, closed when it showed it.
   */
  const letGo = (from: string | undefined, row: ArtifactRow): void => {
    if (from === undefined) {
      return;
    }
    if (deps.showing(from) === row.id) {
      deps.close(from);
      return;
    }
    deps.relist(from);
  };

  /** A project's page, the project's by its name and as long-lived as its source there (db/artifacts.ts `projectPage`). */
  const isProjectPage = (row: ArtifactRow): boolean =>
    row.kind === "page" && row.projectId !== null && row.heldFor === null;

  /** Whether its session's panel shows `row` now. */
  const inPanel = (row: ArtifactRow): boolean =>
    row.instanceId !== null && deps.showing(row.instanceId) === row.id;

  /** Every view of `row`'s session's panel hears its artifacts again; none for a page no session holds. */
  const relistOf = (row: ArtifactRow): void => {
    if (row.instanceId !== null) {
      deps.relist(row.instanceId);
    }
  };

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

  const summaryOf = (row: ArtifactRow): ArtifactSummary => {
    const pending = pendingFor(row);
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      does: row.does,
      ask: row.ask,
      sent: sentOf(row),
      waiting: pending !== null,
      pending,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      shownAt: row.shownAt?.toISOString() ?? null,
      ...(isProjectPage(row) ? { project: row.projectId as string } : {}),
      promoted:
        (docs.doc(row.id).getMap("meta").get("promoted") as
          ArtifactPromotion | undefined) ?? null,
      thumbnail: thumbnailOf(row),
    };
  };

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

  /**
   * Whether `row` is another session's of `instance`'s delegation tree in
   * the same project ({@link ArtifactServiceDeps.tree}): the tree reads it,
   * its owner alone changes it.
   */
  const inTree = (instance: InstanceRow, row: ArtifactRow): boolean => {
    const owner = holder(row);
    return (
      !!owner &&
      owner.id !== instance.id &&
      owner.projectId === instance.projectId &&
      deps.tree(instance).has(owner.id)
    );
  };

  /**
   * The other sessions of `instance`'s delegation tree that hold an
   * artifact, in the tree's order, each with its row and its artifacts,
   * newest first: one read of the artifacts and one of their holders'
   * rows, so a read costs what the tree holds, not the tree's size. Walked
   * one session at a time, with a turn's input check on each, an
   * orchestrator's 1,347 delegates held the hub's thread for 2.6 s on every
   * artifact_list (2026-10-24, nightly 5540 rolled back for it).
   */
  const holdersInTree = (
    instance: InstanceRow
  ): { artifacts: ArtifactRow[]; row: InstanceRow }[] => {
    const others = [...deps.tree(instance)].filter((id) => id !== instance.id);
    const held = Map.groupBy(
      db.ofInstances(others),
      (row) => row.instanceId as string
    );
    const rows = new Map(
      deps.instances([...held.keys()]).map((row) => [row.id, row])
    );
    return others.flatMap((id) => {
      const row = rows.get(id);
      const artifacts = held.get(id);
      return row && artifacts ? [{ row, artifacts }] : [];
    });
  };

  /** The artifacts of the other sessions of `instance`'s delegation tree in its project ({@link inTree}). */
  const ofTree = (
    instance: InstanceRow,
    holders = holdersInTree(instance)
  ): ArtifactRow[] =>
    holders.flatMap(({ row, artifacts }) =>
      row.projectId === instance.projectId ? artifacts : []
    );

  /**
   * The artifact `asked` names for `instance`: a whole id as given, else its
   * handle or its name among the artifacts the session can name (its own,
   * its project's it answers, its delegation tree's, its project's pages),
   * refused when none or several are (handles.ts).
   */
  const whole = (instance: InstanceRow, asked: string): string => {
    if (WHOLE_ID.test(asked)) {
      return asked;
    }
    const seen = new Map<string, ArtifactRow>();
    const holders = holdersInTree(instance);
    for (const row of [
      ...answerable(instance, holders),
      ...ofTree(instance, holders),
      ...(instance.projectId
        ? db.ofProject(instance.projectId).filter((one) => one.kind === "page")
        : []),
    ]) {
      seen.set(row.id, row);
    }
    // A name that names none or several is a refusal of the call, never
    // the hub's own fault.
    try {
      return byHandle(
        asked,
        [...seen.values()],
        {
          id: (row) => row.id,
          names: (row) => [row.name],
          said: (row) => `${row.name} (${row.kind} ${row.id.slice(0, 8)})`,
        },
        "artifact"
      ).id;
    } catch (error) {
      // biome-ignore lint/style/useErrorCause: the cause rides ArtifactRefusal's third argument, after its status, which the rule does not read
      throw new ArtifactRefusal(
        404,
        error instanceof Error ? error.message : String(error),
        { cause: error }
      );
    }
  };

  /** The session's artifact `id`; refused when it is another session's or not there. */
  const own = (instance: InstanceRow, asked: string): ArtifactRow => {
    const id = whole(instance, asked);
    const row = db.get(id);
    if (row && row.instanceId !== instance.id && inTree(instance, row)) {
      throw new ArtifactRefusal(
        403,
        artifactToolWords.othersArtifact(
          `${named(row)[0]?.toUpperCase()}${named(row).slice(1)}`,
          row.instanceId?.slice(0, 8) ?? ""
        )
      );
    }
    if (!row || row.instanceId !== instance.id) {
      throw new ArtifactRefusal(404, artifactToolWords.noArtifact(id));
    }
    return row;
  };

  /**
   * Artifact `id` for the person's change from session `panelId`'s panel
   * (its thumbnail, a sheet's Save, Verify), with the session that holds
   * it, which the change is made as: one the panel {@link sees}, refused as
   * not there otherwise. The person acts there, as their Send does
   * (preview-routes.ts); a session's own tools keep to {@link own}, so no
   * agent changes another session's artifact.
   */
  const panelHeld = (
    panelId: string,
    id: string
  ): { owner: InstanceRow; row: ArtifactRow } => {
    const row = db.get(id);
    const owner = row ? holder(row) : undefined;
    if (!(row && owner && sees(sessionOf(panelId), row))) {
      throw new ArtifactRefusal(404, artifactToolWords.noArtifact(id));
    }
    return { owner, row };
  };

  /** The sessions above `writer`: its parent, that one's parent, up to the top. */
  const above = (writer: InstanceRow): Set<string> => {
    const up = new Set<string>();
    let at = writer.parentInstanceId;
    while (at && !up.has(at)) {
      up.add(at);
      at = deps.instance(at)?.parentInstanceId ?? null;
    }
    return up;
  };

  /**
   * Artifact `asked` for a delete, named as every artifact tool names one
   * (its id, handle or name, {@link whole}): the session's own
   * ({@link own}), or another session's whose work item ended
   * ({@link ArtifactServiceDeps.itemEnded}) or whose asks are over for good
   * ({@link ArtifactServiceDeps.finished}: ended, its workspace archived or
   * moved on, its conversation gone, nothing to give it a turn again) when
   * this session is up the writer's delegation tree, at any depth, so
   * whoever is up the tree cleans up after a session that can no longer
   * act. Its content stays the writer's while it can: no other change
   * widens so. Refused otherwise, naming who deletes it.
   */
  const deletable = (instance: InstanceRow, asked: string): ArtifactRow => {
    const id = whole(instance, asked);
    const row = db.get(id);
    const writer = row && row.heldFor === null ? holder(row) : undefined;
    if (!(row && writer) || writer.id === instance.id) {
      return own(instance, id);
    }
    const up = above(writer).has(instance.id);
    if (up && (deps.itemEnded(writer) || deps.finished(writer))) {
      return row;
    }
    const whose = `${named(row)[0]?.toUpperCase()}${named(row).slice(1)} is ${sessionLink(writer.id, sessionLabel(writer).name)}'s`;
    throw new ArtifactRefusal(
      403,
      up
        ? artifactToolWords.makerDeletes(whose)
        : artifactToolWords.notInTree(whose)
    );
  };

  /**
   * Artifact `id`, when the session owns it or made it: a delegate goes on
   * updating and reading what it handed to its parent.
   */
  const ownedOrMade = (instance: InstanceRow, asked: string): ArtifactRow => {
    const id = whole(instance, asked);
    const row = db.get(id);
    if (row?.madeBy === instance.id) {
      return row;
    }
    return own(instance, id);
  };

  /**
   * Artifact `id` for a look that changes nothing (a show, a view's word that
   * it has it, a canvas's map): the session's own, one it made, or another
   * session's of its delegation tree ({@link inTree}); refused as not there
   * otherwise. Every change keeps to {@link own}.
   */
  const viewable = (instance: InstanceRow, asked: string): ArtifactRow => {
    const id = whole(instance, asked);
    const row = db.get(id);
    if (row && sees(instance, row)) {
      return row;
    }
    throw new ArtifactRefusal(404, artifactToolWords.noArtifact(id));
  };

  /**
   * Whether `instance` may show and read `row` without changing it: its
   * own, one it made, or another session's of its delegation tree
   * ({@link inTree}). The one rule for a look ({@link viewable}) and for
   * what a decision page's Canvas and Preview pieces show ({@link mediaHeld}).
   */
  const sees = (instance: InstanceRow, row: ArtifactRow): boolean =>
    row.instanceId === instance.id ||
    row.madeBy === instance.id ||
    inTree(instance, row);

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
    asked: string | undefined
  ): ArtifactRow => {
    const id = asked === undefined ? undefined : whole(instance, asked);
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

  /**
   * The session's newest artifact the panel can show: a draft canvas still
   * in the composer is not one, nor one a delegate handed up that the
   * session hasn't shown ({@link isHanded}): that is its parent's to put in
   * front of the person, never the panel's by itself.
   */
  const nextNewest = (instance: InstanceRow): ArtifactRow | undefined =>
    db.ofInstance(instance.id).find((other) => {
      const meta = docs.doc(other.id).getMap("meta");
      return meta.get("draft") !== true && meta.get(HANDED) !== true;
    });

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
    const owner = holder(row);
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
      const shown = await show(row);
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
  const answerable = (
    instance: InstanceRow,
    holders = holdersInTree(instance)
  ): ArtifactRow[] => [
    ...db.ofInstance(instance.id),
    // Its delegates' that have ended: their marks come to it (server.ts
    // `deliverArtifactMarks`). Only a delegate holding an artifact is asked.
    ...holders.flatMap(({ row, artifacts }) =>
      row.parentInstanceId === instance.id && deps.ended(row) ? artifacts : []
    ),
    ...deps
      .ledProjects(instance)
      .flatMap((projectId) =>
        db
          .ofProject(projectId)
          .filter(
            (row) =>
              row.instanceId !== instance.id &&
              holder(row)?.projectId === projectId
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
   * ({@link projectPage}), whatever became of its writer, or when another
   * session of its delegation tree holds it ({@link inTree}); refused when
   * none. A held next version is read by whoever
   * reads its artifact: the parent reviews what its maker changed.
   */
  const readable = (instance: InstanceRow, asked: string): ArtifactRow => {
    const id = whole(instance, asked);
    const next = db.get(id);
    if (next?.heldFor) {
      readable(instance, next.heldFor);
      return next;
    }
    const row =
      answerable(instance).find((one) => one.id === id) ??
      ledPage(instance, id) ??
      projectPage(instance, id) ??
      (next && inTree(instance, next) ? next : undefined);
    if (!row) {
      throw new ArtifactRefusal(404, artifactToolWords.noArtifact(id));
    }
    return row;
  };

  /**
   * Whether the session is the one the artifact's marks go to: its writer,
   * or, once the writer has ended, the writer's parent or its project's
   * lead. What it reads of them counts as heard.
   */
  const takes = (instance: InstanceRow, row: ArtifactRow): boolean => {
    if (row.instanceId === instance.id) {
      return true;
    }
    const writer = holder(row);
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
      for (const pin of owed) {
        const now = readPin(live, pin.id);
        if (now) {
          stampHeard(live, now, pin, at);
        }
      }
    });
  };

  /** Pin `pinId` on an artifact the session answers ({@link answerable}), and that artifact; refused when none holds it. */
  const pinOf = (
    instance: InstanceRow,
    pinId: string
  ): { pin: Pin; row: ArtifactRow } => {
    const handle = pinId.length >= HANDLE_MIN && pinId.length < 36;
    for (const row of answerable(instance)) {
      const doc = docs.doc(row.id);
      const pin =
        readPin(doc, pinId) ??
        (handle
          ? [...readPins(doc).values()].find((one) => one.id.startsWith(pinId))
          : undefined);
      if (pin) {
        return { pin, row };
      }
    }
    throw new ArtifactRefusal(404, artifactToolWords.noPin(pinId));
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
    // Its Canvases and Previews stay its pictures once it is gone (needs.ts).
    keptAsMedia(row, mediaOf(row));
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
    // The Canvases and Previews this revision drops stay the page's pictures (needs.ts).
    const page = db.get(id);
    const was = join(folder, PROGRAM_FILE);
    if (page && existsSync(was)) {
      const kept = new Set(
        program ? readKept(program.program).artifacts.map((one) => one.id) : []
      );
      keptAsMedia(
        page,
        readKept(readFileSync(was, "utf8"))
          .artifacts.map((one) => one.id)
          .filter((one) => !kept.has(one))
      );
    }
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

  /**
   * Marks each of `ids`, an option's media on decision page `page` of its
   * own session, as that page's (doc meta `mediaOf`): the page went, or a
   * revision of it dropped them, and they ask nothing of their own still.
   */
  const keptAsMedia = (page: ArtifactRow, ids: readonly string[]): void => {
    for (const id of ids) {
      const media = db.get(id);
      if (
        media?.instanceId === page.instanceId &&
        !docs.doc(id).getMap("meta").has(MEDIA_OF)
      ) {
        docs.transact(id, "hub", (doc) =>
          doc.getMap("meta").set(MEDIA_OF, page.id)
        );
      }
    }
  };

  /** A page's files as they stand before a revision writes the next: its HTML and a decision page's program; null before its first. */
  const pageWas = (id: string): PageWas | null => {
    const folder = join(deps.root, id);
    const html = join(folder, "index.html");
    if (!existsSync(html)) {
      return null;
    }
    const program = join(folder, PROGRAM_FILE);
    // Each picture's file by its address, fingerprinted: what tells one drawn again.
    const files = new Map<string, string>();
    const pictures = join(folder, "files");
    if (existsSync(pictures)) {
      for (const name of readdirSync(pictures)) {
        files.set(
          `files/${name}`,
          bytesHash(readFileSync(join(pictures, name)))
        );
      }
    }
    return {
      html: readFileSync(html, "utf8"),
      files,
      ...(existsSync(program)
        ? { program: readFileSync(program, "utf8") }
        : {}),
    };
  };

  /**
   * What a page's revision changed (page-changes.ts): a decision page's
   * cards, else an HTML page's elements, told at the elements its pins
   * stand on where a change falls inside one.
   */
  const pageChanges = (
    id: string,
    was: PageWas,
    now: { html: string; program?: BuiltProgram | undefined }
  ): ChangedItem[] => {
    if (now.program && was.program !== undefined) {
      return [
        ...cardChanges(readKept(was.program).cards, now.program.read.cards),
        ...pictureChanges(was.files, now.program.files),
      ];
    }
    const anchors = [...readPins(docs.doc(id)).values()].flatMap((pin) =>
      "selector" in pin.anchor && !pin.anchor.frames?.length
        ? [pin.anchor.selector]
        : []
    );
    return htmlChanges(was.html, now.html, anchors);
  };

  /**
   * The agent answered pin `pin` at `at`, after the latest update: that
   * update's changes are its answer (core `answerChanges`), marked so on the
   * set and in the pin's lines.
   */
  const answeredHere = (doc: Doc, pin: string, at: string) => {
    const meta = doc.getMap("meta");
    const changes = meta.get("changes") as ArtifactChanges | undefined;
    if (!changes) {
      return;
    }
    const { items, bound } = answerChanges(
      changes,
      readPins(doc).values(),
      pin
    );
    if (bound.length === 0) {
      return;
    }
    meta.set("changes", { ...changes, items });
    const activity = activityOf(doc);
    activity.set(pin, answeredLines(activity.get(pin) ?? [], bound, at));
  };

  /**
   * What an agent's update changed (`items`, page-changes.ts), marked in the
   * doc's meta under `revision` (core `ArtifactChanges`) until the person
   * has looked: each tied to the comment it answers or stands under (core
   * `bindChanges`, a reply since the update before it being the answer),
   * and what the last set held that he hasn't looked at carried in (core
   * `carryChanges`), so the set is everything since he looked. Each pin's
   * thread gains a line per change made for it (the doc's `activity`, core
   * `activityLines`), kept after he has looked.
   */
  const markRevision = (
    row: ArtifactRow,
    items: ChangedItem[],
    revision: (meta: ReturnType<Doc["getMap"]>) => number
  ): ChangedItem[] => {
    let bound: ChangedItem[] = [];
    docs.transact(row.id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      const was = meta.get("changes") as ArtifactChanges | undefined;
      const seen = new Set(
        was ? (seenOf(doc).get(String(was.revision)) ?? []) : []
      );
      const at = new Date().toISOString();
      const since = was?.at ?? row.createdAt.toISOString();
      const next = revision(meta);
      const fresh = bindChanges(items, readPins(doc).values(), since, next);
      bound = fresh;
      const changes: ArtifactChanges = {
        revision: next,
        at,
        since,
        items: carryChanges(was?.items ?? [], seen, fresh),
      };
      meta.set("changes", changes);
      const activity = activityOf(doc);
      for (const [pin, lines] of activityLines(fresh, at)) {
        activity.set(
          pin,
          [...(activity.get(pin) ?? []), ...lines].slice(-ACTIVITY_LIMIT)
        );
      }
    });
    return bound;
  };

  /**
   * What an update marked, each by its link (core `changeLink`): what the
   * agent names each to the person by, and what the turn's row draws as its
   * chips; a thing taken out has no place to open, and is left out.
   */
  const markedLinks = (
    id: string,
    items: readonly ChangedItem[]
  ): { marked?: string[] } => {
    const links = items
      .filter((item) => item.kind !== "removed")
      .map((item) =>
        changeLink(
          id,
          item.anchor,
          item.element && item.element !== item.label
            ? `${item.element} · ${item.label}`
            : item.label
        )
      );
    return links.length > 0 ? { marked: links } : {};
  };

  /** Page `row`'s revision changed `items`: marked under its revision ({@link markRevision}). */
  const markChanges = (row: ArtifactRow, items: ChangedItem[]): ChangedItem[] =>
    markRevision(row, items.slice(0, CHANGES_LIMIT), () => row.revision);

  /**
   * What an agent's update to canvas `row` changed (page-changes.ts
   * `sceneChanges`, from the scene `before` it and as it stands now), marked
   * under the canvas's next scene version (`meta.sceneVersion`). A canvas's
   * looks are kept by its scene version, not its revision: an update draws
   * into the live scene every screen holds, and moving the revision would
   * load the panel's frame again under the person for every batch the agent
   * draws.
   */
  const markSceneChanges = (
    row: ArtifactRow,
    before: CanvasEntry[]
  ): ChangedItem[] => {
    const items = sceneChanges(before, canvasEntries(docs, row.id));
    if (items.length === 0) {
      return [];
    }
    return markRevision(row, items, (meta) => {
      const version = (Number(meta.get("sceneVersion")) || 0) + 1;
      meta.set("sceneVersion", version);
      return version;
    });
  };

  /**
   * A made page's files written for `row`: one made again under its name
   * is its next revision, and what that changed is marked
   * ({@link markChanges}).
   */
  const writeMade = (
    row: ArtifactRow,
    html: string,
    program: BuiltProgram | undefined
  ): ChangedItem[] => {
    const was = pageWas(row.id);
    writePage(row.id, html, program);
    return was
      ? markChanges(row, pageChanges(row.id, was, { html, program }))
      : [];
  };

  /** A create's answer with the artifact's link, which the agent names it by. */
  const linked = (made: Created): Created => ({
    ...made,
    link: artifactLink(made.id, made.name),
  });

  /** A decision page's cards' links, by id: what the agent names each by. */
  const cardLinks = (
    id: string,
    cards: readonly DecisionCard[]
  ): Record<string, string> =>
    Object.fromEntries(
      cards.map((card) => [card.id, decisionLink(id, card.id, card.question)])
    );

  /** A decision page's program as the hub keeps it; undefined for an HTML page or any other artifact. */
  const programOf = (row: ArtifactRow): string | undefined => {
    const file = join(deps.root, row.id, PROGRAM_FILE);
    return row.kind === "page" && existsSync(file)
      ? readFileSync(file, "utf8")
      : undefined;
  };

  /**
   * The artifacts a program's Canvas and Preview pieces name, each one the
   * panel owner sees ({@link sees}: its own or its delegation tree's) of
   * the kind it shows: refused, every reason at once, when one is not.
   */
  const mediaHeld = (owner: InstanceRow, program: BuiltProgram) => {
    const problems = program.read.artifacts.flatMap(({ component, id }) => {
      const held = db.get(id);
      const kinds: ArtifactKind[] =
        component === "Canvas" ? ["canvas"] : ["page", "preview", "component"];
      if (!(held && sees(owner, held))) {
        return [artifactToolWords.noMediaArtifact(component, id)];
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
   * Artifact `id` as decision page `page` shows it now: one its session
   * sees ({@link sees}), as {@link mediaHeld} let it in; a project's page
   * whose session is gone, another such page. Undefined once the hub no
   * longer holds it.
   */
  const mediaSeen = (
    page: ArtifactRow,
    id: string
  ): ArtifactRow | undefined => {
    const shown = db.get(id);
    const owner = holder(page);
    if (!shown) {
      return undefined;
    }
    const seen = owner
      ? sees(owner, shown)
      : page.instanceId === null && shown.instanceId === null;
    return seen ? shown : undefined;
  };

  /**
   * Writes the doc's meta for the artifact as the hub keeps it: what the
   * person does there and its ask, which every open view's head reads, and
   * when the session last changed it (`revisedAt`), which a Send answers.
   * A page that asks choices (a decision page: a program's, or a kit page's
   * `[data-cawco-choice]`) carries its own Send at its foot, `ownSend`: the
   * panel's head stands none for it (the owner's pick, "Only the page's own
   * Send").
   */
  const stampMeta = (row: ArtifactRow, hash: string | null) => {
    const ownSend = row.kind === "page" && choicesAsked(row).length > 0;
    docs.transact(row.id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      meta.set("ownSend", ownSend);
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

  /** A read's `decisions`: each choice the page asks, answered or not, on every read (one `since` a seq too); nothing for a page that asks none. */
  const decisionsOf = (
    row: ArtifactRow,
    state: Record<string, ChoiceEntry>,
    current: string | null
  ): Pick<ArtifactRead, "decisions"> => {
    const asked = choicesAsked(row);
    return asked.length > 0
      ? {
          decisions: asked.map((one) => answerOf(one, state[one.id], current)),
        }
      : {};
  };

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
    // Every card the page asks, with or without `since`: a read since a
    // seq is the changed state, never a page whose cards are gone, which
    // listed every pick as a loose value (the owner's read of a program
    // page: no "Choices", its note under "set beside them").
    return {
      ...decisionsOf(row, state, current),
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
        artifactToolWords.notYourDelegate(String(needle))
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
    id: string,
    program: BuiltProgram | undefined
  ): Pick<Created, "cards" | "decisions" | "dropped"> => {
    if (!program) {
      return {};
    }
    return {
      decisions: program.read.cards.map((card) => card.id),
      cards: cardLinks(id, program.read.cards),
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
  ): Promise<PageBroken | undefined> => {
    const state = page.id ? stateOf(docs.doc(page.id)) : {};
    const has = (id: string) => cards.some((card) => card.id === id);
    const picked = Object.entries(state)
      .filter(([key, entry]) => !has(key) && (entry.options ?? []).length > 0)
      .map(([key]) => key);
    const options = Object.fromEntries(
      cards.flatMap((card) => {
        const { gone } = pickOf(card, state[card.id]);
        return gone.length > 0 ? [[card.id, gone] as const] : [];
      })
    );
    const links = page.projectId
      ? await deps.afterLinks(page.projectId, page.name, cards)
      : { unlinked: [], dependents: {} };
    const after = Object.fromEntries(
      Object.entries(links.dependents).filter(([id]) => !has(id))
    );
    const broken: PageBroken = {
      ...(picked.length > 0 ? { picked } : {}),
      ...(Object.keys(options).length > 0 ? { options } : {}),
      ...(Object.keys(after).length > 0 ? { after } : {}),
      ...(links.unlinked.length > 0 ? { unlinked: links.unlinked } : {}),
    };
    return Object.keys(broken).length > 0 ? broken : undefined;
  };

  /**
   * A create's page built, and what its program leaves broken on the picks
   * of the page it replaces and on the project's links between pages. A re-create held
   * for the parent is kept in its project's folder when they open it.
   */
  const createdPage = async (
    { maker, owner }: Making,
    input: ArtifactInput
  ): Promise<{
    broken: PageBroken | undefined;
    html: string;
    program?: BuiltProgram;
  }> => {
    const was = namedFor(owner, "page", input.name);
    // Another session's page of the project's is the owner's once made again (placed).
    const page = await pageBuilt(
      maker,
      input,
      owner,
      !(was && holdsChange(maker, { ...was, instanceId: owner.id }))
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
      page = await deps.page(instance, name, from, keep, (asked) =>
        whole(instance, asked)
      );
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
        ? artifactToolWords.serverOnPort(
            source.port,
            source.workspace
              ? `in workspace ${source.workspace.slice(0, 8)}`
              : `on ${machine}`
          )
        : `${named(row)[0]?.toUpperCase()}${named(row).slice(1)}`;
    switch (failure) {
      case "server":
        return artifactToolWords.notListening(subject);
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
   * Publishes the artifact to session `panel`'s panel (its own session's
   * unless named) and waits for a view to have it on screen; `started` is
   * false when its server could not even be started, and nothing was
   * published. Only its own session's show marks it opened (handed, shown
   * at): another session of the tree showing it changes nothing of it.
   */
  const show = async (
    row: ArtifactRow,
    panel = row.instanceId
  ): Promise<
    | { opened: true; started: true }
    | { opened: false; started: boolean; why: string }
  > => {
    const published = await timedShowStep("open", row, panel, () =>
      deps.open(row, panel)
    );
    if (!published.ok) {
      return { opened: false, why: published.error, started: false };
    }
    const owns = panel === row.instanceId;
    const meta = docs.doc(row.id).getMap("meta");
    if (owns && meta.get(HANDED) === true) {
      docs.transact(row.id, "hub", () => meta.delete(HANDED));
    }
    const shown = await timedShowStep(
      "shown wait",
      row,
      panel,
      () => shownBy(row.id, published.revision),
      (waited) => waited.kind === "answered"
    );
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
    if (owns) {
      db.update(row.id, { shownAt: new Date() });
    }
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
   * An artifact's latest picture, light where it keeps two: a canvas's own;
   * a page's or preview's kept thumbnail, else its ink picture; null when it
   * has none.
   */
  const latestPicture = (row: ArtifactRow): Buffer | null => {
    if (row.kind !== "canvas" && keptThumbnail(row.id)) {
      try {
        return readFileSync(thumbnailPath(deps.root, row.id, "light"));
      } catch {
        // Its file went since it was kept: its ink picture, when it has one.
      }
    }
    return pictureBytes(row.id);
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
   * The person's marks (pins, replies, resolves, ink) go to the session by
   * themselves: each change of theirs pushes the artifact's delivery back to
   * {@link COMMENTS_QUIET_MS} from now ({@link personMarked}), and one
   * delivery carries everything the session hasn't heard as one message. A
   * sheet's saves and compile errors go on the same delivery, pushed back
   * to {@link MARKS_QUIET_MS}. Neither waits past {@link MARKS_LONGEST_MS}
   * from the burst's first. The page posts its pictures of the marks it
   * just made beside the doc (sync.ts `artifactPictures`); they wait for the
   * delivery on disk, beside the artifact's own files ({@link held}), so a
   * hub restart between the marking and the delivery keeps them.
   */
  const bursts = new Map<string, { first: number; timer: HubTimer }>();
  const held = heldPictures(deps.root);
  const delivering = new Set<string>();
  const marked = (id: string, quiet = MARKS_QUIET_MS) => {
    const now = Date.now();
    const burst = bursts.get(id);
    deps.lifetime.cancel(burst?.timer);
    const first = burst?.first ?? now;
    const wait = Math.max(0, Math.min(quiet, first + MARKS_LONGEST_MS - now));
    bursts.set(id, {
      first,
      timer: deps.lifetime.after(wait, () => {
        bursts.delete(id);
        // One delivery at a time: what is still owed when it ends goes next.
        if (delivering.has(id)) {
          marked(id, quiet);
          return;
        }
        delivering.add(id);
        deliverMarks(id)
          .catch((error: unknown) => {
            console.warn(
              `[artifacts] ${id}: the person's marks and the sheet's saves and errors were not delivered: ${error instanceof Error ? error.message : String(error)}`
            );
          })
          .finally(() => delivering.delete(id));
      }),
    });
  };

  /**
   * The person's own change to artifact `id`'s doc (a comment, a reply, a
   * resolve, a stroke): what of it the session hasn't heard goes once their
   * changes have stood quiet {@link COMMENTS_QUIET_MS} ({@link marked}).
   */
  const personMarked = (id: string) => marked(id, COMMENTS_QUIET_MS);

  /**
   * What of the person's marks on an artifact's doc the session has not
   * heard: each pin ready to go (core `pinReady`, which holds back an apps'
   * tap pin until its words are written; until tsk-59), by number, and each
   * stroke group no pin stands on; with every group, moved ones too, by id.
   */
  const marksOwed = (doc: Doc) => {
    const pins = [...readPins(doc).values()];
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
      for (const pin of sent) {
        const now = readPin(live, pin.id);
        if (now) {
          stampHeard(live, now, pin, at);
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
   * The person's Ask again on comments `again` of artifact `row`: an update
   * changed what each stands on and the agent never answered it there
   * (core `ChangedItem.answered`). Each goes to the session again, whole:
   * what it stands on, every word of the person's in its thread, and what
   * changed under it, before and after, with its link to answer by. Refused
   * while a delivery is on its way, when none of them stands, or when no one
   * takes it.
   */
  const askAgain = async (row: ArtifactRow, again: ReadonlySet<string>) => {
    const instance = holder(row);
    if (!instance) {
      throw new ArtifactRefusal(409, artifactToolWords.askAgainNoSession);
    }
    const doc = docs.doc(row.id);
    const pins = [...readPins(doc).values()].filter((pin) => again.has(pin.id));
    if (pins.length === 0) {
      throw new ArtifactRefusal(404, artifactToolWords.askAgainGone);
    }
    if (delivering.has(row.id)) {
      throw new ArtifactRefusal(
        409,
        "Its comments are on their way to the session already, so this didn't go."
      );
    }
    const changes = doc.getMap("meta").get("changes") as
      ArtifactChanges | undefined;
    const url = addressOf(row.id, doc);
    const sections = pins.map((pin) =>
      [
        ...pinStandsOn(pin, url),
        ...pin.thread
          .filter((entry) => entry.by === "person" && entry.text.trim())
          .map((entry) => wroteLine(entry.text)),
        ...(changes?.items ?? [])
          .filter((item) => item.pin === pin.id && !item.answered)
          .map((item) => askedAgainLine(item)),
        `- Pin: ${pin.id}`,
        `- Link: ${linkOfPin(row.id, pin)}`,
        artifactToolWords.askedAgain,
      ].join("\n")
    );
    delivering.add(row.id);
    try {
      const outcome = await deps.deliverMarks(instance, row, {
        text: artifactCommentsNotice(row, sections),
        images: [],
        attachments: [],
      });
      sayDelivery(row, instance, {
        pins,
        strokes: 0,
        errors: 0,
        saves: 0,
        retry: true,
        outcome,
      });
      if (!outcome.ok) {
        throw new ArtifactRefusal(
          503,
          `The session didn't get the comment: ${outcome.reason.replace(FINAL_STOP, "")}. Ask again.`
        );
      }
    } finally {
      delivering.delete(row.id);
    }
  };

  /**
   * A comment's Try again: comments `only` of artifact `row`, which a
   * delivery no one took left owed, go to the session now. Refused while a
   * delivery is on its way, when none of them is owed, or when no one takes
   * them (each pin says why again).
   */
  const retry = async (row: ArtifactRow, only: ReadonlySet<string>) => {
    if (!marksOwed(docs.doc(row.id)).owed.some((pin) => only.has(pin.id))) {
      throw new ArtifactRefusal(
        409,
        "Nothing new to send on this comment: the session has heard all of it."
      );
    }
    if (delivering.has(row.id)) {
      throw new ArtifactRefusal(
        409,
        "Its comments are on their way to the session already, so this didn't go."
      );
    }
    delivering.add(row.id);
    try {
      const outcome = await deliverMarks(row.id, only);
      if (outcome !== "nothing" && !outcome.ok) {
        throw new ArtifactRefusal(
          503,
          `The session didn't get the comment: ${outcome.reason.replace(FINAL_STOP, "")}. It's kept; Try again.`
        );
      }
    } finally {
      delivering.delete(row.id);
    }
  };

  /**
   * What a Send carries of an artifact's doc: every pick since the last
   * Send, and the note. The person's marks are not its to carry: they go by
   * themselves ({@link marked}). Refused when it would carry nothing.
   */
  const sendOwes = (
    doc: Doc,
    state: Record<string, ChoiceEntry>,
    body: SendBody
  ) => {
    const { sentAt } = metaOf(doc);
    const picked = Object.values(state).some(
      (entry) => !sentAt || entry.at > sentAt
    );
    const note = body.text?.trim() || null;
    if (!(picked || note)) {
      throw new ArtifactRefusal(
        409,
        "Nothing new to send: every pick here has gone to the session."
      );
    }
    return { picked, note };
  };

  /**
   * A delivery no one took, said on each pin it carried (core `Pin.notSent`):
   * the pin says why, wherever it is shown, and offers Try again until a
   * delivery carries it ({@link stampDelivered} clears it).
   */
  const notSent = (id: string, owed: Pin[], why: string) => {
    if (owed.length === 0) {
      return;
    }
    const at = new Date().toISOString();
    docs.transact(id, "hub", (live) => {
      for (const pin of owed) {
        const now = readPin(live, pin.id);
        if (now) {
          writeDelivery(live, pin.id, {
            ...(now.sentAt ? { sentAt: now.sentAt } : {}),
            ...(now.heard ? { heard: now.heard } : {}),
            notSent: { at, why },
          });
        }
      }
    });
  };

  /**
   * What went is let go of the held pictures, and what is gone from the doc;
   * a pin not sent yet keeps its own for its Send.
   */
  const letGoPictures = (id: string, went: string[], standing: Set<string>) => {
    const gone = new Set(went);
    for (const mark of held.marks(id)) {
      if (gone.has(mark) || !standing.has(mark)) {
        held.letGo(id, mark);
      }
    }
    // Nothing held now: its address goes with them, the last delivery's standing in.
    if (held.marks(id).length === 0) {
      held.drop(id);
    }
  };

  /** A stored file's bytes by its reference (`/api/files/<sha256>`); null when the hub doesn't hold it. */
  const storedBytes = (ref: string): Buffer | null => {
    const path = storedFilePath(fileHash(ref));
    return path && existsSync(path) ? readFileSync(path) : null;
  };

  /**
   * How one delivery carries what the person's unheard entries attach
   * (attachments design §5): each picture as an image block after its pin's
   * crop, in the order attached, while the message's picture caps hold
   * (core `COMMENT_LIMITS.pictures`, `pictureChars`), past them as a file;
   * each text folded in; anything else a file the session's machine keeps.
   * `images` starts with the blocks ahead of every pin's (a canvas's, the
   * loose ink's), so a picture's number is its place in the message.
   */
  const carryAttachments = (
    owed: Pin[],
    crop: (of: Pin) => string | undefined,
    ahead: string[]
  ) => {
    const images: { data: string; mediaType: string }[] = ahead.map((data) => ({
      data,
      mediaType: "image/png",
    }));
    const attachments: SendAttachment[] = [];
    const carried = new Map<string, Carried>();
    for (const pin of owed) {
      const picture = crop(pin);
      if (picture && images.length < COMMENT_LIMITS.pictures) {
        images.push({ data: picture, mediaType: "image/png" });
      }
      const stored = unheardEntries(pin).flatMap((entry) =>
        (entry.attachments ?? []).flatMap((one) => {
          const bytes = storedBytes(one.ref);
          return bytes ? [{ one, bytes }] : [];
        })
      );
      for (const { one, bytes } of stored) {
        const how = carryOne(one, bytes, images);
        carried.set(one.ref, how.carried);
        if (how.attachment) {
          attachments.push(how.attachment);
        }
      }
    }
    return { images, attachments, carried };
  };

  /** Where the person marked artifact `id`: the page's address the page last said, else the last delivery's, else its own route. */
  const addressOf = (id: string, doc: Doc): string =>
    held.url(id) ??
    (doc.getMap("meta").get("sentUrl") as string | null | undefined) ??
    routeOf(id);

  /**
   * The pictures of the loose ink a delivery carries ahead of every pin's: a
   * canvas's ink is in the canvas's own picture, a page's each in the crop
   * the page drew round it.
   */
  const loosePictures = (row: ArtifactRow, loose: InkGroup[]) => {
    const canvas = row.kind === "canvas" ? pictureOf(row.id) : null;
    const pictureOfGroup = (group: InkGroup) =>
      row.kind === "canvas" ? null : held.picture(row.id, group.id);
    return {
      canvas,
      pictureOfGroup,
      ahead: [
        ...(canvas && loose.length > 0 ? [canvas] : []),
        ...loose.flatMap((group) => pictureOfGroup(group) ?? []),
      ],
    };
  };

  /** Each owed pin's section of artifact `artifact`, its link with it, what it carries named as the delivery carries it. */
  const pinSections = (
    artifact: string,
    owed: Pin[],
    groups: Record<string, InkGroup>,
    url: string,
    carried: Map<string, Carried>
  ) =>
    owed.map((pin) =>
      pinDelivery(pin, {
        url,
        link: linkOfPin(artifact, pin),
        carried: (one) => carried.get(one.ref) ?? { as: "file" },
        ...(pin.ink && groups[pin.ink] ? { ink: groups[pin.ink].page } : {}),
      })
    );

  /**
   * Delivers what artifact `id` owes its session as one message: every pin
   * and loose stroke group the session hasn't heard ({@link marksOwed}),
   * each pin as its section or its one resolve line with what it carries,
   * the page's pictures of them; a sheet's saves and errors with them. With
   * `only` (a comment's Try again), those comments alone. Once someone took
   * it, what went is stamped heard ({@link stampDelivered}); when no one
   * did, it stays owed, each pin of it says why ({@link notSent}), and the
   * outcome says why (the writer's transcript keeps it as not sent:
   * server.ts `deliverArtifactMarks`). Nothing owed, nothing goes
   * (`nothing`).
   */
  const deliverMarks = async (
    id: string,
    only?: ReadonlySet<string>
  ): Promise<MarksOutcome | "nothing"> => {
    const row = db.get(id);
    if (!row) {
      held.drop(id);
      return "nothing";
    }
    const instance = holder(row);
    const doc = docs.doc(id);
    const all = marksOwed(doc);
    if (!instance) {
      sayNoHolder(row, all.owed.length + all.loose.length);
      return "nothing";
    }
    const { pins, groups } = all;
    // A comment's Try again carries that comment alone: no other pin, no loose ink.
    const owed = all.owed.filter((pin) => !only || only.has(pin.id));
    const loose = only ? [] : all.loose;
    const errors = errorsOwed(row, doc);
    const saves = savesOwed(row, doc);
    if (owed.length + loose.length + errors.length + saves.length === 0) {
      return "nothing";
    }
    const url = addressOf(id, doc);
    const { canvas, pictureOfGroup, ahead } = loosePictures(row, loose);
    const { images, attachments, carried } = carryAttachments(
      owed,
      (pin) => held.picture(id, pin.id) ?? undefined,
      ahead
    );
    const marks = [
      ...pinSections(row.id, owed, groups, url, carried),
      ...loose.map((group) =>
        inkSection(group, {
          url,
          picture: !!canvas || pictureOfGroup(group) !== null,
        })
      ),
    ];
    // A sheet's saves and compile errors go on the person's marks' own channel.
    const text = marksText(row, marks, errors, saves);
    const outcome = await deps.deliverMarks(instance, row, {
      text,
      images: images.slice(0, COMMENT_LIMITS.pictures),
      attachments,
    });
    sayDelivery(row, instance, {
      pins: owed,
      strokes: loose.length,
      errors: errors.length,
      saves: saves.length,
      retry: !!only,
      outcome,
    });
    if (!outcome.ok) {
      notSent(id, owed, outcome.reason);
      return outcome;
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
    return outcome;
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
      "pins.json": promotedJson(Object.fromEntries(readPins(doc))),
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
          note: artifactToolWords.canvasEmpty,
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
      const before = canvasEntries(docs, row.id);
      const { deleted, missing } = deleteElements(docs, row.id, change.delete);
      const fresh = markSceneChanges(row, before);
      return {
        ...readCanvas(
          db.get(row.id) as ArtifactRow,
          undefined,
          false,
          ownersRead
        ),
        ...markedLinks(row.id, fresh),
        deleted,
        ...(missing.length > 0 ? { missing } : {}),
      };
    }
    // Replacing what the person changed since the session last read it.
    const before = canvasEntries(docs, row.id);
    const present = new Set(before.map((entry) => entry.el.id));
    const underYou =
      "elements" in change
        ? personChangedAfter(row, row.deliveredSeq, present).filter((id) =>
            change.elements.some((element) => element.id === id)
          )
        : [];
    const wrote = await draw(row, change);
    const fresh = markSceneChanges(row, before);
    return {
      ...readCanvas(
        db.get(row.id) as ArtifactRow,
        undefined,
        false,
        ownersRead
      ),
      ...markedLinks(row.id, fresh),
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
    const sheet = sheetOf(row);
    // Every section's states file, from the toolchain root as the host names them.
    const mine = new Set(
      sheet?.files.map((one) => relative(sheet.dir, one)) ?? []
    );
    return {
      ...state,
      errors: state.errors.filter((error) =>
        error.sheets.some((one) => mine.has(one))
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
    if (inPanel(row)) {
      relistOf(row);
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
      // The stage was reached: by a read, or by the daemon's word of it.
      meta.delete("unreached");
      if (sheet) {
        meta.set("sheet", sheet);
      }
      // Compiles again: an error that comes back later is news again.
      if (mine.errors.length === 0) {
        meta.delete("errorsHeard");
      }
    });

  /**
   * Each story's rest frame as a browser drew it (the stage's render
   * report), kept in the canvas's doc (`meta.drawnShapes`, core
   * `CanvasShapes.drawn`) for a decision page's Preview of it: its
   * skeleton stands at that shape before any embed of it has said its own.
   * A story the report has no drawn rest frame of keeps the size it had.
   */
  const drawnWritten = (row: ArtifactRow, report: RenderReport) => {
    const doc = docs.doc(row.id);
    const had = (doc.getMap("meta").get("drawnShapes") ??
      {}) as CanvasShapes["drawn"];
    const now: CanvasShapes["drawn"] = { ...had };
    for (const frame of report.sections.flatMap((one) => one.frames)) {
      if (
        frame.interaction === "rest" &&
        frame.state === "drawn" &&
        frame.box.w > 0 &&
        frame.box.h > 0
      ) {
        now[frame.story] = { w: frame.box.w, h: frame.box.h };
      }
    }
    if (JSON.stringify(now) !== JSON.stringify(had)) {
      docs.transact(row.id, "hub", (written) => {
        written.getMap("meta").set("drawnShapes", now);
      });
    }
  };

  /** The shapes a decision page's media carries of component canvas `row` (core `CanvasShapes`). */
  const shapesOf = (row: ArtifactRow): CanvasShapes => {
    const meta = docs.doc(row.id).getMap("meta");
    return {
      said: (meta.get("saidShapes") ?? {}) as CanvasShapes["said"],
      drawn: (meta.get("drawnShapes") ?? {}) as CanvasShapes["drawn"],
    };
  };

  /**
   * A read that couldn't reach the canvas's stage, kept in its doc (core
   * `StageUnreached`) for the panel and the agent's read alike: the hop that
   * failed, by the hub's refusal (a workspace gone or on no machine, a
   * machine not connected or not answering, else the way to the stage), its
   * words, and since the first such read.
   */
  const unreachedWritten = (row: ArtifactRow, error: unknown) => {
    const status = error instanceof ArtifactRefusal ? error.status : null;
    let down: StageUnreached["down"] = "reach";
    if (status === 409) {
      down = "workspace";
    } else if (status === 503 || status === 504) {
      down = "machine";
    }
    docs.transact(row.id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      const had = meta.get("unreached") as StageUnreached | undefined;
      meta.set("unreached", {
        down,
        why: error instanceof Error ? error.message : String(error),
        since: had?.since ?? new Date().toISOString(),
      } satisfies StageUnreached);
    });
    if (inPanel(row)) {
      relistOf(row);
    }
  };

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
        const { report } = (
          await deps.stage(at, sheet.files[0] as string, sheet.files)
        ).opened;
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
    // A canvas opened on nothing is refused: "Write it, then call again."
    const { machineId, opened, workspace } = await deps.stage(
      at,
      asked[0] as string,
      asked,
      true
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
    drawnWritten(row, report);
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
   * awake. Its stage and each section's problem are the doc's (`meta.stage`),
   * as the panel reads them; a stage the read can't reach is the doc's last
   * stage with `unreached` beside it (`meta.unreached`: why, since when),
   * never a stale `live` alone. Its owner's read when `ownersRead`.
   */
  const readSheet = async (
    row: ArtifactRow,
    since?: number,
    ownersRead = true,
    ask: ComponentReadAsk = {}
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a canvas's read joins its stage, its report, the person's picks and each optional ask in one answer
  ): Promise<ArtifactRead> => {
    const sheet = sheetOf(row);
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
      } catch (error) {
        unreachedWritten(row, error);
      }
      // A draw asked of a stage that answered: refused in its own words when it can't be made.
      if (opened && (ask.render || ask.png)) {
        ({ report, png } = await deps.stageRender(at, {
          files: sheet.files,
          spec: sheet.spec,
          ...(ask.state ? { state: ask.state } : {}),
          ...(ask.png ? { png: true } : {}),
        }));
      }
      if (report) {
        drawnWritten(row, report);
      }
    }
    const meta = docs.doc(row.id).getMap("meta");
    const stage = meta.get("stage") as StageState | undefined;
    const unreached = meta.get("unreached") as StageUnreached | undefined;
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
      ...(stage ? { stage: { ...stage, errors: [] } } : {}),
      ...(unreached ? { unreached } : {}),
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
   * One page a build names as what it builds from, as `instance` writes it:
   * `<page>` or `<page>#<card>`, the page by its name, handle or id
   * ({@link whole}). Refused in words when it is not a page to pick on, or
   * names a card the page does not ask.
   */
  const buildWait = (instance: InstanceRow, one: string): PlanWait => {
    const at = one.indexOf("#");
    const pageName = (at < 0 ? one : one.slice(0, at)).trim();
    const card = at < 0 ? "" : one.slice(at + 1).trim();
    const page = db.get(whole(instance, pageName));
    if (!(page?.kind === "page" && page.does === "pick")) {
      throw new ArtifactRefusal(
        400,
        `buildsFrom “${one}” names ${page ? `${page.name}, a ${page.kind} that asks no picks` : "no artifact"}: name a decision page (does: pick), optionally #card.`
      );
    }
    if (!card) {
      return { artifactId: page.id };
    }
    const asked = choicesAsked(page);
    if (!asked.some((choice) => choice.id === card)) {
      throw new ArtifactRefusal(
        400,
        `buildsFrom “${one}”: ${page.name} has no card “${card}”. Its cards: ${asked.map((choice) => choice.id).join(", ") || "none"}.`
      );
    }
    return { artifactId: page.id, card };
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
    /** The session whose panel held the project's page this create made again, when it was another's. */
    movedFrom?: string | undefined;
    row: ArtifactRow;
  } => {
    const now = new Date();
    const found = namedFor(owner, input.kind, input.name);
    // The project's page another session wrote, or one whose session is
    // gone: made again here, it is this panel's, its doc and picks kept.
    const moved = found && found.instanceId !== owner.id;
    const before = moved
      ? (db.update(found.id, { instanceId: owner.id }) as ArtifactRow)
      : found;
    const movedFrom = moved ? (found.instanceId ?? undefined) : undefined;
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
      return { before, holding, movedFrom, row };
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
      `${notLoaded(at, down.failure)}${down.why ? ` (${down.why})` : ""} ${artifactToolWords.notHanded}`
    );
  };

  /** A session by its link, labelled by its title, as `artifact_list` names it. */
  const sessionNamed = (id: string): string => {
    const session = deps.instance(id);
    return sessionLink(
      id,
      session ? sessionLabel(session).name : "a session since removed"
    );
  };

  /** The delegate that put it in its owner's panel, and its link, as `artifact_list` names it; nothing when the owner made it. */
  const handedBy = (
    row: ArtifactRow
  ): { madeBy?: string; madeByLink?: string } =>
    row.madeBy && row.madeBy !== row.instanceId
      ? { madeBy: row.madeBy, madeByLink: sessionNamed(row.madeBy) }
      : {};

  /**
   * An answer about a held next version, said as its artifact's: that one's
   * id, and the next version's as `held`; with the artifact's link
   * (`[name](cawco:artifact/<id>)`), which the agent names it by.
   */
  const heldAnswer = <T extends { held?: string; id: string }>(
    answer: T
  ): T & { link?: string } => {
    const row = db.get(answer.id);
    const said = row?.heldFor ? { ...answer, ...heldId(row) } : answer;
    return row ? { ...said, link: artifactLink(said.id, row.name) } : said;
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
      const was = pageWas(moved.id);
      writePage(moved.id, html);
      // Every page open on it hears the new revision in the doc and morphs
      // in place (the overlay); nothing reloads.
      stampMeta(moved, pageHash(html));
      const fresh = markChanges(
        moved,
        was ? pageChanges(moved.id, was, { html }) : []
      );
      return {
        ...read(moved, undefined, ownersRead),
        ...markedLinks(moved.heldFor ?? moved.id, fresh),
      };
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
    mediaHeld(holder(row) ?? instance, program);
    const kept = readKept(existing).cards;
    const before = new Set(kept.map((card) => card.id));
    const after = program.read.cards.map((card) => card.id);
    const moved = db.update(row.id, nextRevision(row)) as ArtifactRow;
    const was = pageWas(moved.id);
    writePage(moved.id, page.html, program);
    const hash = pageHash(program.program);
    stampMeta(moved, hash);
    const changes = [
      ...cardChanges(kept, program.read.cards),
      ...pictureChanges(was?.files ?? new Map(), program.files),
    ];
    const fresh = markChanges(moved, changes);
    const touched = new Set(
      changes.filter((item) => item.kind === "card").map((item) => item.anchor)
    );
    return {
      id: moved.id,
      revision: moved.revision,
      pageHash: hash,
      statements: merged.change,
      decisions: after,
      // The cards it put in or rewrote, each by its link: what the agent names them by.
      cards: cardLinks(
        moved.heldFor ?? moved.id,
        program.read.cards.filter((card) =>
          touched.has(`#decision-${cssEscape(card.id)}`)
        )
      ),
      moved: {
        added: after.filter((card) => !before.has(card)),
        removed: [...before].filter((card) => !after.includes(card)),
      },
      ...markedLinks(moved.heldFor ?? moved.id, fresh),
      ...(program.dropped.length > 0 ? { dropped: program.dropped } : {}),
      ...(broken ? { broken } : {}),
    };
  };

  /* ── Needs you (needs.ts) ───────────────────────────────────────────── */

  /** Each artifact's facts as last read, with the row's marks they were read at. */
  const factsKept = new Map<string, { facts: ArtifactFacts; mark: string }>();
  /** What a change of the doc (its seq) or of the row moves: past it, the facts are read again. */
  const factsMark = (row: ArtifactRow): string =>
    `${row.seq}:${row.revision}:${row.openedRevision}:${row.readSeq}:${row.deliveredSeq}:${row.updatedAt.getTime()}`;

  /** When the agent last answered on `pin`: its newest entry, or its resolve. */
  const answeredOn = (pin: Pin): string => {
    const entry = pin.thread.findLast((one) => one.by === "agent")?.at ?? "";
    const resolved =
      pin.resolvedBy === "agent" && pin.resolvedAt ? pin.resolvedAt : "";
    return entry > resolved ? entry : resolved;
  };

  /** A decision page's picks, made of asked, and its first card not picked; none for any other artifact. */
  const picksFacts = (
    row: ArtifactRow,
    state: Record<string, ChoiceEntry>
  ): Pick<ArtifactFacts, "firstUnpicked" | "picks"> => {
    const { asked, made, firstUnpicked } = picksMade(choicesAsked(row), state);
    return {
      firstUnpicked,
      picks: asked > 0 ? { asked, made } : null,
    };
  };

  /** The latest revision's changes the person hasn't looked at. */
  const changesFacts = (doc: Doc): ArtifactFacts["changes"] => {
    const changes = doc.getMap("meta").get("changes") as
      ArtifactChanges | undefined;
    if (!changes) {
      return null;
    }
    const seen = new Set(seenOf(doc).get(String(changes.revision)) ?? []);
    return {
      revision: changes.revision,
      count: changes.items.filter((item) => !seen.has(item.anchor)).length,
    };
  };

  /**
   * What artifact `row`'s doc says, read once per change of it or of its
   * row. `heldNext`: whether a maker's change is held for it, when the
   * caller read that for every artifact at once.
   */
  const factsOf = (
    row: ArtifactRow,
    heldNext = db.heldOf(row.id) !== undefined
  ): ArtifactFacts => {
    // A maker's change held for its parent to open: the parent's move.
    const mark = factsMark(row);
    const kept = factsKept.get(row.id);
    if (kept?.mark === mark) {
      return heldNext ? { ...kept.facts, handed: true } : kept.facts;
    }
    const doc = docs.doc(row.id);
    const meta = doc.getMap("meta");
    const state = stateOf(doc);
    const { sentAt } = metaOf(doc);
    const pins = [...readPins(doc).values()].sort(
      (a, b) => a.number - b.number
    );
    const asking = pins.filter(pinAsks);
    const facts: ArtifactFacts = {
      ...picksFacts(row, state),
      asked: (meta.get("asked") as ArtifactAsked | undefined) ?? null,
      asking: asking.map((pin) => pin.number),
      askingAt: asking
        .map(answeredOn)
        .reduce<string | null>((a, b) => (a !== null && a > b ? a : b), null),
      changes: changesFacts(doc),
      closed: pins
        .filter((pin) => pin.resolvedAt && newAnswer(pin))
        .map((pin) => ({ pin: pin.number, at: answeredOn(pin) })),
      draft: meta.get("draft") === true,
      gone: (meta.get(SOURCE_GONE) as { why: string } | undefined)?.why ?? null,
      lookedAt: (meta.get("lookedAt") as string | undefined) ?? null,
      // Its page gone; one standing now is read beside the facts (mediaNow).
      media: meta.has(MEDIA_OF),
      revisedAt: (meta.get("revisedAt") as string | undefined) ?? null,
      handed: meta.get(HANDED) === true,
      unsent: unsentChoices(state, sentAt),
    };
    factsKept.set(row.id, { facts, mark });
    return heldNext ? { ...facts, handed: true } : facts;
  };

  /**
   * Its ask as its doc keeps it; one made before asks were kept stands as
   * its maker's at its last publish, so its writer's turns retire it too.
   */
  const askOf = (
    row: ArtifactRow,
    facts: ArtifactFacts
  ): ArtifactAsked | null => {
    if (facts.asked) {
      return facts.asked;
    }
    const by = row.madeBy ?? row.instanceId;
    return by
      ? { by, at: facts.revisedAt ?? row.updatedAt.toISOString() }
      : null;
  };

  /** What the hub holds of `row`'s sessions, as its rules read it (needs.ts). */
  const sessionsOf = (
    row: ArtifactRow,
    facts: ArtifactFacts
  ): ArtifactSessions => {
    const owner = holder(row);
    const writer = askOf(row, facts)?.by;
    return {
      ended: !owner || deps.finished(owner),
      harness: owner?.harness ?? null,
      machineId: owner?.machineId ?? null,
      steps: writer ? deps.steps(writer) : [],
    };
  };

  /** What `row` waits on the person for now; null when nothing. */
  const pendingFor = (row: ArtifactRow): ArtifactPending | null => {
    const facts = withMedia(row, factsOf(row));
    if (!mayWait(row, facts)) {
      return null;
    }
    return pendingOf(
      row,
      { ...facts, asked: askOf(row, facts) },
      sessionsOf(row, facts)
    );
  };

  /* ── Files: what reached the person ─────────────────────────────────── */

  /**
   * Whether `row`'s session put it in front of the person: not handed up
   * and not held for a parent; a try only while its session can still run
   * it (not ended, not moved on from), since a try nobody saw is nothing to
   * keep. Whether it asks anything is Needs you's rule (needs.ts), not this.
   */
  const putBeforePerson = (row: ArtifactRow): boolean => {
    const kept = factsOf(row);
    if (kept.draft || kept.handed || row.heldFor !== null) {
      return false;
    }
    if (row.does !== "try") {
      return true;
    }
    const sessions = sessionsOf(row, kept);
    return !(
      sessions.ended || movedOn(row.id, askOf(row, kept), sessions.steps)
    );
  };

  /**
   * Whether `row` reached the person, so Files lists it: a view of theirs
   * had it on screen at least once (`openedRevision`, `shownAt`), its
   * session put it in front of them ({@link putBeforePerson}), or they made
   * it (their composer canvas, the one create that writes `meta.draft`). A
   * browser is listed as soon as it is the session's (browsers.ts `listed`):
   * Files is where the person finds it, opens it in the panel and takes it
   * over (Projects spec §5.11, "The view": "listed in the panel of every
   * session of the project"), whatever started the session. Nothing is
   * deleted by it: the panel's menu ({@link Artifacts.list}) and
   * `artifact_list` keep every artifact, and one that reaches the person
   * later is listed from then on.
   */
  const reachedPerson = (row: ArtifactRow): boolean =>
    row.kind === "browser" ||
    row.openedRevision !== null ||
    row.shownAt !== null ||
    docs.doc(row.id).getMap("meta").has("draft") ||
    putBeforePerson(row);

  /** The artifacts each decision page's Canvas and Preview pieces show, by the page's id, read once per change of it. */
  const mediaKept = new Map<string, { at: number; ids: string[] }>();
  const mediaOf = (row: ArtifactRow): string[] => {
    const at = row.updatedAt.getTime();
    const kept = mediaKept.get(row.id);
    if (kept?.at === at) {
      return kept.ids;
    }
    const program = programOf(row);
    const ids =
      program === undefined
        ? []
        : readKept(program).artifacts.map((media) => media.id);
    mediaKept.set(row.id, { at, ids });
    return ids;
  };

  /**
   * `row`'s facts with whether it is an option's media now: a Canvas or
   * Preview piece of a decision page among `pages` (its session's, read
   * here when not given), or of one that went (`facts.media`).
   */
  const withMedia = (
    row: ArtifactRow,
    facts: ArtifactFacts,
    pages?: readonly ArtifactRow[]
  ): ArtifactFacts => {
    if (facts.media || row.instanceId === null || row.kind === "page") {
      return facts;
    }
    const shownOn = (
      pages ??
      db.ofInstance(row.instanceId).filter((one) => one.kind === "page")
    ).some((page) => mediaOf(page).includes(row.id));
    return shownOn ? { ...facts, media: true } : facts;
  };

  /**
   * Files' list of the session's artifacts, newest first: those that
   * reached the person ({@link reachedPerson}), less a listed decision
   * page's embedded media (its Canvases and Previews), which are reached
   * through their page and get no row of their own.
   */
  const filesOf = (instance: InstanceRow): ArtifactRow[] => {
    // The browser the session uses gets its artifact here too, made the
    // first time: a session whose panel never opened lists it in Files.
    deps.listing(instance);
    const rows = db.ofInstance(instance.id).filter(reachedPerson);
    const embedded = new Set(rows.flatMap(mediaOf));
    return rows.filter((row) => !embedded.has(row.id));
  };

  /**
   * `writer`'s create, revision or show of artifact `id`: its ask stands
   * again from now, and when it asks a pick or a judgement the writer's
   * current step waits on it (plans.ts `waitOn`; needs.ts rule 2).
   */
  const askedNow = (writer: InstanceRow, id: string): void => {
    const row = db.get(id);
    // The person's own composer canvas asks nothing until it is sent.
    if (
      !row ||
      row.heldFor !== null ||
      docs.doc(row.id).getMap("meta").get("draft") === true
    ) {
      return;
    }
    const step =
      row.does === "pick" || row.does === "judge"
        ? deps.waitOn(writer.id, row.id)
        : null;
    const thread = deps.askThread(writer);
    const asked: ArtifactAsked = {
      by: writer.id,
      at: new Date().toISOString(),
      ...(step ? { step } : {}),
      ...(thread ? { thread } : {}),
    };
    docs.transact(row.id, "hub", (doc) =>
      doc.getMap("meta").set("asked", asked)
    );
    deps.needsMoved();
  };

  /** The person's Send of `row`: answered whole (needs.ts rule 1), no step of its writer waits on it any more. */
  const answeredBy = (row: ArtifactRow): void => {
    const writer = askOf(row, factsOf(row))?.by;
    if (writer && !pendingFor(row)) {
      deps.clearArtifactWait(writer, row.id);
    }
    deps.needsMoved();
  };

  /**
   * The Not now's in the person's acknowledgements, by artifact: the
   * latest `raisedAt` each was put away at. Raised again later, it is back.
   */
  const parkedNow = (acknowledged: readonly string[]): Map<string, number> => {
    const parked = new Map<string, number>();
    for (const id of acknowledged) {
      const match = NOT_NOW.exec(id);
      if (match) {
        const [, artifact = "", at = "0"] = match;
        parked.set(artifact, Math.max(parked.get(artifact) ?? 0, Number(at)));
      }
    }
    return parked;
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
    const pins = [...readPins(doc).values()].filter(
      (pin) => !pin.resolvedAt
    ).length;
    const { asked, made } = picksMade(choicesAsked(row), state);
    const picks =
      asked > 0
        ? {
            asked,
            made,
            unsent: unsentChoices(state, sentAt),
          }
        : undefined;
    const shown = inPanel(row);
    const opened = row.openedRevision === row.revision;
    const draft = doc.getMap("meta").get("draft") === true;
    // Handed up and not opened, or a maker's change held for the parent to open.
    const handed =
      doc.getMap("meta").get(HANDED) === true ||
      db.heldOf(row.id) !== undefined;
    const waitingOn: ArtifactStatus["waitingOn"] = [];
    // The person's move: what Needs you lists it for (needs.ts), its asks retired by their rules.
    if (pendingFor(row)) {
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
      ...(row.instanceId === null || row.instanceId === caller.id
        ? {}
        : {
            session: row.instanceId,
            sessionLink: sessionNamed(row.instanceId),
          }),
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
    /**
     * Needs you's artifacts (needs.ts): each waiting on the person, oldest
     * first, one put away with Not now marked `parked` until it is raised
     * again; and each artifact's
     * notice, its parts the person has not acknowledged, newest first.
     */
    needs: (): ArtifactNeedsRead => {
      const acknowledged = deps.acknowledged();
      const seen = new Set(acknowledged);
      const parked = parkedNow(acknowledged);
      const needs: ArtifactNeedsRead["needs"] = [];
      const notices: ArtifactNeedsRead["notices"] = [];
      const rows = db.asking();
      // Which of them a maker's change is held for, in one read.
      const heldNext = db.heldTargets();
      // An artifact gone takes its facts with it.
      const standing = new Set(rows.map((row) => row.id));
      for (const id of factsKept.keys()) {
        if (!standing.has(id)) {
          factsKept.delete(id);
        }
      }
      // Each session's pages, whose Canvases and Previews ask nothing of their own.
      const pages = Map.groupBy(
        rows.filter((row) => row.kind === "page"),
        (row) => row.instanceId
      );
      for (const row of rows) {
        const kept = withMedia(
          row,
          factsOf(row, heldNext.has(row.id)),
          pages.get(row.instanceId) ?? []
        );
        if (!mayWait(row, kept)) {
          continue;
        }
        const facts = { ...kept, asked: askOf(row, kept) };
        const sessions = sessionsOf(row, kept);
        const need = needOf(row, facts, sessions);
        if (need) {
          needs.push({
            ...need,
            parked: (parked.get(row.id) ?? -1) >= need.raisedAt,
          });
        }
        const notice = noticeOf(row, facts, sessions);
        const parts = notice?.parts.filter((part) => !seen.has(part.id));
        if (notice && parts && parts.length > 0) {
          notices.push({ ...notice, parts });
        }
      }
      return {
        needs: needs.sort((a, b) => a.raisedAt - b.raisedAt),
        notices: notices.sort((a, b) => b.at - a.at),
      };
    },

    /** Whether the person had artifact `id` on screen at or after `at` (ms epoch). */
    /**
     * What artifact `id`'s machine said of its folder at its preview's last
     * start (server.ts `openPreview`, `reachPreview`): `gone`, the daemon's
     * words that it isn't there (core preview-proxy `isFolderGone`), takes it
     * out of Needs you and keeps it in Files; null, it was there.
     */
    /**
     * The folder previews on machine `machineId` that are in Needs you, or
     * would be but for a gone folder recorded: each one's folder, for the
     * machine to read as it registers (server.ts `foldersSeen`).
     */
    foldersAsking: (machineId: string): { dir: string; id: string }[] =>
      db.asking().flatMap((row) => {
        if (
          row.machineId !== machineId ||
          row.kind !== "preview" ||
          !("dir" in row.source)
        ) {
          return [];
        }
        const kept = { ...withMedia(row, factsOf(row)), gone: null };
        const facts = { ...kept, asked: askOf(row, kept) };
        return mayWait(row, kept) &&
          needOf(row, facts, sessionsOf(row, kept)) !== null
          ? [{ id: row.id, dir: row.source.dir }]
          : [];
      }),

    sourceSeen: (id: string, gone: string | null): void => {
      const row = db.get(id);
      if (!row) {
        return;
      }
      const meta = docs.doc(id).getMap("meta");
      const was = (meta.get(SOURCE_GONE) as { why: string } | undefined)?.why;
      if ((was ?? null) === gone) {
        return;
      }
      docs.transact(id, "hub", () => {
        if (gone === null) {
          meta.delete(SOURCE_GONE);
        } else {
          meta.set(SOURCE_GONE, { at: new Date().toISOString(), why: gone });
        }
      });
      deps.needsMoved();
    },

    lookedSince: (id: string, at: number): boolean => {
      const row = db.get(id);
      const looked = row ? factsOf(row).lookedAt : null;
      return looked !== null && Date.parse(looked) >= at;
    },

    /**
     * Whether session `instanceId` asked artifact `id` in the turn that
     * followed the end at `before` (null: its first): its create, revision
     * or show came after it.
     */
    askedIn: (id: string, instanceId: string, before: Date | null): boolean => {
      const row = db.get(id);
      const asked = row ? askOf(row, factsOf(row)) : null;
      return (
        asked?.by === instanceId &&
        (before === null || asked.at > before.toISOString())
      );
    },

    /** What artifact `id` waits on the person for now; null when nothing, or no artifact. */
    pending: (id: string): ArtifactPending | null => {
      const row = db.get(id);
      return row ? pendingFor(row) : null;
    },

    /**
     * Session `instanceId`'s turn ended at `endedAt`, the one before it at
     * `before` (server.ts, at every result, on every harness). Each ask it
     * made before this turn began, still asked, with no step of its plan
     * waiting on it, is one it moved on from (needs.ts rule 2): this turn
     * was its next.
     */
    turnEnded: (
      instanceId: string,
      before: Date | null,
      endedAt: Date
    ): void => {
      if (!before) {
        return;
      }
      const from = before.toISOString();
      const steps = deps.steps(instanceId);
      let moved = false;
      for (const row of db.asking()) {
        const facts = factsOf(row);
        const asked = askOf(row, facts);
        if (
          !asked ||
          asked.by !== instanceId ||
          asked.movedAt ||
          asked.at >= from ||
          movedOn(row.id, asked, steps) ||
          steps.some((step) => stepWaitsOnArtifact(step, row.id)) ||
          !pendingFor(row)
        ) {
          continue;
        }
        const next: ArtifactAsked = {
          ...asked,
          movedAt: endedAt.toISOString(),
        };
        docs.transact(row.id, "hub", (doc) =>
          doc.getMap("meta").set("asked", next)
        );
        moved = true;
      }
      if (moved) {
        deps.needsMoved();
      }
    },

    /** The whole id of the artifact a session names by its name, handle or id ({@link whole}). */
    named: (instanceId: string, asked: string): string =>
      whole(sessionOf(instanceId), asked),

    /**
     * The decision pages a build session `instanceId` starts names as what it
     * builds from (`delegate`'s and a task's `buildsFrom`): each `<page>` or
     * `<page>#<card>`, the page by its name, handle or id as {@link whole}
     * reads it. Refused in words when one is not a page to pick on, or names
     * a card the page does not ask.
     */
    buildsFrom: (
      instanceId: string,
      written: readonly string[]
    ): PlanWait[] => {
      const instance = sessionOf(instanceId);
      const waits = written.map((one) => buildWait(instance, one));
      return [
        ...new Map(
          waits.map((wait) => [`${wait.artifactId}#${wait.card ?? ""}`, wait])
        ).values(),
      ];
    },

    /**
     * The decision pages session `instanceId` can name that `text` mentions:
     * by whole id, by handle, by name, or by link. What `delegate` warns of
     * when a brief mentions a page it does not name in `buildsFrom`.
     */
    pagesIn: (
      instanceId: string,
      text: string
    ): { id: string; name: string }[] => {
      const instance = sessionOf(instanceId);
      const holders = holdersInTree(instance);
      const rows = new Map<string, ArtifactRow>();
      for (const row of [
        ...answerable(instance, holders),
        ...ofTree(instance, holders),
        ...(instance.projectId ? db.ofProject(instance.projectId) : []),
      ]) {
        if (row.kind === "page" && row.does === "pick") {
          rows.set(row.id, row);
        }
      }
      const said = text.toLowerCase();
      const token = (word: string) =>
        new RegExp(
          `(^|[^a-z0-9-])${word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}($|[^a-z0-9-])`,
          "u"
        ).test(said);
      return [...rows.values()]
        .filter(
          (row) =>
            said.includes(row.id) ||
            token(row.id.slice(0, 8)) ||
            token(row.name.toLowerCase())
        )
        .map((row) => ({ id: row.id, name: row.name }));
    },

    /**
     * What the person still owes on the pages `from` names (a build's
     * `buildsFrom`): each named card, or every card of a page named whole,
     * with no pick (core `pickMade`) or with an open pin on it. A page since
     * removed owes nothing. Empty: the build may land.
     */
    /**
     * Card `card` of page `artifactId` as a wait reads it (task-waits.ts
     * `settled`): its question, whether the page asks it, and the pick it
     * holds (core `pickMade`) as its value, the options picked or the value
     * set; null while unpicked. Undefined once the page is deleted.
     */
    waitCard: (
      artifactId: string,
      card: string
    ):
      | { asked: boolean; page: string; question: string; value: string | null }
      | undefined => {
      const page = db.get(artifactId);
      if (!page) {
        return;
      }
      const asked = choicesAsked(page).find((choice) => choice.id === card);
      const entry = stateOf(docs.doc(artifactId))[card];
      const picked = !!asked && pickMade(asked.card, entry);
      let value: string | null = null;
      if (picked && entry) {
        value =
          entry.options.length > 0
            ? entry.options.join(", ")
            : JSON.stringify(entry.value);
      }
      return {
        page: page.name,
        question: asked?.card?.question ?? card,
        asked: !!asked,
        value,
      };
    },

    /** Pin `number` of artifact `artifactId` as a wait reads it: what it stands on, and whether it is resolved; undefined when it is gone. */
    waitPin: (
      artifactId: string,
      number: number
    ): { label: string; resolved: boolean } | undefined => {
      if (!db.get(artifactId)) {
        return;
      }
      const pin = [...readPins(docs.doc(artifactId)).values()].find(
        (one) => one.number === number
      );
      return pin
        ? { label: pinName(pin), resolved: !!pin.resolvedAt }
        : undefined;
    },

    /** The cards page `artifactId` asks, by id. */
    waitCards: (artifactId: string): string[] => {
      const page = db.get(artifactId);
      return page ? choicesAsked(page).map((choice) => choice.id) : [];
    },

    /**
     * The page a wait names, by its name, handle or id: among what session
     * `instanceId` may name ({@link whole}), or, for the dashboard (null),
     * any of the project's pages. A refusal in words when it names none.
     */
    waitPage: (
      instanceId: string | null,
      projectId: string,
      asked: string
    ): { id: string; name: string } | string => {
      try {
        const id = instanceId
          ? whole(sessionOf(instanceId), asked)
          : byHandle(
              asked,
              db.ofProject(projectId),
              {
                id: (row) => row.id,
                names: (row) => [row.name],
                said: (row) =>
                  `${row.name} (${row.kind} ${row.id.slice(0, 8)})`,
              },
              "artifact"
            ).id;
        const page = db.get(id);
        return page
          ? { id: page.id, name: page.name }
          : `No page ${asked} is in the project.`;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },

    /**
     * The pin whose thread session `instanceId` last heard a person's words
     * from, at or after `since` (ms epoch): the pin thread an ask it acts on
     * came from (tasks.ts `found_in`). Undefined when none.
     */
    askedFromPin: (
      instanceId: string,
      since: number
    ): { artifactId: string; number: number } | undefined => {
      const told = db.ofInstance(instanceId).flatMap((row) =>
        [...readPins(docs.doc(row.id)).values()].flatMap((pin) =>
          pin.thread.map((entry) => ({
            artifactId: row.id,
            number: pin.number,
            at: entry.sentAt ? Date.parse(entry.sentAt) : Number.NaN,
          }))
        )
      );
      const [newest] = told
        .filter((one) => one.at >= since)
        .sort((a, b) => b.at - a.at);
      return newest && { artifactId: newest.artifactId, number: newest.number };
    },

    owedOn: (from: readonly PlanWait[]): PageOwed[] => {
      const owed: PageOwed[] = [];
      for (const [id, waits] of Map.groupBy(from, (wait) => wait.artifactId)) {
        const page = db.get(id);
        if (page?.kind !== "page") {
          continue;
        }
        const onlyCards = waits.every((wait) => wait.card)
          ? new Set(waits.map((wait) => wait.card))
          : null;
        const doc = docs.doc(id);
        const state = stateOf(doc);
        const open = [...readPins(doc).values()].filter(
          (pin) => !pin.resolvedAt
        );
        const cards = choicesAsked(page).flatMap(({ card, id: choice }) => {
          if (onlyCards && !onlyCards.has(choice)) {
            return [];
          }
          const unpicked = !pickMade(card, state[choice]);
          const pins = open
            .filter((pin) => pinOnChoice(pin, choice))
            .map((pin) => pin.number)
            .sort((a, b) => a - b);
          return unpicked || pins.length > 0
            ? [
                {
                  id: choice,
                  question: card?.question ?? choice,
                  unpicked,
                  pins,
                },
              ]
            : [];
        });
        if (cards.length > 0) {
          const program = programOf(page);
          owed.push({
            artifactId: id,
            title: (program && readKept(program).title) || page.name,
            cards,
          });
        }
      }
      return owed;
    },

    /** Every artifact the session holds, newest first: its panel's menu, where each stays reachable. */
    list: (instanceId: string): ArtifactSummary[] => {
      const instance = sessionOf(instanceId);
      deps.listing(instance);
      return db.ofInstance(instance.id).map(summaryOf);
    },

    /**
     * Files' list: the session's artifacts that reached the person, newest
     * first ({@link filesOf}). A conversation the hub holds no row for (one
     * stored on a machine, its machine there or away) holds none: artifacts
     * are kept by a session's row.
     */
    files: (instanceId: string): ArtifactSummary[] => {
      const row = deps.instance(instanceId);
      return row ? filesOf(row).map(summaryOf) : [];
    },

    /**
     * Files' search over the artifacts Files lists ({@link filesOf}), by
     * the find engine's own matcher (find-names `matchOf`, what Find and the
     * composer's finder answer with): every word must match the name, the
     * kind words, or the words on its page, at the transcript's lower
     * weight. Best match first, then newest; a page that matched by its
     * words brings the words round the first hit (`excerptOf`).
     */
    search: (instanceId: string, q: string): ArtifactHit[] => {
      const query = parse(q);
      const rows = filesOf(sessionOf(instanceId));
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
      const { row } = panelHeld(instanceId, id);
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
     * every session's of its project), and its delegation tree's
     * ({@link ofTree}), each of another session's with its `session`,
     * newest first, each with whose move it is; `waiting` keeps those where
     * it is somebody's.
     */
    status: (instanceId: string, waitingOnly = false): ArtifactStatus[] => {
      const instance = sessionOf(instanceId);
      const holders = holdersInTree(instance);
      const rows = [
        ...new Map(
          [...answerable(instance, holders), ...ofTree(instance, holders)].map(
            (row) => [row.id, row]
          )
        ).values(),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
      if (row.instanceId === null) {
        throw new ArtifactRefusal(
          404,
          `No session holds ${row.name} now: it is its project's page, in the project's Decisions tab.`
        );
      }
      return {
        ...summaryOf(row),
        instanceId: row.instanceId,
        shown: inPanel(row),
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
        const made = linked(await ownWay);
        askedNow(instance, made.id);
        return made;
      }
      let source: PreviewSource = { page: input.name };
      let machineId: string | null = null;
      let html: string | null = null;
      let program: BuiltProgram | undefined;
      let broken: PageBroken | undefined;
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
      const { before, holding, movedFrom, row } = placed(making, input, {
        source,
        machineId,
      });
      letGo(movedFrom, row);
      const made = html === null ? [] : writeMade(row, html, program);
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
      askedNow(instance, said.id);
      return {
        ...said,
        kind: row.kind,
        name: row.name,
        route: routeOf(said.id),
        link: artifactLink(said.id, row.name),
        ...openedOf(shown),
        ...(stage ? { stage } : {}),
        ...(weight ? { weight } : {}),
        ...programAnswer(said.id, program),
        ...markedLinks(said.id, made),
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
      askedNow(instance, found.id);
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
          throw error instanceof ProgramRefusal
            ? refusedProgram(error)
            : unmerged(error);
        }
        return programRevised(instance, row, existing, merged);
      };
      const revised = peer
        ? await revisedOn(db.heldOf(peer.id) ?? peer)
        : await changedBy(instance, found, revisedOn);
      askedNow(instance, found.id);
      return heldAnswer(revised);
    },

    /**
     * Whether session `instanceId`'s panel may hold artifact `id` (a whole
     * id) ({@link sees}): its doc socket, its comments and its Send
     * (preview-routes.ts) admit exactly these. False for a session or an
     * artifact the hub doesn't hold.
     */
    panelSees: (instanceId: string, id: string): boolean => {
      const instance = deps.instance(instanceId);
      const row = db.get(id);
      return !!(instance && row && sees(instance, row));
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
      media: Record<
        string,
        { kind: ArtifactKind; name: string; shapes?: CanvasShapes } | null
      >;
    } | null => {
      const row = db.get(id);
      const program = row ? programOf(row) : undefined;
      if (program === undefined) {
        return null;
      }
      const media: Record<
        string,
        { kind: ArtifactKind; name: string; shapes?: CanvasShapes } | null
      > = {};
      for (const { id: shown } of readKept(program).artifacts) {
        const shownRow = row && mediaSeen(row, shown);
        if (!shownRow) {
          media[shown] = null;
          continue;
        }
        media[shown] = {
          kind: shownRow.kind,
          name: shownRow.name,
          ...(shownRow.kind === "component"
            ? { shapes: shapesOf(shownRow) }
            : {}),
        };
      }
      return { hash: pageHash(program), media };
    },

    /**
     * The shape an embed of component canvas `id` said for the stories a
     * Preview names (core `storiesKey`), as a decision page's Preview heard
     * it, kept in the canvas's doc (`meta.saidShapes`): the page's media
     * carries it from then on, so the next Preview of it, in any browser,
     * stands its skeleton at that shape from its first paint. Changed only
     * when it differs. False for an artifact that is no component canvas.
     */
    keepSaidShape: (id: string, key: string, shape: EmbedShape): boolean => {
      const row = db.get(id);
      if (row?.kind !== "component") {
        return false;
      }
      const meta = docs.doc(id).getMap("meta");
      const had = (meta.get("saidShapes") ?? {}) as CanvasShapes["said"];
      const before = had[key];
      if (before?.h === shape.h && before.w === shape.w) {
        return true;
      }
      docs.transact(id, "hub", (doc) => {
        doc
          .getMap("meta")
          .set("saidShapes", { ...had, [key]: { h: shape.h, w: shape.w } });
      });
      return true;
    },

    /**
     * Whether decision page `pageId` shows artifact `id` as a Canvas or
     * Preview piece its session sees ({@link mediaSeen}): its origin then
     * serves that artifact inside it, a delegate's as its own.
     */
    pageShows: (pageId: string, id: string): boolean => {
      const page = db.get(pageId);
      return !!page && mediaOf(page).includes(id) && !!mediaSeen(page, id);
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
      askedNow(instance, row.id);
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
      if (inPanel(next)) {
        await show(next);
      }
      askedNow(instance, next.id);
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
      relistOf(row);
      askedNow(sessionOf(instanceId), row.id);
      return { id: row.id, ask };
    },

    /**
     * The person's Save in a sheet's inspector, or its story buttons, from
     * any panel that sees it ({@link panelHeld}): the same write as its
     * session's `artifact_update`, owed to that session.
     */
    sheetWrite: (
      instanceId: string,
      id: string,
      change: SheetChange
    ): Promise<ArtifactRead> =>
      writeSheet(panelHeld(instanceId, id).row, change, "person"),

    /** The panel's Verify on a component canvas, from any panel that sees it ({@link panelHeld}): a round asked for the canvas's session, whose verdict reaches that session. */
    verifyFor: (instanceId: string, id: string): Promise<string> => {
      const { owner, row } = panelHeld(instanceId, id);
      return askVerify(owner, row);
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
      const row = viewable(sessionOf(instanceId), id);
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
    /**
     * Machine `machineId`'s agent registered again: the hop a read found down
     * on it (`machine`, `reach`) is back, so each of its canvases' docs lets
     * `meta.unreached` go, as a reached read's `stageWritten` does; a
     * `workspace` one waits for that workspace's stage to say it is up
     * ({@link staged}).
     */
    machineBack: (machineId: string): void => {
      for (const row of db.componentsOn(machineId)) {
        const unreached = docs.doc(row.id).getMap("meta").get("unreached") as
          StageUnreached | undefined;
        if (!(unreached && unreached.down !== "workspace")) {
          continue;
        }
        // One doc that can't be written is that canvas's: the register goes on.
        try {
          docs.transact(row.id, "hub", (doc) => {
            doc.getMap("meta").delete("unreached");
          });
        } catch (error) {
          console.warn(
            `[artifacts] ${row.id} still says its stage is unreached: ${error instanceof Error ? error.message : String(error)}`
          );
          continue;
        }
        if (inPanel(row)) {
          relistOf(row);
        }
      }
    },

    /**
     * Canvas `id`'s stage answered its page through the hub's relay (preview.ts
     * `relay`, core `PREVIEW_SERVED_HEADER`): whatever hop a read found down
     * is back, so its doc lets `meta.unreached` go, as a reached read's
     * `stageWritten` does. Asked on every answer the page gets: a doc that
     * says nothing of it is left as it is.
     */
    stageAnswered: (id: string): void => {
      const row = db.get(id);
      if (!(row && row.kind === "component")) {
        return;
      }
      if (!docs.doc(id).getMap("meta").has("unreached")) {
        return;
      }
      docs.transact(id, "hub", (doc) => {
        doc.getMap("meta").delete("unreached");
      });
      if (inPanel(row)) {
        relistOf(row);
      }
    },

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

    /**
     * Artifact `id` as the files a session hands another (hub
     * handed-inputs.ts), for a session that reads it as `artifact_read` does
     * ({@link readTarget}), each named `artifact-<name>.<ext>`, and none of
     * it the owner's read:
     * - a page: its HTML, its program when a decision page, and its picks
     *   and notes as JSON;
     * - a preview: its source, picks and stage as JSON with a pass into it,
     *   minted when it is written for the session it is handed to, whose
     *   browser alone it lets in; when that session's workspace cannot reach
     *   the preview's origin ({@link ArtifactServiceDeps.workspaceReach}),
     *   no pass, and why, in its place;
     * - a canvas: its scene (`.excalidraw`) and outline;
     * - a component canvas: its stories, stage, picks and what its stage
     *   drew, read as `artifact_read` with `render` and `png` reads it, its
     *   frames as drawn the picture, and `states`, the states files for the
     *   caller to read from its workspace;
     * and the latest picture of any that has one.
     */
    handed: async (
      instanceId: string,
      id: string
    ): Promise<{
      files: HandedArtifactFile[];
      row: ArtifactRow;
      states: { files: string[]; workspace: string } | null;
    }> => {
      const instance = sessionOf(instanceId);
      const row = readTarget(instance, id);
      const base = `artifact-${row.name}`;
      const files: HandedArtifactFile[] = [];
      let drawn: Buffer | null = null;
      let states: { files: string[]; workspace: string } | null = null;
      if (row.kind === "browser") {
        throw new ArtifactRefusal(
          409,
          `${row.name} is a browser: nothing of it is a file. Hand what it shows as a preview, or its URL as text.`
        );
      }
      if (row.kind === "canvas") {
        const { file, outline } = canvasFile(row.id);
        files.push(
          { name: `${base}.excalidraw`, bytes: jsonFile(file) },
          { name: `${base}.md`, bytes: Buffer.from(`${outline}\n`) }
        );
      } else if (row.kind === "page") {
        const program = programOf(row);
        files.push(
          {
            name: `${base}.html`,
            bytes: readFileSync(join(deps.root, row.id, "index.html")),
          },
          ...(program === undefined
            ? []
            : [{ name: `${base}.oui`, bytes: Buffer.from(program) }]),
          { name: `${base}.json`, bytes: jsonFile(read(row, undefined, false)) }
        );
      } else if (row.kind === "preview") {
        // Refused now, in its words, when it has no address to open: the
        // pass the receiver gets is minted once its session stands.
        deps.browse(instance, row);
        const stands = {
          ...read(row, undefined, false),
          source: row.source,
          machine: machineOf(row),
        };
        files.push({
          name: `${base}.json`,
          bytes: async ({ session, machineId }) => {
            const pass = deps.browse(session, row);
            const unreached = await deps.workspaceReach(pass.url, machineId);
            return jsonFile(
              unreached
                ? {
                    ...stands,
                    pass: null,
                    reach: `${unreached}. What you have of it is this file and its latest picture, ${base}.png, when it has one; for more, ask your parent with handoff.`,
                  }
                : {
                    ...stands,
                    pass: {
                      ...pass,
                      how: `Load url once in your own browser tool: it lets that browser into ${row.name} until expiresAt or your session ends; artifact_browse { id: "${row.id}" } gives you a fresh one.`,
                    },
                  }
            );
          },
        });
      } else {
        const sheet = sheetOf(row);
        const { png, ...answer } = await readSheet(row, undefined, false, {
          render: true,
          png: true,
        });
        drawn = png ? Buffer.from(png, "base64") : null;
        states = sheet && { files: sheet.files, workspace: sheet.workspace };
        files.push({
          name: `${base}.json`,
          bytes: jsonFile({
            ...answer,
            files: sheet?.files ?? [],
            sheet: docs.doc(row.id).getMap("meta").get("sheet") ?? null,
          }),
        });
      }
      const picture = drawn ?? latestPicture(row);
      if (picture) {
        files.push({ name: `${base}.png`, bytes: picture });
      }
      return { files, row, states };
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
        // A canvas is always its session's: only a project's page outlives one.
        ...deps.previewAddress(row.instanceId as string),
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
     * Brings an artifact to the front of session `instanceId`'s panel and
     * waits for a view to have it on screen ({@link Opened}); a refusal when
     * its server could not be started. The session shows its own, one it
     * made, or another session's of its delegation tree ({@link viewable}),
     * at the agent's call or the person's. Another session's opens in the caller's panel as it stands, never the
     * owner's, and nothing of it changes. The owner's show of one with a held
     * next version (or of that version, by its id) opens the next version
     * ({@link promote}); the person's shows what the panel has.
     */
    show: async (
      instanceId: string,
      id: string,
      by: PanelHand
    ): Promise<Shown> => {
      const instance = sessionOf(instanceId);
      const found = viewable(instance, id);
      let row = found.heldFor === null ? found : db.get(found.heldFor);
      if (!row) {
        throw new ArtifactRefusal(404, artifactToolWords.noArtifact(id));
      }
      const next =
        by === "agent" && row.instanceId === instance.id
          ? db.heldOf(row.id)
          : undefined;
      if (next) {
        row = await promote(row, next);
      }
      const shown = await show(row, instance.id);
      if (!shown.started) {
        throw new ArtifactRefusal(503, shown.why);
      }
      // The agent's show of its own asks again (needs.ts rule 2: a new show of it).
      if (by === "agent" && row.instanceId === instance.id) {
        askedNow(instance, row.id);
      }
      // Its link: what the agent names it by, and its tool row draws.
      return { ...openedOf(shown), link: artifactLink(row.id, row.name) };
    },

    /**
     * `artifact_browse`: where session `instanceId`'s own browser opens
     * artifact `id`, for any artifact `artifact_read` reads ({@link
     * readTarget}): its maker opens what it changed, the next version held
     * for its parent. A browser artifact is the browser itself, and opens
     * nothing. A session in a workspace whose boundary cannot reach the
     * address ({@link ArtifactServiceDeps.workspaceReach}) is refused, in
     * words saying why, rather than handed an address it cannot open.
     */
    browse: async (
      instanceId: string,
      id: string
    ): Promise<Browsed & { link: string }> => {
      const instance = sessionOf(instanceId);
      const row = readTarget(instance, id);
      if (row.kind === "browser") {
        throw new ArtifactRefusal(
          409,
          `${row.name} is a browser: it is the browser your browser tool drives, so open its pages there.`
        );
      }
      const pass = deps.browse(instance, row);
      const bound = deps.ownWorkspace(instance);
      const [workspace] = bound ? deps.workspaces(bound) : [];
      const unreached = workspace
        ? await deps.workspaceReach(pass.url, workspace.machineId)
        : null;
      if (unreached) {
        throw new ArtifactRefusal(
          409,
          `${unreached}. Ask your parent with handoff for what you need of ${row.name}.`
        );
      }
      return { ...pass, link: artifactLink(row.id, row.name) };
    },

    /**
     * Removes one of the session's artifacts (`artifact_delete`, the panel's
     * Remove); every view hears it on the frames it already follows. When
     * its panel showed it:
     * - the person's Remove shows the session's next newest artifact (a draft
     *   canvas still in the composer is not one), as closing a tab does;
     * - the agent's delete closes the panel: an agent taking something away
     *   never brings another artifact forward, not even one the person
     *   opened earlier, as if it wanted the person there (owner: "when u
     *   deleted the preview the preview pane switched to another preview so
     *   as a user i'm thinking u need someting from me on that view"). Only
     *   the person's own open, or an agent's show with its ask, comes
     *   forward.
     * A session up the delegation tree of a writer whose work item ended
     * removes that writer's too ({@link deletable}); the writer's panel that
     * showed it closes, else it hears its artifacts again.
     * Answers what the panel shows after.
     */
    remove: async (
      instanceId: string,
      id: string,
      by: PanelHand
    ): Promise<Removed> => {
      const instance = sessionOf(instanceId);
      const row = deletable(instance, id);
      const removed = { id: row.id, kind: row.kind, name: row.name };
      const wasShown = deps.showing(instance.id) === row.id;
      const writerShown = row.instanceId !== instance.id && inPanel(row);
      // A project's page is its source in the project's folder: both go, the
      // source first, so a refused commit leaves the page as it was.
      if (isProjectPage(row)) {
        const refused = await deps.dropPage(
          instance,
          row.projectId as string,
          row.name
        );
        if (refused) {
          throw new ArtifactRefusal(refused.status, refused.refused);
        }
      }
      discard(row);
      if (row.instanceId !== instance.id) {
        if (writerShown) {
          deps.close(row.instanceId as string);
        } else {
          relistOf(row);
        }
      }
      if (!wasShown) {
        deps.relist(instance.id);
        const shown = deps.showing(instance.id);
        const now = shown === undefined ? undefined : db.get(shown);
        return {
          removed,
          showing: now ? { id: now.id, kind: now.kind, name: now.name } : null,
        };
      }
      const next = by === "person" ? nextNewest(instance) : undefined;
      if (next && (await deps.open(next)).ok) {
        return {
          removed,
          showing: { id: next.id, kind: next.kind, name: next.name },
        };
      }
      deps.close(instance.id);
      return { removed, showing: null };
    },

    /**
     * Session `instanceId`'s browser artifact, once its work item ended: it
     * goes from every list, and the panel that showed it closes. Its
     * browser itself is its project's (or its machine's), shared by every
     * session there, and stays. Nothing when it has none.
     */
    dropBrowser: (instanceId: string): void => {
      const row = db
        .ofInstance(instanceId)
        .find((one) => one.kind === "browser");
      if (!row) {
        return;
      }
      const shown = inPanel(row);
      discard(row);
      if (shown) {
        deps.close(instanceId);
      } else {
        deps.relist(instanceId);
      }
    },

    /**
     * Project `projectId`'s page `name` once its source left the folder
     * (`decisions/<name>/` holds no page.oui or index.html now): it goes,
     * and the panel that showed it closes. Nothing when it has none.
     */
    sourceGone: (projectId: string, name: string): void => {
      const row = db.projectPage(projectId, name);
      if (!row) {
        return;
      }
      const shown = inPanel(row);
      discard(row);
      if (shown && row.instanceId !== null) {
        deps.close(row.instanceId);
      } else {
        relistOf(row);
      }
    },

    /**
     * A view's word that it has (or could not load) the artifact at the
     * revision it was opened at: the show waiting on that revision answers
     * from it. A word on a revision no show waits for is kept for one that
     * starts waiting (a fast page answers before the publish returns).
     */
    shown: (instanceId: string, id: string, ack: ShownAck): { heard: true } => {
      const row = viewable(sessionOf(instanceId), id);
      if (ack.ok && row.instanceId === instanceId) {
        db.update(row.id, { openedRevision: row.revision });
        // The person's look (needs.ts rule 6): their own mark in the doc, on every device.
        docs.transact(row.id, "hub", (doc) =>
          doc.getMap("meta").set("lookedAt", new Date().toISOString())
        );
        deps.looked(row.id);
        deps.needsMoved();
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
        const pins = [...readPins(doc).values()]
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
          const link = linkOfPin(row.id, pin);
          return inkBox ? { ...pin, inkBox, link } : { ...pin, link };
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
                link: artifactLink(row.id, row.name),
                address,
                pins: answered,
              },
            ]
          : [];
      });
      return { artifacts, at: readAt };
    },

    /** The agent answers a pin: an entry in its thread, by the agent, shown at once wherever the artifact is open. */
    /**
     * The agent answers a pin in its thread. One that `asks` waits on the
     * person in Needs you (core `pinAsks`) and pushes; one that doesn't
     * stays on the page.
     */
    commentReply: (
      instanceId: string,
      pinId: string,
      reply: { asks?: boolean; files?: string[]; text: string }
    ): { entry: ThreadEntry; link: string; number: number; pin: string } => {
      const { asks, files, text } = reply;
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
        ...(asks ? { asks: true as const } : {}),
      };
      // An answer means everything before it was heard (core `pinHeard`).
      docs.transact(row.id, "hub", (doc) => {
        stampHeard(doc, pin, pin, entry.at);
        writeEntry(doc, pin.id, entry);
        answeredHere(doc, pin.id, entry.at);
      });
      if (asks) {
        deps.pinAsked(row.id, text);
      }
      return {
        pin: pin.id,
        number: pin.number,
        link: linkOfPin(row.id, pin),
        entry,
      };
    },

    /** The agent resolves a pin, with a last reply when given; the person can reopen it. */
    commentResolve: (
      instanceId: string,
      pinId: string,
      text?: string
    ): { link: string; number: number; pin: string; resolvedAt: string } => {
      const { row, pin } = pinOf(sessionOf(instanceId), pinId);
      const at = new Date().toISOString();
      const said =
        text && pin.thread.length < COMMENT_LIMITS.entries
          ? {
              id: crypto.randomUUID(),
              by: "agent" as const,
              text,
              at,
            }
          : undefined;
      // The agent's resolve is an answer: the person's next look takes it in (core `newAnswer`).
      const resolved: Pin = {
        ...pin,
        thread: said ? [...pin.thread, said] : pin.thread,
        resolvedAt: at,
        resolvedBy: "agent",
      };
      // The agent's own resolve is not the person's to tell it of.
      docs.transact(row.id, "hub", (doc) => {
        if (said) {
          writeEntry(doc, pin.id, said);
        }
        writeResolve(doc, pin.id, { at, by: "agent" });
        answeredHere(doc, pin.id, at);
        if (pin.heard !== undefined) {
          writeDelivery(doc, pin.id, {
            ...(pin.sentAt ? { sentAt: pin.sentAt } : {}),
            ...(pin.notSent ? { notSent: pin.notSent } : {}),
            heard: pinSaid(resolved),
          });
        }
      });
      return {
        pin: pin.id,
        number: pin.number,
        link: linkOfPin(row.id, pin),
        resolvedAt: at,
      };
    },

    /** The person changed artifact `id`'s doc: what of it the session hasn't heard goes once quiet ({@link personMarked}). */
    personMarked,

    /**
     * The page's pictures of the marks the person just made there (core
     * `MarkPictures`), each a crop round one mark, by the pin's or the
     * stroke group's id, kept on disk ({@link heldPictures}): the next
     * delivery carries the ones it delivers. A later post replaces a mark's
     * picture.
     */
    pictures: (
      instanceId: string,
      id: string,
      body: MarkPictures
    ): { held: number } => {
      const row = own(sessionOf(instanceId), id);
      // On disk before the page hears it was held: a restart keeps it for the delivery.
      held.hold(row.id, body);
      return { held: held.marks(row.id).length };
    },

    /**
     * After a restart: each artifact changed within the last day has its
     * delivery scheduled again, so the person's marks and a sheet's saves
     * and errors written just before the hub went down still go (nothing
     * owed, nothing goes). A day, our call: a hub down longer than that has
     * a person who has moved on.
     */
    resumeMarks: (): void => {
      for (const row of db.touchedSince(new Date(Date.now() - DAY_MS))) {
        marked(row.id);
      }
    },

    /**
     * The person's Send (the panel's Send, a page's `cawco.send`): their
     * picks are applied (`sending`) and the session hears it has new
     * responses to read ({@link ArtifactServiceDeps.signal}), the note
     * (`body.text`) kept as `sentText` for `artifact_read`. Their comments
     * are not its to carry: they go by themselves ({@link marked}). With
     * `body.pins`, a comment's Try again after a delivery no one took: those
     * comments go now ({@link retry}), and the page's Send time stands. A
     * Send with nothing new is refused. Each Send says in the journal which
     * `route` took it and which control (`body.control`) it came from
     * ({@link saySend}).
     */
    send: async (
      instanceId: string,
      id: string,
      body: SendBody,
      route: string
    ): Promise<ArtifactChoices> => {
      const instance = sessionOf(instanceId);
      const row = own(instance, id);
      const doc = docs.doc(row.id);
      const state = stateOf(doc);
      if (body.pins) {
        await retry(row, new Set(body.pins));
        return { choices: state, ...metaOf(doc) };
      }
      if (body.again) {
        await askAgain(row, new Set(body.again));
        return { choices: state, ...metaOf(doc) };
      }
      let owes: ReturnType<typeof sendOwes>;
      try {
        owes = sendOwes(doc, state, body);
      } catch (error) {
        saySend(
          row,
          body,
          route,
          artifactToolWords.sendRefused(
            error instanceof Error ? error.message : String(error)
          )
        );
        throw error;
      }
      const { picked, note } = owes;
      saySend(
        row,
        body,
        route,
        artifactToolWords.sendCarried(
          unsentChoices(state, metaOf(doc).sentAt),
          note !== null
        )
      );
      if (picked) {
        await deps.sending(instance, row, state);
      }
      await deps.signal(instance, row, { since: row.deliveredSeq });
      const at = new Date().toISOString();
      docs.transact(row.id, "hub", (live) => {
        const meta = live.getMap("meta");
        meta.set("sentAt", at);
        meta.set("sentText", note);
        // His Send is a look at everything on this revision: every change and every answer.
        const changes = meta.get("changes") as ArtifactChanges | undefined;
        if (changes) {
          seeChanges(
            live,
            changes.revision,
            changes.items.map((item) => item.anchor)
          );
        }
        for (const pin of readPins(live).values()) {
          if (newAnswer(pin)) {
            seePin(live, pin.id, at);
          }
        }
      });
      answeredBy(
        db.update(row.id, {
          deliveredSeq: (db.get(row.id) as ArtifactRow).seq,
        }) as ArtifactRow
      );
      return { choices: state, ...metaOf(doc) };
    },
  };
};

export type Artifacts = ReturnType<typeof createArtifacts>;
