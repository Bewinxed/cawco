/**
 * A project's tasks as an agent reads them (task-tools.ts): the board as one
 * line per task, a task's file as its sections and to-dos, an attempt as it
 * started, a plan as its steps. A task, a to-do, a plan and a step each by
 * its link, labelled by its title or words (core references.ts), its id
 * (`tsk-12`, `td-3`, a step's) inside the link's destination: the person
 * cannot read an id, and an agent names things as its tools answered them.
 * A to-do with no marker yet by its position (`2.1`). What a task leaves
 * unset reads as the default it falls back to. A task's links are two lines
 * and appear nowhere else: "Waits on" (every wait, unsettled first, each
 * with where it stands) and "Unblocks"; a write of them, a filing and a
 * close each answer in three lines at most.
 */
import {
  type AttemptResult,
  artifactLink,
  markdownLink,
  planLink,
  type ResultArtifact,
  type SessionPlan,
  sessionLink,
  stepLink,
  type TaskTodo,
  taskLink,
  taskLinkWords,
  todoLink,
} from "@cawco/core";
import type { AttemptStart } from "../dispatch";
import type { DuplicateOutcome } from "../jev-tasks";
import type { TaskComment } from "../task-file";
import type { TaskHistoryEvent } from "../task-history";
import type { WaitState } from "../task-waits";
import type {
  Closing,
  LinkOutcome,
  StagesView,
  TaskList,
  TaskView,
  TaskWait,
} from "../tasks";
import { ago, count, handle, lines, listed, quote, valueWords } from "./words";

type TaskLine = TaskList["tasks"][number];

/**
 * Who reads the answer: the calling session's project and its own id, for
 * the links that name a task, a to-do, its plan and a step to the person
 * (core references.ts). None in discovery, which writes no links.
 */
export interface LinkScope {
  project: string | null;
  session: string | null;
  /** The titles of the tasks an answer's edges name, by id: each edge reads as its link. */
  titles?: TaskTitles;
}
const NO_LINKS: LinkScope = { project: null, session: null };

/** Tasks' titles by id, what an answer names other tasks by (task-tools.ts reads them with the answer). */
type TaskTitles = Readonly<Record<string, string>>;

/** Words cut at `max` characters, a link's label. */
const cut = (text: string, max: number): string => {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** A task by its link in the project, labelled by its title; with no project (discovery), its id and its words in quotes. */
const taskName = (
  links: LinkScope,
  id: string,
  title: string,
  max: number
): string =>
  links.project
    ? taskLink(links.project, id, cut(title, max))
    : `${id} ${quote(title, max)}`;

/** A task an edge names, by its link when its title is known; else its id, the one name there is. */
const edgeName = (links: LinkScope, id: string): string => {
  const title = links.titles?.[id];
  return title === undefined ? id : taskName(links, id, title, 120);
};

/** Tasks an edge names, in words. */
const edgesNamed = (links: LinkScope, ids: readonly string[]): string =>
  listed(ids.map((id) => edgeName(links, id)));

/** A wait's target by its link, labelled by its title, question or name; with no project (discovery), its words in quotes. */
const waitLink = (wait: WaitState, links: LinkScope): string =>
  links.project && wait.href
    ? markdownLink(cut(wait.label, 120), wait.href)
    : quote(wait.label, 120);

/**
 * One wait, as every answer says it: its link and where it stands (`open`,
 * `doing`, `merged`), the chain it is inherited through, or "Blocked: …
 * closed unmerged" while a flag holds it.
 */
const waitWords = (wait: TaskWait, links: LinkScope): string =>
  `${wait.flag ? `Blocked: ${waitLink(wait, links)} ${wait.flag}` : `${waitLink(wait, links)}, ${wait.state}`}${wait.via ? ` (through ${edgeName(links, wait.via)})` : ""}`;

/** A task's "Waits on" line: every wait, unsettled first; nothing when it waits on none. */
const waitsLine = (task: Pick<TaskView, "waits">, links: LinkScope): string =>
  task.waits.length > 0
    ? `${taskLinkWords.waitsOn} ${task.waits.map((wait) => waitWords(wait, links)).join("; ")}.`
    : "";

/** A task's "Unblocks" line: the tasks that wait on it; nothing when none does. */
const unblocksLine = (
  task: Pick<TaskView, "unblocks">,
  links: LinkScope
): string =>
  task.unblocks.length > 0
    ? `${taskLinkWords.unblocks} ${edgesNamed(links, task.unblocks)}.`
    : "";

/** When a to-do task is ready, said once: now, when its waits settle, or once its coordinator lets it go. */
const readyWords = (
  task: Pick<TaskView, "heldBy" | "kind" | "ready" | "waits">,
  links: LinkScope
): string => {
  if (task.kind !== "todo") {
    return "";
  }
  if (task.heldBy) {
    return `Its coordinator, ${edgeName(links, task.heldBy)}, starts it.`;
  }
  return taskLinkWords.ready(
    task.ready ? 0 : task.waits.filter((wait) => !wait.settled).length
  );
};

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
const taskLine = (task: TaskLine, now: number, links: LinkScope): string => {
  const facts = [
    task.stage,
    ...(task.needsYou ? ["needs the operator"] : []),
    ...(task.todos.total > 0
      ? [`to-dos ${task.todos.done}/${task.todos.total}`]
      : []),
    ...(task.waits.some((wait) => !wait.settled)
      ? [
          `waits on ${task.waits
            .filter((wait) => !wait.settled)
            .map((wait) => waitLink(wait, links))
            .join(", ")}`,
        ]
      : []),
    ...attemptWords(task),
    ...(task.startProblem ? [`won't start: ${task.startProblem}`] : []),
    ...(task.type ? [`type ${task.type}`] : []),
    ...(task.labels.length > 0 ? [`labels ${task.labels.join(", ")}`] : []),
    ...Object.entries(task.fields).map(([key, value]) => `${key} ${value}`),
    ...(task.problem ? [`its file: ${task.problem}`] : []),
    `changed ${ago(task.updatedAt, now)}${task.updatedBy ? ` by ${task.updatedBy.name}` : ""}`,
  ];
  return `- ${taskName(links, task.id, task.title, 120)} · ${facts.join(" · ")}`;
};

/** `task_read` without an id: the stages, then the board. */
const taskListWords = (
  board: {
    list: TaskList;
    stages: StagesView;
  },
  links: LinkScope = NO_LINKS
): string => {
  const now = Date.now();
  const { list, stages } = board;
  // The board's own tasks name the edges between them.
  const named: LinkScope = {
    ...links,
    titles: {
      ...Object.fromEntries(list.tasks.map((task) => [task.id, task.title])),
      ...links.titles,
    },
  };
  return lines(
    `Stages: ${stages.stages.map(stageWords).join(" → ")}.`,
    list.stagesProblems.length > 0 &&
      `stages.md problems: ${list.stagesProblems.join("; ")}`,
    list.tasks.length === 0
      ? "No tasks match."
      : `${count(list.tasks.length, "task")}; task_read with id reads one, the id ending its link:`,
    list.tasks.map((task) => taskLine(task, now, named)),
    list.problems.length > 0 &&
      `Unreadable task files: ${list.problems.join("; ")}`
  );
};

/** A to-do: its link, labelled by its words, while it has a marker; else its position and its words. */
const todoName = (
  todo: TaskTodo,
  links: LinkScope,
  task: string | undefined
): string =>
  links.project && task && todo.id
    ? todoLink(links.project, task, todo.id, todo.text)
    : `${todo.id ?? todo.path} ${todo.text}`;

/** A task's to-dos, nested, each by its link (its marker ends it). */
const todoLines = (
  todos: TaskTodo[],
  links: LinkScope = NO_LINKS,
  task?: string
): string[] =>
  todos.map(
    (todo) =>
      `${"  ".repeat(todo.depth)}- [${todo.done ? "x" : " "}] ${todo.proposed ? "(proposed) " : ""}${todoName(todo, links, task)}${todo.promoted ? ` → ${edgeName(links, todo.promoted)}` : ""}`
  );

/** An attempt at a task, a line: its session by its link, labelled by the task it works. */
const attemptLine = (
  attempt: TaskView["attempts"][number],
  title: string,
  now: number
): string =>
  `- ${sessionLink(attempt.instanceId, cut(title, 120))} · ${attempt.state} · started ${ago(attempt.startedAt, now)}${attempt.endedAt ? ` · ended ${ago(attempt.endedAt, now)}` : ""}${attempt.endedHow ? ` · ${attempt.endedHow}` : ""}${attempt.headline ? `: ${quote(attempt.headline, 240)}` : ""}`;

const artifactWords = (artifact: ResultArtifact): string => {
  const shown = artifact.name ? `${artifact.name}: ` : "";
  switch (artifact.kind) {
    case "link":
      return `${shown}${artifact.url}`;
    case "artifact":
      return artifact.name
        ? artifactLink(artifact.artifactId, artifact.name)
        : `artifact ${handle(artifact.artifactId)}`;
    case "file":
    case "post":
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

/** A done task's cards and pins that moved since its attempt built on them. */
const builtOnLine = (task: TaskView): string =>
  task.builtOn.length > 0
    ? task.builtOn
        .map(
          (moved) =>
            `Built on ${markdownLink(cut(moved.label, 120), moved.href)}, ${moved.since} since: reopen it with task_update if that changes the work.`
        )
        .join(" ")
    : "";

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
const fileLines = (task: TaskView, links: LinkScope): string[] =>
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
      ? lines("## To-dos", todoLines(task.todos, links, task.id))
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
const workLines = (task: TaskAnswer, now: number): string[] =>
  lines(
    task.attempts.length > 0
      ? lines(
          "## Attempts, newest first",
          task.attempts.map((attempt) => attemptLine(attempt, task.title, now))
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

/** A task as a tool answers it: its view, its history when asked, and the titles of the tasks its edges name. */
export type TaskAnswer = TaskView & {
  history?: TaskHistoryEvent[];
  titles?: TaskTitles;
};

/** The links a task's answer writes: the caller's, with the titles its edges name. */
const scopeOf = (task: TaskAnswer, links: LinkScope): LinkScope =>
  task.titles
    ? { ...links, titles: { ...links.titles, ...task.titles } }
    : links;

/** Where a task stands, after its link on its answer's first line. */
const standsWords = (task: TaskView): string =>
  `${task.stage}${task.needsYou ? " · needs the operator" : ""} · ${task.path}`;

/** A task whole below its first line: its fields, sections, to-dos, attempts, result and comments. */
const taskBody = (task: TaskAnswer, links: LinkScope): string => {
  const now = Date.now();
  return lines(
    timeWords(task, now),
    waitsLine(task, links),
    unblocksLine(task, links),
    builtOnLine(task),
    `Runs: ${runWords(task).join("; ")}.`,
    fileLines(task, links),
    workLines(task, now)
  );
};

/** One task whole, led by its link. */
const taskWords = (task: TaskAnswer, links: LinkScope = NO_LINKS): string => {
  const scope = scopeOf(task, links);
  return lines(
    `${taskName(scope, task.id, task.title, 200)} · ${standsWords(task)}`,
    taskBody(task, scope)
  );
};

/** `task_read`: the board, or one task. */
export const taskReadWords = (
  read: { list: TaskList; stages: StagesView } | TaskAnswer,
  links: LinkScope = NO_LINKS
): string =>
  "list" in read ? taskListWords(read, links) : taskWords(read, links);

/** What the duplicates check came to for a task just filed, each task by its link; nothing found, nothing said. */
const duplicateWords = (
  outcome: DuplicateOutcome,
  links: LinkScope
): string | false => {
  if ("candidates" in outcome) {
    return `Possible duplicates, to act on: ${listed(outcome.candidates.map((one) => taskName(links, one.id, one.title, 120)))}. ${outcome.ask}`;
  }
  if (outcome.duplicateOf !== null) {
    return `Judged a duplicate of ${edgeName(links, outcome.duplicateOf)} (${outcome.by}): it is dropped.`;
  }
  return outcome.note ?? false;
};

/** Where a task stands on a filing's first line: its stage, its whole, where it was found. */
const filedWhere = (task: TaskAnswer, links: LinkScope): string =>
  [
    ` in ${task.stage}`,
    ...(task.partOf ? [`part of ${edgeName(links, task.partOf)}`] : []),
    ...(task.foundInNamed ? [`found in ${foundInName(task, links)}`] : []),
  ].join(", ");

/** Where a task was found: a task or a pin, by its link, labelled by its title or what the pin stands on. */
const foundInName = (task: TaskAnswer, links: LinkScope): string => {
  const named = task.foundInNamed;
  if (named && links.project) {
    return markdownLink(cut(named.label, 120), named.href);
  }
  return named ? quote(named.label, 120) : "";
};

/**
 * `task_create`, in three lines at most: the task filed, by its link, with
 * its stage, its whole and where it was found; what it waits on; when it is
 * ready, and what Jev or the hub suggests of it.
 */
export const taskCreatedWords = (
  created: TaskAnswer & { duplicates?: DuplicateOutcome; suggest?: unknown },
  links: LinkScope = NO_LINKS
): string => {
  const scope = scopeOf(created, links);
  return lines(
    `Filed ${taskName(scope, created.id, created.title, 200)}${filedWhere(created, scope)}.`,
    waitsLine(created, scope),
    [
      readyWords(created, scope),
      created.duplicates ? duplicateWords(created.duplicates, scope) : "",
      created.suggest === undefined
        ? ""
        : `Suggested, not set: ${valueWords(created.suggest, 600)}`,
    ]
      .filter(Boolean)
      .join(" ")
  );
};

/** What still waits after a close: each task by its link, on what. */
const stillWords = (still: Closing["stillWaiting"], links: LinkScope): string =>
  still
    .map(
      (each) =>
        `${edgeName(links, each.id)} on ${listed(each.on.map((wait) => waitLink(wait, links)))}`
    )
    .join("; ");

/**
 * A close, in three lines at most: the task and its new stage, a drop's
 * waits taken out and a whole it closed; what became ready; what still
 * waits, on what.
 */
const closedWords = (
  task: TaskAnswer & { closing: Closing },
  links: LinkScope
): string => {
  const { closing } = task;
  const first = [
    `${taskName(links, task.id, task.title, 200)} is ${task.kind === "dropped" ? `dropped, in ${task.stage}` : task.stage}.`,
    closing.unwaited.length > 0
      ? `It is out of the waits of ${edgesNamed(links, closing.unwaited)}.`
      : "",
    closing.wholeClosed
      ? `Its whole, ${edgeName(links, closing.wholeClosed)}, is done too.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return lines(
    first,
    closing.nowReady.length > 0 &&
      `Now ready: ${edgesNamed(links, closing.nowReady)}.`,
    closing.stillWaiting.length > 0 &&
      `Still waiting: ${stillWords(closing.stillWaiting, links)}.`
  );
};

/** `task_update`: the task as it stands now, led by its link; a close says what it did around it. */
export const taskChangedWords = (
  task: TaskAnswer & { closing?: Closing },
  links: LinkScope = NO_LINKS
): string => {
  const scope = scopeOf(task, links);
  if (task.closing) {
    return closedWords({ ...task, closing: task.closing }, scope);
  }
  return lines(
    `${taskName(scope, task.id, task.title, 200)} now: ${standsWords(task)}`,
    taskBody(task, scope)
  );
};

/** The waits a link write leaves, said after its first words: how many, then each. */
const waitsLeft = (task: TaskAnswer, links: LinkScope): string =>
  task.waits.length > 0
    ? `waits on ${task.waits.length}: ${task.waits.map((wait) => waitWords(wait, links)).join("; ")}`
    : "waits on nothing";

/**
 * `task_link`, in three lines at most: what the write did and what the task
 * waits on now (or the duplicate closed and the waits it moved); what it
 * unblocks; when it is ready.
 */
export const taskLinkedWords = (
  task: TaskAnswer & { linked: LinkOutcome },
  links: LinkScope = NO_LINKS
): string => {
  const scope = scopeOf(task, links);
  const name = taskName(scope, task.id, task.title, 200);
  const { linked } = task;
  if (linked.duplicateOf) {
    return `${name} closed as a duplicate of ${edgeName(scope, linked.duplicateOf)}.${linked.moved.length > 0 ? ` ${count(linked.moved.length, "wait")} moved to it: ${edgesNamed(scope, linked.moved)}.` : ""}`;
  }
  const did = [
    ...(linked.removed.length > 0
      ? [
          `no longer waits on ${listed(linked.removed.map((wait) => waitLink(wait, scope)))}`,
        ]
      : []),
    ...(linked.partOf === null ? ["is part of nothing now"] : []),
    ...(linked.partOf ? [`is part of ${edgeName(scope, linked.partOf)}`] : []),
  ];
  return lines(
    `${name} ${[...did, waitsLeft(task, scope)].join("; ")}.`,
    unblocksLine(task, scope),
    readyWords(task, scope)
  );
};

/** `task_start` and `task_retry`: the attempt as it started, or that it waits. */
export const attemptStartWords = (start: AttemptStart): string =>
  lines(
    start.text,
    start.instanceId && start.workspaceId
      ? `Its workspace ${handle(start.workspaceId)}; type ${start.type ?? "the hub's default"}.`
      : `It has no session yet: it waits for owned files; type ${start.type ?? "the hub's default"}; lands ${start.lands}.`
  );

/** A plan step's box: done, under way, or not yet. */
const STEP_BOX: Record<SessionPlan["steps"][number]["status"], string> = {
  completed: "x",
  in_progress: "~",
  pending: " ",
};

/** A plan's steps, nested, each with its status, by its link (its id ends it). */
const stepLines = (plan: SessionPlan, links: LinkScope): string[] =>
  plan.steps.map(
    (step) =>
      `${"  ".repeat(step.depth)}- [${STEP_BOX[step.status]}] ${links.session ? stepLink(links.session, step.id, step.content) : `${step.id} ${step.content}`}${step.priority ? ` (${step.priority})` : ""}`
  );

const HEADING = /^#+\s*/u;

/** What a plan is called: its spec's first line, else its first step's words, else Plan (the dashboard's chip reads it so too). */
const planName = (plan: SessionPlan): string =>
  plan.spec?.markdown
    .split("\n")
    .map((line) => line.replace(HEADING, "").trim())
    .find(Boolean) ||
  plan.steps[0]?.content ||
  "Plan";

/** A task's id and title, what an answer about its to-dos, comments or file names it by. */
interface TaskNamed {
  id: string;
  title: string;
}

/** `todo_write`: the plan as it stands, or the task's to-dos. */
export const todoWrittenWords = (
  written:
    | (SessionPlan & { personChanged?: string })
    | (TaskNamed & { todos: TaskTodo[] }),
  links: LinkScope = NO_LINKS
): string => {
  if ("steps" in written) {
    const plan = links.session
      ? `Your plan, ${planLink(links.session, cut(planName(written), 120))}`
      : "Your plan";
    return lines(
      written.steps.length > 0 ? `${plan}:` : `${plan} has no steps.`,
      stepLines(written, links),
      written.spec && "Your spec is kept.",
      written.personChanged &&
        `The person changed it: ${written.personChanged}`,
      written.todos &&
        written.todos.length > 0 &&
        lines(
          "Your task's to-dos:",
          todoLines(written.todos, links, written.taskId)
        )
    );
  }
  return lines(
    `The to-dos of ${taskName(links, written.id, written.title, 200)}:`,
    todoLines(written.todos, links, written.id)
  );
};

/** `task_comment`: the task's comments, the newest yours. */
export const taskCommentedWords = (
  commented: TaskNamed & { comments: TaskComment[] },
  links: LinkScope = NO_LINKS
): string => {
  const now = Date.now();
  return lines(
    `Commented on ${taskName(links, commented.id, commented.title, 200)}; its comments:`,
    commented.comments.map((comment) => commentLine(comment, now))
  );
};

/** `task_result`: what was handed in. */
export const taskResultWords = (result: AttemptResult): string =>
  lines(resultLines(result, Date.now()));

/** `task_archive`. */
export const taskArchivedWords = (
  archived: TaskNamed & { archivedAt: number | null; path: string },
  links: LinkScope = NO_LINKS
): string => {
  const name = taskName(links, archived.id, archived.title, 200);
  return archived.archivedAt === null
    ? `${name} is back on the board, at ${archived.path}.`
    : `Archived ${name} to ${archived.path}.`;
};
