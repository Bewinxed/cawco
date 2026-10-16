/**
 * The dispatcher, part 1 (§5.3 of the Projects spec): what turns a project's
 * tasks into running work.
 *
 * - **An attempt** at a task is a work item (work-items.ts): a delegate
 *   session in a new workspace cut from one of the project's checkouts on a
 *   machine that is online, briefed from the task file (title, description,
 *   acceptance criteria, open to-dos, checks, and where it sits among its
 *   edges), with `work_items.task_id` naming the task. It runs the delegate
 *   type the stage it enters `runs:`, else the task's `type:`, else the
 *   fleet's default. Starting one moves the task to its active stage (the
 *   stage that runs it, else the first of kind `active`), as `hub`.
 * - **Who it reports to.** A work item needs a parent session. `task_start`
 *   from a session you started (or Caw) makes that session the parent; the
 *   project's lead, its Caw (caw.ts), takes the reports of every attempt
 *   nobody asked for, its session started for the first one while Caw is
 *   on. With Caw off there is no lead: such an attempt does not start.
 * - **The frontier** (tasks.ts `onFrontier`): tasks in a `todo` stage whose
 *   every `after` task is in a `done` stage, with no live attempt, whose last
 *   attempt neither failed nor was stopped, in rank order. A failed or
 *   stopped attempt is its starter's business: its report goes to the
 *   session that started it, the lead for the dispatcher's own (work-items
 *   `reportees`), who retries it or moves on. It never waits for the person,
 *   and only a person's own start's failure reaches his phone (push.ts).
 * - **Dispatch** starts the frontier on its own, only for a project with
 *   dispatch and Caw on, up to `max_attempts` live attempts, and not while
 *   `review_limit` tasks or more wait in `you` stages.
 * - **Hooks.** A task entering an `active` stage with `runs: <type>`, by
 *   anyone's move but the hub's, or filed straight into one, starts an
 *   attempt of that type, reporting to the session that moved it or else the
 *   lead. A hook obeys `max_attempts`: at the cap its start is queued
 *   (`queued_task_starts`) and runs, oldest first and before the frontier,
 *   as a slot frees. A start you or a session ask for is not capped. Only
 *   `runs` runs here.
 * - **Where it runs** (runs-on.ts). An attempt is cut only on a machine its
 *   task's `runs_on:` names, else its project's: a machine, or a capability
 *   such as `apple`, read from the OS each agent reports. With none online
 *   holding a checkout, the start is refused, saying what it needs, and is
 *   never placed elsewhere; a retry's old workspace on another machine is
 *   passed over. Neither set, it starts on any machine with a checkout.
 * - **Landing.** An attempt lands as its task says (`lands:`), else as its
 *   delegate type says, else as the project does: `main`, `branch`, `pr` or
 *   `none` (work-items.ts). Its task's `outputs` are collected into the
 *   project's folder.
 * - **The landing result.** An attempt that ends done (landed, or nothing to
 *   land) moves its task to the first `done` stage, or, when it opened a pull
 *   request, to the first `you` stage (staying put without one) until the
 *   pull request merges ({@link Dispatcher.pullRequestMerged}); one that
 *   fails or is cancelled sends it back to the first `todo` stage, marked as
 *   failed or stopped (tasks.ts `TaskFlags`).
 * - **A retry** of a task whose last attempt failed or was stopped runs a fresh session in
 *   that attempt's workspace when its clone is still there (else a new one),
 *   briefed with the failure and the to-dos as they stand; the failed
 *   attempt's session is stopped first (work-items.ts). Queued for owned
 *   files, it is still a retry when it starts.
 * - **Groups, owned files, budgets** (slice 7b). A task's `group:` puts its
 *   attempts in that group under their parent (one combined report); its
 *   `owns:` globs keep an attempt from running beside a live item that owns
 *   overlapping files — such a start is queued (`queued_task_starts`, why
 *   `owns`) and tried again as items end; its `budget:`, else the project's,
 *   is what the attempt may spend (work-items.ts).
 *
 * - **Judgments** (§5.9, jev-placement.ts), each by Jev while it is on and
 *   by the table's Jev-off rule otherwise. Ready to dispatch: a frontier
 *   task starts only when Jev scores it ready, else when the lead marked it
 *   `ready: yes`; a task triaged as anything but `ready-for-agent` never.
 *   Dispatch order: Jev's three scores, else the lead's ranks, else board
 *   order. Delegate type: a task whose stage runs none and that names none
 *   runs Jev's choice from the project's catalog, else "medium". Judged
 *   checks: an attempt that lands at a task with acceptance criteria moves
 *   it to done only when Jev shows every criterion met (else to the first
 *   `you` stage, with a comment naming what is not); Jev off, the lead
 *   judges them (the task stays until he moves it), and with the lead off
 *   it goes to you.
 *
 * It wakes on events only: a work item ending, a task changing, a setting
 * changing, a machine with a checkout coming online. A slow timer looks
 * again as a safety net and starts nothing when nothing is ready.
 */
import {
  deliverableKind,
  type InstanceRow,
  type LandsMode,
  namesAmong,
  POST_OUTPUT_RULE,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { Elysia, status, t } from "elysia";
import type { DbShape, PlaceRow, ProjectRow, WorkItemRow } from "./db";
import type { Origin, WorkBudget, WorkItemCheck } from "./db/schema";
import type { JevAccess } from "./jev";
import {
  criteriaOf,
  DISPATCH_ASKED_MAX,
  type DispatchJudgement,
  JevFailed,
  jevDispatch,
  jevJudged,
  jevType,
  offLine,
  readyByRule,
  TRIAGE_FIELD,
  tailOf,
} from "./jev-placement";
import { quote, statusCommand } from "./landing";
import type { HubLifetimeShape } from "./lifetime";
import { FolderRefusal, type FolderRefusalStatus } from "./project-folder";
import { fits, type MachineFacts, runsOnValue, runsOnWords } from "./runs-on";
import type { Stage } from "./stages";
import type { TaskComment } from "./task-file";
import {
  BUDGET,
  hubActor,
  LANDS,
  onFrontier,
  type TaskActor,
  type TaskEvent,
  type TaskMover,
  type TaskSummary,
  type Tasks,
  type TaskView,
} from "./tasks";
import {
  budgetProblem,
  DEFAULT_DELEGATE_TYPE,
  isLive,
  OwnsOverlap,
  SESSION_TITLE_MAX,
  WorkItemRefusal,
  type WorkItemRequest,
  type WorkItemStart,
} from "./work-items";

/** What the dispatcher needs of the hub. */
export interface DispatchDeps {
  /**
   * The brief's project context for an attempt at `task` (memory.ts
   * `contextFor`): AGENTS.md and the knowledge files it needs, or "".
   */
  readonly context: (projectId: string, task: TaskView) => Promise<string>;
  readonly db: Pick<
    DbShape,
    | "dropQueuedTaskStart"
    | "getInstancesByIds"
    | "listAgents"
    | "listProjects"
    | "project"
    | "projectAttempts"
    | "queuedTaskStarts"
    | "queueTaskStart"
    | "setProjectDispatch"
    | "workItemByPrUrl"
  >;
  /**
   * The project's lead: its Caw session, started now if it has none (caw.ts
   * `lead`): for your ask on or off, for the dispatcher's own (`event`) only
   * while Caw is on; undefined otherwise.
   */
  readonly lead: (
    projectId: string,
    by: Origin
  ) => Promise<InstanceRow | undefined>;
  /** Runs the safety net until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /** Whether a machine is connected now. */
  readonly online: (machineId: string) => boolean;
  /**
   * Why the project's attempts are held back by its spend cap now, or
   * nothing (project-caps.ts `pauses`): the dispatcher then starts none, as
   * for a paused project.
   */
  readonly pauses: (projectId: string) => string | undefined;
  /** What the dispatcher's judgments (§5.9) need of the hub. */
  readonly placement: {
    /**
     * Jev off and the lead on: his wake to judge a landed attempt's
     * acceptance criteria (he did not do the work).
     */
    readonly judgeByLead: (
      projectId: string,
      task: { id: string; title: string },
      item: WorkItemRow,
      text: string
    ) => void;
    /** Jev's route while Jev is on (jev.ts `jevAccess`). */
    readonly access: () => JevAccess | undefined;
    /** The delegate types a session of the project may name. */
    readonly typesFor: (
      projectId: string
    ) => { description: string; name: string }[];
  };
  /** Files and spawns a work item (work-items.ts `start`). */
  readonly start: (request: WorkItemRequest) => Promise<WorkItemStart>;
  readonly tasks: Tasks;
  /**
   * How a delegate type lands its work, when it says. Fleet delegate types
   * do not; a project's own (`delegates/*.md`, §5.1) will, through this.
   */
  readonly typeLands?: (
    projectId: string,
    type: string
  ) => LandsMode | undefined;
}

/**
 * An attempt as it started; or, `queued`, waiting for files a live item owns
 * (its ids null until it starts).
 */
export interface AttemptStart {
  instanceId: string | null;
  /** Where its work lands. */
  lands: LandsMode;
  /** Whether it waits for files a live item owns, to start when they are free. */
  queued: boolean;
  /** The stage the task is in now. */
  stage: string;
  task: string;
  /** What the starting session reads. */
  text: string;
  /** The delegate type it runs. */
  type: string | null;
  workItemId: string | null;
  workspaceId: string | null;
}

/** A project's dispatch: its settings, and what the dispatcher would do now. */
export interface DispatchView {
  /** What an attempt may spend where its task and its delegate call say nothing; null: no limit. */
  budget: WorkBudget | null;
  /** Whether the hub starts attempts at ready tasks on its own. */
  dispatch: boolean;
  /** The tasks it would start next, in order. */
  frontier: string[];
  /** Where an attempt lands when its task and type say nothing. */
  lands: LandsMode;
  /** The project's Caw session, once the hub has started one. */
  leadInstanceId: string | null;
  /** Attempts starting or running now. */
  live: number;
  maxAttempts: number;
  /** Why it would start nothing now even with a ready task; null when it would. */
  paused: string | null;
  /** Tasks whose `runs:` hook start waits for a slot, oldest first. */
  queued: string[];
  /** Tasks waiting in `you` stages now. */
  review: number;
  reviewLimit: number;
  /** Where an attempt runs when its task says nothing (runs-on.ts); null: any machine with a checkout. */
  runsOn: string | null;
}

/** A change to a project's dispatch settings; what is left out stays. */
export interface DispatchChange {
  /** The project's default budget; null clears it. */
  budget?: WorkBudget | null;
  dispatch?: boolean;
  /** Where an attempt lands when its task and type say nothing. */
  lands?: LandsMode;
  maxAttempts?: number;
  reviewLimit?: number;
  /** Where an attempt runs when its task says nothing: a machine, or a capability like `apple`; null clears it. */
  runsOn?: string | null;
}

/** What a start nobody can take the report of says to do. */
/**
 * Whose work a hook's attempt is, by who moved its task in: yours for your
 * move or an action you approved; an event's for a routine's or the hub's;
 * a session's or Caw's, its parent's (work-items `origin`).
 */
const HOOK_ORIGIN: Record<TaskMover, Origin | undefined> = {
  you: "you",
  action: "you",
  routine: "event",
  hub: "event",
  lead: undefined,
  session: undefined,
};

const NO_LEAD =
  "Turn Caw on for the project so its lead takes the report, name a session you started in the project, or start it with task_start from one.";

/** How often the dispatcher looks again with no event: a safety net, not a loop. */
const SAFETY_MS = 5 * 60_000;
const MAX_ATTEMPTS_LIMIT = 20;
const REVIEW_LIMIT_LIMIT = 100;
const WORD = /\s+/;

/**
 * What an attempt at a task without checks is checked by: its work is
 * committed, which landing needs (its outputs aside, which need not be); for
 * one that lands none, that its outputs are written.
 */
export const defaultCheck = (
  lands: LandsMode,
  outputs: string[]
): WorkItemCheck => {
  if (lands !== "none") {
    return {
      name: "Work is committed",
      command: `test -z "$(${statusCommand(outputs)})"`,
    };
  }
  return outputs.length > 0
    ? {
        name: "Outputs are written",
        command: outputs.map((path) => `test -s ${quote(path)}`).join(" && "),
      }
    : { name: "Nothing to check", command: "true" };
};

const refuse = (code: FolderRefusalStatus, message: string): never => {
  throw new FolderRefusal(code, message);
};

const short = (id: string): string => id.slice(0, 8);

/** How a session is named in a sentence. */
const named = (row: InstanceRow): string =>
  `“${row.title?.trim() || row.derivedTitle?.trim() || `session ${short(row.id)}`}”`;

/**
 * Why `row` cannot take an attempt's reports for `projectId` (as its lead,
 * or as the session starting it), or undefined when it can: it must be a
 * session you started, in that project.
 */
export const parentProblem = (
  row: InstanceRow | undefined,
  projectId: string,
  id = ""
): string | undefined => {
  if (!row) {
    return `There is no session ${id} on this hub any more.`;
  }
  if (row.projectId !== projectId) {
    return `${named(row)} is not a session of this project.`;
  }
  if (
    row.parentInstanceId ||
    row.workItemId ||
    row.workflowStepId ||
    row.canDelegate === false
  ) {
    return `${named(row)} is a delegate, a work item or a workflow step; only a session you started takes a project's reports.`;
  }
};

/** A check's name from its command: two to six words, as work items take them. */
const checkName = (command: string): string => {
  const words = command.trim().split(WORD).filter(Boolean).slice(0, 6);
  return words.length < 2 ? `Run ${words[0] ?? "check"}` : words.join(" ");
};

/**
 * A task check that runs on the host (work-items.ts `runChecks`): its
 * command opens with `host:`, as `host: bun scripts/probe-kit/run.ts x`.
 */
const HOST_CHECK = /^host:\s*/;

/**
 * The task's checks as a work item's, or the default check when it names
 * none. The task file is its writers' (the person, its project's lead), never
 * an attempt's, so a `host:` check there is its parent's declaration.
 */
const checksOf = (
  commands: string[],
  lands: LandsMode,
  outputs: string[]
): WorkItemCheck[] =>
  commands.length === 0
    ? [defaultCheck(lands, outputs)]
    : commands.map((written) => {
        const command = written.replace(HOST_CHECK, "");
        return {
          name: checkName(command),
          command,
          ...(command === written ? {} : { host: true }),
        };
      });

/** What of a task an attempt's work item carries as it is: outputs, group, owned files, budget. */
const taskLimits = (
  task: TaskView
): Pick<WorkItemRequest, "budget" | "group" | "outputs" | "owns"> => ({
  ...(task.outputs.length > 0 ? { outputs: task.outputs } : {}),
  ...(task.group ? { group: task.group } : {}),
  ...(task.owns.length > 0 ? { owns: task.owns } : {}),
  ...(task.budget ? { budget: task.budget } : {}),
});

/** What the brief says happens once the checks pass. */
const AFTER_CHECKS: Record<LandsMode, string> = {
  main: "When the work is committed, call finish_item: the hub runs these in your workspace and lands your commits on the default branch once they pass.",
  branch:
    "When the work is committed, call finish_item: the hub runs these in your workspace and pushes your branch once they pass.",
  pr: "When the work is committed, call finish_item: the hub runs these in your workspace, then pushes your branch and opens a pull request once they pass.",
  none: "When the work is ready, call finish_item: the hub runs these in your workspace once it is; nothing is pushed.",
};

/** What the brief says of a task that names no checks: what the default check is. */
const uncheckedLine = (lands: LandsMode, task: TaskView): string => {
  if (lands !== "none") {
    return "The task names no checks, so the hub checks only that your work is committed.";
  }
  return task.outputs.length > 0
    ? "The task names no checks, so the hub checks only that your outputs are written."
    : "The task names no checks, and lands none, so the hub checks nothing.";
};

/** What a retry's brief adds: how the last attempt ended, and the to-dos done so far. */
export interface RetryContext {
  /** What the hub reported of it: its error, or its report. */
  failure: string;
  /** Its state: failed or cancelled. */
  state: string;
  workItemId: string;
}

/** The longest stretch of a failure a retry's brief carries: its end. */
const FAILURE_TAIL = 4000;
const BACKTICKS = /`+/g;

/** The work item's title: the task's id and title, cut to what a session name takes. */
const titleOf = (task: TaskView): string => {
  const title = `${task.id} ${task.title}`;
  return title.length > SESSION_TITLE_MAX
    ? `${title.slice(0, SESSION_TITLE_MAX - 1).trimEnd()}…`
    : title;
};

/**
 * The brief: the task file as it stands, the open to-dos to start the plan
 * from (with their ids), the checks finish_item runs, where the task sits
 * among its edges, and the project's context (memory.ts `contextFor`).
 */
const briefOf = (
  project: ProjectRow,
  task: TaskView,
  all: TaskSummary[],
  checks: WorkItemCheck[],
  lands: LandsMode,
  comments: TaskComment[],
  context: string,
  retry?: RetryContext
): string => {
  const byId = new Map(all.map((each) => [each.id, each]));
  const line = (id: string): string => {
    const other = byId.get(id);
    return other
      ? `${id} “${other.title}” (${other.stage})`
      : `${id} (not in the project)`;
  };
  const open = task.todos.filter((todo) => !todo.done);
  const todos =
    open.length > 0
      ? `Start your plan from these open to-dos, keeping each one's id in its plan item, like \`[td-3] Persist the choice\`:\n\n${open
          .map(
            (todo) =>
              `${"  ".repeat(todo.depth)}- [${todo.id ?? todo.path}] ${todo.text}`
          )
          .join(
            "\n"
          )}\n\nWhen a plan item carrying an id is completed, the hub ticks that to-do; you can also tick it with todo_write. Add the steps you find. finish_item lists the to-dos still open once: tick or explain each in your summary. Plan items you leave open become proposed to-dos on the task.`
      : "The task has no open to-dos. Add the steps you find with todo_write as you go; plan items you leave open become proposed to-dos on the task.";
  const waiting = all.filter((each) => each.after.includes(task.id));
  const sits = [
    ...(task.after.length > 0
      ? [`It waits for: ${task.after.map(line).join("; ")}.`]
      : []),
    ...(waiting.length > 0
      ? [`Waiting on it: ${waiting.map((each) => line(each.id)).join("; ")}.`]
      : []),
    ...(task.parent ? [`Its parent: ${line(task.parent)}.`] : []),
    ...(task.outputs.length > 0
      ? [`It produces: ${task.outputs.join(", ")}.`]
      : []),
    ...(task.outputs.some((path) => deliverableKind(path) === "post")
      ? [POST_OUTPUT_RULE]
      : []),
    ...(task.owns.length > 0
      ? [
          `It owns: ${task.owns.join(", ")}. No other live work item writes these files while you run; stay inside them.`,
        ]
      : []),
  ];
  return [
    `Your work item is an attempt at ${task.id}, “${task.title}”, a task of the project ${project.name}. This brief is its task file as it stands.`,
    ...(task.description ? [`## Description\n\n${task.description}`] : []),
    ...(task.acceptance
      ? [`## Acceptance criteria\n\n${task.acceptance}`]
      : []),
    `## To-dos\n\n${todos}`,
    `## Checks\n\n${AFTER_CHECKS[lands]}\n\n${checks
      .map((check) => `- ${check.name}: \`${check.command}\``)
      .join("\n")}${
      task.checks.length === 0 ? `\n\n${uncheckedLine(lands, task)}` : ""
    }`,
    `## Where it sits\n\n${sits.length > 0 ? sits.join("\n") : "Nothing waits on it, and it waits for nothing."}`,
    `## Handing it in\n\n${RESULT_LINE}`,
    ...(context ? [context] : []),
    ...(retry ? [retrySection(task, retry)] : []),
    ...(comments.length > 0 ? [commentsSection(comments)] : []),
  ].join("\n\n");
};

/**
 * How an attempt hands in its work (task-tools.ts `task_result`): what the
 * task's review shows first, its words over the artifact it presented. The
 * review draws a presented artifact with the artifact panel's renderer and
 * never a file's format, so the brief asks for the artifact first.
 */
const RESULT_LINE =
  'Before finish_item, show your work, then hand it in. Show it with artifact_create: a page that draws what you made as its reader will meet it (the post as it will read, the report, the screen), or a preview of the app running. The review draws that artifact whole; it draws no file. Then call task_result: `summary`, what you did in a few sentences; `check`, what the reviewer should look at, one line each; `artifacts`, that artifact first (`kind: "artifact"`, its `artifactId`, `primary: true`), then each file by its path from the project folder and each link by its url. Words alone only when there is nothing to show.';

/** The most comments a brief carries: the newest. */
const BRIEF_COMMENTS_MAX = 20;

/** The comments left on the task since its last attempt started, batched into the brief (§5.3). */
const commentsSection = (comments: TaskComment[]): string =>
  `## Comments since the last attempt\n\n${comments
    .slice(-BRIEF_COMMENTS_MAX)
    .map(
      (comment) =>
        `**${comment.author.name}**, ${new Date(comment.at).toISOString()}:\n\n${comment.text}`
    )
    .join("\n\n")}`;

/** A retry's section of the brief: how the last attempt ended, and what of the task is done. */
const retrySection = (task: TaskView, retry: RetryContext): string => {
  const done = task.todos.filter((todo) => todo.done);
  const failure = retry.failure.trim() || "(the hub kept no words for it)";
  const tail =
    failure.length > FAILURE_TAIL
      ? `…${failure.slice(-FAILURE_TAIL)}`
      : failure;
  // Longer than any run of backticks in the report, which fences its own.
  const longest = Math.max(
    0,
    ...(tail.match(BACKTICKS) ?? []).map((run) => run.length)
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [
    `## The last attempt\n\nThis is a retry. The last attempt (work item ${short(retry.workItemId)}) ${retry.state === "cancelled" ? "was cancelled" : "failed"}; the hub reported:\n\n${fence}\n${tail}\n${fence}`,
    done.length > 0
      ? `Done so far, by the task's to-dos: ${done.map((todo) => `[${todo.id ?? todo.path}] ${todo.text}`).join("; ")}.`
      : "None of the task's to-dos is ticked yet.",
    "When your workspace still holds the last attempt's clone, its commits and files are as it left them: read `git log` and `git status` before you start, and carry on from there rather than starting over.",
  ].join("\n\n");
};

/** Why a count setting cannot be `value`: it is a whole number from 1 to `max`. */
const countProblem = (
  name: string,
  value: number | undefined,
  max: number
): string | undefined =>
  value === undefined || (Number.isInteger(value) && value >= 1 && value <= max)
    ? undefined
    : `${name} is a whole number from 1 to ${max}.`;

/** `1 task waits`, `3 tasks wait`. */
const counted = (count: number, one: string, many: string): string =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/** Why dispatch would start nothing now, even with a ready task; null when it would. */
const pauseOf = (
  project: ProjectRow,
  now: {
    live: number;
    review: number;
    stagesProblems: string[];
  }
): string | null => {
  if (!project.dispatch) {
    return "Dispatch is off: attempts start only when a session or you start them.";
  }
  if (!project.caw) {
    return "Caw is off, so the project has no lead to take the reports of the attempts the hub starts; they start only when a session or you start them.";
  }
  if (now.stagesProblems.length > 0) {
    return `stages.md does not read. ${now.stagesProblems.join(" ")}`;
  }
  if (now.review >= project.reviewLimit) {
    return `${counted(now.review, "task waits", "tasks wait")} for you in review; dispatch pauses at ${project.reviewLimit}.`;
  }
  if (now.live >= project.maxAttempts) {
    return `${counted(now.live, "attempt is", "attempts are")} live; the project runs at most ${project.maxAttempts}.`;
  }
  return null;
};

/** The columns a settings change writes: only what it names. */
const columnsOf = ({
  budget,
  dispatch,
  lands,
  maxAttempts,
  reviewLimit,
  runsOn,
}: DispatchChange) => ({
  ...(budget === undefined
    ? {}
    : { budget: budget && Object.keys(budget).length > 0 ? budget : null }),
  ...(dispatch === undefined ? {} : { dispatch }),
  ...(lands === undefined ? {} : { lands }),
  ...(maxAttempts === undefined ? {} : { maxAttempts }),
  ...(reviewLimit === undefined ? {} : { reviewLimit }),
  ...(runsOn === undefined ? {} : { runsOn }),
});

/** A failure to start, as the words a caller reads and the status a route answers. */
const failure = (
  error: unknown
): { code: FolderRefusalStatus | 502; message: string } => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof FolderRefusal) {
    return { code: error.status, message };
  }
  if (error instanceof WorkItemRefusal) {
    return { code: error.status, message };
  }
  // Anything else is the machine's: offline, or git turning the clone down.
  return { code: 502, message };
};

export const createDispatcher = ({
  context,
  db,
  lead,
  lifetime,
  online,
  pauses,
  placement,
  start,
  tasks,
  typeLands,
}: DispatchDeps) => {
  /**
   * Jev's readiness and order for each frontier task, by `project\0task`,
   * with the hash of the file it read: a file that did not change is not
   * asked about again.
   */
  const judgements = new Map<string, DispatchJudgement & { hash: string }>();
  /** Attempts being started now, by `project\0task`: their work item is not filed yet. */
  const starting = new Set<string>();
  /** Why the hub last could not start an attempt at a task, and the file it read then. */
  const problems = new Map<string, { hash: string; message: string }>();
  /** Projects being looked at now, and the ones to look at again after. */
  const looking = new Set<string>();
  const again = new Set<string>();
  /** Whether the safety net runs: started once, stopped with the hub. */
  let watching = false;

  const keyOf = (projectId: string, taskId: string): string =>
    `${projectId}\0${taskId}`;

  const startingIn = (projectId: string): number =>
    [...starting].filter((key) => key.startsWith(`${projectId}\0`)).length;

  const liveAttempts = (projectId: string): WorkItemRow[] =>
    db.projectAttempts(projectId).filter((item) => isLive(item.state));

  const projectOf = (projectId: string): ProjectRow =>
    db.project(projectId) ??
    refuse(404, `The hub keeps no project ${projectId}.`);

  const instance = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id])[0] as InstanceRow | undefined;

  /** The project's lead, its Caw, started now when it has none; undefined while Caw is off. */
  const leadOf = async (
    project: ProjectRow,
    by: Origin = "event"
  ): Promise<InstanceRow | undefined> => {
    const row =
      by === "you" || project.caw ? await lead(project.id, by) : undefined;
    return row && !parentProblem(row, project.id) ? row : undefined;
  };

  /** The machines `runsOn` names (runs-on.ts), online or not. */
  const machinesFor = (runsOn: string): MachineFacts[] =>
    db.listAgents().filter((machine) => fits(runsOn, machine));

  /**
   * Where a new workspace is cut: a checkout of the project on a machine that
   * is online and, when the attempt names where it runs, one of those
   * machines; the starting session's own first, then the primary place.
   */
  const placeFor = (
    project: ProjectRow,
    parent: InstanceRow,
    runsOn: string | null
  ): PlaceRow | undefined => {
    const allowed = runsOn
      ? new Set(machinesFor(runsOn).map((machine) => machine.machineId))
      : undefined;
    const checkouts = project.places.filter(
      (place) =>
        place.kind === "checkout" &&
        online(place.machineId) &&
        (!allowed || allowed.has(place.machineId))
    );
    return (
      checkouts.find(
        (place) =>
          place.machineId === parent.machineId && place.path === parent.cwd
      ) ??
      checkouts.find((place) => place.machineId === parent.machineId) ??
      checkouts[0]
    );
  };

  /**
   * Why an attempt that runs on `runsOn` has nowhere to start, in one
   * sentence: no machine it names is known, none of them is online, or none
   * online holds a checkout of the project. It is never placed elsewhere.
   */
  const unplaced = (
    project: ProjectRow,
    task: TaskView,
    runsOn: string
  ): string => {
    const needs = `${task.id} runs on ${runsOnWords(runsOn)}`;
    const fitting = machinesFor(runsOn);
    if (fitting.length === 0) {
      return `${needs}, and no machine this hub knows is one, so it starts nowhere else: join one, or change its runs_on.`;
    }
    const up = fitting.filter((machine) => online(machine.machineId));
    const fleet = db.listAgents();
    const hosts = (machines: MachineFacts[]) => namesAmong(machines, fleet);
    if (up.length === 0) {
      return `${needs}, and none is online (${hosts(fitting)} ${fitting.length === 1 ? "is" : "are"} offline), so it starts nowhere else: bring one online.`;
    }
    return `${needs}, and no checkout of ${project.name} is on one that is online (${hosts(up)}), so it starts nowhere else: add a checkout place there.`;
  };

  /**
   * Where an attempt's work item is cut, as its request says it: a checkout
   * its task's runs_on names (else its project's), and for a retry the last
   * workspace, kept only on a machine runs_on names. Refused, and the reason
   * remembered on the task, when there is nowhere to cut it.
   */
  const placementOf = (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    previous: WorkItemRow | undefined
  ): Pick<WorkItemRequest, "cwd" | "machineId" | "reuse" | "reuseOn"> => {
    const runsOn = task.runsOn ?? project.runsOn;
    const place = placeFor(project, parent, runsOn);
    let message: string | undefined;
    if (runsOn && !place) {
      message = unplaced(project, task, runsOn);
    } else if (!(place || previous)) {
      message = `No checkout of ${project.name} is on a machine that is online, so there is nowhere to cut ${task.id}'s workspace. Bring one of its machines online, or add a checkout place on one that is.`;
    }
    if (message) {
      note(project.id, task, message);
      refuse(409, message);
    }
    return {
      ...(place ? { cwd: place.path, machineId: place.machineId } : {}),
      ...(previous ? { reuse: previous.workspaceId } : {}),
      ...(previous && runsOn
        ? {
            reuseOn: machinesFor(runsOn).map((machine) => machine.machineId),
          }
        : {}),
    };
  };

  /** Remembers why a start failed, against the task file as it was read. */
  const note = (
    projectId: string,
    task: { hash: string; id: string },
    message: string
  ): void => {
    problems.set(keyOf(projectId, task.id), { hash: task.hash, message });
    console.warn(`[dispatch] ${task.id} in project ${projectId}: ${message}`);
  };

  /** Refuses an attempt at a task that has a live one, or is done or dropped. */
  const startable = (projectId: string, task: TaskView): void => {
    const live = liveAttempts(projectId).find(
      (item) => item.taskId === task.id
    );
    if (live) {
      refuse(
        409,
        `${task.id} has a live attempt already: work item ${live.id} is ${live.state}. Message its session, or wait for its report.`
      );
    }
    if (task.kind === "done" || task.kind === "dropped") {
      refuse(
        409,
        `${task.id} is in ${task.stage}, a ${task.kind} stage; move it back before starting an attempt.`
      );
    }
  };

  /**
   * The active stage an attempt runs in: the one a hook started it from, the
   * one the task is in when that is active, else the first of kind `active`
   * (none, when the project has none).
   */
  const activeFor = async (
    projectId: string,
    task: TaskView,
    stage: Stage | undefined
  ): Promise<Stage | undefined> => {
    if (stage) {
      return stage;
    }
    const stages = await tasks.stages(projectId);
    if (stages.problems.length > 0) {
      refuse(
        409,
        `stages.md does not read, so the hub cannot tell where an attempt moves ${task.id}. ${stages.problems.join(" ")}`
      );
    }
    return task.kind === "active"
      ? stages.stages.find((each) => each.name === task.stage)
      : stages.stages.find((each) => each.kind === "active");
  };

  /**
   * How an attempt at `task` lands: the task's `lands:`, else its delegate
   * type's, else the project's.
   */
  const landsOf = (
    project: ProjectRow,
    task: TaskView,
    type: string | undefined
  ): LandsMode =>
    task.lands ??
    (type ? typeLands?.(project.id, type) : undefined) ??
    project.lands;

  /**
   * Delegate type (§5.9) for an attempt whose stage runs none and whose task
   * names none: Jev's choice from the project's catalog while Jev is on;
   * with Jev off nobody named one, so "medium" (undefined here: work-items'
   * default). Jev failing refuses the start with its words; the next look
   * asks again.
   */
  const chosenType = async (
    project: ProjectRow,
    task: TaskView
  ): Promise<string | undefined> => {
    const access = placement.access();
    if (!access) {
      offLine(
        "type",
        project.id,
        `${task.id} names no type and its stage runs none, so it runs "${DEFAULT_DELEGATE_TYPE}"`
      );
      return;
    }
    const types = placement.typesFor(project.id);
    if (types.length === 0) {
      return;
    }
    const type = await jevType(
      access,
      project.id,
      {
        title: task.title,
        text: [task.description, task.acceptance].filter(Boolean).join("\n\n"),
      },
      types
    );
    console.log(
      `[dispatch] ${project.name}: ${task.id} runs ${type}, Jev's choice of ${types.length} types`
    );
    return type;
  };

  /**
   * The frontier tasks to start, in the order to start them (§5.9 Ready to
   * dispatch and Dispatch order). A task triaged as anything but
   * `ready-for-agent` is not an agent's. Jev on: the ones Jev scores ready,
   * by its three order scores (ties keep board order); a Jev that does not
   * answer starts nothing this look. Jev off: the ones the lead scored
   * `ready: yes` (with the lead off, the ones with a check), in board order,
   * which is the lead's ranks, then the rest by number.
   */
  const readyInOrder = async (
    project: ProjectRow,
    frontier: string[]
  ): Promise<string[]> => {
    const { tasks: all } = await tasks.list(project.id);
    const byId = new Map(all.map((each) => [each.id, each]));
    const triaged = frontier
      .filter((id) => {
        const state = byId.get(id)?.fields[TRIAGE_FIELD];
        return !state || state === "ready-for-agent";
      })
      .slice(0, DISPATCH_ASKED_MAX);
    const views = await Promise.all(
      triaged.map((id) => tasks.get(project.id, id))
    );
    const access = placement.access();
    return access
      ? await readyByJev(project, access, views, all)
      : readyByLead(project, views, byId);
  };

  /** Ready to dispatch and Dispatch order with Jev off: the lead's scores (else a check), in board order. */
  const readyByLead = (
    project: ProjectRow,
    views: TaskView[],
    byId: Map<string, TaskSummary>
  ): string[] => {
    const ready = views
      .filter((task) =>
        readyByRule(
          {
            checks: task.checks.length,
            fields: byId.get(task.id)?.fields ?? {},
          },
          project.caw
        )
      )
      .map((task) => task.id);
    const waiting = views
      .map((task) => task.id)
      .filter((id) => !ready.includes(id));
    offLine(
      "ready",
      project.id,
      `${project.caw ? "the lead's scores" : "with the lead off, a check must exist"}: ready ${ready.join(", ") || "none"}${waiting.length > 0 ? `; not ready ${waiting.join(", ")}` : ""}`
    );
    if (ready.length > 0) {
      offLine(
        "order",
        project.id,
        `the lead's ranks, else board order: ${ready.join(", ")}`
      );
    }
    return ready;
  };

  /**
   * Asks Jev about the frontier tasks it has no judgement of for the file as
   * it stands, and keeps the answers; false when Jev did not answer.
   */
  const judgeFresh = async (
    project: ProjectRow,
    access: JevAccess,
    views: TaskView[],
    all: TaskSummary[]
  ): Promise<boolean> => {
    const fresh = views.filter(
      (task) => judgements.get(keyOf(project.id, task.id))?.hash !== task.hash
    );
    if (fresh.length === 0) {
      return true;
    }
    let answered: Map<string, DispatchJudgement>;
    try {
      answered = await jevDispatch(
        access,
        project.id,
        fresh.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          acceptance: task.acceptance,
          checks: task.checks,
          todos: task.todos
            .filter((todo) => !todo.done)
            .map((todo) => todo.text),
          waiting: all.filter((each) => each.after.includes(task.id)).length,
        }))
      );
    } catch (error) {
      if (error instanceof JevFailed) {
        console.warn(
          `[dispatch] ${project.name}: nothing starts this look: ${error.message}`
        );
        return false;
      }
      throw error;
    }
    for (const task of fresh) {
      const judged = answered.get(task.id);
      if (judged) {
        judgements.set(keyOf(project.id, task.id), {
          ...judged,
          hash: task.hash,
        });
      }
    }
    return true;
  };

  /** Ready to dispatch and Dispatch order with Jev on: the ones Jev scores ready, by its order scores. */
  const readyByJev = async (
    project: ProjectRow,
    access: JevAccess,
    views: TaskView[],
    all: TaskSummary[]
  ): Promise<string[]> => {
    if (!(await judgeFresh(project, access, views, all))) {
      return [];
    }
    const ready = views
      .map((task, index) => ({
        task,
        index,
        judged: judgements.get(keyOf(project.id, task.id)),
      }))
      .filter((each) => each.judged?.ready)
      .sort(
        (a, b) =>
          (b.judged?.order ?? 0) - (a.judged?.order ?? 0) || a.index - b.index
      )
      .map((each) => each.task.id);
    console.log(
      `[dispatch] ${project.name}: Jev scores ready, in order: ${ready.join(", ") || "none"} of ${views.length}`
    );
    return ready;
  };

  /**
   * Files and spawns the attempt's work item; a failure is remembered on the
   * task. A retry names the attempt before it, whose workspace it runs in
   * again when that clone is still there. `origin` is whose work it is
   * (work-items `origin`); left out, its parent's.
   */
  const launch = async (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    active: Stage | undefined,
    { origin, previous }: { origin?: Origin; previous?: WorkItemRow }
  ): Promise<WorkItemStart> => {
    const placed = placementOf(project, task, parent, previous);
    const type =
      active?.hooks.runs ?? task.type ?? (await chosenType(project, task));
    const lands = landsOf(project, task, type);
    const checks = checksOf(task.checks, lands, task.outputs);
    const { tasks: all } = await tasks.list(project.id);
    const retry = previous
      ? {
          workItemId: previous.id,
          state: previous.state,
          failure: previous.error ?? previous.result ?? "",
        }
      : undefined;
    // The comments left since the task's newest attempt started.
    const [last] = db
      .projectAttempts(project.id)
      .filter((item) => item.taskId === task.id);
    const comments = last
      ? task.comments.filter(
          (comment) => comment.at >= last.createdAt.getTime()
        )
      : [];
    try {
      const known = await context(project.id, task);
      const started = await start({
        parentInstanceId: parent.id,
        prompt: briefOf(
          project,
          task,
          all,
          checks,
          lands,
          comments,
          known,
          retry
        ),
        title: titleOf(task),
        type,
        checks,
        lands,
        ...taskLimits(task),
        ...placed,
        ...(origin ? { origin } : {}),
        // Only a start a person asked for names `you` here: his dashboard
        // start or retry, or his own move into a `runs:` stage.
        byPerson: origin === "you",
        task: { id: task.id, projectId: project.id },
      });
      problems.delete(keyOf(project.id, task.id));
      return started;
    } catch (error) {
      note(project.id, task, failure(error).message);
      throw error;
    }
  };

  /** Moves a task whose attempt started into its active stage; answers where it is. */
  const moveIn = async (
    projectId: string,
    task: TaskView,
    active: Stage | undefined,
    item: WorkItemRow
  ): Promise<string> => {
    if (!active || active.name === task.stage) {
      return task.stage;
    }
    try {
      const moved = await tasks.move(
        projectId,
        task.id,
        active.name,
        hubActor(`attempt ${short(item.id)} started`)
      );
      return moved.stage;
    } catch (error) {
      console.warn(
        `[dispatch] ${task.id}'s attempt ${item.id} started, but the task did not move to ${active.name}: ${failure(error).message}`
      );
      return task.stage;
    }
  };

  /**
   * Starts an attempt at a task, reporting to `parent`. `stage` is the active
   * stage a hook started it from; without one the task moves to the stage it
   * is active in, or the first of kind `active`. Refused while the task has a
   * live attempt, is done or dropped, or no checkout is online; a start the
   * machine or the fleet turns down is remembered on the task until it
   * changes.
   */
  const startAttempt = async (
    projectId: string,
    ref: string,
    parent: InstanceRow,
    stage?: Stage,
    retry = false,
    origin?: Origin
  ): Promise<AttemptStart> => {
    const project = projectOf(projectId);
    const unfit = parentProblem(parent, projectId, parent.id);
    if (unfit) {
      refuse(403, unfit);
    }
    const task = await tasks.get(projectId, ref);
    const key = keyOf(projectId, task.id);
    if (starting.has(key)) {
      refuse(409, `An attempt at ${task.id} is starting already.`);
    }
    // From here to its work item being filed, the start holds the task.
    starting.add(key);
    try {
      startable(projectId, task);
      const previous = retry ? retryable(projectId, task) : undefined;
      const active = await activeFor(projectId, task, stage);
      let started: WorkItemStart;
      try {
        started = await launch(project, task, parent, active, {
          origin,
          previous,
        });
      } catch (error) {
        if (!(error instanceof OwnsOverlap)) {
          throw error;
        }
        return queuedForOwns(project, task, parent, stage, error, {
          retry,
          origin,
        });
      }
      // Asked for now: a hook's start that waited for a slot is not needed.
      db.dropQueuedTaskStart(projectId, task.id);
      const now = await moveIn(projectId, task, active, started.item);
      const opening = startedLine(task.id, started, previous);
      console.log(
        `[dispatch] ${project.name}: ${task.id} attempt ${started.item.id} ${previous ? "retried" : "started"} (lands ${started.item.lands}), reporting to ${parent.id}`
      );
      return {
        task: task.id,
        stage: now,
        queued: false,
        type: started.item.type,
        lands: started.item.lands,
        workItemId: started.item.id,
        workspaceId: started.workspace.id,
        instanceId: started.item.instanceId,
        text: `${opening} It is now in ${now || "no stage"}, and lands ${started.item.lands}. ${started.text}`,
      };
    } finally {
      starting.delete(key);
    }
  };

  /**
   * An attempt that waits for files a live item owns: queued, why `owns`,
   * under the stage the task is in (a hook's own), to start as items end
   * ({@link drainQueued}) while it is still there; the task stays put. A
   * retry stays a retry: it starts as one, in the last attempt's workspace;
   * and a start keeps whose it is (`origin`), so yours that waited is yours.
   */
  const queuedForOwns = (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    active: Stage | undefined,
    overlap: OwnsOverlap,
    { retry, origin }: { origin: Origin | undefined; retry: boolean }
  ): AttemptStart => {
    db.queueTaskStart({
      projectId: project.id,
      taskId: task.id,
      stage: task.stage,
      parentInstanceId: parent.id,
      why: "owns",
      retry,
      origin: origin ?? null,
    });
    console.log(
      `[dispatch] ${project.name}: ${task.id}${retry ? "'s retry" : ""} waits for owned files: ${overlap.message}`
    );
    return {
      task: task.id,
      stage: task.stage,
      queued: true,
      type: active?.hooks.runs ?? task.type,
      lands: landsOf(
        project,
        task,
        active?.hooks.runs ?? task.type ?? undefined
      ),
      workItemId: null,
      workspaceId: null,
      instanceId: null,
      text: `Queued ${retry ? "a retry of" : "an attempt at"} ${task.id}: ${overlap.message} The hub starts it, reporting to you, when the files are free.`,
    };
  };

  /** How an attempt's start opens: started, or retried in the old workspace or a new one. */
  const startedLine = (
    id: string,
    started: WorkItemStart,
    previous: WorkItemRow | undefined
  ): string => {
    if (!previous) {
      return `Started an attempt at ${id}.`;
    }
    return started.workspace.id === previous.workspaceId
      ? `Retried ${id} in the last attempt's workspace, with a fresh session.`
      : `Retried ${id} in a new workspace: the last attempt's clone is gone.`;
  };

  /** The attempt a retry follows: the task's newest, which failed or was cancelled. */
  const retryable = (projectId: string, task: TaskView): WorkItemRow => {
    const [previous] = db
      .projectAttempts(projectId)
      .filter((item) => item.taskId === task.id);
    if (!(previous && (task.lastAttemptFailed || task.lastAttemptStopped))) {
      return refuse(
        409,
        previous
          ? `${task.id}'s last attempt is ${previous.state}, not failed or stopped; start a new one with task_start.`
          : `${task.id} has no attempt to retry; start one with task_start.`
      );
    }
    return previous;
  };

  /** What the dispatcher would do for a project now. */
  const viewOf = async (project: ProjectRow): Promise<DispatchView> => {
    const list = await tasks.list(project.id);
    const live = liveAttempts(project.id).length + startingIn(project.id);
    const review = list.tasks.filter((task) => task.kind === "you").length;
    const frontier = list.tasks.filter(onFrontier).map((task) => task.id);
    const paused = pauseOf(project, {
      stagesProblems: list.stagesProblems,
      review,
      live,
    });
    return {
      budget: project.budget,
      dispatch: project.dispatch,
      lands: project.lands,
      leadInstanceId: project.leadInstanceId,
      maxAttempts: project.maxAttempts,
      reviewLimit: project.reviewLimit,
      runsOn: project.runsOn,
      live,
      review,
      paused,
      frontier,
      queued: db.queuedTaskStarts(project.id).map((each) => each.taskId),
    };
  };

  /**
   * One look at a project: starts the frontier's first tasks up to the cap,
   * unless paused, reporting to its Caw (started for the first one).
   */
  /**
   * What one look would start: the project, how many attempts are live, and
   * its ready frontier in order; undefined for a project that does not
   * dispatch now, or has nothing ready. Judged before the lead is started:
   * nothing ready wakes nobody.
   */
  const lookAt = async (
    projectId: string
  ): Promise<
    { live: number; project: ProjectRow; ready: string[] } | undefined
  > => {
    const project = db.project(projectId);
    if (!(project?.dispatch && project.caw)) {
      return;
    }
    const view = await viewOf(project);
    if (view.paused || view.frontier.length === 0 || pauses(projectId)) {
      return;
    }
    const ready = await readyInOrder(project, view.frontier);
    return ready.length > 0 ? { project, live: view.live, ready } : undefined;
  };

  const dispatchOnce = async (projectId: string): Promise<void> => {
    const look = await lookAt(projectId);
    if (!look) {
      return;
    }
    const { project, ready } = look;
    const reportsTo = await leadOf(project);
    if (!reportsTo) {
      return;
    }
    let slots = project.maxAttempts - look.live;
    for (const id of ready) {
      if (slots <= 0) {
        break;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one start at a time keeps the cap exact and the folder's commits in order
        const started = await startAttempt(
          projectId,
          id,
          reportsTo,
          undefined,
          false,
          "event"
        );
        // One queued for owned files took no slot.
        if (!started.queued) {
          slots -= 1;
        }
      } catch (error) {
        console.warn(
          `[dispatch] ${project.name}: ${id} did not start: ${failure(error).message}`
        );
      }
    }
  };

  /** Live attempts in a project, counting the ones being started now. */
  const liveIn = (projectId: string): number =>
    liveAttempts(projectId).length + startingIn(projectId);

  /**
   * The session a hook's attempt reports to: the one that moved the task in
   * when it can take reports, else the lead.
   */
  const hookParent = async (
    project: ProjectRow,
    moverId: string | null | undefined
  ): Promise<InstanceRow | undefined> => {
    const mover = moverId ? instance(moverId) : undefined;
    return mover && !parentProblem(mover, project.id)
      ? mover
      : await leadOf(project);
  };

  /**
   * The hook starts that waited for a slot, oldest first, while the project
   * has slots: each one whose task is still in the stage that asked, with no
   * live attempt, and someone to report to. Each leaves the queue as it is
   * tried; a start that fails is remembered on the task, as any start is.
   */
  const drainQueued = async (projectId: string): Promise<void> => {
    const project = db.project(projectId);
    if (!project) {
      return;
    }
    for (const queued of db.queuedTaskStarts(projectId)) {
      const owns = queued.why === "owns";
      // A start that waited for owned files was asked for, so the cap does
      // not hold it back; a hook's does.
      if (!owns && liveIn(projectId) >= project.maxAttempts) {
        return;
      }
      db.dropQueuedTaskStart(projectId, queued.taskId);
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one start at a time keeps the cap exact
        await runQueued(project, queued);
      } catch (error) {
        console.warn(
          `[dispatch] ${project.name}: ${queued.taskId}'s queued start did not run: ${failure(error).message}`
        );
      }
    }
  };

  /**
   * One queued start, taken off the queue: run when its task is still in the
   * stage it waited in, with no live attempt, and someone to report to — a
   * hook's from its `runs:` stage, one that waited for owned files from
   * wherever it was asked, a retry as a retry, and each as whose it was
   * (`origin`). Still overlapping, it queues again.
   */
  const runQueued = async (
    project: ProjectRow,
    queued: ReturnType<DispatchDeps["db"]["queuedTaskStarts"]>[number]
  ): Promise<void> => {
    const owns = queued.why === "owns";
    const stages = await tasks.stages(project.id);
    const stage = stages.stages.find((each) => each.name === queued.stage);
    const task = await tasks.get(project.id, queued.taskId);
    const hook = stage?.kind === "active" && !!stage.hooks.runs;
    if (!(hook || owns) || task.stage !== queued.stage || task.liveAttempt) {
      console.log(
        `[dispatch] ${project.name}: ${task.id}'s queued start is dropped: it is in ${task.stage}${task.liveAttempt ? " with a live attempt" : ""}, not waiting in ${queued.stage}.`
      );
      return;
    }
    const parent = await hookParent(project, queued.parentInstanceId);
    if (!parent) {
      note(
        project.id,
        task,
        `${task.id} waited in ${queued.stage} for ${owns ? "owned files" : "a slot"}, but no session can take the attempt's report now. ${NO_LEAD}`
      );
      return;
    }
    await startAttempt(
      project.id,
      task.id,
      parent,
      stage?.kind === "active" ? stage : undefined,
      queued.retry,
      queued.origin ?? undefined
    );
  };

  /**
   * Looks at a project again: the hook starts waiting for a slot first, then
   * the frontier. One look at a time per project, and a request that arrives
   * during one runs once more after it.
   */
  const evaluate = (projectId: string): void => {
    if (looking.has(projectId)) {
      again.add(projectId);
      return;
    }
    looking.add(projectId);
    const look = async (): Promise<void> => {
      do {
        again.delete(projectId);
        try {
          // biome-ignore lint/performance/noAwaitInLoops: a look that was asked for during the last one runs after it
          await drainQueued(projectId);
          await dispatchOnce(projectId);
        } catch (error) {
          console.warn(`[dispatch] ${projectId}: ${failure(error).message}`);
        }
      } while (again.has(projectId));
    };
    detach(
      look().finally(() => {
        looking.delete(projectId);
        if (again.has(projectId)) {
          evaluate(projectId);
        }
      }),
      "dispatch look"
    );
  };

  /**
   * A task entered an `active` stage that runs a type, by a move or filed
   * straight into it: start it, reporting to the mover or the lead, or, while
   * the project runs `max_attempts` already, queue the start for a slot.
   */
  const hooked = async (event: {
    actor: TaskActor;
    id: string;
    projectId: string;
    to: string;
  }): Promise<void> => {
    const { projectId, id, to, actor } = event;
    const stages = await tasks.stages(projectId);
    const stage = stages.stages.find((each) => each.name === to);
    if (!(stage?.kind === "active" && stage.hooks.runs)) {
      return;
    }
    const project = projectOf(projectId);
    const parent = await hookParent(project, actor.instanceId);
    if (!parent) {
      const task = await tasks.get(projectId, id);
      note(
        projectId,
        task,
        `${id} entered ${to}, which runs ${stage.hooks.runs}, but no session can take the attempt's report. ${NO_LEAD}`
      );
      return;
    }
    const live = liveIn(projectId);
    if (live >= project.maxAttempts) {
      db.queueTaskStart({
        projectId,
        taskId: id,
        stage: to,
        parentInstanceId: parent.id === actor.instanceId ? parent.id : null,
        origin: HOOK_ORIGIN[actor.mover] ?? null,
      });
      console.log(
        `[dispatch] ${project.name}: ${id} entered ${to}, which runs ${stage.hooks.runs}; ${counted(live, "attempt is", "attempts are")} live, the cap is ${project.maxAttempts}, so its start waits for a slot.`
      );
      return;
    }
    try {
      await startAttempt(
        projectId,
        id,
        parent,
        stage,
        false,
        HOOK_ORIGIN[actor.mover]
      );
    } catch (error) {
      console.warn(
        `[dispatch] ${id} entered ${to}, which runs ${stage.hooks.runs}, and did not start: ${failure(error).message}`
      );
    }
  };

  /**
   * The stage kind an attempt that ended sends its task to: done, or `you`
   * while the pull request it opened waits for review; back to todo when it
   * failed or was cancelled.
   */
  const kindAfter = (item: WorkItemRow): "done" | "todo" | "you" => {
    if (item.state !== "done") {
      return "todo";
    }
    return item.lands === "pr" && item.prUrl ? "you" : "done";
  };

  /**
   * Review before done (stages.ts `ruledStages`): its done stage is entered
   * by you alone, and a `you` stage stands before it, so a task whose
   * attempt landed waits there for you.
   */
  const reviewsFirst = (stages: { stages: readonly Stage[] }): boolean =>
    stages.stages.find((each) => each.kind === "done")?.hooks.by === "you" &&
    stages.stages.some((each) => each.kind === "you");

  /**
   * The hub's move of a task after its attempt ended: done to the first done
   * stage, a pull request to the first `you` stage (staying put without one),
   * otherwise back to the first todo stage.
   */
  const settle = async (item: WorkItemRow): Promise<void> => {
    const { projectId, taskId } = item;
    if (!(projectId && taskId && db.project(projectId))) {
      return;
    }
    // Only the task's newest attempt moves it.
    const newest = db
      .projectAttempts(projectId)
      .find((each) => each.taskId === taskId);
    if (newest?.id !== item.id) {
      return;
    }
    const stages = await tasks.stages(projectId);
    if (stages.problems.length > 0) {
      console.warn(
        `[dispatch] ${taskId}'s attempt ${item.id} is ${item.state}, and stages.md does not read, so the task stays where it is.`
      );
      return;
    }
    const task = await tasks.get(projectId, taskId);
    // You closed it while the attempt ran: that stands.
    if (task.kind === "done" || task.kind === "dropped") {
      return;
    }
    const criteria = criteriaOf(task.acceptance);
    const judged = await kindAfterJudged(projectId, task, criteria, item);
    // The lead judges: the task stays where it is until he moves it.
    if (judged === "lead") {
      return;
    }
    const kind = judged === "done" && reviewsFirst(stages) ? "you" : judged;
    const target = stages.stages.find((each) => each.kind === kind);
    // Only an approved action enters a `by: action` stage (§5.2): the task stays.
    if (target?.hooks.by === "action") {
      console.info(
        `[dispatch] ${taskId}'s attempt ${item.id} is ${item.state}; ${target.name} is entered only by an approved action, so the task stays in ${task.stage}.`
      );
      return;
    }
    if (target && target.name !== task.stage) {
      await tasks.move(
        projectId,
        taskId,
        target.name,
        hubActor(movedBecause(item, judged, kind, criteria.length))
      );
    }
  };

  /**
   * The stage kind an ended attempt sends its task to, once a landed one's
   * acceptance criteria are judged ({@link judgeCriteria}); `lead` while he
   * judges them.
   */
  const kindAfterJudged = async (
    projectId: string,
    task: TaskView,
    criteria: string[],
    item: WorkItemRow
  ): Promise<"done" | "lead" | "todo" | "you"> => {
    const kind = kindAfter(item);
    return kind === "done" && criteria.length > 0
      ? await judgeCriteria(projectId, task, criteria, item)
      : kind;
  };

  /**
   * Why the hub moved a task after its attempt ended, as its commit says:
   * `judged` is where its attempt sent it, `kind` where it went (review, for
   * a done in a project that reviews before done).
   */
  const movedBecause = (
    item: WorkItemRow,
    judged: "done" | "todo" | "you",
    kind: "done" | "todo" | "you",
    criteria: number
  ): string => {
    if (judged === "done" && kind === "you") {
      return `attempt ${short(item.id)} ${item.state}; this project reviews before done, so it waits for you`;
    }
    if (kind === "you" && item.prUrl && item.lands === "pr") {
      return `attempt ${short(item.id)} opened ${item.prUrl}`;
    }
    if (kind === "you") {
      return `attempt ${short(item.id)} ${item.state}; its acceptance criteria wait for you`;
    }
    return criteria > 0 && kind === "done"
      ? `attempt ${short(item.id)} ${item.state}; Jev shows its ${criteria} acceptance criteria met`
      : `attempt ${short(item.id)} ${item.state}`;
  };

  /**
   * Judged checks (§5.9) for an attempt that landed at a task with
   * acceptance criteria: never by the session that did the work. Jev on:
   * done when Jev shows every criterion met, else `you`, with a comment
   * naming the ones it does not (a Jev that does not answer says so in the
   * comment, and they go to you). Jev off: the lead judges them (`lead`: he
   * is woken, the task stays); with the lead off, shell checks passed and
   * the rest is yours.
   */
  const judgeCriteria = async (
    projectId: string,
    task: TaskView,
    criteria: string[],
    item: WorkItemRow
  ): Promise<"done" | "lead" | "you"> => {
    const report = item.digest ?? item.result ?? "";
    const access = placement.access();
    const about = hubActor(`attempt ${short(item.id)} judged`);
    if (access) {
      try {
        const judged = await jevJudged(
          access,
          projectId,
          task,
          criteria,
          report
        );
        const unmet = judged.filter((each) => !each.met);
        if (unmet.length === 0) {
          return "done";
        }
        await tasks.comment(
          projectId,
          task.id,
          `Jev judged the acceptance criteria against attempt ${short(item.id)}'s report. Not shown met:\n\n${unmet
            .map((each) => `- ${each.criterion} (${each.noul.toFixed(2)})`)
            .join("\n")}`,
          about
        );
        return "you";
      } catch (error) {
        if (!(error instanceof JevFailed)) {
          throw error;
        }
        await tasks.comment(
          projectId,
          task.id,
          `${error.message} The acceptance criteria of attempt ${short(item.id)} wait for you.`,
          about
        );
        return "you";
      }
    }
    if (db.project(projectId)?.caw) {
      offLine(
        "judged",
        projectId,
        `${task.id}'s attempt ${short(item.id)} passed its checks; its ${criteria.length} acceptance criteria go to the lead, who did not do the work`
      );
      placement.judgeByLead(
        projectId,
        task,
        item,
        `Judge ${task.id} “${task.title}”: its attempt ${short(item.id)} passed its checks and its work is in, and its acceptance criteria wait for your judgment (Jev is off; you did not do this work). Move the task to its done stage when the report shows every criterion met; else move it back to its todo stage with a task_comment naming what is missing.\n\nCriteria:\n${criteria.map((each) => `- ${each}`).join("\n")}\n\nThe attempt's report:\n\n${tailOf(report, 4000)}`
      );
      return "lead";
    }
    offLine(
      "judged",
      projectId,
      `${task.id}'s attempt ${short(item.id)} passed its shell checks; with the lead off its ${criteria.length} acceptance criteria go to you`
    );
    return "you";
  };

  /**
   * Who an attempt you start from the dashboard reports to: the session
   * named, or the project's Caw, started for it on or off (it is your work);
   * refused when neither can take reports.
   */
  const reporter = async (
    projectId: string,
    parentInstanceId: string | undefined
  ): Promise<InstanceRow> => {
    const project = projectOf(projectId);
    if (!parentInstanceId) {
      return (
        (await leadOf(project, "you")) ??
        refuse(409, `Nobody can take this attempt's report. ${NO_LEAD}`)
      );
    }
    const parent = instance(parentInstanceId);
    const unfit = parentProblem(parent, projectId, parentInstanceId);
    if (unfit || !parent) {
      return refuse(
        parent ? 409 : 404,
        unfit ?? `No session ${parentInstanceId}.`
      );
    }
    return parent;
  };

  /**
   * A work item ended: its task moves, and its project is looked at again.
   * One that is no attempt may still have held files a queued start waits
   * for, so its project is looked at when it has queued starts.
   */
  const itemEnded = (item: WorkItemRow): void => {
    const { projectId } = item;
    if (!projectId) {
      return;
    }
    if (!item.taskId) {
      if (db.queuedTaskStarts(projectId).length > 0) {
        evaluate(projectId);
      }
      return;
    }
    settle(item)
      .catch((error: unknown) =>
        console.warn(
          `[dispatch] ${item.taskId}'s attempt ${item.id} ended ${item.state}, and the task did not move: ${failure(error).message}`
        )
      )
      .finally(() => evaluate(projectId));
  };

  /**
   * A change to a project's tasks: a hook may run, and the frontier may have
   * moved. A move takes back the start its task waited for in the stage it
   * left (a move into a `runs:` stage queues one again).
   */
  const taskChanged = (event: TaskEvent): void => {
    if (event.kind === "moved") {
      db.dropQueuedTaskStart(event.projectId, event.id);
    }
    if (event.kind !== "changed" && event.actor.mover !== "hub") {
      const entered = event.kind === "moved" ? event.to : event.stage;
      hooked({ ...event, to: entered })
        .catch((error: unknown) =>
          console.warn(
            `[dispatch] ${event.id} entered ${entered}: ${failure(error).message}`
          )
        )
        .finally(() => evaluate(event.projectId));
      return;
    }
    evaluate(event.projectId);
  };

  return {
    startAttempt,
    evaluate,
    itemEnded,
    taskChanged,

    /**
     * Retries a task whose last attempt failed or was cancelled: a fresh
     * session in that attempt's workspace when its clone is still there,
     * else in a new one, briefed with the failure and the to-dos as they
     * stand, reporting to `parent`. Not capped: a person asked for it.
     */
    retryAttempt(
      projectId: string,
      ref: string,
      parent: InstanceRow
    ): Promise<AttemptStart> {
      return startAttempt(projectId, ref, parent, undefined, true);
    },

    /** A retry you start from the dashboard: it reports to the session named, or the project's Caw. */
    async retryFor(
      projectId: string,
      ref: string,
      parentInstanceId: string | undefined
    ): Promise<AttemptStart> {
      return startAttempt(
        projectId,
        ref,
        await reporter(projectId, parentInstanceId),
        undefined,
        true,
        "you"
      );
    },

    /**
     * A pull request an attempt opened has merged: its task moves to the
     * first `done` stage, as the hub. This is what a poller of GitHub calls
     * (the PR ingress of P3); a task closed or dropped since stays where it
     * is. Answers where the task is now, or undefined when no attempt this
     * hub knows opened that pull request.
     */
    async pullRequestMerged(
      url: string
    ): Promise<{ projectId: string; stage: string; task: string } | undefined> {
      const item = db.workItemByPrUrl(url);
      const { projectId, taskId } = item ?? {};
      if (!(item && projectId && taskId && db.project(projectId))) {
        return;
      }
      const stages = await tasks.stages(projectId);
      if (stages.problems.length > 0) {
        refuse(
          409,
          `${url} merged, but stages.md does not read, so ${taskId} stays where it is. ${stages.problems.join(" ")}`
        );
      }
      const task = await tasks.get(projectId, taskId);
      const target = stages.stages.find((each) => each.kind === "done");
      if (
        task.kind === "done" ||
        task.kind === "dropped" ||
        !target ||
        target.name === task.stage ||
        // Only an approved action enters a `by: action` stage (§5.2).
        target.hooks.by === "action"
      ) {
        return { projectId, task: taskId, stage: task.stage };
      }
      const moved = await tasks.move(
        projectId,
        taskId,
        target.name,
        hubActor(`pull request merged: ${url}`)
      );
      return { projectId, task: taskId, stage: moved.stage };
    },

    /** Why the hub last could not start an attempt at a task, while the task file is as it was then. */
    problemOf(
      projectId: string,
      task: { hash: string; id: string }
    ): string | null {
      const problem = problems.get(keyOf(projectId, task.id));
      return problem?.hash === task.hash ? problem.message : null;
    },

    /**
     * A machine connected, or its sign-ins changed: every project with a
     * checkout there gets another look, its old start failures forgotten.
     */
    machineOnline(machineId: string): void {
      for (const project of db.listProjects()) {
        if (
          project.places.some(
            (place) =>
              place.kind === "checkout" && place.machineId === machineId
          )
        ) {
          for (const key of problems.keys()) {
            if (key.startsWith(`${project.id}\0`)) {
              problems.delete(key);
            }
          }
          evaluate(project.id);
        }
      }
    },

    /** The project's dispatch settings and what the dispatcher would do now. */
    view(projectId: string): Promise<DispatchView> {
      return viewOf(projectOf(projectId));
    },

    /** Changes a project's dispatch settings, then looks at it again. */
    async configure(
      projectId: string,
      change: DispatchChange
    ): Promise<DispatchView> {
      projectOf(projectId);
      const { maxAttempts, reviewLimit } = change;
      const outOfRange =
        countProblem("maxAttempts", maxAttempts, MAX_ATTEMPTS_LIMIT) ??
        countProblem("reviewLimit", reviewLimit, REVIEW_LIMIT_LIMIT);
      if (outOfRange) {
        refuse(400, outOfRange);
      }
      const unbudgeted = change.budget
        ? budgetProblem(change.budget)
        : undefined;
      if (unbudgeted) {
        refuse(400, unbudgeted);
      }
      // Empty clears it, as null does.
      let runsOn =
        change.runsOn?.trim() ||
        (change.runsOn === undefined ? undefined : null);
      if (runsOn) {
        const checked = runsOnValue(runsOn, db.listAgents());
        runsOn =
          "value" in checked ? checked.value : refuse(400, checked.problem);
      }
      db.setProjectDispatch(projectId, columnsOf({ ...change, runsOn }));
      evaluate(projectId);
      return await viewOf(projectOf(projectId));
    },

    /**
     * An attempt you start from the dashboard: it reports to the session
     * named, or the project's Caw.
     */
    async startFor(
      projectId: string,
      ref: string,
      parentInstanceId: string | undefined
    ): Promise<AttemptStart> {
      return startAttempt(
        projectId,
        ref,
        await reporter(projectId, parentInstanceId),
        undefined,
        false,
        "you"
      );
    },

    /** Starts the safety net: a look at every dispatching project every few minutes. */
    watch(): void {
      if (watching) {
        return;
      }
      watching = true;
      lifetime.every(SAFETY_MS, () => {
        for (const project of db.listProjects()) {
          if (
            (project.dispatch && project.caw) ||
            db.queuedTaskStarts(project.id).length > 0
          ) {
            evaluate(project.id);
          }
        }
      });
    },
  };
};

export type Dispatcher = ReturnType<typeof createDispatcher>;

/** A refusal or failure as the route's answer. */
const answer = (error: unknown) => {
  const { code, message } = failure(error);
  return status(code, message);
};

/**
 * The dashboard's routes for a project's dispatch, and for starting an
 * attempt at a task by hand.
 */
export const dispatchRoutes = (dispatcher: Dispatcher) =>
  new Elysia()
    .get("/api/projects/:id/dispatch", async ({ params }) => {
      try {
        return await dispatcher.view(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    .patch(
      "/api/projects/:id/dispatch",
      {
        body: t.Object({
          budget: t.Optional(t.Nullable(BUDGET)),
          dispatch: t.Optional(t.Boolean()),
          lands: t.Optional(LANDS),
          maxAttempts: t.Optional(t.Integer()),
          reviewLimit: t.Optional(t.Integer()),
          runsOn: t.Optional(t.Nullable(t.String())),
        }),
      },
      async ({ params, body }) => {
        try {
          return await dispatcher.configure(params.id, body);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/attempts",
      {
        body: t.Object({ parentInstanceId: t.Optional(t.String()) }),
      },
      async ({ params, body, request, server }) => {
        // A workspace is cut on a machine; that can take a while.
        server?.timeout(request, 0);
        try {
          return await dispatcher.startFor(
            params.id,
            params.taskId,
            body.parentInstanceId
          );
        } catch (error) {
          return answer(error);
        }
      }
    )
    // A fresh attempt at a task whose last one failed, in that attempt's
    // workspace when its clone is still there.
    .post(
      "/api/projects/:id/tasks/:taskId/retry",
      {
        body: t.Object({ parentInstanceId: t.Optional(t.String()) }),
      },
      async ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        try {
          return await dispatcher.retryFor(
            params.id,
            params.taskId,
            body.parentInstanceId
          );
        } catch (error) {
          return answer(error);
        }
      }
    );
