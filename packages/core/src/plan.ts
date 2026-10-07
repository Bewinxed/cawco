/**
 * A session's plan (Projects spec §5.2, "Every session's plan, in a panel"):
 * its steps, its spec, and on a task attempt the task's to-dos. One shape
 * whatever the harness.
 *
 * - **Steps** are Agent Client Protocol plan entries
 *   (https://agentclientprotocol.com/protocol/v1/agent-plan: `content`,
 *   `status` "pending, in_progress, and completed", `priority`), plus our `id`
 *   and `depth` for nesting by indent. ACP requires `priority`; it is kept
 *   here only where the source has one (OpenCode's todos, a `todo_write`
 *   that names it). Every write replaces the list whole, as ACP has it: "the
 *   Client must replace the current plan completely".
 * - **The spec** is the session's own document, written through CawCo
 *   (`todo_write`'s `spec`) on any harness and replaced whole: what `grill`
 *   interviews to and `to-tasks` turns into tasks with edges and checks
 *   (§5.4). It stands in for each harness's built-in plan mode, which
 *   "CawCo's to-dos" denies along with the native lists (`NATIVE_TOOLS`).
 *
 * Live, a session's followers hear it as AG-UI's state events
 * (https://docs.ag-ui.com/spec/1.0/basic): a snapshot when they subscribe or
 * the plan is replaced, else an RFC 6902 JSON Patch against the last one,
 * applied in sequence. `rev` orders them: a delta is for `rev - 1`, and a
 * client holding anything else sends {@link PlanResync} for a snapshot.
 */

export const PLAN_STEP_STATUSES = [
  "pending",
  "in_progress",
  "completed",
] as const;
export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

export const PLAN_STEP_PRIORITIES = ["high", "medium", "low"] as const;
export type PlanStepPriority = (typeof PLAN_STEP_PRIORITIES)[number];

/** One step of a session's plan: an ACP plan entry, with an id and a nesting depth. */
export interface PlanStep {
  content: string;
  /** Nesting by indent: 0 for a top-level step, one more than its parent's for a sub-step. */
  depth: number;
  /** Stable within one list: the writer's, the ledger's file number, or the step's place. */
  id: string;
  priority?: PlanStepPriority;
  status: PlanStepStatus;
}

/** The session's spec, as it last wrote it. */
export interface PlanSpec {
  /** When it was written, ISO 8601. */
  at: string;
  markdown: string;
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
 * What `GET /api/instances/:id/plan` answers, and what the live frames keep
 * a client's copy equal to.
 */
export interface SessionPlan {
  /**
   * Where the steps come from: CawCo's own list (`todo_write`'s session
   * scope), when the session's native to-do tools are denied ("CawCo's
   * to-dos" on, and always on pi, which has none); else the harness's own
   * list (Claude Code's task ledger, OpenCode's todos).
   */
  source: "cawco" | "harness";
  /** The session's spec, once it has written one. */
  spec?: PlanSpec;
  steps: PlanStep[];
  /** On a task attempt: the task. */
  taskId?: string;
  /** On a task attempt: the task's to-dos, nested and ticked as its file has them. */
  todos?: TaskTodo[];
}

/** One RFC 6902 operation (https://www.rfc-editor.org/rfc/rfc6902). */
export type JsonPatchOperation =
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
 * it streams (a thread showing its lead's plan), the whole set each time.
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
