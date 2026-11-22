/**
 * The kit's Textarea (Component Story Format 3, live components), mounted
 * as itself: empty, holding a few lines, and disabled. The meta's args are
 * every story's; a story's own args are what it changes.
 */
import Textarea from "./textarea.svelte";

export default {
  title: "Kit/Textarea",
  component: Textarea,
  args: {
    "aria-label": "What the task asks",
    placeholder: "Say what done looks like",
  },
};

/** Waiting for the brief. */
export const Empty = {};

/** A brief of a few lines. */
export const Written = {
  args: {
    value:
      "Move the session list onto the shared tab strip.\nKeep the unread marks where they are, and check it at 390 and 1440.",
  },
};

/** A brief that can't be edited once the task has started. */
export const Disabled = {
  args: { value: "Ship the hub's new pairing flow.", disabled: true },
};
