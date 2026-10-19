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

<div
  data-slot="map-node"
  style:--xy-handle-background-color="transparent"
  style:--xy-handle-border-color="transparent"
>
  <Handle id="in" isConnectable={false} position={Position.Top} type="target" />
  <MapCard {...card} />
  <Handle
    id="out"
    isConnectable={false}
    position={Position.Bottom}
    type="source"
  />
</div>

