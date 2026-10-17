<script lang="ts">
  /**
   * One card of the decisions graph: a raised 12px card with its name (two
   * lines at most, never cut mid-letter) and its ring, filled in the done
   * glyph once picked. A press opens its page scrolled to it; a drag moves
   * it, and its place is saved to the graph's file on release.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";

  let { data }: NodeProps = $props();
  const node = $derived(data as { name: string; picked: boolean });
</script>

<!-- literal: 148px, 56px -->
<div
  data-slot="decision-node"
  class="group flex w-(--node-w) min-h-(--node-min-h) cursor-grab items-center gap-space-2 rounded-lg bg-surface-raised px-space-3 py-space-2 shadow-tile"
  data-picked={node.picked || undefined}
  style:--node-w="148px"
  style:--node-min-h="56px"
>
  <Handle
    id="in-left"
    isConnectable={false}
    position={Position.Left}
    type="target"
  />
  <Handle
    id="in-top"
    isConnectable={false}
    position={Position.Top}
    type="target"
  />
  <span
    data-slot="name"
    class="type-label line-clamp-2 min-w-0 flex-auto wrap-anywhere text-ink-strong"
    >{node.name}</span
  >
  <!-- literal: 12px, 1.5px, 50% -->
  <span
    aria-hidden="true"
    class="size-icon-sm flex-none rounded-(--ring-r) border-(length:--ring-border) border-ink-muted group-data-picked:border-status-done-glyph group-data-picked:bg-status-done-glyph"
    style:--ring-border="1.5px"
    style:--ring-r="50%"
  ></span>
  <span class="sr-only">{node.picked ? "Picked" : "Not picked"}</span>
  <Handle
    id="out-right"
    isConnectable={false}
    position={Position.Right}
    type="source"
  />
  <Handle
    id="out-bottom"
    isConnectable={false}
    position={Position.Bottom}
    type="source"
  />
</div>

<style>
  /* residual: foreign-dom */
  [data-slot="decision-node"] :global(.svelte-flow__handle) {
    inline-size: 1px;
    block-size: 1px;
    min-inline-size: 0;
    min-block-size: 0;
    border: 0;
    background: transparent;
    pointer-events: none;
  }
</style>
