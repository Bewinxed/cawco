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
   * How it ended when it did not land, as the hub words it: `Attempt
   * failed: <why>`, or `Stopped by <who>` (`Stopped` when the hub did not
   * hear who). Null while live and once done.
   */
  endedHow: string | null;
  /** What its session said it did, in one or two sentences; null until it finished that way. */
  headline: string | null;
  /** The session running it. */
  instanceId: string;
  /** When it was filed, ms epoch. */
  startedAt: number;
  state: AttemptState;
  workItemId: string;
}

/**
 * What a task's newest finished attempt handed back (the hub's
 * `TaskResult`): its session's report of what it did, the way an attempt
 * presents its result, beside the outputs it handed in.
 */
export interface TaskResult {
  /** When the attempt finished, ms epoch. */
  at: number;
  headline: string | null;
  /** Its report, in full (markdown). */
  report: string;
  workItemId: string;
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
  /** The task it was found in (`found_in`); null when none. */
  foundIn: string | null;
  id: string;
  kind: StageKind | null;
  labels: string[];
  needsYou: boolean;
  number: number;
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
  description: string;
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

export interface TaskPatch {
  acceptance?: string;
  description?: string;
  labels?: string[];
  title?: string;
}

/** The two edges the drawer sets: what a task waits on, and its parent. */
export type TaskEdge = "after" | "parent";

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

export const moveTask = (
  projectId: string,
  taskId: string,
  stage: string
): Promise<TaskView> =>
  send(`${one(projectId, taskId)}/stage`, json("POST", { stage }));

export const linkTask = (
  projectId: string,
  taskId: string,
  link: { edge: TaskEdge; to: string; remove?: boolean }
): Promise<TaskView> =>
  send(`${one(projectId, taskId)}/links`, json("POST", link));

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

export const readTemplates = (): Promise<StagesTemplateView[]> =>
  send("/api/stage-templates");

export const applyTemplate = (
  projectId: string,
  template: StagesTemplate
): Promise<StagesView & { stranded: string[] }> =>
  send(`${base(projectId)}/stages/template`, json("POST", { template }));

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
 * A fresh attempt at a task, reporting to the session named or the project's
 * lead: what Try again runs when the last attempt finished (a failed or
 * stopped one is retried in its own workspace, `retryTask`).
 */
export const startAttempt = (
  projectId: string,
  taskId: string,
  parentInstanceId?: string
): Promise<AttemptStart> =>
  send(
    `${one(projectId, taskId)}/attempts`,
    json("POST", parentInstanceId ? { parentInstanceId } : {})
  );

/**
 * One output an attempt handed in, by the name the task file gives it
 * (`outputs: [post.md]`): the hub serves it from where it copied it, a
 * picture as itself and anything else as text.
 */
export const outputUrl = (
  projectId: string,
  taskId: string,
  name: string
): string =>
  `${one(projectId, taskId)}/outputs/file?name=${encodeURIComponent(name)}`;

/**
 * An output, whole, as the hub served it: read as text, or as a picture's
 * bytes. Throws the hub's sentence when it refuses.
 */
export async function readOutput(
  projectId: string,
  taskId: string,
  name: string
): Promise<Response> {
  const response = await fetch(outputUrl(projectId, taskId, name));
  if (unreachedAnswer(response)) {
    throw new HubUnreachable(HUB_UNREACHABLE);
  }
  if (!response.ok) {
    throw new Error(await said(response));
  }
  return response;
}

/** A span of time in plain words: `40 s`, `12 min`, `2 h 5 min`. */
export const spanWords = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
};

/** The status tint an attempt's state takes (DESIGN.md, status chips). */
export type AttemptTone = "live" | "done" | "fail" | "idle";

/**
 * An attempt's state said in plain words, with how long it took or has taken
 * so far (WORDS.md: attempt): "Finished in 1 min", "Failed after 3 min",
 * "Stopped after 40 s", "Working for 2 min".
 */
export const attemptSentence = (
  attempt: TaskAttempt,
  now: number
): { tone: AttemptTone; text: string; word: string } => {
  const took = spanWords((attempt.endedAt ?? now) - attempt.startedAt);
  switch (attempt.state) {
    case "starting":
      return { word: "Starting", tone: "live", text: "Starting" };
    case "running":
      return { word: "Working", tone: "live", text: `Working for ${took}` };
    case "done":
      return { word: "Finished", tone: "done", text: `Finished in ${took}` };
    case "failed":
      return { word: "Failed", tone: "fail", text: `Failed after ${took}` };
    default:
      return { word: "Stopped", tone: "idle", text: `Stopped after ${took}` };
  }
};
