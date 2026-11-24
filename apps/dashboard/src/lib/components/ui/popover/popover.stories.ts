/**
 * The popover (Component Story Format 3, live components): the kit's
 * Popover open under its trigger in a frame of its own (popover-frame),
 * holding the kit's Command list, its rows on the menu item recipe, so
 * their corners are read against the floating surface's (DESIGN.md, The
 * Concentric Rule); and its `segment` look, the "+N" segment of a
 * segmented group open under the lens. The meta's args are every story's.
 */
import PopoverFrame from "./popover-frame.svelte";
import PopoverSegmentFrame from "./popover-segment-frame.svelte";

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

/** A segmented group's "+N" segment open: it stands under the lens. */
export const Segment = {
  component: PopoverSegmentFrame,
  args: {
    shown: ["All", "anthropics", "sveltejs"],
    hidden: ["huntabyte", "tailwindlabs", "oven-sh"],
    picked: "anthropics",
    height: 220,
  },
  parameters: { viewport: 390 },
};
