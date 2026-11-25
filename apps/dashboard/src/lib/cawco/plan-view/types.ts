import type { HarnessKind } from "@cawco/core/harness/kinds";
import type {
  PlanChange,
  PlanComment,
  PlanStepPriority,
  PlanStepStatus,
  SessionPlan,
  TaskTodo,
} from "@cawco/core/plan";
import type { StageKind } from "@cawco/core/views";
import type { WaitTarget } from "@cawco/core/wait-targets";
import type { WorkItemState } from "@cawco/core/work-items";

/** One of CawCo's eight deterministic identity mark slots (mark-1 through mark-8). */
export type IdentitySlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** The phase a plan step belongs to as the operator scans the plan. */
export type PlanPhase = "done" | "moving" | "held" | "ahead" | "gone";

/** Which filter lens the person chose in the overview controls. */
export type PhaseFilter = "all" | "needs_you" | "moving" | "ahead" | "done";

/** A delegate session started by the parent session to work tasks of its plan. */
export interface DelegateSessionRecord {
  /** Tasks of the parent's plan this delegate is dispatched on. */
  assignedTaskIds: string[];
  harness: HarnessKind;
  id: string;
  identity: IdentitySlot;
  /** What the delegate is doing right now, one calm line; empty once ended. */
  liveLine?: string;
  machine: string;
  /** The delegate's own session plan. */
  plan: SessionPlan;
  state: WorkItemState;
  title: string;
}

/** A project task record as read alongside the session's plan steps. */
export interface PlanTaskRecord {
  acceptance: string[];
  /** Upstream tasks this task waits on (`after:` in the task file). */
  after: string[];
  /** Delegate session dispatched on this task, if any; undefined when the parent session owns it. */
  delegateId?: string;
  id: string;
  labels: string[];
  priority?: PlanStepPriority;
  stage: string;
  stageKind: StageKind;
  summary: string;
  title: string;
  todos: TaskTodo[];
  /** Downstream tasks unblocked once this task lands. */
  unblocks: string[];
}

/** Human-readable context for a `waitsOn` handle (an artifact card, PR, session, or blocker). */
export interface WaitMeta {
  /** Action verb+object label to open or settle what the step waits on. */
  actionLabel: string;
  detail: string;
  /** Short plain-language sentence of what the step waits on. */
  label: string;
}

/** The session whose plan is being viewed, and everything read with its plan. */
export interface PlanViewDataset {
  /** Project tasks on the board not yet in this plan, available when adding a task. */
  boardBacklog: PlanTaskRecord[];
  delegates: DelegateSessionRecord[];
  plan: SessionPlan;
  session: {
    harness: HarnessKind;
    id: string;
    identity: IdentitySlot;
    liveActivity?: string;
    liveState: "working" | "waiting" | "idle";
    machine: string;
    project: string;
    title: string;
  };
  /** Map of task id (`tsk-…`) to its live board record; absent for a task that left the board (`gone`). */
  tasks: Record<string, PlanTaskRecord>;
  /** Friendly titles and actions keyed by raw `waitsOn` handle. */
  waitMeta: Record<string, WaitMeta>;
}

/** A resolved wait attached to a task step or to-do step. */
export interface ResolvedWait {
  actionLabel: string;
  detail: string;
  handle: string;
  label: string;
  target: WaitTarget | undefined;
}

/** Level 3: one derived to-do row nested inside a task's recessed well. */
export interface DerivedPlanTodo {
  /** Position in the flat sibling list for move up/down bounds. */
  canMoveDown: boolean;
  canMoveUp: boolean;
  /** Comments left on this specific `tsk-N:td-M` step. */
  comments: PlanComment[];
  /** Nesting depth inside the task well (0 = top-level to-do, 1+ = sub-to-do). */
  depth: number;
  done: boolean;
  /** Step handle `tsk-12:td-3` used for edits. */
  handle: string;
  /** Whether the session explicitly marked this to-do `in_progress`. */
  inProgress: boolean;
  path: string;
  promoted: string | null;
  proposed: boolean;
  text: string;
  todoId: string;
  wait: ResolvedWait | null;
}

/** Level 2: one derived task item anchored along the session's plan spine. */
export interface DerivedPlanTask {
  agreedDone: number;
  agreedTotal: number;
  canMoveDown: boolean;
  canMoveUp: boolean;
  comments: PlanComment[];
  delegate: DelegateSessionRecord | null;
  gone: boolean;
  /** Step handle (`tsk-12`) in `plan.steps`. */
  handle: string;
  /** True only when this task is blocked on a person's decision or reply — the sole loud mark on the overview. */
  needsYou: boolean;
  offeredTodos: DerivedPlanTodo[];
  /** 1-based ordinal in the full plan. */
  order: number;
  /** One plain sentence shown under the task name on the first view. */
  overviewSentence: string;
  phase: PlanPhase;
  record: PlanTaskRecord | null;
  status: PlanStepStatus;
  taskId: string;
  title: string;
  todos: DerivedPlanTodo[];
  wait: ResolvedWait | null;
}

/** Level 1: derived whole-plan summary and spine items. */
export interface DerivedPlanModel {
  aheadCount: number;
  changes: PlanChange[];
  doneCount: number;
  goneCount: number;
  heldCount: number;
  movingCount: number;
  needsYouCount: number;
  /** One plain-words overview line under the session title. */
  overviewLine: string;
  tasks: DerivedPlanTask[];
}
