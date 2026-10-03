<script lang="ts">
  /**
   * Rows at the height a two-line row takes, while a section is read: three,
   * or with `fill`, as many as the room they are given holds.
   */
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";

  let { fill = false }: { fill?: boolean } = $props();
  const rows = $derived(Array.from({ length: fill ? 40 : 3 }, (_, i) => i));
</script>

<div aria-label="Loading" class="rows" role="status" class:fill>
  {#each rows as row (row)}
    <Skeleton class="h-14 w-full" />
  {/each}
</div>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;

    /* Rows keep their height and the room clips them: a row squeezed to
       fit would change size as the room settles. */
    &.fill {
      flex: 1 1 0;
      min-height: 0;
      overflow: hidden;

      & > :global(*) {
        flex: none;
      }
    }
  }
</style>
