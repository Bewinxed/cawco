/**
 * The canvas's chrome over the composer (Component Story Format 3, live
 * components): the grown shape's top in a frame of its own
 * (canvas-stages-frame), its top grab and its corner grips as the stage
 * stands them, so the grips' corners are read against the shape's (The
 * Concentric Rule) and their stroke at its width (DESIGN.md, The canvas's
 * entrance). The meta's args are every story's.
 */
import CanvasStagesFrame from "./canvas-stages-frame.svelte";

export default {
  title: "Canvas/Stages",
  component: CanvasStagesFrame,
  args: { width: 340, height: 160 },
};

/** Over the composer: the grab and both corner grips. */
export const Composer = { parameters: { viewport: 390 } };
