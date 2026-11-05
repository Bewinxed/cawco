import { tv } from "#lib/utils.js";

/**
 * A sheet's one bar, drawn by the kit from the sheet's `title` (Drawer and
 * Sheet Content): Close leading, a bare symbol in its glass group (BarItem),
 * then the title in the title role (DESIGN.md, Sheet). It draws no ground: no
 * fill, hairline or shadow of its own (DESIGN.md, The Title Bars Follow
 * Liquid Glass Rule); what scrolls under it fades at the scroller's own
 * edge (`kit-edge-fade-block`). A mouse never drags a sheet: Close and
 * Escape put it away.
 */
export const sheetHeadVariants = tv({
  slots: {
    head: "flex flex-none items-center justify-between gap-space-2 pb-space-3",
    title: "min-w-0 text-title text-balance text-ink-strong",
  },
});
