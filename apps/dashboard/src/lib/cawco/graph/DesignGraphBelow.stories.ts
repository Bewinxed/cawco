/**
 * The design graph, one direction of the explore's one axis (where the
 * states and the move stand beside the stage on a desk): below.
 */
import DesignGraphFrame from "./preview/DesignGraphFrame.svelte";

export default {
  title: "Design graph/Below",
  component: DesignGraphFrame,
  args: {
    arrangement: "below",
    ask: { component: "Routine form", state: "FailedSave" },
  },
};

/** The states and the move in a strip under the stage, the journey across it like a timeline: the routine form at Save failed. */
export const Below = { parameters: { viewport: 1440 } };
