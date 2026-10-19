/**
 * One list: the plan as one list, a delegate as one row under its to-do, a dependency as an "after" chip.
 * Component Story Format 3, live components: the real plan pieces through
 * PlanFrame.svelte on the booking-page plan, at the desk's side card and the
 * phone's sheet. The args every story shares are the values to tune once
 * this way is picked: the tile's size, the progress line's weight and the
 * sweep's speed.
 */
import PlanFrame from "./PlanFrame.svelte";

export default {
  title: "Plan/One list",
  component: PlanFrame,
  args: { variation: "a", tileSize: 18, lineWeight: 4, sweepSeconds: 1.2 },
};

/** Desk · One list: the whole plan, each delegate one row under the to-do it carries; press a step's words to open it. */
export const Plan = {
  args: { frame: "desk" },
  parameters: { viewport: 360 },
};

/** Phone · One list in the sheet: every row a finger's height, steps open in place. */
export const OnPhone = {
  args: { frame: "phone" },
  parameters: { viewport: "phone" },
};

/** Desk · One list live: a sub-step ticks, the deposit's delegate fills its line and stops, the waiting step starts. */
export const Live = {
  args: { frame: "desk", live: true },
  parameters: { viewport: 360 },
};
