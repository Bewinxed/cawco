/**
 * The popover (Component Story Format 3, live components): the kit's
 * Popover open under its trigger in a frame of its own (popover-frame),
 * holding rows on the menu item recipe, so their corners are read against
 * the floating surface's (DESIGN.md, The Concentric Rule). The meta's args
 * are every story's.
 */
import PopoverFrame from "./popover-frame.svelte";

export default {
  title: "Kit/Popover",
  component: PopoverFrame,
  args: {
    rows: ["Open in a new tab", "Copy its link", "Archive"],
    height: 220,
  },
};

/** Open: three rows in the floating surface. */
export const Open = { parameters: { viewport: 390 } };
