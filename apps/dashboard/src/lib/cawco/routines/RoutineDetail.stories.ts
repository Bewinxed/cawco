/**
 * A routine opened in place under its row (Component Story Format 3, live
 * components): the unused skills and servers routine after Monday's run,
 * its result in Recent runs where every routine's result stands.
 */
import { TRIM_RAN } from "../views/routines-fixture";
import RoutineDetail from "./RoutineDetail.svelte";

export default {
  title: "Routines/Routine opened",
  component: RoutineDetail,
  args: { routine: TRIM_RAN },
  parameters: { viewport: 1440 },
};

/** I opened the routine after Monday's run proposed a trim. */
export const TrimRan = {};
