<script lang="ts">
  /**
   * A state machine's region on the map: a ground a step off the map's,
   * a hairline, and the machine's name as its header, the one place the
   * graph names it (the owner's note: the machines are already named in
   * the graph, no band or pinned copy repeats it).
   */
  import type { NodeProps } from "@xyflow/svelte";

  let { data }: NodeProps = $props();
  const machine = $derived((data as { machine: string }).machine);
</script>

<div
  data-slot="region"
  class="size-full rounded-panel border border-border-hairline bg-surface-recess"
>
  <h3 class="m-0 truncate px-space-4 pt-space-3 type-label text-ink-muted">
    {machine}
  </h3>
</div>
