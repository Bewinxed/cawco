/**
 * The design graph built as a field (task tsk-18, Option 2): one zoomable
 * field of every state, the kept one grown live where it stands, Walk and
 * Fit two cameras on it. Under review is the task column's own states file
 * on the project's 60 tasks; every move is the column's own motion. One
 * story per width the owner judges at, and the whole field fitted.
 */
import Field from "./Field.svelte";

export default {
  title: "Design graph structures/The field",
  component: Field,
  args: { height: 900 },
  parameters: { viewport: 1440 },
};

/** At a desk, 1440 wide: walking, the camera on the kept card grown live among its neighbours. */
export const Desk = { args: { kept: "Arrived" } };

/** On a phone, 390 wide: the live card fills the width, the next cards peek beside it. */
export const Phone = {
  args: { height: 844, kept: "Arrived" },
  parameters: { viewport: 390 },
};

/** The owner's 2529-wide window: a held card grows live beside the kept one. */
export const Wide = {
  args: { height: 1100, kept: "Picked" },
  parameters: { viewport: 2529 },
};

/** Fit: the camera pulled back, every card, arrow and region in view, the kept one still live. */
export const WholeField = { args: { camera: "fit", kept: "Moving" } };
