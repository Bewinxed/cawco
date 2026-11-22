/**
 * The kit's HangCard (Component Story Format 3, live components), as a bar's
 * menu draws it (the bar glass's menu frame, bar-menu-frame): hanging from
 * its glass at the top of a surface, and rising from it at the foot, one
 * shape with the glass it opens from. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import BarMenuFrame from "../bar-glass/bar-menu-frame.svelte";

export default {
  title: "Kit/Hang card",
  component: BarMenuFrame,
  args: {
    label: "Mode",
    width: "compact",
    rows: [
      { words: "Interact", keys: "V" },
      { words: "Comment", keys: "C" },
      { words: "Draw", keys: "D" },
    ],
    height: 280,
  },
};

/** Hanging from the glass at the top of its surface. */
export const Hangs = { args: { stands: "top" } };

/** Rising from the glass at the foot of its surface. */
export const Rises = { args: { stands: "foot" } };
