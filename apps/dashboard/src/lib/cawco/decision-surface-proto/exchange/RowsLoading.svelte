<script lang="ts">
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";

  /** Rows still being read: four skeletons at a row's size, on one pulse. */
</script>

<div class="flex flex-col gap-space-2" aria-busy="true">
  {#each [0, 1, 2, 3] as i (i)}
    <Skeleton class="w-full" height="block" radius="tile" />
  {/each}
</div>
