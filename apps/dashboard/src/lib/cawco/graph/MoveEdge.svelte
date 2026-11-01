<script lang="ts">
  /**
   * A move on the map: Svelte Flow's smooth-step path, a thin rounded elbow
   * with a small head, and what moves it as a chip on the line (EdgeLabel).
   * The kept move's edge and chip are drawn a step stronger.
   */
  import {
    BaseEdge,
    EdgeLabel,
    type EdgeProps,
    getSmoothStepPath,
  } from "@xyflow/svelte";

  let {
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    markerEnd,
    data,
  }: EdgeProps = $props();

  const move = $derived(data as { kept: boolean; label: string });
  const [path, labelX, labelY] = $derived(
    getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 12,
    })
  );
</script>

<BaseEdge
  class={move.kept ? "stroke-ink-muted" : "stroke-border-control-strong"}
  {markerEnd}
  {path}
/>
<EdgeLabel
  class={[
    "rounded-sm border bg-surface-raised px-space-2 py-space-row type-meta whitespace-nowrap",
    move.kept
      ? "border-border-control text-ink-strong"
      : "border-border-hairline text-ink-muted",
  ]}
  x={labelX}
  y={labelY}>{move.label}</EdgeLabel
>
