/**
 * The Pipeline tab removed: the project's views without it, over the
 * board, whose column heads already count each stage. At the pane's width
 * on a desk, and on a phone.
 */
import PipelineRemovedFixture from "./PipelineRemovedFixture.svelte";

export default {
  title: "Pipeline/Removed",
  component: PipelineRemovedFixture,
  args: {},
};

/** Desk · No Pipeline tab; the board's column heads count each stage. */
export const Removed = { parameters: { viewport: 1180 } };
/** Phone · No Pipeline tab. */
export const Phone = { parameters: { viewport: "phone" } };
