import { tv } from "#lib/utils.js";

/**
 * A sheet's one header, drawn by the kit from the sheet's `title` (Drawer
 * and Sheet Content): DESIGN.md, Drawer: "one header: the title in the
 * title role and Close at the trailing edge (a 28px ghost with a 16px
 * glyph, 44px under a finger), with a seam under it that comes in over the
 * first 11px of the content's scroll". Its hairline is drawn transparent
 * and comes in on the sheet's scroll (`sheet-seam`, design.css), inside a
 * sheet only. A mouse never drags a sheet: Close and Escape put it away.
 */
export const sheetHeadVariants = tv({
  slots: {
    head: "flex flex-none items-center justify-between gap-space-2 border-b border-b-transparent pb-space-3 in-data-[slot=drawer-content]:sheet-seam",
    title: "min-w-0 text-title text-balance text-ink-strong",
    close:
      "touch-hit inline-flex size-7 flex-none items-center justify-center rounded-sm border border-transparent bg-transparent text-ink-muted [--hit-edge:1px] transition-control hover:bg-surface-hover hover:text-ink-strong [&_svg]:size-icon-md",
  },
});
