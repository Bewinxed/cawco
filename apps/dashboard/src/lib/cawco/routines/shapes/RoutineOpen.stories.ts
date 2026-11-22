/**
 * One routine opened beside the Routines page, in each way it reads: one
 * that failed, one waiting on a command's answer, one that stopped looking
 * with work held, one asking to act outside, and one a session made.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import RoutineOpen from "./RoutineOpen.svelte";
import { named } from "./shape-data";

const quiet = () => undefined;

export default {
  title: "Routines shapes/Routine opened",
  component: RoutineOpen,
  args: {
    routine: named("rtn-crw"),
    onclose: quiet,
    onrun: quiet,
    onpause: quiet,
    onkeep: quiet,
    onchange: quiet,
    onedit: quiet,
  },
  decorators: [hubAs("connected")],
  parameters: { viewport: 600 },
};

/** It failed twice, and I can run it again or ask Caw about it. */
export const FailedTwice = {};

/** It waits for Bun 1.4, and I can read the command that checks. */
export const WaitingOnACommand = { args: { routine: named("rtn-bun") } };

/** It stopped looking at its date while a task still waits on it. */
export const StoppedLooking = { args: { routine: named("rtn-streams") } };

/** Its run asks to close four issues on GitHub. */
export const AsksToActOutside = { args: { routine: named("rtn-stale") } };

/** A session made it and said why. */
export const MadeByASession = { args: { routine: named("rtn-e2e") } };
