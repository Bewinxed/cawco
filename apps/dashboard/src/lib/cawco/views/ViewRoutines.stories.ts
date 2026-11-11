/**
 * The live Routines page (ViewRoutines) with Caw's suggestion of the unused
 * skills and servers routine, in the states the person meets it (Component
 * Story Format 3, live components), through its seam (ViewRoutinesFrame),
 * each story's stand-in hub answering the page's reads (routines-fixture).
 */
import { hubAs } from "../hub-stand-in";
import { STATES } from "./routines-fixture";
import ViewRoutinesFrame from "./ViewRoutinesFrame.svelte";

export default {
  title: "Routines/Routines page",
  component: ViewRoutinesFrame,
  decorators: [hubAs("connected", STATES.offered)],
  parameters: { viewport: 1440 },
};

/** Caw suggests the routine at the foot of the ledger, under the project's routines. */
export const InRoutines = {};

/** A project with no routine yet: the suggestion under the empty state. */
export const OfferedEmpty = { decorators: [hubAs("connected", STATES.empty)] };

/** Turned on: a routine like the others, and the suggestion gone. */
export const TurnedOn = { decorators: [hubAs("connected", STATES.on)] };

/** Monday's run delivered: its row says so in Last run. */
export const Ran = { decorators: [hubAs("connected", STATES.ran)] };
