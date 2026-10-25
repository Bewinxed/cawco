/**
 * A session's plan (Projects spec §5.2, "Every session's plan, in a panel"):
 * its steps, its spec, and on a task attempt the task's to-dos. One shape
 * whatever the harness.
 *
 * - **Steps** are Agent Client Protocol plan entries
 *   (https://agentclientprotocol.com/protocol/v1/agent-plan: `content`,
 *   `status` "pending, in_progress, and completed", `priority`), plus our `id`
 *   and `depth` for nesting by indent. ACP requires `priority`; it is kept
 *   here only where the `todo_write` that wrote it names one. Every write replaces the list whole, as ACP has it: "the
 *   Client must replace the current plan completely".
 * - **The spec** is the session's own document, written through CawCo
 *   (`todo_write`'s `spec`) on any harness and replaced whole: what `grill`
 *   interviews to and `to-tasks` turns into tasks with edges and checks
 *   (§5.4). It stands in for each harness's built-in plan mode, which every
 *   session is denied along with its own list (`OWN_LIST_DENIED`).
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

/**
 * A step waiting on the person: the card it asked on a decision page, set
 * by the session as it asks (`todo_write`'s `waitsOn`), or the whole
 * artifact, set by the hub on the session's current step when its
 * `artifact_create` or `artifact_update` with `does: pick` or `judge`
 * returns (hub plans.ts `waitOn`). The plan draws it "Waiting on you" with a
 * link to the card or the artifact; it stops waiting when the page's Send
 * carries a pick for that card, or once nothing on the artifact waits on
 * the person (core artifact-needs.ts). While it waits, the artifact's
 * Needs-you item stands; once the step is ticked or removed, it goes.
 */
export interface PlanWait {
  /** The artifact's id. */
  artifactId: string;
  /** The decision's id on the page (`data-cawco-choice`, an OpenUI `Decision`'s id); absent, the whole artifact. */
  card?: string;
}

/** One step of a session's plan: an ACP plan entry, with an id and a nesting depth. */
export interface PlanStep {
  /** The person's comments on it, oldest first; kept by id across the session's writes. */
  comments?: PlanComment[];
  content: string;
  /** Nesting by indent: 0 for a top-level step, one more than its parent's for a sub-step. */
  depth: number;
  /** Stable within one list: the writer's, the step's place, or `you-…` for one the person added. */
  id: string;
  priority?: PlanStepPriority;
  status: PlanStepStatus;
  /** It waits on the person's pick on a decision page. */
  waitsOn?: PlanWait;
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

/** A person's change to a session's plan, as `POST /api/instances/:id/plan/edits` takes it. */
export type PlanEdit =
  | { kind: "reword"; step: string; content: string }
  /** `after`: the step it follows, at that step's depth; absent, the plan's end. */
  | { kind: "add"; content: string; after?: string }
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
   * The spec's away notes (its `## Since HH:MM (you were away)` section,
   * core injected.ts `awayNotesOf`) changed since the person last saw them:
   * opened the plan, or had them recapped. `since` is the section's HH:MM.
   * Absent once seen, and while the spec has none.
   */
  awayUnseen?: { since: string };
  /** The person's latest changes to it, newest last. */
  changes?: PlanChange[];
  /**
   * Always `cawco`: the steps are CawCo's list on every harness. Still sent
   * because the apps on TestFlight 20261015 through 20261018 decode it as
   * required (hub openapi.ts's wire check); it goes in the change that
   * expires those builds.
   */
  source: "cawco";
  /** The session's spec, once it has written one. */
  spec?: PlanSpec;
  /** CawCo's list: `todo_write`'s session scope, on every harness. */
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
