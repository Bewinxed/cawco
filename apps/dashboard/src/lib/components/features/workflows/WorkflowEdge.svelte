<script lang="ts">
  import {
    BaseEdge,
    EdgeLabel,
    type EdgeProps,
    getSmoothStepPath,
  } from "@xyflow/svelte";
  import { IconTrash } from "#lib/icons.js";

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
  const route = $derived(
    getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      ...(targetX <= sourceX
        ? { centerY: Math.max(sourceY, targetY) + 100 }
        : {}),
    })
  );
</script>

<!-- The path's paint goes through xyflow's own custom properties: its sheet
     reads them at rest, selected and on keyboard focus, so the ring colour
     needs no override. -->
<BaseEdge
  {id}
  path={route[0]}
  style={`--xy-edge-stroke: var(--neutral-8); --xy-edge-stroke-selected: var(--focus-ring); --xy-edge-stroke-width: calc(var(--c-graph-edge) * ${selected ? 2 : 1})`}
/>
<EdgeLabel selectEdgeOnClick transparent x={route[1]} y={route[2]}>
  <div
    data-slot="edge-label"
    class="group mark-line nodrag nopan pointer-events-all flex items-center gap-space-1 text-size-label font-medium"
  >
    {#if data?.label}
      <span class="rounded-sm bg-surface-recess p-space-1 text-ink-strong"
        >{String(data.label)}</span
      >
    {/if}
    {#if data?.remove}
      <button
        aria-label="Delete edge"
        class="touch-hit grid size-c-btn-h-sm place-items-center rounded-sm bg-surface-raised text-ink-muted opacity-0 transition-[opacity] dur-control ease-out group-hover:opacity-100 group-hover:scale-100 focus-visible:opacity-100 focus-visible:scale-100 data-visible:opacity-100 data-visible:scale-100 motion-safe:not-coarse:scale-(--pop-scale) motion-safe:transition-[opacity,scale] motion-safe:pressed:transform-(--tpress) coarse:opacity-100 coarse:scale-100"
        data-box
        data-visible={selected || undefined}
        onclick={() => {
          if (typeof data?.remove === "function") {
            data.remove(id);
          }
        }}
        style:--tpress="scale(var(--press-scale))"
        type="button"
      >
        <IconTrash class="size-icon-sm" />
      </button>
    {/if}
  </div>
</EdgeLabel>
