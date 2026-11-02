/**
 * The design graph, one direction of the explore's one axis (where the
 * states and the move stand beside the stage on a desk): beside.
 */
import DesignGraphFrame from "./preview/DesignGraphFrame.svelte";

export default {
  title: "Design graph/Beside",
  component: DesignGraphFrame,
  args: {
    arrangement: "beside",
    ask: { component: "Routine form", state: "FailedSave" },
  },
};

/** The states and the move in one room beside the stage, the journey down it: the routine form at Save failed, as the agent asks for it. */
export const Beside = { parameters: { viewport: 1440 } };
