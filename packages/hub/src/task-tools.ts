/**
 * The task tools on the `cawco` MCP server (§5.3: one server, a toolset per
 * role; new tools named group first). Every session reads its project's
 * tasks and writes to-dos; filing and changing tasks belongs to the roles
 * that have those tools (roles.ts: a session you started and the project's
 * Caw file and change them, a delegate that orchestrates changes them), and
 * a leaf proposes them through handoff. A session's project is its instance row's
 * `projectId`; a delegate's is its parent's. `task_start` starts an attempt
 * at a task (dispatch.ts) that reports to the session calling it, as
 * `delegate` with a `task` does; `task_retry` starts a fresh one in the
 * failed attempt's workspace.
 * `todo_write` also writes the calling session's own plan (plans.ts): its
 * steps and its spec, with or without a project or task.
 */
import {
  RESULT_ARTIFACT_KINDS,
  type ResultArtifact,
  type ResultArtifactKind,
} from "@cawco/core/deliverables";
import { LANDS_MODES } from "@cawco/core/injected";
import {
  PLAN_STEP_PRIORITIES,
  PLAN_STEP_STATUSES,
  type SessionPlan,
} from "@cawco/core/plan";
import type { InstanceRow } from "@cawco/core/protocol";
import type { AttemptStart } from "@cawco/core/task-views";
import { ElysiaStatus } from "elysia";
import { z } from "zod";
import { BUILD_TITLE } from "./design-offers";
import type { JevTasks } from "./jev-tasks";
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
  taskLinkedWords,
  taskReadWords,
  taskResultWords,
  todoWrittenWords,
} from "./presenters/tasks";
import type { Refused } from "./refusal";
import { appleSuggestion } from "./runs-on";
import { normaliseTaskRef } from "./task-file";
import {
  sessionActor,
  type TaskActor,
  type Tasks,
  type TaskView,
} from "./tasks";

/** Every task tool, by name. */
const TASK_TOOL_NAMES = [
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
] as const;
export type TaskTool = (typeof TASK_TOOL_NAMES)[number];
export const TASK_TOOLS: ReadonlySet<string> = new Set(TASK_TOOL_NAMES);

export interface TaskToolContext {
  actor: InstanceRow;
  /** It changes tasks (roles.ts `changesAnyTask`): its todo_write and task_comment name any task, not only its own work item's. */
  anyTask: boolean;
  /** The whole id of the artifact the actor names by its name, handle or id (artifacts/service.ts `named`). */
  artifactNamed?: (asked: string) => string;
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
  /** The project's own `runs_on` (dispatch settings): a task filed under one is not told to set its own. */
  projectRunsOn?: (projectId: string) => string | null;
  /** Retries a task whose last attempt failed, reporting to `parent` (dispatch.ts); without it task_retry refuses. */
  retryAttempt?: (
    projectId: string,
    ref: string,
    parent: InstanceRow
  ) => Promise<AttemptStart | Refused>;
  /** Starts an attempt at a task, reporting to `parent` (dispatch.ts); without it task_start refuses. */
  startAttempt?: (
    projectId: string,
    ref: string,
    parent: InstanceRow
  ) => Promise<AttemptStart | Refused>;
  /** A plan step's wait as this session writes it, read as a task's wait is (task-waits.ts `readWait`) and kept as a file keeps it. */
  stepWait?: (written: string) => ReturnType<Tasks["keptWait"]>;
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
  ) => Promise<(SessionPlan & { personChanged?: string }) | Refused>;
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
  "tsk-12, a card <page>#<card> (any pick settles it; <page>#<card>=<option> only that option, another leaves it held), a pin <page>/<number>, a GitHub pull request or Actions run URL, or a session handle (cockpit#5a167bde)";
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

/** An artifact named where no session can resolve it (discovery): as given. */
const same = (asked: string): string => asked;

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
      .describe("A task to-do's id (td-3): completing the step ticks it."),
    priority: z.enum(PLAN_STEP_PRIORITIES).optional(),
    waitsOn: z
      .string()
      .optional()
      .describe(`What it waits on: ${WAIT_TARGETS}; '' for none.`),
  });

/**
 * Steps as written, nested by depth: each one at most one deeper than the
 * one before, and each without an id given its position (`2`, `2.1`).
 */
const stepsOf = async (
  written: z.infer<ReturnType<typeof stepParameter>>[],
  stepWait: (written: string) => ReturnType<Tasks["keptWait"]>
) => {
  const counts: number[] = [];
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
  return written.map((step, index): WrittenStep => {
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
      ...(waits[index] ? { waitsOn: waits[index] } : {}),
    };
  });
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
  ): string => {
    const own = context?.workItemTask ?? null;
    if (context?.anyTask) {
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

  /** todo_write's session scope: the session's steps (each wait read as a task's is) or its spec, written. */
  const ownPlan = async (
    steps: z.infer<ReturnType<typeof stepParameter>>[] | undefined,
    spec: string | undefined
  ) => {
    if (!context?.writePlan) {
      throw new Error("Discovery cannot execute tools");
    }
    const written = steps
      ? await stepsOf(
          steps,
          context.stepWait ?? ((step) => Promise.resolve(step))
        )
      : undefined;
    if (written instanceof ElysiaStatus) {
      return written;
    }
    return await context.writePlan(context.actor, {
      ...(written ? { steps: written } : {}),
      ...(spec === undefined ? {} : { spec }),
    });
  };

  return [
    tool(
      "task_read",
      "Your project's tasks: the stages and a line per task, filtered by the other parameters; with `id`, one task whole, its Waits on and Unblocks lines included (`history` adds its changes).",
      {
        id: taskRef().optional(),
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
        const { projectId, tasks } = scope();
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
          throw new Error(
            'Name the task whose history you want: task_read({ id: "tsk-12", history: true }).'
          );
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
      "File a task: work that must outlive this conversation or run without you. waits_on holds it until every target settles; part_of makes it a part of a whole, inheriting the whole's waits. The hub records where it was found. Answers its link (its id, tsk-12, ends it), what it waits on, when it is ready, and any duplicates to act on.",
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
        waits_on: z
          .array(z.string())
          .optional()
          .describe(`What holds it until settled: ${WAIT_TARGETS}.`),
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
      },
      async ({ waits_on, part_of, runs_on, ...draft }, format) => {
        const { projectId, tasks, actor } = scope();
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
        budget: budgetParameter().nullable().optional(),
        labels: lines(),
        links: linksParameter(),
        fields: fieldsParameter(),
      },
      async ({ id, stage, reason, runs_on, ...rest }, format) => {
        const patch = { ...rest, runsOn: runs_on };
        const { projectId, tasks, actor } = scope();
        if (reason !== undefined && stage === undefined) {
          throw new Error(
            "A reason goes with a stage move: give `stage` too, or leave `reason` out."
          );
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
      (said) => taskChangedWords(said, linkScope())
    ),
    tool(
      "task_link",
      "Link a task. waits_on: the hub holds it until every target settles (a task done, a card picked or picked as named, a pin resolved, a pull request merged, a run green, a session's work finished), then dispatch may start it. part_of: it becomes a part of that whole and inherits every wait of it; the whole closes when its last part is done. duplicate_of: it closes as a duplicate and every wait on it moves to the survivor. remove: the named links come out. Refuses a cycle, naming its path. Answers what it waits on and unblocks.",
      {
        task: taskRef(),
        waits_on: z
          .array(z.string())
          .optional()
          .describe(`Targets to wait on: ${WAIT_TARGETS}.`),
        part_of: taskRef().optional().describe("The whole it is a part of."),
        duplicate_of: taskRef()
          .optional()
          .describe("The task it repeats: the survivor."),
        remove: z
          .boolean()
          .optional()
          .describe("Take the named links out instead."),
      },
      async ({ task, waits_on, part_of, duplicate_of, remove }, format) => {
        const { projectId, tasks, actor } = scope();
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
      "Your plan: `steps` replaces your step list (`depth` nests), `spec` your spec (what you build, how and why). Or a task's to-dos: tick, untick, add or reword by id (td-3, what ends its link) or position (2.1), on your work item's task (an orchestrator names any); all land together. Every compaction lists them.",
      {
        steps: z.array(stepParameter()).optional(),
        spec: z.string().optional(),
        task: z.string().optional().describe("Default: your work item's."),
        tick: lines("To-dos by id or position."),
        untick: lines("To-dos by id or position."),
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
          return await ownPlan(steps, spec);
        }
        const { projectId, tasks, actor } = scope();
        const done = await tasks.todos(
          projectId,
          ownTask("todo_write", task),
          changes,
          actor
        );
        return done instanceof ElysiaStatus
          ? done
          : { id: done.id, title: done.title, todos: done.todos };
      },
      (said) => todoWrittenWords(said, linkScope())
    ),
    tool(
      "task_comment",
      "Comment on your work item's task (an orchestrator names any): an entry with your name and the time, never changed.",
      { task: z.string().optional(), text: z.string() },
      async ({ task, text }) => {
        const { projectId, tasks, actor } = scope();
        const done = await tasks.comment(
          projectId,
          ownTask("task_comment", task),
          text,
          actor
        );
        return done instanceof ElysiaStatus
          ? done
          : { id: done.id, title: done.title, comments: done.comments };
      },
      (said) => taskCommentedWords(said, linkScope())
    ),
    tool(
      "task_result",
      "Hand in your task's work before finish_item: what you did, what to check, what you made. Show it with artifact_create and hand that artifact in first, primary (its name or handle); files by folder path. Again replaces it.",
      {
        summary: z
          .string()
          .trim()
          .min(1)
          .describe("What you did, in a few sentences."),
        check: z
          .array(z.string())
          .optional()
          .describe("What the reviewer should look at, one line each."),
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
