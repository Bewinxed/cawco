/**
 * Outcomes, option 2: the bento has a lead tile, and whatever needs him is
 * already open in it (Component Story Format 3, live components). The
 * project page's head and view strip as they ship, and the Outcomes view
 * in the pane, fed the project "cockpit" on a Sunday afternoon: five
 * outcomes, one waiting on him, Caw's one suggestion and the work under no
 * outcome.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import { COCKPIT_ARGS } from "./outcomes.fixture";
import OutcomesLive from "./outcomes-live.svelte";

export default {
  title: "Outcomes/Lead tile",
  component: OutcomesLive,
  args: COCKPIT_ARGS,
  decorators: [hubAs("connected")],
};

/** He opens Outcomes and the staging check's question is already open, beside the other four outcomes. */
export const Arrival = {};
