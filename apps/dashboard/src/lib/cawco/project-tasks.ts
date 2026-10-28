/**
 * A project's tasks and stages, as the hub serves them under
 * `/api/projects/:id/tasks` and `/api/projects/:id/stages` (the shapes
 * the hub answers in are core's, task-views.ts). Fetch
 * wrappers in the shape `rules.ts` and `delegate-types.ts` set: a refusal from
 * the hub is a bare sentence, and every call throws it whole, so the caller
 * prints the hub's own words (a refused move names the moves that are open).
 *
 * Not to be confused with a session's own plan (plan), which is
 * the hub's too, held in the client by `plan.ts`.
 */
import type {
  AttemptStart,
  ExternalComment,
  ExternalRef,
  LandsMode,
  Stage,
  StageKind,
  StagesTemplate,
  StagesView,
  TaskAttempt,
  TaskFlags,
  TaskHistory,
  TaskHistoryActor,
  TaskList,
  TaskReviewRead,
  TaskSummary,
  TaskTimes,
  TaskWait,
  WorkItemState,
} from "@cawco/core";
import { type AttemptResult, outputArtifacts } from "@cawco/core/deliverables";
import type { ProjectGate } from "@cawco/core/project-gate";
import type {
  ProjectStarter,
  StarterGlyph,
  StarterPlace,
} from "@cawco/core/starters";
import type {
  GithubProjectsView,
  IssueTracker,
  TrackerTarget,
  TrackerView,
} from "@cawco/core/trackers";
import {
  HUB_UNREACHABLE,
  HubUnreachable,
  hubSaid,
  noAnswer,
  unreachedAnswer,
} from "./hub-read";

/** The kind of work a starter names (core starters.ts `STARTER_GLYPHS`); StarterCards draws its glyph. */
export type {
  AttemptStart,
  ProjectStarter,
  Stage,
  StagesView,
  StarterGlyph,
  StarterPlace,
  TaskAttempt,
  TaskHistory,
  TaskHistoryEvent,
  TaskList,
  TaskSummary,
  TaskWait,
} from "@cawco/core";

/**
 * A sentence to Caw a press puts in the composer, and its glyph: what
 * StarterCards draws. A project's own starters
 * ({@link ProjectStarter}) carry their reason and sources besides.
 */
export interface Starter {
  glyph: StarterGlyph;
  text: string;
}

export interface StagesTemplateView {
  name: StagesTemplate;
  stages: Stage[];
}

/**
 * What a task's newest finished attempt said as it finished (the hub's
 * `TaskResult`): its session's `finish_item` report of what it did.
 */
interface TaskResult {
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

/**
 * A wait that asks you to decide: a card not picked yet. A task's review
 * names these; beside it, its other needs leave them out.
 */
export const decisionWait = (wait: TaskWait): boolean =>
  wait.kind === "card" && !wait.settled;

/** "Landed 41cb40c18", "landed as 903dc22e9": a commit its words say landed. */
const LANDED = /\blanded(?:\s+(?:as|in))?[\s*`]+([0-9a-f]{7,40})\b/giu;

/**
 * The commits a task's words say landed, short, in the order first said:
 * its description, then its comments. What a review stands on when no
 * session handed in a result (work landed from another session).
 */
export function landedOf(
  task: Pick<TaskView, "comments" | "description">
): string[] {
  const said = [task.description, ...task.comments.map((entry) => entry.text)];
  const shas = said.flatMap((text) =>
    [...text.matchAll(LANDED)].map((match) => (match[1] ?? "").slice(0, 9))
  );
  return [...new Set(shas)];
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
export interface TaskView extends TaskFlags, TaskTimes, TaskReviewRead {
  acceptance: string;
  checks: string[];
  /** Its `## Comments`, oldest first: each written by the hub with who and when. */
  comments: TaskComment[];
  description: string;
  /** The task it repeats (`duplicate_of`); null when none. */
  duplicateOf: string | null;
  /** Front matter fields the file carries that a task file does not know, with their values (a scalar or a list), as the hub reads them. */
  extra: Record<string, string | string[]>;
  foundIn: string | null;
  /** Where it was found, by its link: a task's title, what a pin stands on; null when nowhere. */
  foundInNamed: { href: string; label: string } | null;
  /** sha256 hex of the file as read. */
  hash: string;
  id: string;
  kind: StageKind | null;
  labels: string[];
  /** Where an attempt's work lands, as the file says; null: the project's default. */
  lands: LandsMode | null;
  /** The external items it links (core external-items.ts): its record (the tracker sync's issue) first, then the rest. */
  links: ExternalRef[];
  needsYou: boolean;
  number: number;
  outputs: string[];
  partOf: string | null;
  path: string;
  problems: string[];
  rank: string | null;
  /** What its newest finished attempt handed back; null until one has. */
  result: TaskResult | null;
  /** The body's other `## ` sections, as written. */
  sections: { heading: string; text: string }[];
  stage: string;
  title: string;
  todos: Todo[];
  type: string | null;
  waitsOn: string[];
}

/** One entry of a task's `## Comments` (the hub's `TaskComment`). */
export interface TaskComment {
  at: number;
  author: TaskHistoryActor;
  /** Its markdown, as written. */
  text: string;
  /** Set when it was written on an outside source: drawn as the words under its author, with the source's mark and a link out. */
  via: ExternalComment | null;
}

export interface TaskPatch {
  acceptance?: string;
  description?: string;
  /** Fields a task file does not know, each set, or taken out with "". */
  fields?: Record<string, string | string[]>;
  labels?: string[];
  title?: string;
}

/**
 * One write of a task's links (the hub's links route, `task_link`'s): what
 * it waits on, the whole it is part of, the task it repeats; `remove` takes
 * the named ones out.
 */
export interface TaskLinks {
  duplicateOf?: string;
  partOf?: string;
  remove?: boolean;
  waitsOn?: string[];
}

/**
 * A hub read or change, the page's one way to ask the hub: its answer when it
 * is ok and says it is JSON; otherwise the hub's sentence, thrown as it is (it
 * already says what to do), and a hub away or restarting throws its one
 * wording. A body is parsed only when it says it is JSON: a proxy's or a
 * restarting hub's text answer is never read as data.
 */
export async function send<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init);
  if (unreachedAnswer(response)) {
    throw new HubUnreachable(HUB_UNREACHABLE);
  }
  if (!response.ok) {
    throw new Error(`${await hubSaid(response)}.`);
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`${noAnswer(response.status)}.`);
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

/** Where the project's tasks live, and its binding to GitHub Issues or Linear (the hub's tracker.ts). */
export const readTracker = (projectId: string): Promise<TrackerView> =>
  send(`${base(projectId)}/tracker`);

/** Binds the project to a connection's repository or team, or `cawco` lets the binding go. */
export const setTracker = (
  projectId: string,
  binding:
    | { tracker: "cawco" }
    | {
        connection: string;
        /** GitHub: the Project whose Status carries the stages, each stage's option by its name; null for none. */
        githubProject?: {
          id: string;
          map: Record<string, string | null>;
        } | null;
        target: string;
        tracker: IssueTracker;
      }
): Promise<TrackerView> =>
  send(`${base(projectId)}/tracker`, json("PUT", binding));

/** The project's tasks and their issues synced now; answers where the binding stands after. */
export const syncTracker = (projectId: string): Promise<TrackerView> =>
  send(`${base(projectId)}/tracker/sync`, { method: "POST" });

/** The repositories or teams a connection reaches, for a project to be bound to one. */
export const trackerTargets = (
  connection: string
): Promise<{ targets: TrackerTarget[] }> =>
  send(`/api/connections/${encodeURIComponent(connection)}/targets`);

/** The GitHub Projects a connection reaches for a repository, or GitHub's words when it may not read them. */
export const githubProjects = (
  connection: string,
  repo: string
): Promise<GithubProjectsView> =>
  send(
    `/api/connections/${encodeURIComponent(connection)}/github-projects?repo=${encodeURIComponent(repo)}`
  );

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

/** The project's merge checks as the hub reads its gate.md now (hub gate-file.ts `gateRoutes`). */
export const readGate = (
  projectId: string
): Promise<{ file: string; gate: ProjectGate }> =>
  send(`${base(projectId)}/gate`);

/** What you did with a starter you pressed, as the composer sent: its words as they stood, or changed. */
export const tellStarterOutcome = (
  projectId: string,
  pressed: { outcome: "picked" | "edited"; place: StarterPlace; text: string }
): Promise<{ ok: true }> =>
  send(`${base(projectId)}/starters/outcome`, json("POST", pressed));

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
  link: TaskLinks
): Promise<TaskView> =>
  send(`${one(projectId, taskId)}/links`, json("POST", link));

/** Every commit to the task's file, oldest first. */
export const readHistory = (
  projectId: string,
  taskId: string
): Promise<TaskHistory> => send(`${one(projectId, taskId)}/history`);

/**
 * A comment, written by the hub into the task's `## Comments` as yours.
 * `id` is the comment's, chosen by its sender: the hub writes it once
 * however often it is sent (id.ts `idForWords`).
 */
export const addComment = (
  projectId: string,
  taskId: string,
  text: string,
  id: string
): Promise<TaskView> =>
  send(`${one(projectId, taskId)}/comments`, json("POST", { text, id }));

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

/**
 * A file of the project's folder as the project page shows it (`?file=`,
 * FolderFile): its address in the dashboard, which any surface links to and
 * a reload or a shared link opens. Its folders' slashes stay as they read.
 */
export const folderFileHref = (projectId: string, path: string): string =>
  `/project/${encodeURIComponent(projectId)}?${new URLSearchParams({ file: path }).toString().replaceAll("%2F", "/")}`;

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
  const words = name.replace(/[-_]+/gu, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "No stage";
};

/** A kind as its quiet label says it (`you` is Needs you). */
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

/** What a card and a row say about a task's attempts and edges. */
export function flagsOf(task: TaskSummary | TaskView): {
  /** Its waits not settled yet: what it still waits on. */
  waiting: TaskWait[];
  failed: boolean;
  live: boolean;
  queued: boolean;
  startProblem: string | null;
  stopped: boolean;
} {
  return {
    live: task.liveAttempt,
    waiting: task.waits.filter((wait) => !wait.settled),
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
    throw new Error(`${await hubSaid(response)}.`);
  }
  return response.text();
}

/** A session's state on a task as a status word (working / done / failed). */
export const attemptWord = (state: WorkItemState): string =>
  ({
    starting: "Working",
    running: "Working",
    done: "Done",
    failed: "Failed",
    cancelled: "Stopped",
  })[state];
