import { tv } from "#lib/utils.js";

// biome-ignore lint/performance/noBarrelFile: public entry point for the section header, consumed under the shadcn-svelte convention
export { default as SectionHeader } from "./section-header.svelte";

/**
 * A list section's head (the home's Recent, the task pane's parts): its label
 * at the start in the label role and muted ink, its count pushed to the end
 * (the count carries `ms-auto` and the meta face itself), and a neutral
 * hairline under it marking where the section begins. Written on the element
 * the caller has (an `h3`, a disclosure button).
 *
 * - `list`: inset from its list's edge by the rows' own inset.
 * - `flush`: flush with the column it heads, as tall as an xs button so a
 *   head with an action and one without stand alike.
 * - `pane`: a task pane's part (Details, Activity): led by its 16px glyph
 *   in muted ink, its label in strong ink, and no hairline (the owner's
 *   pins on the task pane: "ICONS IN SECTIONS", "what is this line above
 *   and below?"); as tall as an xs button, as `flush` is.
 */
export const sectionHeadVariants = tv({
  base: "mark-line type-label flex items-center text-start",
  variants: {
    inset: {
      list: "mb-space-1 gap-space-1 border-border-hairline border-b px-space-3 pb-space-1 text-ink-muted",
      flush:
        "m-0 min-h-c-btn-h-xs gap-space-1 border-border-hairline border-b px-0 pb-space-1 text-ink-muted",
      pane: "m-0 min-h-c-btn-h-xs gap-space-2 px-0 text-ink-strong [&>svg:first-child]:size-icon-md [&>svg:first-child]:flex-none [&>svg:first-child]:text-ink-muted",
    },
  },
  defaultVariants: { inset: "list" },
});
