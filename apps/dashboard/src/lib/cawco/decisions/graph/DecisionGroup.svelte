<script lang="ts">
  /**
   * A group of the decisions graph: a frame round its cards, labelled in the
   * label role. It stands behind them and follows them; it never moves on
   * its own.
   */
  import type { NodeProps } from "@xyflow/svelte";

  let { data, width, height }: NodeProps = $props();
  const group = $derived(data as { name: string });
</script>

<div
  data-slot="decision-group"
  class="pointer-events-none relative rounded-lg inset-ring inset-ring-border-control"
  style:block-size="{height}px"
  style:inline-size="{width}px"
>
  <span
    data-slot="decision-group-label"
    class="type-label absolute start-space-1 bottom-full mb-space-1 whitespace-nowrap text-ink-muted"
    >{group.name}</span
  >
</div>
