<script lang="ts">
  /**
   * One edge of the task graph, drawn by its kind (task-graph.ts):
   * - `after`: solid, an arrow into the task that waits; muted once what it
   *   waited for has landed;
   * - `parent`: the nesting line's own ink and width (app.css .kit-nest);
   * - `related`: dotted;
   * - `found_in`: dashed and muted.
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
  const STYLE: Record<TaskEdgeKind, string> = {
    after: "stroke: var(--ink-muted); stroke-width: 1.5px",
    parent: "stroke: var(--nest-ink); stroke-width: var(--nest-line, 1px)",
    related:
      "stroke: var(--ink-subtle); stroke-width: 1.5px; stroke-dasharray: 0 5; stroke-linecap: round",
    found_in:
      "stroke: var(--ink-subtle); stroke-width: 1px; stroke-dasharray: 6 4",
  };
  const style = $derived(
    edge.kind === "after" && edge.landed
      ? "stroke: var(--border-control); stroke-width: 1.5px"
      : STYLE[edge.kind]
  );
</script>

<BaseEdge
  {id}
  markerEnd={edge.kind === "after" ? `url(#${edge.marker})` : undefined}
  path={route[0]}
  {style}
/>
