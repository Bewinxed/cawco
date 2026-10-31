<script lang="ts" module>
  export interface RegionData extends Record<string, unknown> {
    /** The kept state stands in it. */
    kept: boolean;
    name: string;
  }
</script>

<script lang="ts">
  /**
   * A group's region on the field: the graph's slab (`c-graph-slab`) round
   * its states, its name its one heading (T5: a group named exactly once).
   */
  import type { NodeProps } from "@xyflow/svelte";

  let { data }: NodeProps = $props();
  const region = $derived(data as RegionData);
</script>

<div
  class="size-full rounded-lg bg-c-graph-slab inset-ring inset-ring-border-hairline"
  data-region={region.name}
>
  <span
    class="absolute start-space-3 top-space-2 type-caps whitespace-nowrap text-ink-subtle"
    >{region.name}</span
  >
</div>
