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

/** Phone · Lanes in the sheet: a step opens on a page of its own. */
export const OnPhone = {
  args: { frame: "phone" },
  parameters: { viewport: "phone" },
};

/** Desk · Lanes live: the pulse runs to the working delegate; the date picker and deposit finish and their lines meet at the step that waited. */
export const Live = {
  args: { frame: "desk", live: true },
  parameters: { viewport: 360 },
};
