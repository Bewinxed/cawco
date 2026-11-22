/**
 * A project's Routines screen (Component Story Format 3, live components):
 * one full-width bento of routines (each routine shown once with its state,
 * inline asks, one-line runs, and quick controls) under a count strip, with
 * live side surfaces for opening a routine, reading a run's Result and Session,
 * editing by hand, and asking Caw.
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
