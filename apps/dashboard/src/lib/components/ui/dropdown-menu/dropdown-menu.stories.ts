/**
 * The dropdown menu (Component Story Format 3, live components): the kit's
 * DropdownMenu open under its trigger in a frame of its own
 * (dropdown-menu-frame), its items on the menu item recipe inside the
 * floating surface, so their corners are read against the surface's
 * (DESIGN.md, The Concentric Rule). The meta's args are every story's.
 */
import DropdownMenuFrame from "./dropdown-menu-frame.svelte";

export default {
  title: "Kit/Dropdown menu",
  component: DropdownMenuFrame,
  args: {
    items: ["Rename", "Duplicate", "Move to project"],
    checked: "Pinned",
    height: 260,
  },
};

/** Open: three items, a separator and a checked item. */
export const Open = { parameters: { viewport: 390 } };
