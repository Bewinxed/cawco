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
  const style = $derived.by(() => {
    const width = selected ? 3 : 1.5;
    if (data?.taken === "fired") {
      return `stroke: var(--status-done-ink); stroke-width: ${selected ? 3 : 2}px`;
    }
    if (data?.taken === "skipped") {
      return `stroke: var(--neutral-8); stroke-width: ${width}px; stroke-opacity: .45; stroke-dasharray: 4 4`;
    }
    return `stroke: var(--neutral-8); stroke-width: ${width}px`;
  });
</script>
<!-- On a run, the path the run took reads in a passed node's colour and the
     edges it passed by fall back, faint and dashed so the difference is not
     colour alone; in the editor every edge is plain. -->
<BaseEdge {id} path={route[0]} {style} />
<EdgeLabel selectEdgeOnClick transparent x={route[1]} y={route[2]}>
  <div
    class="edge-label nodrag nopan"
    class:skipped={data?.taken === 'skipped'}
  >
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
  .skipped span {
    opacity: 0.45;
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
