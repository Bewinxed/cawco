/**
 * The kit's Dialog (Component Story Format 3, live components) in a frame of
 * its own (dialog-frame): open over its scrim, a title, a line and two
 * actions. The meta's args are every story's.
 */
import DialogFrame from "./dialog-frame.svelte";

export default {
  title: "Kit/Dialog",
  component: DialogFrame,
  args: {
    title: "Connect studio-mac to this hub",
    line: "Run the pairing command on studio-mac; it joins over your tailnet and shows up in the fleet within a minute.",
    confirm: "Copy the command",
    height: 360,
  },
};

/** Open, asking the person to connect a machine. */
export const Open = {};
