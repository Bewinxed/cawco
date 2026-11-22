/**
 * The kit's CopyButton (Component Story Format 3, live components), mounted
 * as itself: a glyph alone, and with its words. The meta's args are every
 * story's; a story's own args are what it changes.
 */
import CopyButton from "./copy-button.svelte";

export default {
  title: "Kit/Copy button",
  component: CopyButton,
  args: {
    text: "cawco pair --hub obelisk-of-light.local",
    "aria-label": "Copy the pairing command",
  },
};

/** Copy a command, its glyph alone. */
export const Glyph = {};

/** Copy a link, edged, at the small size. */
export const Edged = { args: { variant: "outline", size: "icon-sm" } };
