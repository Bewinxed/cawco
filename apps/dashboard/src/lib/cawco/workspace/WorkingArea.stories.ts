/**
 * The working area whole (Component Story Format 3, live components): the
 * tabs, the transcript, the preview panel beside it and what the panel shows,
 * real components on placeholder data.
 */
import WorkingAreaFrame from "./WorkingAreaFrame.svelte";

export default {
  title: "Workspace/Working area",
  component: WorkingAreaFrame,
  parameters: { viewport: "desk" },
};

/** A conversation at work with its preview open beside it. */
export const PreviewOpen = {};
