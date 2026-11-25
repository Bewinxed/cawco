import {
  PLAN_WAKING_EDITS,
  type PlanChange,
  type PlanComment,
  type PlanEdit,
  type PlanStep,
  type StepRecord,
  stepHandle,
  stepRecord,
  type TaskTodo,
  todoGroups,
} from "@cawco/core/plan";
import { unhandled } from "@cawco/core/unhandled";
import type { StageKind } from "@cawco/core/views";
import { type WaitTarget, waitTarget } from "@cawco/core/wait-targets";
import { planWords } from "@cawco/core/words/plan";
import type {
  DelegateSessionRecord,
  DerivedPlanModel,
  DerivedPlanTask,
  DerivedPlanTodo,
  PlanPhase,
  PlanTaskRecord,
  PlanViewDataset,
  ResolvedWait,
  WaitMeta,
} from "./types.js";

function formatTargetWait(
  handle: string,
  target: WaitTarget,
  tasks: Record<string, PlanTaskRecord>
): ResolvedWait {
  switch (target.kind) {
    case "task": {
      const blocker = tasks[target.id];
      return {
        handle,
        target,
        label: blocker
          ? `Waiting for “${blocker.title}” to finish`
          : "Waiting for an earlier task to finish",
        detail: blocker
          ? `Proceeds automatically once “${blocker.title}” (${blocker.stage}) reaches Done.`
          : `Proceeds automatically once ${target.id} reaches Done.`,
        actionLabel: blocker ? "Open blocking task" : `Open ${target.id}`,
      };
    }
    case "pr":
      return {
        handle,
        target,
        label: `Waiting for pull request #${target.number} to merge`,
        detail: `Pull request #${target.number} on ${target.repo} must merge or close before this step continues.`,
        actionLabel: `Open pull request #${target.number}`,
      };
    case "run":
      return {
        handle,
        target,
        label: "Waiting for automated checks to finish",
        detail: `Check run on ${target.repo} is still running.`,
        actionLabel: "Open check run",
      };
    case "session":
      return {
        handle,
        target,
        label: `Waiting for another session in ${target.dir || "workspace"} to finish`,
        detail:
          "Settles automatically once that session finishes its current work.",
        actionLabel: "Open waited session",
      };
    case "card":
      return {
        handle,
        target,
        label: "Waiting on your choice on a decision page",
        detail: target.option
          ? `Continues once “${target.option}” is chosen on the decision page.`
          : "Needs your choice on the decision page before the session can continue.",
        actionLabel: "Open decision page",
      };
    case "pin":
      return {
        handle,
        target,
        label: `Waiting on your reply to comment #${target.number}`,
        detail:
          "Needs your answer on the pinned comment before work continues.",
        actionLabel: `Open comment #${target.number}`,
      };
    case "time": {
      const formatted = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(new Date(target.at));
      return {
        handle,
        target,
        label: `Paused until ${formatted} UTC`,
        detail: "Wakes automatically once this scheduled window opens.",
        actionLabel: "Clear scheduled pause",
      };
    }
    default:
      return unhandled("wait target", target);
  }
}

/** Resolves a `waitsOn` handle into plain human words and an explicit action label. */
function resolveWait(
  handle: string | undefined,
  waitMeta: Record<string, WaitMeta>,
  tasks: Record<string, PlanTaskRecord>
): ResolvedWait | null {
  if (!handle) {
    return null;
  }
  const target = waitTarget(handle);
  const known = waitMeta[handle];
  if (known) {
    return {
      handle,
      target,
      label: known.label,
      detail: known.detail,
      actionLabel: known.actionLabel,
    };
  }
  if (!target) {
    return {
      handle,
      target: undefined,
      label: "Paused on an external check",
      detail: "Settles automatically when the waited condition completes.",
      actionLabel: "Inspect wait condition",
    };
  }
  return formatTargetWait(handle, target, tasks);
}

/** Derives a task's phase from its board record, step status, and waits. */
function deriveTaskPhase(
  step: PlanStep,
  record: PlanTaskRecord | null,
  hasAnyWait: boolean,
  hasActiveTodo: boolean
): PlanPhase {
  if (step.gone || !record) {
    return "gone";
  }
  if (
    record.stageKind === "done" ||
    record.stageKind === "dropped" ||
    step.status === "completed"
  ) {
    return "done";
  }
  if (
    hasAnyWait ||
    record.stageKind === "waiting" ||
    record.stageKind === "you"
  ) {
    return "held";
  }
  if (
    step.status === "in_progress" ||
    record.stageKind === "active" ||
    hasActiveTodo
  ) {
    return "moving";
  }
  return "ahead";
}

function isWaitNeedingPerson(wait: ResolvedWait | null): boolean {
  const kind = wait?.target?.kind;
  return kind === "card" || kind === "pin";
}

function buildTaskSentence(opts: {
  agreedDone: number;
  agreedTotal: number;
  delegate: DelegateSessionRecord | null;
  needsYou: boolean;
  phase: PlanPhase;
  wait: ResolvedWait | null;
}): string {
  const { phase, needsYou, wait, delegate, agreedDone, agreedTotal } = opts;
  if (phase === "gone") {
    return "Removed from the project board";
  }
  if (phase === "done") {
    return delegate ? `Finished by ${delegate.title}` : "Finished";
  }
  if (needsYou) {
    return wait ? wait.label : "Waiting on your decision";
  }
  if (phase === "held") {
    return wait ? wait.label : "Paused until upstream work finishes";
  }
  if (phase === "moving") {
    const progress =
      agreedTotal > 0
        ? `${agreedDone} of ${agreedTotal} to-dos done`
        : "working now";
    return delegate
      ? `In progress with ${delegate.title} · ${progress}`
      : `In progress · ${progress}`;
  }
  if (wait) {
    return wait.label;
  }
  if (agreedTotal > 0) {
    return `Up next · ${agreedTotal} ${agreedTotal === 1 ? "to-do" : "to-dos"}`;
  }
  return "Up next";
}

function buildPlanOverviewLine(
  total: number,
  doneCount: number,
  movingCount: number,
  needsYouCount: number
): string {
  const parts = [`${doneCount} of ${total} tasks finished`];
  if (movingCount > 0) {
    parts.push(`${movingCount} in progress`);
  }
  if (needsYouCount > 0) {
    parts.push(
      `${needsYouCount} ${needsYouCount === 1 ? "needs" : "need"} you`
    );
  }
  return parts.join(" · ");
}

function stepStatusForStage(
  stageKind: StageKind | undefined
): PlanStep["status"] {
  if (stageKind === "done" || stageKind === "dropped") {
    return "completed";
  }
  if (stageKind === "active") {
    return "in_progress";
  }
  return "pending";
}

function indexPlanSteps(
  steps: readonly PlanStep[],
  tasks: Record<string, PlanTaskRecord>
): { todoStepMap: Map<string, PlanStep>; topTaskSteps: PlanStep[] } {
  const todoStepMap = new Map<string, PlanStep>();
  const topTaskSteps: PlanStep[] = [];
  const seenTasks = new Set<string>();

  for (const step of steps) {
    const parsed = stepRecord(step.id);
    if (parsed.todo) {
      todoStepMap.set(step.id, step);
    }
    if (!seenTasks.has(parsed.task)) {
      seenTasks.add(parsed.task);
      if (parsed.todo) {
        const rec = tasks[parsed.task];
        topTaskSteps.push({
          id: parsed.task,
          task: parsed.task,
          depth: 0,
          status: stepStatusForStage(rec?.stageKind),
          content: rec ? rec.title : planWords.gone(parsed.task),
          ...(rec ? {} : { gone: true as const }),
        });
      } else {
        topTaskSteps.push(step);
      }
    }
  }
  return { todoStepMap, topTaskSteps };
}

function mapTodoGroup(
  taskId: string,
  list: readonly TaskTodo[],
  todoStepMap: ReadonlyMap<string, PlanStep>,
  waitMeta: Record<string, WaitMeta>,
  tasks: Record<string, PlanTaskRecord>
): DerivedPlanTodo[] {
  return list.map((td, tdIdx) => {
    const tdId = td.id ?? `td-${td.path}`;
    const handle = stepHandle({ task: taskId, todo: tdId });
    const stepEntry = todoStepMap.get(handle);
    const wait = resolveWait(stepEntry?.waitsOn, waitMeta, tasks);
    const prevSameDepth = list
      .slice(0, tdIdx)
      .some((prev) => prev.depth === td.depth);
    const nextSameDepth = list
      .slice(tdIdx + 1)
      .some((next) => next.depth === td.depth);
    return {
      todoId: tdId,
      handle,
      text: td.text,
      done: td.done || stepEntry?.status === "completed",
      inProgress: !td.done && stepEntry?.status === "in_progress",
      depth: Math.min(2, td.depth),
      path: td.path,
      promoted: td.promoted,
      proposed: td.proposed,
      comments: stepEntry?.comments ?? [],
      wait,
      canMoveUp: prevSameDepth,
      canMoveDown: nextSameDepth,
    };
  });
}

function resolveTaskTitle(
  step: PlanStep,
  record: PlanTaskRecord | null,
  isGone: boolean
): string {
  if (!isGone && record) {
    return record.title;
  }
  if (step.content && step.content !== planWords.gone(step.task)) {
    return step.content;
  }
  return planWords.gone(step.task);
}

function deriveSingleTask(
  step: PlanStep,
  idx: number,
  totalTopSteps: number,
  dataset: PlanViewDataset,
  delegateById: ReadonlyMap<string, DelegateSessionRecord>,
  delegateByTask: ReadonlyMap<string, DelegateSessionRecord>,
  todoStepMap: ReadonlyMap<string, PlanStep>
): DerivedPlanTask {
  const { tasks, waitMeta } = dataset;
  const taskId = step.task;
  const record = step.gone ? null : (tasks[taskId] ?? null);
  const isGone = Boolean(step.gone || !record);
  const delegateByRecord = record?.delegateId
    ? delegateById.get(record.delegateId)
    : undefined;
  const delegate = delegateByRecord ?? delegateByTask.get(taskId) ?? null;

  const { agreed, offered } = todoGroups(record?.todos ?? []);
  const agreedDerived = mapTodoGroup(
    taskId,
    agreed,
    todoStepMap,
    waitMeta,
    tasks
  );
  const offeredDerived = mapTodoGroup(
    taskId,
    offered,
    todoStepMap,
    waitMeta,
    tasks
  );

  const agreedDone = agreedDerived.filter((t) => t.done).length;
  const agreedTotal = agreedDerived.length;
  const taskWait = resolveWait(step.waitsOn, waitMeta, tasks);
  const firstOpenTodoWait =
    agreedDerived.find((t) => !t.done && t.wait !== null)?.wait ?? null;
  const effectiveWait = taskWait ?? firstOpenTodoWait;
  const anyActiveTodo = agreedDerived.some((t) => t.inProgress);

  const phase = deriveTaskPhase(
    step,
    record,
    effectiveWait !== null,
    anyActiveTodo
  );
  const personTodoWait = agreedDerived.some(
    (t) => !t.done && isWaitNeedingPerson(t.wait)
  );
  const needsYou =
    !isGone &&
    phase !== "done" &&
    (record?.stageKind === "you" ||
      isWaitNeedingPerson(taskWait) ||
      personTodoWait);

  return {
    order: idx + 1,
    handle: step.id,
    taskId,
    title: resolveTaskTitle(step, record, isGone),
    status: phase === "done" ? "completed" : step.status,
    phase,
    needsYou,
    overviewSentence: buildTaskSentence({
      phase,
      needsYou,
      wait: effectiveWait,
      delegate,
      agreedDone,
      agreedTotal,
    }),
    gone: isGone,
    record,
    delegate,
    wait: effectiveWait,
    comments: step.comments ?? [],
    todos: agreedDerived,
    offeredTodos: offeredDerived,
    agreedDone,
    agreedTotal,
    canMoveUp: idx > 0,
    canMoveDown: idx < totalTopSteps - 1,
  };
}

/** Builds the complete 3-level derived plan view model from raw dataset records. */
export function derivePlanModel(dataset: PlanViewDataset): DerivedPlanModel {
  const delegateById = new Map<string, DelegateSessionRecord>(
    dataset.delegates.map((d) => [d.id, d])
  );
  const delegateByTask = new Map<string, DelegateSessionRecord>();
  for (const del of dataset.delegates) {
    for (const tId of del.assignedTaskIds) {
      delegateByTask.set(tId, del);
    }
  }

  const { todoStepMap, topTaskSteps } = indexPlanSteps(
    dataset.plan.steps,
    dataset.tasks
  );

  const derivedTasks = topTaskSteps.map((step, idx) =>
    deriveSingleTask(
      step,
      idx,
      topTaskSteps.length,
      dataset,
      delegateById,
      delegateByTask,
      todoStepMap
    )
  );

  const counts: Record<PlanPhase, number> = {
    done: 0,
    moving: 0,
    held: 0,
    ahead: 0,
    gone: 0,
  };
  let needsYouCount = 0;
  for (const task of derivedTasks) {
    counts[task.phase] += 1;
    if (task.needsYou) {
      needsYouCount += 1;
    }
  }

  return {
    tasks: derivedTasks,
    doneCount: counts.done,
    movingCount: counts.moving,
    heldCount: counts.held,
    aheadCount: counts.ahead,
    goneCount: counts.gone,
    needsYouCount,
    overviewLine: buildPlanOverviewLine(
      derivedTasks.length,
      counts.done,
      counts.moving,
      needsYouCount
    ),
    changes: dataset.plan.changes ?? [],
  };
}

/** Formats one of the person's changes in CawCo's exact voice (`hub plans.ts`). */
export function describeChange(change: PlanChange): string {
  switch (change.kind) {
    case "reword":
      return `Reworded “${change.was}” to “${change.words}”`;
    case "add":
      return change.was
        ? `Added “${change.words}” after “${change.was}”`
        : `Added “${change.words}”`;
    case "remove":
      return `Removed “${change.was}” from plan`;
    case "comment":
      return `Noted on “${change.was}”: “${change.words}”`;
    case "tick":
      return change.words === "done"
        ? `Ticked “${change.was}” done`
        : `Unticked “${change.was}”`;
    case "move":
      return `Moved “${change.was}” ${change.words}`;
    default:
      return unhandled("edit kind", change.kind);
  }
}

/** Delivery status sentence for a recorded change (Projects spec §5.2). */
export function changeDeliveryLabel(
  change: PlanChange,
  sessionState: "working" | "waiting" | "idle"
): string {
  if (change.undelivered) {
    return change.undelivered;
  }
  if (change.toldAt) {
    return "Heard by session";
  }
  if (sessionState === "working") {
    return "Sent at next step";
  }
  return PLAN_WAKING_EDITS.has(change.kind)
    ? "Wakes session in 3s"
    : "Queued for next turn";
}

function appendChange(
  dataset: PlanViewDataset,
  kind: PlanEdit["kind"],
  step: string,
  was: string,
  words: string
): PlanChange[] {
  const now = new Date().toISOString();
  const next: PlanChange = {
    id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    step,
    was,
    words,
    at: now,
    to: { kind: "session", instanceId: dataset.session.id },
  };
  return [...(dataset.plan.changes ?? []).slice(-19), next];
}

function todoKey(td: TaskTodo): string {
  return td.id ?? `td-${td.path}`;
}

function blockEnd<T extends { depth: number }>(
  items: readonly T[],
  start: number,
  parentDepth: number
): number {
  let end = start + 1;
  while (end < items.length && (items[end]?.depth ?? 0) > parentDepth) {
    end += 1;
  }
  return end;
}

function moveUpSlice<T extends { depth: number }>(
  items: readonly T[],
  start: number,
  end: number,
  headDepth: number,
  requireSameDepth: boolean
): T[] | null {
  let prev = start - 1;
  while (prev >= 0 && (items[prev]?.depth ?? 0) > headDepth) {
    prev -= 1;
  }
  if (prev < 0 || (requireSameDepth && items[prev]?.depth !== headDepth)) {
    return null;
  }
  const copy = [...items];
  const block = copy.splice(start, end - start);
  copy.splice(prev, 0, ...block);
  return copy;
}

function moveDownSlice<T extends { depth: number }>(
  items: readonly T[],
  start: number,
  end: number,
  headDepth: number,
  requireSameDepth: boolean
): T[] | null {
  const nextHead = items[end];
  if (!nextHead || (requireSameDepth && nextHead.depth !== headDepth)) {
    return null;
  }
  const nextEnd = blockEnd(items, end, nextHead.depth);
  const copy = [...items];
  const block = copy.slice(start, end);
  const afterBlock = copy.slice(end, nextEnd);
  copy.splice(start, nextEnd - start, ...afterBlock, ...block);
  return copy;
}

function moveTreeBlock<T extends { depth: number }>(
  items: readonly T[],
  start: number,
  by: -1 | 1,
  requireSameDepth: boolean
): T[] | null {
  const head = items[start];
  if (!head) {
    return null;
  }
  const end = blockEnd(items, start, head.depth);
  return by === -1
    ? moveUpSlice(items, start, end, head.depth, requireSameDepth)
    : moveDownSlice(items, start, end, head.depth, requireSameDepth);
}

function applyTickEdit(
  dataset: PlanViewDataset,
  step: string,
  parsed: StepRecord,
  done: boolean
): PlanViewDataset {
  const task = dataset.tasks[parsed.task];
  if (!(task && parsed.todo)) {
    return dataset;
  }
  const targetTodo = task.todos.find((td) => todoKey(td) === parsed.todo);
  if (!targetTodo) {
    return dataset;
  }
  const nextStatus: PlanStep["status"] = done ? "completed" : "pending";
  return {
    ...dataset,
    tasks: {
      ...dataset.tasks,
      [parsed.task]: {
        ...task,
        todos: task.todos.map((td) =>
          todoKey(td) === parsed.todo ? { ...td, done } : td
        ),
      },
    },
    plan: {
      ...dataset.plan,
      steps: dataset.plan.steps.map((s) =>
        s.id === step ? { ...s, status: nextStatus } : s
      ),
      changes: appendChange(
        dataset,
        "tick",
        step,
        targetTodo.text,
        done ? "done" : "not done"
      ),
    },
  };
}

function applyRewordEdit(
  dataset: PlanViewDataset,
  step: string,
  parsed: StepRecord,
  content: string
): PlanViewDataset {
  const trimmed = content.trim();
  const task = dataset.tasks[parsed.task];
  if (!(trimmed && task)) {
    return dataset;
  }
  let wasText = task.title;
  let updatedTask: PlanTaskRecord = { ...task, title: trimmed };
  if (parsed.todo) {
    const targetTodo = task.todos.find((td) => todoKey(td) === parsed.todo);
    if (!targetTodo || targetTodo.text === trimmed) {
      return dataset;
    }
    wasText = targetTodo.text;
    updatedTask = {
      ...task,
      todos: task.todos.map((td) =>
        todoKey(td) === parsed.todo ? { ...td, text: trimmed } : td
      ),
    };
  } else if (task.title === trimmed) {
    return dataset;
  }
  return {
    ...dataset,
    tasks: {
      ...dataset.tasks,
      [parsed.task]: updatedTask,
    },
    plan: {
      ...dataset.plan,
      steps: dataset.plan.steps.map((s) =>
        s.id === step ? { ...s, content: trimmed } : s
      ),
      changes: appendChange(dataset, "reword", step, wasText, trimmed),
    },
  };
}

function insertCommentedStep(
  steps: readonly PlanStep[],
  step: string,
  parsed: StepRecord,
  wasLabel: string,
  comment: PlanComment
): PlanStep[] {
  const existingIdx = steps.findIndex((s) => s.id === step);
  if (existingIdx >= 0) {
    return steps.map((s, i) =>
      i === existingIdx
        ? { ...s, comments: [...(s.comments ?? []), comment] }
        : s
    );
  }
  const parentIdx = steps.findIndex((s) => s.id === parsed.task);
  const created: PlanStep = {
    id: step,
    task: parsed.task,
    ...(parsed.todo ? { todo: parsed.todo } : {}),
    depth: parsed.todo ? 1 : 0,
    status: "pending",
    content: wasLabel,
    comments: [comment],
  };
  const copy = [...steps];
  copy.splice(parentIdx >= 0 ? parentIdx + 1 : copy.length, 0, created);
  return copy;
}

function applyCommentEdit(
  dataset: PlanViewDataset,
  step: string,
  parsed: StepRecord,
  rawText: string
): PlanViewDataset {
  const text = rawText.trim();
  if (!text) {
    return dataset;
  }
  const comment: PlanComment = { at: new Date().toISOString(), text };
  const task = dataset.tasks[parsed.task];
  const todoText = parsed.todo
    ? task?.todos.find((td) => todoKey(td) === parsed.todo)?.text
    : undefined;
  const existingContent = dataset.plan.steps.find(
    (s) => s.id === step
  )?.content;
  const wasLabel = existingContent ?? todoText ?? task?.title ?? step;
  const nextSteps = insertCommentedStep(
    dataset.plan.steps,
    step,
    parsed,
    wasLabel,
    comment
  );
  return {
    ...dataset,
    plan: {
      ...dataset.plan,
      steps: nextSteps,
      changes: appendChange(dataset, "comment", step, wasLabel, text),
    },
  };
}

function applyRemoveEdit(
  dataset: PlanViewDataset,
  step: string,
  parsed: StepRecord
): PlanViewDataset {
  if (parsed.todo) {
    const task = dataset.tasks[parsed.task];
    if (!task) {
      return dataset;
    }
    const target = task.todos.find((td) => todoKey(td) === parsed.todo);
    return {
      ...dataset,
      tasks: {
        ...dataset.tasks,
        [parsed.task]: {
          ...task,
          todos: task.todos.filter((td) => todoKey(td) !== parsed.todo),
        },
      },
      plan: {
        ...dataset.plan,
        steps: dataset.plan.steps.filter((s) => s.id !== step),
        changes: appendChange(
          dataset,
          "remove",
          step,
          target?.text ?? step,
          ""
        ),
      },
    };
  }
  const removedStep = dataset.plan.steps.find((s) => s.id === parsed.task);
  const task = dataset.tasks[parsed.task];
  const wasTitle = task?.title ?? removedStep?.content ?? parsed.task;
  const shouldReturnToBacklog =
    Boolean(task) && !dataset.boardBacklog.some((b) => b.id === parsed.task);
  return {
    ...dataset,
    boardBacklog:
      shouldReturnToBacklog && task
        ? [task, ...dataset.boardBacklog]
        : dataset.boardBacklog,
    plan: {
      ...dataset.plan,
      steps: dataset.plan.steps.filter((s) => s.task !== parsed.task),
      changes: appendChange(dataset, "remove", parsed.task, wasTitle, ""),
    },
  };
}

function applyMoveEdit(
  dataset: PlanViewDataset,
  step: string,
  parsed: StepRecord,
  by: -1 | 1
): PlanViewDataset {
  const direction = by === -1 ? "up" : "down";
  if (parsed.todo) {
    const task = dataset.tasks[parsed.task];
    if (!task) {
      return dataset;
    }
    const idx = task.todos.findIndex((td) => todoKey(td) === parsed.todo);
    const current = task.todos[idx];
    const movedTodos = moveTreeBlock(task.todos, idx, by, true);
    if (!(current && movedTodos)) {
      return dataset;
    }
    return {
      ...dataset,
      tasks: {
        ...dataset.tasks,
        [parsed.task]: { ...task, todos: movedTodos },
      },
      plan: {
        ...dataset.plan,
        changes: appendChange(dataset, "move", step, current.text, direction),
      },
    };
  }

  const start = dataset.plan.steps.findIndex((s) => s.id === parsed.task);
  const head = dataset.plan.steps[start];
  const movedSteps = moveTreeBlock(dataset.plan.steps, start, by, false);
  if (!(head && movedSteps)) {
    return dataset;
  }
  return {
    ...dataset,
    plan: {
      ...dataset.plan,
      steps: movedSteps,
      changes: appendChange(
        dataset,
        "move",
        parsed.task,
        head.content,
        direction
      ),
    },
  };
}

function applyAddEdit(
  dataset: PlanViewDataset,
  parsed: StepRecord,
  after: string | undefined
): PlanViewDataset {
  const task =
    dataset.tasks[parsed.task] ??
    dataset.boardBacklog.find((b) => b.id === parsed.task);
  if (!task) {
    return dataset;
  }
  const newStep: PlanStep = {
    id: task.id,
    task: task.id,
    depth: 0,
    status: stepStatusForStage(task.stageKind),
    content: task.title,
  };
  const steps = [...dataset.plan.steps];
  const idx = after ? steps.findIndex((s) => s.id === after) : -1;
  let wasWord = steps.at(-1)?.content ?? "";
  if (idx >= 0) {
    wasWord = steps[idx]?.content ?? "";
    const insertAt = blockEnd(steps, idx, 0);
    steps.splice(insertAt, 0, newStep);
  } else {
    steps.push(newStep);
  }
  return {
    ...dataset,
    tasks: { ...dataset.tasks, [task.id]: task },
    boardBacklog: dataset.boardBacklog.filter((b) => b.id !== task.id),
    plan: {
      ...dataset.plan,
      steps,
      changes: appendChange(dataset, "add", task.id, wasWord, task.title),
    },
  };
}

/** Immutably applies any of the person's 6 plan edits to the dataset. */
export function applyPlanEdit(
  dataset: PlanViewDataset,
  edit: PlanEdit
): PlanViewDataset {
  const parsed = stepRecord(edit.step);
  switch (edit.kind) {
    case "tick":
      return applyTickEdit(dataset, edit.step, parsed, edit.done);
    case "reword":
      return applyRewordEdit(dataset, edit.step, parsed, edit.content);
    case "comment":
      return applyCommentEdit(dataset, edit.step, parsed, edit.text);
    case "remove":
      return applyRemoveEdit(dataset, edit.step, parsed);
    case "move":
      return applyMoveEdit(dataset, edit.step, parsed, edit.by);
    case "add":
      return applyAddEdit(dataset, parsed, edit.after);
    default:
      return unhandled("plan edit", edit);
  }
}

/** Files a new task and appends it to the session's plan. */
export function createAndAddTask(
  dataset: PlanViewDataset,
  title: string,
  afterTaskId?: string
): { dataset: PlanViewDataset; newTaskId: string } | null {
  const clean = title.trim();
  if (!clean) {
    return null;
  }
  const existingNums = [
    ...Object.keys(dataset.tasks),
    ...dataset.boardBacklog.map((b) => b.id),
  ]
    .map((id) => Number(id.replace("tsk-", "")))
    .filter((n) => Number.isFinite(n));
  const nextNum = Math.max(500, ...existingNums) + 1;
  const newTaskId = `tsk-${nextNum}`;
  const created: PlanTaskRecord = {
    id: newTaskId,
    title: clean,
    stage: "Ready",
    stageKind: "todo",
    summary: "Filed directly from the session's plan view.",
    acceptance: [],
    labels: ["plan"],
    after: afterTaskId ? [afterTaskId] : [],
    unblocks: [],
    todos: [],
  };
  const seeded: PlanViewDataset = {
    ...dataset,
    tasks: { ...dataset.tasks, [newTaskId]: created },
  };
  return {
    newTaskId,
    dataset: applyPlanEdit(seeded, {
      kind: "add",
      step: newTaskId,
      ...(afterTaskId ? { after: afterTaskId } : {}),
    }),
  };
}

/** Appends a new agreed to-do inside a task and records the person's `add` change. */
export function addTodoToTask(
  dataset: PlanViewDataset,
  taskId: string,
  text: string
): PlanViewDataset {
  const clean = text.trim();
  const task = dataset.tasks[taskId];
  if (!(clean && task)) {
    return dataset;
  }
  const nextIdx = task.todos.length + 1;
  const todoId = `td-${nextIdx}`;
  const handle = stepHandle({ task: taskId, todo: todoId });
  const newTodo: TaskTodo = {
    id: todoId,
    path: String(nextIdx),
    depth: 0,
    done: false,
    proposed: false,
    promoted: null,
    text: clean,
  };
  return {
    ...dataset,
    tasks: {
      ...dataset.tasks,
      [taskId]: {
        ...task,
        todos: [...task.todos, newTodo],
      },
    },
    plan: {
      ...dataset.plan,
      changes: appendChange(dataset, "add", handle, task.title, clean),
    },
  };
}

/** Agrees to or dismisses an agent-offered `(proposed)` to-do on a task. */
export function resolveOfferedTodo(
  dataset: PlanViewDataset,
  taskId: string,
  todoId: string,
  accept: boolean
): PlanViewDataset {
  const task = dataset.tasks[taskId];
  if (!task) {
    return dataset;
  }
  const found = task.todos.find((td) => todoKey(td) === todoId);
  if (!found) {
    return dataset;
  }
  const handle = stepHandle({ task: taskId, todo: todoId });
  const nextTodos = accept
    ? task.todos.map((td) =>
        todoKey(td) === todoId ? { ...td, proposed: false } : td
      )
    : task.todos.filter((td) => todoKey(td) !== todoId);
  return {
    ...dataset,
    tasks: {
      ...dataset.tasks,
      [taskId]: { ...task, todos: nextTodos },
    },
    plan: {
      ...dataset.plan,
      changes: appendChange(
        dataset,
        accept ? "add" : "remove",
        handle,
        accept ? task.title : found.text,
        accept ? found.text : ""
      ),
    },
  };
}

/** Moves a task's stage (e.g. Ready -> Working -> Waiting -> Done), updating its plan step status. */
export function moveTaskStage(
  dataset: PlanViewDataset,
  taskId: string,
  stage: string,
  stageKind: StageKind
): PlanViewDataset {
  const task = dataset.tasks[taskId];
  if (!task) {
    return dataset;
  }
  const nextStepStatus = stepStatusForStage(stageKind);
  return {
    ...dataset,
    tasks: {
      ...dataset.tasks,
      [taskId]: { ...task, stage, stageKind },
    },
    plan: {
      ...dataset.plan,
      steps: dataset.plan.steps.map((s) =>
        s.id === taskId
          ? {
              ...s,
              status: nextStepStatus,
              ...(stageKind === "done" ? { waitsOn: undefined } : {}),
            }
          : s
      ),
    },
  };
}

/** Clears a settled hold (`waitsOn`) on a task or to-do step. */
export function clearStepHold(
  dataset: PlanViewDataset,
  taskId: string
): PlanViewDataset {
  const task = dataset.tasks[taskId];
  const resumedStage =
    task?.stageKind === "waiting" || task?.stageKind === "you"
      ? { stage: "Working", stageKind: "active" as const }
      : {};
  return {
    ...dataset,
    tasks: task
      ? {
          ...dataset.tasks,
          [taskId]: { ...task, ...resumedStage },
        }
      : dataset.tasks,
    plan: {
      ...dataset.plan,
      steps: dataset.plan.steps.map((s) =>
        s.task === taskId ? { ...s, waitsOn: undefined } : s
      ),
    },
  };
}
