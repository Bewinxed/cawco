<script lang="ts">
  /**
   * The list a section's rows sit in: 2px apart, no hairlines, one hover
   * ghost gliding from row to row (components/ui/highlight). Rows arriving,
   * leaving or moving, and the lines under them, reflow on the house timing
   * (motion/rows.svelte.ts).
   */
  import type { Snippet } from "svelte";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";

  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<!-- The ghost's host: the list is a `ul`, which holds no layers of its own. -->
<div class="-mx-space-2" {@attach highlight({ rows: '[data-slot="row"]' })}>
  <ul
    aria-label={label}
    class="flex list-none flex-col gap-space-row p-0 my-0"
    {@attach reflow()}
  >
    {@render children()}
  </ul>
</div>
