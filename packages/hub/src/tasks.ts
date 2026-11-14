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
 *   that started it, or the project's conversation for the dispatcher's), never the person's
 *   Needs you: a task waits for you only in a stage of kind `you`. The hub
 *   moves a task as `hub`: code, which the file's moves do not bind; its
 *   commits say so.
 *
 * Changes to one project's tasks are taken one at a time: two to-dos ticked
 * at once both land.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EndedBy } from "@cawco/core/accounts";
import type { AttemptResult, ResultArtifact } from "@cawco/core/deliverables";
import { detach } from "@cawco/core/detach";
import {
  type ExternalComment,
  type ExternalRef,
  refOfUrl,
  type TaskLinkSummary,
} from "@cawco/core/external-items";
import { PERMISSION_MODES } from "@cawco/core/harness/kinds";
import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
import { todoProgress } from "@cawco/core/plan";
import type { InstanceRow } from "@cawco/core/protocol";
import { markdownLink, taskLink } from "@cawco/core/references";
import {
  type ProjectStarter,
  STARTER_PLACES,
  type StarterPlace,
} from "@cawco/core/starters";
import type { TaskEdge } from "@cawco/core/task-edges";
import type {
  BuiltOn,
  Stage,
  StageMove,
  StagesSource,
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
import type { IssueTracker } from "@cawco/core/trackers";
import {
  CLOSED_STAGE_KINDS,
  type Mover,
  OFFERED_TEMPLATES,
  STAGES_TEMPLATES,
  type StageKind,
  type StagesTemplate,
  type TaskMover,
} from "@cawco/core/views";
import { taskTarget, waitHandle, waitTarget } from "@cawco/core/wait-targets";
import { externalItemWords } from "@cawco/core/words/external-items";
import { judgedWords } from "@cawco/core/words/judged";
import { taskLinkWords } from "@cawco/core/words/task-links";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import type { WorkItemRow } from "./db/project-work";
import type { Tracker } from "./db/schema";
import type { WorkBudget } from "./db/stored-types";
import type { TaskIndexRow } from "./db/task-index";
import { boardTitle } from "./labels";
import {
  deleteFolderFile,
  type Exclusive,
  type FolderAuthor,
  type FolderListing,
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
  servedFile,
  storedProjectRoot,
  turnTaker,
  writeFolderFile,
  writeFolderFiles,
  YOU,
} from "./project-folder";
import type { AnyProblem } from "./refusal";
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
  templateHolding,
  templateStages,
  templateText,
  withRetiredMoverAsSession,
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
  type TodoChanges,
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
  type WaitWorld,
} from "./task-waits";
import { runsOf, skillTypes, templateTypes, typeFiles } from "./template-types";
import { isLive } from "./work-item-state";
import { budgetProblem, ownsProblem } from "./work-limits";
import { outputsFolder } from "./workspaces";

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
  /**
   * The change is the person's own writing on the task (a comment, a to-do
   * or a task they added): the project's conversation reads it
   * (task-input.ts). Only {@link YOU_WRITING} carries it, so nothing an
   * agent, Caw or the hub writes wakes anyone.
   */
  words?: true;
}

/** The operator, at the dashboard. */
export const YOU_ACTOR: TaskActor = { mover: "you", author: YOU };

/** The operator writing on a task at the board or the phone: a comment, a to-do or a task they add. */
export const YOU_WRITING: TaskActor = { ...YOU_ACTOR, words: true };

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
 * A session calling the task tools, its project's conversation among them:
 * it moves stages as a `session` and commits under its board name.
 */
export const sessionActor = (row: InstanceRow): TaskActor => ({
  mover: "session",
  instanceId: row.id,
  author: { name: boardTitle(row) },
});

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
      /** A comment added to the task, by whom: yours reaches its attempt (jev-tasks.ts) and its project's conversation (task-input.ts). */
      comment?: { actor: TaskActor; text: string };
      /** To-dos added to the task, by whom, each as written. */
      todos?: { actor: TaskActor; added: string[] };
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
    | "unmetAt"
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
   * The task a comment went on, written under `id`, the id its device chose
   * for it (db `task_comment_ids`): the same comment again adds nothing.
   */
  readonly commentSaid: (
    id: string
  ) => { projectId: string; taskId: string } | undefined;
  readonly drop: (projectId: string, paths: string[]) => void;
  readonly index: (projectId: string) => TaskIndexRow[];
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
        /** Its events reach its conversation, which takes the reports of attempts nobody asked for. */
        eventsOn: boolean;
        /** It starts attempts on its own (dispatch.ts), while its events are on. */
        dispatch: boolean;
        id: string;
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
  /** Project folder files its attempt's brief carries (`context:`), the conversation's pick. */
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

/** The project's stages.md as it stands; undefined while it has none, the folder's refusal when it does not read. */
export const stagesFileOf = async (projectId: string) => {
  const file = await readFolderFile(projectId, STAGES_FILE);
  if (file instanceof ElysiaStatus) {
    return file.status === 404 ? undefined : file;
  }
  return file.content;
};
const DEFAULT_TEMPLATE: StagesTemplate = "code";

/**
 * Whether `project`, one the hub keeps, is set up, read at once where a
 * read can't wait (Needs you's href, a show of its setup page: core
 * `setupLanding`): its folder holds stages.md, or its row a template.
 * {@link stagesOf} answers source `none` for the rest, but for a project
 * whose task files stand in for a template, which it records at its first
 * read. A project the hub does not keep (undefined) is not set up.
 */
export const isSetUp = (
  project: { id: string; template: string | null } | undefined
): boolean =>
  project !== undefined &&
  (!!project.template ||
    existsSync(join(storedProjectRoot(project), STAGES_FILE)));

/** A project not set up yet reads as stages.md with no stages ({@link stagesOf}). */
const NOT_SET_UP: StagesReading = {
  ok: true,
  stages: { stages: [], moves: [], views: [] },
};

/** Takes stages.md away, so the project reads the code template; one without it has nothing to take. */
/**
 * The files of `types` a template defines that the project has no file
 * for (template-types.ts): what applying a template and filling a project's
 * types both write.
 */
const missingTypes = async (projectId: string, types: readonly string[]) => {
  const none: { content: string; path: string }[] = [];
  if (types.length === 0) {
    return none;
  }
  const names = await folderFileNames(projectId, "delegates");
  if (names instanceof ElysiaStatus) {
    return names;
  }
  return typeFiles(types, new Set(names));
};

const removeStages = async (projectId: string, options: FolderWriteOptions) => {
  const deleted = await deleteFolderFile(projectId, STAGES_FILE, options);
  if (deleted instanceof ElysiaStatus && deleted.status !== 404) {
    return deleted;
  }
};

/** tasks/ as the folder lists it, empty while there is none; the folder's refusal otherwise. */
const taskListing = async (projectId: string) => {
  const listed = await listFolder(projectId, "tasks");
  if (!(listed instanceof ElysiaStatus) || listed.status !== 404) {
    return listed;
  }
  const none: FolderListing = { entries: [], truncated: false, path: "tasks" };
  return none;
};

/** A folder file's text as the tasks read it, or the folder's refusal. */
const taskText = async (projectId: string, path: string) => {
  const file = await readFolderFile(projectId, path);
  return file instanceof ElysiaStatus ? file : file.content;
};

const hashOf = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

const WEB_LINK = /^https?:\/\//iu;

/** The refusal of a file or a post a result hands in that is neither one of the task's `outputs` nor in the project folder, or a post that is no `*.post.json`. */
const fileProblem = async (
  projectId: string,
  outputs: string[],
  artifact: Extract<ResultArtifact, { path: string }>
) => {
  const path = folderPath(artifact.path);
  if (path instanceof ElysiaStatus) {
    return path;
  }
  if (artifact.kind === "post" && !path.endsWith(".post.json")) {
    return problem(422, {
      code: "task-result-post-unfit",
      detail: `${path} is no post: a post is a <task>.post.json file.`,
    });
  }
  if (outputs.includes(path)) {
    return;
  }
  const there = await folderFileRaw(projectId, path).catch(() => undefined);
  if (there === undefined || there instanceof ElysiaStatus) {
    return problem(422, {
      code: "task-result-file-unknown",
      detail: `${path} is neither one of the task's outputs nor a file in the project folder. Name it as the task's outputs do, from the folder's root.`,
    });
  }
};

/**
 * The refusal of an artifact a result may not hand in, in a sentence naming
 * it: a file or a post that is neither one of the task's `outputs` nor in
 * the project folder, a post that is no `*.post.json`, a link that is not
 * http(s); nothing when it may.
 */
const artifactProblem = async (
  projectId: string,
  outputs: string[],
  artifact: ResultArtifact
) => {
  if (artifact.kind === "link") {
    return WEB_LINK.test(artifact.url)
      ? undefined
      : problem(422, {
          code: "task-result-link-unfit",
          detail: `${artifact.url} is not an http(s) link.`,
        });
  }
  if (artifact.kind === "artifact") {
    return artifact.artifactId.trim()
      ? undefined
      : problem(422, {
          code: "task-result-artifact-unnamed",
          detail: "Name the artifact by its id.",
        });
  }
  return await fileProblem(projectId, outputs, artifact);
};

// --- what a caller may write ------------------------------------------------------

const oneLine = (what: string, text: string, limit: number) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return problem(400, {
      code: "task-words-empty",
      detail: `The ${what} is empty; write a few words.`,
    });
  }
  if (LINE_BREAK.test(trimmed)) {
    return problem(400, {
      code: "task-words-line-break",
      detail: `The ${what} is one line; take out the line break.`,
    });
  }
  if (trimmed.length > limit) {
    return problem(400, {
      code: "task-words-too-long",
      detail: `The ${what} is ${trimmed.length} characters long; it stops at ${limit}.`,
    });
  }
  return trimmed;
};

/** A description or acceptance criteria: free text that must not open a section of its own. */
const block = (what: string, text: string) => {
  if (text.length > TEXT_LIMIT) {
    return problem(400, {
      code: "task-text-too-long",
      detail: `The ${what} is ${text.length} characters long; it stops at ${TEXT_LIMIT}.`,
    });
  }
  if (SECTION_LINE.test(text)) {
    return problem(400, {
      code: "task-text-heading",
      detail: `The ${what} holds a "## " heading, which would start a section of its own in the task file; use "### " inside it.`,
    });
  }
  return text.trim();
};

const todoText = (text: string) => {
  const line = oneLine("to-do", text, TODO_LIMIT);
  if (!(line instanceof ElysiaStatus) && TODO_MARKER_START.test(line)) {
    return problem(400, {
      code: "task-todo-marker",
      detail:
        "A to-do's text cannot start with an id marker like [td-3]; the hub numbers to-dos itself.",
    });
  }
  return line;
};

/** Each of `list`'s to-dos' texts, read; the first refusal when one cannot stand. */
const todoTexts = (list: readonly string[]) => {
  const texts: string[] = [];
  for (const text of list) {
    const line = todoText(text);
    if (line instanceof ElysiaStatus) {
      return line;
    }
    texts.push(line);
  }
  return texts;
};

const items = (what: string, list: string[]) => {
  const kept = new Set<string>();
  for (const item of list) {
    const line = oneLine(`${what} item`, item, ITEM_LIMIT);
    if (line instanceof ElysiaStatus) {
      return line;
    }
    kept.add(line);
  }
  return [...kept];
};

/** External items' URLs a caller gave, each one a source's item (core `refOfUrl`); refused in words when one is not. */
const linksOf = (links: string[]) => {
  const urls = items("links", links);
  const unknown =
    urls instanceof ElysiaStatus
      ? undefined
      : urls.find((url) => !refOfUrl(url));
  return unknown === undefined
    ? urls
    : problem(400, {
        code: "task-link-unknown",
        detail: `“${unknown}” is not a GitHub issue, pull request or discussion, or a Linear issue: link one by its URL.`,
      });
};

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
const budgetOf = (budget: WorkBudget) => {
  const misfit = budgetProblem(budget);
  return misfit
    ? problem(400, { code: "task-budget-unfit", detail: misfit })
    : budget;
};

/** Owned globs a caller gave, refused when one cannot stand. */
const ownsOf = (owns: string[]) => {
  const misfit = ownsProblem(owns);
  return misfit
    ? problem(400, { code: "task-owns-unfit", detail: misfit })
    : items("owns", owns);
};

/** A draft's group, owned files and budget as its file's fields; the first refusal when one cannot stand. */
const limitsOf = (draft: TaskDraft) => {
  const group = draft.group ? oneLine("group", draft.group, 64) : null;
  if (group instanceof ElysiaStatus) {
    return group;
  }
  const owns = ownsOf(draft.owns ?? []);
  if (owns instanceof ElysiaStatus) {
    return owns;
  }
  const budget = draft.budget ? budgetOf(draft.budget) : null;
  if (budget instanceof ElysiaStatus) {
    return budget;
  }
  const limits: Pick<TaskFields, "budget" | "group" | "owns"> = {
    group,
    owns,
    budget,
  };
  return limits;
};

const typeName = (type: string) => {
  const name = type.trim();
  return TYPE_NAME.test(name)
    ? name
    : problem(400, {
        code: "task-type-name-unfit",
        detail: `“${type}” is not a delegate type name: letters, digits, ".", "_" and "-", up to 64.`,
      });
};

const stageName = (stage: string) => {
  const name = stage.trim();
  return STAGE_NAME.test(name)
    ? name
    : problem(400, {
        code: "task-stage-name-unfit",
        detail: `“${stage}” is not a stage name: lowercase letters, digits, "_" and "-", starting with a letter.`,
      });
};

const OWN_FIELDS: ReadonlySet<string> = new Set(TASK_FIELDS);

/** One field a caller gave for a key a task file does not know, read; refused when its key or value cannot stand. */
const extraFieldOf = (key: string, value: ExtraValue) => {
  if (!EXTRA_KEY.test(key)) {
    return problem(400, {
      code: "task-field-name-unfit",
      detail: `“${key}” is not a field name: letters, digits, "_" and "-", starting with a letter or "_".`,
    });
  }
  if (OWN_FIELDS.has(key)) {
    return problem(400, {
      code: "task-field-own",
      detail: `${key} is one of a task file's own fields; set it through its own parameter, not fields.`,
    });
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? items(key, value) : [];
  }
  return value.trim() ? oneLine(key, value, ITEM_LIMIT) : "";
};

/**
 * Fields a caller gave for keys a task file does not know: each key a bare
 * YAML key outside a task file's own, each value one line or a list of them
 * ("" or [] takes the field out). The first refusal when one cannot stand.
 */
const extraFieldsOf = (fields: Record<string, ExtraValue>) => {
  const entries = Object.entries(fields);
  if (entries.length > LIST_LIMIT) {
    return problem(400, {
      code: "task-fields-too-many",
      detail: `fields holds ${entries.length} fields; it stops at ${LIST_LIMIT}.`,
    });
  }
  const read: [string, ExtraValue][] = [];
  for (const [key, value] of entries) {
    const field = extraFieldOf(key, value);
    if (field instanceof ElysiaStatus) {
      return field;
    }
    read.push([key, field]);
  }
  return read;
};

const COMMENT_ENTRY_LINE = /^###\s/mu;

/** A comment's text: markdown that opens neither a section nor a comment entry of its own. */
const commentText = (text: string) => {
  const written = block("comment", text);
  if (written instanceof ElysiaStatus) {
    return written;
  }
  if (!written) {
    return problem(400, {
      code: "task-comment-empty",
      detail: "The comment is empty; write a few words.",
    });
  }
  if (COMMENT_ENTRY_LINE.test(written)) {
    return problem(400, {
      code: "task-comment-heading",
      detail:
        'The comment holds a "### " heading, which would start a comment entry of its own; use "#### " inside it.',
    });
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
 * How an attempt ended when it did not land, how the follow-up of one
 * that landed ended without landing (a done item's `error`, work-items.ts
 * `finish`), or that one that landed was sent back unmet (dispatch.ts
 * `judgeCriteria`) ({@link TaskAttempt.endedHow}).
 */
const endedHowOf = (
  item: ReturnType<TaskStore["attempts"]>[number]
): string | null => {
  if (item.state === "done" && item.unmetAt && !item.error) {
    return judgedWords.unmetHow;
  }
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

/** A task reference a caller gave, as its id (`tsk-12`) and number; refused when it names none. */
const taskNumbered = (what: string, ref: string) => {
  const number = taskNumber(ref);
  return number === undefined
    ? problem(400, {
        code: "task-id-unfit",
        detail: `${what}: “${ref}” is not a task id; tasks are named like tsk-12.`,
      })
    : { id: taskId(number), number };
};

/** A task reference a caller gave, as `tsk-12`; refused when it names none. */
const taskRef = (what: string, ref: string) => {
  const asked = taskNumbered(what, ref);
  return asked instanceof ElysiaStatus ? asked : asked.id;
};

/** Task files' names, each with its task's number; a name that is no task file's is left out. */
const withNumbers = (names: readonly string[]) =>
  names.flatMap((name) => {
    const number = fileTaskNumber(name);
    return number === undefined ? [] : [{ name, number }];
  });

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

/** Sets one field of a task file through `apply`, and notes it in `changed`: what a patch changed, for its commit message. */
const setField = (changed: string[], name: string, apply: () => void) => {
  apply();
  changed.push(name);
};

/** A patch's words (title, description, acceptance criteria) set; the first refusal when one cannot stand. */
const patchWords = (doc: TaskDoc, patch: TaskPatch, changed: string[]) => {
  const { title, description, acceptance } = patch;
  const line =
    title === undefined ? undefined : oneLine("title", title, TITLE_LIMIT);
  if (line instanceof ElysiaStatus) {
    return line;
  }
  const text =
    description === undefined ? undefined : block("description", description);
  if (text instanceof ElysiaStatus) {
    return text;
  }
  const criteria =
    acceptance === undefined
      ? undefined
      : block("acceptance criteria", acceptance);
  if (criteria instanceof ElysiaStatus) {
    return criteria;
  }
  if (line !== undefined) {
    setField(changed, "title", () => doc.setTitle(line));
  }
  if (text !== undefined) {
    setField(changed, "description", () => doc.setDescription(text));
  }
  if (criteria !== undefined) {
    setField(changed, "acceptance criteria", () => doc.setAcceptance(criteria));
  }
};

/** A patch's type and rank set; the first refusal when one cannot stand. */
const patchNames = (doc: TaskDoc, patch: TaskPatch, changed: string[]) => {
  const { type, rank } = patch;
  const name = type ? typeName(type) : null;
  if (name instanceof ElysiaStatus) {
    return name;
  }
  const ranked = rank ? oneLine("rank", rank, 64) : null;
  if (ranked instanceof ElysiaStatus) {
    return ranked;
  }
  if (type !== undefined) {
    setField(changed, "type", () => doc.setField("type", name));
  }
  if (rank !== undefined) {
    setField(changed, "rank", () => doc.setField("rank", ranked));
  }
};

/** A patch's lands, runs_on, group and budget set; the first refusal when one cannot stand. */
const patchLimits = (doc: TaskDoc, patch: TaskPatch, changed: string[]) => {
  const { lands, runsOn, group, budget } = patch;
  const grouped = group ? oneLine("group", group, 64) : null;
  if (grouped instanceof ElysiaStatus) {
    return grouped;
  }
  const limit = budget ? budgetOf(budget) : null;
  if (limit instanceof ElysiaStatus) {
    return limit;
  }
  if (lands !== undefined) {
    setField(changed, "lands", () => doc.setField("lands", lands));
  }
  if (runsOn !== undefined) {
    setField(changed, "runs_on", () => doc.setField("runs_on", runsOn));
  }
  if (group !== undefined) {
    setField(changed, "group", () => doc.setField("group", grouped));
  }
  if (budget !== undefined) {
    setField(changed, "budget", () => doc.setField("budget", limit));
  }
};

/** A patch's owns and links set; the first refusal when one cannot stand. */
const patchReach = (doc: TaskDoc, patch: TaskPatch, changed: string[]) => {
  const owns = patch.owns === undefined ? undefined : ownsOf(patch.owns);
  if (owns instanceof ElysiaStatus) {
    return owns;
  }
  const links = patch.links === undefined ? undefined : linksOf(patch.links);
  if (links instanceof ElysiaStatus) {
    return links;
  }
  if (owns !== undefined) {
    setField(changed, "owns", () => doc.setField("owns", owns));
  }
  if (links !== undefined) {
    setField(changed, "links", () => doc.setField("links", links));
  }
};

/** A patch's lists (checks, outputs, context, labels) and the fields a task file does not know set; the first refusal when one cannot stand. */
const patchLists = (doc: TaskDoc, patch: TaskPatch, changed: string[]) => {
  for (const field of [
    "checks",
    "outputs",
    "context",
    "labels",
  ] as const satisfies readonly TaskField[]) {
    const list = patch[field];
    const read = list === undefined ? undefined : items(field, list);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    if (read !== undefined) {
      setField(changed, field, () => doc.setField(field, read));
    }
  }
  const extra = extraFieldsOf(patch.fields ?? {});
  if (extra instanceof ElysiaStatus) {
    return extra;
  }
  for (const [key, value] of extra) {
    setField(changed, key, () => doc.setExtra(key, value));
  }
};

/** Applies a patch to a task file; answers what it changed, for the commit message, or the refusal of the first field that cannot stand. */
const applyPatch = (doc: TaskDoc, patch: TaskPatch) => {
  const changed: string[] = [];
  const refused =
    patchWords(doc, patch, changed) ??
    patchNames(doc, patch, changed) ??
    patchLimits(doc, patch, changed) ??
    patchReach(doc, patch, changed) ??
    patchLists(doc, patch, changed);
  return refused ?? `update ${changed.join(", ") || "nothing"}`;
};

/** A to-do change the file could not make, as the caller's refusal. */
const found = (misfit: string | undefined) =>
  misfit === undefined
    ? undefined
    : problem(404, { code: "task-todo-unknown", detail: misfit });

/** Ticks or unticks `refs`; what it did, for the commit, or the refusal of a to-do the file does not have. */
const mark = (doc: TaskDoc, refs: string[] | undefined, done: boolean) => {
  if (!refs?.length) {
    return;
  }
  for (const ref of refs) {
    const missing = found(doc.tickTodo(ref, done));
    if (missing) {
      return missing;
    }
  }
  return `${done ? "tick" : "untick"} ${refs.join(", ")}`;
};

/** Rewords to-dos; what it did, for the commit, or the first refusal. */
const reword = (doc: TaskDoc, edits: TodoChanges["edit"], said: string[]) => {
  for (const { todo, text } of edits ?? []) {
    const line = todoText(text);
    if (line instanceof ElysiaStatus) {
      return line;
    }
    const missing = found(doc.editTodo(todo, line));
    if (missing) {
      return missing;
    }
    said.push(`reword ${todo}`);
  }
};

/** Adds to-dos; what it did, for the commit, or the first refusal. */
const addTodos = (doc: TaskDoc, adds: TodoChanges["add"], said: string[]) => {
  const added: string[] = [];
  for (const { text, under, proposed } of adds ?? []) {
    const line = todoText(text);
    if (line instanceof ElysiaStatus) {
      return line;
    }
    const done = doc.addTodo(line, under, proposed);
    if (typeof done === "string") {
      return problem(404, { code: "task-todo-unknown", detail: done });
    }
    added.push(done.id);
  }
  if (added.length > 0) {
    said.push(`add ${added.join(", ")}`);
  }
};

/** Applies to-do changes: rewords, ticks, unticks, then adds (adds never renumber a position); the first refusal when one cannot be made. */
const applyTodos = (doc: TaskDoc, changes: TodoChanges) => {
  const said: string[] = [];
  const reworded = reword(doc, changes.edit, said);
  if (reworded) {
    return reworded;
  }
  for (const done of [
    mark(doc, changes.tick, true),
    mark(doc, changes.untick, false),
  ]) {
    if (done instanceof ElysiaStatus) {
      return done;
    }
    if (done) {
      said.push(done);
    }
  }
  const adding = addTodos(doc, changes.add, said);
  if (adding) {
    return adding;
  }
  return said.length === 0
    ? problem(400, {
        code: "task-todos-none",
        detail: "Name a to-do to tick, untick, add or reword.",
      })
    : said.join("; ");
};

const stagesView = (
  source: StagesSource,
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
const moverOf = (author: string): Mover =>
  author === YOU.name ? "you" : "session";

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

/**
 * The commit that takes a folded duplicate's tasks in (`adopt`), under
 * their new ids: its `CawCo-Change: merge` trailer is what tells a fold
 * afterwards (project-trash.ts).
 */
const mergedInMessage = (
  actor: TaskActor,
  ids: readonly string[],
  from: string
): string =>
  commitMessage(
    actor,
    `tasks ${ids.join(", ")}`,
    `${from}'s ${ids.length === 1 ? "task" : "tasks"}, merged in`,
    { change: CHANGES.merge }
  );

/** The longest reason a move takes. */
const REASON_LIMIT = 500;

export const createTasks = (store: TaskStore) => {
  /** The refusal of your approval, with its line, while the store says it cannot go. */
  const approvable = async (projectId: string, id: string) => {
    const held = await store.approvalRefusal?.(projectId, id);
    return held
      ? problem(409, { code: "task-approval-held", detail: held })
      : undefined;
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
  const runsOnChecked = (value: string) => {
    const checked = runsOnValue(value, store.machines());
    return "value" in checked
      ? checked.value
      : problem(400, { code: "task-runs-on-unknown", detail: checked.problem });
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

  /** The project's attempts the hub sent back unmet (work_items `unmetAt`), by id. */
  const unmetIn = (projectId: string): Set<string> =>
    new Set(
      store
        .attempts(projectId)
        .filter((item) => item.unmetAt)
        .map((item) => item.id)
    );

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
    /** The attempts the hub sent back unmet: each counts as failed ({@link unmetIn}). */
    unmet: Set<string>;
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
      unmet: unmetIn(projectId),
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
      // An attempt sent back unmet counts as failed: dispatch leaves the
      // task to its starter, who retries it or moves on.
      lastAttemptFailed:
        (last?.state === "failed" ||
          (last !== undefined && context.unmet.has(last.workItemId))) &&
        open,
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
  ) => {
    const folder = await folderFileTimes(projectId, "tasks");
    if (folder instanceof ElysiaStatus) {
      return folder;
    }
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
      if (uncommitted instanceof ElysiaStatus) {
        return uncommitted;
      }
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
    const read: { gone: ReadonlySet<string>; times: Map<string, TaskTimes> } = {
      gone: goneTasks(folder),
      times: new Map(rows.map((row) => [row.path, recordOf(row)])),
    };
    return read;
  };

  /** The highest task number each project has handed out, once read from its history. */
  const issued = new Map<string, number>();

  /** Whether the project starts attempts on its own: its dispatch and its Caw are on (dispatch.ts). */
  const dispatches = (projectId: string): boolean => {
    const project = store.project(projectId);
    return !!(project?.dispatch && project.eventsOn);
  };

  /** Whether an attempt at the task is starting or running. */
  const liveAt = (projectId: string, id: string): boolean =>
    store
      .attempts(projectId)
      .some((item) => item.taskId === id && isLive(item.state));

  /** The project's tracker; refused for a project the hub does not keep. */
  const known = (projectId: string) => {
    const project = store.project(projectId);
    return project
      ? project.tracker
      : problem(404, {
          code: "task-project-unknown",
          detail: `The hub keeps no project ${projectId}.`,
        });
  };

  /** The refusal of a task write whose project was deleted since the change began. */
  const stands = (projectId: string) =>
    store.project(projectId)
      ? undefined
      : problem(404, {
          code: "task-project-deleted",
          detail: `The project "${projectId}" was deleted, so its tasks can't change. Pick another.`,
        });

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
  const hubRecord = async (projectId: string, path: string) => {
    const folder = await folderFileTimes(projectId, "tasks");
    if (folder instanceof ElysiaStatus) {
      return folder;
    }
    const entry = folder.times.get(path);
    const made = entry
      ? historyOf(entry).findLast(
          (event) => event.actor.mover !== null && event.kind !== "deleted"
        )
      : undefined;
    const record = made
      ? await readFolderFileAt(projectId, made.commit, made.path)
      : undefined;
    if (record instanceof ElysiaStatus) {
      return record;
    }
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
  ) => {
    const written = new TaskDoc(path, content).read().comments;
    const kept = record ?? (await hubRecord(projectId, path));
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    const comments: { lines: string[] | undefined } | undefined =
      JSON.stringify(written) === JSON.stringify(kept?.read().comments ?? [])
        ? undefined
        : { lines: kept?.commentsSection() };
    return comments;
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
  ) => {
    const record = await hubRecord(projectId, path);
    if (record instanceof ElysiaStatus) {
      return record;
    }
    const kept = record?.read().fields.stage;
    const written = new TaskDoc(path, content).read().fields.stage;
    const comments = await strayComments(projectId, path, content, record);
    if (comments instanceof ElysiaStatus) {
      return comments;
    }
    const stage = kept && kept !== written ? { stage: kept } : undefined;
    const fix: Unsettled | undefined =
      comments || stage ? { comments, stage } : undefined;
    return fix;
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
    stagesNow: () => ReturnType<typeof currentStages>
  ) => {
    const stages = row ? undefined : await stagesNow();
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const [start, comments] = await Promise.all([
      row ? undefined : strayStart(projectId, path, content, stages),
      strayComments(projectId, path, content),
    ]);
    if (comments instanceof ElysiaStatus) {
      return comments;
    }
    const stage = strayStage(row, path, content);
    const fix: Unsettled | undefined =
      start || comments || stage ? { start, comments, stage } : undefined;
    return fix;
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
  ) => {
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
    const history =
      fix.start?.who === undefined
        ? await folderHistory(projectId, path, 1).catch(() => undefined)
        : undefined;
    const who =
      fix.start?.who ??
      // A history the folder does not read names no one, as one it fails to.
      ((history instanceof ElysiaStatus ? undefined : history)?.commits[0]
        ?.author ||
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
  ) => {
    const id = taskId(number);
    const { restored, said, why, moved } = await settledDoc(
      projectId,
      path,
      content,
      fix
    );
    const gone = stands(projectId);
    if (gone) {
      return gone;
    }
    const actor = hubActor(why);
    const written = await writeFolderFile(projectId, path, restored, {
      author: actor.author,
      message: commitMessage(actor, `task ${id}`, said, {
        ...(moved ? { stage: moved } : {}),
        ...(fix.start ? { change: CHANGES.adopt } : {}),
      }),
    });
    if (written instanceof ElysiaStatus) {
      return written;
    }
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
    const folder = await folderFileTimes(projectId, "tasks").catch(
      () => undefined
    );
    // Times the folder does not read are none, as times it fails to read.
    const changes = (
      folder instanceof ElysiaStatus ? undefined : folder
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
   * as written meanwhile. A refusal is said in the log, as a failure is.
   */
  const queueSettle = (projectId: string, path: string, number: number) => {
    const key = `${projectId}\0${path}`;
    if (settling.has(key)) {
      return;
    }
    settling.add(key);
    const what = `task ${path} settle`;
    detach(
      inTurn(projectId, async () => {
        try {
          const refused = await settleQueued(projectId, path, number);
          if (refused) {
            console.warn(`[${what}] failed: ${refused.response.detail}`);
          }
        } finally {
          settling.delete(key);
        }
      }),
      what
    );
  };

  /** {@link queueSettle}'s work in the turn: the file settled, or indexed as it stands; the refusal that stopped it. */
  const settleQueued = async (
    projectId: string,
    path: string,
    number: number
  ) => {
    const file = await readFolderFile(projectId, path);
    if (file instanceof ElysiaStatus) {
      return file;
    }
    const { content } = file;
    const row = store.index(projectId).find((each) => each.path === path);
    const fix = await unsettledOf(projectId, path, content, row, () =>
      currentStages(projectId)
    );
    if (fix instanceof ElysiaStatus) {
      return fix;
    }
    if (fix) {
      const settled = await settle(projectId, path, number, content, fix);
      return settled instanceof ElysiaStatus ? settled : undefined;
    }
    if (row?.hash !== hashOf(content)) {
      const gone = stands(projectId);
      if (gone) {
        return gone;
      }
      store.put([indexRow(projectId, path, number, content, hashOf(content))]);
    }
  };

  /**
   * Reads every task file and re-indexes the ones whose content changed since
   * the index last saw them; forgets rows whose files are gone. Answers the
   * index and what in tasks/ could not be listed.
   */
  const sync = async (projectId: string) => {
    const problems: string[] = [];
    const listing = await taskListing(projectId);
    if (listing instanceof ElysiaStatus) {
      return listing;
    }
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
    let stages: ReturnType<typeof currentStages> | undefined;
    const stagesNow = () => {
      stages ??= currentStages(projectId);
      return stages;
    };
    const read = await Promise.all(
      files.map(async ({ path, number }) => {
        const file = await readFolderFile(projectId, path);
        if (file instanceof ElysiaStatus) {
          problems.push(file.response.detail);
          return;
        }
        const { content } = file;
        const hash = hashOf(content);
        const row = indexed.get(path);
        if (row?.hash === hash) {
          return;
        }
        const fix = await unsettledOf(projectId, path, content, row, stagesNow);
        if (fix instanceof ElysiaStatus) {
          problems.push(fix.response.detail);
          return;
        }
        if (fix) {
          queueSettle(projectId, path, number);
          return;
        }
        return indexRow(projectId, path, number, content, hash);
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
    const synced: { problems: string[]; rows: TaskIndexRow[] } = {
      rows,
      problems,
    };
    return synced;
  };

  /** The archived files in tasks/archive/, by name; none while there is no archive. */
  const archivedNames = async (projectId: string) => {
    const names = await folderFileNames(projectId, ARCHIVE_DIR);
    return names instanceof ElysiaStatus ? names : withNumbers(names);
  };

  /** The archived file of task `number`, as the disk holds it; undefined when it is not archived. */
  const archivedFile = async (projectId: string, number: number) => {
    const names = await archivedNames(projectId);
    if (names instanceof ElysiaStatus) {
      return names;
    }
    const archived = names.find((each) => each.number === number);
    return archived ? `${ARCHIVE_DIR}/${archived.name}` : undefined;
  };

  /**
   * The file a reference names, catching up the index when it does not know
   * it yet; an archived task's file in tasks/archive/ when the board has none,
   * which a change is refused. Two files claiming one id read as the first; a
   * change to it is refused until one is renamed.
   */
  const locate = async (projectId: string, ref: string, forChange = false) => {
    const number = taskNumber(ref);
    if (number === undefined) {
      return problem(400, {
        code: "task-id-unfit",
        detail: `“${ref}” is not a task id; tasks are named like tsk-12.`,
      });
    }
    const find = (rows: TaskIndexRow[]) =>
      rows.filter((row) => row.number === number);
    let claims = find(store.index(projectId));
    if (claims.length === 0) {
      const synced = await sync(projectId);
      if (synced instanceof ElysiaStatus) {
        return synced;
      }
      claims = find(synced.rows);
    }
    const [first] = claims;
    if (!first) {
      return await archivedPlace(projectId, number, forChange);
    }
    if (forChange && claims.length > 1) {
      return problem(409, {
        code: "task-claimed-twice",
        detail: `${taskId(number)} is claimed by ${claims.length} files (${claims.map((row) => row.path).join(", ")}); rename all but one before changing it.`,
      });
    }
    const place: { number: number; path: string } = {
      path: first.path,
      number,
    };
    return place;
  };

  /** Where {@link locate} finds task `number` off the board: its archived file, which a change is refused; refused when it is not archived either. */
  const archivedPlace = async (
    projectId: string,
    number: number,
    forChange: boolean
  ) => {
    const archived = await archivedFile(projectId, number);
    if (archived instanceof ElysiaStatus) {
      return archived;
    }
    if (!archived) {
      return problem(404, {
        code: "task-missing",
        detail: `The project has no task ${taskId(number)}.`,
      });
    }
    if (forChange) {
      return problem(409, {
        code: "task-archived",
        detail: `${taskId(number)} is archived (${archived}), so it does not change; it is kept as it was.`,
      });
    }
    const place: { number: number; path: string } = { path: archived, number };
    return place;
  };

  /**
   * The archived tasks' rows, read from their files in tasks/archive/ as the
   * index would hold them; kept out of the index, which is the board's.
   */
  const archivedRows = async (projectId: string) => {
    const names = await archivedNames(projectId);
    if (names instanceof ElysiaStatus) {
      return names;
    }
    const read = await Promise.all(
      names.map(async ({ name, number }) => {
        const path = `${ARCHIVE_DIR}/${name}`;
        const file = await readFolderFile(projectId, path);
        return file instanceof ElysiaStatus
          ? file
          : indexRow(
              projectId,
              path,
              number,
              file.content,
              hashOf(file.content)
            );
      })
    );
    const rows: TaskIndexRow[] = [];
    for (const row of read) {
      if (row instanceof ElysiaStatus) {
        return row;
      }
      rows.push(row);
    }
    return rows;
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
        const file = await readFolderFile(projectId, task.path).catch(
          () => undefined
        );
        // A file not read says nothing, as one that failed to read.
        const content =
          file === undefined || file instanceof ElysiaStatus
            ? ""
            : file.content;
        return new TaskDoc(task.path, content)
          .read()
          .description.toLowerCase()
          .includes(words);
      })
    );
    return tasks.filter((_, index) => kept[index]);
  };

  /** Every task id the project's index knows, for edge checks. */
  const ids = async (projectId: string) => {
    const synced = await sync(projectId);
    return synced instanceof ElysiaStatus
      ? synced
      : new Set(synced.rows.map((row) => row.id));
  };

  /** Edge `ref` as `tsk-…`, a task the project has (in `have`); refused otherwise. */
  const edgeTarget = (
    have: ReadonlySet<string>,
    edge: string,
    ref: string,
    self?: string
  ) => {
    const number = taskNumber(ref);
    if (number === undefined) {
      return problem(400, {
        code: "task-id-unfit",
        detail: `${edge}: “${ref}” is not a task id; tasks are named like tsk-12.`,
      });
    }
    const id = taskId(number);
    if (id === self) {
      return problem(400, {
        code: "task-edge-self",
        detail: `${self} cannot be ${edge} itself.`,
      });
    }
    return have.has(id)
      ? id
      : problem(404, {
          code: "task-edge-missing",
          detail: `${edge}: the project has no task ${id}.`,
        });
  };

  /** An edge as `tsk-…`, a task the project has; null for none given. */
  const single = async (
    projectId: string,
    edge: string,
    ref: string | undefined
  ) => {
    if (!ref) {
      return null;
    }
    const have = await ids(projectId);
    return have instanceof ElysiaStatus ? have : edgeTarget(have, edge, ref);
  };

  /** The ids of the project's archived tasks. */
  const archivedIds = async (projectId: string) => {
    const names = await archivedNames(projectId);
    return names instanceof ElysiaStatus
      ? names
      : new Set(names.map(({ number }) => taskId(number)));
  };

  /** A wait `one` as `actor`'s reader reads it, as a file keeps it: a task the board or the archive has (`have`, `archived`); refused otherwise. */
  const waitFor = (
    one: string,
    reader: WaitReader,
    have: ReadonlySet<string>,
    archived: ReadonlySet<string>
  ) => {
    const read = readWait(one, reader);
    if (read instanceof ElysiaStatus) {
      return problem(400, {
        code: read.response.code,
        detail: `waits_on: ${read.response.detail}`,
      });
    }
    if (read.kind === "task" && !(have.has(read.id) || archived.has(read.id))) {
      return problem(404, {
        code: "task-wait-missing",
        detail: `waits_on: the project has no task ${read.id}.`,
      });
    }
    return waitHandle(read);
  };

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
  ) => {
    const handles = new Set<string>();
    if (written.length === 0) {
      return [...handles];
    }
    const reader = store.waitReader(projectId, actor);
    const have = await ids(projectId);
    if (have instanceof ElysiaStatus) {
      return have;
    }
    const archived = await archivedIds(projectId);
    if (archived instanceof ElysiaStatus) {
      return archived;
    }
    const listed = items("waits_on", written);
    if (listed instanceof ElysiaStatus) {
      return listed;
    }
    for (const one of listed) {
      const handle = waitFor(one, reader, have, archived);
      if (handle instanceof ElysiaStatus) {
        return handle;
      }
      handles.add(handle);
    }
    return [...handles];
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
   * The refusal of a write to task `id` that would close a cycle of waits
   * or parts (`changed`, its fields as they would stand), naming the path
   * by each task's link; nothing changes.
   */
  const refuseCycle = (
    projectId: string,
    id: string,
    changed: { partOf: string | null; waitsOn: string[] }
  ) => {
    const rows = store.index(projectId);
    const cycle = cycleFrom(id, dependsOn(rows, new Map([[id, changed]])));
    if (!cycle) {
      return;
    }
    const byId = rowsById(rows);
    const path = cycle
      .map((at) => taskLink(projectId, at, byId.get(at)?.title ?? at))
      .join(" → ");
    return problem(409, {
      code: "task-cycle",
      detail: taskLinkWords.cycle(path),
    });
  };

  /**
   * Where a new task was found, as the hub hands it (the filer's running
   * task, or the pin thread its ask came from): a task the project has, or
   * a pin; nothing when it names neither.
   */
  const foundInOf = async (projectId: string, given: string | undefined) => {
    const target = given ? waitTarget(given) : undefined;
    if (target?.kind === "pin") {
      return waitHandle(target);
    }
    if (target?.kind !== "task") {
      return null;
    }
    const have = await ids(projectId);
    if (have instanceof ElysiaStatus) {
      return have;
    }
    return have.has(target.id) ? target.id : null;
  };

  /** Where a new task starts: the stage asked for, if the actor may put it there, else the first todo stage. */
  const startStage = async (
    projectId: string,
    asked: string | undefined,
    actor: TaskActor
  ) => {
    const stages = await usableStages(
      projectId,
      "tell where a new task starts"
    );
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const stage =
      asked === undefined ? firstStage(stages).name : stageName(asked);
    if (stage instanceof ElysiaStatus) {
      return stage;
    }
    if (actor.mover === "action") {
      return problem(403, {
        code: "task-create-by-action",
        detail: "An approved action moves its task; it never files one.",
      });
    }
    const misfit =
      actor.mover === "hub"
        ? hubProblem(stages, stage)
        : startProblem(stages, stage, actor.mover);
    return (
      stageRefusal(stages, stage, misfit) ??
      refuseNobody(projectId, stages, "A new task", "", stage, actor) ??
      stage
    );
  };

  /**
   * One past the highest number anything holds now: a file in tasks/ or
   * tasks/archive/ as the disk has it (committed or not, read with no git), any path the
   * folder's history ever named (read once per commit, folderFileTimes), the
   * index, and what this process handed out; and past `above`. Read at the
   * moment of making a task, inside the project's turn.
   */
  const nextNumber = async (projectId: string, above = 0) => {
    const [folder, names, archived] = await Promise.all([
      folderFileTimes(projectId, "tasks"),
      folderFileNames(projectId, "tasks"),
      archivedNames(projectId),
    ]);
    if (folder instanceof ElysiaStatus) {
      return folder;
    }
    if (names instanceof ElysiaStatus) {
      return names;
    }
    if (archived instanceof ElysiaStatus) {
      return archived;
    }
    const { ever } = folder;
    let highest = Math.max(above, issued.get(projectId) ?? 0);
    for (const name of [
      ...ever,
      ...names,
      ...archived.map((each) => each.name),
    ]) {
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
   * The template a project with no stages.md and no template stands on, read
   * off its folder's task files (the board's, not the archive's): the one
   * whose stages hold every file's stage (stages.ts `templateHolding`), the
   * code template when none does; none while it holds no task file. The
   * files, not the index: the index catches up from them later (as the hub
   * starts, as a forgotten folder comes back), and a read before then would
   * find a project with tasks not set up.
   */
  const templateOfTaskFiles = async (projectId: string) => {
    const all = await folderFileNames(projectId, "tasks");
    if (all instanceof ElysiaStatus) {
      return all;
    }
    const names = all.filter(
      (name) => name.endsWith(".md") && fileTaskNumber(name) !== undefined
    );
    const files = await Promise.all(
      names.map((name) => readFolderFile(projectId, `tasks/${name}`))
    );
    const read: string[] = [];
    for (const [index, file] of files.entries()) {
      // One gone since the listing stands on no board.
      if (file instanceof ElysiaStatus) {
        if (file.status !== 404) {
          return file;
        }
        continue;
      }
      const path = `tasks/${names[index]}`;
      read.push(new TaskDoc(path, file.content).read().fields.stage ?? "");
    }
    const template: StagesTemplate | null =
      read.length === 0 ? null : templateHolding(read.filter(Boolean));
    return template;
  };

  /** The stages {@link stagesOf} answers: where they come from, the text, and how it reads. */
  const stagesAs = (
    source: StagesSource,
    content: string,
    reading: StagesReading
  ) => ({ source, content, reading });

  /**
   * The project's stages as the hub applies them: stages.md as it reads; the
   * template its row records, with its Review before done on top, while it
   * has none; or none at all while it is not set up yet (no stages.md, no
   * template, no task file: Caw's setup page writes them when the person
   * sends it, setup.ts). A project with task files and neither (made before
   * setup wrote its stages, or a folder brought back from the trash with no
   * row, project-trash.ts) is recorded once as the template its tasks stand
   * in ({@link templateOfTaskFiles}), so it keeps them.
   */
  const stagesOf = async (projectId: string) => {
    const file = await readFolderFile(projectId, STAGES_FILE);
    if (!(file instanceof ElysiaStatus)) {
      return stagesAs(
        "file",
        file.content,
        ruled(projectId, readStages(file.content))
      );
    }
    if (file.status !== 404) {
      return file;
    }
    const project = store.project(projectId);
    const template =
      project?.template ??
      (project ? await templateOfTaskFiles(projectId) : null);
    if (template instanceof ElysiaStatus) {
      return template;
    }
    if (!template) {
      return stagesAs("none", "", NOT_SET_UP);
    }
    if (!project?.template) {
      store.setTemplate(projectId, template);
      console.info(
        `[tasks] project ${projectId} had task files and no stages; it is recorded as the ${template} template, whose stages they stand in.`
      );
    }
    return stagesAs(
      "template",
      templateText(template),
      ruled(projectId, { ok: true, stages: templateStages(template) })
    );
  };

  /**
   * A stages.md that names the retired mover (stages.ts
   * `withRetiredMoverAsSession`) is written again with a session in its
   * place, once, as the hub: the project's conversation moves as a session.
   */
  const retireMover = async (projectId: string) => {
    const content = await stagesFileOf(projectId);
    if (content instanceof ElysiaStatus) {
      return content;
    }
    const next =
      content === undefined ? null : withRetiredMoverAsSession(content);
    if (next === null) {
      return;
    }
    const written = await writeFolderFile(projectId, STAGES_FILE, next, {
      author: { name: AUTHOR.hub },
      message:
        "stages: the project's conversation moves as a session, so its moves are a session's",
    });
    if (written instanceof ElysiaStatus) {
      return written;
    }
    console.info(
      `[tasks] project ${projectId}'s stages.md named the project's conversation as a mover of its own; a session makes those moves now.`
    );
  };

  /**
   * A stages.md that is the code template, now or as it was (stages.ts
   * `isCodeTemplate`), goes: the project reads the hub's code template,
   * so it follows the template and its Review before done. A project's own
   * stages stay, and so does the file of one whose row records another
   * template, which it would read in the file's place ({@link stagesOf}).
   */
  const dropTemplateCopy = async (projectId: string) => {
    const content = await stagesFileOf(projectId);
    if (content instanceof ElysiaStatus) {
      return content;
    }
    const template = store.project(projectId)?.template ?? null;
    if (
      !(content !== undefined && isCodeTemplate(content)) ||
      (template !== null && template !== DEFAULT_TEMPLATE)
    ) {
      return;
    }
    if (template === null) {
      store.setTemplate(projectId, DEFAULT_TEMPLATE);
    }
    const deleted = await deleteFolderFile(projectId, STAGES_FILE, {
      message:
        "stages: the code template, as the hub has it; Review before done is the project's own setting",
    });
    if (deleted instanceof ElysiaStatus) {
      return deleted;
    }
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
  const fillTypes = async (projectId: string) => {
    const read = await stagesOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const { reading } = read;
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
    if (writes instanceof ElysiaStatus) {
      return writes;
    }
    if (writes.length === 0) {
      return;
    }
    const names = writes.map((write) => write.path).join(", ");
    const written = await writeFolderFiles(projectId, writes, {
      author: { name: AUTHOR.hub },
      message: `delegates: ${names}, which its stages run or its template's skills file tasks with, and nothing defined (by hub)`,
    });
    if (written instanceof ElysiaStatus) {
      return written;
    }
    console.info(
      `[tasks] project ${projectId}: wrote ${names}, which its stages run or its template's skills file tasks with, and nothing defined.`
    );
  };

  /** {@link fillTypes} in the project's turn; a failure or a refusal is said, never thrown. */
  const fillTypesSoon = (projectId: string): void => {
    const unfilled = (why: string) =>
      console.warn(
        `[tasks] project ${projectId}'s delegate types were not filled: ${why}`
      );
    detach(
      inTurn(projectId, () => fillTypes(projectId)).then(
        (refused) => {
          if (refused) {
            unfilled(refused.response.detail);
          }
        },
        (error: unknown) =>
          unfilled(error instanceof Error ? error.message : String(error))
      ),
      "fill a project's delegate types"
    );
  };

  /** The project's stages; undefined while stages.md does not read; the folder's refusal when it does not read off the folder. */
  const currentStages = async (projectId: string) => {
    const read = await stagesOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const { reading, source } = read;
    return reading.ok && source !== "none" ? reading.stages : undefined;
  };

  /** The project's stages, or a refusal saying what in stages.md keeps the hub from `doing`. */
  const usableStages = async (projectId: string, doing: string) => {
    const read = await stagesOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const { reading, source } = read;
    if (source === "none") {
      return problem(409, {
        code: "task-not-set-up",
        detail: `The project is not set up yet, so it has no stages and the hub cannot ${doing}. Its setup page writes them once the person sends it.`,
      });
    }
    if (!reading.ok) {
      return problem(409, {
        code: "task-stages-unread",
        detail: `stages.md does not read, so the hub cannot ${doing}. ${reading.problems.join(" ")} Fix it, or apply a template.`,
      });
    }
    return reading.stages;
  };

  const view = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    stages: Stages | undefined
  ) => {
    const doc = new TaskDoc(path, content);
    const parsed = doc.read();
    const hash = hashOf(content);
    const rows = store.index(projectId);
    const observed =
      rows.find((row) => row.path === path)?.updatedAt ?? new Date();
    const stage = parsed.fields.stage ?? "";
    const read = await timesOf(
      projectId,
      [{ path, stage, updatedAt: observed }],
      stages
    );
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const { gone, times } = read;
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

  /** {@link view} over the project's stages as they read now. */
  const viewNow = async (
    projectId: string,
    path: string,
    number: number,
    content: string
  ) => {
    const stages = await currentStages(projectId);
    return stages instanceof ElysiaStatus
      ? stages
      : view(projectId, path, number, content, stages);
  };

  /**
   * Writes a task file through the folder (one commit) and re-indexes it;
   * the folder's refusal returned. `fresh`: a new task, written only while
   * no file claims its number (`folder-place-taken` otherwise).
   */
  const placeTask = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    actor: TaskActor,
    message: string,
    fresh: boolean
  ) => {
    // A project deleted since the change began takes no task: before its
    // folder is written, and again in the step that indexes the task.
    const gone = stands(projectId);
    if (gone) {
      return gone;
    }
    const written = await writeFolderFile(projectId, path, content, {
      author: actor.author,
      message,
      ...(fresh ? { exclusive: sameNumber } : {}),
    });
    if (written instanceof ElysiaStatus) {
      return written;
    }
    const goneSince = stands(projectId);
    if (goneSince) {
      return goneSince;
    }
    store.put([indexRow(projectId, path, number, content, hashOf(content))]);
    return await viewNow(projectId, path, number, content);
  };

  /**
   * One try at taking in another project's task files (`adopt`): each under
   * the next free number, edges and promoted to-dos renamed to match, all
   * written in one commit only where no file holds their places
   * (`folder-place-taken` otherwise, with none of them left written). Inside
   * the project's turn. Answers each old id → its new id, or the folder's
   * refusal.
   */
  const adoptOnce = async (
    projectId: string,
    numbered: { file: { content: string; path: string }; was: number }[],
    actor: TaskActor,
    from: string
  ) => {
    const renames = new Map<string, string>();
    const numbers: number[] = [];
    for (const { was } of numbered) {
      const number = await nextNumber(projectId);
      if (number instanceof ElysiaStatus) {
        return number;
      }
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
    const gone = stands(projectId);
    if (gone) {
      return gone;
    }
    const merged = await writeFolderFiles(
      projectId,
      written.map(({ path, content }) => ({ path, content })),
      {
        author: actor.author,
        message: mergedInMessage(
          actor,
          written.map((each) => taskId(each.number)),
          from
        ),
        exclusive: sameNumber,
      }
    );
    if (merged instanceof ElysiaStatus) {
      return merged;
    }
    const goneSince = stands(projectId);
    if (goneSince) {
      return goneSince;
    }
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
  ) => {
    const first = await nextNumber(projectId);
    if (first instanceof ElysiaStatus) {
      return first;
    }
    let number = first;
    for (let tries = 1; ; tries += 1) {
      const { path, content, message } = make(number);
      const saved = await placeTask(
        projectId,
        path,
        number,
        content,
        actor,
        message,
        true
      );
      if (!(saved instanceof ElysiaStatus)) {
        return saved;
      }
      if (
        saved.response.code !== "folder-place-taken" ||
        tries >= CLAIM_TRIES
      ) {
        return saved;
      }
      console.info(
        `[tasks] ${projectId} ${taskId(number)} was claimed by a file in tasks/ as it was made; taking the next number`
      );
      const next = await nextNumber(projectId, number);
      if (next instanceof ElysiaStatus) {
        return next;
      }
      number = next;
    }
  };

  /**
   * The file of the task `ref` names, read for a change inside the project's
   * turn: a stage or comments written into it are put back first, so no
   * commit of the hub's carries them on. Refused for a task that does not
   * change; the folder's refusal when it does not read.
   */
  const opened = async (projectId: string, ref: string) => {
    const tracker = known(projectId);
    if (tracker instanceof ElysiaStatus) {
      return tracker;
    }
    const place = await locate(projectId, ref, true);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    const { path, number } = place;
    const read = await taskText(projectId, path);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const fix = await fixFor(projectId, path, read);
    if (fix instanceof ElysiaStatus) {
      return fix;
    }
    const content = fix
      ? await settle(projectId, path, number, read, fix)
      : read;
    if (content instanceof ElysiaStatus) {
      return content;
    }
    return {
      path,
      number,
      id: taskId(number),
      content,
      doc: new TaskDoc(path, content),
    };
  };

  /**
   * An {@link opened} task file written back once it changed, its commit
   * saying what the change did (its words, or with the stage move and
   * reason it made); the task as it stands.
   */
  const writeBack = async (
    projectId: string,
    file: Exclude<Awaited<ReturnType<typeof opened>>, AnyProblem>,
    actor: TaskActor,
    applied: string | Did
  ) => {
    const { path, number, id, content, doc } = file;
    const { what, ...did } =
      typeof applied === "string" ? { what: applied } : applied;
    const next = doc.toString();
    if (next === content) {
      return await viewNow(projectId, path, number, content);
    }
    return await placeTask(
      projectId,
      path,
      number,
      next,
      actor,
      commitMessage(actor, `task ${id}`, what, did),
      false
    );
  };

  /**
   * Reads a task's file, lets `apply` change it, and writes it back when it
   * changed, inside the project's turn already taken ({@link opened},
   * {@link writeBack}): a write that changes other tasks with its own.
   */
  const amend = async (
    projectId: string,
    ref: string,
    actor: TaskActor,
    apply: (doc: TaskDoc, id: string) => string | Did
  ) => {
    const file = await opened(projectId, ref);
    return file instanceof ElysiaStatus
      ? file
      : await writeBack(projectId, file, actor, apply(file.doc, file.id));
  };

  /** {@link amend} in the project's turn. */
  const change = (
    projectId: string,
    ref: string,
    actor: TaskActor,
    apply: (doc: TaskDoc, id: string) => string | Did
  ) => inTurn(projectId, () => amend(projectId, ref, actor, apply));

  /** A refused stage, with its problem when it has one: 400 for a stage the project lacks, 403 for one its rules close. */
  const stageRefusal = (
    stages: Stages,
    to: string,
    misfit: string | undefined
  ) => {
    if (!misfit) {
      return;
    }
    return stageNamed(stages, to)
      ? problem(403, { code: "task-stage-refused", detail: misfit })
      : problem(400, { code: "task-stage-unknown", detail: misfit });
  };

  /**
   * The refusal of a move into an active stage, or a new task filed there
   * (`from` ""), with nothing to work on it there (stages.ts
   * `nobodyProblem`): something must, its live attempt, the stage's
   * `runs:`, or the project's dispatch, which starts one (dispatch.ts
   * `hooked`). A tracker's move is a person's work elsewhere; the hub's own
   * moves are its attempts'.
   */
  const refuseNobody = (
    projectId: string,
    stages: Stages,
    id: string,
    from: string,
    to: string,
    actor: TaskActor
  ) => {
    if (actor.mover === "hub" || actor.tracker !== undefined) {
      return;
    }
    const nobody = nobodyProblem(stages, id, from, to, {
      live: liveAt(projectId, id),
      dispatches: dispatches(projectId),
    });
    return nobody
      ? problem(409, { code: "task-stage-nobody", detail: nobody })
      : undefined;
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
  ) => {
    const from = doc.read().fields.stage ?? "";
    if (from === to) {
      return;
    }
    if (
      actor.mover === "action" &&
      !(actor.actionId && store.actionMove?.(projectId, id, to, actor.actionId))
    ) {
      return problem(403, {
        code: "task-move-not-approved",
        detail: `This task cannot go to ${to} as an approved action: only an action the owner approved, once its call is done, moves its own task to the stage it named.`,
      });
    }
    const refused =
      stageRefusal(
        stages,
        to,
        actor.mover === "hub" || asClose
          ? hubProblem(stages, to)
          : moveProblem(stages, id, from, to, actor.mover)
      ) ?? refuseNobody(projectId, stages, id, from, to, actor);
    if (refused) {
      return refused;
    }
    doc.setField("stage", to);
    const moved: { from: string; to: string } = { from, to };
    return moved;
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
  ) => {
    const byId = rowsById(store.index(projectId));
    for (
      let at: string | null = survivor, seen = 0;
      at && seen < byId.size;
      at = byId.get(at)?.duplicateOf ?? null, seen += 1
    ) {
      if (at === id) {
        return problem(409, {
          code: "task-duplicate-cycle",
          detail: `${taskLink(projectId, survivor, byId.get(survivor)?.title ?? survivor)} is already a duplicate of this task, so this task cannot be a duplicate of it. Nothing changed.`,
        });
      }
    }
    doc.setField("duplicate_of", survivor);
    const phrase = `${EDGE_PHRASE.duplicate_of} ${survivor}`;
    const stages = await usableStages(projectId, "close a duplicate");
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const dropped = stages.stages.find((each) => each.kind === "dropped");
    if (!dropped) {
      return problem(409, {
        code: "task-no-dropped-stage",
        detail:
          "The project has no stage of kind dropped, so this task cannot be closed as a duplicate. Add one to stages.md.",
      });
    }
    const kept: Did = { what: phrase };
    if (kindIn(stages, doc.read().fields.stage ?? "") === "dropped") {
      return kept;
    }
    const stage = moveTo(projectId, doc, id, stages, dropped.name, actor, true);
    if (stage instanceof ElysiaStatus) {
      return stage;
    }
    const closed: Did = stage
      ? {
          what: `${phrase}; stage ${stage.from || NO_STAGE} → ${stage.to}`,
          stage,
          reason: "duplicate",
        }
      : kept;
    return closed;
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
  ) => {
    const waiters = store
      .index(projectId)
      .filter((row) => row.waitsOn.includes(from) && row.id !== from);
    const moved: string[] = [];
    for (const waiter of waiters) {
      const amended = await amend(
        projectId,
        waiter.id,
        hubActor(why),
        (doc, id) => {
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
        }
      );
      if (amended instanceof ElysiaStatus) {
        return amended;
      }
      moved.push(waiter.id);
    }
    return moved;
  };

  /** Moves a task's file to tasks/archive/ (what a write around the hub left settled first). Inside the turn. */
  const archiveFile = async (
    projectId: string,
    ref: string,
    actor: TaskActor
  ) => {
    const place = await locate(projectId, ref, true);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    const { path, number } = place;
    const id = taskId(number);
    if (
      attemptsByTask(projectId)
        .get(id)
        ?.some((attempt) => isLive(attempt.state))
    ) {
      return problem(409, {
        code: "task-attempt-live",
        detail: `An attempt at ${id} is live; stop it before archiving the task.`,
      });
    }
    const read = await taskText(projectId, path);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const fix = await fixFor(projectId, path, read);
    if (fix instanceof ElysiaStatus) {
      return fix;
    }
    const settled = fix
      ? await settle(projectId, path, number, read, fix)
      : undefined;
    if (settled instanceof ElysiaStatus) {
      return settled;
    }
    const to = archivePath(path);
    const gone = stands(projectId);
    if (gone) {
      return gone;
    }
    const moved = await moveFolderFile(projectId, path, to, {
      author: actor.author,
      message: commitMessage(actor, `task ${id}`, "archive"),
    });
    if (moved instanceof ElysiaStatus) {
      return moved;
    }
    store.drop(projectId, [path]);
    const content = await taskText(projectId, to);
    return content instanceof ElysiaStatus
      ? content
      : await viewNow(projectId, to, number, content);
  };

  /** Where an archived task's file is, and what of it a write around the hub changed while it was archived ({@link archivedFix}). */
  const archivedTask = async (projectId: string, ref: string) => {
    const asked = taskNumbered("task", ref);
    if (asked instanceof ElysiaStatus) {
      return asked;
    }
    const { id, number } = asked;
    const synced = await sync(projectId);
    if (synced instanceof ElysiaStatus) {
      return synced;
    }
    const board = synced.rows.find((row) => row.number === number);
    if (board) {
      return problem(409, {
        code: "task-on-board",
        detail: `It is on the board (${board.path}), not archived.`,
      });
    }
    const from = await archivedFile(projectId, number);
    if (from instanceof ElysiaStatus) {
      return from;
    }
    if (!from) {
      return problem(404, {
        code: "task-not-archived",
        detail: "It is not archived.",
      });
    }
    const read = await taskText(projectId, from);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const fix = await archivedFix(projectId, from, read);
    if (fix instanceof ElysiaStatus) {
      return fix;
    }
    const settled = fix
      ? await settledDoc(projectId, from, read, fix)
      : undefined;
    return { id, number, from, settled };
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
  ) => {
    const archived = await archivedTask(projectId, ref);
    if (archived instanceof ElysiaStatus) {
      return archived;
    }
    const { id, number, from, settled } = archived;
    const to = `tasks/${from.slice(ARCHIVE_DIR.length + 1)}`;
    const gone = stands(projectId);
    if (gone) {
      return gone;
    }
    const moved = await moveFolderFile(projectId, from, to, {
      author: actor.author,
      message: commitMessage(
        actor,
        `task ${id}`,
        `unarchive${settled ? `; ${settled.said}` : ""}`,
        settled ? { reason: settled.why } : {}
      ),
      ...(settled ? { content: settled.restored } : {}),
    });
    if (moved instanceof ElysiaStatus) {
      return moved;
    }
    const content = await taskText(projectId, to);
    if (content instanceof ElysiaStatus) {
      return content;
    }
    const goneSince = stands(projectId);
    if (goneSince) {
      return goneSince;
    }
    store.put([indexRow(projectId, to, number, content, hashOf(content))]);
    return await viewNow(projectId, to, number, content);
  };

  /** A move's reason as given: one line, or nothing. */
  const reasonOf = (reason: string | undefined) =>
    reason?.trim() ? oneLine("reason", reason, REASON_LIMIT) : undefined;

  /**
   * The file the task `ref` names, the project's index caught up first, as a
   * list does: the other tasks its edges name read as their files are now.
   * Answers the index's rows with it.
   */
  const placeSynced = async (projectId: string, ref: string) => {
    const tracker = known(projectId);
    if (tracker instanceof ElysiaStatus) {
      return tracker;
    }
    const synced = await sync(projectId);
    if (synced instanceof ElysiaStatus) {
      return synced;
    }
    const place = await locate(projectId, ref);
    return place instanceof ElysiaStatus
      ? place
      : { ...place, rows: synced.rows };
  };

  /** One task, its file read and parsed; the index catches up if the file moved. */
  const readTask = async (projectId: string, ref: string) => {
    const place = await placeSynced(projectId, ref);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    const { path, number, rows } = place;
    const content = await taskText(projectId, path);
    if (content instanceof ElysiaStatus) {
      return content;
    }
    const fix = await fixFor(projectId, path, content, rows);
    if (fix instanceof ElysiaStatus) {
      return fix;
    }
    if (fix) {
      // Shown as it will be settled; the file gets it back in its turn.
      queueSettle(projectId, path, number);
    }
    return await viewNow(
      projectId,
      path,
      number,
      fix ? settledView(path, content, fix) : content
    );
  };

  /** A comment's entry, its commit, and who hears of it ({@link comment}); `via`, one carried from an outside source. */
  const writeComment = async (
    projectId: string,
    ref: string,
    text: string,
    actor: TaskActor,
    via?: ExternalComment
  ) => {
    const written = commentText(text);
    if (written instanceof ElysiaStatus) {
      return written;
    }
    const task = await change(projectId, ref, actor, (doc) => {
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
    });
    return task instanceof ElysiaStatus
      ? task
      : told(
          {
            kind: "changed",
            projectId,
            id: task.id,
            comment: { actor, text: written },
          },
          task
        );
  };

  /**
   * Each comment being written now, by the id its device chose: the same
   * comment again meanwhile (a device sending it again after its answer was
   * lost) is answered by the first one's commit, never written twice.
   */
  const commenting = new Map<string, ReturnType<typeof writeComment>>();

  /** The tasks the list's filter links (`link`); undefined when it names none, refused when it does not read. */
  const linkedBy = (projectId: string, filter: TaskFilter) => {
    const linking = filter.link?.trim()
      ? store.linked(projectId, filter.link.trim())
      : undefined;
    return typeof linking === "string"
      ? problem(400, { code: "task-link-unread", detail: linking })
      : linking && new Set(linking);
  };

  /** What a list's filter asks of the project, read: its tracker, the whole it names and the tasks its link names; the first refusal when one does not read. */
  const listAsked = (projectId: string, filter: TaskFilter) => {
    const tracker = known(projectId);
    if (tracker instanceof ElysiaStatus) {
      return tracker;
    }
    const partOf = filter.partOf ? taskRef("part_of", filter.partOf) : null;
    if (partOf instanceof ElysiaStatus) {
      return partOf;
    }
    const linked = linkedBy(projectId, filter);
    return linked instanceof ElysiaStatus
      ? linked
      : { tracker, partOf, linked };
  };

  /** The project's tasks from the index, caught up with the files first. */
  const listTasks = async (projectId: string, filter: TaskFilter = {}) => {
    const asked = listAsked(projectId, filter);
    if (asked instanceof ElysiaStatus) {
      return asked;
    }
    const { tracker, partOf, linked } = asked;
    const [synced, read] = await Promise.all([
      sync(projectId),
      stagesOf(projectId),
    ]);
    if (synced instanceof ElysiaStatus) {
      return synced;
    }
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const { rows: board, problems } = synced;
    const { reading } = read;
    const rows = filter.archived ? await archivedRows(projectId) : board;
    if (rows instanceof ElysiaStatus) {
      return rows;
    }
    const stages = reading.ok ? reading.stages : undefined;
    const timed = await timesOf(projectId, rows, stages);
    if (timed instanceof ElysiaStatus) {
      return timed;
    }
    const { gone, times } = timed;
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
    const list: TaskList = {
      tracker,
      tasks,
      problems,
      stagesProblems: reading.ok ? [] : reading.problems,
    };
    return list;
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
  const afterClose = async (projectId: string, id: string) => {
    const before = await listTasks(projectId);
    if (before instanceof ElysiaStatus) {
      return before;
    }
    const closed = before.tasks.find((task) => task.id === id);
    if (!closed) {
      const none: Closing = {
        nowReady: [],
        stillWaiting: [],
        unwaited: [],
        wholeClosed: null,
      };
      return none;
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
    if (unwaited instanceof ElysiaStatus) {
      return unwaited;
    }
    const wholeClosed = await closeWhole(projectId, closed, before.tasks);
    if (wholeClosed instanceof ElysiaStatus) {
      return wholeClosed;
    }
    const after = await listTasks(projectId);
    if (after instanceof ElysiaStatus) {
      return after;
    }
    const now = new Map(after.tasks.map((task) => [task.id, task]));
    const open = waiting
      .map((waiter) => now.get(waiter.id))
      .filter(
        (task): task is TaskSummary =>
          task !== undefined && !CLOSED_KINDS.has(task.kind ?? "todo")
      );
    tellWaiters(projectId, closed, dropped, waiting, now);
    const closing: Closing = {
      nowReady: open.filter((task) => task.ready).map((task) => task.id),
      stillWaiting: open
        .filter((task) => !task.ready)
        .map((task) => ({ id: task.id, on: unsettledWaits(task) })),
      unwaited,
      wholeClosed,
    };
    return closing;
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
  ) => {
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
    const unclosed = (why: string) =>
      console.warn(
        `[tasks] ${projectId} ${whole.id}: its last part is done, and it did not close: ${why}`
      );
    const stages = await currentStages(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const done = stages?.stages.find((stage) => stage.kind === "done");
    if (!done || done.hooks.by === "action") {
      return null;
    }
    try {
      const moved = await moveTask(
        projectId,
        whole.id,
        done.name,
        hubActor(`its last part, ${part.id}, is done`)
      );
      if (moved instanceof ElysiaStatus) {
        unclosed(moved.response.detail);
        return null;
      }
      return whole.id;
    } catch (error) {
      unclosed(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  /** Whether a move is your approval: yours, out of a stage of kind `you`, passing the task on (stages.ts `passesReview`). */
  const approves = (
    stages: Stages,
    moved: { from: string; to: string },
    actor: TaskActor
  ): boolean =>
    actor.mover === "you" &&
    kindIn(stages, moved.from) === "you" &&
    passesReview(stages, moved.from, moved.to);

  /**
   * A move of task `id` (its file `doc`) to `stage`, made on the file: the
   * move, whether it is your approval, and what its commit says; refused
   * when the stages do not read, the stage is not one, the move is not the
   * actor's, or the store holds your approval.
   */
  const moveMade = async (
    projectId: string,
    doc: TaskDoc,
    id: string,
    stage: string,
    actor: TaskActor,
    why: string | undefined,
    tickCriteria: boolean | undefined
  ) => {
    const stages = await usableStages(projectId, "check a stage change");
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const to = stageName(stage);
    if (to instanceof ElysiaStatus) {
      return to;
    }
    const moved = moveTo(projectId, doc, id, stages, to, actor);
    if (moved instanceof ElysiaStatus) {
      return moved;
    }
    if (!moved) {
      return { moved, approved: false, did: { what: `stage ${to}` } };
    }
    return await movedFile(projectId, doc, id, stages, moved, actor, {
      why,
      tickCriteria,
    });
  };

  /**
   * {@link moveMade} once the move is made on the file: its criteria ticked
   * when asked, whether it is your approval (refused while the store holds
   * it), and what its commit says.
   */
  const movedFile = async (
    projectId: string,
    doc: TaskDoc,
    id: string,
    stages: Stages,
    moved: { from: string; to: string },
    actor: TaskActor,
    { why, tickCriteria }: { tickCriteria?: boolean; why?: string }
  ) => {
    if (tickCriteria) {
      doc.tickCriteria();
    }
    const approved = approves(stages, moved, actor);
    const held = approved ? await approvable(projectId, id) : undefined;
    if (held) {
      return held;
    }
    const because = approved ? `approved${why ? `: ${why}` : ""}` : why;
    const did: Did = {
      what: `stage ${moved.from || NO_STAGE} → ${moved.to}`,
      stage: moved,
      ...(because ? { reason: because } : {}),
    };
    return { moved, approved, did };
  };

  /** {@link moveMade} in the project's turn, the file written back: the task, the move and whether it was your approval. */
  const moveWritten = (
    projectId: string,
    ref: string,
    stage: string,
    actor: TaskActor,
    why: string | undefined,
    tickCriteria: boolean | undefined
  ) =>
    inTurn(projectId, async () => {
      const file = await opened(projectId, ref);
      if (file instanceof ElysiaStatus) {
        return file;
      }
      const made = await moveMade(
        projectId,
        file.doc,
        file.id,
        stage,
        actor,
        why,
        tickCriteria
      );
      if (made instanceof ElysiaStatus) {
        return made;
      }
      const task = await writeBack(projectId, file, actor, made.did);
      return task instanceof ElysiaStatus
        ? task
        : { task, moved: made.moved, approved: made.approved };
    });

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
  ) => {
    const why = reasonOf(reason);
    if (why instanceof ElysiaStatus) {
      return why;
    }
    const done = await moveWritten(
      projectId,
      ref,
      stage,
      actor,
      why,
      options?.tickCriteria
    );
    if (done instanceof ElysiaStatus) {
      return done;
    }
    const { task, moved, approved } = done;
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
    const stages = await currentStages(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const wasOpen = !CLOSED_KINDS.has(kindIn(stages, moved.from) ?? "todo");
    if (!(wasOpen && (task.kind === "done" || task.kind === "dropped"))) {
      return task;
    }
    const closing = await afterClose(projectId, task.id);
    return closing instanceof ElysiaStatus ? closing : { ...task, closing };
  };

  /** A written wait to take out, matched to the target it names as kept; undefined when it names none of them. */
  const keptMatch = (
    kept: readonly string[],
    written: string,
    reader: WaitReader
  ): string | undefined => {
    const asked = readWait(written, reader);
    const raw = asked instanceof ElysiaStatus ? waitTarget(written) : asked;
    const read = raw ? waitHandle(raw) : undefined;
    return kept.find(
      (target) =>
        target === read ||
        (read === undefined && target.endsWith(written.trim()))
    );
  };

  /** One task file read settled: a write around the hub put back first. */
  const settledFile = async (
    projectId: string,
    path: string,
    number: number
  ) => {
    const content = await taskText(projectId, path);
    if (content instanceof ElysiaStatus) {
      return content;
    }
    const fix = await fixFor(projectId, path, content);
    if (fix instanceof ElysiaStatus) {
      return fix;
    }
    const settled = fix
      ? await settle(projectId, path, number, content, fix)
      : content;
    return settled instanceof ElysiaStatus
      ? settled
      : { path, number, content: settled };
  };

  /** Every task file of the project, the board's and the archive's, each read settled ({@link settledFile}). */
  const settledFiles = async (projectId: string) => {
    const names = await folderFileNames(projectId, "tasks");
    if (names instanceof ElysiaStatus) {
      return names;
    }
    const archived = await archivedNames(projectId);
    if (archived instanceof ElysiaStatus) {
      return archived;
    }
    const paths = [
      ...withNumbers(names).map(({ name, number }) => ({
        path: `tasks/${name}`,
        number,
      })),
      ...archived.map(({ name, number }) => ({
        path: `${ARCHIVE_DIR}/${name}`,
        number,
      })),
    ];
    const read = await Promise.all(
      paths.map(({ path, number }) => settledFile(projectId, path, number))
    );
    const files: { content: string; number: number; path: string }[] = [];
    for (const file of read) {
      if (file instanceof ElysiaStatus) {
        return file;
      }
      files.push(file);
    }
    return files;
  };

  /** Task files a cutover rewrote, as one commit by the hub; the board's re-indexed. */
  const writeCutover = async (
    projectId: string,
    writes: { content: string; number: number; path: string }[],
    actor: TaskActor,
    what: string
  ) => {
    const gone = stands(projectId);
    if (gone) {
      return gone;
    }
    const written = await writeFolderFiles(
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
    if (written instanceof ElysiaStatus) {
      return written;
    }
    const goneSince = stands(projectId);
    if (goneSince) {
      return goneSince;
    }
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
  const migrateLinks = async (projectId: string) => {
    const counts: LinkMigration = {
      files: 0,
      waitsOn: 0,
      partOf: 0,
      seeAlso: 0,
      related: 0,
    };
    const read = await settledFiles(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
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
    const cut = await writeCutover(
      projectId,
      writes,
      actor,
      `links: ${counts.waitsOn} after → waits_on, ${counts.partOf} parent → part_of, ${counts.seeAlso} related → See also`
    );
    if (cut) {
      return cut;
    }
    console.info(
      `[tasks] project ${projectId}: task links migrated in ${counts.files} files: ${counts.waitsOn} after → waits_on, ${counts.partOf} parent → part_of, ${counts.related} related in ${counts.seeAlso} See also comments.`
    );
    return counts;
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
  ) => {
    const none: Omit<Did, "what"> & {
      said: string[];
      survivor: string | null;
    } = { said: [], survivor: null };
    if (duplicateOf === undefined) {
      return none;
    }
    if (remove) {
      const out = taskRef("duplicate_of", duplicateOf);
      if (out instanceof ElysiaStatus) {
        return out;
      }
      if (was === out) {
        doc.setField("duplicate_of", null);
      }
      return { ...none, said: [`no longer a duplicate of ${duplicateOf}`] };
    }
    const survivor = await single(projectId, "duplicate_of", duplicateOf);
    if (survivor instanceof ElysiaStatus) {
      return survivor;
    }
    if (!survivor || survivor === id) {
      return problem(400, {
        code: "task-duplicate-self",
        detail: "A task cannot be a duplicate of itself.",
      });
    }
    const marked = await markDuplicate(projectId, doc, id, survivor, actor);
    if (marked instanceof ElysiaStatus) {
      return marked;
    }
    const { what, ...did } = marked;
    return { ...did, said: [what], survivor };
  };

  /** The refusal of a write that would make a task wait on itself or be its own part, by its path. */
  const refuseSelf = (projectId: string, doc: TaskDoc, id: string) => {
    const self = linked(projectId, { id, title: doc.title() });
    return problem(409, {
      code: "task-cycle",
      detail: taskLinkWords.cycle(`${self} → ${self}`),
    });
  };

  /** The waits a link write takes out with `remove`, each matched to one kept; refused for one it does not hold. */
  const waitsOut = (
    projectId: string,
    actor: TaskActor,
    kept: string[],
    waitsOn: string[]
  ) => {
    const reader = store.waitReader(projectId, actor);
    const listed = items("waits_on", waitsOn);
    if (listed instanceof ElysiaStatus) {
      return listed;
    }
    const out: string[] = [];
    for (const written of listed) {
      const match = keptMatch(kept, written, reader);
      if (match === undefined) {
        return problem(404, {
          code: "task-wait-not-held",
          detail: `It waits on nothing named “${written}”. Nothing changed.`,
        });
      }
      out.push(match);
    }
    return out;
  };

  /** What a link write does to a task's waits: added, or taken out with `remove`. */
  const linkWaits = async (
    projectId: string,
    actor: TaskActor,
    doc: TaskDoc,
    id: string,
    { waitsOn, remove }: TaskLinks
  ) => {
    const kept = doc.read().fields.waitsOn;
    const waits: {
      added: string[];
      removed: string[];
      said: string[];
      waits: string[];
    } = { waits: kept, added: [], removed: [], said: [] };
    if (waitsOn === undefined) {
      return waits;
    }
    if (remove) {
      const out = waitsOut(projectId, actor, kept, waitsOn);
      if (out instanceof ElysiaStatus) {
        return out;
      }
      return {
        ...waits,
        waits: kept.filter((target) => !out.includes(target)),
        removed: out,
        said: [`no longer waits on ${out.join(", ")}`],
      };
    }
    const added = await waitsFor(projectId, actor, waitsOn);
    if (added instanceof ElysiaStatus) {
      return added;
    }
    if (added.includes(id)) {
      return refuseSelf(projectId, doc, id);
    }
    return {
      ...waits,
      waits: [...new Set([...kept, ...added])],
      added: added.filter((target) => !kept.includes(target)),
      said: [`waits on ${added.join(", ")}`],
    };
  };

  /** What a link write does to a task's whole: set, or taken out with `remove`. */
  const linkWhole = async (
    projectId: string,
    doc: TaskDoc,
    id: string,
    { partOf, remove }: TaskLinks
  ) => {
    const kept = doc.read().fields.partOf;
    const whole: { partOf: string | null; said: string[] } = {
      partOf: kept,
      said: [],
    };
    if (partOf === undefined) {
      return whole;
    }
    if (remove) {
      const out = taskRef("part_of", partOf);
      if (out instanceof ElysiaStatus) {
        return out;
      }
      return {
        partOf: kept === out ? null : kept,
        said: [`no longer part of ${out}`],
      };
    }
    const parent = await single(projectId, "part_of", partOf);
    if (parent instanceof ElysiaStatus) {
      return parent;
    }
    if (parent === id) {
      return refuseSelf(projectId, doc, id);
    }
    return { partOf: parent, said: [`part of ${parent}`] };
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

  /**
   * Catches up a project's index from its folder, when it has one: as the
   * hub starts, and as a forgotten project's folder comes back
   * (project-trash.ts). A stages.md that names the retired mover is
   * written again first, and one that is only the code template then goes,
   * so the project reads the template as the hub has it. A failure is
   * said in the log; the index stands as it was.
   */
  const catchUp = async (projectId: string) => {
    const has = await hasProjectFolder(projectId);
    if (has instanceof ElysiaStatus) {
      return has;
    }
    if (!has) {
      return;
    }
    const uncaught = (why: string) =>
      console.warn(
        `[tasks] project ${projectId}'s task index was not caught up: ${why}`
      );
    try {
      const refused = await inTurn(projectId, async () => {
        for (const step of [
          retireMover,
          dropTemplateCopy,
          fillTypes,
          migrateLinks,
        ]) {
          const done = await step(projectId);
          if (done instanceof ElysiaStatus) {
            return done;
          }
        }
      });
      const synced = refused ? undefined : await sync(projectId);
      const left =
        refused ?? (synced instanceof ElysiaStatus ? synced : undefined);
      if (left) {
        uncaught(left.response.detail);
      }
    } catch (error) {
      uncaught(error instanceof Error ? error.message : String(error));
    }
  };

  /** A draft's stage, type and edges, each checked; the first refusal when one cannot stand. */
  const draftEdges = async (
    projectId: string,
    draft: TaskDraft,
    actor: TaskActor
  ) => {
    const stage = await startStage(projectId, draft.stage, actor);
    if (stage instanceof ElysiaStatus) {
      return stage;
    }
    const type = draft.type ? typeName(draft.type) : null;
    if (type instanceof ElysiaStatus) {
      return type;
    }
    const waitsOn = await waitsFor(projectId, actor, draft.waitsOn ?? []);
    if (waitsOn instanceof ElysiaStatus) {
      return waitsOn;
    }
    const partOf = await single(projectId, "part_of", draft.partOf);
    if (partOf instanceof ElysiaStatus) {
      return partOf;
    }
    const foundIn = await foundInOf(projectId, draft.foundIn);
    if (foundIn instanceof ElysiaStatus) {
      return foundIn;
    }
    return { stage, type, waitsOn, partOf, foundIn };
  };

  /** A draft's checks, outputs and context, each checked; the first refusal when one cannot stand. */
  const draftWork = (draft: TaskDraft) => {
    const checks = items("checks", draft.checks ?? []);
    if (checks instanceof ElysiaStatus) {
      return checks;
    }
    const outputs = items("outputs", draft.outputs ?? []);
    if (outputs instanceof ElysiaStatus) {
      return outputs;
    }
    const context = items("context", draft.context ?? []);
    return context instanceof ElysiaStatus
      ? context
      : { checks, outputs, context };
  };

  /** A draft's lists, machines, limits and rank, each checked; the first refusal when one cannot stand. */
  const draftLists = (draft: TaskDraft) => {
    const work = draftWork(draft);
    if (work instanceof ElysiaStatus) {
      return work;
    }
    const runsOn = draft.runsOn ? runsOnChecked(draft.runsOn) : null;
    if (runsOn instanceof ElysiaStatus) {
      return runsOn;
    }
    const limits = limitsOf(draft);
    if (limits instanceof ElysiaStatus) {
      return limits;
    }
    const rank = draft.rank ? oneLine("rank", draft.rank, 64) : null;
    if (rank instanceof ElysiaStatus) {
      return rank;
    }
    const labels = items("labels", draft.labels ?? []);
    if (labels instanceof ElysiaStatus) {
      return labels;
    }
    const links = linksOf(draft.links ?? []);
    if (links instanceof ElysiaStatus) {
      return links;
    }
    return { ...work, runsOn, limits, rank, labels, links };
  };

  /** A draft's words (description, acceptance criteria, to-dos) and the fields a task file does not know, each checked; the first refusal when one cannot stand. */
  const draftWords = (draft: TaskDraft) => {
    const description = block("description", draft.description ?? "");
    if (description instanceof ElysiaStatus) {
      return description;
    }
    const acceptance = block("acceptance criteria", draft.acceptance ?? "");
    if (acceptance instanceof ElysiaStatus) {
      return acceptance;
    }
    const todos = todoTexts(draft.todos ?? []);
    if (todos instanceof ElysiaStatus) {
      return todos;
    }
    const extra = extraFieldsOf(draft.fields ?? {});
    if (extra instanceof ElysiaStatus) {
      return extra;
    }
    return { description, acceptance, todos, extra };
  };

  /**
   * A new task's file as `draft` asks, every part checked in the order a
   * create reads them: its title, its stage as `actor` may start it, its
   * edges, lists and words; the first refusal when one cannot stand.
   */
  const drafted = async (
    projectId: string,
    draft: TaskDraft,
    actor: TaskActor
  ) => {
    const title = oneLine("title", draft.title, TITLE_LIMIT);
    if (title instanceof ElysiaStatus) {
      return title;
    }
    const edges = await draftEdges(projectId, draft, actor);
    if (edges instanceof ElysiaStatus) {
      return edges;
    }
    const lists = draftLists(draft);
    if (lists instanceof ElysiaStatus) {
      return lists;
    }
    const words = draftWords(draft);
    if (words instanceof ElysiaStatus) {
      return words;
    }
    const { stage, type, waitsOn, partOf, foundIn } = edges;
    const { checks, outputs, context, runsOn, limits, rank, labels, links } =
      lists;
    const fields: Partial<TaskFields> = {
      stage,
      type,
      waitsOn,
      partOf,
      foundIn,
      checks,
      outputs,
      context,
      lands: draft.lands ?? null,
      runsOn,
      ...limits,
      rank,
      labels,
      links,
    };
    return { title, stage, fields, ...words };
  };

  /**
   * What a link write makes of task `id`'s file `doc`: its waits, its whole
   * and its `duplicate_of`, set on the file and noted in `outcome`; the
   * waits it took out, the move a close as a duplicate made, and what its
   * commit says. Refused, nothing changed, for a cycle of waits or parts, a
   * wait on itself, or a target that does not exist.
   */
  const linkMade = async (
    projectId: string,
    doc: TaskDoc,
    id: string,
    request: TaskLinks,
    actor: TaskActor,
    outcome: LinkOutcome
  ) => {
    const { waitsOn, partOf, duplicateOf, remove } = request;
    const { fields } = doc.read();
    const waits = await linkWaits(projectId, actor, doc, id, request);
    if (waits instanceof ElysiaStatus) {
      return waits;
    }
    const whole = await linkWhole(projectId, doc, id, request);
    if (whole instanceof ElysiaStatus) {
      return whole;
    }
    const cycle =
      !remove && (waitsOn !== undefined || partOf !== undefined)
        ? refuseCycle(projectId, id, {
            partOf: whole.partOf,
            waitsOn: waits.waits,
          })
        : undefined;
    if (cycle) {
      return cycle;
    }
    doc.setField("waits_on", waits.waits);
    doc.setField("part_of", whole.partOf);
    outcome.added = waits.added;
    if (partOf !== undefined) {
      outcome.partOf = whole.partOf;
    }
    const dup = await linkDuplicate(projectId, doc, id, actor, {
      duplicateOf,
      remove,
      was: fields.duplicateOf,
    });
    if (dup instanceof ElysiaStatus) {
      return dup;
    }
    outcome.duplicateOf = dup.survivor;
    const what = [...waits.said, ...whole.said, ...dup.said].join("; ");
    return { removed: waits.removed, moved: dup.stage, did: { ...dup, what } };
  };

  /**
   * {@link linkMade} in the project's turn, the file written back, and
   * every wait on a task closed as a duplicate moved to its survivor
   * (`outcome.moved`): the task, the waits taken out and the move.
   */
  const linkWritten = (
    projectId: string,
    ref: string,
    request: TaskLinks,
    actor: TaskActor,
    outcome: LinkOutcome
  ) =>
    inTurn(projectId, async () => {
      const file = await opened(projectId, ref);
      if (file instanceof ElysiaStatus) {
        return file;
      }
      const made = await linkMade(
        projectId,
        file.doc,
        file.id,
        request,
        actor,
        outcome
      );
      if (made instanceof ElysiaStatus) {
        return made;
      }
      const task = await writeBack(projectId, file, actor, made.did);
      if (task instanceof ElysiaStatus) {
        return task;
      }
      if (outcome.duplicateOf) {
        const moved = await repoint(
          projectId,
          task.id,
          outcome.duplicateOf,
          `${task.id} closed as a duplicate of ${outcome.duplicateOf}`
        );
        if (moved instanceof ElysiaStatus) {
          return moved;
        }
        outcome.moved = moved;
      }
      return { task, removed: made.removed, moved: made.moved };
    });

  /** Each live session whose task waited on `answered`, closed as a duplicate, hears that it waits on its survivor now. */
  const tellRepointed = async (
    projectId: string,
    answered: TaskView,
    outcome: LinkOutcome
  ) => {
    const survivor = outcome.duplicateOf;
    if (!survivor || outcome.moved.length === 0) {
      return;
    }
    told({ kind: "changed", projectId }, answered);
    const list = await listTasks(projectId);
    if (list instanceof ElysiaStatus) {
      return list;
    }
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
  };

  /** A result's artifacts as kept: a file's or a post's path from the folder's root; the refusal of the first a result may not hand in, or of two marked primary. */
  const handedIn = async (
    projectId: string,
    outputs: string[],
    artifacts: ResultArtifact[]
  ) => {
    for (const artifact of artifacts) {
      const misfit = await artifactProblem(projectId, outputs, artifact);
      if (misfit) {
        return misfit;
      }
    }
    if (artifacts.filter((artifact) => artifact.primary).length > 1) {
      return problem(422, {
        code: "task-result-primary-twice",
        detail:
          "Mark one artifact `primary` at most: the one the reviewer sees first.",
      });
    }
    const handed: AttemptResult["artifacts"] = [];
    for (const artifact of artifacts) {
      if (artifact.kind === "link" || artifact.kind === "artifact") {
        handed.push(artifact);
        continue;
      }
      const rel = folderPath(artifact.path);
      if (rel instanceof ElysiaStatus) {
        return rel;
      }
      handed.push({ ...artifact, path: rel });
    }
    return handed;
  };

  /** A task's file deleted ({@link Tasks.remove}), inside the project's turn; refused while another task waits on it or is part of it. */
  const removeFile = async (
    projectId: string,
    ref: string,
    actor: TaskActor
  ) => {
    const place = await placeSynced(projectId, ref);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    const { path, number, rows } = place;
    const id = taskId(number);
    const waiting = new Set(
      store.waiters(projectId, id).map((row) => row.path)
    );
    const held = holders(
      rows.filter((row) => row.path !== path && waiting.has(row.path)),
      rows.filter((row) => row.path !== path && row.partOf === id)
    );
    if (held) {
      return problem(409, {
        code: "task-held",
        detail: `This task cannot be deleted: ${held}. Archive it instead, which they take as done, or take those edges out first.`,
      });
    }
    const content = await taskText(projectId, path);
    if (content instanceof ElysiaStatus) {
      return content;
    }
    const gone = stands(projectId);
    if (gone) {
      return gone;
    }
    const deleted = await deleteFolderFile(projectId, path, {
      author: actor.author,
      message: commitMessage(
        actor,
        `task ${id}`,
        `delete “${new TaskDoc(path, content).title()}”`
      ),
    });
    if (deleted instanceof ElysiaStatus) {
      return deleted;
    }
    store.drop(projectId, [path]);
    return { id, path };
  };

  /** stages.md written ({@link Tasks.putStages}), inside the project's turn; refused, with every problem, when it does not read. */
  const stagesWritten = async (
    projectId: string,
    content: string,
    actor: TaskActor,
    message?: string
  ) => {
    const tracker = known(projectId);
    if (tracker instanceof ElysiaStatus) {
      return tracker;
    }
    const reading = readStages(content);
    if (!reading.ok) {
      return problem(422, {
        code: "task-stages-unfit",
        detail: `stages.md was not saved. ${reading.problems.join(" ")}`,
      });
    }
    const written = await writeFolderFile(projectId, STAGES_FILE, content, {
      author: actor.author,
      message: message?.trim() || `stages: update ${byWhom(actor)}`,
    });
    if (written instanceof ElysiaStatus) {
      return written;
    }
    const filled = await fillTypes(projectId);
    if (filled) {
      return filled;
    }
    return stagesView(
      "file",
      content,
      ruled(projectId, reading),
      startersOf(projectId)
    );
  };

  /** A template applied ({@link Tasks.applyTemplate}), inside the project's turn. */
  const templateApplied = async (
    projectId: string,
    template: StagesTemplate,
    actor: TaskActor
  ) => {
    const tracker = known(projectId);
    if (tracker instanceof ElysiaStatus) {
      return tracker;
    }
    const content = templateText(template);
    const message = `stages: apply the ${template} template ${byWhom(actor)}`;
    const types = await missingTypes(projectId, templateTypes(template));
    if (types instanceof ElysiaStatus) {
      return types;
    }
    const removed =
      template === DEFAULT_TEMPLATE
        ? await removeStages(projectId, { author: actor.author, message })
        : undefined;
    if (removed) {
      return removed;
    }
    const writes = [
      ...(template === DEFAULT_TEMPLATE
        ? []
        : [{ path: STAGES_FILE, content }]),
      ...types,
    ];
    const written =
      writes.length > 0
        ? await writeFolderFiles(projectId, writes, {
            author: actor.author,
            message,
          })
        : undefined;
    if (written instanceof ElysiaStatus) {
      return written;
    }
    store.setTemplate(projectId, template);
    const stages = templateStages(template);
    const synced = await sync(projectId);
    if (synced instanceof ElysiaStatus) {
      return synced;
    }
    return {
      ...stagesView(
        template === DEFAULT_TEMPLATE ? "template" : "file",
        content,
        ruled(projectId, { ok: true, stages }),
        startersOf(projectId)
      ),
      stranded: synced.rows
        .filter((row) => !stageNamed(stages, row.stage))
        .map((row) => row.id),
    };
  };

  return {
    /** The project's tasks from the index, caught up with the files first. */
    list: listTasks,

    /** One task, its file read and parsed; the index catches up if the file moved. */
    get: readTask,

    /** A new task filed in the project's turn as `draft` asks ({@link drafted}), under the next free number; listeners hear it was created. */
    async create(projectId: string, draft: TaskDraft, actor: TaskActor) {
      const task = await inTurn(projectId, async () => {
        const tracker = known(projectId);
        if (tracker instanceof ElysiaStatus) {
          return tracker;
        }
        const made = await drafted(projectId, draft, actor);
        if (made instanceof ElysiaStatus) {
          return made;
        }
        const { title, stage, fields, description, acceptance, todos, extra } =
          made;
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
      });
      return task instanceof ElysiaStatus
        ? task
        : told(
            {
              kind: "created",
              projectId,
              id: task.id,
              stage: task.stage,
              actor,
            },
            task
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
    async adopt(
      projectId: string,
      files: { content: string; path: string }[],
      actor: TaskActor,
      from: string
    ) {
      const adopted = await inTurn(projectId, async () => {
        const tracker = known(projectId);
        if (tracker instanceof ElysiaStatus) {
          return tracker;
        }
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
          const renames = await adoptOnce(projectId, numbered, actor, from);
          if (!(renames instanceof ElysiaStatus)) {
            return renames;
          }
          if (
            renames.response.code !== "folder-place-taken" ||
            tries >= CLAIM_TRIES
          ) {
            return renames;
          }
          console.info(
            `[tasks] ${projectId}: ${renames.response.detail} ${from}'s tasks are numbered again.`
          );
        }
      });
      return adopted instanceof ElysiaStatus
        ? adopted
        : told({ kind: "changed", projectId }, adopted);
    },

    /** Fields and owned sections; what the patch leaves out stays as written. */
    async update(
      projectId: string,
      ref: string,
      patch: TaskPatch,
      actor: TaskActor
    ) {
      const runsOn = patch.runsOn ? runsOnChecked(patch.runsOn) : patch.runsOn;
      if (runsOn instanceof ElysiaStatus) {
        return runsOn;
      }
      const task = await inTurn(projectId, async () => {
        const file = await opened(projectId, ref);
        if (file instanceof ElysiaStatus) {
          return file;
        }
        const applied = applyPatch(file.doc, { ...patch, runsOn });
        return applied instanceof ElysiaStatus
          ? applied
          : await writeBack(projectId, file, actor, applied);
      });
      return task instanceof ElysiaStatus
        ? task
        : told({ kind: "changed", projectId, id: task.id }, task);
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
    ) {
      const { waitsOn, partOf, duplicateOf } = request;
      if (
        waitsOn === undefined &&
        partOf === undefined &&
        duplicateOf === undefined
      ) {
        return problem(400, {
          code: "task-link-empty",
          detail:
            "Give waits_on, part_of or duplicate_of: what the task waits on, the whole it is a part of, or the task it repeats.",
        });
      }
      const outcome: LinkOutcome = {
        added: [],
        removed: [],
        partOf: undefined,
        duplicateOf: null,
        moved: [],
      };
      const done = await linkWritten(projectId, ref, request, actor, outcome);
      if (done instanceof ElysiaStatus) {
        return done;
      }
      const { task, removed, moved } = done;
      const answered =
        outcome.moved.length > 0 ? await readTask(projectId, task.id) : task;
      if (answered instanceof ElysiaStatus) {
        return answered;
      }
      if (removed.length > 0) {
        const stages = await currentStages(projectId);
        if (stages instanceof ElysiaStatus) {
          return stages;
        }
        const context = contextOf(
          projectId,
          store.index(projectId),
          stages,
          new Set()
        );
        outcome.removed = removed.map((handle) => settleIn(context, handle));
      }
      told(
        moved
          ? {
              kind: "moved",
              projectId,
              id: task.id,
              actor,
              ...moved,
              reason: "duplicate",
            }
          : { kind: "changed", projectId, id: task.id },
        answered
      );
      const unlisted = await tellRepointed(projectId, answered, outcome);
      return unlisted ?? { ...answered, linked: outcome };
    },

    /**
     * A task's history: every commit to its file, oldest first, followed
     * across renames, each with who made it, what it did, the stage it moved
     * and why (task-history.ts). Read from the folder's history as kept per
     * commit, so it spawns no git while HEAD stands.
     */
    async history(projectId: string, ref: string) {
      const tracker = known(projectId);
      if (tracker instanceof ElysiaStatus) {
        return tracker;
      }
      const asked = taskNumbered("task", ref);
      if (asked instanceof ElysiaStatus) {
        return asked;
      }
      const { id, number } = asked;
      const times = await folderFileTimes(projectId, "tasks");
      if (times instanceof ElysiaStatus) {
        return times;
      }
      const filed = taskFileIn(times, number);
      if (filed) {
        const history: TaskHistory = {
          id,
          path: filed.path,
          state: filed.state,
          events: [...historyOf(filed.entry)],
        };
        return history;
      }
      // A file no commit has yet: the task stands, with no history.
      const place = await locate(projectId, ref);
      if (place instanceof ElysiaStatus) {
        return place;
      }
      const none: TaskHistory = {
        id,
        path: place.path,
        state: "live",
        events: [],
      };
      return none;
    },

    /**
     * Adds a comment to a task: one entry at the end of its `## Comments`,
     * headed with who wrote it and when, as one commit (its history shows it
     * as `commented`). Entries are only ever added. Listeners hear it with
     * its words: yours reach the task's attempt (jev-tasks.ts) and the
     * project's conversation (task-input.ts). `id`, the
     * one its device chose, makes it one comment however often it is sent:
     * one already written is answered with the task as it stands, nothing
     * added and nobody told again. `via`: a comment written on an outside
     * source and carried here by the hub (external-items.ts), headed by its
     * author's login, the source and its URL.
     */
    async comment(
      projectId: string,
      ref: string,
      text: string,
      actor: TaskActor,
      id?: string,
      via?: ExternalComment
    ) {
      if (!id) {
        return await writeComment(projectId, ref, text, actor, via);
      }
      const first = commenting.get(id);
      if (first !== undefined) {
        return await first;
      }
      const said = store.commentSaid(id);
      if (said) {
        const asked =
          said.projectId === projectId ? taskRef("task", ref) : undefined;
        if (asked instanceof ElysiaStatus) {
          return asked;
        }
        if (asked === undefined || said.taskId !== asked) {
          return problem(409, {
            code: "task-comment-elsewhere",
            detail: "That comment is already on another task.",
          });
        }
        return await readTask(projectId, ref);
      }
      const writing = writeComment(projectId, ref, text, actor).then((task) => {
        if (!(task instanceof ElysiaStatus)) {
          store.noteComment({ id, projectId, taskId: task.id });
        }
        return task;
      });
      commenting.set(id, writing);
      const done = () => commenting.delete(id);
      writing.then(done, done);
      return await writing;
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
    ) {
      const tracker = known(projectId);
      if (tracker instanceof ElysiaStatus) {
        return tracker;
      }
      const place = await locate(projectId, ref);
      if (place instanceof ElysiaStatus) {
        return place;
      }
      const content = await taskText(projectId, place.path);
      if (content instanceof ElysiaStatus) {
        return content;
      }
      const { outputs } = new TaskDoc(place.path, content).read().fields;
      const summary = written.summary.trim();
      if (!summary) {
        return problem(422, {
          code: "task-result-summary-missing",
          detail: "Say what you did in `summary`: the reviewer reads it first.",
        });
      }
      const handed = await handedIn(
        projectId,
        outputs,
        written.artifacts ?? []
      );
      if (handed instanceof ElysiaStatus) {
        return handed;
      }
      const result: AttemptResult = {
        summary,
        check: (written.check ?? []).map((line) => line.trim()).filter(Boolean),
        artifacts: handed,
        at: Date.now(),
      };
      store.saveResult(workItemId, result);
      return told(
        { kind: "changed", projectId, id: taskId(place.number) },
        result
      );
    },

    /**
     * Archives a task (`archived`, the default): its file moves to
     * tasks/archive/ in one commit, off every list but `archived`, done for
     * every task that waits on it, and kept with its history; refused while
     * an attempt at it is live. `archived: false` moves it back to tasks/ in
     * one commit: it lists, its edges count by its stage, and it changes
     * again.
     */
    async archive(
      projectId: string,
      ref: string,
      actor: TaskActor,
      archived = true
    ) {
      const task = await inTurn(projectId, async () => {
        const tracker = known(projectId);
        if (tracker instanceof ElysiaStatus) {
          return tracker;
        }
        return archived
          ? await archiveFile(projectId, ref, actor)
          : await unarchiveFile(projectId, ref, actor);
      });
      return task instanceof ElysiaStatus
        ? task
        : told({ kind: "changed", projectId, id: task.id }, task);
    },

    /**
     * Deletes a task's file, as one commit; its history stays in the
     * folder's. Refused while another task waits on it (`waits_on`) or is
     * part of it (`part_of`), naming them: archive it instead, which they take
     * as done, or take their edges out first.
     */
    async remove(projectId: string, ref: string, actor: TaskActor) {
      const gone = await inTurn(projectId, () =>
        removeFile(projectId, ref, actor)
      );
      return gone instanceof ElysiaStatus
        ? gone
        : told({ kind: "changed", projectId, id: gone.id }, gone);
    },

    /** Ticks, unticks, adds and rewords to-dos, all in one commit. */
    async todos(
      projectId: string,
      ref: string,
      changes: TodoChanges,
      actor: TaskActor
    ) {
      const added = (changes.add ?? []).map(({ text }) => text.trim());
      const task = await inTurn(projectId, async () => {
        const file = await opened(projectId, ref);
        if (file instanceof ElysiaStatus) {
          return file;
        }
        const applied = applyTodos(file.doc, changes);
        return applied instanceof ElysiaStatus
          ? applied
          : await writeBack(projectId, file, actor, applied);
      });
      return task instanceof ElysiaStatus
        ? task
        : told(
            {
              kind: "changed",
              projectId,
              id: task.id,
              ...(added.length > 0 ? { todos: { actor, added } } : {}),
            },
            task
          );
    },

    /** The project's stages, moves, views and hooks, or what keeps stages.md from reading. */
    async stages(projectId: string) {
      const tracker = known(projectId);
      if (tracker instanceof ElysiaStatus) {
        return tracker;
      }
      const read = await stagesOf(projectId);
      if (read instanceof ElysiaStatus) {
        return read;
      }
      const { source, content, reading } = read;
      return stagesView(source, content, reading, startersOf(projectId));
    },

    /** Writes stages.md, once it reads; a file that does not is refused with every problem. */
    async putStages(
      projectId: string,
      content: string,
      actor: TaskActor,
      message?: string
    ) {
      const written = await inTurn(projectId, () =>
        stagesWritten(projectId, content, actor, message)
      );
      return written instanceof ElysiaStatus
        ? written
        : told({ kind: "changed", projectId }, written);
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
    async applyTemplate(
      projectId: string,
      template: StagesTemplate,
      actor: TaskActor
    ) {
      const written = await inTurn(projectId, () =>
        templateApplied(projectId, template, actor)
      );
      return written instanceof ElysiaStatus
        ? written
        : told({ kind: "changed", projectId }, written);
    },

    /**
     * A page's picks or pins moved (a card answered, reopened or answered
     * again; a pin resolved): listeners look again (readiness is live, so a
     * reopened card blocks its to-do dependents again), and each live
     * attempt dispatched on a card or pin whose value moved since hears it
     * once. The witness is the pick's value, so the same answer again tells
     * nobody.
     */
    async waitsMoved(projectId: string) {
      const list = await listTasks(projectId);
      if (list instanceof ElysiaStatus) {
        return list;
      }
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
    async waitState(projectId: string | null, handle: string) {
      const rows = projectId ? store.index(projectId) : [];
      const stages = projectId ? await currentStages(projectId) : undefined;
      if (stages instanceof ElysiaStatus) {
        return stages;
      }
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
    ) {
      if (projectId) {
        const waits = await waitsFor(projectId, actor, [written]);
        if (waits instanceof ElysiaStatus) {
          return waits;
        }
        const [kept] = waits;
        if (kept === undefined) {
          return problem(400, {
            code: "task-wait-nothing",
            detail: `“${written}” names nothing to wait on.`,
          });
        }
        return kept;
      }
      const target = readWait(written, store.waitReader("", actor));
      if (target instanceof ElysiaStatus) {
        return target;
      }
      return target.kind === "task"
        ? problem(400, {
            code: "task-wait-no-project",
            detail:
              "This session is in no project, so it has no tasks to wait on.",
          })
        : waitHandle(target);
    },

    /**
     * Rewrites the words of the comment carried from `url`, its heading as
     * it was: the source changed them. The hub's sync alone calls it
     * (external-items.ts); one commit, `comment_edited` in the history.
     * Listeners hear the task changed.
     */
    async editComment(
      projectId: string,
      ref: string,
      url: string,
      text: string,
      actor: TaskActor
    ) {
      const written = commentText(text);
      if (written instanceof ElysiaStatus) {
        return written;
      }
      const task = await inTurn(projectId, async () => {
        const file = await opened(projectId, ref);
        if (file instanceof ElysiaStatus) {
          return file;
        }
        if (!file.doc.editComment(url, written)) {
          return problem(404, {
            code: "task-comment-not-carried",
            detail: `${file.id} holds no comment carried from ${url}.`,
          });
        }
        const source = refOfUrl(url)?.source;
        return await writeBack(projectId, file, actor, {
          what: `comment edited${source ? ` on ${externalItemWords.source[source]}` : ""}`,
          change: CHANGES.commentEdited,
        });
      });
      return task instanceof ElysiaStatus
        ? task
        : told({ kind: "changed", projectId, id: task.id }, task);
    },

    /** {@link migrateLinks} in the project's turn: what the hub runs for each project as it starts. */
    migrateLinks(projectId: string) {
      return inTurn(projectId, async () => {
        const tracker = known(projectId);
        if (tracker instanceof ElysiaStatus) {
          return tracker;
        }
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

    /** The stage templates a project is offered (core `OFFERED_TEMPLATES`). */
    templates(): StagesTemplateView[] {
      return OFFERED_TEMPLATES.map((name) => ({
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
    async setIssue(
      projectId: string,
      ref: string,
      url: string | null,
      actor: TaskActor
    ) {
      const task = await change(projectId, ref, actor, (doc) => {
        doc.setField("issue", url);
        return url ? `issue ${url}` : "issue unlinked";
      });
      return task instanceof ElysiaStatus
        ? task
        : told({ kind: "changed", projectId, id: task.id }, task);
    },

    /**
     * Catches up the index of every project that has a folder: what the hub
     * does as it starts ({@link catchUp}, each in turn); the refusal of a
     * project whose folder it cannot look for, which stops it.
     */
    async syncAll() {
      for (const projectId of store.projectIds()) {
        const refused = await catchUp(projectId);
        if (refused) {
          return refused;
        }
      }
    },

    catchUp,
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
const TEMPLATE = t.UnionEnum(STAGES_TEMPLATES);
/** Where an attempt's work lands (`@cawco/core`'s `LandsMode`). */
export const LANDS = t.UnionEnum(LANDS_MODES);
/** A permission mode CawCo offers (core `PERMISSION_MODES`), as a route takes it. */
export const MODE = t.UnionEnum(PERMISSION_MODES);
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
      async ({ params, body }) =>
        await tasks.create(params.id, body, YOU_WRITING)
    )
    .get(
      "/api/projects/:id/tasks/:taskId",
      async ({ params }) => await tasks.get(params.id, params.taskId)
    )
    // One output an attempt handed in, by the name the task gives it
    // (`outputs: [post.md]`), from where the hub copied it
    // (`assets/tsk-12/post.md`): a picture, a video or a sound as itself,
    // anything else as text, so a page reads every output the one way and
    // draws it.
    .get(
      "/api/projects/:id/tasks/:taskId/outputs/file",
      { query: t.Object({ name: t.String() }) },
      async ({ params, query }) => {
        const task = await tasks.get(params.id, params.taskId);
        if (task instanceof ElysiaStatus) {
          return task;
        }
        if (!task.outputs.includes(query.name)) {
          return problem(404, {
            code: "task-output-unknown",
            detail: `This task hands in no output named ${query.name}; its outputs are ${task.outputs.join(", ") || "none"}.`,
          });
        }
        const extension = fileExtension(query.name);
        const media = MEDIA_TYPES[extension];
        const file = await folderFileRaw(
          params.id,
          `${outputsFolder({ id: "", taskId: task.id })}/${query.name}`
        );
        if (file instanceof ElysiaStatus) {
          return file;
        }
        return servedFile(
          Bun.file(file.real),
          IMAGE_TYPES[extension] ?? media ?? "text/plain; charset=utf-8"
        );
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
      async ({ params, body }) =>
        await tasks.update(params.id, params.taskId, body, YOU_ACTOR)
    )
    .delete(
      "/api/projects/:id/tasks/:taskId",
      async ({ params }) =>
        await tasks.remove(params.id, params.taskId, YOU_ACTOR)
    )
    .post(
      "/api/projects/:id/tasks/:taskId/comments",
      {
        body: t.Object({
          text: t.String(),
          /** The comment's id, chosen by its device: the same id again is the same comment. */
          id: t.Optional(t.String()),
        }),
      },
      async ({ params, body }) =>
        await tasks.comment(
          params.id,
          params.taskId,
          body.text,
          YOU_WRITING,
          body.id
        )
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
      async ({ params, body }) =>
        await tasks.archive(
          params.id,
          params.taskId,
          YOU_ACTOR,
          body?.archived ?? true
        )
    )
    .get(
      "/api/projects/:id/tasks/:taskId/history",
      async ({ params }) => await tasks.history(params.id, params.taskId)
    )
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
        const moved = await tasks.move(
          params.id,
          params.taskId,
          body.stage,
          YOU_ACTOR,
          body.reason
        );
        if (moved instanceof ElysiaStatus) {
          return moved;
        }
        if (!("closing" in moved)) {
          return moved;
        }
        // The dashboard reads the task; what the close did is a tool's answer.
        const { closing: _closing, ...task } = moved;
        return task;
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
        const linked = await tasks.link(
          params.id,
          params.taskId,
          body,
          YOU_ACTOR
        );
        if (linked instanceof ElysiaStatus) {
          return linked;
        }
        // The dashboard reads the task; what the write changed is a tool's answer.
        const { linked: _linked, ...task } = linked;
        return task;
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/todos",
      { body: t.Object({ text: t.String(), under: t.Optional(t.String()) }) },
      async ({ params, body }) =>
        await tasks.todos(
          params.id,
          params.taskId,
          { add: [body] },
          YOU_WRITING
        )
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
        let changes: TodoChanges = {};
        if (body.done !== undefined) {
          changes = body.done
            ? { tick: [params.todo] }
            : { untick: [params.todo] };
        }
        if (body.text !== undefined) {
          changes.edit = [{ todo: params.todo, text: body.text }];
        }
        return await tasks.todos(params.id, params.taskId, changes, YOU_ACTOR);
      }
    )
    .get(
      "/api/projects/:id/stages",
      async ({ params }) => await tasks.stages(params.id)
    )
    .put(
      "/api/projects/:id/stages",
      {
        body: t.Object({
          content: t.String(),
          message: t.Optional(t.String({ maxLength: 2000 })),
        }),
      },
      async ({ params, body }) =>
        await tasks.putStages(params.id, body.content, YOU_ACTOR, body.message)
    )
    .post(
      "/api/projects/:id/stages/template",
      { body: t.Object({ template: TEMPLATE }) },
      async ({ params, body }) =>
        await tasks.applyTemplate(params.id, body.template, YOU_ACTOR)
    )
    .get("/api/stage-templates", () => tasks.templates());
