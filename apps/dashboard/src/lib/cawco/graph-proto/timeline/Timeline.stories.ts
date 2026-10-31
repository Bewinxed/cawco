/**
 * The design graph built as a timeline (task tsk-18, Option 1): the states
 * are keyframes on one track at the panel's foot, each move the gap between
 * two of them, and the gap is the scrubber. Under review is the task
 * column's own states file on the project's 60 tasks; every move is the
 * column's own motion. One story per width the owner judges at.
 */
import Timeline from "./Timeline.svelte";

export default {
  title: "Design graph structures/The timeline",
  component: Timeline,
  args: { height: 900 },
  parameters: { viewport: 1440 },
};

/** At a desk, 1440 wide: the track rests at the foot, the column kept on its first step. */
export const Desk = {};

/** On a phone, 390 wide: the track under the thumb, the kept keyframe centred, the settings at its foot. */
export const Phone = { args: { height: 844 }, parameters: { viewport: 390 } };

/** The owner's 2529-wide window: a held keyframe stands beside the kept one at its own width. */
export const Wide = {
  args: { height: 1100, kept: "Picked" },
  parameters: { viewport: 2529 },
};

/** All at once: the track dragged up into the map, the stage still under it. */
export const AllAtOnce = { args: { seeing: "all", kept: "Moving" } };
