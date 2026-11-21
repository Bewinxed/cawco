/** Every {@link RoutineTarget}. */
export const ROUTINE_TARGETS = [
  "delegate",
  "orchestrator",
  "conversation",
  "curator",
  "trim",
  "command",
] as const;
/**
 * What a run starts: a fresh delegate, a fresh orchestrator (a session that
 * may delegate, in the project's checkout: routines.ts `fireOrchestrator`),
 * a message to the project's conversation, Caw, the project's memory curator
 * (memory.ts), a delegate in the `curator` role that only the hub makes,
 * the unused skills and servers routine (hub unused-trim.ts), a delegate in
 * the `trimmer` role that only the hub makes too, or a shell command and no
 * model (hub routines.ts `fireCommand`): its prompt, run in a fresh
 * workspace's boundary on its project's machine, its exit code the verdict
 * of the condition it must have.
 */
export type RoutineTarget = (typeof ROUTINE_TARGETS)[number];

/** The targets an agent may make a routine for: every one but the curator and the trim, which only the hub makes. */
export const MADE_ROUTINE_TARGETS = [
  "delegate",
  "orchestrator",
  "conversation",
  "command",
] as const satisfies readonly RoutineTarget[];

/** Every {@link RoutineRunState}. */
export const ROUTINE_RUN_STATES = [
  "queued",
  "starting",
  "running",
  "ended",
  "skipped",
] as const;
/**
 * Where a routine's run is: queued behind a live run (an event's run, which
 * starts when the runs before it end), being started, running, ended, or
 * skipped (nothing started).
 */
export type RoutineRunState = (typeof ROUTINE_RUN_STATES)[number];

/** Every {@link RoutineOutcome}. */
export const ROUTINE_OUTCOMES = [
  "silent",
  "delivered",
  "failed",
  "cancelled",
] as const;
/**
 * How a run ended, by its delegate's `finish_item` summary or Caw's
 * `routine_result`: `silent` (`NO_REPLY`), `delivered` (its words became a
 * notice), `failed` (`AUTOMATION_FAILED`, an item that failed, or Caw's turn
 * ending without a result), `cancelled` (someone stopped it).
 */
export type RoutineOutcome = (typeof ROUTINE_OUTCOMES)[number];

/** Every {@link RoutineVerdict}. */
export const ROUTINE_VERDICTS = ["met", "unmet", "unknown"] as const;
/**
 * What a run of a routine with a condition answered (`routine_result`'s
 * `condition`): met, not yet, or could not check. A run of any other
 * routine has none.
 */
export type RoutineVerdict = (typeof ROUTINE_VERDICTS)[number];

/** Every {@link ConditionStop}. */
export const CONDITION_STOPS = ["met", "deadline", "failing"] as const;
/**
 * Why the hub stopped a condition's checks (hub routines.ts): it was met,
 * its deadline passed unmet, or three slots in a row failed.
 */
export type ConditionStop = (typeof CONDITION_STOPS)[number];

/** Every {@link ConditionState}. */
export const CONDITION_STATES = [
  "checking",
  "not-yet",
  "could-not-check",
  "met",
  "timed-out",
  "failing",
  "paused",
  "deleted",
] as const;
/**
 * Where a condition stands (hub routines.ts `conditionOf`): no verdict yet,
 * its newest verdict unmet, its newest check failed, met (by a run or by
 * the person), or stopped by the hub at its deadline or after three failing
 * slots, paused by someone, or deleted. Only `met` settles a wait; the last
 * four flag it.
 */
export type ConditionState = (typeof CONDITION_STATES)[number];

/**
 * A routine's condition, as its view and a wait on it read it (times in
 * ms): the statement true once met, where it stands, and the facts each
 * state is told by.
 */
export interface ConditionView {
  /** When its newest check ended; null before any. */
  checkedAt: number | null;
  /** When the hub stops checking it unmet; null: never. */
  deadline: number | null;
  /** The newest check's evidence when met; null when marked met, or unmet. */
  evidence: string | null;
  /** The person marked it met (no run did). */
  markedMet: boolean;
  /** When it was met; null while unmet. */
  metAt: number | null;
  /** When it checks next while it checks; null otherwise. */
  nextAt: number | null;
  /** The newest check's reason (not yet, could not check), or the last failure's; null for none. */
  reason: string | null;
  state: ConditionState;
  /** The statement, true once met. */
  statement: string;
}

/**
 * One run, as the hub's routes and tools answer it (times in ms), with what
 * actually ran it: the session that did it, and a delegate run's work item.
 */
export interface RoutineRunView {
  attempt: number;
  endedAt: number | null;
  id: string;
  /**
   * The session that did the run, where it is read whole (`/session/<id>`):
   * a delegate, orchestrator, curator or trim run's work item's session, from
   * its start; a conversation run's, once its harness read the run. Null for
   * a run no session took (skipped, a command check's, one that ended before
   * any began).
   */
  instanceId: string | null;
  outcome: RoutineOutcome | null;
  output: string | null;
  reason: string | null;
  slot: string;
  startedAt: number;
  state: RoutineRunState;
  usd: number | null;
  /** What a check run answered; null for a run that gave no verdict, and every run of a routine with no condition. */
  verdict: RoutineVerdict | null;
  /** A delegate run's work item; null for a conversation run, and before its work began. */
  workItemId: string | null;
}
