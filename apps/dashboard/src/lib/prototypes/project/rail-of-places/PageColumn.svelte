<script lang="ts">
  /**
   * A place's page: its groups one column, the page's group spacing apart,
   * headed while the hub is not live by since when its rows are kept.
   * `narrow` holds a page of few figures (Spend) to a readable width.
   */
  import type { Snippet } from "svelte";
  import type { Read } from "./model";
  import StaleNote from "./StaleNote.svelte";

  let {
    read,
    narrow = false,
    children,
  }: { read: Read; narrow?: boolean; children: Snippet } = $props();
</script>

<div
  class="flex flex-col gap-space-group data-narrow:desk:max-w-c-grid-4"
  data-narrow={narrow || undefined}
>
  {#if read.stale}
    <StaleNote since={read.stale} />
  {/if}
  {@render children()}
</div>
