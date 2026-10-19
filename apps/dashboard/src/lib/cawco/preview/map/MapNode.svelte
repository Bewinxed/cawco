<script lang="ts">
  /**
   * A component on the map's graph (CanvasMap): its card between an edge
   * coming in at its head (from what renders it) and one going out at its
   * foot (to what it renders). The handles carry the edges and draw
   * nothing.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import MapCard, { type MapCardData } from "./MapCard.svelte";

  let { data }: NodeProps = $props();
  const card = $derived(data as unknown as MapCardData);
</script>

<div data-slot="map-node" class="map-node">
  <Handle id="in" isConnectable={false} position={Position.Top} type="target" />
  <MapCard {...card} />
  <Handle
    id="out"
    isConnectable={false}
    position={Position.Bottom}
    type="source"
  />
</div>

<style>
  .map-node :global(.svelte-flow__handle) {
    inline-size: 1px;
    block-size: 1px;
    min-inline-size: 0;
    min-block-size: 0;
    border: 0;
    background: transparent;
    pointer-events: none;
  }
</style>
