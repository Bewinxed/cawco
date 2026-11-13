<script lang="ts">
  /**
   * One edge of the task graph, drawn by its kind (task-graph.ts):
   * - `waits_on`: solid, an arrow into the task that waits; muted once what
   *   it waited on has landed;
   * - `part_of`: the nesting line's own ink and width (design.css
   *   `--tree-line`, .kit-tree-line);
   * - `found_in`: dashed and muted.
   * The side relation leaves and meets a card on the cross axis (task-graph
   * `handlesOf`), apart from the arrows and the trunk.
   * Tokens only; the arrow is the canvas's one marker (ViewCanvas).
   */
  import {
    BaseEdge,
    type Edge,
    type EdgeProps,
    getSmoothStepPath,
  } from "@xyflow/svelte";
  import type { TaskEdgeKind } from "../task-graph";

  interface TaskEdgeData extends Record<string, unknown> {
    kind: TaskEdgeKind;
    landed: boolean;
    marker: string;
  }

  let {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  }: EdgeProps<Edge<TaskEdgeData>> = $props();

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

<!-- An edge's paint, inline on its path, one kind's own: it replaces Svelte
     Flow's `--xy-edge-stroke*` defaults, and a change restyles the path
     alone. -->
{#if data?.kind === "part_of"}
  <BaseEdge
    {id}
    path={route[0]}
    style="stroke: var(--color-nest-ink); stroke-width: var(--tree-line)"
  />
{:else if data?.kind === "found_in"}
  <BaseEdge
    {id}
    path={route[0]}
    style="stroke: var(--color-ink-subtle); stroke-width: 1px; stroke-dasharray: 6 4"
  />
{:else if data}
  <BaseEdge
    {id}
    markerEnd={`url(#${data.marker})`}
    path={route[0]}
    style={data.landed
      ? "stroke: var(--color-border-control); stroke-width: var(--spacing-c-graph-edge)"
      : "stroke: var(--color-ink-muted); stroke-width: var(--spacing-c-graph-edge)"}
  />
{/if}
