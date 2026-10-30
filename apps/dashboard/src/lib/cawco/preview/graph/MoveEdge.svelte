<script lang="ts" module>
  /** An edge's data: a move (it animates), the agent's edge, or one machine leading into another; its label; the move into the kept state. */
  export interface MoveEdgeData extends Record<string, unknown> {
    kind: "move" | "edge" | "between";
    label: string | null;
    lit: boolean;
  }
</script>

<script lang="ts">
  /**
   * An arrow of the design graph (Projects spec §5.10; the primitives spec
   * §1.3; pin 30): Svelte Flow's smooth-step path with the house's rounded
   * elbow, drawn `c-graph-edge` in `c-graph-edge-ink` with a small open head;
   * the move into the kept state `c-graph-edge-lit` in `c-graph-edge-chosen`.
   * An agent's edge carries its label as a chip at the path's middle, cut
   * at 24ch, whole on its title. The link between two machines is a
   * hairline with no head.
   */
  import {
    BaseEdge,
    EdgeLabel,
    type EdgeProps,
    getSmoothStepPath,
  } from "@xyflow/svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";

  let {
    id,
    data,
    markerEnd,
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  }: EdgeProps = $props();
  const edge = $derived(data as MoveEdgeData);
  /** Its stroke: a machine's link a hairline, the move into the kept state the chosen ink a step heavier, else the graph's edge ink. */
  const ink = $derived.by(() => {
    if (edge.kind === "between") {
      return { stroke: "var(--border-hairline)", width: "var(--border-width)" };
    }
    return edge.lit
      ? {
          stroke: "var(--c-graph-edge-chosen)",
          width: "var(--c-graph-edge-lit)",
        }
      : { stroke: "var(--c-graph-edge-ink)", width: "var(--c-graph-edge)" };
  });
  const drawn = $derived(
    getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: numberOf("--radius-sm"),
      offset: numberOf("--space-3"),
    })
  );
</script>

<!-- The stroke on Svelte Flow's own edge variables, which the path inherits: the graph's edge ink, the move into the kept state the chosen ink and a step heavier, a machine's link a hairline. -->
<g style:--xy-edge-stroke={ink.stroke} style:--xy-edge-stroke-width={ink.width}>
  <BaseEdge
    class="transition-[stroke,stroke-width] duration-(--dur-control) ease-out"
    {id}
    interactionWidth={0}
    markerEnd={edge.kind === "between" ? undefined : markerEnd}
    path={drawn[0]}
  />
</g>
{#if edge.label}
  <EdgeLabel transparent x={drawn[1]} y={drawn[2]}>
    <span
      class={[
        "block max-w-c-graph-label-max-w truncate rounded-xs border border-border-hairline px-space-2 type-meta text-ink-row",
        edge.lit ? "bg-brand-wash" : "bg-c-graph-label-bg",
      ]}
      data-edge-label
      title={edge.label}>{edge.label}</span
    >
  </EdgeLabel>
{/if}
