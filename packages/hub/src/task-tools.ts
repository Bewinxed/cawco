/**
 * The task tools on the `cawco` MCP server (§5.3: one server, a toolset per
 * role; new tools named group first). Every session reads its project's
 * tasks and writes to-dos; filing and changing tasks belongs to the roles
 * that have those tools (roles.ts: a session you started, and the project's
 * Caw), and a delegate proposes them through handoff. A session's project is its instance row's
 * `projectId`; a delegate's is its parent's. `task_start` starts an attempt
 * at a task (dispatch.ts) that reports to the session calling it;
 * `task_retry` starts a fresh one in the failed attempt's workspace.
 * `todo_write` also writes the calling session's own plan (plans.ts): its
 * steps and its spec, with or without a project or task.
 */
import {
  type InstanceRow,
  LANDS_MODES,
  type LandsMode,
  PLAN_STEP_PRIORITIES,
  PLAN_STEP_STATUSES,
  type PlanWait,
  planWaitRef,
  RESULT_ARTIFACT_KINDS,
  type ResultArtifact,
  type ResultArtifactKind,
  type SessionPlan,
} from "@cawco/core";
import { z } from "zod";
import { BUILD_TITLE } from "./design-offers";
import type { AttemptStart } from "./dispatch";
import type { DuplicateOutcome } from "./jev-tasks";
import { tool } from "./mcp-tool";
import type { WrittenStep } from "./plans";
import {
  attemptStartWords,
  type LinkScope,
  type TaskAnswer,
  taskArchivedWords,
  taskChangedWords,
  taskCommentedWords,
  taskCreatedWords,
  taskReadWords,
  taskResultWords,
  todoWrittenWords,
} from "./presenters/tasks";
import { appleSuggestion } from "./runs-on";
import { EDGES, normaliseTaskRef } from "./task-file";
import {
  sessionActor,
  type TaskActor,
  type Tasks,
  type TaskView,
} from "./tasks";

/** Every task tool, by name. */
export const TASK_TOOLS: ReadonlySet<string> = new Set([
  "task_create",
  "task_read",
  "task_update",
  "task_link",
  "task_start",
  "task_retry",
  "todo_write",
  "task_comment",
  "task_archive",
  "task_result",
]);

export interface TaskToolContext {
  actor: InstanceRow;
  /** The whole id of the artifact the actor names by its name, handle or id (artifacts/service.ts `named`). */
  artifactNamed?: (asked: string) => string;
  /** The decision pages the actor names for a task's `builds_from`, resolved and checked (artifacts/service.ts `buildsFrom`). */
  buildsFrom?: (written: string[]) => PlanWait[];
  /**
   * Files "Build the design system" in the hub's words (design-offers.ts
   * `fileBuild`): a `task_create` with that title gives only its stage.
   */
  designBuild?: (
    projectId: string,
    actor: TaskActor,
    stage: string | undefined
  ) => Promise<TaskView>;
  /**
   * Duplicates (§5.9) for a task this session just filed (jev-tasks.ts
   * `filed`): Jev's verdict, or the candidates the session compares.
   */
  duplicates?: (projectId: string, task: TaskView) => Promise<DuplicateOutcome>;
  /** Its role files tasks (roles.ts): it may name any task's to-dos, not only its own work item's. */
  mainline: boolean;
  /** The project's own `runs_on` (dispatch settings): a task filed under one is not told to set its own. */
  projectRunsOn?: (projectId: string) => string | null;
  /** Retries a task whose last attempt failed, reporting to `parent` (dispatch.ts); without it task_retry refuses. */
  retryAttempt?: (
    projectId: string,
    ref: string,
    parent: InstanceRow
  ) => Promise<AttemptStart>;
  /** Starts an attempt at a task, reporting to `parent` (dispatch.ts); without it task_start refuses. */
  startAttempt?: (
    projectId: string,
    ref: string,
    parent: InstanceRow
  ) => Promise<AttemptStart>;
  tasks: Tasks;
  /** The task the session's work item is an attempt at, if it has one. */
  workItemTask: string | null;
  /**
   * Replaces the calling session's steps or spec (plan-changes.ts
   * `written`), answering what it is owed of the person's changes; without
   * it the session scope refuses.
   */
  writePlan?: (
    row: InstanceRow,
    written: { steps?: WrittenStep[]; spec?: string }
  ) => Promise<SessionPlan & { personChanged?: string }>;
}

/**
 * One artifact as `task_result` takes it, read as the kind it names: a file
 * or a post its `path`, a link its `url`, a page artifact its `artifactId`.
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
  artifactNamed: (asked: string) => string
): ResultArtifact => {
  const shown = {
    ...(written.name ? { name: written.name } : {}),
    ...(written.primary ? { primary: true } : {}),
  };
  const need = (value: string | undefined, field: string): string => {
    if (!value?.trim()) {
      throw new Error(`A ${written.kind} artifact names its ${field}.`);
    }
    return value.trim();
  };
  switch (written.kind) {
    case "link":
      return { kind: "link", url: need(written.url, "url"), ...shown };
    case "artifact":
      return {
        kind: "artifact",
        artifactId: artifactNamed(need(written.artifactId, "artifactId")),
        ...shown,
      };
    case "file":
    case "post":
      break;
  }
  return {
    kind: written.kind,
    path: need(written.path, "path"),
    ...shown,
  };
};

const taskRef = () =>
  z
    .string()
    .trim()
    .min(1)
    .describe(
      "A task id, like tsk-12: what ends its link, cawco:task/<project>/tsk-12."
    );

/** Whether a task's answer names other tasks: its edges, or a to-do promoted to one. */
const namesTasks = (task: TaskView): boolean =>
  task.after.length > 0 ||
  task.blockedBy.length > 0 ||
  task.related.length > 0 ||
  task.parent !== null ||
  task.foundIn !== null ||
  task.duplicateOf !== null ||
  task.todos.some((todo) => todo.promoted);
const landsParameter = () =>
  z
    .enum(LANDS_MODES as [LandsMode, ...LandsMode[]])
    .describe(
      "main, branch (cawco/<task>), pr (and a pull request) or none (outputs are the deliverable). Default: the project's."
    );
const runsOnParameter = () =>
  z.string().trim().min(1).describe("apple, linux or a hostname.");
const lines = (what?: string) =>
  what === undefined
    ? z.array(z.string()).optional()
    : z.array(z.string()).optional().describe(what);
/** The project's own fields a task file carries beyond its known ones: task_create's and task_update's one shape. */
const fieldsParameter = () =>
  z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .describe("Like {priority: 'high'}; '' or [] takes one out.");

/** An artifact named where no session can resolve it (discovery): as given. */
const same = (asked: string): string => asked;

/** A task's `builds_from` as its file keeps it: each page resolved, `<artifact id>` or `<artifact id>#<card>`. */
const pagesOf = (
  written: string[] | undefined,
  resolve: ((written: string[]) => PlanWait[]) | undefined
): string[] | undefined => {
  if (written === undefined || written.length === 0) {
    return written;
  }
  if (!resolve) {
    throw new Error("Discovery cannot execute tools");
  }
  return resolve(written).map(planWaitRef);
};

/** A step as `todo_write` takes it: ACP's entry, its id and depth optional. */
const stepParameter = () =>
  z.object({
    content: z.string().trim().min(1),
    status: z.enum(PLAN_STEP_STATUSES),
    depth: z.number().int().min(0).optional(),
    id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "On a task attempt, a to-do's id (td-3, what ends its link) makes the step that to-do: completing it ticks it."
      ),
    priority: z.enum(PLAN_STEP_PRIORITIES).optional(),
    waitsOn: z
      .string()
      .optional()
      .describe("Card it waits on: <artifact>#<card>; '' clears."),
  });

/** A step's `waitsOn` as written: `<artifact>#<card>`, the artifact by its name, handle or id; or '' to clear it. */
const waitOf = (
  written: string,
  artifactNamed: (asked: string) => string
): PlanWait | null => {
  if (written === "") {
    return null;
  }
  const at = written.indexOf("#");
  if (at <= 0 || at === written.length - 1) {
    throw new Error(
      `waitsOn “${written}” names no card: write the page's name, #, and the card's id.`
    );
  }
  return {
    artifactId: artifactNamed(written.slice(0, at)),
    card: written.slice(at + 1),
  };
};

/**
 * Steps as written, nested by depth: each one at most one deeper than the
 * one before, and each without an id given its position (`2`, `2.1`).
 */
const stepsOf = (
  written: z.infer<ReturnType<typeof stepParameter>>[],
  artifactNamed: (asked: string) => string
): WrittenStep[] => {
  const counts: number[] = [];
  return written.map((step, index) => {
    const depth = step.depth ?? 0;
    if (depth > counts.length) {
      throw new Error(
        `Step ${index + 1} (“${step.content}”) is at depth ${depth}, deeper than one past the step before it.`
      );
    }
    counts.length = depth + 1;
    counts[depth] = (counts[depth] ?? 0) + 1;
    return {
      id: step.id ?? counts.join("."),
      content: step.content,
      status: step.status,
      depth,
      ...(step.priority ? { priority: step.priority } : {}),
      ...(step.waitsOn === undefined
        ? {}
        : { waitsOn: waitOf(step.waitsOn, artifactNamed) }),
    };
  });
};

/** What a work item may spend before the hub stops it: `delegate`'s and the task tools' one shape. */
export const budgetParameter = () =>
  z
    .object({
      usd: z.number().positive().optional(),
      turns: z.number().int().min(1).optional(),
      minutes: z.number().int().min(1).optional(),
    })
    .describe(
      "At a limit the hub stops the work and fails it, naming the limit. Unset: the task's, then the project's."
    );

/** Globs of the repository's files a work item owns: `delegate`'s and the task tools' one shape. */
export const ownsParameter = () =>
  z
    .array(z.string())
    .describe(
      "Globs from the repository's root, like ['src/theme/**']: two live items whose globs overlap in one repository never run at once; the later waits."
    );

/** The decision pages a build builds from: `delegate`'s and the task tools' one shape. */
export const buildsFromParameter = () =>
  z
    .array(z.string().trim().min(1))
    .describe(
      "Decision pages it builds from: a page's name or handle, or <page>#<card> for one card. It lands on main only once every card named (each card of a page named whole) is picked and has no open pin; until then its commits wait on cawco/<item> and its report says what it waits for."
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

/**
 * The task tools, bound to the calling session; with no context, the same
 * definitions for discovery, whose handlers refuse.
 */
export function taskTools(context: TaskToolContext | undefined) {
  const scope = () => {
    if (!context) {
      throw new Error("Discovery cannot execute tools");
    }
    const { projectId } = context.actor;
    if (!projectId) {
      throw new Error(
        "This session belongs to no project, so it has no tasks. Start the session in one of a project's places."
      );
    }
    return {
      projectId,
      tasks: context.tasks,
      actor: sessionActor(context.actor),
    };
  };

  /** The calling session's project and id: the links its answers carry (presenters/tasks.ts); none in discovery. */
  const linkScope = (): LinkScope => ({
    project: context?.actor.projectId ?? null,
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
  ): Promise<T & Pick<TaskAnswer, "titles">> => {
    if (
      format === "detailed" ||
      !context ||
      !(namesOthers || namesTasks(task))
    ) {
      return task;
    }
    const board = await context.tasks.list(projectId, {});
    return {
      ...task,
      titles: Object.fromEntries(board.tasks.map((one) => [one.id, one.title])),
    };
  };

  /** The task todo_write or task_comment may change: the work item's own, or any one a mainline session names. */
  const ownTask = (
    name: "todo_write" | "task_comment",
    asked: string | undefined
  ): string => {
    const own = context?.workItemTask ?? null;
    if (context?.mainline) {
      const named = asked ?? own;
      if (!named) {
        throw new Error(`Name the task: ${name}({ task: "tsk-12", … }).`);
      }
      return named;
    }
    if (!own) {
      throw new Error(
        `${name} works on your work item's task, and your work item has none. Say what you did in finish_item instead.`
      );
    }
    if (asked !== undefined && normaliseTaskRef(asked) !== own) {
      throw new Error(
        `You can use ${name} only on ${own}, your work item's task.`
      );
    }
    return own;
  };

  return [
    tool(
      "task_read",
      "Your project's tasks: the stages and a line per task, filtered by the other parameters; with `id`, one task whole (`history` adds its changes).",
      {
        id: taskRef().optional(),
        history: z.boolean().optional(),
        stage: z.string().optional(),
        q: z.string().optional(),
        label: z.string().optional(),
        type: z.string().optional(),
        parent: z.string().optional(),
        fields: z.record(z.string(), z.string()).optional(),
        blocked: z.boolean().optional(),
        needsYou: z.boolean().optional(),
        archived: z.boolean().optional(),
      },
      async ({ id, history, ...filter }, format) => {
        const { projectId, tasks } = scope();
        if (id) {
          const task = await titled(
            projectId,
            await tasks.get(projectId, id),
            format
          );
          return history
            ? {
                ...task,
                history: (await tasks.history(projectId, id)).events,
              }
            : task;
        }
        if (history) {
          throw new Error(
            'Name the task whose history you want: task_read({ id: "tsk-12", history: true }).'
          );
        }
        const [list, stages] = await Promise.all([
          tasks.list(projectId, filter),
          tasks.stages(projectId),
        ]);
        return { list, stages };
      },
      (said) => taskReadWords(said, linkScope())
    ),
    tool(
      "task_create",
      "File a task: work that must outlive this conversation or run without you. Answers its link, its id (tsk-12) ending it, and any duplicates to act on.",
      {
        title: z.string().describe("Verb first."),
        description: z.string().optional(),
        acceptance: z
          .string()
          .optional()
          .describe("What must be true when done, a markdown list."),
        todos: lines("Top-level to-dos."),
        stage: z.string().optional(),
        type: z.string().optional().describe("The delegate type to run it."),
        after: lines("Tasks it waits for."),
        parent: z.string().optional(),
        related: lines("Tasks it relates to, not waiting."),
        found_in: z
          .string()
          .optional()
          .describe("The task whose work turned it up."),
        checks: lines(
          "Commands whose output proves the work; `host: <command>` needs the host."
        ),
        outputs: lines("Files it makes that are not commits."),
        context: lines("knowledge/ files for its brief."),
        lands: landsParameter().optional(),
        runs_on: runsOnParameter().optional(),
        group: groupParameter().optional(),
        owns: ownsParameter().optional(),
        builds_from: buildsFromParameter().optional(),
        budget: budgetParameter().optional(),
        labels: lines(),
        fields: fieldsParameter(),
      },
      async ({ found_in, runs_on, builds_from, ...draft }, format) => {
        const { projectId, tasks, actor } = scope();
        // The design system's build carries the hub's words, never the filer's.
        if (draft.title.trim() === BUILD_TITLE && context?.designBuild) {
          return await context.designBuild(projectId, actor, draft.stage);
        }
        const task = await tasks.create(
          projectId,
          {
            ...draft,
            foundIn: found_in,
            runsOn: runs_on,
            buildsFrom: pagesOf(builds_from, context?.buildsFrom),
          },
          actor
        );
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
        return {
          ...(await titled(projectId, task, format, named)),
          ...(duplicates ? { duplicates } : {}),
          ...(suggest ? { suggest } : {}),
        };
      },
      (said) => taskCreatedWords(said, linkScope())
    ),
    tool(
      "task_update",
      "Change a task: move its `stage` (checked against the project's moves), or replace any field you give; the rest stays.",
      {
        id: taskRef(),
        stage: z.string().optional(),
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
        builds_from: buildsFromParameter().optional(),
        budget: budgetParameter().nullable().optional(),
        labels: lines(),
        fields: fieldsParameter(),
      },
      async ({ id, stage, reason, runs_on, builds_from, ...rest }, format) => {
        const patch = {
          ...rest,
          runsOn: runs_on,
          buildsFrom: pagesOf(builds_from, context?.buildsFrom),
        };
        const { projectId, tasks, actor } = scope();
        if (reason !== undefined && stage === undefined) {
          throw new Error(
            "A reason goes with a stage move: give `stage` too, or leave `reason` out."
          );
        }
        const fields = Object.values(patch).some(
          (value) => value !== undefined
        );
        let task = fields
          ? await tasks.update(projectId, id, patch, actor)
          : undefined;
        if (stage !== undefined) {
          task = await tasks.move(projectId, id, stage, actor, reason);
        }
        return await titled(
          projectId,
          task ?? (await tasks.get(projectId, id)),
          format
        );
      },
      (said) => taskChangedWords(said, linkScope())
    ),
    tool(
      "task_link",
      "Add or remove an edge: after (it waits for that task), parent, related, found_in, or duplicate_of (it is dropped, its waiters moved to that task).",
      {
        id: taskRef(),
        edge: z.enum(EDGES),
        to: taskRef(),
        remove: z.boolean().optional(),
      },
      async ({ id, edge, to, remove }, format) => {
        const { projectId, tasks, actor } = scope();
        return await titled(
          projectId,
          await tasks.link(projectId, id, { edge, to, remove }, actor),
          format
        );
      },
      (said) => taskChangedWords(said, linkScope())
    ),
    tool(
      "task_start",
      "Start an attempt at a task: a delegate in a new workspace on a machine its runs_on names, briefed from the task file, reporting to you; the task moves to its active stage. Refused while one is live or it is done.",
      { id: taskRef() },
      async ({ id }) => {
        const { projectId } = scope();
        if (!context?.startAttempt) {
          throw new Error("Attempts cannot be started on this hub.");
        }
        return await context.startAttempt(projectId, id, context.actor);
      },
      attemptStartWords
    ),
    tool(
      "task_retry",
      "Retry a task whose last attempt failed or was stopped: a fresh session in that attempt's workspace, briefed with the failure, reporting to you.",
      { id: taskRef() },
      async ({ id }) => {
        const { projectId } = scope();
        if (!context?.retryAttempt) {
          throw new Error("Attempts cannot be retried on this hub.");
        }
        return await context.retryAttempt(projectId, id, context.actor);
      },
      attemptStartWords
    ),
    tool(
      "todo_write",
      "Your plan: `steps` replaces your step list (`depth` nests), `spec` your spec (what you build, how and why). Or a task's to-dos: tick, untick, add or reword by id (td-3, what ends its link) or position (2.1), on your work item's task (an operator's session names any); all land together. Every compaction lists them.",
      {
        steps: z.array(stepParameter()).optional(),
        spec: z.string().optional(),
        task: z.string().optional().describe("Default: your work item's."),
        tick: lines(),
        untick: lines(),
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
          .optional(),
      },
      async ({ task, steps, spec, ...changes }) => {
        if (steps !== undefined || spec !== undefined) {
          if (
            task !== undefined ||
            Object.values(changes).some((value) => value !== undefined)
          ) {
            throw new Error(
              "Write your own plan (steps, spec) and a task's to-dos in separate calls."
            );
          }
          if (!context?.writePlan) {
            throw new Error("Discovery cannot execute tools");
          }
          return await context.writePlan(context.actor, {
            ...(steps
              ? { steps: stepsOf(steps, context.artifactNamed ?? same) }
              : {}),
            ...(spec === undefined ? {} : { spec }),
          });
        }
        const { projectId, tasks, actor } = scope();
        const done = await tasks.todos(
          projectId,
          ownTask("todo_write", task),
          changes,
          actor
        );
        return { id: done.id, title: done.title, todos: done.todos };
      },
      (said) => todoWrittenWords(said, linkScope())
    ),
    tool(
      "task_comment",
      "Comment on your work item's task (a session the operator started names any): an entry with your name and the time, never changed.",
      { task: z.string().optional(), text: z.string() },
      async ({ task, text }) => {
        const { projectId, tasks, actor } = scope();
        const done = await tasks.comment(
          projectId,
          ownTask("task_comment", task),
          text,
          actor
        );
        return { id: done.id, title: done.title, comments: done.comments };
      },
      (said) => taskCommentedWords(said, linkScope())
    ),
    tool(
      "task_result",
      "Hand in your task's work before finish_item: what you did, what to check, what you made. Show it with artifact_create and hand that artifact in first, primary (its name or handle); files by folder path. Again replaces it.",
      {
        summary: z.string().trim().min(1),
        check: z.array(z.string()).optional(),
        artifacts: z
          .array(
            z.object({
              kind: z.enum(RESULT_ARTIFACT_KINDS),
              path: z.string().optional(),
              url: z.string().optional(),
              artifactId: z.string().optional(),
              name: z.string().optional(),
              primary: z.boolean().optional(),
            })
          )
          .optional(),
      },
      async ({ summary, check, artifacts }) => {
        const { projectId, tasks } = scope();
        const workItemId = context?.actor.workItemId;
        const own = context?.workItemTask ?? null;
        if (!(workItemId && own)) {
          throw new Error(
            "task_result hands in an attempt at a task, and this session works none. Say what you did in finish_item instead."
          );
        }
        return await tasks.result(projectId, own, workItemId, {
          summary,
          check,
          artifacts: artifacts?.map((one) =>
            resultArtifact(one, context?.artifactNamed ?? same)
          ),
        });
      },
      taskResultWords
    ),
    tool(
      "task_archive",
      "Archive a task: off the board and lists, done for tasks that wait on it, kept with its history; not while an attempt is live. `archived: false` brings it back.",
      { id: taskRef(), archived: z.boolean().optional() },
      async ({ id, archived }) => {
        const { projectId, tasks, actor } = scope();
        const done = await tasks.archive(
          projectId,
          id,
          actor,
          archived ?? true
        );
        return {
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
