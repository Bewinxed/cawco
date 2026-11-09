/**
 * The app's tab strips' own tuning of the kit's folder tabs
 * (fluid-tabs `TabsStrip`), each a host's classes for the root, the track
 * and the track when it scrolls.
 *
 * The track, in each: a step taller than the default in a bar with room,
 * the strip's own pad, the chosen sheet in `tab-sheet` (the transcript's
 * head dissolves into it), the hover lifting an unchosen tab toward it, and
 * the status rim's stroke (one unit under more contrast or less
 * transparency). Scrolling on a coarse pointer its transparent padding
 * grows into an equal negative margin, so the controls' touch areas sit
 * inside its clip; on a phone's own bar the tabs are a row's height, on the
 * bar's floor, the ends fading over a short run so a tab slides under the
 * toggle and Caw.
 */
import type { TabsStrip } from "#lib/components/ui/fluid-tabs/index.js";

/**
 * A pane's session tabs (PaneTabs) on their own shelf; only its own shelf
 * is the phone's bar. The root: a row standing its tabs on its floor, on
 * the shelf (`surface-shelf`, two steps below the transcript, one below an
 * unchosen tab, so the chosen tab, in the transcript's own surface, reads
 * as the page it opens), padded in to the transcript's start edge, with the
 * size ladder its track and the "+" after it share: a tab's height, its
 * inner pad and its flared foot's room. Its tab controls' touch areas reach
 * past the row's foot, so on a coarse pointer the row stacks above the
 * transcript beneath it. In a narrow leaf it pads in less; on a phone it is
 * the app's only bar: the bar's height, its two ends left to the sidebar
 * toggle and Caw's glass.
 */
export const SESSION_STRIP: TabsStrip = {
  root: "coarse:relative coarse:z-1 flex min-w-0 flex-none items-end bg-surface-shelf desk:@max-leaf/leaf:ps-space-4 ps-space-7 pe-space-4 pt-space-1 pb-0 [--strip-fade:var(--c-tab-strip-fade)] [--strip-flare:var(--radius-sm)] [--strip-item-rest:var(--space-8)] [--strip-item:var(--strip-item-rest)] [--strip-px:var(--space-3)] [--strip-reach:var(--space-3)] [--strip-uncapped:var(--c-tab-strip-uncapped)] max-desk:min-h-c-top-bar-h max-desk:ps-[calc(var(--c-bar-phone-edge)_+_var(--c-bar-toggle-glyph))] max-desk:pe-[calc(var(--c-bar-phone-gap)_+_var(--c-bar-caw-glass-phone)_+_var(--c-bar-phone-edge)_+_env(safe-area-inset-right,0px))] max-desk:pt-0 max-desk:[--strip-flare:var(--radius-lg)] max-desk:[--strip-item:var(--c-tab-row-h)]",
  list: "[--item:var(--strip-item)] [--px:var(--strip-px)] tab-rim-w [--sheet:var(--tab-sheet)] [--tab-hover:light-dark(var(--surface-recess),var(--surface-hover))] coarse:[--item:var(--strip-item)]",
  scrolled:
    "max-desk:strip-edge-mask desk:coarse:-mt-(--strip-reach) coarse:-mb-(--strip-reach) desk:coarse:pt-[calc(var(--pad)_+_var(--strip-reach))] coarse:pb-(--strip-reach) max-desk:mt-0 max-desk:pt-[calc(var(--c-top-bar-h)_-_var(--c-tab-row-h))] max-desk:[--edge-room-start:calc(var(--fade-len)_*_1.5)] max-desk:[--fade-len:var(--strip-fade)] max-desk:[--overlap:var(--radius-sm)] max-desk:not-glass-item:[--pad:0px] max-desk:[--radius:var(--radius-lg)]",
};

/**
 * The same tabs in a host's row (PaneTabs, hosted): the same ladder,
 * filling the host's row and drawing nothing of its own.
 */
export const HOSTED_STRIP: TabsStrip = {
  root: "coarse:relative coarse:z-1 flex min-w-0 flex-[1_1_0] items-end self-stretch bg-transparent p-0 [--strip-fade:var(--c-tab-strip-fade)] [--strip-flare:var(--radius-sm)] [--strip-item-rest:var(--space-8)] [--strip-item:var(--strip-item-rest)] [--strip-px:var(--space-3)] [--strip-reach:var(--space-3)] [--strip-uncapped:var(--c-tab-strip-uncapped)]",
  list: "[--item:var(--strip-item)] [--px:var(--strip-px)] tab-rim-w [--sheet:var(--tab-sheet)] [--tab-hover:light-dark(var(--surface-recess),var(--surface-hover))] coarse:[--item:var(--strip-item)]",
  scrolled:
    "coarse:-my-(--strip-reach) coarse:pt-[calc(var(--pad)_+_var(--strip-reach))] coarse:pb-(--strip-reach)",
};

/**
 * The home's Working and Finished tabs (WorkTabs): its tabs' pad and the
 * label's gap to its count close up as the rail narrows (`--tight`), a tab
 * after the first starts its label past the overlap, a tab before another
 * ends its label or count no nearer its end than the overlap (`--px-end`:
 * the squeezed pad had left Working's count under Finished's sheet, the
 * owner's audit), and a tab is as wide as its label and count together
 * while they fit: the header's spacing gives way first, then the list
 * shrinks with its row and each label gives way inside its own ellipsis,
 * the count standing whole (DESIGN.md, The Truncate Inside Rule).
 */
export const WORK_STRIP: TabsStrip = {
  root: "",
  list: "min-w-0 flex-[0_1_auto] [--item:var(--space-8)] [--px:calc(var(--space-2)_-_var(--tight)_*_0.15)] [--sheet:light-dark(var(--surface-raised),var(--surface-hover))] [--tab-fill:var(--surface-recess)] [--tab-hover:light-dark(var(--surface-hover),color-mix(in_oklch,var(--surface-fill)_50%,transparent))] coarse:[--item:var(--space-8)] [&_[data-slot=ff-tab]]:[--gap:max(0px,var(--space-row)_-_var(--tight)_*_0.06)] [&_[data-slot=ff-tab]~[data-slot=ff-tab]]:[--px-start:calc(var(--overlap)_+_var(--px))] [&_[data-slot=ff-tab]:has(~[data-slot=ff-tab])]:[--px-end:max(var(--px),var(--overlap))]",
};
