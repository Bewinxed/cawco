/**
 * Outcomes, option 1, "holds still" (Component Story Format 3, live
 * components): the project "cockpit" on its Outcomes view, its five
 * outcomes in three bands by what they need. "Staging is safe to demo"
 * waits on his answer and leads, its question under the line it concerns;
 * the outcomes with a line that is not true follow; "Main stays green",
 * all true, is one quiet line at the foot. A line opens from its answer
 * word as a card hanging from it (a sheet from the foot under 640); the ask
 * is answered there, and the mock hub takes it a second later or refuses
 * it.
 */

import { COCKPIT } from "./outcomes.fixture";
import OutcomesLive from "./outcomes-live.svelte";

export default {
  title: "Outcomes/Option 1, the bento holds still",
  component: OutcomesLive,
  args: { record: COCKPIT, hub: "answers", live: true, open: null, again: 0 },
};

/** Staging waits on my answer and comes first; what is all true sits quietly at the foot. */
export const StagingWaitsOnYou = {};
