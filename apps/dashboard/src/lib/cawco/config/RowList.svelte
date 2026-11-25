<script lang="ts">
  /**
   * The list a section's rows sit in: 2px apart, no hairlines, one hover
   * ghost gliding from row to row (components/ui/highlight). `divided`: a
   * list in a card (a project's settings), its rows meeting at a hairline
   * between each that runs from the rows' content edge to their content
   * edge (the card's own), not across the ghost's bleed. Rows arriving,
   * leaving or moving, and the lines under them, reflow on the house timing
   * (motion/rows.svelte.ts).
   */
  import type { Snippet } from "svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";

  let {
    label,
    divided = false,
    children,
  }: { label: string; divided?: boolean; children: Snippet } = $props();
</script>

<!-- The ghost's host: the list is a `ul` owning the subgrid columns once
     (`rows-grid`: inset | lead | gutter | body | controls | inset), so every
     SectionRow's lead, text, controls, and `below` note align by construction. -->
<div class="-mx-space-2" {@attach highlight({ rows: '[data-slot="row"]' })}>
  <ul
    aria-label={label}
    class={[
      "@container/rows my-0 rows-grid list-none gap-x-0 p-0",
      divided
        ? "[&>li]:relative [&>li:not(:first-child)]:before:absolute [&>li:not(:first-child)]:before:inset-x-space-2 [&>li:not(:first-child)]:before:top-0 [&>li:not(:first-child)]:before:border-t [&>li:not(:first-child)]:before:border-ui"
        : "gap-y-space-1",
    ]}
    style:--row-cols={"var(--spacing-space-2) var(--spacing-row-compact) var(--spacing-space-3) minmax(0, 1fr) auto var(--spacing-space-2)"}
    {@attach reflow()}
  >
    {@render children()}
  </ul>
</div>
