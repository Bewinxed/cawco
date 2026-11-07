/**
 * The canvas view's control (Component Story Format 3, live components): its
 * item in a head's glass (CanvasViewFrame), as the panel's head holds it, so
 * its menu has the glass to hang from.
 */
import CanvasViewFrame from "./CanvasViewFrame.svelte";
import { CanvasViewState } from "./canvas-view.svelte";

export default {
  title: "Preview/Canvas view",
  component: CanvasViewFrame,
  args: {
    view: new CanvasViewState("probe"),
    onverify: () => undefined,
  },
};

/** The canvas view's control in the panel's head, at rest. */
export const Rest = {};
