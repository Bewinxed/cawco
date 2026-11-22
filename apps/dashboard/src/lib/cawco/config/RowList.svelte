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

<!-- The ghost's host: the list is a `ul`, which holds no layers of its own. -->
<div class="-mx-space-2" {@attach highlight({ rows: '[data-slot="row"]' })}>
  <ul
    aria-label={label}
    class={[
      "flex list-none flex-col p-0 my-0",
      divided
        ? "[&>li]:relative [&>li:not(:first-child)]:before:absolute [&>li:not(:first-child)]:before:inset-x-space-2 [&>li:not(:first-child)]:before:top-0 [&>li:not(:first-child)]:before:border-t [&>li:not(:first-child)]:before:border-border-hairline"
        : "gap-space-row",
    ]}
    {@attach reflow()}
  >
    {@render children()}
  </ul>
</div>
