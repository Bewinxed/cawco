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
  type PlanStep,
  type SessionPlan,
} from "@cawco/core";
import { z } from "zod";
import { tool } from "./admin-tools";
import type { AttemptStart } from "./dispatch";
import { EDGES, normaliseTaskRef } from "./task-file";
import {
  type StagesView,
  sessionActor,
  type TaskList,
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
]);

export interface TaskToolContext {
  actor: InstanceRow;
  /**
   * Duplicates (§5.9) for a task this session just filed (jev-tasks.ts
   * `filed`): Jev's verdict, or the candidates the session compares.
   */
  duplicates?: (projectId: string, task: TaskView) => Promise<unknown>;
  /** Its role files tasks (roles.ts): it may name any task's to-dos, not only its own work item's. */
  mainline: boolean;
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
  /** Replaces the calling session's steps or spec (plans.ts `write`); without it the session scope refuses. */
  writePlan?: (
    row: InstanceRow,
    written: { steps?: PlanStep[]; spec?: string }
  ) => Promise<SessionPlan>;
}

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});

/** A stage as a model reads it: `draft (active, runs writer)`. */
const stageLine = ({ name, kind, hooks }: StagesView["stages"][number]) => {
  const said = [
    kind,
    ...(hooks.runs ? [`runs ${hooks.runs}`] : []),
    ...(hooks.until ? [`until ${hooks.until}`] : []),
    ...(hooks.after ? [`after ${hooks.after}`] : []),
    ...(hooks.by ? [`only ${hooks.by} moves a task in`] : []),
  ];
  return `${name} (${said.join(", ")})`;
};

type TaskLine = TaskList["tasks"][number];

/** What a task's attempts and edges add to its line: only what is so. */
const attemptFields = (task: TaskLine) => ({
  ...(task.liveAttempt ? { attempt: "live" } : {}),
  ...(task.lastAttemptFailed ? { attempt: "failed" } : {}),
  ...(task.blockedBy.length > 0 ? { blockedBy: task.blockedBy } : {}),
  ...(task.startProblem ? { startProblem: task.startProblem } : {}),
});

/** One task as a model reads it in a list: its fields that are set. */
const taskLine = (task: TaskLine) => ({
  id: task.id,
  title: task.title,
  stage: task.stage,
  ...(task.needsYou ? { needsYou: true } : {}),
  ...(task.type ? { type: task.type } : {}),
  ...(task.after.length > 0 ? { after: task.after } : {}),
  ...(task.parent ? { parent: task.parent } : {}),
  ...(task.labels.length > 0 ? { labels: task.labels } : {}),
  ...(task.todos.total > 0
    ? { todos: `${task.todos.done}/${task.todos.total}` }
    : {}),
  ...attemptFields(task),
  ...(task.duplicateOf ? { duplicateOf: task.duplicateOf } : {}),
  ...(task.problem ? { problem: task.problem } : {}),
  createdAt: task.createdAt,
  ...(task.createdBy ? { createdBy: task.createdBy.name } : {}),
  updatedAt: task.updatedAt,
  ...(task.updatedBy ? { updatedBy: task.updatedBy.name } : {}),
  ...(task.startedAt === null ? {} : { startedAt: task.startedAt }),
  ...(task.completedAt === null ? {} : { completedAt: task.completedAt }),
  ...(task.droppedAt === null ? {} : { droppedAt: task.droppedAt }),
  ...(task.closeReason ? { closeReason: task.closeReason } : {}),
  ...(task.archivedAt === null ? {} : { archivedAt: task.archivedAt }),
  ...(Object.keys(task.fields).length > 0 ? { fields: task.fields } : {}),
});

/** A list as a model reads it: the project's stages, then one short line of fields per task. */
const compact = (list: TaskList, stages: StagesView) => ({
  stages: stages.stages.map(stageLine),
  ...(list.stagesProblems.length > 0
    ? { stagesProblems: list.stagesProblems }
    : {}),
  tasks: list.tasks.map(taskLine),
  ...(list.problems.length > 0 ? { problems: list.problems } : {}),
});

const taskRef = () =>
  z.string().trim().min(1).describe("A task id, like tsk-12.");
const landsParameter = () =>
  z
    .enum(LANDS_MODES as [LandsMode, ...LandsMode[]])
    .describe(
      "Where passing work goes: main (the default branch), branch (cawco/<task> on origin), pr (that branch and a pull request), none (nothing pushed; outputs are the deliverable). Left out: the project's default."
    );
const lines = (what: string) => z.array(z.string()).optional().describe(what);
/** The project's own fields a task file carries beyond its known ones: task_create's and task_update's one shape. */
const fieldsParameter = () =>
  z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .describe(
      "The project's own fields, like {priority: 'high'}; '' or [] takes one out."
    );

/** A step as `todo_write` takes it: ACP's entry, its id and depth optional. */
const stepParameter = () =>
  z.object({
    content: z.string().trim().min(1).describe("One line."),
    status: z.enum(PLAN_STEP_STATUSES),
    depth: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0: top level; one more than its parent step."),
    id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Your id for it; left out, its position (2, 2.1)."),
    priority: z.enum(PLAN_STEP_PRIORITIES).optional(),
  });

/**
 * Steps as written, nested by depth: each one at most one deeper than the
 * one before, and each without an id given its position (`2`, `2.1`).
 */
const stepsOf = (
  written: z.infer<ReturnType<typeof stepParameter>>[]
): PlanStep[] => {
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
    };
  });
};

/** What a work item may spend before the hub stops it: `delegate`'s and the task tools' one shape. */
export const budgetParameter = () =>
  z
    .object({
      usd: z
        .number()
        .positive()
        .optional()
        .describe("Dollars, by the usage its machine reports."),
      turns: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Turns its session may end."),
      minutes: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Wall time from its start."),
    })
    .describe(
      "Limits for the work: at one the hub stops the session, fails the item naming the budget, and tells the parent. Fields left out fall back to the task's, then the project's."
    );

/** Globs of the repository's files a work item owns: `delegate`'s and the task tools' one shape. */
export const ownsParameter = () =>
  z
    .array(z.string())
    .describe(
      "Globs of the repository's files the work owns, from its root, like ['src/theme/**']. Two live items whose globs overlap in one repository never run at once: the later waits, queued. Overlap is judged on each glob's part before its first wildcard, so it errs towards waiting."
    );

/** A group of work items under one parent: `delegate`'s and the task tools' one shape. */
export const groupParameter = () =>
  z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe(
      "Work that belongs together, like 'theme': items in one group under one parent report once, together, when all have ended (each one's summary and where it landed); a failure still reports at once."
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
      "Your project's tasks. With `id`: its file parsed (to-dos by id td-3 or position 2.1, comments) and attempts; `history: true` adds its changes. Without: the stages and a line per task, filtered by the other parameters. needsYou: waits on the operator; blockedBy: tasks it waits for.",
      {
        id: taskRef().optional(),
        history: z.boolean().optional(),
        stage: z.string().optional(),
        q: z.string().optional().describe("In id, title or description."),
        label: z.string().optional(),
        type: z.string().optional(),
        parent: z.string().optional(),
        fields: z.record(z.string(), z.string()).optional(),
        blocked: z.boolean().optional(),
        needsYou: z.boolean().optional(),
        archived: z.boolean().optional().describe("Archived tasks instead."),
      },
      async ({ id, history, ...filter }) => {
        const { projectId, tasks } = scope();
        if (id) {
          const task = await tasks.get(projectId, id);
          return ok(
            history
              ? {
                  ...task,
                  history: (await tasks.history(projectId, id)).events,
                }
              : task
          );
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
        return ok(compact(list, stages));
      }
    ),
    tool(
      "task_create",
      "File a task: work that must outlive this conversation or run without you. Returns it with its id (tsk-12) and `duplicates` to act on. `stage` defaults to the first stage.",
      {
        title: z.string().describe("One line, verb first."),
        description: z.string().optional(),
        acceptance: z
          .string()
          .optional()
          .describe("What must be true when it is done, as a markdown list."),
        todos: lines("Top-level to-dos, one line each."),
        stage: z.string().optional(),
        type: z
          .string()
          .optional()
          .describe("The delegate type that should run it."),
        after: lines("Tasks it waits for, like tsk-3."),
        parent: z.string().optional(),
        related: lines("Tasks it relates to, without waiting for them."),
        found_in: z
          .string()
          .optional()
          .describe("The task whose work turned this one up."),
        checks: lines("Shell commands that must pass, like bun test."),
        outputs: lines("Files it produces that are not commits."),
        lands: landsParameter().optional(),
        group: groupParameter().optional(),
        owns: ownsParameter().optional(),
        budget: budgetParameter().optional(),
        labels: lines("Short labels."),
        fields: fieldsParameter(),
      },
      async ({ found_in, ...draft }) => {
        const { projectId, tasks, actor } = scope();
        const task = await tasks.create(
          projectId,
          { ...draft, foundIn: found_in },
          actor
        );
        const duplicates = await context?.duplicates?.(projectId, task);
        return ok(duplicates ? { ...task, duplicates } : task);
      }
    ),
    tool(
      "task_update",
      "Change a task: move its `stage` (checked against the project's moves; `reason` is kept in its history), or replace any other field you give. What you leave out stays as written.",
      {
        id: taskRef(),
        stage: z.string().optional(),
        reason: z.string().optional().describe("With `stage`: why, one line."),
        title: z.string().optional(),
        description: z.string().optional(),
        acceptance: z.string().optional(),
        type: z
          .string()
          .nullable()
          .optional()
          .describe("A delegate type; null clears it."),
        checks: lines("Replaces the checks."),
        outputs: lines("Replaces the outputs."),
        lands: landsParameter()
          .nullable()
          .optional()
          .describe("Where its attempts land; null: the project's default."),
        group: groupParameter().nullable().optional(),
        owns: ownsParameter().optional(),
        budget: budgetParameter().nullable().optional(),
        labels: lines("Replaces the labels."),
        fields: fieldsParameter(),
      },
      async ({ id, stage, reason, ...patch }) => {
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
        return ok(task ?? (await tasks.get(projectId, id)));
      }
    ),
    tool(
      "task_link",
      "Add or remove an edge from one task to another: `after` (it waits for that task), `parent`, `related` (no effect on order), `found_in` (turned up while working on that task), or `duplicate_of` (it repeats that task: it is dropped, if your moves allow, and its waiters wait on that task).",
      {
        id: taskRef(),
        edge: z.enum(EDGES),
        to: taskRef(),
        remove: z.boolean().optional().describe("Take the edge out instead."),
      },
      async ({ id, edge, to, remove }) => {
        const { projectId, tasks, actor } = scope();
        return ok(await tasks.link(projectId, id, { edge, to, remove }, actor));
      }
    ),
    tool(
      "task_start",
      "Start an attempt at a task: a delegate in a new workspace from a checkout of the project on an online machine, briefed from the task file (description, acceptance, open to-dos, checks), reporting to you. The task moves to its active stage and runs that stage's type, else its own. Refused while an attempt is live or it is done.",
      { id: taskRef() },
      async ({ id }) => {
        const { projectId } = scope();
        if (!context?.startAttempt) {
          throw new Error("Attempts cannot be started on this hub.");
        }
        return ok(await context.startAttempt(projectId, id, context.actor));
      }
    ),
    tool(
      "task_retry",
      "Retry a task whose last attempt failed or was cancelled: a fresh session in that attempt's workspace as it was left (a new one if the clone is gone), briefed from the task file with the failure and the to-dos done so far, reporting to you. Refused while an attempt is live or the last did not fail.",
      { id: taskRef() },
      async ({ id }) => {
        const { projectId } = scope();
        if (!context?.retryAttempt) {
          throw new Error("Attempts cannot be retried on this hub.");
        }
        return ok(await context.retryAttempt(projectId, id, context.actor));
      }
    ),
    tool(
      "todo_write",
      "Two scopes. Your plan: `steps` replaces your step list (pending, in_progress or completed; `depth` nests), `spec` your spec (markdown: what you build and how); returns your plan. A task's to-dos: tick, untick, add or reword them by id (td-3) or position (2.1) on your work item's task (a session the operator started names any); all land together.",
      {
        steps: z
          .array(stepParameter())
          .optional()
          .describe("The whole list, in order."),
        spec: z.string().optional().describe("The whole document."),
        task: z
          .string()
          .optional()
          .describe("Like tsk-12. Defaults to your work item's."),
        tick: lines("To-dos done."),
        untick: lines("To-dos not done after all."),
        add: z
          .array(
            z.object({
              text: z.string().describe("One line."),
              under: z
                .string()
                .optional()
                .describe("The to-do it is a step of."),
            })
          )
          .optional(),
        edit: z
          .array(z.object({ todo: z.string(), text: z.string() }))
          .optional()
          .describe("New words for a to-do."),
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
          return ok(
            await context.writePlan(context.actor, {
              ...(steps ? { steps: stepsOf(steps) } : {}),
              ...(spec === undefined ? {} : { spec }),
            })
          );
        }
        const { projectId, tasks, actor } = scope();
        const done = await tasks.todos(
          projectId,
          ownTask("todo_write", task),
          changes,
          actor
        );
        return ok({ id: done.id, todos: done.todos });
      }
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
        return ok({ id: done.id, comments: done.comments });
      }
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
        return ok({
          id: done.id,
          path: done.path,
          archivedAt: done.archivedAt,
        });
      }
    ),
  ];
}
