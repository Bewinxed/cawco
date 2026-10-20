/**
 * Resizing Caw's panel on a desk, one option for the decision page: drag the panel's leading edge, its foot or their corner, the rail's own grip.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Making Caw's panel bigger/Its edges, as the rail's",
  component: PanelScreen,
  args: { scene: "thread", form: "desk", resize: "edges" },
};

/** Desk: drag the panel's leading edge, its foot or their corner. */
export const Desk = {
  args: {},
  parameters: { viewport: 480 },
};

/** Desk: the pointer on the leading edge, its grip drawn. */
export const Pointing = {
  args: { lit: true, landed: false, peek: 320 },
  parameters: { viewport: 404 },
};
