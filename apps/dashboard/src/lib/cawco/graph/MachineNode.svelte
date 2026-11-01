<script lang="ts">
  /**
   * A machine in the whole set: a box on the room's recess holding its
   * states, its name in its head where no card stands over it (spec: nothing
   * floats over a state's name).
   */
  import type { NodeProps } from "@xyflow/svelte";

  let { data }: NodeProps & { data: { name: string } } = $props();
</script>

<div
  data-slot="machine"
  class="size-full rounded-lg border border-border-control"
>
  <h3 class="m-0 truncate px-space-4 pt-space-3 type-label text-ink-muted">
    {data.name}
  </h3>
</div>
