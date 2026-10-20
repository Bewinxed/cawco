/**
 * Caw's panel head, one option for the decision page: The head as Caw over the thread's name, the name a menu of his other threads.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Caw's panel head/Caw over his thread",
  component: PanelScreen,
  args: { scene: "thread", head: "who" },
};

/** Desk: nothing waits on you, so nothing stands beside his name. */
export const Desk = {
  args: { form: "desk" },
  parameters: { viewport: 402 },
};

/** Desk: something waits on you, said beside his name. */
export const DeskWaiting = {
  args: {
    form: "desk",
    fact: { text: "Waiting on your numbers", tone: "attn" },
  },
  parameters: { viewport: 402 },
};

/** Phone: hanging from his tab under the bar, Close last. */
export const Phone = {
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};

/** Phone: a thread whose name runs to 40 words. */
export const PhoneLong = {
  args: {
    form: "phone",
    long: true,
    fact: { text: "Waiting on your numbers", tone: "attn" },
  },
  parameters: { viewport: "phone" },
};
