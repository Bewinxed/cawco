/**
 * A session's plan (Projects spec §5.2, "Every session's plan, in a panel"):
 * the tasks and to-dos it works on, and on a task attempt the task's
 * to-dos. One shape whatever the harness. A session keeps one only when its
 * work needs one; nothing asks it to.
 *
 * - **Steps** are links: each names a task (`tsk-12`) or a to-do of one
 *   (`tsk-12:td-3`), never words of its own (the owner, 2026-11-23: "the
 *   plan's steps should be composed from tasks and todos only"). A step's
 *   words and whether it is done are its record's, read at every read: a
 *   to-do's text and tick, a task's title and its stage (done or dropped is
 *   done). The session says which it works on (`in_progress`). The rest is
 *   Agent Client Protocol's plan entry
 *   (https://agentclientprotocol.com/protocol/v1/agent-plan: `content`,
 *   `status` "pending, in_progress, and completed", `priority`), plus
 *   `depth` for nesting by indent. Every write replaces the list whole, as
 *   ACP has it: "the Client must replace the current plan completely".
 *
 * - **The person's changes** ({@link PlanEdit}): a step reworded, added,
 *   removed, commented on, ticked or moved, recorded on the plan as a
 *   {@link PlanChange} in their words, and told to whoever the plan answers
 *   to (hub plan-changes.ts): the session itself, the session that delegated
 *   it, or a task attempt's Caw.
 *
 * Live, a session's followers hear it as AG-UI's state events
 * (https://docs.ag-ui.com/spec/1.0/basic): a snapshot when they subscribe or
 * the plan is replaced, else an RFC 6902 JSON Patch against the last one,
 * applied in sequence. `rev` orders them: a delta is for `rev - 1`, and a
 * client holding anything else sends {@link PlanResync} for a snapshot.
 */
import { type ArtifactNeed, unparked } from "./artifact-needs";
import { waitArtifact } from "./wait-targets";

export const PLAN_STEP_STATUSES = [
  "pending",
  "in_progress",
  "completed",
] as const;
export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

export const PLAN_STEP_PRIORITIES = ["high", "medium", "low"] as const;
export type PlanStepPriority = (typeof PLAN_STEP_PRIORITIES)[number];

/** The person's comment on a step, in their words. */
export interface PlanComment {
  /** When they wrote it, ISO 8601. */
  at: string;
  text: string;
}

/** The record a step names: a task, or a to-do of one. */
export interface StepRecord {
  task: string;
  todo?: string;
}

/** A to-do step's handle between its task and its to-do: `tsk-12:td-3`. */
const RECORD_JOIN = ":";

/** The step handle of a record: `tsk-12`, or `tsk-12:td-3` for a to-do. */
export const stepHandle = ({ task, todo }: StepRecord): string =>
  todo ? `${task}${RECORD_JOIN}${todo}` : task;

/** The record a step handle names ({@link stepHandle}). */
export const stepRecord = (handle: string): StepRecord => {
  const at = handle.indexOf(RECORD_JOIN);
  return at < 0
    ? { task: handle }
    : { task: handle.slice(0, at), todo: handle.slice(at + 1) };
};

/**
 * One step of a session's plan as it is kept: the record it names (its
 * handle, {@link stepHandle}), where it nests, and what the session said of
 * it. Its words and whether it is done are its record's, read as the plan
 * is ({@link PlanStep}).
 */
export interface KeptStep {
  /**
   * The person's comments on it, oldest first. A write of the session's
   * keeps them on the step naming the same record, wherever it stands; with
   * no such step they go to the plan's {@link SessionPlan.orphanedComments}.
   */
  comments?: PlanComment[];
  /** Nesting by indent: 0 for a top-level step, one more than its parent's for a sub-step. */
  depth: number;
  /** The record it names, by handle: unique in its plan. */
  id: string;
  priority?: PlanStepPriority;
  /** As the session wrote it; a done record reads `completed` whatever it says. */
  status: PlanStepStatus;
  /**
   * What it waits on, set by the session (`todo_write`'s `waitsOn`): a
   * task, a card, a pin, a pull request, a run or a session, as a task's
   * `waits_on` keeps it (wait-targets.ts), settled by the hub's one resolver
   * (hub task-waits.ts). The hub drops it once it settles.
   */
  waitsOn?: string;
}

/** One step of a session's plan as it reads: its record's words and state with it. */
export interface PlanStep extends KeptStep, StepRecord {
  /** Its record's words: the to-do's text, or the task's title. */
  content: string;
  /** Its record is gone from the board: the task removed, or the to-do taken off it. */
  gone?: true;
}

/** Whether an open step's `waitsOn` names artifact `artifactId`: a card or pin of it. */
export const stepNamesArtifact = (
  step: Pick<KeptStep, "status" | "waitsOn">,
  artifactId: string
): boolean =>
  step.status !== "completed" &&
  step.waitsOn !== undefined &&
  waitArtifact(step.waitsOn) === artifactId;

/**
 * The plan's own needs: what of a session waits on the person, exactly its
 * items in Needs you (artifact-needs.ts `unparked`, which the hub's
 * artifacts/needs.ts reads from questions.ts: an open card or design
 * graph's pick), in its order, that no open step's
 * `waitsOn` names a card or pin of ({@link stepNamesArtifact}), by artifact
 * id. One a step names shows on that step. Derived on every read, never
 * stored: a page whose every question is answered, taken or withdrawn, or
 * deleted, is never named. The plan panel and Needs you say one thing.
 */
export const planNeedsOf = (
  session: string,
  steps: readonly Pick<KeptStep, "status" | "waitsOn">[],
  needs: readonly ArtifactNeed[]
): string[] =>
  unparked(needs)
    .filter(
      (need) =>
        need.instanceId === session &&
        !steps.some((one) => stepNamesArtifact(one, need.artifactId))
    )
    .map((need) => need.artifactId);

/** The person's comments on a step no write of the session's has kept: the step's record, and the comments. */
export interface OrphanedComments {
  comments: PlanComment[];
  /** The record of the step they were written on, by handle ({@link stepHandle}). */
  step: string;
}

/** The person's changes to a plan, by what they do. */
export const PLAN_EDIT_KINDS = [
  "reword",
  "add",
  "remove",
  "comment",
  "tick",
  "move",
] as const;
export type PlanEditKind = (typeof PLAN_EDIT_KINDS)[number];

/**
 * The changes that start an idle session (a change to the work); a tick or a
 * move is recorded and heard on its next turn.
 */
export const PLAN_WAKING_EDITS: ReadonlySet<PlanEditKind> = new Set([
  "reword",
  "add",
  "remove",
  "comment",
]);

/**
 * How long after the person's last waking change an idle session is started,
 * all the changes of that window going as one message (the owner's pick,
 * 2026-10-20: "starts it working 3 seconds after your last edit").
 */
export const PLAN_WAKE_QUIET_MS = 3000;

/**
 * A person's change to a session's plan, as `POST /api/instances/:id/plan/edits`
 * takes it. A reword rewords the step's record (a to-do's text, a task's
 * title); a tick ticks a to-do, and a task's step follows its stage.
 */
export type PlanEdit =
  | { kind: "reword"; step: string; content: string }
  /** `step`: the record it names, by handle; `after`: the step it follows, at that step's depth; absent, the plan's end. */
  | { kind: "add"; step: string; after?: string }
  | { kind: "remove"; step: string }
  | { kind: "comment"; step: string; text: string }
  | { kind: "tick"; step: string; done: boolean }
  /** One place up (-1) or down (1) among the steps at its depth, its sub-steps with it. */
  | { kind: "move"; step: string; by: -1 | 1 };

/**
 * Who hears a change to a session's plan: the session itself, the session
 * that delegated it (a delegate's plan is its parent's to pass on), or the
 * project's Caw (a task attempt's plan: he dispatched it).
 */
export type PlanReceiver =
  { kind: "session"; instanceId: string } | { kind: "caw"; projectId: string };

/** A person's change, recorded on the plan in their words and told to its receiver. */
export interface PlanChange {
  /** When the person made it, ISO 8601. */
  at: string;
  id: string;
  kind: PlanEditKind;
  /** The step it changed (the step added, for `add`). */
  step: string;
  to: PlanReceiver;
  /** When it went to {@link to} in a message, ISO 8601; absent while it waits. */
  toldAt?: string;
  /** Why it reached no one, when nothing could take it. */
  undelivered?: string;
  /** The step's words before the change; for `add`, the step it follows ("" at the top). */
  was: string;
  /**
   * The person's words: the new words, the added step, the comment; `done` or
   * `not done` for a tick; `up` or `down` for a move; "" for a removal.
   */
  words: string;
}

/** One to-do of a task file (`## To-dos`), as a task read parses it. */
export interface TaskTodo {
  /** Nesting: 0 for a top-level to-do. */
  depth: number;
  done: boolean;
  /** Its marker, `td-3`; null on a to-do written without one. */
  id: string | null;
  /** Its position: `2` the second top-level to-do, `2.1` that one's first child. */
  path: string;
  /** The task it was promoted to (`tsk-152`), when its line ends in `→ #152`. */
  promoted: string | null;
  /** Offered by an attempt whose plan left it open (`(proposed)` before its words), not agreed yet. */
  proposed: boolean;
  /** The words after the box and marker, without the promoted link. */
  text: string;
}

/**
 * A task's to-dos split by whether anyone agreed to them, file order kept.
 * Offered: a `proposed` to-do and every to-do nested under one. Only the
 * agreed ones count toward a task's to-do ring and count
 * ({@link todoProgress}); the offered ones show apart, marked as offered.
 */
export const todoGroups = <T extends Pick<TaskTodo, "depth" | "proposed">>(
  todos: readonly T[]
): { agreed: T[]; offered: T[] } => {
  const agreed: T[] = [];
  const offered: T[] = [];
  /** The depth of the offered to-do the walk is inside, while it is. */
  let under: number | null = null;
  for (const todo of todos) {
    if (under !== null && todo.depth > under) {
      offered.push(todo);
      continue;
    }
    under = todo.proposed ? todo.depth : null;
    (todo.proposed ? offered : agreed).push(todo);
  }
  return { agreed, offered };
};

/** How far a task's to-dos have got: the agreed ones ({@link todoGroups}) ticked, of all agreed. */
export const todoProgress = (
  todos: readonly Pick<TaskTodo, "depth" | "done" | "proposed">[]
): { done: number; total: number } => {
  const { agreed } = todoGroups(todos);
  return {
    done: agreed.filter((todo) => todo.done).length,
    total: agreed.length,
  };
};

/**
 * What `GET /api/instances/:id/plan` answers, and what the live frames keep
 * a client's copy equal to.
 */
export interface SessionPlan {
  /** The person's latest changes to it, newest last. */
  changes?: PlanChange[];
  /**
   * The plan's own needs: each artifact of the session's in Needs you, by
   * id, that no open step's `waitsOn` names ({@link planNeedsOf}). One a
   * step names shows on that step. Absent when there are none.
   */
  needs?: string[];
  /** The person's step comments whose step's words are gone from the list, oldest step first. Absent when none. */
  orphanedComments?: OrphanedComments[];
  /**
   * Always `cawco`: the steps are CawCo's list on every harness. Still sent
   * because the apps on TestFlight 20261015 through 20261018 decode it as
   * required (hub openapi.ts's wire check); it goes in the change that
   * expires those builds.
   */
  source: "cawco";
  /** CawCo's list: `todo_write`'s session scope, on every harness. */
  steps: PlanStep[];
  /** On a task attempt: the task. */
  taskId?: string;
  /** On a task attempt: the task's to-dos, nested and ticked as its file has them. */
  todos?: TaskTodo[];
}

/** One RFC 6902 operation (https://www.rfc-editor.org/rfc/rfc6902). */
type JsonPatchOperation =
  | { op: "add" | "replace" | "test"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "copy" | "move"; from: string; path: string };

/** Hub → a session's followers: the whole plan (AG-UI STATE_SNAPSHOT). */
export interface PlanSnapshot extends SessionPlan {
  instanceId: string;
  rev: number;
  type: "plan.snapshot";
}

/** Hub → a session's followers: the change from `rev - 1` to `rev` (AG-UI STATE_DELTA). */
export interface PlanDelta {
  instanceId: string;
  patch: JsonPatchOperation[];
  rev: number;
  type: "plan.delta";
}

/**
 * Client → hub: the sessions whose plan this socket follows beside the ones
 * it streams (the app's project page), the whole set each time.
 * One newly in the set is answered with its snapshot; deltas follow.
 */
export interface PlanFollow {
  instanceIds: string[];
  type: "plan.follow";
}

/** Client → hub: "my copy has a gap; send the plan whole". */
export interface PlanResync {
  instanceId: string;
  type: "plan.resync";
}
