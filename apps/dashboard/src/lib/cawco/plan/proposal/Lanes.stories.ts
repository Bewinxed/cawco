/**
 * Lanes: the plan with its dependencies drawn, two lanes and lines between steps.
 * Component Story Format 3, live components: the real plan pieces through
 * PlanFrame.svelte on the booking-page plan, at the desk's side card and the
 * phone's sheet. The args every story shares are the values to tune once
 * this way is picked: the tile's size, the progress line's weight and the
 * sweep's speed.
 */
import PlanFrame from "./PlanFrame.svelte";

export default {
  title: "Plan/Lanes",
  component: PlanFrame,
  args: { variation: "b", tileSize: 18, lineWeight: 4, sweepSeconds: 1.2 },
};

/** Desk · Lanes: steps that run side by side in two lanes, lines to the steps that start after them, the line to the working delegate pulsing. */
export const Plan = {
  args: { frame: "desk" },
  parameters: { viewport: 360 },
};

/** On your screen · Lanes as the reader's own screen draws it: the phone's sheet under a finger, the desk's card under a mouse, its whole plan shown (a decision page's drawing). */
export const Device = {
  args: { frame: "device", whole: true },
  parameters: { viewport: 360 },
};

/** Phone · Lanes in the sheet: a step opens on a page of its own. */
export const Phone = {
  args: { frame: "phone" },
  parameters: { viewport: "phone" },
};

/** Desk · Lanes, a to-do reworded: the line under it says this session, the task's attempt, has seen it. */
export const Edited = {
  args: { frame: "desk", scenario: "edited" },
  parameters: { viewport: 360 },
};

/** Desk · Lanes, a comment on the date picker, which Fable carries: sent to Fable, this session hears it too. */
export const Commented = {
  args: { frame: "desk", scenario: "commented" },
  parameters: { viewport: 360 },
};

/** Desk · Lanes, the comment answered: seen by Fable, its reply on the step's thread and under the step. */
export const Acknowledged = {
  args: { frame: "desk", scenario: "acknowledged" },
  parameters: { viewport: 360 },
};

/** Desk · Lanes live: the pulse runs to the working delegate; the date picker and deposit finish and their lines meet at the step that waited. */
export const Live = {
  args: { frame: "desk", live: true },
  parameters: { viewport: 360 },
};
