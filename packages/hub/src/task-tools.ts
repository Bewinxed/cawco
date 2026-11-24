/**
 * The task tools on the `cawco` MCP server (§5.3: one server, a toolset per
 * role; new tools named group first). Every session reads its project's
 * tasks and writes to-dos; filing and changing tasks belongs to the roles
 * that have those tools (roles.ts: a session you started and the project's
 * Caw file and change them, a delegate that orchestrates changes them), and
 * a leaf proposes them through handoff. A session's project is its instance row's
 * `projectId`, written as it starts (server.ts `projectOfStart`): the
 * project its start names, else its parent's, else the one holding its
 * folder; a delegate's start names its parent's, and `start_session` names
 * the one holding the folder it starts in. `task_start` starts an attempt
 * at a task (dispatch.ts) that reports to the session calling it, as
 * `delegate` with a `task` does; `task_retry` starts a fresh one in the
 * failed attempt's workspace.
 * `todo_write` also writes the calling session's own plan (plans.ts): the
 * tasks and to-dos of its project it works on, each step naming one.
 *
 * A routine (§5.5) is a task with a trigger: `task_create` with `on` or
 * `target` makes one (routines.ts `createdFor`), in the caller's project or,
 * outside any, the Fleet project; `task_update` changes its trigger, pauses
 * or resumes it (`enabled`); `task_start` runs it once now; `task_result`
 * on a run answers keep, stop or ask (`routine`), a conversation's naming
 * its `run`. The role that makes no routines is refused a trigger.
 */
import {
  type AttemptResult,
  RESULT_ARTIFACT_KINDS,
  type ResultArtifact,
  type ResultArtifactKind,
} from "@cawco/core/deliverables";
import { SESSION_CHOSEN_MODES } from "@cawco/core/harness/modes";
import { LANDS_MODES } from "@cawco/core/injected";
import {
  PLAN_STEP_PRIORITIES,
  PLAN_STEP_STATUSES,
  stepHandle,
} from "@cawco/core/plan";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  MADE_ROUTINE_TARGETS,
  ROUTINE_VERDICTS,
  type RoutineVerdict,
} from "@cawco/core/routine-kinds";
import type { AttemptStart } from "@cawco/core/task-views";
import { withoutUndefined } from "@cawco/core/without-undefined";
import { routineToolWords } from "@cawco/core/words/routines";
import { ElysiaStatus, problem } from "elysia";
import { z } from "zod";
import type { Artifacts } from "./artifacts/service";
import { BUILD_TITLE, type DesignOffers } from "./design-offers";
import type { Dispatcher } from "./dispatch";
import type { JevTasks } from "./jev-tasks";
import { tool } from "./mcp-tool";
import type { PlanChangeCalls } from "./plan-change-calls";
import type { WrittenStep } from "./plans";
import {
  attemptStartWords,
  type LinkScope,
  type TaskAnswer,
  taskArchivedWords,
  taskChangedWords,
  taskCommentedWords,
  taskCreatedWords,
  taskLinkedWords,
  taskReadWords,
  taskResultWords,
  todoWrittenWords,
} from "./presenters/tasks";
import type { RoutineInput, RoutinePatch, Routines } from "./routines";
import { appleSuggestion } from "./runs-on";
import { normaliseTaskRef } from "./task-file";
import { TASK_TOOL_NAMES } from "./task-tool-names";
import { sessionActor, type Tasks, type TaskView } from "./tasks";

export type TaskTool = (typeof TASK_TOOL_NAMES)[number];
export const TASK_TOOLS: ReadonlySet<string> = new Set(TASK_TOOL_NAMES);

/** `named` of the artifacts, asked for the calling session. */
type SessionArtifactNamed = (asked: string) => ReturnType<Artifacts["named"]>;

export interface TaskToolContext {
  actor: InstanceRow;
  /** It changes tasks (roles.ts `changesAnyTask`): its todo_write and task_comment name any task, not only its own work item's. */
  anyTask: boolean;
  /**
   * The whole id of the artifact the actor names by its name, handle or
   * id (artifacts/service.ts `named`), or its refusal.
   */
  artifactNamed?: SessionArtifactNamed;
  /** The call's tool_use id, when its harness names it: a routine it makes reads its why off the call's frame. */
  callId?: string;
  /**
   * Files "Build the design system" in the hub's words (design-offers.ts
   * `fileBuild`): a `task_create` with that title gives only its stage.
   */
  designBuild?: DesignOffers["fileBuild"];
  /**
   * Duplicates (§5.9) for a task this session just filed (jev-tasks.ts
   * `filed`): Jev's verdict, or the candidates the session compares.
   */
  duplicates?: (
    projectId: string,
    task: TaskView
  ) => ReturnType<JevTasks["filed"]>;
  /**
   * Where a task this session files was found, as the hub reads it (tasks.ts
   * `found_in`): its work item's task, else the pin thread its ask came
   * from; null when neither.
   */
  foundIn?: string | null;
  /** Whether the caller may give a task a trigger (roles.ts `makesRoutines`). */
  makesRoutines?: boolean;
  /** The project's own `runs_on` (dispatch settings): a task filed under one is not told to set its own. */
  projectRunsOn?: (projectId: string) => string | null;
  /**
   * The project the caller's records live in (records-project.ts
   * `recordsProjectOf`): where `task_create` files and its plan's steps are
   * read, the Fleet project for a session in none.
   */
  recordsProject: string;
  /** Retries a task whose last attempt failed, reporting to `parent` (dispatch.ts); without it task_retry refuses. */
  retryAttempt?: (
    projectId: string,
    ref: string,
    parent: InstanceRow
  ) => ReturnType<Dispatcher["retryAttempt"]>;
  /** The routines (routines.ts): a task with a trigger is made, changed, run and answered there. */
  routines?: Pick<
    Routines,
    "answer" | "byRun" | "byTask" | "createdFor" | "runNow" | "updatedFor"
  >;
  /** Starts an attempt at a task, reporting to `parent` (dispatch.ts); without it task_start refuses. */
  startAttempt?: (
    projectId: string,
    ref: string,
    parent: InstanceRow
  ) => ReturnType<Dispatcher["startAttempt"]>;
  /** A plan step's wait as this session writes it, read as a task's wait is (task-waits.ts `readWait`) and kept as a file keeps it. */
  stepWait?: (written: string) => ReturnType<Tasks["keptWait"]>;
  tasks: Tasks;
  /** The task the session's work item is an attempt at, if it has one. */
  workItemTask: string | null;
  /**
   * Replaces the calling session's steps (plan-changes.ts `written`),
   * answering what it is owed of the person's changes; without it the
   * session scope refuses.
   */
  writePlan?: PlanChangeCalls["written"];
}

/**
 * One artifact as `task_result` takes it, read as the kind it names: a file
 * or a post its `path`, a link its `url`, a page artifact its `artifactId`;
 * refused when it names none.
 */
const resultArtifact = (
  written: {
    kind: ResultArtifactKind;
    path?: string;
    url?: string;
    artifactId?: string;
    name?: string;
    primary?: boolean;
  },
  artifactNamed: SessionArtifactNamed
) => {
  const shown = {
    ...(written.name ? { name: written.name } : {}),
    ...(written.primary ? { primary: true } : {}),
  };
  const need = (value: string | undefined, field: string) =>
    value?.trim()
      ? value.trim()
      : problem(400, {
          code: "task-result-artifact-unnamed",
          detail: `A ${written.kind} artifact names its ${field}.`,
        });
  if (written.kind === "link") {
    const url = need(written.url, "url");
    if (url instanceof ElysiaStatus) {
      return url;
    }
    const link: ResultArtifact = { kind: "link", url, ...shown };
    return link;
  }
  if (written.kind === "artifact") {
    const named = need(written.artifactId, "artifactId");
    if (named instanceof ElysiaStatus) {
      return named;
    }
    const artifactId = artifactNamed(named);
    if (artifactId instanceof ElysiaStatus) {
      return artifactId;
    }
    const page: ResultArtifact = { kind: "artifact", artifactId, ...shown };
    return page;
  }
  const path = need(written.path, "path");
  if (path instanceof ElysiaStatus) {
    return path;
  }
  const file: ResultArtifact = { kind: written.kind, path, ...shown };
  return file;
};

/** A result's artifacts as `task_result` takes them ({@link resultArtifact}); the first refusal when one names nothing. */
const resultArtifacts = (
  written: Parameters<typeof resultArtifact>[0][],
  artifactNamed: SessionArtifactNamed
) => {
  const artifacts: ResultArtifact[] = [];
  for (const one of written) {
    const artifact = resultArtifact(one, artifactNamed);
    if (artifact instanceof ElysiaStatus) {
      return artifact;
    }
    artifacts.push(artifact);
  }
  return artifacts;
};

const taskRef = () =>
  z
    .string()
    .trim()
    .min(1)
    .describe(
      "A task id, like tsk-12: what ends its link, cawco:task/<project>/tsk-12."
    );

/** Whether a task's answer names other tasks: its links, or a to-do promoted to one. */
const namesTasks = (task: TaskView): boolean =>
  task.waits.some((wait) => wait.via !== null) ||
  task.unblocks.length > 0 ||
  task.partOf !== null ||
  task.foundIn !== null ||
  task.duplicateOf !== null ||
  task.heldBy !== null ||
  task.todos.some((todo) => todo.promoted);

/** What a wait names, as every task tool takes it: the one grammar task-waits.ts reads. */
const WAIT_TARGETS =
  "tsk-12 (a routine only with a stop condition: it settles once stopped), a card <page>#<card> (any pick settles it; <page>#<card>=<option> only that pick), a pin <page>/<number>, a GitHub PR or Actions run URL, a session handle (cockpit#5a167bde), or an ISO date (UTC without offset)";

/** A routine's lines (§5.5), as task_create and task_update take them: `on` or `target` makes a task one. */
const ROUTINE_SHAPE = {
  on: z
    .object({
      cron: z.string().describe("Five cron fields, like '0 9 * * 1-5'."),
      zone: z.string().describe("An IANA zone, like Europe/London."),
    })
    .optional()
    .describe(
      "Makes it a routine that starts on this schedule, its first run at once as a test; say why in your reply first, since the owner is told with what you said."
    ),
  target: z
    .enum(MADE_ROUTINE_TARGETS)
    .optional()
    .describe(
      "A routine's runs: delegate (default) or orchestrator, briefed from this task; conversation, a message to Caw. A check gates any of them."
    ),
  stop: z
    .string()
    .optional()
    .describe(
      "When the routine may stop, in words: each run answers keep, stop or ask (task_result routine). Tasks wait on a routine only with one."
    ),
  deadline: z
    .string()
    .optional()
    .describe("ISO date: past it with no stop, it needs the owner."),
  daily_cap_usd: z.number().positive().optional(),
  mode: z
    .enum(SESSION_CHOSEN_MODES)
    .optional()
    .describe("A conversation run's start mode."),
  keep: z
    .boolean()
    .optional()
    .describe("Past 7 days, only on the owner's word."),
  check: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Gates the routine: one shell line run before each run on every check_on machine, as the agent's user, unsandboxed, no model. Empty stdout, or a last line {\"wakeAgent\": false}, is quiet: no run. Other stdout is the run's input. Non-zero exit fails it. It keeps its own state. null removes it."
    ),
  check_on: z
    .array(z.string())
    .optional()
    .describe("The check's machines, by hostname or id."),
};

/** A routine's deadline as a tool writes it; refused when it does not read. */
const deadlineOf = (written: string | undefined) => {
  if (written === undefined) {
    return;
  }
  const at = new Date(written.trim());
  return Number.isNaN(at.getTime())
    ? problem(400, {
        code: "routine-deadline-unfit",
        detail: `deadline “${written}” is not a date: write an ISO 8601 date or date-time, like 2026-12-01.`,
      })
    : at;
};

/** An artifact named where no session can resolve it (discovery): as given. */
const same = (asked: string): string => asked;

/** A step as `todo_write` takes it: the task or to-do it names, its status, its depth optional. */
const stepParameter = () =>
  z.object({
    task: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Its task (tsk-12); a to-do's defaults to your work item's."),
    todo: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("A to-do of it (td-3): completing the step ticks it."),
    status: z.enum(PLAN_STEP_STATUSES),
    depth: z.number().int().min(0).optional(),
    priority: z.enum(PLAN_STEP_PRIORITIES).optional(),
    waitsOn: z
      .string()
      .optional()
      .describe(`What it waits on: ${WAIT_TARGETS}; '' for none.`),
  });

/** The refusal of a step that names no task or to-do. */
const namesNothing = (index: number) =>
  problem(400, {
    code: "todo-step-names-nothing",
    detail: `Step ${index + 1} names no task or to-do. A plan's steps are the tasks and to-dos you work on: file the task (task_create), or the to-do on its task (todo_write with task and add), first, then name it here.`,
  });

/**
 * The record a written step names, by handle (core `stepHandle`): its task,
 * else `own`, the work item's, for a to-do alone; the refusal of a step
 * that names no task, or a task by no task's id.
 */
const handleOf = (
  step: Pick<z.infer<ReturnType<typeof stepParameter>>, "task" | "todo">,
  index: number,
  own: string | null
) => {
  const given = step.task ?? (step.todo ? own : null);
  if (!given) {
    return namesNothing(index);
  }
  const task = normaliseTaskRef(given);
  if (!task) {
    return problem(400, {
      code: "todo-step-task-unread",
      detail: `Step ${index + 1} names “${given}”, which is no task: name it as tsk-12.`,
    });
  }
  return stepHandle({ task, ...(step.todo ? { todo: step.todo } : {}) });
};

/**
 * Steps as written, nested by depth: each one at most one deeper than the
 * one before, each naming a task or a to-do (a to-do alone is of `own`, the
 * work item's task); the refusal of a step that names neither, of a wait
 * that names nothing, of a step too deep, or of a record two steps name (a
 * plan's step is found by its record: db `session_plan_steps`, unique in
 * its plan). Whether each record is on the board is plans.ts `write`'s.
 */
const stepsOf = async (
  written: z.infer<ReturnType<typeof stepParameter>>[],
  stepWait: (written: string) => ReturnType<Tasks["keptWait"]>,
  own: string | null
) => {
  const read = await Promise.all(
    written.map((step) =>
      step.waitsOn?.trim() ? stepWait(step.waitsOn) : undefined
    )
  );
  const waits: (string | undefined)[] = [];
  for (const wait of read) {
    if (wait instanceof ElysiaStatus) {
      return wait;
    }
    waits.push(wait);
  }
  const steps: WrittenStep[] = [];
  for (const [index, step] of written.entries()) {
    const depth = step.depth ?? 0;
    const id = handleOf(step, index, own);
    if (id instanceof ElysiaStatus) {
      return id;
    }
    const last = steps.at(-1)?.depth ?? -1;
    if (depth > last + 1) {
      return problem(400, {
        code: "todo-step-too-deep",
        detail: `Step ${index + 1} (${id}) is at depth ${depth}, deeper than one past the step before it.`,
      });
    }
    const before = steps.findIndex((one) => one.id === id);
    if (before !== -1) {
      return problem(400, {
        code: "todo-step-id-twice",
        detail: `Step ${index + 1} names ${id}, as step ${before + 1} does: a plan names each task or to-do once.`,
      });
    }
    steps.push({
      id,
      status: step.status,
      depth,
      ...(step.priority ? { priority: step.priority } : {}),
      ...(waits[index] ? { waitsOn: waits[index] } : {}),
    });
  }
  return steps;
};

/** What a work item may spend before the hub stops it: `delegate`'s and the task tools' one shape. */
export const budgetParameter = (
  description = "At a limit the hub stops the work and fails it, naming the limit. Unset: the task's, then the project's."
) =>
  z
    .object({
      usd: z.number().positive().optional(),
      turns: z.number().int().min(1).optional(),
      minutes: z.number().int().min(1).optional(),
    })
    .describe(description);

/** Globs of the repository's files a work item owns: `delegate`'s and the task tools' one shape. */
export const ownsParameter = () =>
  z
    .array(z.string())
    .describe(
      "Globs from the repository's root, like ['src/theme/**']: two live items whose globs overlap in one repository never run at once; the later waits."
    );

/** A group of work items under one parent: `delegate`'s and the task tools' one shape. */
export const groupParameter = () =>
  z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe(
      "Items in one group under one parent report once, together, when all have ended; a failure reports at once."
    );

/** What `task_create` takes. */
const TASK_CREATE_INPUT = z.object({
  title: z.string(),
  description: z.string().optional(),
  type: z.string().optional(),
  lands: z.enum(LANDS_MODES).optional(),
  budget: budgetParameter().optional(),
  stage: z.string().optional(),
  ...ROUTINE_SHAPE,
});

/** What `task_update` takes of a routine. */
const TASK_UPDATE_INPUT = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.string().nullable().optional(),
  lands: z.enum(LANDS_MODES).nullable().optional(),
  budget: budgetParameter().nullable().optional(),
  enabled: z.boolean().optional(),
  ...ROUTINE_SHAPE,
});

/** Why a `task_update` of `id`, a task that is no routine and that the call makes none, cannot set a routine's line; undefined when it sets none. */
const notRoutine = (
  id: string,
  input: Pick<
    z.infer<typeof TASK_UPDATE_INPUT>,
    "check" | "check_on" | "enabled"
  >
) => {
  if (input.check !== undefined || input.check_on !== undefined) {
    return problem(400, {
      code: "task-not-routine",
      detail: `${id} is no routine: a check gates a routine's runs, so give on or target with it.`,
    });
  }
  return input.enabled === undefined
    ? undefined
    : problem(400, {
        code: "task-not-routine",
        detail: `${id} is no routine: enabled pauses or resumes one.`,
      });
};

/** A `task_create` call with a trigger as the routine it makes; its deadline's refusal. */
const routineCreated = (input: z.infer<typeof TASK_CREATE_INPUT>) => {
  const deadline = deadlineOf(input.deadline);
  if (deadline instanceof ElysiaStatus) {
    return deadline;
  }
  const made: Omit<RoutineInput, "projectId"> = {
    title: input.title,
    description: input.description ?? "",
    target: input.target ?? "delegate",
    on: input.on ?? null,
    stop: input.stop ?? null,
    deadline: deadline ?? null,
    dailyCapUsd: input.daily_cap_usd ?? null,
    mode: input.mode ?? null,
    keep: input.keep ?? false,
    check: input.check ?? null,
    checkOn: input.check_on ?? null,
    type: input.type ?? null,
    ...(input.lands ? { lands: input.lands } : {}),
    budget: input.budget ?? null,
  };
  return made;
};

/** A `task_update` call as a change of its routine; its deadline's refusal. */
const routinePatched = (
  input: Omit<z.infer<typeof TASK_UPDATE_INPUT>, "id">
) => {
  const deadline = deadlineOf(input.deadline);
  if (deadline instanceof ElysiaStatus) {
    return deadline;
  }
  const patch: RoutinePatch = {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.lands === undefined ? {} : { lands: input.lands }),
    ...(input.budget === undefined ? {} : { budget: input.budget }),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    ...(input.on === undefined ? {} : { on: input.on }),
    ...(input.target === undefined ? {} : { target: input.target }),
    ...(input.stop === undefined ? {} : { stop: input.stop }),
    ...(deadline === undefined ? {} : { deadline }),
    ...(input.daily_cap_usd === undefined
      ? {}
      : { dailyCapUsd: input.daily_cap_usd }),
    ...(input.mode === undefined ? {} : { mode: input.mode }),
    ...(input.keep === undefined ? {} : { keep: input.keep }),
    ...(input.check === undefined ? {} : { check: input.check }),
    ...(input.check_on === undefined ? {} : { checkOn: input.check_on }),
  };
  return patch;
};

/** An approved `task_create` or `task_update` ask's input, read again; why it does not read. */
export const approvedRoutineCall = {
  create: (input: Record<string, unknown>) => {
    const parsed = TASK_CREATE_INPUT.safeParse(input);
    return parsed.success ? routineCreated(parsed.data) : parsed.error.message;
  },
  update: (input: Record<string, unknown>) => {
    const parsed = TASK_UPDATE_INPUT.safeParse(input);
    if (!parsed.success) {
      return parsed.error.message;
    }
    const { id, ...change } = parsed.data;
    const patch = routinePatched(change);
    return patch instanceof ElysiaStatus ? patch : { id, patch };
  },
};

/** Whether a call writes a routine's lines: `on` or `target` makes a task one; the rest change one. */
const routineAsked = (input: Record<string, unknown>): boolean =>
  Object.keys(ROUTINE_SHAPE).some((key) => input[key] !== undefined);
const landsParameter = () =>
  z
    .enum(LANDS_MODES)
    .describe(
      "main, branch (cawco/<task>), pr (and a pull request) or none (outputs are the deliverable). Default: the project's."
    );
const runsOnParameter = () =>
  z.string().trim().min(1).describe("apple, linux or a hostname.");
const lines = (what?: string) =>
  what === undefined
    ? z.array(z.string()).optional()
    : z.array(z.string()).optional().describe(what);
/** The external items a task links, by URL: task_create's and task_update's one shape. */
const linksParameter = () => lines();
/** The project's own fields a task file carries beyond its known ones: task_create's and task_update's one shape. */
const fieldsParameter = () =>
  z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .describe("Like {priority: 'high'}; '' or [] takes one out.");

/** What `task_create` takes: a task, or with `on` or `target` a routine. */
const TASK_CREATE_SHAPE = {
  title: z.string().describe("Verb first."),
  description: z.string().optional(),
  acceptance: z
    .string()
    .optional()
    .describe("What must be true when done, a markdown list."),
  todos: lines("Top-level to-dos."),
  stage: z.string().optional(),
  type: z.string().optional().describe("The delegate type to run it."),
  waits_on: z
    .array(z.string())
    .optional()
    .describe(`What holds it until every one settles: ${WAIT_TARGETS}.`),
  part_of: taskRef()
    .optional()
    .describe("The whole it is a part of: it inherits every wait of it."),
  checks: lines(
    "Commands whose output proves the work; `host: <command>` needs the host."
  ),
  outputs: lines("Files it makes that are not commits."),
  context: lines("knowledge/ files for its brief."),
  lands: landsParameter().optional(),
  runs_on: runsOnParameter().optional(),
  group: groupParameter().optional(),
  owns: ownsParameter().optional(),
  budget: budgetParameter().optional(),
  labels: lines(),
  links: linksParameter(),
  fields: fieldsParameter(),
  ...ROUTINE_SHAPE,
};

/**
 * The task tools, bound to the calling session; with no context, the same
 * definitions for discovery, whose handlers refuse.
 */
export function taskTools(context: TaskToolContext | undefined) {
  /**
   * The calling session's project, its tasks and how it acts on them;
   * refused in discovery, and for a session in no project unless `filing`.
   */
  const scope = (
    /**
     * task_create's and todo_write's: they file and plan where the session's
     * records live, the Fleet project for one in none (§5.1).
     */
    filing = false
  ) => {
    if (!context) {
      return problem(409, {
        code: "task-tools-discovery",
        detail: "Discovery cannot execute tools",
      });
    }
    const projectId = filing ? context.recordsProject : context.actor.projectId;
    if (!projectId) {
      return problem(409, {
        code: "task-session-no-project",
        detail:
          "This session belongs to no project, so it has no tasks. Start the session in one of a project's places.",
      });
    }
    return {
      projectId,
      tasks: context.tasks,
      actor: sessionActor(context.actor),
    };
  };

  /** The calling session's project and id: the links its answers carry (presenters/tasks.ts); none in discovery. */
  const linkScope = (): LinkScope => ({
    project: context?.recordsProject ?? null,
    session: context?.actor.id ?? null,
  });

  /**
   * A task's concise answer with the titles of the tasks it names, so each
   * reads as its link; the detailed one is the record alone.
   */
  const titled = async <T extends TaskView>(
    projectId: string,
    task: T,
    format: "concise" | "detailed",
    namesOthers = false
  ) => {
    const plain: T & Pick<TaskAnswer, "titles"> = task;
    if (
      format === "detailed" ||
      !context ||
      !(namesOthers || namesTasks(task))
    ) {
      return plain;
    }
    const board = await context.tasks.list(projectId, {});
    if (board instanceof ElysiaStatus) {
      return board;
    }
    return {
      ...task,
      titles: Object.fromEntries(board.tasks.map((one) => [one.id, one.title])),
    };
  };

  /** The task todo_write or task_comment may change: the work item's own, or any one a session that changes tasks names. */
  const ownTask = (
    name: "todo_write" | "task_comment",
    asked: string | undefined
  ) => {
    const own = context?.workItemTask ?? null;
    if (context?.anyTask) {
      const named = asked ?? own;
      return named
        ? named
        : problem(400, {
            code: "task-tool-unnamed",
            detail: `Name the task: ${name}({ task: "tsk-12", … }).`,
          });
    }
    if (!own) {
      return problem(409, {
        code: "task-tool-no-own-task",
        detail: `${name} works on your work item's task, and your work item has none. Say what you did in finish_item instead.`,
      });
    }
    return asked !== undefined && normaliseTaskRef(asked) !== own
      ? problem(403, {
          code: "task-tool-not-own",
          detail: `You can use ${name} only on ${own}, your work item's task.`,
        })
      : own;
  };

  /** todo_write's session scope: the session's steps, each naming a task or a to-do (each wait read as a task's is), written. */
  const ownPlan = async (
    steps: z.infer<ReturnType<typeof stepParameter>>[]
  ) => {
    if (!context?.writePlan) {
      return problem(409, {
        code: "task-tools-discovery",
        detail: "Discovery cannot execute tools",
      });
    }
    const written = await stepsOf(
      steps,
      context.stepWait ?? ((step) => Promise.resolve(step)),
      context.workItemTask
    );
    if (written instanceof ElysiaStatus) {
      return written;
    }
    return await context.writePlan(context.actor, written);
  };

  /**
   * `task_create` with a trigger: a routine, in the caller's project or the
   * Fleet project outside any; refused to the role that makes none.
   */
  const routineMade = async (
    input: z.infer<typeof TASK_CREATE_INPUT> & Record<string, unknown>,
    format: "concise" | "detailed"
  ) => {
    if (!(context?.routines && context.makesRoutines)) {
      return problem(403, {
        code: "task-trigger-not-yours",
        detail: context
          ? "Your role makes no routines: hand the routine to the session that started you, which can."
          : "Discovery cannot execute tools",
      });
    }
    const made = routineCreated(input);
    if (made instanceof ElysiaStatus) {
      return made;
    }
    const done = await context.routines.createdFor(context.actor, made, {
      approve: { ...input },
      ...(context.callId ? { callId: context.callId } : {}),
    });
    if (typeof done === "string" || done instanceof ElysiaStatus) {
      return done;
    }
    const projectId = context.recordsProject;
    const task = await context.tasks.get(projectId, done.task.id);
    return task instanceof ElysiaStatus
      ? task
      : await titled(projectId, task, format);
  };

  /**
   * `task_update` of a task's routine lines or its `enabled`: the routine
   * changed (routines.ts `updatedFor`), its task read back, or the words a
   * session reads while the owner approves its command; undefined for a
   * task that is no routine and a call that makes it none.
   */
  const routineChanged = async (
    projectId: string,
    input: z.infer<typeof TASK_UPDATE_INPUT> & Record<string, unknown>
  ) => {
    const id = normaliseTaskRef(input.id) ?? input.id;
    const routine = context?.routines?.byTask(projectId, id);
    if (!(context?.routines && routine?.target)) {
      if (input.on === undefined && input.target === undefined) {
        return notRoutine(id, input);
      }
      if (!context?.makesRoutines) {
        return problem(403, {
          code: "task-trigger-not-yours",
          detail:
            "Your role makes no routines: hand the routine to the session that started you, which can.",
        });
      }
      // A plain task given a trigger: its lines written, the index makes it one.
      return;
    }
    const { id: _id, ...change } = input;
    const patch = routinePatched(change);
    if (patch instanceof ElysiaStatus) {
      return patch;
    }
    const done = await context.routines.updatedFor(
      context.actor,
      routine.id,
      patch,
      { ...input }
    );
    if (typeof done === "string" || done instanceof ElysiaStatus) {
      return done;
    }
    return await context.tasks.get(projectId, id);
  };

  /** `task_create` of a plain task: in the caller's project, or the Fleet project outside any. */
  const taskCreated = async (
    input: z.infer<z.ZodObject<typeof TASK_CREATE_SHAPE>>,
    format: "concise" | "detailed"
  ) => {
    const {
      waits_on,
      part_of,
      runs_on,
      on: _on,
      target: _target,
      stop: _stop,
      deadline: _deadline,
      daily_cap_usd: _cap,
      mode: _mode,
      keep: _keep,
      check: _check,
      check_on: _checkOn,
      ...draft
    } = input;
    const scoped = scope(true);
    if (scoped instanceof ElysiaStatus) {
      return scoped;
    }
    const { projectId, tasks, actor } = scoped;
    // The design system's build carries the hub's words, never the filer's.
    if (draft.title.trim() === BUILD_TITLE && context?.designBuild) {
      return await context.designBuild(projectId, actor, draft.stage);
    }
    const task = await tasks.create(
      projectId,
      {
        ...draft,
        waitsOn: waits_on,
        partOf: part_of,
        ...(context?.foundIn ? { foundIn: context.foundIn } : {}),
        runsOn: runs_on,
      },
      actor
    );
    if (task instanceof ElysiaStatus) {
      return task;
    }
    const duplicates = await context?.duplicates?.(projectId, task);
    // Suggested, never set: the session decides.
    const suggest =
      task.runsOn || context?.projectRunsOn?.(projectId)
        ? undefined
        : appleSuggestion([
            task.title,
            task.description,
            task.acceptance,
            ...task.checks,
          ]);
    // A verdict names the task it duplicates.
    const named =
      duplicates !== undefined &&
      "duplicateOf" in duplicates &&
      duplicates.duplicateOf !== null;
    const answer = await titled(projectId, task, format, named);
    if (answer instanceof ElysiaStatus) {
      return answer;
    }
    return {
      ...answer,
      ...(duplicates ? { duplicates } : {}),
      ...(suggest ? { suggest } : {}),
    };
  };

  /**
   * `task_result` on a routine's run, answered by its trigger engine
   * (routines.ts `answer`): a conversation's names its run; a delegate's is
   * its work item's. Undefined for an attempt's hand-in.
   */
  const runAnswered = (
    summary: string,
    run: string | undefined,
    verdict: RoutineVerdict | undefined
  ) => {
    const routines = context?.routines;
    const { workItemId } = context?.actor ?? {};
    const answering =
      run !== undefined ||
      verdict !== undefined ||
      (workItemId && routines?.byRun(workItemId));
    if (!(routines && context && answering)) {
      return;
    }
    const said = routines.answer(context.actor, {
      summary,
      ...withoutUndefined({ run, verdict }),
    });
    return said instanceof ElysiaStatus
      ? said
      : routineToolWords.answered(said.id, verdict ?? "keep");
  };

  /** `task_update` of a routine's lines or its `enabled`, answered; undefined for a call that changes no routine. */
  const routineUpdated = async (
    projectId: string,
    input: Parameters<typeof routineChanged>[1],
    format: "concise" | "detailed"
  ) => {
    if (!(routineAsked(input) || input.enabled !== undefined)) {
      return;
    }
    const changed = await routineChanged(projectId, input);
    if (changed === undefined) {
      return;
    }
    return changed instanceof ElysiaStatus || typeof changed === "string"
      ? changed
      : await titled(projectId, changed, format);
  };

  return [
    tool(
      "task_read",
      "Your project's tasks: its stages and a line per task, or one task whole. Use it to find a task, or to read one before you change or start it.",
      {
        id: taskRef()
          .optional()
          .describe(
            "One task whole, its Waits on and Unblocks lines included; without it, the list, filtered by the other parameters."
          ),
        history: z.boolean().optional().describe("With id: adds its changes."),
        stage: z.string().optional().describe("Only tasks in this stage."),
        q: z
          .string()
          .optional()
          .describe("Words to find in its id, title or description."),
        label: z.string().optional().describe("A label it carries."),
        type: z.string().optional().describe("Its delegate type."),
        part_of: z.string().optional().describe("The whole: lists its parts."),
        link: z.string().optional().describe("A URL or #12."),
        fields: z
          .record(z.string(), z.string())
          .optional()
          .describe("The project's own fields, each to equal the value."),
        blocked: z
          .boolean()
          .optional()
          .describe("true: a wait unsettled; false: none."),
        needsYou: z
          .boolean()
          .optional()
          .describe("true: only those that need the person; false: the rest."),
        archived: z
          .boolean()
          .optional()
          .describe("true: the archived ones, instead of the board's."),
      },
      async ({ id, history, part_of, ...rest }, format) => {
        const filter = { ...rest, partOf: part_of };
        const scoped = scope();
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId, tasks } = scoped;
        if (id) {
          const read = await tasks.get(projectId, id);
          if (read instanceof ElysiaStatus) {
            return read;
          }
          const task = await titled(projectId, read, format);
          if (task instanceof ElysiaStatus || !history) {
            return task;
          }
          const changes = await tasks.history(projectId, id);
          return changes instanceof ElysiaStatus
            ? changes
            : { ...task, history: changes.events };
        }
        if (history) {
          return problem(400, {
            code: "task-history-unnamed",
            detail:
              'Name the task whose history you want: task_read({ id: "tsk-12", history: true }).',
          });
        }
        const [list, stages] = await Promise.all([
          tasks.list(projectId, filter),
          tasks.stages(projectId),
        ]);
        if (list instanceof ElysiaStatus) {
          return list;
        }
        return stages instanceof ElysiaStatus ? stages : { list, stages };
      },
      (said) => taskReadWords(said, linkScope())
    ),
    tool(
      "task_create",
      "Tasks filed on your project's board: work that must outlive this conversation or run without you. Use it for follow-up work you find, or work to run later or elsewhere.",
      TASK_CREATE_SHAPE,
      async (input, format) =>
        routineAsked(input)
          ? await routineMade(input, format)
          : await taskCreated(input, format),
      (said) =>
        typeof said === "string" ? said : taskCreatedWords(said, linkScope())
    ),
    tool(
      "task_update",
      "Changes a task: moves its stage, or replaces each field you give. Use it when a task's facts or stage change; links go through task_link.",
      {
        id: taskRef(),
        stage: z
          .string()
          .optional()
          .describe(
            "The stage it moves to, checked against the project's moves."
          ),
        reason: z.string().optional().describe("Why, with `stage`."),
        title: z.string().optional(),
        description: z.string().optional(),
        acceptance: z.string().optional(),
        type: z.string().nullable().optional(),
        checks: lines(),
        outputs: lines(),
        context: lines(),
        lands: landsParameter().nullable().optional(),
        runs_on: runsOnParameter().nullable().optional(),
        group: groupParameter().nullable().optional(),
        owns: ownsParameter().optional(),
        budget: budgetParameter().nullable().optional(),
        labels: lines(),
        links: linksParameter(),
        fields: fieldsParameter(),
        ...ROUTINE_SHAPE,
        enabled: z
          .boolean()
          .optional()
          .describe("A routine: false pauses it, true resumes it."),
      },
      async (input, format) => {
        const scoped = scope();
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId, tasks, actor } = scoped;
        const routine = await routineUpdated(projectId, input, format);
        if (routine !== undefined) {
          return routine;
        }
        const {
          id,
          stage,
          reason,
          runs_on,
          on: _on,
          target: _target,
          stop: _stop,
          deadline: _deadline,
          daily_cap_usd: _cap,
          mode: _mode,
          keep: _keep,
          check: _check,
          check_on: _checkOn,
          enabled: _enabled,
          ...rest
        } = input;
        const patch = { ...rest, runsOn: runs_on };
        if (reason !== undefined && stage === undefined) {
          return problem(400, {
            code: "task-reason-without-stage",
            detail:
              "A reason goes with a stage move: give `stage` too, or leave `reason` out.",
          });
        }
        const fields = Object.values(patch).some(
          (value) => value !== undefined
        );
        const updated = fields
          ? await tasks.update(projectId, id, patch, actor)
          : undefined;
        if (updated instanceof ElysiaStatus) {
          return updated;
        }
        const moved =
          stage === undefined
            ? undefined
            : await tasks.move(projectId, id, stage, actor, reason);
        if (moved instanceof ElysiaStatus) {
          return moved;
        }
        const task = moved ?? updated ?? (await tasks.get(projectId, id));
        if (task instanceof ElysiaStatus) {
          return task;
        }
        return await titled(
          projectId,
          task,
          format,
          moved !== undefined && "closing" in moved
        );
      },
      (said) =>
        typeof said === "string" ? said : taskChangedWords(said, linkScope())
    ),
    tool(
      "task_link",
      "Links a task: a wait, a part of a whole, or a duplicate. Use it to hold a task until something settles, to make it a part of a whole, to close it as a duplicate, or with `remove` to take a link out.",
      {
        task: taskRef(),
        waits_on: z
          .array(z.string())
          .optional()
          .describe(
            `Targets the hub holds it on until every one settles (a task done, a card picked or picked as named, a pin resolved, a pull request merged, a run green, a session's work finished, a condition met, a date passed); then dispatch may start it: ${WAIT_TARGETS}.`
          ),
        part_of: taskRef()
          .optional()
          .describe(
            "The whole it becomes a part of, inheriting every wait of it; the whole closes when its last part is done."
          ),
        duplicate_of: taskRef()
          .optional()
          .describe(
            "The task it repeats, the survivor: it closes as a duplicate and every wait on it moves there."
          ),
        remove: z
          .boolean()
          .optional()
          .describe("Take the named links out instead."),
      },
      async ({ task, waits_on, part_of, duplicate_of, remove }, format) => {
        const scoped = scope();
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId, tasks, actor } = scoped;
        const linked = await tasks.link(
          projectId,
          task,
          {
            ...(waits_on ? { waitsOn: waits_on } : {}),
            ...(part_of ? { partOf: part_of } : {}),
            ...(duplicate_of ? { duplicateOf: duplicate_of } : {}),
            ...(remove ? { remove } : {}),
          },
          actor
        );
        return linked instanceof ElysiaStatus
          ? linked
          : await titled(projectId, linked, format, true);
      },
      (said) => taskLinkedWords(said, linkScope())
    ),
    tool(
      "task_start",
      "Starts an attempt at a task: a delegate in a new workspace on a machine its runs_on names, briefed from the task file and reporting to you. Use it when a task is ready and should run now.",
      { id: taskRef() },
      async ({ id }) => {
        const scoped = scope();
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId } = scoped;
        // A routine's start by hand is its run now (§5.5).
        const routine = context?.routines?.byTask(
          projectId,
          normaliseTaskRef(id) ?? id
        );
        if (routine?.target && context?.routines) {
          const run = context.routines.runNow(routine.id, context.actor);
          return run instanceof ElysiaStatus
            ? run
            : routineToolWords.ranNow(
                normaliseTaskRef(id) ?? id,
                run.state,
                run.reason
              );
        }
        if (!context?.startAttempt) {
          return problem(503, {
            code: "task-attempts-off",
            detail: "Attempts cannot be started on this hub.",
          });
        }
        return await context.startAttempt(projectId, id, context.actor);
      },
      (said: string | AttemptStart) =>
        typeof said === "string" ? said : attemptStartWords(said)
    ),
    tool(
      "task_retry",
      "Retries a task in a fresh session in its last attempt's workspace, briefed with how that attempt ended and reporting to you. Use it when a task's last attempt failed or was stopped and the task should go on.",
      { id: taskRef() },
      async ({ id }) => {
        const scoped = scope();
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId } = scoped;
        if (!context?.retryAttempt) {
          return problem(503, {
            code: "task-retries-off",
            detail: "Attempts cannot be retried on this hub.",
          });
        }
        return await context.retryAttempt(projectId, id, context.actor);
      },
      attemptStartWords
    ),
    tool(
      "todo_write",
      "Your plan (the tasks and to-dos you work on, when the work needs one), or a task's to-dos. Use it to tick to-dos as you finish them and add the ones you find.",
      {
        steps: z
          .array(stepParameter())
          .optional()
          .describe("Replaces your plan; `depth` nests."),
        task: z
          .string()
          .optional()
          .describe(
            "Default your work item's; an orchestrator names any. One call's changes land together."
          ),
        tick: lines(
          "To-dos by id (td-3, what ends its link) or position (2.1)."
        ),
        untick: lines("As tick."),
        add: z
          .array(
            z.object({
              text: z.string(),
              under: z.string().optional().describe("Its parent to-do."),
            })
          )
          .optional(),
        edit: z
          .array(z.object({ todo: z.string(), text: z.string() }))
          .optional()
          .describe("Rewords a to-do, by id or position."),
      },
      async ({ task, steps, ...changes }) => {
        if (steps !== undefined) {
          if (
            task !== undefined ||
            Object.values(changes).some((value) => value !== undefined)
          ) {
            return problem(400, {
              code: "todo-write-mixed",
              detail:
                "Write your own plan (steps) and a task's to-dos in separate calls.",
            });
          }
          return await ownPlan(steps);
        }
        const scoped = scope(true);
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId, tasks, actor } = scoped;
        const ref = ownTask("todo_write", task);
        if (ref instanceof ElysiaStatus) {
          return ref;
        }
        const done = await tasks.todos(projectId, ref, changes, actor);
        return done instanceof ElysiaStatus
          ? done
          : { id: done.id, title: done.title, todos: done.todos };
      },
      (said) => todoWrittenWords(said, linkScope())
    ),
    tool(
      "task_comment",
      "Comments on a task: an entry with your name and the time, never changed. Use it to leave a note on a task.",
      {
        task: z
          .string()
          .optional()
          .describe("Default your work item's; an orchestrator names any."),
        text: z.string(),
      },
      async ({ task, text }) => {
        const scoped = scope();
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId, tasks, actor } = scoped;
        const ref = ownTask("task_comment", task);
        if (ref instanceof ElysiaStatus) {
          return ref;
        }
        const done = await tasks.comment(projectId, ref, text, actor);
        return done instanceof ElysiaStatus
          ? done
          : { id: done.id, title: done.title, comments: done.comments };
      },
      (said) => taskCommentedWords(said, linkScope())
    ),
    tool(
      "task_result",
      "Your task attempt's work, handed in for the person who asked for it: they read it to learn it is done and what needs them. Use it before finish_item, and on a routine's run before your turn or work ends.",
      {
        summary: z
          .string()
          .trim()
          .min(1)
          .describe(
            "What is done, in one line. A routine's run: a stop's evidence, an ask's question; a conversation's run, its output (NO_REPLY is silent)."
          ),
        run: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "The routine run that woke you, by id; a delegate's run needs none."
          ),
        routine: z
          .enum(ROUTINE_VERDICTS)
          .optional()
          .describe(
            "On a routine's run: keep it going (default), stop it (its stop condition holds), or ask the owner."
          ),
        check: z
          .array(z.string())
          .optional()
          .describe(
            "The loose ends that are theirs, and each thing they must look at or decide, one line each."
          ),
        artifacts: z
          .array(
            z.object({
              kind: z.enum(RESULT_ARTIFACT_KINDS),
              path: z
                .string()
                .optional()
                .describe(
                  "A file or a post: its path in the project's folder."
                ),
              url: z.string().optional().describe("A link: its URL."),
              artifactId: z
                .string()
                .optional()
                .describe("An artifact: its name, handle or id."),
              name: z.string().optional().describe("The name it is shown by."),
              primary: z
                .boolean()
                .optional()
                .describe("The one the review draws first."),
            })
          )
          .optional()
          .describe(
            "The thing itself where a person can use it: the screen or component running (an artifact_create preview, first, primary), a post or document as it will read, a file, a link. None for work a person cannot open."
          ),
      },
      async ({ summary, check, artifacts, run, routine }) => {
        const ran = runAnswered(summary, run, routine);
        if (ran !== undefined) {
          return ran;
        }
        const scoped = scope();
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId, tasks } = scoped;
        const workItemId = context?.actor.workItemId;
        const own = context?.workItemTask ?? null;
        if (!(workItemId && own)) {
          return problem(409, {
            code: "task-result-no-attempt",
            detail:
              "task_result hands in an attempt at a task, and this session works none. Say what you did in finish_item instead.",
          });
        }
        const handed =
          artifacts === undefined
            ? undefined
            : resultArtifacts(artifacts, context?.artifactNamed ?? same);
        if (handed instanceof ElysiaStatus) {
          return handed;
        }
        return await tasks.result(projectId, own, workItemId, {
          summary,
          check,
          artifacts: handed,
        });
      },
      (said: string | AttemptResult) =>
        typeof said === "string" ? said : taskResultWords(said)
    ),
    tool(
      "task_archive",
      "Archives a task: off the board and lists, done for tasks that wait on it, kept with its history. Use it for a task that will not be done, or to bring one back.",
      {
        id: taskRef(),
        archived: z
          .boolean()
          .optional()
          .describe("false brings an archived task back."),
      },
      async ({ id, archived }) => {
        const scoped = scope();
        if (scoped instanceof ElysiaStatus) {
          return scoped;
        }
        const { projectId, tasks, actor } = scoped;
        const done = await tasks.archive(
          projectId,
          id,
          actor,
          archived ?? true
        );
        return done instanceof ElysiaStatus
          ? done
          : {
              id: done.id,
              title: done.title,
              path: done.path,
              archivedAt: done.archivedAt,
            };
      },
      (said) => taskArchivedWords(said, linkScope())
    ),
  ];
}
