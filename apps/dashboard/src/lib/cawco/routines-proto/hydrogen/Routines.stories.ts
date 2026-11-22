/**
 * A project's Routines screen (Component Story Format 3, live components):
 * one list of outcomes, each a fact the project depends on or what its
 * recurring work delivered, with its answer now, and a Needs you mark only
 * where it needs the person; those that need him lead.
 * Opening one shows the routine behind it: its latest run, what it does and
 * its earlier runs; opening a run shows its whole result and its session.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import Routines from "./Routines.svelte";

export default {
  args: { stale: false },
  component: Routines,
  decorators: [hubAs("connected")],
  title: "Project/Routines",
};

/** What's true in the project now: two answers aren't known and need me, the rest are quiet. */
export const Live = {};
