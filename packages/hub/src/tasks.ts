/**
 * A project's tasks (§5.2 of the Projects spec): one file each in the
 * project's hub folder (task-file.ts has the format), an index the hub keeps
 * beside them, and the one way the dashboard and sessions change them.
 *
 * - **Files are the truth.** Every change here reads the file, changes the
 *   lines it owns and writes it back through project-folder.ts, so it is a
 *   commit with an author and a message (`task tsk-12: stage draft → review
 *   (by you)`) whose trailers name who, as which mover, the stage move and
 *   why. Those commits are the task's history (task-history.ts): who made
 *   and last changed it, when it started, completed or was dropped, and why
 *   it closed are read back from them, never written into the file. A file
 *   changed by hand is read as it is.
 * - **The index** (`project_tasks`) holds what a list shows, per file, with
 *   the hash of the content it was read from. A list reads every task file
 *   and re-indexes the ones whose hash moved, so a hand edit shows on the
 *   next read; a write through here re-indexes its own file at once. The hub
 *   catches up every project that has a folder when it starts.
 * - **Stages** come from the project's `stages.md` (stages.ts), or the code
 *   template while it has none. A new task starts in the first `todo` stage;
 *   a stage change is checked against the file's moves for who is making it
 *   (you at the dashboard, a session through the tools). Needs you is worked
 *   out on every read from the stage's kind and never stored.
 * - **Tracker.** Every task is a file whatever the project's tracker. With
 *   GitHub Issues or Linear (tracker.ts), a task's issue fields (title,
 *   description, labels, stage, comments) are one record with its issue,
 *   which its file names (`issue:`); the sync writes what the tracker holds
 *   through the same calls as everyone, as an actor marked `tracker`.
 * - **External items** (core external-items.ts). A task links GitHub and
 *   Linear items by URL (`issue:`, the record; `links:`, the rest), each
 *   mirrored as the source holds it (db task-links.ts) and drawn from there.
 *   A comment carried from a source is an entry whose heading names the
 *   source and URL; only the hub's sync rewrites one, when the source's
 *   words change ({@link Tasks.editComment}).
 * - **Attempts** are work items at a task (dispatch.ts starts them). Every
 *   read carries a task's attempts and what follows from them and its edges:
 *   a live attempt, what it still waits on, a last attempt that failed or
 *   was stopped, and how.
 * - **Links** (core task-edges.ts `TASK_EDGES`). `waits_on` blocks: a task is ready
 *   exactly when it is in a `todo` stage, every target it and its `part_of`
 *   ancestors wait on is settled (task-waits.ts `settled`, the one
 *   resolver), no attempt at it is live, and no coordinator holds it (a
 *   live attempt at one of its ancestors). `part_of` makes it a part: it
 *   inherits every wait of its chain, and a whole closes once its last part
 *   is done and no coordinator of it is live. `duplicate_of` closes it as a
 *   duplicate and moves every wait on it to the survivor; a task dropped
 *   otherwise is taken out of every wait on it. `found_in` is the hub's: the
 *   task or pin the filer's work came from. A write that would close a
 *   cycle of waits or parts, a wait on itself, or a target that does not
 *   exist is refused, naming the path. That is its starter's business (the session
 *   that started it, or the lead for the dispatcher's), never the person's
 *   Needs you: a task waits for you only in a stage of kind `you`. The hub
 *   moves a task as `hub`: code, which the file's moves do not bind; its
 *   commits say so.
 *
 * Changes to one project's tasks are taken one at a time: two to-dos ticked
 * at once both land.
 */
import {
  type AttemptResult,
  CLOSED_STAGE_KINDS,
  type EndedBy,
  type ExternalComment,
  type ExternalRef,
  externalItemWords,
  type InstanceRow,
  type IssueTracker,
  LANDS_MODES,
  type LandsMode,
  type Mover,
  markdownLink,
  type ProjectStarter,
  type ResultArtifact,
  refOfUrl,
  STAGES_TEMPLATES,
  STARTER_PLACES,
  type StageKind,
  type StagesTemplate,
  type StarterPlace,
  type TaskLinkSummary,
  type TaskMover,
  taskLink,
  taskLinkWords,
  taskTarget,
  todoProgress,
  type WaitTarget,
  waitHandle,
  waitTarget,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import type { TaskEdge } from "@cawco/core/task-edges";
import type {
  BuiltOn,
  Stage,
  StageMove,
  StagesView,
  StageView,
  TaskAttempt,
  TaskFlags,
  TaskHistory,
  TaskList,
  TaskReviewRead,
  TaskSummary,
  TaskTimes,
  TaskWait,
  WaitState,
} from "@cawco/core/task-views";
import { Elysia, t } from "elysia";
import type { TaskIndexRow, WorkItemRow } from "./db";
import type { Tracker, WorkBudget } from "./db/schema";
import { cutOver } from "./external-cutover";
import { githubRepoOf } from "./github";
import {
  deleteFolderFile,
  type Exclusive,
  FOLDER_RAW_LIMIT,
  type FolderAuthor,
  FolderRefusal,
  FolderTaken,
  type FolderWriteOptions,
  fileExtension,
  folderFileNames,
  folderFileRaw,
  folderFileTimes,
  folderHistory,
  folderPath,
  folderUncommitted,
  hasProjectFolder,
  IMAGE_TYPES,
  listFolder,
  MEDIA_TYPES,
  moveFolderFile,
  readFolderFile,
  readFolderFileAt,
  refused,
  servedFile,
  turnTaker,
  writeFolderFile,
  writeFolderFiles,
  YOU,
} from "./project-folder";
import { type MachineFacts, runsOnValue } from "./runs-on";
import {
  firstStage,
  isCodeTemplate,
  moveProblem,
  nobodyProblem,
  passesReview,
  readStages,
  ruledStages,
  STAGE_NAME,
  type Stages,
  type StagesReading,
  sendBackOf,
  stageNamed,
  startProblem,
  templateStages,
  templateText,
} from "./stages";
import {
  ARCHIVE_DIR,
  archivePath,
  EXTRA_KEY,
  type ExtraValue,
  fileTaskNumber,
  type ParsedTask,
  TASK_FIELDS,
  type TaskComment,
  TaskDoc,
  type TaskField,
  type TaskFields,
  type Todo,
  taskId,
  taskNumber,
  taskPath,
} from "./task-file";
import {
  AUTHOR,
  CHANGES,
  COMMENT_CHANGE,
  goneTasks,
  historyOf,
  hubFiled,
  inArchive,
  lifeOf,
  NO_STAGE,
  type TaskChange,
  TRAILERS,
  taskFileIn,
} from "./task-history";
import {
  cycleFrom,
  readWait,
  settledHandle,
  unsettledFirst,
  type WaitReader,
  WaitRefusal,
  type WaitWorld,
} from "./task-waits";
import { runsOf, skillTypes, templateTypes, typeFiles } from "./template-types";
import {
  budgetProblem,
  isLive,
  outputsFolder,
  ownsProblem,
} from "./work-items";

/** Who is changing a task: what stage moves they may make, and whom the commit is by. */
export interface TaskActor {
  /** The approved action making the move, for the mover `action` (actions.ts). */
  actionId?: string;
  author: FolderAuthor;
  /** The session making the change, when one is. */
  instanceId?: string;
  mover: TaskMover;
  /** Why, when the hub says: `(by hub: attempt 5fd1e189 started)`. */
  reason?: string;
  /** The routine making the move, for the mover `routine` (waits.ts: `waits`). */
  routineId?: string;
  /**
   * The tracker sync writing what the project's tracker holds (tracker.ts):
   * its own changes are never sent back to the tracker they came from.
   */
  tracker?: IssueTracker;
}

/** The operator, at the dashboard. */
export const YOU_ACTOR: TaskActor = { mover: "you", author: YOU };

/** A routine of the hub's moving a task on (waits.ts), and why; the stages' moves bind it as `routine`. */
export const routineActor = (routineId: string, reason: string): TaskActor => ({
  mover: "routine",
  routineId,
  author: { name: AUTHOR.routine },
  reason,
});

/** The hub's own code moving a task, and why. */
export const hubActor = (reason: string): TaskActor => ({
  mover: "hub",
  author: { name: AUTHOR.hub },
  reason,
});

/**
 * An approved action moving its task once it is done (actions.ts). The
 * actor alone moves nothing: the move goes only when the hub's actions
 * table holds a done action of that id naming this task and stage, whose
 * move has not gone yet ({@link TaskStore.actionMove}).
 */
export const actionActor = (actionId: string, reason: string): TaskActor => ({
  mover: "action",
  actionId,
  author: { name: AUTHOR.action },
  reason,
});

/**
 * A session calling the task tools: it moves stages as a `session` and
 * commits under its name; the project's Caw (its row's role `lead`) moves as
 * the `lead` and commits as Caw.
 */
export const sessionActor = (row: InstanceRow): TaskActor =>
  row.role === "lead"
    ? { mover: "lead", instanceId: row.id, author: { name: AUTHOR.lead } }
    : {
        mover: "session",
        instanceId: row.id,
        author: {
          name:
            row.title?.trim() ||
            row.derivedTitle?.trim() ||
            `session ${row.id.slice(0, 8)}`,
        },
      };

/**
 * What a task's newest finished attempt handed back, read whole on a task's
 * own read (never on the list: a report runs to pages): its session's report
 * of what it did, which is how an attempt presents its result whatever the
 * work, beside the outputs it handed in (`assets/<task>/`).
 */
export interface TaskResult {
  /** When the attempt finished, ms epoch. */
  at: number;
  /** Its `finish_item`'s headline, one or two sentences; null when it gave none. */
  headline: string | null;
  /** Its `finish_item`'s summary, in full (markdown). */
  report: string;
  workItemId: string;
}

/** Its waits that are not settled: what it still waits on. */
const unsettledWaits = (task: Pick<TaskFlags, "waits">): TaskWait[] =>
  task.waits.filter((wait) => !wait.settled);

/**
 * A change to a project's tasks, for the dispatcher to look again. A task
 * filed straight into a stage is `created`, so a stage's hook runs for it as
 * for a move in.
 */
export type TaskEvent =
  | {
      actor: TaskActor;
      /** You passed it on out of a stage of kind `you` (its review, its result): its filer hears it (task-approval.ts). */
      approved?: true;
      from: string;
      id: string;
      kind: "moved";
      projectId: string;
      /** Why, as the mover gave it with the move; absent when none was given. */
      reason?: string;
      to: string;
    }
  | {
      actor: TaskActor;
      id: string;
      kind: "created";
      projectId: string;
      stage: string;
    }
  | {
      /** A comment added to the task, by whom: the hub hands yours to its live attempt (server.ts). */
      comment?: { actor: TaskActor; text: string };
      /** The one task that changed, when one did (its to-dos ticked); absent: any of them. */
      id?: string;
      kind: "changed";
      projectId: string;
    };

/** What the service needs of the hub's database. */
export interface TaskStore {
  /**
   * Whether the approved action `actionId` is done, is for this task, names
   * `to` as its stage, and has not moved it yet (db/actions.ts). Without it,
   * no `action` move goes: §5.2's "stage moves with `by: action` happen only
   * this way".
   */
  readonly actionMove?: (
    projectId: string,
    taskId: string,
    to: string,
    actionId: string
  ) => boolean;
  /**
   * Why your approval of a task cannot go now, in a line you read where you
   * pressed Approve; nothing when it can (design-system.ts: the attempt's
   * design/ is not committed).
   */
  readonly approvalRefusal?: (
    projectId: string,
    taskId: string
  ) => Promise<string | undefined>;
  /** Every work item at one of the project's tasks, newest first. */
  readonly attempts: (
    projectId: string
  ) => Pick<
    WorkItemRow,
    | "createdAt"
    | "endedAt"
    | "error"
    | "headline"
    | "id"
    | "instanceId"
    | "state"
    | "stoppedBy"
    | "summary"
    | "taskId"
    | "taskResult"
    | "waitedOn"
  >[];
  /**
   * The comments a task carried from outside sources, either way, as the
   * hub keeps them (db task-links.ts `external_comments`): each with the
   * time of its task entry.
   */
  readonly carried: (
    projectId: string,
    taskId: string
  ) => (ExternalComment & { entryAt: number })[];
  /**
   * Keeps a comment carried onto a task, once (`external_comments`); one
   * kept already whose author was not known takes theirs.
   */
  readonly carry: (
    projectId: string,
    taskId: string,
    comment: ExternalComment,
    entryAt: number
  ) => void;
  /**
   * The task a comment went on, written under `id`, the id its device chose
   * for it (db `task_comment_ids`): the same comment again adds nothing.
   */
  readonly commentSaid: (
    id: string
  ) => { projectId: string; taskId: string } | undefined;
  readonly drop: (projectId: string, paths: string[]) => void;
  readonly index: (projectId: string) => TaskIndexRow[];
  /**
   * Why a task may not close or pass review on anyone's move but yours: its
   * only changes are Caw's own, not all approved by you (lead-gate.ts
   * `reviewProblem`); nothing when it may.
   */
  readonly leadReview?: (
    projectId: string,
    taskId: string
  ) => string | undefined;
  /** The tasks that link an item (`task_read`'s `link`): a URL, or `#12` in the project's repository; a refusal in words. */
  readonly linked: (projectId: string, link: string) => string[] | string;
  /** A task's external items, its record first, as the hub mirrors them (db task-links.ts). */
  readonly links: (projectId: string, taskId: string) => ExternalRef[];
  /** Every machine the hub has seen: what a `runs_on` may name (runs-on.ts). */
  readonly machines: () => MachineFacts[];
  /** A comment written under the id its device chose, once it is committed. */
  readonly noteComment: (said: {
    id: string;
    projectId: string;
    taskId: string;
  }) => void;
  readonly project: (id: string) =>
    | {
        /** Its Caw is on: the lead who takes the reports of attempts nobody asked for. */
        caw: boolean;
        /** It starts attempts on its own (dispatch.ts), while its Caw is on. */
        dispatch: boolean;
        id: string;
        /** Its checkout's normalised origin (`github.com/acme/app`); null when it has none. */
        remote: string | null;
        /** Review before done: only you move a task to a done stage (stages.ts `ruledStages`). */
        review: boolean;
        template: StagesTemplate | null;
        tracker: Tracker;
      }
    | undefined;
  readonly projectIds: () => string[];
  readonly put: (rows: TaskIndexRow[]) => void;
  /** The tasks whose hook start waits for a slot (dispatch.ts). */
  readonly queuedStarts?: (projectId: string) => string[];
  /** Whether a session of the project resolves `type`: a type file of its own, or a fleet type (project-delegate-types.ts). */
  readonly resolvesType: (projectId: string, type: string) => boolean;
  /** Keeps an attempt's result, replacing the one it had. */
  readonly saveResult: (workItemId: string, result: AttemptResult) => void;
  /** Records the template a project's stages came from: its starter skills follow it. */
  readonly setTemplate: (id: string, template: StagesTemplate) => void;
  /** The project's starters for a place as they were last written for it (project-starters.ts); none while Jev is off. */
  readonly starters: (
    projectId: string,
    place: StarterPlace
  ) => ProjectStarter[];
  /** Why the hub last could not start an attempt at a task, while that stands (dispatch.ts). */
  readonly startProblem?: (
    projectId: string,
    task: { hash: string; id: string }
  ) => string | null;
  /** One message from the hub to a live session: a wait of its task moved (closed, answered differently). */
  readonly tell?: (instanceId: string, text: string) => void;
  /** The indexed tasks that wait on a task (db `taskWaiters`). */
  readonly waiters: (
    projectId: string,
    taskId: string
  ) => { id: string; path: string }[];
  /** How a wait the actor writes reads in the project (task-waits.ts `readWait`): the pages, sessions and GitHub it may name. */
  readonly waitReader: (projectId: string, actor: TaskActor) => WaitReader;
  /** What the resolver reads of the hub past the project's tasks: cards, pins, pull requests and runs, sessions. */
  readonly waitWorld: (
    projectId: string
  ) => Pick<WaitWorld, "card" | "github" | "pin" | "session">;
}

/** A template the dashboard offers: its stages, and the stages.md it writes. */
export interface StagesTemplateView {
  content: string;
  moves: StageMove[];
  name: StagesTemplate;
  stages: Stage[];
  views: StageView[];
}

/** One task, its file read whole, and what its attempts and edges say. */
export interface TaskView extends TaskFlags, TaskTimes, TaskReviewRead {
  acceptance: string;
  /** The accounts its attempts may run on; empty: every account. */
  accounts: string[];
  /** What an attempt may spend before the hub stops it; null: the project's default. */
  budget: WorkBudget | null;
  checks: string[];
  /** Its `## Comments`, oldest first: each written by the hub with who and when. */
  comments: TaskComment[];
  /** Project folder files its attempt's brief carries (`context:`), the lead's pick. */
  context: string[];
  description: string;
  /** The task it repeats (`duplicate_of`); null when none. */
  duplicateOf: string | null;
  /** The fields its file carries that a task file does not know, with their values (a scalar or a list); kept as written. */
  extra: Record<string, ExtraValue>;
  foundIn: string | null;
  /** Where it was found, as its link names it: a task's title, what a pin stands on; null when it was found nowhere. */
  foundInNamed: { href: string; label: string } | null;
  /** Its attempts' group: their parent hears one combined report once all have ended. */
  group: string | null;
  /** sha256 hex of the file as read. */
  hash: string;
  id: string;
  /** The kind of its stage; null when its stage is not one of the project's. */
  kind: StageKind | null;
  labels: string[];
  /** Where an attempt's work lands, as the file says; null: the project's default. */
  lands: LandsMode | null;
  /**
   * The external items it links (core external-items.ts): its record
   * (`issue:`, the tracker sync's) first, then its `links:`, each as the
   * source last said it.
   */
  links: ExternalRef[];
  /** It waits for you: its stage is of kind `you` (see {@link TaskSummary.needsYou}). */
  needsYou: boolean;
  number: number;
  outputs: string[];
  /** Globs of the repository's files an attempt owns. */
  owns: string[];
  partOf: string | null;
  path: string;
  problems: string[];
  rank: string | null;
  /** What its newest finished attempt handed back; null until one has. */
  result: TaskResult | null;
  /** Where its attempts run (runs-on.ts), as the file says; null: the project's. */
  runsOn: string | null;
  /** The body's other `## ` sections, as written. */
  sections: { heading: string; text: string }[];
  stage: string;
  title: string;
  todos: Todo[];
  type: string | null;
  waitsOn: string[];
}

/**
 * A new task. `waitsOn` and `partOf` as the filer writes them
 * (task-waits.ts `readWait`); `foundIn` the hub's, as a file keeps it.
 */
export interface TaskDraft {
  acceptance?: string;
  budget?: WorkBudget;
  checks?: string[];
  /** Project folder files its attempt's brief carries, like knowledge/brand.md. */
  context?: string[];
  description?: string;
  /** Fields a task file does not know (`priority`, `due`): a scalar or a list each. */
  fields?: Record<string, ExtraValue>;
  /** The task or pin the filer's work came from, as a file keeps it: the hub's, never the filer's. */
  foundIn?: string;
  group?: string;
  labels?: string[];
  lands?: LandsMode;
  /** External items it links, each by its URL: a GitHub issue, pull request or discussion, a Linear issue. */
  links?: string[];
  outputs?: string[];
  owns?: string[];
  partOf?: string;
  rank?: string;
  /** Where its attempts run: a machine, or a capability like `apple`. */
  runsOn?: string;
  stage?: string;
  title: string;
  /** Top-level to-dos, one line each. */
  todos?: string[];
  type?: string;
  waitsOn?: string[];
}

/**
 * One write of a task's links (`task_link`): what it waits on, the whole it
 * is a part of, or the task it repeats; `remove` takes the named ones out.
 * Each written as task-waits.ts `readWait` reads it.
 */
export interface TaskLinks {
  duplicateOf?: string;
  partOf?: string;
  remove?: boolean;
  waitsOn?: string[];
}

/** What a link write changed, for its answer. */
export interface LinkOutcome {
  /** Waits it added, as kept. */
  added: string[];
  /** The survivor it closed the task as a duplicate of; null when it closed none. */
  duplicateOf: string | null;
  /** The tasks whose waits moved to the survivor. */
  moved: string[];
  /** The whole it is a part of now, when the write set or took it out; undefined when it left it. */
  partOf: string | null | undefined;
  /** Waits it took out, settled as they stand now. */
  removed: WaitState[];
}

/** What closing a task did around it: its answer's "Now ready" and "Still waiting". */
export interface Closing {
  /** Tasks that waited on it and are ready now. */
  nowReady: string[];
  /** Tasks that waited on it and still wait, with what. */
  stillWaiting: { id: string; on: TaskWait[] }[];
  /** Tasks it was taken out of the waits of: it was dropped, not done. */
  unwaited: string[];
  /** The whole its being done closed: its last part. */
  wholeClosed: string | null;
}

/** What a project's task links cutover did ({@link Tasks.migrateLinks}). */
export interface LinkMigration {
  /** Files rewritten. */
  files: number;
  /** `parent` edges made `part_of`. */
  partOf: number;
  /** `related` edges taken out, into See also comments. */
  related: number;
  /** See also comments written: one per task that had related ones. */
  seeAlso: number;
  /** `after` edges made `waits_on`. */
  waitsOn: number;
}

/** The stage kinds that close a task. */
const CLOSED_KINDS: ReadonlySet<StageKind> = new Set(CLOSED_STAGE_KINDS);

/** A change to a task's fields and owned sections; what is left out stays. Null clears. */
export interface TaskPatch {
  acceptance?: string;
  /** What an attempt may spend; null: the project's default. */
  budget?: WorkBudget | null;
  checks?: string[];
  context?: string[];
  description?: string;
  /** Fields a task file does not know, each set (a scalar or a list) or taken out ("" or []); the others stay. */
  fields?: Record<string, ExtraValue>;
  /** Its attempts' group; null: none. */
  group?: string | null;
  labels?: string[];
  /** Where an attempt's work lands; null: the project's default. */
  lands?: LandsMode | null;
  /** The external items it links (`links:`), each by its URL; replaces the list. */
  links?: string[];
  outputs?: string[];
  owns?: string[];
  rank?: string | null;
  /** Where its attempts run; null: the project's. */
  runsOn?: string | null;
  title?: string;
  type?: string | null;
}

/**
 * What a list keeps: every condition given must hold. Archived tasks are
 * listed only with `archived`, and then only they are.
 */
export interface TaskFilter {
  /** Only tasks archived in tasks/archive/, instead of the board's. */
  archived?: boolean;
  /** true: only tasks with a wait unsettled; false: only tasks with none. */
  blocked?: boolean;
  /** Fields a task file does not know, each to equal the value given (as written). */
  fields?: Record<string, string>;
  kind?: StageKind;
  /** A label the task carries. */
  label?: string;
  /** An external item it links: its URL, or `#12` in the project's repository (db task-links.ts `byItem`). */
  link?: string;
  /** true: only tasks that need you; false: only tasks that do not. */
  needsYou?: boolean;
  /** The task they are part of (`tsk-12`). */
  partOf?: string;
  /** Words to find, case aside, in its id, title or description. */
  q?: string;
  stage?: string;
  /** Its delegate type. */
  type?: string;
}

/** To-do changes made together, in one commit. A to-do is named by id (`td-3`) or position (`2.1`). */
export interface TodoChanges {
  /** `proposed`: offered by an attempt's plan, not agreed (a `(proposed)` line). */
  add?: { text: string; under?: string; proposed?: boolean }[];
  edit?: { todo: string; text: string }[];
  tick?: string[];
  untick?: string[];
}

const TITLE_LIMIT = 200;
const TODO_LIMIT = 500;
/** A to-do line promoted to a task: `- [ ] Persist it → #152` (task-file.ts `PROMOTED`), its number apart. */
const PROMOTED_TODO = /^(\s*- \[[ xX]\] .*?(?:→|->)\s*#)(\d{1,9})(?=\s*$)/gmu;
const TEXT_LIMIT = 20_000;
const ITEM_LIMIT = 200;
/** How many numberings a create or merge tries while files keep landing on the numbers it took. */
const CLAIM_TRIES = 10;

/** A file in tasks/ holds a new task file's place when it claims the same number (`tsk-12.md`, `tsk-012-anything.md`). */
const sameNumber: Exclusive = (name, rel) => {
  const number = fileTaskNumber(rel);
  return number !== undefined && fileTaskNumber(name) === number;
};
const LIST_LIMIT = 50;
const TYPE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const SECTION_LINE = /^##\s/mu;
const TODO_MARKER_START = /^\[td-\d+\]/u;
const LINE_BREAK = /[\r\n]/u;

/** The project folder's stages file, and the template that stands in while there is none. */
/** A project's stages, in its folder (§5.2). */
export const STAGES_FILE = "stages.md";
const DEFAULT_TEMPLATE: StagesTemplate = "code";

/** Takes stages.md away, so the project reads the code template; one without it has nothing to take. */
/**
 * The files of `types` a template defines that the project has no file
 * for (template-types.ts): what applying a template and filling a project's
 * types both write.
 */
const missingTypes = async (
  projectId: string,
  types: readonly string[]
): Promise<{ content: string; path: string }[]> =>
  types.length === 0
    ? []
    : typeFiles(types, new Set(await folderFileNames(projectId, "delegates")));

const removeStages = async (
  projectId: string,
  options: FolderWriteOptions
): Promise<void> => {
  try {
    await deleteFolderFile(projectId, STAGES_FILE, options);
  } catch (error) {
    if (!(error instanceof FolderRefusal && error.status === 404)) {
      throw error;
    }
  }
};

const refuse = (code: 400 | 403 | 404 | 409 | 422, message: string): never => {
  throw new FolderRefusal(code, message);
};

const hashOf = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

const WEB_LINK = /^https?:\/\//iu;

/**
 * Refuses an artifact a result may not hand in, in a sentence naming it: a
 * file or a post that is neither one of the task's `outputs` nor in the
 * project folder, a post that is no `*.post.json`, a link that is not http(s).
 */
const artifactProblem = async (
  projectId: string,
  outputs: string[],
  artifact: ResultArtifact
): Promise<void> => {
  if (artifact.kind === "link") {
    if (!WEB_LINK.test(artifact.url)) {
      refuse(422, `${artifact.url} is not an http(s) link.`);
    }
    return;
  }
  if (artifact.kind === "artifact") {
    if (!artifact.artifactId.trim()) {
      refuse(422, "Name the artifact by its id.");
    }
    return;
  }
  const path = folderPath(artifact.path);
  if (artifact.kind === "post" && !path.endsWith(".post.json")) {
    refuse(422, `${path} is no post: a post is a <task>.post.json file.`);
  }
  if (outputs.includes(path)) {
    return;
  }
  await folderFileRaw(projectId, path).catch(() =>
    refuse(
      422,
      `${path} is neither one of the task's outputs nor a file in the project folder. Name it as the task's outputs do, from the folder's root.`
    )
  );
};

// --- what a caller may write ------------------------------------------------------

const oneLine = (what: string, text: string, limit: number): string => {
  const trimmed = text.trim();
  if (!trimmed) {
    refuse(400, `The ${what} is empty; write a few words.`);
  }
  if (LINE_BREAK.test(trimmed)) {
    refuse(400, `The ${what} is one line; take out the line break.`);
  }
  if (trimmed.length > limit) {
    refuse(
      400,
      `The ${what} is ${trimmed.length} characters long; it stops at ${limit}.`
    );
  }
  return trimmed;
};

/** A description or acceptance criteria: free text that must not open a section of its own. */
const block = (what: string, text: string): string => {
  if (text.length > TEXT_LIMIT) {
    refuse(
      400,
      `The ${what} is ${text.length} characters long; it stops at ${TEXT_LIMIT}.`
    );
  }
  if (SECTION_LINE.test(text)) {
    refuse(
      400,
      `The ${what} holds a "## " heading, which would start a section of its own in the task file; use "### " inside it.`
    );
  }
  return text.trim();
};

const todoText = (text: string): string => {
  const line = oneLine("to-do", text, TODO_LIMIT);
  if (TODO_MARKER_START.test(line)) {
    refuse(
      400,
      "A to-do's text cannot start with an id marker like [td-3]; the hub numbers to-dos itself."
    );
  }
  return line;
};

const items = (what: string, list: string[]): string[] => {
  if (list.length > LIST_LIMIT) {
    refuse(
      400,
      `${what} holds ${list.length} items; it stops at ${LIST_LIMIT}.`
    );
  }
  return [
    ...new Set(list.map((item) => oneLine(`${what} item`, item, ITEM_LIMIT))),
  ];
};

/** External items' URLs a caller gave, each one a source's item (core `refOfUrl`), refused in words when one is not. */
const linksOf = (links: string[]): string[] =>
  items("links", links).map((url) =>
    refOfUrl(url)
      ? url
      : refuse(
          400,
          `“${url}” is not a GitHub issue, pull request or discussion, or a Linear issue: link one by its URL.`
        )
  );

/**
 * A task's links as its index row carries them: the file's `issue:` its
 * record, then `links:`, then each pull request it waits on (`waits_on:`),
 * so a wait on one reads the same link row (external-items.ts `prWait`).
 * An item named twice is one link, the first naming.
 */
const fileLinksOf = (
  fields: Pick<TaskFields, "issue" | "links" | "waitsOn">
): TaskLinkSummary[] => {
  const named = new Set<string>();
  return [
    ...(fields.issue ? [{ url: fields.issue, mode: "record" as const }] : []),
    ...fields.links.map((url) => ({ url, mode: "related" as const })),
    ...fields.waitsOn
      .filter((handle) => waitTarget(handle)?.kind === "pr")
      .map((url) => ({ url, mode: "related" as const })),
  ].flatMap(({ url, mode }) => {
    const item = refOfUrl(url);
    const key = item?.url.toLowerCase();
    if (!(item && key) || named.has(key)) {
      return [];
    }
    named.add(key);
    return [
      {
        source: item.source,
        kind: item.kind,
        ref: item.ref,
        state: null,
        url,
        mode,
      },
    ];
  });
};

/** A budget a caller gave, refused in its own words when it cannot stand. */
const budgetOf = (budget: WorkBudget): WorkBudget => {
  const problem = budgetProblem(budget);
  if (problem) {
    refuse(400, problem);
  }
  return budget;
};

/** Owned globs a caller gave, refused when one cannot stand. */
const ownsOf = (owns: string[]): string[] => {
  const problem = ownsProblem(owns);
  if (problem) {
    refuse(400, problem);
  }
  return items("owns", owns);
};

/** A draft's group, owned files and budget as its file's fields. */
const limitsOf = (
  draft: TaskDraft
): Pick<TaskFields, "budget" | "group" | "owns"> => ({
  group: draft.group ? oneLine("group", draft.group, 64) : null,
  owns: ownsOf(draft.owns ?? []),
  budget: draft.budget ? budgetOf(draft.budget) : null,
});

const typeName = (type: string): string => {
  const name = type.trim();
  if (!TYPE_NAME.test(name)) {
    refuse(
      400,
      `“${type}” is not a delegate type name: letters, digits, ".", "_" and "-", up to 64.`
    );
  }
  return name;
};

const stageName = (stage: string): string => {
  const name = stage.trim();
  if (!STAGE_NAME.test(name)) {
    refuse(
      400,
      `“${stage}” is not a stage name: lowercase letters, digits, "_" and "-", starting with a letter.`
    );
  }
  return name;
};

const OWN_FIELDS: ReadonlySet<string> = new Set(TASK_FIELDS);

/**
 * Fields a caller gave for keys a task file does not know: each key a bare
 * YAML key outside a task file's own, each value one line or a list of them
 * ("" or [] takes the field out).
 */
const extraFieldsOf = (
  fields: Record<string, ExtraValue>
): [string, ExtraValue][] => {
  const entries = Object.entries(fields);
  if (entries.length > LIST_LIMIT) {
    refuse(
      400,
      `fields holds ${entries.length} fields; it stops at ${LIST_LIMIT}.`
    );
  }
  return entries.map(([key, value]): [string, ExtraValue] => {
    if (!EXTRA_KEY.test(key)) {
      refuse(
        400,
        `“${key}” is not a field name: letters, digits, "_" and "-", starting with a letter or "_".`
      );
    }
    if (OWN_FIELDS.has(key)) {
      refuse(
        400,
        `${key} is one of a task file's own fields; set it through its own parameter, not fields.`
      );
    }
    if (Array.isArray(value)) {
      return [key, value.length > 0 ? items(key, value) : []];
    }
    return [key, value.trim() ? oneLine(key, value, ITEM_LIMIT) : ""];
  });
};

const COMMENT_ENTRY_LINE = /^###\s/mu;

/** A comment's text: markdown that opens neither a section nor a comment entry of its own. */
const commentText = (text: string): string => {
  const written = block("comment", text);
  if (!written) {
    refuse(400, "The comment is empty; write a few words.");
  }
  if (COMMENT_ENTRY_LINE.test(written)) {
    refuse(
      400,
      'The comment holds a "### " heading, which would start a comment entry of its own; use "#### " inside it.'
    );
  }
  return written;
};

/** A comment's first line, cut short, for its commit's subject. */
const commentGist = (text: string): string => {
  const first = text.split("\n")[0]?.trim() ?? "";
  return first.length > 60 ? `${first.slice(0, 59)}…` : first;
};

// --- the service --------------------------------------------------------------

/** A stage's kind in the project's stages; null for a stage it lacks, or while stages.md does not read. */
const kindIn = (stages: Stages | undefined, stage: string): StageKind | null =>
  (stages && stageNamed(stages, stage)?.kind) ?? null;

/** How long a failure's first line may run in its task's sentence. */
const WHY_LIMIT = 200;
/** The largest output a task's read serves: a picture an attempt made fits. */
const OUTPUT_FILE_LIMIT = 10 * 1024 * 1024;

/** Who stopped an attempt, as its task says it. */
const stopperWords = (by: EndedBy): string => {
  switch (by.kind) {
    case "person":
      return "you";
    case "session":
      return by.name;
    case "hub":
      return `the hub (${by.why})`;
    case "outside":
      break;
  }
  return `a ${by.signal} from outside CawCo`;
};

/**
 * How an attempt ended when it did not land, or how the follow-up of one
 * that landed ended without landing (a done item's `error`, work-items.ts
 * `finish`) ({@link TaskAttempt.endedHow}).
 */
const endedHowOf = (
  item: ReturnType<TaskStore["attempts"]>[number]
): string | null => {
  if (item.state === "cancelled") {
    return item.stoppedBy
      ? `Stopped by ${stopperWords(item.stoppedBy)}`
      : "Stopped";
  }
  if (item.state === "done" && item.error && item.stoppedBy) {
    return `Its follow-up was stopped by ${stopperWords(item.stoppedBy)}`;
  }
  if (item.state !== "failed" && !(item.state === "done" && item.error)) {
    return null;
  }
  const why = item.error?.trim().split("\n")[0]?.trim();
  if (!why) {
    return "It failed without a reason.";
  }
  return why.length > WHY_LIMIT ? `${why.slice(0, WHY_LIMIT - 1)}…` : why;
};

/** An attempt as a task read shows it. */
const attemptOf = (
  item: ReturnType<TaskStore["attempts"]>[number]
): TaskAttempt => ({
  workItemId: item.id,
  state: item.state,
  instanceId: item.instanceId,
  result: item.taskResult ?? null,
  startedAt: item.createdAt.getTime(),
  endedAt: item.endedAt?.getTime() ?? null,
  endedHow: endedHowOf(item),
  headline: item.headline?.trim() || null,
  waitedOn: item.waitedOn ?? [],
});

/** The newest attempt that finished with a report, as a task's read shows it ({@link TaskResult}). */
const resultOf = (
  attempts: ReturnType<TaskStore["attempts"]>
): TaskResult | null => {
  const done = attempts.find(
    (item) => item.state === "done" && item.summary?.trim()
  );
  return done
    ? {
        workItemId: done.id,
        at: (done.endedAt ?? done.createdAt).getTime(),
        headline: done.headline?.trim() || null,
        report: done.summary?.trim() ?? "",
      }
    : null;
};

/** Every indexed task, by id. */
const rowsById = (rows: TaskIndexRow[]): Map<string, TaskIndexRow> =>
  new Map(rows.map((row) => [row.id, row]));

/**
 * Whether the dispatcher may start an attempt at a task on its own (the
 * frontier): it is ready ({@link TaskFlags.ready}), it has no parts (a
 * whole is never dispatched as a plain worker: a coordinator you or a
 * session start runs it), its last attempt neither failed nor was stopped
 * (so a failure is never restarted on its own, and a stop is never undone),
 * and the hub's last try to start one did not fail on the task as it stands.
 */
export const onFrontier = (task: TaskSummary): boolean =>
  task.ready &&
  task.parts.length === 0 &&
  !task.lastAttemptFailed &&
  !task.lastAttemptStopped &&
  task.startProblem === null;

const summaryOf = (
  row: TaskIndexRow,
  stages: Stages | undefined,
  flags: TaskFlags,
  times: TaskTimes
): TaskSummary => {
  const kind = kindIn(stages, row.stage);
  const stray =
    stages && row.stage && !kind
      ? `Its stage “${row.stage}” is not one of the project's stages.`
      : undefined;
  return {
    id: row.id,
    number: row.number,
    path: row.path,
    title: row.title,
    stage: row.stage,
    kind,
    needsYou: kind === "you",
    ...flags,
    type: row.type,
    waitsOn: row.waitsOn,
    partOf: row.partOf,
    foundIn: row.foundIn,
    duplicateOf: row.duplicateOf,
    rank: row.rank,
    labels: row.labels,
    links: row.links,
    outputs: row.outputs,
    fields: row.fields,
    todos: { done: row.todosDone, total: row.todosTotal },
    ...times,
    problem: [row.problem, stray].filter(Boolean).join(" ") || null,
  };
};

const viewOf = (
  path: string,
  number: number,
  parsed: ParsedTask,
  title: string,
  hash: string,
  stages: Stages | undefined,
  flags: TaskFlags & Pick<TaskView, "foundInNamed" | "sendBack">,
  times: TaskTimes,
  result: TaskResult | null,
  links: ExternalRef[],
  carried: ExternalComment[]
): TaskView => ({
  id: taskId(number),
  number,
  path,
  title,
  links,
  stage: parsed.fields.stage ?? "",
  kind: kindIn(stages, parsed.fields.stage ?? ""),
  needsYou: kindIn(stages, parsed.fields.stage ?? "") === "you",
  ...flags,
  result,
  type: parsed.fields.type,
  waitsOn: parsed.fields.waitsOn,
  partOf: parsed.fields.partOf,
  foundIn: parsed.fields.foundIn,
  duplicateOf: parsed.fields.duplicateOf,
  checks: parsed.fields.checks,
  outputs: parsed.fields.outputs,
  context: parsed.fields.context,
  lands: parsed.fields.lands,
  runsOn: parsed.fields.runsOn,
  group: parsed.fields.group,
  owns: parsed.fields.owns,
  budget: parsed.fields.budget,
  rank: parsed.fields.rank,
  labels: parsed.fields.labels,
  accounts: parsed.fields.accounts,
  description: parsed.description,
  acceptance: parsed.acceptance,
  todos: parsed.todos,
  comments: parsed.comments.map((comment) => {
    const kept = comment.via
      ? carried.find((each) => each.url === comment.via?.url)
      : undefined;
    return kept && comment.via
      ? {
          ...comment,
          via: {
            ...comment.via,
            author: kept.author.login ? kept.author : comment.via.author,
            editedAt: kept.editedAt,
            direction: kept.direction,
          },
        }
      : comment;
  }),
  sections: parsed.sections,
  extra: parsed.extra,
  problems: parsed.problems,
  hash,
  ...times,
});

/** A task reference a caller gave, as `tsk-12`; refused when it names none. */
const taskRef = (what: string, ref: string): string => {
  const number = taskNumber(ref);
  return number === undefined
    ? refuse(
        400,
        `${what}: “${ref}” is not a task id; tasks are named like tsk-12.`
      )
    : taskId(number);
};

/** Whether a flag the filter sets (`blocked`, `needsYou`) matches; one it leaves out always does. */
const flagHolds = (asked: boolean | undefined, is: boolean): boolean =>
  asked === undefined || asked === is;

/** Whether a task's stage, labels, type and whole hold to the filter's. */
const placeHolds = (
  task: TaskSummary,
  filter: TaskFilter,
  partOf: string | null
): boolean =>
  (!filter.stage || task.stage === filter.stage) &&
  (!filter.kind || task.kind === filter.kind) &&
  (!filter.label || task.labels.includes(filter.label)) &&
  (!filter.type || task.type === filter.type) &&
  (!partOf || task.partOf === partOf);

/** Whether a task holds to every condition of a list's filter but its words (`q`, read from files). */
const holds = (
  task: TaskSummary,
  filter: TaskFilter,
  partOf: string | null
): boolean =>
  placeHolds(task, filter, partOf) &&
  flagHolds(filter.blocked, unsettledWaits(task).length > 0) &&
  flagHolds(filter.needsYou, task.needsYou) &&
  Object.entries(filter.fields ?? {}).every(
    ([key, value]) => task.fields[key] === value
  );

/** Tasks by their titles, joined with what they do: `“Fix the tray” waits`, `“A”, “B” wait`. */
const named = (rows: { title: string }[], one: string, many: string): string =>
  `${rows.map((row) => `“${row.title}”`).join(", ")} ${rows.length === 1 ? one : many}`;

/**
 * Who holds on to a task, in a sentence: the tasks waiting on it
 * (`waits_on`) and its parts (`part_of`); empty when none does.
 */
const holders = (
  waiting: { title: string }[],
  parts: { title: string }[]
): string =>
  [
    ...(waiting.length > 0 ? [`${named(waiting, "waits", "wait")} on it`] : []),
    ...(parts.length > 0 ? [`${named(parts, "is", "are")} part of it`] : []),
  ].join(", and ");

/** A list's sort: ranked tasks by rank, then the rest by number. */
const byRank = (a: TaskSummary, b: TaskSummary): number => {
  if (a.rank !== null && b.rank !== null && a.rank !== b.rank) {
    return a.rank < b.rank ? -1 : 1;
  }
  if ((a.rank === null) !== (b.rank === null)) {
    return a.rank === null ? 1 : -1;
  }
  return a.number - b.number || (a.path < b.path ? -1 : 1);
};

/** What an edge's commit message says it did. */
const EDGE_PHRASE: Record<TaskEdge, string> = {
  waits_on: "waits on",
  part_of: "part of",
  found_in: "found in",
  duplicate_of: "duplicate of",
};

/** Applies a patch to a task file; answers what it changed, for the commit message. */
const applyPatch = (doc: TaskDoc, patch: TaskPatch): string => {
  const changed: string[] = [];
  const set = (name: string, apply: () => void) => {
    apply();
    changed.push(name);
  };
  const { title, description, acceptance, type, rank, lands, group, budget } =
    patch;
  if (title !== undefined) {
    set("title", () => doc.setTitle(oneLine("title", title, TITLE_LIMIT)));
  }
  if (description !== undefined) {
    set("description", () =>
      doc.setDescription(block("description", description))
    );
  }
  if (acceptance !== undefined) {
    set("acceptance criteria", () =>
      doc.setAcceptance(block("acceptance criteria", acceptance))
    );
  }
  if (type !== undefined) {
    set("type", () => doc.setField("type", type ? typeName(type) : null));
  }
  if (rank !== undefined) {
    set("rank", () =>
      doc.setField("rank", rank ? oneLine("rank", rank, 64) : null)
    );
  }
  if (lands !== undefined) {
    set("lands", () => doc.setField("lands", lands));
  }
  const { runsOn } = patch;
  if (runsOn !== undefined) {
    set("runs_on", () => doc.setField("runs_on", runsOn));
  }
  if (group !== undefined) {
    set("group", () =>
      doc.setField("group", group ? oneLine("group", group, 64) : null)
    );
  }
  if (budget !== undefined) {
    set("budget", () =>
      doc.setField("budget", budget ? budgetOf(budget) : null)
    );
  }
  if (patch.owns !== undefined) {
    const owns = ownsOf(patch.owns);
    set("owns", () => doc.setField("owns", owns));
  }
  if (patch.links !== undefined) {
    const links = linksOf(patch.links);
    set("links", () => doc.setField("links", links));
  }
  for (const field of [
    "checks",
    "outputs",
    "context",
    "labels",
  ] as const satisfies readonly TaskField[]) {
    const list = patch[field];
    if (list !== undefined) {
      set(field, () => doc.setField(field, items(field, list)));
    }
  }
  for (const [key, value] of extraFieldsOf(patch.fields ?? {})) {
    set(key, () => doc.setExtra(key, value));
  }
  return `update ${changed.join(", ") || "nothing"}`;
};

/** A to-do change the file could not make, as the caller's refusal. */
const found = (problem: string | undefined): void => {
  if (problem !== undefined) {
    refuse(404, problem);
  }
};

const mark = (
  doc: TaskDoc,
  refs: string[] | undefined,
  done: boolean
): string | undefined => {
  if (!refs?.length) {
    return;
  }
  for (const ref of refs) {
    found(doc.tickTodo(ref, done));
  }
  return `${done ? "tick" : "untick"} ${refs.join(", ")}`;
};

/** Applies to-do changes: rewords, ticks, unticks, then adds (adds never renumber a position). */
const applyTodos = (doc: TaskDoc, changes: TodoChanges): string => {
  const said: string[] = [];
  for (const { todo, text } of changes.edit ?? []) {
    found(doc.editTodo(todo, todoText(text)));
    said.push(`reword ${todo}`);
  }
  for (const done of [
    mark(doc, changes.tick, true),
    mark(doc, changes.untick, false),
  ]) {
    if (done) {
      said.push(done);
    }
  }
  const added: string[] = [];
  for (const { text, under, proposed } of changes.add ?? []) {
    const done = doc.addTodo(todoText(text), under, proposed);
    if (typeof done === "string") {
      refuse(404, done);
    } else {
      added.push(done.id);
    }
  }
  if (added.length > 0) {
    said.push(`add ${added.join(", ")}`);
  }
  if (said.length === 0) {
    refuse(400, "Name a to-do to tick, untick, add or reword.");
  }
  return said.join("; ");
};

const stagesView = (
  source: "file" | "template",
  content: string,
  reading: StagesReading,
  /** The project's starters, each place's (project-starters.ts). */
  starters: Record<StarterPlace, ProjectStarter[]>
): StagesView => ({
  source,
  starters: starters.board,
  routineStarters: starters.routines,
  decisionStarters: starters.decisions,
  template:
    STAGES_TEMPLATES.find((name) => templateText(name) === content) ?? null,
  stages: reading.ok ? reading.stages.stages : [],
  moves: reading.ok ? reading.stages.moves : [],
  views: reading.ok ? reading.stages.views : [],
  problems: reading.ok ? [] : reading.problems,
});

/** Why the hub cannot put a task in `stage`: only that the project has no such stage. */
/** The mover a plain create by a folder commit's author would be checked as. */
const moverOf = (author: string): Mover => {
  if (author === "Caw") {
    return "lead";
  }
  return author === YOU.name ? "you" : "session";
};

/**
 * Why the hub's own code may not put a task in `stage`: it is not a stage,
 * or its `by: action` says only an approved action moves a task there (the
 * hub's dispatcher is not one).
 */
const hubProblem = (stages: Stages, stage: string): string | undefined => {
  const to = stageNamed(stages, stage);
  if (!to) {
    return `${stage} is not a stage of this project.`;
  }
  return to.hooks.by === "action"
    ? `Only an approved action moves a task to ${stage}.`
    : undefined;
};

/** Commit messages say who: `(by you)`, `(by Fix tray chip)`, `(by hub: attempt 5fd1e189 started)`. */
const byWhom = (actor: TaskActor): string =>
  `(by ${actor.author.name}${actor.reason ? `: ${actor.reason}` : ""})`;

/** What one change to a task did, for its commit: its words, and a stage move and its reason when there is one. */
interface Did {
  /** What kind of change it was when its words do not say (`CawCo-Change`). */
  change?: TaskChange;
  /** Why, given with the change; the actor's own reason when left out. */
  reason?: string;
  /** The move it made; `from` empty for a task that had no stage. */
  stage?: { from: string; to: string };
  what: string;
}

/** Who made a change, as the `CawCo-Actor` trailer names them: the session, the action, else the mover. */
const actorTrailer = (actor: TaskActor): string => {
  if (actor.instanceId) {
    return actor.instanceId;
  }
  if (actor.actionId) {
    return `action:${actor.actionId}`;
  }
  return actor.routineId ? `routine:${actor.routineId}` : actor.mover;
};

const WHITESPACE = /\s+/gu;

/**
 * A task commit's message: the subject as people read it (`task tsk-12:
 * stage draft → review (by you)`: the task ids `tasks` names, then `what`),
 * then the trailers task-history.ts reads back, which alone it reads: who,
 * the mover their stage rules were checked as, what it did, the stage move,
 * the reason and the kind of change when there are.
 */
const commitMessage = (
  actor: TaskActor,
  tasks: string,
  what: string,
  did: Omit<Did, "what"> = {}
): string => {
  const reason = (did.reason ?? actor.reason)?.replace(WHITESPACE, " ").trim();
  return [
    `${tasks}: ${what} ${byWhom(actor)}`,
    "",
    `${TRAILERS.actor}: ${actorTrailer(actor)}`,
    `${TRAILERS.mover}: ${actor.mover}`,
    `${TRAILERS.what}: ${what.replace(WHITESPACE, " ").trim()}`,
    ...(did.stage
      ? [`${TRAILERS.stage}: ${did.stage.from || NO_STAGE} -> ${did.stage.to}`]
      : []),
    ...(reason ? [`${TRAILERS.reason}: ${reason}`] : []),
    ...(did.change ? [`${TRAILERS.change}: ${did.change}`] : []),
  ].join("\n");
};

/** The longest reason a move takes. */
const REASON_LIMIT = 500;

export const createTasks = (store: TaskStore) => {
  /** Refuses your approval, with its line, while the store says it cannot go. */
  const approvable = async (projectId: string, id: string): Promise<void> => {
    const held = await store.approvalRefusal?.(projectId, id);
    if (held) {
      refuse(409, held);
    }
  };
  /** One change to a project's tasks at a time, around the folder's own commits. */
  const inTurn = turnTaker();
  /** The project's starters, each place's, as the stages view carries them. */
  const startersOf = (projectId: string) =>
    Object.fromEntries(
      STARTER_PLACES.map((place) => [place, store.starters(projectId, place)])
    ) as Record<StarterPlace, ProjectStarter[]>;
  /** Who hears about changes (dispatch.ts); told after the change has landed. */
  const listeners = new Set<(event: TaskEvent) => void>();
  const emit = (event: TaskEvent): void => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn(
          `[tasks] a listener failed on ${event.kind} in ${event.projectId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  };
  /** Answers `result` once listeners have heard `event`. */
  const told = <T>(event: TaskEvent, result: T): T => {
    emit(event);
    return result;
  };

  /** A `runs_on` as written, refused when it names no capability and no machine the hub knows. */
  const runsOnChecked = (value: string): string => {
    const checked = runsOnValue(value, store.machines());
    return "value" in checked ? checked.value : refuse(400, checked.problem);
  };

  /** The project's attempts, by task, newest first. */
  const attemptsByTask = (projectId: string): Map<string, TaskAttempt[]> => {
    const byTask = new Map<string, TaskAttempt[]>();
    for (const item of store.attempts(projectId)) {
      if (item.taskId) {
        byTask.set(item.taskId, [
          ...(byTask.get(item.taskId) ?? []),
          attemptOf(item),
        ]);
      }
    }
    return byTask;
  };

  /** The tasks whose hook start waits for a slot. */
  const queuedIn = (projectId: string): Set<string> =>
    new Set(store.queuedStarts?.(projectId) ?? []);

  /**
   * What every task's flags are read against: the project's tasks as
   * indexed, their attempts, and the resolver's world (task-waits.ts), each
   * target settled once per read.
   */
  interface FlagContext {
    attempts: Map<string, TaskAttempt[]>;
    byId: Map<string, TaskIndexRow>;
    /** Each task's parts, by id. */
    partsOf: Map<string, string[]>;
    /** The tasks whose hook start waits for a slot. */
    queued: Set<string>;
    /** Each target settled once per read, by its handle. */
    settled: Map<string, WaitState>;
    stages: Stages | undefined;
    /** The tasks that wait on each task, by id. */
    waitersOf: Map<string, string[]>;
    world: WaitWorld;
  }

  /** The context a read's flags take, from the project's index as it is. */
  const contextOf = (
    projectId: string,
    rows: TaskIndexRow[],
    stages: Stages | undefined,
    gone: ReadonlySet<string>
  ): FlagContext => {
    const byId = rowsById(rows);
    const partsOf = new Map<string, string[]>();
    const waitersOf = new Map<string, string[]>();
    const add = (map: Map<string, string[]>, key: string, id: string) =>
      map.set(key, [...(map.get(key) ?? []), id]);
    for (const row of rows) {
      if (row.partOf) {
        add(partsOf, row.partOf, row.id);
      }
      for (const target of row.waitsOn) {
        if (taskTarget(target) === target) {
          add(waitersOf, target, row.id);
        }
      }
    }
    return {
      attempts: attemptsByTask(projectId),
      byId,
      partsOf,
      waitersOf,
      queued: queuedIn(projectId),
      settled: new Map(),
      stages,
      world: {
        projectId,
        ...store.waitWorld(projectId),
        gone: (id) => gone.has(id),
        task: (id) => {
          const row = byId.get(id);
          return row
            ? {
                title: row.title,
                stage: row.stage,
                kind: kindIn(stages, row.stage),
                duplicateOf: row.duplicateOf,
              }
            : undefined;
        },
      },
    };
  };

  /** A target settled, once per read. */
  const settleIn = (context: FlagContext, handle: string): WaitState => {
    const known = context.settled.get(handle);
    if (known) {
      return known;
    }
    const state = settledHandle(handle, context.world);
    context.settled.set(handle, state);
    return state;
  };

  /** A task's `part_of` ancestors, nearest first, a loop cut where it closes. */
  const chainOf = (
    context: FlagContext,
    task: { id: string; partOf: string | null }
  ): string[] => {
    const chain: string[] = [];
    const seen = new Set([task.id]);
    let at = task.partOf;
    while (at && !seen.has(at)) {
      chain.push(at);
      seen.add(at);
      at = context.byId.get(at)?.partOf ?? null;
    }
    return chain;
  };

  /** Every wait of a task, its own then its chain's, each target once, unsettled first. */
  const waitsIn = (
    context: FlagContext,
    task: { id: string; partOf: string | null; waitsOn: string[] }
  ): TaskWait[] => {
    const seen = new Set<string>();
    const waits: TaskWait[] = [];
    const take = (handles: readonly string[], via: string | null) => {
      for (const handle of handles) {
        if (!seen.has(handle)) {
          seen.add(handle);
          waits.push({ ...settleIn(context, handle), via });
        }
      }
    };
    take(task.waitsOn, null);
    for (const ancestor of chainOf(context, task)) {
      take(context.byId.get(ancestor)?.waitsOn ?? [], ancestor);
    }
    return unsettledFirst(waits);
  };

  /** The cards and pins a done attempt was dispatched on whose value moved since. */
  const builtOnOf = (
    context: FlagContext,
    attempt: TaskAttempt | undefined
  ): BuiltOn[] =>
    (attempt?.waitedOn ?? []).flatMap((witness) => {
      const now = settleIn(context, witness.target);
      if (now.value === witness.value) {
        return [];
      }
      return [
        {
          target: witness.target,
          label: now.label,
          href: now.href,
          since:
            now.value === null
              ? taskLinkWords.reopened
              : taskLinkWords.decidedDifferently,
        },
      ];
    });

  /** What a task's attempts and edges say, against the project's other tasks as indexed. */
  const flagsOf = (
    projectId: string,
    task: {
      hash: string;
      id: string;
      partOf: string | null;
      stage: string;
      waitsOn: string[];
    },
    context: FlagContext
  ): TaskFlags => {
    const attempts = context.attempts.get(task.id) ?? [];
    const [last] = attempts;
    const kind = kindIn(context.stages, task.stage);
    const open = kind !== "done" && kind !== "dropped";
    const waits = waitsIn(context, task);
    const liveAttempt = attempts.some((attempt) => isLive(attempt.state));
    const heldBy =
      chainOf(context, task).find((ancestor) =>
        (context.attempts.get(ancestor) ?? []).some((attempt) =>
          isLive(attempt.state)
        )
      ) ?? null;
    return {
      attempts,
      liveAttempt,
      waits,
      heldBy,
      ready:
        kind === "todo" &&
        waits.every((wait) => wait.settled) &&
        !liveAttempt &&
        heldBy === null,
      parts: context.partsOf.get(task.id) ?? [],
      unblocks: context.waitersOf.get(task.id) ?? [],
      builtOn:
        kind === "done"
          ? builtOnOf(
              context,
              attempts.find((attempt) => attempt.state === "done")
            )
          : [],
      lastAttemptFailed: last?.state === "failed" && open,
      lastAttemptStopped: last?.state === "cancelled" && open,
      queuedStart: context.queued.has(task.id),
      startProblem: store.startProblem?.(projectId, task) ?? null,
    };
  };
  /**
   * Whether a task file held an edit no commit has, as last asked: at a
   * commit, for the time the index saw its content. Either moving asks again.
   */
  const uncommittedSeen = new Map<
    string,
    { head: string; observed: number; uncommitted: boolean }
  >();

  /**
   * Each row's {@link TaskTimes}: from the folder's history (one read per
   * commit, folderFileTimes; its events read once per file's change,
   * task-history.ts), and the index's time for an edit the file holds past
   * its last commit. Only a row the index saw change after that commit can
   * hold one, so git is asked about the working copy only then, once per
   * commit and change. Also answers the tasks the history shows taken out of
   * tasks/.
   */
  const timesOf = async (
    projectId: string,
    rows: Pick<TaskIndexRow, "path" | "stage" | "updatedAt">[],
    stages: Stages | undefined
  ): Promise<{ gone: ReadonlySet<string>; times: Map<string, TaskTimes> }> => {
    const folder = await folderFileTimes(projectId, "tasks");
    const { head, times } = folder;
    const seen = (path: string, observed: number) => {
      const said = uncommittedSeen.get(`${projectId}\0${path}`);
      return said?.head === head && said.observed === observed
        ? said
        : undefined;
    };
    const later = rows.filter((row) => {
      const committed = times.get(row.path);
      return committed && row.updatedAt.getTime() > committed.updated;
    });
    if (later.some((row) => !seen(row.path, row.updatedAt.getTime()))) {
      const uncommitted = await folderUncommitted(projectId, "tasks");
      for (const row of later) {
        uncommittedSeen.set(`${projectId}\0${row.path}`, {
          head,
          observed: row.updatedAt.getTime(),
          uncommitted: uncommitted.has(row.path),
        });
      }
    }
    const recordOf = (row: (typeof rows)[number]): TaskTimes => {
      const observed = row.updatedAt.getTime();
      const committed = times.get(row.path);
      if (!committed) {
        return {
          createdAt: observed,
          createdBy: null,
          updatedAt: observed,
          updatedBy: null,
          ...lifeOf([], stages, null),
        };
      }
      const events = historyOf(committed);
      const uncommitted = seen(row.path, observed)?.uncommitted === true;
      return {
        createdAt: committed.created,
        createdBy: events[0]?.actor ?? null,
        updatedAt: uncommitted
          ? Math.max(committed.updated, observed)
          : committed.updated,
        updatedBy: uncommitted ? null : (events.at(-1)?.actor ?? null),
        ...lifeOf(events, stages, kindIn(stages, row.stage)),
      };
    };
    return {
      gone: goneTasks(folder),
      times: new Map(rows.map((row) => [row.path, recordOf(row)])),
    };
  };

  /** The highest task number each project has handed out, once read from its history. */
  const issued = new Map<string, number>();

  /** Whether the project starts attempts on its own: its dispatch and its Caw are on (dispatch.ts). */
  const dispatches = (projectId: string): boolean => {
    const project = store.project(projectId);
    return !!(project?.dispatch && project.caw);
  };

  /** Whether an attempt at the task is starting or running. */
  const liveAt = (projectId: string, id: string): boolean =>
    store
      .attempts(projectId)
      .some((item) => item.taskId === id && isLive(item.state));

  const known = (projectId: string): Tracker => {
    const project = store.project(projectId);
    if (!project) {
      return refuse(404, `The hub keeps no project ${projectId}.`);
    }
    return project.tracker;
  };

  /** Refuses a task write whose project was deleted since the change began. */
  const stands = (projectId: string): void => {
    if (!store.project(projectId)) {
      refuse(
        404,
        `The project "${projectId}" was deleted, so its tasks can't change. Pick another.`
      );
    }
  };

  const indexRow = (
    projectId: string,
    path: string,
    number: number,
    content: string,
    hash: string
  ): TaskIndexRow => {
    const doc = new TaskDoc(path, content);
    const parsed = doc.read();
    // Agreed to-dos only: an offered one counts once someone agrees to it.
    const todos = todoProgress(parsed.todos);
    return {
      projectId,
      path,
      id: taskId(number),
      number,
      title: parsed.title ?? doc.title(),
      stage: parsed.fields.stage ?? "",
      type: parsed.fields.type,
      waitsOn: parsed.fields.waitsOn,
      partOf: parsed.fields.partOf,
      foundIn: parsed.fields.foundIn,
      duplicateOf: parsed.fields.duplicateOf,
      rank: parsed.fields.rank,
      labels: parsed.fields.labels,
      outputs: parsed.fields.outputs,
      fields: doc.extraFields(),
      links: fileLinksOf(parsed.fields),
      todosDone: todos.done,
      todosTotal: todos.total,
      problem: parsed.problems.join(" ") || null,
      hash,
      updatedAt: new Date(),
    };
  };

  // --- a stage written into the file, not moved --------------------------------
  //
  // §5.2: a task changes stage only through a move (tasks.move, checked for
  // its mover; an approved action's through `actionMove`). A file edited to
  // another `stage:` (Caw's folder_write, the folder editor, a push to the
  // folder) never moves the task: the index keeps its stage, the file gets
  // that stage back with a note naming who edited it, and the move is never
  // made.
  //
  // A file the index has never seen is a new task. One the hub made (its
  // folder history holds the hub's own task-making commit: tasks.create, a
  // merge, an adoption) stands as written, so a rebuilt or merged index
  // leaves every task where it is. One written straight into the folder
  // starts where a plain create could start it: a stage startProblem
  // refuses (`by: action`, one that is not a stage, none) is adopted at the
  // first stage, with a note naming who wrote it.

  /** The indexed row, when `content` says another stage than it holds. */
  const strayStage = (
    row: TaskIndexRow | undefined,
    path: string,
    content: string
  ): TaskIndexRow | undefined => {
    if (!row?.stage) {
      return;
    }
    const written = new TaskDoc(path, content).read().fields.stage ?? "";
    return written === row.stage ? undefined : row;
  };

  // --- comments written into the file, not through task comments ------------
  //
  // A task's `## Comments` entries are written only by tasks.comment, each
  // one its own commit (history: `commented`). A write that reaches the file
  // another way (a hand edit, folder_write, a push) and changes, adds or
  // takes out an entry gets the hub's record back: the section as the
  // file's last commit by the hub's task code held it. Every such commit
  // either added one entry through a comment, or carried the entries as
  // they stood (a stray edit is put back before any change commits, below),
  // so that section is what the `commented` events wrote, and the entries a
  // merge brought in. Any other edit to the file stands.

  /**
   * A task file as the hub's task code last committed it (the last commit
   * in its history with a mover), read once per commit; undefined when no
   * such commit has it.
   */
  const hubRecord = async (
    projectId: string,
    path: string
  ): Promise<TaskDoc | undefined> => {
    const { times } = await folderFileTimes(projectId, "tasks");
    const entry = times.get(path);
    const made = entry
      ? historyOf(entry).findLast(
          (event) => event.actor.mover !== null && event.kind !== "deleted"
        )
      : undefined;
    const record = made
      ? await readFolderFileAt(projectId, made.commit, made.path)
      : undefined;
    return record === undefined ? undefined : new TaskDoc(path, record);
  };

  /**
   * The hub's record of a task file's comments, when the entries `content`
   * holds are not it: that record's section lines (undefined for none).
   */
  const strayComments = async (
    projectId: string,
    path: string,
    content: string,
    record?: TaskDoc
  ): Promise<{ lines: string[] | undefined } | undefined> => {
    const written = new TaskDoc(path, content).read().comments;
    const kept = record ?? (await hubRecord(projectId, path));
    return JSON.stringify(written) ===
      JSON.stringify(kept?.read().comments ?? [])
      ? undefined
      : { lines: kept?.commentsSection() };
  };

  /**
   * What an archived file needs put back before it comes out of the
   * archive: its stage and comments as the hub last committed them, where a
   * write around the hub changed either while it was archived (the index,
   * which keeps the board's, holds no row for it).
   */
  const archivedFix = async (
    projectId: string,
    path: string,
    content: string
  ): Promise<Unsettled | undefined> => {
    const record = await hubRecord(projectId, path);
    const kept = record?.read().fields.stage;
    const written = new TaskDoc(path, content).read().fields.stage;
    const comments = await strayComments(projectId, path, content, record);
    const stage = kept && kept !== written ? { stage: kept } : undefined;
    return comments || stage ? { comments, stage } : undefined;
  };

  /** What a file written around the hub needs put back; one of them at least. */
  interface Unsettled {
    /** The hub's record of its comments, when its entries are not that. */
    comments?: { lines: string[] | undefined };
    /** The stage it holds (the index's, or the hub's record of an archived file), when the file says another. */
    stage?: { stage: string };
    /** A new file written straight into a stage it may not start in: where it starts instead. */
    start?: { start: string; who: string; written: string };
  }

  /** What `content` (the file at `path`, indexed as `row`, if at all) needs put back; undefined when it may stand. */
  const unsettledOf = async (
    projectId: string,
    path: string,
    content: string,
    row: TaskIndexRow | undefined,
    stagesNow: () => Promise<Stages | undefined>
  ): Promise<Unsettled | undefined> => {
    const [start, comments] = await Promise.all([
      row ? undefined : strayStart(projectId, path, content, await stagesNow()),
      strayComments(projectId, path, content),
    ]);
    const stage = strayStage(row, path, content);
    return start || comments || stage ? { start, comments, stage } : undefined;
  };

  /**
   * What a task file read now needs put back: nothing for an archived file
   * (kept as it was), or one the index already holds as written (the hub's
   * own last write, so no git is asked).
   */
  const fixFor = async (
    projectId: string,
    path: string,
    content: string,
    rows: TaskIndexRow[] = store.index(projectId)
  ): Promise<Unsettled | undefined> => {
    const row = rows.find((each) => each.path === path);
    if (inArchive(path) || row?.hash === hashOf(content)) {
      return;
    }
    return await unsettledOf(projectId, path, content, row, () =>
      currentStages(projectId)
    );
  };

  /** `content` as it reads once settled, with no notes: what a read shows before the turn puts it back. */
  const settledView = (
    path: string,
    content: string,
    fix: Unsettled
  ): string => {
    const doc = new TaskDoc(path, content);
    const stage = fix.stage?.stage ?? fix.start?.start;
    if (stage) {
      doc.setField("stage", stage);
    }
    if (fix.comments) {
      doc.setCommentsSection(fix.comments.lines);
    }
    return doc.toString();
  };

  /**
   * `content` with what a write around the hub changed put back, and a note
   * on the task naming who wrote it (the file's last commit's author: Caw
   * for folder_write, you for the folder editor): the stage it holds, the
   * stage a new task starts in, and the hub's record of its comments.
   * Answers it, what was put back and why, for the commit.
   */
  const settledDoc = async (
    projectId: string,
    path: string,
    content: string,
    fix: Unsettled
  ): Promise<{
    moved: Did["stage"];
    restored: string;
    said: string;
    why: string;
  }> => {
    const doc = new TaskDoc(path, content);
    const who =
      fix.start?.who ??
      ((await folderHistory(projectId, path, 1).catch(() => undefined))
        ?.commits[0]?.author ||
        "someone");
    const at = new Date().toISOString().slice(0, 16).replace("T", " ");
    const said: string[] = [];
    const why: string[] = [];
    let moved: Did["stage"];
    if (fix.start) {
      const { start, written } = fix.start;
      doc.setField("stage", start);
      doc.addNote(
        `${at} UTC: ${who} wrote this task straight into stage ${written}; tasks start in ${start}.`
      );
      said.push(`adopt at ${start}, written by ${who} into stage ${written}`);
      why.push(`tasks start in ${start}`);
      moved = { from: written === NO_STAGE ? "" : written, to: start };
    } else if (fix.stage) {
      const written = doc.read().fields.stage || NO_STAGE;
      doc.setField("stage", fix.stage.stage);
      doc.addNote(
        `${at} UTC: stage changes go through task moves; ${who} edited the file to say stage ${written}, so it stays ${fix.stage.stage}.`
      );
      said.push(
        `stage ${written} written by ${who} put back to ${fix.stage.stage}`
      );
      why.push("stage changes go through task moves");
    }
    if (fix.comments) {
      doc.setCommentsSection(fix.comments.lines);
      doc.addNote(
        `${at} UTC: comments are added only as task comments; ${who} edited them in the file, so they are as the comments left them.`
      );
      said.push(`comments written by ${who} put back`);
      why.push("comments are added only as task comments");
    }
    return {
      restored: doc.toString(),
      said: said.join("; "),
      why: why.join("; "),
      moved,
    };
  };

  /**
   * Puts back what a write around the hub changed ({@link settledDoc}), as
   * one commit by the hub; then indexes it. Runs inside the project's turn.
   * Answers the restored content.
   */
  const settle = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    fix: Unsettled
  ): Promise<string> => {
    const id = taskId(number);
    const { restored, said, why, moved } = await settledDoc(
      projectId,
      path,
      content,
      fix
    );
    stands(projectId);
    const actor = hubActor(why);
    await writeFolderFile(projectId, path, restored, {
      author: actor.author,
      message: commitMessage(actor, `task ${id}`, said, {
        ...(moved ? { stage: moved } : {}),
        ...(fix.start ? { change: CHANGES.adopt } : {}),
      }),
    });
    store.put([indexRow(projectId, path, number, restored, hashOf(restored))]);
    console.info(`[tasks] ${projectId} ${id}: ${said}`);
    emit({ kind: "changed", projectId, id });
    return restored;
  };

  /**
   * A new task file the hub never made, whose stage a plain create by its
   * writer could not start a task in: who wrote it, the stage it says, and
   * the first stage it starts in instead. Nothing when the hub made it, it
   * may stand, or the project's stages do not read (nothing to judge by).
   */
  const strayStart = async (
    projectId: string,
    path: string,
    content: string,
    stages: Stages | undefined
  ): Promise<{ start: string; who: string; written: string } | undefined> => {
    if (!stages) {
      return;
    }
    const changes = (
      await folderFileTimes(projectId, "tasks").catch(() => undefined)
    )?.times.get(path)?.changes;
    if (
      !changes?.length ||
      changes.some(({ commit }) => hubFiled(commit.trailers))
    ) {
      return;
    }
    const who = changes[0]?.commit.author || "someone";
    const written = new TaskDoc(path, content).read().fields.stage ?? "";
    if (written && !startProblem(stages, written, moverOf(who))) {
      return;
    }
    return {
      who,
      written: written || "(none)",
      start: firstStage(stages).name,
    };
  };

  /** Files queued to settle, by project and path: one write is settled once however often it is read. */
  const settling = new Set<string>();

  /**
   * A read outside the project's turn found a file to settle (a stray stage
   * on a known task, a new task in a stage it may not start in, comments
   * written around the hub): it is settled in the turn (a change under way
   * finishes first), judged again there; the index does not take the file
   * as written meanwhile.
   */
  const queueSettle = (projectId: string, path: string, number: number) => {
    const key = `${projectId}\0${path}`;
    if (settling.has(key)) {
      return;
    }
    settling.add(key);
    detach(
      inTurn(projectId, async () => {
        try {
          const { content } = await readFolderFile(projectId, path);
          const row = store.index(projectId).find((each) => each.path === path);
          const fix = await unsettledOf(projectId, path, content, row, () =>
            currentStages(projectId)
          );
          if (fix) {
            await settle(projectId, path, number, content, fix);
          } else if (row?.hash !== hashOf(content)) {
            stands(projectId);
            store.put([
              indexRow(projectId, path, number, content, hashOf(content)),
            ]);
          }
        } finally {
          settling.delete(key);
        }
      }),
      `task ${path} settle`
    );
  };

  /**
   * Reads every task file and re-indexes the ones whose content changed since
   * the index last saw them; forgets rows whose files are gone. Answers the
   * index and what in tasks/ could not be listed.
   */
  const sync = async (
    projectId: string
  ): Promise<{ problems: string[]; rows: TaskIndexRow[] }> => {
    const problems: string[] = [];
    const listing = await listFolder(projectId, "tasks").catch(
      (error: unknown) => {
        if (error instanceof FolderRefusal && error.status === 404) {
          return { entries: [], truncated: false, path: "tasks" };
        }
        throw error;
      }
    );
    if (listing.truncated) {
      problems.push(
        "tasks/ holds more files than one listing reads; the ones past the cap are not listed."
      );
    }
    const indexed = new Map(
      store.index(projectId).map((row) => [row.path, row])
    );
    const files: { path: string; number: number }[] = [];
    for (const entry of listing.entries) {
      if (entry.kind !== "file" || !entry.path.endsWith(".md")) {
        continue;
      }
      const number = fileTaskNumber(entry.path);
      if (number === undefined) {
        problems.push(
          `${entry.path} is not named like a task (tsk-<number>-<slug>.md), so it is not listed.`
        );
      } else {
        files.push({ path: entry.path, number });
      }
    }
    // Read once, for every new file's start: a rebuilt index reads them all.
    let stages: Promise<Stages | undefined> | undefined;
    const stagesNow = () => {
      stages ??= currentStages(projectId);
      return stages;
    };
    const read = await Promise.all(
      files.map(async ({ path, number }) => {
        try {
          const { content } = await readFolderFile(projectId, path);
          const hash = hashOf(content);
          const row = indexed.get(path);
          if (row?.hash === hash) {
            return;
          }
          if (await unsettledOf(projectId, path, content, row, stagesNow)) {
            queueSettle(projectId, path, number);
            return;
          }
          return indexRow(projectId, path, number, content, hash);
        } catch (error) {
          if (error instanceof FolderRefusal) {
            problems.push(error.message);
            return;
          }
          throw error;
        }
      })
    );
    store.put(read.filter((row): row is TaskIndexRow => row !== undefined));
    const present = new Set(files.map((file) => file.path));
    store.drop(
      projectId,
      [...indexed.keys()].filter((path) => !present.has(path))
    );
    const rows = store.index(projectId);
    const claimed = new Map<string, string[]>();
    for (const row of rows) {
      claimed.set(row.id, [...(claimed.get(row.id) ?? []), row.path]);
    }
    for (const paths of claimed.values()) {
      if (paths.length > 1) {
        problems.push(
          `${paths.length} task files carry the same number: ${paths.join(", ")}. Rename all but one.`
        );
      }
    }
    return { rows, problems };
  };

  /** The archived files in tasks/archive/, by name; none while there is no archive. */
  const archivedNames = async (projectId: string): Promise<string[]> =>
    (await folderFileNames(projectId, ARCHIVE_DIR)).filter(
      (name) => fileTaskNumber(name) !== undefined
    );

  /** The archived file of task `number`, as the disk holds it; undefined when it is not archived. */
  const archivedFile = async (
    projectId: string,
    number: number
  ): Promise<string | undefined> => {
    const name = (await archivedNames(projectId)).find(
      (each) => fileTaskNumber(each) === number
    );
    return name ? `${ARCHIVE_DIR}/${name}` : undefined;
  };

  /**
   * The file a reference names, catching up the index when it does not know
   * it yet; an archived task's file in tasks/archive/ when the board has none,
   * which a change is refused. Two files claiming one id read as the first; a
   * change to it is refused until one is renamed.
   */
  const locate = async (
    projectId: string,
    ref: string,
    forChange = false
  ): Promise<{ path: string; number: number }> => {
    const number = taskNumber(ref);
    if (number === undefined) {
      return refuse(
        400,
        `“${ref}” is not a task id; tasks are named like tsk-12.`
      );
    }
    const find = (rows: TaskIndexRow[]) =>
      rows.filter((row) => row.number === number);
    let claims = find(store.index(projectId));
    if (claims.length === 0) {
      claims = find((await sync(projectId)).rows);
    }
    const [first] = claims;
    if (!first) {
      const archived = await archivedFile(projectId, number);
      if (archived && forChange) {
        refuse(
          409,
          `${taskId(number)} is archived (${archived}), so it does not change; it is kept as it was.`
        );
      }
      return archived
        ? { path: archived, number }
        : refuse(404, `The project has no task ${taskId(number)}.`);
    }
    if (forChange && claims.length > 1) {
      refuse(
        409,
        `${taskId(number)} is claimed by ${claims.length} files (${claims.map((row) => row.path).join(", ")}); rename all but one before changing it.`
      );
    }
    return { path: first.path, number };
  };

  /**
   * The archived tasks' rows, read from their files in tasks/archive/ as the
   * index would hold them; kept out of the index, which is the board's.
   */
  const archivedRows = async (projectId: string): Promise<TaskIndexRow[]> => {
    const read = await Promise.all(
      (await archivedNames(projectId)).map(async (name) => {
        const path = `${ARCHIVE_DIR}/${name}`;
        const { content } = await readFolderFile(projectId, path);
        return indexRow(
          projectId,
          path,
          fileTaskNumber(name) as number,
          content,
          hashOf(content)
        );
      })
    );
    return read;
  };

  /** The tasks whose id, title or description holds `q`, case aside; descriptions read from the files. */
  const saying = async (
    projectId: string,
    tasks: TaskSummary[],
    q: string
  ): Promise<TaskSummary[]> => {
    const words = q.trim().toLowerCase();
    const kept = await Promise.all(
      tasks.map(async (task) => {
        if (
          task.id.includes(words) ||
          task.title.toLowerCase().includes(words)
        ) {
          return true;
        }
        const { content } = await readFolderFile(projectId, task.path).catch(
          () => ({ content: "" })
        );
        return new TaskDoc(task.path, content)
          .read()
          .description.toLowerCase()
          .includes(words);
      })
    );
    return tasks.filter((_, index) => kept[index]);
  };

  /** Every task id the project's index knows, for edge checks. */
  const ids = async (projectId: string): Promise<Set<string>> =>
    new Set((await sync(projectId)).rows.map((row) => row.id));

  /** Edges as `tsk-…`, each one a task the project has. */
  const targets = async (
    projectId: string,
    edge: string,
    refs: string[],
    self?: string
  ): Promise<string[]> => {
    if (refs.length === 0) {
      return [];
    }
    const have = await ids(projectId);
    return [
      ...new Set(
        refs.map((ref) => {
          const number = taskNumber(ref);
          if (number === undefined) {
            return refuse(
              400,
              `${edge}: “${ref}” is not a task id; tasks are named like tsk-12.`
            );
          }
          const id = taskId(number);
          if (id === self) {
            return refuse(400, `${self} cannot be ${edge} itself.`);
          }
          if (!have.has(id)) {
            return refuse(404, `${edge}: the project has no task ${id}.`);
          }
          return id;
        })
      ),
    ];
  };

  const single = async (
    projectId: string,
    edge: string,
    ref: string | undefined
  ): Promise<string | null> =>
    ref ? ((await targets(projectId, edge, [ref]))[0] ?? null) : null;

  /**
   * Waits as `actor` writes them (task-waits.ts `readWait`), as a file keeps
   * them: a task the project has on its board or in its archive, or a card,
   * a pin, a pull request, a run or a session the reader settles. Refused,
   * in the reader's words, when one names nothing that exists.
   */
  const waitsFor = async (
    projectId: string,
    actor: TaskActor,
    written: string[]
  ): Promise<string[]> => {
    if (written.length === 0) {
      return [];
    }
    const reader = store.waitReader(projectId, actor);
    const have = await ids(projectId);
    const archived = new Set(
      (await archivedNames(projectId)).map((name) =>
        taskId(fileTaskNumber(name) as number)
      )
    );
    return [
      ...new Set(
        items("waits_on", written).map((one) => {
          let target: WaitTarget;
          try {
            target = readWait(one, reader);
          } catch (error) {
            if (error instanceof WaitRefusal) {
              return refuse(400, `waits_on: ${error.message}`);
            }
            throw error;
          }
          if (
            target.kind === "task" &&
            !(have.has(target.id) || archived.has(target.id))
          ) {
            return refuse(
              404,
              `waits_on: the project has no task ${target.id}.`
            );
          }
          return waitHandle(target);
        })
      ),
    ];
  };

  /**
   * What a task depends on to close, as readiness reads it: the tasks it
   * waits on, the tasks its `part_of` chain waits on, and its parts. A
   * write is checked over it with its own change applied (`changed`).
   */
  const dependsOn = (
    rows: TaskIndexRow[],
    changed: Map<string, { partOf: string | null; waitsOn: string[] }>
  ): ((id: string) => string[]) => {
    const byId = rowsById(rows);
    const of = (at: string) => changed.get(at) ?? byId.get(at);
    return (id: string): string[] => {
      const parts = rows
        .map((row) => ({ id: row.id, ...(changed.get(row.id) ?? row) }))
        .filter((row) => row.partOf === id)
        .map((row) => row.id);
      const chain: string[] = [];
      const seen = new Set([id]);
      for (let at = of(id)?.partOf ?? null; at && !seen.has(at);) {
        chain.push(at);
        seen.add(at);
        at = of(at)?.partOf ?? null;
      }
      return [
        ...new Set([
          ...[id, ...chain].flatMap((at) =>
            (of(at)?.waitsOn ?? []).filter(
              (target) => taskTarget(target) === target
            )
          ),
          ...parts,
        ]),
      ];
    };
  };

  /**
   * Refuses a write to task `id` that would close a cycle of waits or parts
   * (`changed`, its fields as they would stand), naming the path by each
   * task's link; nothing changes.
   */
  const refuseCycle = (
    projectId: string,
    id: string,
    changed: { partOf: string | null; waitsOn: string[] }
  ): void => {
    const rows = store.index(projectId);
    const cycle = cycleFrom(id, dependsOn(rows, new Map([[id, changed]])));
    if (cycle) {
      const byId = rowsById(rows);
      const path = cycle
        .map((at) => taskLink(projectId, at, byId.get(at)?.title ?? at))
        .join(" → ");
      refuse(409, taskLinkWords.cycle(path));
    }
  };

  /**
   * Where a new task was found, as the hub hands it (the filer's running
   * task, or the pin thread its ask came from): a task the project has, or
   * a pin; nothing when it names neither.
   */
  const foundInOf = async (
    projectId: string,
    given: string | undefined
  ): Promise<string | null> => {
    const target = given ? waitTarget(given) : undefined;
    if (target?.kind === "pin") {
      return waitHandle(target);
    }
    return target?.kind === "task" && (await ids(projectId)).has(target.id)
      ? target.id
      : null;
  };

  /** Where a new task starts: the stage asked for, if the actor may put it there, else the first todo stage. */
  const startStage = async (
    projectId: string,
    asked: string | undefined,
    actor: TaskActor
  ): Promise<string> => {
    const stages = await usableStages(
      projectId,
      "tell where a new task starts"
    );
    const stage =
      asked === undefined ? firstStage(stages).name : stageName(asked);
    if (actor.mover === "action") {
      refuse(403, "An approved action moves its task; it never files one.");
    }
    const problem =
      actor.mover === "hub"
        ? hubProblem(stages, stage)
        : startProblem(stages, stage, actor.mover);
    if (problem) {
      refuse(stageNamed(stages, stage) ? 403 : 400, problem);
    }
    refuseNobody(projectId, stages, "A new task", "", stage, actor);
    return stage;
  };

  /**
   * One past the highest number anything holds now: a file in tasks/ or
   * tasks/archive/ as the disk has it (committed or not, read with no git), any path the
   * folder's history ever named (read once per commit, folderFileTimes), the
   * index, and what this process handed out; and past `above`. Read at the
   * moment of making a task, inside the project's turn.
   */
  const nextNumber = async (projectId: string, above = 0): Promise<number> => {
    const [{ ever }, names, archived] = await Promise.all([
      folderFileTimes(projectId, "tasks"),
      folderFileNames(projectId, "tasks"),
      archivedNames(projectId),
    ]);
    let highest = Math.max(above, issued.get(projectId) ?? 0);
    for (const name of [...ever, ...names, ...archived]) {
      highest = Math.max(highest, fileTaskNumber(name) ?? 0);
    }
    for (const row of store.index(projectId)) {
      highest = Math.max(highest, row.number);
    }
    issued.set(projectId, highest + 1);
    return highest + 1;
  };

  /**
   * A reading with the project's Review before done applied: the one place
   * the rules the hub checks moves against are made (stages.ts `ruledStages`).
   */
  const ruled = (projectId: string, reading: StagesReading): StagesReading =>
    reading.ok
      ? {
          ok: true,
          stages: ruledStages(
            reading.stages,
            store.project(projectId)?.review ?? false
          ),
        }
      : reading;

  /**
   * The project's stages as the hub applies them: stages.md as it reads, or
   * the code template while the project has none, with its Review before
   * done on top.
   */
  const stagesOf = async (
    projectId: string
  ): Promise<{
    content: string;
    reading: StagesReading;
    source: "file" | "template";
  }> => {
    try {
      const { content } = await readFolderFile(projectId, STAGES_FILE);
      return {
        source: "file",
        content,
        reading: ruled(projectId, readStages(content)),
      };
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return {
          source: "template",
          content: templateText(DEFAULT_TEMPLATE),
          reading: ruled(projectId, {
            ok: true,
            stages: templateStages(DEFAULT_TEMPLATE),
          }),
        };
      }
      throw error;
    }
  };

  /**
   * A stages.md that is the code template, now or as it was before review
   * was a project's choice, goes: the project reads the hub's code template,
   * so it follows the template and its Review before done. A project's own
   * stages stay.
   */
  const dropTemplateCopy = async (projectId: string): Promise<void> => {
    let content: string;
    try {
      ({ content } = await readFolderFile(projectId, STAGES_FILE));
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return;
      }
      throw error;
    }
    if (!isCodeTemplate(content)) {
      return;
    }
    await deleteFolderFile(projectId, STAGES_FILE, {
      message:
        "stages: the code template, as the hub has it; Review before done is the project's own setting",
    });
    console.info(
      `[tasks] project ${projectId}'s stages.md was the code template word for word; it reads the hub's code template now.`
    );
  };

  /**
   * A type the project's stages run, or its template's skills file tasks
   * with, that resolves to nothing (no file of its own, no fleet type) and
   * that a template defines is written, as applying that template writes
   * it: a project made before templates wrote their types, or whose
   * stages.md was written by hand or by Caw, can start every stage and every
   * task its skills file. A file of its own, readable or not, stays as it is.
   */
  const fillTypes = async (projectId: string): Promise<void> => {
    const { reading } = await stagesOf(projectId);
    if (!reading.ok) {
      return;
    }
    const wanted = new Set([
      ...runsOf(reading.stages),
      ...skillTypes(store.project(projectId)?.template ?? null),
    ]);
    const unresolved = [...wanted].filter(
      (type) => !store.resolvesType(projectId, type)
    );
    const writes = await missingTypes(projectId, unresolved);
    if (writes.length === 0) {
      return;
    }
    const names = writes.map((write) => write.path).join(", ");
    await writeFolderFiles(projectId, writes, {
      author: { name: AUTHOR.hub },
      message: `delegates: ${names}, which its stages run or its template's skills file tasks with, and nothing defined (by hub)`,
    });
    console.info(
      `[tasks] project ${projectId}: wrote ${names}, which its stages run or its template's skills file tasks with, and nothing defined.`
    );
  };

  /** {@link fillTypes} in the project's turn; a failure is said, never thrown. */
  const fillTypesSoon = (projectId: string): void => {
    detach(
      inTurn(projectId, () => fillTypes(projectId)).catch((error: unknown) =>
        console.warn(
          `[tasks] project ${projectId}'s delegate types were not filled: ${error instanceof Error ? error.message : String(error)}`
        )
      ),
      "fill a project's delegate types"
    );
  };

  /** The project's stages; undefined while stages.md does not read. */
  const currentStages = async (
    projectId: string
  ): Promise<Stages | undefined> => {
    const { reading } = await stagesOf(projectId);
    return reading.ok ? reading.stages : undefined;
  };

  /** The project's stages, or a refusal saying what in stages.md keeps the hub from `doing`. */
  const usableStages = async (
    projectId: string,
    doing: string
  ): Promise<Stages> => {
    const { reading } = await stagesOf(projectId);
    if (!reading.ok) {
      return refuse(
        409,
        `stages.md does not read, so the hub cannot ${doing}. ${reading.problems.join(" ")} Fix it, or apply a template.`
      );
    }
    return reading.stages;
  };

  const view = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    stages: Stages | undefined
  ): Promise<TaskView> => {
    const doc = new TaskDoc(path, content);
    const parsed = doc.read();
    const hash = hashOf(content);
    const rows = store.index(projectId);
    const observed =
      rows.find((row) => row.path === path)?.updatedAt ?? new Date();
    const stage = parsed.fields.stage ?? "";
    const { gone, times } = await timesOf(
      projectId,
      [{ path, stage, updatedAt: observed }],
      stages
    );
    const context = contextOf(projectId, rows, stages, gone);
    const foundAt = parsed.fields.foundIn
      ? settleIn(context, parsed.fields.foundIn)
      : null;
    const flags = flagsOf(
      projectId,
      {
        id: taskId(number),
        waitsOn: parsed.fields.waitsOn,
        partOf: parsed.fields.partOf,
        stage,
        hash,
      },
      context
    );
    return viewOf(
      path,
      number,
      parsed,
      doc.title(),
      hash,
      stages,
      {
        ...flags,
        foundInNamed: foundAt && { label: foundAt.label, href: foundAt.href },
        sendBack:
          (stages &&
            sendBackOf(stages, stage, {
              live: flags.liveAttempt,
              dispatches: dispatches(projectId),
            })) ??
          null,
      },
      times.get(path) as TaskTimes,
      resultOf(
        store
          .attempts(projectId)
          .filter((item) => item.taskId === taskId(number))
      ),
      store.links(projectId, taskId(number)),
      store.carried(projectId, taskId(number))
    );
  };

  /**
   * Writes a task file through the folder (one commit) and re-indexes it.
   * `fresh`: a new task, written only while no file claims its number
   * (FolderTaken otherwise).
   */
  const save = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    actor: TaskActor,
    message: string,
    fresh = false
  ): Promise<TaskView> => {
    // A project deleted since the change began takes no task: before its
    // folder is written, and again in the step that indexes the task.
    stands(projectId);
    await writeFolderFile(projectId, path, content, {
      author: actor.author,
      message,
      ...(fresh ? { exclusive: sameNumber } : {}),
    });
    stands(projectId);
    store.put([indexRow(projectId, path, number, content, hashOf(content))]);
    return view(
      projectId,
      path,
      number,
      content,
      await currentStages(projectId)
    );
  };

  /**
   * One try at taking in another project's task files (`adopt`): each under
   * the next free number, edges and promoted to-dos renamed to match, all
   * written in one commit only where no file holds their places
   * (FolderTaken otherwise, with none of them left written). Inside the
   * project's turn. Answers each old id → its new id.
   */
  const adoptOnce = async (
    projectId: string,
    numbered: { file: { content: string; path: string }; was: number }[],
    actor: TaskActor,
    from: string
  ): Promise<Map<string, string>> => {
    const renames = new Map<string, string>();
    const numbers: number[] = [];
    for (const { was } of numbered) {
      const number = await nextNumber(projectId);
      renames.set(taskId(was), taskId(number));
      numbers.push(number);
    }
    const renamed = (ref: string, was: string): string[] => {
      const now = renames.get(ref);
      if (!now) {
        console.warn(
          `[tasks] ${was} from ${from} named ${ref}, which did not come with it; the edge is dropped.`
        );
      }
      return now ? [now] : [];
    };
    const written = numbered.map(({ file, was }, index) => {
      const number = numbers[index] as number;
      const old = taskId(was);
      const doc = new TaskDoc(file.path, file.content);
      const { fields } = doc.read();
      // A task target is renamed; a card, a pin, a pull request, a run or a
      // session is the same wherever the task lives.
      const target = (ref: string): string[] =>
        taskTarget(ref) === ref ? renamed(ref, old) : [ref];
      doc.setField("waits_on", fields.waitsOn.flatMap(target));
      doc.setField(
        "part_of",
        fields.partOf ? (renamed(fields.partOf, old)[0] ?? null) : null
      );
      doc.setField(
        "found_in",
        fields.foundIn ? (target(fields.foundIn)[0] ?? null) : null
      );
      // A to-do promoted to a task names it `→ #<n>`.
      const content = doc
        .toString()
        .replace(PROMOTED_TODO, (line, head: string, n: string) => {
          const now = renames.get(taskId(Number(n)));
          return now ? `${head}${taskNumber(now)}` : line;
        });
      // An archived task stays archived, under its new number.
      const path = taskPath(number, doc.title());
      return {
        path: inArchive(file.path) ? archivePath(path) : path,
        number,
        content,
      };
    });
    // All of them in one commit, or none: a merge never half-lands.
    stands(projectId);
    await writeFolderFiles(
      projectId,
      written.map(({ path, content }) => ({ path, content })),
      {
        author: actor.author,
        message: commitMessage(
          actor,
          `tasks ${written.map((each) => taskId(each.number)).join(", ")}`,
          `${from}'s ${written.length === 1 ? "task" : "tasks"}, merged in`,
          { change: CHANGES.merge }
        ),
        exclusive: sameNumber,
      }
    );
    stands(projectId);
    // The index is the board's: archived files stay out of it.
    store.put(
      written
        .filter(({ path }) => !inArchive(path))
        .map(({ path, number, content }) =>
          indexRow(projectId, path, number, content, hashOf(content))
        )
    );
    return renames;
  };

  /**
   * Files a new task under the next free number, its file made by `make`
   * for that number. A file that claims the number between the read and the
   * write (an agent writing tasks/ straight) sends it on to the next one.
   * Inside the project's turn.
   */
  const fileNew = async (
    projectId: string,
    actor: TaskActor,
    make: (number: number) => { content: string; message: string; path: string }
  ): Promise<TaskView> => {
    let number = await nextNumber(projectId);
    for (let tries = 1; ; tries += 1) {
      const { path, content, message } = make(number);
      try {
        return await save(
          projectId,
          path,
          number,
          content,
          actor,
          message,
          true
        );
      } catch (error) {
        if (!(error instanceof FolderTaken) || tries >= CLAIM_TRIES) {
          throw error;
        }
        console.info(
          `[tasks] ${projectId} ${taskId(number)} was claimed by a file in tasks/ as it was made; taking the next number`
        );
        number = await nextNumber(projectId, number);
      }
    }
  };

  /**
   * Reads a task's file, lets `apply` change it, and writes it back when it
   * changed. `apply` answers what it did (its words, or with the stage move
   * and reason it made), for the commit message.
   */
  const change = (
    projectId: string,
    ref: string,
    actor: TaskActor,
    apply: (doc: TaskDoc, id: string) => Promise<string | Did> | string | Did
  ): Promise<TaskView> =>
    inTurn(projectId, () => amend(projectId, ref, actor, apply));

  /** {@link change} inside the project's turn, already taken: a write that changes other tasks with its own. */
  const amend = async (
    projectId: string,
    ref: string,
    actor: TaskActor,
    apply: (doc: TaskDoc, id: string) => Promise<string | Did> | string | Did
  ): Promise<TaskView> => {
    known(projectId);
    const { path, number } = await locate(projectId, ref, true);
    const id = taskId(number);
    const read = (await readFolderFile(projectId, path)).content;
    // A stage or comments written into the file are put back before any
    // change reads it, so no commit of the hub's carries them on.
    const fix = await fixFor(projectId, path, read);
    const content = fix
      ? await settle(projectId, path, number, read, fix)
      : read;
    const doc = new TaskDoc(path, content);
    const applied = await apply(doc, id);
    const { what, ...did } =
      typeof applied === "string" ? { what: applied } : applied;
    const next = doc.toString();
    if (next === content) {
      return view(
        projectId,
        path,
        number,
        content,
        await currentStages(projectId)
      );
    }
    return await save(
      projectId,
      path,
      number,
      next,
      actor,
      commitMessage(actor, `task ${id}`, what, did)
    );
  };

  /** Refuses a move into `to` with its problem, when it has one. */
  const refuseMove = (
    stages: Stages,
    to: string,
    problem: string | undefined
  ): void => {
    if (problem) {
      refuse(stageNamed(stages, to) ? 403 : 400, problem);
    }
  };

  /**
   * Refuses a move into an active stage, or a new task filed there (`from`
   * ""), with nothing to work on it there (stages.ts `nobodyProblem`):
   * something must, its live attempt, the
   * stage's `runs:`, or the project's dispatch, which starts one
   * (dispatch.ts `hooked`). A tracker's move is a person's work elsewhere;
   * the hub's own moves are its attempts'.
   */
  const refuseNobody = (
    projectId: string,
    stages: Stages,
    id: string,
    from: string,
    to: string,
    actor: TaskActor
  ): void => {
    if (actor.mover === "hub" || actor.tracker !== undefined) {
      return;
    }
    const nobody = nobodyProblem(stages, id, from, to, {
      live: liveAt(projectId, id),
      dispatches: dispatches(projectId),
    });
    if (nobody) {
      refuse(409, nobody);
    }
  };

  /**
   * Puts a task in stage `to`, checked against the moves for the actor's
   * mover (the hub's own moves only need the stage to be one it may enter;
   * an approved action's, its done action). Answers the move, or nothing
   * when the task is in `to` already.
   */
  const moveTo = (
    projectId: string,
    doc: TaskDoc,
    id: string,
    stages: Stages,
    to: string,
    actor: TaskActor,
    /** A close as a duplicate: any filer may make it, so the stage is checked as the hub's own moves are. */
    asClose = false
  ): { from: string; to: string } | undefined => {
    const from = doc.read().fields.stage ?? "";
    if (from === to) {
      return;
    }
    if (
      actor.mover === "action" &&
      !(actor.actionId && store.actionMove?.(projectId, id, to, actor.actionId))
    ) {
      refuse(
        403,
        `This task cannot go to ${to} as an approved action: only an action the owner approved, once its call is done, moves its own task to the stage it named.`
      );
    }
    refuseMove(
      stages,
      to,
      actor.mover === "hub" || asClose
        ? hubProblem(stages, to)
        : moveProblem(stages, id, from, to, actor.mover)
    );
    refuseNobody(projectId, stages, id, from, to, actor);
    // The lead reviews, never the doer: a task whose only changes are
    // Caw's own closes or passes review on your move, or once you approved
    // them (lead-gate.ts `reviewProblem`).
    if (actor.mover !== "you" && passesReview(stages, from, to)) {
      const held = store.leadReview?.(projectId, id);
      if (held) {
        refuse(403, held);
      }
    }
    doc.setField("stage", to);
    return { from, to };
  };

  /**
   * Closes task `id` (its file `doc`) as a duplicate of `survivor`: links it
   * `duplicate_of`, moves it to the project's first stage of kind dropped
   * with the reason "duplicate" (any filer may: a close keeps the record,
   * so the stage is checked as the hub's own moves are), and answers the
   * move. A task in a dropped stage already stays where it is. Refused when
   * `survivor` is a duplicate of it, or the project has no dropped stage.
   */
  const markDuplicate = async (
    projectId: string,
    doc: TaskDoc,
    id: string,
    survivor: string,
    actor: TaskActor
  ): Promise<Did> => {
    const byId = rowsById(store.index(projectId));
    for (
      let at: string | null = survivor, seen = 0;
      at && seen < byId.size;
      at = byId.get(at)?.duplicateOf ?? null, seen += 1
    ) {
      if (at === id) {
        refuse(
          409,
          `${taskLink(projectId, survivor, byId.get(survivor)?.title ?? survivor)} is already a duplicate of this task, so this task cannot be a duplicate of it. Nothing changed.`
        );
      }
    }
    doc.setField("duplicate_of", survivor);
    const phrase = `${EDGE_PHRASE.duplicate_of} ${survivor}`;
    const stages = await usableStages(projectId, "close a duplicate");
    const dropped = stages.stages.find((each) => each.kind === "dropped");
    if (!dropped) {
      return refuse(
        409,
        "The project has no stage of kind dropped, so this task cannot be closed as a duplicate. Add one to stages.md."
      );
    }
    if (kindIn(stages, doc.read().fields.stage ?? "") === "dropped") {
      return { what: phrase };
    }
    const stage = moveTo(projectId, doc, id, stages, dropped.name, actor, true);
    return stage
      ? {
          what: `${phrase}; stage ${stage.from || NO_STAGE} → ${stage.to}`,
          stage,
          reason: "duplicate",
        }
      : { what: phrase };
  };

  /**
   * Every wait on task `from` moved to `to` (a duplicate closed, its waits
   * on its survivor; `to` null, a dropped task taken out of them), as the
   * hub, each waiter's file one commit. Inside the project's turn. Answers
   * the tasks whose waits moved.
   */
  const repoint = async (
    projectId: string,
    from: string,
    to: string | null,
    why: string
  ): Promise<string[]> => {
    const waiters = store
      .index(projectId)
      .filter((row) => row.waitsOn.includes(from) && row.id !== from);
    const moved: string[] = [];
    for (const waiter of waiters) {
      await amend(projectId, waiter.id, hubActor(why), (doc, id) => {
        const kept = doc.read().fields.waitsOn;
        doc.setField("waits_on", [
          ...new Set(
            kept.flatMap((target) => {
              if (target !== from) {
                return [target];
              }
              return to && to !== id ? [to] : [];
            })
          ),
        ]);
        return to && to !== id
          ? `waits on ${to}, not ${from}`
          : `no longer waits on ${from}`;
      });
      moved.push(waiter.id);
    }
    return moved;
  };

  /** Moves a task's file to tasks/archive/ (what a write around the hub left settled first). Inside the turn. */
  const archiveFile = async (
    projectId: string,
    ref: string,
    actor: TaskActor
  ): Promise<TaskView> => {
    const { path, number } = await locate(projectId, ref, true);
    const id = taskId(number);
    if (
      attemptsByTask(projectId)
        .get(id)
        ?.some((attempt) => isLive(attempt.state))
    ) {
      refuse(
        409,
        `An attempt at ${id} is live; stop it before archiving the task.`
      );
    }
    const read = (await readFolderFile(projectId, path)).content;
    const fix = await fixFor(projectId, path, read);
    if (fix) {
      await settle(projectId, path, number, read, fix);
    }
    const to = archivePath(path);
    stands(projectId);
    await moveFolderFile(projectId, path, to, {
      author: actor.author,
      message: commitMessage(actor, `task ${id}`, "archive"),
    });
    store.drop(projectId, [path]);
    const { content } = await readFolderFile(projectId, to);
    return view(projectId, to, number, content, await currentStages(projectId));
  };

  /**
   * Moves an archived task's file back to tasks/ and indexes it, in one
   * commit that also puts back what a write around the hub changed in it
   * while it was archived (its stage, its comments: {@link archivedFix}), so
   * none of it is carried onto the board. Inside the turn.
   */
  const unarchiveFile = async (
    projectId: string,
    ref: string,
    actor: TaskActor
  ): Promise<TaskView> => {
    const id = taskRef("task", ref);
    const number = taskNumber(id) as number;
    const board = (await sync(projectId)).rows.find(
      (row) => row.number === number
    );
    if (board) {
      refuse(409, `It is on the board (${board.path}), not archived.`);
    }
    const from = await archivedFile(projectId, number);
    if (!from) {
      return refuse(404, "It is not archived.");
    }
    const to = `tasks/${from.slice(ARCHIVE_DIR.length + 1)}`;
    const read = (await readFolderFile(projectId, from)).content;
    const fix = await archivedFix(projectId, from, read);
    const settled = fix
      ? await settledDoc(projectId, from, read, fix)
      : undefined;
    stands(projectId);
    await moveFolderFile(projectId, from, to, {
      author: actor.author,
      message: commitMessage(
        actor,
        `task ${id}`,
        `unarchive${settled ? `; ${settled.said}` : ""}`,
        settled ? { reason: settled.why } : {}
      ),
      ...(settled ? { content: settled.restored } : {}),
    });
    const { content } = await readFolderFile(projectId, to);
    stands(projectId);
    store.put([indexRow(projectId, to, number, content, hashOf(content))]);
    return view(projectId, to, number, content, await currentStages(projectId));
  };

  /** A move's reason as given: one line, or nothing. */
  const reasonOf = (reason: string | undefined): string | undefined =>
    reason?.trim() ? oneLine("reason", reason, REASON_LIMIT) : undefined;

  /**
   * Each comment being written now, by the id its device chose: the same
   * comment again meanwhile (a device sending it again after its answer was
   * lost) is answered by the first one's commit, never written twice.
   */
  const commenting = new Map<string, Promise<TaskView>>();

  /** One task, its file read and parsed; the index catches up if the file moved. */
  const readTask = async (
    projectId: string,
    ref: string
  ): Promise<TaskView> => {
    known(projectId);
    // The index caught up first, as a list does: the other tasks this one's
    // edges name read as their files are now.
    const { rows } = await sync(projectId);
    const { path, number } = await locate(projectId, ref);
    const { content } = await readFolderFile(projectId, path);
    const fix = await fixFor(projectId, path, content, rows);
    if (fix) {
      // Shown as it will be settled; the file gets it back in its turn.
      queueSettle(projectId, path, number);
    }
    return view(
      projectId,
      path,
      number,
      fix ? settledView(path, content, fix) : content,
      await currentStages(projectId)
    );
  };

  /** A comment's entry, its commit, and who hears of it ({@link comment}); `via`, one carried from an outside source. */
  const writeComment = (
    projectId: string,
    ref: string,
    text: string,
    actor: TaskActor,
    via?: ExternalComment
  ): Promise<TaskView> => {
    const written = commentText(text);
    return change(projectId, ref, actor, (doc) => {
      doc.addComment(
        {
          name: via ? via.author.login : actor.author.name,
          mover: actor.mover,
          id: actor.instanceId ?? actor.actionId ?? actor.routineId ?? null,
        },
        via ? new Date(via.at) : new Date(),
        written,
        via ?? null
      );
      return {
        what: via
          ? `comment by ${via.author.login} on ${externalItemWords.source[via.source]} “${commentGist(written)}”`
          : `comment “${commentGist(written)}”`,
        change: COMMENT_CHANGE,
      };
    }).then((task) =>
      told(
        {
          kind: "changed",
          projectId,
          id: task.id,
          comment: { actor, text: written },
        },
        task
      )
    );
  };

  /** The project's tasks from the index, caught up with the files first. */
  const listTasks = async (
    projectId: string,
    filter: TaskFilter = {}
  ): Promise<TaskList> => {
    const tracker = known(projectId);
    const partOf = filter.partOf ? taskRef("part_of", filter.partOf) : null;
    const linking = filter.link?.trim()
      ? store.linked(projectId, filter.link.trim())
      : undefined;
    const linked =
      typeof linking === "string"
        ? refuse(400, linking)
        : linking && new Set(linking);
    const [{ rows: board, problems }, { reading }] = await Promise.all([
      sync(projectId),
      stagesOf(projectId),
    ]);
    const rows = filter.archived ? await archivedRows(projectId) : board;
    const stages = reading.ok ? reading.stages : undefined;
    const { gone, times } = await timesOf(projectId, rows, stages);
    const context = contextOf(projectId, board, stages, gone);
    const kept = rows
      .map((row) =>
        summaryOf(
          row,
          stages,
          flagsOf(projectId, row, context),
          times.get(row.path) as TaskTimes
        )
      )
      .filter(
        (task) =>
          holds(task, filter, partOf) && (!linked || linked.has(task.id))
      );
    const tasks = (
      filter.q?.trim() ? await saying(projectId, kept, filter.q) : kept
    ).sort(byRank);
    return {
      tracker,
      tasks,
      problems,
      stagesProblems: reading.ok ? [] : reading.problems,
    };
  };

  /** A task by its link, labelled by its title: what a message names it by. */
  const linked = (projectId: string, task: { id: string; title: string }) =>
    taskLink(projectId, task.id, task.title);

  /** Its live attempt's session, if it has one. */
  const liveSession = (task: TaskSummary): string | undefined =>
    task.attempts.find((attempt) => isLive(attempt.state))?.instanceId;

  /**
   * What closing task `id` (moved to a done or dropped stage) does around
   * it, once its move has landed: a plain drop is taken out of every wait
   * on it; a part done closes its whole once every part is done and no
   * coordinator of it is live; every live session whose task waited on it
   * hears once what changed; and the answer names what became ready and
   * what still waits.
   */
  const afterClose = async (
    projectId: string,
    id: string
  ): Promise<Closing> => {
    const before = await listTasks(projectId);
    const closed = before.tasks.find((task) => task.id === id);
    if (!closed) {
      return {
        nowReady: [],
        stillWaiting: [],
        unwaited: [],
        wholeClosed: null,
      };
    }
    const waiting = before.tasks.filter((task) =>
      task.waits.some((wait) => wait.target === id)
    );
    const dropped = closed.kind === "dropped" && !closed.duplicateOf;
    const unwaited = dropped
      ? await inTurn(projectId, () =>
          repoint(projectId, id, null, `${id} was dropped`)
        )
      : [];
    const wholeClosed = await closeWhole(projectId, closed, before.tasks);
    const after = await listTasks(projectId);
    const now = new Map(after.tasks.map((task) => [task.id, task]));
    const open = waiting
      .map((waiter) => now.get(waiter.id))
      .filter(
        (task): task is TaskSummary =>
          task !== undefined && !CLOSED_KINDS.has(task.kind ?? "todo")
      );
    tellWaiters(projectId, closed, dropped, waiting, now);
    return {
      nowReady: open.filter((task) => task.ready).map((task) => task.id),
      stillWaiting: open
        .filter((task) => !task.ready)
        .map((task) => ({ id: task.id, on: unsettledWaits(task) })),
      unwaited,
      wholeClosed,
    };
  };

  /** Each live session whose task waited on a task now closed hears once what changed. */
  const tellWaiters = (
    projectId: string,
    closed: TaskSummary,
    dropped: boolean,
    waiting: TaskSummary[],
    now: Map<string, TaskSummary>
  ): void => {
    const how = dropped
      ? "was dropped, so it is taken out of your task's waits"
      : `is ${closed.stage}`;
    for (const waiter of waiting) {
      const session = liveSession(waiter);
      const left = unsettledWaits(now.get(waiter.id) ?? waiter).length;
      const rest =
        left === 0
          ? "It waits on nothing else now."
          : `It still waits on ${left} more: task_read shows them.`;
      if (session) {
        store.tell?.(
          session,
          `[CawCo] ${linked(projectId, closed)}, which your task ${linked(projectId, waiter)} waits on, ${how}. ${rest}`
        );
      }
    }
  };

  /**
   * A part done closes its whole, as the hub, once every part of it is done
   * or dropped and no attempt at the whole (its coordinator) is live: the
   * whole moves to the project's first done stage. Answers the whole it
   * closed, or null.
   */
  const closeWhole = async (
    projectId: string,
    part: TaskSummary,
    tasks: TaskSummary[]
  ): Promise<string | null> => {
    const whole = part.partOf
      ? tasks.find((task) => task.id === part.partOf)
      : undefined;
    if (
      part.kind !== "done" ||
      !whole ||
      whole.kind === "done" ||
      whole.kind === "dropped" ||
      whole.liveAttempt ||
      !whole.parts.every((id) => {
        const kind = tasks.find((task) => task.id === id)?.kind;
        return kind === "done" || kind === "dropped";
      })
    ) {
      return null;
    }
    const stages = await currentStages(projectId);
    const done = stages?.stages.find((stage) => stage.kind === "done");
    if (!done || done.hooks.by === "action") {
      return null;
    }
    try {
      await moveTask(
        projectId,
        whole.id,
        done.name,
        hubActor(`its last part, ${part.id}, is done`)
      );
      return whole.id;
    } catch (error) {
      console.warn(
        `[tasks] ${projectId} ${whole.id}: its last part is done, and it did not close: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  };

  /**
   * Moves a task to another stage ({@link Tasks.move}); a move into a done
   * or dropped stage carries what closing it did ({@link afterClose}).
   */
  const moveTask = async (
    projectId: string,
    ref: string,
    stage: string,
    actor: TaskActor,
    reason?: string,
    options?: { tickCriteria?: boolean }
  ): Promise<TaskView & { closing?: Closing }> => {
    const why = reasonOf(reason);
    const tick = options?.tickCriteria
      ? (doc: TaskDoc) => doc.tickCriteria()
      : () => 0;
    let moved: { from: string; to: string } | undefined;
    let approved = false;
    const task = await change(projectId, ref, actor, async (doc, id) => {
      const stages = await usableStages(projectId, "check a stage change");
      const to = stageName(stage);
      moved = moveTo(projectId, doc, id, stages, to, actor);
      if (!moved) {
        return `stage ${to}`;
      }
      tick(doc);
      approved =
        actor.mover === "you" &&
        kindIn(stages, moved.from) === "you" &&
        passesReview(stages, moved.from, to);
      if (approved) {
        await approvable(projectId, id);
      }
      const because = approved ? `approved${why ? `: ${why}` : ""}` : why;
      return {
        what: `stage ${moved.from || NO_STAGE} → ${to}`,
        stage: moved,
        ...(because ? { reason: because } : {}),
      };
    });
    if (!moved) {
      return task;
    }
    told(
      {
        kind: "moved",
        projectId,
        id: task.id,
        actor,
        ...moved,
        ...(why ? { reason: why } : {}),
        ...(approved ? { approved: true as const } : {}),
      },
      task
    );
    const wasOpen = !CLOSED_KINDS.has(
      kindIn(await currentStages(projectId), moved.from) ?? "todo"
    );
    return wasOpen && (task.kind === "done" || task.kind === "dropped")
      ? { ...task, closing: await afterClose(projectId, task.id) }
      : task;
  };

  /** A written wait to take out, matched to the target it names as kept; undefined when it names none of them. */
  const keptMatch = (
    kept: readonly string[],
    written: string,
    reader: WaitReader
  ): string | undefined => {
    let read: string | undefined;
    try {
      read = waitHandle(readWait(written, reader));
    } catch (error) {
      if (!(error instanceof WaitRefusal)) {
        throw error;
      }
      const raw = waitTarget(written);
      read = raw ? waitHandle(raw) : undefined;
    }
    return kept.find(
      (target) =>
        target === read ||
        (read === undefined && target.endsWith(written.trim()))
    );
  };

  /** Every task file of the project, the board's and the archive's, each read settled: a write around the hub put back first. */
  const settledFiles = async (
    projectId: string
  ): Promise<{ content: string; number: number; path: string }[]> => {
    const paths = [
      ...(await folderFileNames(projectId, "tasks"))
        .filter((name) => fileTaskNumber(name) !== undefined)
        .map((name) => `tasks/${name}`),
      ...(await archivedNames(projectId)).map(
        (name) => `${ARCHIVE_DIR}/${name}`
      ),
    ];
    return await Promise.all(
      paths.map(async (path) => {
        const number = fileTaskNumber(path) as number;
        const { content } = await readFolderFile(projectId, path);
        const fix = await fixFor(projectId, path, content);
        return {
          path,
          number,
          content: fix
            ? await settle(projectId, path, number, content, fix)
            : content,
        };
      })
    );
  };

  /** Task files a cutover rewrote, as one commit by the hub; the board's re-indexed. */
  const writeCutover = async (
    projectId: string,
    writes: { content: string; number: number; path: string }[],
    actor: TaskActor,
    what: string
  ): Promise<void> => {
    stands(projectId);
    await writeFolderFiles(
      projectId,
      writes.map(({ path, content }) => ({ path, content })),
      {
        author: actor.author,
        message: commitMessage(
          actor,
          `tasks ${writes.map((write) => taskId(write.number)).join(", ")}`,
          what
        ),
      }
    );
    stands(projectId);
    store.put(
      writes
        .filter(({ path }) => !inArchive(path))
        .map(({ path, number, content }) =>
          indexRow(projectId, path, number, content, hashOf(content))
        )
    );
  };

  /**
   * The cutover of a project's task files to one blocking edge, each file
   * once: one still carrying `after:`, `parent:` or `related:` (task-file.ts
   * `takeLegacyLinks`) is rewritten, `after` into `waits_on`, `parent` into
   * `part_of`, and its related tasks into one "See also" comment by the hub;
   * every file in one commit by the hub, and the board's re-indexed. A file
   * written around the hub is settled first. Inside the project's turn.
   * Answers what it did, as counts.
   */
  const migrateLinks = async (projectId: string): Promise<LinkMigration> => {
    const counts: LinkMigration = {
      files: 0,
      waitsOn: 0,
      partOf: 0,
      seeAlso: 0,
      related: 0,
    };
    const read = await settledFiles(projectId);
    const titles = new Map(
      read.map(({ path, number, content }) => [
        taskId(number),
        new TaskDoc(path, content).title(),
      ])
    );
    const writes: { content: string; number: number; path: string }[] = [];
    for (const file of read) {
      const doc = new TaskDoc(file.path, file.content);
      const legacy = doc.takeLegacyLinks();
      if (!legacy) {
        continue;
      }
      const { fields } = doc.read();
      doc.setField("waits_on", [
        ...new Set([...fields.waitsOn, ...legacy.after]),
      ]);
      if (legacy.parent && !fields.partOf) {
        doc.setField("part_of", legacy.parent);
        counts.partOf += 1;
      }
      if (legacy.related.length > 0) {
        doc.addComment(
          { name: AUTHOR.hub, mover: "hub", id: null },
          new Date(),
          `${taskLinkWords.seeAlso} ${legacy.related
            .map((id) => {
              const title = titles.get(id);
              return title ? taskLink(projectId, id, title) : id;
            })
            .join(", ")}.`
        );
        counts.seeAlso += 1;
        counts.related += legacy.related.length;
      }
      counts.waitsOn += legacy.after.length;
      counts.files += 1;
      writes.push({
        path: file.path,
        number: file.number,
        content: doc.toString(),
      });
    }
    if (writes.length === 0) {
      return counts;
    }
    const actor = hubActor(
      "task links are one blocking edge: after is waits_on, parent is part_of, related is a See also comment"
    );
    await writeCutover(
      projectId,
      writes,
      actor,
      `links: ${counts.waitsOn} after → waits_on, ${counts.partOf} parent → part_of, ${counts.seeAlso} related → See also`
    );
    console.info(
      `[tasks] project ${projectId}: task links migrated in ${counts.files} files: ${counts.waitsOn} after → waits_on, ${counts.partOf} parent → part_of, ${counts.related} related in ${counts.seeAlso} See also comments.`
    );
    return counts;
  };

  /**
   * The cutover of a project's task files to external items as data, each
   * file once (tsk-128): an extra field `github: issue#N` becomes the
   * issue's URL in `links:` when the project's checkout is on GitHub, the
   * field gone; a comment carried before comments were data becomes an
   * entry headed by its author's login, the source and its URL, its words
   * bare: the tracker sync's (`<login> on GitHub` over its kept row) and a
   * routine's prose (`GitHub comment by <login> on issue #N (<url>):`, or
   * words ending `— @<login> on GitHub · [view](<url>)`), each kept as a
   * carried comment. Every file in one commit by the hub. Inside the
   * project's turn; runs at every start beside {@link migrateLinks}, and
   * goes once every project of the fleet has run it.
   */
  const migrateExternalItems = async (projectId: string): Promise<number> => {
    const repo = githubRepoOf(store.project(projectId)?.remote ?? null);
    const writes: { content: string; number: number; path: string }[] = [];
    for (const { path, number, content } of await settledFiles(projectId)) {
      const id = taskId(number);
      const doc = new TaskDoc(path, content);
      const recast = cutOver(doc, repo, store.carried(projectId, id));
      for (const via of recast.carried) {
        store.carry(projectId, id, via, via.at);
      }
      if (recast.changed) {
        writes.push({ path, number, content: doc.toString() });
      }
    }
    if (writes.length === 0) {
      return 0;
    }
    await writeCutover(
      projectId,
      writes,
      hubActor(
        "external items are data: a github: field is a link, a carried comment is the words under its author"
      ),
      "external items cut over: github: fields to links, carried comments to their source and URL"
    );
    console.info(
      `[tasks] project ${projectId}: external items cut over in ${writes.length} files.`
    );
    return writes.length;
  };

  /**
   * Each live attempt's moved witnesses already told, by work item: the
   * target and the value told, one message per change, none for the same
   * answer. An attempt leaves it once it is no longer live.
   */
  const toldMoves = new Map<string, Set<string>>();

  /**
   * What a link write does to a task's `duplicate_of`: closes it as a
   * duplicate of the survivor ({@link markDuplicate}), or takes the link
   * out with `remove` (it stays closed).
   */
  const linkDuplicate = async (
    projectId: string,
    doc: TaskDoc,
    id: string,
    actor: TaskActor,
    {
      duplicateOf,
      remove,
      was,
    }: { duplicateOf?: string; remove?: boolean; was: string | null }
  ): Promise<
    Omit<Did, "what"> & { said: string[]; survivor: string | null }
  > => {
    if (duplicateOf === undefined) {
      return { said: [], survivor: null };
    }
    if (remove) {
      if (was === taskRef("duplicate_of", duplicateOf)) {
        doc.setField("duplicate_of", null);
      }
      return {
        said: [`no longer a duplicate of ${duplicateOf}`],
        survivor: null,
      };
    }
    const survivor = await single(projectId, "duplicate_of", duplicateOf);
    if (!survivor || survivor === id) {
      return refuse(400, "A task cannot be a duplicate of itself.");
    }
    const { what, ...marked } = await markDuplicate(
      projectId,
      doc,
      id,
      survivor,
      actor
    );
    return { ...marked, said: [what], survivor };
  };

  /** A write that would make a task wait on itself or be its own part, refused by its path. */
  const refuseSelf = (projectId: string, doc: TaskDoc, id: string): never => {
    const self = linked(projectId, { id, title: doc.title() });
    return refuse(409, taskLinkWords.cycle(`${self} → ${self}`));
  };

  /** What a link write does to a task's waits: added, or taken out with `remove`. */
  const linkWaits = async (
    projectId: string,
    actor: TaskActor,
    doc: TaskDoc,
    id: string,
    { waitsOn, remove }: TaskLinks
  ): Promise<{
    added: string[];
    removed: string[];
    said: string[];
    waits: string[];
  }> => {
    const kept = doc.read().fields.waitsOn;
    if (waitsOn === undefined) {
      return { waits: kept, added: [], removed: [], said: [] };
    }
    if (remove) {
      const reader = store.waitReader(projectId, actor);
      const out = items("waits_on", waitsOn).map(
        (written) =>
          keptMatch(kept, written, reader) ??
          refuse(
            404,
            `It waits on nothing named “${written}”. Nothing changed.`
          )
      );
      return {
        waits: kept.filter((target) => !out.includes(target)),
        added: [],
        removed: out,
        said: [`no longer waits on ${out.join(", ")}`],
      };
    }
    const added = await waitsFor(projectId, actor, waitsOn);
    if (added.includes(id)) {
      refuseSelf(projectId, doc, id);
    }
    return {
      waits: [...new Set([...kept, ...added])],
      added: added.filter((target) => !kept.includes(target)),
      removed: [],
      said: [`waits on ${added.join(", ")}`],
    };
  };

  /** What a link write does to a task's whole: set, or taken out with `remove`. */
  const linkWhole = async (
    projectId: string,
    doc: TaskDoc,
    id: string,
    { partOf, remove }: TaskLinks
  ): Promise<{ partOf: string | null; said: string[] }> => {
    const kept = doc.read().fields.partOf;
    if (partOf === undefined) {
      return { partOf: kept, said: [] };
    }
    if (remove) {
      const out = taskRef("part_of", partOf);
      return {
        partOf: kept === out ? null : kept,
        said: [`no longer part of ${out}`],
      };
    }
    const whole = await single(projectId, "part_of", partOf);
    if (whole === id) {
      refuseSelf(projectId, doc, id);
    }
    return { partOf: whole, said: [`part of ${whole}`] };
  };

  /**
   * A task's live attempt hears once each card or pin it was dispatched on
   * whose value moved since; an attempt no longer live leaves the record.
   */
  const tellMoved = (projectId: string, task: TaskSummary): void => {
    for (const ended of task.attempts.filter(
      (attempt) => !isLive(attempt.state)
    )) {
      toldMoves.delete(ended.workItemId);
    }
    const live = task.attempts.find((attempt) => isLive(attempt.state));
    if (!live) {
      return;
    }
    const heard = toldMoves.get(live.workItemId) ?? new Set<string>();
    toldMoves.set(live.workItemId, heard);
    for (const witness of live.waitedOn) {
      const now = task.waits.find((wait) => wait.target === witness.target);
      const key = `${witness.target}\0${now?.value}`;
      if (!now || now.value === witness.value || heard.has(key)) {
        continue;
      }
      heard.add(key);
      store.tell?.(
        live.instanceId,
        `[CawCo] ${markdownLink(now.label, now.href)}, which ${linked(projectId, task)} was started on, ${now.value === null ? taskLinkWords.wasReopened : taskLinkWords.wasAnsweredDifferently} since. Read it again before you build on it.`
      );
    }
  };

  return {
    /** The project's tasks from the index, caught up with the files first. */
    list: listTasks,

    /** One task, its file read and parsed; the index catches up if the file moved. */
    get: readTask,

    create(
      projectId: string,
      draft: TaskDraft,
      actor: TaskActor
    ): Promise<TaskView> {
      return inTurn(projectId, async () => {
        known(projectId);
        const title = oneLine("title", draft.title, TITLE_LIMIT);
        const stage = await startStage(projectId, draft.stage, actor);
        const fields: Partial<TaskFields> = {
          stage,
          type: draft.type ? typeName(draft.type) : null,
          waitsOn: await waitsFor(projectId, actor, draft.waitsOn ?? []),
          partOf: await single(projectId, "part_of", draft.partOf),
          foundIn: await foundInOf(projectId, draft.foundIn),
          checks: items("checks", draft.checks ?? []),
          outputs: items("outputs", draft.outputs ?? []),
          context: items("context", draft.context ?? []),
          lands: draft.lands ?? null,
          runsOn: draft.runsOn ? runsOnChecked(draft.runsOn) : null,
          ...limitsOf(draft),
          rank: draft.rank ? oneLine("rank", draft.rank, 64) : null,
          labels: items("labels", draft.labels ?? []),
          links: linksOf(draft.links ?? []),
        };
        const description = block("description", draft.description ?? "");
        const acceptance = block("acceptance criteria", draft.acceptance ?? "");
        const todos = (draft.todos ?? []).map(todoText);
        const extra = extraFieldsOf(draft.fields ?? {});
        return await fileNew(projectId, actor, (number) => {
          const path = taskPath(number, title);
          const doc = TaskDoc.create(path, {
            title,
            fields,
            description,
            acceptance,
            todos,
          });
          for (const [key, value] of extra) {
            doc.setExtra(key, value);
          }
          return {
            path,
            content: doc.toString(),
            message: commitMessage(
              actor,
              `task ${taskId(number)}`,
              `create “${title}” in ${stage}`,
              { stage: { from: "", to: stage }, change: CHANGES.create }
            ),
          };
        });
      }).then((task) =>
        told(
          { kind: "created", projectId, id: task.id, stage: task.stage, actor },
          task
        )
      );
    },

    /**
     * Takes in another project's task files (a duplicate project folded into
     * this one, project-merge.ts): each under this project's next number, its
     * lines as they were, its edges and promoted to-dos renamed to the new
     * ids. An edge to a task that is not among the files is dropped and said
     * in the log: no task of this project is named by accident. Answers each
     * old id → its new id.
     */
    adopt(
      projectId: string,
      files: { content: string; path: string }[],
      actor: TaskActor,
      from: string
    ): Promise<Map<string, string>> {
      return inTurn(projectId, async () => {
        known(projectId);
        const numbered = files
          .map((file) => ({ file, was: fileTaskNumber(file.path) }))
          .filter(
            (each): each is { file: typeof each.file; was: number } =>
              each.was !== undefined
          )
          .sort((a, b) => a.was - b.was);
        if (numbered.length === 0) {
          return new Map<string, string>();
        }
        // A file that claims one of the numbers between the read and the
        // write (an agent writing tasks/ straight) takes none of them: the
        // whole merge is numbered afresh and written again.
        for (let tries = 1; ; tries += 1) {
          try {
            return await adoptOnce(projectId, numbered, actor, from);
          } catch (error) {
            if (!(error instanceof FolderTaken) || tries >= CLAIM_TRIES) {
              throw error;
            }
            console.info(
              `[tasks] ${projectId}: ${error.message} ${from}'s tasks are numbered again.`
            );
          }
        }
      }).then((renames) => told({ kind: "changed", projectId }, renames));
    },

    /** Fields and owned sections; what the patch leaves out stays as written. */
    update(
      projectId: string,
      ref: string,
      patch: TaskPatch,
      actor: TaskActor
    ): Promise<TaskView> {
      const checked = patch.runsOn
        ? { ...patch, runsOn: runsOnChecked(patch.runsOn) }
        : patch;
      return change(projectId, ref, actor, (doc) =>
        applyPatch(doc, checked)
      ).then((task) => told({ kind: "changed", projectId, id: task.id }, task));
    },

    /**
     * Moves a task to another stage, checked against the moves for its mover;
     * the hub's own moves are not, as the stage exists. `reason` says why
     * (a close reason, most often); its commit carries it, and the task's
     * history shows it. Listeners hear of a move that happened. Your move
     * that passes a task on out of a stage of kind `you` is its approval:
     * its commit's reason says `approved`, and its event says so, for the
     * agent that filed it (task-approval.ts). `tickCriteria`: a close whose
     * acceptance criteria were shown met (dispatch.ts `settle`) ticks them
     * in the same commit as the move. A close answers what it did around the
     * task (`closing`): what became ready, what still waits, a whole closed.
     */
    move: moveTask,

    /**
     * The one later write of a task's links: `waitsOn` adds what it waits on
     * (or takes it out, with `remove`); `partOf` makes it a part of a whole,
     * inheriting its waits (or no longer, with `remove`); `duplicateOf`
     * closes it as a duplicate of the survivor and moves every wait on it
     * there. Refused, nothing changed, for a cycle of waits or parts (named
     * by its path), a wait on itself, or a target that does not exist.
     * Answers the task with what changed (`linked`).
     */
    async link(
      projectId: string,
      ref: string,
      request: TaskLinks,
      actor: TaskActor
    ): Promise<TaskView & { linked: LinkOutcome }> {
      const { waitsOn, partOf, duplicateOf, remove } = request;
      if (
        waitsOn === undefined &&
        partOf === undefined &&
        duplicateOf === undefined
      ) {
        refuse(
          400,
          "Give waits_on, part_of or duplicate_of: what the task waits on, the whole it is a part of, or the task it repeats."
        );
      }
      let moved: { from: string; to: string } | undefined;
      let removed: string[] = [];
      const outcome: LinkOutcome = {
        added: [],
        removed: [],
        partOf: undefined,
        duplicateOf: null,
        moved: [],
      };
      const task = await inTurn(projectId, async () => {
        known(projectId);
        const done = await amend(projectId, ref, actor, async (doc, id) => {
          const { fields } = doc.read();
          const waits = await linkWaits(projectId, actor, doc, id, request);
          const whole = await linkWhole(projectId, doc, id, request);
          if (!remove && (waitsOn !== undefined || partOf !== undefined)) {
            refuseCycle(projectId, id, {
              partOf: whole.partOf,
              waitsOn: waits.waits,
            });
          }
          doc.setField("waits_on", waits.waits);
          doc.setField("part_of", whole.partOf);
          ({ removed } = waits);
          outcome.added = waits.added;
          if (partOf !== undefined) {
            outcome.partOf = whole.partOf;
          }
          const said = [...waits.said, ...whole.said];
          const dup = await linkDuplicate(projectId, doc, id, actor, {
            duplicateOf,
            remove,
            was: fields.duplicateOf,
          });
          moved = dup.stage;
          outcome.duplicateOf = dup.survivor;
          return { ...dup, what: [...said, ...dup.said].join("; ") };
        });
        if (outcome.duplicateOf) {
          outcome.moved = await repoint(
            projectId,
            done.id,
            outcome.duplicateOf,
            `${done.id} closed as a duplicate of ${outcome.duplicateOf}`
          );
        }
        return done;
      });
      const answered =
        outcome.moved.length > 0 ? await readTask(projectId, task.id) : task;
      if (removed.length > 0) {
        const context = contextOf(
          projectId,
          store.index(projectId),
          await currentStages(projectId),
          new Set()
        );
        outcome.removed = removed.map((handle) => settleIn(context, handle));
      }
      if (moved) {
        told(
          {
            kind: "moved",
            projectId,
            id: task.id,
            actor,
            ...moved,
            reason: "duplicate",
          },
          answered
        );
      } else {
        told({ kind: "changed", projectId, id: task.id }, answered);
      }
      if (outcome.duplicateOf && outcome.moved.length > 0) {
        told({ kind: "changed", projectId }, answered);
        const survivor = outcome.duplicateOf;
        const list = await listTasks(projectId);
        const nameOf = (id: string) =>
          linked(
            projectId,
            list.tasks.find((each) => each.id === id) ?? { id, title: id }
          );
        for (const waiter of list.tasks.filter((each) =>
          outcome.moved.includes(each.id)
        )) {
          const session = liveSession(waiter);
          if (session) {
            store.tell?.(
              session,
              `[CawCo] ${linked(projectId, answered)}, which your task ${linked(projectId, waiter)} waited on, closed as a duplicate of ${nameOf(survivor)}: your task waits on that one now.`
            );
          }
        }
      }
      return { ...answered, linked: outcome };
    },

    /**
     * A task's history: every commit to its file, oldest first, followed
     * across renames, each with who made it, what it did, the stage it moved
     * and why (task-history.ts). Read from the folder's history as kept per
     * commit, so it spawns no git while HEAD stands.
     */
    async history(projectId: string, ref: string): Promise<TaskHistory> {
      known(projectId);
      const id = taskRef("task", ref);
      const number = taskNumber(id) as number;
      const filed = taskFileIn(
        await folderFileTimes(projectId, "tasks"),
        number
      );
      if (filed) {
        return {
          id,
          path: filed.path,
          state: filed.state,
          events: [...historyOf(filed.entry)],
        };
      }
      // A file no commit has yet: the task stands, with no history.
      const { path } = await locate(projectId, ref);
      return { id, path, state: "live", events: [] };
    },

    /**
     * Adds a comment to a task: one entry at the end of its `## Comments`,
     * headed with who wrote it and when, as one commit (its history shows it
     * as `commented`). Entries are only ever added. Listeners hear it with
     * its words: yours reach the task's live attempt (server.ts). `id`, the
     * one its device chose, makes it one comment however often it is sent:
     * one already written is answered with the task as it stands, nothing
     * added and nobody told again. `via`: a comment written on an outside
     * source and carried here by the hub (external-items.ts), headed by its
     * author's login, the source and its URL.
     */
    comment(
      projectId: string,
      ref: string,
      text: string,
      actor: TaskActor,
      id?: string,
      via?: ExternalComment
    ): Promise<TaskView> {
      if (!id) {
        return writeComment(projectId, ref, text, actor, via);
      }
      const first = commenting.get(id);
      if (first !== undefined) {
        return first;
      }
      const said = store.commentSaid(id);
      if (said) {
        if (
          said.projectId !== projectId ||
          said.taskId !== taskRef("task", ref)
        ) {
          refuse(409, "That comment is already on another task.");
        }
        return readTask(projectId, ref);
      }
      const writing = writeComment(projectId, ref, text, actor).then((task) => {
        store.noteComment({ id, projectId, taskId: task.id });
        return task;
      });
      commenting.set(id, writing);
      const done = () => commenting.delete(id);
      writing.then(done, done);
      return writing;
    },

    /**
     * Keeps what an attempt's session handed in on its task (`task_result`),
     * replacing what it handed in before. A file or a post names one of the
     * task's `outputs` (the hub copies those in as the attempt finishes) or a
     * file the project folder holds; a post is a `*.post.json`; a link is
     * http(s). One artifact at most is primary; none marked, the first is.
     * Listeners hear the task changed, so every screen reads it again.
     */
    async result(
      projectId: string,
      ref: string,
      workItemId: string,
      written: {
        summary: string;
        check?: string[];
        artifacts?: ResultArtifact[];
      }
    ): Promise<AttemptResult> {
      known(projectId);
      const { path, number } = await locate(projectId, ref);
      const { content } = await readFolderFile(projectId, path);
      const { outputs } = new TaskDoc(path, content).read().fields;
      const summary = written.summary.trim();
      if (!summary) {
        refuse(
          422,
          "Say what you did in `summary`: the reviewer reads it first."
        );
      }
      const artifacts = written.artifacts ?? [];
      for (const artifact of artifacts) {
        await artifactProblem(projectId, outputs, artifact);
      }
      if (artifacts.filter((artifact) => artifact.primary).length > 1) {
        refuse(
          422,
          "Mark one artifact `primary` at most: the one the reviewer sees first."
        );
      }
      const result: AttemptResult = {
        summary,
        check: (written.check ?? []).map((line) => line.trim()).filter(Boolean),
        artifacts: artifacts.map((artifact) =>
          artifact.kind === "link" || artifact.kind === "artifact"
            ? artifact
            : { ...artifact, path: folderPath(artifact.path) }
        ),
        at: Date.now(),
      };
      store.saveResult(workItemId, result);
      return told({ kind: "changed", projectId, id: taskId(number) }, result);
    },

    /**
     * Archives a task (`archived`, the default): its file moves to
     * tasks/archive/ in one commit, off every list but `archived`, done for
     * every task that waits on it, and kept with its history; refused while
     * an attempt at it is live. `archived: false` moves it back to tasks/ in
     * one commit: it lists, its edges count by its stage, and it changes
     * again.
     */
    archive(
      projectId: string,
      ref: string,
      actor: TaskActor,
      archived = true
    ): Promise<TaskView> {
      return inTurn(projectId, () => {
        known(projectId);
        return archived
          ? archiveFile(projectId, ref, actor)
          : unarchiveFile(projectId, ref, actor);
      }).then((task) =>
        told({ kind: "changed", projectId, id: task.id }, task)
      );
    },

    /**
     * Deletes a task's file, as one commit; its history stays in the
     * folder's. Refused while another task waits on it (`waits_on`) or is
     * part of it (`part_of`), naming them: archive it instead, which they take
     * as done, or take their edges out first.
     */
    remove(
      projectId: string,
      ref: string,
      actor: TaskActor
    ): Promise<{ id: string; path: string }> {
      return inTurn(projectId, async () => {
        known(projectId);
        const { rows } = await sync(projectId);
        const { path, number } = await locate(projectId, ref);
        const id = taskId(number);
        const waiting = new Set(
          store.waiters(projectId, id).map((row) => row.path)
        );
        const held = holders(
          rows.filter((row) => row.path !== path && waiting.has(row.path)),
          rows.filter((row) => row.path !== path && row.partOf === id)
        );
        if (held) {
          refuse(
            409,
            `This task cannot be deleted: ${held}. Archive it instead, which they take as done, or take those edges out first.`
          );
        }
        const { content } = await readFolderFile(projectId, path);
        stands(projectId);
        await deleteFolderFile(projectId, path, {
          author: actor.author,
          message: commitMessage(
            actor,
            `task ${id}`,
            `delete “${new TaskDoc(path, content).title()}”`
          ),
        });
        store.drop(projectId, [path]);
        return { id, path };
      }).then((gone) =>
        told({ kind: "changed", projectId, id: gone.id }, gone)
      );
    },

    /** Ticks, unticks, adds and rewords to-dos, all in one commit. */
    todos(
      projectId: string,
      ref: string,
      changes: TodoChanges,
      actor: TaskActor
    ): Promise<TaskView> {
      return change(projectId, ref, actor, (doc) =>
        applyTodos(doc, changes)
      ).then((task) => told({ kind: "changed", projectId, id: task.id }, task));
    },

    /** The project's stages, moves, views and hooks, or what keeps stages.md from reading. */
    async stages(projectId: string): Promise<StagesView> {
      known(projectId);
      const { source, content, reading } = await stagesOf(projectId);
      return stagesView(source, content, reading, startersOf(projectId));
    },

    /** Writes stages.md, once it reads; a file that does not is refused with every problem. */
    putStages(
      projectId: string,
      content: string,
      actor: TaskActor,
      message?: string
    ): Promise<StagesView> {
      return inTurn(projectId, async () => {
        known(projectId);
        const reading = readStages(content);
        if (!reading.ok) {
          refuse(422, `stages.md was not saved. ${reading.problems.join(" ")}`);
        }
        await writeFolderFile(projectId, STAGES_FILE, content, {
          author: actor.author,
          message: message?.trim() || `stages: update ${byWhom(actor)}`,
        });
        await fillTypes(projectId);
        return stagesView(
          "file",
          content,
          ruled(projectId, reading),
          startersOf(projectId)
        );
      }).then((written) => told({ kind: "changed", projectId }, written));
    },

    /**
     * Writes a template as the project's stages.md; the code template is
     * the hub's own, so applying it takes stages.md away and the project
     * reads the template. Each delegate type its stages run that the
     * project has no file for is written with it (template-types.ts); a
     * project's own file of that name stays as it is. Answers the stages,
     * and the tasks whose stage the template does not have (they stay where
     * they are until moved).
     */
    applyTemplate(
      projectId: string,
      template: StagesTemplate,
      actor: TaskActor
    ): Promise<StagesView & { stranded: string[] }> {
      return inTurn(projectId, async () => {
        known(projectId);
        const content = templateText(template);
        const message = `stages: apply the ${template} template ${byWhom(actor)}`;
        const types = await missingTypes(projectId, templateTypes(template));
        if (template === DEFAULT_TEMPLATE) {
          await removeStages(projectId, { author: actor.author, message });
        }
        const writes = [
          ...(template === DEFAULT_TEMPLATE
            ? []
            : [{ path: STAGES_FILE, content }]),
          ...types,
        ];
        if (writes.length > 0) {
          await writeFolderFiles(projectId, writes, {
            author: actor.author,
            message,
          });
        }
        store.setTemplate(projectId, template);
        const stages = templateStages(template);
        const { rows } = await sync(projectId);
        return {
          ...stagesView(
            template === DEFAULT_TEMPLATE ? "template" : "file",
            content,
            ruled(projectId, { ok: true, stages }),
            startersOf(projectId)
          ),
          stranded: rows
            .filter((row) => !stageNamed(stages, row.stage))
            .map((row) => row.id),
        };
      }).then((written) => told({ kind: "changed", projectId }, written));
    },

    /**
     * A page's picks or pins moved (a card answered, reopened or answered
     * again; a pin resolved): listeners look again (readiness is live, so a
     * reopened card blocks its to-do dependents again), and each live
     * attempt dispatched on a card or pin whose value moved since hears it
     * once. The witness is the pick's value, so the same answer again tells
     * nobody.
     */
    async waitsMoved(projectId: string): Promise<void> {
      const list = await listTasks(projectId);
      emit({ kind: "changed", projectId });
      for (const task of list.tasks) {
        tellMoved(projectId, task);
      }
    },

    /**
     * One wait settled now (task-waits.ts `settled`), read in project
     * `projectId` (null: none, so a task target names nothing): a plan
     * step's wait.
     */
    async waitState(
      projectId: string | null,
      handle: string
    ): Promise<WaitState> {
      const rows = projectId ? store.index(projectId) : [];
      const stages = projectId ? await currentStages(projectId) : undefined;
      return settleIn(
        contextOf(projectId ?? "", rows, stages, new Set()),
        handle
      );
    },

    /**
     * A wait as `actor` writes it outside a task (a plan step's), read as a
     * task's are ({@link waitsFor}) and kept as a file keeps it; refused in
     * words when it names nothing that exists. `projectId` null: the
     * session is in none, so only a target outside a project reads.
     */
    async keptWait(
      projectId: string | null,
      actor: TaskActor,
      written: string
    ): Promise<string> {
      if (projectId) {
        const [kept] = await waitsFor(projectId, actor, [written]);
        if (!kept) {
          return refuse(400, `“${written}” names nothing to wait on.`);
        }
        // A pull request's state is a task's link row (external-items.ts `prWait`): a step has none of its own.
        const unlinked =
          waitTarget(kept)?.kind === "pr" &&
          store.linked(projectId, kept).length === 0;
        return unlinked ? refuse(400, taskLinkWords.prUnlinked(kept)) : kept;
      }
      try {
        const target = readWait(written, store.waitReader("", actor));
        return target.kind === "task"
          ? refuse(
              400,
              "This session is in no project, so it has no tasks to wait on."
            )
          : waitHandle(target);
      } catch (error) {
        if (error instanceof WaitRefusal) {
          return refuse(400, error.message);
        }
        throw error;
      }
    },

    /**
     * Rewrites the words of the comment carried from `url`, its heading as
     * it was: the source changed them. The hub's sync alone calls it
     * (external-items.ts); one commit, `comment_edited` in the history.
     * Listeners hear the task changed.
     */
    editComment(
      projectId: string,
      ref: string,
      url: string,
      text: string,
      actor: TaskActor
    ): Promise<TaskView> {
      const written = commentText(text);
      return change(projectId, ref, actor, (doc, id) => {
        if (!doc.editComment(url, written)) {
          refuse(404, `${id} holds no comment carried from ${url}.`);
        }
        const source = refOfUrl(url)?.source;
        return {
          what: `comment edited${source ? ` on ${externalItemWords.source[source]}` : ""}`,
          change: CHANGES.commentEdited,
        };
      }).then((task) =>
        told({ kind: "changed", projectId, id: task.id }, task)
      );
    },

    /** {@link migrateLinks} in the project's turn: what the hub runs for each project as it starts. */
    migrateLinks(projectId: string): Promise<LinkMigration> {
      return inTurn(projectId, async () => {
        known(projectId);
        return await migrateLinks(projectId);
      });
    },

    /** Hears every change to a project's tasks once it has landed; answers how to stop. */
    listen(listener: (event: TaskEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Tells listeners a project's folder changed under the tasks (a write
     * through the folder's own routes); its stages may now run a type it
     * has no file for ({@link fillTypes}).
     */
    touched(projectId: string): void {
      emit({ kind: "changed", projectId });
      fillTypesSoon(projectId);
    },

    /** The stage templates a project can apply. */
    templates(): StagesTemplateView[] {
      return STAGES_TEMPLATES.map((name) => ({
        name,
        content: templateText(name),
        ...templateStages(name),
      }));
    },

    /**
     * Names the issue a task is one record with (`issue:`, its URL), or
     * takes the name out: the tracker sync's own write (tracker.ts), never a
     * person's or a session's, so the link is the issue the sync made or
     * read. Listeners hear the task changed.
     */
    setIssue(
      projectId: string,
      ref: string,
      url: string | null,
      actor: TaskActor
    ): Promise<TaskView> {
      return change(projectId, ref, actor, (doc) => {
        doc.setField("issue", url);
        return url ? `issue ${url}` : "issue unlinked";
      }).then((task) =>
        told({ kind: "changed", projectId, id: task.id }, task)
      );
    },

    /**
     * Catches up the index of every project that has a folder: what the hub
     * does as it starts. A stages.md that is only the code template goes
     * first, so the project reads the template as the hub has it.
     */
    async syncAll(): Promise<void> {
      for (const projectId of store.projectIds()) {
        if (await hasProjectFolder(projectId)) {
          try {
            await inTurn(projectId, async () => {
              await dropTemplateCopy(projectId);
              await fillTypes(projectId);
              await migrateLinks(projectId);
              await migrateExternalItems(projectId);
            });
            await sync(projectId);
          } catch (error) {
            console.warn(
              `[tasks] project ${projectId}'s task index was not caught up: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    },
  };
};

export type Tasks = ReturnType<typeof createTasks>;

// --- routes ----------------------------------------------------------------

const KIND = t.Union([
  t.Literal("todo"),
  t.Literal("active"),
  t.Literal("waiting"),
  t.Literal("you"),
  t.Literal("done"),
  t.Literal("dropped"),
]);
/** Every template `/api/stage-templates` lists is one a project may take. */
const TEMPLATE = t.Union(STAGES_TEMPLATES.map((name) => t.Literal(name)));
/** Where an attempt's work lands (`@cawco/core`'s `LandsMode`). */
export const LANDS = t.Union(LANDS_MODES.map((mode) => t.Literal(mode)));
/** What a work item may spend (`WorkBudget`): dollars, turns, minutes. */
export const BUDGET = t.Object({
  usd: t.Optional(t.Number()),
  turns: t.Optional(t.Integer()),
  minutes: t.Optional(t.Integer()),
});
/** A list filter's yes or no: `1` or `0`. */
const FLAG = t.Union([t.Literal("1"), t.Literal("0")]);
const flagOf = (flag: "1" | "0" | undefined): boolean | undefined =>
  flag === undefined ? undefined : flag === "1";
/** Fields a task file does not know, each a scalar or a list (`TaskDraft.fields`). */
const FIELDS = t.Record(t.String(), t.Union([t.String(), t.Array(t.String())]));
const FIELD_PARAM = "field.";
/** A list's `field.<key>=<value>` query parameters, by key. */
const fieldParams = (params: URLSearchParams): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const [name, value] of params) {
    if (name.startsWith(FIELD_PARAM) && name.length > FIELD_PARAM.length) {
      fields[name.slice(FIELD_PARAM.length)] = value;
    }
  }
  return fields;
};
/**
 * The dashboard's routes for a project's tasks, under
 * `/api/projects/:id/tasks`, its stages, and the stage templates (its
 * tracker's are tracker.ts's). Changes from here are the operator's ("you").
 */
export const taskRoutes = (tasks: Tasks) =>
  new Elysia()
    .get(
      "/api/projects/:id/tasks",
      {
        query: t.Object({
          stage: t.Optional(t.String()),
          kind: t.Optional(KIND),
          /** Words to find in a task's id, title or description. */
          q: t.Optional(t.String()),
          label: t.Optional(t.String()),
          type: t.Optional(t.String()),
          /** The whole they are part of, like tsk-12. */
          partOf: t.Optional(t.String()),
          /** 1: only tasks with a wait unsettled; 0: only tasks with none. */
          blocked: t.Optional(FLAG),
          /** 1: only tasks that need you; 0: only tasks that do not. */
          needsYou: t.Optional(FLAG),
          /** 1: the archived tasks instead of the board's. */
          archived: t.Optional(FLAG),
          /** An external item's URL, or #12 in the project's repository: the tasks linking it. */
          link: t.Optional(t.String()),
        }),
      },
      async ({ params, query, request }) => {
        try {
          return await tasks.list(params.id, {
            stage: query.stage,
            kind: query.kind,
            q: query.q,
            label: query.label,
            type: query.type,
            partOf: query.partOf,
            blocked: flagOf(query.blocked),
            needsYou: flagOf(query.needsYou),
            archived: query.archived === "1",
            link: query.link,
            // `field.<key>=<value>`: a field a task file does not know, to equal the value.
            fields: fieldParams(new URL(request.url).searchParams),
          });
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks",
      {
        body: t.Object({
          title: t.String(),
          stage: t.Optional(t.String()),
          type: t.Optional(t.String()),
          /** What it waits on: tasks (tsk-12), cards (<page>#<card>), pins (<page>/<n>), GitHub pull requests and Actions runs, sessions. */
          waitsOn: t.Optional(t.Array(t.String())),
          /** The whole it is a part of, like tsk-12: it inherits its waits. */
          partOf: t.Optional(t.String()),
          checks: t.Optional(t.Array(t.String())),
          outputs: t.Optional(t.Array(t.String())),
          context: t.Optional(t.Array(t.String())),
          lands: t.Optional(LANDS),
          runsOn: t.Optional(t.String()),
          group: t.Optional(t.String()),
          owns: t.Optional(t.Array(t.String())),
          budget: t.Optional(BUDGET),
          rank: t.Optional(t.String()),
          labels: t.Optional(t.Array(t.String())),
          /** External items it links, each by its URL: GitHub issues, pull requests, discussions; Linear issues. */
          links: t.Optional(t.Array(t.String())),
          description: t.Optional(t.String()),
          acceptance: t.Optional(t.String()),
          todos: t.Optional(t.Array(t.String())),
          fields: t.Optional(FIELDS),
        }),
      },
      async ({ params, body }) => {
        try {
          return await tasks.create(params.id, body, YOU_ACTOR);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/projects/:id/tasks/:taskId", async ({ params }) => {
      try {
        return await tasks.get(params.id, params.taskId);
      } catch (error) {
        return refused(error);
      }
    })
    // One output an attempt handed in, by the name the task gives it
    // (`outputs: [post.md]`), from where the hub copied it
    // (`assets/tsk-12/post.md`): a picture, a video or a sound as itself,
    // anything else as text, so a page reads every output the one way and
    // draws it.
    .get(
      "/api/projects/:id/tasks/:taskId/outputs/file",
      { query: t.Object({ name: t.String() }) },
      async ({ params, query }) => {
        try {
          const task = await tasks.get(params.id, params.taskId);
          if (!task.outputs.includes(query.name)) {
            throw new FolderRefusal(
              404,
              `This task hands in no output named ${query.name}; its outputs are ${task.outputs.join(", ") || "none"}.`
            );
          }
          const extension = fileExtension(query.name);
          const media = MEDIA_TYPES[extension];
          const file = await folderFileRaw(
            params.id,
            `${outputsFolder({ id: "", taskId: task.id })}/${query.name}`,
            media ? FOLDER_RAW_LIMIT : OUTPUT_FILE_LIMIT
          );
          return servedFile(
            Bun.file(file.real),
            IMAGE_TYPES[extension] ?? media ?? "text/plain; charset=utf-8"
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .patch(
      "/api/projects/:id/tasks/:taskId",
      {
        body: t.Object({
          title: t.Optional(t.String()),
          description: t.Optional(t.String()),
          acceptance: t.Optional(t.String()),
          type: t.Optional(t.Nullable(t.String())),
          rank: t.Optional(t.Nullable(t.String())),
          lands: t.Optional(t.Nullable(LANDS)),
          runsOn: t.Optional(t.Nullable(t.String())),
          group: t.Optional(t.Nullable(t.String())),
          owns: t.Optional(t.Array(t.String())),
          budget: t.Optional(t.Nullable(BUDGET)),
          checks: t.Optional(t.Array(t.String())),
          outputs: t.Optional(t.Array(t.String())),
          context: t.Optional(t.Array(t.String())),
          labels: t.Optional(t.Array(t.String())),
          /** The external items it links, each by its URL; replaces the list. */
          links: t.Optional(t.Array(t.String())),
          fields: t.Optional(FIELDS),
        }),
      },
      async ({ params, body }) => {
        try {
          return await tasks.update(params.id, params.taskId, body, YOU_ACTOR);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .delete("/api/projects/:id/tasks/:taskId", async ({ params }) => {
      try {
        return await tasks.remove(params.id, params.taskId, YOU_ACTOR);
      } catch (error) {
        return refused(error);
      }
    })
    .post(
      "/api/projects/:id/tasks/:taskId/comments",
      {
        body: t.Object({
          text: t.String(),
          /** The comment's id, chosen by its device: the same id again is the same comment. */
          id: t.Optional(t.String()),
        }),
      },
      async ({ params, body }) => {
        try {
          return await tasks.comment(
            params.id,
            params.taskId,
            body.text,
            YOU_ACTOR,
            body.id
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/archive",
      {
        body: t.Optional(
          t.Object({
            /** false: move it back out of the archive. */
            archived: t.Optional(t.Boolean()),
          })
        ),
      },
      async ({ params, body }) => {
        try {
          return await tasks.archive(
            params.id,
            params.taskId,
            YOU_ACTOR,
            body?.archived ?? true
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/projects/:id/tasks/:taskId/history", async ({ params }) => {
      try {
        return await tasks.history(params.id, params.taskId);
      } catch (error) {
        return refused(error);
      }
    })
    .post(
      "/api/projects/:id/tasks/:taskId/stage",
      {
        body: t.Object({
          stage: t.String(),
          /** Why: a close reason, kept in the move's commit and shown in the task's history. */
          reason: t.Optional(t.String()),
        }),
      },
      async ({ params, body }) => {
        try {
          // The dashboard reads the task; what the close did is a tool's answer.
          const { closing: _closing, ...task } = await tasks.move(
            params.id,
            params.taskId,
            body.stage,
            YOU_ACTOR,
            body.reason
          );
          return task as TaskView;
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/links",
      {
        body: t.Object({
          /** Waits to add (or take out, with `remove`), each as task_link writes them. */
          waitsOn: t.Optional(t.Array(t.String())),
          /** The whole it is a part of, like tsk-12. */
          partOf: t.Optional(t.String()),
          /** The task it repeats: closes it, and moves every wait on it there. */
          duplicateOf: t.Optional(t.String()),
          remove: t.Optional(t.Boolean()),
        }),
      },
      async ({ params, body }) => {
        try {
          // The dashboard reads the task; what the write changed is a tool's answer.
          const { linked: _linked, ...task } = await tasks.link(
            params.id,
            params.taskId,
            body,
            YOU_ACTOR
          );
          return task as TaskView;
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/todos",
      { body: t.Object({ text: t.String(), under: t.Optional(t.String()) }) },
      async ({ params, body }) => {
        try {
          return await tasks.todos(
            params.id,
            params.taskId,
            { add: [body] },
            YOU_ACTOR
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .patch(
      "/api/projects/:id/tasks/:taskId/todos/:todo",
      {
        body: t.Object({
          done: t.Optional(t.Boolean()),
          text: t.Optional(t.String()),
        }),
      },
      async ({ params, body }) => {
        try {
          let changes: TodoChanges = {};
          if (body.done !== undefined) {
            changes = body.done
              ? { tick: [params.todo] }
              : { untick: [params.todo] };
          }
          if (body.text !== undefined) {
            changes.edit = [{ todo: params.todo, text: body.text }];
          }
          return await tasks.todos(
            params.id,
            params.taskId,
            changes,
            YOU_ACTOR
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/projects/:id/stages", async ({ params }) => {
      try {
        return await tasks.stages(params.id);
      } catch (error) {
        return refused(error);
      }
    })
    .put(
      "/api/projects/:id/stages",
      {
        body: t.Object({
          content: t.String(),
          message: t.Optional(t.String({ maxLength: 2000 })),
        }),
      },
      async ({ params, body }) => {
        try {
          return await tasks.putStages(
            params.id,
            body.content,
            YOU_ACTOR,
            body.message
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/stages/template",
      { body: t.Object({ template: TEMPLATE }) },
      async ({ params, body }) => {
        try {
          return await tasks.applyTemplate(params.id, body.template, YOU_ACTOR);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/stage-templates", () => tasks.templates());
