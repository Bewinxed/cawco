/**
 * The message box while Caw can't start, one option for the decision page:
 * it goes, and the block's button is the only thing to press.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "While Caw can't start/The message box goes",
  component: PanelScreen,
  args: { scene: "no-machine", composer: "goes" },
};

/** Desk: no machine is online. */
export const Desk = {
  args: { form: "desk" },
  parameters: { viewport: 388 },
};

/** Phone: no machine is online. */
export const Phone = {
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};

/** Desk: the budget is reached. */
export const DeskBudget = {
  args: { form: "desk", scene: "budget" },
  parameters: { viewport: 388 },
};
