/**
 * Routines, reached from Home's Coming up (Option 2): what was proposed for
 * your yes, then each routine as a ledger row, the failed one first. Cawco's
 * own routines (the reply shortlist that timed out at 06:30, the daily post,
 * the 48-hour measure, the memory curator, the expired one), a routine
 * opened in its pane, New routine's two ways, none yet, loading and stale.
 */
import { ACTIONS, PROJECT, ROUTINES } from "./fixture";
import { LOADING, moveTo, STALE } from "./play";
import RoutinesScreen from "./RoutinesScreen.svelte";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

export default {
  title: "Home first/Routines",
  component: RoutinesScreen,
  args: {
    project: PROJECT,
    routines: ROUTINES,
    actions: ACTIONS,
    read: "live",
  },
};

/** Proposed actions over the routines, the 06:30 failure first. */
export const Routines = { parameters: desk };

/** On a phone: each row on two lines, the answers under each action. */
export const RoutinesPhone = { name: "Routines on a phone", parameters: phone };

/** The failed routine opened: its instruction, its runs, Run now. */
export const RoutineOpen = {
  name: "Failed routine open",
  args: { openRoutine: "r-reply" },
  parameters: desk,
  from: "Routines",
  play: moveTo({ openRoutine: "r-reply" }),
};

/** The failed routine opened on a phone, as a drawer. */
export const RoutineOpenPhone = {
  name: "Failed routine open on a phone",
  args: { openRoutine: "r-reply" },
  parameters: phone,
};

/** New routine pressed: Ask Caw or by hand, and that it runs once at once. */
export const NewRoutine = {
  name: "New routine",
  args: { adding: true },
  parameters: desk,
  from: "Routines",
  play: moveTo({ adding: true }),
};

/** No routine and nothing proposed: both groups named, each saying so. */
export const NoRoutines = {
  name: "No routine yet",
  args: { routines: [], actions: [] },
  parameters: desk,
};

/** No routine yet, on a phone. */
export const NoRoutinesPhone = {
  name: "No routine yet on a phone",
  args: { routines: [], actions: [] },
  parameters: phone,
};

/** The first read. */
export const Loading = { args: LOADING, parameters: desk };

/** The hub unreachable: rows kept, answers and Run now waiting. */
export const Stale = {
  name: "Hub unreachable",
  args: STALE,
  parameters: desk,
};

/** Hub unreachable on a phone. */
export const StalePhone = {
  name: "Hub unreachable on a phone",
  args: STALE,
  parameters: phone,
};
