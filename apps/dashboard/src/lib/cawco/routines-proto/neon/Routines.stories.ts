/**
 * A project's Routines screen (Component Story Format 3, live components):
 * one calm list of what the project does and checks on its own, with live
 * side surfaces for opening a routine, reading a past run's full result and
 * session, editing by hand or asking Caw, and inspecting approved actions
 * and event sources.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import Routines from "./Routines.svelte";

export default {
  title: "Project/Routines (Neon)",
  component: Routines,
  args: {
    stale: false,
  },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** Live project Routines screen at desk width: open any routine or run through its open icon. */
export const Live = {};
