/** Every {@link RoutineTarget}. */
export const ROUTINE_TARGETS = [
  "delegate",
  "orchestrator",
  "conversation",
  "curator",
] as const;
/**
 * What a run starts: a fresh delegate, a fresh orchestrator (a session that
 * may delegate, in the project's checkout: routines.ts `fireOrchestrator`),
 * a message to the project's conversation, Caw, or the project's memory curator
 * (memory.ts), a delegate in the `curator` role that only the hub makes.
 */
export type RoutineTarget = (typeof ROUTINE_TARGETS)[number];

/** The targets an agent may make a routine for: every one but the curator, which only the hub makes. */
export const MADE_ROUTINE_TARGETS = [
  "delegate",
  "orchestrator",
  "conversation",
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

/**
 * One run, as the hub's routes and tools answer it (times in ms), with what
 * actually ran it: a delegate run's work item, or a conversation run's
 * session.
 */
export interface RoutineRunView {
  attempt: number;
  endedAt: number | null;
  id: string;
  /** A conversation run's session, once its harness read the run; null for a delegate run. */
  instanceId: string | null;
  outcome: RoutineOutcome | null;
  output: string | null;
  reason: string | null;
  slot: string;
  startedAt: number;
  state: RoutineRunState;
  usd: number | null;
  /** A delegate run's work item; null for a conversation run, and before its work began. */
  workItemId: string | null;
}
