<script lang="ts">
  /**
   * The record while the first read is on its way (DESIGN.md, The Claim Of
   * Nothing Rule): three entries at their real layout's size, the lead
   * glyph, a label and a line of words, the clock time at the trailing
   * column; nothing claims the task is empty before the hub has said so.
   */
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
</script>

<ol class="m-0 grid list-none p-0" aria-busy="true">
  {#each [0, 1, 2] as i (i)}
    <!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
    <li
      class="grid grid-cols-(--entry-cols) gap-x-space-3 gap-y-space-2 py-space-3"
    >
      <span class="mark-cell type-label"
        ><Skeleton cell="glyph" radius="text" /></span
      >
      <Skeleton line="label" width={i === 1 ? "title" : "name"} radius="text" />
      <Skeleton line="meta" width="word" radius="text" />
      <span class="col-start-2 col-end-4"
        ><Skeleton line="body" radius="text" /></span
      >
    </li>
  {/each}
</ol>
