/**
 * Resizing Caw's panel on a desk, one option for the decision page: Wide panel in the head's More menu, 380 or 560 wide.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Making Caw's panel bigger/Wide panel, in More",
  component: PanelScreen,
  args: { scene: "thread", form: "desk", resize: "menu" },
};

/** Desk: open More and choose Wide panel. */
export const Desk = {
  args: {},
  parameters: { viewport: 480 },
};

/** Desk: More open, Wide panel in it. */
export const MenuOpen = {
  args: { menu: true, landed: false },
  parameters: { viewport: 404 },
};

/** Desk: after Wide panel, the panel 560 wide (the size it reopens at, too). */
export const Wide = {
  args: { landed: false, sized: { w: 560, h: 640 } },
  parameters: { viewport: 584 },
};
