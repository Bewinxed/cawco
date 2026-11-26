/** Every {@link RoutineTarget}. */
export const ROUTINE_TARGETS = [
  "delegate",
  "orchestrator",
  "conversation",
  "trim",
] as const;
/**
 * What a run starts: a fresh delegate, a fresh orchestrator (a session that
 * may delegate, in the project's checkout: routines.ts `fireOrchestrator`),
 * a message to the project's conversation, Caw, or the unused skills and
 * servers routine (hub unused-trim.ts), a delegate in the `trimmer` role
 * that only the hub makes. A routine's check (hub
 * routine-check.ts) gates any of the first three: it decides whether a run
 * starts, never what starts.
 */
export type RoutineTarget = (typeof ROUTINE_TARGETS)[number];

/** The targets an agent may make a routine for: every one but the trim, which only the hub makes. */
export const MADE_ROUTINE_TARGETS = [
  "delegate",
  "orchestrator",
  "conversation",
] as const satisfies readonly RoutineTarget[];

/** Every {@link CheckOutcome}. */
export const CHECK_OUTCOMES = ["quiet", "woke", "failed", "paused"] as const;
/**
 * How a routine's check went on one machine, the last time it ran there
 * (hub routine-check.ts): quiet (its trimmed stdout was empty, or its last
 * non-empty line was `{"wakeAgent": false}`), woke (its output went to the
 * routine's target), failed (a non-zero exit, a timeout, a machine that is
 * away or unknown), or paused (its machine was paused, so it did not run).
 */
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

/** A routine's check on one of its machines, as its last run there left it (times in ms). */
export interface CheckMachineView {
  /** When the check last answered there; null before it has. */
  checkedAt: number | null;
  /** The machine as the routine's `check_on` names it. */
  machine: string;
  /** How it last went there; null before it has run. */
  outcome: CheckOutcome | null;
  /** Why it failed, or what paused it; null otherwise. */
  said: string | null;
  /** When its output there last woke the routine; null: never. */
  wokeAt: number | null;
}

/**
 * A routine's check (task file `check:` and `check_on:`): a shell command
 * the hub runs on each machine at every slot, before any model. Only output
 * wakes the routine's target; a quiet check keeps no run.
 */
export interface RoutineCheckView {
  /** Whether its command is the one the owner approved: a changed one runs nothing until approved again. */
  approved: boolean;
  /** Its command, as its file says it. */
  command: string;
  /** Each machine it runs on, in its file's order. */
  machines: CheckMachineView[];
}

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
 * `task_result`: `silent` (`NO_REPLY`), `delivered` (its words became a
 * notice), `failed` (`AUTOMATION_FAILED`, an item that failed, or Caw's turn
 * ending without a result), `cancelled` (someone stopped it).
 */
export type RoutineOutcome = (typeof ROUTINE_OUTCOMES)[number];

/** Every {@link RoutineVerdict}. */
export const ROUTINE_VERDICTS = ["keep", "stop", "ask"] as const;
/**
 * What a routine's run answered in its `task_result` (Projects spec §5.5,
 * Stopping): keep it going (it fires again on its trigger), stop it (its
 * stop condition holds: the hub moves its task to done with the run's
 * evidence), or ask you (it stands in Needs you with the run's question).
 * Null on a run that gave none.
 */
export type RoutineVerdict = (typeof ROUTINE_VERDICTS)[number];

/** Every {@link TriggerHold}. */
export const TRIGGER_HOLDS = [
  "failed",
  "deadline",
  "failing",
  "asked",
] as const;
/**
 * Why a routine stands in Needs you until you act (hub routines.ts): a slot
 * failed twice; its deadline passed with no stop; three slots in a row
 * failed; or a run asked you. All but the first hold its trigger off.
 */
export type TriggerHold = (typeof TRIGGER_HOLDS)[number];

/** Every {@link ConditionState}. */
export const CONDITION_STATES = [
  "checking",
  "not-yet",
  "could-not-check",
  "met",
  "timed-out",
  "failing",
  "asked",
  "paused",
  "deleted",
] as const;
/**
 * Where a routine's stop condition stands (hub routines.ts `conditionOf`):
 * no run has answered yet, its newest run kept it going, its newest run
 * failed, met (its task is done: a run stopped it, or the person moved it
 * there), or held by the hub at its deadline, after three failing slots or
 * while a run's question waits for the person, paused by someone, or gone
 * (its task deleted or dropped). Only `met` settles a wait on the routine;
 * the last five flag it.
 */
export type ConditionState = (typeof CONDITION_STATES)[number];

/**
 * A routine's stop condition, as its view and a wait on its task read it
 * (times in ms): the statement true once it may stop, where it stands, and
 * the facts each state is told by.
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
   * a delegate, orchestrator or trim run's work item's session, from
   * its start; a conversation run's, once its harness read the run. Null for
   * a run no session took (skipped, one that ended before any began).
   */
  instanceId: string | null;
  outcome: RoutineOutcome | null;
  output: string | null;
  reason: string | null;
  slot: string;
  startedAt: number;
  state: RoutineRunState;
  usd: number | null;
  /** What the run answered in its `task_result` (keep, stop, ask); null for a run that gave none. */
  verdict: RoutineVerdict | null;
  /** A delegate run's work item; null for a conversation run, and before its work began. */
  workItemId: string | null;
}
