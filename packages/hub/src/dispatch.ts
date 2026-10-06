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
 *   anyone's move but the hub's, starts an attempt of that type, reporting
 *   to the session that moved it or else the lead. Only `runs` runs here.
 * - **The landing result.** An attempt that ends done (landed, or nothing to
 *   land) moves its task to the first `done` stage; one that fails or is
 *   cancelled sends it back to the first `todo` stage, marked as failed.
 *
 * It wakes on events only: a work item ending, a task changing, a setting
 * changing, a machine with a checkout coming online. A slow timer looks
 * again as a safety net and starts nothing when nothing is ready.
 */
import type { InstanceRow } from "@cawco/core";
import { Elysia, status, t } from "elysia";
import type { DbShape, PlaceRow, ProjectRow, WorkItemRow } from "./db";
import type { WorkItemCheck } from "./db/schema";
import { FolderRefusal, type FolderRefusalStatus } from "./project-folder";
import type { Stage } from "./stages";
import {
  hubActor,
  onFrontier,
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
    | "getInstancesByIds"
    | "listProjects"
    | "project"
    | "projectAttempts"
    | "setProjectDispatch"
  >;
  /** Whether a machine is connected now. */
  readonly online: (machineId: string) => boolean;
  /** Files and spawns a work item (work-items.ts `start`). */
  readonly start: (request: WorkItemRequest) => Promise<WorkItemStart>;
  readonly tasks: Tasks;
}

/** An attempt as it started. */
export interface AttemptStart {
  instanceId: string;
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
  leadInstanceId: string | null;
  /** Why the lead cannot take reports now; null when it can, or there is none. */
  leadProblem: string | null;
  /** Attempts starting or running now. */
  live: number;
  maxAttempts: number;
  /** Why it would start nothing now even with a ready task; null when it would. */
  paused: string | null;
  /** Tasks waiting in `you` stages now. */
  review: number;
  reviewLimit: number;
}

/** A change to a project's dispatch settings; what is left out stays. */
export interface DispatchChange {
  dispatch?: boolean;
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

/** What an attempt at a task without checks is checked by: its work is committed, which landing needs. */
const COMMITTED: WorkItemCheck = {
  name: "Work is committed",
  command: 'test -z "$(git status --porcelain)"',
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

/** The task's checks as a work item's, or the committed check when it names none. */
const checksOf = (commands: string[]): WorkItemCheck[] =>
  commands.length === 0
    ? [COMMITTED]
    : commands.map((command) => ({ name: checkName(command), command }));

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
  checks: WorkItemCheck[]
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
    `## Checks\n\nWhen the work is committed, call finish_item: the hub runs these in your workspace and lands your commits once they pass.\n\n${checks
      .map((check) => `- ${check.name}: \`${check.command}\``)
      .join("\n")}${
      task.checks.length === 0
        ? "\n\nThe task names no checks, so the hub checks only that your work is committed."
        : ""
    }`,
    `## Where it sits\n\n${sits.length > 0 ? sits.join("\n") : "Nothing waits on it, and it waits for nothing."}`,
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
  leadInstanceId,
  maxAttempts,
  reviewLimit,
}: DispatchChange) => ({
  ...(dispatch === undefined ? {} : { dispatch }),
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

  /** Files and spawns the attempt's work item; a failure is remembered on the task. */
  const launch = async (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    active: Stage | undefined
  ): Promise<WorkItemStart> => {
    const place = placeFor(project, parent);
    if (!place) {
      const message = `No checkout of ${project.name} is on a machine that is online, so there is nowhere to cut ${task.id}'s workspace. Bring one of its machines online, or add a checkout place on one that is.`;
      note(project.id, task, message);
      return refuse(409, message);
    }
    const checks = checksOf(task.checks);
    const { tasks: all } = await tasks.list(project.id);
    try {
      const started = await start({
        parentInstanceId: parent.id,
        prompt: briefOf(project, task, all, checks),
        title: titleOf(task),
        type: active?.hooks.runs ?? task.type ?? undefined,
        checks,
        cwd: place.path,
        machineId: place.machineId,
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
    stage?: Stage
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
      const active = await activeFor(projectId, task, stage);
      const started = await launch(project, task, parent, active);
      const now = await moveIn(projectId, task, active, started.item);
      console.log(
        `[dispatch] ${project.name}: ${task.id} attempt ${started.item.id} started, reporting to ${parent.id}`
      );
      return {
        task: task.id,
        stage: now,
        type: started.item.type,
        workItemId: started.item.id,
        workspaceId: started.workspace.id,
        instanceId: started.item.instanceId,
        text: `Started an attempt at ${task.id} (now in ${now || "no stage"}). ${started.text}`,
      };
    } finally {
      starting.delete(key);
    }
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
        leadInstanceId: project.leadInstanceId,
        leadProblem,
        maxAttempts: project.maxAttempts,
        reviewLimit: project.reviewLimit,
        live,
        review,
        paused,
        frontier,
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

  /**
   * Looks at a project again: one look at a time per project, and a request
   * that arrives during one runs once more after it.
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

  /** A task entered an `active` stage that runs a type: start it, reporting to the mover or the lead. */
  const hooked = async (
    event: Extract<TaskEvent, { kind: "moved" }>
  ): Promise<void> => {
    const { projectId, id, to, actor } = event;
    const stages = await tasks.stages(projectId);
    const stage = stages.stages.find((each) => each.name === to);
    if (!(stage?.kind === "active" && stage.hooks.runs)) {
      return;
    }
    const project = projectOf(projectId);
    const mover = actor.instanceId ? instance(actor.instanceId) : undefined;
    const parent =
      mover && !parentProblem(mover, projectId) ? mover : leadOf(project);
    if (!parent) {
      const task = await tasks.get(projectId, id);
      note(
        projectId,
        task,
        `${id} entered ${to}, which runs ${stage.hooks.runs}, but no session can take the attempt's report. Set the project's lead and move it in again, or start it with task_start from a session.`
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

  /** The hub's move of a task after its attempt ended: done to the first done stage, otherwise back to the first todo stage. */
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
    const kind = item.state === "done" ? "done" : "todo";
    const target = stages.stages.find((each) => each.kind === kind);
    if (target && target.name !== task.stage) {
      await tasks.move(
        projectId,
        taskId,
        target.name,
        hubActor(`attempt ${short(item.id)} ${item.state}`)
      );
    }
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

  /** A change to a project's tasks: a hook may run, and the frontier may have moved. */
  const taskChanged = (event: TaskEvent): void => {
    if (event.kind === "moved" && event.actor.mover !== "hub") {
      hooked(event)
        .catch((error: unknown) =>
          console.warn(
            `[dispatch] ${event.id} entered ${event.to}: ${failure(error).message}`
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
      return startAttempt(projectId, ref, parent);
    },

    /** Starts the safety net: a look at every dispatching project every few minutes. */
    watch(): void {
      safety ??= setInterval(() => {
        for (const project of db.listProjects()) {
          if (project.dispatch && project.leadInstanceId) {
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
    );
