import CanvasView from "./CanvasView.svelte";

export default {
  title: "Preview/Canvas view",
  component: CanvasView,
  args: { instanceId: "probe", post: () => undefined, ready: false },
};

/** The canvas view's control in the panel's head, at rest. */
export const Rest = {};
