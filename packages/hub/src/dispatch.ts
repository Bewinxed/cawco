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
 *   from a session you started makes that session the parent; the project's
 *   lead (a session you started in the project) takes the reports of every
 *   attempt nobody asked for.
 * - **The frontier** (tasks.ts `onFrontier`): tasks in a `todo` stage whose
 *   every `after` task is in a `done` stage, with no live attempt, whose last
 *   attempt did not fail, in rank order. A failed task waits for a person.
 * - **Dispatch** starts the frontier on its own, only for a project with
 *   dispatch on and a lead, up to `max_attempts` live attempts, and not while
 *   `review_limit` tasks or more wait in `you` stages.
 * - **Hooks.** A task entering an `active` stage with `runs: <type>`, by
 *   anyone's move but the hub's, or filed straight into one, starts an
 *   attempt of that type, reporting to the session that moved it or else the
 *   lead. A hook obeys `max_attempts`: at the cap its start is queued
 *   (`queued_task_starts`) and runs, oldest first and before the frontier,
 *   as a slot frees. A start you or a session ask for is not capped. Only
 *   `runs` runs here.
 * - **Landing.** An attempt lands as its task says (`lands:`), else as its
 *   delegate type says, else as the project does: `main`, `branch`, `pr` or
 *   `none` (work-items.ts). Its task's `outputs` are collected into the
 *   project's folder.
 * - **The landing result.** An attempt that ends done (landed, or nothing to
 *   land) moves its task to the first `done` stage, or, when it opened a pull
 *   request, to the first `you` stage (staying put without one) until the
 *   pull request merges ({@link Dispatcher.pullRequestMerged}); one that
 *   fails or is cancelled sends it back to the first `todo` stage, marked as
 *   failed.
 * - **A retry** of a task whose last attempt failed runs a fresh session in
 *   that attempt's workspace when its clone is still there (else a new one),
 *   briefed with the failure and the to-dos as they stand.
 *
 * It wakes on events only: a work item ending, a task changing, a setting
 * changing, a machine with a checkout coming online. A slow timer looks
 * again as a safety net and starts nothing when nothing is ready.
 */
import type { InstanceRow, LandsMode } from "@cawco/core";
import { Elysia, status, t } from "elysia";
import type { DbShape, PlaceRow, ProjectRow, WorkItemRow } from "./db";
import type { WorkItemCheck } from "./db/schema";
import { quote, statusCommand } from "./landing";
import { FolderRefusal, type FolderRefusalStatus } from "./project-folder";
import type { Stage } from "./stages";
import {
  hubActor,
  LANDS,
  onFrontier,
  type TaskActor,
  type TaskEvent,
  type TaskSummary,
  type Tasks,
  type TaskView,
} from "./tasks";
import {
  isLive,
  SESSION_TITLE_MAX,
  WorkItemRefusal,
  type WorkItemRequest,
  type WorkItemStart,
} from "./work-items";

/** What the dispatcher needs of the hub. */
export interface DispatchDeps {
  readonly db: Pick<
    DbShape,
    | "dropQueuedTaskStart"
    | "getInstancesByIds"
    | "listProjects"
    | "project"
    | "projectAttempts"
    | "queuedTaskStarts"
    | "queueTaskStart"
    | "setProjectDispatch"
    | "workItemByPrUrl"
  >;
  /** Whether a machine is connected now. */
  readonly online: (machineId: string) => boolean;
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

/** An attempt as it started. */
export interface AttemptStart {
  instanceId: string;
  /** Where its work lands. */
  lands: LandsMode;
  /** The stage the task is in now. */
  stage: string;
  task: string;
  /** What the starting session reads. */
  text: string;
  /** The delegate type it runs. */
  type: string | null;
  workItemId: string;
  workspaceId: string;
}

/** A project's dispatch: its settings, and what the dispatcher would do now. */
export interface DispatchView {
  /** Whether the hub starts attempts at ready tasks on its own. */
  dispatch: boolean;
  /** The tasks it would start next, in order. */
  frontier: string[];
  /** Where an attempt lands when its task and type say nothing. */
  lands: LandsMode;
  leadInstanceId: string | null;
  /** Why the lead cannot take reports now; null when it can, or there is none. */
  leadProblem: string | null;
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
}

/** A change to a project's dispatch settings; what is left out stays. */
export interface DispatchChange {
  dispatch?: boolean;
  /** Where an attempt lands when its task and type say nothing. */
  lands?: LandsMode;
  /** A session you started in the project; null clears it. */
  leadInstanceId?: string | null;
  maxAttempts?: number;
  reviewLimit?: number;
}

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
const defaultCheck = (lands: LandsMode, outputs: string[]): WorkItemCheck => {
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

/** The task's checks as a work item's, or the default check when it names none. */
const checksOf = (
  commands: string[],
  lands: LandsMode,
  outputs: string[]
): WorkItemCheck[] =>
  commands.length === 0
    ? [defaultCheck(lands, outputs)]
    : commands.map((command) => ({ name: checkName(command), command }));

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
 * from (with their ids), the checks finish_item runs, and where the task
 * sits among its edges.
 */
const briefOf = (
  project: ProjectRow,
  task: TaskView,
  all: TaskSummary[],
  checks: WorkItemCheck[],
  lands: LandsMode,
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
          )}\n\nTick each with todo_write as you finish it, and add the steps you find.`
      : "The task has no open to-dos. Add the steps you find with todo_write as you go.";
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
    ...(retry ? [retrySection(task, retry)] : []),
  ].join("\n\n");
};

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
    leadProblem: string | null;
    live: number;
    review: number;
    stagesProblems: string[];
  }
): string | null => {
  if (!project.dispatch) {
    return "Dispatch is off: attempts start only when a session or you start them.";
  }
  if (!project.leadInstanceId) {
    return "The project has no lead to take the reports of the attempts the hub starts.";
  }
  if (now.leadProblem) {
    return `The lead cannot take reports: ${now.leadProblem}`;
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

/** The columns a settings change writes: only what it names; an empty lead clears it. */
const columnsOf = ({
  dispatch,
  lands,
  leadInstanceId,
  maxAttempts,
  reviewLimit,
}: DispatchChange) => ({
  ...(dispatch === undefined ? {} : { dispatch }),
  ...(lands === undefined ? {} : { lands }),
  ...(leadInstanceId === undefined
    ? {}
    : { leadInstanceId: leadInstanceId || null }),
  ...(maxAttempts === undefined ? {} : { maxAttempts }),
  ...(reviewLimit === undefined ? {} : { reviewLimit }),
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
  db,
  online,
  start,
  tasks,
  typeLands,
}: DispatchDeps) => {
  /** Attempts being started now, by `project\0task`: their work item is not filed yet. */
  const starting = new Set<string>();
  /** Why the hub last could not start an attempt at a task, and the file it read then. */
  const problems = new Map<string, { hash: string; message: string }>();
  /** Projects being looked at now, and the ones to look at again after. */
  const looking = new Set<string>();
  const again = new Set<string>();
  let safety: ReturnType<typeof setInterval> | undefined;

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

  /** The project's lead, when it can take reports now. */
  const leadOf = (project: ProjectRow): InstanceRow | undefined => {
    const lead = project.leadInstanceId
      ? instance(project.leadInstanceId)
      : undefined;
    return lead && !parentProblem(lead, project.id) ? lead : undefined;
  };

  /**
   * Where a new workspace is cut: a checkout of the project on a machine that
   * is online, the starting session's own first, then the primary place.
   */
  const placeFor = (
    project: ProjectRow,
    parent: InstanceRow
  ): PlaceRow | undefined => {
    const checkouts = project.places.filter(
      (place) => place.kind === "checkout" && online(place.machineId)
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
   * Files and spawns the attempt's work item; a failure is remembered on the
   * task. A retry names the attempt before it, whose workspace it runs in
   * again when that clone is still there.
   */
  const launch = async (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    active: Stage | undefined,
    previous?: WorkItemRow
  ): Promise<WorkItemStart> => {
    const place = placeFor(project, parent);
    if (!(place || previous)) {
      const message = `No checkout of ${project.name} is on a machine that is online, so there is nowhere to cut ${task.id}'s workspace. Bring one of its machines online, or add a checkout place on one that is.`;
      note(project.id, task, message);
      return refuse(409, message);
    }
    const type = active?.hooks.runs ?? task.type ?? undefined;
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
    try {
      const started = await start({
        parentInstanceId: parent.id,
        prompt: briefOf(project, task, all, checks, lands, retry),
        title: titleOf(task),
        type,
        checks,
        lands,
        ...(task.outputs.length > 0 ? { outputs: task.outputs } : {}),
        ...(place ? { cwd: place.path, machineId: place.machineId } : {}),
        ...(previous ? { reuse: previous.workspaceId } : {}),
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
    retry = false
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
      const started = await launch(project, task, parent, active, previous);
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
    if (!(previous && task.lastAttemptFailed)) {
      return refuse(
        409,
        previous
          ? `${task.id}'s last attempt is ${previous.state}, not failed; start a new one with task_start.`
          : `${task.id} has no attempt to retry; start one with task_start.`
      );
    }
    return previous;
  };

  /** What the dispatcher would do for a project now. */
  const viewOf = async (
    project: ProjectRow
  ): Promise<{ lead: InstanceRow | undefined; view: DispatchView }> => {
    const lead = project.leadInstanceId
      ? instance(project.leadInstanceId)
      : undefined;
    const leadProblem = project.leadInstanceId
      ? (parentProblem(lead, project.id, project.leadInstanceId) ?? null)
      : null;
    const list = await tasks.list(project.id);
    const live = liveAttempts(project.id).length + startingIn(project.id);
    const review = list.tasks.filter((task) => task.kind === "you").length;
    const frontier = list.tasks.filter(onFrontier).map((task) => task.id);
    const paused = pauseOf(project, {
      leadProblem,
      stagesProblems: list.stagesProblems,
      review,
      live,
    });
    return {
      lead: leadProblem ? undefined : lead,
      view: {
        dispatch: project.dispatch,
        lands: project.lands,
        leadInstanceId: project.leadInstanceId,
        leadProblem,
        maxAttempts: project.maxAttempts,
        reviewLimit: project.reviewLimit,
        live,
        review,
        paused,
        frontier,
        queued: db.queuedTaskStarts(project.id).map((each) => each.taskId),
      },
    };
  };

  /** One look at a project: starts the frontier's first tasks up to the cap, unless paused. */
  const dispatchOnce = async (projectId: string): Promise<void> => {
    const project = db.project(projectId);
    if (!(project?.dispatch && project.leadInstanceId)) {
      return;
    }
    const { lead, view } = await viewOf(project);
    if (view.paused || !lead) {
      return;
    }
    let slots = project.maxAttempts - view.live;
    for (const id of view.frontier) {
      if (slots <= 0) {
        break;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one start at a time keeps the cap exact and the folder's commits in order
        await startAttempt(projectId, id, lead);
        slots -= 1;
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
  const hookParent = (
    project: ProjectRow,
    moverId: string | null | undefined
  ): InstanceRow | undefined => {
    const mover = moverId ? instance(moverId) : undefined;
    return mover && !parentProblem(mover, project.id) ? mover : leadOf(project);
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
      if (liveIn(projectId) >= project.maxAttempts) {
        return;
      }
      db.dropQueuedTaskStart(projectId, queued.taskId);
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one start at a time keeps the cap exact
        const stages = await tasks.stages(projectId);
        const stage = stages.stages.find((each) => each.name === queued.stage);
        const task = await tasks.get(projectId, queued.taskId);
        if (
          !(stage?.kind === "active" && stage.hooks.runs) ||
          task.stage !== stage.name ||
          task.liveAttempt
        ) {
          continue;
        }
        const parent = hookParent(project, queued.parentInstanceId);
        if (!parent) {
          note(
            projectId,
            task,
            `${task.id} waited in ${stage.name}, which runs ${stage.hooks.runs}, for a slot, but no session can take the attempt's report now. Set the project's lead and move it in again, or start it with task_start from a session.`
          );
          continue;
        }
        await startAttempt(projectId, task.id, parent, stage);
      } catch (error) {
        console.warn(
          `[dispatch] ${project.name}: ${queued.taskId}'s queued start did not run: ${failure(error).message}`
        );
      }
    }
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
    (async () => {
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
    })().finally(() => {
      looking.delete(projectId);
      if (again.has(projectId)) {
        evaluate(projectId);
      }
    });
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
    const parent = hookParent(project, actor.instanceId);
    if (!parent) {
      const task = await tasks.get(projectId, id);
      note(
        projectId,
        task,
        `${id} entered ${to}, which runs ${stage.hooks.runs}, but no session can take the attempt's report. Set the project's lead and move it in again, or start it with task_start from a session.`
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
      });
      console.log(
        `[dispatch] ${project.name}: ${id} entered ${to}, which runs ${stage.hooks.runs}; ${counted(live, "attempt is", "attempts are")} live, the cap is ${project.maxAttempts}, so its start waits for a slot.`
      );
      return;
    }
    try {
      await startAttempt(projectId, id, parent, stage);
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
    const kind = kindAfter(item);
    const target = stages.stages.find((each) => each.kind === kind);
    if (target && target.name !== task.stage) {
      await tasks.move(
        projectId,
        taskId,
        target.name,
        hubActor(
          kind === "you"
            ? `attempt ${short(item.id)} opened ${item.prUrl}`
            : `attempt ${short(item.id)} ${item.state}`
        )
      );
    }
  };

  /**
   * Who an attempt you start from the dashboard reports to: the session
   * named, or the project's lead; refused when neither can take reports.
   */
  const reporter = (
    projectId: string,
    parentInstanceId: string | undefined
  ): InstanceRow => {
    const project = projectOf(projectId);
    const id = parentInstanceId ?? project.leadInstanceId;
    if (!id) {
      return refuse(
        409,
        "The project has no lead to take this attempt's report. Set a lead, name a session you started in the project, or start it with task_start from one."
      );
    }
    const parent = instance(id);
    const unfit = parentProblem(parent, projectId, id);
    if (unfit || !parent) {
      return refuse(parent ? 409 : 404, unfit ?? `No session ${id}.`);
    }
    return parent;
  };

  /** A work item ended: its task moves, and its project is looked at again. */
  const itemEnded = (item: WorkItemRow): void => {
    if (!(item.projectId && item.taskId)) {
      return;
    }
    const { projectId } = item;
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

    /** A retry you start from the dashboard: it reports to the session named, or the project's lead. */
    retryFor(
      projectId: string,
      ref: string,
      parentInstanceId: string | undefined
    ): Promise<AttemptStart> {
      return startAttempt(
        projectId,
        ref,
        reporter(projectId, parentInstanceId),
        undefined,
        true
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
        target.name === task.stage
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

    /** A machine connected: every project with a checkout there gets another look, its old start failures forgotten. */
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
    async view(projectId: string): Promise<DispatchView> {
      return (await viewOf(projectOf(projectId))).view;
    },

    /** Changes a project's dispatch settings, then looks at it again. */
    async configure(
      projectId: string,
      change: DispatchChange
    ): Promise<DispatchView> {
      projectOf(projectId);
      const { leadInstanceId, maxAttempts, reviewLimit } = change;
      if (leadInstanceId) {
        const lead = instance(leadInstanceId);
        const unfit = parentProblem(lead, projectId, leadInstanceId);
        if (unfit) {
          refuse(
            lead ? 409 : 404,
            `That session cannot lead the project. ${unfit}`
          );
        }
      }
      const outOfRange =
        countProblem("maxAttempts", maxAttempts, MAX_ATTEMPTS_LIMIT) ??
        countProblem("reviewLimit", reviewLimit, REVIEW_LIMIT_LIMIT);
      if (outOfRange) {
        refuse(400, outOfRange);
      }
      db.setProjectDispatch(projectId, columnsOf(change));
      evaluate(projectId);
      return (await viewOf(projectOf(projectId))).view;
    },

    /**
     * An attempt you start from the dashboard: it reports to the session
     * named, or the project's lead.
     */
    startFor(
      projectId: string,
      ref: string,
      parentInstanceId: string | undefined
    ): Promise<AttemptStart> {
      return startAttempt(
        projectId,
        ref,
        reporter(projectId, parentInstanceId)
      );
    },

    /** Starts the safety net: a look at every dispatching project every few minutes. */
    watch(): void {
      safety ??= setInterval(() => {
        for (const project of db.listProjects()) {
          if (
            (project.dispatch && project.leadInstanceId) ||
            db.queuedTaskStarts(project.id).length > 0
          ) {
            evaluate(project.id);
          }
        }
      }, SAFETY_MS);
      safety.unref?.();
    },

    stop(): void {
      clearInterval(safety);
      safety = undefined;
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
          dispatch: t.Optional(t.Boolean()),
          lands: t.Optional(LANDS),
          leadInstanceId: t.Optional(t.Nullable(t.String())),
          maxAttempts: t.Optional(t.Integer()),
          reviewLimit: t.Optional(t.Integer()),
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
