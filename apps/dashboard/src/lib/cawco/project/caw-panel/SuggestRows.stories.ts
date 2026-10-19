/**
 * An empty thread's suggestions, one option for the decision page: each suggestion a row as wide as its words, its reason under it.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Things to ask Caw/Rows as wide as their words",
  component: PanelScreen,
  args: { scene: "empty", suggest: "rows" },
};

/** Desk: four suggestions. */
export const Desk = {
  args: { form: "desk" },
  parameters: { viewport: 440 },
};

/** Phone: four suggestions. */
export const Phone = {
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};

/** Phone: six, one of them 40 words. */
export const PhoneMany = {
  args: { form: "phone", long: true },
  parameters: { viewport: "phone" },
};
