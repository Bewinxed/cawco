/**
 * Where a routine's stop condition stands (Projects spec §5.5, Stopping),
 * as a wait on its task (task-waits.ts) and its view (routines.ts) read it:
 * worked out from its trigger, its newest ended run and its task's stage
 * kind. Nothing latches: its task in a done stage is the stop.
 *
 * | State           | When                                                       |
 * | --------------- | ---------------------------------------------------------- |
 * | met             | its task is in a done stage: a run stopped it, or you      |
 * | deleted         | its task is dropped, archived or gone, and was not done    |
 * | timed-out       | its deadline passed with no stop (`held: deadline`)        |
 * | failing         | three slots in a row failed (`held: failing`)              |
 * | asked           | a run asked you, and the question waits (`held: asked`)    |
 * | paused          | it is off, and the hub holds it for nothing                |
 * | checking        | no run has ended yet                                       |
 * | could-not-check | its newest run failed                                      |
 * | not-yet         | its newest run kept it going                               |
 */
import type {
  ConditionState,
  ConditionView,
  TriggerHold,
} from "@cawco/core/routine-kinds";
import type { StageKind } from "@cawco/core/views";
import type { RoutineRunRow } from "./db/task-triggers";

/** What a routine's stop is read from. */
export interface RoutineFacts {
  asked: string | null;
  deadline: Date | null;
  enabled: boolean;
  held: TriggerHold | null;
  /** Its newest ended run; undefined before any. */
  newest: RoutineRunRow | undefined;
  nextSlot: Date | null;
  stop: string;
}

const ms = (date: Date | null | undefined): number | null =>
  date?.getTime() ?? null;

/** Where a routine's stop stands, its task's stage kind (`gone`: no index row) read with it. */
export const stopStateOf = (
  facts: RoutineFacts,
  kind: StageKind | null | "gone"
): ConditionState => {
  if (kind === "done") {
    return "met";
  }
  if (kind === "dropped" || kind === "gone") {
    return "deleted";
  }
  if (facts.held === "deadline") {
    return "timed-out";
  }
  if (facts.held === "failing") {
    return "failing";
  }
  if (facts.held === "asked") {
    return "asked";
  }
  if (!facts.enabled) {
    return "paused";
  }
  if (!facts.newest) {
    return "checking";
  }
  return facts.newest.outcome === "failed" ? "could-not-check" : "not-yet";
};

/** The sentence a routine's stop stands on: its question while it asks, else its newest run's reason unless that run stopped it. */
const reasonOf = (
  state: ConditionState,
  facts: RoutineFacts,
  ranStop: boolean
): string | null => {
  if (state === "asked") {
    return facts.asked;
  }
  return ranStop ? null : (facts.newest?.reason ?? null);
};

/** A routine's stop as a wait and its view read it. */
export const stopViewOf = (
  facts: RoutineFacts,
  kind: StageKind | null | "gone",
  /** Why its task closed, as its done move said: a run's evidence, or yours. */
  closeReason: string | null
): ConditionView => {
  const state = stopStateOf(facts, kind);
  const { newest } = facts;
  const ranStop = newest?.verdict === "stop";
  return {
    statement: facts.stop,
    state,
    checkedAt: ms(newest?.endedAt),
    nextAt:
      state === "not-yet" || state === "checking" || state === "could-not-check"
        ? ms(facts.nextSlot)
        : null,
    deadline: ms(facts.deadline),
    reason: reasonOf(state, facts, ranStop),
    metAt: null,
    markedMet: state === "met" && !ranStop,
    evidence:
      state === "met"
        ? (closeReason ?? (ranStop ? newest?.output : null) ?? null)
        : null,
  };
};
