<script lang="ts">
  import {
    BaseEdge,
    EdgeLabel,
    type EdgeProps,
    getSmoothStepPath,
  } from "@xyflow/svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconTrash } from "#lib/icons.js";
  import { RUN_HIT_GAP } from "./workflow-ui";

  let {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  }: EdgeProps = $props();
  const forward = $derived(targetX > sourceX);
  const route = $derived(
    getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      ...(forward ? {} : { centerY: Math.max(sourceY, targetY) + 100 }),
    })
  );
  /**
   * The label stands where the edge turns off its source's row (the run's
   * middle, at its port's height): two edges leaving stacked ports of one
   * node keep their ports' pitch there, where at the run's middle they met.
   */
  const labelY = $derived(forward ? sourceY : route[2]);
</script>

<!-- The path's paint goes through xyflow's own custom properties: its sheet
     reads them at rest, selected and on keyboard focus, so the ring colour
     needs no override. -->
<BaseEdge
  {id}
  path={route[0]}
  style={`--xy-edge-stroke: var(--neutral-8); --xy-edge-stroke-selected: var(--focus-ring); --xy-edge-stroke-width: calc(var(--c-graph-edge) * ${selected ? 2 : 1})`}
/>
<EdgeLabel selectEdgeOnClick transparent x={route[1]} y={labelY}>
  <!-- Its areas stop at the midpoints (The 44 Touch Rule): across, to the
       dots at the run's two ends; down, to a neighbour leaving the next of
       stacked ports, a port's pitch away. -->
  <div
    data-slot="edge-label"
    class="group mark-line nodrag nopan pointer-events-all flex items-center gap-space-1 text-size-label font-medium"
    style:--hit-gap-x={RUN_HIT_GAP}
    style:--hit-gap-y={data?.stacked
      ? "calc(var(--c-btn-h-sm) - var(--c-btn-h-xs))"
      : undefined}
  >
    {#if data?.label}
      <span class="rounded-sm bg-surface-recess p-space-1 text-ink-strong"
        >{String(data.label)}</span
      >
    {/if}
    {#if data?.remove}
      <Button
        class="pointer-hit"
        data-box
        aria-label="Delete edge"
        icon={IconTrash}
        onclick={() => {
          if (typeof data?.remove === "function") {
            data.remove(id);
          }
        }}
        press="pressable"
        reveal="row-hover"
        size="icon-xs"
        variant="outline"
      />
    {/if}
  </div>
</EdgeLabel>
