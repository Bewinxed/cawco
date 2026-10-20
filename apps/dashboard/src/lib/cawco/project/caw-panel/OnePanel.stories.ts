/**
 * Caw's panel as one panel, one option for the decision page: what waits in
 * other projects, then this project's thread, then the message box.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Caw's panel/One panel",
  component: PanelScreen,
  args: { scene: "waiting" },
};

/** Desk: two asks from other projects over the thread, Caw's reply and the tasks he filed. */
export const Desk = {
  args: { form: "desk" },
  parameters: { viewport: 388 },
};

/** Phone: the same, a sheet from the bar's floor to the screen's foot. */
export const Phone = {
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};
