/**
 * One routine's card on the Routines page, in each way it reads: quiet,
 * waiting for something, running, asking for the person, and receded.
 */
import RoutineCard from "./RoutineCard.svelte";
import { ROUTINES } from "./shape-data";

const named = (id: string) => {
  const routine = ROUTINES.find((one) => one.id === id);
  if (!routine) {
    throw new Error(`No routine ${id} in the shape's data`);
  }
  return routine;
};

export default {
  title: "Routines shapes/Routine card",
  component: RoutineCard,
  args: {
    routine: named("rtn-memory"),
    onopen: () => undefined,
    onact: () => undefined,
  },
  parameters: { viewport: 320 },
};

/** It ran last night and said what it did. */
export const Quiet = {};

/** It is waiting for Bun 1.4 to come out, and said what it found. */
export const Waiting = { args: { routine: named("rtn-bun") } };

/** Its run is going right now. */
export const Running = { args: { routine: named("rtn-release-notes") } };

/** It failed twice and asks me to run it again. */
export const FailedTwice = { args: { routine: named("rtn-crw") } };

/** It stopped looking at its date, and work is still held. */
export const StoppedLooking = { args: { routine: named("rtn-streams") } };

/** A session made it, and it turns itself off soon unless I keep it. */
export const MadeByASession = { args: { routine: named("rtn-e2e") } };

/** I paused it. */
export const Paused = { args: { routine: named("rtn-changelog") } };

/** It stands open beside the page. */
export const Opened = { args: { selected: true } };
