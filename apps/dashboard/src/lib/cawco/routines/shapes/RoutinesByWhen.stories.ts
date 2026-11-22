/**
 * The Routines page as the board's columns, one per stretch of time a
 * routine runs next in: every routine once, each the same quiet card, its
 * column saying when.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import RoutinesShape from "./RoutinesShape.svelte";

export default {
  title: "Routines shapes/By when",
  component: RoutinesShape,
  args: { arrangement: "when" },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** Cawco-Dev's twelve routines laid out by when each runs next. */
export const ByWhen = {};
