/**
 * Crew first: the delegates on top, what needs you first, then a quiet to-do list.
 * Component Story Format 3, live components: the real plan pieces through
 * PlanFrame.svelte on the booking-page plan, at the desk's side card and the
 * phone's sheet. The args every story shares are the values to tune once
 * this way is picked: the tile's size, the progress line's weight and the
 * sweep's speed.
 */
import PlanFrame from "./PlanFrame.svelte";

export default {
  title: "Plan/Crew first",
  component: PlanFrame,
  args: { variation: "c", tileSize: 18, lineWeight: 4, sweepSeconds: 1.2 },
};

/** Desk · Crew first: who needs you, then who is working, each with its progress line, above the to-dos with small tiles for who is on each. */
export const Plan = {
  args: { frame: "desk" },
  parameters: { viewport: 360 },
};

/** Phone · Crew first in the sheet: a delegate or a step opens on a page of its own. */
export const OnPhone = {
  args: { frame: "phone" },
  parameters: { viewport: "phone" },
};

/** Desk · Crew first live: the stack reorders as delegates finish, a finished one folds into the count, its tile leaves the to-do. */
export const Live = {
  args: { frame: "desk", live: true },
  parameters: { viewport: 360 },
};
