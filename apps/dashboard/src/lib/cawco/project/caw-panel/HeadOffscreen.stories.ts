/**
 * The head's title, one option for the decision page: your first message's
 * line, shown only while that message is off screen.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "The head's title/Your first line, once it's off screen",
  component: PanelScreen,
  args: { scene: "idle", title: "offscreen" },
};

/** Desk, the thread at its start: your first message in view, the head names nothing. */
export const DeskStart = {
  args: { form: "desk", latest: false },
  parameters: { viewport: 388 },
};

/** Desk, a few messages on: your first message off screen, its line in the head. */
export const DeskLater = {
  args: { form: "desk" },
  parameters: { viewport: 388 },
};

/** Phone, the thread at its start. */
export const PhoneStart = {
  args: { form: "phone", latest: false },
  parameters: { viewport: "phone" },
};

/** Phone, a few messages on. */
export const PhoneLater = {
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};
