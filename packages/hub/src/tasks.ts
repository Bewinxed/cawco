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
 * - **Tracker.** A project keeps its tasks in CawCo's files (`tracker:
 *   cawco`). GitHub Issues and Linear are named in the setting and refused
 *   until they are built.
 * - **Attempts** are work items at a task (dispatch.ts starts them). Every
 *   read carries a task's attempts and what follows from them and its edges:
 *   a live attempt, the tasks it still waits for, a last attempt that failed
 *   (it then waits for a person, in Needs you). The hub moves a task as
 *   `hub`: code, which the file's moves do not bind; its commits say so.
 *
 * Changes to one project's tasks are taken one at a time: two to-dos ticked
 * at once both land.
 */
import type { InstanceRow, LandsMode } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { Elysia, t } from "elysia";
import type { TaskIndexRow, WorkItemRow } from "./db";
import type { Tracker, WorkBudget, WorkItemState } from "./db/schema";
import {
  deleteFolderFile,
  type Exclusive,
  type FolderAuthor,
  FolderRefusal,
  FolderTaken,
  folderFileNames,
  folderFileTimes,
  folderHistory,
  folderUncommitted,
  HISTORY_LIMIT,
  hasProjectFolder,
  listFolder,
  moveFolderFile,
  readFolderFile,
  refused,
  turnTaker,
  writeFolderFile,
  writeFolderFiles,
  YOU,
} from "./project-folder";
import {
  firstStage,
  type Mover,
  moveProblem,
  readStages,
  STAGE_NAME,
  type Stage,
  type StageKind,
  type StageMove,
  type Stages,
  type StagesReading,
  type StagesTemplate,
  type StageView,
  stageNamed,
  startProblem,
  TEMPLATES,
  templateStages,
  templateText,
} from "./stages";
import {
  ARCHIVE_DIR,
  archivePath,
  type Edge,
  EXTRA_KEY,
  type ExtraValue,
  fileTaskNumber,
  type ParsedTask,
  TASK_FIELDS,
  type TaskComment,
  TaskDoc,
  type TaskFields,
  type Todo,
  taskId,
  taskNumber,
  taskPath,
} from "./task-file";
import {
  AUTHOR,
  COMMENT_CHANGE,
  goneTasks,
  historyOf,
  lifeOf,
  NO_STAGE,
  type TaskHistory,
  type TaskHistoryActor,
  type TaskLife,
  TRAILERS,
  taskFileIn,
} from "./task-history";
import { budgetProblem, isLive, ownsProblem } from "./work-items";

/**
 * Who moves a task: one of the movers stages.md names, or `hub`, the hub's
 * own code (the dispatcher), which the file's moves do not bind.
 */
export type TaskMover = Mover | "hub";

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

/** One attempt at a task: a work item whose task it is, as a task read shows it. */
export interface TaskAttempt {
  /** When it ended, ms epoch; null while it is live. */
  endedAt: number | null;
  /** The session running it. */
  instanceId: string;
  /** When it was filed, ms epoch. */
  startedAt: number;
  state: WorkItemState;
  workItemId: string;
}

/** What a task's attempts and edges say about it, worked out on every read. */
export interface TaskFlags {
  /** Its attempts, newest first. */
  attempts: TaskAttempt[];
  /**
   * The tasks it waits for (`after`) that are not done. Done: in a stage of
   * kind done, or dropped as a duplicate of a task that is done. A task the
   * project lacks counts as waited for, unless the folder's history shows its
   * file deleted or moved out of tasks/ (task-history.ts `goneTasks`).
   */
  blockedBy: string[];
  /** Its newest attempt failed or was cancelled, and it is not done or dropped since: it waits for a person. */
  lastAttemptFailed: boolean;
  /** An attempt at it is starting or running. */
  liveAttempt: boolean;
  /** Its stage's `runs:` hook asked for an attempt, which waits for a slot under the project's max_attempts. */
  queuedStart: boolean;
  /** Why the hub could not start an attempt the last time it tried, while the task is unchanged since. */
  startProblem: string | null;
}

/**
 * A change to a project's tasks, for the dispatcher to look again. A task
 * filed straight into a stage is `created`, so a stage's hook runs for it as
 * for a move in.
 */
export type TaskEvent =
  | {
      actor: TaskActor;
      from: string;
      id: string;
      kind: "moved";
      projectId: string;
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
  /** Every work item at one of the project's tasks, newest first. */
  readonly attempts: (
    projectId: string
  ) => Pick<
    WorkItemRow,
    "createdAt" | "endedAt" | "id" | "instanceId" | "state" | "taskId"
  >[];
  readonly drop: (projectId: string, paths: string[]) => void;
  readonly index: (projectId: string) => TaskIndexRow[];
  readonly project: (
    id: string
  ) => { id: string; tracker: Tracker } | undefined;
  readonly projectIds: () => string[];
  readonly put: (rows: TaskIndexRow[]) => void;
  /** The tasks whose hook start waits for a slot (dispatch.ts). */
  readonly queuedStarts?: (projectId: string) => string[];
  readonly setTracker: (id: string, tracker: Tracker) => void;
  /** Why the hub last could not start an attempt at a task, while that stands (dispatch.ts). */
  readonly startProblem?: (
    projectId: string,
    task: { hash: string; id: string }
  ) => string | null;
}

/**
 * When a task was made and last changed and by whom, and when it started,
 * completed or was dropped and why it closed: worked out from its file's
 * commits (task-history.ts) and never written into it. Made: the commit that
 * first added the file to the project folder. Changed: the last commit that
 * touched it, or, while the file holds an edit no commit has, when the hub
 * saw that edit. A file no commit has yet holds the time the hub saw it for
 * both, and no one for either.
 */
export interface TaskTimes extends TaskLife {
  /** When the commit that first added its file landed, ms epoch. */
  createdAt: number;
  /** Who made the commit that first added its file; null while no commit has it. */
  createdBy: TaskHistoryActor | null;
  /** When its file last changed, ms epoch: its last commit, or an edit no commit has yet. */
  updatedAt: number;
  /** Who made its last commit; null while its file holds an edit no commit has. */
  updatedBy: TaskHistoryActor | null;
}

/** One task as a list shows it: the index's row, and what its attempts and edges say. */
export interface TaskSummary extends TaskFlags, TaskTimes {
  after: string[];
  /** The task it repeats (`duplicate_of`); null when none. */
  duplicateOf: string | null;
  /** The fields its file carries beyond a task file's own that hold one scalar (`priority: high`), as written. */
  fields: Record<string, string>;
  /** The task it was found in (`found_in`); null when none. */
  foundIn: string | null;
  id: string;
  /** The kind of its stage; null when its stage is not one of the project's. */
  kind: StageKind | null;
  labels: string[];
  /**
   * It waits for you: its stage is of kind `you`, or its last attempt failed.
   * Derived on read, never stored.
   */
  needsYou: boolean;
  number: number;
  parent: string | null;
  path: string;
  /** What in the file could not be read, or a stage the project lacks, in a sentence; null when all is well. */
  problem: string | null;
  rank: string | null;
  /** The tasks it is related to (`related`). */
  related: string[];
  stage: string;
  title: string;
  todos: { done: number; total: number };
  type: string | null;
}

export interface TaskList {
  /** Files in tasks/ the hub could not list as tasks, one sentence each. */
  problems: string[];
  /** What is wrong with stages.md, one sentence each; empty when it reads. */
  stagesProblems: string[];
  tasks: TaskSummary[];
  tracker: Tracker;
}

/** A project's stages as the dashboard reads them. */
export interface StagesView {
  moves: StageMove[];
  /** What is wrong with stages.md, one sentence each; stages, moves and views are empty while there is any. */
  problems: string[];
  /** `file`: the project's stages.md; `template`: it has none, and the code template stands in. */
  source: "file" | "template";
  stages: Stage[];
  /** The template the stages are, word for word, if any. */
  template: StagesTemplate | null;
  views: StageView[];
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
export interface TaskView extends TaskFlags, TaskTimes {
  acceptance: string;
  /** The accounts its attempts may run on; empty: every account. */
  accounts: string[];
  after: string[];
  /** What an attempt may spend before the hub stops it; null: the project's default. */
  budget: WorkBudget | null;
  checks: string[];
  /** Its `## Comments`, oldest first: each written by the hub with who and when. */
  comments: TaskComment[];
  description: string;
  /** The task it repeats (`duplicate_of`); null when none. */
  duplicateOf: string | null;
  /** The fields its file carries that a task file does not know, with their values (a scalar or a list); kept as written. */
  extra: Record<string, ExtraValue>;
  foundIn: string | null;
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
  /** It waits for you: its stage is of kind `you`, or its last attempt failed. */
  needsYou: boolean;
  number: number;
  outputs: string[];
  /** Globs of the repository's files an attempt owns. */
  owns: string[];
  parent: string | null;
  path: string;
  problems: string[];
  rank: string | null;
  related: string[];
  /** The body's other `## ` sections, as written. */
  sections: { heading: string; text: string }[];
  stage: string;
  title: string;
  todos: Todo[];
  type: string | null;
}

/** A new task. Edges name tasks as `tsk-12` (or `12`). */
export interface TaskDraft {
  acceptance?: string;
  after?: string[];
  budget?: WorkBudget;
  checks?: string[];
  description?: string;
  /** Fields a task file does not know (`priority`, `due`): a scalar or a list each. */
  fields?: Record<string, ExtraValue>;
  foundIn?: string;
  group?: string;
  labels?: string[];
  lands?: LandsMode;
  outputs?: string[];
  owns?: string[];
  parent?: string;
  rank?: string;
  related?: string[];
  stage?: string;
  title: string;
  /** Top-level to-dos, one line each. */
  todos?: string[];
  type?: string;
}

/** A change to a task's fields and owned sections; what is left out stays. Null clears. */
export interface TaskPatch {
  acceptance?: string;
  /** What an attempt may spend; null: the project's default. */
  budget?: WorkBudget | null;
  checks?: string[];
  description?: string;
  /** Fields a task file does not know, each set (a scalar or a list) or taken out ("" or []); the others stay. */
  fields?: Record<string, ExtraValue>;
  /** Its attempts' group; null: none. */
  group?: string | null;
  labels?: string[];
  /** Where an attempt's work lands; null: the project's default. */
  lands?: LandsMode | null;
  outputs?: string[];
  owns?: string[];
  rank?: string | null;
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
  /** true: only tasks still waiting for another; false: only tasks that are not. */
  blocked?: boolean;
  /** Fields a task file does not know, each to equal the value given (as written). */
  fields?: Record<string, string>;
  kind?: StageKind;
  /** A label the task carries. */
  label?: string;
  /** true: only tasks that need you; false: only tasks that do not. */
  needsYou?: boolean;
  /** The parent task (`tsk-12`). */
  parent?: string;
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
const PROMOTED_TODO = /^(\s*- \[[ xX]\] .*?(?:→|->)\s*#)(\d{1,9})(?=\s*$)/gm;
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
const TYPE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SECTION_LINE = /^##\s/m;
const TODO_MARKER_START = /^\[td-\d+\]/;
const LINE_BREAK = /[\r\n]/;

/** The project folder's stages file, and the template that stands in while there is none. */
/** A project's stages, in its folder (§5.2). */
export const STAGES_FILE = "stages.md";
const DEFAULT_TEMPLATE: StagesTemplate = "code";

const refuse = (code: 400 | 403 | 404 | 409 | 422, message: string): never => {
  throw new FolderRefusal(code, message);
};

const hashOf = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

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

const COMMENT_ENTRY_LINE = /^###\s/m;

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

/** An attempt as a task read shows it. */
const attemptOf = (
  item: ReturnType<TaskStore["attempts"]>[number]
): TaskAttempt => ({
  workItemId: item.id,
  state: item.state,
  instanceId: item.instanceId,
  startedAt: item.createdAt.getTime(),
  endedAt: item.endedAt?.getTime() ?? null,
});

/** What an edge to a task asks of it: its stage, and the task it repeats. */
type EdgeEnd = Pick<TaskIndexRow, "duplicateOf" | "stage">;

/** Every indexed task's stage and duplicate_of, by id. */
const endsById = (rows: TaskIndexRow[]): Map<string, EdgeEnd> =>
  new Map(rows.map((row) => [row.id, row]));

/** Whether a task waits for a person: its stage is of kind `you`, or its last attempt failed. */
const waitsForYou = (kind: StageKind | null, flags: TaskFlags): boolean =>
  kind === "you" || flags.lastAttemptFailed;

/**
 * Whether the dispatcher may start an attempt at a task on its own (the
 * frontier): it is in a `todo` stage, everything it waits for is done, no
 * attempt at it is live, its last one did not fail, and the hub's last try
 * to start one did not fail on the task as it stands.
 */
export const onFrontier = (task: TaskSummary): boolean =>
  task.kind === "todo" &&
  task.blockedBy.length === 0 &&
  !task.liveAttempt &&
  !task.lastAttemptFailed &&
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
    needsYou: waitsForYou(kind, flags),
    ...flags,
    type: row.type,
    after: row.after,
    parent: row.parent,
    related: row.related,
    foundIn: row.foundIn,
    duplicateOf: row.duplicateOf,
    rank: row.rank,
    labels: row.labels,
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
  flags: TaskFlags,
  times: TaskTimes
): TaskView => ({
  id: taskId(number),
  number,
  path,
  title,
  stage: parsed.fields.stage ?? "",
  kind: kindIn(stages, parsed.fields.stage ?? ""),
  needsYou: waitsForYou(kindIn(stages, parsed.fields.stage ?? ""), flags),
  ...flags,
  type: parsed.fields.type,
  after: parsed.fields.after,
  parent: parsed.fields.parent,
  related: parsed.fields.related,
  foundIn: parsed.fields.foundIn,
  duplicateOf: parsed.fields.duplicateOf,
  checks: parsed.fields.checks,
  outputs: parsed.fields.outputs,
  lands: parsed.fields.lands,
  group: parsed.fields.group,
  owns: parsed.fields.owns,
  budget: parsed.fields.budget,
  rank: parsed.fields.rank,
  labels: parsed.fields.labels,
  accounts: parsed.fields.accounts,
  description: parsed.description,
  acceptance: parsed.acceptance,
  todos: parsed.todos,
  comments: parsed.comments,
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

/** Whether a task's stage, labels, type and parent hold to the filter's. */
const placeHolds = (
  task: TaskSummary,
  filter: TaskFilter,
  parent: string | null
): boolean =>
  (!filter.stage || task.stage === filter.stage) &&
  (!filter.kind || task.kind === filter.kind) &&
  (!filter.label || task.labels.includes(filter.label)) &&
  (!filter.type || task.type === filter.type) &&
  (!parent || task.parent === parent);

/** Whether a task holds to every condition of a list's filter but its words (`q`, read from files). */
const holds = (
  task: TaskSummary,
  filter: TaskFilter,
  parent: string | null
): boolean =>
  placeHolds(task, filter, parent) &&
  flagHolds(filter.blocked, task.blockedBy.length > 0) &&
  flagHolds(filter.needsYou, task.needsYou) &&
  Object.entries(filter.fields ?? {}).every(
    ([key, value]) => task.fields[key] === value
  );

/** Ids joined with what they do: `tsk-4 waits`, `tsk-4, tsk-5 wait`. */
const named = (rows: TaskIndexRow[], one: string, many: string): string =>
  `${rows.map((row) => row.id).join(", ")} ${rows.length === 1 ? one : many}`;

/**
 * Who holds on to task `id`, in a sentence: the tasks waiting for it
 * (`after`) and the tasks under it (`parent`); empty when none does.
 */
const holders = (rows: TaskIndexRow[], id: string): string => {
  const waiting = rows.filter((row) => row.after.includes(id));
  const under = rows.filter((row) => row.parent === id);
  return [
    ...(waiting.length > 0
      ? [`${named(waiting, "waits", "wait")} for it`]
      : []),
    ...(under.length > 0 ? [`${named(under, "is", "are")} under it`] : []),
  ].join(", and ");
};

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
const EDGE_PHRASE: Record<Edge, string> = {
  after: "after",
  parent: "parent",
  related: "related to",
  found_in: "found in",
  duplicate_of: "duplicate of",
};

/** The one-task edges, by the field each is read into. */
const ONE_EDGE_FIELD = {
  parent: "parent",
  found_in: "foundIn",
  duplicate_of: "duplicateOf",
} as const;

/** Sets or clears a one-task edge (`parent`, `found_in`, `duplicate_of`). */
const linkOne = (
  doc: TaskDoc,
  edge: keyof typeof ONE_EDGE_FIELD,
  target: string,
  remove: boolean | undefined
): string => {
  const phrase = `${EDGE_PHRASE[edge]} ${target}`;
  if (!remove) {
    doc.setField(edge, target);
    return phrase;
  }
  if (doc.read().fields[ONE_EDGE_FIELD[edge]] === target) {
    doc.setField(edge, null);
  }
  return `no longer ${phrase}`;
};

/** Adds or takes out one task of a list edge (`after`, `related`). */
const linkMany = (
  doc: TaskDoc,
  edge: "after" | "related",
  target: string,
  remove: boolean | undefined
): string => {
  const phrase = `${EDGE_PHRASE[edge]} ${target}`;
  const list = doc.read().fields[edge];
  doc.setField(
    edge,
    remove
      ? list.filter((each) => each !== target)
      : [...new Set([...list, target])]
  );
  return remove ? `no longer ${phrase}` : phrase;
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
  for (const field of ["checks", "outputs", "labels"] as const) {
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
  reading: StagesReading
): StagesView => ({
  source,
  template: TEMPLATES.find((name) => templateText(name) === content) ?? null,
  stages: reading.ok ? reading.stages.stages : [],
  moves: reading.ok ? reading.stages.moves : [],
  views: reading.ok ? reading.stages.views : [],
  problems: reading.ok ? [] : reading.problems,
});

/** Why the hub cannot put a task in `stage`: only that the project has no such stage. */
/**
 * The subject of a commit the hub's own task-making code writes: a task
 * filed (`task tsk-3: create “…” in idea (by you)`), tasks merged from
 * another project (`tasks tsk-4, tsk-5: Old's tasks, merged in (by …)`), a
 * duplicate project's folder folded in (project-merge.ts, `Old's files,
 * merged in: …`), and a written-in task adopted at its start ({@link
 * adoptStart}). Caw's folder_write cannot set a commit's subject; the folder
 * editor's message is yours.
 */
const HUB_MADE =
  /^task tsk-\d+: (?:create|adopt) |^tasks [^:]+: .*, merged in \(by |'s files, merged in: /;

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
export const hubProblem = (
  stages: Stages,
  stage: string
): string | undefined => {
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
  /** What kind of change it was when its words do not say (`CawCo-Change`): a comment. */
  change?: typeof COMMENT_CHANGE;
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

const WHITESPACE = /\s+/g;

/**
 * A task commit's message: the subject as people read it (`task tsk-12:
 * stage draft → review (by you)`), then the trailers task-history.ts reads
 * back: who, the mover their stage rules were checked as, the stage move and
 * the reason when there are.
 */
const commitMessage = (
  actor: TaskActor,
  subject: string,
  did: Omit<Did, "what"> = {}
): string => {
  const reason = (did.reason ?? actor.reason)?.replace(WHITESPACE, " ").trim();
  return [
    `${subject} ${byWhom(actor)}`,
    "",
    `${TRAILERS.actor}: ${actorTrailer(actor)}`,
    `${TRAILERS.mover}: ${actor.mover}`,
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
  /** One change to a project's tasks at a time, around the folder's own commits. */
  const inTurn = turnTaker();
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

  /** What a task's attempts and edges say, against the project's other tasks as indexed. */
  const flagsOf = (
    projectId: string,
    task: { after: string[]; hash: string; id: string; stage: string },
    context: {
      attempts: Map<string, TaskAttempt[]>;
      /** Every task's stage and duplicate_of, by id. */
      ends: Map<string, EdgeEnd>;
      /** The tasks the folder's history shows taken out of tasks/. */
      gone: ReadonlySet<string>;
      /** The tasks whose hook start waits for a slot. */
      queued: Set<string>;
      stages: Stages | undefined;
    }
  ): TaskFlags => {
    const { attempts: byTask, queued, ends, gone, stages } = context;
    const attempts = byTask.get(task.id) ?? [];
    const [last] = attempts;
    const kind = kindIn(stages, task.stage);
    /**
     * Done: in a done stage, or dropped as a duplicate of a task that is
     * done. A task the folder's history shows taken out of tasks/ is done
     * with, whatever the index (a cache a single read does not catch up)
     * still holds for it.
     */
    const done = (id: string, seen: Set<string>): boolean => {
      if (gone.has(id)) {
        return true;
      }
      const end = ends.get(id);
      if (!end) {
        return false;
      }
      const at = kindIn(stages, end.stage);
      if (at === "done") {
        return true;
      }
      if (at !== "dropped" || !end.duplicateOf || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return done(end.duplicateOf, seen);
    };
    return {
      attempts,
      liveAttempt: attempts.some((attempt) => isLive(attempt.state)),
      blockedBy: task.after.filter((id) => !done(id, new Set())),
      lastAttemptFailed:
        (last?.state === "failed" || last?.state === "cancelled") &&
        kind !== "done" &&
        kind !== "dropped",
      queuedStart: queued.has(task.id),
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

  /** Refuses a change while the project's tasks live somewhere other than its files. */
  const writable = (projectId: string): void => {
    const tracker = known(projectId);
    if (tracker !== "cawco") {
      refuse(
        409,
        `This project's tracker is ${tracker}, which the hub cannot write yet; set it back to cawco to keep tasks in the project folder.`
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
    return {
      projectId,
      path,
      id: taskId(number),
      number,
      title: parsed.title ?? doc.title(),
      stage: parsed.fields.stage ?? "",
      type: parsed.fields.type,
      after: parsed.fields.after,
      parent: parsed.fields.parent,
      related: parsed.fields.related,
      foundIn: parsed.fields.foundIn,
      duplicateOf: parsed.fields.duplicateOf,
      rank: parsed.fields.rank,
      labels: parsed.fields.labels,
      fields: doc.extraFields(),
      todosDone: parsed.todos.filter((todo) => todo.done).length,
      todosTotal: parsed.todos.length,
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

  /** `content` with the indexed stage in place of the one written. */
  const withStage = (path: string, content: string, stage: string): string => {
    const doc = new TaskDoc(path, content);
    doc.setField("stage", stage);
    return doc.toString();
  };

  /**
   * Puts the indexed stage back in the file, with a note on the task naming
   * who edited it (the file's last commit's author: Caw for folder_write,
   * you for the folder editor), as one commit by the hub; then indexes it.
   * Runs inside the project's turn. Answers the restored content.
   */
  const restoreStage = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    row: TaskIndexRow
  ): Promise<string> => {
    const doc = new TaskDoc(path, content);
    const written = doc.read().fields.stage || "(none)";
    const who =
      (await folderHistory(projectId, path, 1).catch(() => undefined))
        ?.commits[0]?.author || "someone";
    const at = new Date().toISOString().slice(0, 16).replace("T", " ");
    doc.setField("stage", row.stage);
    doc.addNote(
      `${at} UTC: stage changes go through task moves; ${who} edited the file to say stage ${written}, so it stays ${row.stage}.`
    );
    const restored = doc.toString();
    stands(projectId);
    const actor = hubActor("stage changes go through task moves");
    await writeFolderFile(projectId, path, restored, {
      author: actor.author,
      message: commitMessage(
        actor,
        `task ${row.id}: stage ${written} written by ${who} put back to ${row.stage}`
      ),
    });
    store.put([indexRow(projectId, path, number, restored, hashOf(restored))]);
    console.info(
      `[tasks] ${projectId} ${row.id}: ${who} wrote stage ${written} into its file; it stays ${row.stage}`
    );
    emit({ kind: "changed", projectId, id: row.id });
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
    const history = await folderHistory(projectId, path, HISTORY_LIMIT).catch(
      () => undefined
    );
    if (
      !history?.commits.length ||
      history.commits.some((commit) => HUB_MADE.test(commit.message))
    ) {
      return;
    }
    const who = history.commits.at(-1)?.author || "someone";
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

  /**
   * A new file adopted at the stage tasks start in, with a note on the task
   * naming who wrote it straight into its stage, as one commit by the hub
   * (its subject one {@link HUB_MADE} reads); then indexed. Inside the turn.
   */
  const adoptStart = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    stray: { start: string; who: string; written: string }
  ): Promise<void> => {
    const { start, who, written } = stray;
    const doc = new TaskDoc(path, content);
    const at = new Date().toISOString().slice(0, 16).replace("T", " ");
    doc.setField("stage", start);
    doc.addNote(
      `${at} UTC: ${who} wrote this task straight into stage ${written}; tasks start in ${start}.`
    );
    const adopted = doc.toString();
    stands(projectId);
    const actor = hubActor(`tasks start in ${start}`);
    await writeFolderFile(projectId, path, adopted, {
      author: actor.author,
      message: commitMessage(
        actor,
        `task ${taskId(number)}: adopt at ${start}, written by ${who} into stage ${written}`,
        { stage: { from: written === NO_STAGE ? "" : written, to: start } }
      ),
    });
    store.put([indexRow(projectId, path, number, adopted, hashOf(adopted))]);
    console.info(
      `[tasks] ${projectId} ${taskId(number)}: ${who} wrote it straight into stage ${written}; it starts in ${start}`
    );
    emit({ kind: "changed", projectId, id: taskId(number) });
  };

  /** Files queued to settle, by project and path: one write is settled once however often it is read. */
  const settling = new Set<string>();

  /**
   * A read outside the project's turn found a file to settle (a stray stage
   * on a known task, or a new task in a stage it may not start in): it is
   * settled in the turn (a change under way finishes first), judged again
   * there; the index does not take the written stage meanwhile.
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
          const start = row
            ? undefined
            : await strayStart(
                projectId,
                path,
                content,
                await currentStages(projectId)
              );
          if (strayStage(row, path, content) && row) {
            await restoreStage(projectId, path, number, content, row);
          } else if (start) {
            await adoptStart(projectId, path, number, content, start);
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
          const unsettled = row
            ? strayStage(row, path, content)
            : await strayStart(projectId, path, content, await stagesNow());
          if (unsettled) {
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
    for (const [id, paths] of claimed) {
      if (paths.length > 1) {
        problems.push(
          `${id} is claimed by ${paths.length} files (${paths.join(", ")}); rename all but one.`
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
    return stage;
  };

  /**
   * One past the highest number anything holds now: a file in tasks/ as
   * the disk has it (committed or not, read with no git), any path the
   * folder's history ever named (read once per commit, folderFileTimes), the
   * index, and what this process handed out; and past `above`. Read at the
   * moment of making a task, inside the project's turn.
   */
  const nextNumber = async (projectId: string, above = 0): Promise<number> => {
    const [{ ever }, names] = await Promise.all([
      folderFileTimes(projectId, "tasks"),
      folderFileNames(projectId, "tasks"),
    ]);
    let highest = Math.max(above, issued.get(projectId) ?? 0);
    for (const name of [...ever, ...names]) {
      highest = Math.max(highest, fileTaskNumber(name) ?? 0);
    }
    for (const row of store.index(projectId)) {
      highest = Math.max(highest, row.number);
    }
    issued.set(projectId, highest + 1);
    return highest + 1;
  };

  /** stages.md as it reads, or the code template while the project has none. */
  const stagesOf = async (
    projectId: string
  ): Promise<{
    content: string;
    reading: StagesReading;
    source: "file" | "template";
  }> => {
    try {
      const { content } = await readFolderFile(projectId, STAGES_FILE);
      return { source: "file", content, reading: readStages(content) };
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return {
          source: "template",
          content: templateText(DEFAULT_TEMPLATE),
          reading: { ok: true, stages: templateStages(DEFAULT_TEMPLATE) },
        };
      }
      throw error;
    }
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
    return viewOf(
      path,
      number,
      parsed,
      doc.title(),
      hash,
      stages,
      flagsOf(
        projectId,
        { id: taskId(number), after: parsed.fields.after, stage, hash },
        {
          attempts: attemptsByTask(projectId),
          queued: queuedIn(projectId),
          ends: endsById(rows),
          gone,
          stages,
        }
      ),
      times.get(path) as TaskTimes
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
      // biome-ignore lint/performance/noAwaitInLoops: numbers are handed out in the files' own order
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
      doc.setField(
        "after",
        fields.after.flatMap((ref) => renamed(ref, old))
      );
      doc.setField(
        "related",
        fields.related.flatMap((ref) => renamed(ref, old))
      );
      doc.setField(
        "parent",
        fields.parent ? (renamed(fields.parent, old)[0] ?? null) : null
      );
      doc.setField(
        "found_in",
        fields.foundIn ? (renamed(fields.foundIn, old)[0] ?? null) : null
      );
      // A to-do promoted to a task names it `→ #<n>`.
      const content = doc
        .toString()
        .replace(PROMOTED_TODO, (line, head: string, n: string) => {
          const now = renames.get(taskId(Number(n)));
          return now ? `${head}${taskNumber(now)}` : line;
        });
      return { path: taskPath(number, doc.title()), number, content };
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
          `tasks ${written.map((each) => taskId(each.number)).join(", ")}: ${from}'s ${written.length === 1 ? "task" : "tasks"}, merged in`
        ),
        exclusive: sameNumber,
      }
    );
    stands(projectId);
    store.put(
      written.map(({ path, number, content }) =>
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
        // biome-ignore lint/performance/noAwaitInLoops: each try waits on the one before it
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
    inTurn(projectId, async () => {
      writable(projectId);
      const { path, number } = await locate(projectId, ref, true);
      const id = taskId(number);
      const read = (await readFolderFile(projectId, path)).content;
      // A stage written into the file is put back before any change reads it.
      const stray = strayStage(
        store.index(projectId).find((each) => each.path === path),
        path,
        read
      );
      const content = stray
        ? await restoreStage(projectId, path, number, read, stray)
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
        commitMessage(actor, `task ${id}: ${what}`, did)
      );
    });

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
    actor: TaskActor
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
        `${id} cannot go to ${to} as an approved action: only an action the owner approved, once its call is done, moves its own task to the stage it named.`
      );
    }
    const problem =
      actor.mover === "hub"
        ? hubProblem(stages, to)
        : moveProblem(stages, id, from, to, actor.mover);
    if (problem) {
      refuse(stageNamed(stages, to) ? 403 : 400, problem);
    }
    doc.setField("stage", to);
    return { from, to };
  };

  /** The task an edge names, as `tsk-…`: one the project has, unless the edge is being taken out. */
  const edgeTarget = async (
    projectId: string,
    request: { edge: Edge; to: string; remove?: boolean },
    id: string
  ): Promise<string> => {
    const number = taskNumber(request.to);
    if (number === undefined) {
      return refuse(
        400,
        `“${request.to}” is not a task id; tasks are named like tsk-12.`
      );
    }
    return request.remove
      ? taskId(number)
      : ((await targets(projectId, request.edge, [request.to], id))[0] ??
          taskId(number));
  };

  /**
   * Links a task's file `duplicate_of` `target` and drops it: it moves to
   * the project's first stage of kind dropped, checked for the actor as any
   * move, with the reason "duplicate of <target>". A task in a dropped stage
   * already stays where it is. Refused when `target` is a duplicate of it,
   * or the project has no dropped stage.
   */
  const markDuplicate = async (
    projectId: string,
    doc: TaskDoc,
    id: string,
    target: string,
    actor: TaskActor
  ): Promise<Did> => {
    const rows = store.index(projectId);
    if (
      loops(rows, id, target, (row) =>
        row.duplicateOf ? [row.duplicateOf] : []
      )
    ) {
      refuse(
        409,
        `${target} is already a duplicate of ${id}, so ${id} cannot be a duplicate of it.`
      );
    }
    const phrase = linkOne(doc, "duplicate_of", target, false);
    const stages = await usableStages(projectId, "drop a duplicate");
    const dropped = stages.stages.find((each) => each.kind === "dropped");
    if (!dropped) {
      return refuse(
        409,
        `The project has no stage of kind dropped, so ${id} cannot be closed as a duplicate of ${target}. Add one to stages.md.`
      );
    }
    if (kindIn(stages, doc.read().fields.stage ?? "") === "dropped") {
      return { what: phrase };
    }
    const stage = moveTo(projectId, doc, id, stages, dropped.name, actor);
    return stage
      ? {
          what: `${phrase}; stage ${stage.from || NO_STAGE} → ${stage.to}`,
          stage,
          reason: phrase,
        }
      : { what: phrase };
  };

  /** A move's reason as given: one line, or nothing. */
  const reasonOf = (reason: string | undefined): string | undefined =>
    reason?.trim() ? oneLine("reason", reason, REASON_LIMIT) : undefined;

  /** Would `id` waiting on `target` (or having it as parent) close a loop? */
  const loops = (
    rows: TaskIndexRow[],
    id: string,
    target: string,
    next: (row: TaskIndexRow) => string[]
  ): boolean => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const seen = new Set<string>();
    const stack = [target];
    while (stack.length > 0) {
      const at = stack.pop() as string;
      if (at === id) {
        return true;
      }
      if (seen.has(at)) {
        continue;
      }
      seen.add(at);
      const row = byId.get(at);
      if (row) {
        stack.push(...next(row));
      }
    }
    return false;
  };

  return {
    /** The project's tasks from the index, caught up with the files first. */
    async list(projectId: string, filter: TaskFilter = {}): Promise<TaskList> {
      const tracker = known(projectId);
      const parent = filter.parent ? taskRef("parent", filter.parent) : null;
      const [{ rows: board, problems }, { reading }] = await Promise.all([
        sync(projectId),
        stagesOf(projectId),
      ]);
      const rows = filter.archived ? await archivedRows(projectId) : board;
      const stages = reading.ok ? reading.stages : undefined;
      const { gone, times } = await timesOf(projectId, rows, stages);
      const context = {
        attempts: attemptsByTask(projectId),
        queued: queuedIn(projectId),
        ends: endsById(board),
        gone,
        stages,
      };
      const kept = rows
        .map((row) =>
          summaryOf(
            row,
            stages,
            flagsOf(projectId, row, context),
            times.get(row.path) as TaskTimes
          )
        )
        .filter((task) => holds(task, filter, parent));
      const tasks = (
        filter.q?.trim() ? await saying(projectId, kept, filter.q) : kept
      ).sort(byRank);
      return {
        tracker,
        tasks,
        problems,
        stagesProblems: reading.ok ? [] : reading.problems,
      };
    },

    /** One task, its file read and parsed; the index catches up if the file moved. */
    async get(projectId: string, ref: string): Promise<TaskView> {
      known(projectId);
      // The index caught up first, as a list does: the other tasks this one's
      // edges name read as their files are now.
      const { rows } = await sync(projectId);
      const { path, number } = await locate(projectId, ref);
      const { content } = await readFolderFile(projectId, path);
      const row = rows.find((each) => each.path === path);
      const stray = strayStage(row, path, content);
      if (stray) {
        // Shown at the stage it is in; the file gets it back in its turn.
        queueSettle(projectId, path, number);
      }
      return view(
        projectId,
        path,
        number,
        stray ? withStage(path, content, stray.stage) : content,
        await currentStages(projectId)
      );
    },

    create(
      projectId: string,
      draft: TaskDraft,
      actor: TaskActor
    ): Promise<TaskView> {
      return inTurn(projectId, async () => {
        writable(projectId);
        const title = oneLine("title", draft.title, TITLE_LIMIT);
        const stage = await startStage(projectId, draft.stage, actor);
        const fields: Partial<TaskFields> = {
          stage,
          type: draft.type ? typeName(draft.type) : null,
          after: await targets(projectId, "after", draft.after ?? []),
          parent: await single(projectId, "parent", draft.parent),
          related: await targets(projectId, "related", draft.related ?? []),
          foundIn: await single(projectId, "found_in", draft.foundIn),
          checks: items("checks", draft.checks ?? []),
          outputs: items("outputs", draft.outputs ?? []),
          lands: draft.lands ?? null,
          ...limitsOf(draft),
          rank: draft.rank ? oneLine("rank", draft.rank, 64) : null,
          labels: items("labels", draft.labels ?? []),
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
              `task ${taskId(number)}: create “${title}” in ${stage}`,
              { stage: { from: "", to: stage } }
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
        writable(projectId);
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
            // biome-ignore lint/performance/noAwaitInLoops: each try waits on the one before it
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
      return change(projectId, ref, actor, (doc) =>
        applyPatch(doc, patch)
      ).then((task) => told({ kind: "changed", projectId }, task));
    },

    /**
     * Moves a task to another stage, checked against the moves for its mover;
     * the hub's own moves are not, as the stage exists. `reason` says why
     * (a close reason, most often); its commit carries it, and the task's
     * history shows it. Listeners hear of a move that happened.
     */
    async move(
      projectId: string,
      ref: string,
      stage: string,
      actor: TaskActor,
      reason?: string
    ): Promise<TaskView> {
      const why = reasonOf(reason);
      let moved: { from: string; to: string } | undefined;
      const task = await change(projectId, ref, actor, async (doc, id) => {
        const stages = await usableStages(projectId, "check a stage change");
        const to = stageName(stage);
        moved = moveTo(projectId, doc, id, stages, to, actor);
        if (!moved) {
          return `stage ${to}`;
        }
        return {
          what: `stage ${moved.from || NO_STAGE} → ${to}`,
          stage: moved,
          ...(why ? { reason: why } : {}),
        };
      });
      return moved
        ? told({ kind: "moved", projectId, id: task.id, actor, ...moved }, task)
        : task;
    },

    /**
     * Adds or removes one edge from a task to another. Linking
     * `duplicate_of` also drops the task: it moves to the project's first
     * stage of kind dropped, checked for the actor as any move, with the
     * reason "duplicate of tsk-n"; listeners hear of the move.
     */
    async link(
      projectId: string,
      ref: string,
      request: { edge: Edge; to: string; remove?: boolean },
      actor: TaskActor
    ): Promise<TaskView> {
      let moved: { from: string; to: string } | undefined;
      const task = await change(projectId, ref, actor, async (doc, id) => {
        const { edge, remove } = request;
        const target = await edgeTarget(projectId, request, id);
        if (edge === "duplicate_of" && !remove) {
          const marked = await markDuplicate(projectId, doc, id, target, actor);
          moved = marked.stage;
          return marked;
        }
        const rows = store.index(projectId);
        if (
          edge === "parent" ||
          edge === "found_in" ||
          edge === "duplicate_of"
        ) {
          if (
            !remove &&
            edge === "parent" &&
            loops(rows, id, target, (row) => (row.parent ? [row.parent] : []))
          ) {
            refuse(
              409,
              `${target} is already under ${id}, so ${id} cannot be its child.`
            );
          }
          return linkOne(doc, edge, target, remove);
        }
        if (
          !remove &&
          edge === "after" &&
          loops(rows, id, target, (row) => row.after)
        ) {
          refuse(
            409,
            `${target} already waits for ${id}, so ${id} waiting for it would never start.`
          );
        }
        return linkMany(doc, edge, target, remove);
      });
      return moved
        ? told({ kind: "moved", projectId, id: task.id, actor, ...moved }, task)
        : told({ kind: "changed", projectId }, task);
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
     * its words: yours reach the task's live attempt (server.ts).
     */
    comment(
      projectId: string,
      ref: string,
      text: string,
      actor: TaskActor
    ): Promise<TaskView> {
      const written = commentText(text);
      return change(projectId, ref, actor, (doc) => {
        doc.addComment(
          {
            name: actor.author.name,
            mover: actor.mover,
            id: actor.instanceId ?? actor.actionId ?? actor.routineId ?? null,
          },
          new Date(),
          written
        );
        return {
          what: `comment “${commentGist(written)}”`,
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
    },

    /**
     * Archives a task: its file moves to tasks/archive/ in one commit, off
     * every list but `archived`, done for every task that waits on it, and
     * kept with its history. Refused while an attempt at it is live.
     */
    archive(
      projectId: string,
      ref: string,
      actor: TaskActor
    ): Promise<TaskView> {
      return inTurn(projectId, async () => {
        writable(projectId);
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
        const to = archivePath(path);
        stands(projectId);
        await moveFolderFile(projectId, path, to, {
          author: actor.author,
          message: commitMessage(actor, `task ${id}: archive`),
        });
        store.drop(projectId, [path]);
        const { content } = await readFolderFile(projectId, to);
        return view(
          projectId,
          to,
          number,
          content,
          await currentStages(projectId)
        );
      }).then((task) =>
        told({ kind: "changed", projectId, id: task.id }, task)
      );
    },

    /**
     * Deletes a task's file, as one commit; its history stays in the
     * folder's. Refused while another task waits for it (`after`) or sits
     * under it (`parent`), naming them: archive it instead, which they take
     * as done, or take their edges out first.
     */
    remove(
      projectId: string,
      ref: string,
      actor: TaskActor
    ): Promise<{ id: string; path: string }> {
      return inTurn(projectId, async () => {
        writable(projectId);
        const { rows } = await sync(projectId);
        const { path, number } = await locate(projectId, ref);
        const id = taskId(number);
        const held = holders(
          rows.filter((row) => row.path !== path),
          id
        );
        if (held) {
          refuse(
            409,
            `${id} cannot be deleted: ${held}. Archive it instead, which they take as done, or take those edges out first.`
          );
        }
        const { content } = await readFolderFile(projectId, path);
        stands(projectId);
        await deleteFolderFile(projectId, path, {
          author: actor.author,
          message: commitMessage(
            actor,
            `task ${id}: delete “${new TaskDoc(path, content).title()}”`
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
      return stagesView(source, content, reading);
    },

    /** Writes stages.md, once it reads; a file that does not is refused with every problem. */
    putStages(
      projectId: string,
      content: string,
      actor: TaskActor,
      message?: string
    ): Promise<StagesView> {
      return inTurn(projectId, async () => {
        writable(projectId);
        const reading = readStages(content);
        if (!reading.ok) {
          refuse(422, `stages.md was not saved. ${reading.problems.join(" ")}`);
        }
        await writeFolderFile(projectId, STAGES_FILE, content, {
          author: actor.author,
          message: message?.trim() || `stages: update ${byWhom(actor)}`,
        });
        return stagesView("file", content, reading);
      }).then((written) => told({ kind: "changed", projectId }, written));
    },

    /**
     * Writes a template as the project's stages.md. Answers the stages, and
     * the tasks whose stage the template does not have (they stay where they
     * are until moved).
     */
    applyTemplate(
      projectId: string,
      template: StagesTemplate,
      actor: TaskActor
    ): Promise<StagesView & { stranded: string[] }> {
      return inTurn(projectId, async () => {
        writable(projectId);
        const content = templateText(template);
        await writeFolderFile(projectId, STAGES_FILE, content, {
          author: actor.author,
          message: `stages: apply the ${template} template ${byWhom(actor)}`,
        });
        const stages = templateStages(template);
        const { rows } = await sync(projectId);
        return {
          ...stagesView("file", content, { ok: true, stages }),
          stranded: rows
            .filter((row) => !stageNamed(stages, row.stage))
            .map((row) => row.id),
        };
      }).then((written) => told({ kind: "changed", projectId }, written));
    },

    /** Hears every change to a project's tasks once it has landed; answers how to stop. */
    listen(listener: (event: TaskEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Tells listeners a project's folder changed under the tasks (a write through the folder's own routes). */
    touched(projectId: string): void {
      emit({ kind: "changed", projectId });
    },

    /** The stage templates a project can apply. */
    templates(): StagesTemplateView[] {
      return TEMPLATES.map((name) => ({
        name,
        content: templateText(name),
        ...templateStages(name),
      }));
    },

    /** Sets where the project's tasks live; only CawCo's files are built. */
    setTracker(projectId: string, tracker: Tracker): { tracker: Tracker } {
      known(projectId);
      if (tracker !== "cawco") {
        refuse(
          409,
          `${tracker === "github" ? "GitHub Issues" : "Linear"} as a tracker is not built yet; this project keeps its tasks in CawCo's files (tracker: cawco).`
        );
      }
      store.setTracker(projectId, tracker);
      return { tracker };
    },

    /** Catches up the index of every project that has a folder: what the hub does as it starts. */
    async syncAll(): Promise<void> {
      for (const projectId of store.projectIds()) {
        // biome-ignore lint/performance/noAwaitInLoops: one project at a time keeps a start from reading every folder at once
        if (await hasProjectFolder(projectId)) {
          try {
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

const EDGE = t.Union([
  t.Literal("after"),
  t.Literal("parent"),
  t.Literal("related"),
  t.Literal("found_in"),
  t.Literal("duplicate_of"),
]);
const KIND = t.Union([
  t.Literal("todo"),
  t.Literal("active"),
  t.Literal("waiting"),
  t.Literal("you"),
  t.Literal("done"),
  t.Literal("dropped"),
]);
const TEMPLATE = t.Union([
  t.Literal("code"),
  t.Literal("social"),
  t.Literal("outreach"),
  t.Literal("seo"),
  t.Literal("design"),
]);
/** Where an attempt's work lands (`@cawco/core`'s `LandsMode`). */
export const LANDS = t.Union([
  t.Literal("main"),
  t.Literal("branch"),
  t.Literal("pr"),
  t.Literal("none"),
]);
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
const TRACKER = t.Union([
  t.Literal("cawco"),
  t.Literal("github"),
  t.Literal("linear"),
]);

/**
 * The dashboard's routes for a project's tasks, under
 * `/api/projects/:id/tasks`, its stages and tracker setting, and the stage
 * templates. Changes from here are the operator's ("you").
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
          /** The parent task, like tsk-12. */
          parent: t.Optional(t.String()),
          /** 1: only tasks still waiting for another; 0: only tasks that are not. */
          blocked: t.Optional(FLAG),
          /** 1: only tasks that need you; 0: only tasks that do not. */
          needsYou: t.Optional(FLAG),
          /** 1: the archived tasks instead of the board's. */
          archived: t.Optional(FLAG),
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
            parent: query.parent,
            blocked: flagOf(query.blocked),
            needsYou: flagOf(query.needsYou),
            archived: query.archived === "1",
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
          after: t.Optional(t.Array(t.String())),
          parent: t.Optional(t.String()),
          related: t.Optional(t.Array(t.String())),
          foundIn: t.Optional(t.String()),
          checks: t.Optional(t.Array(t.String())),
          outputs: t.Optional(t.Array(t.String())),
          lands: t.Optional(LANDS),
          group: t.Optional(t.String()),
          owns: t.Optional(t.Array(t.String())),
          budget: t.Optional(BUDGET),
          rank: t.Optional(t.String()),
          labels: t.Optional(t.Array(t.String())),
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
          group: t.Optional(t.Nullable(t.String())),
          owns: t.Optional(t.Array(t.String())),
          budget: t.Optional(t.Nullable(BUDGET)),
          checks: t.Optional(t.Array(t.String())),
          outputs: t.Optional(t.Array(t.String())),
          labels: t.Optional(t.Array(t.String())),
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
      { body: t.Object({ text: t.String() }) },
      async ({ params, body }) => {
        try {
          return await tasks.comment(
            params.id,
            params.taskId,
            body.text,
            YOU_ACTOR
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post("/api/projects/:id/tasks/:taskId/archive", async ({ params }) => {
      try {
        return await tasks.archive(params.id, params.taskId, YOU_ACTOR);
      } catch (error) {
        return refused(error);
      }
    })
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
          return await tasks.move(
            params.id,
            params.taskId,
            body.stage,
            YOU_ACTOR,
            body.reason
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/links",
      {
        body: t.Object({
          edge: EDGE,
          to: t.String(),
          remove: t.Optional(t.Boolean()),
        }),
      },
      async ({ params, body }) => {
        try {
          return await tasks.link(params.id, params.taskId, body, YOU_ACTOR);
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
    .get("/api/stage-templates", () => tasks.templates())
    .put(
      "/api/projects/:id/tracker",
      { body: t.Object({ tracker: TRACKER }) },
      ({ params, body }) => {
        try {
          return tasks.setTracker(params.id, body.tracker);
        } catch (error) {
          return refused(error);
        }
      }
    );
