/**
 * One routine, opened (Component Story Format 3, live components): its latest
 * run's whole result, what it does and when, what it waits for, and its
 * earlier runs, with Edit and Change with Caw at its head.
 */
import RoutineDetailPane from "./RoutineDetailPane.svelte";
import { INITIAL_ROUTINES, type Routine } from "./routines-data";

function routine(id: string): Routine {
  const found = INITIAL_ROUTINES.find((one) => one.id === id);
  if (!found) {
    throw new Error(`No mock routine ${id}`);
  }
  return found;
}

const ignore = (): void => {
  // The pane's presses are the screen's; here it stands alone.
};

export default {
  args: {
    onaskcaw: ignore,
    onclose: ignore,
    onedit: ignore,
    onopenrun: ignore,
    routine: routine("rtn-staging-health"),
  },
  component: RoutineDetailPane,
  parameters: { viewport: 600 },
  title: "Project/Routines/Opened routine",
};

/** The staging check stopped, and two tasks wait on it. */
export const Stopped = {};

/** Last night's link sweep failed. */
export const Failed = { args: { routine: routine("rtn-broken-links") } };

/** The release watch is looking right now. */
export const Running = { args: { routine: routine("rtn-release-tag") } };

/** The morning triage ran fine this morning. */
export const RanFine = { args: { routine: routine("rtn-morning-triage") } };

/** CawCo's own memory routine, paused by me. */
export const Paused = { args: { routine: routine("rtn-nightly-memory") } };

/** What the Stripe move looked for came true. */
export const Finished = { args: { routine: routine("rtn-stripe-v3") } };
