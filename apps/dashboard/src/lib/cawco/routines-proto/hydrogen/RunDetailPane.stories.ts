/**
 * One run, opened (Component Story Format 3, live components): its whole
 * result, and the session that did it where a session did.
 */

import RunDetailPane from "./RunDetailPane.svelte";
import {
  INITIAL_ROUTINES,
  type Routine,
  type RoutineRun,
} from "./routines-data";

function pick(
  id: string,
  runId: string
): { routine: Routine; run: RoutineRun } {
  const routine = INITIAL_ROUTINES.find((one) => one.id === id);
  const run = routine?.runs.find((one) => one.id === runId);
  if (!(routine && run)) {
    throw new Error(`No mock run ${runId}`);
  }
  return { routine, run };
}

const ignore = (): void => {
  // The pane's presses are the screen's; here it stands alone.
};

export default {
  args: {
    ...pick("rtn-broken-links", "run-bl-3"),
    onback: ignore,
    onclose: ignore,
    ontab: ignore,
    tab: "result",
  },
  component: RunDetailPane,
  parameters: { viewport: 600 },
  title: "Project/Routines/Opened run",
};

/** Last night's link sweep failed: what it said. */
export const Result = {};

/** The session that ran last night's link sweep. */
export const Session = { args: { tab: "session" } };

/** A staging check that couldn't run, with what the command printed. */
export const CommandOutput = { args: pick("rtn-staging-health", "run-sh-4") };
