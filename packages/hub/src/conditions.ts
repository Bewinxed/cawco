/**
 * A routine's condition as everything reads it (Projects spec §5.5, condition
 * waits): where it stands, worked out from the routine's row and its newest
 * runs, and which of a project's routines a wait names. Read by the one wait
 * resolver (task-waits.ts, through server.ts), by the routine's view and
 * tools (routines.ts), and by nothing else; routines.ts alone writes it.
 *
 * | State           | When                                                       |
 * | --------------- | ---------------------------------------------------------- |
 * | met             | `met_at` is set: a run said met, or the person marked it   |
 * | timed-out       | the hub stopped it at its deadline (`stopped: deadline`)   |
 * | failing         | the hub stopped it after failing slots (`stopped: failing`) |
 * | paused          | it is off, and the hub did not stop it                     |
 * | checking        | no run has answered since it became a condition            |
 * | could-not-check | its newest answering run failed                            |
 * | not-yet         | its newest answering run said unmet                        |
 *
 * An answering run is one that ended with a verdict, or failed: a run from
 * before the routine had a condition, which said nothing of it, is none.
 */

import type { ConditionState, ConditionView } from "@cawco/core/routine-kinds";
import type { RoutineRow, RoutineRunRow, RoutinesDb } from "./db/routines";
import { byHandle, type Handled, namesAny } from "./handles";

/** Runs read back to find a condition's newest answer and its failing streak. */
const RUNS_READ = 30;

/** Slots in a row whose last attempt failed before the hub stops a condition's checks. */
export const FAILING_SLOTS = 3;

const ms = (date: Date | null): number | null => date?.getTime() ?? null;

/** Whether a run answered its condition: ended with a verdict, or failed. */
const answered = (run: RoutineRunRow): boolean =>
  run.state === "ended" && (run.verdict !== null || run.outcome === "failed");

/** Where a condition stands, from its row and its newest answering run. */
const stateOf = (
  row: RoutineRow,
  newest: RoutineRunRow | undefined
): ConditionState => {
  if (row.metAt) {
    return "met";
  }
  if (row.stopped === "deadline") {
    return "timed-out";
  }
  if (row.stopped === "failing") {
    return "failing";
  }
  if (!row.enabled) {
    return "paused";
  }
  if (!newest) {
    return "checking";
  }
  return newest.outcome === "failed" ? "could-not-check" : "not-yet";
};

/** A routine's condition as it stands now; null for a routine with none. */
export const conditionOf = (
  row: RoutineRow,
  store: Pick<RoutinesDb, "runs">
): ConditionView | null => {
  if (row.condition === null) {
    return null;
  }
  const newest = store.runs(row.id, RUNS_READ).find(answered);
  const state = stateOf(row, newest);
  return {
    statement: row.condition,
    state,
    checkedAt: ms(newest?.endedAt ?? null),
    nextAt:
      state === "not-yet" || state === "checking" || state === "could-not-check"
        ? row.nextSlot.getTime()
        : null,
    deadline: ms(row.deadline),
    reason: newest && newest.verdict !== "met" ? newest.reason : null,
    metAt: ms(row.metAt),
    markedMet: row.metAt !== null && row.metBy === "owner",
    evidence: row.metEvidence,
  };
};

/**
 * How many slots in a row, newest first, ended failed on their last
 * attempt: a slot's last ended attempt is what it came to. A slot that
 * answered (met, unmet) ends the streak; one stopped or skipped is passed
 * over.
 */
export const failingSlots = (store: Pick<RoutinesDb, "runs">, id: string) => {
  const seen = new Set<string>();
  let failing = 0;
  for (const run of store.runs(id, RUNS_READ)) {
    if (
      run.state !== "ended" ||
      run.outcome === "cancelled" ||
      seen.has(run.slot)
    ) {
      continue;
    }
    seen.add(run.slot);
    if (run.outcome !== "failed") {
      return failing;
    }
    failing += 1;
  }
  return failing;
};

/** How a wait or a tool names a routine: its id, handle or name (handles.ts). */
export const routineKeys: Handled<RoutineRow> = {
  id: (routine) => routine.id,
  names: (routine) => [routine.name],
  said: (routine) => `${routine.name} ${routine.id.slice(0, 8)}`,
};

/** A project's conditions, as a refusal lists them: each routine's handle, name and statement. */
const conditionsListed = (routines: readonly RoutineRow[]): string => {
  const conditions = routines.filter((routine) => routine.condition !== null);
  return conditions.length === 0
    ? "The project has no routine with a condition: make one with routine_create and a condition."
    : `Its conditions: ${conditions.map((routine) => `routine:${routine.id.slice(0, 8)} (${routine.name}: “${routine.condition}”)`).join("; ")}.`;
};

/**
 * The project's routine `asked` names (its handle, id or name), with its
 * condition, as a wait reads it (task-waits.ts `WaitReader.routine`); a
 * refusal when the writer is in no project, or it names none of the
 * project's routines, listing the project's conditions.
 */
export const routineForWait = (
  store: Pick<RoutinesDb, "list">,
  projectId: string,
  asked: string
):
  | { condition: string | null; id: string; name: string }
  | {
      code: "wait-routine-no-project" | "wait-routine-unknown";
      detail: string;
    } => {
  if (!projectId) {
    return {
      code: "wait-routine-no-project",
      detail:
        "This session is in no project, so it has no routines to wait on: a condition is a routine of a project.",
    };
  }
  const routines = store.list(projectId);
  if (!namesAny(asked, routines, routineKeys)) {
    return {
      code: "wait-routine-unknown",
      detail: `No routine of this project is “${asked}”. ${conditionsListed(routines)}`,
    };
  }
  try {
    const routine = byHandle(asked, routines, routineKeys, "routine");
    return {
      id: routine.id,
      name: routine.name,
      condition: routine.condition,
    };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return {
      code: "wait-routine-unknown",
      detail: `${why} ${conditionsListed(routines)}`,
    };
  }
};
