/**
 * Caw's panel as it ships today, one option for the decision page: three
 * surfaces, each the shipped component untouched.
 */
import Today from "./Today.svelte";

export default {
  title: "Caw's panel/Today's three",
  component: Today,
  args: {},
};

/** The bar head's card: what waits on you across the fleet. */
export const BarHead = {
  args: { surface: "bar-head" },
  parameters: { viewport: 388 },
};

/** The floating thread: Ask Caw and the Caw beside the project's name open it. */
export const Thread = {
  args: { surface: "thread" },
  parameters: { viewport: 388 },
};

/** The ⋯ card: his sentence and his on/off switch. */
export const Switch = {
  args: { surface: "switch" },
  parameters: { viewport: 388 },
};
