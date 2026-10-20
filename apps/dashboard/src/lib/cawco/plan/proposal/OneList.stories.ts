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

/** On your screen · One list as the reader's own screen draws it: the phone's sheet under a finger, the desk's card under a mouse, cut only between lines (a decision page's drawing). */
export const Device = {
  args: { frame: "device", crop: true },
  parameters: { viewport: 360 },
};

/** Phone · One list in the sheet: every row a finger's height, steps open in place. */
export const Phone = {
  args: { frame: "phone" },
  parameters: { viewport: "phone" },
};

/** Desk · One list, a to-do reworded: the line under it says this session, the task's attempt, has seen it. */
export const Edited = {
  args: { frame: "desk", scenario: "edited" },
  parameters: { viewport: 360 },
};

/** Desk · One list, a comment on the date picker, which Fable carries: sent to Fable, this session hears it too. */
export const Commented = {
  args: { frame: "desk", scenario: "commented" },
  parameters: { viewport: 360 },
};

/** Desk · One list, the comment answered: seen by Fable, its reply on the step's thread and under the step. */
export const Acknowledged = {
  args: { frame: "desk", scenario: "acknowledged" },
  parameters: { viewport: 360 },
};

/** Desk · One list live: a sub-step ticks, the deposit's delegate fills its line and stops, the waiting step starts. */
export const Live = {
  args: { frame: "desk", live: true },
  parameters: { viewport: 360 },
};
