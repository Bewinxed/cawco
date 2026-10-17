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

<!-- literal: inset 0 0 0 1px (frame ring) -->
<div
  data-slot="decision-group"
  class="pointer-events-none relative rounded-lg shadow-(--group-ring) h-(--group-h) w-(--group-w)"
  style:--group-ring="inset 0 0 0 1px var(--border-control)"
  style:--group-h="{height}px"
  style:--group-w="{width}px"
>
  <span
    data-slot="decision-group-label"
    class="type-label absolute start-space-1 bottom-(--label-off) whitespace-nowrap text-ink-muted"
    style:--label-off="calc(100% + var(--space-1))">{group.name}</span
  >
</div>
