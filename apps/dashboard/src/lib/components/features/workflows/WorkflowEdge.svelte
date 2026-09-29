<script lang="ts">
  import {
    BaseEdge,
    EdgeLabel,
    type EdgeProps,
    getSmoothStepPath,
  } from "@xyflow/svelte";
  import { IconTrash } from "$lib/icons";

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
<BaseEdge
  {id}
  path={route[0]}
  style="stroke: var(--neutral-{data?.fired ? '11' : '8'}); stroke-width: {selected ? 3 : 1.5}px"
/>
<EdgeLabel selectEdgeOnClick transparent x={route[1]} y={route[2]}>
  <div class="edge-label nodrag nopan">
    {#if data?.label}
      <span>{String(data.label)}</span>
    {/if}
    {#if data?.remove}
      <button
        aria-label="Delete edge"
        class="touch-hit pressable"
        onclick={() => { if (typeof data?.remove === 'function') { data.remove(id); } }}
        type="button"
        class:visible={selected}
      >
        <IconTrash class="size-3" />
      </button>
    {/if}
  </div>
</EdgeLabel>
<style>
  /* Keyboard focus on an edge turns its line the ring colour, over the
     inline stroke that carries the edge's own state. */
  :global(.svelte-flow__edge:focus-visible .svelte-flow__edge-path) {
    stroke: var(--focus-ring) !important;
  }
  .edge-label {
    pointer-events: all;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  span {
    background: var(--surface-recess);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
  }
  button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink-muted);
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  /* Shown, it fades in and grows from the pop scale; hidden again, it
     shrinks back as it fades. Without motion only the fade runs. */
  @media (prefers-reduced-motion: no-preference) {
    button {
      scale: var(--pop-scale);
      transition:
        opacity var(--dur-control) var(--ease-out),
        scale var(--dur-control) var(--ease-out);
    }
  }
  .edge-label:hover button,
  button:focus-visible,
  button.visible {
    opacity: 1;
    scale: 1;
  }
  @media (pointer: coarse) {
    button {
      opacity: 1;
      scale: 1;
    }
  }
</style>
