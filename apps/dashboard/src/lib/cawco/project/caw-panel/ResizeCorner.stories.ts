/**
 * Resizing Caw's panel on a desk, one option for the decision page: drag an L at the panel's free corner, always drawn.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Making Caw's panel bigger/A corner grip",
  component: PanelScreen,
  args: { scene: "thread", form: "desk", resize: "corner" },
};

/** Desk: at rest, 380 × 640. Try it here. */
export const Desk = {
  args: {},
  parameters: { viewport: 820 },
};
