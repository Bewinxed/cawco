<script lang="ts">
  /**
   * Rows at the height a two-line row takes, while a section is read: three,
   * or with `fill`, as many as the room they are given holds.
   */
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";

  let { fill = false }: { fill?: boolean } = $props();
  const rows = $derived(Array.from({ length: fill ? 40 : 3 }, (_, i) => i));
</script>

<div
  data-fill={fill || undefined}
  aria-label="Loading"
  class="group flex flex-col gap-space-row data-fill:min-h-0 data-fill:grow data-fill:shrink data-fill:basis-0 data-fill:overflow-hidden"
  role="status"
>
  {#each rows as row (row)}
    <Skeleton class="h-14 w-full group-data-fill:flex-none" />
  {/each}
</div>
