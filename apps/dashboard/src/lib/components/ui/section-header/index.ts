import { tv } from "#lib/utils.js";

export { default as SectionHeader } from "./section-header.svelte";

/**
 * A list section's head (the home's Recent, the task pane's parts): its label
 * at the start in the label role and muted ink, its count pushed to the end
 * (the count carries `ms-auto` and the meta face itself), and a neutral
 * hairline under it marking where the section begins. Written on the element
 * the caller has (an `h3`, a disclosure button).
 *
 * - `list`: inset from its list's edge by the rows' own inset.
 * - `flush`: flush with the column it heads (the task pane's parts), as tall
 *   as an xs button so a head with an action and one without stand alike.
 *
 * Its rule:
 * - `hairline`: a head inside one group (a list's parts on a raised surface).
 * - `group`: a head that divides groups on the page's ground, where the
 *   hairline all but vanishes: the visible border.
 */
export const sectionHeadVariants = tv({
  base: "flex items-center gap-space-1 border-b mark-line pb-space-1 text-start text-ink-muted type-label",
  variants: {
    inset: {
      list: "mb-space-1 px-space-3",
      flush: "m-0 min-h-c-btn-h-xs px-0",
    },
    rule: {
      hairline: "border-border-hairline",
      group: "border-border",
    },
  },
  defaultVariants: { inset: "list", rule: "hairline" },
});
