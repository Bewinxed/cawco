/**
 * The segmented control (Component Story Format 3, live components): the
 * kit's Tabs list in a frame of its own (segmented-frame), its thumb under
 * the chosen segment, so the thumb's corners are read against the
 * groove's (DESIGN.md, Segmented; The Concentric Rule). The meta's args are
 * every story's; a story's own args are what it changes.
 */
import SegmentedFrame from "./segmented-frame.svelte";

export default {
  title: "Kit/Segmented",
  component: SegmentedFrame,
  args: { segments: ["Day", "Week", "Month"], chosen: "Day" },
};

/** The first segment chosen: the thumb at the groove's leading corners. */
export const First = { parameters: { viewport: 390 } };

/** The last segment chosen: the thumb at the groove's trailing corners. */
export const Last = {
  args: { chosen: "Month" },
  parameters: { viewport: 390 },
};
