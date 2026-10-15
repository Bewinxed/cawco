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

<div class="decision-group" style:block-size="{height}px" style:inline-size="{width}px">
  <span class="label">{group.name}</span>
</div>

<style>
  .decision-group {
    position: relative;
    border-radius: var(--radius-lg);
    box-shadow: inset 0 0 0 1px var(--border-control);
    pointer-events: none;
  }
  .label {
    position: absolute;
    inset-block-end: calc(100% + var(--space-1));
    inset-inline-start: var(--space-1);
    font: var(--type-label);
    color: var(--ink-muted);
    white-space: nowrap;
  }
</style>
