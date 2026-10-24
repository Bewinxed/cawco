<script lang="ts">
  /**
   * One edge of a workflow's shape, by kind: `fixed`, the task canvas's
   * `after` (solid, an arrow into the step that waits; muted once what it
   * waited for is done); `decides`, the orchestrator decides by the
   * sentence it carries, dashed, the sentence on the line.
   */
  import {
    BaseEdge,
    EdgeLabel,
    type EdgeProps,
    getSmoothStepPath,
  } from "@xyflow/svelte";

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

  const edge = $derived(
    data as {
      kind: "fixed" | "decides";
      sentence?: string;
      landed: boolean;
      marker: string;
    }
  );
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

{#if edge.kind === "decides"}
  <BaseEdge
    {id}
    markerEnd={`url(#${edge.marker})`}
    path={route[0]}
    style="stroke: var(--ink-muted); stroke-width: 1.5px; stroke-dasharray: 6 4"
  />
  {#if edge.sentence}
    <EdgeLabel x={route[1]} y={route[2]}>
      <span
        class="rounded-xs bg-surface-recess px-space-1 type-meta whitespace-nowrap text-ink-muted"
        >{edge.sentence}</span
      >
    </EdgeLabel>
  {/if}
{:else}
  <BaseEdge
    {id}
    markerEnd={`url(#${edge.marker})`}
    path={route[0]}
    style={edge.landed
      ? "stroke: var(--border-control); stroke-width: 1.5px"
      : "stroke: var(--ink-muted); stroke-width: 1.5px"}
  />
{/if}
