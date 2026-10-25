/**
 * The top bar's trailing group as a capsule of its own (DESIGN.md, Top
 * bar's trailing edge; BarGlass's desk recipe): the panel's glass drawn by
 * a layer under the items, a hairline and the tile shadow, solid raised
 * with the contrast edge under Reduce Transparency or Increase Contrast,
 * its items 4px in and 4px apart (16px on a coarse pointer). The project
 * page's design fixtures draw their capsules with it.
 */
export const GLASS_CAPSULE =
  "relative flex flex-none items-center gap-c-bar-group-pad h-c-btn-h p-c-bar-group-pad rounded-pill hit-gap-x-c-bar-group-pad coarse:gap-space-5 coarse:hit-gap-x-space-5 before:absolute before:inset-0 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop before:pointer-events-none contrast-more:before:border-border-contrast contrast-more:before:bg-surface-raised contrast-more:before:backdrop-filter-none reduced-transparency:before:border-border-contrast reduced-transparency:before:bg-surface-raised reduced-transparency:before:backdrop-filter-none";

/**
 * The Status dot before a count's figure, the figure in the needs-you ink
 * (DESIGN.md, Needs you: "the Status dot … beside the word"), laid on the
 * strip's own count spans (ViewTabs `tab-num`, `more-count`) from the frame
 * that holds them. Written out whole, so Tailwind finds every class.
 */
export const DOT_ON_TAB =
  "**:data-[slot=tab-num]:inline-flex **:data-[slot=tab-num]:items-center **:data-[slot=tab-num]:gap-space-1 **:data-[slot=tab-num]:text-status-attn-ink **:data-[slot=tab-num]:before:size-(--status-dot-size) **:data-[slot=tab-num]:before:rounded-pill **:data-[slot=tab-num]:before:bg-status-attn-glyph **:data-[slot=tab-num]:before:content-['']";
export const DOT_ON_MORE =
  "**:data-[slot=more-count]:inline-flex **:data-[slot=more-count]:items-center **:data-[slot=more-count]:gap-space-1 **:data-[slot=more-count]:text-status-attn-ink **:data-[slot=more-count]:before:size-(--status-dot-size) **:data-[slot=more-count]:before:rounded-pill **:data-[slot=more-count]:before:bg-status-attn-glyph **:data-[slot=more-count]:before:content-['']";
