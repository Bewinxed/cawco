<script lang="ts" module>
  /** A move's arrow on the whole set's map, as dagre routed it (layout.ts). */
  export interface RouteData extends Record<string, unknown> {
    /** What a person does to make the move ("Try again"), when the agent named it. */
    label: string | null;
    labelAt: { x: number; y: number } | null;
    /** Opens its move on the Animation face: a press on the arrow or on its act. */
    open: () => void;
    /** The states file plays it: a solid line; one the agent only named is dashed. */
    played: boolean;
    points: { x: number; y: number }[];
  }
</script>

<script lang="ts">
  /**
   * A move between two states: dagre's route round every card, drawn as a
   * B-spline through its points (d3's curveBasis, the curve dagre's routes
   * are made for), its arrowhead at the state it reaches, and the act that
   * makes it (its label) where dagre left room for it, so no arrow crosses
   * a card's title and no label stands on a card. A press on the arrow
   * (a band `--spacing-space-5` wide along it, the line itself being 1.5px) or on
   * its act opens its move.
   */
  import { type Edge, EdgeLabel, type EdgeProps } from "@xyflow/svelte";

  let { id, data: route, markerEnd }: EdgeProps<Edge<RouteData>> = $props();

  /** d3-shape's curveBasis, written out: a uniform B-spline through the points, ending on the last. */
  function basis(points: readonly { x: number; y: number }[]): string {
    const [first, ...rest] = points;
    if (!first) {
      return "";
    }
    const parts = [`M${first.x},${first.y}`];
    if (rest.length < 2) {
      return [...parts, ...rest.map((p) => `L${p.x},${p.y}`)].join(" ");
    }
    let [x0, y0, x1, y1] = [first.x, first.y, first.x, first.y];
    const curve = (x: number, y: number) =>
      parts.push(
        `C${(2 * x0 + x1) / 3},${(2 * y0 + y1) / 3} ${(x0 + 2 * x1) / 3},${(y0 + 2 * y1) / 3} ${(x0 + 4 * x1 + x) / 6},${(y0 + 4 * y1 + y) / 6}`
      );
    for (const [at, p] of rest.entries()) {
      if (at === 1) {
        parts.push(`L${(5 * x0 + x1) / 6},${(5 * y0 + y1) / 6}`);
      }
      if (at >= 1) {
        curve(p.x, p.y);
      }
      [x0, y0, x1, y1] = [x1, y1, p.x, p.y];
    }
    curve(x1, y1);
    parts.push(`L${x1},${y1}`);
    return parts.join(" ");
  }
</script>

{#if route}
  {@const path = basis(route.points)}
  <path
    class="fill-none stroke-transparent stroke-(length:--spacing-space-5)"
    d={path}
    data-slot="route-hit"
  />
  <path
    {id}
    class="pointer-events-none fill-none stroke-border-contrast stroke-(length:--spacing-c-graph-edge)"
    d={path}
    data-played={route.played ? "played" : "named"}
    marker-end={markerEnd}
    stroke-dasharray={route.played ? undefined : "4 4"}
  />
  {#if route.label && route.labelAt}
    <EdgeLabel transparent x={route.labelAt.x} y={route.labelAt.y}>
      <button
        class="pointer-hit block max-w-c-graph-label rounded-sm border border-border-hairline bg-surface-raised px-space-1 text-start type-meta text-ink-row transition-control can-hover:hover:bg-surface-hover"
        onclick={route.open}
        tabindex="-1"
        type="button">{route.label}</button
      >
    </EdgeLabel>
  {/if}
{/if}
