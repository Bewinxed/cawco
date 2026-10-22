/**
 * A project's tasks as an agent reads them (task-tools.ts): the board as one
 * line per task, a task's file as its sections and to-dos, an attempt as it
 * started, a plan as its steps. A task by its id (`tsk-12`), a to-do by its
 * marker (`td-3`) or position (`2.1`). What a task leaves unset reads as the
 * default it falls back to.
 */
import type {
  AttemptResult,
  ResultArtifact,
  SessionPlan,
  TaskTodo,
} from "@cawco/core";
import type { AttemptStart } from "../dispatch";
import type { TaskComment } from "../task-file";
import type { TaskHistoryEvent } from "../task-history";
import type { StagesView, TaskList, TaskView } from "../tasks";
import { ago, count, handle, lines, listed, quote, valueWords } from "./words";

type TaskLine = TaskList["tasks"][number];

/** A stage as a model reads it: `draft (active, runs writer)`. */
const stageWords = ({ name, kind, hooks }: StagesView["stages"][number]) => {
  const said = [
    kind,
    ...(hooks.runs ? [`runs ${hooks.runs}`] : []),
    ...(hooks.until ? [`until ${hooks.until}`] : []),
    ...(hooks.after ? [`after ${hooks.after}`] : []),
    ...(hooks.by ? [`only ${hooks.by} moves a task in`] : []),
  ];
  return `${name} (${said.join(", ")})`;
};

/** Where a task's attempts stand, in words; nothing when it has had none. */
const attemptWords = (
  task: Pick<
    TaskLine,
    | "attempts"
    | "lastAttemptFailed"
    | "lastAttemptStopped"
    | "liveAttempt"
    | "queuedStart"
  >
): string[] => {
  if (task.liveAttempt) {
    return ["an attempt runs"];
  }
  if (task.queuedStart) {
    return ["its start waits for owned files"];
  }
  const [last] = task.attempts;
  if (task.lastAttemptFailed || task.lastAttemptStopped) {
    return [
      `last attempt ${task.lastAttemptFailed ? "failed" : "stopped"}${last?.endedHow ? `: ${last.endedHow}` : ""}`,
    ];
  }
  return [];
};

/** One task of the board, a line. */
const taskLine = (task: TaskLine, now: number): string => {
  const facts = [
    task.stage,
    ...(task.needsYou ? ["needs the operator"] : []),
    ...(task.todos.total > 0
      ? [`to-dos ${task.todos.done}/${task.todos.total}`]
      : []),
    ...(task.blockedBy.length > 0
      ? [`waits for ${listed(task.blockedBy)}`]
      : []),
    ...attemptWords(task),
    ...(task.startProblem ? [`won't start: ${task.startProblem}`] : []),
    ...(task.type ? [`type ${task.type}`] : []),
    ...(task.parent ? [`under ${task.parent}`] : []),
    ...(task.labels.length > 0 ? [`labels ${task.labels.join(", ")}`] : []),
    ...Object.entries(task.fields).map(([key, value]) => `${key} ${value}`),
    ...(task.duplicateOf ? [`duplicates ${task.duplicateOf}`] : []),
    ...(task.problem ? [`its file: ${task.problem}`] : []),
    `changed ${ago(task.updatedAt, now)}${task.updatedBy ? ` by ${task.updatedBy.name}` : ""}`,
  ];
  return `- ${task.id} ${quote(task.title, 120)} · ${facts.join(" · ")}`;
};

/** `task_read` without an id: the stages, then the board. */
export const taskListWords = (board: {
  list: TaskList;
  stages: StagesView;
}): string => {
  const now = Date.now();
  const { list, stages } = board;
  return lines(
    `Stages: ${stages.stages.map(stageWords).join(" → ")}.`,
    list.stagesProblems.length > 0 &&
      `stages.md problems: ${list.stagesProblems.join("; ")}`,
    list.tasks.length === 0
      ? "No tasks match."
      : `${count(list.tasks.length, "task")}; task_read with id reads one:`,
    list.tasks.map((task) => taskLine(task, now)),
    list.problems.length > 0 &&
      `Unreadable task files: ${list.problems.join("; ")}`
  );
};

/** A task's to-dos, nested, each with its marker. */
const todoLines = (todos: TaskTodo[]): string[] =>
  todos.map(
    (todo) =>
      `${"  ".repeat(todo.depth)}- [${todo.done ? "x" : " "}] ${todo.id ?? todo.path} ${todo.proposed ? "(proposed) " : ""}${todo.text}${todo.promoted ? ` → ${todo.promoted}` : ""}`
  );

/** An attempt at a task, a line. */
const attemptLine = (
  attempt: TaskView["attempts"][number],
  now: number
): string =>
  `- ${attempt.state} · started ${ago(attempt.startedAt, now)}${attempt.endedAt ? ` · ended ${ago(attempt.endedAt, now)}` : ""} · session ${handle(attempt.instanceId)}${attempt.endedHow ? ` · ${attempt.endedHow}` : ""}${attempt.headline ? `: ${quote(attempt.headline, 240)}` : ""}`;

const artifactWords = (artifact: ResultArtifact): string => {
  const shown = artifact.name ? `${artifact.name}: ` : "";
  switch (artifact.kind) {
    case "link":
      return `${shown}${artifact.url}`;
    case "artifact":
      return `${shown}artifact ${handle(artifact.artifactId)}`;
    default:
      return `${shown}${artifact.path}`;
  }
};

/** A handed-in result, in words. */
const resultLines = (result: AttemptResult, now: number): string[] => [
  `Result, handed in ${ago(result.at, now)}: ${quote(result.summary, 1200)}`,
  ...(result.check.length > 0 ? [`To check: ${result.check.join("; ")}`] : []),
  ...(result.artifacts.length > 0
    ? [`Made: ${result.artifacts.map(artifactWords).join("; ")}`]
    : []),
];

const commentLine = (comment: TaskComment, now: number): string =>
  `- ${comment.author.name}, ${ago(comment.at, now)}: ${quote(comment.text, 600)}`;

const historyLine = (event: TaskHistoryEvent, now: number): string =>
  `- ${ago(event.at, now)}, ${event.actor.name}: ${event.what}${event.reason ? ` (${event.reason})` : ""}`;

/** A task's edges to other tasks, in words. */
const edgeWords = (task: TaskView): string[] => [
  ...(task.after.length > 0 ? [`waits for ${listed(task.after)}`] : []),
  ...(task.blockedBy.length > 0 ? [`blocked by ${listed(task.blockedBy)}`] : []),
  ...(task.parent ? [`under ${task.parent}`] : []),
  ...(task.related.length > 0 ? [`related to ${listed(task.related)}`] : []),
  ...(task.foundIn ? [`found in ${task.foundIn}`] : []),
  ...(task.duplicateOf ? [`duplicates ${task.duplicateOf}`] : []),
];

/** How a task's attempts run, each unset setting as the default it falls back to. */
const runWords = (task: TaskView): string[] => [
  `type ${task.type ?? "the stage's, else the hub's default"}`,
  `lands ${task.lands ?? "as the project lands"}`,
  `runs on ${task.runsOn ?? "the project's machines"}`,
  ...(task.group ? [`group ${task.group}`] : []),
  ...(task.owns.length > 0 ? [`owns ${task.owns.join(", ")}`] : []),
  ...(task.budget ? [`budget ${valueWords(task.budget)}`] : []),
];

/** Who made a task and who changed it last, and when. */
const timeWords = (task: TaskView, now: number): string =>
  `Created ${ago(task.createdAt, now)}${task.createdBy ? ` by ${task.createdBy.name}` : ""}; changed ${ago(task.updatedAt, now)}${task.updatedBy ? ` by ${task.updatedBy.name}` : ""}.`;

/** What a task's file says: its labels and fields, its sections, its to-dos, checks, outputs and context. */
const fileLines = (task: TaskView): string[] =>
  lines(
    task.labels.length > 0 && `Labels: ${task.labels.join(", ")}.`,
    Object.keys(task.extra).length > 0 &&
      `Fields: ${Object.entries(task.extra)
        .map(([key, value]) => `${key} ${valueWords(value)}`)
        .join("; ")}.`,
    task.issue && `Issue: ${valueWords(task.issue)}.`,
    task.description.trim() && lines("## Description", task.description.trim()),
    task.acceptance.trim() && lines("## Acceptance", task.acceptance.trim()),
    task.sections.map((section) =>
      lines(`## ${section.heading}`, section.text.trim())
    ),
    task.todos.length > 0
      ? lines("## To-dos", todoLines(task.todos))
      : "No to-dos.",
    task.checks.length > 0 && `Checks: ${task.checks.join("; ")}`,
    task.outputs.length > 0 && `Outputs: ${task.outputs.join(", ")}`,
    task.context.length > 0 && `Context: ${task.context.join(", ")}`
  ).split("\n");

/** A task's handed-in result, or that its attempts have handed in none. */
const taskResultLine = (task: TaskView, now: number): string | false => {
  if (task.result) {
    return `Result, handed in ${ago(task.result.at, now)} by work item ${handle(task.result.workItemId)}${task.result.headline ? `: ${quote(task.result.headline, 300)}` : ""}\n${task.result.report}`;
  }
  return task.attempts.length > 0 && "No result handed in yet.";
};

/** The work on a task: its attempts, its result, its comments, its history. */
const workLines = (
  task: TaskView & { history?: TaskHistoryEvent[] },
  now: number
): string[] =>
  lines(
    task.attempts.length > 0
      ? lines(
          "## Attempts, newest first",
          task.attempts.map((attempt) => attemptLine(attempt, now))
        )
      : "No attempts yet.",
    task.startProblem && `It won't start: ${task.startProblem}`,
    taskResultLine(task, now),
    task.comments.length > 0 &&
      lines(
        "## Comments",
        task.comments.map((comment) => commentLine(comment, now))
      ),
    task.problems.length > 0 &&
      `Its file's problems: ${task.problems.join("; ")}`,
    task.history &&
      (task.history.length > 0
        ? lines(
            "## History, oldest first",
            task.history.map((event) => historyLine(event, now))
          )
        : "No history yet.")
  ).split("\n");

/** One task whole: its fields, sections, to-dos, attempts, result and comments. */
export const taskWords = (
  task: TaskView & { history?: TaskHistoryEvent[] }
): string => {
  const now = Date.now();
  const edges = edgeWords(task);
  return lines(
    `${task.id} ${quote(task.title, 200)} · ${task.stage}${task.needsYou ? " · needs the operator" : ""} · ${task.path}`,
    timeWords(task, now),
    edges.length > 0 && `Edges: ${edges.join("; ")}.`,
    `Runs: ${runWords(task).join("; ")}.`,
    fileLines(task),
    workLines(task, now)
  );
};

/** `task_read`: the board, or one task. */
export const taskReadWords = (
  read:
    | { list: TaskList; stages: StagesView }
    | (TaskView & { history?: TaskHistoryEvent[] })
): string => ("list" in read ? taskListWords(read) : taskWords(read));

/** `task_create`: the task filed, and what Jev or the hub suggests of it. */
export const taskCreatedWords = (
  created: TaskView & { duplicates?: unknown; suggest?: unknown }
): string =>
  lines(
    `Filed ${created.id} in ${created.stage}.`,
    taskWords(created),
    created.duplicates !== undefined &&
      `Possible duplicates, to act on: ${valueWords(created.duplicates, 2000)}`,
    created.suggest !== undefined &&
      `Suggested, not set: ${valueWords(created.suggest, 600)}`
  );

/** `task_update` and `task_link`: the task as it stands now. */
export const taskChangedWords = (task: TaskView): string =>
  lines(`${task.id} now:`, taskWords(task));

/** `task_start` and `task_retry`: the attempt as it started, or that it waits. */
export const attemptStartWords = (start: AttemptStart): string =>
  lines(
    start.text,
    start.instanceId && start.workspaceId
      ? `Its session ${handle(start.instanceId)}, workspace ${handle(start.workspaceId)}; type ${start.type ?? "the hub's default"}; lands ${start.lands}.`
      : `It has no session yet: it waits for owned files; type ${start.type ?? "the hub's default"}; lands ${start.lands}.`
  );

/** A plan step's box: done, under way, or not yet. */
const STEP_BOX: Record<SessionPlan["steps"][number]["status"], string> = {
  completed: "x",
  in_progress: "~",
  pending: " ",
};

/** A plan's steps, nested, each with its status. */
const stepLines = (plan: SessionPlan): string[] =>
  plan.steps.map(
    (step) =>
      `${"  ".repeat(step.depth)}- [${STEP_BOX[step.status]}] ${step.id} ${step.content}${step.priority ? ` (${step.priority})` : ""}`
  );

/** `todo_write`: the plan as it stands, or the task's to-dos. */
export const todoWrittenWords = (
  written:
    | (SessionPlan & { personChanged?: string })
    | { id: string; todos: TaskTodo[] }
): string => {
  if ("steps" in written) {
    return lines(
      written.steps.length > 0 ? "Your plan:" : "Your plan has no steps.",
      stepLines(written),
      written.spec && "Your spec is kept.",
      written.personChanged &&
        `The person changed it: ${written.personChanged}`,
      written.todos &&
        written.todos.length > 0 &&
        lines(
          `${written.taskId ?? "Your task"}'s to-dos:`,
          todoLines(written.todos)
        )
    );
  }
  return lines(`${written.id}'s to-dos:`, todoLines(written.todos));
};

/** `task_comment`: the task's comments, the newest yours. */
export const taskCommentedWords = (commented: {
  comments: TaskComment[];
  id: string;
}): string => {
  const now = Date.now();
  return lines(
    `Commented on ${commented.id}; its comments:`,
    commented.comments.map((comment) => commentLine(comment, now))
  );
};

/** `task_result`: what was handed in. */
export const taskResultWords = (result: AttemptResult): string =>
  lines(resultLines(result, Date.now()));

/** `task_archive`. */
export const taskArchivedWords = (archived: {
  archivedAt: number | null;
  id: string;
  path: string;
}): string =>
  archived.archivedAt === null
    ? `${archived.id} is back on the board, at ${archived.path}.`
    : `Archived ${archived.id} to ${archived.path}.`;
