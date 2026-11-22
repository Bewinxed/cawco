/**
 * Outcomes, option 1, "the bento holds still" (Component Story Format 3,
 * live components): the project "cockpit" on its Outcomes view, five
 * outcomes spelled out in the order he said them, "Staging is safe to
 * demo" waiting on his answer. Every line opens by its open control as a
 * card hanging from it (a sheet from the foot under 640); the ask is
 * answered there, and the mock hub takes it a second later or refuses it.
 */

import { COCKPIT } from "./outcomes.fixture";
import OutcomesLive from "./outcomes-live.svelte";

export default {
  title: "Outcomes/Option 1, the bento holds still",
  component: OutcomesLive,
  args: { record: COCKPIT, hub: "answers", live: true, open: null, again: 0 },
};

/** Staging waits on my answer; everything else is spelled out where it always stands. */
export const StagingWaitsOnYou = {};
