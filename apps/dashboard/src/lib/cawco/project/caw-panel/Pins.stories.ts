/**
 * What his pins settled on Caw's panel: no Open the board under the filed tasks (pin 2), and the head's line says only a fact you'd act on (pin 12).
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Fixed from your pins/Caw's panel",
  component: PanelScreen,
  args: { scene: "thread" },
};

/** Desk: nothing waits on you, so the head says nothing past his name. */
export const Desk = {
  args: { form: "desk" },
  parameters: { viewport: 440 },
};

/** Desk: the budget holds him, said beside his name. */
export const DeskBudget = {
  args: {
    form: "desk",
    fact: { text: "Budget reached · resets in 4h", tone: "attn" },
  },
  parameters: { viewport: 440 },
};

/** Desk: Caw is off. */
export const DeskOff = {
  args: {
    form: "desk",
    fact: { text: "Off · answers when you write", tone: "secondary" },
  },
  parameters: { viewport: 440 },
};
