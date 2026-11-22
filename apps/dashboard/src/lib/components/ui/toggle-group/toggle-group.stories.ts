/**
 * The kit's ToggleGroup (Component Story Format 3, live components) in a
 * frame of its own (toggle-group-frame): one pick of three, and disabled.
 * The meta's args are every story's; a story's own args are what it changes.
 */
import ToggleGroupFrame from "./toggle-group-frame.svelte";

export default {
  title: "Kit/Toggle group",
  component: ToggleGroupFrame,
  args: {
    label: "Effort",
    options: ["Low", "Medium", "High"],
    value: "Medium",
  },
};

/** Medium picked. */
export const Picked = {};

/** Can't be changed while the session runs. */
export const Disabled = { args: { disabled: true } };
