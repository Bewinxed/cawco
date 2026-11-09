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
 * ink go to the session by themselves once quiet (marks.ts `COMMENTS_QUIET_MS`),
 * as one message ({@link ArtifactServiceDeps.deliverMarks}); a sheet's
 * saves and compile errors go the same way once quiet (marks.ts `MARKS_QUIET_MS`).
 */

import { isAbsolute, join, relative } from "node:path";
import type { ArtifactKind } from "@cawco/core/artifact-kinds";
import {
  ARTIFACT_NAME,
  type ArtifactDoes,
  ASK_BANNED,
  ASK_PATHLIKE,
  DESK_CAPTURE_WIDTH,
  DESK_CAPTURES_PER_PAGE,
} from "@cawco/core/artifact-kinds";
import {
  type ArtifactNeedsRead,
  type ArtifactPending,
  type ArtifactPlace,
  setupLanding,
} from "@cawco/core/artifact-needs";
import { PICTURE_VIEW } from "@cawco/core/artifact-picture";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { type CanvasAuthor, canvasOutline } from "@cawco/core/canvas";
import { dataUrlBytes, deskCaptures } from "@cawco/core/captures";
import {
  type ArtifactChoices,
  type ChoiceEntry,
  choiceEntryProblem,
  noteText,
  type SettledBy,
  unsentChoices,
} from "@cawco/core/choices";
import { pinsToTell } from "@cawco/core/comments/deliver";
import {
  COMMENT_LIMITS,
  type MarkPictures,
  newAnswer,
  type Pin,
  pinSaid,
  pinUnsent,
  readPin,
  readPins,
  SEND_CONTROLS,
  type SendBody,
  seeChanges,
  seePin,
  stampHeard,
  type ThreadEntry,
  writeDelivery,
  writeEntry,
  writeResolve,
} from "@cawco/core/comments/model";
import {
  type DecisionCard,
  pickMade,
  pickOf,
  picksMade,
  type SetupDrawn,
} from "@cawco/core/decisions";
import type { PictureSize } from "@cawco/core/decisions-library";
import { detach } from "@cawco/core/detach";
import {
  type ArtifactAsked,
  type ChangedItem,
  docMeta,
  getMeta,
  type QuestionClose,
  type SentBy,
  setMeta,
} from "@cawco/core/doc-meta";
import {
  excerptOf,
  field,
  KIND_WORDS,
  matchOf,
  parse,
} from "@cawco/core/find-match";
import type { InkGroup } from "@cawco/core/ink";
import { machineLabel } from "@cawco/core/machine-names";
import {
  faultsAt,
  faultsWith,
  type PageFaultReport,
} from "@cawco/core/page-faults";
import { pinName } from "@cawco/core/pin-name";
import type { PreviewSource, ShownFailure } from "@cawco/core/preview/protocol";
import type {
  ArtifactHit,
  ArtifactPromotion,
  ArtifactSummary,
  ArtifactThumbnail,
  InstanceRow,
} from "@cawco/core/protocol";
import {
  artifactLink,
  decisionLink,
  decisionReference,
  parseReference,
  sessionLink,
} from "@cawco/core/references";
import type {
  SessionQuestion,
  SessionQuestionsRead,
} from "@cawco/core/session-questions";
import {
  type CanvasMap,
  type CanvasMapNode,
  type CanvasSpec,
  canvasOf,
  canvasPath,
  type DesignLink,
  type DesignMap,
  type DesignQuery,
  type EmbedShape,
  STAGE_IDLE_MS,
  type StageFrame,
  type StageState,
} from "@cawco/core/stage";
import { DAY_MS } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { decidesWords } from "@cawco/core/words/decides";
import { type FolderWeight, pageHash } from "@cawco/preview/proxy";
import { ElysiaStatus } from "elysia";
import type { Doc } from "yjs";
import type { ArtifactRow } from "../db/artifacts";
import { type BuiltProgram, mergeProgram, readKept } from "../decision-program";
import { HANDLE_MIN } from "../handles";
import { sessionLabel } from "../labels";
import {
  changeFolderFiles,
  folderFileNames,
  folderPath,
} from "../project-folder";
import type { Refused } from "../refusal";
import { artifactByHandle, boardOf, createAccess, named } from "./access";
import { canvasEntries } from "./canvas";
import {
  type CanvasInput,
  CREATE_SHAPE,
  canvasProblem,
  specOf,
} from "./component";
import type { ArtifactServiceDeps } from "./deps";
import { createFacts, metaOf, stateOf } from "./facts";
import { createCanvasKind } from "./kinds/canvas";
import { createComponentKind, sheetOf } from "./kinds/component";
import { createPageKind, newestHash } from "./kinds/page";
import { createPreviewKind, servedOf } from "./kinds/preview";
import { createMarks, labelOf, linkOfPin } from "./marks";
import {
  answeredWhole,
  answersUnheard,
  heardSeq,
  mayWait,
  movedOn,
  needOf,
  noticeOf,
  pendingOf,
  planHolds,
  readThrough,
  sendsOnChange,
  unheardKeys,
} from "./needs";
import { answersReplaced } from "./overwrite";
import { createPageStore } from "./page-store";
import { type Question, stillAsked } from "./questions";
import { ArtifactRefusal, NothingNewToSend } from "./refusals";
import {
  type ArtifactInput,
  type ArtifactList,
  type ArtifactRead,
  type ArtifactStatus,
  type AskedOf,
  type Browsed,
  type CanvasChange,
  type CanvasExport,
  type CommentRead,
  type ComponentWritten,
  type Created,
  type HandedArtifactFile,
  type Making,
  type Opened,
  type PageBroken,
  type PageChange,
  type PageHearer,
  type PanelHand,
  type PictureAsk,
  type Placed,
  type Placement,
  PROMOTED_FILES,
  type Promoted,
  type PromotedFile,
  type QuestionClosed,
  type Removed,
  type Revised,
  type ServedMedia,
  type Settled,
  type SheetChange,
  type Shown,
  type ShownAck,
  type ShowStep,
} from "./shapes";
import { routeOf } from "./sync";
import { LIST_PAGE } from "./tools";
import { createVersions } from "./versions";

/** Statements lang-core could not merge into the program: nothing was changed. */
const unmerged = (error: unknown): ArtifactRefusal =>
  new ArtifactRefusal(
    422,
    `The statements did not merge: ${error instanceof Error ? error.message : String(error)}. Nothing was changed.`,
    { cause: error }
  );
/** `statements` merged into `existing` (decision-program.ts `mergeProgram`), or its refusal; what lang-core could not merge is thrown {@link unmerged}. */
const merging = (existing: string, statements: string) => {
  try {
    return mergeProgram(existing, statements);
  } catch (error) {
    throw unmerged(error);
  }
};
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
/** Why an ask can't head the panel (checks 1 and 2): words the person never uses, or a file or path; null when it can. */
const askProblem = (ask: string): string | null => {
  if (ASK_BANNED.test(ask)) {
    return 'The ask reaches the person: say what they do (pick, pin, try, draw) and to what, without "tap" or "poke".';
  }
  if (ASK_PATHLIKE.test(ask)) {
    return artifactToolWords.askInTheirWords;
  }
  return null;
};

/** A title written as a slug (`title-bars-close`): words joined by dashes, no space. */
const SLUG_TITLE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/u;

/** Why a title can't name it to the person: a slug, a file or path, or words the person never uses; null when it can. */
const titleProblem = (title: string, name: string): string | null => {
  const trimmed = title.trim();
  if (trimmed === "") {
    return artifactToolWords.titleMissing;
  }
  if (trimmed === name || SLUG_TITLE.test(trimmed)) {
    return artifactToolWords.titleSlug(name);
  }
  if (ASK_BANNED.test(trimmed) || ASK_PATHLIKE.test(trimmed)) {
    return artifactToolWords.titleInTheirWords;
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

/** Check 3b: a page for picking that holds no choice (a Decision, a Setup, a kit choice), once built. */
const NO_CHOICE =
  "A page for picking holds a choice: a Decision or a Setup in its program, or a data-cawco-choice in its HTML. This one holds none.";

/** Check 5: a page for judging or picking that is a catalogue of desk captures. */
const capturesRefused = (n: number): string =>
  `${n} captures wider than ${DESK_CAPTURE_WIDTH}px on one page draw at a fraction of their size in the panel. Show one state at a time: a component canvas of the real component (does "judge"), or a decision page whose options embed them (does "pick").`;
/** A value as a JSON file a session reads. */
const jsonFile = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
/** A decision page's choice, as the kit marks it (`data-cawco-choice="<id>"`). */
const CHOICE_ATTRIBUTE = /\bdata-cawco-choice="([^"]+)"/gu;
/** A markdown link's destination, the last one in `text`. */
const LINK_DESTINATION = /\]\((cawco:[^)\s]+)\)\s*$/u;

/**
 * The artifact and question key `asked` names (`question_close`): a card's
 * link or `<page>#<card>` (`card:<id>`), a pin's link (`pin:<number>`, its
 * number read to its id by the caller), else an artifact's link, name or
 * handle (`judge`). A link is read bare or as its markdown.
 */
const questionKeyOf = (asked: string): [artifact: string, key: string] => {
  const trimmed = asked.trim();
  const ref = parseReference(LINK_DESTINATION.exec(trimmed)?.[1] ?? trimmed);
  if (ref?.kind === "decision") {
    const card = decisionReference(ref.id);
    if (card) {
      return [card.artifact, `card:${card.card}`];
    }
  }
  if (ref?.kind === "pin") {
    const slash = ref.id.lastIndexOf("/");
    return [ref.id.slice(0, slash), `pin:${ref.id.slice(slash + 1)}`];
  }
  if (ref?.kind === "artifact") {
    return [ref.id, "judge"];
  }
  const hash = trimmed.lastIndexOf("#");
  return hash > 0
    ? [trimmed.slice(0, hash), `card:${trimmed.slice(hash + 1)}`]
    : [trimmed, "judge"];
};
/** Newest made first; one id before another at the same time, so a cursor stands between any two. */
const newestFirst = (a: ArtifactRow, b: ArtifactRow): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);

/** A cursor: the last row of a page, by when it was made and its id. */
const cursorOf = (row: ArtifactRow): string =>
  `${row.createdAt.getTime().toString(36)}.${row.id}`;

const CURSOR = /^([0-9a-z]{1,12})\.([0-9a-f-]{36})$/u;
/** A path's parts, by either separator: a map's component that climbs out of its toolchain root (`..`) is refused. */
const PATH_PARTS = /[\\/]/u;

/**
 * The {@link LIST_PAGE} rows of `rows` (sorted {@link newestFirst}) after
 * `cursor`, and the cursor after them. Keyed on the last row shown, not a
 * count, so a page made or deleted meanwhile neither repeats nor skips one.
 */
const pageOf = (
  rows: ArtifactRow[],
  cursor: string | undefined
): { next: string | null; rows: ArtifactRow[] } => {
  let from = 0;
  if (cursor !== undefined) {
    const parts = CURSOR.exec(cursor);
    if (!parts) {
      throw new ArtifactRefusal(400, artifactToolWords.notListCursor(cursor));
    }
    const at = Number.parseInt(parts[1] as string, 36);
    const id = parts[2] as string;
    const after = rows.findIndex(
      (row) =>
        row.createdAt.getTime() < at ||
        (row.createdAt.getTime() === at && row.id < id)
    );
    from = after === -1 ? rows.length : after;
  }
  const page = rows.slice(from, from + LIST_PAGE);
  const last = page.at(-1);
  return {
    next: last && from + LIST_PAGE < rows.length ? cursorOf(last) : null,
    rows: page,
  };
};
/** How long a show waits for a view to say it has the artifact on screen. The spec's number. */
export const SHOWN_WAIT_MS = 10_000;

/** No view follows the session, so none could show the artifact. DESIGN.md's error formula. */
const NO_VIEW =
  "No open dashboard is showing this session. The artifact is in the session's panel and opens when one is.";

/** A view follows the session and none said it put the artifact on screen in time. */
const NOT_PUT_ON_SCREEN = `A dashboard is showing this session, but none put the artifact on screen within ${SHOWN_WAIT_MS / 1000} s. It stays in the session's panel.`;

/** A Not now's notice id (core `notNowId`): the artifact, and the raise it put away. */
const NOT_NOW = /^artifact-not-now:([0-9a-f-]{36}):(\d+)$/u;
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
const pageText = (html: string): string =>
  html
    .replace(PAGE_HIDDEN, " ")
    .replace(PAGE_TAG, " ")
    .replace(PAGE_ENTITY, (_, name: string) => ENTITIES[name] ?? " ")
    .replace(PAGE_SPACES, " ")
    .trim();

/** A PNG's pixels, from its header's IHDR chunk; null when it is too short to say. */
const pngSize = (png: Uint8Array): { width: number; height: number } | null => {
  if (png.length < 24) {
    return null;
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

/** A thumbnail's most bytes in each scheme: the pane's capture of a page, as `previewPng` takes it. */
export const THUMBNAIL_BYTES = 3 * 1024 * 1024;

/** A sentence's closing stop and the space after it, taken off where a code in brackets goes before it. */
const TRAILING_STOPS = /[\s.]+$/u;

/** A promote from a session outside a project. DESIGN.md's error formula. */
const NO_PROJECT =
  "This session belongs to no project, so there is nowhere to promote to.";
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

/** A promote git refused, in DESIGN.md's error formula: what failed, and git's reason. */
const notCommitted = (name: string, refused: Refused): ArtifactRefusal =>
  new ArtifactRefusal(
    refused.status === 413 || refused.status === 409 ? refused.status : 503,
    `${name} could not be committed: ${refused.response.detail.replace(TRAILING_DOT, "")}.`,
    { cause: refused }
  );

/** A promoted file's text: JSON, two-space indented, ending on a newline, as a repository keeps it. */
const promotedJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;
/** A source common practice cites: a web link. */
const WEB_SOURCE = /^https:\/\/\S+$/u;
/** When the person's newest entry in `state` came (a pick, a note, a value); null before any. */
/** His answer as a session's list shows it: what he picked, joined, or his words (core session-questions.ts). */
const answerShown = (answer: Question["answer"]): SessionQuestion["answer"] =>
  answer
    ? {
        at: answer.at,
        by: answer.by,
        said:
          answer.by === "pick"
            ? (answer.options ?? []).join(", ")
            : answer.said,
      }
    : null;

const answeredAtOf = (state: Record<string, ChoiceEntry>): string | null =>
  Object.values(state).reduce<string | null>(
    (latest, entry) =>
      latest === null || entry.at > latest ? entry.at : latest,
    null
  );

/** The words a page's `cawco.send(text)` sent with the person's last send; none when it sent none. */
const sentTextOf = (doc: Doc): string | null =>
  getMeta(doc, "sentText") ?? null;
/**
 * Why `row` can't be read as `ask` asks, or nothing: a state's link draws a
 * preview or a page, a frame is a component's, and the project's browser
 * has no page the hub can draw (`drawn`: a picture is asked).
 */
const pictureRefusal = (
  row: ArtifactRow,
  ask: PictureAsk,
  drawn: boolean
): ArtifactRefusal | undefined => {
  if (
    ask.link !== undefined &&
    !(row.kind === "preview" || row.kind === "page")
  ) {
    return new ArtifactRefusal(
      400,
      row.kind === "component"
        ? `${row.name} is a component canvas: its state is a frame, { story, interaction?, scheme?, width? }.`
        : `${row.name} is a ${row.kind}: a state's link draws a preview or a page.`
    );
  }
  if (ask.state && row.kind !== "component") {
    return new ArtifactRefusal(
      400,
      `${row.name} is a ${row.kind}: its state is the query or hash of the state's own link, like "?__state=pairing:asking".`
    );
  }
  if (row.kind === "browser" && drawn) {
    return new ArtifactRefusal(
      409,
      `${row.name} is the project's browser: the hub serves no page of it to draw, so it has no picture. Read it without png.`
    );
  }
};
/**
 * How often a server of a preview waiting on the person is asked to stay up
 * ({@link Artifacts.keepWaitingUp}): a third of what sleeps it, so two asks
 * can fail before it does (agent stage.ts `IDLE_MS`, shortened the same way
 * in a probe's scratch fleet).
 */
const KEEP_UP_MS = Number(process.env.CAWCO_STAGE_IDLE_MS || STAGE_IDLE_MS) / 3;
/**
 * A step of a show that takes longer than this is said in the journal. Our
 * call: on a scratch fleet the open read 1-83 ms and the publish 0-3 ms, and
 * a live show spent 8.9 s outside its wait for a view, which the journal
 * named nowhere.
 */
export const SLOW_SHOW_STEP_MS = 300;
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
export const createArtifacts = (deps: ArtifactServiceDeps) => {
  const { db, docs } = deps;
  const store = createPageStore(deps.root);
  const {
    above,
    answerable,
    deletable,
    embeds,
    holder,
    holdersInTree,
    inItsSession,
    leftInProject,
    nameable,
    namedFor,
    ofTree,
    own,
    panelHeld,
    projectPage,
    readable,
    readsForOwner,
    revisable,
    sees,
    sessionOf,
    showable,
    takes,
    viewable,
    whole,
  } = createAccess({
    db,
    deps,
    docs,
  });

  /**
   * The session a project's page, or a tree's preview its holder left,
   * moved from when another's create took it (placed): its panel lets it
   * go, closed when it showed it.
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
        kept = store.thumbnailRecord(id);
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
    const at = getMeta(docs.doc(row.id), "pictureAt");
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
   * Whether it was sent since the session last changed it, by the person
   * or by the hub (`meta.sentBy`): the doc's `meta.sentAt` newer than its
   * `meta.revisedAt`, which every revision
   * and every new ask moves ({@link stampMeta}, {@link askNow}).
   */
  const sentOf = (row: ArtifactRow): boolean => {
    const meta = docMeta(docs.doc(row.id));
    const sentAt = meta.get("sentAt");
    const revisedAt = meta.get("revisedAt");
    return !!sentAt && (!revisedAt || sentAt > revisedAt);
  };

  /**
   * A `try` the person has before them (not a draft, not handed up to a
   * parent that hasn't opened it, not a version held for one) and hasn't
   * sent since its last revision ({@link sentOf}): still his to judge,
   * which a workspace's archive waits on (`waitingOnPerson`).
   */
  const unsentTry = (row: ArtifactRow): boolean => {
    if (row.does !== "try" || row.heldFor !== null || sentOf(row)) {
      return false;
    }
    const facts = factsOf(row);
    return !(facts.draft || facts.handed);
  };

  /** Whether `row` waits on the person as a workspace's archive reads it: Needs you's rule, or a `try` he hasn't sent ({@link unsentTry}). */
  const waitsOnPerson = (row: ArtifactRow): boolean =>
    pendingFor(row) !== null || unsentTry(row);

  /** Every decision page, by the artifact each of its Canvas and Preview pieces shows. */
  const pagesShowing = (): Map<string, ArtifactRow[]> => {
    const shown = new Map<string, ArtifactRow[]>();
    for (const page of db.asking()) {
      if (page.kind !== "page") {
        continue;
      }
      for (const id of mediaOf(page)) {
        shown.set(id, [...(shown.get(id) ?? []), page]);
      }
    }
    return shown;
  };
  const {
    keptUpAt,
    letGoMoved,
    makingFor,
    makingFrom,
    makingIn,
    previewSource,
    releaseServed,
    serveFirst,
    waitingServers,
    warmPreviews,
  } = createPreviewKind({
    above,
    get actsNoMore() {
      return actsNoMore;
    },
    db,
    deps,
    holder,
    get mediaSeen() {
      return mediaSeen;
    },
    ofTree,
    get ownerFor() {
      return ownerFor;
    },
    pagesShowing,
    get pendingFor() {
      return pendingFor;
    },
    waitsOnPerson,
  });

  const summaryOf = (row: ArtifactRow): ArtifactSummary => {
    const pending = pendingFor(row);
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      title: row.title,
      does: row.does,
      ask: row.ask,
      sent: sentOf(row),
      waiting: pending !== null,
      pending,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      shownAt: row.shownAt?.toISOString() ?? null,
      ...(isProjectPage(row) ? { project: row.projectId as string } : {}),
      promoted: getMeta(docs.doc(row.id), "promoted") ?? null,
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
        words = pageText(store.html(row.id));
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
    return row.instanceId !== instance.id && row.madeBy === instance.id
      ? newestVersion(row)
      : row;
  };
  const {
    changedBy,
    handOver,
    handing,
    heldAnswer,
    heldId,
    holdNext,
    holdsChange,
    newestVersion,
    nextNewest,
    openNextFirst,
    promote,
  } = createVersions({
    db,
    deps,
    get discard() {
      return discard;
    },
    docs,
    holder,
    get letGoHeadless() {
      return letGoHeadless;
    },
    namedFor,
    get programOf() {
      return programOf;
    },
    get show() {
      return show;
    },
    store,
    get versionMoved() {
      return versionMoved;
    },
    get warmPreviews() {
      return warmPreviews;
    },
    get writeStage() {
      return writeStage;
    },
  });

  /** A decision page's program, for a whole read: a revision re-emits a statement of it. Nothing for any other artifact. */
  const programRead = (row: ArtifactRow): { program?: string } => {
    const program = programOf(row);
    return program === undefined ? {} : { program };
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
   * Whether session `instance` will never take a turn on what it holds:
   * it takes no input ({@link ArtifactServiceDeps.ended}), its work item
   * ended, or it is stranded.
   */
  const actsNoMore = (instance: InstanceRow): boolean =>
    deps.ended(instance) || deps.itemEnded(instance) || deps.stranded(instance);

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

  /**
   * Pin `pinId` on an artifact the session reads, and that artifact: the
   * one rule `comment_read`, `comment_reply` and `comment_resolve` share
   * ({@link readable}), so a pin the session reads is one it answers.
   * Refused when none holds it.
   */
  const pinOf = (
    instance: InstanceRow,
    pinId: string
  ): { pin: Pin; row: ArtifactRow } => {
    const handle = pinId.length >= HANDLE_MIN && pinId.length < 36;
    const among = (
      rows: ArtifactRow[]
    ): { pin: Pin; row: ArtifactRow } | undefined => {
      for (const row of rows) {
        const doc = docs.doc(row.id);
        const pin =
          readPin(doc, pinId) ??
          (handle
            ? [...readPins(doc).values()].find((one) =>
                one.id.startsWith(pinId)
              )
            : undefined);
        if (pin) {
          return { pin, row: readable(instance, row.id) };
        }
      }
    };
    // What its project's cold writers left is searched only when nothing nearer holds the pin.
    const found = among(nameable(instance)) ?? among(leftInProject(instance));
    if (!found) {
      throw new ArtifactRefusal(404, artifactToolWords.noPin(pinId));
    }
    return found;
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
    store.remove(row.id);
    deps.removed?.(row);
    releaseServed(row);
    if (row.heldFor !== null) {
      versionMoved(row);
    }
  };

  /**
   * Artifact `row`'s version moved (a next version held, opened or let go,
   * or it was made again): every decision page of its delegation tree or
   * its project that shows it as a Canvas or Preview piece hears it (doc
   * `meta.mediaAt`), and one open takes its media again in place,
   * its picks and notes kept (preview overlay/page.ts).
   */
  const versionMoved = (row: ArtifactRow): void => {
    const id = row.heldFor ?? row.id;
    const artifact = db.get(id);
    const writer = artifact ? holder(artifact) : undefined;
    if (!artifact) {
      return;
    }
    const pages = new Map(
      [
        ...(writer ? db.ofInstances([...deps.tree(writer)]) : []),
        ...(artifact.projectId ? db.ofProject(artifact.projectId) : []),
      ]
        .filter((page) => page.kind === "page" && mediaOf(page).includes(id))
        .map((page) => [page.id, page])
    );
    // The version it stands at now, so a move told twice is heard once.
    const now = newestVersion(artifact);
    const at = `${id}@${now.id}:${now.revision}`;
    for (const page of pages.values()) {
      const meta = docMeta(docs.doc(page.id));
      if (meta.get("mediaAt") !== at) {
        docs.transact(page.id, "hub", () => meta.set("mediaAt", at));
      }
    }
  };
  const {
    answeredHere,
    createdPage,
    decisionsOf,
    keepPublishedSources,
    keptAsMedia,
    markChanges,
    markRevision,
    markedLinks,
    pageChanged,
    pageChanges,
    pageHashOf,
    pageNow,
    programOf,
    programRevised,
    writePage,
  } = createPageKind({
    get answersHad() {
      return answersHad;
    },
    get brokenBy() {
      return brokenBy;
    },
    get cardLinks() {
      return cardLinks;
    },
    get choicesAsked() {
      return choicesAsked;
    },
    db,
    deps,
    docs,
    holder,
    holdsChange,
    get mediaHeld() {
      return mediaHeld;
    },
    namedFor,
    get read() {
      return read;
    },
    get routedOn() {
      return routedOn;
    },
    get stampMeta() {
      return stampMeta;
    },
    store,
    warmPreviews,
    whole,
  });

  const {
    canvasFile,
    canvasNow,
    createCanvas,
    createDraft,
    letGoHeadless,
    updateCanvas,
  } = createCanvasKind({
    get askedOf() {
      return askedOf;
    },
    db,
    deps,
    discard,
    docs,
    handOver,
    handing,
    heldId,
    holdNext,
    markRevision,
    markedLinks,
    openNextFirst,
    get openedOf() {
      return openedOf;
    },
    get personChangedAfter() {
      return personChangedAfter;
    },
    get pictureOf() {
      return pictureOf;
    },
    get readTo() {
      return readTo;
    },
    get stampMeta() {
      return stampMeta;
    },
  });

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
    const was = store.revision(row.id);
    writePage(row.id, html, program);
    return was
      ? markChanges(row, pageChanges(row.id, was, { html, program }))
      : [];
  };

  /** A create's answer with the artifact's link, which the agent names it by. */
  const linked = (made: Created): Created => ({
    ...made,
    link: artifactLink(made.id, made.title),
  });

  /** A decision page's cards' links, by id: what the agent names each by. */
  const cardLinks = (
    id: string,
    cards: readonly DecisionCard[]
  ): Record<string, string> =>
    Object.fromEntries(
      cards.map((card) => [card.id, decisionLink(id, card.id, card.question)])
    );

  /**
   * The artifacts a program's Canvas and Preview pieces name, each one the
   * panel owner may draw ({@link embeds}) of the kind it shows: refused,
   * every reason at once, when one is not.
   */
  const mediaHeld = (owner: InstanceRow, program: BuiltProgram) => {
    const problems = program.read.artifacts.flatMap(({ component, id }) => {
      const held = db.get(id);
      const kinds: ArtifactKind[] =
        component === "Canvas" ? ["canvas"] : ["page", "preview", "component"];
      if (!(held && embeds(owner, held))) {
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
   * Artifact `id` as decision page `page` draws it now, at its newest
   * version ({@link newestVersion}): one its session may draw
   * ({@link embeds}), as {@link mediaHeld} let it in; a project's page
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
      ? embeds(owner, shown)
      : page.instanceId === null && shown.instanceId === null;
    return seen ? newestVersion(shown) : undefined;
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
  const stampMeta = (row: ArtifactRow, given: string | null) => {
    const ownSend = row.kind === "page" && choicesAsked(row).length > 0;
    const hash = given ?? componentHash(row);
    docs.transact(row.id, "hub", (doc) => {
      const meta = docMeta(doc);
      meta.set("ownSend", ownSend);
      meta.set("kind", row.kind);
      meta.set("name", row.name);
      meta.set("does", row.does);
      meta.set("ask", row.ask);
      meta.set("title", row.title);
      meta.set("revision", row.revision);
      meta.set("revisedAt", new Date().toISOString());
      if (hash !== null) {
        meta.set("pageHash", hash);
      }
    });
  };
  const {
    askVerify,
    componentHash,
    componentWritten,
    createSheet,
    readSheet,
    shapesOf,
    writeSheet,
    writeStage,
  } = createComponentKind({
    get askedOf() {
      return askedOf;
    },
    db,
    deps,
    discard,
    docs,
    handOver,
    inPanel,
    get marked() {
      return marked;
    },
    get openedOf() {
      return openedOf;
    },
    get read() {
      return read;
    },
    relistOf,
    stampMeta,
  });

  /** A new ask in the doc, as a revision is: every open view's head morphs to it, and a Send before it is answered. */
  const askNow = (id: string, ask: string) => {
    docs.transact(id, "hub", (doc) => {
      const meta = docMeta(doc);
      meta.set("ask", ask);
      meta.set("revisedAt", new Date().toISOString());
    });
  };

  /**
   * The seq a read of `row` that returned the keys of its state `returned`
   * names counts as its session's read through (needs.ts `readThrough`).
   */
  const readTo = (
    row: ArtifactRow,
    state: Record<string, ChoiceEntry>,
    returned: (key: string) => boolean
  ): number =>
    readThrough(
      row,
      db.changes(row.id, { after: heardSeq(row), by: "person" }),
      state,
      returned
    );

  /** What a browser met drawing `row` at its revision now (`meta.faults`, {@link pageFault}); nothing when it met nothing. */
  const faultsOf = (
    row: ArtifactRow,
    doc: Doc
  ): Pick<ArtifactRead, "faults"> => {
    const faults = faultsAt(getMeta(doc, "faults"), row.revision);
    return faults.length > 0 ? { faults } : {};
  };

  /**
   * A page or preview as the session reads it, which counts as its read
   * when `ownersRead`: its owner's. A maker's read leaves the owner's unread.
   * It counts only for what it shows: a read `since` a seq shows only what
   * changed after, so an answer of the person's the session hadn't had
   * before it stays unread (needs.ts `readThrough`).
   */
  const read = (
    row: ArtifactRow,
    since?: number,
    ownersRead = true
  ): ArtifactRead => {
    const doc = docs.doc(row.id);
    const state = stateOf(doc);
    const meta = metaOf(doc);
    const sentText = sentTextOf(doc);
    const current = meta.pageHash ?? newestHash(state);
    const changed =
      since === undefined
        ? null
        : new Set(db.changes(row.id, { after: since }).map(({ key }) => key));
    if (ownersRead) {
      db.update(row.id, {
        readSeq: readTo(row, state, (key) => !changed || changed.has(key)),
      });
    }
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
      title: row.title,
      revision: row.revision,
      pageHash: meta.pageHash,
      sentAt: meta.sentAt,
      ...(meta.sentBy ? { sentBy: meta.sentBy } : {}),
      answeredAt: answeredAtOf(state),
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
      ...(servedOf(row) && getMeta(doc, "stage")
        ? { stage: getMeta(doc, "stage") }
        : {}),
      ...faultsOf(row, doc),
    };
  };

  /** Each of `cards` (of all `all` on artifact `id`), routed by Who decides and said as a line ({@link ArtifactServiceDeps.decides}). */
  const routedOn = (
    asker: InstanceRow,
    id: string,
    cards: DecisionCard[],
    all: DecisionCard[]
  ): Promise<Record<string, string>> => {
    const row = db.get(id);
    return row
      ? deps.decides.routed(asker, row, cards, all, stateOf(docs.doc(id)))
      : Promise.resolve({});
  };

  /** What a create answers of a decision page's cards' routes ({@link routedOn}); nothing when none is said. */
  const routesOf = async (
    asker: InstanceRow,
    id: string,
    program: BuiltProgram | undefined
  ): Promise<Pick<Created, "routes">> => {
    if (!program) {
      return {};
    }
    const { cards } = program.read;
    const routes = await routedOn(asker, id, cards, cards);
    return Object.keys(routes).length > 0 ? { routes } : {};
  };

  /**
   * Card `asked.card` of decision page `page` and its option
   * `asked.option`, as `settle` names them; refused in words when the page
   * asks no such card or the card offers no such option. A held next
   * version is settled on its artifact.
   */
  const cardToSettle = (
    instance: InstanceRow,
    page: string,
    asked: { card: string; option: string }
  ): {
    card: DecisionCard;
    option: DecisionCard["options"][number];
    row: ArtifactRow;
  } => {
    const found = readable(instance, page);
    const row = found.heldFor ? (db.get(found.heldFor) ?? found) : found;
    const program = programOf(row);
    if (program === undefined) {
      throw new ArtifactRefusal(
        409,
        `${named(row)} asks no decision cards: settle takes a decision page's card.`
      );
    }
    const { cards } = readKept(program);
    const card = cards.find((one) => one.id === asked.card);
    if (!card) {
      throw new ArtifactRefusal(
        404,
        `${row.name} asks no card “${asked.card}”. Its cards: ${cards.map((one) => one.id).join(", ") || "none"}.`
      );
    }
    const option = card.options.find((one) => one.id === asked.option);
    if (!option) {
      throw new ArtifactRefusal(
        422,
        `“${asked.option}” is not an option of ${card.id}. Its options: ${card.options.map((one) => one.id).join(", ")}.`
      );
    }
    return { row, card, option };
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
    if ("refused" in links) {
      throw new ArtifactRefusal(links.status, links.refused);
    }
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

  /** Why a view could not load the artifact, in DESIGN.md's error formula: what failed, and why. */
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
        return `${subject} did not answer: ${machine} isn't answering the hub.`;
      case "reach":
        return `${subject} did not answer: ${machine} couldn't open the way to it.`;
      case "closed":
        return `${subject} did not show: the panel was closed or showed something else first.`;
      case "gone":
        return artifactToolWords.workspaceGone(subject);
      case "error":
        return artifactToolWords.pageErrored(subject);
      case "crashed":
        return artifactToolWords.pageCrashed(subject);
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
   * Where the person goes to artifact `row`, a project's setup page, at
   * `card` when one is named (core `setupLanding`), and why no panel opened
   * it: its project's board while the project is not set up, its Decisions
   * tab at the page once it is. Null for any other artifact, which opens in
   * a panel.
   */
  const landingOf = (
    row: ArtifactRow,
    card: string | null
  ): { href: string; why: string } | null => {
    const project = boardOf(row);
    if (!project) {
      return null;
    }
    const setUp = deps.setUp(project);
    return {
      href: setupLanding(project, setUp, card),
      why: setUp ? artifactToolWords.onDecisions : artifactToolWords.onBoard,
    };
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
    panel = row.instanceId,
    card: string | null = null
  ): Promise<
    | { opened: true; started: true }
    | { opened: false; started: boolean; why: string; href?: string }
  > => {
    const landing = landingOf(row, card);
    if (landing) {
      return { opened: false, started: true, ...landing };
    }
    const published = await timedShowStep("open", row, panel, () =>
      deps.open(row, panel)
    );
    if (!published.ok) {
      return { opened: false, why: published.error, started: false };
    }
    const owns = panel === row.instanceId;
    const meta = docMeta(docs.doc(row.id));
    if (owns && meta.get("handed") === true) {
      docs.transact(row.id, "hub", () => meta.delete("handed"));
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
        // Not known yet, not failed: it is in the panel. Said as it stands:
        // no view follows the session, or one does and drew nothing of it.
        return {
          opened: false,
          why: deps.followed(panel ?? "") ? NOT_PUT_ON_SCREEN : NO_VIEW,
          started: true,
        };
      default:
        unhandled("read", shown);
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
  const openedOf = (shown: Opened): Opened => {
    if (shown.opened) {
      return { opened: true };
    }
    return shown.href
      ? { opened: false, why: shown.why, href: shown.href }
      : { opened: false, why: shown.why };
  };

  /*
   * A canvas (Projects spec §5.10, D24–D25). Its `deliveredSeq` is the seq
   * the session last read it through (a canvas delivers no picks; `readCanvas`):
   * what "changed since your last read" and "changed under you" are measured from.
   */

  /** The canvas's latest picture as base64; null until a screen drew one. */
  const pictureOf = (id: string): string | null =>
    pictureBytes(id)?.toString("base64") ?? null;

  /** The artifact's latest picture's bytes: a canvas's, or a page's from its last send; null when it has none. */
  const pictureBytes = (id: string): Buffer | null => {
    try {
      return store.picture(id);
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
        return store.thumbnail(row.id, "light");
      } catch {
        // Its file went since it was kept: its ink picture, when it has one.
      }
    }
    return pictureBytes(row.id);
  };
  const {
    askAgain,
    bursts,
    delivering,
    errorsOwed,
    held,
    marked,
    personMarked,
    retry,
  } = createMarks({
    get addressOf() {
      return addressOf;
    },
    db,
    deps,
    docs,
    holder,
    get notSent() {
      return notSent;
    },
    pictureOf,
    get sendAnswered() {
      return sendAnswered;
    },
    store,
  });

  /**
   * What a Send carries of an artifact's doc: every pick since the last
   * Send, and the note; a page holding a project's Setup carries the Setup
   * whole, every time, as drawn and as the person changed it: Caw's draft
   * is in its program, not its picks, so a Setup the person left as he
   * drew it holds no pick at all. The person's marks are not its to carry:
   * they go by themselves ({@link marked}). Refused when it would carry
   * nothing.
   */
  const sendOwes = (
    doc: Doc,
    state: Record<string, ChoiceEntry>,
    setup: SetupDrawn | null,
    body: SendBody
  ) => {
    const { sentAt } = metaOf(doc);
    const picked =
      setup !== null ||
      Object.values(state).some((entry) => !sentAt || entry.at > sentAt);
    const note = body.text?.trim() || null;
    if (!(picked || note)) {
      throw new NothingNewToSend();
    }
    return { picked, note };
  };

  /**
   * A Send of artifact `row`'s picks and note, heard by `to`: what it owes
   * ({@link sendOwes}, refused when nothing), applied (`sending`: a
   * decision page decided, a setup page's Setup applied), then heard
   * (`signal`), the page's Send time stamped. Every Send of a page comes
   * here: its own and the panel's ({@link send}), and the Decisions tab's
   * and the board's Set up (`sendPage`), whether its session stands or has
   * ended. Answers the session that heard it. The hub's own Send of
   * answers its session already read (`tell` false) settles the page the
   * same way and tells no one: `sentBy` "hub" keeps that it settled.
   */
  const sendPage = async (
    row: ArtifactRow,
    body: SendBody,
    route: string,
    to: PageHearer,
    by: SentBy = "person",
    tell = true
  ): Promise<string | null> => {
    const doc = docs.doc(row.id);
    const state = stateOf(doc);
    const program = programOf(row);
    const setup = program === undefined ? null : readKept(program).setup;
    let owes: ReturnType<typeof sendOwes>;
    try {
      owes = sendOwes(doc, state, setup, body);
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
    const { sentAt } = metaOf(doc);
    saySend(
      row,
      body,
      route,
      tell
        ? artifactToolWords.sendCarried(
            unsentChoices(state, metaOf(doc).sentAt),
            note !== null
          )
        : artifactToolWords.sendSettled
    );
    if (picked) {
      await deps.sending(to, row, {
        state,
        sentAt,
        revisedAt: getMeta(doc, "revisedAt") ?? null,
        setup,
      });
    }
    const hearer = tell
      ? await deps.signal(to, row, { since: row.deliveredSeq })
      : null;
    const at = new Date().toISOString();
    docs.transact(row.id, "hub", (live) => {
      const meta = docMeta(live);
      meta.set("sentAt", at);
      meta.set("sentBy", by);
      meta.set("sentText", note);
      // His Send is a look at everything on this revision: every change and every answer. The hub's is none.
      const changes = by === "person" ? meta.get("changes") : undefined;
      if (changes) {
        seeChanges(
          live,
          changes.revision,
          changes.items.map((item) => item.anchor)
        );
      }
      for (const pin of by === "person" ? readPins(live).values() : []) {
        if (newAnswer(pin)) {
          seePin(live, pin.id, at);
        }
      }
    });
    db.update(row.id, { deliveredSeq: (db.get(row.id) as ArtifactRow).seq });
    // What it answered leaves Needs you, and with it the writer's plan (core `planWaitsOf`).
    deps.needsMoved();
    return hearer;
  };

  /**
   * A delivery no one took, said on each pin it carried (core `Pin.notSent`):
   * the pin says why, wherever it is shown, and offers Try again until a
   * delivery carries it (marks.ts `stampDelivered` clears it).
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

  /** Where the person marked artifact `id`: the page's address the page last said, else the last delivery's, else its own route. */
  const addressOf = (id: string, doc: Doc): string =>
    held.url(id) ?? getMeta(doc, "sentUrl") ?? routeOf(id);

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
        title: row.title,
        id: row.id,
        promotedAt: at,
        session: instance.id,
      }),
      "pins.json": promotedJson(Object.fromEntries(readPins(doc))),
      "ink.json": promotedJson(doc.getMap("ink").toJSON()),
    };
    if (row.kind === "page") {
      files["index.html"] = store.htmlBytes(row.id);
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
      // A project's setup page holds its Setup alone, Caw's questions going
      // through `ask` (the project-setup skill): the Setup is its choice.
      const holds = program
        ? program.read.cards.length > 0 || program.read.setup !== null
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
    const { does, ask, title } = askedOf(input);
    const problem =
      titleProblem(title, input.name) ??
      askProblem(ask) ??
      doesProblem(input, does);
    if (problem) {
      throw new ArtifactRefusal(400, problem);
    }
  };

  /** What a create names the person does there, its ask and its title, as its row keeps them; refused with the tool's shape when it names any not. */
  const askedOf = (
    input: Pick<ArtifactInput, "does" | "ask" | "title">
  ): { ask: string; does: ArtifactDoes; title: string } => {
    if (
      input.does === undefined ||
      input.ask === undefined ||
      input.title === undefined
    ) {
      throw new ArtifactRefusal(422, CREATE_SHAPE);
    }
    return { does: input.does, ask: input.ask, title: input.title.trim() };
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
      html = store.html(row.id);
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
    { lands, owner, maker }: Making,
    input: Pick<ArtifactInput, "kind" | "name" | "does" | "ask" | "title">,
    at: { machineId: string | null; source: PreviewSource }
  ): Placement => {
    const now = new Date();
    // Read again: opening its held version first (openNextFirst) moved it.
    const found = lands
      ? db.get(lands.id)
      : namedFor(owner, input.kind, input.name);
    // The project's page another session wrote, one whose session is gone,
    // or a tree's preview whose holder acts no more (lands): made again
    // here, it is this panel's, its doc and picks kept.
    const moved = found && found.instanceId !== owner.id;
    const before = moved
      ? (db.update(found.id, { instanceId: owner.id }) as ArtifactRow)
      : found;
    const movedFrom = moved ? (found.instanceId ?? undefined) : undefined;
    const asked = askedOf(input);
    if (before) {
      const holding = holdNext(maker, before);
      const target = holding?.next ?? before;
      db.resource(target.id, at);
      const row = db.update(target.id, {
        ...asked,
        madeBy: maker.id,
        revision: target.revision + 1,
        updatedAt: now,
      }) as ArtifactRow;
      // Made again where it stands: a held one is told once it is written (heldOver).
      if (!holding) {
        versionMoved(row);
      }
      return {
        before,
        holding,
        movedFrom,
        row,
        was: holding?.fresh ? undefined : target,
      };
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
    return { before, holding: null, row, was: undefined };
  };

  /**
   * A create's server started ({@link serveFirst}) and its row placed
   * ({@link placed}), a held next version opened first ({@link
   * openNextFirst}); its workspace held from the server's start until the
   * row names it ({@link makingFrom}), as a retirement in between would end
   * the server under the create.
   */
  const servedAndPlaced = async (
    making: Making,
    input: ArtifactInput,
    at: { machineId: string | null; source: PreviewSource }
  ): Promise<{ placement: Placement; stage: StageState | undefined }> => {
    const madeFrom = makingFrom(at.source);
    try {
      const stage = await serveFirst(at.source, at.machineId);
      await openNextFirst(making, input.kind, input.name);
      return { stage, placement: placed(making, input, at) };
    } finally {
      madeFrom();
    }
  };

  /**
   * A create's placement let go, as if it was never made: a row it made (a
   * new artifact, a fresh next version) discarded, its served server with
   * it; one it made again put back as it was, its machine and source
   * through their one write, so the preview of its origin follows it back
   * and the server it moved to is let go (server.ts `onSourceMoved`).
   */
  const unplace = ({
    before,
    holding,
    movedFrom,
    row,
    was,
  }: Placement): void => {
    if (before && movedFrom !== undefined) {
      db.update(before.id, { instanceId: movedFrom });
    }
    if (!was) {
      discard(row);
      return;
    }
    db.resource(row.id, { machineId: was.machineId, source: was.source });
    const back = db.update(row.id, {
      madeBy: was.madeBy,
      ask: was.ask,
      title: was.title,
      does: was.does,
      revision: was.revision,
      updatedAt: was.updatedAt,
    }) as ArtifactRow;
    if (!holding) {
      versionMoved(back);
    }
  };

  /**
   * A preview handed to a parent, loaded first on its own origin as the
   * parent will open it (server.ts `reachable`): no panel loads it to say
   * it failed, so one with a hop down, or whose page answers an error
   * status (a render that throws answers 500), is refused here with the
   * status and the error's first line, its placement let go
   * ({@link unplace}), and it never reaches the parent. A page its server
   * is still making goes up as it does to a panel. Nothing for a page
   * artifact.
   */
  const answersFirst = async (placement: Placement): Promise<void> => {
    const { row } = placement;
    if (!(row.kind === "preview" && row.machineId) || "page" in row.source) {
      return;
    }
    const down = await deps.reachable(row);
    if (!down) {
      return;
    }
    unplace(placement);
    // The why is a code before the sentence's stop (DESIGN.md Voice, the
    // error formula: "nixbox stopped answering (timeout)."); `show` says
    // the `notLoaded` sentence alone.
    const failed = notLoaded(row, down.failure);
    const said = down.why
      ? `${failed.replace(TRAILING_STOPS, "")} (${down.why.replace(TRAILING_STOPS, "")}).`
      : failed;
    throw new ArtifactRefusal(503, `${said} ${artifactToolWords.notHanded}`);
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
   * `artifact_read` of `row` for `instance`, its picture drawn when `drawn`:
   * a canvas's latest; a preview or a page now, at its state's link when
   * `ask` names one; a component's frames by its stage. What it is (its
   * picture, program, outline, server) is its newest version's
   * ({@link newestVersion}); what the person did on it is the version's
   * they have before them ({@link canvasNow}, {@link pageNow}).
   */
  const readOf = async (
    instance: InstanceRow,
    row: ArtifactRow,
    since: number | undefined,
    drawn: boolean,
    { link, ...ask }: PictureAsk
  ): Promise<ArtifactRead> => {
    const ownersRead = readsForOwner(instance, row);
    const now = newestVersion(row);
    if (row.kind === "canvas") {
      return heldAnswer(await canvasNow(row, now, since, drawn, ownersRead));
    }
    if (row.kind !== "component") {
      // Drawn before the read, which then says what the picture shows.
      const picture = drawn
        ? await deps.picture(instance, now, {
            width: ask.width ?? PICTURE_VIEW.width,
            ...(link === undefined ? {} : { link }),
          })
        : undefined;
      return heldAnswer({
        ...pageNow(row, now, since, ownersRead),
        ...(since === undefined ? programRead(now) : {}),
        ...(picture === undefined ? {} : { png: picture }),
      });
    }
    const answer = await readSheet(row, since, ownersRead, {
      ...ask,
      png: drawn,
    });
    return ask.verify
      ? { ...answer, verify: await askVerify(instance, row) }
      : answer;
  };

  /** The picture read `told` answered for `row`, kept at `save` in `instance`'s workspace: the path written. */
  const keptIn = (
    instance: InstanceRow,
    row: ArtifactRow,
    save: string,
    told: ArtifactRead
  ): Promise<string> => {
    if (typeof told.png !== "string") {
      throw new ArtifactRefusal(
        409,
        `${row.name} has no picture yet, so nothing was saved.`
      );
    }
    return deps.keepPicture(instance, save, told.png);
  };

  /**
   * Refuses `instance`'s change of `row`'s state from `before` to `after`
   * when it replaces an answer of the person's the session hasn't had
   * (overwrite.ts `answersReplaced`): one he changed on the artifact after
   * its last read or notice, counted only for a session whose read the
   * page keeps ({@link readsForOwner}), else after none; on a held next
   * version, his answers on the opened one. Its words name each answer.
   */
  const answersHad = (
    instance: InstanceRow,
    row: ArtifactRow,
    change: {
      after: Record<string, unknown>;
      before: Record<string, unknown>;
      tested: ReadonlySet<string>;
    }
  ): void => {
    const live = (row.heldFor === null ? row : db.get(row.heldFor)) ?? row;
    const owners = readsForOwner(instance, live);
    const had = owners ? heardSeq(live) : 0;
    const standing = stateOf(docs.doc(live.id));
    const replaced = answersReplaced({
      ...change,
      standing,
      unheard: unheardKeys(
        had,
        db.changes(live.id, { after: had, by: "person" })
      ),
    });
    if (replaced.length === 0) {
      return;
    }
    const said = replaced.map((key) => {
      const his = standing[key] as ChoiceEntry;
      return artifactToolWords.answerSaid(key, {
        ...his,
        note: noteText(his.note),
      });
    });
    let how: "held" | "read" | "test" = owners ? "read" : "test";
    if (live !== row) {
      how = "held";
    }
    throw new ArtifactRefusal(409, artifactToolWords.answersStand(said, how));
  };
  const {
    askOf,
    closesOf,
    factsKept,
    factsOf,
    mediaOf,
    questionsFrom,
    sessionsOf,
    withMedia,
  } = createFacts({
    choicesAsked,
    db,
    deps,
    docs,
    holder,
    programOf,
  });

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
    docMeta(docs.doc(row.id)).has("draft") ||
    putBeforePerson(row);

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
   * again from now, and when it asks a pick or a judgement made while the
   * writer is at work on its plan, the step it was asked at is kept in its
   * ask (plans.ts `askedAt`): its plan holds it until it is answered or
   * deleted (needs.ts `planHolds`, rule 2).
   */
  const askedNow = (writer: InstanceRow, id: string): void => {
    const row = db.get(id);
    // The person's own composer canvas asks nothing until it is sent.
    if (
      !row ||
      row.heldFor !== null ||
      getMeta(docs.doc(row.id), "draft") === true
    ) {
      return;
    }
    const step =
      row.does === "pick" || row.does === "judge"
        ? deps.askedAt(writer.id, row.id)
        : null;
    const asked: ArtifactAsked = {
      by: writer.id,
      at: new Date().toISOString(),
      ...(step ? { step } : {}),
    };
    docs.transact(row.id, "hub", (doc) => setMeta(doc, "asked", asked));
    deps.needsMoved();
  };

  /** Whether what the person wrote on `row` goes to its session by itself (needs.ts `sendsItself`). */
  const sendsItself = (row: ArtifactRow): boolean =>
    answeredWhole(row, withMedia(row, factsOf(row)));

  /**
   * The hub's own Send of `row` once the person's changes stand quiet
   * ({@link marked}), when it sends itself ({@link sendsItself}): the same
   * Send as his (`sendPage`: a decision page decided, the session told to
   * read), taken as no look of his, whoever wrote it: it goes to whoever
   * holds the page now, the one his marks go to (`answersTo`: its writer,
   * else the session that delegated it, which lists it in open_items, else
   * the project's Caw). That one is told only of answers not read yet
   * ({@link unheardAnswers}; a read by any of them counts, `readsForOwner`);
   * with none, the page settles and nothing goes to it. Decided either way.
   */
  const sendAnswered = async (id: string): Promise<void> => {
    const row = db.get(id);
    if (!(row && sendsItself(row))) {
      return;
    }
    const to = deps.answersTo(holder(row), row);
    if (to === null) {
      return;
    }
    await sendPage(
      row,
      { control: "answered" },
      "hub",
      to,
      "hub",
      unheardAnswers(row)
    );
  };

  /** Whether `row` holds a pick, note or value of the person's its session has not had (needs.ts `answersUnheard`). */
  const unheardAnswers = (row: ArtifactRow): boolean =>
    answersUnheard(
      row,
      db.changes(row.id, { by: "person" }),
      stateOf(docs.doc(row.id))
    );

  /**
   * Any change of artifact `row`'s doc, by anyone (a pick, a note, a value,
   * a pin's reply or resolve, the agent's close, the hub's own bookkeeping),
   * `by` whom: only his change moves when what he wrote goes by itself
   * (what it answered leaves Needs you, and with it the writer's plan, by
   * the doc's own write: `needsMoved`): his own pushes the
   * quiet delivery back ({@link personMarked}, which then sends it,
   * {@link sendAnswered}); anyone else's that leaves every question
   * answered sends it now, unless a delivery of his changes is already
   * coming, whose timer it never moves.
   */
  const answersMoved = (row: ArtifactRow, by: CanvasAuthor): void => {
    // Only a pick or a judgement sends itself.
    if (row.does !== "pick" && row.does !== "judge") {
      return;
    }
    sendIfWhole(row, by);
  };

  /**
   * What the person wrote on `row` goes now, after a change `by` someone
   * not him, when every question has his answer and no delivery of his
   * changes is coming (needs.ts `sendsOnChange`), whose timer this never
   * moves: a doc change ({@link answersMoved}), or the hub's own sweep
   * after a restart ({@link resumeMarks}).
   */
  const sendIfWhole = (row: ArtifactRow, by: CanvasAuthor): void => {
    if (
      !sendsOnChange(by, {
        coming: bursts.has(row.id) || delivering.has(row.id),
        whole: sendsItself(row),
      })
    ) {
      return;
    }
    delivering.add(row.id);
    sendAnswered(row.id)
      .catch((error: unknown) => {
        console.warn(
          `[artifacts] ${row.id}: the person's answers did not go by themselves: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => delivering.delete(row.id));
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
    const { sentAt, sentBy } = metaOf(doc);
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
    const draft = getMeta(doc, "draft") === true;
    // Handed up and not opened, or a maker's change held for the parent to open.
    const handed =
      getMeta(doc, "handed") === true || db.heldOf(row.id) !== undefined;
    const waitingOn: ArtifactStatus["waitingOn"] = [];
    // The person's move: what Needs you lists it for (needs.ts), its asks retired by their rules.
    if (pendingFor(row)) {
      waitingOn.push("person");
    }
    // The session's move: what is handed to it, what the person sent or drew and it hasn't read, and every answer of his it hasn't taken (question_close).
    if (
      !draft &&
      (handed ||
        picksAwaiting > 0 ||
        (row.kind === "canvas" && unread.length > 0) ||
        questionsAsked(row).some((one) => one.state === "answered"))
    ) {
      waitingOn.push("session");
    }
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      title: row.title,
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
      ...(sentBy ? { sentBy } : {}),
      updatedAt: row.updatedAt.toISOString(),
      pins,
      unread: unread.length,
      picksAwaiting,
      ...(picks ? { picks } : {}),
      waitingOn,
    };
  };

  /**
   * Artifact `row`'s questions as the session that asked reads them: put
   * to the person only while it is his (not a draft, not handed up or held,
   * not an option's media, its folder not gone; needs.ts `asks`), open or
   * answered, never one taken or withdrawn.
   */
  const questionsAsked = (row: ArtifactRow): Question[] => {
    if (row.heldFor !== null) {
      return [];
    }
    const facts = withMedia(row, factsOf(row));
    const mine = !(facts.draft || facts.handed || facts.media);
    // A working canvas (`draw`) is the agent's drawing for the next agent: it asks him nothing.
    const doc = docs.doc(row.id);
    return stillAsked(
      questionsFrom(
        row,
        doc,
        pinsToTell(readPins(doc).values()).sort((a, b) => a.number - b.number),
        {
          asked:
            mine &&
            facts.gone === null &&
            (row.does === "pick" || row.does === "judge") &&
            row.ask.trim() !== "",
          pinsMayAsk: mine && row.does !== "draw",
        }
      )
    );
  };

  /**
   * Every question `instance`'s delegation tree put to the person
   * ({@link questionsAsked}): its own artifacts first (those it holds and those it
   * made into another's panel), then those of the sessions under it in its
   * project, an ended delegate's included (its parent takes them up), each
   * part newest first.
   */
  const askedBy = (instance: InstanceRow): AskedOf[] => {
    const holders = holdersInTree(instance);
    const mine = [...db.ofInstance(instance.id), ...db.ofMaker(instance.id)];
    const seen = new Set<string>();
    const rows = [
      ...mine.sort(newestFirst),
      ...[
        ...ofTree(instance, holders),
        ...answerable(instance, holders).filter(
          (row) => row.instanceId !== instance.id
        ),
      ].sort(newestFirst),
    ].filter((row) => {
      const first = !seen.has(row.id);
      seen.add(row.id);
      return first;
    });
    return rows.flatMap((row) => {
      const questions = questionsAsked(row);
      if (questions.length === 0) {
        return [];
      }
      const owner = holder(row);
      return [
        {
          artifact: {
            id: row.id,
            kind: row.kind,
            name: row.name,
            does: row.does,
            link: artifactLink(row.id, row.title),
            title: row.title,
          },
          session:
            row.instanceId === null || row.instanceId === instance.id
              ? null
              : {
                  id: row.instanceId,
                  link: sessionNamed(row.instanceId),
                  title: owner
                    ? sessionLabel(owner).name
                    : "a session since removed",
                  ended: !owner || deps.finished(owner),
                },
          questions,
        },
      ];
    });
  };

  /**
   * The question `asked` names for `instance` (`question_close`): a card's
   * link or `<page>#<card>`, a pin's link, an artifact's link, name or
   * handle (its judgement), on an artifact it reads ({@link readable}).
   * Refused in words when it names none of its questions.
   */
  const questionNamed = (
    instance: InstanceRow,
    asked: string
  ): { question: Question; row: ArtifactRow } => {
    const [artifact, key] = questionKeyOf(asked);
    const row = readable(instance, artifact);
    const doc = docs.doc(row.id);
    const pins = [...readPins(doc).values()];
    // A pin's link names it by number; its key is its id.
    const pinKey = key.startsWith("pin:")
      ? `pin:${pins.find((pin) => String(pin.number) === key.slice(4))?.id ?? key.slice(4)}`
      : key;
    const questions = questionsFrom(row, doc, pins, {
      asked: true,
      pinsMayAsk: true,
    });
    const question = questions.find((one) => one.key === pinKey);
    if (!question) {
      throw new ArtifactRefusal(
        404,
        `${named(row)} asks no such question. Its questions: ${questions.map((one) => one.link).join(", ") || "none"}.`
      );
    }
    return { question, row };
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
     * start (preview-service.ts `reach`): `gone`, the daemon's
     * words that it isn't there (preview proxy `isFolderGone`), takes it
     * out of Needs you and keeps it in Files; null, it was there.
     */
    /**
     * The folder previews on machine `machineId` that are in Needs you, or
     * would be but for a gone folder recorded: each one's folder, for the
     * machine to read as it registers (artifact-pages.ts `foldersSeen`).
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

    /** The server artifact `id`'s source moved off, let go once nothing else shows it ({@link letGoMoved}). */
    letGoMoved,

    /** Whether a create is making a preview from workspace `id` now, its row not yet written ({@link makingIn}). */
    makingFrom: (id: string): boolean => makingIn.has(id),

    /**
     * Of `served` (the artifacts a workspace serves: workspaces.ts
     * `servedFrom`), each one waiting on the person, and every decision
     * page waiting on the person that shows one of them as a Canvas or
     * Preview piece: what a workspace's archive or discard refuses on. One
     * waits as Needs you reads it (`pendingFor`, `artifact_list`'s
     * `waitingOn: ["person"]`), or, for this guard alone, as a `try` the
     * person has before them and hasn't sent since its last revision
     * ({@link unsentTry}): the owner's rule, 2026-11-04, that a preview he
     * hasn't sent is still his to judge. Needs you keeps its own rule (a
     * `try` asks nothing there, needs.ts `asks`).
     */
    waitingOnPerson: (served: readonly ArtifactRow[]): ArtifactRow[] => {
      const ids = new Set(served.map((one) => one.heldFor ?? one.id));
      if (ids.size === 0) {
        return [];
      }
      const asks = new Map<string, ArtifactRow>();
      for (const one of served) {
        if (one.heldFor === null && waitsOnPerson(one)) {
          asks.set(one.id, one);
        }
      }
      for (const page of db.asking()) {
        if (
          page.kind === "page" &&
          mediaOf(page).some((id) => ids.has(id)) &&
          pendingFor(page) !== null
        ) {
          asks.set(page.id, page);
        }
      }
      return [...asks.values()];
    },

    /**
     * Of `served` (workspaces.ts `servedFrom`), those its workspace's
     * retirement still waits on (workspaces.ts `owedFrom`). One waiting on
     * the person itself is owed; one a decision page shows is otherwise
     * owed only while a page showing it waits on him, or is handed up to a
     * parent that hasn't opened it: a preview handed up and put on a page
     * stays `handed` for good, its parent never opening it alone. Once
     * every page showing it is answered (or went: `withMedia`), what the
     * workspace serves asks nothing more of anyone, and it retires (the
     * owner's rule, tsk-302, 2026-11-08). One on no page holds as it
     * stands, as a preview always has: nothing says it is done with but
     * its deletion.
     */
    servedOwed: (served: readonly ArtifactRow[]): ArtifactRow[] => {
      if (served.length === 0) {
        return [];
      }
      const pages = pagesShowing();
      return served.filter((one) => {
        if (waitsOnPerson(one)) {
          return true;
        }
        const showing = pages.get(one.heldFor ?? one.id) ?? [];
        return showing.length === 0
          ? !withMedia(one, factsOf(one)).media
          : showing.some((page) => waitsOnPerson(page) || factsOf(page).handed);
      });
    },

    /**
     * Keeps up the server of each served preview on a machine in `online`
     * that waits on the person, itself or by a decision page showing it:
     * started or woken as a page going out warms it (`serveFirst`), which
     * also restarts its idle time (agent stage.ts `used`), so it never
     * sleeps under a page he has yet to answer. On 2026-11-08 the frames of
     * plan page fdbe3bf8 were asleep when he opened it. Each server is
     * asked once per {@link KEEP_UP_MS}, a third of what puts it to sleep:
     * the stage logs a line for a use after a quiet minute (the workspace
     * sweep, workspace-retire.ts, comes every minute and would say so every
     * minute). One whose workspace is not active has nothing to run in.
     */
    keepWaitingUp: (online: ReadonlySet<string>): void => {
      const up = waitingServers(online);
      for (const key of keptUpAt.keys()) {
        if (!up.has(key)) {
          keptUpAt.delete(key);
        }
      }
      const now = Date.now();
      for (const [key, row] of up) {
        if (now - (keptUpAt.get(key) ?? 0) >= KEEP_UP_MS) {
          keptUpAt.set(key, now);
          detach(serveFirst(row.source, row.machineId), "keeping a preview up");
        }
      }
    },

    sourceSeen: (id: string, gone: string | null): void => {
      const row = db.get(id);
      if (!row) {
        return;
      }
      const meta = docMeta(docs.doc(id));
      const was = meta.get("sourceGone")?.why;
      if ((was ?? null) === gone) {
        return;
      }
      docs.transact(id, "hub", () => {
        if (gone === null) {
          meta.delete("sourceGone");
        } else {
          meta.set("sourceGone", { at: new Date().toISOString(), why: gone });
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
     * made before this turn began, still asked, with nothing of its plan
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
          planHolds(row.id, asked, steps) ||
          !pendingFor(row)
        ) {
          continue;
        }
        const next: ArtifactAsked = {
          ...asked,
          movedAt: endedAt.toISOString(),
        };
        docs.transact(row.id, "hub", (doc) => setMeta(doc, "asked", next));
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
     * Card `card` of page `artifactId` as a wait reads it (task-waits.ts
     * `settled`): its question, whether the page asks it, and the pick it
     * holds (core `pickMade`) as its value, the options picked or the value
     * set; null while unpicked. Undefined once the page is deleted.
     */
    waitCard: (
      artifactId: string,
      card: string
    ):
      | {
          asked: boolean;
          page: string;
          picked: readonly string[];
          question: string;
          value: string | null;
        }
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
        picked: picked && entry ? entry.options : [],
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
    waitCards: (
      artifactId: string
    ): { id: string; options: readonly string[] }[] => {
      const page = db.get(artifactId);
      return page
        ? choicesAsked(page).map((choice) => ({
            id: choice.id,
            options: choice.card?.options.map((option) => option.id) ?? [],
          }))
        : [];
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
          : artifactByHandle(asked, db.ofProject(projectId));
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
                ...field("title", row.title),
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
      store.keepThumbnail(id, "light", light);
      if (shot.single || !shot.dark) {
        store.dropDark(id);
      } else {
        store.keepThumbnail(id, "dark", shot.dark);
      }
      const kept: ArtifactThumbnail = {
        at: new Date().toISOString(),
        single: shot.single || !shot.dark,
        ...size,
      };
      store.keepThumbnail(id, "json", JSON.stringify(kept));
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
        return store.thumbnail(id, kept.single ? "light" : scheme);
      } catch {
        return null;
      }
    },

    /**
     * `artifact_list`: every artifact the session's artifact tools act on,
     * newest first, a page of {@link LIST_PAGE} at a time from `cursor`
     * ({@link pageOf}), each with whose move it is; `waitingOnly` keeps those
     * where it is somebody's. What the tools reach is what it names
     * ({@link nameable}: its own, its delegation tree's, its project's
     * pages, a conversation's project's), what it made into another's panel
     * (its maker reads and revises it, {@link revisable}), and what its
     * project's cold writers left ({@link leftInProject}).
     */
    status: (
      instanceId: string,
      {
        cursor,
        waitingOnly = false,
      }: { cursor?: string; waitingOnly?: boolean } = {}
    ): ArtifactList => {
      const instance = sessionOf(instanceId);
      const rows = [
        ...new Map(
          [
            ...nameable(instance),
            ...db.ofMaker(instance.id),
            ...leftInProject(instance),
          ].map((row) => [row.id, row])
        ).values(),
      ].sort(newestFirst);
      // Whose move it is reads each one's doc: only `waiting` reads them all.
      const kept = waitingOnly
        ? rows.filter((row) => statusOf(instance, row).waitingOn.length > 0)
        : rows;
      const page = pageOf(kept, cursor);
      return {
        artifacts: page.rows.map((row) => statusOf(instance, row)),
        next_cursor: page.next,
        total: kept.length,
      };
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
     * and one with a hop down is refused, nothing kept. A page or preview the panel's owner already has under
     * the same kind and name is replaced in place: its doc, and so every
     * pick, stays, and the caller becomes its maker; a preview of that name
     * its delegation tree holds, when its own panel has none, too
     * ({@link makingFor}). What it is made from (a
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
      const making = makingFor(instance, input);
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
      const { stage, placement } = await servedAndPlaced(making, input, {
        source,
        machineId,
      });
      const { before, holding, movedFrom, row } = placement;
      if (handing(making)) {
        await answersFirst(placement);
      }
      letGo(movedFrom, row);
      const made = html === null ? [] : writeMade(row, html, program);
      stampMeta(row, pageHashOf(html, program));
      keepPublishedSources(row, program, input.dir, making.maker);
      // The server it moved off is let go by the preview that serves it
      // (server.ts `onSourceMoved`); a held next version's moves off none,
      // its artifact still showing it until it is opened (promote).
      if (stage) {
        writeStage(row, stage);
      }
      const shown = await handOver(making, before, row, undefined, holding);
      if (!(shown.started || before) && input.kind === "preview") {
        // A preview nothing could start shows nothing: it is not kept. One
        // whose server did not answer stays in the panel, its failure on it.
        discard(row);
        throw new ArtifactRefusal(503, shown.why);
      }
      const said = heldId(row);
      askedNow(instance, said.id);
      const routes = await routesOf(instance, said.id, program);
      return {
        ...said,
        kind: row.kind,
        name: row.name,
        title: row.title,
        route: routeOf(said.id),
        ...routes,
        link: artifactLink(said.id, row.title),
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
     * or Mermaid; its outline after the change. Its owner's, its maker's, or
     * a session's of the project its writers left it in, to call
     * ({@link revisable}); what it answers is the owner's read only.
     */
    update: async (
      instanceId: string,
      id: string,
      change: Exclude<PageChange, { statements: string }> | CanvasChange
    ): Promise<ArtifactRead> => {
      const instance = sessionOf(instanceId);
      const found = revisable(instance, id);
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
     * Page `artifactId`'s cards among `cards` that are still open, with all
     * its cards and its picks, as a Who decides brief reads them
     * (settling.ts); undefined when the page or its program is gone.
     */
    pageCards: (artifactId: string, cards: readonly string[]) => {
      const row = db.get(artifactId);
      const program = row ? programOf(row) : undefined;
      if (!(row && program !== undefined)) {
        return;
      }
      const all = readKept(program).cards;
      const state = stateOf(docs.doc(row.id));
      return {
        row,
        all,
        state,
        cards: all.filter(
          (card) => cards.includes(card.id) && !pickMade(card, state[card.id])
        ),
      };
    },

    /** The open decision pages' cards filed under kind `kind` with no pick yet, by page (Who decides' kinds). */
    waitingUnder: (
      kind: string
    ): { cards: string[]; program: string; row: ArtifactRow }[] =>
      db.asking().flatMap((row) => {
        const program = programOf(row);
        if (program === undefined) {
          return [];
        }
        const state = stateOf(docs.doc(row.id));
        const cards = readKept(program)
          .cards.filter(
            (card) => card.kind === kind && !pickMade(card, state[card.id])
          )
          .map((card) => card.id);
        return cards.length > 0 ? [{ row, program, cards }] : [];
      }),

    /**
     * A card settled for the person (`settle`, Who decides): option
     * `option` of card `card` on decision page `page`, written into the
     * page's doc as one transaction, the same `state` entry the person's
     * pick is, its `settled` saying who, why and on what sources. From
     * there it takes the person's path: the doc's update is logged and sent
     * to every open view (docs.ts `keep`), and the hub's `updated` moves the
     * card's waits and any build held for it. Refused in words when the
     * session may not settle it (settling.ts `settler`), when it is
     * picked already (the person picks again to reverse), or when the
     * option is not the card's.
     */
    settle: async (
      instanceId: string,
      page: string,
      asked: { card: string; option: string; sources: string[]; why: string }
    ): Promise<Settled> => {
      const instance = sessionOf(instanceId);
      const { row, card, option } = cardToSettle(instance, page, asked);
      const { member, ...signed } = await deps.decides.settler(
        instance,
        row,
        card
      );
      const doc = docs.doc(row.id);
      const before = stateOf(doc)[card.id];
      if (pickMade(card, before)) {
        throw new ArtifactRefusal(
          409,
          `${card.question} is decided already; only the person picks again.`
        );
      }
      if (
        signed.by === "practice" &&
        !asked.sources.some((one) => WEB_SOURCE.test(one))
      ) {
        throw new ArtifactRefusal(422, decidesWords.practiceCites);
      }
      const settled: SettledBy = {
        ...signed,
        session: instance.id,
        why: asked.why.trim(),
        sources: asked.sources,
      };
      const entry: ChoiceEntry = {
        options: [option.id],
        note: before?.note ?? null,
        value: before?.value ?? null,
        pageHash: metaOf(doc).pageHash ?? before?.pageHash ?? "0".repeat(64),
        at: new Date().toISOString(),
        settled,
      };
      const problem = choiceEntryProblem(card.id, entry);
      if (problem) {
        throw new ArtifactRefusal(422, `${problem} Nothing was changed.`);
      }
      docs.transact(row.id, "agent", (live) =>
        live.getMap("state").set(card.id, entry)
      );
      console.log(
        `[artifacts] ${row.name}#${card.id} settled ${option.id} by ${signed.by} (${instance.id})`
      );
      deps.decides.settled(row, card, member, {
        label: option.label,
        why: settled.why,
      });
      return {
        card: decisionLink(row.id, card.id, card.question),
        option: { id: option.id, label: option.label },
        settled,
      };
    },

    /**
     * A decision page's revision: `statements` merged into its program by
     * name (decision-program.ts `mergeProgram`), built and checked as a
     * create's is, then every open view draws the new program in place, its
     * picks, notes and pins kept by id. Answers what changed, not the page.
     * Its owner's, its maker's, or any session's of its project
     * ({@link projectPage}, the clause by which {@link readable} reads it),
     * Caw's included: a later session links its decisions by revising one
     * statement. Named as every artifact tool names one ({@link whole}): by
     * its id, handle or name. Its maker's, while the parent's panel shows
     * it, waits as its next version ({@link changedBy}); another session's
     * of the project lands on the page itself, or joins the next version
     * waiting for the parent, so opening that keeps it. Each merges into the
     * program of the row it lands on.
     */
    revise: async (
      instanceId: string,
      id: string,
      statements: string
    ): Promise<Revised> => {
      const instance = sessionOf(instanceId);
      const wholeId = whole(instance, id);
      const asked = db.get(wholeId);
      const peer =
        asked &&
        asked.instanceId !== instance.id &&
        asked.madeBy !== instance.id
          ? projectPage(instance, wholeId)
          : undefined;
      const found = peer ?? revisable(instance, wholeId);
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
        const merged = merging(existing, statements);
        // A program's refusal, thrown as the artifact's.
        if (merged instanceof ElysiaStatus) {
          throw new ArtifactRefusal(merged.status, merged.response.detail);
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
     * Artifact `id`'s newest version ({@link newestVersion}): the next one
     * its maker's change waits as, else itself. Undefined when the hub
     * doesn't hold it.
     */
    newest: (id: string): ArtifactRow | undefined => {
      const row = db.get(id);
      return row && newestVersion(row);
    },

    /**
     * A decision page's program and what its media show now, for the page
     * the hub serves (preview.ts `servePage`): the hash its overlay carries,
     * and each artifact its Canvas and Preview pieces name, null once the hub
     * no longer holds it, and its pictures' sizes by their addresses
     * (page-pictures.ts). Null for any other page.
     */
    programServed: (
      id: string
    ): {
      hash: string;
      media: Record<string, ServedMedia | null>;
      pictures: Record<string, PictureSize>;
    } | null => {
      const row = db.get(id);
      const program = row ? programOf(row) : undefined;
      if (program === undefined) {
        return null;
      }
      const media: Record<string, ServedMedia | null> = {};
      for (const { id: shown } of readKept(program).artifacts) {
        const shownRow = row && mediaSeen(row, shown);
        if (!shownRow) {
          media[shown] = null;
          continue;
        }
        media[shown] = {
          id: shownRow.id,
          kind: shownRow.kind,
          revision: shownRow.revision,
          ...(shownRow.kind === "component"
            ? { shapes: shapesOf(shownRow) }
            : {}),
        };
      }
      return {
        hash: pageHash(program),
        media,
        pictures: store.pictures(id),
      };
    },

    /**
     * The shape an embed of component canvas `id` said at rest for the
     * stories a Preview names at the width it names (core `storiesKey`), as
     * a decision page's Preview heard it, kept in the canvas's doc (`meta.saidShapes`): the page's media
     * carries it from then on, so the next Preview of it, in any browser,
     * stands its skeleton at that shape from its first paint. Changed only
     * when it differs. False for an artifact that is no component canvas.
     */
    keepSaidShape: (id: string, key: string, shape: EmbedShape): boolean => {
      const row = db.get(id);
      if (row?.kind !== "component") {
        return false;
      }
      const meta = docMeta(docs.doc(id));
      const had = meta.get("saidShapes") ?? {};
      const before = had[key];
      if (before?.h === shape.h && before.w === shape.w) {
        return true;
      }
      docs.transact(id, "hub", (doc) => {
        setMeta(doc, "saidShapes", {
          ...had,
          [key]: { h: shape.h, w: shape.w },
        });
      });
      return true;
    },

    /**
     * Whether decision page `pageId` shows artifact `id`, or the newest
     * version it draws of one, as a Canvas or Preview piece its session sees
     * ({@link mediaSeen}): its origin then serves that artifact inside it, a
     * delegate's as its own.
     */
    pageShows: (pageId: string, id: string): boolean => {
      const page = db.get(pageId);
      const piece = db.get(id)?.heldFor ?? id;
      return (
        !!page && mediaOf(page).includes(piece) && !!mediaSeen(page, piece)
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
      ask: PictureAsk = {}
    ): Promise<ArtifactRead> => {
      const instance = sessionOf(instanceId);
      const row = readTarget(instance, id);
      // A state's link draws it, and a picture kept is drawn first.
      const drawn =
        png ||
        ask.png === true ||
        ask.link !== undefined ||
        ask.save !== undefined;
      const refusal = pictureRefusal(row, ask, drawn);
      if (refusal) {
        throw refusal;
      }
      const told = await readOf(instance, row, since, drawn, ask);
      return ask.save === undefined
        ? told
        : { ...told, saved: await keptIn(instance, row, ask.save, told) };
    },

    /** `artifact_update` of a sheet by whoever may change it ({@link revisable}): one story's args, or one story op, written by its stage. */
    sheetUpdate: async (
      instanceId: string,
      id: string,
      change: SheetChange
    ): Promise<ComponentWritten> => {
      const instance = sessionOf(instanceId);
      const row = revisable(instance, id);
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
      const row = revisable(instance, id);
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
      db.resource(row.id, {
        machineId: row.machineId,
        source: { ...row.source, path: canvasPath(files, spec) },
      });
      const next = db.update(row.id, {
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
      const row = revisable(sessionOf(instanceId), id);
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
     * `artifact_update` with `title`, for any kind: checked as a create's
     * is, then every surface that names it says the new one (the panel's
     * frame again, the list and Needs you on their next read). A new title
     * asks nothing, so the person's last Send stands.
     */
    titleUpdate: (
      instanceId: string,
      id: string,
      title: string
    ): { id: string; title: string } => {
      const row = revisable(sessionOf(instanceId), id);
      const problem = titleProblem(title, row.name);
      if (problem) {
        throw new ArtifactRefusal(400, problem);
      }
      const kept = title.trim();
      db.update(row.id, { title: kept, updatedAt: new Date() });
      docs.transact(row.id, "hub", (doc) => setMeta(doc, "title", kept));
      relistOf(row);
      return { id: row.id, title: kept };
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
     * miniature, read on the workspace its stage runs in. `front`: the
     * component its design graph has in front (another states file's, from
     * the toolchain root), which the map then centres on; a path that
     * leaves the toolchain root is no component of it.
     */
    mapOf: async (
      instanceId: string,
      id: string,
      front?: string
    ): Promise<CanvasMap> => {
      const row = viewable(sessionOf(instanceId), id);
      const sheet = sheetOf(row);
      const first = getMeta(docs.doc(row.id), "sheet")?.meta.component;
      if (
        front &&
        (isAbsolute(front) || front.split(PATH_PARTS).includes(".."))
      ) {
        throw new ArtifactRefusal(
          400,
          `${front} is no component of ${row.name}'s toolchain.`
        );
      }
      const component = front ?? first;
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
        sentAt: getMeta(doc, "sentAt") ?? null,
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
        ? (getMeta(docs.doc(row.id), "stage") ?? null)
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
        const unreached = getMeta(docs.doc(row.id), "unreached");
        if (!(unreached && unreached.down !== "workspace")) {
          continue;
        }
        // One doc that can't be written is that canvas's: the register goes on.
        try {
          docs.transact(row.id, "hub", (doc) => {
            docMeta(doc).delete("unreached");
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
     * A fault page or preview `report.artifact` met as a browser drew it
     * (core page-faults.ts), its overlay's report: kept in its doc
     * (`meta.faults`) for `artifact_read`, the revision it is drawn at now
     * alone, each fault once and the first 20 (core `faultsWith`). A
     * report from a page served at another revision is let go: what it met
     * is no longer what is drawn.
     */
    pageFault: (report: PageFaultReport): void => {
      const row = db.get(report.artifact);
      if (
        !(row && (row.kind === "page" || row.kind === "preview")) ||
        report.revision !== row.revision
      ) {
        return;
      }
      const kept = faultsWith(
        getMeta(docs.doc(row.id), "faults"),
        row.revision,
        report.fault
      );
      if (kept) {
        docs.transact(row.id, "hub", (doc) => {
          setMeta(doc, "faults", kept);
        });
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
      if (!docMeta(docs.doc(id)).has("unreached")) {
        return;
      }
      docs.transact(id, "hub", (doc) => {
        docMeta(doc).delete("unreached");
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
            bytes: store.htmlBytes(row.id),
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
            sheet: getMeta(docs.doc(row.id), "sheet") ?? null,
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
      const names = await folderFileNames(projectId, folder);
      if (names instanceof ElysiaStatus) {
        throw notCommitted(row.name, names);
      }
      const there = new Set(names);
      const changed = await changeFolderFiles(
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
      );
      if (changed instanceof ElysiaStatus) {
        throw notCommitted(row.name, changed);
      }
      const commit = changed.sha;
      const promoted: ArtifactPromotion = { commit, at };
      docs.transact(row.id, "hub", (doc) => setMeta(doc, "promoted", promoted));
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
      docs.transact(row.id, "hub", (doc) => setMeta(doc, "draft", false));
      return { draft: false };
    },

    /**
     * Brings an artifact to the front of session `instanceId`'s panel, at
     * `at`, and waits for a view to have it on screen ({@link Opened}); a
     * refusal when its server could not be started. The agent's show
     * (`artifact_show`) is of its own, one it made, or another session's of
     * its delegation tree ({@link viewable}), and opens in its own panel as
     * it stands, never the owner's, nothing of it changing. The person's is
     * of any artifact of the fleet a session holds: one this panel sees
     * ({@link sees}) opens here as the agent's does; any other opens in the
     * panel of the session that holds it, which the answer's `href` takes
     * the person to (core `artifactStopHref`: that session as a tab beside
     * the one on screen, the artifact at `at`), so their press is never
     * refused for the session they pressed it in. The owner's show of one
     * with a held next version (or of that version, by its id) opens the
     * next version ({@link promote}); the person's shows what the panel has.
     */
    show: async (
      instanceId: string,
      id: string,
      by: PanelHand,
      at: ArtifactPlace = { top: true }
    ): Promise<Shown> => {
      const instance = sessionOf(instanceId);
      const found =
        by === "person" ? showable(instance, id) : viewable(instance, id);
      let row = found.heldFor === null ? found : db.get(found.heldFor);
      if (!row) {
        throw new ArtifactRefusal(404, artifactToolWords.noArtifact(id));
      }
      const link = artifactLink(row.id, row.title);
      const there = inItsSession(instance, found, row, at);
      if (there) {
        return { ...there, link };
      }
      const next =
        by === "agent" && row.instanceId === instance.id
          ? db.heldOf(row.id)
          : undefined;
      if (next) {
        row = await promote(row, next);
      }
      const shown = await show(row, instance.id, "card" in at ? at.card : null);
      if (!shown.started) {
        throw new ArtifactRefusal(503, shown.why);
      }
      // The agent's show of its own asks again (needs.ts rule 2: a new show of it).
      if (by === "agent" && row.instanceId === instance.id) {
        askedNow(instance, row.id);
      }
      // Its link: what the agent names it by, and its tool row draws.
      return { ...openedOf(shown), link };
    },

    /**
     * `artifact_browse`: where session `instanceId`'s own browser opens
     * artifact `id`, for any artifact `artifact_read` reads ({@link
     * readTarget}), at its newest version ({@link newestVersion}): a next
     * version held for its owner's panel is what every browser opens. A
     * browser artifact is the browser itself, and opens nothing. A session in a workspace whose boundary cannot reach the
     * address ({@link ArtifactServiceDeps.workspaceReach}) is refused, in
     * words saying why, rather than handed an address it cannot open.
     */
    browse: async (
      instanceId: string,
      id: string
    ): Promise<Browsed & { link: string }> => {
      const instance = sessionOf(instanceId);
      const row = newestVersion(readTarget(instance, id));
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
      return { ...pass, link: artifactLink(row.heldFor ?? row.id, row.title) };
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
      const removed = {
        id: row.id,
        kind: row.kind,
        name: row.name,
        title: row.title,
      };
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
          showing: now
            ? { id: now.id, kind: now.kind, name: now.name, title: now.title }
            : null,
        };
      }
      const next = by === "person" ? nextNewest(instance) : undefined;
      if (next && (await deps.open(next)).ok) {
        return {
          removed,
          showing: {
            id: next.id,
            kind: next.kind,
            name: next.name,
            title: next.title,
          },
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
          setMeta(doc, "lookedAt", new Date().toISOString())
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
        const pins = pinsToTell(readPins(doc).values())
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
        const address = getMeta(doc, "sentUrl") ?? routeOf(row.id);
        return answered.length > 0
          ? [
              {
                id: row.id,
                kind: row.kind,
                name: row.name,
                link: artifactLink(row.id, row.title),
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
        ...(files && files.length > 0 ? { files: [...new Set(files)] } : {}),
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

    /** Every question session `instanceId`'s delegation tree put to the person, open or answered ({@link askedBy}). */
    questions: (instanceId: string): AskedOf[] =>
      askedBy(sessionOf(instanceId)),

    /** The same questions as session `instanceId`'s own screen lists them (core session-questions.ts). */
    sessionQuestions: (instanceId: string): SessionQuestionsRead => ({
      questions: askedBy(sessionOf(instanceId)).flatMap((of) =>
        of.questions.flatMap((question): SessionQuestion[] =>
          question.state === "open" || question.state === "answered"
            ? [
                {
                  key: question.key,
                  kind: question.kind,
                  words: question.words,
                  state: question.state,
                  answer:
                    question.state === "answered"
                      ? answerShown(question.answer)
                      : null,
                  stop: question.stop,
                  artifact: {
                    id: of.artifact.id,
                    kind: of.artifact.kind,
                    title: of.artifact.title,
                  },
                  session: of.session
                    ? {
                        id: of.session.id,
                        title: of.session.title,
                        ended: of.session.ended,
                      }
                    : null,
                },
              ]
            : []
        )
      ),
    }),

    /**
     * `question_close`: the session takes question `question` (it acted on
     * his answer, `why` his words quoted) or withdraws it (`why` what
     * superseded it). Kept in the artifact's doc
     * (`meta.questionsClosed`), the hub's alone to write; nothing is
     * deleted. Neither counts as asking the person (needs.ts), and a newer
     * answer of his to one taken stands answered again.
     */
    closeQuestion: (
      instanceId: string,
      asked: { as: QuestionClose["as"]; question: string; why: string }
    ): QuestionClosed => {
      const instance = sessionOf(instanceId);
      const { row, question } = questionNamed(instance, asked.question);
      const close: QuestionClose = {
        as: asked.as,
        at: new Date().toISOString(),
        by: instance.id,
        why: asked.why.trim(),
      };
      docs.transact(row.id, "hub", (doc) => {
        const meta = docMeta(doc);
        meta.set("questionsClosed", {
          ...closesOf(doc),
          [question.key]: close,
        });
      });
      console.log(
        `[artifacts] ${row.name} ${question.key} ${close.as} by ${instance.id}`
      );
      deps.needsMoved();
      deps.questionsMoved(row.id);
      return { as: close.as, link: question.link, words: question.words };
    },

    /** Anyone changed artifact `id`'s doc, `by` whom: what waits on its answers moves ({@link answersMoved}). */
    answersMoved: (id: string, by: CanvasAuthor): void => {
      const row = db.get(id);
      if (row) {
        answersMoved(row, by);
      }
    },

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
     * a person who has moved on. Every page answered whole and not sent
     * goes too ({@link sendIfWhole}), to whoever holds it now.
     */
    resumeMarks: (): void => {
      for (const row of db.touchedSince(new Date(Date.now() - DAY_MS))) {
        marked(row.id);
      }
      // A page answered whole goes, however long ago: one whose writer had
      // ended waited for a holder before (sendAnswered). Read, it settles.
      for (const row of db.asking()) {
        // The hub's own act, as docs.ts names the hub's writes.
        sendIfWhole(row, "agent");
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
      await sendPage(row, body, route, { session: instance });
      return { choices: state, ...metaOf(doc) };
    },

    /**
     * The person's I'm done picking on a project's decision page (the
     * Decisions tab, the board's Set up: decisions.ts `send`), heard by
     * `to`: the session that wrote it while it stands, else the project's
     * Caw. The same Send as {@link send}'s, whoever hears it. Answers the
     * session that heard it.
     */
    sendPage: async (
      id: string,
      route: string,
      to: PageHearer
    ): Promise<string> => {
      const row = db.get(id);
      if (!row) {
        throw new ArtifactRefusal(404, artifactToolWords.noArtifact(id));
      }
      const hearer = await sendPage(
        row,
        { control: "decisions-done" },
        route,
        to
      );
      // A Send that tells (sendPage's default) always names who heard it.
      if (hearer === null) {
        throw new Error(`${labelOf(row)}: its Send told no one.`);
      }
      return hearer;
    },
  };
};

export type Artifacts = ReturnType<typeof createArtifacts>;
