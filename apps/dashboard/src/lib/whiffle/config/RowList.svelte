<script lang="ts">
  /**
   * The list a section's rows sit in: 2px apart, no hairlines, one hover
   * ghost gliding from row to row (components/ui/highlight).
   */
  import type { Snippet } from "svelte";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";

  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<ul aria-label={label} class="rows" {@attach highlight({ rows: ".row" })}>
  {@render children()}
</ul>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 -8px;
    padding: 0;
    list-style: none;
  }
</style>
