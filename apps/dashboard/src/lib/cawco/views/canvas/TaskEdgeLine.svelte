<script lang="ts">
  /**
   * One edge of the task graph, drawn by its kind (task-graph.ts):
   * - `after`: solid, an arrow into the task that waits; muted once what it
   *   waited for has landed;
   * - `parent`: the nesting line's own ink and width (app.css .kit-nest);
   * - `related`: dotted, round dots in the muted ink, so it reads in dark;
   * - `found_in`: dashed and muted.
   * The side relations leave and meet a card on the cross axis (task-graph
   * `handlesOf`), apart from the arrows and the trunk.
   * Tokens only; the arrow is the canvas's one marker (ViewCanvas).
   */
  import { BaseEdge, type EdgeProps, getSmoothStepPath } from "@xyflow/svelte";
  import type { TaskEdgeKind } from "../task-graph";

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
    data as { kind: TaskEdgeKind; landed: boolean; marker: string }
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

<!-- An edge's paint, inline on its path, one kind's own: it replaces Svelte
     Flow's `--xy-edge-stroke*` defaults, and a change restyles the path
     alone. -->
{#if edge.kind === "parent"}
  <BaseEdge
    {id}
    path={route[0]}
    style="stroke: var(--nest-ink); stroke-width: var(--nest-line, 1px)"
  />
{:else if edge.kind === "related"}
  <BaseEdge
    {id}
    path={route[0]}
    style="stroke: var(--ink-muted); stroke-width: 2px; stroke-dasharray: 0 6; stroke-linecap: round"
  />
{:else if edge.kind === "found_in"}
  <BaseEdge
    {id}
    path={route[0]}
    style="stroke: var(--ink-subtle); stroke-width: 1px; stroke-dasharray: 6 4"
  />
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
