/**
 * The head's title, one option for the decision page: the few words Caw
 * names the thread with when he first answers, always shown.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "The head's title/Caw names the thread",
  component: PanelScreen,
  args: { scene: "idle", title: "named" },
};

/** Desk, the thread at its start: your first message under his name for it. */
export const DeskStart = {
  args: { form: "desk", latest: false },
  parameters: { viewport: 388 },
};

/** Desk, a few messages on. */
export const DeskLater = {
  args: { form: "desk" },
  parameters: { viewport: 388 },
};

/** Phone, the thread at its start. */
export const PhoneStart = {
  args: { form: "phone", latest: false },
  parameters: { viewport: "phone" },
};

/** Phone, a name that runs long. */
export const PhoneLong = {
  args: { form: "phone", long: true },
  parameters: { viewport: "phone" },
};
