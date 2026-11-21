/**
 * A project's Routines screen (Component Story Format 3, live components):
 * one outcome-grouped view (Needs you, Coming up, Ran fine, and collapsed
 * paused or done), with live side surfaces for opening a routine, reading a
 * run's Result and Session, editing by hand, and asking Caw.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import Routines from "./Routines.svelte";

export default {
  args: {
    stale: false,
  },
  component: Routines,
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
  title: "Project/Routines (Hydrogen)",
};

/** Live project Routines screen at desk width: open any routine or run through its expand icon. */
export const Live = {};
