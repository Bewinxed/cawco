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

<div class="decision-node" data-picked={node.picked || undefined}>
  <Handle id="in-left" isConnectable={false} position={Position.Left} type="target" />
  <Handle id="in-top" isConnectable={false} position={Position.Top} type="target" />
  <span class="name">{node.name}</span>
  <span aria-hidden="true" class="ring"></span>
  <span class="sr-only">{node.picked ? "Picked" : "Not picked"}</span>
  <Handle id="out-right" isConnectable={false} position={Position.Right} type="source" />
  <Handle id="out-bottom" isConnectable={false} position={Position.Bottom} type="source" />
</div>

<style>
  .decision-node {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    inline-size: 148px;
    min-block-size: 56px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    cursor: grab;
  }
  .name {
    display: -webkit-box;
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .ring {
    flex: none;
    inline-size: 12px;
    block-size: 12px;
    border: 1.5px solid var(--ink-muted);
    border-radius: 50%;
  }
  .decision-node[data-picked] .ring {
    border-color: var(--status-done-glyph);
    background: var(--status-done-glyph);
  }
  .decision-node :global(.svelte-flow__handle) {
    inline-size: 1px;
    block-size: 1px;
    min-inline-size: 0;
    min-block-size: 0;
    border: 0;
    background: transparent;
    pointer-events: none;
  }
</style>
