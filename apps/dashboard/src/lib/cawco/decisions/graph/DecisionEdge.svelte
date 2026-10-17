<script lang="ts">
  /**
   * One edge of the decisions graph: routed square (a step path) from one
   * card to the next, in the muted ink, ending in the canvas's one arrow.
   */
  import { BaseEdge, type EdgeProps, getSmoothStepPath } from "@xyflow/svelte";

  let {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  }: EdgeProps = $props();

  const marker = $derived((data as { marker: string }).marker);
  const route = $derived(
    getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 8,
    })
  );
</script>

<!-- literal: 1.5px. xyflow's unlayered .svelte-flow__edge-path outranks utilities, so the paint goes through its own custom properties -->
<BaseEdge
  {id}
  markerEnd="url(#{marker})"
  path={route[0]}
  style="--xy-edge-stroke: var(--ink-muted); --xy-edge-stroke-width: 1.5px"
/>
