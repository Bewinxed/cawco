import { tv } from "#lib/utils.js";

/**
 * A row inside a floating surface (DESIGN.md, Navigation, menus and floating
 * surfaces): the kit's menu, select and command items, and the app's own
 * rows in a popover. The radius of an item inside a surface (DESIGN.md,
 * Shapes: "8px for items inside a surface"), the control transition, and a
 * floor of `c-menu-item-h`: 32px under a fine pointer, 44px under a finger
 * (the token's coarse mode; The 44 Touch Rule: "Menu items and nav rows are
 * 44px tall on touch"). A mark line: its mark and words share one centre
 * (The Mark Line Rule).
 *
 * Every row also carries `data-menu-item`: the surface's one highlight
 * (components/ui/highlight) finds its rows by it, and a menu's quicker tick
 * (app.css `.kit-tick`) its menu.
 */
export const menuItemVariants = tv({
  base: "mark-line min-h-c-menu-item-h rounded-sm transition-control",
});
