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

/** Caw suggests a routine under my routines. */
export const Suggested = {};

/** I have no routines yet, and Caw suggests one. */
export const NoRoutinesYet = { decorators: [hubAs("connected", STATES.empty)] };

/** I turned it on. It sits with my other routines. */
export const TurnedOn = { decorators: [hubAs("connected", STATES.on)] };

/** It ran on Monday and delivered. */
export const Ran = { decorators: [hubAs("connected", STATES.ran)] };
