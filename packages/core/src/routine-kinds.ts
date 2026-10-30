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
