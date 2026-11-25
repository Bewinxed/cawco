import { tv } from "#lib/utils.js";

/**
 * A row inside a floating surface (DESIGN.md, Navigation, menus and floating
 * surfaces): the kit's menu, select and command items, and the app's own
 * rows in a popover. Its radius is concentric with the floating surface
 * that holds it (DESIGN.md, The Concentric Rule): the list marks its end
 * rows (`markMenuEnds`, ./ends.ts), the first row's top corners and the
 * last row's bottom corners take the surface's radius less its inset
 * (tailwind-super-corners' `sc-t-concentric-xs`, `sc-b-concentric-xs`), and
 * every corner that faces a neighbour the small join radius (`radius-xs`),
 * as every corner does where no list marks its ends. The join is written as
 * the property itself: a row with a `rounded-*` class would stand as a
 * reference level of its own to super-corners (its base rule matches any
 * class holding `rounded-` beside one holding `p-`), and its ends would
 * take the surface's whole radius instead of the radius less the inset. The control transition, and a
 * floor of `c-menu-item-h`: 32px under a fine pointer, 44px under a finger
 * (the token's coarse mode; The 44 Touch Rule: "Menu items and nav rows are
 * 44px tall on touch). A mark box (design.css `mark-box`) at that height:
 * its words stand centred on their capitals with the same room at their
 * sides, and its mark stands on their first line when they wrap. A row
 * with no mark that lines up under those that have one (`data-inset`)
 * starts its words where theirs start: the side room, the mark's cap-wide
 * footprint and the room beside it.
 *
 * Every row also carries `data-menu-item`: the surface's one highlight
 * (components/ui/highlight) finds its rows by it, and a menu's quicker tick
 * (app.css `.kit-tick`) its menu.
 *
 * Its leading glyph (the row's first child, a Solar duotone svg or the
 * icon-swap a copy row holds its copy and its tick in) is in `ink-muted`,
 * as every lead glyph is (Caw's panel's surface brief, Caw's panel: a section's glyph "in
 * `ink-muted` in the lead column"). In the row's own `ink-strong` its
 * half-ink layer was near-black too, so a filled shape (Copy's two
 * squares, Stop, Archive) read as one solid dark square (Files' surface brief, Files:
 * "read as a half-ink square"). A destructive row's red, and a chosen
 * row's tick or dot in the row's own ink, stand over it.
 */
export { markMenuEnds } from "./ends.js";

export const menuItemVariants = tv({
  base: "data-menu-first:sc-t-concentric-xs data-menu-last:sc-b-concentric-xs mark-box min-h-control-sm [border-radius:var(--radius-xs)] mark-h-control-sm transition-control coarse:min-h-control-lg coarse:mark-h-control-lg [&>:where(svg,.icon-swap):first-child]:text-tx-2",
});
