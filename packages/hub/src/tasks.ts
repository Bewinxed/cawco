/**
 * A project's tasks (§5.2 of the Projects spec): one file each in the
 * project's hub folder (task-file.ts has the format), an index the hub keeps
 * beside them, and the one way the dashboard and sessions change them.
 *
 * - **Files are the truth.** Every change here reads the file, changes the
 *   lines it owns and writes it back through project-folder.ts, so it is a
 *   commit with an author and a message (`task tsk-12: stage draft → review
 *   (by you)`). A file changed by hand is read as it is.
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
import { Elysia, t } from "elysia";
import type { TaskIndexRow, WorkItemRow } from "./db";
import type { Tracker, WorkBudget, WorkItemState } from "./db/schema";
import {
  type FolderAuthor,
  FolderRefusal,
  folderPathsInHistory,
  hasProjectFolder,
  listFolder,
  readFolderFile,
  refused,
  turnTaker,
  writeFolderFile,
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
  type Edge,
  fileTaskNumber,
  type ParsedTask,
  TaskDoc,
  type TaskFields,
  type Todo,
  taskId,
  taskNumber,
  taskPath,
} from "./task-file";
import { budgetProblem, isLive, ownsProblem } from "./work-items";

/**
 * Who moves a task: one of the movers stages.md names, or `hub`, the hub's
 * own code (the dispatcher), which the file's moves do not bind.
 */
export type TaskMover = Mover | "hub";

/** Who is changing a task: what stage moves they may make, and whom the commit is by. */
export interface TaskActor {
  author: FolderAuthor;
  /** The session making the change, when one is. */
  instanceId?: string;
  mover: TaskMover;
  /** Why, when the hub says: `(by hub: attempt 5fd1e189 started)`. */
  reason?: string;
}

/** The operator, at the dashboard. */
export const YOU_ACTOR: TaskActor = { mover: "you", author: YOU };

/** The hub's own code moving a task, and why. */
export const hubActor = (reason: string): TaskActor => ({
  mover: "hub",
  author: { name: "hub" },
  reason,
});

/**
 * A session calling the task tools: it moves stages as a `session`, and
 * commits under its name; Caw's lead session (role `lead`) moves as the
 * `lead` and commits as Caw.
 */
export const sessionActor = (row: InstanceRow): TaskActor =>
  row.role === "lead"
    ? { mover: "lead", instanceId: row.id, author: { name: "Caw" } }
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
  /** The tasks it waits for (`after`) that are not in a done stage; a task the project lacks counts. */
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
  | { kind: "changed"; projectId: string };

/** What the service needs of the hub's database. */
export interface TaskStore {
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

/** One task as a list shows it: the index's row, and what its attempts and edges say. */
export interface TaskSummary extends TaskFlags {
  after: string[];
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
  stage: string;
  title: string;
  todos: { done: number; total: number };
  type: string | null;
  /** When the hub last saw the file's content change, ms epoch. */
  updatedAt: number;
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
export interface TaskView extends TaskFlags {
  acceptance: string;
  after: string[];
  /** What an attempt may spend before the hub stops it; null: the project's default. */
  budget: WorkBudget | null;
  checks: string[];
  description: string;
  /** Front matter keys the file carries that a task file does not know; kept as written. */
  extra: string[];
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
const TEXT_LIMIT = 20_000;
const ITEM_LIMIT = 200;
const LIST_LIMIT = 50;
const TYPE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SECTION_LINE = /^##\s/m;
const TODO_MARKER_START = /^\[td-\d+\]/;
const LINE_BREAK = /[\r\n]/;

/** The project folder's stages file, and the template that stands in while there is none. */
const STAGES_FILE = "stages.md";
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

/** Every indexed task's stage, by id. */
const stagesById = (rows: TaskIndexRow[]): Map<string, string> =>
  new Map(rows.map((row) => [row.id, row.stage]));

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
  flags: TaskFlags
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
    rank: row.rank,
    labels: row.labels,
    todos: { done: row.todosDone, total: row.todosTotal },
    updatedAt: row.updatedAt.getTime(),
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
  flags: TaskFlags
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
  checks: parsed.fields.checks,
  outputs: parsed.fields.outputs,
  lands: parsed.fields.lands,
  group: parsed.fields.group,
  owns: parsed.fields.owns,
  budget: parsed.fields.budget,
  rank: parsed.fields.rank,
  labels: parsed.fields.labels,
  description: parsed.description,
  acceptance: parsed.acceptance,
  todos: parsed.todos,
  sections: parsed.sections,
  extra: parsed.extra,
  problems: parsed.problems,
  hash,
});

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
};

/** Sets or clears a one-task edge (`parent`, `found_in`). */
const linkOne = (
  doc: TaskDoc,
  edge: "parent" | "found_in",
  target: string,
  remove: boolean | undefined
): string => {
  const phrase = `${EDGE_PHRASE[edge]} ${target}`;
  if (!remove) {
    doc.setField(edge, target);
    return phrase;
  }
  const { fields } = doc.read();
  if ((edge === "parent" ? fields.parent : fields.foundIn) === target) {
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
const hubProblem = (stages: Stages, stage: string): string | undefined =>
  stageNamed(stages, stage)
    ? undefined
    : `${stage} is not a stage of this project.`;

/** Commit messages say who: `(by you)`, `(by Fix tray chip)`, `(by hub: attempt 5fd1e189 started)`. */
const byWhom = (actor: TaskActor): string =>
  `(by ${actor.author.name}${actor.reason ? `: ${actor.reason}` : ""})`;

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
      /** The tasks whose hook start waits for a slot. */
      queued: Set<string>;
      /** Every task's stage, by id. */
      stageOf: Map<string, string>;
      stages: Stages | undefined;
    }
  ): TaskFlags => {
    const { attempts: byTask, queued, stageOf, stages } = context;
    const attempts = byTask.get(task.id) ?? [];
    const [last] = attempts;
    const kind = kindIn(stages, task.stage);
    return {
      attempts,
      liveAttempt: attempts.some((attempt) => isLive(attempt.state)),
      blockedBy: task.after.filter((id) => {
        const stage = stageOf.get(id);
        return stage === undefined || kindIn(stages, stage) !== "done";
      }),
      lastAttemptFailed:
        (last?.state === "failed" || last?.state === "cancelled") &&
        kind !== "done" &&
        kind !== "dropped",
      queuedStart: queued.has(task.id),
      startProblem: store.startProblem?.(projectId, task) ?? null,
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
      rank: parsed.fields.rank,
      labels: parsed.fields.labels,
      todosDone: parsed.todos.filter((todo) => todo.done).length,
      todosTotal: parsed.todos.length,
      problem: parsed.problems.join(" ") || null,
      hash,
      updatedAt: new Date(),
    };
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
    const read = await Promise.all(
      files.map(async ({ path, number }) => {
        try {
          const { content } = await readFolderFile(projectId, path);
          const hash = hashOf(content);
          return indexed.get(path)?.hash === hash
            ? undefined
            : indexRow(projectId, path, number, content, hash);
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

  /**
   * The file a reference names, catching up the index when it does not know
   * it yet. Two files claiming one id read as the first; a change to it is
   * refused until one is renamed.
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
      return refuse(404, `The project has no task ${taskId(number)}.`);
    }
    if (forChange && claims.length > 1) {
      refuse(
        409,
        `${taskId(number)} is claimed by ${claims.length} files (${claims.map((row) => row.path).join(", ")}); rename all but one before changing it.`
      );
    }
    return { path: first.path, number };
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
    const problem =
      actor.mover === "hub"
        ? hubProblem(stages, stage)
        : startProblem(stages, stage, actor.mover);
    if (problem) {
      refuse(stageNamed(stages, stage) ? 403 : 400, problem);
    }
    return stage;
  };

  /** One past the highest number the folder ever held, or this process handed out. */
  const nextNumber = async (projectId: string): Promise<number> => {
    let highest = issued.get(projectId);
    if (highest === undefined) {
      const history = await folderPathsInHistory(projectId, "tasks");
      highest = Math.max(
        0,
        ...history.map((path) => fileTaskNumber(path) ?? 0)
      );
    }
    const next =
      Math.max(highest, ...store.index(projectId).map((row) => row.number)) + 1;
    issued.set(projectId, next);
    return next;
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

  const view = (
    projectId: string,
    path: string,
    number: number,
    content: string,
    stages: Stages | undefined
  ): TaskView => {
    const doc = new TaskDoc(path, content);
    const parsed = doc.read();
    const hash = hashOf(content);
    return viewOf(
      path,
      number,
      parsed,
      doc.title(),
      hash,
      stages,
      flagsOf(
        projectId,
        {
          id: taskId(number),
          after: parsed.fields.after,
          stage: parsed.fields.stage ?? "",
          hash,
        },
        {
          attempts: attemptsByTask(projectId),
          queued: queuedIn(projectId),
          stageOf: stagesById(store.index(projectId)),
          stages,
        }
      )
    );
  };

  /** Writes a task file through the folder (one commit) and re-indexes it. */
  const save = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    actor: TaskActor,
    message: string
  ): Promise<TaskView> => {
    await writeFolderFile(projectId, path, content, {
      author: actor.author,
      message,
    });
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
   * Reads a task's file, lets `apply` change it, and writes it back when it
   * changed. `apply` answers what it did, for the commit message.
   */
  const change = (
    projectId: string,
    ref: string,
    actor: TaskActor,
    apply: (doc: TaskDoc, id: string) => Promise<string> | string
  ): Promise<TaskView> =>
    inTurn(projectId, async () => {
      writable(projectId);
      const { path, number } = await locate(projectId, ref, true);
      const id = taskId(number);
      const { content } = await readFolderFile(projectId, path);
      const doc = new TaskDoc(path, content);
      const did = await apply(doc, id);
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
        `task ${id}: ${did} ${byWhom(actor)}`
      );
    });

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
    async list(
      projectId: string,
      filter: { kind?: StageKind; stage?: string } = {}
    ): Promise<TaskList> {
      const tracker = known(projectId);
      const [{ rows, problems }, { reading }] = await Promise.all([
        sync(projectId),
        stagesOf(projectId),
      ]);
      const stages = reading.ok ? reading.stages : undefined;
      const context = {
        attempts: attemptsByTask(projectId),
        queued: queuedIn(projectId),
        stageOf: stagesById(rows),
        stages,
      };
      const tasks = rows
        .map((row) => summaryOf(row, stages, flagsOf(projectId, row, context)))
        .filter(
          (task) =>
            (!filter.stage || task.stage === filter.stage) &&
            (!filter.kind || task.kind === filter.kind)
        )
        .sort(byRank);
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
      const { path, number } = await locate(projectId, ref);
      const { content } = await readFolderFile(projectId, path);
      const hash = hashOf(content);
      const row = store.index(projectId).find((each) => each.path === path);
      if (row?.hash !== hash) {
        store.put([indexRow(projectId, path, number, content, hash)]);
      }
      return view(
        projectId,
        path,
        number,
        content,
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
        const fields: Partial<TaskFields> = {
          stage: await startStage(projectId, draft.stage, actor),
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
        const number = await nextNumber(projectId);
        const path = taskPath(number, title);
        const doc = TaskDoc.create(path, {
          title,
          fields,
          description,
          acceptance,
          todos,
        });
        return await save(
          projectId,
          path,
          number,
          doc.toString(),
          actor,
          `task ${taskId(number)}: create “${title}” in ${fields.stage} ${byWhom(actor)}`
        );
      }).then((task) =>
        told(
          { kind: "created", projectId, id: task.id, stage: task.stage, actor },
          task
        )
      );
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
     * the hub's own moves are not, as the stage exists. Listeners hear of a
     * move that happened.
     */
    async move(
      projectId: string,
      ref: string,
      stage: string,
      actor: TaskActor
    ): Promise<TaskView> {
      let moved: { from: string; to: string } | undefined;
      const task = await change(projectId, ref, actor, async (doc, id) => {
        const stages = await usableStages(projectId, "check a stage change");
        const to = stageName(stage);
        const from = doc.read().fields.stage ?? "";
        if (from === to) {
          return `stage ${to}`;
        }
        const problem =
          actor.mover === "hub"
            ? hubProblem(stages, to)
            : moveProblem(stages, id, from, to, actor.mover);
        if (problem) {
          refuse(stageNamed(stages, to) ? 403 : 400, problem);
        }
        doc.setField("stage", to);
        moved = { from, to };
        return `stage ${from || "(none)"} → ${to}`;
      });
      return moved
        ? told({ kind: "moved", projectId, id: task.id, actor, ...moved }, task)
        : task;
    },

    /** Adds or removes one edge from a task to another. */
    link(
      projectId: string,
      ref: string,
      request: { edge: Edge; to: string; remove?: boolean },
      actor: TaskActor
    ): Promise<TaskView> {
      return change(projectId, ref, actor, async (doc, id) => {
        const { edge, remove } = request;
        const number = taskNumber(request.to);
        if (number === undefined) {
          return refuse(
            400,
            `“${request.to}” is not a task id; tasks are named like tsk-12.`
          );
        }
        const target = remove
          ? taskId(number)
          : (await targets(projectId, edge, [request.to], id))[0];
        const rows = store.index(projectId);
        if (edge === "parent" || edge === "found_in") {
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
      }).then((task) => told({ kind: "changed", projectId }, task));
    },

    /** Ticks, unticks, adds and rewords to-dos, all in one commit. */
    todos(
      projectId: string,
      ref: string,
      changes: TodoChanges,
      actor: TaskActor
    ): Promise<TaskView> {
      return change(projectId, ref, actor, (doc) => applyTodos(doc, changes));
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
        }),
      },
      async ({ params, query }) => {
        try {
          return await tasks.list(params.id, {
            stage: query.stage,
            kind: query.kind,
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
    .post(
      "/api/projects/:id/tasks/:taskId/stage",
      { body: t.Object({ stage: t.String() }) },
      async ({ params, body }) => {
        try {
          return await tasks.move(
            params.id,
            params.taskId,
            body.stage,
            YOU_ACTOR
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
