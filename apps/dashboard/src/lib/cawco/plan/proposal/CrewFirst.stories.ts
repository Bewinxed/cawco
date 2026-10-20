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

/** On your screen · Crew first as the reader's own screen draws it: the phone's sheet under a finger, the desk's card under a mouse, cut only between lines (a decision page's drawing). */
export const Device = {
  args: { frame: "device", crop: true },
  parameters: { viewport: 360 },
};

/** Phone · Crew first in the sheet: a delegate or a step opens on a page of its own. */
export const Phone = {
  args: { frame: "phone" },
  parameters: { viewport: "phone" },
};

/** Desk · Crew first, a to-do reworded: the line under it says this session, the task's attempt, has seen it. */
export const Edited = {
  args: { frame: "desk", scenario: "edited" },
  parameters: { viewport: 360 },
};

/** Desk · Crew first, a comment on the date picker, which Fable carries: sent to Fable, this session hears it too. */
export const Commented = {
  args: { frame: "desk", scenario: "commented" },
  parameters: { viewport: 360 },
};

/** Desk · Crew first, the comment answered: seen by Fable, its reply on the step's thread and under the step. */
export const Acknowledged = {
  args: { frame: "desk", scenario: "acknowledged" },
  parameters: { viewport: 360 },
};

/** Desk · Crew first live: the stack reorders as delegates finish, a finished one folds into the count, its tile leaves the to-do. */
export const Live = {
  args: { frame: "desk", live: true },
  parameters: { viewport: 360 },
};

/** Desk · Crew first, the date picker open to its description, its sub-steps and its delegate, cut only between lines (a decision page's drawing). */
export const Opened = {
  args: { frame: "desk", scenario: "opened", crop: true },
  parameters: { viewport: 360 },
};

/** A working delegate's line drawn large at the start, middle and end of one run of its pulse, each named. */
export const Pulse = {
  args: { frame: "delegate", lineWeight: 10 },
  parameters: { viewport: 360 },
};

/** The to-do that became task tsk-14, its row alone: the task's glyph and its id. */
export const Badge = {
  args: { frame: "step" },
  parameters: { viewport: 360 },
};
