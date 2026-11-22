/**
 * A project's Routines screen (Component Story Format 3, live components):
 * one table of routines, each with its name over one sentence of what it last
 * did or is waiting for, when it last ran and runs next, and a Needs you mark
 * only where it needs the person; those that need him lead.
 * Opening a routine shows its latest run, what it does and its earlier runs;
 * opening a run shows its whole result and its session.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import Routines from "./Routines.svelte";

export default {
  args: { stale: false },
  component: Routines,
  decorators: [hubAs("connected")],
  title: "Project/Routines",
};

/** The project's routines: two need me, one is running, the rest are quiet. */
export const Live = {};
