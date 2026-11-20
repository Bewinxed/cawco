/**
 * A routine opened in place under its row (Component Story Format 3, live
 * components): the unused skills and servers routine after Monday's run,
 * its result in Recent runs where every routine's result stands; and a
 * routine with a condition a task waits on, not met yet and timed out.
 */
import {
  CONDITION_NOT_YET,
  CONDITION_TIMED_OUT,
  TRIM_RAN,
} from "../views/routines-fixture";
import RoutineDetail from "./RoutineDetail.svelte";

export default {
  title: "Routines/Routine opened",
  component: RoutineDetail,
  args: { routine: TRIM_RAN },
  parameters: { viewport: 1440 },
};

/** I opened the routine after Monday's run proposed a trim. */
export const TrimRan = {};

/** I opened the check tsk-409 waits on: not met yet, its last reason and its runs' verdicts. */
export const ConditionNotYet = { args: { routine: CONDITION_NOT_YET } };

/** I opened it after its day passed unmet. */
export const ConditionTimedOut = { args: { routine: CONDITION_TIMED_OUT } };
