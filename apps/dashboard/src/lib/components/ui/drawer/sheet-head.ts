import { tv } from "#lib/utils.js";

/**
 * A sheet's one bar, drawn by the kit from the sheet's `title` (Drawer and
 * Sheet Content): Close leading, a bare symbol in its glass group (BarItem),
 * then the title in the title role (DESIGN.md, Sheet). It draws no ground: no
 * fill, hairline or shadow of its own (DESIGN.md, The Title Bars Follow
 * Liquid Glass Rule). It floats over the sheet's content, whose scroller
 * runs to the sheet's top beneath it, clears it at rest by the sheet's room
 * (`pt-(--sheet-room)`) and blurs and fades under it as it scrolls
 * (`scroll-timeline-transcript-head`, HeadFade): `sheetScroller`. A mouse
 * never drags a sheet: Close and Escape put it away.
 */
export const sheetHeadVariants = tv({
  slots: {
    head: "flex flex-none items-center justify-between gap-space-2 pb-space-3",
    title: "min-w-0 type-title text-balance text-ink-strong",
  },
});

/**
 * What a kit sheet's scroller says, one under a floating kit head (Drawer
 * and Sheet Content): its top padding is the head's room, so its first line
 * clears the head at rest, and its scroll is the timeline the head's scroll
 * edge effect plays on (HeadFade). The room is the sheet's own
 * (`--sheet-room`, written by the kit on the sheet). Only in a kit sheet:
 * a second scroller naming the timeline in a surface whose own scroller
 * names it already leaves that surface's head with no timeline at all.
 */
export const sheetScroller =
  "pt-(--sheet-room) scroll-timeline-transcript-head";
