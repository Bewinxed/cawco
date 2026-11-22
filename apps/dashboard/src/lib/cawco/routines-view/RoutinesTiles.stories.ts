/**
 * The cockpit project's Routines view laid out as tiles, one per outcome,
 * each holding its routines (Component Story Format 3, live components).
 */
import { hubAs } from "../hub-stand-in";
import Live from "./routines-view-live.svelte";

export default {
  title: "Routines/Tiles",
  component: Live,
  args: { direction: "tiles", hub: "takes" },
  decorators: [hubAs("connected")],
};

/** Sunday morning: the staging check asks whether to restart staging, the migration check is off after failing, the rest run. */
export const Tiles = {};
