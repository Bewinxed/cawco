/**
 * The kit's NativeSelect (Component Story Format 3, live components) in a
 * frame of its own (native-select-frame): a pick, and disabled. The meta's
 * args are every story's; a story's own args are what it changes.
 */
import NativeSelectFrame from "./native-select-frame.svelte";

export default {
  title: "Kit/Native select",
  component: NativeSelectFrame,
  args: {
    label: "When the monthly cap is reached",
    options: ["Pause new sessions", "Ask me first", "Keep going"],
    value: "Ask me first",
  },
};

/** A pick made. */
export const Picked = {};

/** Can't be changed on this plan. */
export const Disabled = { args: { disabled: true } };
