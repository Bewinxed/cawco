/**
 * A project's tasks and stages, as the hub serves them under
 * `/api/projects/:id/tasks` and `/api/projects/:id/stages` (the hub's
 * `tasks.ts` and `stages.ts` own the shapes; these mirror them). Fetch
 * wrappers in the shape `rules.ts` and `delegate-types.ts` set: a refusal from
 * the hub is a bare sentence, and every call throws it whole, so the caller
 * prints the hub's own words (a refused move names the moves that are open).
 *
 * Not to be confused with `tasks.svelte.ts`, which reads a session's own plan
 * off its machine (WORDS.md: plan).
 */
import { type AttemptResult, outputArtifacts } from "@cawco/core";
import { HUB_UNREACHABLE, HubUnreachable, unreachedAnswer } from "./hub-read";

/** The fixed kinds a stage belongs to (WORDS.md: kind). */
export type StageKind =
  "todo" | "active" | "waiting" | "you" | "done" | "dropped";

/** Who moves a task: you, the project's lead, a session, an approved action, a routine. */
export type Mover = "you" | "lead" | "session" | "action" | "routine";

export interface StageHooks {
  after?: string;
  afterMs?: number;
  by?: Mover;
  runs?: string;
  until?: string;
}

export interface Stage {
  hooks: StageHooks;
  kind: StageKind;
  name: string;
}

export interface StageMove {
  /** A stage, or `*` for any. */
  from: string;
  /** A stage, or `*` for any. */
  to: string;
  who: Mover[];
}

export interface StagesView {
  moves: StageMove[];
  problems: string[];
  /** What an empty Routines page offers to ask Caw for: the recorded template's, or the general four. */
  routineStarters: Starter[];
  /** `file`: the project's stages.md; `template`: it has none, and the code template stands in. */
  source: "file" | "template";
  stages: Stage[];
  /** What an empty board offers to start with Caw: the recorded template's, or the general four. */
  starters: Starter[];
  template: StagesTemplate | null;
  views: { by: string | null; name: string }[];
}

/** The kind of work a starter names (stages.ts `STARTER_GLYPHS`); CawStarters draws its glyph. */
export type StarterGlyph =
  | "brief"
  | "bug"
  | "calendar"
  | "draft"
  | "explore"
  | "grill"
  | "ideas"
  | "mail"
  | "palette"
  | "people"
  | "refresh"
  | "reply"
  | "rocket"
  | "routine"
  | "screen"
  | "search"
  | "site"
  | "stages"
  | "system"
  | "tasks"
  | "triage"
  | "voice";

/** A sentence to Caw an empty board offers, sent as it stands (stages.ts `Starter`). */
export interface Starter {
  glyph: StarterGlyph;
  text: string;
}

/** The hub's stage templates (stages.ts `TEMPLATES`), in its order. */
export type StagesTemplate =
  "code" | "launch" | "seo" | "brand" | "design" | "social" | "outreach";

export interface StagesTemplateView {
  name: StagesTemplate;
  stages: Stage[];
}

/** A work item's life, as the hub's `WorkItemState` names it. */
export type AttemptState =
  "starting" | "running" | "done" | "failed" | "cancelled";

/** One try at a task (WORDS.md: attempt): a work item whose task it is. */
export interface TaskAttempt {
  /** When it ended, ms epoch; null while it is live. */
  endedAt: number | null;
  /**
   * How it ended when it did not land, as the hub words it: the first line
   * of why it failed, or `Stopped by <who>` (`Stopped` when the hub did not
   * hear who). Null while live and once done.
   */
  endedHow: string | null;
  /** What its session said it did, in one or two sentences; null until it finished that way. */
  headline: string | null;
  /** The session running it. */
  instanceId: string;
  /** What its session handed in (`task_result`); null while it has not. */
  result: AttemptResult | null;
  /** When it was filed, ms epoch. */
  startedAt: number;
  state: AttemptState;
  workItemId: string;
}

/**
 * What a task's newest finished attempt said as it finished (the hub's
 * `TaskResult`): its session's `finish_item` report of what it did.
 */
export interface TaskResult {
  /** When the attempt finished, ms epoch. */
  at: number;
  headline: string | null;
  /** Its report, in full (markdown). */
  report: string;
  workItemId: string;
}

/**
 * What a task's review shows: the newest session's word on its work, with
 * that session. A session hands its work in with `task_result` (its words,
 * what to check, what it presented and attached); a session that finished
 * without one said what it did in its finish report, whose words stand as
 * its summary (its headline the line, the report whole), with the task's
 * `outputs` as what it attached. Null when no session has said anything
 * and the task names no outputs.
 */
export function reviewOf(
  task: Pick<TaskView, "attempts" | "outputs" | "result">
): {
  attempt: TaskAttempt | null;
  result: AttemptResult;
  /** Its words whole, as markdown: where the review draws them in full. */
  whole: string;
} | null {
  const report = task.result;
  const newest = task.attempts.find(
    (attempt) =>
      attempt.result !== null || attempt.workItemId === report?.workItemId
  );
  if (newest?.result) {
    return {
      attempt: newest,
      result: newest.result,
      whole: newest.result.summary,
    };
  }
  if (!report && task.outputs.length === 0) {
    return null;
  }
  return {
    attempt: newest ?? task.attempts[0] ?? null,
    result: {
      summary: report ? (report.headline ?? report.report) : "",
      check: [],
      artifacts: outputArtifacts(task.outputs),
      at: report?.at ?? 0,
    },
    whole: report
      ? [report.headline, report.report].filter(Boolean).join("\n\n")
      : "",
  };
}

/** Where an attempt's work lands (`@cawco/core`'s `LandsMode`). */
export type LandsMode = "main" | "branch" | "pr" | "none";

/** What the hub works out per task from its attempts and edges, on every read. */
interface TaskFlags {
  /** Newest first. */
  attempts: TaskAttempt[];
  /** The tasks it waits on that have not landed. */
  blockedBy: string[];
  /**
   * Its newest attempt failed, and it is not done or dropped since: its
   * starter's business, never Needs you.
   */
  lastAttemptFailed: boolean;
  /** Its newest attempt was stopped (cancelled), and it is not done or dropped since: no failure. */
  lastAttemptStopped: boolean;
  /** An attempt at it is starting or running. */
  liveAttempt: boolean;
  /** Its stage's `runs:` hook asked for an attempt, which waits for a slot. */
  queuedStart: boolean;
  /** Why the hub could not start an attempt the last time it tried. */
  startProblem: string | null;
}

/**
 * What a started attempt answers (the hub's `AttemptStart`); `queued` while
 * it waits for files a live item owns, its ids null until it starts.
 */
export interface AttemptStart {
  instanceId: string | null;
  lands: LandsMode;
  queued: boolean;
  stage: string;
  task: string;
  text: string;
  type: string | null;
  workItemId: string | null;
  workspaceId: string | null;
}

/** One task as a list shows it: the hub's index row. */
export interface TaskSummary extends TaskFlags, TaskTimes {
  after: string[];
  /** The task it repeats (`duplicate_of`); null when none. */
  duplicateOf: string | null;
  /** The fields its file carries beyond a task file's own that hold one scalar (`priority: high`), as written. */
  fields: Record<string, string>;
  /** The task it was found in (`found_in`); null when none. */
  foundIn: string | null;
  id: string;
  kind: StageKind | null;
  labels: string[];
  needsYou: boolean;
  number: number;
  /** The project folder files its work produces (`outputs:`). */
  outputs: string[];
  parent: string | null;
  path: string;
  problem: string | null;
  rank: string | null;
  /** The tasks it is related to (`related`). */
  related: string[];
  stage: string;
  title: string;
  todos: { done: number; total: number };
  type: string | null;
}

/** An attempt runs at a task whose attempt before it failed or was stopped. */
export const isRetry = (task: TaskSummary): boolean => {
  const [newest, before] = task.attempts;
  return (
    task.liveAttempt &&
    (newest?.state === "starting" || newest?.state === "running") &&
    (before?.state === "failed" || before?.state === "cancelled")
  );
};

/** When a task was made and last changed, ms epoch, from its file's commits (the hub's `TaskTimes`). */
export interface TaskTimes {
  createdAt: number;
  updatedAt: number;
}

export interface TaskList {
  problems: string[];
  stagesProblems: string[];
  tasks: TaskSummary[];
  tracker: "cawco" | "github" | "linear";
}

/** One to-do, flat in file order; `depth` nests it. */
export interface Todo {
  depth: number;
  done: boolean;
  id: string | null;
  /** `2.1`: the second top-level to-do's first child. */
  path: string;
  promoted: string | null;
  /** Left open in an attempt's plan: offered, not agreed (a `(proposed)` line). */
  proposed: boolean;
  text: string;
}

/** One task, its file read whole. */
export interface TaskView extends TaskFlags, TaskTimes {
  acceptance: string;
  after: string[];
  checks: string[];
  /** Its `## Comments`, oldest first: each written by the hub with who and when. */
  comments: TaskComment[];
  description: string;
  /** The task it repeats (`duplicate_of`); null when none. */
  duplicateOf: string | null;
  /** Front matter fields the file carries that a task file does not know, with their values (a scalar or a list), as the hub reads them. */
  extra: Record<string, string | string[]>;
  foundIn: string | null;
  /** sha256 hex of the file as read. */
  hash: string;
  id: string;
  kind: StageKind | null;
  labels: string[];
  /** Where an attempt's work lands, as the file says; null: the project's default. */
  lands: LandsMode | null;
  needsYou: boolean;
  number: number;
  outputs: string[];
  parent: string | null;
  path: string;
  problems: string[];
  rank: string | null;
  related: string[];
  /** What its newest finished attempt handed back; null until one has. */
  result: TaskResult | null;
  /** The body's other `## ` sections, as written. */
  sections: { heading: string; text: string }[];
  stage: string;
  title: string;
  todos: Todo[];
  type: string | null;
}

/** Who wrote a comment or made a change (the hub's `TaskHistoryActor`). */
export interface TaskActor {
  /** The session's instance id, or the approved action's; null when none. */
  id: string | null;
  /** The mover it was checked as (`you`, `lead`, `session`, …); null for a hand edit. */
  mover: string | null;
  /** You, Caw, the session's title as it was, hub, approved action. */
  name: string;
}

/** One entry of a task's `## Comments` (the hub's `TaskComment`). */
export interface TaskComment {
  at: number;
  author: TaskActor;
  /** Its markdown, as written. */
  text: string;
}

/** What a commit did to a task's file (the hub's `TaskHistoryKind`). */
export type TaskHistoryKind =
  | "created"
  | "moved"
  | "changed"
  | "commented"
  | "edited"
  | "archived"
  | "unarchived"
  | "renamed"
  | "deleted";

/** One commit to a task's file (the hub's `TaskHistoryEvent`). */
export interface TaskHistoryEvent {
  actor: TaskActor;
  at: number;
  commit: string;
  kind: TaskHistoryKind;
  path: string;
  /** Why, when the change said: a close reason, the hub's cause. */
  reason: string | null;
  /** The stage it went from and to; null when the stage did not move. */
  stage: { from: string | null; to: string } | null;
  /** What changed, in the commit's words: `update title`, `tick td-2`. */
  what: string;
}

/** A task's history: every commit to its file, oldest first (the hub's `TaskHistory`). */
export interface TaskHistory {
  events: TaskHistoryEvent[];
  id: string;
  path: string;
  state: "live" | "archived" | "deleted";
}

export interface TaskPatch {
  acceptance?: string;
  description?: string;
  /** Fields a task file does not know, each set, or taken out with "". */
  fields?: Record<string, string | string[]>;
  labels?: string[];
  title?: string;
}

/** The edges the hub sets between tasks (its links route). */
export type TaskEdge =
  "after" | "parent" | "related" | "found_in" | "duplicate_of";

/** Elysia refuses with a bare string; JSON only when something else went wrong. */
async function said(response: Response): Promise<string> {
  const body = (await response.text()).trim();
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      return String((parsed as { message: unknown }).message);
    }
  } catch {
    // Not JSON, which is the ordinary case: the string is the sentence.
  }
  return body || `The hub answered ${response.status}. Try again.`;
}

/** The hub's sentence, thrown as it is: it already says what to do. */
export async function send<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init);
  if (unreachedAnswer(response)) {
    throw new HubUnreachable(HUB_UNREACHABLE);
  }
  if (!response.ok) {
    throw new Error(await said(response));
  }
  return (await response.json()) as T;
}

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}`;
const one = (projectId: string, taskId: string) =>
  `${base(projectId)}/tasks/${encodeURIComponent(taskId)}`;

export const listTasks = (projectId: string): Promise<TaskList> =>
  send(`${base(projectId)}/tasks`);

/** The project's archived tasks, instead of the board's. */
export const listArchived = (projectId: string): Promise<TaskList> =>
  send(`${base(projectId)}/tasks?archived=1`);

/**
 * The tasks whose id, title or description hold `words`, as the hub's list
 * finds them (tasks.ts `q`): the board's, or with `archived` the archive's.
 */
export const findTasks = (
  projectId: string,
  words: string,
  archived = false
): Promise<TaskList> =>
  send(
    `${base(projectId)}/tasks?${new URLSearchParams({
      q: words,
      ...(archived ? { archived: "1" } : {}),
    })}`
  );

/** The project's tasks the hub says wait on you (`needsYou`): Caw's Needs you lists them. */
export const listTasksWaiting = async (
  projectId: string
): Promise<TaskSummary[]> =>
  (await send<TaskList>(`${base(projectId)}/tasks?needsYou=1`)).tasks;

export const readStages = (projectId: string): Promise<StagesView> =>
  send(`${base(projectId)}/stages`);

export const readTask = (
  projectId: string,
  taskId: string
): Promise<TaskView> => send(one(projectId, taskId));

export const createTask = (
  projectId: string,
  draft: { title: string; stage?: string }
): Promise<TaskView> => send(`${base(projectId)}/tasks`, json("POST", draft));

export const updateTask = (
  projectId: string,
  taskId: string,
  patch: TaskPatch
): Promise<TaskView> => send(one(projectId, taskId), json("PATCH", patch));

/** Moves a task; `reason`, a close reason, is kept in the move's commit and its history. */
export const moveTask = (
  projectId: string,
  taskId: string,
  stage: string,
  reason?: string
): Promise<TaskView> =>
  send(
    `${one(projectId, taskId)}/stage`,
    json("POST", reason ? { stage, reason } : { stage })
  );

/** Moves a task's file into tasks/archive/ in one commit; the hub refuses while an attempt at it is live. */
export const archiveTask = (
  projectId: string,
  taskId: string
): Promise<TaskView> =>
  send(`${one(projectId, taskId)}/archive`, json("POST", {}));

export const linkTask = (
  projectId: string,
  taskId: string,
  link: { edge: TaskEdge; to: string; remove?: boolean }
): Promise<TaskView> =>
  send(`${one(projectId, taskId)}/links`, json("POST", link));

/** Every commit to the task's file, oldest first. */
export const readHistory = (
  projectId: string,
  taskId: string
): Promise<TaskHistory> => send(`${one(projectId, taskId)}/history`);

/** A comment, written by the hub into the task's `## Comments` as yours. */
export const addComment = (
  projectId: string,
  taskId: string,
  text: string
): Promise<TaskView> =>
  send(`${one(projectId, taskId)}/comments`, json("POST", { text }));

export const addTodo = (
  projectId: string,
  taskId: string,
  todo: { text: string; under?: string }
): Promise<TaskView> =>
  send(`${one(projectId, taskId)}/todos`, json("POST", todo));

/** Ticks, unticks or rewords one to-do, named by id (`td-3`) or position (`2.1`). */
export const changeTodo = (
  projectId: string,
  taskId: string,
  todo: string,
  change: { done?: boolean; text?: string }
): Promise<TaskView> =>
  send(
    `${one(projectId, taskId)}/todos/${encodeURIComponent(todo)}`,
    json("PATCH", change)
  );

/**
 * A fresh attempt at a task whose last one failed, in that attempt's
 * workspace while its clone is there. It reports to the session named, or
 * the project's lead; the hub refuses, in a sentence, when there is neither.
 */
export const retryTask = (
  projectId: string,
  taskId: string,
  parentInstanceId?: string
): Promise<AttemptStart> =>
  send(
    `${one(projectId, taskId)}/retry`,
    json("POST", parentInstanceId ? { parentInstanceId } : {})
  );

/** A file of the project's folder as its bytes, for an image, video or audio output. */
export const folderRawHref = (projectId: string, path: string): string =>
  `${base(projectId)}/folder/raw?${new URLSearchParams({ path })}`;

export const readTemplates = (): Promise<StagesTemplateView[]> =>
  send("/api/stage-templates");

export const applyTemplate = (
  projectId: string,
  template: StagesTemplate
): Promise<StagesView & { stranded: string[] }> =>
  send(`${base(projectId)}/stages/template`, json("POST", { template }));

/**
 * A label as typed, as every editor writes it (the sheet's and the bulk
 * bar's): trimmed and lower case, so `Launch` and `launch` are one label.
 * Empty: nothing to add.
 */
export const labelOf = (typed: string): string => typed.trim().toLowerCase();

// --- what the views say -------------------------------------------------------

/** `ready` → `Ready`, `follow_up` → `Follow up`: a stage as a column head says it. */
export const stageLabel = (name: string): string => {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "No stage";
};

/** A kind as its quiet label says it (WORDS.md: kind; `you` is Needs you). */
export const KIND_LABEL: Record<StageKind, string> = {
  todo: "to do",
  active: "active",
  waiting: "waiting",
  you: "needs you",
  done: "done",
  dropped: "dropped",
};

/** Where a new task starts: the first stage of kind todo, else the first stage. */
export const firstTodoStage = (stages: Stage[]): Stage | undefined =>
  stages.find((stage) => stage.kind === "todo") ?? stages[0];

/**
 * The stages you may move a task to from `from`, worked out as the hub does
 * (`movesFrom` in stages.ts): a stage whose `by:` names someone else is
 * closed, and a move must be listed for you. The hub still checks every move;
 * this only says which ones the pickers offer.
 */
export const movesFrom = (stages: StagesView, from: string): Set<string> =>
  new Set(
    stages.stages
      .filter(
        (to) =>
          to.name !== from &&
          (!to.hooks.by || to.hooks.by === "you") &&
          stages.moves.some(
            (move) =>
              (move.from === "*" || move.from === from) &&
              (move.to === "*" || move.to === to.name) &&
              move.who.includes("you")
          )
      )
      .map((to) => to.name)
  );

/**
 * Where a task waiting on you goes once you approve it: the first stage
 * after its own, in the project's order, that the moves allow you, short
 * of a dropped one (social: review → scheduled; seo: review → approved).
 * Null when none is open to you.
 */
export const approveTarget = (
  stages: StagesView,
  from: string
): Stage | null => {
  const allowed = movesFrom(stages, from);
  const at = stages.stages.findIndex((stage) => stage.name === from);
  return (
    stages.stages
      .slice(at + 1)
      .find((stage) => stage.kind !== "dropped" && allowed.has(stage.name)) ??
    null
  );
};

/**
 * Where a task you send back goes: the nearest stage before its own, in
 * the project's order, where the work is done (kind `active`), else the
 * nearest to-do one, that the moves allow you (social: review → draft).
 * Null when none is open to you.
 */
export const sendBackTarget = (
  stages: StagesView,
  from: string
): Stage | null => {
  const allowed = movesFrom(stages, from);
  const at = stages.stages.findIndex((stage) => stage.name === from);
  const before = stages.stages
    .slice(0, Math.max(at, 0))
    .reverse()
    .filter((stage) => allowed.has(stage.name));
  return (
    before.find((stage) => stage.kind === "active") ??
    before.find((stage) => stage.kind === "todo") ??
    null
  );
};

/** What a card and a row say about a task's attempts and edges. */
export function flagsOf(task: TaskSummary | TaskView): {
  blockedBy: string[];
  failed: boolean;
  live: boolean;
  queued: boolean;
  startProblem: string | null;
  stopped: boolean;
} {
  return {
    live: task.liveAttempt,
    blockedBy: task.blockedBy,
    failed: task.lastAttemptFailed,
    stopped: task.lastAttemptStopped,
    queued: task.queuedStart,
    startProblem: task.startProblem,
  };
}

/**
 * One output an attempt handed in, by the name the task file gives it
 * (`outputs: [post.md]`): the hub serves it from where it copied it
 * (`assets/<task>/`), a picture as itself and anything else as text.
 */
export const outputUrl = (
  projectId: string,
  taskId: string,
  name: string
): string =>
  `${one(projectId, taskId)}/outputs/file?name=${encodeURIComponent(name)}`;

/** An output's words, whole, as the hub served it; throws the hub's sentence when it refuses. */
export async function readOutputText(
  projectId: string,
  taskId: string,
  name: string
): Promise<string> {
  const response = await fetch(outputUrl(projectId, taskId, name));
  if (unreachedAnswer(response)) {
    throw new HubUnreachable(HUB_UNREACHABLE);
  }
  if (!response.ok) {
    throw new Error(await said(response));
  }
  return response.text();
}

/** A session's state on a task as a status word (WORDS.md: working / done / failed). */
export const attemptWord = (state: AttemptState): string =>
  ({
    starting: "Working",
    running: "Working",
    done: "Done",
    failed: "Failed",
    cancelled: "Stopped",
  })[state];
