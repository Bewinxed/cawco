import { tv } from "#lib/utils.js";

/**
 * A row inside a floating surface (DESIGN.md, Navigation, menus and floating
 * surfaces): the kit's menu, select and command items, and the app's own
 * rows in a popover. Its radius is concentric with the floating surface
 * that holds it (DESIGN.md, The Concentric Rule; design.css `concentric-in`):
 * the surface's 12px less its 1px edge and 6px pad, 5px; `radius-xs` where
 * no rounded surface holds it. The control transition, and a
 * floor of `c-menu-item-h`: 32px under a fine pointer, 44px under a finger
 * (the token's coarse mode; The 44 Touch Rule: "Menu items and nav rows are
 * 44px tall on touch"). A mark line: its mark and words share one centre
 * (The Mark Line Rule).
 *
 * Every row also carries `data-menu-item`: the surface's one highlight
 * (components/ui/highlight) finds its rows by it, and a menu's quicker tick
 * (app.css `.kit-tick`) its menu.
 *
 * Its leading glyph (the row's first child, a Solar duotone svg or the
 * icon-swap a copy row holds its copy and its tick in) is in `ink-muted`,
 * as every lead glyph is (DESIGN.md, Caw's panel: a section's glyph "in
 * `ink-muted` in the lead column"). In the row's own `ink-strong` its
 * half-ink layer was near-black too, so a filled shape (Copy's two
 * squares, Stop, Archive) read as one solid dark square (DESIGN.md, Files:
 * "read as a half-ink square"). A destructive row's red, and a chosen
 * row's tick or dot in the row's own ink, stand over it.
 */
export const menuItemVariants = tv({
  base: "min-h-c-menu-item-h concentric-xs transition-control mark-line [&>:where(svg,.icon-swap):first-child]:text-ink-muted",
});
