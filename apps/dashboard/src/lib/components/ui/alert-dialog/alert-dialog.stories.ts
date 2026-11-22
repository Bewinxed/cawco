/**
 * The kit's AlertDialog (Component Story Format 3, live components) in a
 * frame of its own (alert-dialog-frame): open over its scrim, asking before
 * something is lost. The meta's args are every story's.
 */
import AlertDialogFrame from "./alert-dialog-frame.svelte";

export default {
  title: "Kit/Alert dialog",
  component: AlertDialogFrame,
  args: {
    title: "Stop the session on obelisk-of-light?",
    line: "Its work so far stays on the branch; the agent stops mid-step.",
    confirm: "Stop the session",
    height: 320,
  },
};

/** Open, asking before a session stops. */
export const Open = {};
