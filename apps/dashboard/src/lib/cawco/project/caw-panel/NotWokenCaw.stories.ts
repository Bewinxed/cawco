/**
 * Your message didn't wake Caw, one option for the decision page: the line stands as a row of its own on Caw's speaker line.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "A message that didn't wake Caw/As a row from Caw",
  component: PanelScreen,
  args: { scene: "not-woken", note: "caw" },
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

/** Desk, the panel's top: no machine is online, the note under the last message. */
export const DeskTop = {
  args: { form: "desk", peek: 480 },
  parameters: { viewport: 404 },
};
