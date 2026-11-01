/**
 * The design graph, one direction of the explore's one axis (where the
 * states and the move stand beside the stage on a desk): stage.
 */
import DesignGraphFrame from "./preview/DesignGraphFrame.svelte";

export default {
  title: "Design graph/Stage",
  component: DesignGraphFrame,
  args: {
    arrangement: "stage",
    ask: { component: "Routine form", state: "FailedSave", seeing: "journey" },
  },
};

/** The steps on the stage's own foot, the stage alone until the whole set or the move is asked for: the routine form at Save failed. */
export const Stage = { parameters: { viewport: 1440 } };
