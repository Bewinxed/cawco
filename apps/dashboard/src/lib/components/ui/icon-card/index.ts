import { tv } from "#lib/utils.js";

/**
 * A pickable card led by an icon tile (the empty fleet's ways to join a
 * machine, a new project's templates); its face is CardFace. A card, so its
 * press tints and moves nothing (DESIGN.md, The Press Rule), and its focus
 * ring is drawn inset on its own border box (The One Ring Rule: anything
 * flush in a grid of its peers). It draws its own 1px edge, so the grid's
 * selection pill (`components/ui/highlight`, `look: "card"`) stands over
 * that edge and under its face.
 * Callers mark the card `data-slot="icon-card"` and the grid
 * `data-slot="icon-cards"`: the highlight's rows and the pill's hook.
 */
export const iconCardVariants = tv({
  base: "type-meta focus-inset relative flex flex-col gap-space-1 rounded-md border border-border-card bg-transparent px-space-4 pt-space-7 pb-space-4 text-start text-ink-strong transition-control active:bg-surface-fill",
});

/**
 * The cards' grid: as many columns as hold a card at its floor, sharing the
 * row; a grid narrower than one card holds one, at the grid's width. The
 * content sets the columns, not the viewport (two at a phone's width, one
 * where two would not fit), so no breakpoint stands outside DESIGN.md's.
 */
export const iconCardsVariants = tv({
  base: "relative grid grid-cols-[repeat(auto-fit,minmax(min(100%,var(--c-icon-card-min)),1fr))] gap-space-3",
});
