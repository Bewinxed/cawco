/**
 * Your message didn't wake Caw, one option for the decision page: the line stands under your message, on its words' edge.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "A message that didn't wake Caw/Under your message",
  component: PanelScreen,
  args: { scene: "not-woken", note: "under" },
};

/** Desk: no machine is online. */
export const Desk = {
  args: { form: "desk" },
  parameters: { viewport: 402 },
};

/** Phone: no machine is online. */
export const Phone = {
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};

/** Phone: a 40-word message and a 40-word reason. */
export const PhoneLong = {
  args: { form: "phone", long: true },
  parameters: { viewport: "phone" },
};
