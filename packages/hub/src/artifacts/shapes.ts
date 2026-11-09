import type { ArtifactDoes, ArtifactKind } from "@cawco/core/artifact-kinds";
import type { SendAttachment } from "@cawco/core/attachments";
import type { excalidrawFile } from "@cawco/core/canvas";
import type { ChoiceEntry, SettledBy } from "@cawco/core/choices";
import type { Pin } from "@cawco/core/comments/model";
import type { QuestionClose, SentBy } from "@cawco/core/doc-meta";
import type { InkGroup } from "@cawco/core/ink";
import type { PageFault } from "@cawco/core/page-faults";
import type { ShownFailure } from "@cawco/core/preview/protocol";
import type { PreviewAddress } from "@cawco/core/preview/routes";
import type { InstanceRow } from "@cawco/core/protocol";
import type {
  CanvasDial,
  CanvasEdge,
  CanvasShapes,
  SheetRead,
  SheetWeight,
  StageState,
  StageUnreached,
  StoryOp,
} from "@cawco/core/stage";
import type { FolderWeight } from "@cawco/preview/proxy";
import type { Operation } from "rfc6902";
import type { ArtifactRow } from "../db/artifacts";
import type { StatementChange } from "../decision-program";
import type {
  errorsSaid,
  movesSaid,
  renderSaid,
  StateAsk,
  weightSaid,
} from "./component";
import type { Question } from "./questions";

/** A page's files as they stood before a revision wrote the next: its HTML, a decision page's program, and its pictures' fingerprints by address. */
export interface PageWas {
  files: ReadonlyMap<string, string>;
  html: string;
  program?: string;
}

/**
 * What a create or a re-create names: a page from `html` or `dir`, a
 * preview of `port` or `dir` on `machine`, opened at `path`, or a canvas
 * drawn from skeleton `elements` or `mermaid`; each kind's fields only.
 */
/**
 * What a decision page's media says of an artifact it shows (its program's
 * Canvas and Preview pieces): its kind; a component canvas's shapes. Never
 * its name: the page names each piece by its own words (its caption, its
 * option's label, its card's question), and a name in the page's media is a
 * text node of it (a blind benchmark's arms were named there).
 */
export interface ServedMedia {
  /** The version the page draws: the artifact's newest, a next version held for its owner's panel included (service `newestVersion`). */
  id: string;
  kind: ArtifactKind;
  /** That version's revision: a Preview of a server loads again when it moves (a server made again on another port). */
  revision: number;
  shapes?: CanvasShapes;
}

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
   * A canvas the person opened in the composer (a pen's swipe, Draw, ⌘⇧D):
   * always a new one, `meta.draft` until its first send,
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
   * What every surface names it by to the person, in plain words (core
   * `ARTIFACT_TITLE_LIMIT`): every create names it. The person's own
   * composer canvas (`draft`) takes the dashboard's.
   */
  title?: string | undefined;
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
export type Placed = Pick<
  ArtifactRow,
  "kind" | "machineId" | "name" | "source"
>;

/** Where a create put an artifact (service `placed`), and what to put back to let it go (`unplace`). */
export interface Placement {
  before: ArtifactRow | undefined;
  holding: { fresh: boolean; next: ArtifactRow } | null;
  /** The session whose panel held what this create made again, when it was another's: a project's page, or a tree's preview its holder left. */
  movedFrom?: string | undefined;
  row: ArtifactRow;
  /** The row it made again, as it was before; none for a row this create made (a new one, a fresh next version). */
  was: ArtifactRow | undefined;
}

/** The hub machine's headless screen on one canvas ({@link ArtifactServiceDeps.screen}). */
export interface CanvasScreen {
  /** Keeps it open through another write. */
  hold: () => void;
  /** Lets it go. */
  release: () => void;
}

/** Whose panel a create puts the artifact in (`owner`), and whose call it was (`maker`): one session, or a delegate and its parent. */
export interface Making {
  /**
   * The artifact the create lands on when the owner's panel holds none of
   * its name: its delegation tree's preview whose holder acts no more,
   * taken into the owner's panel (`makingFor` in createArtifacts).
   */
  lands?: ArtifactRow;
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

/** An entry as `artifact_read` answers it. */
export type ReadEntry = ChoiceEntry & { earlierRevision?: true };

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
      /** Who settled it for the person (`settle`), why and its sources; absent for his own pick. */
      settled?: SettledBy;
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
  /** When his newest pick, note or value on it came; null before any. */
  answeredAt?: string | null;
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
  /** What a browser met drawing it at this revision (core page-faults.ts): dials its panel doesn't draw, uncaught errors, assets that failed. */
  faults?: PageFault[];
  /** Your change waits as this next version: your parent had opened the artifact, and their panel keeps the version they opened until they call artifact_show. */
  held?: string;
  id: string;
  kind: ArtifactKind;
  /** What this update changed on the page, each by its link (`[label](cawco:change/<artifact>/<anchor>)`): what the agent names each to the person by. */
  marked?: string[];
  missing?: string[];
  /** Its slug, what every artifact tool takes. */
  name: string;
  /** A canvas, as you read it: one line per element (core `canvasOutline`). */
  outline?: string;
  /** A built page's hash, which each pick records; null for a preview (the hub never built it) and a canvas. Wire-pinned: installable app builds decode it. */
  pageHash: string | null;
  /** When the canvas's latest picture was drawn; null when it has none. */
  pictureAt?: string | null;
  /** A canvas's picture is from before your last write to it: no screen drew it again within the wait. */
  pictureBehind?: true;
  /** Its picture, base64 PNG, when asked (`png: true`): a canvas's latest, the one after your last write once a screen draws it, null when it has none yet; a preview or a page drawn now as the panel draws it; a component's drawn by its stage. */
  png?: string | null;
  /** A decision page's program as the hub keeps it, on a read without `since`: re-emit a statement from it to revise one. */
  program?: string;
  /** Keys that changed since `since` and are no longer there. */
  removed?: string[];
  revision: number;
  /** Where its picture was kept, as the session names the path (`save`). */
  saved?: string;
  /** When the page was last sent, by him or by the hub ({@link sentBy}); null before it was (and on a canvas, which has no Send). */
  sentAt: string | null;
  /** Who sent it at {@link sentAt}: the person pressing Send, or the hub once every question had his answer (needs.ts `answeredWhole`). */
  sentBy?: SentBy;
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
  /** What it is named by to the person. */
  title: string;
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
  /** The route of each card it put in or rewrote, by the project's Who decides, by id; absent when no card on the page carries a kind. */
  routes?: Record<string, string>;
  /** Statements by name: new, rewritten, and dropped because nothing reaches them. */
  statements: StatementChange;
}

/** What `settle` answers: the card, the option it holds now, and who settled it. */
export interface Settled {
  /** The card's link, `[question](cawco:decision/<artifact>/<card>)`. */
  card: string;
  option: { id: string; label: string };
  settled: SettledBy;
}

/** One artifact's questions to the person as `open_items` lists them (questions.ts): each open or answered; one taken or withdrawn is left out. */
export interface AskedOf {
  artifact: {
    does: ArtifactDoes;
    id: string;
    kind: ArtifactKind;
    link: string;
    name: string;
    title: string;
  };
  questions: Question[];
  /** The session that holds it, when it is not the reader: its id, title and link, and whether it ended (the reader takes its questions up). */
  session: { ended: boolean; id: string; link: string; title: string } | null;
}

/** What `question_close` answers: the question, by its link, as it stands now. */
export interface QuestionClosed {
  as: QuestionClose["as"];
  link: string;
  /** Its words as asked. */
  words: string;
}

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
  /** Its slug, what every artifact tool takes. */
  name: string;
  /** Whether the person has had its latest revision on screen. */
  opened: boolean;
  /** A decision page's choices: how many it asks, how many are picked, how many picks are not sent yet. */
  picks?: { asked: number; made: number; unsent: number };
  /** Picks the person sent that the session has not read. */
  picksAwaiting: number;
  /** Pins the person left open. */
  pins: number;
  /** It was sent since your last change (a revision, or a new ask), by him or by the hub ({@link sentBy}). */
  sent: boolean;
  /** Who sent it last, when it was sent. */
  sentBy?: SentBy;
  /** The session that made it, when it is not the caller's own (a conversation reading its project's). */
  session?: string;
  /** That session's link, what the agent names it by. */
  sessionLink?: string;
  /** Whether its session's panel shows it now. */
  shown: boolean;
  /** What it is named by to the person. */
  title: string;
  /** The person's changes (picks, notes, drawn elements) since the session last read it. */
  unread: number;
  updatedAt: string;
  /** Whose move it is: the person's (what Needs you lists it for: never opened, picks not made, marks not sent, an answer not looked at, its ask not retired), the session's (sent picks, a canvas's changes unread, or handed to it or changed by a delegate and not opened yet). */
  waitingOn: ("person" | "session")[];
}

/** A page of `artifact_list`, newest first. */
export interface ArtifactList {
  artifacts: ArtifactStatus[];
  /** What `cursor` takes for the page after this one; null on the last. */
  next_cursor: string | null;
  /** How many the whole list holds, every page. */
  total: number;
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
  /** Its link, `[title](cawco:artifact/<id>)`: what the agent names it by to the person. */
  link?: string;
  /** Made again under its name: what it changed, each by its link (`[label](cawco:change/<artifact>/<anchor>)`). */
  marked?: string[];
  /** A component canvas's flow moves, each with the animations it fired. */
  moves?: ReturnType<typeof movesSaid>;
  /** Its slug, what every artifact tool takes. */
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
  /** Each card's route by the project's Who decides, by id, a line after its link; absent when no card carries a kind. */
  routes?: Record<string, string>;
  /** A sheet as its stage reads it: its stories with their args, its meta, and each component's props. */
  sheet?: SheetRead;
  /** A sheet's stage, or a served preview's server, as it stands once started. */
  stage?: StageState;
  /** A draft canvas's origin on the tailnet name while the hub serves HTTPS there (core `PreviewAddress`). */
  tailnet?: PreviewAddress["tailnet"];
  /** What it is named by to the person. */
  title: string;
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
export type Opened =
  | { opened: true }
  | {
      opened: false;
      why: string;
      /** A project's setup page: where the person goes to it (core `setupLanding`), as their show takes them (service.ts `landingOf`). */
      href?: string;
    };

/** What `artifact_show` answers: {@link Opened}, with the artifact's link, `[title](cawco:artifact/<id>)`, which the agent names it by and its tool row draws. */
export type Shown =
  | { link: string; opened: true }
  | { href?: string; link: string; opened: false; why: string };

/**
 * What `artifact_browse` answers: the address the session's own browser
 * loads, an entry that sets the session's pass, and when that pass stops
 * opening (ISO).
 */
export interface Browsed {
  expiresAt: string;
  url: string;
}

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
    /** Its link, `[title](cawco:artifact/<id>)`: what the agent names it by to the person. */
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

/**
 * Every file a promote may write into `artifacts/<name>/`: one of these an
 * earlier promote wrote and this one does not (a picture since cleared) is
 * taken out in the same commit.
 */
export const PROMOTED_FILES = [
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

export type PromotedFile = (typeof PROMOTED_FILES)[number];

/** What `artifact_update` answers for a component canvas's write: nothing past the story it wrote (component canvas §4, G2). */
export interface ComponentWritten {
  file: string;
  /** The project's formatter that shaped the lines, like "prettier 3.9.10"; null when the project has none. */
  formatted: string | null;
  lines: { from: number; to: number };
  render: ReturnType<typeof renderSaid>["frames"] | "unseen";
  story: { args: Record<string, unknown>; name: string } | null;
}

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
  /** A preview's or a page's picture: its width in CSS px; the panel's (core `PICTURE_VIEW`) when none. */
  width?: number;
}

/** What `artifact_read` asks of any artifact's picture beyond the component's own. */
export interface PictureAsk extends ComponentReadAsk {
  /** A preview or a page drawn at its state's own link: the query or hash it adds (`?__state=pairing:asking`). */
  link?: string;
  /** Keep the picture at this path in the session's workspace. */
  save?: string;
}

/**
 * Who moved a session's panel: the person (a press in the panel, the artifact
 * menu, a pin's link, a page's Open to draw), or the agent through its tools.
 */
export type PanelHand = "person" | "agent";

/** What `artifact_delete` and the panel's Remove answer: the artifact removed, and what the session's panel shows now, or null for nothing. */
export interface Removed {
  /** The artifact the call named, as it was resolved before it went. */
  removed: { id: string; kind: ArtifactKind; name: string; title: string };
  showing: {
    id: string;
    kind: ArtifactKind;
    name: string;
    title: string;
  } | null;
}

/** What a delivery of the person's marks carries: the words, the pictures, and the texts and files their comments attach. */
export interface MarksDelivery {
  /** The texts folded in and the files the session's machine keeps (core attachments.ts), as a send carries them. */
  attachments: SendAttachment[];
  images: { data: string; mediaType: string }[];
  /** The comments notice (core `artifactCommentsNotice`), its sections the marks themselves. */
  text: string;
}

/** Whether someone took a delivery of the marks; why not, when no one did. */
export type MarksOutcome = { ok: true } | { ok: false; reason: string };

/** One step of a show: its open, its machine's listener reached, its frame published, or its wait for a view. */
export type ShowStep = "open" | "reach" | "publish" | "shown wait";

/**
 * Where a stage runs: a session's own workspace (a sheet being made), or
 * the workspace a sheet was made in (every use after), whichever session's
 * panel it is in.
 */
export type StageAt = { session: InstanceRow } | { workspace: string };

/**
 * What a page is built from: a decision page's `program` (with the folder
 * its relative Image files are in, when it has one, and on a revision the
 * pictures the page already shows), inline `html`, a work folder's page.oui
 * or page.html (`dir`), or the project folder's `decisions/<name>/`.
 */
export type PageFrom =
  | {
      program: string;
      dir?: string | undefined;
      /**
       * A revision's: each picture the page shows, by the name its Image
       * gives. A name is read where its file stands, as on a create; one
       * whose file no longer stands there (its folder gone with the session
       * that wrote it, its machine away) shows the picture the page keeps.
       */
      shown?: ReadonlyMap<string, Uint8Array>;
      /**
       * A revision's: the machine each Image's file is read on (none known:
       * not read, the picture the page keeps or a refusal); the building
       * session's own when not given.
       */
      readOn?: (file: string) => string | undefined;
    }
  | { html: string }
  | { dir: string }
  | { folder: true };

/**
 * Who hears a page's Send: the session that holds it, or, once that one has
 * ended, the project's Caw, told the person's act in its words (decisions.ts
 * `send`), whose conversation a message starts again.
 */
export type PageHearer =
  | { session: InstanceRow }
  | {
      caw: {
        line: string;
        projectId: string;
        text: string;
        /** Why Caw is woken, in its wake's words. */
        trigger: string;
      };
    };
