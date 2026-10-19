import CanvasView from "./CanvasView.svelte";
import { CanvasViewState } from "./canvas-view.svelte";

export default {
  title: "Preview/Canvas view",
  component: CanvasView,
  args: {
    view: new CanvasViewState("probe", () => undefined),
    onverify: () => undefined,
  },
};

/** The canvas view's control in the panel's head, at rest. */
export const Rest = {};
