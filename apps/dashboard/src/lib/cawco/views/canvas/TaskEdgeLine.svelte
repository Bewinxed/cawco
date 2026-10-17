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
  /* Svelte Flow's edge path reads `--xy-edge-stroke` and
     `--xy-edge-stroke-width`; the dashes and the cap are the residual below. */
  const DASHES: Partial<Record<TaskEdgeKind, string>> = {
    related: "edge-related",
    found_in: "edge-found-in",
  };
  /** An edge's ink and width, for `--xy-edge-stroke` and `--xy-edge-stroke-width`. */
  interface Stroke {
    ink: string;
    width: string;
  }
  /** A landed `after` edge's stroke, muted to the control edge. */
  const LANDED: Stroke = { ink: "var(--border-control)", width: "1.5px" };
  /** Every other kind's own stroke; an `after` still waiting takes PLAIN. */
  const STROKES: Partial<Record<TaskEdgeKind, Stroke>> = {
    parent: { ink: "var(--nest-ink)", width: "var(--nest-line, 1px)" },
    related: { ink: "var(--ink-muted)", width: "2px" },
    found_in: { ink: "var(--ink-subtle)", width: "1px" },
  };
  const PLAIN: Stroke = { ink: "var(--ink-muted)", width: "1.5px" };
  const stroke = $derived(
    edge.kind === "after" && edge.landed
      ? LANDED
      : (STROKES[edge.kind] ?? PLAIN)
  );
</script>

<BaseEdge
  {id}
  class={DASHES[edge.kind]}
  markerEnd={edge.kind === "after" ? `url(#${edge.marker})` : undefined}
  path={route[0]}
  style="--xy-edge-stroke: {stroke.ink}; --xy-edge-stroke-width: {stroke.width}"
/>

<style>
  /* residual: svg-paint */
  :global(.edge-related) {
    stroke-dasharray: 0 6;
    stroke-linecap: round;
  }
  :global(.edge-found-in) {
    stroke-dasharray: 6 4;
  }
</style>
