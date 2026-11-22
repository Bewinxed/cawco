/**
 * The Routines page as one tray of quiet cards: every routine once, in the
 * order the person keeps them, each saying in a sentence what it last did
 * or waits for, and only what needs the person marked, with its one act.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import RoutinesShape from "./RoutinesShape.svelte";

export default {
  title: "Routines shapes/One tray",
  component: RoutinesShape,
  args: { arrangement: "grid" },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** Cawco-Dev's twelve routines on a Saturday morning, three of them asking for me. */
export const Tray = {};
