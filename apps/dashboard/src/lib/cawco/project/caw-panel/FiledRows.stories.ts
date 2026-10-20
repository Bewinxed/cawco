/**
 * The tasks Caw filed under his reply, one option for the decision page: the tasks as one list on the thread's ground.
 */
import PanelScreen from "./PanelScreen.svelte";
import type { PlayContext } from "./play";

export default {
  title: "The tasks Caw filed/One list of rows",
  component: PanelScreen,
  args: { scene: "thread", tasks: "rows" },
};

/** Desk: his reply, a moment before its tasks land. */
export const Before = {
  args: { form: "desk", landed: false },
  parameters: { viewport: 402 },
};

/** Desk: three tasks landed, one after another. */
export const Desk = {
  args: { form: "desk" },
  parameters: { viewport: 402 },
  from: "Before",
  play: async ({ update }: PlayContext) => {
    await update({ landed: true });
  },
};

/** Phone: three tasks. */
export const Phone = {
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};

/** Phone: five tasks, every line at its longest. */
export const PhoneLong = {
  args: { form: "phone", long: true },
  parameters: { viewport: "phone" },
};
