/**
 * Resizing Caw's panel on a desk, one option for the decision page: Wide panel in the head's More menu, 380 or 560 wide.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Making Caw's panel bigger/Wide panel, in More",
  component: PanelScreen,
  args: { scene: "thread", form: "desk", resize: "menu" },
};

/** Desk: at rest, 380 × 640. Try it here. */
export const Desk = {
  args: {},
  parameters: { viewport: 820 },
};
