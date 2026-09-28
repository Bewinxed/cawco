<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { IconMaximize, IconPlus, IconReset } from "$lib/icons";
  import { dur, easeInOut, motionOk } from "$lib/whiffle/motion/curves.svelte";

  let {
    zoom,
    pan,
    onpan,
    undo,
    redo,
    canUndo,
    canRedo,
    readonly,
  }: {
    zoom: number;
    pan: boolean;
    onpan: () => void;
    undo?: () => void;
    redo?: () => void;
    canUndo: boolean;
    canRedo: boolean;
    readonly: boolean;
  } = $props();
  const { zoomIn, zoomOut, fitView } = useSvelteFlow();
  /** Zoom and fit glide to the new view: movement on screen, --dur-panel. */
  const glide = () => ({
    duration: motionOk.current ? dur("--dur-panel") : 0,
    ease: easeInOut,
  });
  const fit = () => fitView({ padding: 0.2, ...glide() });
</script>
<svelte:window
  onkeydown={(event) => { if (event.key.toLowerCase() === 'f' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)) { event.preventDefault(); fit(); } }}
/>
<div class="tools wf">
  <button aria-pressed={pan} class="wf-btn" onclick={onpan} type="button">
    {pan ? 'Pan' : 'Select'}
  </button>
  <button
    aria-label="Zoom out"
    class="wf-btn"
    onclick={() => zoomOut(glide())}
    type="button"
  >
    −
  </button><span>{Math.round(zoom * 100)}%</span
  ><button
    aria-label="Zoom in"
    class="wf-btn"
    onclick={() => zoomIn(glide())}
    type="button"
  >
    <IconPlus class="size-4" />
  </button>
  <button aria-label="Fit graph" class="wf-btn" onclick={fit} type="button">
    <IconMaximize class="size-4" />
  </button>
  {#if !readonly}
    <button
      aria-label="Undo"
      class="wf-btn"
      disabled={!canUndo}
      onclick={undo}
      type="button"
    >
      <IconReset class="size-4" />
    </button><button
      aria-label="Redo"
      class="wf-btn"
      disabled={!canRedo}
      onclick={redo}
      type="button"
    >
      <IconReset class="size-4 rotate-180" />
    </button>
  {/if}
</div>
<style>
  .tools {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-tile);
  }
  span {
    min-width: 40px;
    text-align: center;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    font-variant-numeric: tabular-nums;
  }
</style>
