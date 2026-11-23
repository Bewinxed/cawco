/**
 * Every session's plan (Projects spec §5.2, "Every session's plan, in a
 * panel"; shapes in core plan.ts): the tasks and to-dos it works on, and on
 * a task attempt the task's to-dos, the same for a delegate and an attempt.
 *
 * Every session's steps are CawCo's list, on every harness: written whole
 * through `todo_write`'s session scope and stored here. Each harness's own
 * list and plan mode are denied to every session (core `OWN_LIST_DENIED`),
 * so there is no other list to read. A step names a task or a to-do of its
 * session's project and nothing else ({@link readSteps}): its words and
 * whether it is done are read from that record at every read, never kept.
 * A write that completes a to-do's step ticks the to-do; a task's step is
 * done when its task's stage is.
 *
 * The person changes a plan too ({@link Plans.edit}): each change is applied
 * to the steps here, or to the record a step names (a reword, a tick), and
 * kept as a row in their words (`plan_changes`); plan-changes.ts decides who
 * hears it and when. A write of the session's steps names every step's wait
 * whole: a step it gives none waits on nothing. What of the session's waits
 * on the person is read from Needs you on every read, never stored (core
 * `planNeedsOf`): shown on the open step whose `waitsOn` names a card or pin
 * of it, else in the plan's `needs`, and gone from both once Needs you lists
 * it no more ({@link Plans.needsMoved}).
 * The person's comments stay on the step naming the same record, wherever
 * it stands, else on the plan as orphaned comments ({@link keepComments}).
 * A step's wait is a task's wait (wait-targets.ts): the hub's one
 * resolver settles it (task-waits.ts `settled`), and a settled wait is
 * dropped; and a write of the session's steps that would undo a change it
 * has not written over since is refused once, naming the change
 * ({@link Plans.write}).
 *
 * Live, a session's followers (stream.ts) hear the plan as AG-UI state
 * events: a `plan.snapshot` when they subscribe or ask, or when a change
 * replaces most of it; else a `plan.delta`, the RFC 6902 patch from the last
 * revision. One queue per session orders every read and send, so a snapshot
 * and the deltas after it never cross.
 */
import type { ArtifactNeed } from "@cawco/core/artifact-needs";
import { detach } from "@cawco/core/detach";
import {
  type KeptStep,
  type OrphanedComments,
  type PlanChange,
  type PlanComment,
  type PlanDelta,
  type PlanEdit,
  type PlanReceiver,
  type PlanSnapshot,
  type PlanStep,
  planNeedsOf,
  type SessionPlan,
  stepNamesArtifact,
  stepRecord,
} from "@cawco/core/plan";
import type { InstanceRow } from "@cawco/core/protocol";
import { artifactLink, stepLink } from "@cawco/core/references";
import { unhandled } from "@cawco/core/unhandled";
import { waitArtifact, waitTarget } from "@cawco/core/wait-targets";
import { planWords } from "@cawco/core/words/plan";
import { Elysia, ElysiaStatus, problem } from "elysia";
import { createPatch } from "rfc6902";
import type { DbShape } from "./db";
import type { WorkItemRow } from "./db/project-work";
import type { PlanChangeRow } from "./db/session-plans";
import {
  sessionActor,
  type TaskActor,
  type TaskEvent,
  type Tasks,
  type TaskView,
  YOU_ACTOR,
} from "./tasks";

export interface PlansDeps {
  db: Pick<
    DbShape,
    | "artifacts"
    | "copySessionSteps"
    | "dropPlanWaits"
    | "getInstancesByIds"
    | "planChangesOf"
    | "planWaits"
    | "putPlanChange"
    | "putSessionSteps"
    | "sessionPlan"
    | "settlePlanChanges"
    | "unsettledPlanChanges"
    | "workItem"
  >;
  /** Needs you as it stands (artifacts/lane.ts `now`): what of a session's waits on the person, derived, never stored. */
  needs: () => readonly ArtifactNeed[];
  /** Fans a plan frame out to the session's followers (stream.ts). */
  publish: (instanceId: string, message: PlanSnapshot | PlanDelta) => void;
  tasks: Pick<Tasks, "get" | "todos" | "update" | "waitStates">;
}

interface Held {
  plan: SessionPlan;
  rev: number;
}

/** How many of a plan's latest changes it carries, for the panel's acknowledgements. */
const CHANGES_SHOWN = 20;

/**
 * A step as the session writes it (`todo_write`): the record it names, its
 * `waitsOn` the whole of what it waits on, none when left out. Comments are
 * the person's: never written.
 */
export type WrittenStep = Omit<KeptStep, "comments">;

/**
 * The person's comments through a write of the session's steps: each old
 * step's, and each orphaned one's, go to the new step naming the same
 * record, wherever it stands; those whose record no new step names are the
 * plan's orphaned comments.
 */
const keepComments = (
  before: readonly KeptStep[],
  orphaned: readonly OrphanedComments[],
  written: readonly WrittenStep[]
): { orphaned: OrphanedComments[]; steps: KeptStep[] } => {
  const byRecord = new Map<string, PlanComment[]>();
  for (const { step, comments } of [
    ...orphaned,
    ...before.map((one) => ({ step: one.id, comments: one.comments })),
  ]) {
    if (comments?.length) {
      byRecord.set(step, [...(byRecord.get(step) ?? []), ...comments]);
    }
  }
  const steps = written.map((step): KeptStep => {
    const comments = byRecord.get(step.id);
    byRecord.delete(step.id);
    return comments
      ? {
          ...step,
          comments: comments.toSorted((a, b) => a.at.localeCompare(b.at)),
        }
      : step;
  });
  return {
    steps,
    orphaned: [...byRecord].map(([step, comments]) => ({ step, comments })),
  };
};

/** The project a session's records live in: its own, else its work item's; null for a session in none. */
const recordsProjectOf = (
  db: Pick<DbShape, "workItem">,
  row: Pick<InstanceRow, "projectId" | "workItemId">
): string | null =>
  row.projectId ??
  (row.workItemId ? db.workItem(row.workItemId)?.projectId : null) ??
  null;

/** A task as a plan reads it: its view, or null once it is gone from the board. */
type TaskRead = TaskView | null;

/**
 * The tasks `handles` name in `projectId`, each read once: null for one the
 * board has no more; the refusal of a read that failed otherwise.
 */
const readTasks = async (
  tasks: Pick<Tasks, "get">,
  projectId: string | null,
  handles: readonly string[]
) => {
  const read = new Map<string, TaskRead>();
  for (const task of new Set(handles.map((one) => stepRecord(one).task))) {
    if (!projectId) {
      read.set(task, null);
      continue;
    }
    const view = await tasks.get(projectId, task);
    if (view instanceof ElysiaStatus) {
      if (view.status !== 404) {
        return view;
      }
      read.set(task, null);
      continue;
    }
    read.set(task, view);
  }
  return read;
};

/**
 * A kept step read whole from its record (`tasks`, {@link readTasks}): a
 * to-do's text and tick, a task's title and stage (done or dropped is
 * done); else the session's word, in progress or not. A record gone from
 * the board says so, the session's word kept.
 */
const readStep = (
  tasks: ReadonlyMap<string, TaskRead>,
  step: KeptStep
): PlanStep => {
  const record = stepRecord(step.id);
  const said = step.status === "in_progress" ? "in_progress" : "pending";
  const task = tasks.get(record.task) ?? null;
  const todo = record.todo
    ? task?.todos.find((one) => one.id === record.todo)
    : undefined;
  const gone = !task || (record.todo !== undefined && !todo);
  if (gone) {
    return {
      ...step,
      ...record,
      status: said,
      content: planWords.gone(step.id),
      gone: true,
    };
  }
  const done = todo
    ? todo.done
    : task.kind === "done" || task.kind === "dropped";
  return {
    ...step,
    ...record,
    status: done ? "completed" : said,
    content: todo ? todo.text : task.title,
  };
};

/** A plan's kept steps read whole from their records ({@link readStep}), or the refusal of a read. */
const readSteps = async (
  tasks: Pick<Tasks, "get">,
  projectId: string | null,
  steps: readonly KeptStep[]
) => {
  const read = await readTasks(
    tasks,
    projectId,
    steps.map((step) => step.id)
  );
  return read instanceof ElysiaStatus
    ? read
    : steps.map((step) => readStep(read, step));
};

/** The receiver's key, as `plan_changes.receiver` holds it. */
export const receiverKey = (to: PlanReceiver): string =>
  to.kind === "session" ? `session:${to.instanceId}` : `caw:${to.projectId}`;

/** A receiver key's kind, and the id after its first colon. */
const KEY_PARTS = /:(.*)/su;

/** The receiver a key names. */
export const receiverOfKey = (key: string): PlanReceiver => {
  const [kind, id = ""] = key.split(KEY_PARTS);
  return kind === "caw"
    ? { kind: "caw", projectId: id }
    : { kind: "session", instanceId: id };
};

/** A change as the plan carries it. */
const changeOf = (row: PlanChangeRow): PlanChange => ({
  id: row.id,
  kind: row.kind,
  step: row.step,
  was: row.was,
  words: row.words,
  at: row.at.toISOString(),
  to: receiverOfKey(row.receiver),
  ...(row.toldAt ? { toldAt: row.toldAt.toISOString() } : {}),
  ...(row.undelivered ? { undelivered: row.undelivered } : {}),
});

/** A step and the sub-steps under it: its place and the place past its last sub-step. */
const blockOf = (steps: PlanStep[], at: number): [number, number] => {
  const depth = steps[at]?.depth ?? 0;
  let end = at + 1;
  while (end < steps.length && (steps[end]?.depth ?? 0) > depth) {
    end += 1;
  }
  return [at, end];
};

/**
 * Whether a session's write of `steps` would undo the person's change: an
 * added step gone, a removed one back, an untick ticked again. A reword, a
 * comment or a move is never undone by it.
 */
const undoes = (steps: WrittenStep[], change: PlanChangeRow): boolean => {
  const step = steps.find((one) => one.id === change.step);
  switch (change.kind) {
    // A reword is the record's: the session's steps carry no words.
    case "reword":
      return false;
    case "add":
      return step === undefined;
    case "remove":
      return step !== undefined;
    // A completed step ticks its to-do; one written open unticks nothing.
    case "tick":
      return (
        step !== undefined &&
        change.words === "not done" &&
        step.status === "completed"
      );
    // A write keeps each step's comments by id ({@link Plans.write}), so it
    // cannot take one back.
    case "comment":
      return false;
    // The order is the session's to keep: a move is bookkeeping (Projects
    // spec §5.2 "The plan model", point 3), and the write's order stands.
    case "move":
      return false;
    default:
      unhandled("plan change", change.kind);
  }
};

/** One change as a message says it: what the person did, in their words. */
export const changeLine = (
  change: Pick<PlanChangeRow, "kind" | "was" | "words">
): string => {
  switch (change.kind) {
    case "reword":
      return `Reworded “${change.was}” to: “${change.words}”`;
    case "add":
      return change.was
        ? `Added a step after “${change.was}”: “${change.words}”`
        : `Added a step: “${change.words}”`;
    case "remove":
      return `Removed “${change.was}”`;
    case "comment":
      return `Commented on “${change.was}”: “${change.words}”`;
    case "tick":
      return change.words === "done"
        ? `Ticked “${change.was}” done`
        : `Unticked “${change.was}”: not done`;
    case "move":
      return `Moved “${change.was}” ${change.words}`;
    default:
      return `Changed “${change.was}”`;
  }
};

/** Each status's box, as a message lists a step. */
const BOX: Record<PlanStep["status"], string> = {
  completed: "[x]",
  in_progress: "[~]",
  pending: "[ ]",
};

/** The page a step waits on, by its link (its name the label); a page gone, said so. */
const pageNamed = (db: Pick<DbShape, "artifacts">, id: string): string => {
  const page = db.artifacts.get(id);
  return page ? artifactLink(page.id, page.title) : "a page since removed";
};

/** What a step waits on, in a message's words: a card or pin by its page's link, any other target as kept. */
const waitWords = (db: Pick<DbShape, "artifacts">, handle: string): string => {
  const target = waitTarget(handle);
  switch (target?.kind) {
    case "card":
      return `the person's pick on ${pageNamed(db, target.artifactId)}`;
    case "pin":
      return `pin ${target.number} on ${pageNamed(db, target.artifactId)}`;
    case "session":
      return "a session's work";
    case "task":
    case "pr":
    case "run":
    case "time":
    case undefined:
      return handle;
  }
};

/**
 * A plan's steps as a message lists them: a box per status, nested by
 * indent, each by its link (session `session`'s, its record's words the
 * label), a wait by what it waits on.
 */
export const stepLines = (
  db: Pick<DbShape, "artifacts">,
  session: string,
  steps: readonly PlanStep[]
): string =>
  steps.length === 0
    ? "(no steps)"
    : steps
        .map((step) => {
          const box = BOX[step.status];
          const wait = step.waitsOn
            ? ` (waiting on ${waitWords(db, step.waitsOn)})`
            : "";
          return `${"  ".repeat(step.depth)}- ${box} ${stepLink(session, step.id, step.content)}${wait}`;
        })
        .join("\n");

/** A change to the record a step names, as the person's edit makes it: a to-do's, or a task's title. */
type RecordChange =
  | { task: string; todos: Parameters<Tasks["todos"]>[2] }
  | { task: string; patch: { title: string } };

/** What one of the person's edits made of a plan's steps, and how its change reads. */
interface Applied {
  /** The change it makes to the record its step names, when it is a reword or a tick. */
  record?: RecordChange;
  step: string;
  steps: PlanStep[];
  /** The step's words before it; for an add, the step it follows ("" at the top). */
  was: string;
  /** The person's words (core `PlanChange.words`). */
  words: string;
}

/** Step `id` of `steps` and its place; refused when the plan has no such step. */
const placeOf = (steps: PlanStep[], id: string) => {
  const index = steps.findIndex((one) => one.id === id);
  const step = steps[index];
  if (!step) {
    return problem(404, {
      code: "plan-step-missing",
      detail: `This plan has no step ${id}: it may have changed since you opened it.`,
    });
  }
  return { index, step };
};

/** Step `id` of `steps` and where the block it heads (it and its children) starts and ends; refused when the plan has no such step. */
const blockAt = (steps: PlanStep[], id: string) => {
  const placed = placeOf(steps, id);
  if (placed instanceof ElysiaStatus) {
    return placed;
  }
  const [start, end] = blockOf(steps, placed.index);
  return { step: placed.step, start, end };
};

/** The person's words, trimmed; refused when there are none. */
const wordsOf = (given: string, what: string) => {
  const words = given.trim();
  if (!words) {
    return problem(400, {
      code: "plan-words-missing",
      detail: `${what} needs words.`,
    });
  }
  return words;
};

/** A step whose record the board has no more: nothing of its record changes. */
const goneProblem = (step: PlanStep) =>
  problem(409, {
    code: "plan-step-gone",
    detail: `${step.id} is no longer on the board, so it does not change.`,
  });

/** A reword of a step is its record's: the to-do's text, or the task's title. */
const reword = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "reword" }>
) => {
  const placed = placeOf(steps, edit.step);
  if (placed instanceof ElysiaStatus) {
    return placed;
  }
  const { step } = placed;
  if (step.gone) {
    return goneProblem(step);
  }
  const words = wordsOf(edit.content, "A step");
  if (words instanceof ElysiaStatus) {
    return words;
  }
  if (words === step.content) {
    return problem(400, {
      code: "plan-step-unchanged",
      detail: "The step reads the same as before.",
    });
  }
  const applied: Applied = {
    steps,
    step: step.id,
    was: step.content,
    words,
    record: step.todo
      ? { task: step.task, todos: { edit: [{ todo: step.todo, text: words }] } }
      : { task: step.task, patch: { title: words } },
  };
  return applied;
};

/** A step naming `added` (read from its record), after step `after` at its depth, or at the plan's end. */
const add = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "add" }>,
  added: PlanStep
) => {
  if (steps.some((one) => one.id === added.id)) {
    return problem(409, {
      code: "plan-step-there",
      detail: `“${added.content}” is in this plan already.`,
    });
  }
  const next = [...steps];
  if (edit.after === undefined) {
    next.push({ ...added, depth: 0 });
    const last: Applied = {
      steps: next,
      step: added.id,
      was: steps.at(-1)?.content ?? "",
      words: added.content,
    };
    return last;
  }
  const placed = placeOf(steps, edit.after);
  if (placed instanceof ElysiaStatus) {
    return placed;
  }
  const { index, step: after } = placed;
  const [, end] = blockOf(steps, index);
  next.splice(end, 0, { ...added, depth: after.depth });
  const applied: Applied = {
    steps: next,
    step: added.id,
    was: after.content,
    words: added.content,
  };
  return applied;
};

const remove = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "remove" }>
) => {
  const block = blockAt(steps, edit.step);
  if (block instanceof ElysiaStatus) {
    return block;
  }
  const { step, start, end } = block;
  const next = [...steps];
  next.splice(start, end - start);
  const applied: Applied = {
    steps: next,
    step: step.id,
    was: step.content,
    words: "",
  };
  return applied;
};

const comment = (
  steps: PlanStep[],
  edit: Extract<PlanEdit, { kind: "comment" }>,
  at: Date
) => {
  const placed = placeOf(steps, edit.step);
  if (placed instanceof ElysiaStatus) {
    return placed;
  }
  const { index, step } = placed;
  const words = wordsOf(edit.text, "A comment");
  if (words instanceof ElysiaStatus) {
    return words;
  }
  const next = [...steps];
  next[index] = {
    ...step,
    comments: [...(step.comments ?? []), { at: at.toISOString(), text: words }],
  };
  const applied: Applied = {
    steps: next,
    step: step.id,
    was: step.content,
    words,
  };
  return applied;
};

/** A tick of a step is its to-do's; a task's step is done when its stage is, so it takes none. */
const tick = (steps: PlanStep[], edit: Extract<PlanEdit, { kind: "tick" }>) => {
  const placed = placeOf(steps, edit.step);
  if (placed instanceof ElysiaStatus) {
    return placed;
  }
  const { step } = placed;
  if (step.gone) {
    return goneProblem(step);
  }
  if (!step.todo) {
    return problem(409, {
      code: "plan-step-follows-stage",
      detail: `“${step.content}” is a task: its step is done when the task's stage is. Move the task instead.`,
    });
  }
  if ((step.status === "completed") === edit.done) {
    return problem(409, {
      code: "plan-step-ticked-already",
      detail: `“${step.content}” is ${edit.done ? "done" : "not done"} already.`,
    });
  }
  const applied: Applied = {
    steps,
    step: step.id,
    was: step.content,
    words: edit.done ? "done" : "not done",
    record: {
      task: step.task,
      todos: edit.done ? { tick: [step.todo] } : { untick: [step.todo] },
    },
  };
  return applied;
};

/** Where the step at `start` (depth `depth`) goes one place up: the start of the sibling before it. */
const siblingBefore = (
  steps: PlanStep[],
  start: number,
  depth: number
): number | undefined => {
  let before = start - 1;
  while (before >= 0 && (steps[before]?.depth ?? 0) > depth) {
    before -= 1;
  }
  return before >= 0 && (steps[before]?.depth ?? 0) === depth
    ? before
    : undefined;
};

const move = (steps: PlanStep[], edit: Extract<PlanEdit, { kind: "move" }>) => {
  const found = blockAt(steps, edit.step);
  if (found instanceof ElysiaStatus) {
    return found;
  }
  const { step, start, end } = found;
  const block = steps.slice(start, end);
  const next = [...steps];
  if (edit.by === -1) {
    const before = siblingBefore(steps, start, step.depth);
    if (before === undefined) {
      return problem(409, {
        code: "plan-step-first-at-level",
        detail: `“${step.content}” is the first step at its level.`,
      });
    }
    next.splice(start, block.length);
    next.splice(before, 0, ...block);
  } else {
    if (end >= steps.length || (steps[end]?.depth ?? 0) !== step.depth) {
      return problem(409, {
        code: "plan-step-last-at-level",
        detail: `“${step.content}” is the last step at its level.`,
      });
    }
    const [, nextEnd] = blockOf(steps, end);
    next.splice(start, nextEnd - start, ...steps.slice(end, nextEnd), ...block);
  }
  const applied: Applied = {
    steps: next,
    step: step.id,
    was: step.content,
    words: edit.by === -1 ? "up" : "down",
  };
  return applied;
};

/**
 * The person's edit applied to a plan's steps (read whole from their
 * records); refused, in words, when it names no step or changes nothing.
 * `added`: an add's step, read from its record.
 */
const applyEdit = (
  steps: PlanStep[],
  edit: PlanEdit,
  at: Date,
  added: PlanStep | undefined
) => {
  switch (edit.kind) {
    case "reword":
      return reword(steps, edit);
    case "add":
      return added
        ? add(steps, edit, added)
        : problem(404, {
            code: "plan-step-record-unknown",
            detail: `${edit.step} names no task or to-do on this session's board.`,
          });
    case "remove":
      return remove(steps, edit);
    case "comment":
      return comment(steps, edit, at);
    case "tick":
      return tick(steps, edit);
    case "move":
      return move(steps, edit);
    default:
      unhandled("edit", edit);
  }
};

/** A step as it is kept: its record by handle, none of the words read from it. */
const keptOf = ({
  content: _content,
  gone: _gone,
  task: _task,
  todo: _todo,
  ...kept
}: PlanStep): KeptStep => kept;

/** The session `instanceId`, or its problem: the hub has none. */
export const planSessionOf = (
  db: Pick<DbShape, "getInstancesByIds">,
  instanceId: string
) => {
  const [row] = db.getInstancesByIds([instanceId]);
  if (!row) {
    return problem(404, {
      code: "plan-session-unknown",
      detail: "No session with that id on this hub.",
    });
  }
  return row;
};

export const createPlans = (deps: PlansDeps) => {
  const { db } = deps;
  /** The plan each session's followers last heard, by instance. */
  const held = new Map<string, Held>();
  /** Each session's queue: every read and send for it runs in turn. */
  const queues = new Map<string, Promise<unknown>>();

  const inTurn = <T>(
    instanceId: string,
    work: () => Promise<T>
  ): Promise<T> => {
    const next = (queues.get(instanceId) ?? Promise.resolve()).then(work, work);
    const tail = next.catch(() => undefined);
    queues.set(instanceId, tail);
    detach(
      tail.then(() => {
        if (queues.get(instanceId) === tail) {
          queues.delete(instanceId);
        }
      }),
      "plan queue cleanup"
    );
    return next;
  };

  const rowOf = (instanceId: string) => planSessionOf(db, instanceId);

  /** An attempt's task and its to-dos, read for its plan; nothing for a session that is no attempt. */
  const attemptOf = async (row: InstanceRow) => {
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    if (!(item?.taskId && item.projectId)) {
      return {};
    }
    const task = await deps.tasks.get(item.projectId, item.taskId);
    return task instanceof ElysiaStatus
      ? task
      : { taskId: item.taskId, todos: task.todos };
  };

  /** The session's steps as they stand, each read whole from its record ({@link readSteps}). */
  const stepsNow = (row: InstanceRow) =>
    readSteps(
      deps.tasks,
      recordsProjectOf(db, row),
      db.sessionPlan(row.id)?.steps ?? []
    );

  /** The plan as it stands now: the session's own steps, read from their records, and an attempt's to-dos. */
  const compute = async (row: InstanceRow) => {
    const own = db.sessionPlan(row.id);
    const attempt = await attemptOf(row);
    if (attempt instanceof ElysiaStatus) {
      return attempt;
    }
    const steps = await readSteps(
      deps.tasks,
      recordsProjectOf(db, row),
      own?.steps ?? []
    );
    if (steps instanceof ElysiaStatus) {
      return steps;
    }
    const changes = db.planChangesOf(row.id, CHANGES_SHOWN).map(changeOf);
    const needs = planNeedsOf(row.id, steps, deps.needs());
    const plan: SessionPlan = {
      source: "cawco",
      steps,
      ...(needs.length > 0 ? { needs } : {}),
      ...(own?.orphanedComments.length
        ? { orphanedComments: own.orphanedComments }
        : {}),
      ...(changes.length > 0 ? { changes } : {}),
      ...attempt,
    };
    return plan;
  };

  /**
   * A write of `steps` that would undo a change the person made since the
   * session last wrote its steps: thrown, naming each and the plan as it
   * stands, or the refusal of reading it. The changes are settled either
   * way: the session has heard them, so its next write goes through.
   */
  const undoRefused = async (row: InstanceRow, steps: WrittenStep[]) => {
    const undone = db
      .unsettledPlanChanges(row.id)
      .filter((change) => undoes(steps, change));
    db.settlePlanChanges(row.id);
    if (undone.length === 0) {
      return;
    }
    const now = await stepsNow(row);
    if (now instanceof ElysiaStatus) {
      return now;
    }
    throw new Error(
      `Not written: the person changed your plan since you last wrote it, and these steps would undo it:\n${undone.map((change) => `- ${changeLine(change)}`).join("\n")}\n\nYour plan as it stands now:\n${stepLines(db, row.id, now)}\n\nWrite your steps again from it: the next write goes through as you give it.`
    );
  };

  /**
   * A change to a record the person's edit makes (a to-do reworded or
   * ticked, a task retitled), as theirs; the refusal of one that did not go.
   */
  const actOn = async (projectId: string | null, change: RecordChange) => {
    if (!projectId) {
      return problem(409, {
        code: "plan-session-no-project",
        detail: "This session is in no project, so its plan names no task.",
      });
    }
    const done =
      "todos" in change
        ? await deps.tasks.todos(
            projectId,
            change.task,
            change.todos,
            YOU_ACTOR
          )
        : await deps.tasks.update(
            projectId,
            change.task,
            change.patch,
            YOU_ACTOR
          );
    return done instanceof ElysiaStatus ? done : undefined;
  };

  /**
   * Ticks each to-do a session's write completes that is not ticked yet, as
   * the session, one commit per task; the refusal of one that did not go.
   */
  const tickCompleted = async (
    row: InstanceRow,
    projectId: string | null,
    steps: readonly PlanStep[],
    written: readonly WrittenStep[],
    actor: TaskActor
  ) => {
    const open = new Map(
      steps.flatMap((step) =>
        step.todo && !step.gone && step.status !== "completed"
          ? [[step.id, step] as const]
          : []
      )
    );
    const ticks = Map.groupBy(
      written.flatMap((step) => {
        const read = open.get(step.id);
        return step.status === "completed" && read?.todo
          ? [{ task: read.task, todo: read.todo }]
          : [];
      }),
      (one) => one.task
    );
    if (!projectId || ticks.size === 0) {
      return;
    }
    for (const [task, todos] of ticks) {
      const ticked = await deps.tasks.todos(
        projectId,
        task,
        { tick: todos.map((one) => one.todo) },
        actor
      );
      if (ticked instanceof ElysiaStatus) {
        return ticked;
      }
    }
    console.info(
      `[plans] ${row.id.slice(0, 8)}: its plan completed ${[...ticks.values()].flat().length} to-do(s), ticked`
    );
  };

  const snapshotOf = (
    instanceId: string,
    { plan, rev }: Held
  ): PlanSnapshot => ({
    type: "plan.snapshot",
    instanceId,
    rev,
    ...plan,
  });

  /**
   * Reads the plan and tells the followers what changed: nothing, a delta
   * from the last revision, or a snapshot when the change is most of it.
   */
  /**
   * A step's wait the resolver settles now is dropped from it (task-waits.ts
   * `settled`, read in the session's project): what stopped a step waiting
   * on a card once its page's Send carried a pick, for every kind of wait.
   */
  const dropSettled = async (row: InstanceRow) => {
    const handles = db.planWaits(row.id);
    const states = await deps.tasks.waitStates(row.projectId ?? null, handles);
    if (states instanceof ElysiaStatus) {
      return states;
    }
    db.dropPlanWaits(
      row.id,
      handles.filter((_, at) => states[at]?.settled)
    );
  };

  const settle = (instanceId: string) =>
    inTurn(instanceId, async () => {
      const row = rowOf(instanceId);
      if (row instanceof ElysiaStatus) {
        return row;
      }
      const dropped = await dropSettled(row);
      if (dropped) {
        return dropped;
      }
      const plan = await compute(row);
      if (plan instanceof ElysiaStatus) {
        return plan;
      }
      const before = held.get(instanceId);
      if (!before) {
        const first: Held = { plan, rev: 1 };
        held.set(instanceId, first);
        deps.publish(instanceId, snapshotOf(instanceId, first));
        return first;
      }
      const patch = createPatch(before.plan, plan);
      if (patch.length === 0) {
        return before;
      }
      const after: Held = { plan, rev: before.rev + 1 };
      held.set(instanceId, after);
      deps.publish(
        instanceId,
        JSON.stringify(patch).length < JSON.stringify(plan).length
          ? { type: "plan.delta", instanceId, rev: after.rev, patch }
          : snapshotOf(instanceId, after)
      );
      return after;
    });

  /** A plan read that could not be, in the hub's log. */
  const unread = (instanceId: string, words: string) =>
    console.warn(`[plans] ${instanceId}: ${words}`);

  const settleQuietly = (instanceId: string): void => {
    settle(instanceId).then(
      (settled) => {
        if (settled instanceof ElysiaStatus) {
          unread(instanceId, settled.response.detail);
        }
      },
      (error: unknown) =>
        unread(
          instanceId,
          error instanceof Error ? error.message : String(error)
        )
    );
  };

  return {
    /**
     * The session is being deleted: the plan its followers last heard goes,
     * so a follower that subscribes is answered from its row, which no
     * longer reads.
     */
    forget(instanceId: string): void {
      held.delete(instanceId);
    },

    /** What `GET /api/instances/:id/plan` answers: read now, and the followers told of any change. */
    async read(instanceId: string) {
      const settled = await settle(instanceId);
      return settled instanceof ElysiaStatus ? settled : settled.plan;
    },

    /**
     * A follower subscribed, or found a gap: the plan whole, to it alone,
     * in turn with every delta so none lands before it.
     */
    snapshotTo(
      instanceId: string,
      send: (message: PlanSnapshot) => void
    ): void {
      inTurn(instanceId, async () => {
        const known = held.get(instanceId);
        if (known) {
          send(snapshotOf(instanceId, known));
          return;
        }
        const row = rowOf(instanceId);
        if (row instanceof ElysiaStatus) {
          return row;
        }
        const plan = await compute(row);
        if (plan instanceof ElysiaStatus) {
          return plan;
        }
        const first = { plan, rev: 1 };
        held.set(instanceId, first);
        send(snapshotOf(instanceId, first));
      }).then(
        (refused) => {
          if (refused) {
            unread(instanceId, refused.response.detail);
          }
        },
        (error: unknown) =>
          unread(
            instanceId,
            error instanceof Error ? error.message : String(error)
          )
      );
    },

    /**
     * `todo_write`'s session scope: the session's steps, replaced whole,
     * every step's `waitsOn` with them: exactly what the write names. Each
     * step names a task or a to-do of the session's project; one that names
     * none on its board is refused, naming it. A to-do whose step it
     * completes is ticked, as the session. The person's comments stay on the
     * step naming the same record, else on the plan ({@link keepComments});
     * an artifact asked at work on the plan stays held by its ask (needs.ts
     * `planHolds`), whatever the steps become. A write that would undo a
     * change the person made since the session last wrote its steps is
     * refused, naming each and the plan as it stands; the next write goes
     * through, whatever it says: the session has heard them.
     */
    async write(row: InstanceRow, steps: WrittenStep[]) {
      const projectId = recordsProjectOf(db, row);
      const read = await readSteps(deps.tasks, projectId, steps);
      if (read instanceof ElysiaStatus) {
        return read;
      }
      const unknown = read.filter((step) => step.gone);
      if (unknown.length > 0) {
        return problem(400, {
          code: "todo-step-record-unknown",
          detail: projectId
            ? `${unknown.map((step) => step.id).join(", ")} ${unknown.length === 1 ? "names" : "name"} no task or to-do on your project's board. A step names a task or a to-do: file the task (task_create), or the to-do on its task (todo_write with task and add), first.`
            : "You are in no project, so there is no task or to-do for a step to name: a plan's steps are a project's tasks and to-dos.",
        });
      }
      const plan = db.sessionPlan(row.id);
      const before = plan?.steps ?? [];
      const undoing = await undoRefused(row, steps);
      if (undoing) {
        return undoing;
      }
      const ticked = await tickCompleted(
        row,
        projectId,
        read,
        steps,
        sessionActor(row)
      );
      if (ticked) {
        return ticked;
      }
      const kept = keepComments(before, plan?.orphanedComments ?? [], steps);
      db.putSessionSteps(row.id, kept.steps, kept.orphaned);
      const settled = await settle(row.id);
      return settled instanceof ElysiaStatus ? settled : settled.plan;
    },

    /**
     * The person's change to a session's plan, applied to its steps and kept
     * in their words, for `to`; `settled` when the plan's own session never
     * hears it. Refused, in words, when it names no step of the plan or
     * changes nothing.
     */
    async edit(
      row: InstanceRow,
      edit: PlanEdit,
      to: PlanReceiver,
      settled: boolean
    ) {
      const at = new Date();
      const projectId = recordsProjectOf(db, row);
      const current = await stepsNow(row);
      if (current instanceof ElysiaStatus) {
        return current;
      }
      const added =
        edit.kind === "add"
          ? await readSteps(deps.tasks, projectId, [
              { id: edit.step.trim(), depth: 0, status: "pending" },
            ])
          : undefined;
      if (added instanceof ElysiaStatus) {
        return added;
      }
      const named = added?.[0];
      const applied = applyEdit(
        current,
        edit,
        at,
        named && !named.gone ? named : undefined
      );
      if (applied instanceof ElysiaStatus) {
        return applied;
      }
      if (applied.record) {
        const refused = await actOn(projectId, applied.record);
        if (refused) {
          return refused;
        }
      }
      const { steps, step, was, words } = applied;
      const change: PlanChangeRow = {
        id: crypto.randomUUID(),
        instanceId: row.id,
        receiver: receiverKey(to),
        kind: edit.kind,
        step,
        was,
        words,
        at,
        toldAt: null,
        sentUuid: null,
        settled,
        undelivered: null,
      };
      db.putSessionSteps(row.id, steps.map(keptOf));
      db.putPlanChange(change);
      const now = await settle(row.id);
      return now instanceof ElysiaStatus ? now : change;
    },

    /** A wait of the session's steps may have settled (a page's picks moved): the plan is read again, settled waits dropped. */
    waitsMoved(instanceId: string): void {
      settleQuietly(instanceId);
    },

    /**
     * The clock passed from `from` to `to` (waits.ts's minute): each
     * followed plan with a step waiting on a date in between is read again,
     * a session in no project's among them, since no task event reaches it.
     */
    clockMoved(from: number, to: number): void {
      for (const [instanceId, { plan }] of held) {
        if (
          plan.steps.some((step) => {
            const target = step.waitsOn ? waitTarget(step.waitsOn) : undefined;
            return (
              target?.kind === "time" && from < target.at && target.at <= to
            );
          })
        ) {
          settleQuietly(instanceId);
        }
      }
    },

    /** Page `artifactId`'s picks or pins moved: each followed plan with a step waiting on a card or pin of it is read again. */
    pageMoved(artifactId: string): void {
      for (const [instanceId, { plan }] of held) {
        if (
          plan.steps.some(
            (step) =>
              step.waitsOn !== undefined &&
              waitArtifact(step.waitsOn) === artifactId
          )
        ) {
          settleQuietly(instanceId);
        }
      }
    },

    /**
     * The step of its plan session `instanceId` asks artifact `artifactId`
     * of the person at (its maker's `artifact_create` or `artifact_update`
     * with `does: pick` or `judge` returned): the open one whose `waitsOn`
     * names it, else the first in progress; null when it is at work on none.
     * The ask keeps it (needs.ts `ArtifactAsked.step`), which holds the ask
     * until it is answered or deleted (needs.ts `planHolds`); nothing here
     * is written.
     */
    askedAt(instanceId: string, artifactId: string): string | null {
      const steps = db.sessionPlan(instanceId)?.steps ?? [];
      const at =
        steps.find((step) => stepNamesArtifact(step, artifactId)) ??
        steps.find((step) => step.status === "in_progress");
      return at?.id ?? null;
    },

    /** The session's steps as they stand: an open one naming a card or pin of an artifact holds its ask (needs.ts `planHolds`). */
    steps(instanceId: string): readonly KeptStep[] {
      return db.sessionPlan(instanceId)?.steps ?? [];
    },

    /**
     * Needs you moved (artifacts/lane.ts, as it tells every screen): each
     * followed plan whose own needs it changes is read again, so the panel
     * says what Needs you says.
     */
    needsMoved(needs: readonly ArtifactNeed[]): void {
      for (const [instanceId, { plan }] of held) {
        const now = planNeedsOf(instanceId, plan.steps, needs);
        if (!Bun.deepEquals(now, plan.needs ?? [])) {
          settleQuietly(instanceId);
        }
      }
    },

    /**
     * A session's steps start another's plan: the new session that goes on
     * from an ended one, steps that did not read kept with them (db
     * `copySessionSteps`). What of the ended one's waits on the person stays
     * its own: each artifact was asked by it (needs.ts `ArtifactAsked.by`).
     */
    copySteps(from: string, to: string): void {
      db.copySessionSteps(from, to);
    },

    /**
     * The session's steps as the hub last read them whole for its followers,
     * else as kept with each record's handle for its words: what a message
     * that cannot wait for a read lists (plan-changes.ts `foldInto`).
     */
    known(instanceId: string): PlanStep[] {
      const known = held.get(instanceId);
      if (known) {
        return known.plan.steps;
      }
      return (db.sessionPlan(instanceId)?.steps ?? []).map((step) => ({
        ...step,
        ...stepRecord(step.id),
        content: step.id,
      }));
    },

    /** The session's steps now, each read whole from its record, or the refusal of a read. */
    stepsNow: (instanceId: string) => {
      const row = rowOf(instanceId);
      return row instanceof ElysiaStatus ? Promise.resolve(row) : stepsNow(row);
    },

    /** The plan's followers hear its changes' new state (told, or reaching no one). */
    changed(instanceId: string): void {
      settleQuietly(instanceId);
    },

    /**
     * A project's tasks changed, or what they wait on moved (tasks.ts
     * `waitsMoved` emits it for a task, a card, a pull request, a run or a
     * condition): an attempt's to-dos may have ticked, a task or to-do a
     * step names may have moved, been reworded or ticked, and any step of a
     * session in the project that waits on something may have settled. Each
     * such followed plan is read again.
     */
    taskChanged(event: TaskEvent): void {
      for (const [instanceId, { plan }] of held) {
        const waits = plan.steps.some((step) => step.waitsOn !== undefined);
        const names = plan.steps.some(
          (step) => event.id === undefined || step.task === event.id
        );
        if (!(plan.taskId || waits || names)) {
          continue;
        }
        const [row] = db.getInstancesByIds([instanceId]);
        if (
          (waits || names) &&
          row &&
          recordsProjectOf(db, row) === event.projectId
        ) {
          settleQuietly(instanceId);
          continue;
        }
        const item = row?.workItemId ? db.workItem(row.workItemId) : undefined;
        const task = event.id;
        if (
          plan.taskId &&
          item?.projectId === event.projectId &&
          (task === undefined || task === item.taskId)
        ) {
          settleQuietly(instanceId);
        }
      }
    },

    /**
     * A work item ended: each followed plan with a step waiting on its
     * session (`<dir>#<session id>`, core wait-targets.ts) is read again,
     * so the step settles, or is flagged, as the item ends.
     */
    itemEnded(item: Pick<WorkItemRow, "instanceId">): void {
      for (const [instanceId, { plan }] of held) {
        if (
          plan.steps.some((step) => {
            const target =
              step.waitsOn === undefined ? undefined : waitTarget(step.waitsOn);
            return (
              target?.kind === "session" &&
              target.instanceId === item.instanceId
            );
          })
        ) {
          settleQuietly(instanceId);
        }
      }
    },
  };
};

export type Plans = ReturnType<typeof createPlans>;

/** `GET /api/instances/:id/plan`: the session's plan, as its followers hold it. */
export const planRoutes = (plans: Plans) =>
  new Elysia().get("/api/instances/:id/plan", ({ params }) =>
    plans.read(params.id)
  );
