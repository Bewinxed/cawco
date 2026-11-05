<script lang="ts">
  /** A list's rows while its first read is out: skeletons at the rows' size (DESIGN.md, The Claim Of Nothing Rule). */
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";

  let {
    rows = 3,
    tall = false,
  }: {
    rows?: number;
    /** Rows of three lines (a wait with its answer), not two. */
    tall?: boolean;
  } = $props();
</script>

<div class="flex flex-col gap-space-3 p-space-3" aria-busy="true">
  {#each Array.from({ length: rows }, (_, index) => index) as row (row)}
    {#if tall}
      <Skeleton height="block" radius="tile" />
    {:else}
      <Skeleton height="row" radius="tile" />
    {/if}
  {/each}
</div>
