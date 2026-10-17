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

<!-- xyflow's own custom properties: its sheet draws the path from them, and
     the selected state reads its own, so both carry the one colour. -->
<BaseEdge
  {id}
  path={route[0]}
  style="--xy-edge-stroke: var(--neutral-8); --xy-edge-stroke-selected: var(--neutral-8); --xy-edge-stroke-width: {selected
    ? 3
    : 1.5}px"
/>
<EdgeLabel selectEdgeOnClick transparent x={route[1]} y={route[2]}>
  <div
    data-slot="edge-label"
    class="group mark-line nodrag nopan flex items-center gap-space-1 text-size-label font-medium"
  >
    {#if data?.label}
      <span class="rounded-sm bg-surface-recess p-space-1 text-ink-strong"
        >{String(data.label)}</span
      >
    {/if}
    {#if data?.remove}
      <!-- literal: 28px -->
      <button
        aria-label="Delete edge"
        class="touch-hit pressable grid size-(--hit) place-items-center rounded-sm bg-surface-raised text-ink-muted opacity-0 transition-[opacity] dur-control ease-out group-hover:opacity-100 group-hover:scale-100 focus-visible:opacity-100 focus-visible:scale-100 data-visible:opacity-100 data-visible:scale-100 motion-safe:scale-(--pop-scale) motion-safe:transition-[opacity,scale] coarse:opacity-100 coarse:scale-100"
        data-box
        data-visible={selected || undefined}
        onclick={() => {
          if (typeof data?.remove === "function") {
            data.remove(id);
          }
        }}
        style:--hit="28px"
        type="button"
      >
        <IconTrash class="size-icon-sm" />
      </button>
    {/if}
  </div>
</EdgeLabel>

<style>
  /* residual: foreign-dom — the edge's own path is xyflow's. Keyboard focus
     on an edge turns its line the ring colour, over the inline stroke. */
  :global(.svelte-flow__edge:focus-visible .svelte-flow__edge-path) {
    stroke: var(--focus-ring) !important;
  }
  /* residual: unmapped */
  [data-slot="edge-label"] {
    pointer-events: all;
  }
</style>
